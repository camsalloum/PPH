/**
 * Permissions API Routes
 * Manages user permissions (admin only for updates)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getPermissionCatalog,
  getUserPermissions,
  getUserPermissionsForAdmin,
  updateUserPermissions,
} = require('../services/permissionService');
const { authPool } = require('../database/config');
const logger = require('../utils/logger');

/**
 * GET /api/permissions/catalog
 * Get the full permission catalog (all available permissions)
 * Accessible by authenticated users
 */
router.get('/catalog', authenticate, async (req, res) => {
  try {
    const catalog = await getPermissionCatalog();
    
    // Group by group_name for easier frontend rendering
    const grouped = {};
    for (const perm of catalog) {
      if (!grouped[perm.group_name]) {
        grouped[perm.group_name] = [];
      }
      grouped[perm.group_name].push(perm);
    }

    res.json({
      success: true,
      catalog,
      grouped,
      total: catalog.length,
    });
  } catch (error) {
    logger.error('Error fetching permission catalog', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch permission catalog' });
  }
});

/**
 * GET /api/permissions/my
 * Get current user's permissions
 */
router.get('/my', authenticate, async (req, res) => {
  try {
    const permissions = await getUserPermissions(req.user.id);
    
    // For admin, indicate they have all permissions
    if (req.user.role === 'admin') {
      permissions.isAdmin = true;
    }

    res.json({
      success: true,
      permissions,
    });
  } catch (error) {
    logger.error('Error fetching user permissions', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * GET /api/permissions/user/:userId
 * Get permissions for a specific user (admin only)
 */
router.get('/user/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Verify user exists
    const userResult = await authPool.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const data = await getUserPermissionsForAdmin(userId);

    res.json({
      success: true,
      user: userResult.rows[0],
      ...data,
    });
  } catch (error) {
    logger.error('Error fetching user permissions for admin', { 
      targetUserId: req.params.userId, 
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

/**
 * PUT /api/permissions/user/:userId
 * Update permissions for a specific user (admin only)
 * Body: { global: ['perm1', 'perm2'], byDivision: { FP: ['perm3'], HC: ['perm4'] } }
 */
router.put('/user/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Prevent admin from modifying their own permissions (safety)
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own permissions' });
    }

    // Verify user exists
    const userResult = await authPool.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate request body
    const { global = [], byDivision = {} } = req.body;
    if (!Array.isArray(global)) {
      return res.status(400).json({ error: 'global must be an array' });
    }
    if (typeof byDivision !== 'object') {
      return res.status(400).json({ error: 'byDivision must be an object' });
    }

    const requestInfo = {
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
    };

    const result = await updateUserPermissions(
      req.user.id,
      userId,
      { global, byDivision },
      requestInfo
    );

    logger.info('User permissions updated', {
      adminId: req.user.id,
      targetUserId: userId,
      globalCount: global.length,
      divisionCount: Object.values(byDivision).flat().length,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error updating user permissions', { 
      adminId: req.user.id,
      targetUserId: req.params.userId, 
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to update user permissions' });
  }
});

/**
 * GET /api/permissions/audit/:userId
 * Get permission audit log for a user (admin only)
 */
router.get('/audit/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const result = await authPool.query(`
      SELECT 
        pal.id,
        pal.action,
        pal.old_value,
        pal.new_value,
        pal.created_at,
        pal.ip_address,
        admin_user.name as admin_name,
        admin_user.email as admin_email
      FROM permission_audit_log pal
      LEFT JOIN users admin_user ON admin_user.id = pal.admin_user_id
      WHERE pal.target_user_id = $1
      ORDER BY pal.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      audit: result.rows,
    });
  } catch (error) {
    logger.error('Error fetching permission audit log', { 
      targetUserId: req.params.userId, 
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
