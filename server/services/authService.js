const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const { authPool } = require('../database/config');
const poolManager = require('../database/multiTenantPool');

class AuthService {
  constructor() {
    // JWT secrets from env, fallback for development only
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
    
    // Access token: configurable (default 15 minutes)
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';

    // Refresh token: configurable (default 60 days)
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '60d';

    // Convert configured expiry values to milliseconds
    this.accessTokenExpiryMs = this.parseExpiryToMs(this.accessTokenExpiry);
    this.refreshTokenExpiryMs = this.parseExpiryToMs(this.refreshTokenExpiry);

    // Fail-fast guard for platform DB calls during login flow.
    // Keeps legacy login responsive even if platform DB is slow.
    this.platformQueryTimeoutMs = Number(process.env.AUTH_PLATFORM_QUERY_TIMEOUT_MS || 2000);
  }

  /**
   * Execute a query with a hard timeout.
   */
  async queryWithTimeout(promise, timeoutMs, label = 'query') {
    let timeoutHandle;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  /**
   * Parse expiry strings like "15m", "60d" into milliseconds.
   */
  parseExpiryToMs(expiresIn) {
    if (!expiresIn) return 15 * 60 * 1000;
    if (typeof expiresIn === 'number') return expiresIn;

    const match = String(expiresIn).trim().match(/^(\d+)([smhd])$/i);
    if (!match) return 15 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 15 * 60 * 1000;
    }
  }

