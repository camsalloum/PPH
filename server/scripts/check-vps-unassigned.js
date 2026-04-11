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

  console.log('=== 1. Hit the endpoint directly and see the error ===');
  const r1 = await ssh.execCommand('curl -s http://localhost:3001/api/unassigned-countries?division=FP');
  console.log(r1.stdout.substring(0, 500));

  console.log('\n=== 2. Check VPS server logs for the actual error ===');
  const r2 = await ssh.execCommand('sudo pm2 logs propackhub-backend --err --lines 10 --nostream');
  console.log(r2.stdout || r2.stderr);

  console.log('\n=== 3. Check if fp_actualcommon table exists and has countryname ===');
  const dbUser = 'propackhub_user';
  const dbPass = process.env.VPS_DB_PASSWORD || '';
  const psql = `PGPASSWORD='${dbPass}' psql -h localhost -U ${dbUser} -d fp_database -t -A`;
  
  const r3 = await ssh.execCommand(`${psql} -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'fp_actualcommon' AND column_name LIKE '%country%'"`);
  console.log('Country columns:', r3.stdout || r3.stderr);

  console.log('\n=== 4. Try the query directly ===');
  const r4 = await ssh.execCommand(`${psql} -c "SELECT DISTINCT countryname FROM fp_actualcommon WHERE countryname IS NOT NULL LIMIT 5"`);
  console.log('Sample:', r4.stdout || r4.stderr);

  // If countryname doesn't exist, check what the actual column is
  if (!r3.stdout.includes('countryname')) {
    console.log('\n=== 5. Check actual column name ===');
    const r5 = await ssh.execCommand(`${psql} -c "SELECT DISTINCT country FROM fp_actualcommon WHERE country IS NOT NULL LIMIT 5"`);
    console.log('Using "country" column:', r5.stdout || r5.stderr);
  }

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
