-- Rollback: Performance Indexes
DROP INDEX IF EXISTS idx_activity_log_inquiry_created;
DROP INDEX IF EXISTS idx_mpi_stage_div;
DROP INDEX IF EXISTS idx_quotations_inquiry_status;
DROP INDEX IF EXISTS idx_cse_inquiry_status;
DROP INDEX IF EXISTS idx_samples_inquiry_status;
DROP INDEX IF EXISTS idx_prospects_group_div_status;
DROP SEQUENCE IF EXISTS quot_fp_seq;
DROP SEQUENCE IF EXISTS pi_fp_seq;
