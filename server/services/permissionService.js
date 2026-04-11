/**
 * Permission Service
 * Handles permission checking and management
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

/**
 * Get all permissions for a user (including division-scoped)
 * @param {number} userId - User ID
 * @returns {Promise<{global: string[], byDivision: Object}>}
 */
async function getUserPermissions(userId) {
  try {
    const result = await authPool.query(`
      SELECT permission_key, division_code
      FROM user_permissions
      WHERE user_id = $1 AND allowed = true
    `, [userId]);

    const global = [];
    const byDivision = {};

    for (const row of result.rows) {
      if (row.division_code === null) {
        global.push(row.permission_key);
      } else {
        if (!byDivision[row.division_code]) {
          byDivision[row.division_code] = [];
        }
        byDivision[row.division_code].push(row.permission_key);
      }
    }

    return { global, byDivision };
  } catch (error) {
    logger.error('Error fetching user permissions', { userId, error: error.message });
    throw error;
  }
}

/**
 * Check if user has a specific permission
 * @param {number} userId - User ID
 * @param {string} permissionKey - Permission key to check
 * @param {string|null} division - Division code (null for global permissions)
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, permissionKey, division = null) {
  try {
    // First check if this permission exists and get its scope
    const permResult = await authPool.query(`
      SELECT scope FROM permissions WHERE key = $1 AND is_enabled = true
    `, [permissionKey]);

    if (permResult.rows.length === 0) {
      logger.warn('Permission key not found', { permissionKey });
      return false;
    }

    const scope = permResult.rows[0].scope;

    // For global-scoped permissions, check without division
    if (scope === 'global') {
      const result = await authPool.query(`
        SELECT 1 FROM user_permissions
        WHERE user_id = $1 AND permission_key = $2 AND division_code IS NULL AND allowed = true
      `, [userId, permissionKey]);
      return result.rows.length > 0;
    }

    // For division-scoped permissions, division must be provided
    if (!division) {
      logger.warn('Division required for division-scoped permission', { permissionKey });
      return false;
    }

    // Check for specific division grant OR global grant (null division = all divisions)
    const result = await authPool.query(`
      SELECT 1 FROM user_permissions
      WHERE user_id = $1 AND permission_key = $2 
        AND (division_code = $3 OR division_code IS NULL)
        AND allowed = true
    `, [userId, permissionKey, division.toUpperCase()]);

    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error checking permission', { userId, permissionKey, division, error: error.message });
    return false;
  }
}

/**
 * Get the full permission catalog (for admin UI)
 * @returns {Promise<Array>}
 */
