/**
 * Optimized Oracle → PostgreSQL Sync Script
 * Direct fetch from Oracle (fast) + COPY to PostgreSQL (fastest)
 *
 * Strategy:
 * - Oracle: Direct fetch (no resultSet/cursor) - works best with this view
 * - PostgreSQL: COPY command for bulk insert (10-100x faster)
 *
 * Usage:
 *   node simple-oracle-sync.js 2026   # Sync specific year
 *   node simple-oracle-sync.js        # Sync all years
 */

const oracledb = require("oracledb");
const { Pool } = require("pg");
const copyFrom = require("pg-copy-streams").from;
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");

// Load .env (for VPS compatibility)
try { require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') }); } catch {}

// ================= CONFIG =================

// Progress file for UI polling
const PROGRESS_FILE = path.join(__dirname, '..', 'server', 'sync-progress.json');

function writeProgress(data) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      ...data,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) {
    // Ignore write errors
  }
}

// Oracle
const ORACLE_CONFIG = {
  user: process.env.ORACLE_SYNC_USER || "noor",
  password: process.env.ORACLE_SYNC_PASSWORD || "***REDACTED***",
  connectString: process.env.ORACLE_CONNECT_STRING || "PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com"
};

// Oracle Instant Client path — auto-detect OS
const IS_WINDOWS = process.platform === 'win32';
const ORACLE_CLIENT_PATH = IS_WINDOWS
  ? "D:\\app\\client\\Administrator\\product\\12.1.0\\client_1"
  : (process.env.ORACLE_CLIENT_PATH || "/usr/lib/oracle/21/client64/lib");

// PostgreSQL — use env vars on VPS, fallback to local dev defaults
const PG_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "fp_database",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "***REDACTED***"
};

const ORACLE_VIEW = "HAP111.XL_FPSALESVSCOST_FULL";

const ORACLE_COLUMNS = [
  'DIVISION','SUBDIVISION','CUSTOMERTITLE','ITEMCODE','ITEMGROUPCODE',
  'ITEMGROUPDESCRIPTION','SUBGROUP','ITEMDESCRIPTION','WEIGHT','FINANCIALCUSTOMER',
  'CUSTOMER','CUSTOMERNAME','FIRSTRANDATE','COUNTRYNAME','SALESREPNAME',
  'SALESREPCODE','UNITDESCRIPTION','SELECTIONCODEDESCRIPTION','SELECTIONCODE',
  'PRODUCTTYPE','INVOICEDATE','TRANSACTIONTYPE','INVOICENO','PRODUCTGROUP',
  'YEAR1','MONTH1','MONTHNO','DELIVEREDQTYINSTORAGEUNITS','DELIVEREDQUANTITY',
  'DELIVEREDQUANTITYKGS','INVOICEDAMOUNT','MATERIALVALUE','OPVALUE','MARGINOVERRM',
  'TOTALVALUE','MARGINOVERTOTAL','MACHINENO','MACHINENAME','TITLECODE','TITLENAME',
  'ADDRESS_1','ADDRESS_2','POSTBOX','PHONE','BUILDING','CREDITLIMIT','PAYMENTCODE',
  'TERMSOFPAYMENT','PAYMENTDAYS','CONTACTNAME','CONTACTPOSITION','CONTDEPARTMENT',
  'CONTTEL','CONTMOB','CONTEMAIL','BUSINESSPARTNERTYPE','DELIVERYTERMS'
];

const PG_COLUMNS = ORACLE_COLUMNS.map(c => c.toLowerCase());

// Initialize Oracle client — skip if already initialized or using system-wide install
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
 * Escape value for TSV format (tabs and newlines must be replaced)
 */
