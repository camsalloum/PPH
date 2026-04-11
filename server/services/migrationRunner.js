/**
 * Migration Runner Service
 * 
 * Runs ordered SQL migration files against a database.
 * Tracks which migrations have been applied via `schema_migrations` table.
 * 
 * === FILE STRUCTURE ===
 * 
 *   migrations/sql/
 *   ├── 20260207_001_all_baseline.up.sql
 *   ├── 20260207_001_all_baseline.down.sql
 *   ├── 20260208_001_fp_add_user_roles.up.sql
 *   ├── 20260208_001_fp_add_user_roles.down.sql
 * 
 * Naming: YYYYMMDD_NNN_target_description.up.sql
 *   - target: 'all' (all databases), 'fp', 'platform', etc.
 *   - .up.sql = apply the change
 *   - .down.sql = rollback the change (must always exist)
 * 
 * === ROLLBACK SAFETY HEADERS ===
 * 
 * Every migration file should include these comment headers:
 *   -- ROLLBACK: SAFE | SCHEMA ONLY | NOT SAFE
 *   -- DATA LOSS: NO | POSSIBLE | YES
 * 
 * === RULES ===
 * 
 * 1. Migrations are additive — no casual drops in production
 * 2. Each migration runs exactly once (tracked in schema_migrations)
 * 3. Migrations are ordered by filename (timestamp prefix)
 * 4. All migrations are wrapped in transactions
 * 5. Failed migrations stop the pipeline (no partial state)
 * 6. Every .up.sql MUST have a matching .down.sql
 * 7. Rollbacks are for dev/staging/same-day prod mistakes
 * 8. For real prod recovery: use pg_dump backups
 * 9. Fix forward, don't roll backward (unless no data exists)
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations/sql');

// ============================================================
// Core: schema_migrations table management
// ============================================================

/**
 * Ensure the schema_migrations tracking table exists.
 */
