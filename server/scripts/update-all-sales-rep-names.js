const { authPool } = require('../database/config');

/**
 * Update all employees with their correct sales_rep_name
 * Mapping employee first_name to the canonical_name in sales_rep_master
 */
async function updateAllSalesRepNames() {
  try {
    // Mapping of employee names to their sales_rep_master canonical_name
    // These must EXACTLY match the canonical_name in sales_rep_master table
    const mappings = [
      { user_id: 7, sales_rep_name: 'Rahil Asif' },
      { user_id: 3, sales_rep_name: 'Christopher Dela Cruz' },
      // These are already set or are combined sales reps:
      // user_id 8 (Narek) - already set as 'NAREK KOROUKIAN', let's fix to match exact case
      { user_id: 8, sales_rep_name: 'Narek Koroukian' },
    ];
    
    console.log('=== Updating Sales Rep Names ===\n');
    
    for (const mapping of mappings) {
      const result = await authPool.query(
        `UPDATE employees 
         SET sales_rep_name = $1 
         WHERE user_id = $2
         RETURNING id, user_id, first_name, last_name, sales_rep_name`,
        [mapping.sales_rep_name, mapping.user_id]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`✅ Updated user_id ${mapping.user_id} (${row.first_name} ${row.last_name || ''}) -> sales_rep_name: '${mapping.sales_rep_name}'`);
      } else {
        console.log(`⚠️  No employee found with user_id ${mapping.user_id}`);
      }
    }
    
    // Show final state
    console.log('\n=== Final Employee State ===');
    const allResult = await authPool.query(`
      SELECT e.id, e.user_id, e.first_name, e.last_name, e.sales_rep_name, u.email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.id
    `);
    console.table(allResult.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateAllSalesRepNames();
