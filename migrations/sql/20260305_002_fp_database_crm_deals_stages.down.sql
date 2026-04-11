-- Rollback: CRM Deal Stages
-- Reverts to generic CRM stages

-- Step 1: Convert back to old stage values
UPDATE crm_deals SET stage = 'qualified' WHERE stage = 'interest';
UPDATE crm_deals SET stage = 'proposal' WHERE stage = 'sample_analysis';
UPDATE crm_deals SET stage = 'negotiation' WHERE stage IN ('quotation', 'sample_approval');
UPDATE crm_deals SET stage = 'won' WHERE stage = 'confirmed';
-- 'lost' remains unchanged

-- Step 2: Drop new constraint
ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check;

-- Step 3: Re-add old constraint
ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_stage_check 
  CHECK (stage IN ('qualified', 'proposal', 'negotiation', 'won', 'lost'));
