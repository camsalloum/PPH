# Multi-Level BOM / Formulation System — Full Plan

> **Status:** Draft — awaiting approval before implementation  
> **Date:** 2026-04-16 (revised)  
> **Scope:** MES → Master Data → ALL Categories → Category Groups  
> **Replaces:** Previous "Adhesive Formulation & Costing Plan" (custom-group-as-formulation approach)

---

## 0. What Changed & Why

### Previous design (now deprecated)
Custom groups were created as **peers** of Oracle groups in the sidebar. A custom group named "MORBOND 655 / CT85 / EA" lived at the same level as "Solvent Base" — its own sidebar card with items assigned via `mes_item_group_overrides`. Formulation data was stored in `mes_adhesive_formulation_components` linked to the custom group's `group_id`.

### Problem
This is architecturally wrong. Formulations are not new groups — they are **recipes created from items that already belong to an Oracle group** (or pulled from other categories). A formulation lives *inside* "Solvent Base", not alongside it.

### New design
- **Oracle groups stay as-is** in the sidebar (Solvent Base, Solvent Less, Hot Melt, etc.)
- When a user clicks an Oracle group, the **detail panel** shows its items AND a **Formulations tab** where multiple versioned BOMs can be created
- Each formulation is a **multi-level BOM** — its components can be raw items OR other formulations (recursive sub-assemblies)
- This applies to **all categories**, not just Adhesives
- Custom groups (`is_custom=true`) are **removed from the sidebar**. Formulations replace them.
- Cross-category sourcing: a Solvent Base formulation can include Ethyl Acetate from the Chemicals category

---

## 1. Domain Context

### 1.1 How formulations work across categories

| Category | Formulation use case | Typical components |
|----------|---------------------|-------------------|
| **Adhesives** | Mix ratio of resin + catalyst + solvent → applied as GSM on laminator | Resin (70% solids), Catalyst (100%), Solvent (0%) |
| **Inks** | Pigment + binder + solvent → applied as GSM on press cylinder | Pigment concentrate, extender, solvent, additive |
| **Chemicals** | Dilution recipes, cleaning solutions | Base chemical + diluent |
| **Resins** | Blending different grades for a target MFR/density | Resin A (60%) + Resin B (40%) |
| **Films/Substrates** | Layer structure BOM (less common — may use estimation BOM instead) | Film + primer + coating |

### 1.2 Costing formulas (universal)

These formulas work for ANY material type. The only variable is whether solids % matters (adhesives/inks) or not (resins/films).

```
totalParts      = Σ parts_i
totalSolids     = Σ (parts_i × solids_pct_i / 100)
totalCost       = Σ (parts_i × unit_price_i)

price_per_kg_wet    = totalCost / totalParts
price_per_kg_solids = totalCost / totalSolids          (only if solids-based)
solids_share_pct    = totalSolids / totalParts × 100

# At estimation time (deposit_gsm comes from the job):
wet_gsm             = deposit_gsm / (solids_share / 100)     -- solvent-based
cost_per_sqm        = wet_gsm × price_per_kg_wet / 1000
cost_per_1000_sqm   = cost_per_sqm × 1000
```

For categories where solids % is not relevant (resins, films), the formulation is pure parts-ratio costing:
```
blend_price = totalCost / totalParts     (simple weighted average)
```

### 1.3 Multi-level BOM explained

A formulation can include **another formulation** as a component. Example:

```
Formulation: "Production SB Mix v2"           (Level 0)
  ├── Sub-formulation: "Pre-mix Base"         (Level 1)
  │     ├── MORBOND 655          parts=100    (Level 2 — leaf item)
  │     └── CT 85                parts=3      (Level 2 — leaf item)
  └── ETHYL ACETATE              parts=106    (Level 1 — leaf item from Chemicals)
```

When computing costs, sub-formulations are **flattened**: the pre-mix's resolved price-per-kg is used as the unit price for that component line. The system recursively resolves all levels to arrive at a final cost.

**Circular reference protection:** A formulation cannot include itself or any ancestor in its tree. The backend validates this at save time.

---

## 2. Data Model

### 2.1 New table: `mes_formulations`

