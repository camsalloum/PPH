# Item Master — Resin Profile Edit View Plan
**Date:** 2026-04-03  
**For:** Codex implementation  
**Post-implementation:** Opus verification

---

## Objective

Replace the static/hardcoded-looking values in the Item Master resin edit view with **live weighted-average calculations** following the same concept already working in the Raw Materials Dashboard. The edit view must contain everything related to: estimation defaults, prices, stock, in-order averages, and all Material Specs (TECH_PARAM_CONFIG) parameters.

TDS resin parameters are **NOT fully populated yet** — they will be filled later. The code must gracefully handle NULL/empty TDS data and show computed averages only when data exists.

---

## Scope Lock Addendum (2026-04-05)

User direction confirmed for Resin category governance:

1. The existing Resin category list (for example: Random PP, HDPE, LDPE, LLDPE, mLLDPE, Film Scrap/Regrind variants) is treated as editable master data labels.
2. Resin category names must be customizable by user (rename supported).
3. Users must be able to create new categories under Resin.
4. Users must be able to map/unmap Resin items to these Resin categories.
5. All changes must be persisted in backend storage (not UI-only).

Implementation guardrail:
- Use stable internal IDs/keys for Resin categories and store user-editable display names separately, so renaming never breaks mappings, pricing aggregation, or estimation references.

### UI Naming Convention Addendum (2026-04-05-C)

User wording rule confirmed:

1. Use "Category" for top-level category labels and "Subcategory" for second-level labels where legacy text used "Cat. Desc.", "Category Desc", or "Category Description".
2. Preserve backend field names (`cat_desc`, `catlinedesc`, etc.) for API/database compatibility.
3. Apply this naming convention consistently across Item Master, TDS Material Specs, and BOM configuration screens.

---

## Scope Lock Addendum (2026-04-05-B) — Substrate Categories/Subcategories

User direction confirmed for Substrate taxonomy governance:

1. Substrate Categories and Sub Categories are master data, not hardcoded labels.
2. Both levels are user-customizable in name (rename supported).
3. Users can add new Categories and new Sub Categories.
4. Users can map and unmap DB material items to Sub Categories.
5. All names and mappings are persisted in backend storage.

### Seed Substrate Categories (initial data set)

- Aluminium Foil
- BOPP
- CPP
- PA
- Alu/Pap
- PAP
- PE
- PET
- PETC
- PETG
- PVC

### Seed Sub Categories (initial data set)

- Plain Aluminium Foil
- BOPP Transparent HS Regular
- BOPP Transparent NHS Regular
- BOPP Transparent HS Low SIT
- BOPP White Label Grade
- BOPP Transparent Label Grade
- BOPP Transparent Matt HS
- BOPP Metalized HS Regular
- BOPP Metalized HS High Barrier
- BOPP White Pearlised
- BOPP White IML/Speciality
- BOPP Transparent IML/Speciality
- CPP Transparent HS
- CPP Metalized HS
- Polyamide
- Butter Foil
- Greaseproof Paper
- Kraft Paper
- Coated Paper
- Coated Paper-PE
- Twist Wrap Paper
- PE Lamination
- PET Matt NF ChemTr.
- PET Metalized NF HB
- PET Metalized NF NB
- PET Metalized HF NB
- PET Transparent NF NB ChemTr.
- PET Transparent Twist
- PET Adhesive Film
- PET-C Shrink
- PET-G Shrink
- PVC Blow Shrink

### Cross-category mandate

The same concept is mandatory for all future Item Master categories:

- editable names,
- add-more capability,
- DB item mapping,
- backend persistence,
- stable internal IDs separated from display names.

---

## Final Unified Plan (2026-04-05)

This is the final architecture plan to support Resin, Substrates, and all future categories with one scalable model.

### Phase 1 — Canonical taxonomy model in DB

Create normalized tables:

1. `mes_item_taxonomy_categories`
  - `id` (PK)
  - `internal_key` (immutable unique key)
  - `display_name` (user-editable)
  - `domain` (for example: resin, substrate, future)
  - `sort_order`, `is_active`, audit columns

2. `mes_item_taxonomy_subcategories`
  - `id` (PK)
  - `category_id` (FK)
  - `internal_key` (immutable unique inside category)
  - `display_name` (user-editable)
  - `sort_order`, `is_active`, audit columns

3. `mes_item_taxonomy_mappings`
  - `id` (PK)
  - `subcategory_id` (FK)
  - `source_system` (for example: rm_sync, item_master, tds)
  - `source_item_key` (normalized DB item key/code)
  - `is_active`, audit columns
  - unique constraint on (`subcategory_id`, `source_system`, `source_item_key`)

### Phase 2 — Taxonomy management APIs

Add secured CRUD endpoints:

1. Categories: list, create, rename, activate/deactivate, reorder.
2. Sub Categories: list by category, create, rename, activate/deactivate, reorder.
3. Mapping: list mapped DB items, map, unmap, bulk replace.

All APIs return IDs and display names separately.

### Phase 3 — Item Master UI migration

1. Replace hardcoded category/subcategory pills with API-driven taxonomy.
2. Add inline actions: rename, add category, add subcategory.
3. Replace static mapping source behavior with DB-backed mapping APIs.
4. Keep expanded-row metrics and profile screens reading from mapped DB items.

### Phase 4 — Aggregation service standardization

Create one reusable aggregation layer that computes:

1. stock/on-order weighted prices,
2. weighted density,
3. weighted spec parameter rollups,