  /**
   * Register a new user (Admin only action)
   */
  async registerUser({ email, password, name, designation, divisions = [], salesReps = [] }) {
    try {
      // Validate email format
      if (!this.validateEmail(email)) {
        throw new Error('Invalid email format');
      }

      // Validate password strength
      if (!this.validatePassword(password)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
      }

      // Check if user already exists
      const existingUser = await authPool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Get access_level and id from designation
      const designationResult = await authPool.query(
        'SELECT id, access_level, department FROM designations WHERE name = $1',
        [designation]
      );
      const designationRow = designationResult.rows[0];
      if (!designationRow) {
        throw new Error('Invalid designation selected');
      }
      if (!designationRow.access_level) {
        throw new Error('Selected designation is missing access level mapping');
      }

      const designationId = designationRow.id;
      const accessLevel = designationRow.access_level;
      const normalizedDivisions = this.normalizeDivisionCodes(divisions);
      const assignedDivisions = accessLevel === 'admin'
        ? []
        : await this.resolveAssignedDivisions(normalizedDivisions);

      // Start transaction
      const client = await authPool.connect();
      try {
        await client.query('BEGIN');

        // Insert user with designation_id and derived role (access_level)
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, name, role, designation, designation_id, initial_password) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id, email, name, role, designation, created_at`,
          [email.toLowerCase(), passwordHash, name, accessLevel, designation, designationId, password]
        );

        const user = userResult.rows[0];

        // Insert divisions for non-admin users
        if (accessLevel !== 'admin' && assignedDivisions.length > 0) {
          for (const division of assignedDivisions) {
            await client.query(
              'INSERT INTO user_divisions (user_id, division) VALUES ($1, $2)',
              [user.id, division]
            );
          }
        }

        const nameParts = (name || '').trim().split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || name;
        const lastName = nameParts.slice(1).join(' ') || null;

        const codeResult = await client.query(`
          SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INTEGER)), 0) + 1 AS next_code
          FROM employees WHERE employee_code LIKE 'EMP%'
        `);
        const nextCode = codeResult.rows[0]?.next_code || 1;
        const employeeCode = `EMP${String(nextCode).padStart(4, '0')}`;

        const employeeDepartment = designationRow.department || this.inferDepartmentFromRole(accessLevel);

        const employeeResult = await client.query(
          `INSERT INTO employees (
            user_id, employee_code, first_name, last_name, personal_email,
            designation_id, department, date_of_joining, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, 'Active')
          RETURNING id`,
          [
            user.id,
            employeeCode,
            firstName,
            lastName,
            email.toLowerCase(),
            designationId,
            employeeDepartment,
          ]
        );

        const employeeId = employeeResult.rows[0].id;

        await client.query(
          'UPDATE users SET employee_id = $1 WHERE id = $2',
          [employeeId, user.id]
        );

        if (assignedDivisions.length > 0) {
          for (let index = 0; index < assignedDivisions.length; index++) {
            await client.query(
              `INSERT INTO employee_divisions (employee_id, division_code, is_primary)
               VALUES ($1, $2, $3)
               ON CONFLICT (employee_id, division_code) DO NOTHING`,
              [employeeId, assignedDivisions[index], index === 0]
            );
          }
        }

        // Insert sales rep access for managers
        if (['manager', 'admin'].includes(accessLevel) && salesReps.length > 0) {
          for (const rep of salesReps) {
            await client.query(
              'INSERT INTO user_sales_rep_access (manager_id, sales_rep_name, division) VALUES ($1, $2, $3)',
              [user.id, rep.name, rep.division]
            );
          }
        }

        // Create default user preferences
        await client.query(
          `INSERT INTO user_preferences (user_id) VALUES ($1)`,
          [user.id]
        );

        await client.query('COMMIT');

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            designation: user.designation,
            createdAt: user.created_at
          }
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  normalizeDivisionCodes(divisions = []) {
    if (!Array.isArray(divisions)) return [];
    const cleaned = divisions
      .map((division) => String(division || '').trim().toUpperCase())
      .filter(Boolean);
    return [...new Set(cleaned)];
  }

  async resolveAssignedDivisions(divisions = []) {
    if (divisions.length > 0) return divisions;
    const settingsResult = await authPool.query(
      `SELECT setting_value FROM company_settings WHERE setting_key = 'divisions' LIMIT 1`
    );
    const configured = settingsResult.rows[0]?.setting_value;
    if (!Array.isArray(configured)) return [];
    const codes = configured
      .map((entry) => String(entry?.code || '').trim().toUpperCase())
      .filter(Boolean);
    return codes.length > 0 ? [codes[0]] : [];
  }

  inferDepartmentFromRole(role) {
    const mapping = {
      qc_lab: 'QC',
      qc_manager: 'QC',
      quality_control: 'QC',
      sales_rep: 'Sales',
      sales_executive: 'Sales',
      sales_coordinator: 'Sales',
      sales_manager: 'Sales',
      production_manager: 'Production',
      operator: 'Production',
      accountant: 'Accounts',
      accounts_manager: 'Accounts',
      logistics_manager: 'Logistics',
      stores_keeper: 'Logistics',
      admin: 'Management',
      manager: 'Management',
    };
    return mapping[role] || 'General';
  }

  /**
   * Get divisions for user (admin gets all from company_settings, others from user_divisions)
   */
  async getDivisionsForUser(userId, userRole) {
    if (userRole === 'admin') {
      // Admin has access to all divisions - fetch from company_settings
      const settingsResult = await authPool.query(
        `SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'`
      );
      if (settingsResult.rows.length > 0) {
        const divisionList = settingsResult.rows[0].setting_value;
        return divisionList.map(d => d.code);
      }
      return [];
    } else {
      // Regular users - fetch from user_divisions
      const divisionsResult = await authPool.query(
        'SELECT division FROM user_divisions WHERE user_id = $1',
        [userId]
      );
      return divisionsResult.rows.map(row => row.division);
    }
  }

  /**
   * Check company subscription status from platform database
   * Throws error if company is suspended/cancelled/inactive
   */
  async checkCompanySubscription() {
    try {
      const platformPool = poolManager.platformPool;
      if (!platformPool) {
        // Platform not available - skip check (legacy mode)
        return;
      }

      // Dynamically determine company based on auth database name
      // The auth database name is configured in .env or defaults to ip_auth_database
      const authDbName = process.env.AUTH_DB_NAME || 'ip_auth_database';
      
      const companyResult = await this.queryWithTimeout(
        platformPool.query(
          `SELECT company_code, is_active, subscription_status 
           FROM companies 
           WHERE auth_database_name = $1`,
          [authDbName]
        ),
        this.platformQueryTimeoutMs,
        'checkCompanySubscription'
      );

      if (companyResult.rows.length === 0) {
        // Company not found in platform - skip check (legacy mode)
        return;
      }

      const company = companyResult.rows[0];

      // Check company status
      if (!company.is_active) {
        throw new Error('Your company account is inactive. Please contact support.');
      }
      if (company.subscription_status === 'suspended') {
        throw new Error('Your company subscription is suspended. Please contact billing.');
      }
      if (company.subscription_status === 'cancelled') {
        throw new Error('Your company subscription has been cancelled. Please contact support.');
      }
    } catch (error) {
      // Re-throw subscription errors
      if (error.message.includes('subscription') || error.message.includes('company')) {
        throw error;
      }
      // Ignore other errors (platform DB connection issues, etc)
      logger.warn('[Auth] Could not check company subscription status:', error.message);
    }
  }

  /**
   * Login user
   * Checks platform_users first (SaaS platform), then falls back to legacy users table
   */
  async login(email, password, ipAddress, userAgent) {
    try {
      // First, try platform_users (SaaS platform - propackhub_platform database)
      const platformResult = await this.tryPlatformLogin(email, password, ipAddress, userAgent);
      if (platformResult) {
        return platformResult;
      }

      // Fall back to legacy users table (ip_auth_database)
      // Get user with password hash
      const userResult = await authPool.query(
        `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.photo_url, u.is_active,
                COALESCE(d.name, u.designation) as designation,
                d.level as designation_level,
                COALESCE(
                  e.department,
                  d.department,
                  CASE
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%qc%' OR COALESCE(d.name, u.designation, '') ILIKE '%quality%' THEN 'QC'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%production%' THEN 'Production'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%account%' OR COALESCE(d.name, u.designation, '') ILIKE '%finance%' THEN 'Accounts'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%logistic%' OR COALESCE(d.name, u.designation, '') ILIKE '%store%' THEN 'Logistics'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%sales%' THEN 'Sales'
                    WHEN u.role IN ('quality_control', 'qc_manager', 'qc_lab') THEN 'QC'
                    WHEN u.role IN ('production_manager', 'operator') THEN 'Production'
                    WHEN u.role IN ('accounts_manager', 'accountant') THEN 'Accounts'
                    WHEN u.role IN ('logistics_manager', 'stores_keeper') THEN 'Logistics'
                    WHEN u.role IN ('sales_rep', 'sales_executive', 'sales_coordinator', 'sales_manager') THEN 'Sales'
                    ELSE NULL
                  END
                ) as department
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN designations d ON e.designation_id = d.id
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

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Check company subscription status from platform database (if exists)
      await this.checkCompanySubscription();

      // Get user divisions
      const divisions = await this.getDivisionsForUser(user.id, user.role);

      // Get user preferences
      const prefsResult = await authPool.query(
        'SELECT period_selection, base_period_index, theme, timezone FROM user_preferences WHERE user_id = $1',
        [user.id]
      );
      const preferences = prefsResult.rows[0] || {};

      // Generate access token (short-lived, 15 minutes)
      const accessToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          designation: user.designation || null,
          designation_level: user.designation_level || null,
          department: user.department || null,
          divisions: divisions,
          type: 'access'
        },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      // Generate refresh token (long-lived, 60 days)
      const refreshToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          type: 'refresh'
        },
        this.refreshSecret,
        { expiresIn: this.refreshTokenExpiry }
      );

      // Store refresh token session (NO IDLE TIMEOUT - only expires after 60 days)
      const expiresAt = new Date(Date.now() + this.refreshTokenExpiryMs);
      const tokenHash = await bcrypt.hash(refreshToken, 10);
      
      await authPool.query(
        `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at, last_activity)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [user.id, tokenHash, ipAddress, userAgent, expiresAt]
      );

      return {
        success: true,
        accessToken,
        refreshToken,
        expiresIn: Math.floor(this.accessTokenExpiryMs / 1000),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          designation: user.designation,
          designation_level: user.designation_level || null,
          department: user.department,
          photoUrl: user.photo_url,
          divisions: divisions,
          preferences: preferences
        }
      };
    } catch (error) {
      logger.error('Error logging in:', error);
      throw error;
    }
  }

  /**
   * Try to login via platform_users table (SaaS platform)
   * Returns null if user not found, otherwise returns login result
   */
  async tryPlatformLogin(email, password, ipAddress, userAgent) {
    try {
      const platformPool = poolManager.platformPool;
      if (!platformPool) {
        return null; // Platform pool not initialized
      }

      // Check platform_users
      const userResult = await this.queryWithTimeout(
        platformPool.query(
          `SELECT 
             u.user_id, u.email, u.password_hash, u.display_name, u.role,
             u.is_active, u.is_platform_admin, u.company_id,
             c.company_code, c.company_name, c.database_name,
             c.is_active as company_is_active, c.subscription_status
           FROM platform_users u
           LEFT JOIN companies c ON u.company_id = c.company_id
           WHERE u.email = $1`,
          [email.toLowerCase()]
        ),
        this.platformQueryTimeoutMs,
        'tryPlatformLogin:userLookup'
      );

      if (userResult.rows.length === 0) {
        return null; // User not in platform, try legacy
      }

      const user = userResult.rows[0];

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is deactivated. Please contact administrator.');
      }

      // Check company subscription status (unless platform admin)
      if (user.company_id && !user.is_platform_admin) {
        if (!user.company_is_active) {
          throw new Error('Your company account is inactive. Please contact support.');
        }
        if (user.subscription_status === 'suspended') {
          throw new Error('Your company subscription is suspended. Please contact billing.');
        }
        if (user.subscription_status === 'cancelled') {
          throw new Error('Your company subscription has been cancelled. Please contact support.');
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Get user's divisions if they belong to a company
      let divisions = [];
      if (user.company_id) {
        const divResult = await this.queryWithTimeout(
          platformPool.query(
            `SELECT division_code FROM company_divisions WHERE company_id = $1`,
            [user.company_id]
          ),
          this.platformQueryTimeoutMs,
          'tryPlatformLogin:divisionsLookup'
        );
        divisions = divResult.rows.map(r => r.division_code);
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
          divisions: divisions,
          type: 'access'
        },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          userId: user.user_id,
          email: user.email,
          type: 'refresh'
        },
        this.refreshSecret,
        { expiresIn: this.refreshTokenExpiry }
      );

      // Store session in platform database
      const expiresAt = new Date(Date.now() + this.refreshTokenExpiryMs);
      await this.queryWithTimeout(
        platformPool.query(
          `INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.user_id, await bcrypt.hash(accessToken, 5), await bcrypt.hash(refreshToken, 5), ipAddress, userAgent, expiresAt]
        ),
        this.platformQueryTimeoutMs,
        'tryPlatformLogin:insertSession'
      );

      // Log audit
      await this.queryWithTimeout(
        platformPool.query(
          `INSERT INTO platform_audit_log (entity_type, entity_id, action, user_id, new_values)
           VALUES ('platform_user', $1, 'LOGIN', $2, $3)`,
          [user.user_id, user.user_id, JSON.stringify({ ip: ipAddress })]
        ),
        this.platformQueryTimeoutMs,
        'tryPlatformLogin:auditLog'
      );

      logger.info(`Platform login successful for ${email} (isPlatformAdmin: ${user.is_platform_admin})`);

      return {
        success: true,
        accessToken,
        refreshToken,
        expiresIn: Math.floor(this.accessTokenExpiryMs / 1000),
        user: {
          id: user.user_id,
          email: user.email,
          name: user.display_name,
          role: user.role,
          isPlatformAdmin: user.is_platform_admin,
          company: user.company_id ? {
            id: user.company_id,
            code: user.company_code,
            name: user.company_name,
            database: user.database_name
          } : null,
          divisions: divisions,
          preferences: {}
        }
      };
    } catch (error) {
      // If it's an auth error (wrong password, deactivated), throw it
      if (error.message.includes('password') || error.message.includes('deactivated')) {
        throw error;
      }
      // Otherwise, log and return null to try legacy auth
      logger.warn('Platform auth error, falling back to legacy:', error.message);
      return null;
    }
  }

  /**
   * Verify access token (used for API requests)
   * Note: Access tokens are self-contained and signed, so we only verify the signature
   * and token type. The session check is only done when refreshing tokens.
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Verify refresh token and generate new access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Verify refresh token exists in database and is not expired
      const tokenHash = await bcrypt.hash(refreshToken, 10);
      const sessionResult = await authPool.query(
        `SELECT s.id, s.user_id, u.email, u.role, u.is_active,
                COALESCE(d.name, u.designation) as designation,
                d.level as designation_level,
                COALESCE(
                  e.department,
                  d.department,
                  CASE
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%qc%' OR COALESCE(d.name, u.designation, '') ILIKE '%quality%' THEN 'QC'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%production%' THEN 'Production'
                    WHEN u.role IN ('quality_control', 'qc_manager', 'qc_lab') THEN 'QC'
                    WHEN u.role IN ('production_manager', 'operator') THEN 'Production'
                    WHEN u.role IN ('sales_rep', 'sales_executive', 'sales_coordinator', 'sales_manager') THEN 'Sales'
                    ELSE NULL
                  END
                ) as department
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN designations d ON e.designation_id = d.id
         WHERE s.user_id = $1 AND s.expires_at > NOW()
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [decoded.userId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Session expired or invalid');
      }

      const session = sessionResult.rows[0];

      // Check if user is still active
      if (!session.is_active) {
        throw new Error('Account is deactivated');
      }

      // Get user divisions
      const divisions = await this.getDivisionsForUser(session.user_id, session.role);

      // Update last activity timestamp (optional keep-alive)
      await authPool.query(
        'UPDATE user_sessions SET last_activity = NOW() WHERE id = $1',
        [session.id]
      );

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          userId: session.user_id,
          email: session.email,
          role: session.role,
          designation: session.designation || null,
          designation_level: session.designation_level || null,
          department: session.department || null,
          divisions: divisions,
          type: 'access'
        },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      return {
        success: true,
        accessToken: newAccessToken,
        expiresIn: Math.floor(this.accessTokenExpiryMs / 1000)
      };
    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user - removes ALL sessions for this user
   */
  async logout(userId) {
    try {
      await authPool.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
      );
      return { success: true };
    } catch (error) {
      logger.error('Error logging out:', error);
      throw error;
    }
  }

  /**
   * Logout from specific device/session
   */
  async logoutSession(userId, refreshToken) {
    try {
      // For more granular control, could verify token hash
      // For now, delete specific session by user
      await authPool.query(
        'DELETE FROM user_sessions WHERE user_id = $1 AND id = (SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY last_activity DESC LIMIT 1)',
        [userId]
      );
      return { success: true };
    } catch (error) {
      logger.error('Error logging out session:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(userId, oldPassword, newPassword) {
    try {
      // Get current password hash
      const userResult = await authPool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Verify old password
      const isPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      if (!this.validatePassword(newPassword)) {
        throw new Error('New password must be at least 8 characters with uppercase, lowercase, and number');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await authPool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Invalidate all sessions
      await authPool.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
      );

      return { success: true };
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Admin reset password - sets new password without requiring old one
   */
  async adminResetPassword(userId, newPassword) {
    try {
      // Check user exists
      const userResult = await authPool.query(
        'SELECT id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      // Validate new password (relax validation for admin-set passwords)
      if (!newPassword || newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password and store plain text for admin reference
      await authPool.query(
        'UPDATE users SET password_hash = $1, initial_password = $2, updated_at = NOW() WHERE id = $3',
        [newPasswordHash, newPassword, userId]
      );

      // Invalidate all sessions for this user
      await authPool.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
      );

      return { success: true };
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }

  /**
   * Get user by ID with full details
   */
  async getUserById(userId) {
    try {
      // Get user with designation and employee name from employees table
      const userResult = await authPool.query(
        `SELECT u.id, u.email, u.name, u.role, u.photo_url, u.is_active, u.created_at,
                COALESCE(d.name, u.designation) as designation,
                d.level as designation_level,
                e.first_name, e.last_name, e.sales_rep_name, e.group_members,
                COALESCE(
                  e.department,
                  d.department,
                  CASE
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%qc%' OR COALESCE(d.name, u.designation, '') ILIKE '%quality%' THEN 'QC'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%production%' THEN 'Production'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%account%' OR COALESCE(d.name, u.designation, '') ILIKE '%finance%' THEN 'Accounts'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%logistic%' OR COALESCE(d.name, u.designation, '') ILIKE '%store%' THEN 'Logistics'
                    WHEN COALESCE(d.name, u.designation, '') ILIKE '%sales%' THEN 'Sales'
                    WHEN u.role IN ('quality_control', 'qc_manager', 'qc_lab') THEN 'QC'
                    WHEN u.role IN ('production_manager', 'operator') THEN 'Production'
                    WHEN u.role IN ('accounts_manager', 'accountant') THEN 'Accounts'
                    WHEN u.role IN ('logistics_manager', 'stores_keeper') THEN 'Logistics'
                    WHEN u.role IN ('sales_rep', 'sales_executive', 'sales_coordinator', 'sales_manager') THEN 'Sales'
                    ELSE NULL
                  END
                ) as employee_department
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN designations d ON e.designation_id = d.id
         WHERE u.id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      
      // Build display name from employee details or fallback to user.name
      const displayName = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}`
        : user.name;

      // Get divisions using helper function
      const divisions = await this.getDivisionsForUser(userId, user.role);

      // Get preferences
      const prefsResult = await authPool.query(
        'SELECT * FROM user_preferences WHERE user_id = $1',
        [userId]
      );
      const preferences = prefsResult.rows[0] || {};

      return {
        ...user,
        department: user.employee_department || null,
        displayName,
        divisions,
        preferences
      };
    } catch (error) {
      logger.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * Email validation
   */
  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * Password validation (at least 8 chars, 1 uppercase, 1 lowercase, 1 number)
   */
  validatePassword(password) {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
  }

  /**
   * Clean up expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions() {
    try {
      const result = await authPool.query(
        'DELETE FROM user_sessions WHERE expires_at < NOW()'
      );
      logger.info(`Cleaned up ${result.rowCount} expired sessions`);
      return result.rowCount;
    } catch (error) {
      logger.error('Error cleaning up sessions:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();
