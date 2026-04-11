const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function syncMaterialProcess() {
  const client = await pool.connect();
  try {
    console.log('═'.repeat(80));
    console.log('SYNCING material/process FROM material_percentages TO product_group_unified');
    console.log('═'.repeat(80));
    
    await client.query('BEGIN');
    
    // Sync ALL products from material_percentages to unified
    const result = await client.query(`
      UPDATE fp_product_group_unified pu
      SET 
        material = mp.material,
        process = mp.process,
        pg_combined = mp.material || ' ' || mp.process,
        updated_at = NOW()
      FROM fp_material_percentages mp
      WHERE UPPER(TRIM(pu.display_name)) = UPPER(TRIM(mp.product_group))
        AND pu.division = 'FP'
        AND (
          pu.material IS DISTINCT FROM mp.material OR
          pu.process IS DISTINCT FROM mp.process
        )
      RETURNING pu.display_name, pu.material, pu.process
    `);
    
    console.log(`\n✅ Updated ${result.rows.length} records:\n`);
    result.rows.forEach(r => {
      console.log(`  ${r.display_name.padEnd(30)} | Mat: ${(r.material || 'NULL').padEnd(10)} | Proc: ${r.process || 'NULL'}`);
    });
    
    await client.query('COMMIT');
    
    // Verify sync
    console.log('\n' + '─'.repeat(80));
    console.log('VERIFICATION:\n');
    
    const verify = await client.query(`
      SELECT 
        mp.product_group,
        mp.material as mp_material,
        mp.process as mp_process,
        pu.material as pu_material,
        pu.process as pu_process
      FROM fp_material_percentages mp
      LEFT JOIN fp_product_group_unified pu 
        ON UPPER(TRIM(mp.product_group)) = UPPER(TRIM(pu.display_name))
        AND pu.division = 'FP'
      WHERE 
        pu.material IS DISTINCT FROM mp.material OR
        pu.process IS DISTINCT FROM mp.process
    `);
    
    if (verify.rows.length === 0) {
      console.log('✅ All records are now in sync!');
    } else {
      console.log('❌ Still have mismatches:');
      verify.rows.forEach(r => {
        console.log(`  ${r.product_group}: MP(${r.mp_material}/${r.mp_process}) vs PU(${r.pu_material || 'NULL'}/${r.pu_process || 'NULL'})`);
      });
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('✅ Sync complete!');
    console.log('═'.repeat(80));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

syncMaterialProcess();
