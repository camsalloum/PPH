const { Pool } = require('pg');
const pool = new Pool({ 
  host: 'localhost', 
  port: 5432, 
  database: 'fp_database', 
  user: 'postgres', 
  password: '***REDACTED***' 
});

async function removeCrossCountryRejections() {
  // IDs of cross-country rejections to remove
  const crossCountryIds = [652, 650, 647, 646, 643, 640, 637, 634, 627, 623, 619, 539, 533];
  
  console.log('Removing', crossCountryIds.length, 'cross-country rejections...');
  console.log('IDs:', crossCountryIds.join(', '));
  
  const result = await pool.query(
    `DELETE FROM fp_merge_rule_suggestions WHERE id = ANY($1::int[]) RETURNING id, suggested_merge_name`,
    [crossCountryIds]
  );
  
  console.log('\nDeleted', result.rowCount, 'records:');
  for (const row of result.rows) {
    console.log('  ID', row.id, '-', row.suggested_merge_name);
  }
  
  // Check remaining rejections
  const remaining = await pool.query(
    `SELECT COUNT(*) FROM fp_merge_rule_suggestions WHERE admin_action = 'REJECTED'`
  );
  console.log('\nRemaining rejections:', remaining.rows[0].count);
  
  await pool.end();
}

removeCrossCountryRejections().catch(e => { console.error(e); process.exit(1); });