function escapeTSV(value) {
  if (value === null || value === undefined) {
    return '\\N'; // PostgreSQL NULL representation
  }
  
  // Handle dates
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  const str = String(value);
  // Replace backslashes first, then tabs, newlines, carriage returns
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function sync(year) {
  console.log('═'.repeat(60));
  console.log(`  🚀 OPTIMIZED ORACLE SYNC`);
  console.log(`  Strategy: Direct Oracle fetch + PostgreSQL COPY`);
  console.log(`  Year: ${year || 'ALL'}`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  let oracleConn;
  const pgClient = await pgPool.connect();
  const startTime = Date.now();
  
  // Write initial progress
  writeProgress({
    status: 'running',
    phase: 'Starting',
    year: year || 'ALL',
    startTime: new Date().toISOString(),
    elapsedSeconds: 0,
    rows: 0
  });

  try {
    // 1. Connect to Oracle
    console.log('\n1. Connecting to Oracle...');
    writeProgress({ status: 'running', phase: 'Connecting to Oracle...', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0 });
    
    oracleConn = await oracledb.getConnection(ORACLE_CONFIG);
    console.log('   ✓ Connected to Oracle', oracleConn.oracleServerVersionString || '');

    // 2. Build query
    const where = year ? `WHERE YEAR1 = ${year}` : "";
    const sql = `SELECT ${ORACLE_COLUMNS.join(", ")} FROM ${ORACLE_VIEW} ${where}`;

    // 3. Fetch from Oracle FIRST (before any deletes - prevents data loss on failure)
    console.log('\n2. Fetching from Oracle...');
    console.log('   ⏳ Using direct fetch (best for this Oracle view)');
    console.log('   ⏳ This may take 5-10 minutes depending on data size...\n');
    
    writeProgress({ status: 'running', phase: 'Fetching from Oracle (this takes 5-10 min)...', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0 });
    
    const fetchStart = Date.now();
    
    // CRITICAL: Direct execute without resultSet - this is what works with your Oracle view
    const result = await oracleConn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_ARRAY,
      fetchArraySize: 10000  // Large fetch size for performance
    });

    const rows = result.rows || [];
    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(1);
    
    console.log(`   ✓ Fetched ${rows.length.toLocaleString()} rows in ${fetchTime}s`);
    console.log(`   ✓ Fetch rate: ${Math.round(rows.length / fetchTime).toLocaleString()} rows/sec`);
    
    writeProgress({ status: 'running', phase: `Fetched ${rows.length.toLocaleString()} rows from Oracle`, year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });

    if (rows.length === 0) {
      console.log('\n   ⚠ No data returned from Oracle! Keeping existing data.');
      writeProgress({ status: 'completed', phase: 'No data returned', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: 0, completedAt: new Date().toISOString() });
      return;
    }

    // 4. Clear PostgreSQL target ONLY AFTER successful Oracle fetch
    console.log('\n3. Clearing PostgreSQL data (Oracle fetch successful)...');
    writeProgress({ status: 'running', phase: 'Clearing old data...', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });
    
    if (year) {
      const deleteResult = await pgClient.query("DELETE FROM fp_raw_oracle WHERE year1 = $1", [year]);
      console.log(`   ✓ Deleted ${deleteResult.rowCount} existing rows for year ${year}`);
    } else {
      await pgClient.query("TRUNCATE TABLE fp_raw_oracle");
      console.log('   ✓ Truncated table');
    }

    // 5. Insert into PostgreSQL using COPY (super fast)
    console.log('\n4. Bulk loading into PostgreSQL with COPY...');
    writeProgress({ status: 'running', phase: 'Inserting into PostgreSQL...', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });
    
    const copyStart = Date.now();
    const copySQL = `COPY fp_raw_oracle (${PG_COLUMNS.join(", ")}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`;
    const copyStream = pgClient.query(copyFrom(copySQL));

    let insertedRows = 0;

    // Create readable stream from the fetched rows
    const readable = new Readable({
      read() {
        const CHUNK_SIZE = 1000;
        const chunk = rows.slice(insertedRows, insertedRows + CHUNK_SIZE);
        
        if (chunk.length === 0) {
          this.push(null); // End of stream
          return;
        }

        for (const row of chunk) {
          const line = row.map(escapeTSV).join('\t') + '\n';
          this.push(line);
        }
        
        insertedRows += chunk.length;
        
        // Progress feedback every 10k rows
        if (insertedRows % 10000 === 0) {
          const progress = ((insertedRows / rows.length) * 100).toFixed(1);
          process.stdout.write(`\r   ... ${insertedRows.toLocaleString()}/${rows.length.toLocaleString()} rows (${progress}%)`);
        }
      }
    });

    // Pipe to PostgreSQL
    await new Promise((resolve, reject) => {
      readable
        .pipe(copyStream)
        .on('finish', resolve)
        .on('error', reject);
      
      copyStream.on('error', reject);
    });

    const copyTime = ((Date.now() - copyStart) / 1000).toFixed(1);
    const copyRate = Math.round(rows.length / (Date.now() - copyStart) * 1000);
    
    console.log(`\n   ✓ Inserted ${rows.length.toLocaleString()} rows in ${copyTime}s (${copyRate.toLocaleString()} rows/sec)`);

    // 6. Sync to fp_actualcommon
    console.log('\n5. Syncing to fp_actualcommon...');
    writeProgress({ status: 'running', phase: 'Syncing to fp_actualcommon...', year: year || 'ALL', startTime: new Date(startTime).toISOString(), elapsedSeconds: Math.round((Date.now() - startTime) / 1000), rows: rows.length });
    
    const syncStart = Date.now();
    await pgClient.query("SELECT sync_oracle_to_actualcommon()");
    const syncTime = ((Date.now() - syncStart) / 1000).toFixed(1);
    console.log(`   ✓ Synced in ${syncTime}s`);

    // Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ SYNC COMPLETE!');
    console.log(`  Total Rows: ${rows.length.toLocaleString()}`);
    console.log(`  Oracle Fetch: ${fetchTime}s`);
    console.log(`  PostgreSQL Copy: ${copyTime}s`);
    console.log(`  Total Time: ${totalMinutes} min (${totalTime}s)`);
    console.log('═'.repeat(60));
    
    // Update last sync metadata in company_settings (so UI shows correct time)
    try {
      await authPool.query(`
        INSERT INTO company_settings (setting_key, setting_value)
        VALUES ('oracle_last_sync', $1::jsonb)
        ON CONFLICT (setting_key) 
        DO UPDATE SET 
          setting_value = $1::jsonb,
          updated_at = NOW()
      `, [JSON.stringify({
        mode: year ? 'single_year' : 'all_years',
        year: year || 'ALL',
        rowsInserted: rows.length,
        completedAt: new Date().toISOString(),
        totalMinutes: parseFloat(totalMinutes),
        source: 'cron'
      })]);
      console.log('  ✓ Last sync metadata saved to company_settings');
    } catch (metaErr) {
      console.error('  ⚠ Failed to save sync metadata:', metaErr.message);
    }

    // Write final progress
    writeProgress({
      status: 'completed',
      phase: 'Sync complete!',
      year: year || 'ALL',
      startTime: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      totalMinutes: parseFloat(totalMinutes),
      rows: rows.length,
      oracleFetchTime: parseFloat(fetchTime),
      pgCopyTime: parseFloat(copyTime)
    });

  } catch (err) {
    console.error("\n❌ Sync error:", err.message);
    if (err.stack) {
      console.error("\nStack trace:");
      console.error(err.stack);
    }
    
    // Write error progress
    writeProgress({
      status: 'failed',
      phase: 'Error: ' + err.message,
      year: year || 'ALL',
      startTime: new Date(startTime).toISOString(),
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      error: err.message
    });
    
    throw err;
  } finally {
    if (oracleConn) {
      try {
        await oracleConn.close();
      } catch (e) {
        console.error('Error closing Oracle connection:', e.message);
      }
    }
    pgClient.release();
    await pgPool.end();
    await authPool.end();
  }
}

const year = process.argv[2] ? parseInt(process.argv[2]) : null;
sync(year).catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
