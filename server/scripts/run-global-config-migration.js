const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');

async function createGlobalConfigTable() {
  try {
    console.log('🚀 Creating global_config table...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-global-config-table.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    await pool.query(sqlContent);
    
    console.log('✅ global_config table created successfully!');
    console.log('📋 Table includes:');
    console.log('   - standardColumnSelection (for all divisions)');
    console.log('   - basePeriodIndex (for all divisions)');
    console.log('   - chartVisibleColumns (for all divisions)');
    
    // Test the table by inserting a test record
    const testQuery = `
      INSERT INTO global_config (config_key, config_value, description) 
      VALUES ('test_key', 'test_value', 'Test configuration')
      ON CONFLICT (config_key) DO NOTHING
    `;
    await pool.query(testQuery);
    
    // Clean up test record
    await pool.query('DELETE FROM global_config WHERE config_key = $1', ['test_key']);
    
    console.log('🧪 Table test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error creating global_config table:', error);
    throw error;
  }
}

// Run the migration
createGlobalConfigTable()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
