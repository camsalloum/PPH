const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  if (label) {
    console.log(`\n=== ${label} ===`);
    if (r.stdout) console.log(r.stdout);
    if (r.stderr && !r.stderr.includes('no version information')) console.log('stderr:', r.stderr);
  }
  return r;
}

const DBS = ['fp_database', 'ip_auth_database', 'propackhub_platform'];
const PG = "PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user";

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected.\n');

  // 1. Check migration files on VPS
  await run('ls -la /home/propackhub/app/migrations/sql/ 2>/dev/null', 'Migration files on VPS');

  // 2. Check schema_migrations table in each DB
  for (const db of DBS) {
    await run(
      `${PG} -d ${db} -c "SELECT * FROM schema_migrations ORDER BY version" 2>&1`,
      `schema_migrations in ${db}`
    );
    
    // Check if table exists at all
    await run(
      `${PG} -d ${db} -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations')" 2>&1`,
      `schema_migrations table exists in ${db}`
    );
  }

  // 3. Simulate what the deploy migration runner would do
  console.log('\n=== Migration Runner Simulation ===');
  const migrationsDir = '/home/propackhub/app/migrations/sql';
  
  // List UP files
  const upFiles = await run(`ls ${migrationsDir}/*.up.sql 2>/dev/null | sort`, 'UP migration files');
  
  if (!upFiles.stdout || upFiles.stdout.trim() === '') {
    console.log('No UP migration files found.');
  } else {
    const files = upFiles.stdout.trim().split('\n');
    console.log(`\nFound ${files.length} UP migration(s).`);
    
    for (const filePath of files) {
      const fileName = filePath.split('/').pop();
      const version = fileName.replace('.up.sql', '');
      const parts = version.split('_');
      const target = (parts.length >= 3 ? parts[2] : 'all').toLowerCase();
      
      console.log(`\n  File: ${fileName}`);
      console.log(`  Version: ${version}`);
      console.log(`  Target: ${target}`);
      
      // Check DOWN file exists
      const downFile = version + '.down.sql';
      const downCheck = await ssh.execCommand(`test -f ${migrationsDir}/${downFile} && echo "YES" || echo "NO"`);
      console.log(`  Down file: ${downCheck.stdout.trim()}`);
      
      // Check if already applied in each target DB
      for (const db of DBS) {
        if (target !== 'all' && target !== db.toLowerCase()) continue;
        
        const applied = await ssh.execCommand(
          `${PG} -d ${db} -t -c "SELECT version FROM schema_migrations WHERE version='${version}'" 2>&1`
        );
        const isApplied = applied.stdout.trim().includes(version);
        console.log(`  Applied in ${db}: ${isApplied ? 'YES' : 'NO — PENDING'}`);
      }
    }
  }

  // 4. Test that we can actually run a migration (dry run)
  console.log('\n=== Dry Run Test ===');
  // Try creating schema_migrations in propackhub_platform (might not exist)
  for (const db of DBS) {
    const tableExists = await ssh.execCommand(
      `${PG} -d ${db} -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations')" 2>&1`
    );
    const exists = tableExists.stdout.includes('t');
    console.log(`${db}: schema_migrations table ${exists ? 'EXISTS' : 'MISSING'}`);
  }

  // 5. Check DB connectivity for all 3 databases
  console.log('\n=== DB Connectivity ===');
  for (const db of DBS) {
    const conn = await ssh.execCommand(
      `${PG} -d ${db} -c "SELECT 1 as connected" 2>&1`
    );
    const ok = conn.stdout.includes('connected');
    console.log(`${db}: ${ok ? '✅ connected' : '❌ FAILED — ' + (conn.stderr || conn.stdout).trim()}`);
  }

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
