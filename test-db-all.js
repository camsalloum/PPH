const { Client } = require('./server/node_modules/pg');
const dbs = ['postgres', 'fp_database', 'ip_auth_database', 'propackhub_platform'];

(async () => {
  for (const db of dbs) {
    const c = new Client({ host:'localhost', port:5432, user:'postgres', password:'Pph654883!', database: db, connectionTimeoutMillis: 5000 });
    try {
      await c.connect();
      const r = await c.query("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema='public'");
      console.log(`${db}: OK (${r.rows[0].cnt} public tables)`);
      await c.end();
    } catch(e) {
      console.log(`${db}: FAIL - ${e.message}`);
    }
  }

  // Test specific tables the 500 endpoints need
  const c = new Client({ host:'localhost', port:5432, user:'postgres', password:'Pph654883!', database:'fp_database', connectionTimeoutMillis:5000 });
  try {
    await c.connect();
    const tables = ['fp_actualcommon','fp_periods','fp_countries','fp_divisions','fp_employees'];
    for (const t of tables) {
      try {
        const r = await c.query(`SELECT count(*) as cnt FROM ${t} LIMIT 1`);
        console.log(`  ${t}: ${r.rows[0].cnt} rows`);
      } catch(e) {
        console.log(`  ${t}: MISSING - ${e.message.split('\n')[0]}`);
      }
    }
    // Check views
    const views = ['vw_unified_sales_data'];
    for (const v of views) {
      try {
        const r = await c.query(`SELECT count(*) as cnt FROM ${v} LIMIT 1`);
        console.log(`  ${v}: ${r.rows[0].cnt} rows`);
      } catch(e) {
        console.log(`  ${v}: MISSING - ${e.message.split('\n')[0]}`);
      }
    }
    await c.end();
  } catch(e) { console.log('fp_database query test FAIL:', e.message); }
})();