async function getPermissionCatalog() {
  try {
    const result = await authPool.query(`
      SELECT key, label, description, group_name, scope, sort_order
      FROM permissions
      WHERE is_enabled = true
      ORDER BY group_name, sort_order, key
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching permission catalog', { error: error.message });
    throw error;
  }
}

/**
 * Get permissions for a specific user (for admin UI)
 * @param {number} userId - User ID
 * @returns {Promise<Object>}
 */
async function getUserPermissionsForAdmin(userId) {
  try {
    // Get catalog
    const catalog = await getPermissionCatalog();

    // Get user's granted permissions
    const granted = await authPool.query(`
      SELECT permission_key, division_code
      FROM user_permissions
      WHERE user_id = $1 AND allowed = true
    `, [userId]);

    // Build a lookup
    const grantedSet = new Map();
    for (const row of granted.rows) {
      const key = row.division_code ? `${row.permission_key}:${row.division_code}` : row.permission_key;
      grantedSet.set(key, true);
    }

    return {
      catalog,
      granted: granted.rows,
      grantedSet: Object.fromEntries(grantedSet),
    };
  } catch (error) {
    logger.error('Error fetching user permissions for admin', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update permissions for a user (bulk update)
 * @param {number} adminUserId - Admin performing the update
 * @param {number} targetUserId - User being updated
 * @param {Object} permissions - { global: string[], byDivision: { FP: string[], HC: string[] } }
 * @param {Object} requestInfo - { ip, userAgent }
 * @returns {Promise<Object>}
 */
async function updateUserPermissions(adminUserId, targetUserId, permissions, requestInfo = {}) {
  const client = await authPool.connect();
  
  try {
    await client.query('BEGIN');

    // Get current permissions for audit
    const currentResult = await client.query(`
      SELECT permission_key, division_code FROM user_permissions WHERE user_id = $1
    `, [targetUserId]);
    const oldPermissions = currentResult.rows;

    // Delete all current permissions for user
    await client.query('DELETE FROM user_permissions WHERE user_id = $1', [targetUserId]);

    // Insert global permissions
    const globalPerms = permissions.global || [];
    for (const key of globalPerms) {
      await client.query(`
        INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
        VALUES ($1, $2, NULL, true, $3)
        ON CONFLICT (user_id, permission_key, division_code) DO UPDATE SET allowed = true, granted_by = $3
      `, [targetUserId, key, adminUserId]);
    }

    // Insert division-scoped permissions
    const byDivision = permissions.byDivision || {};
    for (const [division, keys] of Object.entries(byDivision)) {
      for (const key of keys) {
        await client.query(`
          INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
          VALUES ($1, $2, $3, true, $4)
          ON CONFLICT (user_id, permission_key, division_code) DO UPDATE SET allowed = true, granted_by = $4
        `, [targetUserId, key, division.toUpperCase(), adminUserId]);
      }
    }

    // Log audit entry
    await client.query(`
      INSERT INTO permission_audit_log (admin_user_id, target_user_id, action, old_value, new_value, ip_address, user_agent)
      VALUES ($1, $2, 'bulk_update', $3, $4, $5, $6)
    `, [
      adminUserId,
      targetUserId,
      'bulk_update',
      JSON.stringify(oldPermissions),
      JSON.stringify(permissions),
      requestInfo.ip || null,
      requestInfo.userAgent || null,
    ]);

    await client.query('COMMIT');

    logger.info('User permissions updated', { 
      adminUserId, 
      targetUserId, 
      globalCount: globalPerms.length,
      divisionCount: Object.values(byDivision).flat().length 
    });

    return { success: true, message: 'Permissions updated successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating user permissions', { adminUserId, targetUserId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Grant admin all permissions (utility for initial setup)
 * @param {number} userId - Admin user ID
 * @returns {Promise<number>} - Number of permissions granted
 */
async function grantAllPermissionsToAdmin(userId) {
  try {
    // Get all global permissions
    const globalPerms = await authPool.query(`
      SELECT key FROM permissions WHERE scope = 'global' AND is_enabled = true
    `);

    let count = 0;
    for (const row of globalPerms.rows) {
      await authPool.query(`
        INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
        VALUES ($1, $2, NULL, true, $1)
        ON CONFLICT (user_id, permission_key, division_code) DO NOTHING
      `, [userId, row.key]);
      count++;
    }

    // Get all division-scoped permissions and grant for all divisions (via NULL = all)
    const divisionPerms = await authPool.query(`
      SELECT key FROM permissions WHERE scope = 'division' AND is_enabled = true
    `);

    for (const row of divisionPerms.rows) {
      await authPool.query(`
        INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
        VALUES ($1, $2, NULL, true, $1)
        ON CONFLICT (user_id, permission_key, division_code) DO NOTHING
      `, [userId, row.key]);
      count++;
    }

    logger.info('Granted all permissions to admin', { userId, count });
    return count;
  } catch (error) {
    logger.error('Error granting admin permissions', { userId, error: error.message });
    throw error;
  }
}

module.exports = {
  getUserPermissions,
  hasPermission,
  getPermissionCatalog,
  getUserPermissionsForAdmin,
  updateUserPermissions,
  grantAllPermissionsToAdmin,
};
