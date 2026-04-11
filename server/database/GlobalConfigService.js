const { pool } = require('./config');
const logger = require('../utils/logger');

class GlobalConfigService {
  constructor() {
    this.pool = pool;
  }

  /**
   * Get global configuration value by key
   * @param {string} key - Configuration key
   * @returns {Promise<any>} - Configuration value (parsed JSON)
   */
  async getConfig(key) {
    try {
      const query = 'SELECT config_value FROM global_config WHERE config_key = $1';
      const result = await this.pool.query(query, [key]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const configValue = result.rows[0].config_value;
      
      // Try to parse as JSON, fallback to string if not valid JSON
      try {
        return JSON.parse(configValue);
      } catch (parseError) {
        // If not valid JSON, return as string
        return configValue;
      }
    } catch (error) {
      logger.error('Error getting global config:', error);
      throw error;
    }
  }

  /**
   * Set global configuration value
   * @param {string} key - Configuration key
   * @param {any} value - Configuration value (will be JSON stringified)
   * @param {string} description - Optional description
   * @returns {Promise<Object>} - Updated configuration record
   */
  async setConfig(key, value, description = null) {
    try {
      // Convert value to JSON string
      const configValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      const query = `
        INSERT INTO global_config (config_key, config_value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = EXCLUDED.config_value,
          description = COALESCE(EXCLUDED.description, global_config.description),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await this.pool.query(query, [key, configValue, description]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error setting global config:', error);
      throw error;
    }
  }

  /**
   * Delete global configuration
   * @param {string} key - Configuration key to delete
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteConfig(key) {
    try {
      const query = 'DELETE FROM global_config WHERE config_key = $1';
      const result = await this.pool.query(query, [key]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting global config:', error);
      throw error;
    }
  }

  /**
   * Get all global configurations
   * @returns {Promise<Object>} - Object with all configurations
   */
  async getAllConfigs() {
    try {
      const query = 'SELECT config_key, config_value, description FROM global_config ORDER BY config_key';
      const result = await this.pool.query(query);
      
      const configs = {};
      result.rows.forEach(row => {
        try {
          configs[row.config_key] = JSON.parse(row.config_value);
        } catch (parseError) {
          configs[row.config_key] = row.config_value;
        }
      });
      
      return configs;
    } catch (error) {
      logger.error('Error getting all global configs:', error);
      throw error;
    }
  }

  /**
   * Check if global config table exists
   * @returns {Promise<boolean>} - True if table exists
   */
  async tableExists() {
    try {
      const query = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'global_config'
        );
      `;
      const result = await this.pool.query(query);
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Error checking if global_config table exists:', error);
      return false;
    }
  }
}

module.exports = GlobalConfigService;
