const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

(async () => {
  try {
    const result = await platformPool.query(
      'SELECT company_code, company_name, is_active, subscription_status FROM companies WHERE company_code = $1',
      ['interplast']
    );
    
    console.log('Interplast Company Status:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    await platformPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