```sql
CREATE TABLE IF NOT EXISTS mes_formulations (
  id              SERIAL PRIMARY KEY,
  category_id     INTEGER NOT NULL REFERENCES mes_item_categories(id),
  catlinedesc     VARCHAR(255) NOT NULL,          -- the Oracle group this belongs to (e.g., "Sovent Base")
  name            VARCHAR(255) NOT NULL,          -- user-given name (e.g., "MORBOND 655 / CT85 / EA")
  version         INTEGER NOT NULL DEFAULT 1,     -- v1, v2, v3...
  status          VARCHAR(20) DEFAULT 'draft',    -- draft | active | archived
  notes           TEXT,
  created_by      INTEGER,                        -- user_id
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_formulation_version UNIQUE (category_id, catlinedesc, name, version)
);

CREATE INDEX idx_formulation_category ON mes_formulations(category_id, catlinedesc);
CREATE INDEX idx_formulation_status ON mes_formulations(status);
```

### 2.2 New table: `mes_formulation_components`

```sql
CREATE TABLE IF NOT EXISTS mes_formulation_components (
  id                  SERIAL PRIMARY KEY,
  formulation_id      INTEGER NOT NULL REFERENCES mes_formulations(id) ON DELETE CASCADE,
  component_type      VARCHAR(20) NOT NULL DEFAULT 'item',  -- 'item' | 'formulation'
  -- For component_type = 'item':
  item_key            TEXT,                                  -- normalized Oracle item key
  -- For component_type = 'formulation':
  sub_formulation_id  INTEGER REFERENCES mes_formulations(id) ON DELETE SET NULL,
  component_role      VARCHAR(30) DEFAULT 'other',           -- resin | hardener | solvent | catalyst
                                                             -- | pigment | binder | additive | base | other
  parts               DECIMAL(10,4) NOT NULL DEFAULT 0,
  solids_pct          DECIMAL(6,2),                          -- override; NULL = use TDS/spec value
  unit_price_override DECIMAL(12,4),                         -- override; NULL = resolve from Oracle/sub-formulation
  sort_order          INTEGER DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  -- An item can only appear once per formulation
  CONSTRAINT uq_formulation_item UNIQUE (formulation_id, item_key),
  -- A sub-formulation can only appear once per parent formulation
  CONSTRAINT uq_formulation_sub UNIQUE (formulation_id, sub_formulation_id),
  -- Exactly one of item_key or sub_formulation_id must be set
  CONSTRAINT chk_component_ref CHECK (
    (component_type = 'item' AND item_key IS NOT NULL AND sub_formulation_id IS NULL)
    OR (component_type = 'formulation' AND sub_formulation_id IS NOT NULL AND item_key IS NULL)
  )
);

CREATE INDEX idx_formulation_components_fid ON mes_formulation_components(formulation_id);
CREATE INDEX idx_formulation_components_sub ON mes_formulation_components(sub_formulation_id)
  WHERE sub_formulation_id IS NOT NULL;
```

### 2.3 Relationship diagram

```
mes_item_categories (id=4, name='Adhesives', material_class='adhesives')
  └── Oracle group: catlinedesc = 'Sovent Base'
        │
        ├── mes_formulations (id=10, name='MORBOND 655/CT85/EA', version=1, status='active')
        │     └── mes_formulation_components
        │           ├── type=item,        item_key='morbond655',     role=resin,    parts=100
        │           ├── type=item,        item_key='ct85',           role=catalyst, parts=3
        │           └── type=item,        item_key='ethyl_acetate',  role=solvent,  parts=106
        │                                  ↑ from Chemicals category (cross-category)
        │
        ├── mes_formulations (id=11, name='MORBOND 655/CT85/EA', version=2, status='draft')
        │     └── mes_formulation_components
        │           ├── type=formulation, sub_formulation_id=15,     role=base,     parts=103
        │           │     ↑ references "Pre-mix Base v1" (recursive BOM)
        │           └── type=item,        item_key='ethyl_acetate',  role=solvent,  parts=106
        │
        └── mes_formulations (id=15, name='Pre-mix Base', version=1, status='active')
              └── mes_formulation_components
                    ├── type=item,        item_key='morbond655',     role=resin,    parts=100
                    └── type=item,        item_key='ct85',           role=catalyst, parts=3
```

