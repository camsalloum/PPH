const { Pool } = require('pg');
require('dotenv').config();

/**
 * Service for managing Material Condition Configuration
 * Material Conditions are used in the Material Condition column dropdown (e.g., Plain, Printed)
 */
class MaterialConditionService {
  constructor() {
    // Use ip_auth_database for config tables
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.CONFIG_DB_NAME || 'ip_auth_database',
    });
    
    // FP database pool for cascade updates
    this.fpPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'fp_database',
    });
  }

  /**
   * Get all material conditions for a division
   */
  async getMaterialConditions(division) {
    const result = await this.pool.query(
      `SELECT * FROM material_condition_config 
       WHERE division = $1 AND is_active = true
       ORDER BY display_order, display_name`,
      [division]
    );
    return result.rows;
  }

  /**
   * Get all material conditions across all divisions (for dropdown aggregation)
   */
  async getAllMaterialConditions() {
    const result = await this.pool.query(
      `SELECT DISTINCT display_name FROM material_condition_config 
       WHERE is_active = true
       ORDER BY display_name`
    );
    return result.rows.map(row => row.display_name);
  }

  /**
   * Create a new material condition for a division
   */
  async createMaterialCondition(division, conditionData) {
    const { condition_code, condition_name, display_name, description = '' } = conditionData;
    
    const result = await this.pool.query(
      `INSERT INTO material_condition_config 
       (division, condition_code, condition_name, display_name, description) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [division, condition_code, condition_name, display_name, description]
    );
    return result.rows[0];
  }

  /**
   * Update a material condition
   * Also updates existing data in fp_material_percentages and fp_product_group_unified
   */
  async updateMaterialCondition(division, conditionCode, updates) {
    const { condition_name, display_name, description, is_active, display_order } = updates;
    
    // First, get the old display name
    const oldResult = await this.pool.query(
      `SELECT display_name FROM material_condition_config WHERE division = $1 AND condition_code = $2`,
      [division, conditionCode]
    );
    const oldDisplayName = oldResult.rows[0]?.display_name;
    
    // Update material_condition_config
    const result = await this.pool.query(
      `UPDATE material_condition_config 
       SET condition_name = COALESCE($3, condition_name),
           display_name = COALESCE($4, display_name),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active),
           display_order = COALESCE($7, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE division = $1 AND condition_code = $2
       RETURNING *`,
      [division, conditionCode, condition_name, display_name, description, is_active, display_order]
    );
    
    // If display_name changed, update existing data in fp_material_percentages
    if (display_name && oldDisplayName && display_name !== oldDisplayName) {
      try {
        // Update fp_material_percentages.process column using class fpPool
        const updateMpResult = await this.fpPool.query(
          `UPDATE fp_material_percentages 
           SET process = $2, updated_at = CURRENT_TIMESTAMP
           WHERE process = $1`,
          [oldDisplayName, display_name]
        );
        console.log(`Updated ${updateMpResult.rowCount} rows in fp_material_percentages (process: ${oldDisplayName} → ${display_name})`);
        
        // Update fp_product_group_unified.process column
        const updatePguResult = await this.fpPool.query(
          `UPDATE fp_product_group_unified 
           SET process = $2, updated_at = CURRENT_TIMESTAMP
           WHERE process = $1`,
          [oldDisplayName, display_name]
        );
        console.log(`Updated ${updatePguResult.rowCount} rows in fp_product_group_unified (process: ${oldDisplayName} → ${display_name})`);
      } catch (cascadeError) {
        console.error('Error cascading material condition rename:', cascadeError);
        // Don't throw - the main update succeeded, cascade is secondary
      }
    }
    
    return result.rows[0];
  }

  /**
   * Delete a material condition from a division
   */
  async deleteMaterialCondition(division, conditionCode) {
    const result = await this.pool.query(
      `DELETE FROM material_condition_config 
       WHERE division = $1 AND condition_code = $2
       RETURNING *`,
      [division, conditionCode]
    );
    return result.rows[0];
  }

  /**
   * Check if a material condition exists in a division
   */
  async exists(division, conditionCode) {
    const result = await this.pool.query(
      `SELECT 1 FROM material_condition_config 
       WHERE division = $1 AND condition_code = $2`,
      [division, conditionCode]
    );
    return result.rows.length > 0;
  }

  async close() {
    await this.pool.end();
    await this.fpPool.end();
  }
}

module.exports = new MaterialConditionService();
