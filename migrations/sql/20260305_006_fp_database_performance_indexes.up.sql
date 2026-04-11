-- Performance Indexes for Pipeline and CRM queries
-- Improves: lateral joins, quotation lookups, prospect filtering

-- Pipeline activity log performance
CREATE INDEX IF NOT EXISTS idx_activity_log_inquiry_created
ON mes_presales_activity_log(inquiry_id, created_at DESC);

-- Inquiry filtering by stage
CREATE INDEX IF NOT EXISTS idx_mpi_stage_div
ON mes_presales_inquiries(inquiry_stage, division)
WHERE deleted_at IS NULL;

-- Quotation lookup per inquiry
CREATE INDEX IF NOT EXISTS idx_quotations_inquiry_status
ON mes_quotations(inquiry_id, status);

-- CSE count laterals
CREATE INDEX IF NOT EXISTS idx_cse_inquiry_status
ON mes_cse_reports(inquiry_id, final_status);

-- Sample count laterals
CREATE INDEX IF NOT EXISTS idx_samples_inquiry_status
ON mes_presales_samples(inquiry_id, status);

-- Prospect filtering
CREATE INDEX IF NOT EXISTS idx_prospects_group_div_status
ON fp_prospects(sales_rep_group, division, approval_status);

-- Sequences for quotation and PI number generation (race-condition safe)
CREATE SEQUENCE IF NOT EXISTS quot_fp_seq START 1;
CREATE SEQUENCE IF NOT EXISTS pi_fp_seq START 1;
