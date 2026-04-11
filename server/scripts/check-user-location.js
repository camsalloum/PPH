const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const authPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

(async () => {
  try {
    console.log('Checking user in legacy auth database (ip_auth_database):');
    const legacyResult = await authPool.query(
      'SELECT id, email, name, is_active FROM users WHERE email = $1',
      ['camille@interplast-uae.com']
    );
    console.log('Legacy users:', legacyResult.rows.length);
    if (legacyResult.rows[0]) {
      console.log(JSON.stringify(legacyResult.rows[0], null, 2));
    }
    
    console.log('\nChecking user in platform database (propackhub_platform):');
    const platformResult = await platformPool.query(
      'SELECT user_id, email, display_name, is_active, company_id FROM platform_users WHERE email = $1',
      ['camille@interplast-uae.com']
    );
    console.log('Platform users:', platformResult.rows.length);
    if (platformResult.rows[0]) {
      console.log(JSON.stringify(platformResult.rows[0], null, 2));
    }
    
    await authPool.end();
    await platformPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
