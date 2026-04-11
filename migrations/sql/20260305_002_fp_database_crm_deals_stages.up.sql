-- CRM Deal Stages: Packaging Business Flow
-- Converts generic stages to packaging-specific workflow:
-- qualified -> interest (Interest & Data Collection)
-- proposal -> sample_analysis (Sample Analysis/Estimation)
-- negotiation -> quotation (Quotation & Price Approval)
-- won -> confirmed (Confirmed)
-- NEW: sample_approval (Sample Approval)

-- Step 1: Convert existing stage values to new format
UPDATE crm_deals SET stage = 'interest' WHERE stage = 'qualified';
UPDATE crm_deals SET stage = 'sample_analysis' WHERE stage = 'proposal';
UPDATE crm_deals SET stage = 'quotation' WHERE stage = 'negotiation';
UPDATE crm_deals SET stage = 'confirmed' WHERE stage = 'won';
-- 'lost' remains unchanged

-- Step 2: Drop old constraint if exists
ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check;

-- Step 3: Add new constraint with packaging-specific stages
ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_stage_check 
  CHECK (stage IN ('interest', 'sample_analysis', 'quotation', 'sample_approval', 'confirmed', 'lost'));
