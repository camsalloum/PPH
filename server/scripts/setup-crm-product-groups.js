/**
 * Setup CRM Product Groups Table
 * 
 * Creates crm_product_groups TABLE (not VIEW) that:
 * 1. Syncs base data from fp_material_percentages
 * 2. Allows additional CRM-specific parameters to be added
 * 3. Has triggers to auto-sync when source data changes
 */

const { pool } = require('../database/config');

async function setupCRMProductGroups() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        SETUP CRM PRODUCT GROUPS TABLE');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Create the crm_product_groups table
    console.log('1. Creating crm_product_groups table...\n');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_product_groups (
        id SERIAL PRIMARY KEY,
        
        -- Synced from fp_material_percentages
        source_id INTEGER,                          -- ID from fp_material_percentages
        product_group VARCHAR(255) NOT NULL UNIQUE, -- PGCombine name
        material VARCHAR(100),                      -- PE, Non PE, Others
        process VARCHAR(100),                       -- Plain, Printed, Others
        
        -- CRM-specific fields (can be extended)
        is_active BOOLEAN DEFAULT true,             -- Enable/disable for CRM
        display_order INTEGER DEFAULT 0,            -- Sort order in dropdowns
        description TEXT,                           -- Product description for sales reps
        
        -- Sales parameters
        min_order_qty NUMERIC(10,2),                -- Minimum order quantity (kg/units)
        min_order_value NUMERIC(12,2),              -- Minimum order value (USD)
        lead_time_days INTEGER,                     -- Typical production lead time
        
        -- Commission & Targets
        commission_rate NUMERIC(5,2),               -- Sales commission percentage
        monthly_target NUMERIC(14,2),               -- Monthly sales target (USD)
        
        -- Pricing guidance
        target_margin_pct NUMERIC(5,2),             -- Target margin percentage
        price_floor NUMERIC(12,2),                  -- Minimum selling price
        
        -- Notes & metadata
        sales_notes TEXT,                           -- Notes for sales team
        internal_notes TEXT,                        -- Internal notes
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        synced_at TIMESTAMP DEFAULT NOW()           -- Last sync from source
      );
      
      -- Index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_crm_pg_product_group ON crm_product_groups(product_group);
      CREATE INDEX IF NOT EXISTS idx_crm_pg_material ON crm_product_groups(material);
      CREATE INDEX IF NOT EXISTS idx_crm_pg_active ON crm_product_groups(is_active);
    `);
    
    console.log('   ✅ Table created successfully\n');

    // Step 2: Create sync function
    console.log('2. Creating sync function...\n');
    
    await pool.query(`
      CREATE OR REPLACE FUNCTION sync_crm_product_groups()
      RETURNS void AS $$
      DECLARE
        v_inserted INTEGER := 0;
        v_updated INTEGER := 0;
        rec RECORD;
      BEGIN
        -- Loop through source data
        FOR rec IN 
          SELECT id, product_group, material, process
          FROM fp_material_percentages
          WHERE product_group IS NOT NULL
        LOOP
          -- Try to insert, on conflict update base fields only
          INSERT INTO crm_product_groups (
            source_id, product_group, material, process, synced_at
          )
          VALUES (
            rec.id, rec.product_group, rec.material, rec.process, NOW()
          )
          ON CONFLICT (product_group) 
          DO UPDATE SET
            source_id = EXCLUDED.source_id,
            material = EXCLUDED.material,
            process = EXCLUDED.process,
            synced_at = NOW(),
            updated_at = NOW()
          WHERE 
            crm_product_groups.source_id IS DISTINCT FROM EXCLUDED.source_id OR
            crm_product_groups.material IS DISTINCT FROM EXCLUDED.material OR
            crm_product_groups.process IS DISTINCT FROM EXCLUDED.process;
            
          IF FOUND THEN
            v_updated := v_updated + 1;
          END IF;
        END LOOP;
        
        RAISE NOTICE 'CRM Product Groups sync complete: % records processed', v_updated;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('   ✅ Sync function created\n');

    // Step 3: Create trigger for auto-sync
    console.log('3. Creating auto-sync trigger...\n');
    
    await pool.query(`
      -- Trigger function to sync single product group
      CREATE OR REPLACE FUNCTION trg_sync_crm_product_group()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          INSERT INTO crm_product_groups (
            source_id, product_group, material, process, synced_at
          )
          VALUES (
            NEW.id, NEW.product_group, NEW.material, NEW.process, NOW()
          )
          ON CONFLICT (product_group) 
          DO UPDATE SET
            source_id = EXCLUDED.source_id,
            material = EXCLUDED.material,
            process = EXCLUDED.process,
            synced_at = NOW(),
            updated_at = NOW();
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          -- Don't delete from CRM, just mark as inactive
          UPDATE crm_product_groups 
          SET is_active = false, updated_at = NOW()
          WHERE source_id = OLD.id;
          RETURN OLD;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      -- Drop existing trigger if any
      DROP TRIGGER IF EXISTS trg_material_percentages_to_crm ON fp_material_percentages;
      
      -- Create trigger
      CREATE TRIGGER trg_material_percentages_to_crm
        AFTER INSERT OR UPDATE OR DELETE ON fp_material_percentages
        FOR EACH ROW
        EXECUTE FUNCTION trg_sync_crm_product_group();
    `);
    
    console.log('   ✅ Auto-sync trigger created\n');

    // Step 4: Initial sync
    console.log('4. Running initial sync from fp_material_percentages...\n');
    
    await pool.query('SELECT sync_crm_product_groups()');
    
    // Check results
    const countResult = await pool.query('SELECT COUNT(*) as count FROM crm_product_groups');
    console.log(`   ✅ Synced ${countResult.rows[0].count} product groups\n`);

    // Step 5: Display the data
    console.log('5. Current CRM Product Groups:\n');
    console.log('─'.repeat(90));
    
    const products = await pool.query(`
      SELECT 
        id, source_id, product_group, material, process, 
        is_active, display_order, commission_rate, monthly_target
      FROM crm_product_groups
      ORDER BY 
        CASE WHEN product_group ILIKE '%others%' OR product_group ILIKE '%service%' THEN 1 ELSE 0 END,
        material, process, product_group
    `);
    
    console.log(
      'ID'.padEnd(4) + 
      'Product Group'.padEnd(30) + 
      'Material'.padEnd(12) + 
      'Process'.padEnd(12) + 
      'Active'.padEnd(8) + 
      'Commission'.padEnd(12) + 
      'Target'
    );
    console.log('─'.repeat(90));
    
    products.rows.forEach(p => {
      console.log(
        String(p.id).padEnd(4) +
        (p.product_group || '').substring(0, 28).padEnd(30) +
        (p.material || '-').padEnd(12) +
        (p.process || '-').padEnd(12) +
        (p.is_active ? '✓' : '✗').padEnd(8) +
        (p.commission_rate ? `${p.commission_rate}%` : '-').padEnd(12) +
        (p.monthly_target ? `$${p.monthly_target}` : '-')
      );
    });

    // Step 6: Show table structure
    console.log('\n\n6. CRM Product Groups Table Structure:\n');
    console.log('─'.repeat(60));
    
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'crm_product_groups'
      ORDER BY ordinal_position
    `);
    
    console.log('Column'.padEnd(25) + 'Type'.padEnd(20) + 'Nullable'.padEnd(10) + 'Default');
    console.log('─'.repeat(60));
    
    columns.rows.forEach(c => {
      console.log(
        c.column_name.padEnd(25) +
        c.data_type.substring(0, 18).padEnd(20) +
        c.is_nullable.padEnd(10) +
        (c.column_default ? c.column_default.substring(0, 20) : '-')
      );
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('        SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📋 CRM Product Groups table is ready with:');
    console.log('   • Base fields synced from fp_material_percentages');
    console.log('   • Auto-sync trigger (changes propagate automatically)');
    console.log('   • CRM-specific fields ready for customization:');
    console.log('     - is_active, display_order, description');
    console.log('     - min_order_qty, min_order_value, lead_time_days');
    console.log('     - commission_rate, monthly_target');
    console.log('     - target_margin_pct, price_floor');
    console.log('     - sales_notes, internal_notes');
    console.log('\n💡 You can add more columns as needed without breaking sync.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

setupCRMProductGroups();
