const db = require('../database/config');

async function listSalesReps() {
  try {
    const result = await db.query(`SELECT DISTINCT canonical_name FROM sales_rep_master ORDER BY canonical_name`);
    console.log('=== Sales Rep Names in Database ===');
    result.rows.forEach(row => console.log(row.canonical_name));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listSalesReps();
