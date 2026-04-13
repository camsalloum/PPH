# Custom Item Categories — Revised Implementation Plan

> **Purpose:** Replace Item Master with a user-configurable 3-level hierarchy that mirrors Oracle's structure. Users create Categories, select which Category Groups (catlinedesc) belong to each, and within each group the Item Groups (itemgroup) are shown with their items, prices, stock, and parameters.
> **Created:** 2026-04-09 (revised from original plan)
> **Test case:** Resins only first, then extend to Substrates and all others.

## 2026-04-12 — Stabilization Update

### Completed in this session

1. Resolved runtime `GET /items/material-config` 500 for resin flows by repairing and executing `mes-master-040` migration.
2. Hardened `mes-master-040-universal-profile-configs` to be idempotent and self-bootstrapping:
  - creates `mes_material_profile_configs` if missing
  - re-applies relaxed material-class constraint safely
  - ensures canonical indexes exist
3. Promoted **Group Market Price** editor to a visible top card in Overview so users can edit without deep scrolling.
4. Reduced AntD form lifecycle warnings by:
  - force-rendering category modal form host
  - force-rendering MRP tab pane
  - guarding `bulkMrpForm.resetFields()` on drawer close lifecycle.
5. Added Group Market Price **Last saved** timestamp indicator after successful save.

### Scope note

- This session hardened and improved existing pricing editability UX.
- It did not expand pricing data model scope (MAP/Standard/Last PO bulk workflows remain deferred).

## 2026-04-10 — Recent Implementation Update

### Completed recently

1. Edit view changed to full-screen modal with unified **Overview** (General + Inventory + Pricing merged).
2. Supplier filter and search are active in the Overview item list.
3. **Substrates main table** switched from Category Group rows to DB-backed Item Group aggregation to avoid duplicate hierarchy display.
4. MRP edit lock removed by enabling MRP upsert for missing `mes_item_master` rows.
5. Market price fallback standardized across backend and UI:
  - `Market Price = manual market_ref_price`
  - else `On Order`
  - else `Stock`
6. Pricing formatting and headers aligned:
  - per-kg prices shown with 2 decimals
  - large value amounts shown without decimals
  - WA moved to secondary small-label with tooltip in headers.
7. Added explicit filtered-scope badge in Overview header (`Supplier: ... • Search: ... • visible/total`).
8. Shifted Overview aggregate calculations to backend endpoint:
  - `POST /items/custom-categories/detail-aggregates`
  - backend now computes filtered pricing totals, weighted spec rows, and derived consumption metrics.
9. Added schema-driven specs metadata in Item Group edit view:
  - Unit, Group, and Test Method are now shown from `mes_parameter_definitions` in Material Specs.
10. Added **Use in Estimation** handoff with payload preview:
  - prepares payload with pricing + density + yield + waste
  - supports copy/save and direct navigation to Estimation queue.
11. Added global mapped-item search across all categories (item code/description/supplier/group).
12. Added quick Material Class filter and category item-count badges in sidebar.
13. Added substrate unmapped-audit visibility (`Unmapped Items` KPI + unmapped list in Substrate Profile).
14. Phase-I cutover is active in hub:
  - `MasterDataHub` uses `CustomCategories` as Item Master tab.

### Pricing scope decision

- Keep current pricing behavior as implemented.
- Do not introduce additional pricing persistence/model changes for now.

### Completion status (agreed scope)

- All non-pricing implementation items requested in this cycle are complete.
- Remaining work is optional backlog or pricing-scope dependent.

### New behavior now enforced in item-group edit view

When user filters by supplier (or search), the right-side aggregates are computed from the **visible item set** within the item group:

1. Group Pricing cards
2. Consumption & Cost metrics
3. Material Specs weighted aggregation

This keeps pricing and parameter summaries consistent with the filtered scope.

### Screen optimization updates

1. Item Code removed from Overview table (kept in search input logic).
2. Right panel (Group Pricing + metric cards) made more compact.
3. Parameter/spec summary widths reduced.
4. Horizontal scrolling reduced in Overview table for normal desktop widths.

### Continue Implementation (next)

