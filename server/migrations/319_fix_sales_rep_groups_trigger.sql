-- Migration 319: Fix sync_sales_rep_groups_to_unified trigger function
-- The function was referencing OLD.sales_rep_name but the column is actually member_name

CREATE OR REPLACE FUNCTION sync_sales_rep_groups_to_unified()
RETURNS TRIGGER AS $$
DECLARE
  v_group_name TEXT;
  v_sales_rep_name TEXT;
BEGIN
  -- Handle INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    v_sales_rep_name := OLD.member_name;  -- FIX: was sales_rep_name, but column is member_name
  ELSE
    v_sales_rep_name := NEW.member_name;  -- FIX: was sales_rep_name, but column is member_name
    
    -- Get group name
    SELECT group_name INTO v_group_name
    FROM sales_rep_groups
    WHERE id = NEW.group_id;
  END IF;
  
  -- Update fp_customer_unified for customers with this sales rep
  UPDATE fp_customer_unified cu
  SET 
    sales_rep_group_id = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.group_id END,
    sales_rep_group_name = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_group_name END
  WHERE UPPER(TRIM(cu.primary_sales_rep_name)) = UPPER(TRIM(v_sales_rep_name));
  
  -- Update fp_budget_customer_unified
  UPDATE fp_budget_customer_unified bu
  SET 
    sales_rep_group_id = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.group_id END,
    sales_rep_group_name = CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_group_name END
  WHERE UPPER(TRIM(bu.primary_sales_rep_name)) = UPPER(TRIM(v_sales_rep_name));
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 319 complete: Fixed sync_sales_rep_groups_to_unified function';
  RAISE NOTICE '  - Changed sales_rep_name to member_name (correct column name)';
END $$;
