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

  console.log('Restarting PM2...');
  await ssh.execCommand('sudo pm2 restart propackhub-backend');
  
  console.log('Waiting 5s for startup...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\nPM2 status:');
  const r1 = await ssh.execCommand('sudo pm2 list');
  console.log(r1.stdout);

  console.log('\nHealth check:');
  const r2 = await ssh.execCommand('curl -s http://localhost:3001/api/health');
  console.log(r2.stdout);

  console.log('\nAuth DB check:');
  const r3 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/countries/list');
  console.log(r3.stdout);

  console.log('\nSales rep groups check:');
  const r4 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/sales-rep-groups-universal?division=FP');
  console.log(r4.stdout);

  console.log('\nPeriods check:');
  const r5 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/periods/all');
  console.log(r5.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
