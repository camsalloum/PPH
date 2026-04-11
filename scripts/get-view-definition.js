/**
 * Get full view definition - find the source table
 */

const oracledb = require('oracledb');

const ORACLE_CONFIG = {
  user: 'noor',
  password: '***REDACTED***',
  connectString: 'PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com'
};

const ORACLE_CLIENT_PATH = 'D:\\app\\client\\Administrator\\product\\12.1.0\\client_1';

async function getViewDefinition() {
  let conn;
  
  try {
    oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });
  } catch (e) {}
  
  try {
    conn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('✅ Connected\n');
    
    // Get full view text using DBMS_METADATA
    console.log('📋 Getting XL_FPSALESVSCOST_FULL view definition...\n');
    
    try {
      // Try using LONG column directly
      const result = await conn.execute(
        `SELECT text FROM all_views WHERE owner = 'HAP111' AND view_name = 'XL_FPSALESVSCOST_FULL'`,
        [],
        { fetchInfo: { TEXT: { type: oracledb.STRING } } }
      );
      
      if (result.rows.length > 0) {
        const viewText = result.rows[0][0];
        console.log('VIEW DEFINITION:');
        console.log('═'.repeat(60));
        console.log(viewText);
        console.log('═'.repeat(60));
        
        // Extract table names from the view
        const fromMatch = viewText.match(/FROM\s+([^\s,]+)/gi);
        if (fromMatch) {
          console.log('\n📊 Tables referenced in view:');
          fromMatch.forEach(m => console.log('   ' + m));
        }
      }
    } catch (e) {
      console.log('Error getting view text: ' + e.message);
      
      // Alternative: check dependencies
      console.log('\n📋 Checking view dependencies...');
      const deps = await conn.execute(
        `SELECT referenced_owner, referenced_name, referenced_type 
         FROM all_dependencies 
         WHERE owner = 'HAP111' AND name = 'XL_FPSALESVSCOST_FULL'`
      );
      
      console.log('\n📊 View depends on:');
      deps.rows.forEach(r => console.log(`   ${r[0]}.${r[1]} (${r[2]})`));
    }
    
    // Also check if there's a simpler table with similar name
    console.log('\n📋 Looking for similar tables/views...');
    const similar = await conn.execute(
      `SELECT object_name, object_type FROM all_objects 
       WHERE owner = 'HAP111' 
       AND (object_name LIKE '%FPSALES%' OR object_name LIKE '%SALESVS%' OR object_name LIKE '%FP_SALES%')
       ORDER BY object_name`
    );
    
    if (similar.rows.length > 0) {
      console.log('   Found:');
      similar.rows.forEach(r => console.log(`   - ${r[0]} (${r[1]})`));
    } else {
      console.log('   None found');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) await conn.close();
  }
}

getViewDefinition();
