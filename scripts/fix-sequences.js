/**
 * Fix PostgreSQL sequences for all tables after JSON import
 * The import script skips nextval() defaults, so auto-increment IDs are broken.
 * This script recreates sequences for ALL tables with integer id columns.
 * 
 * Run on VPS: cd /home/propackhub/server && node scripts/fix-sequences.js
 */

const { Pool } = require('pg');

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  user: 'propackhub_user',
  password: '***REDACTED***'
};

const DATABASES = ['ip_auth_database', 'fp_database', 'propackhub_platform'];

async function fixSequencesForDatabase(dbName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 Fixing sequences for: ${dbName}`);
  console.log('='.repeat(60));

  const pool = new Pool({ ...DB_CONFIG, database: dbName });

  try {
    // Test connection first
    await pool.query('SELECT 1');
  } catch (err) {
    console.log(`⚠️  Cannot connect to ${dbName}: ${err.message}`);
    await pool.end();
    return;
  }

  try {
    // Find all tables with integer/bigint id columns
    const result = await pool.query(`
      SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t 
        ON c.table_name = t.table_name AND c.table_schema = t.table_schema
      WHERE c.table_schema = 'public'
        AND c.column_name = 'id'
        AND c.data_type IN ('integer', 'bigint', 'smallint')
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name;
    `);

    console.log(`Found ${result.rows.length} tables with id columns\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of result.rows) {
      const table = row.table_name;
      const seqName = `${table}_id_seq`;

      try {
        // Check if sequence already exists and is linked
        const existingSeq = await pool.query(`
          SELECT pg_get_serial_sequence('"${table}"', 'id') as seq
        `);

        if (existingSeq.rows[0].seq) {
          // Sequence exists, just make sure it's at the right value
          await pool.query(`
            SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 
              COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)
          `);
          console.log(`⏭️  ${table}: Sequence already exists, value updated`);
          skipped++;
          continue;
        }

        // Create sequence
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS "${seqName}"`);
        
        // Set ownership
        await pool.query(`ALTER SEQUENCE "${seqName}" OWNED BY "${table}".id`);
        
        // Set as default for the column
        await pool.query(`ALTER TABLE "${table}" ALTER COLUMN id SET DEFAULT nextval('"${seqName}"')`);
        
        // Set sequence value to max(id) + 1
        const maxResult = await pool.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM "${table}"`);
        const maxId = maxResult.rows[0].max_id;
        await pool.query(`SELECT setval('"${seqName}"', ${maxId + 1}, false)`);
        
        console.log(`✅ ${table}: Sequence created (next id: ${maxId + 1})`);
        fixed++;
      } catch (err) {
        console.error(`❌ ${table}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n📊 Summary for ${dbName}:`);
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⏭️  Already OK: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
  } catch (err) {
    console.error(`❌ Fatal error for ${dbName}: ${err.message}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🚀 PostgreSQL Sequence Fix Tool');
  console.log('================================\n');
  console.log('This fixes auto-increment IDs broken by JSON import.\n');

  for (const db of DATABASES) {
    await fixSequencesForDatabase(db);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All databases processed!');
  console.log('='.repeat(60));
  console.log('\nNext: restart backend with: pm2 restart propackhub-backend');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
