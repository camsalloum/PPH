-- Migration: Fix stale sales_rep_group_name values in data tables
-- Ensures all sales_rep_group_name values match the current name in sales_rep_groups

-- Fix any records where group_id exists but name is stale
UPDATE fp_actualcommon ac
SET sales_rep_group_name = g.group_name
FROM sales_rep_groups g
WHERE ac.sales_rep_group_id = g.id
  AND ac.sales_rep_group_name IS DISTINCT FROM g.group_name;

UPDATE fp_customer_unified cu
SET sales_rep_group_name = g.group_name
FROM sales_rep_groups g
WHERE cu.sales_rep_group_id = g.id
  AND cu.sales_rep_group_name IS DISTINCT FROM g.group_name;

UPDATE fp_budget_unified bu
SET sales_rep_group_name = g.group_name
FROM sales_rep_groups g
WHERE bu.sales_rep_group_id = g.id
  AND bu.sales_rep_group_name IS DISTINCT FROM g.group_name;

UPDATE fp_budget_customer_unified bcu
SET sales_rep_group_name = g.group_name
FROM sales_rep_groups g
WHERE bcu.sales_rep_group_id = g.id
  AND bcu.sales_rep_group_name IS DISTINCT FROM g.group_name;

UPDATE fp_sales_rep_group_budget_allocation sba
SET sales_rep_group_name = g.group_name
FROM sales_rep_groups g
WHERE sba.sales_rep_group_id = g.id
  AND sba.sales_rep_group_name IS DISTINCT FROM g.group_name;

-- Fix NULL group_ids where group_name matches an existing group
UPDATE fp_budget_unified bu
SET sales_rep_group_id = g.id
FROM sales_rep_groups g
WHERE bu.sales_rep_group_id IS NULL
  AND bu.sales_rep_group_name IS NOT NULL
  AND LOWER(TRIM(bu.sales_rep_group_name)) = LOWER(TRIM(g.group_name));
