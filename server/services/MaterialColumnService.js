const { Pool } = require('pg');

/**
 * Service for managing Material Column Configuration
 * Material Columns are the percentage columns (PE, PP, PET, ALU, etc.)
 */
class MaterialColumnService {
  constructor() {
    // Use ip_auth_database for config tables
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.CONFIG_DB_NAME || 'ip_auth_database',
    });
  }

  // Get material columns for a specific division
  async getMaterialColumns(division) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM material_column_config 
         WHERE division = $1 AND is_active = TRUE 
         ORDER BY display_order, column_name`,
        [division]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching material columns:', error);
      throw error;
    }
  }

  // Get all unique material columns across all divisions
  async getAllMaterialColumns() {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT column_name, display_name 
         FROM material_column_config 
         WHERE is_active = TRUE 
         ORDER BY column_name`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching all material columns:', error);
      throw error;
    }
  }

  // Get all material columns with division info
  async getAllMaterialColumnsWithDivision() {
    try {
      const result = await this.pool.query(
        `SELECT * FROM material_column_config 
         WHERE is_active = TRUE 
         ORDER BY division, display_order, column_name`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching all material columns with division:', error);
      throw error;
    }
  }

  // Create a new material column
  async createMaterialColumn(division, columnData) {
    const { column_code, column_name, display_name, description } = columnData;
    
    try {
      // Check if column already exists
      const existing = await this.pool.query(
        'SELECT * FROM material_column_config WHERE division = $1 AND column_code = $2',
        [division, column_code]
      );

      if (existing.rows.length > 0) {
        throw new Error(`Material column "${column_name}" already exists for division ${division}`);
      }

      // Get the highest display_order for this division
      const maxOrder = await this.pool.query(
        'SELECT COALESCE(MAX(display_order), 0) as max_order FROM material_column_config WHERE division = $1',
        [division]
      );

      const display_order = maxOrder.rows[0].max_order + 1;

      const result = await this.pool.query(
        `INSERT INTO material_column_config 
         (division, column_code, column_name, display_name, description, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [division, column_code, column_name, display_name, description, display_order]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating material column:', error);
      throw error;
    }
  }

  // Delete a material column
  async deleteMaterialColumn(division, columnCode) {
    try {
      // Check how many columns exist for this division
      const count = await this.pool.query(
        'SELECT COUNT(*) FROM material_column_config WHERE division = $1 AND is_active = TRUE',
        [division]
      );

      if (parseInt(count.rows[0].count) <= 1) {
        throw new Error('Cannot delete the last material column. At least one column must remain.');
      }

      const result = await this.pool.query(
        'UPDATE material_column_config SET is_active = FALSE WHERE division = $1 AND column_code = $2 RETURNING *',
        [division, columnCode]
      );

      if (result.rows.length === 0) {
        throw new Error(`Material column not found: ${columnCode}`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error deleting material column:', error);
      throw error;
    }
  }

  // Check if column exists
  async exists(division, columnCode) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM material_column_config WHERE division = $1 AND column_code = $2 AND is_active = TRUE',
        [division, columnCode]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking material column existence:', error);
      throw error;
    }
  }
}

module.exports = new MaterialColumnService();
