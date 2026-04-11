/**
 * DivisionMappingService.js
 * 
 * Handles transformation of Oracle division codes to admin-defined divisions
 * Maps: Oracle division codes → Admin division codes (dynamically configured)
 * 
 * Created: January 6, 2026
 */

const multiTenantPool = require('../database/multiTenantPool');
const logger = require('../utils/logger');

class DivisionMappingService {
  /**
   * Query wrapper for platform database
   */
  async query(sql, params = []) {
    return multiTenantPool.platformQuery(sql, params);
  }

  /**
   * Cache for division mappings to avoid repeated DB queries
   * Structure: { 'FP': { division_code: 'FP', division_name: 'Flexible Packaging', mapped_oracle_codes: ['FP', 'FB'] } }
   */
  divisionMappingCache = {};

  /**
   * Initialize cache by loading all divisions from DB
   */
  async initializeCache(companyCode = null) {
    try {
      const query = `
        SELECT 
          division_code,
          division_name,
          mapped_oracle_codes,
          is_active
        FROM company_divisions
        WHERE is_active = true;
      `;

      let result;
      if (companyCode) {
        // Use tenant-specific pool
        result = await multiTenantPool.tenantQuery(companyCode, query);
      } else {
        // Use platform pool
        result = await multiTenantPool.platformQuery(query);
      }
      
      // Build reverse lookup: Oracle code → Admin division
      this.divisionMappingCache = {};
      this.oracleToAdminMap = {};  // Oracle code → Admin division code
      
      result.rows.forEach(division => {
        // Store admin division info by code
        this.divisionMappingCache[division.division_code] = {
          division_code: division.division_code,
          division_name: division.division_name,
          mapped_oracle_codes: division.mapped_oracle_codes
        };

        // Build reverse map: each Oracle code → Admin division
        if (division.mapped_oracle_codes && Array.isArray(division.mapped_oracle_codes)) {
          division.mapped_oracle_codes.forEach(oracleCode => {
            this.oracleToAdminMap[oracleCode] = division.division_code;
          });
        }
      });

      logger.info(`✅ Division mapping cache initialized with ${Object.keys(this.divisionMappingCache).length} divisions`);
      logger.debug(`Oracle → Admin mapping: ${JSON.stringify(this.oracleToAdminMap)}`);

      return this.divisionMappingCache;
    } catch (error) {
      logger.error(`❌ Failed to initialize division cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Map Oracle division code to admin-defined division
   * @param {string} oracleDivisionCode - Oracle division code from raw data
   * @returns {Object} - { division_code, division_name, mapped_from_oracle_code }
   * 
   * Example:
   *   Input: 'FB'
   *   Output: { division_code: 'FP', division_name: 'Flexible Packaging', mapped_from_oracle_code: 'FB' }
   */
  mapOracleDivisionToAdmin(oracleDivisionCode) {
    if (!oracleDivisionCode) {
      logger.warn('⚠️ Empty Oracle division code provided');
      return null;
    }

    const adminDivisionCode = this.oracleToAdminMap[oracleDivisionCode];

    if (!adminDivisionCode) {
      logger.warn(`⚠️ Oracle division '${oracleDivisionCode}' not found in mapping cache`);
      return null;
    }

    const divisionInfo = this.divisionMappingCache[adminDivisionCode];

    return {
      division_code: divisionInfo.division_code,
      division_name: divisionInfo.division_name,
      mapped_from_oracle_code: oracleDivisionCode
    };
  }

  /**
   * Get all mapped divisions
   * @returns {Object} - All divisions in cache
   */
  getAllMappings() {
    return this.divisionMappingCache;
  }

  /**
   * Refresh cache (call after division mappings are updated)
   */
  async refreshCache() {
    logger.info('🔄 Refreshing division mapping cache...');
    await this.initializeCache();
  }

  /**
   * Get Oracle codes that map to a specific admin division
   * @param {string} divisionCode - Admin division code (e.g., 'FP')
   * @returns {Array} - Oracle codes (e.g., ['FP', 'FB'])
   */
  getOracleCodes(divisionCode) {
    const division = this.divisionMappingCache[divisionCode];
    if (!division) {
      return [];
    }
    return division.mapped_oracle_codes || [];
  }

  /**
   * Validate division mapping
   * Check if all Oracle codes in mapping actually exist in company_divisions
   */
  async validateMappings(companyCode = null) {
    try {
      const query = `
        SELECT 
          division_code,
          mapped_oracle_codes,
          (
            SELECT COUNT(*) 
            FROM (
              SELECT unnest(mapped_oracle_codes) as code
            ) t
            WHERE code IS NOT NULL
          ) as oracle_code_count
        FROM company_divisions
        WHERE is_active = true;
      `;

      let result;
      if (companyCode) {
        result = await multiTenantPool.tenantQuery(companyCode, query);
      } else {
        result = await multiTenantPool.platformQuery(query);
      }

      const validations = result.rows.map(division => ({
        division_code: division.division_code,
        oracle_code_count: division.oracle_code_count,
        oracle_codes: division.mapped_oracle_codes,
        is_valid: division.mapped_oracle_codes && division.mapped_oracle_codes.length > 0
      }));

      logger.info(`✅ Division mapping validation: ${validations.length} divisions checked`);
      return validations;
    } catch (error) {
      logger.error(`❌ Division validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get mapping statistics for logging/monitoring
   */
  getMappingStats() {
    const stats = {
      total_admin_divisions: Object.keys(this.divisionMappingCache).length,
      total_oracle_mappings: Object.keys(this.oracleToAdminMap).length,
      divisions: []
    };

    Object.entries(this.divisionMappingCache).forEach(([code, info]) => {
      stats.divisions.push({
        admin_code: code,
        admin_name: info.division_name,
        oracle_codes: info.mapped_oracle_codes || [],
        oracle_code_count: (info.mapped_oracle_codes || []).length
      });
    });

    return stats;
  }

  /**
   * Log division mapping for a specific record transformation
   * @param {Object} auditData - { actual_id, erp_row_id, oracle_division, admin_division_code, admin_division_name, companyCode }
   */
  async logDivisionMapping(auditData) {
    try {
      const query = `
        INSERT INTO fp_actualdata_transformation_audit (
          actual_id,
          erp_row_id,
          transformation_step,
          input_data,
          output_data,
          rule_applied,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `;

      const params = [
        auditData.actual_id,
        auditData.erp_row_id,
        'division_mapping',
        JSON.stringify({ oracle_division: auditData.oracle_division }),
        JSON.stringify({ 
          division_code: auditData.admin_division_code,
          division_name: auditData.admin_division_name
        }),
        `Oracle ${auditData.oracle_division} → Admin ${auditData.admin_division_code}`
      ];

      if (auditData.companyCode) {
        await multiTenantPool.tenantQuery(auditData.companyCode, query, params);
      } else {
        await multiTenantPool.platformQuery(query, params);
      }

      logger.debug(`✅ Division mapping audit logged for record ${auditData.erp_row_id}`);
    } catch (error) {
      logger.error(`⚠️ Failed to log division mapping audit: ${error.message}`);
      // Don't throw - this is non-critical
    }
  }
}

module.exports = new DivisionMappingService();

