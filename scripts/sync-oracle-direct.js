/**
 * Sync Oracle Direct to PostgreSQL
 * Pulls data from Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL) directly into fp_raw_oracle
 * Bypasses the Excel export workflow
 * 
 * Usage: node scripts/sync-oracle-direct.js [--year=2025] [--batch-size=1000]
 */

const oracledb = require('oracledb');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: './server/.env' });

// Oracle Configuration (from ERP integration files - using noor credentials that work)
const ORACLE_CONFIG = {
  user: 'noor',
  password: '***REDACTED***',
  connectString: 'PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com'
};

const ORACLE_CLIENT_PATH = 'D:\\app\\client\\Administrator\\product\\12.1.0\\client_1';

// PostgreSQL Configuration
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

// Parse command line arguments
function parseArgs() {
  const args = { year: null, batchSize: 1000, division: null };
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--year=')) args.year = parseInt(arg.split('=')[1]);
    if (arg.startsWith('--batch-size=')) args.batchSize = parseInt(arg.split('=')[1]);
    if (arg.startsWith('--division=')) args.division = arg.split('=')[1];
  });
  return args;
}

// All 57 Oracle columns
const ORACLE_COLUMNS = [
  'DIVISION', 'SUBDIVISION', 'CUSTOMERTITLE', 'ITEMCODE', 'ITEMGROUPCODE',
  'ITEMGROUPDESCRIPTION', 'SUBGROUP', 'ITEMDESCRIPTION', 'WEIGHT', 'FINANCIALCUSTOMER',
  'CUSTOMER', 'CUSTOMERNAME', 'FIRSTRANDATE', 'COUNTRYNAME', 'SALESREPNAME',
  'SALESREPCODE', 'UNITDESCRIPTION', 'SELECTIONCODEDESCRIPTION', 'SELECTIONCODE',
  'PRODUCTTYPE', 'INVOICEDATE', 'TRANSACTIONTYPE', 'INVOICENO', 'PRODUCTGROUP',
  'YEAR1', 'MONTH1', 'MONTHNO', 'DELIVEREDQTYINSTORAGEUNITS', 'DELIVEREDQUANTITY',
  'DELIVEREDQUANTITYKGS', 'INVOICEDAMOUNT', 'MATERIALVALUE', 'OPVALUE', 'MARGINOVERRM',
  'TOTALVALUE', 'MARGINOVERTOTAL', 'MACHINENO', 'MACHINENAME', 'TITLECODE', 'TITLENAME',
  'ADDRESS_1', 'ADDRESS_2', 'POSTBOX', 'PHONE', 'BUILDING', 'CREDITLIMIT', 'PAYMENTCODE',
  'TERMSOFPAYMENT', 'PAYMENTDAYS', 'CONTACTNAME', 'CONTACTPOSITION', 'CONTDEPARTMENT',
  'CONTTEL', 'CONTMOB', 'CONTEMAIL', 'BUSINESSPARTNERTYPE', 'DELIVERYTERMS'
];

const PG_COLUMNS = ORACLE_COLUMNS.map(c => c.toLowerCase());

