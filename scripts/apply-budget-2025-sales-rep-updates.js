const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { pool } = require('../server/database/config');

const INPUT_FILE = path.join(__dirname, '..', 'exports', 'budget-2025-sales-rep.xlsx');
const UNMATCHED_FILE = path.join(__dirname, '..', 'exports', 'budget-2025-sales-rep-unmatched.csv');

function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

async function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(INPUT_FILE);
  const sheet = workbook.getWorksheet('Budget 2025 Sales Rep') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No worksheet found in the Excel file.');
  }

  const client = await pool.connect();
  const unmatched = [];
  let updated = 0;
  let unchanged = 0;

  try {
    await client.query('BEGIN');

    // Build header map
    const headerRow = sheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      headerMap[normalize(cell.value)] = colNumber;
    });

    const requiredHeaders = [
      'Division',
      'Budget Year',
      'Month No',
      'Budget Type',
      'Sales Rep',
      'Sales Rep Group',
      'Customer',
      'Country',
      'Product Group'
    ];

    const missingHeaders = requiredHeaders.filter(h => !headerMap[h]);
    if (missingHeaders.length) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row || row.cellCount === 0) continue;

      const divisionCode = normalize(row.getCell(headerMap['Division']).value);
      const budgetYear = Number(row.getCell(headerMap['Budget Year']).value);
      const monthNo = Number(row.getCell(headerMap['Month No']).value);
      const budgetType = normalize(row.getCell(headerMap['Budget Type']).value).toUpperCase();
      const salesRep = normalize(row.getCell(headerMap['Sales Rep']).value);
      const salesRepGroup = normalize(row.getCell(headerMap['Sales Rep Group']).value);
      const customerName = normalize(row.getCell(headerMap['Customer']).value);
      const country = normalize(row.getCell(headerMap['Country']).value);
      const productGroup = normalize(row.getCell(headerMap['Product Group']).value);

      if (!divisionCode || !budgetYear || !monthNo || !salesRep || !customerName || !productGroup) {
        unmatched.push({
          divisionCode,
          budgetYear,
          monthNo,
          budgetType,
          salesRep,
          salesRepGroup,
          customerName,
          country,
          productGroup,
          reason: 'Missing key fields'
        });
        continue;
      }

      const selectSql = `
        SELECT country, sales_rep_group_name
        FROM fp_budget_unified
        WHERE UPPER(division_code) = UPPER($1)
          AND budget_year = $2
          AND month_no = $3
          AND UPPER(budget_type) = 'SALES_REP'
          AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($4))
          AND customer_name = $5
          AND pgcombine = $6
        LIMIT 1
      `;

      const selectRes = await client.query(selectSql, [
        divisionCode,
        budgetYear,
        monthNo,
        salesRep,
        customerName,
        productGroup
      ]);

      if (selectRes.rows.length === 0) {
        unmatched.push({
          divisionCode,
          budgetYear,
          monthNo,
          budgetType,
          salesRep,
          salesRepGroup,
          customerName,
          country,
          productGroup,
          reason: 'No matching row'
        });
        continue;
      }

      const current = selectRes.rows[0];
      const currentCountry = normalize(current.country);
      const currentGroup = normalize(current.sales_rep_group_name);

      if (currentCountry === country && currentGroup === salesRepGroup) {
        unchanged++;
        continue;
      }

      const updateSql = `
        UPDATE fp_budget_unified
        SET country = $1,
            sales_rep_group_name = $2,
            updated_at = NOW()
        WHERE UPPER(division_code) = UPPER($3)
          AND budget_year = $4
          AND month_no = $5
          AND UPPER(budget_type) = 'SALES_REP'
          AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($6))
          AND customer_name = $7
          AND pgcombine = $8
      `;

      const updateRes = await client.query(updateSql, [
        country || null,
        salesRepGroup || null,
        divisionCode,
        budgetYear,
        monthNo,
        salesRep,
        customerName,
        productGroup
      ]);

      updated += updateRes.rowCount || 0;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  const header = 'division_code,budget_year,month_no,budget_type,sales_rep,sales_rep_group,customer_name,country,product_group,reason\n';
  const lines = unmatched.map(row => [
    row.divisionCode,
    row.budgetYear,
    row.monthNo,
    row.budgetType,
    row.salesRep,
    row.salesRepGroup,
    row.customerName,
    row.country,
    row.productGroup,
    row.reason
  ].map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(','));

  fs.writeFileSync(UNMATCHED_FILE, header + lines.join('\n'));

  console.log(JSON.stringify({
    updated,
    unchanged,
    unmatched: unmatched.length,
    unmatchedFile: UNMATCHED_FILE
  }, null, 2));
}

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
