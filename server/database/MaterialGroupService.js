const { Pool } = require('pg');
require('dotenv').config();

/**
 * Service for managing Material Group Configuration
 * Material Groups are used in the MATERIAL column dropdown (e.g., PE, Non PE, Other)
 */
class MaterialGroupService {
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
   * Get all material groups for a division
   */
  async getMaterialGroups(division) {
    const result = await this.pool.query(
      `SELECT * FROM material_group_config 
       WHERE division = $1 AND is_active = true
       ORDER BY display_order, display_name`,
      [division]
    );
    return result.rows;
  }

  /**
   * Get all material groups across all divisions (for dropdown aggregation)
   */
  async getAllMaterialGroups() {
    const result = await this.pool.query(
      `SELECT DISTINCT display_name FROM material_group_config 
       WHERE is_active = true
       ORDER BY display_name`
    );
    return result.rows.map(row => row.display_name);
  }

  /**
   * Create a new material group for a division
   */
  async createMaterialGroup(division, groupData) {
    const { group_code, group_name, display_name, description = '' } = groupData;
    
    const result = await this.pool.query(
      `INSERT INTO material_group_config 
       (division, group_code, group_name, display_name, description) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [division, group_code, group_name, display_name, description]
    );
    return result.rows[0];
  }

  /**
   * Update a material group
   * Also updates existing data in fp_material_percentages and fp_product_group_unified
   */
  async updateMaterialGroup(division, groupCode, updates) {
    const { group_name, display_name, description, is_active, display_order } = updates;
    
    // First, get the old display name
    const oldResult = await this.pool.query(
      `SELECT display_name FROM material_group_config WHERE division = $1 AND group_code = $2`,
      [division, groupCode]
    );
    const oldDisplayName = oldResult.rows[0]?.display_name;
    
    // Update material_group_config
    const result = await this.pool.query(
      `UPDATE material_group_config 
       SET group_name = COALESCE($3, group_name),
           display_name = COALESCE($4, display_name),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active),
           display_order = COALESCE($7, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE division = $1 AND group_code = $2
       RETURNING *`,
      [division, groupCode, group_name, display_name, description, is_active, display_order]
    );
    
    // If display_name changed, update existing data in fp_material_percentages
    if (display_name && oldDisplayName && display_name !== oldDisplayName) {
      try {
        // Update fp_material_percentages.material column using class fpPool
        const updateMpResult = await this.fpPool.query(
          `UPDATE fp_material_percentages 
           SET material = $2, updated_at = CURRENT_TIMESTAMP
           WHERE material = $1`,
          [oldDisplayName, display_name]
        );
        console.log(`Updated ${updateMpResult.rowCount} rows in fp_material_percentages (material: ${oldDisplayName} → ${display_name})`);
        
        // Update fp_product_group_unified.material column
        const updatePguResult = await this.fpPool.query(
          `UPDATE fp_product_group_unified 
           SET material = $2, updated_at = CURRENT_TIMESTAMP
           WHERE material = $1`,
          [oldDisplayName, display_name]
        );
        console.log(`Updated ${updatePguResult.rowCount} rows in fp_product_group_unified (material: ${oldDisplayName} → ${display_name})`);
      } catch (cascadeError) {
        console.error('Error cascading material group rename:', cascadeError);
        // Don't throw - the main update succeeded, cascade is secondary
      }
    }
    
    return result.rows[0];
  }

  /**
   * Delete a material group from a division
   */
  async deleteMaterialGroup(division, groupCode) {
    const result = await this.pool.query(
      `DELETE FROM material_group_config 
       WHERE division = $1 AND group_code = $2
       RETURNING *`,
      [division, groupCode]
    );
    return result.rows[0];
  }

  /**
   * Check if a material group exists in a division
   */
  async exists(division, groupCode) {
    const result = await this.pool.query(
      `SELECT 1 FROM material_group_config 
       WHERE division = $1 AND group_code = $2`,
      [division, groupCode]
    );
    return result.rows.length > 0;
  }

  async close() {
    await this.pool.end();
    await this.fpPool.end();
  }
}

module.exports = new MaterialGroupService();
