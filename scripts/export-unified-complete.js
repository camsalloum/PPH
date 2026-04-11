/**
 * Export ALL unified tables to Excel - COMPLETE VERSION
 * Includes all new columns from migrations 300-308
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database',
  max: 5
});

async function exportAll() {
  const workbook = new ExcelJS.Workbook();
  
  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  EXPORTING COMPLETE UNIFIED DATA SYSTEM                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // 1. CUSTOMERS
    console.log('1. Exporting fp_customer_unified...');
    const customers = await pool.query(`
      SELECT * FROM fp_customer_unified ORDER BY display_name
    `);
    const custSheet = workbook.addWorksheet('Customers');
    if (customers.rows.length > 0) {
      custSheet.columns = Object.keys(customers.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(30, Math.max(15, key.length + 5))
      }));
      customers.rows.forEach(row => {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) processedRow[key] = value.toISOString();
          else if (Array.isArray(value)) processedRow[key] = value.join(', ');
          else processedRow[key] = value;
        }
        custSheet.addRow(processedRow);
      });
      custSheet.getRow(1).font = { bold: true };
      custSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }
    console.log(`   ✅ ${customers.rows.length} customers`);

    // 2. SALES REPS
    console.log('2. Exporting fp_sales_rep_unified...');
    const reps = await pool.query(`
      SELECT * FROM fp_sales_rep_unified ORDER BY group_name, display_name
    `);
    const repSheet = workbook.addWorksheet('Sales Reps');
    if (reps.rows.length > 0) {
      repSheet.columns = Object.keys(reps.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(30, Math.max(15, key.length + 5))
      }));
      reps.rows.forEach(row => {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) processedRow[key] = value.toISOString();
          else processedRow[key] = value;
        }
        repSheet.addRow(processedRow);
      });
      repSheet.getRow(1).font = { bold: true };
      repSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }
    console.log(`   ✅ ${reps.rows.length} sales reps`);

    // 3. PRODUCT GROUPS
    console.log('3. Exporting fp_product_group_unified...');
    const pgs = await pool.query(`
      SELECT * FROM fp_product_group_unified ORDER BY pg_combine_name, display_name
    `);
    const pgSheet = workbook.addWorksheet('Product Groups');
    if (pgs.rows.length > 0) {
      pgSheet.columns = Object.keys(pgs.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(30, Math.max(15, key.length + 5))
      }));
      pgs.rows.forEach(row => {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) processedRow[key] = value.toISOString();
          else if (Array.isArray(value)) processedRow[key] = value.join(', ');
          else if (typeof value === 'object' && value !== null) processedRow[key] = JSON.stringify(value);
          else processedRow[key] = value;
        }
        pgSheet.addRow(processedRow);
      });
      pgSheet.getRow(1).font = { bold: true };
      pgSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }
    console.log(`   ✅ ${pgs.rows.length} product groups`);

    // 4. RAW PG MAPPINGS
    console.log('4. Exporting fp_raw_product_groups (mapping table)...');
    const rawPgs = await pool.query(`
      SELECT * FROM fp_raw_product_groups ORDER BY pg_combine, raw_product_group
    `);
    const rawPgSheet = workbook.addWorksheet('Raw PG Mappings');
    if (rawPgs.rows.length > 0) {
      rawPgSheet.columns = Object.keys(rawPgs.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(30, Math.max(15, key.length + 5))
      }));
      rawPgs.rows.forEach(row => {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) processedRow[key] = value.toISOString();
          else processedRow[key] = value;
        }
        rawPgSheet.addRow(processedRow);
      });
      rawPgSheet.getRow(1).font = { bold: true };
      rawPgSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
    }
    console.log(`   ✅ ${rawPgs.rows.length} raw->combine mappings`);

    // 5. SALES REP GROUPS
    console.log('5. Exporting sales_rep_groups + members...');
    const groups = await pool.query(`
      SELECT g.id, g.group_name, g.division, g.is_active,
             ARRAY_AGG(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL) AS members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON g.id = m.group_id
      GROUP BY g.id, g.group_name, g.division, g.is_active
      ORDER BY g.group_name
    `);
    const groupSheet = workbook.addWorksheet('Sales Rep Groups');
    if (groups.rows.length > 0) {
      groupSheet.columns = [
        { header: 'id', key: 'id', width: 10 },
        { header: 'group_name', key: 'group_name', width: 30 },
        { header: 'division', key: 'division', width: 15 },
        { header: 'is_active', key: 'is_active', width: 15 },
        { header: 'members', key: 'members', width: 60 }
      ];
      groups.rows.forEach(row => {
        groupSheet.addRow({
          ...row,
          members: row.members ? row.members.join(', ') : ''
        });
      });
      groupSheet.getRow(1).font = { bold: true };
      groupSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
    }
    console.log(`   ✅ ${groups.rows.length} sales rep groups`);

    // 6. CUSTOMER MERGE RULES
    console.log('6. Exporting fp_division_customer_merge_rules...');
    const merges = await pool.query(`
      SELECT id, division, merged_customer_name, original_customers, 
             is_active, status, created_at, updated_at
      FROM fp_division_customer_merge_rules 
      WHERE is_active = true
      ORDER BY merged_customer_name
    `);
    const mergeSheet = workbook.addWorksheet('Customer Merge Rules');
    if (merges.rows.length > 0) {
      mergeSheet.columns = Object.keys(merges.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(40, Math.max(15, key.length + 5))
      }));
      merges.rows.forEach(row => {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) processedRow[key] = value.toISOString();
          else if (typeof value === 'object' && value !== null) processedRow[key] = JSON.stringify(value);
          else processedRow[key] = value;
        }
        mergeSheet.addRow(processedRow);
      });
      mergeSheet.getRow(1).font = { bold: true };
      mergeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    }
    console.log(`   ✅ ${merges.rows.length} active merge rules`);

    // 7. SAMPLE FROM UNIFIED VIEW
    console.log('7. Exporting sample from vw_unified_sales_complete (2024)...');
    const sample = await pool.query(`
      SELECT 
        customer_name, customer_code, sales_rep_group_name, 
        pg_combine, material_process, country, year, data_type,
        SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
        SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
        SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm
      FROM vw_unified_sales_complete
      WHERE year = 2024
      GROUP BY customer_name, customer_code, sales_rep_group_name, 
               pg_combine, material_process, country, year, data_type
      ORDER BY amount DESC
      LIMIT 1000
    `);
    const sampleSheet = workbook.addWorksheet('Unified View Sample');
    if (sample.rows.length > 0) {
      sampleSheet.columns = Object.keys(sample.rows[0]).map(key => ({
        header: key, key: key, width: Math.min(25, Math.max(12, key.length + 3))
      }));
      sample.rows.forEach(row => sampleSheet.addRow(row));
      sampleSheet.getRow(1).font = { bold: true };
      sampleSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } };
    }
    console.log(`   ✅ ${sample.rows.length} rows from unified view`);

    // Save
    const outputPath = path.join(__dirname, '..', 'UNIFIED_DATA_COMPLETE_EXPORT.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  EXPORT COMPLETE!                                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\nFile: ${outputPath}`);
    console.log('\nSheets:');
    console.log('  1. Customers - fp_customer_unified (563 rows)');
    console.log('  2. Sales Reps - fp_sales_rep_unified (51 rows)');
    console.log('  3. Product Groups - fp_product_group_unified (20 rows)');
    console.log('  4. Raw PG Mappings - fp_raw_product_groups (18 rows)');
    console.log('  5. Sales Rep Groups - sales_rep_groups + members');
    console.log('  6. Customer Merge Rules - active merge rules');
    console.log('  7. Unified View Sample - vw_unified_sales_complete');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

exportAll();
