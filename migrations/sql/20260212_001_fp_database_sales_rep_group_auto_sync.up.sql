-- Migration: Auto-sync sales_rep_group_name across all data tables when a group is renamed
-- This trigger ensures that renaming a group in sales_rep_groups automatically
-- updates all references in data tables (fp_actualcommon, fp_budget_unified, etc.)

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_update_group_name_in_data_tables ON sales_rep_groups CASCADE;
DROP FUNCTION IF EXISTS fn_update_group_name_in_data_tables() CASCADE;

-- Create the trigger function
CREATE OR REPLACE FUNCTION fn_update_group_name_in_data_tables()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the group_name actually changed
  IF OLD.group_name IS DISTINCT FROM NEW.group_name THEN
    
    RAISE NOTICE 'Sales rep group renamed: "%" -> "%"', OLD.group_name, NEW.group_name;
    
    UPDATE fp_actualcommon
    SET sales_rep_group_name = NEW.group_name
    WHERE sales_rep_group_id = NEW.id;
    
    UPDATE fp_customer_unified
    SET sales_rep_group_name = NEW.group_name
    WHERE sales_rep_group_id = NEW.id;
    
    UPDATE fp_budget_unified
    SET sales_rep_group_name = NEW.group_name
    WHERE sales_rep_group_id = NEW.id;
    
    UPDATE fp_budget_customer_unified
    SET sales_rep_group_name = NEW.group_name
    WHERE sales_rep_group_id = NEW.id;
    
    UPDATE fp_sales_rep_group_budget_allocation
    SET sales_rep_group_name = NEW.group_name
    WHERE sales_rep_group_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_update_group_name_in_data_tables
AFTER UPDATE ON sales_rep_groups
FOR EACH ROW
EXECUTE FUNCTION fn_update_group_name_in_data_tables();
