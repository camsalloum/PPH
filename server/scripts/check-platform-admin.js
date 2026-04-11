const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const platformDb = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

(async () => {
  try {
    const result = await platformDb.query(
      'SELECT * FROM platform_users WHERE email = $1',
      ['admin@propackhub.com']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Platform admin not found');
      console.log('Run: node migrations/setup-platform-database.js');
    } else {
      console.log('✅ Platform admin found:');
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log('\nLogin credentials:');
      console.log('Email: admin@propackhub.com');
      console.log('Password: platform2025');
    }
    
    await platformDb.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
