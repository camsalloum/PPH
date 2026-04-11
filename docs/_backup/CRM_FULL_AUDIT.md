# CRM Module — Full Audit Report

**Date:** 2026-02-12  
**Scope:** All 18 frontend components, 1 backend route file (27 endpoints), CSS stylesheet  
**Files audited:**
- `server/routes/crm/index.js` (~2502 lines, 27 endpoints)
- `src/components/CRM/` — 18 `.jsx` components + `CRM.css` (~1220 lines)

---

## Table of Contents

1. [Critical Bugs](#1-critical-bugs)
2. [Security Issues](#2-security-issues)
3. [Performance Issues](#3-performance-issues)
4. [Data Integrity Issues](#4-data-integrity-issues)
5. [Inconsistencies](#5-inconsistencies)
6. [Deprecated / Dead Code](#6-deprecated--dead-code)
7. [Frontend Component Issues](#7-frontend-component-issues)
8. [CSS / Styling Issues](#8-css--styling-issues)
9. [Missing Features / Gaps](#9-missing-features--gaps)
10. [Improvement Recommendations](#10-improvement-recommendations)
11. [Endpoint Catalog](#11-endpoint-catalog)
12. [Summary Scoreboard](#12-summary-scoreboard)

---

## 1. Critical Bugs

### 1.1 Sales History Drops Merged Customer Transactions
**File:** `server/routes/crm/index.js` lines ~920–938  
**Severity:** HIGH  
**Description:** The sales history endpoint (`GET /customers/:id/sales-history`) JOINs `fp_actualcommon` to `fp_customer_unified` on `LOWER(TRIM(display_name)) = LOWER(TRIM(customer_name))`. For **merged** customers whose original names differ from the `display_name`, transactions are silently **dropped**.  
**Root cause:** A `searchNames` array is built from `original_names` (lines 892–898) but is **never used** in the SQL query. The JOIN only matches on `display_name`.  
**Impact:** Users viewing a merged customer's sales history see incomplete data — transactions under old names are invisible.  
**Fix:** Replace the JOIN with `WHERE LOWER(TRIM(customer_name)) = ANY($searchNames)` to include all original names.

### 1.2 CustomerDetail Does Not Display 3-Tier customer_status
**File:** `src/components/CRM/CustomerDetail.jsx` lines ~533, 550–553, 707–712  
**Severity:** HIGH  
**Description:** The backend now returns a live `customer_status` (active / dormant / inactive) field computed via LEFT JOIN to `fp_actualcommon`. However, `CustomerDetail.jsx` still only uses the **binary** `is_active` field:
- Avatar: `customer.is_active ? 'crm-avatar-active' : 'crm-avatar-inactive'`
- Tag: `customer.is_active ? 'Active' : 'Inactive'`
- Form: `is_active` checkbox (Switch)

The "dormant" state is invisible. You see "Active" or "Inactive" only.  
**Fix:** Replace binary `is_active` tag with 3-tier `customer_status` display (green Active / orange Dormant / red Inactive), matching what `CustomerList.jsx` and `MyCustomers.jsx` already show.

### 1.3 CustomerSalesHistoryModal "All" Page Size Is Broken
**File:** `src/components/CRM/CustomerSalesHistoryModal.jsx` lines 295–305  
**Severity:** MEDIUM  
**Description:** `pageSizeOptions` includes `'All'` as a page-size choice. The `onChange` handler checks `if (pageSize === 'All')` but:
1. Returns `salesData.length` as a value from a callback that doesn't use the return value (Ant Design expects void)
2. Never actually sets pagination state — it just returns a number into nowhere
3. Ant Design's `Table` expects `pageSize` to be a number, not a string

**Impact:** Clicking "All" in the page-size dropdown either does nothing or shows NaN/blank.  
**Fix:** Track pagination state; when 'All' is selected, set `pageSize` to `salesData.length` via state. Or use `Number.MAX_SAFE_INTEGER` as a workaround.

---

## 2. Security Issues

### 2.1 Missing Access Control on Mutation Endpoints

| Severity | Endpoint | Line | Issue |
|----------|----------|------|-------|
| **HIGH** | `PUT /customers/:id` | ~1129 | **No ownership check.** Any authenticated user can update ANY customer's data. The GET endpoint checks ownership, but PUT does not. |
| **HIGH** | `PUT /products/:id` | ~1291 | **No role check.** Any authenticated user can modify product group parameters (commission rates, monthly targets, price floors). |
| **MEDIUM** | `PUT /prospects/:id/status` | ~2283 | **No role/ownership check.** Any authenticated user can change any prospect's status. |
| **MEDIUM** | `POST /prospects/:id/convert` | ~2302 | **No role/ownership check.** Any authenticated user can convert any prospect. |

### 2.2 SQL Interpolation (Fragile, Not Parameterized)
**Lines:** ~1718–1721, ~1791, ~2122–2125  
**Description:** `group_id` from `req.query` is `parseInt()`'d then interpolated directly into SQL template literals (`WHERE id = ${gid}`). While `parseInt` mitigates actual injection, this pattern is fragile and doesn't use proper parameterized queries (`$1`).  
**Impact:** Low immediate risk (parseInt protects), but sets a bad precedent. If a similar pattern is copied elsewhere without parseInt, it becomes exploitable.  
**Fix:** Use parameterized queries: `WHERE id = $n` with `params.push(gid)`.

### 2.3 Dashboard Has No Access Control
**Line:** ~1681  
**Description:** `GET /dashboard/stats` has no role check at all. Any authenticated user (including a basic sales rep) can access the full admin dashboard data including company-wide revenue, all customer counts, all rep group data.  
**Fix:** Add `FULL_ACCESS_ROLES` check.

---

## 3. Performance Issues

### 3.1 `live_ltxn` Full-Table Scan on Every Request (CRITICAL)
**Lines:** ~352–360, ~720–728, ~1433–1441, ~1477–1485  
**Description:** The live `last_transaction_date` computation uses:
```sql
LEFT JOIN (
  SELECT UPPER(TRIM(customer_name)) as norm_name, 
         MAX(MAKE_DATE(year, month_no, 1)) as last_txn
  FROM fp_actualcommon
  GROUP BY UPPER(TRIM(customer_name))
) live_ltxn ON ...
```
This scans the **entire** `fp_actualcommon` table on every request to `/customers`, `/customers/:id`, `/my-customers`. With hundreds of thousands of rows, this is very expensive.  
**Fix:** Create a materialized view `mv_customer_last_txn` refreshed during Oracle data sync, or maintain a trigger-based summary table.

### 3.2 Missing Functional Indexes

| Expression | Used In |
|-----------|---------|
| `UPPER(TRIM(customer_name))` on `fp_actualcommon` | `live_ltxn` JOIN (4 locations) |
| `LOWER(TRIM(customer_name))` on `fp_actualcommon` | Sales history JOIN |
| `LOWER(TRIM(display_name))` on `fp_customer_unified` | Dashboard correlated subquery |
| `normalized_name` on `fp_customer_unified` | `live_ltxn` JOIN condition |

### 3.3 Sequential Queries Where Parallel Is Possible
**`GET /customers/:id`** (lines ~710–870): Runs up to 5 sequential queries (customer, auth, search names, sales rep from actualcommon, sales rep info from authPool). Could parallelize with `Promise.all`.  
**`GET /lookups`** (lines ~488–585): Fires up to 9 sequential queries including 4 distinct-value queries that could easily run in parallel.

### 3.4 Correlated Subquery in Dashboard
**Line:** ~1832–1834  
**Description:** Dashboard query #11 (recent customers) uses a correlated subquery (`SELECT cu.customer_id FROM fp_customer_unified cu WHERE LOWER(TRIM(cu.display_name)) = LOWER(TRIM(d.customer_name)) LIMIT 1`) for each result row. Without a functional index, this triggers sequential scans.

### 3.5 `groupFilter` Subquery Repeated 11 Times
**Line:** ~1718  
**Description:** When filtering by rep group, the `groupFilter` string contains `(SELECT group_name FROM sales_rep_groups WHERE id = ${gid} LIMIT 1)` which is pasted into all 11 `Promise.all` dashboard queries. Should resolve the group name once in JS.

### 3.6 MyCustomers.jsx Client-Side Search
**File:** `src/components/CRM/MyCustomers.jsx`  
**Description:** All customer data is loaded at once, then filtered client-side via `.filter()`. Works now with ~50–200 customers per rep, but won't scale if customer counts grow.

---

## 4. Data Integrity Issues

### 4.1 COALESCE Prevents Clearing Fields to NULL
**File:** `server/routes/crm/index.js` lines ~1213–1243 (PUT /customers/:id) and ~1313–1327 (PUT /products/:id)  
**Description:** Every update field uses `COALESCE($n, existing_column)`. If a user explicitly wants to **clear** a field (set it to NULL), the COALESCE keeps the old value. There's no way to distinguish "not provided" from "clear this field".  
**Fix:** Use a sentinel value (e.g., empty string) or change the update pattern to only SET fields that are explicitly provided.

### 4.2 Map Endpoints Missing `live_ltxn` JOIN
**Endpoints:** `GET /customers/map` (line ~590), `GET /my-customers/map` (line ~1516)  
**Description:** Both map endpoints return the **stale** `is_active` boolean from `fp_customer_unified` instead of computing live `customer_status` via the `live_ltxn` JOIN. If the map color-codes pins by status, it shows outdated data.  
**Fix:** Add the same `live_ltxn` LEFT JOIN pattern used in the other customer endpoints.

### 4.3 Hardcoded Currency `AED`
**Lines:** ~960, ~967  
**Description:** Sales history response hardcodes `currencyCode: 'AED'`. Should be dynamic based on customer country or company config.

### 4.4 Hardcoded Division `FP`
**Lines:** ~1708, ~1979, ~2120  
**Description:** `DIVISION = 'FP'` is hardcoded in dashboard, my-stats, and recent-activities. Locks entire CRM to one division.

---

## 5. Inconsistencies

### 5.1 Field Name Mismatches Across Endpoints

| Concept | `/customers` | `/customers/:id` | `/my-customers` |
|---------|-------------|-------------------|-----------------|
| Last order date | `last_transaction_date` + `last_order_date` | `last_transaction_date` | `last_invoice_date` |
| Total revenue | `total_amount_all_time` | `total_amount_all_time` (via `cu.*`) | `total_revenue` |

Frontend components must handle 3 different field names for the same concept. This is fragile and error-prone.

### 5.2 `/customers` Returns Duplicate Date Fields
**Line:** ~399–400  
Both `last_transaction_date` and `last_order_date` are selected as aliases of the **exact same** expression. One is redundant.

### 5.3 Inconsistent Access Control Patterns

| Endpoint | Method | Roles Allowed |
|----------|--------|--------------|
| `/customers` | Uses `FULL_ACCESS_ROLES` array | admin, manager, sales_manager, sales_coordinator |
| `/my-customers` | Hardcodes check | Only admin, sales_manager (missing manager, sales_coordinator) |
| `/my-customers/map` | Hardcodes check | Only admin, sales_manager (missing manager, sales_coordinator) |
| `/dashboard/stats` | **No check** | Any authenticated user |

A `manager` or `sales_coordinator` gets full access on `/customers` but is treated as a restricted sales rep on `/my-customers`. This is inconsistent.

### 5.4 ProductGroupList vs ProspectManagement `isAdmin` Definitions

| Component | isAdmin Logic |
|-----------|---------------|
| `ProductGroupList.jsx` (line 41) | `user?.role === 'admin'` — only admin, no super_admin, no manager |
| `ProspectManagement.jsx` (line 76) | `user?.role === 'admin' \|\| user?.role === 'super_admin'` — includes super_admin |
| Backend FULL_ACCESS_ROLES | admin, manager, sales_manager, sales_coordinator |

Three different definitions of "admin" across the codebase.

---

## 6. Deprecated / Dead Code

### 6.1 Backend Dead Code

| Lines | Description |
|-------|-------------|
| ~15–20 | Commented-out sub-router imports (`customersRoutes`, `leadsRoutes`, etc.) |
| ~1672–1676 | Commented-out `router.use()` mount points for those sub-routers |
| ~1014–1015 | `const https = require('https'); const http = require('http');` — imported but only used by dead `followRedirects` function |
| ~1018–1037 | `followRedirects()` function — defined but **never called** (code uses `node-fetch` instead) |
| ~892–898 | `searchNames` array built from `original_names` — **never passed** to the SQL query |
| ~27–47 | `getCustomerSearchNames()` helper — called at line ~779 in customer detail but returned value is never used |

### 6.2 Frontend Deprecated APIs
**File:** `CRMDashboard.jsx` (line 531)  
- Uses deprecated `Dropdown overlay={...}` prop — should use `menu` prop (Ant Design v5+)
- Uses `<Menu>` and `<Menu.Item>` components directly (deprecated, should use `items` array prop)

### 6.3 Duplicate Utilities
**`CRMDashboard.jsx`** defines its own `formatCurrency` (line 181) and `MetricCard` (line 216) that are functionally duplicates of similar utilities. `AdminCRMDashboard.jsx` has its own inline currency formatting. These should be extracted to a shared `CRM/utils.js`.

### 6.4 Placeholder Components
- `CRMAnalytics.jsx` — "Coming Soon" placeholder with no functionality
- `CRMReports.jsx` — "Coming Soon" placeholder with a disabled Export button

These take up tab space in the CRM module navigation.

---

## 7. Frontend Component Issues

### 7.1 CustomerDetail.jsx — EditableField Inside Render
**Description:** The `EditableField` helper component is defined **inside** the render function body. On every re-render, React creates a new component type, causing the field to unmount and remount. This:
- Kills input focus
- Destroys component state (like open dropdowns)
- Wastes performance

**Fix:** Move `EditableField` outside the component or memoize with `useMemo`.

### 7.2 ProspectManagement.jsx — CurrencySymbol Without `code` Prop
**Line:** ~279  
```jsx
<CurrencySymbol /> {value.toLocaleString()}
```
`CurrencySymbol` is called without a `code` prop. If the component requires `code` to render the correct symbol, this shows a default/undefined symbol.  
**Fix:** Pass `code={companyCurrency?.code || 'AED'}`.

### 7.3 ProspectManagement.jsx — Hardcoded Year Options
**Description:** Year filter uses hardcoded options `[2024, 2025, 2026, 2027]`. This will become stale.  
**Fix:** Generate dynamically from current year: `[currentYear - 2, ..., currentYear + 1]`.

### 7.4 CRMBudgetEntry.jsx — Inline Styles
**File:** `src/components/CRM/CRMBudgetEntry.jsx` (~1239 lines)  
**Description:** Uses extensive inline styles instead of CRM.css classes. Makes the component hard to maintain and inconsistent with the rest of the CRM module.

### 7.5 CustomerMapView.jsx — Stale is_active for Marker Colors
**Description:** The map endpoints don't compute live `customer_status`, so marker colors based on active/inactive use stale data from `fp_customer_unified.is_active`. Customers who became inactive won't change color until the next migration run updates the table.

### 7.6 useEffect Missing Dependencies
**File:** `CustomerDetail.jsx`  
**Description:** Several `useEffect` hooks reference functions defined in the component body that aren't included in the dependency array. This causes React lint warnings and potentially stale closures.

---

## 8. CSS / Styling Issues

### 8.1 Dual Prefix System (crm- vs crmx-)
**Description:** Two CSS prefix systems coexist:
- **`crm-`** prefix (~150+ selectors in CRM.css): Used by most components (CustomerList, MyCustomers, CustomerDetail, ProductGroupList, SalesRepList, CustomerMapView, CustomerLocationPicker, CRMDashboard, CRMReports, etc.)
- **`crmx-`** prefix (~60+ selectors in CRM.css): Used exclusively by `AdminCRMDashboard.jsx`

The `crmx-` styles were added during the Sales Cockpit redesign. Having two naming conventions in the same stylesheet is confusing.

**Fix:** Either migrate everything to `crmx-` or keep `crm-` and rename the admin ones. Pick one prefix.

### 8.2 Potentially Unused CSS Classes
Many `crm-` classes defined in CRM.css appear to be from the old sidebar layout that was replaced by the tab navigation:
- `crm-layout`, `crm-sider`, `crm-sider-header`, `crm-title`, `crm-user-info`, `crm-user-details`
- `crm-menu`, `.crm-menu .ant-menu-item`, `crm-menu .ant-menu-item-selected`, etc.
- `crm-content-layout`, `crm-content`

These should be verified and removed if unused.

### 8.3 Classes Used in JSX But Potentially Missing from CSS
Some classes referenced in JSX components might not have corresponding CSS rules:
- `crm-avatar-purple`, `crm-avatar-success` (MyCustomers.jsx)
- `crm-avatar-active`, `crm-avatar-inactive` (CustomerDetail.jsx)
- `crm-row-mb-20`, `crm-row-mb-32`, `crm-mb-0`, `crm-ml-8`, `crm-row-mb-8` (various)
- `crm-my-customers`, `crm-customer-list`, `crm-product-list`, `crm-sales-rep-list` (wrapper classes)
- `crm-text-xs`, `crm-text-sm`, `crm-text-primary` (ProductGroupList, CustomerList)
- `crm-search-row`, `crm-search-input`, `crm-search-hint-text` (MyCustomers)
- `crm-currency-mr` (MyCustomers)
- `crm-code-text` (CustomerList)
- `crm-prospect-management` (ProspectManagement)
- `crm-history-modal-title`, `crm-history-summary-row`, `crm-statistic-sm` (CustomerSalesHistoryModal)

> **Note:** These may work fine if they're purely structural (wrapper) or if Ant Design handles them. But any intended styling would be missing.

---

## 9. Missing Features / Gaps

### 9.1 CRM Analytics — Empty
`CRMAnalytics.jsx` is a placeholder "Coming Soon" page. It takes up a tab slot but provides no value. Either implement it or remove the tab.

### 9.2 CRM Reports — Empty
`CRMReports.jsx` is a placeholder with a disabled Export button. Same recommendation.

### 9.3 No Bulk Operations
There's no way to:
- Bulk update customer status
- Bulk assign sales reps to customers
- Bulk approve/reject prospects

### 9.4 No Audit Trail
Customer updates (`PUT /customers/:id`) don't log who changed what and when. The `updated_at` timestamp is set, but there's no audit log table for change history.

### 9.5 No Customer Notes / Activity Log
The CRM has no way for sales reps to add notes, call logs, or interaction records to a customer. This is a common core CRM feature.

### 9.6 No Notification System
- Prospect approvals/rejections don't trigger notifications
- Customer conversions aren't broadcast to relevant reps
- No email or in-app notification mechanism

### 9.7 Map Fallback When No Coordinates
Customers without latitude/longitude are simply invisible on the map. There's no indicator of how many customers are "off-map" or a prompt to add missing coordinates.

### 9.8 No Export Capability on Main Views
- `CustomerList.jsx` has no Excel/CSV export button
- `MyCustomers.jsx` has no export
- Only `CustomerSalesHistoryModal` has Excel export

---

## 10. Improvement Recommendations

### Priority 1 — Fix Bugs
| # | Fix | Effort |
|---|-----|--------|
| 1 | Sales history: use `searchNames` array for merged-customer transactions | Small |
| 2 | CustomerDetail: display 3-tier `customer_status` instead of binary `is_active` | Small |
| 3 | Sales history modal: fix 'All' page-size handler | Small |
| 4 | PUT /customers/:id and PUT /products/:id: add role/ownership checks | Small |

### Priority 2 — Security
| # | Fix | Effort |
|---|-----|--------|
| 5 | Parameterize all SQL (replace interpolated group_id) | Small |
| 6 | Add role check to `GET /dashboard/stats` | Small |
| 7 | Add ownership check to `PUT /prospects/:id/status` and `POST /prospects/:id/convert` | Small |

### Priority 3 — Performance
| # | Fix | Effort |
|---|-----|--------|
| 8 | Create materialized view for `live_ltxn` aggregation | Medium |
| 9 | Add functional indexes for UPPER/LOWER(TRIM(...)) expressions | Small |
| 10 | Parallelize sequential queries in `/customers/:id` and `/lookups` | Medium |

### Priority 4 — Consistency
| # | Fix | Effort |
|---|-----|--------|
| 11 | Unify `FULL_ACCESS_ROLES` usage across all endpoints | Small |
| 12 | Unify field names: pick one name for last-order-date and one for total-revenue | Medium |
| 13 | Unify `isAdmin` definition across frontend components | Small |

### Priority 5 — Code Quality
| # | Fix | Effort |
|---|-----|--------|
| 14 | Move EditableField out of CustomerDetail render body | Small |
| 15 | Replace deprecated Dropdown overlay/Menu in CRMDashboard | Small |
| 16 | Extract shared formatCurrency/MetricCard to CRM/utils.js | Small |
| 17 | Clean up dead code in backend (followRedirects, commented imports, unused searchNames) | Small |
| 18 | Clean up stale CSS classes from old sidebar layout | Medium |
| 19 | Unify CSS prefix (crm- vs crmx-) | Large |
| 20 | Add missing CSS classes or remove unused className references | Medium |

### Priority 6 — Enhancements (Future)
| # | Enhancement | Effort |
|---|-------------|--------|
| 21 | Add map endpoints live_ltxn JOIN for accurate status colors | Small |
| 22 | Fix COALESCE-prevents-null-clear in PUT endpoints | Medium |
| 23 | Dynamic currency (not hardcoded AED) | Small |
| 24 | Dynamic year options in ProspectManagement | Tiny |
| 25 | CurrencySymbol: pass code prop in ProspectManagement | Tiny |
| 26 | Implement CRM Analytics or remove tab | Large |
| 27 | Implement CRM Reports or remove tab | Large |
| 28 | Add customer export (CSV/Excel) to main list views | Medium |
| 29 | Add customer notes/activity log feature | Large |
| 30 | Add audit trail for customer edits | Medium |

---

## 11. Endpoint Catalog

| # | Method | Path | Auth | Lines |
|---|--------|------|------|-------|
| 1 | GET | `/health` | None | ~53 |
| 2 | GET | `/sales-reps` | Yes | ~71 |
| 3 | GET | `/sales-rep-groups` | Yes | ~111 |
| 4 | GET | `/products` | Yes | ~152 |
| 5 | GET | `/customers` | Yes + FULL_ACCESS | ~209 |
| 6 | GET | `/customers/countries` | Yes | ~446 |
| 7 | GET | `/customers/country-regions` | Yes | ~466 |
| 8 | GET | `/lookups` | Yes | ~488 |
| 9 | GET | `/customers/map` | Yes | ~590 |
| 10 | GET | `/customers/:id` | Yes + ownership | ~710 |
| 11 | GET | `/customers/:id/sales-history` | Yes | ~876 |
| 12 | POST | `/resolve-google-maps-url` | Yes | ~990 |
| 13 | PUT | `/customers/:id` | Yes (**NO** ownership!) | ~1129 |
| 14 | PUT | `/products/:id` | Yes (**NO** role check!) | ~1291 |
| 15 | GET | `/my-customers` | Yes | ~1359 |
| 16 | GET | `/my-customers/map` | Yes | ~1516 |
| 17 | GET | `/dashboard/stats` | Yes (**NO** role check!) | ~1681 |
| 18 | GET | `/my-stats` | Yes | ~1973 |
| 19 | GET | `/recent-activities` | Yes | ~2101 |
| 20 | POST | `/prospects` | Yes | ~2226 |
| 21 | GET | `/prospects` | Yes | ~2254 |
| 22 | PUT | `/prospects/:id/status` | Yes (**NO** role check!) | ~2283 |
| 23 | POST | `/prospects/:id/convert` | Yes (**NO** role check!) | ~2302 |
| 24 | POST | `/prospects/detect-conversions` | Yes | ~2319 |
| 25 | GET | `/prospects/metrics` | Yes | ~2337 |
| 26 | GET | `/my-prospects` | Yes | ~2367 |
| 27 | GET | `/prospects-count` | Yes | ~2436 |

**27 total endpoints** — 4 have missing or insufficient access control.

---

## 12. Summary Scoreboard

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Bugs | 1 | 1 | 1 | 0 | **3** |
| Security | 0 | 3 | 3 | 1 | **7** |
| Performance | 1 | 1 | 4 | 0 | **6** |
| Data Integrity | 0 | 1 | 3 | 0 | **4** |
| Inconsistency | 0 | 1 | 3 | 0 | **4** |
| Dead/Deprecated Code | 0 | 0 | 4 | 2 | **6** |
| Frontend Issues | 0 | 1 | 4 | 1 | **6** |
| CSS Issues | 0 | 0 | 3 | 0 | **3** |
| Missing Features | 0 | 0 | 3 | 5 | **8** |
| **Totals** | **2** | **7** | **25** | **8** | **47** |

---

### Error-Swallowing (Minor)
Two catch blocks return success:
- `GET /recent-activities` (line ~2196) — `res.json({ success: true, data: [] })` on error
- `GET /prospects-count` (line ~2494) — `res.json({ success: true, data: { count: 0 } })` on error

These hide problems from monitoring and debugging.

---

*End of audit. 47 findings total across 9 categories.*