### 2.4 Migration from current system

The existing `mes_adhesive_formulation_components` table and `mes_item_category_groups.is_custom=true` rows will be migrated:

1. For each custom group that has formulation components:
   - Create a `mes_formulations` row (category_id, catlinedesc = parent_catlinedesc or best guess, name = display_name, version = 1, status = 'active')
   - Copy each `mes_adhesive_formulation_components` row → `mes_formulation_components` (component_type = 'item')
2. Custom groups with no formulation components → create empty draft formulations
3. After migration, soft-delete all `is_custom=true` groups (set `is_active=false`)
4. Drop `mes_adhesive_formulation_components` table (or rename to `_deprecated`)
5. Drop `parent_catlinedesc` column from `mes_item_category_groups` (no longer needed)

### 2.5 Tables NOT changed

- `mes_item_categories` — unchanged
- `mes_item_category_groups` — unchanged (Oracle groups remain; custom groups deprecated)
- `mes_item_group_overrides` — unchanged (still used for custom-group item assignment during migration; no longer needed for new formulations since formulation components reference items directly)
- `mes_spec_adhesives` / `mes_non_resin_material_specs` / `mes_material_tds` — unchanged (TDS data source for solids % fallback)
- `fp_actualrmdata` — unchanged (Oracle ERP data, source of item prices)

---

## 3. Backend API

### 3.1 Formulation CRUD

All routes under `/api/mes/master-data/items/custom-categories/:catId/formulations`.

#### `GET /formulations?catlinedesc=Sovent+Base`

List all formulations for a given category + Oracle group.

```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "name": "MORBOND 655/CT85/EA",
      "version": 1,
      "status": "active",
      "component_count": 3,
      "price_per_kg_wet": 2.502,
      "solids_share_pct": 34.93,
      "notes": null,
      "created_at": "2026-04-10T...",
      "updated_at": "2026-04-15T..."
    },
    {
      "id": 11,
      "name": "MORBOND 655/CT85/EA",
      "version": 2,
      "status": "draft",
      "component_count": 2,
      "price_per_kg_wet": null,
      "solids_share_pct": null,
      "notes": "Testing pre-mix approach",
      "created_at": "2026-04-16T...",
      "updated_at": "2026-04-16T..."
    }
  ]
}
```

#### `GET /formulations/:formulationId`

Full formulation detail with resolved components.

```json
{
  "success": true,
  "data": {
    "id": 10,
    "category_id": 4,
    "catlinedesc": "Sovent Base",
    "name": "MORBOND 655/CT85/EA",
    "version": 1,
    "status": "active",
    "components": [
      {
        "id": 101,
        "component_type": "item",
        "item_key": "morbond655",
        "mainitem": "MORBOND 655",
        "maindescription": "PU Resin - 70% solids",
        "source_category": "Adhesives",
        "component_role": "resin",
        "parts": 100,
        "solids_pct": 70.0,
        "solids_pct_source": "tds",
        "unit_price": 3.63,
        "unit_price_source": "oracle_stock",
        "oracle_stock_price": 3.55,
        "oracle_order_price": 3.63,
        "oracle_avg_price": 3.59,
        "tds_solids_pct": 70.0,
        "sort_order": 0,
        "notes": null
      },
      {
        "id": 103,
        "component_type": "item",
        "item_key": "ethyl_acetate",
        "mainitem": "ETHYL ACETATE",
        "maindescription": "Solvent",
        "source_category": "Chemicals",
        "component_role": "solvent",
        "parts": 106,
        "solids_pct": 0,
        "solids_pct_source": "override",
        "unit_price": 1.50,
        "unit_price_source": "override",
        "sort_order": 2,
        "notes": null
      }
    ],
    "totals": {
      "total_parts": 209,
      "total_solids": 73.0,
      "total_cost": 522.83,
      "price_per_kg_wet": 2.502,
      "price_per_kg_solids": 7.162,
      "solids_share_pct": 34.93
    }
  }
}
```

When a component has `component_type = 'formulation'`:

