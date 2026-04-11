/**
 * ============================================================================
 * MULTI-TENANT DATABASE POOL MANAGER
 * ============================================================================
 * 
 * Manages database connections for the SaaS multi-tenant architecture.
 * - Platform pool: Central SaaS database (propackhub_platform)
 * - Tenant pools: Per-company database connections
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

class MultiTenantPoolManager {
  constructor() {
    // Configuration
    this.config = {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT) || 5432,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    // Platform database name
    this.platformDbName = process.env.PLATFORM_DB_NAME || 'propackhub_platform';

    // Pool storage
    this.platformPool = null;
    this.tenantPools = new Map(); // company_code -> { pool, databaseName, lastUsed }
    
    // Cache for company lookups
    this.companyCache = new Map(); // company_code -> { database_name, company_id, expires_at }
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    // Pool cleanup interval (close idle tenant pools)
    this.cleanupInterval = null;
    this.poolIdleTimeout = 30 * 60 * 1000; // 30 minutes
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize the pool manager
   */
  async initialize() {
    try {
      // Create platform pool
      this.platformPool = new Pool({
        ...this.config,
        database: this.platformDbName,
      });

      // Test platform connection
      const client = await this.platformPool.connect();
      await client.query('SELECT 1');
      client.release();
      
      logger.info(`[MultiTenantPool] Platform pool connected to ${this.platformDbName}`);

      // Start cleanup interval
      this.startCleanupInterval();

      return true;
    } catch (error) {
      logger.error('[MultiTenantPool] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Start the idle pool cleanup interval
   */
  startCleanupInterval() {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdlePools();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Clean up idle tenant pools
   */
  async cleanupIdlePools() {
    const now = Date.now();
    const poolsToClose = [];

    for (const [companyCode, poolInfo] of this.tenantPools.entries()) {
      if (now - poolInfo.lastUsed > this.poolIdleTimeout) {
        poolsToClose.push(companyCode);
      }
    }

    for (const companyCode of poolsToClose) {
      try {
        const poolInfo = this.tenantPools.get(companyCode);
        if (poolInfo) {
          await poolInfo.pool.end();
          this.tenantPools.delete(companyCode);
          logger.info(`[MultiTenantPool] Closed idle pool for ${companyCode}`);
        }
      } catch (error) {
        logger.error(`[MultiTenantPool] Error closing pool for ${companyCode}:`, error.message);
      }
    }
  }

  // ===========================================================================
  // PLATFORM POOL
  // ===========================================================================

  /**
   * Get the platform database pool
   */
  getPlatformPool() {
    if (!this.platformPool) {
      throw new Error('Platform pool not initialized. Call initialize() first.');
    }
    return this.platformPool;
  }

  /**
   * Execute a query on the platform database
   */
  async platformQuery(text, params) {
    const pool = this.getPlatformPool();
    return pool.query(text, params);
  }

  // ===========================================================================
  // TENANT POOL MANAGEMENT
  // ===========================================================================

  /**
   * Get company info from cache or database
   */
  async getCompanyInfo(companyCode) {
    // Check cache first
    const cached = this.companyCache.get(companyCode);
    if (cached && cached.expires_at > Date.now()) {
      return cached;
    }

    // Query platform database
    const result = await this.platformQuery(
      `SELECT company_id, company_code, database_name, is_active 
       FROM companies 
       WHERE company_code = $1`,
      [companyCode]
    );

    if (!result.rows[0]) {
      throw new Error(`Company not found: ${companyCode}`);
    }

    const company = result.rows[0];
    
    if (!company.is_active) {
      throw new Error(`Company is inactive: ${companyCode}`);
    }

    // Cache the result
    const cacheEntry = {
      company_id: company.company_id,
      company_code: company.company_code,
      database_name: company.database_name,
      expires_at: Date.now() + this.cacheTTL,
    };
    this.companyCache.set(companyCode, cacheEntry);

    return cacheEntry;
  }

  /**
   * Get or create a database pool for a specific company
   */
  async getTenantPool(companyCode) {
    // Check if pool already exists
    const existing = this.tenantPools.get(companyCode);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.pool;
    }

    // Get company database info
    const companyInfo = await this.getCompanyInfo(companyCode);

    // Create new pool
    const pool = new Pool({
      ...this.config,
      database: companyInfo.database_name,
    });

    // Test connection
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      await pool.end();
      throw new Error(`Cannot connect to database for ${companyCode}: ${error.message}`);
    }

    // Store pool
    this.tenantPools.set(companyCode, {
      pool,
      databaseName: companyInfo.database_name,
      companyId: companyInfo.company_id,
      lastUsed: Date.now(),
    });

    logger.info(`[MultiTenantPool] Created pool for ${companyCode} -> ${companyInfo.database_name}`);

    return pool;
  }

  /**
   * Execute a query on a tenant database
   */
  async tenantQuery(companyCode, text, params) {
    const pool = await this.getTenantPool(companyCode);
    return pool.query(text, params);
  }

  /**
   * Get a client from tenant pool (for transactions)
   */
  async getTenantClient(companyCode) {
    const pool = await this.getTenantPool(companyCode);
    return pool.connect();
  }

  // ===========================================================================
  // DIVISION-AWARE QUERIES
  // ===========================================================================

  /**
   * Get table name with division prefix
   */
  getDivisionTable(divisionCode, tableName) {
    return `${divisionCode.toLowerCase()}_${tableName}`;
  }

  /**
   * Execute a query on a division table
   */
  async divisionQuery(companyCode, divisionCode, tableName, text, params) {
    const pool = await this.getTenantPool(companyCode);
    const fullTableName = this.getDivisionTable(divisionCode, tableName);
    
    // Replace {table} placeholder with actual table name
    const query = text.replace(/\{table\}/g, fullTableName);
    
    return pool.query(query, params);
  }

  // ===========================================================================
  // BACKWARD COMPATIBILITY
  // ===========================================================================

  /**
   * Get a pool by database name directly (for legacy code)
   * @deprecated Use getTenantPool(companyCode) instead
   */
  async getPoolByDatabase(databaseName) {
    // Check if this is a known tenant pool
    for (const [companyCode, poolInfo] of this.tenantPools.entries()) {
      if (poolInfo.databaseName === databaseName) {
        poolInfo.lastUsed = Date.now();
        return poolInfo.pool;
      }
    }

    // Create a new pool for this database
    const pool = new Pool({
      ...this.config,
      database: databaseName,
    });

    // We don't track these legacy pools in tenantPools
    // They should be migrated to use company codes
    logger.warn(`[MultiTenantPool] Legacy pool created for ${databaseName}. Migrate to company codes.`);

    return pool;
  }

  // ===========================================================================
  // SHUTDOWN
  // ===========================================================================

  /**
   * Close all pools gracefully
   */
  async shutdown() {
    logger.info('[MultiTenantPool] Shutting down...');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all tenant pools
    for (const [companyCode, poolInfo] of this.tenantPools.entries()) {
      try {
        await poolInfo.pool.end();
        logger.info(`[MultiTenantPool] Closed pool for ${companyCode}`);
      } catch (error) {
        logger.error(`[MultiTenantPool] Error closing pool for ${companyCode}:`, error.message);
      }
    }
    this.tenantPools.clear();

    // Close platform pool
    if (this.platformPool) {
      try {
        await this.platformPool.end();
        logger.info('[MultiTenantPool] Platform pool closed');
      } catch (error) {
        logger.error('[MultiTenantPool] Error closing platform pool:', error.message);
      }
      this.platformPool = null;
    }

    // Clear caches
    this.companyCache.clear();

    logger.info('[MultiTenantPool] Shutdown complete');
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {
      platform: null,
      tenants: [],
    };

    if (this.platformPool) {
      stats.platform = {
        database: this.platformDbName,
        totalCount: this.platformPool.totalCount,
        idleCount: this.platformPool.idleCount,
        waitingCount: this.platformPool.waitingCount,
      };
    }

    for (const [companyCode, poolInfo] of this.tenantPools.entries()) {
      stats.tenants.push({
        companyCode,
        database: poolInfo.databaseName,
        totalCount: poolInfo.pool.totalCount,
        idleCount: poolInfo.pool.idleCount,
        waitingCount: poolInfo.pool.waitingCount,
        lastUsed: new Date(poolInfo.lastUsed).toISOString(),
      });
    }

    return stats;
  }

  /**
   * Clear company cache (useful when company settings change)
   */
  clearCompanyCache(companyCode = null) {
    if (companyCode) {
      this.companyCache.delete(companyCode);
    } else {
      this.companyCache.clear();
    }
  }
}

// Singleton instance
const poolManager = new MultiTenantPoolManager();

module.exports = poolManager;
