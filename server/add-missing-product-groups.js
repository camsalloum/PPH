const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function addMissingProducts() {
  const client = await pool.connect();
  try {
    console.log('═'.repeat(70));
    console.log('ADDING MISSING PRODUCT GROUPS TO fp_product_group_unified');
    console.log('═'.repeat(70));
    
    await client.query('BEGIN');
    
    // Add Labels
    await client.query(`
      INSERT INTO fp_product_group_unified (
        pg_code, display_name, normalized_name, material, process, pg_combined, division
      ) VALUES (
        'FP-PG-19', 'Labels', 'LABELS', NULL, NULL, NULL, 'FP'
      ) ON CONFLICT (pg_code) DO UPDATE SET 
        normalized_name = 'LABELS', 
        display_name = 'Labels'
    `);
    console.log('✅ Added/Updated: Labels');
    
    // Add Others
    await client.query(`
      INSERT INTO fp_product_group_unified (
        pg_code, display_name, normalized_name, material, process, pg_combined, division
      ) VALUES (
        'FP-PG-20', 'Others', 'OTHERS', NULL, NULL, NULL, 'FP'
      ) ON CONFLICT (pg_code) DO UPDATE SET 
        normalized_name = 'OTHERS', 
        display_name = 'Others'
    `);
    console.log('✅ Added/Updated: Others');
    
    // Fix Services Charges (hyphen to space)
    await client.query(`
      UPDATE fp_product_group_unified 
      SET normalized_name = 'SERVICES CHARGES'
      WHERE normalized_name = 'SERVICES-CHARGES'
    `);
    console.log('✅ Updated: Services-Charges → Services Charges');
    
    await client.query('COMMIT');
    console.log('\n✅ All fixes applied!');
    
    // Verification
    const check = await client.query(`
      SELECT display_name, normalized_name, material, process 
      FROM fp_product_group_unified 
      WHERE normalized_name IN ('LABELS', 'OTHERS', 'SERVICES CHARGES')
      ORDER BY display_name
    `);
    
    console.log('\n' + '═'.repeat(70));
    console.log('VERIFICATION:');
    console.log('─'.repeat(70));
    check.rows.forEach(r => {
      console.log(`${r.display_name.padEnd(20)} | Norm: ${r.normalized_name.padEnd(20)} | Mat: ${(r.material || 'NULL').padEnd(10)} | Proc: ${r.process || 'NULL'}`);
    });
    console.log('═'.repeat(70));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingProducts();
