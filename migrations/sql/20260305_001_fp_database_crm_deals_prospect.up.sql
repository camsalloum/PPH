-- CRM Deal Pipeline v2: Add prospect_id + description columns
-- ROLLBACK: SAFE (additive only)
--
-- Changes:
--   1. Add prospect_id column (deals can be linked to prospects)
--   2. Add description column for notes
--   3. Create index for prospect lookups

-- Add prospect_id column (nullable FK to fp_prospects)
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS prospect_id INTEGER REFERENCES fp_prospects(id) ON DELETE SET NULL;

-- Add description column
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS description TEXT;

-- Create index for prospect lookups
CREATE INDEX IF NOT EXISTS idx_crm_deals_prospect ON crm_deals(prospect_id);

-- Add inquiry_id if missing (from earlier migration)
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS inquiry_id INTEGER;
