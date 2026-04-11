const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const authService = require('../services/authService');
const userService = require('../services/userService');
const outlookAuthService = require('../services/outlookAuthService');
const { pool } = require('../database/config');
const { authenticate, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for user photo uploads
const photoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/photos');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.params.userId || req.user?.id || 'unknown';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `user-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const photoFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: photoFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit for photos
});

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User email address
 *         password:
 *           type: string
 *           format: password
 *           description: User password
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         accessToken:
 *           type: string
 *           description: JWT access token
 *         expiresIn:
 *           type: string
 *           description: Token expiration time
 *         user:
 *           $ref: '#/components/schemas/User'
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         email:
 *           type: string
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [admin, manager, user]
 *         divisions:
 *           type: array
 *           items:
 *             type: string
 *         salesReps:
 *           type: array
 *           items:
 *             type: string
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - name
 *         - role
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [admin, manager, user]
 *         divisions:
 *           type: array
 *           items:
 *             type: string
 *         salesReps:
 *           type: array
 *           items:
 *             type: string
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticate user and return access token with refresh token in cookie
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *         headers:
 *           Set-Cookie:
 *             description: Refresh token cookie
 *             schema:
 *               type: string
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(email, password, ipAddress, userAgent);

    // Derive cookie maxAge from configured refresh expiry (default 60d)
    const refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '60d';
    const match = String(refreshExpiry).trim().match(/^(\d+)([smhd])$/i);
    const parseToMs = () => {
      if (!match) return 60 * 24 * 60 * 60 * 1000;
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 60 * 24 * 60 * 60 * 1000;
      }
    };
    const refreshMaxAgeMs = parseToMs();

    // Set refresh token in secure httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
      sameSite: 'strict',
      maxAge: refreshMaxAgeMs,
      path: '/api/auth/refresh' // Only send to refresh endpoint
    });

    // Return access token and user info (no refresh token in response body)
    res.json({
      success: result.success,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user
 *     description: Create a new user account (Admin only)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or user already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 */
router.post('/register', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, name, designation, divisions, salesReps } = req.body;

    if (!email || !password || !name || !designation) {
      return res.status(400).json({ 
        error: 'Email, password, name, and designation are required' 
      });
    }

    const result = await authService.registerUser({
      email,
      password,
      name,
      designation,
      divisions: divisions || [],
      salesReps: salesReps || []
    });

    res.json(result);
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Invalidate session and clear refresh token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await authService.logout(req.user.id);
    
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/admin-reset-password/{userId}:
 *   post:
 *     summary: Admin reset password
 *     description: Admin can reset any user's password without requiring old password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 */
router.post('/admin-reset-password/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    await authService.adminResetPassword(parseInt(userId), newPassword);

    res.json({ 
      success: true, 
      message: 'Password reset successfully'
      // Note: password is NOT returned in response for security
    });
  } catch (error) {
    logger.error('Admin reset password error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password
 *     description: Change the current user's password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid old password or new password requirements not met
 *       401:
 *         description: Unauthorized
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Old password and new password are required' 
      });
    }

    await authService.changePassword(req.user.id, oldPassword, newPassword);

    res.json({ 
      success: true, 
      message: 'Password changed successfully. Please login again.' 
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Retrieve the currently authenticated user's information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Check if this is a platform user
    if (req.user.isPlatformAdmin || req.user.companyId) {
      // Platform user - get from platform database
      const platformAuthService = require('../services/platformAuthService');
      const user = await platformAuthService.getCurrentUser(req.user.id);
      return res.json({ success: true, user });
    }

    // Legacy user - get from auth database
    const user = await authService.getUserById(req.user.id);
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get a new access token using the refresh token from cookie
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: New access token generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                 expiresIn:
 *                   type: string
 *       401:
 *         description: No refresh token or invalid token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        error: 'No refresh token provided' 
      });
    }

    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (error) {
    logger.error('Refresh token error:', error);
    
    // Clear invalid refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });
    
    res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired refresh token',
      requireLogin: true
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify token validity
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const decoded = await authService.verifyToken(token);
    res.json({ success: true, valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ success: false, valid: false, error: error.message });
  }
});

/**
 * GET /api/auth/users
 * Get all users (Admin only)
 */
