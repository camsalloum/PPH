# Universal Material Profile Tab — Implementation Plan

**Date:** 2026-04-11  
**Status:** Draft  
**Prerequisite reading:** `MATERIAL_SPECS_REBUILD_PLAN.md`, `CUSTOM_ITEM_CATEGORIES_PLAN.md`, `ITEM_MASTER_RESIN_PROFILE_PLAN.md`

---

## Problem Statement

The Item Group drawer in `CustomCategories.jsx` has **two different experiences**:

| Category type | Tabs shown | Profile data source | Param source | Pricing fields |
|---|---|---|---|---|
| **Resins** | Overview + MRP (2 tabs) | None | Hardcoded `PARAM_LABELS` (14 resin fields) | Group Market Price only |
| **Non-resin** (substrates, adhesives, chemicals, …) | Overview + MRP + Substrate Profile (3 tabs) | `GET /substrate-profile` → `mes_non_resin_material_specs` | `resolveSubstrateProfile()` → `mes_parameter_definitions` | Market + MAP + Standard + Last PO + Market Date |

### What's wrong

1. **Resins excluded** — no 3rd tab, no editable pricing beyond group market price, no profile params.
2. **Tab named "Substrate Profile"** for adhesives/chemicals/etc — misleading.
3. **Resin params hardcoded** — 14 fields baked into `resin-profile` endpoint and frontend `PARAM_LABELS`. Not in `mes_parameter_definitions`.
4. **Parameters not aggregated from actual specs** — the substrate profile reads `mes_non_resin_material_specs`, but resins read `mes_material_tds` with a different schema. No unified aggregation.
5. **Removing a mapped item doesn't auto-update** — profile aggregates are computed on fetch, but the frontend doesn't re-aggregate on mapping change without a full re-fetch.

---

## Design Principles

1. **One tab, all categories** — "Material Profile" replaces "Substrate Profile". Shown for every material class.
2. **Parameters from DB, never hardcoded** — All param definitions live in `mes_parameter_definitions`. Resins get seeded there too. Frontend receives `{ field_key, label, unit, display_group, sort_order }` from backend. `PARAM_LABELS` constant deleted from frontend.
3. **Aggregation = live weighted average** — Backend computes stock-qty-weighted averages across all mapped items. Frontend calls the profile endpoint and displays what comes back. Period.
4. **Mapping changes → instant re-aggregate** — When user adds/removes a mapped material key, frontend re-fetches the profile endpoint with the new key set. Backend recomputes averages. UI updates.
5. **Same layout, different params** — Every category sees the same card grid. The fields rendered are driven entirely by `param_meta[]` returned by the backend. Resins show MFR/density/melting point; substrates show thickness/width/yield; adhesives show viscosity/solid%; etc.

---

## Architecture

### Data Flow

```
┌───────────────────┐
│ mes_parameter_     │   Defines WHAT fields exist per material_class
│ definitions        │   (field_key, label, unit, display_group, sort_order)
└────────┬──────────┘
         │
         ▼
┌───────────────────┐   ┌──────────────────────────┐
│ GET /material-     │◄──│ Mapped material keys      │
│ profile            │   │ (from config or request)  │
│                    │   └──────────────────────────┘
│ 1. Get param defs  │
│    for material_   │
│    class           │
│ 2. Get spec rows   │──► mes_material_tds (resins)
│    from spec table │──► mes_non_resin_material_specs (others)
│ 3. Join inventory  │──► fp_actualrmdata (all)
│    for weights     │
│ 4. Compute WA per  │
│    param key       │
│ 5. Return:         │
│    - param_values  │   { field_key → weightedAvg }
│    - param_meta    │   { field_key → {label, unit, group, sort_order} }
│    - inventory     │   { stock_qty, order_qty, stock_val, order_val }
│    - pricing       │   { stock_wa, order_wa, combined_wa }
│    - specs[]       │   per-item breakdown
└───────────────────┘
         │
         ▼
┌───────────────────┐
│ Frontend:          │
│ Material Profile   │
│ tab                │
│                    │
│ • KPI strip from   │
│   inventory+pricing│
│ • Param cards from │
│   param_meta +     │
│   param_values     │
│ • Pricing editors  │
│   (Market/MAP/Std/ │
│   LastPO/Date)     │
│ • Mapped keys      │
│   selector         │
│ • Config save      │
└───────────────────┘
```

### Mapping change → re-aggregate flow

