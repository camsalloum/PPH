const { Pool } = require('pg');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * ProductGroupMasterService
 * Unified service for managing ALL product group master data
 * - Material percentages (dynamic columns)
 * - Pricing actual (cached from fp_actualcommon)
 * - Pricing rounded (user-entered)
 * 
 * Key Features:
 * - Single source of truth
 * - Dynamic column management via ALTER TABLE
 * - Synchronized with fp_raw_product_groups (division-specific)
 * - Caching for performance
 */
class ProductGroupMasterService {
  constructor() {
    // Auth database for config tables
    this.authPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.CONFIG_DB_NAME || 'ip_auth_database',
    });
    
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get division-specific database pool
   */
  getDivisionPool(division) {
    const divCode = (division || 'fp').toUpperCase();
    return getDivisionPool(divCode);
  }

  /**
   * Get table name for division
   */
  getTableName(division) {
    const divCode = (division || 'fp').toLowerCase();
    return `${divCode}_product_group_master`;
  }

  /**
   * Clear cache for division
   */
  clearCache(division) {
    const cacheKey = `master_${division}`;
    this.cache.delete(cacheKey);
    this.cache.delete(`material_columns_${division}`);
    this.cache.delete(`pricing_fields_${division}`);
    logger.info(`Cache cleared for division: ${division}`);
  }

  /**
   * Get active product groups from fp_raw_product_groups
   */
  async getActiveProductGroups(division) {
    try {
      const pool = this.getDivisionPool(division);
      const result = await pool.query(`
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
   * Get all product group master data for division
   * Returns data for ALL active product groups (from mappings)
   * Initializes missing rows with defaults
   */
  async getProductGroupMaster(division) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const cacheKey = `master_${divCode}`;
      
      // Check cache
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
        logger.debug(`Returning cached master data for ${divCode}`);
        return cached.data;
      }

      // Get active product groups from mappings
      const activeGroups = await this.getActiveProductGroups(divCode);
      
      // Get existing master data
      const pool = this.getDivisionPool(divCode);
      const tableName = this.getTableName(divCode);
      
      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY product_group`);
      
      // Build map of existing data
      const existingData = {};
      result.rows.forEach(row => {
        const normalizedPG = row.product_group.toLowerCase().trim();
        existingData[normalizedPG] = row;
      });
      
      // Merge: ensure all active groups have entries
      const completeData = activeGroups.map(productGroup => {
        const normalizedPG = productGroup.toLowerCase().trim();
        if (existingData[normalizedPG]) {
          return existingData[normalizedPG];
        } else {
          // Return default empty row
          return {
            product_group: productGroup,
            pe_percentage: 0,
            bopp_percentage: 0,
            pet_percentage: 0,
            alu_percentage: 0,
            paper_percentage: 0,
            pvc_pet_percentage: 0,
            mix_percentage: 0,
            material: '',
            process: '',
            asp_actual: null,
            morm_actual: null,
            rm_actual: null,
            actual_year: null,
            actual_last_calculated_at: null,
            asp_round: null,
            morm_round: null,
            rm_round: null,
            created_at: new Date(),
            updated_at: new Date()
          };
        }
      });
      
      // Cache result
      this.cache.set(cacheKey, {
        data: completeData,
        timestamp: Date.now()
      });
      
      logger.info(`Loaded ${completeData.length} product group master records for ${divCode}`);
      return completeData;
    } catch (error) {
      logger.error('Error fetching product group master:', error);
      throw error;
    }
  }

  /**
   * Save product group master data
   * Saves material percentages + pricing in single transaction
   * Dynamically handles all active material columns
   */
  async saveProductGroupMaster(division, productGroup, data) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const pool = this.getDivisionPool(divCode);
      const tableName = this.getTableName(divCode);
      
      // Force refresh material columns cache to get latest after any renames
      this.clearCache(divCode);
      const materialColumns = await this.getMaterialColumns(divCode);
      
      // Build column lists and values dynamically
      const materialFields = materialColumns.map(col => `${col.column_code}_percentage`);
      const materialPlaceholders = materialFields.map((_, i) => `$${i + 2}`);
      const materialUpdateSet = materialFields.map(field => `${field} = EXCLUDED.${field}`).join(', ');
      
      // Build complete column and value lists
      const allFields = ['product_group', ...materialFields, 'material', 'process', 'asp_round', 'morm_round', 'rm_round'];
      const placeholderCount = allFields.length;
      const allPlaceholders = Array.from({ length: placeholderCount }, (_, i) => `$${i + 1}`);
      
      const query = `
        INSERT INTO ${tableName} 
        (${allFields.join(', ')})
        VALUES (${allPlaceholders.join(', ')})
        ON CONFLICT (product_group) 
        DO UPDATE SET 
          ${materialUpdateSet},
          material = EXCLUDED.material,
          process = EXCLUDED.process,
          asp_round = EXCLUDED.asp_round,
          morm_round = EXCLUDED.morm_round,
          rm_round = EXCLUDED.rm_round,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      // Build values array dynamically
      const values = [productGroup];
      
      // Add material percentage values (match column order from materialColumns)
      materialColumns.forEach(col => {
        const fieldName = `${col.column_code}_percentage`;
        values.push(data[fieldName] || 0);
      });
      
      // Add other fields
      values.push(
        data.material || '',
        data.process || '',
        data.asp_round || data.aspRound || null,
        data.morm_round || data.mormRound || null,
        data.rm_round || data.rmRound || null
      );
      
      const result = await pool.query(query, values);
      
      // Sync to fp_product_group_unified for KPI queries (if FP division)
      if (divCode === 'fp') {
        await this.syncToProductGroupUnified(productGroup, data.material, data.process);
      }
      
      logger.info(`Saved product group master for: ${productGroup} (${divCode})`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving product group master:', error);
      throw error;
    }
  }

  /**
   * Sync material and process to fp_product_group_unified table for KPI queries
   */
  async syncToProductGroupUnified(productGroup, material, process) {
    try {
      const pool = this.getDivisionPool('fp');
      
      // Cast to text to avoid type mismatch in concatenation
      const materialVal = material || '';
      const processVal = process || '';
      const pgCombined = materialVal && processVal ? `${materialVal} ${processVal}` : null;
      
      // Update fp_product_group_unified with material/process from material_percentages
      await pool.query(`
        UPDATE fp_product_group_unified
        SET 
          material = $2,
          process = $3,
          pg_combined = $4,
          updated_at = NOW()
        WHERE UPPER(TRIM(display_name)) = UPPER(TRIM($1))
          AND division = 'FP'
      `, [productGroup, materialVal || null, processVal || null, pgCombined]);
      
      logger.info(`Synced to fp_product_group_unified: ${productGroup} -> ${material}/${process}`);
    } catch (error) {
      logger.error('Error syncing to product_group_unified:', error);
      // Don't throw - this is a secondary operation
    }
  }

  /**
   * Get active material columns from config
   */
  async getMaterialColumns(division) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const cacheKey = `material_columns_${divCode}`;
      
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
        return cached.data;
      }

      const result = await this.authPool.query(`
        SELECT * FROM material_column_config 
        WHERE division = $1 AND is_active = TRUE 
        ORDER BY display_order, column_code
      `, [divCode]);
      
      this.cache.set(cacheKey, {
        data: result.rows,
        timestamp: Date.now()
      });
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching material columns:', error);
      throw error;
    }
  }

  /**
   * Add new material column (DYNAMIC!)
   * Executes ALTER TABLE to add physical column
   */
  async addMaterialColumn(division, columnData) {
    const client = await this.authPool.connect();
    const divCode = (division || 'fp').toLowerCase();
    const pool = this.getDivisionPool(divCode);
    
    try {
      await client.query('BEGIN');
      
      const { display_name, column_code, description } = columnData;
      const columnCodeLower = column_code.toLowerCase();
      
      // Step 1: Check if column already exists in config
      const existingConfig = await client.query(
        'SELECT * FROM material_column_config WHERE division = $1 AND column_code = $2',
        [divCode, columnCodeLower]
      );
      
      if (existingConfig.rows.length > 0) {
        throw new Error(`Column "${display_name}" already exists in configuration`);
      }
      
      // Step 2: Get max display order
      const maxOrder = await client.query(
        'SELECT COALESCE(MAX(display_order), 0) as max_order FROM material_column_config WHERE division = $1',
        [divCode]
      );
      const displayOrder = maxOrder.rows[0].max_order + 1;
      
      // Step 3: Add to config table
      await client.query(`
        INSERT INTO material_column_config 
        (division, column_code, display_name, description, display_order)
        VALUES ($1, $2, $3, $4, $5)
      `, [divCode, columnCodeLower, display_name, description || '', displayOrder]);
      
      // Step 4: ALTER TABLE - Add physical column
      const tableName = this.getTableName(divCode);
      const columnName = `${columnCodeLower}_percentage`;
      
      await pool.query(`
        ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS ${columnName} NUMERIC(5,2) DEFAULT 0 
        CHECK (${columnName} >= 0 AND ${columnName} <= 100)
      `);
      
      await client.query('COMMIT');
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`✅ Added material column: ${display_name} (${columnCodeLower}) to ${divCode}`);
      return { success: true, column_code: columnCodeLower, display_name };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding material column:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update/rename material column
   * Updates display name in config and optionally renames database column
   */
  async updateMaterialColumn(division, oldColumnCode, updateData) {
    const divCode = (division || 'fp').toLowerCase();
    const pool = this.getDivisionPool(divCode);
    const client = await this.authPool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { displayName, columnCode } = updateData;
      const oldCode = oldColumnCode.toLowerCase();
      const newCode = (columnCode || oldColumnCode).toLowerCase();
      
      // Step 1: Update config
      const updateQuery = `
        UPDATE material_column_config 
        SET display_name = $1, 
            column_code = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE division = $3 AND column_code = $4
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, [displayName, newCode, divCode, oldCode]);
      
      if (result.rows.length === 0) {
        throw new Error(`Material column ${oldColumnCode} not found for division ${divCode}`);
      }
      
      // Step 2: If column code changed, rename database column
      if (oldCode !== newCode) {
        const tableName = this.getTableName(divCode);
        const oldColumnName = `${oldCode}_percentage`;
        const newColumnName = `${newCode}_percentage`;
        
        // Check if old column exists
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        `, [tableName, oldColumnName]);
        
        if (columnCheck.rows.length > 0) {
          await pool.query(`
            ALTER TABLE ${tableName}
            RENAME COLUMN ${oldColumnName} TO ${newColumnName}
          `);
          
          logger.info(`✅ Renamed column: ${oldColumnName} → ${newColumnName} in ${tableName}`);
        }
      }
      
      await client.query('COMMIT');
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`✅ Updated material column: ${oldColumnCode} → ${newCode} (${displayName})`);
      return { success: true, column: result.rows[0] };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating material column:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove material column
   * Soft delete: sets is_active=false (keeps data)
   * Hard delete option: drops physical column
   */
  async removeMaterialColumn(division, columnCode, hardDelete = false) {
    const divCode = (division || 'fp').toLowerCase();
    const pool = this.getDivisionPool(divCode);
    const client = await this.authPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Step 1: Check if last active column
      const activeCount = await client.query(
        'SELECT COUNT(*) as count FROM material_column_config WHERE division = $1 AND is_active = TRUE',
        [divCode]
      );
      
      if (parseInt(activeCount.rows[0].count) <= 1) {
        throw new Error('Cannot remove last material column');
      }
      
      // Step 2: Soft delete in config
      await client.query(
        'UPDATE material_column_config SET is_active = FALSE WHERE division = $1 AND column_code = $2',
        [divCode, columnCode.toLowerCase()]
      );
      
      // Step 3: Hard delete - drop physical column (optional)
      if (hardDelete) {
        const tableName = this.getTableName(divCode);
        const columnName = `${columnCode.toLowerCase()}_percentage`;
        
        await pool.query(`
          ALTER TABLE ${tableName}
          DROP COLUMN IF EXISTS ${columnName}
        `);
        
        logger.info(`✅ Dropped physical column: ${columnName} from ${tableName}`);
      }
      
      await client.query('COMMIT');
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`✅ Removed material column: ${columnCode} from ${divCode} (hardDelete=${hardDelete})`);
      return { success: true, column_code: columnCode, hard_delete: hardDelete };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error removing material column:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save rounded pricing values to master table AND year-specific pricing_rounding table
   */
  async saveRoundedPricing(division, year, roundedData) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const pool = this.getDivisionPool(divCode);
      const tableName = this.getTableName(divCode);
      
      let updatedCount = 0;
      
      // Update each product group's rounded values
      for (const item of roundedData) {
        const { productGroup, aspRound, mormRound, rmRound } = item;
        
        if (!productGroup) continue;
        
        // 1. Update the master table (for display purposes)
        await pool.query(`
          UPDATE ${tableName}
          SET 
            asp_round = $1,
            morm_round = $2,
            rm_round = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE product_group = $4
        `, [aspRound, mormRound, rmRound, productGroup]);
        
        // 2. ALSO update the year-specific pricing_rounding table (used by budget calculations)
        // This ensures budget Amount/MoRM calculations use the correct pricing
        if (year && divCode === 'fp') {
          await pool.query(`
            INSERT INTO fp_product_group_pricing_rounding 
              (division, product_group, year, asp_round, morm_round, rm_round)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (division, product_group, year)
            DO UPDATE SET
              asp_round = EXCLUDED.asp_round,
              morm_round = EXCLUDED.morm_round,
              rm_round = EXCLUDED.rm_round
          `, [divCode.toUpperCase(), productGroup, year, aspRound, mormRound, rmRound]);
        }
        
        updatedCount++;
      }
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`Saved rounded pricing for ${updatedCount} product groups (${divCode}, year: ${year}) - updated both master and pricing_rounding tables`);
      return { success: true, updatedCount };
      
    } catch (error) {
      logger.error('Error saving rounded pricing:', error);
      throw error;
    }
  }

  /**
   * Refresh actual pricing from materialized view (93% faster!)
   * Uses pre-calculated fp_product_group_pricing_mv instead of scanning fp_actualcommon
   */
  async refreshActualPricing(division, year = null) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const pool = this.getDivisionPool(divCode);
      const tableName = this.getTableName(divCode);
      
      // Get target year
      let targetYear = year;
      if (!targetYear) {
        // Get max year from materialized view (much faster)
        const maxYearResult = await pool.query('SELECT MAX(year) as max_year FROM fp_product_group_pricing_mv');
        targetYear = maxYearResult.rows[0].max_year;
      }
      
      // Get excluded PG Combines
      const excludedResult = await pool.query(`
        SELECT DISTINCT LOWER(TRIM(pg_combine)) as pg_combine
        FROM fp_raw_product_groups
        WHERE is_unmapped = true AND pg_combine IS NOT NULL
      `);
      const excludedPGCombines = excludedResult.rows.map(r => r.pg_combine);
      
      let excludeClause = "AND LOWER(m.product_group) != 'not in pg'";
      if (excludedPGCombines.length > 0) {
        const placeholders = excludedPGCombines.map((_, i) => `$${i + 2}`).join(', ');
        excludeClause += ` AND LOWER(m.product_group) NOT IN (${placeholders})`;
      }
      
      // Update from pre-calculated materialized view (93% faster than raw query!)
      const query = `
        UPDATE ${tableName} m
        SET 
          asp_actual = ROUND(mv.asp_actual::numeric, 4),
          morm_actual = ROUND(mv.morm_actual::numeric, 4),
          rm_actual = ROUND(mv.rm_actual::numeric, 4),
          actual_last_calculated_at = CURRENT_TIMESTAMP,
          actual_year = $1
        FROM fp_product_group_pricing_mv mv
        WHERE m.product_group = mv.product_group
          AND mv.year = $1
          ${excludeClause}
      `;
      
      const params = [targetYear, ...excludedPGCombines];
      await pool.query(query, params);
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`✅ Refreshed actual pricing for ${divCode} (year: ${targetYear}) from materialized view`);
      return { success: true, year: targetYear };
      
    } catch (error) {
      logger.error('Error refreshing actual pricing:', error);
      throw error;
    }
  }

  /**
   * Synchronize master data with mappings
   * Ensures all active PG Combines have rows in master table
   */
  async syncWithMappings(division) {
    try {
      const divCode = (division || 'fp').toLowerCase();
      const pool = this.getDivisionPool(divCode);
      const tableName = this.getTableName(divCode);
      
      const activeGroups = await this.getActiveProductGroups(divCode);
      
      let syncedCount = 0;
      for (const productGroup of activeGroups) {
        const existing = await pool.query(
          `SELECT product_group FROM ${tableName} WHERE product_group = $1`,
          [productGroup]
        );
        
        if (existing.rows.length === 0) {
          // Initialize with defaults
          await pool.query(`
            INSERT INTO ${tableName} (product_group)
            VALUES ($1)
          `, [productGroup]);
          syncedCount++;
        }
      }
      
      // Clear cache
      this.clearCache(divCode);
      
      logger.info(`✅ Synchronized ${syncedCount} new product groups for ${divCode}`);
      return { success: true, synced_count: syncedCount };
      
    } catch (error) {
      logger.error('Error synchronizing with mappings:', error);
      throw error;
    }
  }
}

module.exports = new ProductGroupMasterService();
