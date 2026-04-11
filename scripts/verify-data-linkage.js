require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');

(async () => {
  try {
    // 1. TDS total and match to fp_actualrmdata
    const r1a = await pool.query("SELECT COUNT(*) as cnt FROM mes_material_tds WHERE category = 'Resins'");
    const r1b = await pool.query(`
      SELECT COUNT(*) as cnt 
      FROM mes_material_tds t 
      JOIN fp_actualrmdata r ON r.mainitem = t.oracle_item_code 
      WHERE t.category = 'Resins'
    `);
    console.log('TDS total:', r1a.rows[0].cnt, '| TDS matched to RM:', r1b.rows[0].cnt);

    // 2. TDS cat_desc values
    const r2 = await pool.query("SELECT DISTINCT cat_desc FROM mes_material_tds WHERE category = 'Resins' ORDER BY 1");
    console.log('TDS cat_desc:', r2.rows.map(r => r.cat_desc));

    // 3. RM catlinedesc for resin-like categories
    const r3 = await pool.query(`
      SELECT DISTINCT catlinedesc 
      FROM fp_actualrmdata 
      WHERE catlinedesc IN (
        SELECT DISTINCT oracle_cat_desc FROM mes_item_master WHERE category = 'Resins' AND is_active = true
      )
      ORDER BY 1
    `);
    console.log('RM resin catlinedesc:', r3.rows.map(r => r.catlinedesc));

    // 4. Item Master resin rows
    const r4 = await pool.query("SELECT oracle_cat_desc, COUNT(*) as cnt FROM mes_item_master WHERE category = 'Resins' AND is_active = true GROUP BY oracle_cat_desc ORDER BY 1");
    console.log('ItemMaster resin oracle_cat_desc:', JSON.stringify(r4.rows));

    // 5. TDS strict param fill rate
    const r5 = await pool.query(`
      SELECT cat_desc,
        COUNT(*) as total,
        COUNT(mfr_190_2_16) as has_mfr,
        COUNT(density) as has_density,
        COUNT(crystalline_melting_point) as has_melting,
        COUNT(vicat_softening_point) as has_vicat,
        COUNT(bulk_density) as has_bulk_dens,
        COUNT(flexural_modulus) as has_flexural
      FROM mes_material_tds WHERE category = 'Resins'
      GROUP BY cat_desc ORDER BY 1
    `);
    console.log('TDS param fill:', JSON.stringify(r5.rows, null, 2));

    // 6. Sample RM resin rows
    const r6 = await pool.query(`
      SELECT mainitem, catlinedesc, maincost, mainitemstock, pendingorderqty, purchaseprice, weights 
      FROM fp_actualrmdata 
      WHERE catlinedesc IN (SELECT DISTINCT oracle_cat_desc FROM mes_item_master WHERE category = 'Resins' AND is_active = true)
      LIMIT 8
    `);
    console.log('RM resin sample:', JSON.stringify(r6.rows, null, 2));

    // 7. Check TDS oracle_item_code → mes_item_master.item_code linkage
    const r7 = await pool.query(`
      SELECT t.oracle_item_code, t.cat_desc, i.item_code, i.oracle_cat_desc
      FROM mes_material_tds t
      LEFT JOIN mes_item_master i ON i.item_code = t.oracle_item_code AND i.is_active = true
      WHERE t.category = 'Resins'
      LIMIT 10
    `);
    console.log('TDS→ItemMaster link:', JSON.stringify(r7.rows, null, 2));

    // 8. What are the RM Film Scrap rows cat_desc?
    const r8 = await pool.query("SELECT item_code, oracle_cat_desc FROM mes_item_master WHERE category = 'Resins' AND is_active = true ORDER BY 1");
    console.log('All resin items:', JSON.stringify(r8.rows));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