async function syncOracleDirect() {
  let oracleConn = null;
  const pgClient = await pgPool.connect();
  const args = parseArgs();
  const batchId = uuidv4();
  
  console.log('═'.repeat(60));
  console.log('  ORACLE DIRECT SYNC - Bypassing Excel Export');
  console.log('═'.repeat(60));
  console.log(`  Batch ID: ${batchId}`);
  console.log(`  Year Filter: ${args.year || 'ALL'}`);
  console.log(`  Division Filter: ${args.division || 'ALL'}`);
  console.log(`  Batch Size: ${args.batchSize}`);
  console.log('═'.repeat(60) + '\n');
  
  try {
    // Initialize Oracle Client
    console.log('🔧 Initializing Oracle Client...');
    try {
      oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });
    } catch (err) {
      if (!err.message.includes('already initialized')) throw err;
    }
    console.log('   ✅ Oracle Client ready\n');
    
    // Connect to Oracle
    console.log('🔌 Connecting to Oracle ERP...');
    oracleConn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log(`   ✅ Connected to Oracle ${oracleConn.oracleServerVersionString}\n`);
    
    // Build query with optional filters
    let whereClause = '';
    const conditions = [];
    if (args.year) conditions.push(`YEAR1 = ${args.year}`);
    if (args.division) conditions.push(`DIVISION = '${args.division}'`);
    if (conditions.length > 0) whereClause = 'WHERE ' + conditions.join(' AND ');
    
    // Skip slow COUNT - just start streaming
    console.log('📊 Starting data stream (skipping slow COUNT)...\n');
    
    // Clear existing data for this sync
    console.log('🗑️  Clearing existing data in fp_raw_oracle...');
    if (args.year) {
      await pgClient.query(`DELETE FROM fp_raw_oracle WHERE year1 = $1`, [args.year]);
      console.log(`   Cleared data for year ${args.year}\n`);
    } else {
      await pgClient.query(`TRUNCATE TABLE fp_raw_oracle`);
      console.log('   Table truncated\n');
    }
    
    // Build SELECT query
    const selectSQL = `
      SELECT ${ORACLE_COLUMNS.join(', ')}
      FROM HAP111.XL_FPSALESVSCOST_FULL
      ${whereClause}
    `;
    
    // DEBUG: Log the SQL
    console.log('📝 SQL Query:');
    console.log(selectSQL);
    console.log('');
    
    // Fetch and insert
    console.log('📥 Fetching data from Oracle (direct fetch - no streaming)...');
    console.log('   ⏳ This may take 5-10 minutes due to slow Oracle view...\n');
    const startTime = Date.now();
    
    // DIRECT FETCH - faster for slow Oracle views (no cursor overhead)
    const result = await oracleConn.execute(selectSQL, [], {
      outFormat: oracledb.OUT_FORMAT_ARRAY
    });
    
    const allRows = result.rows || [];
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Oracle query completed in ${fetchTime}s`);
    console.log(`   📊 Fetched ${allRows.length} rows from Oracle\n`);
    
    if (allRows.length === 0) {
      console.log('⚠️  No data returned from Oracle. Nothing to insert.');
      return;
    }
    
    let insertedRows = 0;
    
    // Prepare PostgreSQL insert statement
    const placeholders = PG_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
    const insertSQL = `
      INSERT INTO fp_raw_oracle (${PG_COLUMNS.join(', ')}, oracle_sync_batch_id)
      VALUES (${placeholders}, $${PG_COLUMNS.length + 1})
    `;
    
    // START POSTGRESQL TRANSACTION
    await pgClient.query('BEGIN');
    console.log('🔄 PostgreSQL transaction started (BEGIN)\n');
    
    // Insert all rows
    console.log('📤 Inserting into PostgreSQL...');
    for (const row of allRows) {
      await pgClient.query(insertSQL, [...row, batchId]);
      insertedRows++;
      
      // Progress every 100 rows
      if (insertedRows % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   📊 ${insertedRows} rows inserted | ${elapsed}s`);
      }
    }
    
    // COMMIT POSTGRESQL TRANSACTION
    await pgClient.query('COMMIT');
    console.log('\n✅ PostgreSQL transaction committed (COMMIT)\n');
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n✅ Sync completed!`);
    console.log(`   Rows inserted: ${insertedRows.toLocaleString()}`);
    console.log(`   Time elapsed: ${totalTime}s`);
    console.log(`   Average rate: ${(insertedRows / totalTime).toFixed(0)} rows/sec`);
    console.log(`   Batch ID: ${batchId}\n`);
    
    // Verify
    const verifyResult = await pgClient.query(`SELECT COUNT(*) FROM fp_raw_oracle WHERE oracle_sync_batch_id = $1`, [batchId]);
    console.log(`   ✅ Verified: ${verifyResult.rows[0].count} rows in PostgreSQL\n`);
    
  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
    
    // ROLLBACK on error
    try {
      await pgClient.query('ROLLBACK');
      console.log('🔙 PostgreSQL transaction rolled back');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
    
    if (err.message.includes('ORA-')) {
      console.error('   Oracle Error - Check connection and credentials');
    }
    throw err;
  } finally {
    if (oracleConn) {
      await oracleConn.close();
      console.log('\n🔒 Oracle connection closed');
    }
    pgClient.release();
    await pgPool.end();
  }
}

// Run
syncOracleDirect().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
