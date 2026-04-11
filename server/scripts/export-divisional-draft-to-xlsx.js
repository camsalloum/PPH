#!/usr/bin/env node
// Export fp_divisional_budget_draft to an Excel file (.xlsx)

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Load division DB pool helper
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { division: 'FP', year: new Date().getFullYear() + 1, output: null };
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2];
      if (key === 'division') out.division = val;
      else if (key === 'year') out.year = parseInt(val, 10);
      else if (key === 'output') out.output = val;
    }
  }
  if (!out.output) {
    const fname = `fp_divisional_budget_draft_${out.division}_${out.year}.xlsx`;
    out.output = path.resolve(path.join(__dirname, '..', '..', 'exports', fname));
  } else {
    out.output = path.resolve(out.output);
  }
  return out;
}

async function main() {
  const { division, year, output } = parseArgs();
  const pool = getDivisionPool(division);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(output), { recursive: true });

  console.log(`Exporting fp_divisional_budget_draft for division=${division}, year=${year}`);
  try {
    const query = {
      text: `
        SELECT id, division, budget_year, month, product_group,
               values_kgs, amount_value, is_service_charges, status,
               created_at, updated_at, last_auto_save
        FROM fp_divisional_budget_draft
        WHERE division = $1 AND budget_year = $2
        ORDER BY product_group, month, id
      `,
      values: [division, year],
    };

    const res = await pool.query(query);
    const rows = res.rows || [];

    if (rows.length === 0) {
      console.warn('No rows found. Writing an empty file with headers.');
    }

    // Build worksheet from rows
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${division}_${year}`);

    // Write workbook to disk
    XLSX.writeFile(workbook, output);

    // Quick totals summary
    const totalKgs = rows.reduce((sum, r) => sum + (Number(r.values_kgs) || 0), 0);
    const totalAmt = rows.reduce((sum, r) => sum + (Number(r.amount_value) || 0), 0);
    console.log(`Rows: ${rows.length}`);
    console.log(`Total KGS: ${totalKgs.toFixed(0)} (MT ${(totalKgs / 1000).toFixed(2)})`);
    console.log(`Total Amount AED: ${totalAmt.toFixed(0)} (M ${(totalAmt / 1_000_000).toFixed(2)})`);
    console.log(`Written: ${output}`);
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exitCode = 1;
  } finally {
    // pool is managed by pg, end not strictly required here
    process.exit();
  }
}

main();
