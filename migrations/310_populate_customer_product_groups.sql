-- Migration 310: Populate Customer Product Groups
-- The columns exist but were never filled with actual data from fp_data_excel

-- Update primary_product_group (most sold product group per customer)
WITH customer_pg_stats AS (
    SELECT 
        c.customer_id,
        d."Product Group" as product_group,
        SUM(COALESCE(d."Values", 0)) as total_value,
        ROW_NUMBER() OVER (PARTITION BY c.customer_id ORDER BY SUM(COALESCE(d."Values", 0)) DESC) as rn
    FROM fp_customer_unified c
    JOIN fp_data_excel d ON UPPER(TRIM(d."Customer Name")) = c.normalized_name
    WHERE d."Product Group" IS NOT NULL
    GROUP BY c.customer_id, d."Product Group"
)
UPDATE fp_customer_unified c
SET primary_product_group = pg.product_group
FROM customer_pg_stats pg
WHERE c.customer_id = pg.customer_id
AND pg.rn = 1;

-- Update product_groups array (all distinct product groups per customer)
WITH customer_all_pgs AS (
    SELECT 
        c.customer_id,
        ARRAY_AGG(DISTINCT d."Product Group" ORDER BY d."Product Group") as all_pgs
    FROM fp_customer_unified c
    JOIN fp_data_excel d ON UPPER(TRIM(d."Customer Name")) = c.normalized_name
    WHERE d."Product Group" IS NOT NULL
    GROUP BY c.customer_id
)
UPDATE fp_customer_unified c
SET product_groups = pg.all_pgs
FROM customer_all_pgs pg
WHERE c.customer_id = pg.customer_id;

-- Verify the update
SELECT 
    COUNT(*) as total_customers,
    COUNT(primary_product_group) as has_primary_pg,
    COUNT(CASE WHEN array_length(product_groups, 1) > 0 THEN 1 END) as has_product_groups
FROM fp_customer_unified;
