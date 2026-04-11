const {pool} = require('../server/database/config');
(async () => {
  // Films use category='Films'
  const r = await pool.query(`
    SELECT catlinedesc, COUNT(*) as cnt,
           array_agg(DISTINCT material ORDER BY material) as materials
    FROM fp_actualrmdata 
    WHERE category = 'Films' 
    GROUP BY catlinedesc 
    ORDER BY cnt DESC
  `);
  console.log('=== Film catlinedesc distribution ===');
  for (const row of r.rows) {
    console.log(`${row.catlinedesc} | ${row.cnt} items | materials: ${(row.materials||[]).slice(0,4).join(', ')}`);
  }
  
  // Also check other non-resin categories
  const cats = await pool.query(`
    SELECT category, COUNT(*) as cnt FROM fp_actualrmdata GROUP BY category ORDER BY cnt DESC
  `);
  console.log('\n=== All categories ===');
  console.table(cats.rows);
  
  // Check existing specs
  const s = await pool.query('SELECT COUNT(*) as cnt FROM mes_non_resin_material_specs');
  console.log('\nExisting non-resin specs:', s.rows[0].cnt);
  
  // Check existing spec rows detail
  const e = await pool.query(`SELECT material_class, material_key, status, parameter_profile
    FROM mes_non_resin_material_specs 
    LIMIT 15`);
  console.log('\n=== Existing spec rows ===');
  console.table(e.rows);
  
  // Sample BOPP items
  const bopp = await pool.query(`
    SELECT mainitem, maindescription, catlinedesc, material, sizes, standards
    FROM fp_actualrmdata 
    WHERE category = 'Films' AND (catlinedesc ILIKE '%BOPP%' OR maindescription ILIKE '%BOPP%')
    ORDER BY mainitem
    LIMIT 10
  `);
  console.log('\n=== Sample BOPP items ===');
  console.table(bopp.rows);
  
  // Table schema
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'mes_non_resin_material_specs'
    ORDER BY ordinal_position
  `);
  console.log('\n=== mes_non_resin_material_specs schema ===');
  console.table(cols.rows);
  
  // How specs are currently keyed
  const specKeys = await pool.query(`
    SELECT material_class, material_key, parameter_profile, status,
           (SELECT count(*) FROM jsonb_object_keys(parameters_json)) as param_count
    FROM mes_non_resin_material_specs
    ORDER BY material_class, material_key
    LIMIT 20
  `);
  console.log('\n=== Spec keys + param_count ===');
  console.table(specKeys.rows);
  
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