1. Optional: pricing-scope dependent enhancements (bulk market workflows, pricing ownership persistence).
2. Optional: legacy cleanup (remove/archive unused old `ItemMaster.jsx` implementation if no longer needed).
3. Optional: nice-to-have UX (expandable costing detail rows in Custom Categories).

---

## Oracle → Project Mapping

| Oracle Column | Project Level | Example |
|---------------|--------------|---------|
| CATEGORY | Category | Resins |
| CATLINEDESC | Category Group | HDPE, LDPE, LLDPE, mLLDPE |
| ITEMGROUP | Item Group | HDPE-1, HDPE-2, LDPE-HD-1 |
| MAINITEM | Item | BXXOTLDHDPE023CP |

---

## 3-Level Hierarchy

```
Category: "Resins"  (user-named, user selects which catlinedesc values belong here)
  └── Category Group: "HDPE"  (= fp_actualrmdata.catlinedesc)
        ├── Aggregated: stock qty, order qty, weighted avg price, weighted avg parameters
        └── Item Group: "HDPE-1"  (= fp_actualrmdata.itemgroup)
              ├── Aggregated: stock qty, order qty, price
              └── Items: individual grades (HDPE MOBIL HMA 018, etc.)
                    └── Edit view: General | Inventory & Grades | Pricing | Material Specs | MRP
```

---

## Database Schema

### Revised `mes_item_categories` (already created in migration 036)
No changes needed — stores the Category level.

### Revised `mes_item_category_groups` (already created in migration 036)
Remove `allocation_pct` — replace with simple selection.

```sql
ALTER TABLE mes_item_category_groups DROP COLUMN IF EXISTS allocation_pct;
-- catlinedesc = the CATLINEDESC value from Oracle (e.g. 'HDPE', 'LDPE')
-- No percentage — just a membership flag
```

### No new tables needed
- Category Groups come from `fp_actualrmdata.catlinedesc` (Oracle sync)
- Item Groups come from `fp_actualrmdata.itemgroup` (Oracle sync)
- Items come from `fp_actualrmdata.mainitem` (Oracle sync)
- Item edit data comes from `mes_item_master` (linked by oracle_cat_desc)

---

## Pricing Model — 4 Prices (all weighted averages)

At every level (Category → Category Group → Item Group):

| # | Price | Source | Calculation |
|---|-------|--------|-------------|
| 1 | **Stock Price (WA)** | Oracle sync | `SUM(mainitemstock × maincost) / SUM(mainitemstock)` |
| 2 | **On Order Price (WA)** | Oracle sync | `SUM(pendingorderqty × purchaseprice) / SUM(pendingorderqty)` |
| 3 | **AVG Stock & On Order (WA)** | Derived | `SUM(stock_val + order_val) / SUM(stock_qty + order_qty)` |
| 4 | **Market Price (WA)** | Admin-editable | Weighted avg of `mes_item_master.market_ref_price`, weighted by stock qty |

**Default Price rule:** On Order Price if available → else Stock Price.

### Aggregation Logic

At each level, aggregate:
- Total stock qty = SUM(mainitemstock)
- Total order qty = SUM(pendingorderqty)
- 4 prices as above
- Parameters (MFR, density, etc.) = weighted avg from mes_material_tds, weighted by stock qty

---

## Backend Endpoints (revised)

### GET `/items/custom-categories`
Returns categories with their selected catlinedesc groups.

### GET `/items/custom-categories/:id/profile`
Returns full 3-level aggregated profile with 4-price model:
```json
{
  "category": { "id": 1, "name": "Resins" },
  "totals": {
    "stock_qty": 1721348, "order_qty": 850000,
    "stock_price_wa": 5.23, "on_order_price_wa": 5.45,
    "avg_price_wa": 5.30, "market_price_wa": 5.50,
    "default_price": 5.45,
    "stock_val": 9002610, "order_val": 4632500
  },
  "parameters": { "mfr_190_2_16": { "weighted_avg": 1.25, "min": 0.16, "max": 7.0 }, ... },
  "groups": [
    {
      "catlinedesc": "HDPE",
      "stock_qty": 406019, "order_qty": 180000,
      "stock_price_wa": 5.45, "on_order_price_wa": 5.50,
      "avg_price_wa": 5.47, "market_price_wa": 5.60,
      "default_price": 5.50,
      "item_groups": [
        {
          "itemgroup": "HDPE-1",
          "stock_qty": 250000, "order_qty": 120000,
          "stock_price_wa": 5.40, "on_order_price_wa": 5.48,
          "avg_price_wa": 5.43, "market_price_wa": 5.55,
          "default_price": 5.48
        }
      ]
    }
  ]
}
```
**Default Price:** `on_order_price_wa ?? stock_price_wa ?? null`

