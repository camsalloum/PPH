require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function checkPending() {
  const pool = new Pool({
    database: 'fp_database',
    user: 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM fp_merge_rule_suggestions 
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
    `);
    console.log('Current PENDING suggestions in DB:', result.rows[0].count);
    
    // Check for any duplicates that might exist
    const duplicates = await pool.query(`
      SELECT customer_group, COUNT(*) as cnt
      FROM fp_merge_rule_suggestions
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
      GROUP BY customer_group
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length > 0) {
      console.log('\nDuplicate suggestions found:', duplicates.rows.length);
      duplicates.rows.forEach(d => {
        console.log('  Count:', d.cnt, '- Customers:', JSON.stringify(d.customer_group).substring(0, 60) + '...');
      });
    } else {
      console.log('\nNo duplicates found - cleanup already happened');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPending();
