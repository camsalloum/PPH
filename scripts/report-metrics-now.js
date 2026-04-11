/**
 * Manual Metrics Report for Interplast
 * Run this once to push initial metrics to the platform
 */

const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const PLATFORM_URL = 'http://localhost:3001';
const API_KEY = 'ppk_6aa8ac574b3f192f584e90821040be5ec4211abb8ca5b1e70901ee73def13465';
const API_SECRET = '31ac2925b094d16451f7ac36d43bf880cc2a1fe3573e1fa065bbd484a29b7211803c96fb93f01cf6a2dc6855e89bd764';

// Auth database connection
const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '***REDACTED***',
  port: process.env.DB_PORT || 5432,
});

// Platform database connection  
const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '***REDACTED***',
  port: process.env.DB_PORT || 5432,
});

async function reportMetrics() {
  console.log('🔄 Collecting Interplast metrics...\n');

  try {
    // Get user counts
    const usersResult = await authPool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_users,
        COUNT(*) as total_users
      FROM users
    `);
    
    // Get division count from platform
    const divisionsResult = await platformPool.query(`
      SELECT COUNT(*) as count 
      FROM company_divisions 
      WHERE company_id = (SELECT company_id FROM companies WHERE company_code = 'interplast')
        AND is_active = TRUE
    `);
    
    const metrics = {
      active_user_count: parseInt(usersResult.rows[0].active_users) || 0,
      total_user_count: parseInt(usersResult.rows[0].total_users) || 0,
      division_count: parseInt(divisionsResult.rows[0].count) || 0,
      storage_used_mb: 250,
      monthly_active_users: parseInt(usersResult.rows[0].active_users) || 0,
      data_records_count: 76,
      last_activity_at: new Date().toISOString(),
    };

    console.log('📊 Metrics collected:');
    console.log(`   Active Users: ${metrics.active_user_count}`);
    console.log(`   Total Users: ${metrics.total_user_count}`);
    console.log(`   Divisions: ${metrics.division_count}`);
    console.log(`   Storage: ${metrics.storage_used_mb} MB`);
    console.log();

    console.log('📤 Reporting to platform...');
    
    const response = await axios.post(
      `${PLATFORM_URL}/api/platform/tenant-metrics/report`,
      metrics,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
          'X-API-Secret': API_SECRET,
        },
        timeout: 10000,
      }
    );

    if (response.data.success) {
      console.log('✅ Metrics successfully reported to platform!');
      console.log('   Reported at:', response.data.data.reported_at);
      console.log('\n🎉 Refresh the Platform Dashboard to see updated metrics!\n');
    } else {
      console.error('❌ Platform rejected metrics:', response.data.error);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Cannot connect to platform server.');
      console.error('   Make sure the backend server is running on port 5000');
      console.error('   Run: START-SERVERS.cmd\n');
    } else if (error.response) {
      console.error('❌ Platform error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await authPool.end();
    await platformPool.end();
  }
}

reportMetrics();
