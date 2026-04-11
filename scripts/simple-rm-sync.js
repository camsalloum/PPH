/**
 * Oracle → PostgreSQL RM (Raw Material) Sync Script
 * Fetches from HAP111.XL_FPRMAVERAGES_PMD_111 → fp_actualrmdata
 *
 * DYNAMIC COLUMN EXPANSION: If Oracle sends new columns, the PostgreSQL table
 * is automatically expanded with ALTER TABLE ADD COLUMN before inserting data.
 * No manual migrations needed.
 *
 * Usage:
 *   node simple-rm-sync.js
 */

const oracledb = require("oracledb");
const { Pool } = require("pg");
const copyFrom = require("pg-copy-streams").from;
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");

// Load .env
try { require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') }); } catch {}

// Progress file for UI polling
const PROGRESS_FILE = path.join(__dirname, '..', 'server', 'rm-sync-progress.json');

function writeProgress(data) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      ...data,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) { /* ignore */ }
}

// Oracle config
const ORACLE_CONFIG = {
  user: process.env.ORACLE_SYNC_USER || "noor",
  password: process.env.ORACLE_SYNC_PASSWORD || "***REDACTED***",
  connectString: process.env.ORACLE_CONNECT_STRING || "PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com"
};

// Oracle Instant Client path
const IS_WINDOWS = process.platform === 'win32';
const ORACLE_CLIENT_PATH = IS_WINDOWS
  ? "D:\\app\\client\\Administrator\\product\\12.1.0\\client_1"
  : (process.env.ORACLE_CLIENT_PATH || "/usr/lib/oracle/21/client64/lib");

// PostgreSQL
const PG_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "fp_database",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "***REDACTED***"
};

const ORACLE_VIEW = "HAP111.XL_FPRMAVERAGES_PMD_111";

// Known numeric columns — everything else defaults to TEXT
const NUMERIC_COLUMNS = new Set([
  'maincost', 'mainitemstock', 'pendingorderqty', 'purchaseprice', 'weights'
]);

// Columns are NO LONGER hardcoded — they are discovered dynamically from Oracle
// and the PostgreSQL table is auto-expanded if Oracle sends new columns.

// Init Oracle client
try {
  oracledb.initOracleClient({ libDir: ORACLE_CLIENT_PATH });
} catch (err) {
  if (!err.message.includes('already initialized') && !err.message.includes('DPI-1047')) {
    console.warn(`Oracle client init warning: ${err.message}`);
  }
}

const pgPool = new Pool(PG_CONFIG);

// Auth database pool (for company_settings metadata)
const AUTH_PG_CONFIG = {
  ...PG_CONFIG,
  database: process.env.AUTH_DB_NAME || "ip_auth_database"
};
const authPool = new Pool(AUTH_PG_CONFIG);

/**
 * Convert text to proper case (first letter capital, rest lowercase)
 */
function toProperCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Escape value for TSV format and apply text formatting
 */
