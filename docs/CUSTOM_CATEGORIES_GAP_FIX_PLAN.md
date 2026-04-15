# Custom Categories — Gap Fix Implementation Plan

> **Created:** 2026-04-15
> **Purpose:** Fix all regressions and missing features from the April 10-14 session.
> **Files to modify:** `server/routes/mes/master-data/items.js`, `src/components/MES/MasterData/CustomCategories.jsx`
> **Pre-read:** `docs/CUSTOM_ITEM_CATEGORIES_PLAN.md`, this file, and `AGENT.md`

---

## Context for Implementing Agents

The Custom Categories module presents a **3-level hierarchy**: Category → Category Groups (catlinedesc) → Item Groups (itemgroup). The two main files are:

- **Backend:** `server/routes/mes/master-data/items.js` (~3650 lines) — all `/api/mes/master-data/items/...` endpoints
- **Frontend:** `src/components/MES/MasterData/CustomCategories.jsx` (~2450 lines) — React component with two-panel layout + fullscreen detail modal

The UI has:
- **Top bar:** Category pill buttons + global search
- **Left panel:** Category Groups list (styled divs)
- **Right panel:** Item Groups table
- **Detail modal:** 3 tabs — Overview, MRP, Substrate Profile (currently gated to non-resin only)

---

## Sprint 1 — Sorting: Alphabetical A→Z

### Problem
Session decided Phase 14: all lists sort alphabetically. Currently:
- Category Groups (left sidebar): no frontend sort, backend returns `stock_qty DESC`
- Item Groups (right table): frontend sorts `stock_qty DESC` (line ~451)
- Item group detail items: backend sorts `stock_qty DESC`
- Category group detail items: backend sorts `stock_qty DESC`

### Backend Changes — `server/routes/mes/master-data/items.js`

**1a. Profile aggregate query (~line 1988)**
The `supportsOverrides` branch `aggQuery` ends with:
```sql
ORDER BY stock_qty DESC
```
Change to:
```sql
ORDER BY g.catlinedesc ASC
```
The fallback (non-overrides) branch ends with:
```sql
ORDER BY stock_qty DESC
```
Change to:
```sql
ORDER BY TRIM(catlinedesc) ASC
```

**1b. Profile item-group query (~line 2030)**
Both branches end with `ORDER BY g.catlinedesc, stock_qty DESC` or `ORDER BY TRIM(catlinedesc), stock_qty DESC`.
Change the second sort key:
```sql
ORDER BY g.catlinedesc ASC, TRIM(r.itemgroup) ASC
-- and
ORDER BY TRIM(catlinedesc) ASC, TRIM(itemgroup) ASC
```

**1c. Item-group detail query (~line 2530)** — items within an item group.
Find `ORDER BY stock_qty DESC` and change to:
```sql
ORDER BY mainitem ASC
```

**1d. Category-group detail query (~line 2830)** — items within a category group.
Find `ORDER BY stock_qty DESC` and change to:
```sql
ORDER BY mainitem ASC
```

### Frontend Changes — `CustomCategories.jsx`

**1e. Item Groups sort memo (~line 451)**
Current:
```js
return [...rows].sort((a, b) => {
  const stockA = Number(a?.stock_qty) || 0;
  const stockB = Number(b?.stock_qty) || 0;
  return stockB - stockA;
});
```
Change to:
```js
return [...rows].sort((a, b) =>
  String(a?.itemgroup || '').localeCompare(String(b?.itemgroup || ''))
);
```

---

## Sprint 2 — Unmapped Items Restoration

### Problem
Session Phase 15 added per-category unmapped item counts with hover tooltip. Currently missing from both backend and frontend.

### Backend Changes — `server/routes/mes/master-data/items.js`

**2a. `GET /items/custom-categories` endpoint (~line 1584)**
After the existing category query that computes `item_count` and `item_group_count`, add a second query that computes unmapped items per category. An item is **unmapped** if it exists in `fp_actualrmdata` for the category's `catlinedesc` values but has no matching row in `mes_item_master`.

Add this SQL after the main categories query:
```sql
-- For each category, count items in fp_actualrmdata that have no mes_item_master row
WITH cat_items AS (
  SELECT
    g.category_id,
    LOWER(TRIM(r.mainitem)) AS item_key,
    r.maindescription
  FROM mes_item_category_groups g
  JOIN fp_actualrmdata r ON TRIM(r.catlinedesc) = TRIM(g.catlinedesc)
  WHERE g.is_active = true
),
mapped AS (
  SELECT LOWER(TRIM(item_code)) AS item_key
  FROM mes_item_master
  WHERE is_active = true
)
SELECT
  ci.category_id,
  COUNT(DISTINCT ci.item_key) FILTER (WHERE m.item_key IS NULL) AS unmapped_item_count,
  ARRAY_AGG(DISTINCT ci.item_key) FILTER (WHERE m.item_key IS NULL) AS unmapped_items
FROM cat_items ci
LEFT JOIN mapped m ON m.item_key = ci.item_key
GROUP BY ci.category_id
```

