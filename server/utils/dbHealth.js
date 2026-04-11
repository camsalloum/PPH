/**
 * Database Health Check Utilities
 * Verifies database connectivity and table integrity
 */

const logger = require('../utils/logger');

/**
 * Check database connection health
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<Object>} Health status
 */
async function checkDatabaseHealth(pool) {
  const result = {
    connected: false,
    latency: null,
    version: null,
    error: null
  };
  
  const start = Date.now();
  
  try {
    const queryResult = await pool.query('SELECT NOW() as time, version() as version');
    result.connected = true;
    result.latency = Date.now() - start;
    result.version = queryResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ');
  } catch (error) {
    result.error = error.message;
    logger.error('Database health check failed', { error: error.message });
  }
  
  return result;
}

/**
 * Check if required tables exist
 * @param {Object} pool - PostgreSQL connection pool
 * @param {string[]} tables - Array of table names to check
 * @returns {Promise<Object>} Table existence status
 */
async function checkTablesExist(pool, tables) {
  const result = {
    allExist: true,
    tables: {}
  };
  
  try {
    for (const table of tables) {
      const queryResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `, [table]);
      
      const exists = queryResult.rows[0]?.exists || false;
      result.tables[table] = exists;
      
      if (!exists) {
        result.allExist = false;
      }
    }
  } catch (error) {
    result.error = error.message;
    result.allExist = false;
  }
  
  return result;
}

/**
 * Get database statistics
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<Object>} Database statistics
 */
async function getDatabaseStats(pool) {
  const stats = {
    size: null,
    connections: null,
    activeQueries: null
  };
  
  try {
    // Database size
    const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    stats.size = sizeResult.rows[0]?.size;
    
    // Connection count
    const connResult = await pool.query(`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    stats.connections = parseInt(connResult.rows[0]?.count || 0);
    
    // Active queries
    const activeResult = await pool.query(`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database() 
      AND state = 'active'
    `);
    stats.activeQueries = parseInt(activeResult.rows[0]?.count || 0);
    
  } catch (error) {
    logger.error('Failed to get database stats', { error: error.message });
  }
  
  return stats;
}

/**
 * Check database table row counts
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Object} tables - Map of table names to expected minimum counts
 * @returns {Promise<Object>} Row count status
 */
async function checkTableRowCounts(pool, tables) {
  const result = {
    healthy: true,
    tables: {}
  };
  
  try {
    for (const [table, minCount] of Object.entries(tables)) {
      const queryResult = await pool.query(`
        SELECT count(*) as count FROM ${table}
      `);
      
      const count = parseInt(queryResult.rows[0]?.count || 0);
      const healthy = count >= minCount;
      
      result.tables[table] = {
        count,
        minExpected: minCount,
        healthy
      };
      
      if (!healthy) {
        result.healthy = false;
      }
    }
  } catch (error) {
    result.error = error.message;
    result.healthy = false;
  }
  
  return result;
}

/**
 * Perform comprehensive database health check
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Complete health status
 */
async function comprehensiveHealthCheck(pool, options = {}) {
  const {
    requiredTables = [],
    tableMinCounts = {}
  } = options;
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Connection check
  health.checks.connection = await checkDatabaseHealth(pool);
  if (!health.checks.connection.connected) {
    health.status = 'unhealthy';
    return health;
  }
  
  // Table existence check
  if (requiredTables.length > 0) {
    health.checks.tables = await checkTablesExist(pool, requiredTables);
    if (!health.checks.tables.allExist) {
      health.status = 'degraded';
    }
  }
  
  // Row count check
  if (Object.keys(tableMinCounts).length > 0) {
    health.checks.rowCounts = await checkTableRowCounts(pool, tableMinCounts);
    if (!health.checks.rowCounts.healthy) {
      health.status = 'degraded';
    }
  }
  
  // Database stats
  health.checks.stats = await getDatabaseStats(pool);
  
  return health;
}

module.exports = {
  checkDatabaseHealth,
  checkTablesExist,
  getDatabaseStats,
  checkTableRowCounts,
  comprehensiveHealthCheck
};