```
User adds/removes item key in mapping selector
  │
  ▼
Frontend calls GET /material-profile?material_class=X&...&material_keys=key1,key2,...
  │
  ▼
Backend re-queries spec table for new key set → recomputes WA for all params
  │
  ▼
Frontend receives new param_values + inventory + pricing → re-renders cards
  │
  ▼
User sees updated averages instantly (no save needed for preview;
save persists the mapping to mes_material_profile_configs)
```

---

## Phase 1 — Seed resin params into `mes_parameter_definitions`

**Migration: `mes-master-04X-resin-param-definitions.js`**

Insert the 14 resin TDS fields into `mes_parameter_definitions`:

| material_class | field_key | label | unit | display_group | sort_order |
|---|---|---|---|---|---|
| resins | mfr_190_2_16 | MFR 190/2.16 | g/10min | Rheology | 1 |
| resins | mfr_190_5_0 | MFR 190/5.0 | g/10min | Rheology | 2 |
| resins | hlmi_190_21_6 | HLMI 190/21.6 | g/10min | Rheology | 3 |
| resins | mfr_230_2_16_pp | MFR 230/2.16 PP | g/10min | Rheology | 4 |
| resins | melt_flow_ratio | Melt Flow Ratio | — | Rheology | 5 |
| resins | density | Density | g/cm³ | Physical | 10 |
| resins | crystalline_melting_point | Melting Point | °C | Thermal | 20 |
| resins | vicat_softening_point | Vicat Softening Point | °C | Thermal | 21 |
| resins | heat_deflection_temp | HDT | °C | Thermal | 22 |
| resins | tensile_strength_break | Tensile Strength at Break | MPa | Mechanical | 30 |
| resins | elongation_break | Elongation at Break | % | Mechanical | 31 |
| resins | brittleness_temp | Brittleness Temperature | °C | Mechanical | 32 |
| resins | bulk_density | Bulk Density | g/cm³ | Physical | 11 |
| resins | flexural_modulus | Flexural Modulus | MPa | Mechanical | 33 |

All rows: `profile = NULL`, `field_type = 'number'`, `is_core = true`.

**No schema changes** — the `mes_parameter_definitions` table already supports this. Just INSERT rows.

---

## Phase 2 — Unified `GET /material-profile` endpoint

**Replace** the separate `GET /resin-profile` and `GET /substrate-profile` endpoints with a single **`GET /material-profile`** endpoint.

### Request

```
GET /api/mes/master-data/items/material-profile
  ?material_class=resins|substrates|adhesives|...
  &cat_desc=HDPE               (catlinedesc / category group)
  &appearance=HDPE-1            (itemgroup, optional)
  &material_keys=RM001,RM002   (comma-separated, optional — from config or all group items)
```

### Logic

```
1. Validate material_class against mes_category_mapping (all active classes)
2. Fetch param definitions:
     SELECT field_key, label, unit, display_group, sort_order
     FROM mes_parameter_definitions
     WHERE material_class = $1 AND profile IS NULL
     ORDER BY sort_order
3. Resolve spec source table:
     if material_class = 'resins' → read from mes_material_tds
     else → read from mes_non_resin_material_specs
4. Fetch spec rows for material_keys (or all items in cat_desc/appearance):
     JOIN fp_actualrmdata for stock_qty (weight for WA)
5. For each param in param_definitions:
     Compute: weightedAvg = Σ(value_i × weight_i) / Σ(weight_i)
              min, max across all spec rows
     (skip NULL values; weight = stock_qty, fallback = 1)
6. Compute inventory totals: stock_qty, order_qty, stock_val, order_val
7. Compute pricing: stock_price_wa, on_order_price_wa, combined_price_wa
8. Return unified response (see below)
```

### Response shape (identical for ALL material classes)

```json
{
  "success": true,
  "data": {
    "material_class": "resins",
    "parameter_profile": null,
    "param_definitions": [
      { "field_key": "mfr_190_2_16", "label": "MFR 190/2.16", "unit": "g/10min", "display_group": "Rheology", "sort_order": 1 },
      { "field_key": "density", "label": "Density", "unit": "g/cm³", "display_group": "Physical", "sort_order": 10 }
    ],
    "param_values": {
      "mfr_190_2_16": { "weightedAvg": 2.1, "min": 0.3, "max": 8.0, "count": 5 },
      "density": { "weightedAvg": 0.921, "min": 0.89, "max": 0.96, "count": 5 }
    },
    "inventory": {
      "total_stock_qty": 50000,
      "total_stock_val": 125000,
      "total_order_qty": 20000,
      "total_order_val": 48000
    },
    "pricing": {
      "stock_price_wa": 2.50,
      "on_order_price_wa": 2.40,
      "combined_price_wa": 2.47
    },
    "density_wa": 0.921,
    "spec_count": 5,
    "specs": [
      {
        "material_key": "RM-12345",
        "description": "SABIC M500034",
        "stock_qty": 5000,
        "order_qty": 2000,
        "stock_price_wa": 1.85,
        "on_order_price_wa": 1.90,
        "params": { "mfr_190_2_16": 0.35, "density": 0.954 }
      }
    ]
  }
}
```