function escapeTSV(value, columnName) {
  if (value === null || value === undefined) return '\\N';
  if (value instanceof Date) return value.toISOString();
  
  let str = String(value);
  
  // Trim all text fields — preserve original Oracle casing (e.g. mLLDPE must stay as-is)
  str = str.trim();
  
  // Escape special characters for TSV
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function sync() {
  console.log('═'.repeat(60));
  console.log(`  🧪 RAW MATERIAL SYNC (RM)`);
  console.log(`  Oracle View: ${ORACLE_VIEW}`);
  console.log(`  Target: fp_actualrmdata`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  let oracleConn;
  const pgClient = await pgPool.connect();
  const startTime = Date.now();

  writeProgress({
    status: 'running',
    phase: 'Starting RM sync...',
    startTime: new Date().toISOString(),
    elapsedSeconds: 0,
    rows: 0
  });

  try {
    // 1. Connect to Oracle
    console.log('\n1. Connecting to Oracle...');
    writeProgress({ status: 'running', phase: 'Connecting to Oracle...', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0 });

    oracleConn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('   ✓ Connected to Oracle', oracleConn.oracleServerVersionString || '');

    // 2. Build query — discover columns dynamically from Oracle view
    let sql;
    let useSelectStar = false;
    
    try {
      const colResult = await oracleConn.execute(
        `SELECT column_name FROM all_tab_columns WHERE owner = 'HAP111' AND table_name = 'XL_FPRMAVERAGES_PMD_111' ORDER BY column_id`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      if (colResult.rows && colResult.rows.length > 0) {
        const oracleCols = colResult.rows.map(r => r.COLUMN_NAME);
        console.log(`   ✓ Oracle view has ${oracleCols.length} columns: ${oracleCols.join(', ')}`);
        sql = `SELECT ${oracleCols.join(', ')} FROM ${ORACLE_VIEW} ORDER BY DIVISION, ITEMGROUP, MAINITEM`;
      } else {
        useSelectStar = true;
      }
    } catch (colErr) {
      console.log(`   ⚠ Could not get column metadata: ${colErr.message}`);
      useSelectStar = true;
    }
    
    if (useSelectStar) {
      sql = `SELECT * FROM ${ORACLE_VIEW} ORDER BY DIVISION, ITEMGROUP, MAINITEM`;
    }

    // 3. Fetch from Oracle
    console.log('\n2. Fetching from Oracle...');
    writeProgress({ status: 'running', phase: 'Fetching from Oracle...', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0 });

    const fetchStart = Date.now();
    const result = await oracleConn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 5000
    });

    const rows = result.rows || [];
    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(1);

    console.log(`   ✓ Fetched ${rows.length.toLocaleString()} rows in ${fetchTime}s`);
    
    if (rows.length > 0) {
      const sampleKeys = Object.keys(rows[0]);
      console.log(`   ✓ Columns from Oracle: ${sampleKeys.join(', ')}`);
    }

    writeProgress({ status: 'running', phase: `Fetched ${rows.length.toLocaleString()} rows`, startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });

    if (rows.length === 0) {
      console.log('\n   ⚠ No data returned from Oracle!');
      writeProgress({ status: 'completed', phase: 'No data returned', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0, completedAt: new Date().toISOString() });
      return;
    }

    // 4. Dynamic column expansion — compare Oracle columns vs PostgreSQL columns
    const oracleKeys = Object.keys(rows[0]);
    const pgColNames = oracleKeys.map(k => k.toLowerCase().replace(/[\s-]/g, '_'));

    console.log('\n3. Checking PostgreSQL table schema...');
    const existingCols = await pgClient.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'fp_actualrmdata'`
    );
    const existingSet = new Set(existingCols.rows.map(r => r.column_name));

    // Find new columns that Oracle has but PostgreSQL doesn't
    const newColumns = [];
    for (let i = 0; i < pgColNames.length; i++) {
      if (!existingSet.has(pgColNames[i])) {
        newColumns.push(pgColNames[i]);
      }
    }

    if (newColumns.length > 0) {
      console.log(`   ⚡ Auto-expanding table: adding ${newColumns.length} new column(s): ${newColumns.join(', ')}`);
      for (const col of newColumns) {
        const dataType = NUMERIC_COLUMNS.has(col) ? 'NUMERIC' : 'TEXT';
        await pgClient.query(`ALTER TABLE fp_actualrmdata ADD COLUMN IF NOT EXISTS "${col}" ${dataType}`);
        console.log(`      + ${col} (${dataType})`);
      }
      console.log('   ✓ Table expanded');
    } else {
      console.log(`   ✓ All ${pgColNames.length} Oracle columns already exist in PostgreSQL`);
    }

    // 5. Clear PostgreSQL target
    console.log('\n4. Clearing fp_actualrmdata...');
    await pgClient.query("TRUNCATE TABLE fp_actualrmdata");
    console.log('   ✓ Truncated table');

    // 6. Insert using COPY — fully dynamic columns
    console.log('\n5. Bulk loading into PostgreSQL...');
    writeProgress({ status: 'running', phase: 'Inserting into PostgreSQL...', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });

    // Normalize WEIGHTS: Oracle stores Resin density in Kg/m³ — convert to g/cm³
    // Films and other categories already store in g/cm³ (values < 10)
    const catOracleKey = oracleKeys.find(k => k.toUpperCase() === 'CATEGORY');
    const wtsOracleKey = oracleKeys.find(k => k.toUpperCase() === 'WEIGHTS');
    if (catOracleKey && wtsOracleKey) {
      let convertCount = 0;
      for (const row of rows) {
        const cat = String(row[catOracleKey] || '').toLowerCase().trim();
        if (cat === 'polyethylene' || cat === 'polypropylene') {
          const w = parseFloat(row[wtsOracleKey]);
          if (isFinite(w) && w > 10) {   // Resin densities in Kg/m³ are typically 880–970
            row[wtsOracleKey] = w / 1000; // e.g. 920 Kg/m³ → 0.920 g/cm³
            convertCount++;
          }
        }
      }
      if (convertCount > 0) console.log(`   ✓ Converted ${convertCount} Resin WEIGHTS: Kg/m³ → g/cm³`);
    }

    const copyStart = Date.now();
    const copySQL = `COPY fp_actualrmdata (${pgColNames.join(", ")}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`;
    const copyStream = pgClient.query(copyFrom(copySQL));

    let insertedRows = 0;
    const readable = new Readable({
      read() {
        const CHUNK_SIZE = 500;
        const chunk = rows.slice(insertedRows, insertedRows + CHUNK_SIZE);

        if (chunk.length === 0) {
          this.push(null);
          return;
        }

        for (const row of chunk) {
          const values = oracleKeys.map((oraKey) => row[oraKey]);
          const line = values.map((val, idx) => escapeTSV(val, pgColNames[idx])).join('\t') + '\n';
          this.push(line);
        }

        insertedRows += chunk.length;
        if (insertedRows % 100 === 0) {
          process.stdout.write(`\r   ... ${insertedRows}/${rows.length} rows`);
        }
      }
    });

    await new Promise((resolve, reject) => {
      readable.pipe(copyStream).on('finish', resolve).on('error', reject);
      copyStream.on('error', reject);
    });

    const copyTime = ((Date.now() - copyStart) / 1000).toFixed(1);
    console.log(`\n   ✓ Inserted ${rows.length.toLocaleString()} rows in ${copyTime}s`);

    // Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ RM SYNC COMPLETE!');
    console.log(`  Total Rows: ${rows.length.toLocaleString()}`);
    console.log(`  Columns: ${pgColNames.length} (from Oracle)`);
    if (newColumns.length > 0) console.log(`  New Columns Added: ${newColumns.join(', ')}`);
    console.log(`  Oracle Fetch: ${fetchTime}s`);
    console.log(`  PostgreSQL Copy: ${copyTime}s`);
    console.log(`  Total Time: ${totalMinutes} min (${totalTime}s)`);
    console.log('═'.repeat(60));

    // Update last sync metadata in company_settings (so UI shows correct time)
    try {
      await authPool.query(`
        INSERT INTO company_settings (setting_key, setting_value)
        VALUES ('rm_last_sync', $1::jsonb)
        ON CONFLICT (setting_key) 
        DO UPDATE SET 
          setting_value = $1::jsonb,
          updated_at = NOW()
      `, [JSON.stringify({
        rowsInserted: rows.length,
        columns: pgColNames.length,
        newColumnsAdded: newColumns.length > 0 ? newColumns : undefined,
        completedAt: new Date().toISOString(),
        totalMinutes: parseFloat(totalMinutes),
        source: 'cron'
      })]);
      console.log('  ✓ Last sync metadata saved to company_settings');
    } catch (metaErr) {
      console.error('  ⚠ Failed to save sync metadata:', metaErr.message);
    }

    writeProgress({
      status: 'completed',
      phase: 'RM Sync complete!',
      startTime: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      totalMinutes: parseFloat(totalMinutes),
      rows: rows.length,
      columns: pgColNames.length,
      newColumnsAdded: newColumns.length > 0 ? newColumns : undefined,
      oracleFetchTime: parseFloat(fetchTime),
      pgCopyTime: parseFloat(copyTime)
    });

  } catch (err) {
    console.error("\n❌ RM Sync error:", err.message);
    if (err.stack) console.error(err.stack);
    writeProgress({
      status: 'failed',
      phase: 'Error: ' + err.message,
      startTime: new Date(startTime).toISOString(),
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      error: err.message
    });
    throw err;
  } finally {
    if (oracleConn) {
      try { await oracleConn.close(); } catch (e) { console.error('Error closing Oracle:', e.message); }
    }
    pgClient.release();
    await pgPool.end();
    await authPool.end();
  }
}

sync().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
