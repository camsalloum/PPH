-- Rollback: CRM Worklist Preferences Table
DROP INDEX IF EXISTS idx_crm_worklist_pref_type;
DROP INDEX IF EXISTS idx_crm_worklist_pref_user;
DROP TABLE IF EXISTS crm_worklist_preferences CASCADE;
