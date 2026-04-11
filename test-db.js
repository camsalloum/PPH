const { Client } = require('./server/node_modules/pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Pph654883!',
  database: 'postgres',
  connectionTimeoutMillis: 5000
});
c.connect()
  .then(() => { console.log('CONNECTED OK'); return c.query('SELECT version()'); })
  .then(r => console.log(r.rows[0]))
  .catch(e => console.log('FAILED:', e.message))
  .finally(() => c.end());
