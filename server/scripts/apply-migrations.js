/**
 * server/scripts/apply-migrations.js
 * 
 * Run pending migrations on tenant databases
 * Usage: node server/scripts/apply-migrations.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { pool } = require('../database/config');
const multiTenantPool = require('../database/multiTenantPool');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`\n📋 Found ${files.length} SQL migration files\n`);

    // Get all tenant databases from the platform database
    const result = await pool.query(`
      SELECT DISTINCT company_code FROM company_divisions WHERE company_code IS NOT NULL
    `);
    
    const companyCodes = result.rows.map(r => r.company_code);
    console.log(`🏢 Found ${companyCodes.length} companies: ${companyCodes.join(', ')}\n`);

    for (const companyCode of companyCodes) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Applying migrations to: ${companyCode}`);
      console.log(`${'='.repeat(60)}\n`);

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        try {
          console.log(`⏳ Running: ${file}`);
          await multiTenantPool.tenantQuery(companyCode, sql);
          console.log(`✅ ${file} - SUCCESS\n`);
        } catch (error) {
          console.error(`❌ ${file} - FAILED`);
          console.error(`   Error: ${error.message}\n`);
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Migration run complete`);
    console.log(`${'='.repeat(60)}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();
