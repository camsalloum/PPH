const { pool, authPool } = require('../database/config');

async function fixEmails() {
  try {
    // 1. Update Christopher's email in users table
    console.log('=== Updating Christopher email ===');
    const { rows: chris } = await authPool.query(
      `SELECT id, email, name FROM users WHERE LOWER(name) LIKE '%christopher%' OR LOWER(email) LIKE '%christopher%'`
    );
    console.log('Found Christopher:', chris);
    
    if (chris.length > 0) {
      await authPool.query('UPDATE users SET email = $1 WHERE id = $2', ['christopher.delacruz@interplast-uae.com', chris[0].id]);
      console.log('✅ Updated Christopher user email to christopher.delacruz@interplast-uae.com');
    }

    // 2. Find all employees with user_id and check if emails match
    console.log('\n=== Checking Employee-User Email Sync ===');
    const { rows: employees } = await authPool.query(`
      SELECT e.id, e.full_name, e.company_email, e.user_id, u.email as user_email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id IS NOT NULL
    `);
    
    console.log('Employees with linked users:');
    for (const emp of employees) {
      const match = emp.company_email === emp.user_email ? '✅' : '❌ MISMATCH';
      console.log(`  ${emp.full_name}: company_email='${emp.company_email}' | user_email='${emp.user_email}' ${match}`);
    }

    // 3. Update mismatched emails
    const mismatched = employees.filter(e => e.company_email !== e.user_email);
    if (mismatched.length > 0) {
      console.log(`\n=== Syncing ${mismatched.length} mismatched emails ===`);
      for (const emp of mismatched) {
        await authPool.query('UPDATE employees SET company_email = $1 WHERE id = $2', [emp.user_email, emp.id]);
        console.log(`✅ Updated ${emp.full_name}: '${emp.company_email}' → '${emp.user_email}'`);
      }
    } else {
      console.log('\n✅ All employee emails already in sync!');
    }

    // 4. Verify final state
    console.log('\n=== Final State ===');
    const { rows: final } = await authPool.query(`
      SELECT e.full_name, e.company_email, u.email as user_email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.full_name
    `);
    for (const emp of final) {
      console.log(`  ${emp.full_name}: ${emp.company_email}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    await authPool.end();
  }
}

fixEmails();
