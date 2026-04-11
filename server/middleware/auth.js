const authService = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Middleware to verify JWT token and attach user to request
 */
async function authenticate(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = await authService.verifyToken(token);

    // Attach user info to request (handle both legacy and platform tokens)
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      designation: decoded.designation || null,
      designation_level: decoded.designation_level || null,
      department: decoded.department || null,
      divisions: decoded.divisions || [],
      isPlatformAdmin: decoded.isPlatformAdmin || false,
      companyId: decoded.companyId || null,
      companyCode: decoded.companyCode || null
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware to check if user has specific role
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        requiredRole: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware to check if user has access to specific division
 */
function requireDivisionAccess(req, res, next) {
  const division = req.params.division || req.query.division || req.body.division;

  if (!division) {
    return res.status(400).json({ error: 'Division not specified' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admins have access to all divisions
  if (req.user.role === 'admin') {
    return next();
  }

  // Check if user has access to this division
  if (!req.user.divisions.includes(division)) {
    return res.status(403).json({ 
      error: 'Access denied to this division',
      requestedDivision: division,
      allowedDivisions: req.user.divisions
    });
  }

  next();
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = await authService.verifyToken(token);
      
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        divisions: decoded.divisions
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    logger.info('Optional auth failed:', error.message);
  }
  
  next();
}

module.exports = {
  authenticate,
  requireRole,
  requireDivisionAccess,
  optionalAuthenticate
};
