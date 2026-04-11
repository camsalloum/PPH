const { Pool } = require('pg');

const auth = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});

async function createCRMView() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        CREATING CRM_SALES_REPS VIEW');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Drop existing view if exists
    await auth.query('DROP VIEW IF EXISTS crm_sales_reps');
    console.log('✓ Dropped existing view (if any)');

    // Create the view
    await auth.query(`
      CREATE VIEW crm_sales_reps AS
      SELECT 
        e.id as employee_id,
        e.full_name,
        e.user_id,
        u.email,
        d.name as designation,
        d.department,
        e.group_members,
        CASE WHEN e.group_members IS NOT NULL THEN 'GROUP' ELSE 'INDIVIDUAL' END as type
      FROM employees e
      JOIN users u ON e.user_id = u.id
      JOIN designations d ON e.designation_id = d.id
      WHERE e.status = 'Active' 
        AND e.user_id IS NOT NULL 
        AND LOWER(d.department) = 'sales'
    `);
    console.log('✓ VIEW crm_sales_reps created!\n');

    // Test the view
    console.log('Testing VIEW - SELECT * FROM crm_sales_reps:\n');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const result = await auth.query('SELECT * FROM crm_sales_reps ORDER BY employee_id');
    
    console.log(`Found ${result.rows.length} CRM sales reps:\n`);
    
    result.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.full_name} [${row.type}]`);
      console.log(`     Email: ${row.email}`);
      console.log(`     Designation: ${row.designation} (${row.department})`);
      if (row.group_members) {
        console.log(`     Members: ${row.group_members.join(', ')}`);
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    VIEW CREATED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Usage: SELECT * FROM crm_sales_reps');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await auth.end();
  }
}

createCRMView();
