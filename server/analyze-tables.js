const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fp_database'
});

async function analyze() {
  // Get all tables
  const tablesRes = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  
  console.log('=== ANALYZING ' + tablesRes.rows.length + ' TABLES ===\n');
  
  let empty = [], hasData = [];
  
  for (const row of tablesRes.rows) {
    try {
      const countRes = await pool.query(`SELECT COUNT(*) as cnt FROM "${row.tablename}"`);
      const count = parseInt(countRes.rows[0].cnt);
      if (count === 0) empty.push(row.tablename);
      else hasData.push({name: row.tablename, count});
    } catch (e) {
      console.log('  Error on ' + row.tablename + ': ' + e.message);
    }
  }
  
  console.log('TABLES WITH DATA (' + hasData.length + '):');
  hasData.sort((a,b) => b.count - a.count).forEach(t => 
    console.log('  ' + t.name.padEnd(45) + t.count.toLocaleString().padStart(10) + ' rows')
  );
  
  console.log('\nEMPTY TABLES (' + empty.length + '):');
  empty.forEach(t => console.log('  ' + t));
  
  // Check for foreign key relationships
  console.log('\n=== FOREIGN KEY RELATIONSHIPS ===');
  const fkRes = await pool.query(`
    SELECT 
      tc.table_name as from_table,
      kcu.column_name as from_column,
      ccu.table_name as to_table,
      ccu.column_name as to_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name
  `);
  
  if (fkRes.rows.length === 0) {
    console.log('  No foreign key constraints found');
  } else {
    fkRes.rows.forEach(fk => 
      console.log(`  ${fk.from_table}.${fk.from_column} -> ${fk.to_table}.${fk.to_column}`)
    );
  }
  
  await pool.end();
}

analyze().catch(e => { console.error(e); process.exit(1); });
