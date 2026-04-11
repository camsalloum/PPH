/**
 * AEBF Data Flow Review After Migration
 * 
 * Status: After admin_division_code denormalization
 * 
 * KEY TABLES:
 * - fp_actualcommon: Raw transaction data with admin_division_code denormalized
 * - fp_budget_unified: Budget planning data with admin_division_code denormalized
 * - fp_data_excel: Legacy table for Excel upload history (NOT recommended for queries)
 * - company_divisions: Maps division_code (FP, BF) to admin_division_code (FP, HC, etc.)
 * 
 * CRITICAL FIX: All WHERE clauses must use:
 *   WHERE UPPER(admin_division_code) = UPPER($1)
 * Instead of the old array filtering pattern
 * ===================================================
 * 
 * 1. ENDPOINTS - YEAR FILTERING
 * ===================================================
 * 
 * ✅ GET /api/aebf/html-budget-actual-years
 * - Queries: fp_actualcommon.year (with admin_division_code filter)
 * - Used by: BudgetTab.jsx divisionalHtmlActualYears dropdown
 * - Returns: Distinct years available in actual data
 * - FIXED: Now queries fp_actualcommon instead of fp_data_excel
 * 
 * ✅ GET /api/aebf/html-budget-budget-years (NEW)
 * - Queries: fp_budget_unified.budget_year (with admin_division_code filter)
 * - Used by: Backend logic to find fallback budget years
 * - Returns: Distinct budget_year values from budget table
 * - ADDED: New endpoint for proper budget year discovery
 * 
 * ✅ GET /api/aebf/filter-options?type=Actual
 * - Queries: fp_actualcommon (for Actual type)
 * - Returns: Distinct values for year, month_no, divisions, pgcombine
 * - Used by: Frontend filter dropdowns
 * - FIXED: Now queries fp_actualcommon instead of fp_data_excel
 * 
 * ✅ GET /api/aebf/filter-options?type=Budget
 * - Queries: fp_budget_unified (for Budget type)
 * - Returns: Distinct values for budget_year only
 * - Used by: Budget filtering
 * - ADDED: Separate handling for Budget vs Actual
 * 
 * ===================================================
 * 2. ENDPOINTS - DATA RETRIEVAL
 * ===================================================
 * 
 * ✅ POST /api/aebf/divisional-html-budget-data
 * - Actual data: Queries fp_actualcommon with admin_division_code filter
 * - Budget year logic: 
 *   1. Default to actualYear + 1
 *   2. If not exists in fp_budget_unified, use latest available year
 * - Returns: Product group aggregations with pricing
 * - FIXED: Uses fp_actualcommon, proper budget year fallback
 * 
 * ⚠️  GET /api/aebf/actual
 * - Status: Uses fp_data_excel (legacy historical data)
 * - Purpose: Display actual transaction history
 * - NOTE: This is for historical reference only, not for current year planning
 * - RECOMMENDATION: Can stay as-is since it's for historical view
 * 
 * ===================================================
 * 3. FLOW MAPPING
 * ===================================================
 * 
 * USER FLOW: Divisional Budget Page
 * ─────────────────────────────────
 * 1. User selects Division → Sets selectedDivision context
 * 2. fetchDivisionalHtmlActualYears() called
 *    → GET /api/aebf/html-budget-actual-years?division=FP
 *    → Returns years from fp_actualcommon
 * 3. User selects actualYear from dropdown
 * 4. fetchDivisionalHtmlTableData() called
 *    → POST /api/aebf/divisional-html-budget-data
 *    → Sends: {division, actualYear, budgetYear: actualYear + 1}
 *    → Backend checks if budgetYear exists in fp_budget_unified
 *    → If not, fetches from html-budget-budget-years endpoint
 *    → Returns: Actual data from fp_actualcommon aggregated by PG
 *    → Returns: Budget data from fp_budget_unified for that year
 * 5. Table displays with actual vs budget
 * 
 * ===================================================
 * 4. DATABASE QUERIES - COMMON PATTERNS
 * ===================================================
 * 
 * CORRECT PATTERN (After denormalization):
 * ────────────────────────────────────────
 * SELECT ...
 * FROM fp_actualcommon a
 * WHERE UPPER(a.admin_division_code) = UPPER($1)
 *   AND a.year = $2
 * 
 * WRONG PATTERN (Old array filtering):
 * ────────────────────────────────────
 * SELECT ...
 * FROM fp_actualcommon a
 * WHERE a.division_code = ANY($1::text[])  ← SLOW, WRONG
 * 
 * CRITICAL COLUMNS:
 * ─────────────────
 * fp_actualcommon:
 *   - admin_division_code: Denormalized from company_divisions (e.g., 'FP')
 *   - division_code: Original code (e.g., 'FP', 'BF' - multiple per admin code)
 *   - pgcombine: Product group name
 *   - amount: Sales amount
 *   - qty_kgs: Quantity in KGS
 *   - morm: Margin or measure value
 *   - month_no: Month (1-12)
 *   - year: Year (e.g., 2025)
 * 
 * fp_budget_unified:
 *   - admin_division_code: Denormalized division code
 *   - budget_year: Budget year
 *   - pgcombine: Product group (should match actual)
 *   - values: Budget amount
 *   - values_type: AMOUNT, KGS, MORM
 * 
 * ===================================================
 * 5. CHECKLIST - DATA INTEGRITY
 * ===================================================
 * 
 * ✅ All queries use admin_division_code denormalized column
 * ✅ Filter endpoints return correct years from source tables
 * ✅ Budget year defaults to actualYear + 1 with fallback
 * ✅ Divisional budget uses fp_actualcommon for actual data
 * ✅ Divisional budget uses fp_budget_unified for budget data
 * ✅ Division FP maps to both FP and BF oracle codes
 * ✅ No more fp_data_excel in critical paths (only for legacy views)
 * 
 * ===================================================
 * 6. REMAINING REFERENCES TO fp_data_excel
 * ===================================================
 * 
 * The following files still reference fp_data_excel and are OK to keep:
 * - server/routes/aebf/actual.js: GET /actual (legacy historical view)
 * - server/routes/aebf/budget.js: Direct Excel upload/management
 * - server/routes/aebf/html-budget.js: Old index creation (can be removed)
 * - server/routes/aebf/health.js: Health check (can stay)
 * - server/routes/aebf/reports.js: Legacy reports (can stay)
 * 
 * NOTE: These are for historical data and admin functions, not for
 * the current year divisional budget planning, so they don't affect
 * the critical flow.
 * 
 * ===================================================
 * 7. TESTING CHECKLIST
 * ===================================================
 * 
 * [ ] Divisional Budget page loads actual years from fp_actualcommon
 * [ ] Product groups display correctly for selected year
 * [ ] Budget year defaults to actualYear + 1
 * [ ] If budget year doesn't exist, shows last available year
 * [ ] Monthly actual values display from fp_actualcommon
 * [ ] Budget editing/saving works with fp_budget_unified
 * [ ] Services Charges excluded from main totals
 * [ ] Pricing data displays correctly
 * [ ] No console errors about missing columns
 * [ ] Division FP includes data from both FP and BF oracle codes
 * [ ] Performance is acceptable (denormalization should improve it)
 */
