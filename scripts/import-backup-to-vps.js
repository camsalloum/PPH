/**
 * Import database backup to VPS PostgreSQL
 * Run on VPS: cd /home/propackhub/server && node scripts/import-backup-to-vps.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const BACKUP_DIR = '/home/propackhub/database-backups';

async function importDatabase(dbName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Importing ${dbName}`);
  console.log('='.repeat(60));

  const dbPool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'propackhub_user',
    password: '***REDACTED***',
    database: dbName
  });

  const dbPath = path.join(BACKUP_DIR, dbName);
  
  if (!fs.existsSync(dbPath)) {
    console.log(`⚠️  No backup found for ${dbName}`);
    await dbPool.end();
    return;
  }

  const files = fs.readdirSync(dbPath).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} tables to import\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const tableName = file.replace('.json', '');
    const filePath = path.join(dbPath, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      if (data.structure && Array.isArray(data.structure)) {
        try {
          const columns = data.structure.map(col => {
            let def = `"${col.column_name}" ${col.data_type}`;
            if (col.character_maximum_length) {
              def += `(${col.character_maximum_length})`;
            }
            if (col.is_nullable === 'NO') {
              def += ' NOT NULL';
            }
            if (col.column_default && !col.column_default.includes('nextval')) {
              def += ` DEFAULT ${col.column_default}`;
            }
            return def;
          }).join(', ');
          
          const createTableQuery = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns})`;
          await dbPool.query(createTableQuery);
        } catch (createErr) {
          if (!createErr.message.includes('already exists')) {
            console.log(`   ⚠️  Create table warning: ${createErr.message}`);
          }
        }
      }
      
      const rows = Array.isArray(data) ? data : (data.data || data.rows || []);
      
      if (rows.length === 0) {
        console.log(`✅ ${tableName}: Table created (no data)`);
        imported++;
        continue;
      }

      const columns = Object.keys(rows[0]);
      let rowsInserted = 0;
      
      for (const row of rows) {
        try {
          const values = columns.map(col => row[col]);
          const placeholders = columns.map((_, i) => '$' + (i + 1)).join(', ');
          const quotedColumns = columns.map(col => `"${col}"`).join(', ');
          
          const query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          
          await dbPool.query(query, values);
          rowsInserted++;
        } catch (rowErr) {
          if (!rowErr.message.includes('duplicate key') && !rowErr.message.includes('already exists')) {
            console.error(`   ⚠️  Row error: ${rowErr.message}`);
          }
        }
      }

      console.log(`✅ ${tableName}: ${rowsInserted}/${rows.length} rows imported`);
      imported++;

    } catch (err) {
      console.error(`❌ ${tableName}: ${err.message}`);
      errors++;
    }
  }

  await dbPool.end();

  console.log(`\n📊 Summary for ${dbName}:`);
  console.log(`   ✅ Imported: ${imported} tables`);
  console.log(`   ⏭️  Skipped: ${skipped} tables`);
  console.log(`   ❌ Errors: ${errors} tables`);
}

async function main() {
  console.log('🚀 Starting database import...\n');
  console.log(`📁 Backup directory: ${BACKUP_DIR}\n`);

  try {
    await importDatabase('fp_database');
    await importDatabase('ip_auth_database');
    
    if (fs.existsSync(path.join(BACKUP_DIR, 'propackhub_platform'))) {
      await importDatabase('propackhub_platform');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Import completed!');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
