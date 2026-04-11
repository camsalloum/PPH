/**
 * Compare RM sync vs Oracle actual sales sync — when did each last succeed?
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stdout) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // RM sync — find last SUCCESS
  await run('grep -n "completed successfully\\|FAILED\\|Aborting\\|RM SYNC COMPLETE" /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null | tail -20', 'RM sync — last success/fail entries');

  // Oracle actual sales — find last SUCCESS  
  await run('grep -n "completed successfully\\|FAILED\\|Aborting\\|SYNC COMPLETE" /home/propackhub/logs/oracle-sync.log 2>/dev/null | tail -20', 'Oracle sales sync — last success/fail entries');

  // RM sync — when did it last succeed with actual data?
  await run('grep "RM sync completed successfully" /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null | tail -5', 'RM sync — last successful runs');

  // Oracle sales — when did it last succeed?
  await run('grep "Sync completed successfully" /home/propackhub/logs/oracle-sync.log 2>/dev/null | tail -5', 'Oracle sales — last successful runs');

  // Check the metadata — actual last sync times from DB
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -t -c \"SELECT setting_key, setting_value FROM company_settings WHERE setting_key IN ('oracle_last_sync','rm_last_sync')\" 2>&1", 'DB metadata — last sync times');

  // Check the RM sync progress file
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', 'RM sync progress file');

  // Check the oracle sync progress file
  await run('cat /home/propackhub/app/server/sync-progress.json 2>/dev/null', 'Oracle sales sync progress file');

  // KEY: Check the cron schedule — both use same VPN but different times
  await run('crontab -l 2>&1', 'Current crontab');

  // Check full RM log around the time it last worked (Feb 11 ~21:30)
  await run('grep -B2 -A5 "RM sync completed\\|RM SYNC COMPLETE" /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null | tail -20', 'RM sync — context around last success');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
