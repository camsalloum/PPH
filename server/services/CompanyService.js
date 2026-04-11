/**
 * ============================================================================
 * COMPANY MANAGEMENT SERVICE
 * ============================================================================
 * 
 * Service for managing companies (tenants) in the SaaS platform.
 * Handles company CRUD, division management, and database provisioning.
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const poolManager = require('../database/multiTenantPool');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

class CompanyService {
  constructor() {
    this.saltRounds = 10;
  }

  // ===========================================================================
  // COMPANY CRUD
  // ===========================================================================

  /**
   * Get all companies with optional filters
   */
  async getAllCompanies(filters = {}) {
    const {
      search,
      status,
      planId,
      isActive,
      limit = 50,
      offset = 0,
    } = filters;

    let whereConditions = ['1=1'];
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        company_name ILIKE $${paramIndex} OR 
        company_code ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`subscription_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (planId) {
      whereConditions.push(`plan_id = $${paramIndex}`);
      params.push(planId);
      paramIndex++;
    }

    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    const query = `
      SELECT 
        c.company_id,
        c.company_code,
        c.company_name,
        c.logo_url,
        c.website,
        c.timezone,
        c.currency_code,
        c.subscription_status,
        c.trial_ends_at,
        c.subscription_starts_at,
        c.subscription_ends_at,
        c.max_users,
        c.max_divisions,
        c.max_storage_gb,
        c.is_active,
        c.is_demo,
        c.onboarding_completed,
        c.created_at,
        c.updated_at,
        c.plan_id,
        sp.plan_name,
        sp.plan_code,
        -- Use REPORTED metrics from tenant (not queried from tenant DB)
        c.reported_division_count as division_count,
        c.reported_user_count as user_count,
        c.reported_storage_mb as storage_used_mb,
        c.metrics_last_reported_at
      FROM companies c
      LEFT JOIN subscription_plans sp ON c.plan_id = sp.plan_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY c.company_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await poolManager.platformQuery(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM companies c
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await poolManager.platformQuery(countQuery, params.slice(0, -2));

    return {
      companies: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    };
  }

  /**
   * Get a single company by ID or code
   * NOTE: Uses reported_* columns for metrics (tenants push their own metrics)
   */
  async getCompany(identifier) {
    const isNumeric = !isNaN(identifier);
    const query = `
      SELECT 
        c.company_id,
        c.company_code,
        c.company_name,
        c.logo_url,
        c.website,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.country,
        c.postal_code,
        c.phone,
        c.email,
        c.timezone,
        c.currency_code,
        c.date_format,
        c.fiscal_year_start,
        c.subscription_status,
        c.trial_ends_at,
        c.subscription_starts_at,
        c.subscription_ends_at,
        c.max_users,
        c.max_divisions,
        c.max_storage_gb,
        c.is_active,
        c.is_demo,
        c.onboarding_completed,
        c.created_at,
        c.updated_at,
        c.plan_id,
        -- Reported metrics (tenant-pushed, not queried)
        c.reported_user_count as user_count,
        c.reported_division_count as division_count,
        c.reported_storage_mb as storage_used_mb,
        c.metrics_last_reported_at,
        sp.plan_name,
        sp.plan_code,
        sp.max_users as plan_max_users,
        sp.max_divisions as plan_max_divisions,
        sp.features as plan_features
      FROM companies c
      LEFT JOIN subscription_plans sp ON c.plan_id = sp.plan_id
      WHERE ${isNumeric ? 'c.company_id = $1' : 'c.company_code = $1'}
    `;

    const result = await poolManager.platformQuery(query, [identifier]);
    
    if (!result.rows[0]) {
      return null;
    }

    const company = result.rows[0];

    // Get divisions from PLATFORM database (company_divisions table)
    // NOTE: This is platform subscription data, not tenant business data
    const divisionsResult = await poolManager.platformQuery(
      `SELECT division_id, division_code, division_name, sort_order, is_active 
       FROM company_divisions 
       WHERE company_id = $1 
       ORDER BY sort_order`,
      [company.company_id]
    );
    company.divisions = divisionsResult.rows;

    return company;
  }

  /**
   * Create a new company
   * 
   * NOTE: database_name is used ONLY for initial tenant provisioning.
   * After setup, platform should NEVER query tenant databases.
   * All ongoing data comes from tenant-reported metrics via API.
   */
  async createCompany(data, createdBy = null) {
    const {
      company_code,
      company_name,
      database_name,
      logo_url,
      website,
      address_line1,
      address_line2,
      city,
      state,
      country,
      postal_code,
      phone,
      email,
      timezone,
      currency_code,
      date_format,
      fiscal_year_start,
      plan_id,
      max_users,
      max_divisions,
      max_storage_gb,
      is_demo,
      divisions = [],  // Array of { division_code, division_name }
    } = data;

    // Validate required fields
    if (!company_code || !company_name) {
      throw new Error('Company code and name are required');
    }

    // Generate database name if not provided
    const dbName = database_name || `${company_code.toLowerCase()}_database`;

    // Check if company code or database already exists
    const existsCheck = await poolManager.platformQuery(
      `SELECT company_id FROM companies WHERE company_code = $1 OR database_name = $2`,
      [company_code, dbName]
    );

    if (existsCheck.rows.length > 0) {
      throw new Error('Company code or database name already exists');
    }

    // Start transaction
    const client = await poolManager.getPlatformPool().connect();
    
    try {
      await client.query('BEGIN');

      // Insert company
      const insertQuery = `
        INSERT INTO companies (
          company_code, company_name, database_name,
          logo_url, website, address_line1, address_line2,
          city, state, country, postal_code, phone, email,
          timezone, currency_code, date_format, fiscal_year_start,
          plan_id, max_users, max_divisions, max_storage_gb,
          is_demo, subscription_status, trial_ends_at,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22, 'trial',
          CURRENT_TIMESTAMP + INTERVAL '14 days', $23
        )
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        company_code.toLowerCase(),
        company_name,
        dbName,
        logo_url,
        website,
        address_line1,
        address_line2,
        city,
        state,
        country,
        postal_code,
        phone,
        email,
        timezone || 'UTC',
        currency_code || 'USD',
        date_format || 'DD/MM/YYYY',
        fiscal_year_start || 1,
        plan_id || 1,
        max_users,
        max_divisions,
        max_storage_gb,
        is_demo || false,
        createdBy,
      ]);

      const company = result.rows[0];

      // Insert divisions
      for (let i = 0; i < divisions.length; i++) {
        const div = divisions[i];
        await client.query(
          `INSERT INTO company_divisions (company_id, division_code, division_name, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [company.company_id, div.division_code.toLowerCase(), div.division_name, i + 1]
        );
      }

      // Queue database provisioning
      await client.query(
        `INSERT INTO provisioning_queue (company_id, action, parameters, status)
         VALUES ($1, 'create_database', $2, 'pending')`,
        [company.company_id, JSON.stringify({ database_name: dbName, divisions })]
      );

      await client.query('COMMIT');

      // Log action
      await this.logAction('company.created', 'company', company.company_id, createdBy, {
        company_code,
        company_name,
        divisions_count: divisions.length,
      });

      return company;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a company
   */
  async updateCompany(companyId, data, updatedBy = null) {
    const allowedFields = [
      'company_name', 'logo_url', 'website',
      'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
      'phone', 'email', 'timezone', 'currency_code', 'date_format', 'fiscal_year_start',
      'plan_id', 'max_users', 'max_divisions', 'max_storage_gb',
      'is_active', 'onboarding_completed',
    ];

    const updates = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        params.push(data[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push(`updated_by = $${paramIndex}`);
    params.push(updatedBy);
    paramIndex++;

    params.push(companyId);

    const query = `
      UPDATE companies 
      SET ${updates.join(', ')}
      WHERE company_id = $${paramIndex}
      RETURNING *
    `;

    const result = await poolManager.platformQuery(query, params);

    if (!result.rows[0]) {
      throw new Error('Company not found');
    }

    // Clear cache
    poolManager.clearCompanyCache(result.rows[0].company_code);

    // Log action
    await this.logAction('company.updated', 'company', companyId, updatedBy, data);

    return result.rows[0];
  }

  // ===========================================================================
  // DIVISION MANAGEMENT
  // ===========================================================================

  /**
   * Get divisions for a company
   */
  async getDivisions(companyId) {
    const result = await poolManager.platformQuery(
      `SELECT * FROM company_divisions WHERE company_id = $1 ORDER BY sort_order`,
      [companyId]
    );
    return result.rows;
  }

  /**
   * Add a division to a company
   */
  async addDivision(companyId, divisionCode, divisionName, createdBy = null) {
    // Check company exists and get current division count
    const company = await this.getCompany(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Check max divisions limit
    const maxDivisions = company.max_divisions || company.plan_max_divisions;
    if (maxDivisions && company.divisions.length >= maxDivisions) {
      throw new Error(`Maximum divisions limit reached (${maxDivisions})`);
    }

    // Insert division
    const result = await poolManager.platformQuery(
      `INSERT INTO company_divisions (company_id, division_code, division_name, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [companyId, divisionCode.toLowerCase(), divisionName, company.divisions.length + 1]
    );

    // Queue table creation for new division
    await poolManager.platformQuery(
      `INSERT INTO provisioning_queue (company_id, action, parameters, status)
       VALUES ($1, 'add_division', $2, 'pending')`,
      [companyId, JSON.stringify({ division_code: divisionCode })]
    );

    // Log action
    await this.logAction('division.added', 'division', result.rows[0].division_id, createdBy, {
      company_id: companyId,
      division_code: divisionCode,
      division_name: divisionName,
    });

    return result.rows[0];
  }

  /**
   * Update a division
   */
  async updateDivision(divisionId, data, updatedBy = null) {
    const { division_name, is_active, sort_order } = data;

    const result = await poolManager.platformQuery(
      `UPDATE company_divisions 
       SET division_name = COALESCE($1, division_name),
           is_active = COALESCE($2, is_active),
           sort_order = COALESCE($3, sort_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE division_id = $4
       RETURNING *`,
      [division_name, is_active, sort_order, divisionId]
    );

    if (!result.rows[0]) {
      throw new Error('Division not found');
    }

    return result.rows[0];
  }

  // ===========================================================================
  // SUBSCRIPTION MANAGEMENT
  // ===========================================================================

  /**
   * Get subscription plans
   */
  async getPlans() {
    const result = await poolManager.platformQuery(
      `SELECT * FROM subscription_plans WHERE is_active = true ORDER BY monthly_price`
    );
    return result.rows;
  }

  /**
   * Update company subscription
   */
  async updateSubscription(companyId, planId, status, endDate, updatedBy = null) {
    const result = await poolManager.platformQuery(
      `UPDATE companies 
       SET plan_id = $1,
           subscription_status = $2,
           subscription_ends_at = $3,
           updated_by = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = $5
       RETURNING *`,
      [planId, status, endDate, updatedBy, companyId]
    );

    if (!result.rows[0]) {
      throw new Error('Company not found');
    }

    // Log action
    await this.logAction('subscription.updated', 'company', companyId, updatedBy, {
      plan_id: planId,
      status,
      end_date: endDate,
    });

    return result.rows[0];
  }

  // ===========================================================================
  // USER MANAGEMENT
  // ===========================================================================

  /**
   * Get users for a company
   */
  async getCompanyUsers(companyId, filters = {}) {
    const { search, role, isActive, limit = 50, offset = 0 } = filters;

    let whereConditions = ['company_id = $1'];
    const params = [companyId];
    let paramIndex = 2;

    if (search) {
      whereConditions.push(`(
        email ILIKE $${paramIndex} OR 
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    const query = `
      SELECT 
        user_id, email, first_name, last_name, display_name,
        phone, mobile, avatar_url, job_title, department,
        role, allowed_divisions, is_active, email_verified,
        last_login_at, login_count, created_at
      FROM platform_users
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY last_name, first_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await poolManager.platformQuery(query, params);

    return result.rows;
  }

  /**
   * Create a user for a company
   */
  async createUser(companyId, userData, createdBy = null) {
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      role = 'user',
      allowed_divisions,
    } = userData;

    // Check company exists
    const company = await this.getCompany(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Check max users limit
    const maxUsers = company.max_users || company.plan_max_users;
    if (maxUsers && company.user_count >= maxUsers) {
      throw new Error(`Maximum users limit reached (${maxUsers})`);
    }

    // Check email not already used
    const emailCheck = await poolManager.platformQuery(
      `SELECT user_id FROM platform_users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (emailCheck.rows.length > 0) {
      throw new Error('Email already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Insert user
    const result = await poolManager.platformQuery(
      `INSERT INTO platform_users (
        company_id, email, password_hash, first_name, last_name,
        display_name, phone, role, allowed_divisions, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING user_id, email, first_name, last_name, role, created_at`,
      [
        companyId,
        email.toLowerCase(),
        passwordHash,
        first_name,
        last_name,
        `${first_name} ${last_name}`.trim(),
        phone,
        role,
        allowed_divisions,
        createdBy,
      ]
    );

    // Log action
    await this.logAction('user.created', 'user', result.rows[0].user_id, createdBy, {
      company_id: companyId,
      email,
      role,
    });

    return result.rows[0];
  }

  // ===========================================================================
  // AUDIT LOGGING
  // ===========================================================================

  /**
   * Log an action to the audit log
   */
  async logAction(action, entityType, entityId, userId, details = {}) {
    try {
      await poolManager.platformQuery(
        `INSERT INTO platform_audit_log (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, action, entityType, String(entityId), JSON.stringify(details)]
      );
    } catch (error) {
      logger.error('[CompanyService] Failed to log action:', error.message);
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get platform statistics
   */
  async getPlatformStats() {
    const stats = {};

    // Company counts
    const companyStats = await poolManager.platformQuery(`
      SELECT 
        COUNT(*) as total_companies,
        COUNT(*) FILTER (WHERE is_active = true) as active_companies,
        COUNT(*) FILTER (WHERE subscription_status = 'trial') as trial_companies,
        COUNT(*) FILTER (WHERE subscription_status = 'active') as paying_companies
      FROM companies
    `);
    Object.assign(stats, companyStats.rows[0]);

    // User counts
    const userStats = await poolManager.platformQuery(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_active = true) as active_users,
        COUNT(*) FILTER (WHERE last_login_at > CURRENT_TIMESTAMP - INTERVAL '30 days') as active_last_30_days
      FROM platform_users
    `);
    Object.assign(stats, userStats.rows[0]);

    // Division count
    const divisionStats = await poolManager.platformQuery(`
      SELECT COUNT(*) as total_divisions FROM company_divisions WHERE is_active = true
    `);
    stats.total_divisions = divisionStats.rows[0].total_divisions;

    return stats;
  }
}

module.exports = new CompanyService();
