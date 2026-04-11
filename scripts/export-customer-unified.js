/**
 * Export fp_customer_unified table to Excel
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');
const ExcelJS = require('exceljs');
const path = require('path');

async function exportCustomerUnified() {
  try {
    console.log('Querying fp_customer_unified table...');
    
    const result = await pool.query(`
      SELECT 
        customer_id,
        customer_code,
        display_name,
        normalized_name,
        is_active,
        is_merged,
        merged_into_id,
        original_names,
        primary_sales_rep_name,
        primary_sales_rep_id,
        sales_rep_group_id,
        sales_rep_group_name,
        primary_country,
        countries,
        total_amount_all_time,
        total_kgs_all_time,
        total_morm_all_time,
        first_transaction_date,
        last_transaction_date,
        transaction_years,
        customer_type,
        customer_group,
        industry,
        market_segment,
        credit_limit,
        payment_terms,
        default_currency,
        company_currency,
        primary_contact,
        email,
        phone,
        mobile,
        website,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        latitude,
        longitude,
        pin_confirmed,
        pin_source,
        division,
        notes,
        created_at,
        updated_at
      FROM fp_customer_unified 
      ORDER BY display_name
    `);
    console.log(`Found ${result.rows.length} rows`);
    
    if (result.rows.length === 0) {
      console.log('No data found in table');
      process.exit(0);
    }
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('fp_customer_unified');
    
    // Add headers
    const columns = Object.keys(result.rows[0]);
    sheet.columns = columns.map(key => ({
      header: key,
      key: key,
      width: Math.max(15, key.length + 5)
    }));
    
    // Add rows
    result.rows.forEach(row => {
      // Convert any date objects to strings for better Excel display
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
    
    const outputPath = path.join(__dirname, '..', 'fp_customer_unified_v2_export.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`\n✅ Exported successfully to:`);
    console.log(`   ${outputPath}`);
    console.log(`\nColumns: ${columns.join(', ')}`);
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

exportCustomerUnified();
