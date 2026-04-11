/**
 * Permission Enforcement Middleware
 * Checks if user has required permission for accessing resources
 * Part of: User Management Module Implementation - Phase 4
 * Date: December 25, 2025
 */

const { authPool } = require('../database');
const logger = require('../utils/logger');

/**
 * Cache for user permissions (expires after 5 minutes)
 */
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get user permissions (with caching)
 */
async function getUserPermissions(userId) {
  const cacheKey = `user_${userId}`;
  const cached = permissionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.permissions;
  }

  try {
    const result = await authPool.query(`
      SELECT 
        permission_key,
        division_code
      FROM user_permissions
      WHERE user_id = $1
    `, [userId]);

    const permissions = {
      global: [],
      byDivision: {}
    };

    result.rows.forEach(row => {
      if (row.division_code) {
        if (!permissions.byDivision[row.division_code]) {
          permissions.byDivision[row.division_code] = [];
        }
        permissions.byDivision[row.division_code].push(row.permission_key);
      } else {
        permissions.global.push(row.permission_key);
      }
    });

    // Cache the result
    permissionCache.set(cacheKey, {
      permissions,
      timestamp: Date.now()
    });

    return permissions;
  } catch (error) {
    logger.error('Error fetching user permissions:', error);
    throw error;
  }
}

/**
 * Clear permission cache for a user
 */
function clearPermissionCache(userId) {
  if (userId) {
    permissionCache.delete(`user_${userId}`);
  } else {
    permissionCache.clear();
  }
}

/**
 * Check if user has a specific permission
 */
function hasPermission(permissions, requiredPermission, divisionCode = null) {
  // Check global permissions first
  if (permissions.global.includes(requiredPermission)) {
    return true;
  }

  // Check wildcard permissions (e.g., 'budget:*' matches 'budget:view')
  const [group, action] = requiredPermission.split(':');
  const wildcardKey = `${group}:*`;
  if (permissions.global.includes(wildcardKey)) {
    return true;
  }

  // If division-specific, check division permissions
  if (divisionCode && permissions.byDivision[divisionCode]) {
    if (permissions.byDivision[divisionCode].includes(requiredPermission)) {
      return true;
    }
    if (permissions.byDivision[divisionCode].includes(wildcardKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware to require a specific permission
 * @param {string} permissionKey - The permission key to check (e.g., 'budget:view')
 * @param {Object} options - Options
 * @param {boolean} options.divisionFromQuery - Get division from req.query.divisionCode
 * @param {boolean} options.divisionFromBody - Get division from req.body.divisionCode
 * @param {boolean} options.divisionFromParams - Get division from req.params.divisionCode
 * @param {string} options.divisionField - Custom field name for division
 * @param {boolean} options.logDenied - Log access denied attempts (default: true)
 */
function requirePermission(permissionKey, options = {}) {
  const {
    divisionFromQuery = false,
    divisionFromBody = false,
    divisionFromParams = false,
    divisionField = 'divisionCode',
    logDenied = true
  } = options;

  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Admins bypass permission checks
      if (req.user.role === 'admin') {
        return next();
      }

      // Get division code from request
      let divisionCode = null;
      if (divisionFromQuery) {
        divisionCode = req.query[divisionField];
      } else if (divisionFromBody) {
        divisionCode = req.body[divisionField];
      } else if (divisionFromParams) {
        divisionCode = req.params[divisionField];
      }

      // Get user permissions
      const permissions = await getUserPermissions(req.user.id);

      // Check if user has the required permission
      if (hasPermission(permissions, permissionKey, divisionCode)) {
        return next();
      }

      // Permission denied
      if (logDenied) {
        // Log the access denied attempt
        try {
          await authPool.query(`
            INSERT INTO access_denied_log (user_id, page_path, required_permission, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            req.user.id,
            req.originalUrl,
            permissionKey,
            req.ip,
            req.get('User-Agent')
          ]);
        } catch (logError) {
          logger.error('Error logging access denied:', logError);
        }

        logger.warn(`Access denied for user ${req.user.id} to ${req.originalUrl} (needs: ${permissionKey})`);
      }

      return res.status(403).json({
        error: 'Access denied',
        code: 'PERMISSION_DENIED',
        required: permissionKey,
        division: divisionCode,
        message: `You don't have permission to access this resource. Required: ${permissionKey}`
      });
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to require ANY of the specified permissions
 */
function requireAnyPermission(permissionKeys, options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (req.user.role === 'admin') {
        return next();
      }

      const permissions = await getUserPermissions(req.user.id);

      // Check if user has ANY of the required permissions
      for (const key of permissionKeys) {
        if (hasPermission(permissions, key)) {
          return next();
        }
      }

      logger.warn(`Access denied for user ${req.user.id} to ${req.originalUrl} (needs any: ${permissionKeys.join(', ')})`);

      return res.status(403).json({
        error: 'Access denied',
        code: 'PERMISSION_DENIED',
        required: permissionKeys,
        message: `You need one of these permissions: ${permissionKeys.join(', ')}`
      });
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to require ALL of the specified permissions
 */
function requireAllPermissions(permissionKeys, options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (req.user.role === 'admin') {
        return next();
      }

      const permissions = await getUserPermissions(req.user.id);

      // Check if user has ALL of the required permissions
      const missing = [];
      for (const key of permissionKeys) {
        if (!hasPermission(permissions, key)) {
          missing.push(key);
        }
      }

      if (missing.length === 0) {
        return next();
      }

      logger.warn(`Access denied for user ${req.user.id} to ${req.originalUrl} (missing: ${missing.join(', ')})`);

      return res.status(403).json({
        error: 'Access denied',
        code: 'PERMISSION_DENIED',
        missing,
        message: `You are missing these permissions: ${missing.join(', ')}`
      });
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to inject user permissions into request
 * Useful for conditional rendering in responses
 */
function injectPermissions() {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.id) {
        req.userPermissions = await getUserPermissions(req.user.id);
      }
      next();
    } catch (error) {
      logger.error('Error injecting permissions:', error);
      next(); // Continue without permissions
    }
  };
}

/**
 * Helper to check permission in route handlers
 */
async function checkPermission(userId, permissionKey, divisionCode = null) {
  if (!userId) return false;
  
  // Check if admin
  const userResult = await authPool.query(
    'SELECT role FROM users WHERE id = $1',
    [userId]
  );
  if (userResult.rows[0]?.role === 'admin') return true;

  const permissions = await getUserPermissions(userId);
  return hasPermission(permissions, permissionKey, divisionCode);
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  injectPermissions,
  checkPermission,
  clearPermissionCache,
  getUserPermissions
};
