/**
 * ============================================================================
 * CUSTOMER MASTER DATA - DATABASE SETUP SCRIPT
 * ============================================================================
 * 
 * This script creates the Customer Master tables for all divisions.
 * Run this once to set up the foundation for the Customer Module.
 * 
 * Usage:
 *   node server/scripts/setup-customer-master.js
 *   node server/scripts/setup-customer-master.js --division fp
 *   node server/scripts/setup-customer-master.js --dry-run
 * 
 * Created: December 23, 2025
 * ============================================================================
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Only FP is active - other divisions should be added dynamically
const divisions = ['fp'];

const dbConfigs = {
  fp: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'fp_database',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  }
};

// ============================================================================
// SQL TEMPLATES
// ============================================================================

const createCodeSequencesTable = (div) => `
CREATE TABLE IF NOT EXISTS ${div}_code_sequences (
  id SERIAL PRIMARY KEY,
  sequence_type VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  division VARCHAR(50) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sequence_type, year, division)
);
`;

const createCustomerMasterTable = (div) => `
CREATE TABLE IF NOT EXISTS ${div}_customer_master (
  id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(500) NOT NULL,
  customer_name_normalized VARCHAR(500),
  customer_type VARCHAR(50) DEFAULT 'Company',
  customer_group VARCHAR(255),
  territory VARCHAR(255),
  industry VARCHAR(255),
  market_segment VARCHAR(100),
  primary_contact VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  website VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'UAE',
  postal_code VARCHAR(20),
  tax_id VARCHAR(100),
  trade_license VARCHAR(100),
  credit_limit DECIMAL(15,2),
  payment_terms VARCHAR(100),
  default_currency VARCHAR(10) DEFAULT 'AED',
  account_manager VARCHAR(255),
  sales_rep VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  is_merged BOOLEAN DEFAULT false,
  merged_into_code VARCHAR(50),
  division VARCHAR(50) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);
`;

const createCustomerMasterIndexes = (div) => `
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_code ON ${div}_customer_master(customer_code);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_name ON ${div}_customer_master(customer_name);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_normalized ON ${div}_customer_master(customer_name_normalized);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_division ON ${div}_customer_master(division);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_active ON ${div}_customer_master(is_active);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_group ON ${div}_customer_master(customer_group);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_territory ON ${div}_customer_master(territory);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_master_sales_rep ON ${div}_customer_master(sales_rep);
`;

const createCustomerAliasesTable = (div) => `
CREATE TABLE IF NOT EXISTS ${div}_customer_aliases (
  id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) NOT NULL,
  alias_name VARCHAR(500) NOT NULL,
  alias_name_normalized VARCHAR(500) NOT NULL,
  source_system VARCHAR(50),
  source_file VARCHAR(255),
  source_table VARCHAR(100),
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  ai_confidence DECIMAL(3,2),
  ai_matched_at TIMESTAMP,
  is_primary BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(100),
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  FOREIGN KEY (customer_code) REFERENCES ${div}_customer_master(customer_code) ON DELETE CASCADE,
  UNIQUE(customer_code, alias_name_normalized)
);
`;

const createCustomerAliasesIndexes = (div) => `
CREATE INDEX IF NOT EXISTS idx_${div}_customer_aliases_code ON ${div}_customer_aliases(customer_code);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_aliases_name ON ${div}_customer_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_aliases_normalized ON ${div}_customer_aliases(alias_name_normalized);
CREATE INDEX IF NOT EXISTS idx_${div}_customer_aliases_source ON ${div}_customer_aliases(source_system);
`;

const addMergeCodeColumns = (div) => `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = '${div}_division_customer_merge_rules' 
    AND column_name = 'merge_code'
  ) THEN
    ALTER TABLE ${div}_division_customer_merge_rules 
    ADD COLUMN merge_code VARCHAR(50) UNIQUE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = '${div}_division_customer_merge_rules' 
    AND column_name = 'master_customer_code'
  ) THEN
    ALTER TABLE ${div}_division_customer_merge_rules 
    ADD COLUMN master_customer_code VARCHAR(50);
  END IF;
END $$;
`;

const createMergeCodeIndex = (div) => `
CREATE INDEX IF NOT EXISTS idx_${div}_merge_rules_code ON ${div}_division_customer_merge_rules(merge_code);
`;

// Helper functions
const createGetNextSequenceFunction = (div) => `
CREATE OR REPLACE FUNCTION ${div}_get_next_sequence(
  p_sequence_type VARCHAR(50),
  p_year INTEGER,
  p_division VARCHAR(50)
) RETURNS INTEGER AS $$
DECLARE
  v_next_val INTEGER;
BEGIN
  INSERT INTO ${div}_code_sequences (sequence_type, year, division, current_value)
  VALUES (p_sequence_type, p_year, p_division, 1)
  ON CONFLICT (sequence_type, year, division) 
  DO UPDATE SET 
    current_value = ${div}_code_sequences.current_value + 1,
    updated_at = CURRENT_TIMESTAMP
  RETURNING current_value INTO v_next_val;
  
  RETURN v_next_val;
END;
$$ LANGUAGE plpgsql;
`;

const createGenerateCustomerCodeFunction = (div) => `
CREATE OR REPLACE FUNCTION ${div}_generate_customer_code(
  p_division VARCHAR(50)
) RETURNS VARCHAR(50) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
  v_sequence := ${div}_get_next_sequence('customer', v_year, p_division);
  RETURN UPPER(p_division) || '-CUST-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
`;

const createGenerateMergeCodeFunction = (div) => `
CREATE OR REPLACE FUNCTION ${div}_generate_merge_code(
  p_division VARCHAR(50)
) RETURNS VARCHAR(50) AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
  v_sequence := ${div}_get_next_sequence('merge', v_year, p_division);
  RETURN UPPER(p_division) || '-MRG-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
`;

const createNormalizeFunction = (div) => `
CREATE OR REPLACE FUNCTION ${div}_normalize_customer_name(
  p_name VARCHAR(500)
) RETURNS VARCHAR(500) AS $$
BEGIN
  RETURN LOWER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(p_name, '\\y(llc|l\\.l\\.c|ltd|limited|inc|incorporated|corp|corporation|co|company|est|establishment|fze|fzc|fzco|plc|pllc)\\y', '', 'gi'),
          '[^\\w\\s]', '', 'g'
        ),
        '\\s+', ' ', 'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql;
`;

const createTriggers = (div) => `
-- Trigger function for customer_master
CREATE OR REPLACE FUNCTION ${div}_customer_master_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_code IS NULL OR NEW.customer_code = '' THEN
    NEW.customer_code := ${div}_generate_customer_code(NEW.division);
  END IF;
  
  IF NEW.customer_name_normalized IS NULL OR NEW.customer_name_normalized = '' THEN
    NEW.customer_name_normalized := ${div}_normalize_customer_name(NEW.customer_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_${div}_customer_master_before_insert ON ${div}_customer_master;
CREATE TRIGGER trg_${div}_customer_master_before_insert
  BEFORE INSERT ON ${div}_customer_master
  FOR EACH ROW
  EXECUTE FUNCTION ${div}_customer_master_before_insert();

-- Trigger function for customer_aliases
CREATE OR REPLACE FUNCTION ${div}_customer_aliases_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alias_name_normalized IS NULL OR NEW.alias_name_normalized = '' THEN
    NEW.alias_name_normalized := ${div}_normalize_customer_name(NEW.alias_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_${div}_customer_aliases_before_insert ON ${div}_customer_aliases;
CREATE TRIGGER trg_${div}_customer_aliases_before_insert
  BEFORE INSERT ON ${div}_customer_aliases
  FOR EACH ROW
  EXECUTE FUNCTION ${div}_customer_aliases_before_insert();

-- Update trigger for customer_master
CREATE OR REPLACE FUNCTION ${div}_customer_master_before_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  IF NEW.customer_name <> OLD.customer_name THEN
    NEW.customer_name_normalized := ${div}_normalize_customer_name(NEW.customer_name);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_${div}_customer_master_before_update ON ${div}_customer_master;
CREATE TRIGGER trg_${div}_customer_master_before_update
  BEFORE UPDATE ON ${div}_customer_master
  FOR EACH ROW
  EXECUTE FUNCTION ${div}_customer_master_before_update();
`;

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

async function setupDivision(division, dryRun = false) {
  const config = dbConfigs[division];
  if (!config) {
    console.error(`❌ No database config found for division: ${division}`);
    return false;
  }

  const pool = new Pool(config);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Setting up Customer Master for division: ${division.toUpperCase()}`);
  console.log(`   Database: ${config.database}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Test connection
    const client = await pool.connect();
    console.log(`✅ Connected to ${config.database}`);

    const queries = [
      { name: 'Code Sequences Table', sql: createCodeSequencesTable(division) },
      { name: 'Customer Master Table', sql: createCustomerMasterTable(division) },
      { name: 'Customer Master Indexes', sql: createCustomerMasterIndexes(division) },
      { name: 'Customer Aliases Table', sql: createCustomerAliasesTable(division) },
      { name: 'Customer Aliases Indexes', sql: createCustomerAliasesIndexes(division) },
      { name: 'Merge Code Columns', sql: addMergeCodeColumns(division) },
      { name: 'Merge Code Index', sql: createMergeCodeIndex(division) },
      { name: 'Get Next Sequence Function', sql: createGetNextSequenceFunction(division) },
      { name: 'Generate Customer Code Function', sql: createGenerateCustomerCodeFunction(division) },
      { name: 'Generate Merge Code Function', sql: createGenerateMergeCodeFunction(division) },
      { name: 'Normalize Customer Name Function', sql: createNormalizeFunction(division) },
      { name: 'Triggers', sql: createTriggers(division) },
    ];

    for (const query of queries) {
      console.log(`\n⏳ Creating: ${query.name}...`);
      if (dryRun) {
        console.log(`   [DRY RUN] Would execute:\n${query.sql.substring(0, 200)}...`);
      } else {
        await client.query(query.sql);
        console.log(`   ✅ ${query.name} created successfully`);
      }
    }

    // Verify tables exist
    if (!dryRun) {
      console.log('\n📊 Verifying created objects...');
      
      const tableCheck = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '${division}_%'
        AND table_name IN ('${division}_customer_master', '${division}_customer_aliases', '${division}_code_sequences')
      `);
      
      console.log(`   Found ${tableCheck.rows.length} customer tables:`);
      tableCheck.rows.forEach(row => console.log(`   - ${row.table_name}`));
      
      const functionCheck = await client.query(`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name LIKE '${division}_%'
        AND routine_type = 'FUNCTION'
      `);
      
      console.log(`   Found ${functionCheck.rows.length} functions`);
    }

    client.release();
    console.log(`\n✅ Division ${division.toUpperCase()} setup complete!`);
    return true;

  } catch (error) {
    console.error(`\n❌ Error setting up division ${division}:`, error.message);
    if (error.detail) console.error(`   Detail: ${error.detail}`);
    return false;
  } finally {
    await pool.end();
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('   CUSTOMER MASTER DATA MODULE - DATABASE SETUP');
  console.log('═'.repeat(60));

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const divisionArg = args.find(a => a.startsWith('--division='));
  const specificDivision = divisionArg ? divisionArg.split('=')[1] : null;

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const divisionsToSetup = specificDivision ? [specificDivision] : divisions;
  const results = [];

  for (const division of divisionsToSetup) {
    const success = await setupDivision(division, dryRun);
    results.push({ division, success });
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('   SETUP SUMMARY');
  console.log('═'.repeat(60));

  results.forEach(r => {
    const status = r.success ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`   ${r.division.toUpperCase()}: ${status}`);
  });

  const allSuccess = results.every(r => r.success);
  
  if (allSuccess && !dryRun) {
    console.log('\n🎉 All divisions set up successfully!');
    console.log('\nNext steps:');
    console.log('1. Run migration script to populate customer_master from existing data');
    console.log('2. Update merge rules with merge_code values');
    console.log('3. Test the new customer code generation');
  }

  process.exit(allSuccess ? 0 : 1);
}

main();
