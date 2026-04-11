/**
 * Pricing Configuration Service
 * 
 * Provides centralized access to pricing field configurations stored in the database.
 * Replaces hardcoded pricing fields (asp_round, morm_round, rm_round) throughout the application.
 * 
 * Features:
 * - Caching for performance (avoid repeated queries)
 * - Per-division pricing field lists
 * - Add/remove pricing fields without code changes
 * - Validation constraints (min/max values)
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

class PricingConfigService {
  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'fp_database',
    });

    // Cache for pricing configurations
    // Structure: { division: { code: config, ... }, ... }
    this.cache = {};
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour
    this.lastCacheTime = {};
  }

  /**
   * Get all active pricing fields for a division
   * Returns array of pricing field objects sorted by display order
   * 
   * @param {string} division - Division code (fp, sb, tf, hcm)
   * @param {boolean} fromCache - Use cache if available
   * @returns {Promise<Array>} Array of pricing config objects
   */
  async getPricingFields(division, fromCache = true) {
    try {
      // Check cache
      if (fromCache && this.cache[division] && this.isCacheValid(division)) {
        logger.debug(`PricingConfigService: Returning cached pricing fields for ${division}`);
        return Object.values(this.cache[division]);
      }

      // Query database
      const query = `
        SELECT 
          id,
          division,
          field_code,
          field_name,
          display_name,
          description,
          min_value,
          max_value,
          is_active,
          display_order,
          created_at,
          updated_at
        FROM pricing_config
        WHERE division = $1 AND is_active = true
        ORDER BY display_order ASC
      `;

      const result = await this.pool.query(query, [division]);
      
      if (result.rows.length === 0) {
        logger.warn(`No active pricing fields found for division: ${division}`);
        return [];
      }

      // Update cache
      this.cache[division] = {};
      result.rows.forEach(row => {
        this.cache[division][row.field_code] = row;
      });
      this.lastCacheTime[division] = Date.now();

      logger.info(`PricingConfigService: Loaded ${result.rows.length} pricing fields for ${division}`);
      return result.rows;
    } catch (error) {
      logger.error(`PricingConfigService.getPricingFields error for ${division}:`, error);
      throw new Error(`Failed to get pricing fields for ${division}: ${error.message}`);
    }
  }

  /**
   * Get pricing field names as array (for compatibility with existing code)
   * Returns field names like ['asp_round', 'morm_round', 'rm_round']
   * 
   * @param {string} division - Division code
   * @returns {Promise<Array>} Array of field names
   */
  async getPricingFieldNames(division) {
    const fields = await this.getPricingFields(division);
    return fields.map(f => f.field_name);
  }

  /**
   * Get pricing field codes (display names)
   * Returns codes like ['ASP', 'MORM', 'RM']
   * 
   * @param {string} division - Division code
   * @returns {Promise<Array>} Array of field codes
   */
  async getPricingFieldCodes(division) {
    const fields = await this.getPricingFields(division);
    return fields.map(f => f.field_code);
  }

  /**
   * Get a specific pricing field by code
   * 
   * @param {string} division - Division code
   * @param {string} fieldCode - Field code (ASP, MORM, RM)
   * @returns {Promise<Object>} Pricing field config object or null
   */
  async getPricingFieldByCode(division, fieldCode) {
    try {
      const fields = await this.getPricingFields(division);
      return fields.find(f => f.field_code === fieldCode) || null;
    } catch (error) {
      logger.error(`PricingConfigService.getPricingFieldByCode error:`, error);
      throw error;
    }
  }

  /**
   * Validate a pricing value against field constraints
   * 
   * @param {string} division - Division code
   * @param {string} fieldCode - Field code (ASP, MORM, RM)
   * @param {number} value - Value to validate
   * @returns {Promise<Object>} { isValid: boolean, error?: string }
   */
  async validatePricingValue(division, fieldCode, value) {
    try {
      const field = await this.getPricingFieldByCode(division, fieldCode);
      
      if (!field) {
        return { isValid: false, error: `Pricing field not found: ${fieldCode}` };
      }

      if (value !== null && value !== undefined) {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          return { isValid: false, error: `Invalid value type: ${value}` };
        }
        if (numValue < field.min_value || numValue > field.max_value) {
          return {
            isValid: false,
            error: `Value must be between ${field.min_value} and ${field.max_value}`
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      logger.error(`PricingConfigService.validatePricingValue error:`, error);
      throw error;
    }
  }

  /**
   * Add a new pricing field
   * 
   * @param {string} division - Division code
   * @param {object} fieldData - { field_code, field_name, display_name, min_value?, max_value?, description?, display_order? }
   * @returns {Promise<Object>} Created pricing field object
   */
  async addPricingField(division, fieldData) {
    try {
      const {
        field_code,
        field_name,
        display_name,
        min_value = 0,
        max_value = 1000,
        description = null,
        display_order = 999
      } = fieldData;

      // Validate min <= max
      if (min_value > max_value) {
        throw new Error('min_value must be less than or equal to max_value');
      }

      const query = `
        INSERT INTO pricing_config 
        (division, field_code, field_name, display_name, min_value, max_value, description, display_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        division,
        field_code,
        field_name,
        display_name,
        min_value,
        max_value,
        description,
        display_order
      ]);

      // Invalidate cache
      delete this.cache[division];
      delete this.lastCacheTime[division];

      logger.info(`PricingConfigService: Added pricing field ${field_code} to ${division}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`PricingConfigService.addPricingField error:`, error);
      throw new Error(`Failed to add pricing field: ${error.message}`);
    }
  }

  /**
   * Remove a pricing field (soft delete - sets is_active = false)
   * 
   * @param {string} division - Division code
   * @param {string} fieldCode - Field code to remove
   * @returns {Promise<boolean>} Success status
   */
  async removePricingField(division, fieldCode) {
    try {
      const query = `
        UPDATE pricing_config
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE division = $1 AND field_code = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, [division, fieldCode]);

      if (result.rows.length === 0) {
        logger.warn(`Pricing field not found: ${division}/${fieldCode}`);
        return false;
      }

      // Invalidate cache
      delete this.cache[division];
      delete this.lastCacheTime[division];

      logger.info(`PricingConfigService: Deactivated pricing field ${fieldCode} from ${division}`);
      return true;
    } catch (error) {
      logger.error(`PricingConfigService.removePricingField error:`, error);
      throw new Error(`Failed to remove pricing field: ${error.message}`);
    }
  }

  /**
   * Update pricing field configuration
   * 
   * @param {string} division - Division code
   * @param {string} fieldCode - Field code to update
   * @param {object} updates - Fields to update
   * @returns {Promise<Object>} Updated pricing field object
   */
  async updatePricingField(division, fieldCode, updates) {
    try {
      // Build dynamic UPDATE query
      const allowedFields = ['field_name', 'display_name', 'description', 'min_value', 'max_value', 'display_order', 'is_active'];
      const updateFields = [];
      const values = [division, fieldCode];
      let paramCount = 3;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const query = `
        UPDATE pricing_config
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE division = $1 AND field_code = $2
        RETURNING *
      `;

      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Pricing field not found: ${division}/${fieldCode}`);
      }

      // Invalidate cache
      delete this.cache[division];
      delete this.lastCacheTime[division];

      logger.info(`PricingConfigService: Updated pricing field ${fieldCode} in ${division}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`PricingConfigService.updatePricingField error:`, error);
      throw new Error(`Failed to update pricing field: ${error.message}`);
    }
  }

  /**
   * Clear cache for a division or all divisions
   * 
   * @param {string} division - Division code or undefined to clear all
   */
  clearCache(division = null) {
    if (division) {
      delete this.cache[division];
      delete this.lastCacheTime[division];
      logger.debug(`PricingConfigService: Cleared cache for ${division}`);
    } else {
      this.cache = {};
      this.lastCacheTime = {};
      logger.debug(`PricingConfigService: Cleared all caches`);
    }
  }

  /**
   * Check if cache is still valid
   * 
   * @private
   */
  isCacheValid(division) {
    if (!this.lastCacheTime[division]) return false;
    const age = Date.now() - this.lastCacheTime[division];
    return age < this.cacheExpiry;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
    logger.info('PricingConfigService: Database connection closed');
  }
}

// Export singleton instance
module.exports = new PricingConfigService();
