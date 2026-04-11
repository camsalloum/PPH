const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();
const crypto = require('crypto');

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  if (label) {
    console.log(`\n[${label}]`);
    if (r.stdout) console.log(r.stdout);
    if (r.stderr && !r.stderr.includes('no version information')) console.log('stderr:', r.stderr);
  }
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected.\n');

  const envFile = '/home/propackhub/app/server/.env';

  // 1. Fix CORS_ORIGIN
  console.log('=== Fix 1: CORS_ORIGIN ===');
  const corsCheck = await ssh.execCommand(`grep '^CORS_ORIGIN=' ${envFile}`);
  console.log('Current:', corsCheck.stdout.trim());
  if (corsCheck.stdout.includes('localhost')) {
    await ssh.execCommand(`sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://propackhub.com|' ${envFile}`);
    console.log('Fixed to: https://propackhub.com');
  }

  // 2. Add SESSION_SECRET if missing
  console.log('\n=== Fix 2: SESSION_SECRET ===');
  const sessCheck = await ssh.execCommand(`grep '^SESSION_SECRET=' ${envFile}`);
  if (!sessCheck.stdout.includes('SESSION_SECRET=')) {
    const secret = crypto.randomBytes(32).toString('hex');
    await ssh.execCommand(`echo 'SESSION_SECRET=${secret}' >> ${envFile}`);
    console.log('Added SESSION_SECRET (64-char hex)');
  } else {
    console.log('Already set.');
  }

  // 3. Add customer_name_unified column to fp_actualcommon
  console.log('\n=== Fix 3: customer_name_unified column ===');
  const addCol = await run(
    `PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c "ALTER TABLE fp_actualcommon ADD COLUMN IF NOT EXISTS customer_name_unified TEXT" 2>&1`,
    'Add column'
  );

  // 4. Create sales_rep_defaults table if missing
  console.log('\n=== Fix 4: sales_rep_defaults table ===');
  const createTable = await run(
    `PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c "
      CREATE TABLE IF NOT EXISTS sales_rep_defaults (
        id SERIAL PRIMARY KEY,
        division VARCHAR(50),
        sales_rep_name VARCHAR(255),
        default_group_id INTEGER,
        default_territory VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    " 2>&1`,
    'Create table'
  );

  // 5. Restart pm2 to pick up .env changes
  console.log('\n=== Restarting pm2 ===');
  await run('sudo pm2 restart propackhub-backend --update-env 2>&1', 'pm2 restart');

  // Wait and check
  await new Promise(r => setTimeout(r, 5000));

  // 6. Check for remaining errors
  console.log('\n=== Post-fix log check ===');
  await run('tail -20 /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null | grep -iE "error|warn|fail" | tail -10', 'Remaining warnings');

  // Health check
  const health = await ssh.execCommand('curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null');
  console.log('\nHealth:', health.stdout.trim());

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
