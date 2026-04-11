# Divisional Dashboard — Data Lineage (as of 2025-12-16)

This document maps each Divisional Dashboard card (overlay/detail view) to its data sources.

## Core building blocks

### 1) Period selection (frontend state)
- Source: `FilterContext`
- File: src/contexts/FilterContext.js
- Key fields:
  - `columnOrder[]`: array of selected periods.
    - Each period contains `{ year, month, type, months, isCustomRange, displayName, id, customColor }`.
    - `months` is the canonical list of month *names* included in the period.
  - `basePeriodIndex`: index into `columnOrder`.
  - `dataGenerated`: gate for rendering charts/tables (user must click Generate).

### 2) Financial Excel data (per-division)
- Source: `ExcelDataContext`
- File: src/contexts/ExcelDataContext.js
- Network:
  - Loads the workbook from `/api/financials/{division}.xlsx` (where `{division}` is `selectedDivision.toLowerCase()`).
- Data shape:
  - `excelData` is an object of `{ [sheetName: string]: any[][] }`.
  - Most dashboard cards read `divisionData = excelData[selectedDivision]`.

### 3) Shared cell aggregation logic
- Source: `computeCellValue`
- File: src/utils/computeCellValue.js
- Behavior:
  - Finds matching columns in the division sheet where:
    - `divisionData[0][c] == column.year`
    - `divisionData[1][c]` is in `column.months` (month names)
    - `divisionData[2][c]` matches `column.type` (case-insensitive)
  - Sums numeric values from `divisionData[rowIndex][c]` across all matched columns.

## Cards / overlays

### A) KPI Executive Summary
- Component: src/components/dashboard/KPIExecutiveSummary.js
- Inputs:
  - `useExcelData()` → `excelData`, `selectedDivision`
  - `useFilter()` → `columnOrder`, `basePeriodIndex`, `dataGenerated`
- Financial KPIs are Excel-driven:
  - Sales: row `3`
  - Gross Profit: row `19`
  - Net Profit: row `54`
  - EBITDA: row `56`
  - Previous period values are computed from the period immediately before base period (`basePeriodIndex - 1`).
- FP-only DB/API enrichments (no Excel fallback for FP):
  - Product performance: `POST /api/fp/product-performance`
    - body includes `currentPeriod` + `comparisonPeriod` based on `columnOrder`.
  - Geographic distribution: `POST /api/geographic-distribution`
    - body uses `year`, `months` (month integers), `type`.
  - Customer insights: `POST /api/customer-insights-db`
    - body uses `year`, `months` (month integers), `type`.
- Important limitation:
  - The component currently returns a "database integration required" message for non-FP divisions.

### B) Sales & Volume Analysis
- Detail component: src/components/dashboard/SalesVolumeDetail.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- Rows used:
  - Sales: `3`
  - Material: `5`
  - Sales Volume (kg): `7`
  - Production Volume (kg): `8`
- Rendering: chart component `BarChart` (src/components/charts/components/BarChart.js).

### C) Margin over Material Analysis
- Detail component: src/components/dashboard/MarginAnalysisDetail.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- Rows used:
  - Sales: `3`
  - Material: `5`
  - Sales Volume (kg): `7`
  - Production Volume (kg): `8`
- Rendering: `ModernMarginGauge` (src/components/charts/components/ModernMarginGauge.js).

### D) Manufacturing Cost
- Detail component: src/components/dashboard/ManufacturingCostDetail.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- Rendering: `ManufacturingCostChart` (src/components/charts/components/ManufacturingCostChart.tsx)
- Row indices used by the chart:
  - Labour: `9`
  - Depreciation: `10`
  - Electricity: `12`
  - Others Mfg. Overheads: `13`
  - Total Actual Direct Cost: `14`
  - Sales (for %/Sales): `3`
  - Sales Volume (for /kg): `7`

### E) Below GP Expenses
- Detail component: src/components/dashboard/BelowGPExpensesDetail.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- Rendering: `BelowGPExpensesChart` (src/components/charts/components/BelowGPExpensesChart.tsx)
- Row indices used by the chart:
  - Selling expenses: `31`
  - Transportation: `32`
  - Administration: `40`
  - Bank interest: `42`
  - Total Below GP Expenses: `52`
  - Sales (for %/Sales): `3`
  - Sales Volume (for /kg): `7`

