/**
 * UNIFIED PRODUCT GROUPS MIGRATION
 * 
 * Creates single source of truth table for all product group master data:
 * - Material percentages (standard + custom)
 * - Pricing actual (cached from actuals)
 * - Pricing rounded (user-entered)
 * 
 * Architecture:
 * - Standard columns for common materials (PE, BOPP, PET, ALU, PAPER, PVC/PET, MIX)
 * - JSONB column for custom/dynamic materials
 * - JSONB column for custom pricing fields
 * - Fully synchronized with raw_product_group_mappings
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database pools
const fpPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
});

const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'ip_auth_database',
});

async function migrate() {
  const client = await fpPool.connect();
  
  try {
    console.log('🚀 Starting Unified Product Groups Migration...\n');
    
    // Step 1: Create unified master table
    console.log('Step 1: Creating fp_product_group_master table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS fp_product_group_master (
        product_group VARCHAR(255) PRIMARY KEY,
        
        -- Standard Material Percentages (most common, always present)
        pe_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pe_percentage >= 0 AND pe_percentage <= 100),
        bopp_percentage NUMERIC(5,2) DEFAULT 0 CHECK (bopp_percentage >= 0 AND bopp_percentage <= 100),
        pet_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pet_percentage >= 0 AND pet_percentage <= 100),
        alu_percentage NUMERIC(5,2) DEFAULT 0 CHECK (alu_percentage >= 0 AND alu_percentage <= 100),
        paper_percentage NUMERIC(5,2) DEFAULT 0 CHECK (paper_percentage >= 0 AND paper_percentage <= 100),
        pvc_pet_percentage NUMERIC(5,2) DEFAULT 0 CHECK (pvc_pet_percentage >= 0 AND pvc_pet_percentage <= 100),
        mix_percentage NUMERIC(5,2) DEFAULT 0 CHECK (mix_percentage >= 0 AND mix_percentage <= 100),
        
        -- Custom Material Percentages (dynamic via JSON)
        custom_materials JSONB DEFAULT '{}'::jsonb,
        
        -- Material/Process classification
        material VARCHAR(255),
        process VARCHAR(255),
        
        -- Pricing Actual (cached from fp_actualcommon)
        asp_actual NUMERIC(18,4),
        morm_actual NUMERIC(18,4),
        rm_actual NUMERIC(18,4),
        actual_last_calculated_at TIMESTAMP,
        actual_year INTEGER,
        
        -- Pricing Rounded (user-entered)
        asp_round NUMERIC(18,4) CHECK (asp_round IS NULL OR (asp_round >= 0 AND asp_round <= 10000)),
        morm_round NUMERIC(18,4) CHECK (morm_round IS NULL OR (morm_round >= 0 AND morm_round <= 10000)),
        rm_round NUMERIC(18,4) CHECK (rm_round IS NULL OR (rm_round >= 0 AND rm_round <= 10000)),
        
        -- Custom Pricing Fields (dynamic via JSON)
        custom_pricing JSONB DEFAULT '{}'::jsonb,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255) DEFAULT 'system',
        updated_by VARCHAR(255) DEFAULT 'system',
        
        -- Constraint: Standard materials must total <= 100%
        CONSTRAINT chk_standard_materials_total CHECK (
          pe_percentage + bopp_percentage + pet_percentage + 
          alu_percentage + paper_percentage + pvc_pet_percentage + mix_percentage <= 100.01
        )
      );
      
      COMMENT ON TABLE fp_product_group_master IS 'Single source of truth for all product group master data';
      COMMENT ON COLUMN fp_product_group_master.custom_materials IS 'JSON storage for dynamic material percentages: {"LDPE": 5, "HDPE": 3}';
      COMMENT ON COLUMN fp_product_group_master.custom_pricing IS 'JSON storage for dynamic pricing fields: {"freight": 10.5, "duty": 5}';
    `);
    console.log('✅ Table created\n');
    
    // Step 2: Create indexes
    console.log('Step 2: Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fp_pg_master_updated ON fp_product_group_master(updated_at);
      CREATE INDEX IF NOT EXISTS idx_fp_pg_master_year ON fp_product_group_master(actual_year);
      CREATE INDEX IF NOT EXISTS idx_fp_pg_master_custom_materials ON fp_product_group_master USING GIN (custom_materials);
      CREATE INDEX IF NOT EXISTS idx_fp_pg_master_custom_pricing ON fp_product_group_master USING GIN (custom_pricing);
    `);
    console.log('✅ Indexes created\n');
    
    // Step 3: Create trigger for updated_at
    console.log('Step 3: Creating update trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_fp_product_group_master_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS trg_fp_pg_master_updated ON fp_product_group_master;
      
      CREATE TRIGGER trg_fp_pg_master_updated
        BEFORE UPDATE ON fp_product_group_master
        FOR EACH ROW
        EXECUTE FUNCTION update_fp_product_group_master_updated_at();
    `);
    console.log('✅ Trigger created\n');
    
    // Step 4: Migrate data from fp_material_percentages
    console.log('Step 4: Migrating data from fp_material_percentages...');
    const migrateResult = await client.query(`
      INSERT INTO fp_product_group_master 
        (product_group, pe_percentage, bopp_percentage, pet_percentage, 
         alu_percentage, paper_percentage, pvc_pet_percentage, mix_percentage,
         material, process, created_at, updated_at)
      SELECT 
        product_group, 
        COALESCE(pe_percentage, 0), 
        COALESCE(bopp_percentage, 0), 
        COALESCE(pet_percentage, 0),
        COALESCE(alu_percentage, 0), 
        COALESCE(paper_percentage, 0), 
        COALESCE(pvc_pet_percentage, 0), 
        COALESCE(mix_percentage, 0),
        material, 
        process, 
        COALESCE(created_at, CURRENT_TIMESTAMP), 
        COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM fp_material_percentages
      ON CONFLICT (product_group) DO UPDATE SET
        pe_percentage = EXCLUDED.pe_percentage,
        bopp_percentage = EXCLUDED.bopp_percentage,
        pet_percentage = EXCLUDED.pet_percentage,
        alu_percentage = EXCLUDED.alu_percentage,
        paper_percentage = EXCLUDED.paper_percentage,
        pvc_pet_percentage = EXCLUDED.pvc_pet_percentage,
        mix_percentage = EXCLUDED.mix_percentage,
        material = EXCLUDED.material,
        process = EXCLUDED.process,
        updated_at = EXCLUDED.updated_at
    `);
    console.log(`✅ Migrated ${migrateResult.rowCount} rows from fp_material_percentages\n`);
    
    // Step 5: Migrate rounded pricing (latest year only)
    console.log('Step 5: Migrating rounded pricing...');
    const pricingResult = await client.query(`
      UPDATE fp_product_group_master m
      SET 
        asp_round = r.asp_round,
        morm_round = r.morm_round,
        rm_round = r.rm_round
      FROM (
        SELECT DISTINCT ON (product_group) 
          product_group, 
          asp_round, 
          morm_round, 
          rm_round,
          year
        FROM fp_product_group_pricing_rounding
        WHERE division = 'FP'
        ORDER BY product_group, year DESC
      ) r
      WHERE m.product_group = r.product_group
    `);
    console.log(`✅ Migrated rounded pricing for ${pricingResult.rowCount} product groups\n`);
    
    // Step 6: Calculate and cache actual pricing
    console.log('Step 6: Calculating actual pricing from fp_actualcommon...');
    const actualResult = await client.query(`
      WITH actual_pricing AS (
        SELECT 
          INITCAP(LOWER(TRIM(pgcombine))) as product_group,
          SUM(qty_kgs) as total_kgs,
          SUM(amount) as total_amount,
          SUM(morm) as total_morm,
          MAX(year) as year
        FROM fp_actualcommon
        WHERE pgcombine IS NOT NULL 
          AND TRIM(pgcombine) != ''
          AND year = (SELECT MAX(year) FROM fp_actualcommon)
        GROUP BY pgcombine
      )
      UPDATE fp_product_group_master m
      SET 
        asp_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_amount / p.total_kgs)::numeric, 4) ELSE 0 END,
        morm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_morm / p.total_kgs)::numeric, 4) ELSE 0 END,
        rm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND(((p.total_amount - p.total_morm) / p.total_kgs)::numeric, 4) ELSE 0 END,
        actual_last_calculated_at = CURRENT_TIMESTAMP,
        actual_year = p.year
      FROM actual_pricing p
      WHERE m.product_group = p.product_group
    `);
    console.log(`✅ Calculated actual pricing for ${actualResult.rowCount} product groups\n`);
    
    // Step 7: Ensure all active PG Combines have entries
    console.log('Step 7: Ensuring all active product groups have entries...');
    const activeResult = await client.query(`
      INSERT INTO fp_product_group_master (product_group, created_by, updated_by)
      SELECT DISTINCT INITCAP(LOWER(TRIM(pg_combine))), 'system', 'system'
      FROM raw_product_group_mappings
      WHERE division = 'fp' 
        AND is_unmapped = false
        AND pg_combine IS NOT NULL
        AND TRIM(pg_combine) != ''
      ON CONFLICT (product_group) DO NOTHING
    `, [], authPool);
    console.log(`✅ Ensured ${activeResult.rowCount} active product groups exist\n`);
    
    // Step 8: Create view for backward compatibility
    console.log('Step 8: Creating compatibility views...');
    await client.query(`
      -- View for old material_percentages queries
      CREATE OR REPLACE VIEW fp_material_percentages_view AS
      SELECT 
        product_group,
        pe_percentage,
        bopp_percentage,
        pet_percentage,
        alu_percentage,
        paper_percentage,
        pvc_pet_percentage,
        mix_percentage,
        material,
        process,
        created_at,
        updated_at
      FROM fp_product_group_master;
      
      -- View for old pricing_rounding queries
      CREATE OR REPLACE VIEW fp_product_group_pricing_view AS
      SELECT 
        'FP' as division,
        product_group,
        actual_year as year,
        asp_actual,
        morm_actual,
        rm_actual,
        asp_round,
        morm_round,
        rm_round,
        actual_last_calculated_at as updated_at
      FROM fp_product_group_master
      WHERE actual_year IS NOT NULL;
    `);
    console.log('✅ Compatibility views created\n');
    
    // Step 9: Grant permissions
    console.log('Step 9: Granting permissions...');
    await client.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON fp_product_group_master TO postgres;
      GRANT SELECT ON fp_material_percentages_view TO postgres;
      GRANT SELECT ON fp_product_group_pricing_view TO postgres;
    `);
    console.log('✅ Permissions granted\n');
    
    // Final summary
    const summary = await client.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(*) FILTER (WHERE pe_percentage + bopp_percentage + pet_percentage + 
                              alu_percentage + paper_percentage + pvc_pet_percentage + mix_percentage = 100) as complete_materials,
        COUNT(*) FILTER (WHERE asp_actual IS NOT NULL) as with_actual_pricing,
        COUNT(*) FILTER (WHERE asp_round IS NOT NULL) as with_rounded_pricing
      FROM fp_product_group_master
    `);
    
    console.log('\n📊 MIGRATION SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total product groups: ${summary.rows[0].total_rows}`);
    console.log(`Complete materials (100%): ${summary.rows[0].complete_materials}`);
    console.log(`With actual pricing: ${summary.rows[0].with_actual_pricing}`);
    console.log(`With rounded pricing: ${summary.rows[0].with_rounded_pricing}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('✅ Migration completed successfully!\n');
    console.log('📝 NEXT STEPS:');
    console.log('1. Update backend services to use fp_product_group_master');
    console.log('2. Update frontend to load from new unified API');
    console.log('3. Test all product group pages');
    console.log('4. Once verified, drop old tables:');
    console.log('   - DROP TABLE fp_material_percentages;');
    console.log('   - DROP TABLE fp_product_group_pricing_rounding;');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