```json
{
  "id": 105,
  "component_type": "formulation",
  "sub_formulation_id": 15,
  "sub_formulation_name": "Pre-mix Base v1",
  "sub_formulation_status": "active",
  "component_role": "base",
  "parts": 103,
  "unit_price": 3.58,
  "unit_price_source": "resolved",
  "solids_pct": 70.87,
  "solids_pct_source": "resolved",
  "resolved_sub_components": [
    { "item_key": "morbond655", "mainitem": "MORBOND 655", "parts": 100 },
    { "item_key": "ct85", "mainitem": "CT 85", "parts": 3 }
  ],
  "sort_order": 0,
  "notes": "Using pre-mixed resin+catalyst"
}
```

The `unit_price` and `solids_pct` of a sub-formulation component are **resolved recursively** from the sub-formulation's own components. They can still be overridden.

#### `POST /formulations`

Create a new formulation.

```json
{
  "catlinedesc": "Sovent Base",
  "name": "MORBOND 655/CT85/EA",
  "notes": "Standard SB lamination adhesive"
}
```

- Version auto-increments: if a formulation with same `(category_id, catlinedesc, name)` exists, the new version = max(version) + 1.
- Status defaults to `draft`.
- Returns the new formulation (no components yet).

#### `PUT /formulations/:formulationId`

Update formulation metadata (name, notes, status).

```json
{
  "name": "MORBOND 655/CT85/EA (optimized)",
  "status": "active",
  "notes": "Reduced solvent ratio"
}
```

- When status changes to `active`, all other versions of the same formulation name in the same group are set to `archived`.

#### `PUT /formulations/:formulationId/components`

Save/replace all components of a formulation (full replacement — not incremental).

```json
{
  "components": [
    {
      "component_type": "item",
      "item_key": "morbond655",
      "component_role": "resin",
      "parts": 100,
      "solids_pct": null,
      "unit_price_override": null,
      "sort_order": 0,
      "notes": null
    },
    {
      "component_type": "formulation",
      "sub_formulation_id": 15,
      "component_role": "base",
      "parts": 103,
      "solids_pct": null,
      "unit_price_override": null,
      "sort_order": 0,
      "notes": "Using pre-mixed resin+catalyst"
    }
  ]
}
```

**Validation:**
1. All `item_key` values must exist in `fp_actualrmdata`.
2. All `sub_formulation_id` values must exist in `mes_formulations` and NOT create a circular reference.
3. Circular reference detection: recursively walk the sub-formulation tree; if `formulationId` appears anywhere → reject with 409.
4. `parts` must be > 0 for all components.

#### `POST /formulations/:formulationId/duplicate`

Duplicate a formulation as a new version or new name.

```json
{
  "new_name": "MORBOND 655/CT85/EA",
  "as_new_version": true
}
```

- If `as_new_version=true`: creates version N+1 with same name, copies all components.
- If `as_new_version=false`: creates version 1 with `new_name`, copies all components.

#### `DELETE /formulations/:formulationId`

Soft-delete (set status = 'deleted').

- Components are kept (CASCADE will clean up on hard delete if needed later).
- If any other formulation references this one as a sub-formulation → reject with 409 ("Cannot delete: used as sub-formulation in [list]").

### 3.2 Component item picker

#### `GET /formulations/:formulationId/candidates?source=group|category|all&search=ethyl`

Returns items available to add as components.

| source | Behavior |
|--------|----------|
| `group` | Items in the current Oracle group (catlinedesc) — default |
| `category` | Items in the current category (all Oracle groups) |
| `all` | Items across ALL categories in `fp_actualrmdata` |

Each row returns: `item_key, mainitem, maindescription, category, catlinedesc, stock_price, order_price, avg_price, tds_solids_pct`.

#### `GET /formulations/:formulationId/sub-formulation-candidates?search=pre-mix`

Returns formulations from ANY category that can be used as sub-components (excluding self and ancestors to prevent circularity).

### 3.3 Profile endpoint change

The existing `GET /items/custom-categories/:id/profile` response's `groups` array gains a new field per group:

```json
{
  "catlinedesc": "Sovent Base",
  "group_id": 7,
  "is_custom": false,
  "formulation_count": 3,
  "active_formulation_id": 10,
  "active_formulation_name": "MORBOND 655/CT85/EA v1",
  ...existing fields...
}
```

This lets the sidebar show a formulation count badge without extra API calls.

### 3.4 Estimation bridge (future sprint)

