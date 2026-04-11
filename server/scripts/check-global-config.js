const { pool } = require('../database/config');

async function checkGlobalConfig() {
  try {
    console.log('🔍 Checking global_config table...');
    
    const query = 'SELECT config_key, config_value, description FROM global_config ORDER BY config_key';
    const result = await pool.query(query);
    
    console.log('📊 Current global configuration:');
    console.log('================================');
    
    result.rows.forEach(row => {
      console.log(`${row.config_key}:`);
      console.log(`  Description: ${row.description}`);
      
      try {
        const parsed = JSON.parse(row.config_value);
        if (Array.isArray(parsed)) {
          console.log(`  Value: Array with ${parsed.length} items`);
          if (parsed.length > 0) {
            console.log(`  First item: ${JSON.stringify(parsed[0], null, 2)}`);
          }
        } else {
          console.log(`  Value: ${parsed}`);
        }
      } catch (e) {
        console.log(`  Value: ${row.config_value}`);
      }
      console.log('');
    });
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkGlobalConfig();
