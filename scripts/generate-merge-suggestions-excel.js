/**
 * Generate Excel file with AI Merge Suggestions
 * Columns: Customers to Merge | Proposed Merged Name | Confidence %
 */

const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const path = require('path');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'fp_database',
    user: 'postgres',
    password: '***REDACTED***'
});

async function generateMergeSuggestionsExcel() {
    console.log('Fetching AI merge suggestions...');
    
    const result = await pool.query(`
        SELECT 
            id,
            customer_group,
            suggested_merge_name,
            ROUND(confidence_score::numeric * 100) as confidence_pct,
            matching_algorithm,
            admin_action
        FROM fp_merge_rule_suggestions 
        WHERE admin_action IS NULL OR admin_action = 'PENDING'
        ORDER BY confidence_score DESC
    `);
    
    console.log(`Found ${result.rows.length} pending suggestions`);
    
    // Find max number of customers in any group
    let maxCustomers = 1;
    for (const row of result.rows) {
        const customers = Array.isArray(row.customer_group) ? row.customer_group : JSON.parse(row.customer_group || '[]');
        if (customers.length > maxCustomers) {
            maxCustomers = customers.length;
        }
    }
    console.log(`Max customers in a group: ${maxCustomers}`);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IPDashboard AI';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('AI Merge Suggestions', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });
    
    // Create headers
    const headers = ['ID'];
    for (let i = 1; i <= maxCustomers; i++) {
        headers.push(`Customer ${i} (Before Merge)`);
    }
    headers.push('Proposed Merged Name', 'Confidence %', 'Action (Approve/Reject/Edit)');
    
    // Add header row with styling
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1890FF' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;
    
    // Add data rows
    for (const row of result.rows) {
        const customers = Array.isArray(row.customer_group) ? row.customer_group : JSON.parse(row.customer_group || '[]');
        
        const rowData = [row.id];
        
        // Add customers (pad with empty strings if fewer than max)
        for (let i = 0; i < maxCustomers; i++) {
            rowData.push(customers[i] || '');
        }
        
        rowData.push(row.suggested_merge_name);
        rowData.push(row.confidence_pct);
        rowData.push(''); // Action column for user to fill
        
        const dataRow = worksheet.addRow(rowData);
        
        // Style customer columns (orange background for non-empty)
        for (let i = 1; i <= maxCustomers; i++) {
            const cell = dataRow.getCell(i + 1); // +1 because ID is first
            if (cell.value) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFF3E0' } // Light orange
                };
            }
        }
        
        // Style merged name column (green background)
        const mergedNameCell = dataRow.getCell(maxCustomers + 2);
        mergedNameCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E9' } // Light green
        };
        mergedNameCell.font = { bold: true };
        
        // Style confidence column
        const confCell = dataRow.getCell(maxCustomers + 3);
        const conf = row.confidence_pct;
        if (conf >= 90) {
            confCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } }; // Green
            confCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        } else if (conf >= 75) {
            confCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2196F3' } }; // Blue
            confCell.font = { color: { argb: 'FFFFFFFF' } };
        } else if (conf >= 50) {
            confCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } }; // Yellow
        } else {
            confCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9800' } }; // Orange
        }
        confCell.alignment = { horizontal: 'center' };
        
        // Style action column (yellow for input)
        const actionCell = dataRow.getCell(maxCustomers + 4);
        actionCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFDE7' } // Light yellow
        };
    }
    
    // Set column widths
    worksheet.getColumn(1).width = 8; // ID
    for (let i = 2; i <= maxCustomers + 1; i++) {
        worksheet.getColumn(i).width = 40; // Customer columns
    }
    worksheet.getColumn(maxCustomers + 2).width = 45; // Merged name
    worksheet.getColumn(maxCustomers + 3).width = 15; // Confidence
    worksheet.getColumn(maxCustomers + 4).width = 25; // Action
    
    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });
    
    // Add dropdown for Action column
    const actionColumn = maxCustomers + 4;
    for (let i = 2; i <= result.rows.length + 1; i++) {
        worksheet.getCell(i, actionColumn).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"Approve,Reject,Edit Name"']
        };
    }
    
    // Add instructions sheet
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.addRow(['AI Merge Suggestions - Instructions']);
    instrSheet.getRow(1).font = { bold: true, size: 14 };
    instrSheet.addRow([]);
    instrSheet.addRow(['This file contains AI-detected duplicate customers that may need to be merged.']);
    instrSheet.addRow([]);
    instrSheet.addRow(['Columns:']);
    instrSheet.addRow(['  • Customer 1-N: All customer names detected as potential duplicates']);
    instrSheet.addRow(['  • Proposed Merged Name: The suggested canonical name to merge into']);
    instrSheet.addRow(['  • Confidence %: How confident the AI is (100% = very likely duplicates)']);
    instrSheet.addRow(['  • Action: Your decision - Approve, Reject, or Edit Name']);
    instrSheet.addRow([]);
    instrSheet.addRow(['Actions:']);
    instrSheet.addRow(['  • Approve: Accept the AI suggestion and create merge rule']);
    instrSheet.addRow(['  • Reject: Dismiss this suggestion (not duplicates)']);
    instrSheet.addRow(['  • Edit Name: Change the proposed merged name before approving']);
    instrSheet.addRow([]);
    instrSheet.addRow(['If you choose "Edit Name", modify the "Proposed Merged Name" cell directly.']);
    instrSheet.getColumn(1).width = 80;
    
    // Save file
    const outputPath = path.join(__dirname, '..', 'AI_Merge_Suggestions.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`\n✅ Excel file saved to: ${outputPath}`);
    console.log(`   Total suggestions: ${result.rows.length}`);
    
    await pool.end();
}

generateMergeSuggestionsExcel().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
