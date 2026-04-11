/**
 * Division Database Management Helper
 * Handles creation and deletion of separate division databases
 */

const { Pool } = require('pg');
require('dotenv').config();

/**
 * Get all table structures from FP database to clone for new divisions
 */
async function getFPTableStructures() {
  const fpPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'fp_database',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  try {
    // Get all FP tables (excluding archives and backups)
    const tables = [
      'fp_actualcommon',  // Main actual sales data (formerly fp_data_excel)
      'fp_master_config',
      'fp_material_percentages',
      'fp_product_group_pricing_rounding',
      'fp_customer_merge_rules',
      'fp_sales_rep_budget',
      'fp_budget_unified_draft',
      'fp_merge_rule_suggestions',
      'fp_merge_rule_notifications',
      'fp_merge_rule_rejections',
      'fp_database_upload_log',
      'fp_customer_similarity_cache'
    ];

    const structures = {};

    for (const tableName of tables) {
      // Get table structure using pg_dump
      const result = await fpPool.query(`
        SELECT 
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          a.attnotnull as not_null,
          pg_get_expr(d.adbin, d.adrelid) as default_value
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
        WHERE a.attrelid = $1::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `, [tableName]);

      structures[tableName] = result.rows;
    }

    await fpPool.end();
    return structures;
  } catch (error) {
    await fpPool.end();
    throw error;
  }
}

/**
 * Create new division database with all tables cloned from FP
 */
async function createDivisionDatabase(divisionCode, divisionName) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  
  // Connection to postgres database for creating new database
  const masterPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  try {
    // Check if database already exists
    const checkDB = await masterPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkDB.rows.length > 0) {
      await masterPool.end();
      throw new Error(`Database ${dbName} already exists`);
    }

    // Create new database
    await masterPool.query(`CREATE DATABASE ${dbName} WITH OWNER = postgres ENCODING = 'UTF8'`);
    console.log(`✅ Created database: ${dbName}`);
    
    await masterPool.end();

    // Connect to new database to create tables
    const newDbPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: dbName,
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });

    // Clone table structures from FP database
    const fpPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: 'fp_database',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });

    const tablesToClone = [
      'data_excel',
      'master_config',
      'material_percentages',
      'product_group_pricing_rounding',
      'customer_merge_rules',
      'sales_rep_budget',
      'budget_unified_draft',
      'merge_rule_suggestions',
      'merge_rule_notifications',
      'merge_rule_rejections',
      'database_upload_log',
      'customer_similarity_cache'
    ];

    const divCode = divisionCode.toLowerCase();

    for (const baseTableName of tablesToClone) {
      const fpTableName = `fp_${baseTableName}`;
      const newTableName = `${divCode}_${baseTableName}`;

      try {
        // Check if FP table exists
        const fpTableCheck = await fpPool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
          [fpTableName]
        );

        if (fpTableCheck.rows.length === 0) {
          console.log(`⚠️  FP table ${fpTableName} doesn't exist, skipping...`);
          continue;
        }

        // Get CREATE TABLE statement using pg_dump approach
        // For simplicity, we'll use a direct structure copy
        const createTableResult = await fpPool.query(`
          SELECT 
            'CREATE TABLE ' || $2 || ' (' || 
            string_agg(
              quote_ident(column_name) || ' ' || 
              column_type || 
              CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
              CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
              ', '
            ) || ');' as create_statement
          FROM (
            SELECT 
              a.attname as column_name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) as column_type,
              CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as is_nullable,
              pg_get_expr(d.adbin, d.adrelid) as column_default,
              a.attnum
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = $1::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
          ) cols
        `, [fpTableName, newTableName]);

        if (createTableResult.rows.length > 0) {
          await newDbPool.query(createTableResult.rows[0].create_statement);
          console.log(`✅ Created table: ${newTableName}`);

          // Copy indexes
          const indexesResult = await fpPool.query(`
            SELECT indexdef 
            FROM pg_indexes 
            WHERE tablename = $1 AND schemaname = 'public'
          `, [fpTableName]);

          for (const idxRow of indexesResult.rows) {
            // Replace fp_ with division code in index definition
            const newIndexDef = idxRow.indexdef
              .replace(new RegExp(fpTableName, 'g'), newTableName)
              .replace(new RegExp(`idx_${fpTableName}`, 'g'), `idx_${newTableName}`);
            
            try {
              await newDbPool.query(newIndexDef);
            } catch (idxError) {
              console.log(`⚠️  Could not create index for ${newTableName}:`, idxError.message);
            }
          }
        }
      } catch (tableError) {
        console.error(`❌ Error creating table ${newTableName}:`, tableError.message);
      }
    }

    await fpPool.end();
    await newDbPool.end();

    console.log(`✅ Division ${divisionCode} (${divisionName}) database created successfully!`);
    return { success: true, database: dbName };

  } catch (error) {
    await masterPool.end();
    throw error;
  }
}

/**
 * Delete division database completely
 * Also drops all prefixed tables from fp_database
 */
async function deleteDivisionDatabase(divisionCode) {
  const dbName = `${divisionCode.toLowerCase()}_database`;
  const tablePrefix = `${divisionCode.toLowerCase()}_`;
  
  // Don't allow deleting FP database
  if (divisionCode.toUpperCase() === 'FP') {
    throw new Error('Cannot delete FP database - it is the master template');
  }

  const masterPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  // Also connect to fp_database to drop prefixed tables there
  const fpPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'fp_database',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  try {
    // STEP 1: Drop all prefixed tables from fp_database
    // This catches AI learning tables, behavior history, etc. that were created in main DB
    console.log(`🧹 Cleaning up ${tablePrefix}* tables from fp_database...`);
    
    const prefixedTables = await fpPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE $1
      ORDER BY table_name
    `, [tablePrefix + '%']);

    if (prefixedTables.rows.length > 0) {
      console.log(`  Found ${prefixedTables.rows.length} prefixed tables to drop`);
      for (const row of prefixedTables.rows) {
        await fpPool.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE`);
        console.log(`  ✅ Dropped: ${row.table_name}`);
      }
    } else {
      console.log(`  No prefixed tables found in fp_database`);
    }

    await fpPool.end();

    // STEP 2: Drop the separate division database (if it exists)
    // Terminate all connections to the database first
    await masterPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop the database
    await masterPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✅ Deleted database: ${dbName}`);
    
    await masterPool.end();
    return { success: true, database: dbName, droppedTables: prefixedTables.rows.length };

  } catch (error) {
    try { await fpPool.end(); } catch (e) {}
    try { await masterPool.end(); } catch (e) {}
    throw error;
  }
}

module.exports = {
  getFPTableStructures,
  createDivisionDatabase,
  deleteDivisionDatabase
};