for any taxonomy subcategory based on mapped DB items.

### Phase 5 — Estimation and BOM alignment

1. BOM keeps snapshot behavior for quote stability.
2. Source selection and defaults align to the taxonomy mapping model.
3. Estimation material sourcing is migrated from legacy static catalog paths to taxonomy-backed mapped sources.

### Phase 6 — Backfill and rollout

1. Seed Resin and Substrate category/subcategory names from current business lists.
2. Import existing static mapping artifacts into taxonomy tables.
3. Provide compatibility adapters for existing endpoints during transition.
4. Roll out behind feature flag, then remove static dependency.

### Phase 7 — Validation and acceptance

Acceptance checks:

1. User can rename any category/subcategory without breaking mappings.
2. User can create new category/subcategory and map DB items immediately.
3. Item Master, Material Specs, BOM, and Estimation read consistent mapped data.
4. Resin/Substrate/future categories all work with the same code path.

---

## Verified Data Landscape (from live DB queries)

### Tables & Linkage

| Table | Role | Key Fields |
|---|---|---|
| `fp_actualrmdata` | Oracle ERP sync — stock, prices, density | `mainitem` (grade code), `catlinedesc`, `mainitemstock`, `maincost`, `pendingorderqty`, `purchaseprice`, `weights` (density in g/cm³) |
| `mes_item_master` | Item registry — 7 active resin rows | `item_code` (e.g. HDPE-20), `oracle_cat_desc` (e.g. HDPE), `category` |
| `mes_material_tds` | TDS — 40 resin grades, strict params | `oracle_item_code` (grade code), `cat_desc` (e.g. HDPE), `density` (INTEGER kg/m³), `mfr_190_2_16`, etc. |

### Join Paths (verified)

```
fp_actualrmdata.mainitem = mes_material_tds.oracle_item_code  ← WORKS (81 matched rows from 40 TDS records)
fp_actualrmdata.catlinedesc = mes_item_master.oracle_cat_desc ← WORKS (existing rm_prices CTE uses this)
```

**TDS ↔ Item Master**: No direct item_code link exists. TDS `oracle_item_code` values are grade-level codes (e.g. `BXXOTLDHDFB5600`), while Item Master `item_code` values are category-level codes (e.g. `HDPE-20`). The link is through **category**: `mes_material_tds.cat_desc` maps to `mes_item_master.oracle_cat_desc`.

### Category Mapping (verified exact values)

| TDS `cat_desc` | Item Master `oracle_cat_desc` | Notes |
|---|---|---|
| `HDPE` | `HDPE` | Exact match |
| `LDPE` | `LDPE` | Exact match |
| `LLDPE` | `LLDPE` | Exact match |
| `mLLDPE` | `mLLDPE` | Exact match |
| `Random PP` | `Random PP` | Exact match |
| `Film Scrap` | `Film Scrap / Regrind Clear` | Item Master splits into 2 rows: Clear + Printed |
| `Film Scrap` | `Film Scrap / Regrind Printed` | Use `LIKE 'Film Scrap%'` or map both |

### TDS Parameter Fill Rate (current state — will increase later)

| cat_desc | Total | has_mfr | has_density | has_melting | has_vicat | has_bulk_density | has_flexural |
|---|---|---|---|---|---|---|---|
| HDPE | 7 | 7 | 7 | 7 | 7 | 0 | 2 |
| LDPE | 13 | 13 | 13 | 13 | 11 | 0 | 0 |
| LLDPE | 6 | 6 | 6 | 6 | 6 | 0 | 0 |
| mLLDPE | 10 | 10 | 10 | 10 | 10 | 0 | 0 |
| Random PP | 2 | 2 | 2 | 2 | 2 | 0 | 0 |
| Film Scrap | 2 | 2 | 2 | 2 | 0 | 0 | 0 |

**Key:** `mfr_190_2_16` and `density` are well-populated. `bulk_density` and `flexural_modulus` are mostly NULL. Code must handle partial data gracefully.

### RM Sample Row (verified)

```json
{
  "mainitem": "BXXOTLDHDFB5600",
  "catlinedesc": "HDPE",
  "maincost": "3.7588",
  "mainitemstock": "213125",
  "pendingorderqty": "74250",
  "purchaseprice": "3.86",
  "weights": "0.952"
}
```

`weights` field = density in g/cm³ (same as RM Dashboard uses for `densityWtdAvg`).

---

## Architecture Decision Records

### ADR-1: TDS params use cat_desc grouping, not per-item
The aggregation endpoint groups TDS records by `cat_desc` (e.g. all 7 HDPE grades), computes weighted averages using `fp_actualrmdata` stock as weight. This matches how the RM Dashboard works.

### ADR-2: Density unit — return g/cm³ from API
`mes_material_tds.density` is INTEGER kg/m³. `fp_actualrmdata.weights` is VARCHAR g/cm³. API returns density in **g/cm³** for consistency with the existing UI and RM Dashboard. Backend divides TDS density by 1000.

### ADR-3: NULL handling — skip, don't zero-fill
When computing weighted averages, rows where the parameter is NULL are excluded from both numerator and denominator. If ALL rows for a parameter are NULL, return `null` (not 0). Frontend shows `—` for null values.

### ADR-4: Processing tab → replaced by Material Specs section
The current Processing tab (mfi, cof, sealing_temp_min, sealing_temp_max) uses legacy `mes_item_master` columns. It will be replaced by aggregated TDS TECH_PARAM_CONFIG values displayed as read-only weighted averages. The legacy columns remain in the table but are no longer shown in the edit UI.