### Key differences from current endpoints

| Aspect | Current `substrate-profile` | Current `resin-profile` | New `material-profile` |
|---|---|---|---|
| Param source | `resolveSubstrateProfile()` regex → profile-specific defs | Hardcoded 14 `tdsFields` | `mes_parameter_definitions` WHERE material_class = $1 |
| Spec source | `mes_non_resin_material_specs` | `mes_material_tds` | Branched by material_class (same tables, unified output) |
| Material keys | Explicit in query | All items in catlinedesc | Explicit if provided, else all items in cat_desc/appearance |
| Response | Custom shape | Custom shape | **Unified shape** (see above) |

### Backward compatibility

- Keep old endpoints as thin wrappers calling the new unified logic, returning old shapes. Mark deprecated.
- Or: update all callers at once (only `CustomCategories.jsx` and `MaterialSpecsPage.jsx` use them).

---

## Phase 3 — Unified `mes_material_profile_configs` table

**Rename and generalize** `mes_substrate_profile_configs` → `mes_material_profile_configs`.

### Migration: `mes-master-04X-universal-profile-configs.js`

```sql
ALTER TABLE mes_substrate_profile_configs
  RENAME TO mes_material_profile_configs;

-- Relax material_class constraint to allow 'resins' and all future classes
ALTER TABLE mes_material_profile_configs
  DROP CONSTRAINT IF EXISTS mes_substrate_profile_configs_material_class_check;

ALTER TABLE mes_material_profile_configs
  ADD CONSTRAINT mes_material_profile_configs_material_class_check
  CHECK (material_class IN (
    'resins', 'substrates', 'adhesives', 'chemicals',
    'additives', 'coating', 'packing_materials', 'mounting_tapes'
  ));

-- Add a generic params_json column for category-specific overrides
-- (replaces individual columns like density_g_cm3, micron_thickness, etc.)
ALTER TABLE mes_material_profile_configs
  ADD COLUMN IF NOT EXISTS params_override JSONB DEFAULT '{}';
```

### Why `params_override` JSONB?

Current table has **hardcoded physical columns** (`density_g_cm3`, `solid_pct`, `micron_thickness`, `width_mm`, …) that only make sense for substrates. Rather than adding 14 resin columns + N columns for each future category, store overrides in JSONB keyed by `field_key`.

Example for a resin config:
```json
{
  "density": 0.952,
  "mfr_190_2_16": 2.1
}
```

Example for a substrate config:
```json
{
  "density_g_cm3": 0.905,
  "micron_thickness": 12,
  "width_mm": 1020
}
```

The existing individual columns remain for backward compat and can be deprecated over time. New code reads `params_override` first, falls back to individual columns.

### Shared columns (all categories)

These columns stay as-is — they apply to every material class:

| Column | Purpose |
|---|---|
| `material_class` | Category identifier |
| `cat_desc` | Category group (catlinedesc) |
| `appearance` | Item group |
| `supplier_name` | Preferred supplier |
| `price_control` | MAP or STD |
| `market_ref_price` | Market reference price |
| `market_price_date` | Market price effective date |
| `map_price` | Moving Average Price |
| `standard_price` | Standard costing price |
| `last_po_price` | Last purchase order price |
| `mrp_type` | PD / ND / VB |
| `reorder_point` | Reorder trigger qty |
| `safety_stock_kg` | Safety stock buffer |
| `planned_lead_time_days` | Procurement lead time |
| `mapped_material_keys` | TEXT[] of Oracle item codes |

---

## Phase 4 — Unified `PUT /material-profile-config` endpoint

**Replace** the current `PUT /substrate-config` with a universal endpoint.

### Request

