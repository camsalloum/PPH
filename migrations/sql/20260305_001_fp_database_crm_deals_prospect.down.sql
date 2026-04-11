-- Rollback: CRM Deal Pipeline v2
-- Removes prospect_id and description columns from crm_deals

DROP INDEX IF EXISTS idx_crm_deals_prospect;
ALTER TABLE crm_deals DROP COLUMN IF EXISTS prospect_id;
ALTER TABLE crm_deals DROP COLUMN IF EXISTS description;
