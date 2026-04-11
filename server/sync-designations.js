const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'ip_auth_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

(async () => {
  try {
    console.log('=== SYNCING EMPLOYEE DESIGNATIONS FROM USER DESIGNATIONS ===\n');

    // Get all users with their designations
    const users = await pool.query(`
      SELECT u.id as user_id, u.name, u.designation, u.designation_id as user_designation_id,
             e.id as employee_id, e.full_name, e.designation_id as emp_designation_id,
             d.name as current_emp_designation
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN designations d ON e.designation_id = d.id
      WHERE u.designation IS NOT NULL
    `);

    console.log('Users to sync:');
    for (const u of users.rows) {
      // Find designation ID from user's designation name
      const desig = await pool.query(
        'SELECT id, level FROM designations WHERE name = $1',
        [u.designation]
      );
      
      if (desig.rows.length > 0 && u.employee_id) {
        const designationId = desig.rows[0].id;
        const level = desig.rows[0].level;
        
        // Update employee's designation
        await pool.query(
          'UPDATE employees SET designation_id = $1 WHERE id = $2',
          [designationId, u.employee_id]
        );
        
        console.log(`✓ ${u.full_name}: ${u.current_emp_designation || 'none'} → ${u.designation} (L${level})`);
      } else if (!u.employee_id) {
        console.log(`⚠ ${u.name}: No linked employee record`);
      } else {
        console.log(`✗ ${u.name}: Designation "${u.designation}" not found in designations table`);
      }
    }

    // Also need to find Camille's correct designation
    // From user table, Camille has "General Manager", not CEO
    // Let me check what Camille's user record says
    const camille = await pool.query(`
      SELECT u.*, e.id as emp_id, e.full_name 
      FROM users u 
      LEFT JOIN employees e ON e.full_name ILIKE '%Camille%'
      WHERE u.name ILIKE '%Camille%'
    `);
    
    if (camille.rows.length > 0) {
      const c = camille.rows[0];
      console.log(`\nCamille user designation: ${c.designation}`);
      
      // Get General Manager designation id
      const gmDesig = await pool.query(`SELECT id, level FROM designations WHERE name = $1`, [c.designation || 'General Manager']);
      if (gmDesig.rows.length > 0 && c.emp_id) {
        await pool.query('UPDATE employees SET designation_id = $1 WHERE id = $2', [gmDesig.rows[0].id, c.emp_id]);
        console.log(`✓ Synced Camille to ${c.designation || 'General Manager'} (L${gmDesig.rows[0].level})`);
      }
    }

    console.log('\n=== FINAL STATE ===\n');
    const final = await pool.query(`
      SELECT e.full_name, d.name as designation, d.level, u.name as user_name, u.designation as user_designation
      FROM employees e
      LEFT JOIN designations d ON e.designation_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.status = 'Active'
      ORDER BY d.level DESC NULLS LAST, e.full_name
    `);
    
    final.rows.forEach(r => {
      const match = r.designation === r.user_designation ? '✓' : '✗';
      console.log(`L${r.level || '?'} | ${r.full_name.padEnd(25)} | Emp: ${(r.designation || 'none').padEnd(22)} | User: ${r.user_designation || 'n/a'} ${r.user_designation ? match : ''}`);
    });

    pool.end();
  } catch (err) {
    console.error('Error:', err);
    pool.end();
  }
})();