When the estimation module picks an adhesive/ink layer:
1. Instead of picking a single item, pick a **formulation**.
2. `cost_per_kg` = formulation's `price_per_kg_wet`.
3. `solid_pct` = formulation's `solids_share_pct`.
4. The estimation engine uses these values with existing `calcAdhesiveGSM` and `calcMaterialCostPerSqm` — no formula changes.

---

## 4. Frontend Design

### 4.1 Sidebar changes

The sidebar goes back to showing **only Oracle groups** — no custom groups, no sub-groups, no "Legacy" section.

Each Oracle group card gains a small formulation count badge:

```
┌──────────────────────────────────────────┐
│ Sovent Base                    ฿ 13.85   │
│ 2 groups · 7 items                  W.A  │
│ ┌────────────────────────────────┐       │
│ │ 📋 3 formulations (1 active)   │       │
│ └────────────────────────────────┘       │
└──────────────────────────────────────────┘
```

- Clicking the group opens the detail panel as before.
- The formulation badge is informational — clicking it can optionally jump to the Formulations tab.

### 4.2 Detail panel — new Formulations tab

When user clicks a Category Group, the detail drawer/panel shows:

**Tabs:** Items | **Formulations** | MRP | Specs

The **Formulations** tab is available for ALL categories.

#### 4.2.1 Formulation list view

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Formulations — Sovent Base                       [+ New Formulation]  │
│  ───────────────────────────────────────────────────────────────────── │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ MORBOND 655 / CT85 / EA                                        │  │
│  │ v1 (active)  │  3 components  │  $/kg: 2.50  │  Solids: 34.9% │  │
│  │ v2 (draft)   │  2 components  │  $/kg: —     │  Solids: —     │  │
│  │                                          [Open v1] [Open v2]   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ LOCTITE 401 Mix                                                │  │
│  │ v1 (active)  │  2 components  │  $/kg: 4.12  │  Solids: 100%  │  │
│  │                                                     [Open v1]  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

Grouped by formulation name, showing all versions. Active version highlighted.

#### 4.2.2 Formulation detail / BOM editor

Clicking "Open v1" opens the BOM editor (could be an inner panel or modal):

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MORBOND 655 / CT85 / EA — v1 (active)            [Duplicate] [Save]  │
│  Category: Adhesives → Sovent Base                                    │
│  ────────────────────────────────────────────────────────────────────── │
│                                                                       │
│  Components                                            [+ Add Item]   │
│                                                    [+ Add Formulation] │
│  ┌──────────────┬──────────┬───────┬─────────┬───────┬───────┬──────┐ │
│  │ Component    │ Type     │ Parts │ Solids% │ $/kg  │ Cost  │      │ │
│  ├──────────────┼──────────┼───────┼─────────┼───────┼───────┼──────┤ │
│  │ MORBOND 655  │ 🧪 Resin │ 100  │ 70.00 T │ 3.63  │363.00 │  ×  │ │
│  │ CT 85        │ ⚗ Catal. │   3  │100.00 O │14.61  │ 43.83 │  ×  │ │
│  │ Ethyl Acet.  │ 💧Solv.  │ 106  │  0.00 O │ 1.50  │159.00 │  ×  │ │
│  │              │          │      │         │       │       │      │ │
│  │ ▸ Pre-mix v1 │ 📦 BOM   │  50  │ 70.87 R │ 3.58  │179.00 │  ×  │ │
│  │   └ MORB 655 │          │ 100  │ 70.00   │ 3.63  │       │      │ │
│  │   └ CT 85    │          │   3  │100.00   │14.61  │       │      │ │
│  └──────────────┴──────────┴───────┴─────────┴───────┴───────┴──────┘ │
│                                                                       │
│  T = from TDS    O = override    R = resolved from sub-formulation    │
│                                                                       │
│  ┌─ Summary ─────────────────────┐  ┌─ Quick Estimate ─────────────┐ │
│  │ Total Parts:      209         │  │ Deposit (g/m²):  [  3.00  ]  │ │
│  │ Total Solids:      73.00      │  │ Wet GSM:           8.59      │ │
│  │ $/kg (wet):         2.50      │  │ Cost / m²:         0.0215    │ │
│  │ $/kg (solids):      7.16      │  │ Cost / 1000 m²:   21.47      │ │
│  │ Solids Share:      34.93%     │  └───────────────────────────────┘ │
│  └───────────────────────────────┘                                    │
│                                                                       │
│  Notes: ________________________________________________________      │
│  Status: [draft ▾]              Created: 2026-04-10                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key UI behaviors:**

