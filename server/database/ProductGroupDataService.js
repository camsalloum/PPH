// Use shared fp_database pool with env-configured credentials
const { fpPool } = require('./fp_database_config');
const logger = require('../utils/logger');

// Budget structure cutoff year - starting from this year, budget data uses separate tables
const BUDGET_CUTOFF_YEAR = 2025;

class ProductGroupDataService {
  
  // Month mapping for period handling
  static monthMapping = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };

  // Quarter and half-year mappings
  static quarterMonths = {
    'Q1': [1, 2, 3],
    'Q2': [4, 5, 6],
    'Q3': [7, 8, 9],
    'Q4': [10, 11, 12]
  };

  static halfYearMonths = {
    'HY1': [1, 2, 3, 4, 5, 6],
    'HY2': [7, 8, 9, 10, 11, 12]
  };

  static fullYearMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /**
   * Get months array based on period selection
   */
  static getMonthsArray(period) {
    if (period === 'FY' || period === 'Year') {
      return this.fullYearMonths;
    }
    if (this.quarterMonths[period]) {
      return this.quarterMonths[period];
    }
    if (this.halfYearMonths[period]) {
      return this.halfYearMonths[period];
    }
    if (this.monthMapping[period]) {
      return [this.monthMapping[period]];
    }
    if (Array.isArray(period)) {
      // Accept arrays of month names, numeric strings, or numbers
      const normalized = period.map(m => {
        if (typeof m === 'number') { return m; }
        if (typeof m === 'string') {
          const trimmed = m.trim();
          if (/^\d+$/.test(trimmed)) {
            const num = parseInt(trimmed, 10);
            return num >= 1 && num <= 12 ? num : null;
          }
          return this.monthMapping[trimmed] || null;
        }
        return null;
      }).filter(n => typeof n === 'number' && n >= 1 && n <= 12);
      return normalized;
    }
    return [];
  }

  /**
   * Get product groups data aggregated by product group
   * For Budget type with year >= BUDGET_CUTOFF_YEAR, queries fp_budget_unified
   */
  static async getProductGroupsData(year, months, type) {
    try {
      const monthsArray = this.getMonthsArray(months);
      if (monthsArray.length === 0) {
        throw new Error('Invalid months specification');
      }

      const normalizedType = type.toUpperCase();
      const isBudgetType = normalizedType === 'BUDGET';
      const yearNum = parseInt(year);
      const budgetType = isBudgetType ? 'DIVISIONAL' : normalizedType;
      
      // For Budget type with year >= BUDGET_CUTOFF_YEAR, use fp_budget_unified
      if (isBudgetType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getProductGroupsFromBudgetUnified(yearNum, monthsArray, budgetType);
      }

      // Handle "Estimate" or "Forecast": use fp_budget_unified
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      if (isEstimateType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getProductGroupsFromBudgetUnified(yearNum, monthsArray, normalizedType);
      }
      
      // For Actual data, use fp_actualcommon (which contains ONLY actual data)
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      // FIXED: fp_actualcommon has direct columns qty_kgs, amount, morm (no values/values_type pivoting needed)
      // NOTE: fp_actualcommon contains ONLY actual data, no data_type column needed
      const query = `
        SELECT 
          INITCAP(LOWER(pgcombine)) as productgroup,
          SUM(qty_kgs) as kgs,
          SUM(amount) as sales,
          SUM(morm) as morm
        FROM fp_actualcommon
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE year = $1 
          AND month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(admin_division_code)) = 'FP'
          AND pgcombine IS NOT NULL
          AND LOWER(pgcombine) != 'not in pg'
          AND e.product_group IS NULL
        GROUP BY INITCAP(LOWER(pgcombine))
        ORDER BY productgroup
      `;

      // fp_actualcommon query only needs year and months (no type parameter)
      const params = [year, ...monthsArray];
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting product groups data:', error);
      throw error;
    }
  }

  /**
   * Get product groups data from fp_budget_unified table (for year >= BUDGET_CUTOFF_YEAR)
   * 
   * SPECIAL CASE: For 2025, DIVISIONAL budget doesn't exist (only SALES_REP).
   * If DIVISIONAL query returns empty for 2025, fallback to aggregating SALES_REP data.
   * For 2026+, DIVISIONAL and SALES_REP are separate and should NOT fallback.
   * 
   * @private
   */
  static async _getProductGroupsFromBudgetUnified(year, monthsArray, budgetType = 'BUDGET') {
    try {
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      const query = `
        SELECT 
          INITCAP(LOWER(b.pgcombine)) as productgroup,
          SUM(b.qty_kgs) as kgs,
          SUM(b.amount) as sales,
          SUM(b.morm) as morm
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE b.budget_year = $1 
          AND b.month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(b.division_code)) = 'FP'
          AND UPPER(b.budget_type) = UPPER($${monthsArray.length + 2})
          AND (CASE WHEN UPPER($${monthsArray.length + 2}) IN ('DIVISIONAL','SALES_REP') THEN b.is_budget = true ELSE true END)
          AND b.pgcombine IS NOT NULL
          AND e.product_group IS NULL
        GROUP BY INITCAP(LOWER(b.pgcombine))
        ORDER BY productgroup
      `;

      const params = [year, ...monthsArray, budgetType];
      const client = await fpPool.connect();
      
      try {
        logger.info('Querying fp_budget_unified', { year, months: monthsArray, budgetType });
        const result = await client.query(query, params);
        logger.info(`Retrieved ${result.rows.length} product groups from fp_budget_unified`);
        
        // SPECIAL CASE: 2025 has no DIVISIONAL budget, only SALES_REP
        // If DIVISIONAL query returns empty for 2025, use SALES_REP as fallback
        if (result.rows.length === 0 && year === 2025 && budgetType.toUpperCase() === 'DIVISIONAL') {
          logger.info('2025 DIVISIONAL budget empty, falling back to SALES_REP aggregation');
          
          const fallbackQuery = `
            SELECT 
              INITCAP(LOWER(b.pgcombine)) as productgroup,
              SUM(b.qty_kgs) as kgs,
              SUM(b.amount) as sales,
              SUM(b.morm) as morm
            FROM fp_budget_unified b
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = 'FP'
            WHERE b.budget_year = $1 
              AND b.month_no IN (${monthsPlaceholder})
              AND UPPER(TRIM(b.division_code)) = 'FP'
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND b.is_budget = true
              AND b.pgcombine IS NOT NULL
              AND e.product_group IS NULL
            GROUP BY INITCAP(LOWER(b.pgcombine))
            ORDER BY productgroup
          `;
          
          const fallbackParams = [year, ...monthsArray];
          const fallbackResult = await client.query(fallbackQuery, fallbackParams);
          logger.info(`2025 fallback: Retrieved ${fallbackResult.rows.length} product groups from SALES_REP`);
          return fallbackResult.rows;
        }
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting product groups from fp_budget_unified:', error);
      throw error;
    }
  }

  /**
   * Get material categories data
   * For Budget type with year >= BUDGET_CUTOFF_YEAR, queries fp_budget_unified
   */
  static async getMaterialCategoriesData(year, months, type) {
    try {
      const monthsArray = this.getMonthsArray(months);
      if (monthsArray.length === 0) {
        throw new Error('Invalid months specification');
      }

      const normalizedType = type.toUpperCase();
      const isBudgetType = normalizedType === 'BUDGET';
      const yearNum = parseInt(year);
      const budgetType = isBudgetType ? 'DIVISIONAL' : normalizedType;
      
      // For Budget type with year >= BUDGET_CUTOFF_YEAR, use fp_budget_unified
      if (isBudgetType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getMaterialCategoriesFromBudgetUnified(yearNum, monthsArray, budgetType);
      }

      // Handle "Estimate" or "Forecast": use fp_budget_unified
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      if (isEstimateType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getMaterialCategoriesFromBudgetUnified(yearNum, monthsArray, normalizedType);
      }
      
      // For Actual data, use fp_actualcommon
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      // FIXED: fp_actualcommon has direct columns, no data_type needed
      const query = `
        SELECT 
          m.material,
          SUM(a.qty_kgs) as kgs,
          SUM(a.amount) as sales,
          SUM(a.morm) as morm
        FROM fp_actualcommon a
        LEFT JOIN fp_product_group_master m
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(m.product_group))
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE a.year = $1 
          AND a.month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(a.admin_division_code)) = 'FP'
          AND a.pgcombine IS NOT NULL
          AND LOWER(a.pgcombine) != 'not in pg'
          AND e.product_group IS NULL
          AND m.material IS NOT NULL
          AND TRIM(m.material) != ''
        GROUP BY m.material
        ORDER BY m.material
      `;

      const params = [year, ...monthsArray];
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting material categories data:', error);
      throw error;
    }
  }

  /**
   * Get material categories data from fp_budget_unified table (for year >= BUDGET_CUTOFF_YEAR)
   * @private
   */
  static async _getMaterialCategoriesFromBudgetUnified(year, monthsArray, budgetType = 'BUDGET') {
    try {
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      const query = `
        SELECT 
          m.material,
          SUM(b.qty_kgs) as kgs,
          SUM(b.amount) as sales,
          SUM(b.morm) as morm
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_master m
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(m.product_group))
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE b.budget_year = $1 
          AND b.month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(b.division_code)) = 'FP'
          AND UPPER(b.budget_type) = UPPER($${monthsArray.length + 2})
          AND (CASE WHEN UPPER($${monthsArray.length + 2}) IN ('DIVISIONAL','SALES_REP') THEN b.is_budget = true ELSE true END)
          AND e.product_group IS NULL
          AND m.material IS NOT NULL
          AND TRIM(m.material) != ''
        GROUP BY m.material
        ORDER BY m.material
      `;

      const params = [year, ...monthsArray, budgetType];
      const client = await fpPool.connect();
      
      try {
        logger.info('Querying fp_budget_unified for Material Categories', { year, months: monthsArray, budgetType });
        const result = await client.query(query, params);
        logger.info(`Retrieved ${result.rows.length} material categories from fp_budget_unified`);
        
        // SPECIAL CASE: 2025 has no DIVISIONAL budget, only SALES_REP
        // If DIVISIONAL query returns empty for 2025, use SALES_REP as fallback
        if (result.rows.length === 0 && year === 2025 && budgetType.toUpperCase() === 'DIVISIONAL') {
          logger.info('2025 DIVISIONAL material categories empty, falling back to SALES_REP aggregation');
          
          const fallbackQuery = `
            SELECT 
              m.material,
              SUM(b.qty_kgs) as kgs,
              SUM(b.amount) as sales,
              SUM(b.morm) as morm
            FROM fp_budget_unified b
            LEFT JOIN fp_product_group_master m
              ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(m.product_group))
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = 'FP'
            WHERE b.budget_year = $1 
              AND b.month_no IN (${monthsPlaceholder})
              AND UPPER(TRIM(b.division_code)) = 'FP'
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND b.is_budget = true
              AND e.product_group IS NULL
              AND m.material IS NOT NULL
              AND TRIM(m.material) != ''
            GROUP BY m.material
            ORDER BY m.material
          `;
          
          const fallbackParams = [year, ...monthsArray];
          const fallbackResult = await client.query(fallbackQuery, fallbackParams);
          logger.info(`2025 fallback: Retrieved ${fallbackResult.rows.length} material categories from SALES_REP`);
          return fallbackResult.rows;
        }
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting material categories from divisional budget:', error);
      throw error;
    }
  }

  /**
   * Get process categories data
   * For Budget type with year >= BUDGET_CUTOFF_YEAR, queries fp_budget_unified
   */
  static async getProcessCategoriesData(year, months, type) {
    try {
      const monthsArray = this.getMonthsArray(months);
      if (monthsArray.length === 0) {
        throw new Error('Invalid months specification');
      }

      const normalizedType = type.toUpperCase();
      const isBudgetType = normalizedType === 'BUDGET';
      const yearNum = parseInt(year);
      const budgetType = isBudgetType ? 'DIVISIONAL' : normalizedType;
      
      // For Budget type with year >= BUDGET_CUTOFF_YEAR, use fp_budget_unified
      if (isBudgetType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getProcessCategoriesFromBudgetUnified(yearNum, monthsArray, budgetType);
      }

      // Handle "Estimate" or "Forecast": use fp_budget_unified
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      if (isEstimateType && yearNum >= BUDGET_CUTOFF_YEAR) {
        return await this._getProcessCategoriesFromBudgetUnified(yearNum, monthsArray, normalizedType);
      }
      
      // For Actual data, use fp_actualcommon
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      // FIXED: fp_actualcommon has direct columns, no data_type needed
      const query = `
        SELECT 
          m.process,
          SUM(a.qty_kgs) as kgs,
          SUM(a.amount) as sales,
          SUM(a.morm) as morm
        FROM fp_actualcommon a
        LEFT JOIN fp_product_group_master m
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(m.product_group))
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE a.year = $1 
          AND a.month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(a.admin_division_code)) = 'FP'
          AND a.pgcombine IS NOT NULL
          AND LOWER(a.pgcombine) != 'not in pg'
          AND e.product_group IS NULL
          AND m.process IS NOT NULL
          AND TRIM(m.process) != ''
        GROUP BY m.process
        ORDER BY m.process
      `;

      const params = [year, ...monthsArray];
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting process categories data:', error);
      throw error;
    }
  }

  /**
   * Get process categories data from fp_budget_unified table (for year >= BUDGET_CUTOFF_YEAR)
   * @private
   */
  static async _getProcessCategoriesFromBudgetUnified(year, monthsArray, budgetType = 'BUDGET') {
    try {
      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 2}`).join(',');
      
      const query = `
        SELECT 
          m.process,
          SUM(b.qty_kgs) as kgs,
          SUM(b.amount) as sales,
          SUM(b.morm) as morm
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_master m
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(m.product_group))
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE b.budget_year = $1 
          AND b.month_no IN (${monthsPlaceholder})
          AND UPPER(TRIM(b.division_code)) = 'FP'
          AND UPPER(b.budget_type) = UPPER($${monthsArray.length + 2})
          AND (CASE WHEN UPPER($${monthsArray.length + 2}) IN ('DIVISIONAL','SALES_REP') THEN b.is_budget = true ELSE true END)
          AND e.product_group IS NULL
          AND m.process IS NOT NULL
          AND TRIM(m.process) != ''
        GROUP BY m.process
        ORDER BY m.process
      `;

      const params = [year, ...monthsArray, budgetType];
      const client = await fpPool.connect();
      
      try {
        logger.info('Querying fp_budget_unified for Process Categories', { year, months: monthsArray, budgetType });
        const result = await client.query(query, params);
        logger.info(`Retrieved ${result.rows.length} process categories from fp_budget_unified`);
        
        // SPECIAL CASE: 2025 has no DIVISIONAL budget, only SALES_REP
        // If DIVISIONAL query returns empty for 2025, use SALES_REP as fallback
        if (result.rows.length === 0 && year === 2025 && budgetType.toUpperCase() === 'DIVISIONAL') {
          logger.info('2025 DIVISIONAL process categories empty, falling back to SALES_REP aggregation');
          
          const fallbackQuery = `
            SELECT 
              m.process,
              SUM(b.qty_kgs) as kgs,
              SUM(b.amount) as sales,
              SUM(b.morm) as morm
            FROM fp_budget_unified b
            LEFT JOIN fp_product_group_master m
              ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(m.product_group))
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = 'FP'
            WHERE b.budget_year = $1 
              AND b.month_no IN (${monthsPlaceholder})
              AND UPPER(TRIM(b.division_code)) = 'FP'
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND b.is_budget = true
              AND e.product_group IS NULL
              AND m.process IS NOT NULL
              AND TRIM(m.process) != ''
            GROUP BY m.process
            ORDER BY m.process
          `;
          
          const fallbackParams = [year, ...monthsArray];
          const fallbackResult = await client.query(fallbackQuery, fallbackParams);
          logger.info(`2025 fallback: Retrieved ${fallbackResult.rows.length} process categories from SALES_REP`);
          return fallbackResult.rows;
        }
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting process categories from divisional budget:', error);
      throw error;
    }
  }

  /**
   * Get all unique product groups
   */
  static async getAllProductGroups() {
    try {
      // FIXED: Use fp_actualcommon for actual data (not vw_unified_sales_data)
      const query = `
        SELECT DISTINCT pgcombine as productgroup 
        FROM fp_actualcommon 
        WHERE pgcombine IS NOT NULL
        ORDER BY pgcombine
      `;
      
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query);
        return result.rows.map(row => row.productgroup);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting all product groups:', error);
      throw error;
    }
  }

  /**
   * Get all unique materials from fp_material_percentages
   */
  static async getAllMaterials() {
    try {
      const query = `
        SELECT DISTINCT material 
        FROM fp_material_percentages 
        WHERE material IS NOT NULL AND material != ''
        ORDER BY material
      `;
      
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query);
        return result.rows.map(row => row.material);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting all materials:', error);
      throw error;
    }
  }

  /**
   * Get all unique processes from fp_material_percentages
   */
  static async getAllProcesses() {
    try {
      const query = `
        SELECT DISTINCT process 
        FROM fp_material_percentages 
        WHERE process IS NOT NULL AND process != ''
        ORDER BY process
      `;
      
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query);
        return result.rows.map(row => row.process);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting all processes:', error);
      throw error;
    }
  }

  /**
   * Validate data completeness for a product group
   */
  static async validateProductGroupData(productGroup, year, months, type) {
    try {
      const monthsArray = this.getMonthsArray(months);
      if (monthsArray.length === 0) {
        return false;
      }

      const monthsPlaceholder = monthsArray.map((_, index) => `$${index + 3}`).join(',');
      
      // FIXED: fp_actualcommon has direct columns qty_kgs, amount, morm
      const query = `
        SELECT 
          SUM(qty_kgs) as kgs,
          SUM(amount) as sales,
          SUM(morm) as morm
        FROM fp_actualcommon 
        WHERE pgcombine = $1
          AND year = $2 
          AND month_no IN (${monthsPlaceholder})
      `;

      const params = [productGroup, year, ...monthsArray];
      const client = await fpPool.connect();
      
      try {
        const result = await client.query(query, params);
        const row = result.rows[0];
        
        // Check if at least some non-zero values exist
        return (row.kgs > 0 || row.sales > 0 || row.morm > 0);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error validating product group data:', error);
      return false;
    }
  }
}

module.exports = ProductGroupDataService;







