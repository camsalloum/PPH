/**
 * ============================================================================
 * COMPANY CONTEXT MIDDLEWARE
 * ============================================================================
 * 
 * Injects company and division context into every request.
 * Uses JWT token to determine which company database to use.
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const poolManager = require('../database/multiTenantPool');
const logger = require('../utils/logger');

/**
 * Extract company context from JWT and attach to request
 * 
 * After this middleware runs, request will have:
 * - req.company: { company_id, company_code, database_name }
 * - req.division: Current division code (from header or default)
 * - req.tenantPool: Database pool for this company
 * - req.divisionTable(tableName): Helper to get prefixed table name
 */
const companyContext = async (req, res, next) => {
  try {
    // Get user from previous auth middleware
    const user = req.user;
    
    if (!user) {
      // No user context - this is a public route
      return next();
    }

    // Platform admins without company context
    if (user.is_platform_admin && !user.company_code) {
      req.company = null;
      req.isPlatformAdmin = true;
      return next();
    }

    // Get company code from user or header
    const companyCode = user.company_code || req.headers['x-company-code'];
    
    if (!companyCode) {
      return res.status(400).json({
        success: false,
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    // Get division from header or user default
    const divisionCode = req.headers['x-division-code'] || 
                         req.query.division || 
                         user.default_division ||
                         null;

    // Validate user has access to this division
    if (divisionCode && user.allowed_divisions && user.allowed_divisions.length > 0) {
      if (!user.allowed_divisions.includes(divisionCode)) {
        return res.status(403).json({
          success: false,
          error: `Access denied to division: ${divisionCode}`,
          code: 'DIVISION_ACCESS_DENIED',
        });
      }
    }

    // Get company info and pool
    try {
      const companyInfo = await poolManager.getCompanyInfo(companyCode);
      const tenantPool = await poolManager.getTenantPool(companyCode);

      // Attach to request
      req.company = {
        company_id: companyInfo.company_id,
        company_code: companyInfo.company_code,
        database_name: companyInfo.database_name,
      };
      req.division = divisionCode;
      req.tenantPool = tenantPool;
      
      // Helper function to get division-prefixed table name
      req.divisionTable = (tableName) => {
        if (!req.division) {
          throw new Error('Division context required for this operation');
        }
        return `${req.division.toLowerCase()}_${tableName}`;
      };

      // Helper for division query
      req.divisionQuery = async (tableName, text, params) => {
        const fullTableName = req.divisionTable(tableName);
        const query = text.replace(/\{table\}/g, fullTableName);
        return req.tenantPool.query(query, params);
      };

    } catch (error) {
      logger.error(`[CompanyContext] Error getting company context:`, error.message);
      return res.status(404).json({
        success: false,
        error: `Company not found or inactive: ${companyCode}`,
        code: 'COMPANY_NOT_FOUND',
      });
    }

    next();
  } catch (error) {
    logger.error('[CompanyContext] Middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to establish company context',
      code: 'CONTEXT_ERROR',
    });
  }
};

/**
 * Require division context for route
 * Use after companyContext middleware
 */
const requireDivision = (req, res, next) => {
  if (!req.division) {
    return res.status(400).json({
      success: false,
      error: 'Division context required. Set X-Division-Code header or ?division= parameter',
      code: 'DIVISION_REQUIRED',
    });
  }
  next();
};

/**
 * Require specific division access
 */
const requireDivisionAccess = (divisionCode) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Platform admins have all access
    if (user.is_platform_admin) {
      return next();
    }

    // Company admins have all division access
    if (user.role === 'company_admin') {
      return next();
    }

    // Check allowed divisions
    if (user.allowed_divisions && user.allowed_divisions.length > 0) {
      if (!user.allowed_divisions.includes(divisionCode)) {
        return res.status(403).json({
          success: false,
          error: `Access denied to division: ${divisionCode}`,
          code: 'DIVISION_ACCESS_DENIED',
        });
      }
    }

    next();
  };
};

/**
 * Require platform admin access
 */
const requirePlatformAdmin = (req, res, next) => {
  const user = req.user;
  if (!user || !user.is_platform_admin) {
    return res.status(403).json({
      success: false,
      error: 'Platform administrator access required',
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
  }
  next();
};

/**
 * Require company admin access
 */
const requireCompanyAdmin = (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  // Platform admins have company admin access
  if (user.is_platform_admin) {
    return next();
  }

  if (user.role !== 'company_admin') {
    return res.status(403).json({
      success: false,
      error: 'Company administrator access required',
      code: 'COMPANY_ADMIN_REQUIRED',
    });
  }

  next();
};

module.exports = {
  companyContext,
  requireDivision,
  requireDivisionAccess,
  requirePlatformAdmin,
  requireCompanyAdmin,
};
