/**
 * Platform Authentication Routes
 * Handles login/logout for ProPackHub SaaS platform
 */

const express = require('express');
const router = express.Router();
const platformAuthService = require('../../services/platformAuthService');
const logger = require('../../utils/logger');

/**
 * POST /api/platform/auth/login
 * Login to platform
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await platformAuthService.login(email, password, ipAddress, userAgent);

    // Set refresh token in secure httpOnly cookie
    res.cookie('platformRefreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
      path: '/api/platform/auth/refresh'
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    logger.error('Platform login error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * GET /api/platform/auth/me
 * Get current user info (requires valid token)
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = await platformAuthService.verifyToken(token);
    const user = await platformAuthService.getCurrentUser(decoded.userId);

    res.json({ success: true, user });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * GET /api/platform/auth/companies
 * List all companies (platform admin only)
 */
router.get('/companies', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = await platformAuthService.verifyToken(token);

    if (!decoded.isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const companies = await platformAuthService.listCompanies();
    res.json({ success: true, companies });
  } catch (error) {
    logger.error('List companies error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * PUT /api/platform/auth/companies/:companyId
 * Update company details (platform admin only)
 */
router.put('/companies/:companyId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = await platformAuthService.verifyToken(token);

    if (!decoded.isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const { companyId } = req.params;
    const updates = req.body;

    const updatedCompany = await platformAuthService.updateCompany(companyId, updates);
    res.json({ success: true, company: updatedCompany });
  } catch (error) {
    logger.error('Update company error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
