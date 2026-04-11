/**
 * Fix Platform Admin Password
 * Creates a proper bcrypt hash for the platform admin
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

async function fixPassword() {
  const email = 'admin@propackhub.com';
  const password = 'ProPackHub2025!';
  
  console.log('=== FIXING PLATFORM ADMIN PASSWORD ===\n');
  
  try {
    // Generate proper bcrypt hash
    const hash = await bcrypt.hash(password, 10);
    console.log('Generated hash:', hash);
    
    // Update user
    const result = await pool.query(
      'UPDATE platform_users SET password_hash = $1 WHERE email = $2 RETURNING user_id, email',
      [hash, email]
    );
    
    if (result.rows.length > 0) {
      console.log('\n✅ Password updated for:', result.rows[0].email);
      
      // Verify it works
      const user = await pool.query(
        'SELECT password_hash FROM platform_users WHERE email = $1',
        [email]
      );
      
      const isValid = await bcrypt.compare(password, user.rows[0].password_hash);
      console.log('✅ Password verification:', isValid ? 'SUCCESS' : 'FAILED');
    } else {
      console.log('❌ User not found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixPassword();
