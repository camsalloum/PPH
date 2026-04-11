-- Rollback: CRM Calls Table
DROP INDEX IF EXISTS idx_crm_calls_customer;
DROP INDEX IF EXISTS idx_crm_calls_status;
DROP INDEX IF EXISTS idx_crm_calls_date;
DROP INDEX IF EXISTS idx_crm_calls_assigned;
DROP TABLE IF EXISTS crm_calls CASCADE;
