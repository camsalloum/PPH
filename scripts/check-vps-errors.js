const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  console.log(r.stdout || r.stderr || '(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected.');

  // PM2 error log (last 50 lines)
  await run('sudo pm2 logs propackhub-backend --err --lines 50 --nostream 2>&1', 'PM2 ERROR LOG (last 50)');

  // PM2 out log (last 50 lines) — filter for errors/warnings
  await run('tail -200 /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null | grep -iE "error|fail|warn|missing|cannot|FATAL" | tail -30', 'ERRORS/WARNINGS in out log');

  // Check pm2 status + restarts
  await run('sudo pm2 jlist 2>/dev/null | node -e "const d=require(\'fs\').readFileSync(\'/dev/stdin\',\'utf8\');const p=JSON.parse(d);p.forEach(x=>console.log(\'name:\',x.name,\'status:\',x.pm2_env.status,\'restarts:\',x.pm2_env.restart_time,\'uptime:\',Math.round((Date.now()-x.pm2_env.pm_uptime)/1000)+\'s\'))" 2>/dev/null || echo "parse error"', 'PM2 Process Info');

  // Check if backend responds properly
  await run('curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "HEALTH CHECK FAILED"', 'Health Check Response');

  // Check for missing columns referenced in code
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c \"SELECT column_name FROM information_schema.columns WHERE table_name='fp_actualcommon' AND column_name='customer_name_unified'\" 2>&1", 'customer_name_unified column check');

  // Check for any recent DB errors
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c \"SELECT count(*) as total_tables FROM information_schema.tables WHERE table_schema='public'\" 2>&1", 'Total tables in fp_database');

  // Check if key tables exist
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -t -c \"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fp_raw_oracle','fp_actualcommon','divisions','sales_rep_groups','sales_rep_group_members','fp_raw_product_groups') ORDER BY table_name\" 2>&1", 'Key Oracle sync tables');

  // Check fp_raw_oracle row count
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c \"SELECT count(*) as rows, max(synced_at) as last_sync FROM fp_raw_oracle\" 2>&1", 'fp_raw_oracle data');

  // Check disk space
  await run('df -h / | tail -1', 'Disk Space');

  // Check nginx error log
  await run('sudo tail -20 /var/log/nginx/error.log 2>/dev/null || echo "no nginx error log"', 'Nginx errors');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