### ADR-5: fp-averages endpoint — keep but extend
The existing `GET /items/fp-averages` endpoint stays for backward compatibility (BOM uses it). The new `GET /items/resin-profile` endpoint is additive and serves the expanded edit view.

### ADR-6: Estimation relationship — display-only
`mes_material_master` (estimation) is a separate table. The Item Master edit view shows estimation-relevant fields (density, waste_pct, cost) as reference but does NOT write to `mes_material_master`. These are already sourced from the same `fp_actualrmdata` data.

### ADR-7: Film Scrap cat_desc mapping
For Film Scrap items where `oracle_cat_desc` starts with `Film Scrap`, the TDS lookup uses `cat_desc = 'Film Scrap'` (both Item Master Film Scrap rows share the same TDS pool).

---

## Implementation Tasks

### TASK 1: Backend — `GET /items/resin-profile` endpoint

**File:** `server/routes/mes/master-data/items.js`  
**Insert:** After the existing `fp-averages` endpoint (after line ~143), before the `/:id` route.

**Endpoint:** `GET /items/resin-profile?cat_desc=HDPE`

**Query parameter:** `cat_desc` (required) — the `oracle_cat_desc` value from `mes_item_master`

**SQL logic:**

```sql
-- Step 1: Map cat_desc for Film Scrap variants
-- If cat_desc starts with 'Film Scrap', use 'Film Scrap' for TDS lookup
-- Otherwise use exact value

-- Step 2: Stock aggregates from fp_actualrmdata grouped by catlinedesc
WITH rm_agg AS (
  SELECT
    SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) AS total_stock_qty,
    SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END) AS total_stock_val,
    SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) AS total_order_qty,
    SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END) AS total_order_val
  FROM fp_actualrmdata
  WHERE catlinedesc = $1
),

-- Step 3: Price weighted averages (same logic as existing rm_prices CTE)
rm_prices AS (
  SELECT
    CASE WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
      THEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
           / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
      ELSE NULL END AS stock_price_wa,
    CASE WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
      THEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
           / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
      ELSE NULL END AS on_order_price_wa,
    CASE WHEN (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) +
               SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)) > 0
      THEN (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END) +
            SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END))
           / (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) +
              SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END))
      ELSE NULL END AS combined_price_wa
  FROM fp_actualrmdata
  WHERE catlinedesc = $1
),

-- Step 4: Density weighted average from RM (uses weights field = g/cm³)
rm_density AS (
  SELECT
    CASE WHEN SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
      THEN SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN weights::numeric * mainitemstock ELSE 0 END)
           / SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN mainitemstock ELSE 0 END)
      ELSE NULL END AS density_wa_gcm3
  FROM fp_actualrmdata
  WHERE catlinedesc = $1
),

-- Step 5: TDS parameter weighted averages
-- Join mes_material_tds to fp_actualrmdata via oracle_item_code = mainitem
-- Weight = mainitemstock (stock-weighted). Fallback to simple AVG if no stock.
-- $2 = tds_cat_desc (mapped from $1, handling Film Scrap variants)
tds_params AS (
  SELECT
    COUNT(DISTINCT t.id) AS tds_grade_count,
    -- For each TECH_PARAM_CONFIG field, compute stock-weighted avg
    -- Pattern: CASE WHEN total_stock > 0 THEN weighted_sum / total_stock ELSE simple_avg END
    
    -- mfr_190_2_16
    CASE WHEN SUM(CASE WHEN t.mfr_190_2_16 IS NOT NULL AND r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END) > 0
      THEN ROUND((SUM(CASE WHEN t.mfr_190_2_16 IS NOT NULL AND r.mainitemstock > 0 THEN t.mfr_190_2_16 * r.mainitemstock ELSE 0 END)
                  / SUM(CASE WHEN t.mfr_190_2_16 IS NOT NULL AND r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END))::numeric, 4)
      ELSE ROUND((SELECT AVG(t2.mfr_190_2_16) FROM mes_material_tds t2 WHERE t2.cat_desc = $2 AND t2.category = 'Resins' AND t2.mfr_190_2_16 IS NOT NULL)::numeric, 4)
    END AS mfr_190_2_16_wa,

    -- REPEAT for each of the 14 TECH_PARAM_CONFIG fields:
    -- mfr_190_5_0, hlmi_190_21_6, mfr_230_2_16_pp, melt_flow_ratio,
    -- density (÷1000 for g/cm³), crystalline_melting_point, vicat_softening_point,
    -- heat_deflection_temp, tensile_strength_break, elongation_break,
    -- brittleness_temp, bulk_density (÷1000 for g/cm³), flexural_modulus
    
    -- (Same CASE pattern as mfr_190_2_16 above, just changing the column name)
    -- For density and bulk_density: divide by 1000.0 to convert kg/m³ → g/cm³

  FROM mes_material_tds t
  LEFT JOIN fp_actualrmdata r ON r.mainitem = t.oracle_item_code
  WHERE t.cat_desc = $2 AND t.category = 'Resins'
),

-- Step 6: Individual grade list for the item selector
grade_list AS (
  SELECT
    t.id AS tds_id,
    t.oracle_item_code,
    t.brand_grade,
    t.cat_desc,
    s.name AS supplier_name,
    COALESCE(SUM(r.mainitemstock), 0) AS stock_qty,
    COALESCE(SUM(r.pendingorderqty), 0) AS order_qty
  FROM mes_material_tds t
  LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
  LEFT JOIN fp_actualrmdata r ON r.mainitem = t.oracle_item_code
  WHERE t.cat_desc = $2 AND t.category = 'Resins'
  GROUP BY t.id, t.oracle_item_code, t.brand_grade, t.cat_desc, s.name
  ORDER BY stock_qty DESC, t.brand_grade
)

SELECT
  ra.total_stock_qty, ra.total_stock_val, ra.total_order_qty, ra.total_order_val,
  rp.stock_price_wa, rp.on_order_price_wa, rp.combined_price_wa,
  rd.density_wa_gcm3,
  tp.*,
  (SELECT json_agg(row_to_json(gl)) FROM grade_list gl) AS grades
FROM rm_agg ra, rm_prices rp, rm_density rd, tds_params tp;
```

