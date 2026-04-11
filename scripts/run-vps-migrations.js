const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

const DBS = ['fp_database', 'ip_auth_database', 'propackhub_platform'];
const PG = "PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user";
const MIGRATIONS_DIR = '/home/propackhub/app/migrations/sql';

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected.\n');

  // Get all UP migration files sorted
  const filesResult = await ssh.execCommand(`ls ${MIGRATIONS_DIR}/*.up.sql 2>/dev/null | sort`);
  const allFiles = filesResult.stdout.trim().split('\n').filter(Boolean);
  console.log(`Found ${allFiles.length} migration(s).\n`);

  for (const db of DBS) {
    console.log(`\n=== ${db} ===`);

    // Ensure schema_migrations table exists
    await ssh.execCommand(
      `${PG} -d ${db} -c "CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, version VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(500), applied_at TIMESTAMP DEFAULT NOW(), checksum VARCHAR(64), rollback_safe BOOLEAN DEFAULT true)" 2>&1`
    );

    // Get already applied
    const appliedResult = await ssh.execCommand(
      `${PG} -d ${db} -t -c "SELECT version FROM schema_migrations ORDER BY version" 2>&1`
    );
    const applied = appliedResult.stdout.trim().split('\n').map(v => v.trim()).filter(Boolean);

    for (const filePath of allFiles) {
      const fileName = filePath.split('/').pop();
      const version = fileName.replace('.up.sql', '');
      const parts = version.split('_');
      const target = (parts.length >= 3 ? parts[2] : 'all').toLowerCase();

      // Skip if not for this DB
      if (target !== 'all' && target !== db.toLowerCase()) continue;

      // Skip if already applied
      if (applied.includes(version)) {
        console.log(`  SKIP ${fileName} (already applied)`);
        continue;
      }

      // Check DOWN file exists
      const downFile = version + '.down.sql';
      const downCheck = await ssh.execCommand(`test -f ${MIGRATIONS_DIR}/${downFile} && echo "YES" || echo "NO"`);
      if (downCheck.stdout.trim() !== 'YES') {
        console.log(`  SKIP ${fileName} (no rollback file)`);
        continue;
      }

      // Run migration in transaction
      console.log(`  RUNNING ${fileName}...`);
      const result = await ssh.execCommand(
        `${PG} -d ${db} -v ON_ERROR_STOP=1 -c "BEGIN;" -f ${filePath} -c "INSERT INTO schema_migrations (version, name, rollback_safe) VALUES ('${version}', '${fileName}', true);" -c "COMMIT;" 2>&1`
      );

      if (result.stdout.includes('ERROR') || result.stderr.includes('ERROR')) {
        console.log(`  ❌ FAILED: ${result.stdout} ${result.stderr}`);
      } else {
        console.log(`  ✅ Applied`);
      }
    }
  }

  // Verify
  console.log('\n\n=== Verification ===');
  for (const db of DBS) {
    const check = await ssh.execCommand(
      `${PG} -d ${db} -c "SELECT version, name, applied_at FROM schema_migrations ORDER BY version" 2>&1`
    );
    console.log(`\n${db}:`);
    console.log(check.stdout);
  }

  ssh.dispose();
  console.log('Done.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
