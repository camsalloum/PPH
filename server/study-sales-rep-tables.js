const { pool } = require('./database/config');

async function studySalesRepTables() {
  try {
    // 1. List all sales rep related tables
    console.log('\n=== SALES REP RELATED TABLES ===\n');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%sales_rep%' 
      ORDER BY table_name
    `);
    tables.rows.forEach(r => console.log('  -', r.table_name));

    // 2. Check sales_rep_groups structure
    console.log('\n=== sales_rep_groups STRUCTURE ===\n');
    const groupsStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sales_rep_groups'
      ORDER BY ordinal_position
    `);
    groupsStructure.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (${r.is_nullable})`));

    // 3. Check sales_rep_group_members structure
    console.log('\n=== sales_rep_group_members STRUCTURE ===\n');
    const membersStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sales_rep_group_members'
      ORDER BY ordinal_position
    `);
    membersStructure.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (${r.is_nullable})`));

    // 4. Check sales_rep_master structure
    console.log('\n=== sales_rep_master STRUCTURE ===\n');
    const masterStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sales_rep_master'
      ORDER BY ordinal_position
    `);
    masterStructure.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (${r.is_nullable})`));

    // 5. Show current data in sales_rep_groups
    console.log('\n=== sales_rep_groups DATA ===\n');
    const groupsData = await pool.query(`
      SELECT id, group_name, division, created_at
      FROM sales_rep_groups
      ORDER BY division, group_name
    `);
    console.table(groupsData.rows);

    // 6. Show current data in sales_rep_group_members
    console.log('\n=== sales_rep_group_members DATA ===\n');
    const membersData = await pool.query(`
      SELECT gm.id, g.group_name, gm.member_name, gm.sales_rep_id
      FROM sales_rep_group_members gm
      JOIN sales_rep_groups g ON gm.group_id = g.id
      ORDER BY g.group_name, gm.member_name
    `);
    console.table(membersData.rows);

    // 7. Show sales_rep_master data
    console.log('\n=== sales_rep_master DATA (first 20) ===\n');
    const masterData = await pool.query(`
      SELECT id, canonical_name, division, is_active
      FROM sales_rep_master
      ORDER BY canonical_name
      LIMIT 20
    `);
    console.table(masterData.rows);

    // 8. Check fp_sales_rep_unified if exists
    console.log('\n=== fp_sales_rep_unified STRUCTURE (if exists) ===\n');
    const unifiedStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fp_sales_rep_unified'
      ORDER BY ordinal_position
    `);
    if (unifiedStructure.rows.length > 0) {
      unifiedStructure.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (${r.is_nullable})`));
    } else {
      console.log('  Table does not exist');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

studySalesRepTables();
