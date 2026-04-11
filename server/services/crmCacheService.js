/**
 * CRM Cache Service — in-memory TTL cache and materialized view refresh.
 *
 * Extracted from server/routes/crm/index.js to support the route split.
 *
 * Exports:
 *   - cacheGet(key)              — retrieve a cached value (or null if expired/missing)
 *   - cacheSet(key, data)        — store a value with automatic TTL expiry
 *   - refreshLastTxnView()       — refresh the mv_customer_last_txn materialized view
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

// ─── Materialized view for live last-transaction dates ───────────────────────
// Replaces the expensive inline subquery that did GROUP BY UPPER(TRIM(customer_name))
// on all 51 k rows of fp_actualcommon every single request.
let _mvRefreshRunning = false;

async function refreshLastTxnView() {
  // Mutex: skip if previous refresh is still running (B10 fix)
  if (_mvRefreshRunning) {
    logger.info('CRM: mv_customer_last_txn refresh skipped — previous still running');
    return;
  }
  _mvRefreshRunning = true;
  try {
    // Also use pg_try_advisory_lock to guard across multiple server instances
    const lockResult = await pool.query('SELECT pg_try_advisory_lock(8675309) AS acquired');
    if (!lockResult.rows[0].acquired) {
      logger.info('CRM: mv_customer_last_txn refresh skipped — another instance holds lock');
      return;
    }
    try {
      await pool.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_last_txn AS
        SELECT
          UPPER(TRIM(customer_name)) AS norm_name,
          MAX(MAKE_DATE(year, month_no, 1))  AS last_txn
        FROM fp_actualcommon
        WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
        GROUP BY UPPER(TRIM(customer_name))
      `);
      // Unique index lets us do REFRESH … CONCURRENTLY (non-blocking)
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_clt_norm
        ON mv_customer_last_txn (norm_name)
      `);
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_last_txn');
      logger.info('CRM: mv_customer_last_txn refreshed');
    } finally {
      await pool.query('SELECT pg_advisory_unlock(8675309)');
    }
  } catch (err) {
    logger.warn('CRM: mv_customer_last_txn refresh warning (non-critical)', { error: err.message });
  } finally {
    _mvRefreshRunning = false;
  }
}

// ─── Simple in-memory response cache (TTL-based) ────────────────────────────
const _dashCache = new Map();
const CACHE_TTL_MS = 45_000; // 45 seconds — default TTL

/**
 * Tiered TTL: historical-year data can be cached much longer.
 * @param {number|string} [year] — the data year; if omitted, returns default TTL
 * @returns {number} TTL in milliseconds
 */
function getCacheTTL(year) {
  if (year != null && Number(year) < new Date().getFullYear()) {
    return 30 * 60 * 1000; // 30 minutes for historical years
  }
  return 5 * 60 * 1000; // 5 minutes for current year
}

function cacheGet(key) {
  const entry = _dashCache.get(key);
  if (!entry) return null;
  const ttl = entry.ttl || CACHE_TTL_MS;
  if (Date.now() - entry.ts > ttl) { _dashCache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttl) {
  _dashCache.set(key, { data, ts: Date.now(), ttl: ttl || CACHE_TTL_MS });
  // Evict old entries on write when map is large
  if (_dashCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _dashCache) {
      if (now - v.ts > (v.ttl || CACHE_TTL_MS)) _dashCache.delete(k);
    }
  }
}

function cacheInvalidateByPrefix(prefix) {
  if (!prefix) return 0;
  let removed = 0;
  for (const key of _dashCache.keys()) {
    if (String(key).startsWith(prefix)) {
      _dashCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

// P6 fix: periodic sweep so stale entries are evicted even in read-heavy workloads
// where cacheSet is rarely called (prevents unbounded growth beyond 200 keys)
const crmCacheSweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _dashCache) {
    if (now - v.ts > (v.ttl || CACHE_TTL_MS)) _dashCache.delete(k);
  }
}, 60_000);
if (typeof crmCacheSweepInterval.unref === 'function') crmCacheSweepInterval.unref();

module.exports = { cacheGet, cacheSet, cacheInvalidateByPrefix, getCacheTTL, refreshLastTxnView };
