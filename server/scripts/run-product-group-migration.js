const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// FP Database Pool
const fpPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
});

async function runMigration() {
  console.log('🚀 Starting Product Group Master Migration...\n');
  
  try {
    // Read migration files
    const migration1 = fs.readFileSync(
      path.join(__dirname, '../migrations/001-create-unified-master.sql'),
      'utf8'
    );
    
    const migration2 = fs.readFileSync(
      path.join(__dirname, '../migrations/002-migrate-data.sql'),
      'utf8'
    );
    
    // Run migration 1
    console.log('📋 Step 1: Creating unified master table...');
    await fpPool.query(migration1);
    console.log('✅ Step 1 completed\n');
    
    // Run migration 2
    console.log('📋 Step 2: Migrating existing data...');
    await fpPool.query(migration2);
    console.log('✅ Step 2 completed\n');
    
    // Verify results
    const result = await fpPool.query('SELECT COUNT(*) as count FROM fp_product_group_master');
    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Total rows in fp_product_group_master: ${result.rows[0].count}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
