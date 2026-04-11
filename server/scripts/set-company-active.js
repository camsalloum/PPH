const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

async function setCompanyActive() {
  try {
    const result = await platformPool.query(
      'UPDATE companies SET subscription_status = $1 WHERE company_code = $2 RETURNING *',
      ['active', 'interplast']
    );
    
    console.log('✅ Company set to active:', result.rows[0]);
    await platformPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await platformPool.end();
    process.exit(1);
  }
}

setCompanyActive();
