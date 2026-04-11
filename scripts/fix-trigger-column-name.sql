-- Fix the sync trigger function - correct column name (countryname, not country)
CREATE OR REPLACE FUNCTION sync_unified_on_data_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When new data is inserted into fp_data_excel, update the related unified records
    
    -- Update unified_customers totals for the affected customer
    UPDATE unified_customers uc
    SET 
        total_amount = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND values_type = 'AMOUNT'
              AND division = uc.division
        ), 0),
        total_kgs = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND values_type = 'KGS'
              AND division = uc.division
        ), 0),
        record_count = (
            SELECT COUNT(DISTINCT (year, month))
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND division = uc.division
        ),
        first_transaction_date = COALESCE((
            SELECT MIN(make_date(year, month, 1))
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND division = uc.division
        ), uc.first_transaction_date),
        last_transaction_date = COALESCE((
            SELECT MAX(make_date(year, month, 1))
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND division = uc.division
        ), uc.last_transaction_date),
        years_active = (
            SELECT array_agg(DISTINCT year ORDER BY year)
            FROM fp_data_excel 
            WHERE UPPER(TRIM(customername)) = uc.customer_name_normalized
              AND division = uc.division
        ),
        updated_at = NOW()
    WHERE uc.customer_name_normalized = UPPER(TRIM(NEW.customername))
      AND uc.division = NEW.division;

    -- Update unified_sales_reps totals for the affected rep
    UPDATE unified_sales_reps usr
    SET 
        total_amount = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(salesrepname)) = usr.rep_name_normalized
              AND values_type = 'AMOUNT'
              AND division = usr.division
        ), 0),
        total_kgs = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(salesrepname)) = usr.rep_name_normalized
              AND values_type = 'KGS'
              AND division = usr.division
        ), 0),
        customer_count = (
            SELECT COUNT(DISTINCT UPPER(TRIM(customername)))
            FROM fp_data_excel 
            WHERE UPPER(TRIM(salesrepname)) = usr.rep_name_normalized
              AND division = usr.division
        ),
        years_active = (
            SELECT array_agg(DISTINCT year ORDER BY year)
            FROM fp_data_excel 
            WHERE UPPER(TRIM(salesrepname)) = usr.rep_name_normalized
              AND division = usr.division
        ),
        updated_at = NOW()
    WHERE usr.rep_name_normalized = UPPER(TRIM(NEW.salesrepname))
      AND usr.division = NEW.division;

    -- Update unified_product_groups totals for the affected product group
    UPDATE unified_product_groups upg
    SET 
        total_amount = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(productgroup)) = upg.product_group_normalized
              AND values_type = 'AMOUNT'
              AND division = upg.division
        ), 0),
        total_kgs = COALESCE((
            SELECT SUM(values) 
            FROM fp_data_excel 
            WHERE UPPER(TRIM(productgroup)) = upg.product_group_normalized
              AND values_type = 'KGS'
              AND division = upg.division
        ), 0),
        customer_count = (
            SELECT COUNT(DISTINCT UPPER(TRIM(customername)))
            FROM fp_data_excel 
            WHERE UPPER(TRIM(productgroup)) = upg.product_group_normalized
              AND division = upg.division
        ),
        years_active = (
            SELECT array_agg(DISTINCT year ORDER BY year)
            FROM fp_data_excel 
            WHERE UPPER(TRIM(productgroup)) = upg.product_group_normalized
              AND division = upg.division
        ),
        updated_at = NOW()
    WHERE upg.product_group_normalized = UPPER(TRIM(NEW.productgroup))
      AND upg.division = NEW.division;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
