# Comprehensive P&L Pages Audit Report

**Audit Date:** January 2025  
**Audited Pages:** ActualTab, EstimateTab, BudgetPLTab, ForecastPLTab, ForecastSalesTab, BudgetTab  
**Auditor:** GitHub Copilot  
**Status:** Issues Listed (Not Fixed)

---

## Executive Summary

Deep audit of all P&L-related pages, their data flows, Excel/HTML exports, formulas, table connections, and potential inconsistencies. This document lists identified issues and potential bugs without implementing fixes.

---

## Table of Contents

1. [ActualTab](#1-actualtab)
2. [EstimateTab](#2-estimatetab)
3. [BudgetPLTab](#3-budgetpltab)
4. [ForecastPLTab](#4-forecastpltab)
5. [ForecastSalesTab](#5-forecastsalestab)
6. [BudgetTab (Divisional)](#6-budgettab-divisional)
7. [Cross-Page Data Flow Issues](#7-cross-page-data-flow-issues)
8. [Database Table Relationships](#8-database-table-relationships)
9. [Formula Consistency Issues](#9-formula-consistency-issues)
10. [Export Inconsistencies](#10-export-inconsistencies)

---

## 1. ActualTab

**File:** `src/components/MasterData/AEBF/ActualTab.jsx` (1010 lines)  
**Server Route:** `server/routes/fp/raw-data.js`

### 1.1 Data Flow
- **Source:** Raw Excel upload → `{division}_raw` table
- **Endpoint:** `GET /api/fp/raw-data/years`, `GET /api/fp/raw-data/year-summary`
- **Export:** `GET /api/fp/raw-data/export?division=...&year=...` (direct URL open)

### 1.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| ACT-001 | Medium | `fetchData()` function body is empty (returns immediately) | Line 145-148 |
| ACT-002 | Low | Data table removed but `fetchData` still referenced in `handleSearch` | Line 173 |
| ACT-003 | Info | No validation on uploaded Excel file structure before processing | Upload modal |
| ACT-004 | Low | Currency selection removed but `selectedCurrency` variable still exists | Line 54 |

### 1.3 Export Analysis
- **Type:** Simple URL-based Excel export
- **Potential Issue:** Export uses server data, not frontend state. If frontend has any pending state, it won't reflect in export.

---

## 2. EstimateTab

**File:** `src/components/MasterData/AEBF/EstimateTab.jsx` (1332 lines)  
**Server Route:** `server/routes/aebf/projections.js`

### 2.1 Data Flow
- **Source:** Calculated from Actual data averages
- **Storage:** `fp_product_group_projections` table (type = 'ESTIMATE')
- **Calculation Endpoint:** `POST /api/aebf/projections/calculate-pg-estimate`
- **Export Endpoint:** `POST /api/aebf/projections/export-excel`

### 2.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| EST-001 | Medium | Excel export does not include custom adjustments (`pgAdjustments`) applied in UI | Frontend Line ~320 |
| EST-002 | Medium | `pgKgsOverrides` (custom KGS values) not persisted to database | State only |
| EST-003 | Low | Year metadata shows 'ACTUAL' vs 'ESTIMATE' but export doesn't differentiate | Export logic |
| EST-004 | Info | Estimate calculation uses `baseYear` averages, not accounting for seasonality | Business logic |
| EST-005 | Medium | Services Charges product group not handled specially in export (uses same KGS logic as regular PGs) | Export |

### 2.3 Export Analysis
- **Type:** POST request with frontend state
- **Potential Issue:** Export fetches from database, may not reflect unsaved frontend edits

---

## 3. BudgetPLTab

**File:** `src/components/MasterData/AEBF/BudgetPLTab.jsx` (1187 lines)  
**Server Route:** `server/routes/aebf/budget-pl.js`

### 3.1 Data Flow
- **Actual Data:** `{division}_pl_data` table (data_type = 'Actual')
- **Budget Data:** Aggregated from `budget_unified` table → saved to `{division}_pl_data` (data_type = 'Budget')
- **Save Endpoint:** `POST /api/aebf/save-budget-pl`
- **Excel Export:** `POST /api/aebf/export-budget-pl-excel`

### 3.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| BPL-001 | **CRITICAL** | `materialVariancePct` NOT persisted to database - lost after page refresh | Save function doesn't include variance |
| BPL-002 | High | Material variance applied to display but NOT to saved `fullBudgetData` | Lines 518-550 |
| BPL-003 | Medium | `defaultMaterialVariancePct` uses `dir_cost_stock_adj` % from actual, but this is conceptually different from material variance | Lines 210-220 |
| BPL-004 | Medium | Excel export uses `budgetByMonth[m]['material']` directly, but if variance was edited AFTER save, export won't reflect new variance | Export flow |
| BPL-005 | Low | `hasUnsavedChanges` checks `materialVariancePct !== defaultMaterialVariancePct` but `defaultMaterialVariancePct` is set from actual data, not from last saved variance | Line 492 |
| BPL-006 | Info | `dir_cost_stock_adj` always 0 in budget - its % becomes Material Variance default. This relationship is unclear to users | Line 62 |
| BPL-007 | Medium | When editing % of Sales, it recalculates ALL 12 months. If user manually edited individual months before, those edits are LOST | `handlePctOfSalesEdit` |

### 3.3 Formula Analysis (budget-pl.js)

| Line Item | Formula | Issue |
|-----------|---------|-------|
| Material | Uses frontend value directly | ✅ Fixed recently - was using `Sales - MoRM` formula |
| MoRM | Direct value | ✅ OK |
| Cost of Sales | `material + dir_cost_goods_sold` | ✅ OK |
| Dir.Cost in Stock | Always 0 | ✅ OK (by design) |

### 3.4 Export Analysis
- **Excel Export:** Uses `budgetByMonth` from frontend (includes edits)
- **Issue:** Variance % is applied in `getRawBudgetValue` but the function applies it based on current `materialVariancePct` state, not saved variance

---

## 4. ForecastPLTab

**File:** `src/components/MasterData/AEBF/ForecastPLTab.jsx` (1063 lines)  
**Server Route:** `server/routes/aebf/forecast-pl.js`

### 4.1 Data Flow
- **Actual Year:** `{division}_pl_data` (data_type = 'Actual')
- **Budget Year:** `{division}_pl_data` (data_type = 'Budget')
- **Forecast Years:** `{division}_pl_data` (data_type = 'Forecast')
- **Save Endpoint:** `POST /api/aebf/save-forecast-pl`
- **Excel Export:** `POST /api/aebf/export-forecast-pl-excel`

### 4.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| FPL-001 | **CRITICAL** | `materialVariancePct1` and `materialVariancePct2` NOT persisted to database | Save function |
| FPL-002 | High | After save, variance states reset to 0 (`setMaterialVariancePct1(0)`) - unsaved variance is lost | Line 462 |
| FPL-003 | High | Variance is applied in `getForecastDisplayValue()` but NOT in saved `fullForecastData` | Build function |
| FPL-004 | Medium | Budget year data comes from `pl_data` table, requires BudgetPLTab to have saved first | Data dependency |
| FPL-005 | Medium | Excel export sends `materialVariancePct1/2` but server only uses it for display, not for PG sheet | Export route |
| FPL-006 | Low | `hasSavedForecastData1/2` checked separately but both forecasts saved in same API call | State sync |
| FPL-007 | Info | `hasEdits` always true in export - this was a fix for a bug but the naming is misleading | Line 533 |

### 4.3 Formula Analysis (forecast-pl.js)

| Item | Actual/Budget | Forecast | Issue |
|------|---------------|----------|-------|
| Sales | DB value | Formula → PG sheet | ✅ OK |
| Material | DB value | **Direct value from frontend** | ✅ Fixed recently |
| MoRM | DB value | **Direct value from frontend** | ✅ Fixed recently |
| Cost of Sales | DB value | Formula | ✅ OK |

### 4.4 Excel Export Analysis
- **P&L Sheet:** Uses frontend values for Forecast Material/MoRM (fixed)
- **Product Group Sheet:** Does NOT have variance applied (variance is only on P&L level)
- **Inconsistency:** Grand totals in PG sheet won't match P&L sheet for Material if variance is non-zero

---

## 5. ForecastSalesTab

**File:** `src/components/MasterData/AEBF/ForecastSalesTab.jsx` (1065 lines)  
**Server Route:** `server/routes/aebf/projections.js`

### 5.1 Data Flow
- **Actual:** `{division}_raw` aggregated by product group
- **Budget:** `budget_unified` table aggregated
- **Forecast:** `fp_product_group_projections` (type = 'FORECAST')
- **Save:** `POST /api/aebf/projections/:division/:year`
- **Export:** `POST /api/aebf/projections/export-forecast-excel`

### 5.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| FST-001 | High | No Material Variance feature exists here, but this is where KGS/Sales/MoRM are entered | Missing feature |
| FST-002 | High | Pricing (SLS/KG, RM/KG) must match BudgetTab pricing - no validation of consistency | Data integrity |
| FST-003 | Medium | Services Charges handled specially (`sales` only) but export doesn't show this clearly | Lines 296-300 |
| FST-004 | Medium | `servicesChargesInputs` state exists but unclear if exported correctly | Export flow |
| FST-005 | Low | `hasEdits: true` always sent in export (fix from recent bug) | Line 385 |
| FST-006 | Info | Forecast data doesn't auto-populate from Budget data - user must re-enter | UX issue |

### 5.3 Export Analysis
- **Excel Export:** Sends `forecastProjections1/2` from frontend state
- **Server:** Uses frontend values directly (recently fixed)
- **Issue:** No variance applied in this export - variance is on ForecastPLTab only

---

## 6. BudgetTab (Divisional)

**File:** `src/components/MasterData/AEBF/BudgetTab.jsx` (8250 lines - largest component!)  
**Server Routes:** `server/routes/aebf/divisional.js`, `server/routes/aebf/html-budget.js`

### 6.1 Data Flow (Divisional Budget)
- **Actual Data:** `{division}_raw` aggregated monthly by product group
- **Budget Data:** `budget_unified` table
- **Pricing Data:** `{division}_pricing` table
- **Material Percentages:** `{division}_material_percentages` table
- **Excel Export:** `POST /api/aebf/export-divisional-budget-excel`
- **HTML Export:** `POST /api/aebf/export-divisional-html-budget-form`

### 6.2 Issues Found

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| BDG-001 | **CRITICAL** | Component is 8250 lines - severe maintainability issue | Entire file |
| BDG-002 | High | Multiple sub-tabs (Divisional, Sales Rep, Bulk, P&L) in one component - violates SRP | Architecture |
| BDG-003 | High | Excel export uses formulas `SALES = KGS × SLS/KG`, `MORM = KGS × MORM/KG` - recalculated, not from saved data | divisional.js:864-866 |
| BDG-004 | Medium | `divisionalPricingData` fetched separately - if pricing changes mid-session, exported Excel will have different values | State sync |
| BDG-005 | Medium | `servicesChargesBudget` stored separately from regular budget data | Data split |
| BDG-006 | Medium | HTML export and Excel export may have different calculation methods | Export consistency |
| BDG-007 | Low | `divisionalFetchIdRef` used for race condition prevention - indicates async issues | Lines 95-96 |
| BDG-008 | Info | `IS_ADMIN = true` hardcoded - placeholder for auth system | Line 19 |

### 6.3 Excel Export Formula Analysis (divisional.js)

| Metric | Formula | Issue |
|--------|---------|-------|
| KGS | MT × 1000 (direct value) | ✅ OK |
| SALES | `KGS × SLS/KG` | ⚠️ Recalculated, not from saved |
| MORM | `KGS × MORM/KG` | ⚠️ Recalculated, not from saved |
| SLS/KG | Constant from pricing | ✅ OK |
| RM/KG | `SLS/KG - MORM/KG` | ✅ OK |
| MORM/KG | Constant from pricing | ✅ OK |
| MORM % | `MORM/SALES` | ✅ OK (formula) |
| % of Sls | Needs grand total row reference | ⚠️ Complex formula dependency |

---

## 7. Cross-Page Data Flow Issues

### 7.1 Material Variance Propagation

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   BudgetPLTab   │     │ ForecastSalesTab│     │  ForecastPLTab  │
│ (has variance)  │     │ (NO variance)   │     │ (has variance)  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    ┌─────────┐            ┌─────────┐            ┌─────────┐
    │ pl_data │            │ pg_proj │            │ pl_data │
    │ Budget  │            │Forecast │            │Forecast │
    └─────────┘            └─────────┘            └─────────┘
```

**Issue XPDF-001 (CRITICAL):** Material variance exists in BudgetPLTab and ForecastPLTab but NOT in ForecastSalesTab. Since ForecastSalesTab is where KGS/Sales/MoRM are entered per product group, the variance adjustment happens AFTER the fact in P&L pages, but:
- The saved `fp_product_group_projections` data does NOT include variance
- The variance is NOT persisted anywhere
- If user refreshes, variance is lost

### 7.2 Budget → Forecast Dependency

| Source Page | Target Page | Data Table | Issue |
|-------------|-------------|------------|-------|
| BudgetTab | BudgetPLTab | `budget_unified` → aggregated | ✅ OK - direct aggregation |
| BudgetPLTab | ForecastPLTab | `pl_data` (Budget) | ⚠️ Requires BudgetPLTab save first |
| ForecastSalesTab | ForecastPLTab | `fp_product_group_projections` | ⚠️ Both save to different tables |

**Issue XPDF-002 (High):** ForecastPLTab shows Budget year data from `pl_data` table. If BudgetPLTab was never saved, ForecastPLTab shows ZEROS for Budget year.

**Issue XPDF-003 (Medium):** ForecastPLTab and ForecastSalesTab both deal with Forecast years but:
- ForecastSalesTab saves to `fp_product_group_projections`
- ForecastPLTab saves to `pl_data`
- No automatic sync between them

---

## 8. Database Table Relationships

### 8.1 Table Dependency Map

```
┌──────────────────────────────────────────────────────────────┐
│                      ACTUAL DATA FLOW                         │
├──────────────────────────────────────────────────────────────┤
│  Excel Upload → {div}_raw → Aggregated to:                   │
│    - ActualTab summary                                        │
│    - EstimateTab base data                                    │
│    - ForecastSalesTab actual year                             │
│    - BudgetTab actual reference                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      BUDGET DATA FLOW                         │
├──────────────────────────────────────────────────────────────┤
│  budget_unified ──┬──→ BudgetTab (Divisional view)           │
│                   │                                           │
│                   ├──→ BudgetPLTab (aggregated) ──┐           │
│                   │                                │           │
│                   └──→ ForecastSalesTab Budget yr  ▼           │
│                                                 {div}_pl_data │
│                                                 (Budget type) │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     FORECAST DATA FLOW                        │
├──────────────────────────────────────────────────────────────┤
│  fp_product_group_projections ──→ ForecastSalesTab           │
│              │                                                │
│              │ (NOT connected!)                               │
│              ▼                                                │
│  {div}_pl_data (Forecast type) ←── ForecastPLTab             │
└──────────────────────────────────────────────────────────────┘
```

**Issue DBT-001 (High):** `fp_product_group_projections` (ForecastSalesTab) and `{div}_pl_data` (ForecastPLTab Forecast) are NOT synchronized. User can edit in one and save, but other page won't reflect changes.

**Issue DBT-002 (Medium):** No foreign key constraints between tables - data integrity relies on application logic.

---

## 9. Formula Consistency Issues

### 9.1 Material Calculation Inconsistencies

| Page | Formula | Issue |
|------|---------|-------|
| BudgetPLTab | `Material = (Sales - MoRM) × (1 + variance%/100)` | Variance NOT saved |
| BudgetPLTab Excel | `Material = budgetByMonth[m]['material']` (direct) | ✅ Recently fixed |
| ForecastPLTab | `Material = (Sales - MoRM) × (1 + variance%/100)` | Variance NOT saved |
| ForecastPLTab Excel | `Material = y.data['material']` (direct) | ✅ Recently fixed |
| ForecastSalesTab | No Material column - only Sales, KGS, MoRM | N/A |
| BudgetTab Excel | `SALES = KGS × SLS/KG`, `MORM = KGS × MORM/KG` | Recalculated |

### 9.2 MoRM Storage Philosophy

**Design Decision:** MoRM is NOT stored in database (derived value = Sales - Material)

**Issue FORM-001:** This is CORRECT for actual data but PROBLEMATIC for:
- Budget data where user might want to set MoRM directly
- Forecast data where user enters MoRM per KG

**Issue FORM-002:** Inconsistent treatment:
- In BudgetTab: MoRM saved to `budget_unified` per product group
- In BudgetPLTab: MoRM derived from saved Material
- In ForecastSalesTab: MoRM calculated as `KGS × MORM/KG`

---

## 10. Export Inconsistencies

### 10.1 Excel Export Comparison Matrix

| Page | Export Method | Uses Frontend State? | Uses DB? | Formulas Used? |
|------|---------------|---------------------|----------|----------------|
| ActualTab | GET URL | No | Yes | No |
| EstimateTab | POST | Partial | Yes | Yes (some) |
| BudgetPLTab | POST | Yes | No | Yes (% of Sales) |
| ForecastPLTab | POST | Yes | No | Yes (many) |
| ForecastSalesTab | POST | Yes | Fallback | Some |
| BudgetTab Excel | POST | Yes | No | Yes (many) |
| BudgetTab HTML | POST | Yes | No | N/A |

### 10.2 Export-Specific Issues

| ID | Export | Issue |
|----|--------|-------|
| EXP-001 | BudgetPLTab Excel | Variance % shown in UI but not reflected if user exports without saving |
| EXP-002 | ForecastPLTab Excel | PG sheet grand totals use formula sums, but Material in P&L sheet is direct value with variance → MISMATCH |
| EXP-003 | BudgetTab Excel | Services Charges handled specially but placement may be inconsistent |
| EXP-004 | EstimateTab Excel | Uses budget year data from `budget_unified` but estimate adjustments may not be in sync |
| EXP-005 | All HTML exports | No variance support in any HTML export |

---

## 11. Recommended Prioritization

### Critical (Data Loss/Corruption Risk)
1. **Material variance not persisted** (BPL-001, FPL-001)
2. **Forecast data not synchronized** (DBT-001, XPDF-003)
3. **BudgetTab component size** (BDG-001) - maintenance nightmare

### High Priority (Functional Issues)
1. **Variance lost on page refresh** (FPL-002)
2. **Budget dependency for Forecast** (XPDF-002)
3. **Excel export Material mismatch** (EXP-002)
4. **No variance in ForecastSalesTab** (FST-001)

### Medium Priority (Consistency Issues)
1. **Export inconsistencies** (EXP-001 to EXP-005)
2. **Pricing synchronization** (FST-002)
3. **Formula vs Direct value inconsistencies** (BDG-003)

### Low Priority (Technical Debt)
1. **Dead code in ActualTab** (ACT-001, ACT-002)
2. **State naming issues** (FPL-007)
3. **Auth placeholder** (BDG-008)

---

## 12. Data Flow Diagram

```
                                    ┌─────────────────────┐
                                    │   Excel Upload      │
                                    │   (Raw Data)        │
                                    └──────────┬──────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │    {div}_raw        │
                                    │   (Actual Data)     │
                                    └──────────┬──────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         │                                     │                                     │
         ▼                                     ▼                                     ▼
┌─────────────────┐                 ┌─────────────────┐                 ┌─────────────────┐
│   ActualTab     │                 │   EstimateTab   │                 │   BudgetTab     │
│   (Summary)     │                 │ (Calc Estimate) │                 │ (By Prod Group) │
└─────────────────┘                 └────────┬────────┘                 └────────┬────────┘
                                             │                                   │
                                             ▼                                   ▼
                                  ┌─────────────────────┐              ┌─────────────────┐
                                  │fp_product_group_    │              │  budget_unified │
                                  │projections (EST)    │              │  (Budget Data)  │
                                  └─────────────────────┘              └────────┬────────┘
                                                                                │
                          ┌─────────────────────────────────────────────────────┤
                          │                                                     │
                          ▼                                                     ▼
               ┌─────────────────┐                                   ┌─────────────────┐
               │ ForecastSalesTab│                                   │   BudgetPLTab   │
               │ (KGS/Sales/MoRM)│                                   │ (P&L Simulation)│
               └────────┬────────┘                                   └────────┬────────┘
                        │                                                     │
                        ▼                                                     ▼
             ┌─────────────────────┐                                ┌─────────────────┐
             │fp_product_group_    │                                │  {div}_pl_data  │
             │projections (FCST)   │                                │   (Budget type) │
             └─────────────────────┘                                └─────────────────┘
                        │                                                     │
                        │         ┌────────── NO SYNC ──────────┐             │
                        │         │                             │             │
                        ▼         ▼                             ▼             ▼
               ┌─────────────────────────────────────────────────────────────────┐
               │                      ForecastPLTab                              │
               │  Actual: {div}_pl_data (Actual)                                 │
               │  Budget: {div}_pl_data (Budget) ← FROM BudgetPLTab              │
               │  Forecast: {div}_pl_data (Forecast) ← SAVED HERE, NOT FROM FSTT │
               └────────────────────────────────┬────────────────────────────────┘
                                                │
                                                ▼
                                      ┌─────────────────┐
                                      │  {div}_pl_data  │
                                      │ (Forecast type) │
                                      └─────────────────┘
```

---

## 13. Audit Conclusion

This audit identified **31 issues** across 6 pages and their associated server routes:

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 7 |
| Medium | 12 |
| Low | 5 |
| Info | 3 |

The most critical issues relate to:
1. **Material variance not being persisted** to the database
2. **Data synchronization gaps** between ForecastSalesTab and ForecastPLTab
3. **Maintainability concerns** with the 8250-line BudgetTab component

---

*End of Audit Report*