### PUT `/items/custom-categories/:id/groups`
Bulk set which catlinedesc values belong to this category (no allocation %).

### GET `/items/custom-categories/:id/available-groups`
Returns all unique catlinedesc values from fp_actualrmdata for this category's material_class.

### GET `/items/custom-categories/:id/item-group/:itemgroup`
Returns full detail for one Item Group including all items and their mes_item_master data.

---

## Frontend UI (CustomCategories.jsx — revised)

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [+ New Category]                                                     │
├──────────┬──────────────────────────────────────────────────────────┤
│ Left     │ Main area                                                 │
│ Sidebar  │                                                           │
│          │ Category: Resins                                          │
│ ● Resins │ Stock: 1.7M kgs  |  Order: 850k kgs                      │
│          │ ┌──────────────────────────────────────────────────────┐  │
│          │ │ Stock Price  On Order   AVG S&O   Market   Default   │  │
│          │ │ ฿5.23        ฿5.45      ฿5.30     ฿5.50    ฿5.45    │  │
│          │ └──────────────────────────────────────────────────────┘  │
│          │                                                           │
│          │ ┌─ HDPE ──────────────────────────────────────────────┐  │
│          │ │ Stock: 406k  Order: 180k                             │  │
│          │ │ Stock: ฿5.45  Order: ฿5.50  AVG: ฿5.47  Mkt: ฿5.60 │  │
│          │ │ MFR: 0.25  Density: 0.952                           │  │
│          │ │                                                      │  │
│          │ │  HDPE-1  250k kgs  Default: ฿5.48  [6 items] [Edit] │  │
│          │ │  HDPE-2  100k kgs  Default: ฿5.50  [4 items] [Edit] │  │
│          │ └──────────────────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────────────────┘
```

### Item Group Edit View (when clicking [Edit] on HDPE-1)
Opens the same modal as current Item Master with tabs:
- General
- Inventory & Grades
- Pricing
- Material Specs
- MRP

---

## Implementation Phases

### Phase A: Fix DB ✅ (done — tables exist, allocation_pct removed)
### Phase B: Fix backend endpoints ✅ (done — CRUD + profile with 4-price model + item-group detail)
### Phase C: Frontend — Category view with 3-level hierarchy ✅ (done — 4-price KPIs, collapsible groups, item group tables)
### Phase D: Item Group edit view ✅ (done — Drawer with 5 tabs: General, Inventory & Grades, Pricing, Material Specs, MRP)

---

## Gap Analysis: Custom Categories vs Item Master

> **Goal:** Custom Categories replaces Item Master entirely. Below is what Item Master does today and what Custom Categories still needs.

### What Item Master Does (3522 lines, ~15 features)

| # | Feature | Item Master | Custom Categories | Gap |
|---|---------|-------------|-------------------|-----|
| 1 | **Resins catalog** — flat list of resin items by catlinedesc, with stock/order/price columns | ✅ Full table with filters | ✅ 3-level hierarchy (Category → Group → Item Group) with aggregated prices | ✅ Done (better) |
| 2 | **Substrates catalog** — flat list of substrate items by cat_desc/appearance | ✅ Full table with taxonomy | ✅ Item-group aggregated substrate catalog + profile flows | ✅ Done |
| 3 | **Category filter pills** — Resins / Substrates tabs + sub-filter by catlinedesc | ✅ Button pills | ✅ Left sidebar with category cards | ✅ Done (different UX) |
| 4 | **Sub-filter by catlinedesc** — drill into HDPE, LDPE, etc. | ✅ Button pills | ✅ Collapsible groups | ✅ Done |
| 5 | **Edit modal — General tab** | ✅ Oracle ref info, waste %, item code/name | ✅ Drawer General tab (item list) | ⚠️ Partial — shows items but no edit fields |
| 6 | **Edit modal — Inventory & Grades tab** | ✅ KPIs + grade selection table with TDS IDs | ✅ Drawer Inventory tab (KPIs + items) | ⚠️ Partial — no grade selection/deselection |
| 7 | **Edit modal — Pricing tab** | ✅ Stock/Order/Combined WA cards + editable Market/MAP/Standard/Last PO fields | ✅ Drawer Pricing tab (4-price cards + inline market price edit) | ⚠️ Partial — only market price editable, no MAP/Standard/Last PO |
| 8 | **Edit modal — Material Specs tab** | ✅ Weighted TDS params with cards | ✅ Drawer Specs tab (TDS params per item in table) | ✅ Done (different format) |
| 9 | **Edit modal — MRP tab** | ✅ MRP Type, Reorder, Safety Stock, Lead Time fields | ✅ Drawer MRP tab (inline editable + bulk apply) | ✅ Done |
| 10 | **Bulk Market Price Update** | ✅ CSV paste modal | ❌ Not in Custom Categories | Need Phase F |
| 11 | **Create new item** | ✅ Add Item button + full form | ❌ Not needed — items come from Oracle sync | N/A |
| 12 | **Delete/deactivate item** | ✅ Per-row delete | ❌ Not needed — items come from Oracle sync | N/A |
| 13 | **Taxonomy management** — Add/Rename/Delete Category + Subcategory | ✅ Full CRUD | ❌ Not in Custom Categories | Evaluate if needed |
| 14 | **Substrate profile configs** — per-bucket physical properties, mapped film IDs | ✅ Full substrate config save | ✅ Substrate Profile tab with save + mapped keys | ✅ Done |
| 15 | **Unmapped substrates audit** | ✅ Audit modal | ✅ Unmapped items list + KPI in Substrate Profile | ✅ Done |
| 16 | **Expandable row detail** — costing breakdown per item | ✅ expandedRowRender | ❌ Not in Custom Categories | Nice-to-have |
| 17 | **Search + type filter** | ✅ Search bar + item_type dropdown | ✅ Global mapped-item search + material-class quick filter | ✅ Done |

### What Custom Categories Does Better

1. **3-level hierarchy** — Oracle's actual structure (Category → CATLINEDESC → ITEMGROUP) vs flat list
2. **4-price model** — clear Stock/Order/AVG/Market/Default at every level
3. **Aggregated KPIs** — weighted averages roll up from items → item groups → category groups → category
4. **User-configurable categories** — admin picks which catlinedesc values belong to each category
5. **Weighted TDS parameters** — at category level, not just per-item

### Remaining Phases to Replace Item Master

### Phase E: Substrates Support ✅
- Material-class substrate categories active
- Substrate profile configs + mapped keys active
- Substrate parameter aggregation + unmapped audit visibility active

### Phase F: Bulk Operations ⚠️ Pricing-scope dependent
- Bulk market price update (CSV paste or inline multi-edit) remains deferred by pricing freeze
- Bulk MRP parameter update is already active

### Phase G: Search & Filters ✅
- Global search across all mapped categories active
- Quick filter by material class active
- Item count badges per category active

### Phase H: Inline Editing in Drawer ⚠️ Partial by scope
- MRP tab inline editing is active
- Pricing MAP/Standard/Last PO editing intentionally deferred per pricing-scope freeze
- Waste % editing in General tab is optional backlog

### Phase I: Replace Item Master Tab ✅
- MasterDataHub uses Custom Categories as the Item Master experience
- Legacy naming/routing cutover in main hub is complete

---

## Files

| File | Action |
|------|--------|
| `server/migrations/mes-master-036-custom-categories.js` | ✅ Created tables |
| `server/migrations/mes-master-037-fix-categories.js` | ✅ Remove allocation_pct, fix seed |
| `server/routes/mes/master-data/items.js` | ✅ All endpoints: CRUD, profile (4-price), item-group detail |
| `src/components/MES/MasterData/CustomCategories.jsx` | ✅ Full UI: 3-level hierarchy, 4-price KPIs, item group drawer with 5 tabs |
