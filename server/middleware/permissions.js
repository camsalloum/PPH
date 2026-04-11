/**
 * Permission Middleware
 * Express middleware for checking permissions on routes
 */

const { hasPermission } = require('../services/permissionService');
const logger = require('../utils/logger');

/**
 * Middleware to require a specific permission
 * @param {string} permissionKey - The permission key required
 * @param {Object} options - { divisionFromBody, divisionFromQuery, divisionFromParams }
 * @returns {Function} Express middleware
 */
function requirePermission(permissionKey, options = {}) {
  return async (req, res, next) => {
    try {
      // User must be authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Admins bypass permission checks
      if (req.user.role === 'admin') {
        return next();
      }

      // Determine division from request (if needed for division-scoped permissions)
      let division = null;
      if (options.divisionFromBody && req.body[options.divisionFromBody]) {
        division = req.body[options.divisionFromBody];
      } else if (options.divisionFromQuery && req.query[options.divisionFromQuery]) {
        division = req.query[options.divisionFromQuery];
      } else if (options.divisionFromParams && req.params[options.divisionFromParams]) {
        division = req.params[options.divisionFromParams];
      } else if (req.body.division) {
        division = req.body.division;
      } else if (req.query.division) {
        division = req.query.division;
      } else if (req.params.division) {
        division = req.params.division;
      }

      // Check permission
      const allowed = await hasPermission(req.user.id, permissionKey, division);

      if (!allowed) {
        logger.warn('Permission denied', {
          userId: req.user.id,
          permissionKey,
          division,
          path: req.path,
        });
        return res.status(403).json({ 
          error: 'Forbidden', 
          message: `You do not have permission: ${permissionKey}` 
        });
      }

      next();
    } catch (error) {
      logger.error('Permission middleware error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to require ANY of the listed permissions
 * @param {string[]} permissionKeys - Array of permission keys (any one is sufficient)
 * @param {Object} options - Division source options
 * @returns {Function} Express middleware
 */
function requireAnyPermission(permissionKeys, options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.user.role === 'admin') {
        return next();
      }

      // Determine division
      let division = null;
      if (options.divisionFromBody && req.body[options.divisionFromBody]) {
        division = req.body[options.divisionFromBody];
      } else if (options.divisionFromQuery && req.query[options.divisionFromQuery]) {
        division = req.query[options.divisionFromQuery];
      } else if (req.body.division || req.query.division) {
        division = req.body.division || req.query.division;
      }

      // Check each permission
      for (const key of permissionKeys) {
        const allowed = await hasPermission(req.user.id, key, division);
        if (allowed) {
          return next();
        }
      }

      logger.warn('All permissions denied', {
        userId: req.user.id,
        permissionKeys,
        division,
        path: req.path,
      });
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You do not have any of the required permissions' 
      });
    } catch (error) {
      logger.error('Permission middleware error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to require ALL listed permissions
 * @param {string[]} permissionKeys - Array of permission keys (all required)
 * @param {Object} options - Division source options
 * @returns {Function} Express middleware
 */
function requireAllPermissions(permissionKeys, options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.user.role === 'admin') {
        return next();
      }

      // Determine division
      let division = null;
      if (options.divisionFromBody && req.body[options.divisionFromBody]) {
        division = req.body[options.divisionFromBody];
      } else if (options.divisionFromQuery && req.query[options.divisionFromQuery]) {
        division = req.query[options.divisionFromQuery];
      } else if (req.body.division || req.query.division) {
        division = req.body.division || req.query.division;
      }

      // Check all permissions
      for (const key of permissionKeys) {
        const allowed = await hasPermission(req.user.id, key, division);
        if (!allowed) {
          logger.warn('Permission denied (one of all required)', {
            userId: req.user.id,
            deniedPermission: key,
            allRequired: permissionKeys,
            division,
            path: req.path,
          });
          return res.status(403).json({ 
            error: 'Forbidden', 
            message: `You do not have permission: ${key}` 
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Permission middleware error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
};
