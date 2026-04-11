/**
 * Test Oracle sync with just 10 rows
 */

const oracledb = require("oracledb");
const { Pool } = require("pg");

const ORACLE_CONFIG = {
  user: "noor",
  password: "***REDACTED***",
  connectString: "PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com"
};

const ORACLE_CLIENT_PATH = "D:\\app\\client\\Administrator\\product\\12.1.0\\client_1";

const PG_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "fp_database",
  user: "postgres",
  password: "***REDACTED***"
};

const ORACLE_VIEW = "HAP111.XL_FPSALESVSCOST_FULL";

oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });

const pgPool = new Pool(PG_CONFIG);

async function testSync() {
  console.log('Testing Oracle sync with 10 rows...\n');
  
  let oracleConn;
  const pgClient = await pgPool.connect();
  
  try {
    // Connect to Oracle
    console.log('1. Connecting to Oracle...');
    oracleConn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('   ✓ Connected\n');

    // Fetch just 10 rows
    console.log('2. Fetching 10 rows from Oracle...');
    const sql = `SELECT * FROM ${ORACLE_VIEW} WHERE ROWNUM <= 10`;
    
    const result = await oracleConn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    console.log(`   ✓ Fetched ${result.rows.length} rows\n`);
    
    // Show first row
    if (result.rows.length > 0) {
      console.log('3. Sample row:');
      const row = result.rows[0];
      console.log('   Division:', row.DIVISION);
      console.log('   Customer:', row.CUSTOMERNAME);
      console.log('   Product Group:', row.PRODUCTGROUP);
      console.log('   Year:', row.YEAR1);
      console.log('   Amount:', row.INVOICEDAMOUNT);
      console.log('\n4. Testing sync function...');
      
      // Test the sync function
      await pgClient.query('SELECT sync_oracle_to_actualcommon()');
      console.log('   ✓ Sync function works!\n');
      
      console.log('✅ Test successful! Oracle sync is working correctly.');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    throw err;
  } finally {
    if (oracleConn) {
      await oracleConn.close();
    }
    pgClient.release();
    await pgPool.end();
  }
}

testSync().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