**Parameters:**
- `$1` = `cat_desc` from query string (the `oracle_cat_desc` value)
- `$2` = mapped TDS cat_desc: if `$1` starts with `'Film Scrap'` → `'Film Scrap'`, else `$1`

**Response shape:**

```json
{
  "success": true,
  "data": {
    "inventory": {
      "total_stock_qty": 266075,
      "total_stock_val": 999881.23,
      "total_order_qty": 247500,
      "total_order_val": 955350.00
    },
    "pricing": {
      "stock_price_wa": 3.7612,
      "on_order_price_wa": 3.8100,
      "combined_price_wa": 3.7843
    },
    "density_wa": 0.9520,
    "tds_grade_count": 7,
    "tds_params": {
      "mfr_190_2_16": 0.2643,
      "mfr_190_5_0": null,
      "hlmi_190_21_6": null,
      "mfr_230_2_16_pp": null,
      "melt_flow_ratio": null,
      "density": 0.9531,
      "crystalline_melting_point": 130.4286,
      "vicat_softening_point": 127.8571,
      "heat_deflection_temp": null,
      "tensile_strength_break": null,
      "elongation_break": null,
      "brittleness_temp": null,
      "bulk_density": null,
      "flexural_modulus": null
    },
    "grades": [
      {
        "tds_id": 4,
        "oracle_item_code": "BXXOTLDHDFB5600",
        "brand_grade": "HDPE FB 5600",
        "supplier_name": "SABIC",
        "stock_qty": 230311,
        "order_qty": 74250
      }
    ]
  }
}
```

**Implementation details:**

1. Add the route handler at line ~143 in `items.js` (after fp-averages, before /:id)
2. Use `authenticate` middleware (same as existing routes)
3. The 14 TDS param fields to aggregate (from TECH_PARAM_CONFIG):
   - `mfr_190_2_16` — g/10min, no conversion
   - `mfr_190_5_0` — g/10min, no conversion
   - `hlmi_190_21_6` — g/10min, no conversion
   - `mfr_230_2_16_pp` — g/10min, no conversion
   - `melt_flow_ratio` — ratio, no conversion
   - `density` — **÷ 1000.0** to get g/cm³
   - `crystalline_melting_point` — °C, no conversion
   - `vicat_softening_point` — °C, no conversion
   - `heat_deflection_temp` — °C, no conversion
   - `tensile_strength_break` — MPa, no conversion
   - `elongation_break` — %, no conversion
   - `brittleness_temp` — °C, no conversion
   - `bulk_density` — **÷ 1000.0** to get g/cm³
   - `flexural_modulus` — MPa, no conversion
4. All numeric results ROUNDed to 4 decimal places
5. Film Scrap mapping: `const tdsCatDesc = catDesc.startsWith('Film Scrap') ? 'Film Scrap' : catDesc;`
6. Validate `cat_desc` is non-empty, return 400 if missing

**Exact code to write (Codex: copy this):**

