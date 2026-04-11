/**
 * Role-based access middleware with OR semantics.
 * Passes when user has any required role OR satisfies an optional minimum level rule.
 */

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const normalizeRoles = (roles) => {
  if (Array.isArray(roles)) {
    return roles.map(normalizeRole).filter(Boolean);
  }
  const single = normalizeRole(roles);
  return single ? [single] : [];
};

function requireAnyRole(roles = [], options = {}) {
  const requiredRoles = normalizeRoles(roles);
  const minLevel = Number(options.minLevel);
  const minLevelRoles = normalizeRoles(options.minLevelRoles);
  const allowAdminBypass = options.allowAdminBypass !== false;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userRole = normalizeRole(req.user.role);
    const userLevel = Number(req.user.designation_level || 0);

    if (allowAdminBypass && userRole === 'admin') {
      return next();
    }

    const roleMatch = requiredRoles.includes(userRole);

    const levelEnabled = Number.isFinite(minLevel);
    const levelRoleMatch = minLevelRoles.length === 0 || minLevelRoles.includes(userRole);
    const levelMatch = levelEnabled && userLevel >= minLevel && levelRoleMatch;

    if (roleMatch || levelMatch) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      requiredRoles,
      requiredMinLevel: levelEnabled ? minLevel : null,
      requiredMinLevelRoles: minLevelRoles,
      userRole,
      userLevel,
    });
  };
}

module.exports = requireAnyRole;
module.exports.normalizeRole = normalizeRole;
