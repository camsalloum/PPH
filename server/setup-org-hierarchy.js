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
    // CEO = 1, GM = 2, DM = 3, ASM = 20, SR = 8
    
    console.log('Setting up org hierarchy...\n');
    
    // Camille = CEO (ID 1), no manager
    await pool.query(`UPDATE employees SET designation_id = 1, reports_to = NULL WHERE id = 1`);
    console.log('✓ Camille Salloum -> CEO (top of hierarchy)');
    
    // Others = Area Sales Manager, report to Camille
    await pool.query(`UPDATE employees SET designation_id = 20, reports_to = 1 WHERE id IN (18, 20, 21, 22, 25, 29)`);
    console.log('✓ Narek, Riad, Sofiane, Sojy, Christopher, Rahil -> Area Sales Manager, report to Camille');
    
    console.log('\n=== NEW HIERARCHY ===\n');
    
    const result = await pool.query(`
      SELECT e.id, e.full_name, d.name as designation, d.level, e.reports_to,
             m.full_name as manager_name
      FROM employees e 
      LEFT JOIN designations d ON e.designation_id = d.id 
      LEFT JOIN employees m ON e.reports_to = m.id
      WHERE e.status = 'Active' 
      ORDER BY d.level DESC NULLS LAST, e.full_name
    `);
    
    result.rows.forEach(e => {
      const manager = e.manager_name ? `reports to ${e.manager_name}` : '(TOP)';
      console.log(`L${e.level || '?'} | ${e.full_name} | ${e.designation || 'No title'} | ${manager}`);
    });
    
    console.log('\n✓ Org chart hierarchy is now set up! Refresh the page.');
    
    pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    pool.end();
  }
})();
