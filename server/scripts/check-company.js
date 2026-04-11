const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function checkCompany() {
  const client = new Client({
    connectionString: process.env.PLATFORM_DATABASE_URL
  });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT company_code, company_slug, company_name FROM companies 
       WHERE company_code='IP_AUTH' OR company_slug LIKE '%interplast%'`
    );
    console.log('Companies found:', JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkCompany();
