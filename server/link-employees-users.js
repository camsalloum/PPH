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
    console.log('=== LINKING EMPLOYEES TO USERS ===\n');

    // Get all users and employees
    const users = await pool.query(`SELECT id, name, designation FROM users`);
    const employees = await pool.query(`SELECT id, full_name, user_id FROM employees WHERE status = 'Active'`);
    
    console.log('Users:', users.rows.map(u => u.name));
    console.log('Employees:', employees.rows.map(e => e.full_name));
    console.log('');

    // Match by name similarity
    for (const user of users.rows) {
      const userName = user.name.toLowerCase().trim();
      
      // Find matching employee
      const matchingEmp = employees.rows.find(emp => {
        const empName = emp.full_name.toLowerCase().trim();
        // Check if names match (handle variations like "Narek Koroukian" vs "Narek Koroukian ")
        return empName.includes(userName) || userName.includes(empName) ||
               empName.replace(/\s+/g, '') === userName.replace(/\s+/g, '');
      });
      
      if (matchingEmp) {
        // Link employee to user
        await pool.query('UPDATE employees SET user_id = $1 WHERE id = $2', [user.id, matchingEmp.id]);
        
        // Get designation id for this user's designation
        const desig = await pool.query('SELECT id, level FROM designations WHERE name = $1', [user.designation]);
        if (desig.rows.length > 0) {
          await pool.query('UPDATE employees SET designation_id = $1 WHERE id = $2', [desig.rows[0].id, matchingEmp.id]);
          console.log(`✓ Linked ${user.name} → Employee ${matchingEmp.full_name} → ${user.designation} (L${desig.rows[0].level})`);
        } else {
          console.log(`✓ Linked ${user.name} → Employee ${matchingEmp.full_name} (no designation match)`);
        }
      } else {
        console.log(`✗ No employee match for user: ${user.name}`);
      }
    }

    // Set up hierarchy - everyone reports to Camille (the GM)
    const camille = await pool.query(`SELECT id FROM employees WHERE full_name ILIKE '%Camille%'`);
    if (camille.rows.length > 0) {
      const camilleId = camille.rows[0].id;
      await pool.query(`UPDATE employees SET reports_to = $1 WHERE id != $1 AND status = 'Active'`, [camilleId]);
      console.log(`\n✓ Set all employees to report to Camille (id: ${camilleId})`);
    }

    console.log('\n=== FINAL STATE ===\n');
    const final = await pool.query(`
      SELECT e.full_name, d.name as designation, d.level, e.user_id,
             u.name as user_name, u.designation as user_designation,
             m.full_name as reports_to_name
      FROM employees e
      LEFT JOIN designations d ON e.designation_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employees m ON e.reports_to = m.id
      WHERE e.status = 'Active'
      ORDER BY d.level DESC NULLS LAST, e.full_name
    `);
    
    console.log('Employee                     | Designation              | Level | Linked User      | Reports To');
    console.log('-'.repeat(100));
    final.rows.forEach(r => {
      console.log(
        `${(r.full_name || '').padEnd(28)} | ${(r.designation || 'none').padEnd(24)} | L${(r.level || '?').toString().padEnd(4)} | ${(r.user_name || 'NOT LINKED').padEnd(16)} | ${r.reports_to_name || 'TOP'}`
      );
    });

    pool.end();
  } catch (err) {
    console.error('Error:', err);
    pool.end();
  }
})();