router.get('/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/users/:id
 * Get user by ID (Admin only)
 */
router.get('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await userService.getUserById(userId);
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/users/:id
 * Update user (Admin only)
 */
router.put('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updates = req.body;

    const user = await userService.updateUser(userId, updates);
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/users/:id
 * Delete user (Admin only)
 */
router.delete('/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await userService.deleteUser(userId);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/profile
 * Update current user's profile
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const updates = req.body;
    const user = await userService.updateProfile(req.user.id, updates);
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/preferences
 * Get current user's preferences
 */
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const preferences = await userService.getPreferences(req.user.id);
    res.json({ success: true, preferences });
  } catch (error) {
    logger.error('Get preferences error:', error);
    // Graceful fallback: do not block app boot if preferences store is unavailable.
    res.json({
      success: true,
      degraded: true,
      preferences: {
        period_selection: null,
        base_period_index: null,
        chart_visible_columns: null,
        theme: null,
        timezone: null,
        language: null,
        notifications_enabled: null,
        default_division: null,
        theme_settings: null,
      },
    });
  }
});

/**
 * PUT /api/auth/preferences
 * Update current user's preferences (including period selection)
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const preferences = req.body;
    const updated = await userService.updatePreferences(req.user.id, preferences);
    res.json({ success: true, preferences: updated });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/global-theme-defaults
 * Get global theme defaults for all users (set by admin)
 */
router.get('/global-theme-defaults', authenticate, async (req, res) => {
  try {
    const defaults = await userService.getGlobalThemeDefaults();
    res.json({ success: true, defaults: defaults || null });
  } catch (error) {
    logger.error('Get global theme defaults error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/global-theme-defaults
 * Set global theme defaults (admin only)
 */
router.put('/global-theme-defaults', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const themeSettings = req.body;
    const updated = await userService.setGlobalThemeDefaults(themeSettings, req.user.id);
    res.json({ success: true, defaults: updated });
  } catch (error) {
    logger.error('Set global theme defaults error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== ROLES MANAGEMENT =====================

/**
 * GET /api/auth/roles
 * Get all roles
 */
router.get('/roles', authenticate, async (req, res) => {
  try {
    const roles = await userService.getRoles();
    res.json({ success: true, roles });
  } catch (error) {
    logger.error('Get roles error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/roles
 * Create a new role (admin only)
 */
router.post('/roles', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { value, label, color, department } = req.body;
    if (!value || !label) {
      return res.status(400).json({ error: 'Value and label are required' });
    }
    const role = await userService.createRole({ value, label, color, department });
    res.json({ success: true, role });
  } catch (error) {
    logger.error('Create role error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/roles/:value
 * Update a role (admin only)
 */
router.put('/roles/:value', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { value } = req.params;
    const updates = req.body;
    const role = await userService.updateRole(value, updates);
    res.json({ success: true, role });
  } catch (error) {
    logger.error('Update role error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/roles/:value
 * Delete a role (admin only, system roles cannot be deleted)
 */
router.delete('/roles/:value', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { value } = req.params;
    await userService.deleteRole(value);
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/users/:userId/photo
 * Upload user profile photo
 */
router.post('/users/:userId/photo', authenticate, uploadPhoto.single('photo'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admin or the user themselves can upload their photo
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Not authorized to update this user\'s photo' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }
    
    // Build the photo URL
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    
    // Update user's photo_url in database
    await userService.updateUserPhoto(userId, photoUrl);
    
    logger.info(`Photo uploaded for user ${userId}: ${photoUrl}`);
    
    res.json({ 
      success: true, 
      photoUrl,
      message: 'Photo uploaded successfully' 
    });
  } catch (error) {
    logger.error('Photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/users/:userId/photo
 * Remove user profile photo
 */
router.delete('/users/:userId/photo', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admin or the user themselves can delete their photo
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this user\'s photo' });
    }
    
    // Get current photo URL to delete the file
    const user = await userService.getUserById(userId);
    if (user?.photo_url) {
      const filePath = path.join(__dirname, '..', user.photo_url);
      try {
        await fs.unlink(filePath);
        logger.info(`Photo file deleted: ${filePath}`);
      } catch (err) {
        // File might not exist, continue anyway
        logger.warn(`Could not delete photo file: ${err.message}`);
      }
    }
    
    // Clear photo_url in database
    await userService.updateUserPhoto(userId, null);
    
    res.json({ success: true, message: 'Photo removed' });
  } catch (error) {
    logger.error('Photo delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== OUTLOOK OAUTH =====================

async function ensureOutlookTableReady() {
  const check = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'crm_outlook_connections'
     ) AS ok`
  );
  return !!check.rows[0]?.ok;
}

/**
 * GET /api/auth/outlook/connect
 * Returns Microsoft authorization URL with signed state.
 */
router.get('/outlook/connect', authenticate, async (req, res) => {
  try {
    const ready = await ensureOutlookTableReady();
    if (!ready) {
      return res.status(503).json({ success: false, error: 'Outlook tables are not migrated yet' });
    }

    if (!outlookAuthService.isAzureConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Outlook integration is not yet configured. Azure App Registration pending.',
        azure_configured: false,
      });
    }

    const auth = outlookAuthService.getAuthUrl(req.user.id);
    res.json({ success: true, url: auth.url });
  } catch (error) {
    logger.error('Outlook connect error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to initialize Outlook connect' });
  }
});

/**
 * GET /api/auth/outlook/callback
 * OAuth callback endpoint for Microsoft authorization code flow.
 */
router.get('/outlook/callback', async (req, res) => {
  try {
    if (!outlookAuthService.isAzureConfigured()) {
      return res.redirect('/crm?outlook_error=not_configured');
    }

    const { code, state, error, error_description } = req.query;

    if (error) {
      const msg = error_description || error;
      return res.status(400).send(`<html><body><script>window.opener && window.opener.postMessage({source:'outlook-oauth',success:false,error:${JSON.stringify(msg)}}, '*');window.close();</script>Outlook connect failed: ${msg}</body></html>`);
    }

    if (!code || !state) {
      return res.status(400).json({ success: false, error: 'Missing code/state in callback' });
    }

    const decoded = outlookAuthService.verifyStateToken(state);

    const tokenResponse = await outlookAuthService.exchangeCodeForTokens(code);
    const profile = await outlookAuthService.fetchGraphProfile(tokenResponse.access_token);
    await outlookAuthService.upsertConnection(decoded.userId, tokenResponse, profile);

    // Optional Phase 3b hook: create Graph webhook subscription when webhook URL is configured.
    await outlookAuthService.createWebhookSubscription(decoded.userId, tokenResponse.access_token).catch((subscriptionError) => {
      logger.warn('Outlook webhook subscription not created during callback', {
        userId: decoded.userId,
        error: subscriptionError.message,
      });
      return null;
    });

    return res.send(`<html><body><script>window.opener && window.opener.postMessage({source:'outlook-oauth',success:true}, '*');window.close();</script>Outlook connected. You can close this window.</body></html>`);
  } catch (error) {
    logger.error('Outlook callback error:', error);
    const msg = error.message || 'Outlook callback failed';
    return res.status(500).send(`<html><body><script>window.opener && window.opener.postMessage({source:'outlook-oauth',success:false,error:${JSON.stringify(msg)}}, '*');window.close();</script>${msg}</body></html>`);
  }
});

/**
 * GET /api/auth/outlook/status
 * Returns connection status for the logged-in user.
 */
router.get('/outlook/status', authenticate, async (req, res) => {
  try {
    const azureConfigured = outlookAuthService.isAzureConfigured();
    const ready = await ensureOutlookTableReady();
    if (!ready) {
      return res.json({ success: true, connected: false, status: 'not_migrated', azure_configured: azureConfigured });
    }

    const status = await outlookAuthService.getConnectionStatus(req.user.id);
    res.json({ success: true, ...status, azure_configured: azureConfigured });
  } catch (error) {
    logger.error('Outlook status error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get Outlook status' });
  }
});

/**
 * DELETE /api/auth/outlook/disconnect
 * Removes saved Outlook connection/tokens for the logged-in user.
 */
router.delete('/outlook/disconnect', authenticate, async (req, res) => {
  try {
    const ready = await ensureOutlookTableReady();
    if (!ready) {
      return res.json({ success: true, disconnected: true });
    }

    const removed = await outlookAuthService.disconnectOutlook(req.user.id);
    res.json({ success: true, disconnected: removed });
  } catch (error) {
    logger.error('Outlook disconnect error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to disconnect Outlook' });
  }
});

module.exports = router;