```javascript
// ─── GET /items/resin-profile — Full resin category profile with WA prices, stock, TDS params ──
router.get('/items/resin-profile', authenticate, async (req, res) => {
  const { cat_desc } = req.query;
  if (!cat_desc) return res.status(400).json({ success: false, error: 'cat_desc required' });

  // Film Scrap variants in Item Master map to single TDS cat_desc
  const tdsCatDesc = cat_desc.startsWith('Film Scrap') ? 'Film Scrap' : cat_desc;

  try {
    // --- Inventory & Price aggregates from fp_actualrmdata ---
    const invResult = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS total_stock_qty,
        COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS total_stock_val,
        COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS total_order_qty,
        COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS total_order_val,
        CASE WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
          THEN ROUND((SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
                      / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END))::numeric, 4)
          ELSE NULL END AS stock_price_wa,
        CASE WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
          THEN ROUND((SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
                      / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END))::numeric, 4)
          ELSE NULL END AS on_order_price_wa,
        CASE WHEN (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) +
                   SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)) > 0
          THEN ROUND((
            (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END) +
             SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END))
            / (SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) +
               SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END))
          )::numeric, 4)
          ELSE NULL END AS combined_price_wa,
        CASE WHEN SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
          THEN ROUND((SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN weights::numeric * mainitemstock ELSE 0 END)
                      / SUM(CASE WHEN weights::numeric > 0 AND mainitemstock > 0 THEN mainitemstock ELSE 0 END))::numeric, 4)
          ELSE NULL END AS density_wa
      FROM fp_actualrmdata
      WHERE catlinedesc = $1
    `, [cat_desc]);

    // --- TDS parameter weighted averages ---
    const TDS_FIELDS = [
      { col: 'mfr_190_2_16', divisor: 1 },
      { col: 'mfr_190_5_0', divisor: 1 },
      { col: 'hlmi_190_21_6', divisor: 1 },
      { col: 'mfr_230_2_16_pp', divisor: 1 },
      { col: 'melt_flow_ratio', divisor: 1 },
      { col: 'density', divisor: 1000 },
      { col: 'crystalline_melting_point', divisor: 1 },
      { col: 'vicat_softening_point', divisor: 1 },
      { col: 'heat_deflection_temp', divisor: 1 },
      { col: 'tensile_strength_break', divisor: 1 },
      { col: 'elongation_break', divisor: 1 },
      { col: 'brittleness_temp', divisor: 1 },
      { col: 'bulk_density', divisor: 1000 },
      { col: 'flexural_modulus', divisor: 1 },
    ];

    const tdsSelects = TDS_FIELDS.map(f => {
      const expr = f.divisor === 1 ? `t.${f.col}` : `t.${f.col} / ${f.divisor}.0`;
      return `
        CASE WHEN SUM(CASE WHEN t.${f.col} IS NOT NULL AND r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END) > 0
          THEN ROUND((SUM(CASE WHEN t.${f.col} IS NOT NULL AND r.mainitemstock > 0 THEN (${expr}) * r.mainitemstock ELSE 0 END)
                      / SUM(CASE WHEN t.${f.col} IS NOT NULL AND r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END))::numeric, 4)
          ELSE (SELECT ROUND(AVG(t2.${f.col}${f.divisor === 1 ? '' : ` / ${f.divisor}.0`})::numeric, 4)
                FROM mes_material_tds t2 WHERE t2.cat_desc = $1 AND t2.category = 'Resins' AND t2.${f.col} IS NOT NULL)
        END AS ${f.col}_wa`;
    }).join(',\n');

    const tdsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT t.id) AS tds_grade_count,
        ${tdsSelects}
      FROM mes_material_tds t
      LEFT JOIN fp_actualrmdata r ON r.mainitem = t.oracle_item_code
      WHERE t.cat_desc = $1 AND t.category = 'Resins'
    `, [tdsCatDesc]);

    // --- Grade list ---
    const gradeResult = await pool.query(`
      SELECT
        t.id AS tds_id,
        t.oracle_item_code,
        t.brand_grade,
        t.cat_desc,
        s.name AS supplier_name,
        COALESCE(SUM(r.mainitemstock), 0)::numeric AS stock_qty,
        COALESCE(SUM(r.pendingorderqty), 0)::numeric AS order_qty
      FROM mes_material_tds t
      LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
      LEFT JOIN fp_actualrmdata r ON r.mainitem = t.oracle_item_code
      WHERE t.cat_desc = $1 AND t.category = 'Resins'
      GROUP BY t.id, t.oracle_item_code, t.brand_grade, t.cat_desc, s.name
      ORDER BY stock_qty DESC, t.brand_grade
    `, [tdsCatDesc]);

    const inv = invResult.rows[0] || {};
    const tds = tdsResult.rows[0] || {};

    // Build tds_params object from _wa suffixed columns
    const tdsParams = {};
    for (const f of TDS_FIELDS) {
      tdsParams[f.col] = tds[`${f.col}_wa`] != null ? Number(tds[`${f.col}_wa`]) : null;
    }

    res.json({
      success: true,
      data: {
        inventory: {
          total_stock_qty: Number(inv.total_stock_qty) || 0,
          total_stock_val: Number(inv.total_stock_val) || 0,
          total_order_qty: Number(inv.total_order_qty) || 0,
          total_order_val: Number(inv.total_order_val) || 0,
        },
        pricing: {
          stock_price_wa: inv.stock_price_wa != null ? Number(inv.stock_price_wa) : null,
          on_order_price_wa: inv.on_order_price_wa != null ? Number(inv.on_order_price_wa) : null,
          combined_price_wa: inv.combined_price_wa != null ? Number(inv.combined_price_wa) : null,
        },
        density_wa: inv.density_wa != null ? Number(inv.density_wa) : null,
        tds_grade_count: Number(tds.tds_grade_count) || 0,
        tds_params: tdsParams,
        grades: gradeResult.rows,
      },
    });
  } catch (err) {
    logger.error('GET /items/resin-profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch resin profile' });
  }
});
```

**Insert position:** After the closing `});` of `GET /items/fp-averages` (line ~143), before `GET /items/:id`.

---

### TASK 2: Frontend — Fetch resin profile on edit

**File:** `src/components/MES/MasterData/ItemMaster.jsx`

**What to add:**
1. New state: `const [resinProfile, setResinProfile] = useState(null);`
2. New state: `const [resinProfileLoading, setResinProfileLoading] = useState(false);`
3. Fetch function: when opening edit modal for a Resin item, call `GET /api/mes/master-data/items/resin-profile?cat_desc={oracle_cat_desc}`

**Where:** Near the existing `fetchFpAverages` logic (around line 143-175).

**Exact logic:**

```javascript
const fetchResinProfile = useCallback(async (catDesc) => {
  if (!catDesc) return;
  setResinProfileLoading(true);
  try {
    const res = await axios.get(
      `${API_BASE}/api/mes/master-data/items/resin-profile?cat_desc=${encodeURIComponent(catDesc)}`,
      authHeaders
    );
    if (res.data.success) {
      setResinProfile(res.data.data);
    }
  } catch {
    // Silent — profile is enhancement, not blocking
  } finally {
    setResinProfileLoading(false);
  }
}, [token]);
```

