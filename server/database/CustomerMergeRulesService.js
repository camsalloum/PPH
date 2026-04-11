const { pool } = require('./config');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "PP-KSA" -> "pp"
 */
function extractDivisionCode(division) {
  if (!division) return 'fp'; // Default to FP for backward compatibility
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get division-specific table names
 * ALL tables are division-prefixed (e.g., fp_customer_merge_rules)
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    customerMergeRules: `${code}_customer_merge_rules`
  };
}

class CustomerMergeRulesService {
  constructor() {
    this.pool = pool; // Keep for backward compatibility
  }

  /**
   * Get the correct database pool for a division
   */
  getPoolForDivision(division) {
    const divisionCode = extractDivisionCode(division);
    return getDivisionPool(divisionCode.toUpperCase());
  }

  /**
   * Add a single customer merge rule (without deleting existing ones)
   */
  async addMergeRule(salesRep, division, mergeRule) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        INSERT INTO ${tables.customerMergeRules} 
        (sales_rep, division, merged_customer_name, original_customers, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (sales_rep, division, merged_customer_name) 
        DO UPDATE SET 
          original_customers = EXCLUDED.original_customers,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const result = await divisionPool.query(query, [
        salesRep,
        division,
        mergeRule.mergedName,
        JSON.stringify(mergeRule.originalCustomers),
        mergeRule.isActive !== false
      ]);
      
      return { success: true, message: 'Merge rule added successfully' };
    } catch (error) {
      logger.error('Error adding merge rule:', error);
      throw error;
    }
  }

  /**
   * Save customer merge rules for a sales rep (REPLACES ALL - use for bulk operations)
   */
  async saveMergeRules(salesRep, division, mergeRules) {
    const divisionPool = this.getPoolForDivision(division);
    const tables = getTableNames(division);
    
    try {
      // Start transaction
      await divisionPool.query('BEGIN');
      
      // Delete existing rules for this sales rep and division
      await divisionPool.query(
        `DELETE FROM ${tables.customerMergeRules} WHERE sales_rep = $1 AND division = $2`,
        [salesRep, division]
      );
      
      // Insert new rules
      for (const rule of mergeRules) {
        const query = `
          INSERT INTO ${tables.customerMergeRules} 
          (sales_rep, division, merged_customer_name, original_customers, is_active)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (sales_rep, division, merged_customer_name) 
          DO UPDATE SET 
            original_customers = EXCLUDED.original_customers,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
        `;
        
        await divisionPool.query(query, [
          salesRep,
          division,
          rule.mergedName,
          JSON.stringify(rule.originalCustomers),
          rule.isActive !== false
        ]);
      }
      
      // Commit transaction
      await divisionPool.query('COMMIT');
      
      return { success: true, message: 'Merge rules saved successfully' };
    } catch (error) {
      // Rollback transaction
      await divisionPool.query('ROLLBACK');
      logger.error('Error saving merge rules:', error);
      throw error;
    }
  }

  /**
   * Get customer merge rules for a sales rep
   */
  async getMergeRules(salesRep, division) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        SELECT 
          merged_customer_name,
          original_customers,
          is_active,
          created_at,
          updated_at
        FROM ${tables.customerMergeRules} 
        WHERE sales_rep = $1 AND division = $2 AND is_active = true
        ORDER BY created_at DESC
      `;
      
      const result = await divisionPool.query(query, [salesRep, division]);
      
      return result.rows.map(row => ({
        mergedName: row.merged_customer_name,
        originalCustomers: row.original_customers,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching merge rules:', error);
      throw error;
    }
  }

  /**
   * Delete a specific merge rule
   */
  async deleteMergeRule(salesRep, division, mergedCustomerName) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        DELETE FROM ${tables.customerMergeRules} 
        WHERE sales_rep = $1 AND division = $2 AND merged_customer_name = $3
      `;
      
      const result = await divisionPool.query(query, [salesRep, division, mergedCustomerName]);
      
      return { 
        success: true, 
        message: 'Merge rule deleted successfully',
        deletedCount: result.rowCount
      };
    } catch (error) {
      logger.error('Error deleting merge rule:', error);
      throw error;
    }
  }

  /**
   * Check if merge rules exist for a sales rep
   */
  async hasMergeRules(salesRep, division) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        SELECT COUNT(*) as count
        FROM ${tables.customerMergeRules} 
        WHERE sales_rep = $1 AND division = $2 AND is_active = true
      `;
      
      const result = await divisionPool.query(query, [salesRep, division]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('Error checking merge rules:', error);
      throw error;
    }
  }

  /**
   * Reset all merge rules for a division (for testing/development)
   * Note: This now requires a division parameter
   */
  async resetAllMergeRules(division) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `DELETE FROM ${tables.customerMergeRules}`;
      const result = await divisionPool.query(query);
      
      return { 
        success: true, 
        message: `All merge rules for division ${division} have been reset`,
        deletedCount: result.rowCount
      };
    } catch (error) {
      logger.error('Error resetting all merge rules:', error);
      throw error;
    }
  }

  /**
   * Get all merge rules for a division (admin view)
   */
  async getAllMergeRulesForDivision(division) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        SELECT 
          sales_rep,
          merged_customer_name,
          original_customers,
          is_active,
          created_at,
          updated_at
        FROM ${tables.customerMergeRules} 
        WHERE division = $1 AND is_active = true
        ORDER BY sales_rep, created_at DESC
      `;
      
      const result = await divisionPool.query(query, [division]);
      
      return result.rows.map(row => ({
        salesRep: row.sales_rep,
        mergedName: row.merged_customer_name,
        originalCustomers: row.original_customers,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching all merge rules for division:', error);
      throw error;
    }
  }
}

module.exports = new CustomerMergeRulesService();
