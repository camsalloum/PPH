/**
 * Script to populate and maintain admin_division_code in fp_actualcommon
 * This denormalizes the division mapping for better performance and simpler queries
 * 
 * Usage:
 *   node populate-admin-division-code.js
 */

const { Client } = require('pg');
const logger = require('../utils/logger');

async function populateAdminDivisionCode() {
  const client = new Client({
    connectionString: process.env.FP_DATABASE_URL || 'postgres://root:root@localhost:5432/fp_database'
  });

  try {
    await client.connect();
    logger.info('📊 Starting admin_division_code population...\n');

    // Step 1: Get all division mappings
    logger.info('Step 1: Fetching division mappings from company_divisions...');
    const mappingsResult = await client.query(`
      SELECT 
        division_code, 
        mapped_oracle_codes 
      FROM company_divisions 
      WHERE is_active = true
    `);

    if (mappingsResult.rows.length === 0) {
      logger.error('❌ No active divisions found in company_divisions table!');
      return;
    }

    logger.info(`✅ Found ${mappingsResult.rows.length} active divisions\n`);

    // Step 2: For each division, update fp_actualcommon
    let totalUpdated = 0;
    for (const division of mappingsResult.rows) {
      const adminCode = division.division_code.toUpperCase();
      const oracleCodes = division.mapped_oracle_codes;

      logger.info(`Processing admin division: ${adminCode}`);
      logger.info(`  Oracle codes: ${oracleCodes.join(', ')}`);

      // Update all rows where division_code matches any Oracle code
      const updateResult = await client.query(
        `UPDATE fp_actualcommon 
         SET admin_division_code = $1 
         WHERE division_code = ANY($2::text[])
         AND (admin_division_code IS NULL OR admin_division_code != $1)`,
        [adminCode, oracleCodes]
      );

      const rowsUpdated = updateResult.rowCount;
      totalUpdated += rowsUpdated;
      logger.info(`  ✅ Updated ${rowsUpdated} rows\n`);
    }

    // Step 3: Check for any unmapped rows
    logger.info('Step 3: Checking for unmapped rows...');
    const unmappedResult = await client.query(`
      SELECT DISTINCT division_code, COUNT(*) as count
      FROM fp_actualcommon
      WHERE admin_division_code IS NULL
      GROUP BY division_code
    `);

    if (unmappedResult.rows.length > 0) {
      logger.warn('⚠️  Found unmapped divisions:');
      unmappedResult.rows.forEach(row => {
        logger.warn(`   ${row.division_code}: ${row.count} rows`);
      });
      logger.warn('   These divisions may not be configured in company_divisions\n');
    } else {
      logger.info('✅ All rows have admin_division_code assigned\n');
    }

    // Step 4: Verify results
    logger.info('Step 4: Verification...');
    const verifyResult = await client.query(`
      SELECT 
        admin_division_code,
        division_code,
        COUNT(*) as row_count
      FROM fp_actualcommon
      WHERE admin_division_code IS NOT NULL
      GROUP BY admin_division_code, division_code
      ORDER BY admin_division_code, division_code
    `);

    logger.info('\n📊 Division mapping summary:');
    let currentAdmin = null;
    verifyResult.rows.forEach(row => {
      if (row.admin_division_code !== currentAdmin) {
        currentAdmin = row.admin_division_code;
        logger.info(`\n  Admin: ${currentAdmin}`);
      }
      logger.info(`    Oracle ${row.division_code}: ${row.row_count} rows`);
    });

    logger.info(`\n✅ Total rows updated: ${totalUpdated}`);
    logger.info('✅ admin_division_code population complete!\n');

  } catch (error) {
    logger.error('❌ Error populating admin_division_code:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if called directly
if (require.main === module) {
  populateAdminDivisionCode();
}

module.exports = { populateAdminDivisionCode };