Merge the counts into each category in the response. Return:
- `unmapped_item_count` (integer)
- `unmapped_items` (array of first 20 item keys, for hover preview)
- `unmapped_overflow_count` (integer — how many more beyond the 20 shown)

### Frontend Changes — `CustomCategories.jsx`

**2b. Category pill badges (~line 1385–1393)**
Below each category pill button, add a compact line showing unmapped count. Render:
- If `unmapped_item_count === 0`: green text `✓ all mapped`
- If `unmapped_item_count > 0`: red text `{count} unmapped` with `Tooltip` showing the first 20 item keys on hover

Style: `fontSize: 10, marginTop: -2`

---

## Sprint 3 — Price Columns in Item Groups Table

### Problem
Session Phase 13 decided: remove "Mapped Items" column, add 4 price columns. Currently the right-panel Item Groups table shows: Item Group, Mapped Items, Stock Qty, Order Qty, Total Qty, Action — no prices.

### Frontend Changes — `CustomCategories.jsx`

**3a. Item Groups table columns (~line 1618–1681)**
Replace the current 6-column definition with:

| Column | dataIndex | Width | Align | Format |
|--------|-----------|-------|-------|--------|
| Item Group | `itemgroup` | flex | left | Bold text, clickable |
| Stock Qty | `stock_qty` | 100 | right | `fmtQty` |
| Order Qty | `order_qty` | 100 | right | `fmtQty` |
| Stock Price (WA) | `stock_price_wa` | 120 | right | currency 4 decimals, green |
| On Order (WA) | `on_order_price_wa` | 120 | right | currency 4 decimals, orange |
| Weighted Avg | `avg_price_wa` | 120 | right | currency 4 decimals, blue |
| Market Price | `market_price_wa` | 120 | right | currency 4 decimals, purple |

Remove the `Mapped Items`, `Total Qty`, and `Action` columns. Make the Item Group name clickable (calls `openItemGroup`) instead of a separate Edit button.

**Note:** The data is already available. The backend profile endpoint returns `stock_price_wa`, `on_order_price_wa`, `avg_price_wa`, `market_price_wa` per item group. The `computePrices` helper computes these from stock/order quantities and values. Verify that the `item_groups` array in the profile response includes these fields — they are computed in the backend `computePrices()` function (~line 2138) and spread into each item group entry.

---

## Sprint 4 — MAP/STD/PD Cleanup from Substrate Profile Tab

### Problem
Session Phase 10 declared: "ONLY 4 prices allowed everywhere." The Substrate Profile tab still shows: Price Ctrl (MAP/STD), MAP Price, Standard Price, Last PO, MRP Type (PD/ND/VB).

### Frontend Changes — `CustomCategories.jsx`

**4a. Remove from Substrate Profile tab (~lines 2270–2360)**
Delete these form fields entirely:
- `Price Ctrl` Select (MAP/STD) — line ~2271
- `MAP Price` InputNumber — line ~2327
- `Standard Price` InputNumber — line ~2336
- `Last PO` InputNumber — line ~2345

**Keep:**
- `Market Price` field (this is `market_ref_price`)
- `Market Date` field
- `MRP Type` (PD/ND/VB) — these are SAP MRP planning types, not price abbreviations, keep them
- `Reorder Pt`, `Safety Stock`, `Lead Days` — MRP planning fields, keep

**4b. Clean `SUBSTRATE_CONFIG_DEFAULTS` (~line 92)**
Remove:
```js
price_control: 'MAP',
map_price: null,
standard_price: null,
last_po_price: null,
```
Keep `market_ref_price`, `market_price_date`, `mrp_type`, etc.

**4c. Remove `PARAM_LABELS` constant (~lines 69–83)**
Dead code — no resin profile tab uses it. Delete entirely.

**4d. Remove `PROCUREMENT_OPTIONS` constant (~lines 52–55)**
Dead code — `procurement_type` field has no visible input. Delete entirely.

---

## Sprint 5 — Universal Material Profile Tab (All Categories)

### Problem
Session Phase 5 required the profile tab for ALL categories including resins. Currently gated by `isNonResinDrawer` — resins get NO profile tab.

### Frontend Changes — `CustomCategories.jsx`

**5a. Remove the `isNonResinDrawer` gate (~line 2103)**
Current code:
```jsx
...(isNonResinDrawer ? [
  {
    key: 'substrate-profile',
    label: 'Substrate Profile',
    children: ( ... )
  }
] : [])
```
Change to always include the tab:
```jsx
{
  key: 'material-profile',
  label: 'Material Profile',
  children: ( ... )
}
```

**5b. Update `fetchSubstrateProfile` guard (~line 921)**
The function currently checks `NON_RESIN_MATERIAL_CLASSES.has(...)` before fetching. Remove that guard so it fetches for resins too. The backend `/substrate-profile` endpoint needs to accept `resins` as a material class — see 5d.

