/**
 * Fast Oracle Sync for 2026 - Optimized batch insert
 */
const oracledb = require('oracledb');
const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const ORACLE_CONFIG = {
  user: 'noor',
  password: '***REDACTED***',
  connectString: 'PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com'
};

const ORACLE_CLIENT_PATH = 'D:\\app\\client\\Administrator\\product\\12.1.0\\client_1';

const pgPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***'
});

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

async function fastSync2026() {
  let oracleConn = null;
  const pgClient = await pgPool.connect();
  
  console.log('═'.repeat(50));
  console.log('  FAST SYNC 2026 FROM ORACLE');
  console.log('═'.repeat(50));
  
  try {
    // Init Oracle
    console.log('\n🔧 Initializing Oracle...');
    try {
      oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });
    } catch (err) {
      if (!err.message.includes('already initialized')) throw err;
    }
    
    // Connect
    console.log('🔌 Connecting to Oracle...');
    oracleConn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('   ✅ Connected\n');
    
    // Delete existing 2026
    console.log('🗑️  Deleting existing 2026 data from fp_raw_oracle...');
    const delResult = await pgClient.query('DELETE FROM fp_raw_oracle WHERE year1 = 2026');
    console.log(`   Deleted ${delResult.rowCount} rows\n`);
    
    // Fetch ALL 2026 rows at once (only 327 rows, small enough)
    console.log('📥 Fetching 2026 data from Oracle...');
    const startTime = Date.now();
    
    const result = await oracleConn.execute(
      `SELECT ${ORACLE_COLUMNS.join(', ')} FROM HAP111.XL_FPSALESVSCOST_FULL WHERE YEAR1 = 2026`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY }
    );
    
    const rows = result.rows;
    console.log(`   ✅ Fetched ${rows.length} rows in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
    
    if (rows.length === 0) {
      console.log('⚠️  No 2026 data in Oracle!');
      return;
    }
    
    // Insert into PostgreSQL using multi-value insert
    console.log('📤 Inserting into fp_raw_oracle...');
    
    await pgClient.query('BEGIN');
    
    let inserted = 0;
    for (const row of rows) {
      const placeholders = PG_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
      await pgClient.query(
        `INSERT INTO fp_raw_oracle (${PG_COLUMNS.join(', ')}) VALUES (${placeholders})`,
        row
      );
      inserted++;
      if (inserted % 50 === 0) {
        console.log(`   ${inserted}/${rows.length} rows...`);
      }
    }
    
    await pgClient.query('COMMIT');
    console.log(`   ✅ Inserted ${inserted} rows\n`);
    
    // Sync to fp_actualcommon
    console.log('📊 Syncing to fp_actualcommon...');
    await pgClient.query('SELECT sync_oracle_to_actualcommon()');
    console.log('   ✅ Done!\n');
    
    // Verify
    const verify = await pgClient.query(`
      SELECT year, admin_division_code, COUNT(*) as cnt 
      FROM fp_actualcommon 
      WHERE year >= 2025 
      GROUP BY year, admin_division_code 
      ORDER BY year DESC
    `);
    console.log('📋 fp_actualcommon summary:');
    verify.rows.forEach(r => console.log(`   ${r.year} | ${r.admin_division_code} | ${r.cnt} rows`));
    
    console.log('\n✅ SYNC COMPLETE!');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await pgClient.query('ROLLBACK');
  } finally {
    if (oracleConn) await oracleConn.close();
    pgClient.release();
    await pgPool.end();
  }
}

fastSync2026();
