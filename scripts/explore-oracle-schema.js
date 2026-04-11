/**
 * Explore Oracle schema - find faster alternatives to the slow view
 */

const oracledb = require('oracledb');

const ORACLE_CONFIG = {
  user: 'noor',
  password: '***REDACTED***',
  connectString: 'PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com'
};

const ORACLE_CLIENT_PATH = 'D:\\app\\client\\Administrator\\product\\12.1.0\\client_1';

async function exploreSchema() {
  let conn;
  
  try {
    oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });
  } catch (e) {}
  
  try {
    conn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('✅ Connected\n');
    
    // 1. Check what tables exist in HAP111 schema
    console.log('📋 Tables in HAP111 schema (first 30):');
    const tables = await conn.execute(
      `SELECT table_name FROM all_tables WHERE owner = 'HAP111' AND ROWNUM <= 30 ORDER BY table_name`
    );
    tables.rows.forEach(r => console.log('   - ' + r[0]));
    
    // 2. Check what the view is based on (view definition)
    console.log('\n📋 Checking view definition for XL_FPSALESVSCOST_FULL...');
    try {
      const viewDef = await conn.execute(
        `SELECT text FROM all_views WHERE owner = 'HAP111' AND view_name = 'XL_FPSALESVSCOST_FULL'`
      );
      if (viewDef.rows.length > 0) {
        const text = viewDef.rows[0][0];
        console.log('   View SQL (first 500 chars):');
        console.log('   ' + (typeof text === 'object' ? 'LOB object' : text.substring(0, 500)));
      }
    } catch (e) {
      console.log('   Cannot read view definition: ' + e.message);
    }
    
    // 3. Check for materialized views
    console.log('\n📋 Materialized views in HAP111:');
    const mvs = await conn.execute(
      `SELECT mview_name FROM all_mviews WHERE owner = 'HAP111'`
    );
    if (mvs.rows.length === 0) {
      console.log('   None found');
    } else {
      mvs.rows.forEach(r => console.log('   - ' + r[0]));
    }
    
    // 4. Look for tables with SALES, COST, FP in name
    console.log('\n📋 Tables with SALES/COST/FP in name:');
    const salesTables = await conn.execute(
      `SELECT owner, table_name FROM all_tables 
       WHERE (table_name LIKE '%SALES%' OR table_name LIKE '%COST%' OR table_name LIKE '%FP%')
       AND owner IN ('HAP111', 'APPS', 'INV', 'OE')
       AND ROWNUM <= 20`
    );
    salesTables.rows.forEach(r => console.log('   - ' + r[0] + '.' + r[1]));
    
    // 5. Try a direct table that might be faster
    console.log('\n📋 Looking for base transaction tables...');
    const baseTables = await conn.execute(
      `SELECT table_name FROM all_tables 
       WHERE owner = 'HAP111' 
       AND (table_name LIKE '%INV%' OR table_name LIKE '%TRANS%' OR table_name LIKE '%ORDER%')
       AND ROWNUM <= 20`
    );
    baseTables.rows.forEach(r => console.log('   - ' + r[0]));
    
    console.log('\n✅ Schema exploration complete');
    console.log('\n💡 RECOMMENDATION:');
    console.log('   The view XL_FPSALESVSCOST_FULL is slow because it joins many tables.');
    console.log('   Ask your DBA to either:');
    console.log('   1. Create a MATERIALIZED VIEW with periodic refresh');
    console.log('   2. Add indexes on YEAR1, DIVISION columns');
    console.log('   3. Give you access to the base tables');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) await conn.close();
  }
}

exploreSchema();
