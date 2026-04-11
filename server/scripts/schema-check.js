const { Client } = require('pg');

async function main() {
  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: 'propackhub_platform',
  });
  await client.connect();
  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'companies'
    ORDER BY ordinal_position
  `);
  console.log('companies columns:', cols.rows.map((r) => r.column_name));

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name IN ('tenant_api_keys', 'tenant_reported_metrics')
  `);
  console.log('tables:', tables.rows);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
