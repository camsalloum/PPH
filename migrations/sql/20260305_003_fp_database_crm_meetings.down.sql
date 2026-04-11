-- Rollback: CRM Meetings Table
DROP INDEX IF EXISTS idx_crm_meetings_customer;
DROP INDEX IF EXISTS idx_crm_meetings_status;
DROP INDEX IF EXISTS idx_crm_meetings_date;
DROP INDEX IF EXISTS idx_crm_meetings_assigned;
DROP TABLE IF EXISTS crm_meetings CASCADE;
