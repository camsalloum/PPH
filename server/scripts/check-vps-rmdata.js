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

  // Check if fp_actualrmdata table exists
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fp_actualrmdata')" 2>&1`, 'Table fp_actualrmdata exists?');

  // Check PM2 logs for rm-sync errors
  await run("sudo pm2 logs propackhub-backend --lines 30 --nostream 2>&1 | grep -i 'rm-sync\\|rmdata\\|rm_sync\\|relation.*does not exist' | tail -15", 'PM2 logs for RM errors');

  // Check if the table has any data
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT COUNT(*) FROM fp_actualrmdata" 2>&1`, 'Row count in fp_actualrmdata');

  ssh.dispose();
})().catch(e => { console.error(e); process.exit(1); });
