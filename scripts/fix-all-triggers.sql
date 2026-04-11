-- Fix trigger_sync_customer - remove NEW.country reference
CREATE OR REPLACE FUNCTION public.trigger_sync_customer()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_customer_name TEXT;
    v_canonical_name TEXT;
    v_country_name TEXT;
    v_next_code TEXT;
    v_next_num INT;
    v_division TEXT := 'FP';
BEGIN
    -- Get customer name from the inserted row
    v_customer_name := COALESCE(NEW.customername, '');
    IF v_customer_name = '' OR v_customer_name IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get country from the inserted row (fp_data_excel has countryname ONLY)
    v_country_name := COALESCE(NEW.countryname, NULL);
    
    -- Normalize UAE to full name
    IF v_country_name = 'UAE' THEN
        v_country_name := 'United Arab Emirates';
    END IF;

    -- Check if in merge rule (original_customers is JSONB)
    SELECT merged_customer_name INTO v_canonical_name
    FROM fp_division_customer_merge_rules
    WHERE is_active = true
      AND original_customers ? v_customer_name
    LIMIT 1;

    IF v_canonical_name IS NULL THEN
        v_canonical_name := v_customer_name;
    END IF;

    -- Check if exists
    IF NOT EXISTS (
        SELECT 1 FROM fp_customer_master
        WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM(v_canonical_name))
          AND division = v_division
    ) THEN
        -- Generate code
        SELECT COALESCE(MAX(CAST(SUBSTRING(customer_code FROM 'FP-CUST-2025-([0-9]+)') AS INT)), 0) + 1
        INTO v_next_num
        FROM fp_customer_master
        WHERE customer_code LIKE 'FP-CUST-2025-%';
        
        v_next_code := 'FP-CUST-2025-' || LPAD(v_next_num::TEXT, 5, '0');
        
        -- Insert with country
        INSERT INTO fp_customer_master (
            customer_code, customer_name, customer_name_normalized,
            customer_type, country, division, is_active, is_merged,
            notes, created_at, created_by
        ) VALUES (
            v_next_code, v_canonical_name, LOWER(TRIM(v_canonical_name)),
            'Company', v_country_name, v_division, true, false,
            'Auto-added from ' || TG_TABLE_NAME, NOW(), 'TRIGGER'
        );
    ELSE
        -- Update country if customer exists but country is missing
        UPDATE fp_customer_master
        SET country = COALESCE(country, v_country_name),
            updated_at = NOW()
        WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM(v_canonical_name))
          AND division = v_division
          AND (country IS NULL OR country = '');
    END IF;

    RETURN NEW;
END;
$function$;

-- Fix sync_unified_on_data_change - ensure correct column names
CREATE OR REPLACE FUNCTION sync_unified_on_data_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When new data is inserted into fp_data_excel, update the related unified records
    
    -- Update unified_customers (fp_customer_unified) totals for the affected customer
    UPDATE fp_customer_unified uc
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

    -- Update unified_sales_reps (fp_sales_rep_unified) totals for the affected rep
    UPDATE fp_sales_rep_unified usr
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

    -- Update unified_product_groups (fp_product_group_unified) totals for the affected product group
    UPDATE fp_product_group_unified upg
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

-- Re-enable both triggers
ALTER TABLE fp_data_excel ENABLE TRIGGER ALL;

-- Verify
SELECT tgname, tgenabled, 'FIXED AND ENABLED' as status 
FROM pg_trigger 
WHERE tgrelid = 'fp_data_excel'::regclass;