async function ensureMigrationsTable(queryFn) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(500),
      applied_at TIMESTAMP DEFAULT NOW(),
      checksum VARCHAR(64),
      rollback_safe BOOLEAN DEFAULT true
    )
  `);
}

/**
 * Get list of already-applied migration versions
 */
async function getAppliedMigrations(queryFn) {
  const result = await queryFn(`
    SELECT version, rollback_safe FROM schema_migrations ORDER BY version
  `);
  return result.rows;
}

// ============================================================
// File discovery and parsing
// ============================================================

/**
 * Get all unique migration versions from the sql directory,
 * optionally filtered to a specific database target.
 * 
 * Returns sorted array of { version, upFile, downFile, target }
 */
function getMigrations(targetDb = null) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const upFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.up.sql'))
    .sort();

  const migrations = upFiles.map(upFile => {
    const version = upFile.replace('.up.sql', '');
    const downFile = version + '.down.sql';
    const hasDown = fs.existsSync(path.join(MIGRATIONS_DIR, downFile));
    
    // Parse target from filename, supporting multi-token targets.
    // Examples:
    //   YYYYMMDD_NNN_all_*.up.sql
    //   YYYYMMDD_NNN_fp_database_*.up.sql
    //   YYYYMMDD_NNN_ip_auth_database_*.up.sql
    //   YYYYMMDD_NNN_propackhub_platform_*.up.sql
    const suffix = version.split('_').slice(2).join('_').toLowerCase();
    let target = 'all';
    if (suffix.startsWith('fp_database_')) target = 'fp_database';
    else if (suffix.startsWith('ip_auth_database_')) target = 'ip_auth_database';
    else if (suffix.startsWith('propackhub_platform_')) target = 'propackhub_platform';
    else if (suffix.startsWith('all_')) target = 'all';
    else {
      const parts = version.split('_');
      target = parts.length >= 3 ? parts[2].toLowerCase() : 'all';
    }
    
    // Parse safety headers from the UP file
    const upContent = fs.readFileSync(path.join(MIGRATIONS_DIR, upFile), 'utf8');
    const safety = parseRollbackSafety(upContent);
    
    return {
      version,
      upFile,
      downFile: hasDown ? downFile : null,
      target,
      rollbackSafe: safety.rollbackSafe,
      dataLoss: safety.dataLoss,
      description: safety.description || version
    };
  });

  if (!targetDb) return migrations;

  // Filter: include migrations that target this DB or 'all'
  const normalizedDb = targetDb.toLowerCase();
  return migrations.filter((m) => {
    const isLegacyMatch =
      (m.target === 'fp' && normalizedDb === 'fp_database') ||
      (m.target === 'ip' && normalizedDb === 'ip_auth_database') ||
      (m.target === 'platform' && normalizedDb === 'propackhub_platform');
    return m.target === normalizedDb || m.target === 'all' || isLegacyMatch;
  });
}

/**
 * Parse rollback safety headers from migration content:
 *   -- ROLLBACK: SAFE | SCHEMA ONLY | NOT SAFE
 *   -- DATA LOSS: NO | POSSIBLE | YES
 *   -- DESCRIPTION: ...
 */
function parseRollbackSafety(content) {
  const rollbackMatch = content.match(/^--\s*ROLLBACK:\s*(.+)$/im);
  const dataLossMatch = content.match(/^--\s*DATA LOSS:\s*(.+)$/im);
  const descMatch = content.match(/^--\s*DESCRIPTION:\s*(.+)$/im);
  
  const rollbackStr = rollbackMatch ? rollbackMatch[1].trim().toUpperCase() : 'SAFE';
  
  return {
    rollbackSafe: rollbackStr === 'SAFE',
    dataLoss: dataLossMatch ? dataLossMatch[1].trim().toUpperCase() : 'NO',
    description: descMatch ? descMatch[1].trim() : null
  };
}

/**
 * Simple checksum for migration content (detect modifications)
 */
function fileChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ============================================================
// Migration execution: UP (apply)
// ============================================================

/**
 * Run all pending UP migrations against a database.
 * 
 * @param {Function} queryFn - async function(sql, params) that runs a query
 * @param {string} dbName - database name (for filtering and logging)
 * @param {Function} onLog - optional callback: (message) => void
 * @returns {Object} { applied, skipped, errors, migrations }
 */
async function runPendingMigrations(queryFn, dbName, onLog = null) {
  const log = onLog || (() => {});
  const result = { applied: 0, skipped: 0, errors: [], migrations: [] };

  try {
    await ensureMigrationsTable(queryFn);

    const appliedRows = await getAppliedMigrations(queryFn);
    const appliedVersions = appliedRows.map(r => r.version);

    const migrations = getMigrations(dbName);

    if (migrations.length === 0) {
      log(`  No migrations found for ${dbName}`);
      return result;
    }

    for (const migration of migrations) {
      if (appliedVersions.includes(migration.version)) {
        result.skipped++;
        continue;
      }

      // Validate: every migration MUST have a .down.sql
      if (!migration.downFile) {
        const errorMsg = `${migration.upFile}: Missing rollback file (${migration.version}.down.sql)`;
        result.errors.push(errorMsg);
        log(`  ✗ ${errorMsg}`);
        break; // Stop — don't apply migrations without rollbacks
      }

      const upPath = path.join(MIGRATIONS_DIR, migration.upFile);
      const upSql = fs.readFileSync(upPath, 'utf8');
      const checksum = fileChecksum(upSql);

      try {
        log(`  ⏳ ${migration.version} [${migration.rollbackSafe ? 'SAFE' : '⚠ SCHEMA ONLY'}]`);

        await queryFn('BEGIN');
        await queryFn(upSql);
        await queryFn(
          `INSERT INTO schema_migrations (version, name, checksum, rollback_safe) VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.upFile, checksum, migration.rollbackSafe]
        );
        await queryFn('COMMIT');

        result.applied++;
        result.migrations.push(migration.version);
        log(`  ✓ Applied: ${migration.version}`);
      } catch (err) {
        await queryFn('ROLLBACK').catch(() => {});
        const errorMsg = `${migration.version}: ${err.message}`;
        result.errors.push(errorMsg);
        log(`  ✗ FAILED: ${errorMsg}`);
        break; // Stop on first error
      }
    }

    return result;
  } catch (err) {
    result.errors.push(`Migration system error: ${err.message}`);
    log(`  ✗ Migration system error: ${err.message}`);
    return result;
  }
}

// ============================================================
// Migration execution: DOWN (rollback)
// ============================================================

