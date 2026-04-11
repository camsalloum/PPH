/**
 * Quick VPS health check - run with: node scripts/vps-check.js
 * Connects via SSH and checks all critical services
 */
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST,
    port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  const checks = [
    ['PostgreSQL', 'pg_isready'],
    ['DB tables', "psql -U propackhub_user -d fp_database -c \"SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public'\" -t 2>&1"],
    ['Auth DB', "psql -U propackhub_user -d ip_auth_database -c \"SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public'\" -t 2>&1"],
    ['Platform DB', "psql -U propackhub_user -d propackhub_platform -c \"SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public'\" -t 2>&1"],
    ['Node version', 'node --version'],
    ['npm version', 'npm --version'],
    ['pm2 processes', 'pm2 list 2>&1'],
    ['public_html', 'ls /home/propackhub/public_html/ 2>&1 | head -20'],
    ['Git latest', 'git -C /home/propackhub/app log --oneline -3 2>&1'],
    ['Backend .env', "cat /home/propackhub/app/server/.env | grep -E '^[A-Z]' | grep -v PASSWORD | grep -v SECRET | grep -v PAT"],
    ['Disk space', 'df -h /home | tail -1'],
    ['Backend running?', 'curl -s --max-time 5 http://localhost:3001/api/health 2>&1 || echo "NOT RUNNING"'],
    ['Apache running?', 'curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://localhost:80/ 2>&1 || echo "NOT RUNNING"'],
    ['File ownership', 'ls -la /home/propackhub/app/server/index.js 2>&1'],
  ];

  for (const [label, cmd] of checks) {
    const r = await ssh.execCommand(cmd);
    const output = (r.stdout || r.stderr || '').trim();
    console.log(`\n=== ${label} ===`);
    console.log(output);
  }

  ssh.dispose();
}

run().catch(e => { console.error('SSH Error:', e.message); process.exit(1); });
