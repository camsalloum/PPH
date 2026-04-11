const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

async function generateApiKey() {
  try {
    console.log('Generating API key for Interplast tenant...\n');
    
    // Check if tenant_api_keys table exists
    const tableCheck = await platformPool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'tenant_api_keys'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('Creating tenant_api_keys table...');
      await platformPool.query(`
        CREATE TABLE tenant_api_keys (
          key_id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(company_id),
          api_key VARCHAR(64) NOT NULL UNIQUE,
          api_secret_hash VARCHAR(128) NOT NULL,
          key_name VARCHAR(100) NOT NULL DEFAULT 'Default',
          scopes JSONB DEFAULT '["metrics:write"]',
          is_active BOOLEAN DEFAULT true,
          expires_at TIMESTAMP,
          last_used_at TIMESTAMP,
          use_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(100)
        )
      `);
      console.log('✅ Table created');
    }
    
    // Check if Interplast already has an API key
    const existing = await platformPool.query(`
      SELECT k.*, c.company_name 
      FROM tenant_api_keys k
      JOIN companies c ON k.company_id = c.company_id
      WHERE c.company_code = 'interplast' AND k.is_active = true
    `);
    
    if (existing.rows.length > 0) {
      console.log('Interplast already has an active API key:');
      console.log(`  Key: ${existing.rows[0].api_key}`);
      console.log('  (Secret is hashed, cannot be recovered)\n');
      console.log('To generate a new key, first deactivate the existing one.');
      
      await platformPool.end();
      process.exit(0);
    }
    
    // Get Interplast company ID
    const company = await platformPool.query(`
      SELECT company_id, company_name FROM companies WHERE company_code = 'interplast'
    `);
    
    if (company.rows.length === 0) {
      console.error('❌ Interplast company not found!');
      await platformPool.end();
      process.exit(1);
    }
    
    const companyId = company.rows[0].company_id;
    
    // Generate API key and secret
    const apiKey = 'pph_' + crypto.randomBytes(24).toString('hex');
    const apiSecret = 'pph_secret_' + crypto.randomBytes(32).toString('hex');
    const secretHash = crypto.createHash('sha256').update(apiSecret).digest('hex');
    
    // Insert the key
    await platformPool.query(`
      INSERT INTO tenant_api_keys (company_id, api_key, api_secret_hash, key_name, created_by)
      VALUES ($1, $2, $3, 'Metrics Reporting Key', 'platform-admin')
    `, [companyId, apiKey, secretHash]);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ API KEY GENERATED FOR INTERPLAST');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  SAVE THESE CREDENTIALS - SECRET CANNOT BE RECOVERED!');
    console.log('');
    console.log(`API Key:    ${apiKey}`);
    console.log(`API Secret: ${apiSecret}`);
    console.log('');
    console.log('Usage in HTTP headers:');
    console.log('  X-API-Key: <api_key>');
    console.log('  X-API-Secret: <api_secret>');
    console.log('');
    console.log('Endpoint: POST /api/platform/tenant-metrics');
    console.log('═══════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await platformPool.end();
    process.exit(0);
  }
}

generateApiKey();
