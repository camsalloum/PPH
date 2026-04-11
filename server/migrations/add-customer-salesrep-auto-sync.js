const { pool } = require('../database/config');

async function addAutoSyncTriggers() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Adding auto-sync triggers for customer_unified and sales_rep_unified...\n');

    // Drop existing triggers if they exist
    await client.query(`
      DROP TRIGGER IF EXISTS trg_sync_customer_from_actual ON fp_actualcommon;
      DROP TRIGGER IF EXISTS trg_sync_salesrep_from_actual ON fp_actualcommon;
      DROP FUNCTION IF EXISTS fn_sync_customer_from_actual();
      DROP FUNCTION IF EXISTS fn_sync_salesrep_from_actual();
    `);
    console.log('✅ Dropped existing triggers (if any)\n');

    // Create function to sync customers
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_sync_customer_from_actual()
      RETURNS TRIGGER AS $$
      DECLARE
        v_customer_name TEXT;
        v_normalized TEXT;
        v_customer_code TEXT;
        v_division TEXT;
        v_next_id INTEGER;
      BEGIN
        -- Get the customer name and division from the NEW record
        v_customer_name := TRIM(NEW.customer_name);
        v_normalized := UPPER(REGEXP_REPLACE(v_customer_name, '[^A-Za-z0-9]', '', 'g'));
        v_division := NEW.admin_division_code;
        
        -- Only process if customer_name is not null/empty
        IF v_customer_name IS NOT NULL AND v_customer_name != '' THEN
          -- Check if customer exists in fp_customer_unified
          IF NOT EXISTS (
            SELECT 1 
            FROM fp_customer_unified 
            WHERE normalized_name = v_normalized
            AND division = v_division
          ) THEN
            -- Get next customer_id to generate code
            SELECT COALESCE(MAX(customer_id), 0) + 1 INTO v_next_id FROM fp_customer_unified;
            v_customer_code := 'CUST' || LPAD(v_next_id::TEXT, 6, '0');
            
            -- Insert new customer
            INSERT INTO fp_customer_unified (
              customer_code,
              display_name,
              normalized_name,
              division,
              is_active,
              is_merged,
              created_at,
              updated_at,
              created_by,
              updated_by
            ) VALUES (
              v_customer_code,
              v_customer_name,
              v_normalized,
              v_division,
              true,
              false,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP,
              'auto-sync',
              'auto-sync'
            );
            
            RAISE NOTICE 'Auto-synced new customer: % (Code: %, Division: %)', v_customer_name, v_customer_code, v_division;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created function: fn_sync_customer_from_actual()\n');

    // Create function to sync sales reps
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_sync_salesrep_from_actual()
      RETURNS TRIGGER AS $$
      DECLARE
        v_sales_rep_name TEXT;
        v_normalized TEXT;
        v_sales_rep_code TEXT;
        v_division TEXT;
        v_next_id INTEGER;
      BEGIN
        -- Get the sales rep name and division from the NEW record
        v_sales_rep_name := TRIM(NEW.sales_rep_name);
        v_normalized := UPPER(REGEXP_REPLACE(v_sales_rep_name, '[^A-Za-z0-9]', '', 'g'));
        v_division := NEW.admin_division_code;
        
        -- Only process if sales_rep_name is not null/empty
        IF v_sales_rep_name IS NOT NULL AND v_sales_rep_name != '' THEN
          -- Check if sales rep exists in fp_sales_rep_unified
          IF NOT EXISTS (
            SELECT 1 
            FROM fp_sales_rep_unified 
            WHERE normalized_name = v_normalized
            AND division = v_division
          ) THEN
            -- Get next sales_rep_id to generate code
            SELECT COALESCE(MAX(sales_rep_id), 0) + 1 INTO v_next_id FROM fp_sales_rep_unified;
            v_sales_rep_code := 'SR' || LPAD(v_next_id::TEXT, 6, '0');
            
            -- Insert new sales rep
            INSERT INTO fp_sales_rep_unified (
              sales_rep_code,
              display_name,
              normalized_name,
              division,
              is_active,
              created_at,
              updated_at
            ) VALUES (
              v_sales_rep_code,
              v_sales_rep_name,
              v_normalized,
              v_division,
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            );
            
            RAISE NOTICE 'Auto-synced new sales rep: % (Code: %, Division: %)', v_sales_rep_name, v_sales_rep_code, v_division;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created function: fn_sync_salesrep_from_actual()\n');

    // Create trigger for customers
    await client.query(`
      CREATE TRIGGER trg_sync_customer_from_actual
      AFTER INSERT OR UPDATE OF customer_name, admin_division_code
      ON fp_actualcommon
      FOR EACH ROW
      EXECUTE FUNCTION fn_sync_customer_from_actual();
    `);
    console.log('✅ Created trigger: trg_sync_customer_from_actual\n');

    // Create trigger for sales reps
    await client.query(`
      CREATE TRIGGER trg_sync_salesrep_from_actual
      AFTER INSERT OR UPDATE OF sales_rep_name, admin_division_code
      ON fp_actualcommon
      FOR EACH ROW
      EXECUTE FUNCTION fn_sync_salesrep_from_actual();
    `);
    console.log('✅ Created trigger: trg_sync_salesrep_from_actual\n');

    // Sync existing data - customers
    console.log('🔄 Syncing existing customers from fp_actualcommon...');
    const customerSync = await client.query(`
      INSERT INTO fp_customer_unified (customer_code, display_name, normalized_name, division, is_active, is_merged, created_at, updated_at, created_by, updated_by)
      SELECT 
        'CUST' || LPAD((ROW_NUMBER() OVER (ORDER BY sub.display_name) + (SELECT COALESCE(MAX(customer_id), 0) FROM fp_customer_unified))::TEXT, 6, '0') as customer_code,
        display_name,
        normalized_name,
        division,
        true,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'migration',
        'migration'
      FROM (
        SELECT DISTINCT 
          TRIM(customer_name) as display_name,
          UPPER(REGEXP_REPLACE(TRIM(customer_name), '[^A-Za-z0-9]', '', 'g')) as normalized_name,
          admin_division_code as division
        FROM fp_actualcommon
        WHERE TRIM(customer_name) IS NOT NULL 
          AND TRIM(customer_name) != ''
          AND NOT EXISTS (
            SELECT 1 
            FROM fp_customer_unified cu
            WHERE cu.normalized_name = UPPER(REGEXP_REPLACE(TRIM(fp_actualcommon.customer_name), '[^A-Za-z0-9]', '', 'g'))
            AND cu.division = fp_actualcommon.admin_division_code
          )
      ) sub;
    `);
    console.log(`✅ Added ${customerSync.rowCount} new customers\n`);

    // Sync existing data - sales reps
    console.log('🔄 Syncing existing sales reps from fp_actualcommon...');
    const salesRepSync = await client.query(`
      INSERT INTO fp_sales_rep_unified (sales_rep_code, display_name, normalized_name, division, is_active, created_at, updated_at)
      SELECT 
        'SR' || LPAD((ROW_NUMBER() OVER (ORDER BY sub.display_name) + (SELECT COALESCE(MAX(sales_rep_id), 0) FROM fp_sales_rep_unified))::TEXT, 6, '0') as sales_rep_code,
        display_name,
        normalized_name,
        division,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT 
          TRIM(sales_rep_name) as display_name,
          UPPER(REGEXP_REPLACE(TRIM(sales_rep_name), '[^A-Za-z0-9]', '', 'g')) as normalized_name,
          admin_division_code as division
        FROM fp_actualcommon
        WHERE TRIM(sales_rep_name) IS NOT NULL 
          AND TRIM(sales_rep_name) != ''
          AND NOT EXISTS (
            SELECT 1 
            FROM fp_sales_rep_unified sr
            WHERE sr.normalized_name = UPPER(REGEXP_REPLACE(TRIM(fp_actualcommon.sales_rep_name), '[^A-Za-z0-9]', '', 'g'))
            AND sr.division = fp_actualcommon.admin_division_code
          )
      ) sub;
    `);
    console.log(`✅ Added ${salesRepSync.rowCount} new sales reps\n`);

    // Verify counts
    const customerCount = await client.query('SELECT COUNT(*) FROM fp_customer_unified');
    const salesRepCount = await client.query('SELECT COUNT(*) FROM fp_sales_rep_unified');
    
    console.log('\n📊 Current Record Counts:');
    console.log(`   Customers: ${customerCount.rows[0].count}`);
    console.log(`   Sales Reps: ${salesRepCount.rows[0].count}`);

    console.log('\n═══════════════════════════════════════════════');
    console.log('✅ AUTO-SYNC SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════');
    console.log('\n📋 What happens now:');
    console.log('   1. When new data is inserted into fp_actualcommon');
    console.log('   2. Triggers automatically check customer_name and sales_rep_name');
    console.log('   3. If not found in unified tables, they are auto-added');
    console.log('   4. No manual sync needed - fully automatic! 🎉\n');

  } catch (error) {
    console.error('❌ Error setting up auto-sync:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addAutoSyncTriggers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
