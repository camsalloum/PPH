const { pool } = require('./config');
const logger = require('../utils/logger');

/**
 * ProductPerformanceService
 * 
 * Service for querying product performance data from fp_actualcommon table
 * Uses fp_product_group_unified for material/process lookups
 * Uses fp_product_group_exclusions for dynamic product group exclusions
 * Used by KPI Executive Summary dashboard for product-level metrics
 */
class ProductPerformanceService {
  constructor() {
    this.pool = pool;
  }

  /**
   * Get excluded product groups from fp_product_group_exclusions table
   * This is the single source of truth for exclusions across all KPI services
   */
  async getExcludedProductGroups(divisionCode = 'FP') {
    try {
      const result = await this.pool.query(
        'SELECT product_group FROM fp_product_group_exclusions WHERE division_code = $1',
        [divisionCode.toUpperCase()]
      );
      const excluded = result.rows.map(r => r.product_group);
      if (excluded.length > 0) {
        logger.info(`📋 Dynamic exclusions for ${divisionCode}:`, excluded);
      }
      return excluded;
    } catch (e) {
      logger.warn('⚠️ Could not fetch product group exclusions, using defaults:', e.message);
      return ['Raw Materials', 'N/A']; // Fallback defaults
    }
  }

  // Month name to number mapping
  static monthMapping = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };

  /**
   * Convert month names to integers for database queries
   * Handles arrays of month names or numbers
   */
  convertMonthsToIntegers(months) {
    if (!Array.isArray(months)) {
      months = [months];
    }
    
    return months.map(month => {
      // If already a number, return it
      if (typeof month === 'number') {
        return month >= 1 && month <= 12 ? month : null;
      }
      
      // If string, try to convert
      if (typeof month === 'string') {
        const trimmed = month.trim();
        
        // Check if it's a numeric string
        if (/^\d+$/.test(trimmed)) {
          const num = parseInt(trimmed, 10);
          return num >= 1 && num <= 12 ? num : null;
        }
        
        // Look up month name
        return ProductPerformanceService.monthMapping[trimmed] || null;
      }
      
      return null;
    }).filter(m => m !== null);
  }

  /**
   * Get product performance data for a specific period
   * Uses fp_actualcommon with JOIN to fp_product_group_unified
   * Exclusions from fp_product_group_exclusions table (dynamic)
   * 
   * @param {Object} filters - Filter parameters
   * @param {number} filters.year - Year (e.g., 2025)
   * @param {string[]} filters.months - Array of month names (e.g., ['January', 'February'])
   * @param {string} filters.type - Data type ('Actual' or 'Budget')
   * @param {string[]} filters.excludedCategories - Categories to exclude (optional, overrides dynamic)
   * @returns {Promise<Array>} Array of product data with aggregated values
   */
  async getProductPerformanceData(filters) {
    try {
      const { year, months, type } = filters;
      
      // Get dynamic exclusions from database (or use provided override)
      const excludedCategories = filters.excludedCategories || await this.getExcludedProductGroups('FP');

      // Convert month names to integers
      const monthIntegers = this.convertMonthsToIntegers(months);
      
      if (monthIntegers.length === 0) {
        throw new Error('No valid months provided. Please use month names (January, February) or numbers (1-12)');
      }

      // Handle "Estimate" or "Forecast" type - query both Actual and Estimate/Forecast
      const normalizedType = type.toUpperCase();
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      
      // MIGRATED TO fp_actualcommon + fp_product_group_unified (January 26, 2026)
      // Direct query to fp_actualcommon with JOIN to get material/process
      // Uses admin_division_code per copilot instructions (includes both FP and BF data)
      // Aggregates by values_type (KGS, AMOUNT, MORM)
      // Uses LEFT JOIN pattern for exclusions (same as ProductGroupDataService)
      const query = `
        SELECT 
          d.pgcombine as productgroup,
          pg.material,
          pg.process,
          v.values_type,
          SUM(v.value) as total_value
        FROM fp_actualcommon d
        LEFT JOIN fp_product_group_unified pg 
          ON UPPER(TRIM(d.pgcombine)) = pg.normalized_name
          AND pg.division = d.admin_division_code
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        CROSS JOIN LATERAL (
          VALUES 
            ('KGS', d.qty_kgs),
            ('AMOUNT', d.amount),
            ('MORM', d.morm)
        ) AS v(values_type, value)
        WHERE d.year = $1
          AND d.month_no = ANY($2)
          AND d.pgcombine IS NOT NULL
          AND LOWER(d.pgcombine) != 'not in pg'
          AND e.product_group IS NULL
          AND (pg.process IS NULL OR LOWER(pg.process) != 'other')
        GROUP BY d.pgcombine, pg.material, pg.process, v.values_type
        ORDER BY d.pgcombine, v.values_type;
      `;

      const params = [year, monthIntegers];
      
      
      const result = await this.pool.query(query, params);
      
      
      
      return result.rows;
    } catch (error) {
      logger.error('❌ Error fetching product performance data:', error);
      throw error;
    }
  }

  /**
   * Get product performance data with comparison to previous period
   * 
   * @param {Object} currentPeriod - Current period filters
   * @param {Object} comparisonPeriod - Comparison period filters (optional)
   * @returns {Promise<Object>} Object with products array including current and previous values
   */
  async getProductPerformanceWithComparison(currentPeriod, comparisonPeriod = null) {
    try {
      // Fetch current period data
      const currentData = await this.getProductPerformanceData(currentPeriod);
      
      // Transform current data to product map
      const productMap = this.transformToProductMap(currentData);
      
      // Fetch comparison period data if provided
      if (comparisonPeriod) {
        const previousData = await this.getProductPerformanceData(comparisonPeriod);
        const previousMap = this.transformToProductMap(previousData);
        
        // Merge previous period data
        Object.keys(productMap).forEach(productName => {
          const product = productMap[productName];
          const prevProduct = previousMap[productName];
          
          if (prevProduct) {
            product.kgs_prev = prevProduct.kgs || 0;
            product.sales_prev = prevProduct.sales || 0;
            product.morm_prev = prevProduct.morm || 0;
            
            // Calculate growth percentages
            product.kgs_growth = this.calculateGrowth(product.kgs, product.kgs_prev);
            product.sales_growth = this.calculateGrowth(product.sales, product.sales_prev);
            product.morm_growth = this.calculateGrowth(product.morm, product.morm_prev);
          } else {
            product.kgs_prev = 0;
            product.sales_prev = 0;
            product.morm_prev = 0;
            product.kgs_growth = null;
            product.sales_growth = null;
            product.morm_growth = null;
          }
        });
      }
      
      // Convert map to sorted array (by sales descending)
      const products = Object.values(productMap)
        .sort((a, b) => (b.sales || 0) - (a.sales || 0));
      
      
      
      return products;
    } catch (error) {
      logger.error('❌ Error fetching product performance with comparison:', error);
      throw error;
    }
  }

  /**
   * Get process category aggregations
   * Uses fp_actualcommon with JOIN to fp_product_group_unified
   * Exclusions from fp_product_group_exclusions table (dynamic)
   * 
   * @param {Object} filters - Filter parameters
   * @returns {Promise<Object>} Process categories with aggregated metrics
   */
  async getProcessCategories(filters) {
    try {
      const { year, months, type } = filters;
      
      // Get dynamic exclusions from database (or use provided override)
      const excludedCategories = filters.excludedCategories || await this.getExcludedProductGroups('FP');

      // Convert month names to integers
      const monthIntegers = this.convertMonthsToIntegers(months);
      
      if (monthIntegers.length === 0) {
        throw new Error('No valid months provided');
      }

      // Handle "Estimate" or "Forecast" type - query both Actual and Estimate/Forecast
      const normalizedType = type.toUpperCase();
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      
      // MIGRATED TO fp_actualcommon + fp_product_group_unified (January 26, 2026)
      const query = `
        SELECT 
          pg.process,
          v.values_type,
          SUM(v.value) as total_value
        FROM fp_actualcommon d
        LEFT JOIN fp_product_group_unified pg 
          ON UPPER(TRIM(d.pgcombine)) = pg.normalized_name
          AND pg.division = d.admin_division_code
        CROSS JOIN LATERAL (
          VALUES 
            ('KGS', d.qty_kgs),
            ('AMOUNT', d.amount),
            ('MORM', d.morm)
        ) AS v(values_type, value)
        WHERE d.year = $1
          AND d.month_no = ANY($2)
          AND pg.process IS NOT NULL
          AND TRIM(pg.process) != ''
          AND LOWER(pg.process) != 'other'
          AND d.pgcombine IS NOT NULL
          AND LOWER(d.pgcombine) != 'not in pg'
          AND LOWER(d.pgcombine) NOT IN (${excludedCategories.map((_, i) => `LOWER($${i + 3})`).join(', ')})
        GROUP BY pg.process, v.values_type
        ORDER BY pg.process, v.values_type;
      `;

      const params = [year, monthIntegers, ...excludedCategories];
      const result = await this.pool.query(query, params);
      
      // Transform to category map
      const categoryMap = {};
      result.rows.forEach(row => {
        if (!row.process) return;
        
        if (!categoryMap[row.process]) {
          categoryMap[row.process] = { kgs: 0, sales: 0, morm: 0 };
        }
        
        const category = categoryMap[row.process];
        const valueType = (row.values_type || '').toUpperCase();
        if (valueType === 'KGS') category.kgs = parseFloat(row.total_value || 0);
        if (valueType === 'AMOUNT') category.sales = parseFloat(row.total_value || 0);
        if (valueType === 'MORM') category.morm = parseFloat(row.total_value || 0);
      });
      
      
      return categoryMap;
    } catch (error) {
      logger.error('❌ Error fetching process categories:', error);
      throw error;
    }
  }

  /**
   * Get material category aggregations
   * Uses fp_actualcommon with JOIN to fp_product_group_unified
   * Exclusions from fp_product_group_exclusions table (dynamic)
   * 
   * @param {Object} filters - Filter parameters
   * @returns {Promise<Object>} Material categories with aggregated metrics
   */
  async getMaterialCategories(filters) {
    try {
      const { year, months, type } = filters;
      
      // Get dynamic exclusions from database (or use provided override)
      const excludedCategories = filters.excludedCategories || await this.getExcludedProductGroups('FP');

      // Convert month names to integers
      const monthIntegers = this.convertMonthsToIntegers(months);
      
      if (monthIntegers.length === 0) {
        throw new Error('No valid months provided');
      }

      // Handle "Estimate" or "Forecast" type - query both Actual and Estimate/Forecast
      const normalizedType = type.toUpperCase();
      const isEstimateType = normalizedType.includes('ESTIMATE') || normalizedType.includes('FORECAST');
      
      // MIGRATED TO fp_actualcommon + fp_product_group_unified (January 26, 2026)
      const query = `
        SELECT 
          pg.material,
          v.values_type,
          SUM(v.value) as total_value
        FROM fp_actualcommon d
        LEFT JOIN fp_product_group_unified pg 
          ON UPPER(TRIM(d.pgcombine)) = pg.normalized_name
          AND pg.division = d.admin_division_code
        CROSS JOIN LATERAL (
          VALUES 
            ('KGS', d.qty_kgs),
            ('AMOUNT', d.amount),
            ('MORM', d.morm)
        ) AS v(values_type, value)
        WHERE d.year = $1
          AND d.month_no = ANY($2)
          AND pg.material IS NOT NULL
          AND TRIM(pg.material) != ''
          AND LOWER(pg.material) != 'other'
          AND d.pgcombine IS NOT NULL
          AND LOWER(d.pgcombine) != 'not in pg'
          AND LOWER(d.pgcombine) NOT IN (${excludedCategories.map((_, i) => `LOWER($${i + 3})`).join(', ')})
        GROUP BY pg.material, v.values_type
        ORDER BY pg.material, v.values_type;
      `;

      const params = [year, monthIntegers, ...excludedCategories];
      const result = await this.pool.query(query, params);
      
      // Transform to category map
      const categoryMap = {};
      result.rows.forEach(row => {
        if (!row.material) return;
        
        if (!categoryMap[row.material]) {
          categoryMap[row.material] = { kgs: 0, sales: 0, morm: 0 };
        }
        
        const category = categoryMap[row.material];
        const valueType = (row.values_type || '').toUpperCase();
        if (valueType === 'KGS') category.kgs = parseFloat(row.total_value || 0);
        if (valueType === 'AMOUNT') category.sales = parseFloat(row.total_value || 0);
        if (valueType === 'MORM') category.morm = parseFloat(row.total_value || 0);
      });
      
      
      return categoryMap;
    } catch (error) {
      logger.error('❌ Error fetching material categories:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive product performance including products, process categories, and material categories
   * 
   * @param {Object} currentPeriod - Current period filters
   * @param {Object} comparisonPeriod - Comparison period filters (optional)
   * @returns {Promise<Object>} Complete product performance data
   */
  async getComprehensiveProductPerformance(currentPeriod, comparisonPeriod = null) {
    try {
      
      // Fetch all data in parallel for better performance
      const [products, processCategories, materialCategories] = await Promise.all([
        this.getProductPerformanceWithComparison(currentPeriod, comparisonPeriod),
        this.getProcessCategories(currentPeriod),
        this.getMaterialCategories(currentPeriod)
      ]);
      
      const result = {
        products,
        processCategories,
        materialCategories,
        summary: {
          totalProducts: products.length,
          totalKgs: products.reduce((sum, p) => sum + (p.kgs || 0), 0),
          totalSales: products.reduce((sum, p) => sum + (p.sales || 0), 0),
          totalMorm: products.reduce((sum, p) => sum + (p.morm || 0), 0),
          processCount: Object.keys(processCategories).length,
          materialCount: Object.keys(materialCategories).length
        }
      };
      
      
      return result;
    } catch (error) {
      logger.error('❌ Error fetching comprehensive product performance:', error);
      throw error;
    }
  }

  // ========== HELPER METHODS ==========

  /**
   * Transform database rows to product map
   * Groups by product name and organizes KGS, Amount, MoRM
   */
  transformToProductMap(rows) {
    const productMap = {};
    
    
    rows.forEach((row, index) => {
      if (!row.productgroup) return;
      
      if (!productMap[row.productgroup]) {
        productMap[row.productgroup] = {
          name: row.productgroup,
          material: row.material || '',
          process: row.process || '',
          kgs: 0,
          sales: 0,
          morm: 0
        };
      }
      
      const product = productMap[row.productgroup];
      
      // Update material/process if not set (take first non-null value)
      if (!product.material && row.material) product.material = row.material;
      if (!product.process && row.process) product.process = row.process;
      
      // Aggregate values by type (case-insensitive)
      const value = parseFloat(row.total_value || 0);
      const valueType = (row.values_type || '').toUpperCase();
      
      
      if (valueType === 'KGS') {
        product.kgs += value;
      } else if (valueType === 'AMOUNT') {
        product.sales += value;
      } else if (valueType === 'MORM') {
        product.morm += value;
      }
      
    });
    
    
    return productMap;
  }

  /**
   * Calculate growth percentage between current and previous values
   */
  calculateGrowth(current, previous) {
    if (!previous || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  /**
   * Format period object to readable string
   */
  formatPeriod(period) {
    if (!period) return 'N/A';
    const monthsStr = period.months && period.months.length > 0 ? period.months.join(', ') : 'All';
    return `${period.year} ${monthsStr} (${period.type})`;
  }
}

module.exports = new ProductPerformanceService();

