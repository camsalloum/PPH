const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function compareTables() {
  const client = await pool.connect();
  try {
    console.log('═'.repeat(90));
    console.log('COMPARING material_percentages vs product_group_unified');
    console.log('═'.repeat(90));
    
    const mp = await client.query(`
      SELECT product_group, material, process 
      FROM fp_material_percentages 
      ORDER BY product_group
    `);
    
    const pu = await client.query(`
      SELECT display_name, material, process 
      FROM fp_product_group_unified 
      WHERE division = 'FP' 
      ORDER BY display_name
    `);
    
    console.log('\n📊 IN material_percentages (14 records):');
    console.log('─'.repeat(90));
    mp.rows.forEach(r => {
      console.log(`  ${r.product_group.padEnd(30)} | Mat: ${(r.material || 'NULL').padEnd(10)} | Proc: ${r.process || 'NULL'}`);
    });
    
    console.log('\n📊 IN product_group_unified (FP division):');
    console.log('─'.repeat(90));
    pu.rows.forEach(r => {
      console.log(`  ${r.display_name.padEnd(30)} | Mat: ${(r.material || 'NULL').padEnd(10)} | Proc: ${r.process || 'NULL'}`);
    });
    
    console.log('\n⚠️  MISMATCHES:');
    console.log('─'.repeat(90));
    let mismatchCount = 0;
    mp.rows.forEach(mp_row => {
      const pu_row = pu.rows.find(p => p.display_name.toUpperCase() === mp_row.product_group.toUpperCase());
      if (pu_row && (pu_row.material !== mp_row.material || pu_row.process !== mp_row.process)) {
        mismatchCount++;
        console.log(`  ❌ ${mp_row.product_group}`);
        console.log(`     material_percentages: ${mp_row.material || 'NULL'} / ${mp_row.process || 'NULL'}`);
        console.log(`     product_group_unified: ${pu_row.material || 'NULL'} / ${pu_row.process || 'NULL'}`);
        console.log('');
      }
    });
    
    if (mismatchCount === 0) {
      console.log('  ✅ No mismatches found!');
    }
    
    console.log('\n' + '═'.repeat(90));
    console.log(`Total mismatches: ${mismatchCount}`);
    console.log('═'.repeat(90));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

compareTables();
