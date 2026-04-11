const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***'
});

async function importSalesRepBudget() {
  const wb = XLSX.readFile('../server/data/fp_budget_2025.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log('Found', data.length, 'rows in source file');
  
  // AGGREGATE first: sum values by unique key
  const aggregated = {};
  for (const row of data) {
    const valuesType = row.values_type.toUpperCase() === 'MORM' ? 'MORM' : 
                       row.values_type.toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'KGS';
    
    const key = `${row.year}|${row.month}|${row.salesrepname}|${row.customername}|${row.countryname}|${row.pgcombine}|${valuesType}`;
    
    if (!aggregated[key]) {
      aggregated[key] = {
        year: row.year,
        month: row.month,
        salesrepname: row.salesrepname,
        customername: row.customername,
        countryname: row.countryname,
        productgroup: row.pgcombine,
        values_type: valuesType,
        value: 0
      };
    }
    aggregated[key].value += (row.total || 0);
  }
  
  const aggregatedRows = Object.values(aggregated);
  console.log('Aggregated into', aggregatedRows.length, 'unique rows');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete existing 2025 data first
    const deleteResult = await client.query('DELETE FROM fp_sales_rep_budget WHERE budget_year = 2025');
    console.log('Deleted existing 2025 sales rep budget data:', deleteResult.rowCount, 'rows');
    
    // Helper to trim strings
    const safeTrim = (val) => (val || '').toString().trim();
    
    // Insert aggregated data
    let inserted = 0;
    for (const row of aggregatedRows) {
      await client.query(
        `INSERT INTO fp_sales_rep_budget 
         (division, salesrepname, customername, countryname, productgroup, budget_year, year, month, type, values_type, values, uploaded_filename)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          'FP',                              // division
          safeTrim(row.salesrepname),        // salesrepname - TRIMMED
          safeTrim(row.customername),        // customername - TRIMMED
          safeTrim(row.countryname),         // countryname - TRIMMED
          safeTrim(row.productgroup),        // productgroup - TRIMMED
          row.year,                          // budget_year
          row.year,                          // year
          row.month,                         // month
          'BUDGET',                          // type
          row.values_type,                   // values_type
          row.value,                         // values
          'fp_budget_2025.xlsx'              // uploaded_filename
        ]
      );
      inserted++;
      
      if (inserted % 500 === 0) {
        console.log('Inserted', inserted, 'rows...');
      }
    }
    
    await client.query('COMMIT');
    console.log('\nTotal inserted:', inserted, 'rows');
    
    // Verify
    const verifyResult = await client.query(`
      SELECT 
        budget_year,
        COUNT(*) as total_rows,
        COUNT(DISTINCT salesrepname) as sales_reps,
        COUNT(DISTINCT customername) as customers,
        COUNT(DISTINCT countryname) as countries,
        COUNT(DISTINCT productgroup) as product_groups,
        SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs
      FROM fp_sales_rep_budget 
      GROUP BY budget_year 
      ORDER BY budget_year
    `);
    
    console.log('\nVerification:');
    verifyResult.rows.forEach(r => {
      console.log(`Year ${r.budget_year}: ${r.total_rows} rows, ${r.sales_reps} sales reps, ${r.customers} customers, ${r.countries} countries, ${r.product_groups} PGs, KGS=${r.total_kgs}`);
    });
    
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
    throw e;
  } finally {
    client.release();
    pool.end();
  }
}

importSalesRepBudget().catch(console.error);
