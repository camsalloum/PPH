const { pool } = require('../database/config');
const fs = require('fs');
const path = require('path');

async function createTables() {
  try {
    console.log('🔧 Creating FP Master Data tables...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-fp-master-data-tables-simple.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sqlContent.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await pool.query(statement);
      }
    }
    
    console.log('✅ Tables created successfully!');
    
    // Verify tables exist
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'fp_material_percentages'
      ) as material_table_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'fp_master_config'
      ) as config_table_exists
    `);
    
    console.log('📋 Table verification:', tableCheck.rows[0]);
    
    // Test the API endpoints
    console.log('\n🧪 Testing API endpoints...');
    
    // Test getting product groups
    try {
      const fpDataService = require('../database/FPDataService');
      const productGroups = await fpDataService.getProductGroupsForMasterData();
      console.log(`✅ Product groups loaded: ${productGroups.length} groups`);
      console.log('📝 Product groups:', productGroups.slice(0, 5).join(', '), productGroups.length > 5 ? '...' : '');
    } catch (error) {
      console.log('❌ Error loading product groups:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

createTables();
