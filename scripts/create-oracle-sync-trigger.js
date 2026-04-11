/**
 * Create trigger and function to sync fp_raw_oracle -> fp_actualcommon
 * This replaces the fp_raw_data -> fp_actualcommon flow
 */

const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function createOracleSync() {
  const client = await pool.connect();
  
  try {
    console.log('═'.repeat(60));
    console.log('  Creating fp_raw_oracle -> fp_actualcommon sync');
    console.log('═'.repeat(60) + '\n');
    
    // Create the sync function
    console.log('📝 Creating sync_oracle_to_actualcommon function...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION sync_oracle_to_actualcommon()
      RETURNS void
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        TRUNCATE fp_actualcommon;

        INSERT INTO fp_actualcommon (
          division_name, division_code, subdivision,
          year, month, month_no,
          customer_title, customer_code, customer_name, financial_customer, country, first_ran_date,
          contact_name, contact_position, contact_dept, contact_tel, contact_mobile, contact_email,
          address_1, address_2, post_box, phone, building,
          credit_limit, payment_code, payment_terms, payment_days, delivery_terms,
          item_code, item_desc, item_group_code, item_group_desc, product_group, product_type, subgroup, weight,
          sales_rep_name, sales_rep_code,
          sales_rep_group_id, sales_rep_group_name,
          invoice_date, invoice_no, transaction_type, unit_desc, selection_code, selection_code_desc,
          machine_no, machine_name,
          title_code, title_name, business_partner_type,
          qty_storage_units, qty_delivered, qty_kgs,
          amount, material_value, op_value, total_value, morm, margin_over_total,
          company_code, sync_source, last_sync_date,
          erp_row_id, erp_sync_timestamp, erp_last_modified, erp_extra_data,
          pgcombine,
          admin_division_code,
          created_at, updated_at
        )
        SELECT
          d.division_name,
          UPPER(TRIM(r.division)),
          INITCAP(TRIM(r.subdivision)),
          CAST(r.year1 AS INTEGER),
          INITCAP(TRIM(r.month1)),
          CAST(r.monthno AS INTEGER),
          INITCAP(TRIM(r.customertitle)),
          UPPER(TRIM(r.customer)),
          INITCAP(TRIM(r.customername)),
          INITCAP(TRIM(r.financialcustomer)),
          INITCAP(TRIM(r.countryname)),
          r.firstrandate,
          INITCAP(TRIM(r.contactname)),
          INITCAP(TRIM(r.contactposition)),
          INITCAP(TRIM(r.contdepartment)),
          r.conttel,
          r.contmob,
          LOWER(TRIM(r.contemail)),
          INITCAP(TRIM(r.address_1)),
          INITCAP(TRIM(r.address_2)),
          r.postbox,
          r.phone,
          INITCAP(TRIM(r.building)),
          r.creditlimit,
          UPPER(TRIM(r.paymentcode)),
          INITCAP(TRIM(r.termsofpayment)),
          CAST(r.paymentdays AS INTEGER),
          INITCAP(TRIM(r.deliveryterms)),
          UPPER(TRIM(r.itemcode)),
          INITCAP(TRIM(r.itemdescription)),
          UPPER(TRIM(r.itemgroupcode)),
          INITCAP(TRIM(r.itemgroupdescription)),
          INITCAP(TRIM(r.productgroup)),
          INITCAP(TRIM(r.producttype)),
          INITCAP(TRIM(r.subgroup)),
          r.weight::text,  -- Cast numeric to text
          INITCAP(TRIM(r.salesrepname)),
          UPPER(TRIM(r.salesrepcode)),
          srg.group_id,
          srg.group_name,
          r.invoicedate,
          CASE WHEN r.invoiceno ~ '^[0-9]+$' THEN CAST(r.invoiceno AS NUMERIC) ELSE NULL END,  -- Cast text to numeric
          INITCAP(TRIM(r.transactiontype)),
          INITCAP(TRIM(r.unitdescription)),
          UPPER(TRIM(r.selectioncode)),
          INITCAP(TRIM(r.selectioncodedescription)),
          r.machineno,
          INITCAP(TRIM(r.machinename)),
          UPPER(TRIM(r.titlecode)),
          INITCAP(TRIM(r.titlename)),
          INITCAP(TRIM(r.businesspartnertype)),
          r.deliveredqtyinstorageunits::text,  -- Cast numeric to text
          r.deliveredquantity::text,  -- Cast numeric to text
          COALESCE(r.deliveredquantitykgs, 0),
          COALESCE(r.invoicedamount, 0),
          COALESCE(r.materialvalue, 0),
          COALESCE(r.opvalue, 0),
          COALESCE(r.totalvalue, 0),
          COALESCE(r.marginoverrm, 0),
          COALESCE(r.marginovertotal, 0),
          'PPH',  -- company_code
          'oracle_direct',  -- sync_source - new source identifier
          r.synced_at,  -- last_sync_date from oracle sync
          r.id::text,  -- erp_row_id
          r.synced_at,  -- erp_sync_timestamp
          r.synced_at,  -- erp_last_modified
          jsonb_build_object('oracle_batch_id', r.oracle_sync_batch_id),  -- erp_extra_data as proper jsonb
          -- pgcombine: use mapping if exists, else use INITCAP of raw product_group
          COALESCE(
            (SELECT rpg.pg_combine
             FROM fp_raw_product_groups rpg
             WHERE LOWER(TRIM(r.productgroup)) = LOWER(TRIM(rpg.raw_product_group))
             LIMIT 1),
            INITCAP(TRIM(r.productgroup))
          ),
          UPPER(TRIM(d.division_code)),  -- admin_division_code = parent division code (FP for both FP and BF)
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM fp_raw_oracle r
        CROSS JOIN divisions d
        LEFT JOIN (
          SELECT
            m.member_name,
            g.id as group_id,
            g.group_name
          FROM sales_rep_group_members m
          JOIN sales_rep_groups g ON m.group_id = g.id
        ) srg ON LOWER(TRIM(r.salesrepname)) = LOWER(TRIM(srg.member_name))
        WHERE r.division = ANY(
          SELECT jsonb_array_elements_text(d.raw_divisions)
        );

        RAISE NOTICE 'Synced % rows from fp_raw_oracle to fp_actualcommon', (SELECT COUNT(*) FROM fp_actualcommon);
      END;
      $function$
    `);
    
    console.log('   ✅ Function created\n');
    
    // Create trigger function
    console.log('📝 Creating trigger function...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_sync_oracle_actualcommon()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM sync_oracle_to_actualcommon();
        RETURN NULL;
      END;
      $function$
    `);
    
    console.log('   ✅ Trigger function created\n');
    
    // Drop old trigger if exists and create new one
    console.log('📝 Creating trigger on fp_raw_oracle...');
    
    await client.query(`
      DROP TRIGGER IF EXISTS after_fp_raw_oracle_change ON fp_raw_oracle;
      
      CREATE TRIGGER after_fp_raw_oracle_change
      AFTER INSERT OR UPDATE OR DELETE ON fp_raw_oracle
      FOR EACH STATEMENT
      EXECUTE FUNCTION trigger_sync_oracle_actualcommon();
    `);
    
    console.log('   ✅ Trigger created\n');
    
    // Test: Run the sync manually
    console.log('🧪 Running initial sync from fp_raw_oracle to fp_actualcommon...');
    const startTime = Date.now();
    
    await client.query('SELECT sync_oracle_to_actualcommon()');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Verify
    const countResult = await client.query('SELECT COUNT(*) as count FROM fp_actualcommon');
    const yearResult = await client.query('SELECT COUNT(DISTINCT year) as years, MIN(year) as min_year, MAX(year) as max_year FROM fp_actualcommon');
    
    console.log(`\n✅ Sync completed in ${elapsed}s!`);
    console.log(`   Rows in fp_actualcommon: ${countResult.rows[0].count}`);
    console.log(`   Years: ${yearResult.rows[0].years} (${yearResult.rows[0].min_year} - ${yearResult.rows[0].max_year})`);
    
    console.log('\n═'.repeat(60));
    console.log('  Setup complete! fp_raw_oracle now syncs to fp_actualcommon');
    console.log('═'.repeat(60));
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

createOracleSync().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
