/**
 * Test RM sync - fetch just 10 rows from Oracle to verify connection and column mapping
 */
const oracledb = require("oracledb");
const path = require("path");

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const ORACLE_CONFIG = {
  user: process.env.ORACLE_SYNC_USER || "noor",
  password: process.env.ORACLE_SYNC_PASSWORD || "***REDACTED***",
  connectString: process.env.ORACLE_CONNECT_STRING || "PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com"
};

const ORACLE_CLIENT_PATH = "D:\\app\\client\\Administrator\\product\\12.1.0\\client_1";
const ORACLE_VIEW = "HAP111.XL_FPRMAVERAGES_PMD_111";

oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });

async function test() {
  console.log('Testing RM sync - fetching 10 rows from Oracle...\n');
  
  let conn;
  try {
    conn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('✓ Connected to Oracle', conn.oracleServerVersionString);
    
    // First, get column names from the view
    console.log('\n1. Getting column metadata...');
    const colResult = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner = 'HAP111' AND table_name = 'XL_FPRMAVERAGES_PMD_111' ORDER BY column_id`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const columns = colResult.rows.map(r => r.COLUMN_NAME);
    console.log(`✓ View has ${columns.length} columns:`);
    console.log('  ' + columns.join(', '));
    
    // Fetch 10 rows
    console.log('\n2. Fetching 10 sample rows...');
    const sql = `SELECT * FROM ${ORACLE_VIEW} WHERE ROWNUM <= 10`;
    const result = await conn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 10
    });
    
    console.log(`✓ Fetched ${result.rows.length} rows\n`);
    
    if (result.rows.length > 0) {
      console.log('Sample rows (first 3):');
      result.rows.slice(0, 3).forEach((row, idx) => {
        console.log(`\n--- Row ${idx + 1} ---`);
        console.log(`  DIVISION: ${row.DIVISION}`);
        console.log(`  ITEMGROUP: ${row.ITEMGROUP}`);
        console.log(`  MAINITEM: "${row.MAINITEM}" (length: ${row.MAINITEM ? row.MAINITEM.length : 0})`);
        console.log(`  MAINITEM trimmed: "${row.MAINITEM ? row.MAINITEM.trim() : ''}" (length: ${row.MAINITEM ? row.MAINITEM.trim().length : 0})`);
        console.log(`  MAINDESCRIPTION: ${row.MAINDESCRIPTION}`);
        console.log(`  MAINCOST: ${row.MAINCOST}`);
        console.log(`  MAINITEMSTOCK: ${row.MAINITEMSTOCK}`);
      });
      
      console.log('\n✅ Test successful! Column mapping:');
      console.log('Oracle columns:', Object.keys(result.rows[0]).join(', '));
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) await conn.close();
  }
}

test();
