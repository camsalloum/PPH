-- ROLLBACK: 20260618_001_fp_database_qc_incoming_rm_workflow
-- ROLLBACK: SAFE
-- DATA LOSS: YES (drops incoming RM QC workflow tables and related objects)

DROP INDEX IF EXISTS idx_qc_supplier_tiers_tier;
DROP INDEX IF EXISTS idx_qc_rm_activity_incoming;
DROP INDEX IF EXISTS idx_qc_rm_test_results_incoming_param;
DROP INDEX IF EXISTS idx_qc_rm_test_results_parameter;
DROP INDEX IF EXISTS idx_qc_rm_test_results_incoming;
DROP INDEX IF EXISTS uq_qc_rm_test_parameters_material_code;
DROP INDEX IF EXISTS idx_qc_rm_test_params_material;
DROP INDEX IF EXISTS idx_qc_rm_incoming_supplier;
DROP INDEX IF EXISTS idx_qc_rm_incoming_received_date;
DROP INDEX IF EXISTS idx_qc_rm_incoming_material;
DROP INDEX IF EXISTS idx_qc_rm_incoming_status;
DROP INDEX IF EXISTS idx_qc_rm_incoming_sync_id;

DROP TRIGGER IF EXISTS trg_qc_supplier_tiers_updated ON qc_supplier_tiers;
DROP TRIGGER IF EXISTS trg_qc_rm_test_results_updated ON qc_rm_test_results;
DROP TRIGGER IF EXISTS trg_qc_rm_test_parameters_updated ON qc_rm_test_parameters;
DROP TRIGGER IF EXISTS trg_qc_rm_incoming_updated ON qc_rm_incoming;

DROP TABLE IF EXISTS qc_rm_activity_log;
DROP TABLE IF EXISTS qc_rm_test_results;
DROP TABLE IF EXISTS qc_rm_test_parameters;
DROP TABLE IF EXISTS qc_supplier_tiers;
DROP TABLE IF EXISTS qc_rm_incoming;

DROP FUNCTION IF EXISTS trg_set_qc_rm_updated_at();
DROP FUNCTION IF EXISTS generate_qc_rm_lot_id(TEXT);
DROP SEQUENCE IF EXISTS qc_rm_lot_seq;
