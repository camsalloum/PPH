/**
 * ============================================================================
 * CUSTOMER MASTER SERVICE
 * ============================================================================
 * 
 * Service for managing customer master data across divisions.
 * Handles CRUD operations, code generation, and alias management.
 * 
 * Created: December 23, 2025
 * ============================================================================
 */

const { pool } = require('../database/config');

class CustomerMasterService {
  constructor(division) {
    this.division = division.toLowerCase(); // Normalize to lowercase
    this.pool = pool; // Use shared pool from config (connects to fp_database)
    
    // Table names (lowercase to match database convention)
    this.customerMasterTable = `${this.division}_customer_master`;
    this.customerAliasesTable = `${this.division}_customer_aliases`;
    this.codeSequencesTable = `${this.division}_code_sequences`;
  }

  // ===========================================================================
  // CUSTOMER MASTER OPERATIONS
  // ===========================================================================

  /**
   * Get all customers with optional filters
   */
  async getAllCustomers(filters = {}) {
    const {
      search,
      customerGroup,
      territory,
      isActive,
      salesRep,
      limit = 100,
      offset = 0,
      sortBy = 'customer_name',
      sortOrder = 'ASC'
    } = filters;

    let whereConditions = ['1=1'];
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        customer_name ILIKE $${paramIndex} OR 
        customer_code ILIKE $${paramIndex} OR
        customer_name_normalized ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (customerGroup) {
      whereConditions.push(`customer_group = $${paramIndex}`);
      params.push(customerGroup);
      paramIndex++;
    }

    if (territory) {
      whereConditions.push(`territory = $${paramIndex}`);
      params.push(territory);
      paramIndex++;
    }

    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (salesRep) {
      whereConditions.push(`sales_rep = $${paramIndex}`);
      params.push(salesRep);
      paramIndex++;
    }

    // Validate sort fields to prevent SQL injection
    const validSortFields = ['customer_name', 'customer_code', 'created_at', 'updated_at', 'customer_group'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'customer_name';
    const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
      SELECT 
        id, customer_code, customer_name, customer_name_normalized,
        customer_type, customer_group, territory, industry, market_segment,
        primary_contact, email, phone, mobile, website,
        city, country, credit_limit, payment_terms, default_currency,
        account_manager, sales_rep, is_active, is_merged, merged_into_code,
        notes, created_at, updated_at, division
      FROM ${this.customerMasterTable}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${this.customerMasterTable}
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await this.pool.query(countQuery, countParams);

    return {
      customers: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }

  /**
   * Get customer by code
   */
  async getCustomerByCode(customerCode) {
    const query = `
      SELECT * FROM ${this.customerMasterTable}
      WHERE customer_code = $1
    `;
    const result = await this.pool.query(query, [customerCode]);
    return result.rows[0] || null;
  }

  /**
   * Get customer by normalized name (for duplicate detection)
   */
  async getCustomerByNormalizedName(normalizedName) {
    const query = `
      SELECT * FROM ${this.customerMasterTable}
      WHERE customer_name_normalized = $1 AND is_active = true
    `;
    const result = await this.pool.query(query, [normalizedName]);
    return result.rows[0] || null;
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerData) {
    const {
      customer_name,
      customer_type = 'Company',
      customer_group,
      territory,
      industry,
      market_segment,
      primary_contact,
      email,
      phone,
      mobile,
      website,
      address_line1,
      address_line2,
      city,
      state,
      country = 'UAE',
      postal_code,
      tax_id,
      trade_license,
      credit_limit,
      payment_terms,
      default_currency = 'AED',
      account_manager,
      sales_rep,
      notes,
      created_by
    } = customerData;

    const query = `
      INSERT INTO ${this.customerMasterTable} (
        customer_name, customer_type, customer_group, territory, industry,
        market_segment, primary_contact, email, phone, mobile, website,
        address_line1, address_line2, city, state, country, postal_code,
        tax_id, trade_license, credit_limit, payment_terms, default_currency,
        account_manager, sales_rep, notes, division, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
      )
      RETURNING *
    `;

    const params = [
      customer_name, customer_type, customer_group, territory, industry,
      market_segment, primary_contact, email, phone, mobile, website,
      address_line1, address_line2, city, state, country, postal_code,
      tax_id, trade_license, credit_limit, payment_terms, default_currency,
      account_manager, sales_rep, notes, this.division, created_by
    ];

    const result = await this.pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Update a customer
   */
  async updateCustomer(customerCode, updates, updatedBy) {
    const allowedFields = [
      'customer_name', 'customer_type', 'customer_group', 'territory', 'industry',
      'market_segment', 'primary_contact', 'email', 'phone', 'mobile', 'website',
      'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
      'tax_id', 'trade_license', 'credit_limit', 'payment_terms', 'default_currency',
      'account_manager', 'sales_rep', 'is_active', 'notes'
    ];

    const setClause = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_by = $${paramIndex}`);
    params.push(updatedBy);
    paramIndex++;

    params.push(customerCode);

    const query = `
      UPDATE ${this.customerMasterTable}
      SET ${setClause.join(', ')}
      WHERE customer_code = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Mark customer as merged into another
   */
  async mergeCustomer(sourceCode, targetCode, mergedBy) {
    const query = `
      UPDATE ${this.customerMasterTable}
      SET is_merged = true, merged_into_code = $1, is_active = false, updated_by = $2
      WHERE customer_code = $3
      RETURNING *
    `;
    const result = await this.pool.query(query, [targetCode, mergedBy, sourceCode]);
    return result.rows[0];
  }

  /**
   * Deactivate a customer
   */
  async deactivateCustomer(customerCode, updatedBy) {
    return this.updateCustomer(customerCode, { is_active: false }, updatedBy);
  }

  // ===========================================================================
  // CUSTOMER ALIASES OPERATIONS
  // ===========================================================================

  /**
   * Get all aliases for a customer
   */
  async getAliasesForCustomer(customerCode) {
    const query = `
      SELECT * FROM ${this.customerAliasesTable}
      WHERE customer_code = $1
      ORDER BY is_primary DESC, occurrence_count DESC
    `;
    const result = await this.pool.query(query, [customerCode]);
    return result.rows;
  }

  /**
   * Add an alias for a customer
   */
  async addAlias(customerCode, aliasData) {
    const {
      alias_name,
      source_system = 'MANUAL',
      source_file,
      source_table,
      ai_confidence,
      is_primary = false,
      created_by
    } = aliasData;

    // Use ON CONFLICT to update occurrence count if alias exists
    const query = `
      INSERT INTO ${this.customerAliasesTable} (
        customer_code, alias_name, source_system, source_file, source_table,
        ai_confidence, is_primary, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (customer_code, alias_name_normalized) 
      DO UPDATE SET 
        occurrence_count = ${this.customerAliasesTable}.occurrence_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      customerCode, alias_name, source_system, source_file, source_table,
      ai_confidence, is_primary, created_by
    ]);

    return result.rows[0];
  }

  /**
   * Find customer by alias name
   */
  async findCustomerByAlias(aliasName) {
    // First normalize the alias name
    const normalizeQuery = `SELECT ${this.division}_normalize_customer_name($1) as normalized`;
    const normalizeResult = await this.pool.query(normalizeQuery, [aliasName]);
    const normalizedName = normalizeResult.rows[0].normalized;

    // Search in aliases
    const query = `
      SELECT cm.*, ca.alias_name as matched_alias, ca.ai_confidence
      FROM ${this.customerMasterTable} cm
      JOIN ${this.customerAliasesTable} ca ON cm.customer_code = ca.customer_code
      WHERE ca.alias_name_normalized = $1 AND cm.is_active = true
    `;
    const result = await this.pool.query(query, [normalizedName]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Also check customer_master directly
    const directQuery = `
      SELECT * FROM ${this.customerMasterTable}
      WHERE customer_name_normalized = $1 AND is_active = true
    `;
    const directResult = await this.pool.query(directQuery, [normalizedName]);
    return directResult.rows[0] || null;
  }

  /**
   * Verify an alias
   */
  async verifyAlias(aliasId, verifiedBy) {
    const query = `
      UPDATE ${this.customerAliasesTable}
      SET is_verified = true, verified_by = $1, verified_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.pool.query(query, [verifiedBy, aliasId]);
    return result.rows[0];
  }

  /**
   * Set primary alias for a customer
   */
  async setPrimaryAlias(customerCode, aliasId) {
    // First, unset all primary flags for this customer
    await this.pool.query(
      `UPDATE ${this.customerAliasesTable} SET is_primary = false WHERE customer_code = $1`,
      [customerCode]
    );

    // Then set the specified alias as primary
    const query = `
      UPDATE ${this.customerAliasesTable}
      SET is_primary = true
      WHERE id = $1 AND customer_code = $2
      RETURNING *
    `;
    const result = await this.pool.query(query, [aliasId, customerCode]);
    return result.rows[0];
  }

  // ===========================================================================
  // MERGE CODE OPERATIONS
  // ===========================================================================

  /**
   * Generate merge code for a merge rule
   */
  async generateMergeCode() {
    const query = `SELECT ${this.division}_generate_merge_code($1) as merge_code`;
    const result = await this.pool.query(query, [this.division]);
    return result.rows[0].merge_code;
  }

  /**
   * Assign merge code to existing merge rule
   */
  async assignMergeCodeToRule(ruleId) {
    const mergeCode = await this.generateMergeCode();
    const query = `
      UPDATE ${this.division}_division_customer_merge_rules
      SET merge_code = $1
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.pool.query(query, [mergeCode, ruleId]);
    return result.rows[0];
  }

  /**
   * Assign merge codes to all rules without one
   */
  async assignMergeCodesToAllRules() {
    const rulesQuery = `
      SELECT id FROM ${this.division}_division_customer_merge_rules
      WHERE merge_code IS NULL
      ORDER BY id
    `;
    const rules = await this.pool.query(rulesQuery);

    const updated = [];
    for (const rule of rules.rows) {
      const updatedRule = await this.assignMergeCodeToRule(rule.id);
      updated.push(updatedRule);
    }

    return {
      count: updated.length,
      rules: updated
    };
  }

  // ===========================================================================
  // MIGRATION HELPERS
  // ===========================================================================

  /**
   * Get unique customer names from data sources (NEW: Using source of truth tables)
   * - fp_actualcommon: All actual transaction data
   * - fp_budget_unified: Unified budget data
   */
  async getUniqueCustomerNamesFromSources() {
    if (!/^[a-z0-9_]+$/i.test(this.division)) {
      throw new Error(`Invalid division identifier: ${this.division}`);
    }

    const actualTable = `${this.division}_actualcommon`;
    const budgetTable = `${this.division}_budget_unified`;

    const query = `
      SELECT DISTINCT customer_name as customer, 'actualcommon' as source 
      FROM ${actualTable} 
      WHERE customer_name IS NOT NULL AND customer_name != '' AND TRIM(customer_name) != ''
      UNION
      SELECT DISTINCT customer_name as customer, 'unified_budget' as source 
      FROM ${budgetTable} 
      WHERE customer_name IS NOT NULL AND customer_name != '' AND TRIM(customer_name) != ''
    `;
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get merged customer names from merge rules
   */
  async getMergedCustomerNames() {
    const query = `
      SELECT id, merged_customer, customer_group, merge_code
      FROM ${this.division}_division_customer_merge_rules
      ORDER BY merged_customer
    `;
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Create customer master entry from merge rule
   */
  async createCustomerFromMergeRule(mergeRule, createdBy = 'MIGRATION') {
    const { merged_customer, customer_group } = mergeRule;

    // Create the customer
    const customer = await this.createCustomer({
      customer_name: merged_customer,
      customer_group: 'Merged Customer',
      notes: `Migrated from merge rule. Original customer group: ${customer_group?.join(', ')}`,
      created_by: createdBy
    });

    // Add aliases for each name in the customer_group
    if (customer_group && Array.isArray(customer_group)) {
      for (const alias of customer_group) {
        if (alias && alias !== merged_customer) {
          await this.addAlias(customer.customer_code, {
            alias_name: alias,
            source_system: 'MERGE_RULE_MIGRATION',
            is_primary: false,
            created_by: createdBy
          });
        }
      }

      // Add the merged_customer name as primary alias
      await this.addAlias(customer.customer_code, {
        alias_name: merged_customer,
        source_system: 'MERGE_RULE_MIGRATION',
        is_primary: true,
        created_by: createdBy
      });
    }

    return customer;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get customer statistics for the division
   */
  async getStatistics() {
    const stats = {};

    // Total customers
    const totalQuery = `SELECT COUNT(*) as count FROM ${this.customerMasterTable}`;
    const totalResult = await this.pool.query(totalQuery);
    stats.totalCustomers = parseInt(totalResult.rows[0].count);

    // Active customers
    const activeQuery = `SELECT COUNT(*) as count FROM ${this.customerMasterTable} WHERE is_active = true`;
    const activeResult = await this.pool.query(activeQuery);
    stats.activeCustomers = parseInt(activeResult.rows[0].count);

    // Merged customers
    const mergedQuery = `SELECT COUNT(*) as count FROM ${this.customerMasterTable} WHERE is_merged = true`;
    const mergedResult = await this.pool.query(mergedQuery);
    stats.mergedCustomers = parseInt(mergedResult.rows[0].count);

    // Total aliases
    const aliasQuery = `SELECT COUNT(*) as count FROM ${this.customerAliasesTable}`;
    const aliasResult = await this.pool.query(aliasQuery);
    stats.totalAliases = parseInt(aliasResult.rows[0].count);

    // Verified aliases
    const verifiedQuery = `SELECT COUNT(*) as count FROM ${this.customerAliasesTable} WHERE is_verified = true`;
    const verifiedResult = await this.pool.query(verifiedQuery);
    stats.verifiedAliases = parseInt(verifiedResult.rows[0].count);

    // By customer group
    const groupQuery = `
      SELECT customer_group, COUNT(*) as count 
      FROM ${this.customerMasterTable} 
      WHERE is_active = true
      GROUP BY customer_group 
      ORDER BY count DESC
    `;
    const groupResult = await this.pool.query(groupQuery);
    stats.byCustomerGroup = groupResult.rows;

    return stats;
  }

  /**
   * Close connection pool
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = CustomerMasterService;
