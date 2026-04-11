-- ============================================================
-- PROPACKHUB DATABASE CLEANUP SCRIPT
-- Date: January 25, 2026
-- Purpose: Remove unused/legacy tables after migration
-- ============================================================

-- BACKUP FIRST! Always backup before running this script.

-- ============================================================
-- SECTION 1: LEGACY TABLES TO DROP
-- ============================================================

-- These tables are no longer used after migration to unified tables

-- OLD: fp_sales_rep_budget (replaced by fp_budget_unified)
-- Contains 4,752 rows of old budget data
DROP TABLE IF EXISTS fp_sales_rep_budget CASCADE;

-- OLD: fp_divisional_budget (replaced by fp_budget_unified)
-- Empty table
DROP TABLE IF EXISTS fp_divisional_budget CASCADE;

-- OLD: fp_divisional_budget_draft (replaced by fp_budget_unified_draft)
DROP TABLE IF EXISTS fp_divisional_budget_draft CASCADE;

-- BACKUP tables (no longer needed)
DROP TABLE IF EXISTS fp_material_percentages_backup CASCADE;
DROP TABLE IF EXISTS fp_product_group_pricing_rounding_backup CASCADE;
DROP TABLE IF EXISTS fp_data_excel_backup CASCADE;

-- ============================================================
-- SECTION 2: EMPTY TABLES TO DROP
-- These are 0-row tables that were never used
-- ============================================================

DROP TABLE IF EXISTS ai_learning_data CASCADE;
DROP TABLE IF EXISTS ai_training_history CASCADE;
DROP TABLE IF EXISTS fp_ai_model_performance CASCADE;
DROP TABLE IF EXISTS fp_ai_model_weights CASCADE;
DROP TABLE IF EXISTS fp_ai_recommendations CASCADE;
DROP TABLE IF EXISTS fp_ai_report_feedback CASCADE;
DROP TABLE IF EXISTS fp_ai_report_insights CASCADE;
DROP TABLE IF EXISTS fp_ai_report_log CASCADE;
DROP TABLE IF EXISTS fp_ai_training_history CASCADE;
DROP TABLE IF EXISTS fp_customer_merge_rules CASCADE;
DROP TABLE IF EXISTS fp_customer_similarity_cache CASCADE;
DROP TABLE IF EXISTS fp_database_upload_log CASCADE;
DROP TABLE IF EXISTS fp_forecast_sales CASCADE;
DROP TABLE IF EXISTS fp_insight_feedback CASCADE;
DROP TABLE IF EXISTS fp_insight_performance CASCADE;
DROP TABLE IF EXISTS fp_item_group_overrides CASCADE;
DROP TABLE IF EXISTS fp_learned_weights CASCADE;
DROP TABLE IF EXISTS fp_merge_rule_notifications CASCADE;
DROP TABLE IF EXISTS fp_model_calibration CASCADE;
DROP TABLE IF EXISTS fp_model_performance CASCADE;
DROP TABLE IF EXISTS fp_product_forecasts CASCADE;
DROP TABLE IF EXISTS fp_product_group_estimates CASCADE;
DROP TABLE IF EXISTS fp_prospect_conversion_log CASCADE;
DROP TABLE IF EXISTS fp_raw_product_groups CASCADE;
DROP TABLE IF EXISTS fp_recommendation_feedback CASCADE;
DROP TABLE IF EXISTS fp_sales_rep_group_budget_history CASCADE;
DROP TABLE IF EXISTS fp_transaction_similarity_cache CASCADE;
DROP TABLE IF EXISTS pending_country_assignments CASCADE;
DROP TABLE IF EXISTS sales_rep_aliases CASCADE;
DROP TABLE IF EXISTS transaction_similarity_cache CASCADE;

-- ============================================================
-- SECTION 3: VERIFICATION QUERIES
-- Run these after cleanup to verify
-- ============================================================

-- Count remaining tables
SELECT COUNT(*) as remaining_tables 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- List all remaining tables with row counts
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================================
-- NOTES:
-- ============================================================
-- 
-- KEEP these tables (actively used):
-- - fp_actualcommon (main actual data)
-- - fp_raw_oracle (Oracle ERP sync)
-- - fp_budget_unified (all budget data)
-- - fp_budget_unified_draft (draft budgets)
-- - fp_customer_unified (master customers)
-- - fp_sales_rep_unified (master sales reps)
-- - fp_product_group_unified (master product groups)
-- - fp_budget_customer_unified (budget customer aggregation)
-- - sales_rep_groups + sales_rep_group_members (MDM)
-- - fp_division_customer_merge_rules (MDM)
-- - fp_product_group_exclusions (MDM)
-- - master_countries (reference)
-- - divisions (configuration)
-- - users (authentication)
-- - All AI/ML support tables with data
-- 
-- Tables marked for removal:
-- - Legacy tables replaced by unified tables
-- - Backup tables
-- - Empty tables never used
-- ============================================================