### F) Combined Trends (Expenses + Profitability)
- Detail component: src/components/dashboard/CombinedTrendsDetail.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- Expense trend chart: src/components/charts/components/ExpencesChart.js
  - Uses KPI row: `52` (Total Below GP Expenses)
  - Uses Sales row `3` for %/Sales and Sales Volume row `7` for /kg.
- Profit trend chart: src/components/charts/components/Profitchart.js
  - Net Profit: row `54`
  - EBITDA: row `56`
  - EBIT is calculated as (row `54` + row `42`).
  - Uses Sales row `3` for %/Sales and Sales Volume row `7` for /kg.

### G) Profit & Loss Statement
- Detail component: src/components/dashboard/PLFinancialDetail.js
- Table component: src/components/dashboard/TableView.js
- Data source: Excel via `excelData[selectedDivision]` + `computeCellValue`.
- TableView uses the shared `computeCellValue` util, then formats:
  - Amount values (with locale formatting)
  - `% of Sales` computed vs row `3` (Sales)
  - "per kg" computed vs row `7` (Sales Volume)
- Central constants: src/components/dashboard/utils/FinancialConstants.js

### H) Product Groups
- Detail component: src/components/dashboard/ProductGroupDetail.js
- Table component: src/components/dashboard/ProductGroupTable.js
- FP-only DB/API data source (when `dataGenerated` is true and `columnOrder` is non-empty):
  - `GET /api/product-groups/fp?year=...&type=...&months=[...]`
  - Called once per selected period (parallelized).
  - Months are converted to month integers.

### I) Sales by Sales Reps
- Detail component: src/components/dashboard/SalesRepDetail.js
- Table component: src/components/dashboard/SalesBySalesRepDivisional.js
- DB/API data sources:
  - `GET http://localhost:3001/api/sales-rep-groups-universal?division=...`
  - `GET http://localhost:3001/api/sales-reps-universal?division=...`
  - `POST http://localhost:3001/api/sales-rep-divisional-ultra-fast`
    - body includes `division`, `salesReps`, and `columns[]` built from the selected periods.

### J) Sales by Customers
- Detail component: src/components/dashboard/SalesCustomerDetail.js
- Table component: src/components/dashboard/SalesByCustomerTableNew.js
- DB/API data sources:
  - `GET http://localhost:3001/api/division-merge-rules/rules?division=...` (division-wide merge rules)
  - `GET http://localhost:3001/api/customer-sales-rep-mapping?division=...`
  - Sales data is fetched from DB endpoints (file contains calls to `sales-by-customer-db` and `sales-by-customer-ultra-fast`).

### K) Sales by Countries (Table / Chart / Map)
- Detail component: src/components/dashboard/SalesCountryDetail.js
- Sub-views:
  1) Table: src/components/dashboard/SalesByCountryTable.js
     - FP-only fetch: `POST /api/sales-by-country-db` per selected period.
  2) Chart: src/components/dashboard/SalesCountryChart.js
     - `GET http://localhost:3001/api/countries-db?division=...`
     - `POST http://localhost:3001/api/sales-by-country-db` per selected period.
     - Note: chart fetch is guarded to FP only.
  3) Map: src/components/dashboard/SalesCountryLeafletMap.js
     - `GET http://localhost:3001/api/countries-db?division=...`
     - `POST http://localhost:3001/api/sales-by-country-db` for the selected period.
     - Potential issue: the request body uses `months: [periodColumn.month]` (which may be a string like "January" or "Q1" instead of month integers/array).

## Notes / common pitfalls
- Mixed API base URLs:
  - Some components use relative `/api/...` while others hardcode `http://localhost:3001/...`.
  - If the frontend is served from a different host/port, the hardcoded ones can break or bypass proxy/CORS expectations.
- FP-only behavior is common for DB-driven cards.
- Almost all Excel-driven metrics ultimately depend on the sheet header rows:
  - Row 0 = year, row 1 = month name, row 2 = type.