1. **Parts** — editable number input (required, > 0).
2. **Solids %** — editable; pre-filled from TDS if available; "T" badge for TDS-sourced, "O" for override. Categories where solids is irrelevant (resins) can hide this column.
3. **$/kg** — editable override; pre-filled from Oracle ERP. For sub-formulation components, resolved from the sub-formulation's computed `price_per_kg_wet` ("R" badge).
4. **Role** — select dropdown. Options vary by category material_class:
   - Adhesives: Resin, Hardener, Catalyst, Solvent, Other
   - Inks: Pigment, Binder, Solvent, Additive, Other
   - Generic: Base, Additive, Diluent, Other
5. **Sub-formulation rows** — expandable. Show a collapsed summary line with the sub-formulation name + resolved price. Click ▸ to expand and see the sub-formulation's components (read-only).
6. **Cost** column — computed: `parts × unit_price` (read-only).
7. **×** — remove component (with Popconfirm).
8. **+ Add Item** — opens picker (source toggle: This Group | This Category | All Items).
9. **+ Add Formulation** — opens picker showing other formulations from any category/group (with circularity check).
10. **Duplicate** — creates a new version (v2, v3...) or a new name.
11. **Status** — Draft → Active (archives other versions with same name) → Archived.
12. **Summary / Quick Estimate** — same as current, computed live client-side.

### 4.3 Component picker modal

```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Component                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  Source: [This Group] [This Category] [All Items]                   │
│  Search: [_________________________________]                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Item Code    │ Description        │ Category │ $/kg  │ Solids │ │
│  ├──────────────┼────────────────────┼──────────┼───────┼────────┤ │
│  │ ETHYL ACETATE│ Solvent - EA       │Chemicals │ 1.50  │  0%    │ │
│  │ TOLUENE      │ Solvent            │Chemicals │ 1.30  │  0%    │ │
│  │ MORBOND 700  │ PU Resin High Soli │Adhesives │ 4.10  │ 75%   │ │
│  └──────────────┴────────────────────┴──────────┴───────┴────────┘ │
│                                                        [Add ✓]     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.4 Sub-formulation picker modal

```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Sub-Formulation                                                │
│  ─────────────────────────────────────────────────────────────────  │
│  Search: [_________________________________]                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Name           │ Category  │ Group       │ Ver │ $/kg │ Comp │  │
│  ├────────────────┼───────────┼─────────────┼─────┼──────┼──────┤  │
│  │ Pre-mix Base   │ Adhesives │ Sovent Base │ v1  │ 3.58 │  2   │  │
│  │ Catalyst Blend │ Adhesives │ Hot Melt    │ v1  │12.00 │  3   │  │
│  └────────────────┴───────────┴─────────────┴─────┴──────┴──────┘  │
│  ⚠ Formulations that would create circular references are hidden.  │
│                                                        [Add ✓]     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.5 State management changes

In `CustomCategories.jsx`:

**Remove:**
- `customGroupName`, `customGroupCreating`, `creatingSubGroupFor` — no longer needed
- `customGroupTarget`, `customGroupAssignOpen`, `customGroupItems`, `customGroupSelectedKeys` — replaced by formulation component picker
- `renamingGroupId`, `renameValue` — formulations are renamed via the edit panel, not inline sidebar
- All sidebar sub-group / custom-group rendering logic

**Add:**
```jsx
// Formulation list for current group
const [formulations, setFormulations] = useState([]);
const [formulationsLoading, setFormulationsLoading] = useState(false);

// Active formulation being edited
const [activeFormulation, setActiveFormulation] = useState(null);
const [formulationComponents, setFormulationComponents] = useState([]);
const [formulationDirty, setFormulationDirty] = useState(false);
const [formulationSaving, setFormulationSaving] = useState(false);

// Component picker
const [componentPickerOpen, setComponentPickerOpen] = useState(false);
const [componentPickerSource, setComponentPickerSource] = useState('group');
const [componentPickerSearch, setComponentPickerSearch] = useState('');

// Sub-formulation picker
const [subFormulationPickerOpen, setSubFormulationPickerOpen] = useState(false);

// Quick estimate
const [quickEstimateGSM, setQuickEstimateGSM] = useState(3.0);
```

