const { Client } = require('./server/node_modules/pg');
(async () => {
  const c = new Client({ host:'localhost', port:5432, user:'postgres', password:'Pph654883!', database:'postgres', connectionTimeoutMillis:5000 });
  await c.connect();
  const r = await c.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
  console.log('Databases:', r.rows.map(x => x.datname).join(', '));
  await c.end();
})();