**5c. Update `loadSubstrateConfig` guard (~line 951)**
Same — remove the `NON_RESIN_MATERIAL_CLASSES` check.

**5d. Backend: Add `resins` to `NON_RESIN_MATERIAL_CLASS_KEYS` (~line 16–23 in items.js)**
Current validation set:
```js
const NON_RESIN_MATERIAL_CLASS_KEYS = ['substrates', 'adhesives', 'chemicals', 'additives', 'coating', 'packing_materials', 'mounting_tapes'];
```
Add `'resins'` to this array. Or better yet, rename to `MATERIAL_CLASS_KEYS` since it's no longer "non-resin only":
```js
const MATERIAL_CLASS_KEYS = ['resins', 'substrates', 'adhesives', 'chemicals', 'additives', 'coating', 'packing_materials', 'mounting_tapes'];
```
Update all references in the file.

**5e. For resins specifically**, the profile tab should show resin TDS parameters (MFR, density, melting point, etc.) instead of the hardcoded physical property fields (thickness, width, yield). The physical property fields are currently hardcoded in the Substrate Profile section (~lines 2163–2249). To make this universal:

Option A (simpler): Conditionally render different physical property fields based on `material_class`:
- `resins`: Show density only (other params come from TDS/spec aggregation)
- `substrates`: density, thickness, width, yield, roll length, core diameter
- `adhesives`: density, solid%, viscosity
- Others: density + whatever `spec_params` return from the backend

Option B (schema-driven, recommended): Fetch the parameter list from `mes_parameter_definitions` for the material class and render fields dynamically. The backend already has `getParameterDefinitionsMap()` in items.js. Add a lightweight endpoint or include param definitions in the profile response.

**5f. Frontend: Rename `NON_RESIN_MATERIAL_CLASSES` set (~line 82)**
Since resins are now included, rename to `ALL_MATERIAL_CLASSES` or remove the set entirely since the gate is removed.

**5g. Remove dead `isNonResinDrawer` memo (~line 848)**
No longer needed after removing the gate.

---

## Sprint 6 — Additional Dead Code Cleanup

**6a. Remove `default_price` from `EMPTY_DETAIL_TOTALS` (~line 126)** and from `computePrices` in backend. It's computed but never displayed.

**6b. Remove unused `metrics` from detail-aggregates fetch (~line 1232)**. The backend returns a `metrics` array but the frontend never renders it. Either remove the fetch or add a display.

---

## Sprint 7 — Custom Category Groups CRUD (Deferred)

This was explicitly deferred ("tomorrow will continue") at session end. Implementation requires:

1. Apply migration `server/migrations/mes-master-041-item-group-overrides.js`
2. Add 3 CRUD endpoints to items.js:
   - `POST /items/custom-categories/:id/custom-group` — create a custom group
   - `PUT /items/custom-categories/:id/custom-group/:groupName/items` — assign items
   - `DELETE /items/custom-categories/:id/custom-group/:groupName` — delete custom group
3. UI: "Create Custom Group" button + item assignment modal in CustomCategories.jsx
4. The backend already reads overrides when `mes_item_group_overrides` table exists (conditional JOINs) — just needs write endpoints.

---

## Execution Order & Dependencies

```
Sprint 1 (Sorting)          — Independent, quick fix
Sprint 2 (Unmapped Items)   — Independent, backend + frontend
Sprint 3 (Price Columns)    — Independent, frontend only
Sprint 4 (MAP/STD Cleanup)  — Independent, frontend only
Sprint 5 (Material Profile) — Depends on Sprint 4 being done (avoids editing deleted code)
Sprint 6 (Dead Code)        — Do last, after all other sprints
Sprint 7 (Custom Groups)    — Independent, deferred
```

Sprints 1–4 can be done in parallel. Sprint 5 should follow Sprint 4. Sprint 6 last.

---

## Validation Checklist

After implementation, verify:

- [ ] Category Groups in left panel sort A→Z
- [ ] Item Groups in right table sort A→Z
- [ ] Items inside detail modal sort A→Z by item code
- [ ] Each category pill shows unmapped count (red if >0, green if 0)
- [ ] Hovering unmapped count shows item key list
- [ ] Right table has 4 price columns, no "Mapped Items" or "Total Qty"
- [ ] Item Group name is clickable to open detail
- [ ] No MAP, STD, PD price fields in Material Profile tab
- [ ] Material Profile tab appears for ALL categories including Resins
- [ ] Tab labeled "Material Profile" (not "Substrate Profile")
- [ ] Resins show their TDS parameters in the profile tab
- [ ] No `PARAM_LABELS` or `PROCUREMENT_OPTIONS` dead code
- [ ] Backend syntax passes `node --check server/routes/mes/master-data/items.js`
- [ ] `GET /custom-categories/1/profile` returns 200
- [ ] Frontend builds without errors: `npm run build`
