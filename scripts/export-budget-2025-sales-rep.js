const path = require('path');
const ExcelJS = require('exceljs');
const { pool } = require('../server/database/config');

async function run() {
  const client = await pool.connect();
  try {
    const sql = `
      SELECT
        division_code,
        budget_year,
        month_no,
        budget_type,
        sales_rep_name,
        sales_rep_group_name,
        customer_name,
        country,
        pgcombine,
        qty_kgs,
        amount,
        morm
      FROM fp_budget_unified
      WHERE budget_year = 2025
        AND UPPER(division_code) = 'FP'
        AND UPPER(budget_type) = 'SALES_REP'
      ORDER BY sales_rep_name, customer_name, month_no
    `;

    const result = await client.query(sql);
    const rows = result.rows || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Budget 2025 Sales Rep');

    sheet.columns = [
      { header: 'Division', key: 'division_code', width: 10 },
      { header: 'Budget Year', key: 'budget_year', width: 12 },
      { header: 'Month No', key: 'month_no', width: 10 },
      { header: 'Budget Type', key: 'budget_type', width: 12 },
      { header: 'Sales Rep', key: 'sales_rep_name', width: 28 },
      { header: 'Sales Rep Group', key: 'sales_rep_group_name', width: 28 },
      { header: 'Customer', key: 'customer_name', width: 40 },
      { header: 'Country', key: 'country', width: 24 },
      { header: 'Product Group', key: 'pgcombine', width: 28 },
      { header: 'Qty KGS', key: 'qty_kgs', width: 14 },
      { header: 'Amount', key: 'amount', width: 16 },
      { header: 'MoRM', key: 'morm', width: 14 }
    ];

    rows.forEach((row) => sheet.addRow(row));

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const outputPath = path.join(__dirname, '..', 'exports', 'budget-2025-sales-rep.xlsx');
    await workbook.xlsx.writeFile(outputPath);

    console.log(outputPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
