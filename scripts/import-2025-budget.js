const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: '***REDACTED***'
});

async function importBudget() {
  const wb = XLSX.readFile('../server/data/fp_budget_2025-.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log('Found', data.length, 'rows in source file');
  
  // AGGREGATE first: sum all values by year/month/product_group/metric
  const aggregated = {};
  for (const row of data) {
    const metric = row.values_type.toUpperCase() === 'MORM' ? 'MORM' : 
                   row.values_type.toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'KGS';
    const key = `${row.year}|${row.month}|${row.pgcombine}|${metric}`;
    
    if (!aggregated[key]) {
      aggregated[key] = {
        year: row.year,
        month: row.month,
        product_group: row.pgcombine,
        metric: metric,
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
    await client.query('DELETE FROM fp_divisional_budget WHERE year = 2025');
    console.log('Deleted existing 2025 data');
    
    // Insert aggregated data
    let inserted = 0;
    for (const row of aggregatedRows) {
      await client.query(
        `INSERT INTO fp_divisional_budget (division, year, month, product_group, metric, value, uploaded_filename)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['FP', row.year, row.month, row.product_group, row.metric, row.value, 'fp_budget_2025-.xlsx']
      );
      inserted++;
    }
    
    await client.query('COMMIT');
    console.log('Inserted:', inserted, 'rows');
    
    // Verify totals
    const result = await client.query(`
      SELECT year, 
             SUM(CASE WHEN UPPER(metric) = 'KGS' THEN value ELSE 0 END) as total_kgs,
             SUM(CASE WHEN UPPER(metric) = 'AMOUNT' THEN value ELSE 0 END) as total_sales,
             COUNT(DISTINCT product_group) as pgs 
      FROM fp_divisional_budget 
      GROUP BY year ORDER BY year
    `);
    console.log('\nVerification:');
    result.rows.forEach(r => console.log('Year', r.year, ': KGS=', r.total_kgs, ', Sales=', r.total_sales, ',', r.pgs, 'product groups'));
    
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    pool.end();
  }
}

importBudget().catch(console.error);