**Call it** in the edit button handler, same place where `fetchFpAverages` is called (when `category === 'Resins'`):

```javascript
// Existing: fetchFpAverages(catDesc);
// Add alongside:
fetchResinProfile(catDesc);
```

**Clear on modal close:**

```javascript
setResinProfile(null);
```

---

### TASK 3: Frontend — Restructure Resin Edit Modal Tabs

**File:** `src/components/MES/MasterData/ItemMaster.jsx`

**Current tabs for Resin:** General, Physical, Costing, Processing, MRP  
**New tabs for Resin:** General, Inventory & Grades, Pricing, Material Specs, MRP

#### Tab 1: General (keep as-is)
No changes. Oracle ERP reference block + waste_pct field.

#### Tab 2: Inventory & Grades (NEW — replaces Physical)

Content:
```jsx
<Spin spinning={resinProfileLoading}>
  {/* KPI Row — matching RM Dashboard style */}
  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
    {[
      { label: 'Total Stock Qty',    value: resinProfile?.inventory?.total_stock_qty,  fmt: 'qty',   color: '#1d39c4' },
      { label: 'Stock Value',        value: resinProfile?.inventory?.total_stock_val,  fmt: 'currency', color: '#389e0d' },
      { label: 'On Order Qty',       value: resinProfile?.inventory?.total_order_qty,  fmt: 'qty',   color: '#d46b08' },
      { label: 'Order Value',        value: resinProfile?.inventory?.total_order_val,  fmt: 'currency', color: '#d46b08' },
      { label: 'Wtd Avg Density',    value: resinProfile?.density_wa,                  fmt: 'dec4',  color: '#722ed1', unit: 'g/cm³' },
    ].map(kpi => (
      <Col span={kpi.span || 4} key={kpi.label}>
        <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>{kpi.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
            {kpi.value != null ? (
              kpi.fmt === 'qty' ? Number(kpi.value).toLocaleString() :
              kpi.fmt === 'currency' ? renderCurrency(kpi.value) :
              Number(kpi.value).toFixed(4)
            ) : '—'}
          </div>
          {kpi.unit && <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{kpi.unit}</div>}
        </div>
      </Col>
    ))}
  </Row>

  {/* Grade List — read-only reference */}
  <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
    Grades ({resinProfile?.tds_grade_count ?? 0} in TDS)
  </Text>
  <Table
    dataSource={resinProfile?.grades || []}
    rowKey="tds_id"
    size="small"
    pagination={false}
    scroll={{ y: 200 }}
    columns={[
      { title: 'Grade', dataIndex: 'brand_grade', width: 200 },
      { title: 'Supplier', dataIndex: 'supplier_name', width: 120 },
      { title: 'Oracle Code', dataIndex: 'oracle_item_code', width: 180, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
      { title: 'Stock Qty', dataIndex: 'stock_qty', width: 100, align: 'right', render: v => Number(v).toLocaleString() },
      { title: 'Order Qty', dataIndex: 'order_qty', width: 100, align: 'right', render: v => Number(v).toLocaleString() },
    ]}
  />

  {/* Preserve hidden form fields for physical values */}
  <Form.Item name="density_g_cm3" hidden><InputNumber /></Form.Item>
  <Form.Item name="micron_thickness" hidden><InputNumber /></Form.Item>
  <Form.Item name="width_mm" hidden><InputNumber /></Form.Item>
  <Form.Item name="solid_pct" hidden><InputNumber /></Form.Item>
</Spin>
```

#### Tab 3: Pricing (restructured Costing)

Content:
```jsx
<Spin spinning={resinProfileLoading}>
  {/* Price WA cards — 3 across */}
  <Row gutter={16} style={{ marginBottom: 16 }}>
    <Col span={8}>
      <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Stock Price (WA) — Oracle</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#389e0d' }}>
          {renderCurrency(resinProfile?.pricing?.stock_price_wa)}
        </div>
      </div>
    </Col>
    <Col span={8}>
      <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>On Order (WA) — Oracle</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#d46b08' }}>
          {renderCurrency(resinProfile?.pricing?.on_order_price_wa)}
        </div>
      </div>
    </Col>
    <Col span={8}>
      <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Combined (WA)</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1d39c4' }}>
          {renderCurrency(resinProfile?.pricing?.combined_price_wa)}
        </div>
      </div>
    </Col>
  </Row>

  {/* Editable market price */}
  <Row gutter={16}>
    <Col span={8}>
      <Form.Item name="market_ref_price" label="Market Price (user-set)">
        <InputNumber min={0} step={0.01} prefix={currencyPrefix} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col span={8}>
      <Form.Item name="market_price_date" label="Market Price Date">
        <Input type="date" />
      </Form.Item>
    </Col>
  </Row>

  {/* Other price fields */}
  <Row gutter={16}>
    <Col span={6}>
      <Form.Item name="price_control" label="Price Control" initialValue="MAP">
        <Select options={PRICE_CONTROLS} />
      </Form.Item>
    </Col>
    <Col span={6}>
      <Form.Item name="map_price" label="MAP Price">
        <InputNumber min={0} step={0.01} prefix={currencyPrefix} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col span={6}>
      <Form.Item name="standard_price" label="Standard Price">
        <InputNumber min={0} step={0.01} prefix={currencyPrefix} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col span={6}>
      <Form.Item name="last_po_price" label="Last PO Price">
        <InputNumber min={0} step={0.01} prefix={currencyPrefix} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
  </Row>

  {/* Hidden Oracle price fields for form submission */}
  <Form.Item name="stock_price" hidden><InputNumber /></Form.Item>
  <Form.Item name="on_order_price" hidden><InputNumber /></Form.Item>
</Spin>
```