**Formulation totals** — computed via `useMemo`, same formulas as Section 1.2:

```jsx
const formulationTotals = useMemo(() => {
  const comps = formulationComponents || [];
  const totalParts = comps.reduce((s, c) => s + (c.parts || 0), 0);
  const totalSolids = comps.reduce((s, c) => s + ((c.parts || 0) * (c.solids_pct || 0) / 100), 0);
  const totalCost = comps.reduce((s, c) => s + ((c.parts || 0) * (c.unit_price || 0)), 0);
  return {
    total_parts: totalParts,
    total_solids: roundTo(totalSolids, 4),
    total_cost: roundTo(totalCost, 4),
    price_per_kg_wet: totalParts > 0 ? roundTo(totalCost / totalParts, 4) : null,
    price_per_kg_solids: totalSolids > 0 ? roundTo(totalCost / totalSolids, 4) : null,
    solids_share_pct: totalParts > 0 ? roundTo(totalSolids / totalParts * 100, 2) : null,
  };
}, [formulationComponents]);
```

---

## 5. Comparator (Phase 3)

A **Comparator** sub-view within any category, accessible via a button at the category level.

- Top bar: "Compare formulations" + column selector (1–4 columns).
- Each column = a formulation picker (across all groups in this category).
- Each column shows: components table (read-only) + computed metrics.
- Bottom: head-to-head differences table.
- Shared deposit GSM input for fair comparison.
- Read-only — no editing.
- Component: `FormulationComparator.jsx` (generic, not adhesive-specific).

---

## 6. Implementation Phases

### Phase 1 — Data model + migration

| # | Task | Effort |
|---|------|--------|
| 1.1 | Create `mes_formulations` + `mes_formulation_components` tables | S |
| 1.2 | Migrate existing `mes_adhesive_formulation_components` data into new tables | M |
| 1.3 | Deprecate custom groups: soft-delete `is_custom=true` group rows | S |
| 1.4 | Clean up: drop `parent_catlinedesc` column, optionally rename old table | S |

### Phase 2 — Backend API

| # | Task | Effort |
|---|------|--------|
| 2.1 | `GET /formulations` — list formulations for a group | S |
| 2.2 | `GET /formulations/:id` — full detail with resolved components | M |
| 2.3 | `POST /formulations` — create with auto-version | S |
| 2.4 | `PUT /formulations/:id` — update metadata + status transitions | S |
| 2.5 | `PUT /formulations/:id/components` — save components with circular-ref check | L |
| 2.6 | `POST /formulations/:id/duplicate` — duplicate as new version or name | S |
| 2.7 | `DELETE /formulations/:id` — soft-delete with dependency check | S |
| 2.8 | `GET /formulations/:id/candidates` — item picker with cross-category search | M |
| 2.9 | `GET /formulations/:id/sub-formulation-candidates` — sub-formulation picker | M |
| 2.10 | Extend profile endpoint with `formulation_count` per group | S |
| 2.11 | Recursive price/solids resolution engine (shared util) | M |

### Phase 3 — Frontend: Sidebar cleanup + Formulations tab

| # | Task | Effort |
|---|------|--------|
| 3.1 | Remove custom-group / sub-group sidebar code (revert to Oracle-only) | M |
| 3.2 | Add formulation count badge to sidebar group cards | S |
| 3.3 | Add Formulations tab to detail panel | S |
| 3.4 | Build formulation list view (grouped by name, showing versions) | M |
| 3.5 | Build BOM editor (component table with inline editing) | L |
| 3.6 | Build component picker modal (3-source toggle) | M |
| 3.7 | Build sub-formulation picker modal (with circularity filter) | M |
| 3.8 | Build expandable sub-formulation rows in BOM table | M |
| 3.9 | Build live summary + quick estimate cards | S |
| 3.10 | Build formulation create/duplicate/status controls | M |
| 3.11 | Wire save/load/refresh lifecycle | M |

