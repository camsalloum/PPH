/**
 * Test Platform Login
 * Verifies the platform admin user can authenticate
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function testLogin(email, password) {
  console.log('=== PLATFORM LOGIN TEST ===\n');
  console.log(`Testing login for: ${email}`);
  console.log(`Password: ${password}\n`);
  
  try {
    // 1. Find user
    const userResult = await pool.query(
      'SELECT user_id, email, password_hash, first_name, last_name, role, is_platform_admin, company_id, is_active FROM platform_users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found!');
      return false;
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:');
    console.log('   - ID:', user.user_id);
    console.log('   - Name:', user.first_name, user.last_name);
    console.log('   - Role:', user.role);
    console.log('   - Platform Admin:', user.is_platform_admin);
    console.log('   - Company ID:', user.company_id || 'NULL (platform level)');
    console.log('   - Active:', user.is_active);
    console.log('');
    
    // 2. Verify password
    console.log('Testing password...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (isValid) {
      console.log('✅ Password VALID!\n');
      
      // 3. If platform admin, show what they can access
      if (user.is_platform_admin) {
        const companies = await pool.query('SELECT company_code, company_name FROM companies');
        console.log('Platform Admin can manage:');
        companies.rows.forEach(c => console.log('   - ' + c.company_code + ': ' + c.company_name));
      }
      
      return true;
    } else {
      console.log('❌ Password INVALID!');
      console.log('   Stored hash:', user.password_hash.substring(0, 20) + '...');
      
      // Generate correct hash for debugging
      const correctHash = await bcrypt.hash(password, 10);
      console.log('   New hash would be:', correctHash.substring(0, 20) + '...');
      
      return false;
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

// Test with platform admin credentials
testLogin('admin@propackhub.com', 'ProPackHub2025!');
