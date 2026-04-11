/**
 * Verify both Oracle syncs work end-to-end via the API (same path as UI)
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  console.log(`\n=== ${label} ===`);
  const r = await ssh.execCommand(cmd);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stdout) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function waitForSync(progressFile, label, maxWait = 120) {
  console.log(`\nWaiting for ${label}...`);
  for (let i = 0; i < maxWait; i += 5) {
    await new Promise(r => setTimeout(r, 5000));
    const p = await ssh.execCommand(`cat ${progressFile} 2>/dev/null`);
    try {
      const data = JSON.parse(p.stdout);
      process.stdout.write(`  [${i+5}s] ${data.status} — ${data.phase}\n`);
      if (data.status === 'completed') {
        console.log(`✅ ${label} COMPLETED: ${data.rows} rows in ${data.totalMinutes || '?'} min`);
        return true;
      }
      if (data.status === 'failed') {
        console.log(`❌ ${label} FAILED: ${data.phase}`);
        return false;
      }
    } catch (e) {
      process.stdout.write(`  [${i+5}s] waiting...\n`);
    }
  }
  console.log(`⚠ ${label} timed out after ${maxWait}s`);
  return false;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // Health check
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health', 'Backend health');

  // ── Test 1: RM Sync ──
  console.log('\n' + '═'.repeat(50));
  console.log('  TEST 1: RM (Raw Material) Sync via API');
  console.log('═'.repeat(50));

  const rmResult = await ssh.execCommand('curl -s -X POST http://localhost:3001/api/rm-sync/sync');
  console.log('API response:', rmResult.stdout);

  const rmOk = await waitForSync('/home/propackhub/app/server/rm-sync-progress.json', 'RM Sync', 120);

  // ── Test 2: Actual Sales Sync (current year) ──
  console.log('\n' + '═'.repeat(50));
  console.log('  TEST 2: Actual Sales Sync via API (current year)');
  console.log('═'.repeat(50));

  const salesResult = await ssh.execCommand('curl -s -X POST http://localhost:3001/api/oracle-direct/sync -H "Content-Type: application/json" -d \'{"mode":"current-year"}\'');
  console.log('API response:', salesResult.stdout);

  const salesOk = await waitForSync('/home/propackhub/app/server/sync-progress.json', 'Actual Sales Sync', 600);

  // ── Summary ──
  console.log('\n' + '═'.repeat(50));
  console.log('  RESULTS');
  console.log('═'.repeat(50));
  console.log(`  RM Sync:            ${rmOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Actual Sales Sync:  ${salesOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═'.repeat(50));

  // Check final metadata
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -t -c \"SELECT setting_key, setting_value FROM company_settings WHERE setting_key IN ('oracle_last_sync','rm_last_sync')\" 2>&1", 'Final sync metadata');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
