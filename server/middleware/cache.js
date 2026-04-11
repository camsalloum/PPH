/**
 * Cache Middleware
 * Provides Redis-based caching for frequently accessed endpoints
 * Supports TTL configuration and cache invalidation
 */

const redis = require('redis');
const logger = require('../utils/logger');

// Redis client configuration
let redisClient = null;
let isRedisAvailable = false;

/**
 * Initialize Redis client
 */
async function initRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        connectTimeout: 1500,  // Quick timeout - Redis is optional
        reconnectStrategy: false  // Don't reconnect on failure
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: process.env.REDIS_DB || 0
    });

    redisClient.on('error', (err) => {
      isRedisAvailable = false;
      // Silent - Redis is optional
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      isRedisAvailable = true;
    });

    // Quick timeout - don't block server startup for optional Redis
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 1500)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    return true;
  } catch (error) {
    // Redis is optional - server works fine without it
    logger.info('Redis not available - caching disabled (this is OK)');
    isRedisAvailable = false;
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      redisClient = null;
    }
    return false;
  }
}

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const { division, year, month, customer, salesRep, budgetYear } = req.query;
  const body = req.body || {};
  
  // Include relevant parameters in cache key
  const params = {
    path: req.path,
    division,
    year,
    month,
    customer,
    salesRep,
    budgetYear,
    bodyDivision: body.division,
    bodyYear: body.year,
    bodyBudgetYear: body.budgetYear
  };
  
  // Remove undefined values
  Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
  
  return `aebf:${JSON.stringify(params)}`;
}

/**
 * Cache middleware factory
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in seconds (default: 300)
 * @param {boolean} options.enabled - Enable/disable cache (default: true)
 * @returns {Function} Express middleware
 */
function cacheMiddleware(options = {}) {
  const { ttl = 300, enabled = true } = options;

  return async (req, res, next) => {
    // Skip caching if disabled or Redis not available
    if (!enabled || !isRedisAvailable || !redisClient) {
      return next();
    }

    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get cached data
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        logger.debug(`Cache HIT: ${cacheKey}`);
        const data = JSON.parse(cachedData);
        return res.json({
          ...data,
          cached: true,
          cacheKey: process.env.NODE_ENV === 'development' ? cacheKey : undefined
        });
      }

      logger.debug(`Cache MISS: ${cacheKey}`);

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // Only cache successful responses
        if (data.success !== false && res.statusCode < 400) {
          redisClient.setEx(cacheKey, ttl, JSON.stringify(data))
            .catch(err => logger.warn('Failed to cache response:', err.message));
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.warn('Cache middleware error:', error.message);
      next();
    }
  };
}

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern (e.g., 'aebf:*division:FP*')
 */
async function invalidateCache(pattern) {
  if (!isRedisAvailable || !redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
    }
  } catch (error) {
    logger.warn('Failed to invalidate cache:', error.message);
  }
}

/**
 * Invalidate all cache
 */
async function invalidateAllCache() {
  if (!isRedisAvailable || !redisClient) {
    return;
  }

  try {
    await redisClient.flushDb();
    logger.info('All cache invalidated');
  } catch (error) {
    logger.warn('Failed to invalidate all cache:', error.message);
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  if (!isRedisAvailable || !redisClient) {
    return { available: false };
  }

  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();
    
    return {
      available: true,
      keys: dbSize,
      info
    };
  } catch (error) {
    logger.warn('Failed to get cache stats:', error.message);
    return { available: false, error: error.message };
  }
}

// TTL presets for different data types
const CacheTTL = {
  SHORT: 60,        // 1 minute - for frequently changing data
  MEDIUM: 300,      // 5 minutes - default
  LONG: 1800,       // 30 minutes - for stable data
  VERY_LONG: 3600   // 1 hour - for rarely changing data
};

module.exports = {
  initRedis,
  cacheMiddleware,
  invalidateCache,
  invalidateAllCache,
  getCacheStats,
  CacheTTL,
  get isRedisAvailable() { return isRedisAvailable; },
  get redisClient() { return redisClient; }
};
