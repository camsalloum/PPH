-- DESCRIPTION: Roll back baseline QC RM seed parameters
-- ROLLBACK: SAFE
-- DATA LOSS: PARTIAL (only seed rows from this migration)

DELETE FROM qc_rm_test_parameters
WHERE created_by_name = 'QC Matrix Seed v1';

-- Supplier tiers are intentionally not deleted in rollback.
-- They may have been updated by QC users after seeding and are treated as operational data.
