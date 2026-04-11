const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: parseInt(process.env.VPS_SSH_PORT || '22', 10),
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD || '',
    readyTimeout: 15000
  });
  const run = async (cmd, label) => {
    console.log(`\n=== ${label} ===`);
    const r = await ssh.execCommand(cmd);
    console.log(r.stdout || r.stderr || '(empty)');
  };

  const sql = `
CREATE TABLE IF NOT EXISTS fp_actualrmdata (
  id SERIAL PRIMARY KEY,
  division TEXT,
  itemgroup TEXT,
  category TEXT,
  catlinedesc TEXT,
  mainitem TEXT,
  maindescription TEXT,
  mainunit TEXT,
  maincost NUMERIC,
  mainitemstock NUMERIC,
  pendingorderqty NUMERIC,
  purchaseprice NUMERIC,
  warehouse TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_division ON fp_actualrmdata(division);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_itemgroup ON fp_actualrmdata(itemgroup);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_category ON fp_actualrmdata(category);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_warehouse ON fp_actualrmdata(warehouse);
CREATE INDEX IF NOT EXISTS idx_fp_actualrmdata_mainitem ON fp_actualrmdata(mainitem);
`;

  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -c "${sql.replace(/"/g, '\\"')}" 2>&1`, 'Creating fp_actualrmdata table');

  // Verify
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fp_actualrmdata')" 2>&1`, 'Verify table exists');

  // Restart PM2 to clear any cached errors
  await run('sudo pm2 restart propackhub-backend 2>&1', 'Restart PM2');

  ssh.dispose();
  console.log('\n✅ Done. The /api/rm-sync/data and /api/rm-sync/stats endpoints should work now.');
})().catch(e => { console.error(e); process.exit(1); });
