/**
 * Check what admin_action values exist and behavior
 */
require('dotenv').config();
const { pool } = require('../database/config');

async function checkAdminActions() {
  const result = await pool.query(`
    SELECT admin_action, COUNT(*) as count
    FROM fp_merge_rule_suggestions
    GROUP BY admin_action
    ORDER BY admin_action NULLS FIRST
  `);
  
  console.log('\n=== ADMIN_ACTION VALUES IN DATABASE ===\n');
  result.rows.forEach(r => {
    console.log(`  ${r.admin_action || 'NULL (pending)'}: ${r.count} suggestions`);
  });
  
  console.log('\n=== WHAT HAPPENS ON NEW SCAN ===');
  console.log('  ❌ DELETED: NULL, PENDING (old pending suggestions)');
  console.log('  ✅ PRESERVED: APPROVED, REJECTED, MODIFIED, EDITED');
  
  console.log('\n=== WHERE DATA IS SAVED ===');
  console.log('  • Approved → fp_division_customer_merge_rules (active rules)');
  console.log('  • Rejected → fp_merge_rule_rejections (feedback for AI)');
  console.log('  • Pending suggestions are regenerated fresh each scan');
  
  process.exit(0);
}

checkAdminActions().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
