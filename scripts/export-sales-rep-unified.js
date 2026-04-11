/**
 * Export fp_sales_rep_unified table to Excel
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');
const ExcelJS = require('exceljs');
const path = require('path');

async function exportSalesRepUnified() {
  try {
    console.log('Querying fp_sales_rep_unified table...');
    
    const result = await pool.query(`
      SELECT 
        sales_rep_id,
        sales_rep_code,
        display_name,
        normalized_name,
        group_id,
        group_name,
        is_active,
        total_amount_all_time,
        total_kgs_all_time,
        total_morm_all_time,
        customer_count,
        country_count,
        first_transaction_date,
        last_transaction_date,
        email,
        phone,
        employee_id,
        division,
        company_currency,
        created_at,
        updated_at
      FROM fp_sales_rep_unified 
      ORDER BY group_name, display_name
    `);
    
    console.log(`Found ${result.rows.length} rows`);
    
    if (result.rows.length === 0) {
      console.log('No data found in table');
      process.exit(0);
    }
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('fp_sales_rep_unified');
    
    // Add headers
    const columns = Object.keys(result.rows[0]);
    sheet.columns = columns.map(key => ({
      header: key,
      key: key,
      width: Math.max(15, key.length + 5)
    }));
    
    // Add rows
    result.rows.forEach(row => {
      const processedRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          processedRow[key] = value.toISOString();
        } else {
          processedRow[key] = value;
        }
      }
      sheet.addRow(processedRow);
    });
    
    // Style header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: 'FFE0E0E0' } 
    };
    
    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    
    const outputPath = path.join(__dirname, '..', 'fp_sales_rep_unified_export.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`\n✅ Exported successfully to:`);
    console.log(`   ${outputPath}`);
    console.log(`\nColumns: ${columns.join(', ')}`);
    
    // Show group summary
    console.log('\n--- Group Summary ---');
    const groupSummary = await pool.query(`
      SELECT group_name, COUNT(*) as count, 
             SUM(total_amount_all_time::numeric) as total_amount
      FROM fp_sales_rep_unified 
      GROUP BY group_name 
      ORDER BY group_name
    `);
    groupSummary.rows.forEach(g => {
      console.log(`  ${g.group_name || 'UNGROUPED'}: ${g.count} reps, $${Number(g.total_amount).toLocaleString()}`);
    });
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

exportSalesRepUnified();
