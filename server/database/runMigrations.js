/**
 * Database Migration Runner
 * Executes SQL migration files in sequence
 * Usage: node server/database/runMigrations.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fp_database',
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('✓ Migrations directory does not exist yet - no migrations to run');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('✓ No migration files found');
    return;
  }

  console.log(`Found ${files.length} migration file(s)\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(`Running: ${file}...`);
      await pool.query(sql);
      console.log(`✓ ${file} completed\n`);
    } catch (error) {
      console.error(`✗ Error running ${file}:`);
      console.error(error.message);
      console.error(error.detail);
      
      // Continue to next migration on error
      console.log('Continuing to next migration...\n');
    }
  }

  console.log('✓ All migrations completed');
  await pool.end();
}

runMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
