const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  // Get pg_hba.conf path
  const hbaResult = await ssh.execCommand('sudo find /var/lib/pgsql -name pg_hba.conf 2>/dev/null | head -1');
  const hbaFile = hbaResult.stdout.trim();
  console.log('pg_hba.conf:', hbaFile);

  // Show current state
  console.log('\n=== Current pg_hba.conf ===');
  const r0 = await ssh.execCommand(`sudo grep -v '^#' ${hbaFile} | grep -v '^$'`);
  console.log(r0.stdout);

  // Add fp_database entries for both IPv4 and IPv6
  console.log('\n=== Adding fp_database entries ===');
  const entries = [
    'host    fp_database         propackhub_user    127.0.0.1/32    md5',
    'host    fp_database         propackhub_user    ::1/128         md5',
  ];

  for (const entry of entries) {
    const dbName = entry.split(/\s+/)[1];
    const host = entry.split(/\s+/)[3];
    const check = await ssh.execCommand(`sudo grep '${dbName}.*propackhub_user.*${host.replace('/', '\\/')}' ${hbaFile}`);
    if (check.stdout.trim()) {
      console.log(`Already exists: ${dbName} ${host}`);
    } else {
      await ssh.execCommand(`sudo sed -i '/^# TYPE/a ${entry}' ${hbaFile}`);
      console.log(`Added: ${entry}`);
    }
  }

  // Reload PostgreSQL
  console.log('\n=== Reloading PostgreSQL ===');
  await ssh.execCommand('sudo systemctl reload postgresql 2>/dev/null || sudo -u postgres pg_ctl reload -D /var/lib/pgsql/16/data 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));

  // Kill port and restart PM2 cleanly
  console.log('\n=== Restarting PM2 cleanly ===');
  await ssh.execCommand('sudo pm2 stop propackhub-backend 2>/dev/null || true');
  await ssh.execCommand('sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null || true');
  await new Promise(r => setTimeout(r, 2000));
  await ssh.execCommand('sudo pm2 start propackhub-backend 2>/dev/null || sudo pm2 start /home/propackhub/app/server/index.js --name propackhub-backend --cwd /home/propackhub/app/server');
  await ssh.execCommand('sudo pm2 save');

  console.log('Waiting 6s for startup...');
  await new Promise(r => setTimeout(r, 6000));

  // Verify
  console.log('\n=== Verification ===');
  const v1 = await ssh.execCommand('sudo pm2 list');
  console.log(v1.stdout);

  const v2 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/health');
  console.log('Health:', v2.stdout);

  const v3 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/countries/list');
  console.log('Auth DB:', v3.stdout);

  const v4 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/periods/all');
  console.log('Periods:', v4.stdout);

  const v5 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" "http://localhost:3001/api/sales-rep-groups-universal?division=FP"');
  console.log('Sales rep groups:', v5.stdout);

  const v6 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/standard-config');
  console.log('Standard config:', v6.stdout);

  // Show final pg_hba.conf
  console.log('\n=== Final pg_hba.conf ===');
  const rf = await ssh.execCommand(`sudo grep -v '^#' ${hbaFile} | grep -v '^$'`);
  console.log(rf.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
