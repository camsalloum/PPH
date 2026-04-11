/**
 * Platform Authentication Service
 * Handles authentication for ProPackHub SaaS platform users
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const poolManager = require('../database/multiTenantPool');

class PlatformAuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '60d';
  }

  /**
   * Get platform pool
   */
  getPlatformPool() {
    return poolManager.platformPool;
  }

  /**
   * Login platform user
   */
  async login(email, password, ipAddress, userAgent) {
    const platformPool = this.getPlatformPool();
    
    try {
      // Get user with password hash and company info
      const userResult = await platformPool.query(
        `SELECT 
           u.user_id, u.email, u.password_hash, u.display_name, u.role,
           u.is_active, u.is_platform_admin, u.company_id,
           c.company_code, c.company_name, c.is_active as company_active
         FROM platform_users u
         LEFT JOIN companies c ON u.company_id = c.company_id
         WHERE u.email = $1`,
        [email.toLowerCase()]
      );

      if (userResult.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = userResult.rows[0];

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is deactivated. Please contact administrator.');
      }

      // Check if company is active (if user belongs to a company)
      if (user.company_id && !user.company_active) {
        throw new Error('Company account is suspended. Please contact support.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Get user's divisions if they belong to a company
      let divisions = [];
      if (user.company_id) {
        const divResult = await platformPool.query(
          `SELECT cd.division_code, cd.division_name, cd.database_name
           FROM user_roles ur
           JOIN company_divisions cd ON ur.division_id = cd.division_id
           WHERE ur.user_id = $1`,
          [user.user_id]
        );
        divisions = divResult.rows;
      }

      // Generate access token
      const accessToken = jwt.sign(
        {
          userId: user.user_id,
          email: user.email,
          role: user.role,
          isPlatformAdmin: user.is_platform_admin,
          companyId: user.company_id,
          companyCode: user.company_code,
          type: 'platform_access'
        },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          userId: user.user_id,
          email: user.email,
          type: 'platform_refresh'
        },
        this.refreshSecret,
        { expiresIn: this.refreshTokenExpiry }
      );

      // Store session
      await platformPool.query(
        `INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '60 days')`,
        [user.user_id, await bcrypt.hash(accessToken, 5), await bcrypt.hash(refreshToken, 5), ipAddress, userAgent]
      );

      // Log audit
      await platformPool.query(
        `INSERT INTO platform_audit_log (entity_type, entity_id, action, user_id, new_values)
         VALUES ('platform_user', $1, 'LOGIN', $2, $3)`,
        [user.user_id, user.user_id, JSON.stringify({ ip: ipAddress, userAgent })]
      );

      return {
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.user_id,
          email: user.email,
          name: user.display_name,
          role: user.role,
          isPlatformAdmin: user.is_platform_admin,
          company: user.company_id ? {
            id: user.company_id,
            code: user.company_code,
            name: user.company_name
          } : null,
          divisions: divisions
        }
      };
    } catch (error) {
      logger.error('Platform login error:', error);
      throw error;
    }
  }

  /**
   * Verify platform access token
   * Accepts both 'access' (from main auth) and 'platform_access' (legacy) token types
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Accept both token types - platform users can login via main auth endpoint
      if (decoded.type !== 'platform_access' && decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Get current user details
   */
  async getCurrentUser(userId) {
    const platformPool = this.getPlatformPool();
    
    const result = await platformPool.query(
      `SELECT 
         u.user_id, u.email, u.display_name, u.role, u.phone,
         u.is_active, u.is_platform_admin, u.company_id, u.created_at,
         c.company_code, c.company_name
       FROM platform_users u
       LEFT JOIN companies c ON u.company_id = c.company_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    // Get divisions for company users
    let divisions = [];
    if (user.company_id) {
      const divResult = await platformPool.query(
        `SELECT cd.division_code, cd.division_name, cd.database_name
         FROM user_roles ur
         JOIN company_divisions cd ON ur.division_id = cd.division_id
         WHERE ur.user_id = $1`,
        [userId]
      );
      divisions = divResult.rows;
    }

    return {
      id: user.user_id,
      email: user.email,
      name: user.display_name,
      role: user.role,
      phone: user.phone,
      isPlatformAdmin: user.is_platform_admin,
      isActive: user.is_active,
      createdAt: user.created_at,
      company: user.company_id ? {
        id: user.company_id,
        code: user.company_code,
        name: user.company_name
      } : null,
      divisions: divisions
    };
  }

  /**
   * List all companies (platform admin only)
   */
  async listCompanies() {
    const platformPool = this.getPlatformPool();
    
    const result = await platformPool.query(
      `SELECT 
         c.company_id, 
         c.company_code, 
         c.company_name, 
         c.country,
         c.email,
         c.phone,
         c.timezone,
         c.currency_code,
         c.subscription_status,
         c.is_active,
         c.created_at, 
         c.plan_id,
         sp.plan_name,
         -- Use REPORTED metrics (pushed by tenant via API)
         c.reported_division_count as division_count,
         c.reported_user_count as user_count,
         c.metrics_last_reported_at
       FROM companies c
       LEFT JOIN subscription_plans sp ON c.plan_id = sp.plan_id
       ORDER BY c.company_name`
    );

    return result.rows;
  }

  /**
   * Update company details (platform admin only)
   */
  async updateCompany(companyId, updates) {
    const platformPool = this.getPlatformPool();
    
    // Allowed fields to update
    const allowedFields = [
      'company_name', 'country', 'email', 'phone', 
      'timezone', 'currency_code', 'is_active', 'subscription_status',
      'address_line1', 'address_line2', 'city', 'state', 'postal_code',
      'website', 'logo_url'
    ];

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(companyId);

    const query = `
      UPDATE companies 
      SET ${updateFields.join(', ')}
      WHERE company_id = $${paramIndex}
      RETURNING *
    `;

    const result = await platformPool.query(query, values);
    return result.rows[0];
  }
}

module.exports = new PlatformAuthService();