```
PUT /api/mes/master-data/items/material-profile-config
Body: {
  material_class: "resins",
  cat_desc: "HDPE",
  appearance: "HDPE-1",
  supplier_name: "SABIC",
  price_control: "MAP",
  market_ref_price: 2.50,
  market_price_date: "2026-04-11",
  map_price: 2.45,
  standard_price: 2.40,
  last_po_price: 2.55,
  mrp_type: "PD",
  reorder_point: 5000,
  safety_stock_kg: 2000,
  planned_lead_time_days: 14,
  mapped_material_keys: ["RM-001", "RM-002", "RM-003"],
  params_override: {
    "density": 0.952,
    "mfr_190_2_16": 2.1
  }
}
```

### Logic

```
UPSERT into mes_material_profile_configs
  ON CONFLICT (material_class, cat_desc, appearance)
  SET all provided columns + params_override
```

---

## Phase 5 — Frontend: Universal Material Profile Tab

### 5A. Remove hardcoded constants

| Remove | Reason |
|---|---|
| `PARAM_LABELS` | Backend returns labels in `param_definitions[]` |
| `SUBSTRATE_CONFIG_DEFAULTS` | Replace with generic `PROFILE_CONFIG_DEFAULTS` (shared fields only) |
| `NON_RESIN_MATERIAL_CLASSES` | No longer needed — all classes get the tab |
| `isNonResinDrawer` | Removed — tab is universal |

### 5B. New `PROFILE_CONFIG_DEFAULTS`

```js
const PROFILE_CONFIG_DEFAULTS = {
  supplier_name: null,
  price_control: 'MAP',
  market_ref_price: null,
  market_price_date: null,
  map_price: null,
  standard_price: null,
  last_po_price: null,
  mrp_type: 'PD',
  reorder_point: null,
  safety_stock_kg: null,
  planned_lead_time_days: null,
  mapped_material_keys: [],
  params_override: {},
};
```

No physical property fields — those come dynamically from `param_definitions`.

### 5C. Rename tab

```
"Substrate Profile" → "Material Profile"
```

### 5D. Fetch unified profile

```js
const fetchMaterialProfile = useCallback(async (materialClass, catDesc, appearance, materialKeys) => {
  const { data } = await axios.get(`${API}/api/mes/master-data/items/material-profile`, {
    params: {
      material_class: materialClass,
      cat_desc: catDesc,
      appearance,
      material_keys: materialKeys?.join(','),
    },
  });
  return data.data;
  // → { param_definitions[], param_values{}, inventory{}, pricing{}, specs[] }
}, []);
```

### 5E. Tab content — universal layout

The Material Profile tab renders **the same layout** for every category. Content is driven by backend data:

```
┌─────────────────────────────────────────────────────────────┐
│  KPI Strip (from profile.inventory + profile.pricing)       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Mapped│ │Stock │ │Order │ │Comb. │ │Density│ │Unmap │   │
│  │Specs │ │Qty   │ │Qty   │ │WA    │ │(WA)  │ │Items │   │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   │
├─────────────────────────────────────────────────────────────┤
│  Identity Row                                               │
│  Category Group │ Item Group │ Material Class │ Coverage    │
├─────────────────────────────────────────────────────────────┤
│  Parameter Cards — DYNAMIC from param_definitions[]         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ {display_group} (e.g. "Rheology" / "Physical")      │    │
│  │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │ │{label} │ │{label} │ │{label} │ │{label} │        │    │
│  │ │{WA val}│ │{WA val}│ │{WA val}│ │{WA val}│        │    │
│  │ │{unit}  │ │{unit}  │ │{unit}  │ │{unit}  │        │    │
│  │ │min–max │ │min–max │ │min–max │ │min–max │        │    │
│  │ └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  └─────────────────────────────────────────────────────┘    │
│  (Repeat per display_group)                                 │
├─────────────────────────────────────────────────────────────┤
│  Pricing Editors (same for ALL categories)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Market    │ │MAP Price │ │Standard  │ │Last PO   │      │
│  │Price     │ │          │ │Price     │ │Price     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │Price Ctrl│ │Market    │ │Supplier  │                    │
│  │(MAP/STD) │ │Date      │ │Name      │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────────┤
│  MRP Editors (same for ALL categories)                      │
│  MRP Type │ Reorder Pt │ Safety Stock │ Lead Days           │
├─────────────────────────────────────────────────────────────┤
│  Mapped Material Keys                                       │
│  [Map All] [Refresh Profile]                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Multi-select: mapped Oracle item codes              │    │
│  └─────────────────────────────────────────────────────┘    │
│  Unmapped items table (if any)                              │
├─────────────────────────────────────────────────────────────┤
│  [Save Profile Config]                                      │
└─────────────────────────────────────────────────────────────┘
```

