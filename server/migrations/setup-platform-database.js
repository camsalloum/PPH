/**
 * Create Platform Database and Run Migration
 * Run: node migrations/setup-platform-database.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432,
};

const PLATFORM_DB_NAME = 'propackhub_platform';

async function run() {
  console.log('=========================================');
  console.log('  ProPackHub Platform Database Setup');
  console.log('=========================================\n');

  // Connect to postgres database to create new database
  const adminPool = new Pool({ ...config, database: 'postgres' });

  try {
    // Check if database exists
    console.log('1. Checking if database exists...');
    const checkResult = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [PLATFORM_DB_NAME]
    );

    if (checkResult.rows.length === 0) {
      console.log(`   Creating database: ${PLATFORM_DB_NAME}`);
      await adminPool.query(`CREATE DATABASE ${PLATFORM_DB_NAME}`);
      console.log('   ✅ Database created!\n');
    } else {
      console.log(`   ✅ Database already exists\n`);
    }
  } catch (error) {
    console.error('   ❌ Error creating database:', error.message);
    await adminPool.end();
    process.exit(1);
  }

  await adminPool.end();

  // Now connect to the new database and run migration
  console.log('2. Connecting to platform database...');
  const platformPool = new Pool({ ...config, database: PLATFORM_DB_NAME });

  try {
    await platformPool.query('SELECT 1');
    console.log('   ✅ Connected!\n');

    // Read migration file
    console.log('3. Running migration...');
    const migrationPath = path.join(__dirname, '200_create_platform_database.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split by statements and run (handle DO blocks specially)
    await platformPool.query(migrationSQL);
    console.log('   ✅ Migration completed!\n');

    // Verify tables created
    console.log('4. Verifying tables...');
    const tablesResult = await platformPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('   Tables created:');
    tablesResult.rows.forEach(r => console.log(`     - ${r.table_name}`));

    // Verify data seeded
    console.log('\n5. Verifying seed data...');
    
    const plansResult = await platformPool.query('SELECT plan_code, plan_name FROM subscription_plans');
    console.log('   Subscription Plans:');
    plansResult.rows.forEach(r => console.log(`     - ${r.plan_code}: ${r.plan_name}`));

    const companiesResult = await platformPool.query('SELECT company_code, company_name, database_name FROM companies');
    console.log('   Companies:');
    companiesResult.rows.forEach(r => console.log(`     - ${r.company_code}: ${r.company_name} (${r.database_name})`));

    const divisionsResult = await platformPool.query(`
      SELECT c.company_code, d.division_code, d.division_name 
      FROM company_divisions d 
      JOIN companies c ON d.company_id = c.company_id
    `);
    console.log('   Divisions:');
    divisionsResult.rows.forEach(r => console.log(`     - ${r.company_code}/${r.division_code}: ${r.division_name}`));

    const usersResult = await platformPool.query(`
      SELECT email, role, is_platform_admin 
      FROM platform_users
    `);
    console.log('   Platform Users:');
    usersResult.rows.forEach(r => console.log(`     - ${r.email} (${r.role}, platform_admin=${r.is_platform_admin})`));

    console.log('\n=========================================');
    console.log('  ✅ Platform Database Setup Complete!');
    console.log('=========================================');
    console.log('\nPlatform Admin Credentials:');
    console.log('  Email:    admin@propackhub.com');
    console.log('  Password: ProPackHub2025!');
    console.log('\n⚠️  Change this password immediately after first login!');
    console.log('=========================================\n');

  } catch (error) {
    console.error('   ❌ Error running migration:', error.message);
    console.error(error);
  } finally {
    await platformPool.end();
  }
}

run();