### Phase 4 — Comparator

| # | Task | Effort |
|---|------|--------|
| 4.1 | Build `FormulationComparator.jsx` (generic) | M |
| 4.2 | Multi-column formulation picker + display | M |
| 4.3 | Head-to-head differences table | M |
| 4.4 | Integrate as category-level button/tab | S |

### Phase 5 — Estimation bridge (future sprint)

| # | Task | Effort |
|---|------|--------|
| 5.1 | Add formulation picker to BOM layer editor | M |
| 5.2 | Auto-fill cost_per_kg and solid_pct from formulation | S |
| 5.3 | Add formulation breakdown tooltip in estimation | S |

---

## 7. Architectural Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | Formulations live INSIDE Oracle groups, not as peer groups | Formulations are recipes made FROM a group's items — they are children, not siblings |
| A2 | Separate `mes_formulations` + `mes_formulation_components` tables (not reusing `mes_item_category_groups`) | Clean separation; formulations have versioning and status that don't apply to Oracle groups |
| A3 | Recursive BOM via self-referencing `sub_formulation_id` | Supports multi-level BOM (pre-mixes, blends) without depth limits |
| A4 | Circular reference check at save time (not DB constraint) | DB can't enforce acyclicity in a DAG; application-level validation walks the tree |
| A5 | Version auto-increment per (category_id, catlinedesc, name) | Simple versioning without branching complexity |
| A6 | Cross-category component sourcing via `item_key` against `fp_actualrmdata` | A Solvent Base formulation can use Ethyl Acetate from Chemicals without category reassignment |
| A7 | Status lifecycle: draft → active → archived | Only one active version per formulation name per group at a time |
| A8 | All categories get the BOM engine (not just Adhesives) | Inks, Chemicals, and Resins all have mix/blend use cases |
| A9 | Parts ratio as primary input (not percentages) | Industry standard; "100:3:106" is how operators think |
| A10 | Deposit GSM is per-job (not stored on formulation) | Same formulation applied at different GSM depending on substrate and structure |
| A11 | Price resolution chain: override → Oracle stock WA → Oracle order → Oracle avg | Always-available costing even before user sets overrides |
| A12 | Solids % resolution chain: override → TDS → spec table → manual entry required | Critical for costing accuracy; must be explicit |

---

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| Q1 | Should sub-formulations be restricted to the same category, or truly cross-category? | If cross-category: an Ink formulation could include a Resin blend. Adds flexibility but also complexity. Recommend: allow cross-category. |
| Q2 | Should there be a "default active formulation" per Oracle group for estimation auto-selection? | Would simplify estimation workflow. Can be a boolean flag on `mes_formulations`. |
| Q3 | Maximum BOM depth limit? | Recommend: 5 levels. Prevents runaway recursion. Validated at save time. |
| Q4 | Should archived formulations be viewable or completely hidden? | Recommend: viewable but grayed out, not editable. Useful for historical reference. |
| Q5 | Should the formulation components support quantity UOM (kg, L, g) or stay unitless (parts ratio)? | Parts ratio is simpler and sufficient for costing. UOM adds complexity for no clear benefit at this stage. |

---

## 9. Files to Create / Modify

| File | Action | Phase | Description |
|------|--------|-------|-------------|
| `server/migrations/mes-master-050-formulations.js` | **Create** | 1 | New tables + data migration |
| `server/routes/mes/master-data/formulations.js` | **Create** | 2 | New sub-router for formulation CRUD |
| `server/routes/mes/master-data/items.js` | **Modify** | 2 | Add `formulation_count` to profile; remove custom-group routes (or deprecate) |
| `server/utils/formulation-resolver.js` | **Create** | 2 | Recursive price/solids resolution engine |
| `src/components/MES/MasterData/CustomCategories.jsx` | **Modify** | 3 | Remove sub-group sidebar; add Formulations tab |
| `src/components/MES/MasterData/FormulationEditor.jsx` | **Create** | 3 | BOM editor component |
| `src/components/MES/MasterData/FormulationComparator.jsx` | **Create** | 4 | Comparator component |
| `docs/API_CONTRACTS.md` | **Modify** | 2 | Document new endpoints |