### What varies per category — ONLY the Parameter Cards section

| Category | display_groups shown | Example fields |
|---|---|---|
| **Resins** | Rheology, Physical, Thermal, Mechanical | MFR 190/2.16, Density, Melting Point, Flexural Modulus |
| **Substrates** | Physical, Dimensional, Optical (per substrate profile) | Thickness, Width, Density, Yield, Haze, COF |
| **Adhesives** | Physical, Application | Viscosity, Solid %, Open Time, Coat Weight |
| **Chemicals** | Physical | Concentration, pH, Flash Point |
| …future | Whatever is in `mes_parameter_definitions` | Auto-discovered |

### 5F. Re-aggregate on mapping change

```js
// When user changes mapped keys in the multi-select:
const handleMappedKeysChange = async (newKeys) => {
  setProfileDraft(prev => ({ ...prev, mapped_material_keys: newKeys }));
  // Immediately re-fetch profile with new keys → backend recomputes WA
  const freshProfile = await fetchMaterialProfile(
    materialClass, catDesc, appearance, newKeys
  );
  setMaterialProfile(freshProfile);
  // UI re-renders with updated param_values, inventory, pricing
};
```

No save needed to see the preview. Save persists the mapping + any overrides.

### 5G. Parameter override flow

By default, param cards show the **computed weighted average** (read-only, from `param_values`). If the user wants to manually set a value (e.g. override density for estimation), they click an override toggle on the param card:

- **Default state:** Shows WA value, greyed out, with "avg of N items" subtitle
- **Override state:** Editable input, value saved to `params_override` JSONB in config

This keeps the aggregated truth visible while allowing manual corrections.

---

## Phase 6 — Remove old substrate-only code

After the universal system is working:

1. **Delete** `GET /substrate-profile` endpoint (or keep as deprecated wrapper)
2. **Delete** `GET /resin-profile` endpoint (or keep as deprecated wrapper)  
3. **Delete** `PUT /substrate-config` endpoint (or keep as deprecated wrapper)
4. **Remove** from frontend: `SUBSTRATE_CONFIG_DEFAULTS`, `PARAM_LABELS`, `NON_RESIN_MATERIAL_CLASSES`, `isNonResinDrawer`, `buildSubstrateDraft()`, `fetchSubstrateProfile()`, `loadSubstrateConfig()`, `handleSaveSubstrateConfig()`
5. **Replace** with: `PROFILE_CONFIG_DEFAULTS`, `fetchMaterialProfile()`, `loadMaterialConfig()`, `handleSaveMaterialConfig()`

---

## Migration Checklist

| # | Task | Type | Depends on |
|---|---|---|---|
| M1 | Seed resin params into `mes_parameter_definitions` | Migration | — |
| M2 | Rename `mes_substrate_profile_configs` → `mes_material_profile_configs` + add `params_override` JSONB | Migration | — |
| M3 | Create `GET /material-profile` unified endpoint | Backend | M1 |
| M4 | Create `PUT /material-profile-config` unified endpoint | Backend | M2 |
| M5 | Update frontend: universal Material Profile tab | Frontend | M3, M4 |
| M6 | Remove old endpoints + old frontend constants | Cleanup | M5 verified |

---

## Constraints & Rules

1. **Zero hardcoded parameters in frontend.** All field definitions come from `param_definitions[]` in the API response.
2. **Zero material-class branching in tab visibility.** Every category gets Overview + MRP + Material Profile.
3. **Same pricing editor for all.** Market Price, MAP, Standard, Last PO, Market Date, Price Control, Supplier — universal.
4. **Same MRP editor for all.** MRP Type, Reorder Point, Safety Stock, Lead Days — universal.
5. **Same mapping UI for all.** Map/unmap Oracle items, refresh profile, unmapped audit — universal.
6. **Aggregation is always live.** Change mapped keys → re-fetch → re-render. No stale data.
7. **New category = zero code changes.** Add rows to `mes_parameter_definitions` + `mes_category_mapping` → new category auto-appears with its own param cards.
8. **Backend branching only for spec source table.** Resins read `mes_material_tds`, others read `mes_non_resin_material_specs`. This is the ONLY if-branch by material class. Everything else is table-driven.