#### Tab 4: Material Specs (replaces Processing)

This tab shows ALL 14 TECH_PARAM_CONFIG parameters as read-only weighted-average cards. When TDS data is not yet filled, cards show `—`.

```jsx
// Define the config at component top level (or import from a shared constants file)
const RESIN_SPEC_PARAMS = [
  { key: 'mfr_190_2_16',          label: 'MFR (190°C/2.16kg)',  unit: 'g/10min' },
  { key: 'mfr_190_5_0',           label: 'MFR (190°C/5.0kg)',   unit: 'g/10min' },
  { key: 'hlmi_190_21_6',         label: 'HLMI (190°C/21.6kg)', unit: 'g/10min' },
  { key: 'mfr_230_2_16_pp',       label: 'MFR (230°C/2.16kg)',  unit: 'g/10min' },
  { key: 'melt_flow_ratio',       label: 'Melt Flow Ratio',     unit: '—' },
  { key: 'density',               label: 'Density (TDS)',        unit: 'g/cm³' },
  { key: 'crystalline_melting_point', label: 'Melting Point',    unit: '°C' },
  { key: 'vicat_softening_point', label: 'Vicat Softening',     unit: '°C' },
  { key: 'heat_deflection_temp',  label: 'Heat Deflection',     unit: '°C' },
  { key: 'tensile_strength_break',label: 'Tensile Strength',    unit: 'MPa' },
  { key: 'elongation_break',      label: 'Elongation Break',    unit: '%' },
  { key: 'brittleness_temp',      label: 'Brittleness Temp',    unit: '°C' },
  { key: 'bulk_density',          label: 'Bulk Density',         unit: 'g/cm³' },
  { key: 'flexural_modulus',      label: 'Flexural Modulus',     unit: 'MPa' },
];
```

Tab content:
```jsx
<Spin spinning={resinProfileLoading}>
  <Text type="secondary" style={{ fontSize: 11, marginBottom: 12, display: 'block' }}>
    Stock-weighted averages across {resinProfile?.tds_grade_count ?? 0} TDS grade(s).
    Parameters with no TDS data yet show —
  </Text>
  <Row gutter={[12, 12]}>
    {RESIN_SPEC_PARAMS.map(p => {
      const val = resinProfile?.tds_params?.[p.key];
      return (
        <Col xs={12} md={8} lg={6} key={p.key}>
          <div style={{
            background: val != null ? '#f6f8ff' : '#fafafa',
            border: `1px solid ${val != null ? '#d6e4ff' : '#f0f0f0'}`,
            borderRadius: 8, padding: '10px 12px', textAlign: 'center', minHeight: 80,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4, lineHeight: 1.2 }}>{p.label}</div>
            <div style={{
              fontSize: val != null ? 20 : 16,
              fontWeight: 700,
              color: val != null ? '#1d39c4' : '#d9d9d9',
              lineHeight: 1, fontFamily: 'monospace',
            }}>
              {val != null ? Number(val).toFixed(p.key.includes('density') || p.key.includes('bulk') ? 4 : 2) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{p.unit}</div>
          </div>
        </Col>
      );
    })}
  </Row>

  {/* Legacy fields hidden for form submission backward compat */}
  <Form.Item name="mfi" hidden><InputNumber /></Form.Item>
  <Form.Item name="cof" hidden><InputNumber /></Form.Item>
  <Form.Item name="sealing_temp_min" hidden><InputNumber /></Form.Item>
  <Form.Item name="sealing_temp_max" hidden><InputNumber /></Form.Item>
</Spin>
```

#### Tab 5: MRP (keep as-is)
No changes.

---

### TASK 4: Frontend — Update Expanded Row

**File:** `src/components/MES/MasterData/ItemMaster.jsx`  
**Location:** `expandedRowRender` function (lines 253-262)

**Current:** Shows price_control, map_price, standard_price, market_ref_price, last_po_price, waste_pct

**New for Resins:** Show stock_price (WA), on_order_price (WA), combined (computed), market_ref_price, waste_pct, density (from weights/WA)

**Change:** Make expandedRowRender category-aware:

```jsx
const expandedRowRender = (record) => {
  if (record.category === 'Resins') {
    const combinedQty = (Number(record.stock_qty) || 0) + (Number(record.order_qty) || 0);
    const combinedVal = (Number(record.stock_price) || 0) * (Number(record.stock_qty) || 0)
                      + (Number(record.on_order_price) || 0) * (Number(record.order_qty) || 0);
    const combinedWa = combinedQty > 0 ? combinedVal / combinedQty : null;
    return (
      <Row gutter={24} style={{ padding: '8px 0' }}>
        <Col span={4}><Text type="secondary">Stock WA:</Text> {renderCurrency(record.stock_price, 4)}</Col>
        <Col span={4}><Text type="secondary">On Order WA:</Text> {renderCurrency(record.on_order_price, 4)}</Col>
        <Col span={4}><Text type="secondary">Combined WA:</Text> {renderCurrency(combinedWa, 4)}</Col>
        <Col span={4}><Text type="secondary">Market Ref:</Text> {renderCurrency(record.market_ref_price, 4)}</Col>
        <Col span={4}><Text type="secondary">Waste %:</Text> {record.waste_pct ?? 3}%</Col>
        <Col span={4}><Text type="secondary">Density:</Text> {record.density_g_cm3 ? `${record.density_g_cm3} g/cm³` : '—'}</Col>
      </Row>
    );
  }
  // Non-resin: keep existing layout
  return (
    <Row gutter={24} style={{ padding: '8px 0' }}>
      <Col span={4}><Text type="secondary">Price Control:</Text> {record.price_control}</Col>
      <Col span={4}><Text type="secondary">MAP:</Text> {renderCurrency(record.map_price, 4)}</Col>
      <Col span={4}><Text type="secondary">Standard:</Text> {renderCurrency(record.standard_price, 4)}</Col>
      <Col span={4}><Text type="secondary">Market Ref:</Text> {renderCurrency(record.market_ref_price, 4)}</Col>
      <Col span={4}><Text type="secondary">Last PO:</Text> {renderCurrency(record.last_po_price, 4)}</Col>
      <Col span={4}><Text type="secondary">Waste %:</Text> {record.waste_pct ?? 3}%</Col>
    </Row>
  );
};
```

