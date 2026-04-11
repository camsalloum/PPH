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

  // 1. Find pg_hba.conf location
  console.log('=== 1. Find pg_hba.conf ===');
  const r1 = await ssh.execCommand('sudo find /var/lib/pgsql /etc/postgresql -name pg_hba.conf 2>/dev/null | head -5');
  console.log(r1.stdout || 'Not found in standard locations');
  
  // Also try via postgres
  const r1b = await ssh.execCommand('sudo -u postgres psql -t -A -c "SHOW hba_file" 2>/dev/null');
  console.log('Via postgres:', r1b.stdout || r1b.stderr);

  const hbaFile = (r1b.stdout || r1.stdout || '').trim().split('\n')[0];
  if (!hbaFile) {
    console.log('ERROR: Could not find pg_hba.conf');
    ssh.dispose();
    return;
  }
  console.log('Using:', hbaFile);

  // 2. Show current pg_hba.conf entries
  console.log('\n=== 2. Current pg_hba.conf (non-comment lines) ===');
  const r2 = await ssh.execCommand(`sudo grep -v '^#' ${hbaFile} | grep -v '^$'`);
  console.log(r2.stdout);

  // 3. Check if ip_auth_database is already allowed
  console.log('\n=== 3. Check for ip_auth_database entries ===');
  const r3 = await ssh.execCommand(`sudo grep -i 'ip_auth' ${hbaFile}`);
  console.log(r3.stdout || 'No ip_auth_database entries found');

  // 4. Check for propackhub_user entries
  console.log('\n=== 4. Check for propackhub_user entries ===');
  const r4 = await ssh.execCommand(`sudo grep -i 'propackhub_user' ${hbaFile}`);
  console.log(r4.stdout || 'No propackhub_user entries found');

  // 5. Add the missing entry for IPv6 localhost
  console.log('\n=== 5. Adding pg_hba.conf entry for ip_auth_database ===');
  // Add entries for all three databases via IPv4 and IPv6
  const entries = [
    'host    ip_auth_database    propackhub_user    127.0.0.1/32    md5',
    'host    ip_auth_database    propackhub_user    ::1/128         md5',
    'host    propackhub_platform propackhub_user    127.0.0.1/32    md5',
    'host    propackhub_platform propackhub_user    ::1/128         md5'
  ];
  
  for (const entry of entries) {
    // Check if entry already exists (avoid duplicates)
    const dbName = entry.split(/\s+/)[1];
    const host = entry.split(/\s+/)[3];
    const check = await ssh.execCommand(`sudo grep '${dbName}.*propackhub_user.*${host.replace('/', '\\/')}' ${hbaFile}`);
    if (check.stdout.trim()) {
      console.log(`Already exists: ${dbName} ${host}`);
    } else {
      // Insert before the first "host" line (so it takes priority)
      await ssh.execCommand(`sudo sed -i '/^# TYPE/a ${entry}' ${hbaFile}`);
      console.log(`Added: ${entry}`);
    }
  }

  // 6. Reload PostgreSQL
  console.log('\n=== 6. Reloading PostgreSQL ===');
  const r6 = await ssh.execCommand('sudo systemctl reload postgresql 2>/dev/null || sudo -u postgres pg_ctl reload -D /var/lib/pgsql/16/data 2>/dev/null || sudo service postgresql reload 2>/dev/null');
  console.log(r6.stdout || r6.stderr || 'Reload attempted');

  // 7. Test connection
  console.log('\n=== 7. Testing connection ===');
  await new Promise(r => setTimeout(r, 2000));
  
  const dbPass = process.env.VPS_DB_PASSWORD || '';
  const r7 = await ssh.execCommand(`PGPASSWORD='${dbPass}' psql -h localhost -U propackhub_user -d ip_auth_database -t -A -c "SELECT COUNT(*) FROM users" 2>&1`);
  console.log('Users count:', r7.stdout);

  const r7b = await ssh.execCommand('curl -s http://localhost:3001/api/countries/list 2>&1 | head -c 200');
  console.log('API test:', r7b.stdout);

  // 8. Show updated pg_hba.conf
  console.log('\n=== 8. Updated pg_hba.conf ===');
  const r8 = await ssh.execCommand(`sudo grep -v '^#' ${hbaFile} | grep -v '^$'`);
  console.log(r8.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
