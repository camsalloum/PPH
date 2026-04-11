const { Pool } = require('pg');

/**
 * Service for managing Process Type Configuration
 * Process Types are used in the PROCESS column dropdown (e.g., Plain, Printed, Laminated)
 */
class ProcessTypeService {
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

  /**
   * Get all process types for a division
   */
  async getProcessTypes(division) {
    const result = await this.pool.query(
      `SELECT * FROM process_type_config 
       WHERE division = $1 AND is_active = true
       ORDER BY display_order, display_name`,
      [division]
    );
    return result.rows;
  }

  /**
   * Get all process types across all divisions (for dropdown aggregation)
   */
  async getAllProcessTypes() {
    const result = await this.pool.query(
      `SELECT DISTINCT display_name FROM process_type_config 
       WHERE is_active = true
       ORDER BY display_name`
    );
    return result.rows.map(row => row.display_name);
  }

  /**
   * Create a new process type for a division
   */
  async createProcessType(division, processData) {
    const { process_code, process_name, display_name, description = '' } = processData;
    
    const result = await this.pool.query(
      `INSERT INTO process_type_config 
       (division, process_code, process_name, display_name, description) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [division, process_code, process_name, display_name, description]
    );
    return result.rows[0];
  }

  /**
   * Update a process type
   */
  async updateProcessType(division, processCode, updates) {
    const { process_name, display_name, description, is_active, display_order } = updates;
    
    const result = await this.pool.query(
      `UPDATE process_type_config 
       SET process_name = COALESCE($3, process_name),
           display_name = COALESCE($4, display_name),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active),
           display_order = COALESCE($7, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE division = $1 AND process_code = $2
       RETURNING *`,
      [division, processCode, process_name, display_name, description, is_active, display_order]
    );
    return result.rows[0];
  }

  /**
   * Delete a process type from a division
   */
  async deleteProcessType(division, processCode) {
    const result = await this.pool.query(
      `DELETE FROM process_type_config 
       WHERE division = $1 AND process_code = $2
       RETURNING *`,
      [division, processCode]
    );
    return result.rows[0];
  }

  /**
   * Check if a process type exists in a division
   */
  async exists(division, processCode) {
    const result = await this.pool.query(
      `SELECT 1 FROM process_type_config 
       WHERE division = $1 AND process_code = $2`,
      [division, processCode]
    );
    return result.rows.length > 0;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new ProcessTypeService();