/**
 * Rollback the last N applied migrations.
 * 
 * Safety checks:
 * - Only rolls back if rollback_safe = true (or force = true)
 * - Warns about DATA LOSS risk
 * - Recommended for dev/staging only
 * 
 * @param {Function} queryFn - async function(sql, params)
 * @param {string} dbName - database name
 * @param {number} count - how many migrations to rollback (default: 1)
 * @param {boolean} force - skip safety check (USE WITH EXTREME CAUTION)
 * @param {Function} onLog - optional logger
 * @returns {Object} { rolledBack, errors, migrations }
 */
async function rollbackMigrations(queryFn, dbName, count = 1, force = false, onLog = null) {
  const log = onLog || (() => {});
  const result = { rolledBack: 0, errors: [], migrations: [] };

  try {
    await ensureMigrationsTable(queryFn);

    // Get applied migrations in reverse order (newest first)
    const appliedRows = await getAppliedMigrations(queryFn);
    const toRollback = appliedRows.reverse().slice(0, count);

    if (toRollback.length === 0) {
      log('  No migrations to roll back');
      return result;
    }

    for (const row of toRollback) {
      const version = row.version;
      const downFile = version + '.down.sql';
      const downPath = path.join(MIGRATIONS_DIR, downFile);

      // Check rollback file exists
      if (!fs.existsSync(downPath)) {
        const errorMsg = `${version}: No rollback file found (${downFile})`;
        result.errors.push(errorMsg);
        log(`  ✗ ${errorMsg}`);
        break;
      }

      // Safety check
      if (!row.rollback_safe && !force) {
        const errorMsg = `${version}: Marked as NOT safe to rollback. Use force=true to override (DANGER: possible data loss)`;
        result.errors.push(errorMsg);
        log(`  ⚠ ${errorMsg}`);
        break;
      }

      const downSql = fs.readFileSync(downPath, 'utf8');
      const safety = parseRollbackSafety(downSql);

      try {
        if (!row.rollback_safe) {
          log(`  ⚠ FORCED rollback: ${version} (DATA LOSS: ${safety.dataLoss})`);
        } else {
          log(`  ⏳ Rolling back: ${version}`);
        }

        await queryFn('BEGIN');
        await queryFn(downSql);
        await queryFn(
          `DELETE FROM schema_migrations WHERE version = $1`,
          [version]
        );
        await queryFn('COMMIT');

        result.rolledBack++;
        result.migrations.push(version);
        log(`  ✓ Rolled back: ${version}`);
      } catch (err) {
        await queryFn('ROLLBACK').catch(() => {});
        const errorMsg = `${version}: Rollback failed — ${err.message}`;
        result.errors.push(errorMsg);
        log(`  ✗ ${errorMsg}`);
        break;
      }
    }

    return result;
  } catch (err) {
    result.errors.push(`Rollback system error: ${err.message}`);
    log(`  ✗ Rollback system error: ${err.message}`);
    return result;
  }
}

// ============================================================
// Status reporting
// ============================================================

/**
 * Get migration status: applied, pending, safety info
 */
async function getMigrationStatus(queryFn, dbName) {
  try {
    await ensureMigrationsTable(queryFn);
    const appliedRows = await getAppliedMigrations(queryFn);
    const appliedVersions = appliedRows.map(r => r.version);
    const allMigrations = getMigrations(dbName);
    
    const pending = allMigrations.filter(m => !appliedVersions.includes(m.version));

    return {
      total: allMigrations.length,
      applied: appliedRows.length,
      pending: pending.length,
      pendingMigrations: pending.map(m => ({
        version: m.version,
        rollbackSafe: m.rollbackSafe,
        dataLoss: m.dataLoss,
        hasDown: !!m.downFile
      })),
      appliedVersions: appliedRows.map(r => ({
        version: r.version,
        rollbackSafe: r.rollback_safe
      }))
    };
  } catch (err) {
    return {
      total: 0, applied: 0, pending: 0,
      pendingMigrations: [], appliedVersions: [],
      error: err.message
    };
  }
}

module.exports = {
  runPendingMigrations,
  rollbackMigrations,
  getMigrationStatus,
  getMigrations,
  MIGRATIONS_DIR
};
