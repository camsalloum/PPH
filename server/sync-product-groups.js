/**
 * Sync fp_raw_product_groups from fp_actualcommon
 * Run this after data imports to ensure new product groups are added
 */
const { pool } = require('./database/config');

async function syncProductGroups() {
  try {
    console.log('=== Syncing fp_raw_product_groups from fp_actualcommon ===\n');
    
    // Get distinct product groups from actual data
    const pgs = await pool.query(`
      SELECT DISTINCT product_group 
      FROM fp_actualcommon 
      WHERE product_group IS NOT NULL 
      AND TRIM(product_group) != ''
      ORDER BY product_group
    `);
    console.log('Found', pgs.rows.length, 'distinct product groups in actual data');
    
    // Insert new ones (existing ones are preserved)
    let newCount = 0;
    for (const row of pgs.rows) {
      const result = await pool.query(`
        INSERT INTO fp_raw_product_groups (raw_product_group, pg_combine, is_unmapped)
        VALUES ($1, $1, FALSE)
        ON CONFLICT (raw_product_group) DO NOTHING
        RETURNING id
      `, [row.product_group]);
      
      if (result.rows.length > 0) {
        console.log('  + NEW:', row.product_group);
        newCount++;
      }
    }
    
    if (newCount === 0) {
      console.log('  No new product groups found');
    } else {
      console.log(`\n✅ Added ${newCount} new product groups`);
    }
    
    // Show current state
    const current = await pool.query(`
      SELECT raw_product_group, pg_combine, is_unmapped 
      FROM fp_raw_product_groups 
      ORDER BY raw_product_group
    `);
    console.log(`\nCurrent fp_raw_product_groups (${current.rows.length} total):`);
    current.rows.forEach(x => {
      const status = x.is_unmapped ? '❌' : '✅';
      console.log(`  ${status} ${x.raw_product_group} -> ${x.pg_combine}`);
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit();
}

syncProductGroups();

