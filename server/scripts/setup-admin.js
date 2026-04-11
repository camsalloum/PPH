/**
 * Setup Admin User (Interactive)
 * Creates or updates admin user with configurable credentials
 * 
 * Usage:
 *   node setup-admin.js                           # Interactive mode
 *   node setup-admin.js admin@company.com Admin   # Command line args
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.AUTH_DB_NAME || 'ip_auth_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function setupAdmin(email, name, password) {
  try {
    console.log('\n🔧 Setting up admin user...');
    
    // Generate password hash
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('✅ Password hash generated');
    
    // Insert or update admin user
    const result = await pool.query(`
      INSERT INTO users (email, password_hash, name, role, created_at, updated_at) 
      VALUES ($1, $2, $3, 'admin', NOW(), NOW())
      ON CONFLICT (email) 
      DO UPDATE SET 
        password_hash = $2,
        name = $3,
        role = 'admin',
        updated_at = NOW()
      RETURNING id, email, name, role
    `, [email.toLowerCase(), passwordHash, name]);
    
    const adminId = result.rows[0].id;

    let employeeId = null;
    const linkedEmployee = await pool.query(
      `SELECT employee_id FROM users WHERE id = $1`,
      [adminId]
    );
    employeeId = linkedEmployee.rows[0]?.employee_id || null;

    if (!employeeId) {
      const existingEmployee = await pool.query(
        `SELECT id FROM employees WHERE user_id = $1 LIMIT 1`,
        [adminId]
      );
      employeeId = existingEmployee.rows[0]?.id || null;
    }

    if (!employeeId) {
      const codeResult = await pool.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INTEGER)), 0) + 1 AS next_code
        FROM employees WHERE employee_code LIKE 'EMP%'
      `);
      const nextCode = codeResult.rows[0]?.next_code || 1;
      const employeeCode = `EMP${String(nextCode).padStart(4, '0')}`;

      const nameParts = (name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || name || 'Admin';
      const lastName = nameParts.slice(1).join(' ') || null;

      const insertedEmployee = await pool.query(
        `INSERT INTO employees (
          user_id, employee_code, first_name, last_name, personal_email,
          department, date_of_joining, status
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'Active')
        RETURNING id`,
        [adminId, employeeCode, firstName, lastName, email.toLowerCase(), 'Management']
      );
      employeeId = insertedEmployee.rows[0].id;
    }

    await pool.query(
      `UPDATE users SET employee_id = $1 WHERE id = $2`,
      [employeeId, adminId]
    );
    
    // Get all divisions and assign to admin
    const divisionsResult = await pool.query(`
      SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'
    `);
    
    if (divisionsResult.rows.length > 0) {
      const divisions = divisionsResult.rows[0].setting_value;
      if (Array.isArray(divisions)) {
        for (const div of divisions) {
          const code = div.code || div;
          await pool.query(`
            INSERT INTO user_divisions (user_id, division_code)
            VALUES ($1, $2)
            ON CONFLICT (user_id, division_code) DO NOTHING
          `, [adminId, code]);

          await pool.query(`
            INSERT INTO employee_divisions (employee_id, division_code, is_primary)
            VALUES ($1, $2, $3)
            ON CONFLICT (employee_id, division_code) DO NOTHING
          `, [employeeId, code, code === (divisions[0]?.code || divisions[0])]);
        }
        console.log(`✅ Admin assigned to ${divisions.length} division(s)`);
      }
    }
    
    // Update primary_admin in company_settings
    await pool.query(`
      INSERT INTO company_settings (setting_key, setting_value)
      VALUES ('primary_admin', $1::jsonb)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify({
      email: email.toLowerCase(),
      name: name,
      created_at: new Date().toISOString()
    })]);
    
    console.log('\n✅ Admin user setup complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', result.rows[0].email);
    console.log('👤 Name:', result.rows[0].name);
    console.log('🔑 Password:', password);
    console.log('🎭 Role:', result.rows[0].role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error setting up admin user:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  let email, name, password;
  
  if (args.length >= 2) {
    // Command line mode
    email = args[0];
    name = args[1];
    password = args[2] || 'Admin@123';
  } else {
    // Interactive mode
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║      ProPackHub Admin Setup            ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    email = await question(rl, '📧 Admin Email: ');
    name = await question(rl, '👤 Admin Name: ');
    password = await question(rl, '🔑 Password (default: Admin@123): ');
    
    if (!password) password = 'Admin@123';
    
    rl.close();
  }
  
  // Validate
  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address');
    process.exit(1);
  }
  
  if (!name) {
    console.error('❌ Name is required');
    process.exit(1);
  }
  
  try {
    await setupAdmin(email, name, password);
    console.log('\n✨ You can now login at http://localhost:3000/login');
    process.exit(0);
  } catch (error) {
    console.error('Failed to setup admin:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
