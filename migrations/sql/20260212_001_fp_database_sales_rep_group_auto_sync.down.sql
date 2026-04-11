-- Rollback: Remove the auto-sync trigger
DROP TRIGGER IF EXISTS trg_update_group_name_in_data_tables ON sales_rep_groups CASCADE;
DROP FUNCTION IF EXISTS fn_update_group_name_in_data_tables() CASCADE;