**Note:** `record.stock_price` and `record.on_order_price` are already live WA values from the `rm_prices` CTE in the GET /items list query. The expanded row does NOT need a separate API call.

---

### TASK 5: Tab array restructure

**File:** `src/components/MES/MasterData/ItemMaster.jsx`  
**Location:** The `<Tabs items={[...]}` array inside the edit modal (starting around line ~440)

**Change:** For Resin items, the tab array becomes:

```javascript
// Replace the conditional spread for Processing tab and restructure Resin tabs
...(isResin ? [
  { key: 'general',   label: 'General',            children: /* existing Resin General content */ },
  { key: 'inventory', label: 'Inventory & Grades',  children: /* TASK 3 Tab 2 content */ },
  { key: 'pricing',   label: 'Pricing',             children: /* TASK 3 Tab 3 content */ },
  { key: 'specs',     label: 'Material Specs',      children: /* TASK 3 Tab 4 content */ },
  { key: 'mrp',       label: 'MRP',                 children: /* existing MRP content */ },
] : [
  { key: 'general',  label: 'General',   children: /* existing non-Resin General */ },
  { key: 'physical', label: 'Physical',  children: /* existing non-Resin Physical */ },
  { key: 'costing',  label: 'Costing',   children: /* existing non-Resin Costing */ },
  { key: 'mrp',      label: 'MRP',       children: /* existing MRP content */ },
])
```

**Key points:**
- Non-Resin items keep their current 4-tab layout (General, Physical, Costing, MRP) — NO changes
- Resin items get the new 5-tab layout
- The Processing tab is removed entirely for Resins (legacy mfi/cof/sealing fields kept as hidden form fields in Material Specs tab)

---

## File Change Summary

| File | Action | Lines Affected |
|---|---|---|
| `server/routes/mes/master-data/items.js` | Add `resin-profile` endpoint | Insert ~100 lines after line 143 |
| `src/components/MES/MasterData/ItemMaster.jsx` | Add states, fetch function, restructure tabs | Modify lines 50-55 (states), 143-175 (fetch), 253-262 (expanded row), 440-700 (tabs) |

**No new files created. No migrations needed. No schema changes.**

---

## Null/Empty Handling Rules (Critical for Codex)

1. **TDS params all NULL** — Material Specs tab shows all `—` cards with grey styling. No errors.
2. **No fp_actualrmdata rows** — Inventory shows 0/0/0/0, pricing shows null → `—`. Grade list shows 0 stock.
3. **Partial TDS fill** — Only populated parameters show values. NULL ones show `—`.
4. **Film Scrap mapping** — `cat_desc.startsWith('Film Scrap')` → use `'Film Scrap'` for TDS query.
5. **No TDS records at all** — `tds_grade_count = 0`, all params null, grades array empty. Tabs still render.

---

## Verification Checklist (Opus post-implementation)

1. **Backend endpoint test:** `GET /api/mes/master-data/items/resin-profile?cat_desc=HDPE` returns valid JSON with all sections
2. **NULL safety:** `GET /api/mes/master-data/items/resin-profile?cat_desc=Random%20PP` — most strict params should be null, no crash
3. **Film Scrap:** `GET /api/mes/master-data/items/resin-profile?cat_desc=Film%20Scrap%20%2F%20Regrind%20Clear` — maps to Film Scrap TDS records
4. **Missing cat_desc:** `GET /api/mes/master-data/items/resin-profile` returns 400
5. **UI renders:** Open HDPE-20 edit → 5 tabs visible, KPI cards show values, grade list has 7 rows
6. **UI null state:** Open Random PP edit → Material Specs shows mostly `—` cards
7. **Expanded row:** HDPE-20 expanded row shows Stock WA, On Order WA, Combined WA, Market Ref, Waste %, Density
8. **Non-resin unaffected:** Open any Films/Adhesives item → old 4-tab layout unchanged
9. **No console errors:** Browser devtools clean on all resin edit operations
10. **Form save works:** Edit waste_pct on HDPE-20 → Save → value persists
11. **Density units:** Material Specs density card shows g/cm³ (not kg/m³)
12. **Price format:** All currency values use CurrencyContext formatting (AED, not $ or ฿)

---

## Delivery Sequence

1. **TASK 1** — Backend endpoint (can be tested independently with curl/browser)
2. **TASK 2** — Frontend state + fetch (no visual change yet)
3. **TASK 3 + 5** — Tab restructure (visual change — main deliverable)
4. **TASK 4** — Expanded row update (polish)
5. **Opus verification** — Run all 12 checklist items
