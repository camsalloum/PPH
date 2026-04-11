/**
 * Unified Product Group Master Service
 * 
 * Single source of truth for all product group master data:
 * - Material percentages (FULLY DYNAMIC from material_column_config)
 * - Pricing actual (cached)
 * - Pricing rounded (user-entered)
 * 
 * Features:
 * - Fully dynamic columns - reads actual column names from material_column_config
 * - Synchronized with fp_raw_product_groups (division-specific)
 * - Automatic exclusion handling
 * - Supports column renaming without code changes
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const UNIFIED_TABLE = 'fp_product_group_master';
const ACTUAL_DATA_TABLE = 'fp_actualcommon';

class UnifiedProductGroupService {
  constructor() {
    // Division database pool
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: 'fp_database',
    });
    
    // Auth database pool (for config tables)
    this.authPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: 'ip_auth_database',
    });
  }

  /**
   * Get active product groups from fp_raw_product_groups
   * ONE SOURCE OF TRUTH for which product groups exist
   */
  async getActiveProductGroups() {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT INITCAP(LOWER(TRIM(pg_combine))) as product_group
        FROM fp_raw_product_groups
        WHERE is_unmapped = false 
          AND pg_combine IS NOT NULL
          AND TRIM(pg_combine) != ''
        ORDER BY product_group
      `);
      
      return result.rows.map(r => r.product_group);
    } catch (error) {
      logger.error('Error fetching active product groups:', error);
      throw error;
    }
  }

  /**
   * Get material column configuration (what columns to display)
   */
  async getMaterialColumns() {
    try {
      const result = await this.authPool.query(`
        SELECT column_code, display_name, is_active, display_order
        FROM material_column_config
        WHERE division = 'fp' AND is_active = true
        ORDER BY display_order, display_name
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching material columns:', error);
      throw error;
    }
  }

  /**
   * Get ALL product group master data (unified)
   * Returns: material %, pricing actual, pricing rounded, all in one
   */
  async getAllProductGroupMaster() {
    try {
      // Get active product groups
      const activeGroups = await this.getActiveProductGroups();
      
      // Get column configuration
      const columns = await this.getMaterialColumns();
      
      // Get all master data
      const result = await this.pool.query(`
        SELECT * FROM ${UNIFIED_TABLE}
        ORDER BY product_group
      `);
      
      // Build complete dataset with active groups
      const existingData = {};
      result.rows.forEach(row => {
        existingData[row.product_group.toLowerCase()] = row;
      });
      
      // Ensure all active groups have entries (initialize missing)
      const completeData = activeGroups.map(productGroup => {
        const normalized = productGroup.toLowerCase();
        if (existingData[normalized]) {
          // Merge standard + custom materials
          const row = existingData[normalized];
          const materials = this._expandMaterials(row, columns);
          return { ...row, materials };
        } else {
          // Initialize new product group
          return this._createEmptyProductGroup(productGroup, columns);
        }
      });
      
      return completeData;
    } catch (error) {
      logger.error('Error fetching product group master data:', error);
      throw error;
    }
  }

  /**
   * Get single product group master data
   */
  async getProductGroupMaster(productGroup) {
    try {
      const columns = await this.getMaterialColumns();
      
      const result = await this.pool.query(
        `SELECT * FROM ${UNIFIED_TABLE} WHERE product_group = $1`,
        [productGroup]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const materials = this._expandMaterials(row, columns);
        return { ...row, materials };
      } else {
        return this._createEmptyProductGroup(productGroup, columns);
      }
    } catch (error) {
      logger.error('Error fetching product group master:', error);
      throw error;
    }
  }

  /**
   * Save product group master data (material %, pricing, all fields)
   * FULLY DYNAMIC - reads column names from material_column_config
   */
  async saveProductGroupMaster(productGroup, data) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get ACTIVE column configuration - this defines what columns exist
      const columns = await this.getMaterialColumns();
      
      // Build dynamic column list from config
      // Each column in material_column_config corresponds to {column_code}_percentage in the table
      const materialColumnNames = columns.map(col => `${col.column_code}_percentage`);
      
      // Build values for each material column
      const materialValues = columns.map(col => {
        // Try to find the value by display_name first, then column_code
        const displayName = col.display_name;
        const columnCode = col.column_code;
        
        let value = 0;
        if (data.percentages) {
          // Check various key formats
          value = parseFloat(
            data.percentages[displayName] || 
            data.percentages[displayName.toUpperCase()] ||
            data.percentages[displayName.toLowerCase()] ||
            data.percentages[columnCode] ||
            data.percentages[columnCode.toUpperCase()] ||
            data.percentages[columnCode.toLowerCase()] ||
            data.percentages[`${columnCode}_percentage`] ||
            0
          ) || 0;
        }
        return value;
      });
      
      // Build the INSERT query dynamically
      const allColumns = ['product_group', ...materialColumnNames, 'material', 'process', 'asp_round', 'morm_round', 'rm_round'];
      const placeholders = allColumns.map((_, i) => `$${i + 1}`);
      
      // Build the ON CONFLICT SET clause dynamically
      const materialUpdateClauses = materialColumnNames.map(col => `${col} = EXCLUDED.${col}`);
      const otherUpdateClauses = [
        'material = EXCLUDED.material',
        'process = EXCLUDED.process',
        'asp_round = EXCLUDED.asp_round',
        'morm_round = EXCLUDED.morm_round',
        'rm_round = EXCLUDED.rm_round',
        'updated_at = CURRENT_TIMESTAMP'
      ];
      
      const query = `
        INSERT INTO ${UNIFIED_TABLE} (${allColumns.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (product_group) DO UPDATE SET
          ${[...materialUpdateClauses, ...otherUpdateClauses].join(',\n          ')}
        RETURNING *
      `;
      
      const values = [
        productGroup,
        ...materialValues,
        data.material || '',
        data.process || '',
        data.asp_round || null,
        data.morm_round || null,
        data.rm_round || null
      ];
      
      logger.debug('Dynamic save query:', { columns: allColumns, valueCount: values.length });
      
      const result = await client.query(query, values);
      
      await client.query('COMMIT');
      
      logger.info(`Product group master saved: ${productGroup}`);
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error saving product group master:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refresh actual pricing from fp_actualcommon (cached calculation)
   */
  async refreshActualPricing(year = null) {
    try {
      const targetYear = year || await this._getCurrentMaxYear();
      
      logger.info(`Refreshing actual pricing for year ${targetYear}...`);
      
      // Get exclusions
      const excludedResult = await this.pool.query(`
        SELECT DISTINCT LOWER(TRIM(pg_combine)) as pg_combine
        FROM fp_raw_product_groups
        WHERE is_unmapped = true AND pg_combine IS NOT NULL
      `);
      const excludedPGCombines = excludedResult.rows.map(r => r.pg_combine);
      
      // Build exclusion clause
      let excludeClause = "AND LOWER(TRIM(pgcombine)) != 'not in pg'";
      let params = [targetYear];
      if (excludedPGCombines.length > 0) {
        const placeholders = excludedPGCombines.map((_, i) => `$${i + 2}`).join(', ');
        excludeClause += ` AND LOWER(TRIM(pgcombine)) NOT IN (${placeholders})`;
        params = [targetYear, ...excludedPGCombines];
      }
      
      const query = `
        WITH actual_pricing AS (
          SELECT 
            INITCAP(LOWER(TRIM(pgcombine))) as product_group,
            SUM(qty_kgs) as total_kgs,
            SUM(amount) as total_amount,
            SUM(morm) as total_morm
          FROM ${ACTUAL_DATA_TABLE}
          WHERE year = $1 
            AND pgcombine IS NOT NULL 
            AND TRIM(pgcombine) != ''
            ${excludeClause}
          GROUP BY pgcombine
        )
        UPDATE ${UNIFIED_TABLE} m
        SET 
          asp_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_amount / p.total_kgs)::numeric, 4) ELSE 0 END,
          morm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND((p.total_morm / p.total_kgs)::numeric, 4) ELSE 0 END,
          rm_actual = CASE WHEN p.total_kgs > 0 THEN ROUND(((p.total_amount - p.total_morm) / p.total_kgs)::numeric, 4) ELSE 0 END,
          actual_last_calculated_at = CURRENT_TIMESTAMP,
          actual_year = $1
        FROM actual_pricing p
        WHERE m.product_group = p.product_group
      `;
      
      const result = await this.pool.query(query, params);
      
      logger.info(`Refreshed actual pricing for ${result.rowCount} product groups`);
      return { success: true, updated: result.rowCount, year: targetYear };
      
    } catch (error) {
      logger.error('Error refreshing actual pricing:', error);
      throw error;
    }
  }

  /**
   * Add material column (updates config only, no ALTER TABLE needed!)
   */
  async addMaterialColumn(columnData) {
    const client = await this.authPool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { column_code, display_name, description } = columnData;
      
      // Check if already exists
      const existing = await client.query(
        `SELECT * FROM material_column_config 
         WHERE division = 'fp' AND column_code = $1`,
        [column_code]
      );
      
      if (existing.rows.length > 0) {
        if (!existing.rows[0].is_active) {
          // Reactivate if was soft-deleted
          await client.query(
            `UPDATE material_column_config 
             SET is_active = true, updated_at = CURRENT_TIMESTAMP
             WHERE division = 'fp' AND column_code = $1`,
            [column_code]
          );
          await client.query('COMMIT');
          logger.info(`Material column reactivated: ${column_code}`);
          return { success: true, action: 'reactivated' };
        } else {
          throw new Error(`Material column ${column_code} already exists`);
        }
      }
      
      // Get max display_order
      const maxOrder = await client.query(
        `SELECT COALESCE(MAX(display_order), 0) as max_order 
         FROM material_column_config WHERE division = 'fp'`
      );
      
      // Insert new column config
      await client.query(
        `INSERT INTO material_column_config 
         (division, column_code, display_name, description, display_order, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        ['fp', column_code, display_name, description, maxOrder.rows[0].max_order + 1]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Material column added: ${column_code} (${display_name})`);
      logger.info('✅ No ALTER TABLE needed - custom columns stored in JSONB!');
      
      return { success: true, action: 'created' };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding material column:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove material column (soft delete from config)
   */
  async removeMaterialColumn(column_code) {
    try {
      // Soft delete only - data preserved in custom_materials JSON
      const result = await this.authPool.query(
        `UPDATE material_column_config 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE division = 'fp' AND column_code = $1
         RETURNING *`,
        [column_code]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Material column ${column_code} not found`);
      }
      
      logger.info(`Material column removed (soft delete): ${column_code}`);
      logger.info('✅ Data preserved in custom_materials JSONB');
      
      return { success: true, action: 'deactivated' };
      
    } catch (error) {
      logger.error('Error removing material column:', error);
      throw error;
    }
  }

  // Private helper methods
  
  _expandMaterials(row, columns) {
    const materials = {};
    
    // Add configured materials
    (columns || []).forEach(col => {
      const fieldName = `${col.column_code}_percentage`;
      materials[col.column_code] = parseFloat(row[fieldName]) || 0;
    });
    
    // Add custom materials from JSON
    if (row.custom_materials) {
      const custom = typeof row.custom_materials === 'string' 
        ? JSON.parse(row.custom_materials) 
        : row.custom_materials;
      Object.assign(materials, custom);
    }
    
    return materials;
  }
  
  _createEmptyProductGroup(productGroup, columns) {
    const materials = {};
    columns.forEach(col => {
      materials[col.column_code] = 0;
    });
    
    return {
      product_group: productGroup,
      ...columns.reduce((acc, col) => {
        acc[`${col.column_code}_percentage`] = 0;
        return acc;
      }, {}),
      custom_materials: {},
      material: '',
      process: '',
      asp_actual: null,
      morm_actual: null,
      rm_actual: null,
      asp_round: null,
      morm_round: null,
      rm_round: null,
      custom_pricing: {},
      materials
    };
  }
  
  async _getCurrentMaxYear() {
    const result = await this.pool.query(
      `SELECT MAX(year) as max_year FROM ${ACTUAL_DATA_TABLE}`
    );
    return result.rows[0].max_year || new Date().getFullYear();
  }
}

module.exports = new UnifiedProductGroupService();
