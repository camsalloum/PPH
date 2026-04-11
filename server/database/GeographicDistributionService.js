const { Pool } = require('pg');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const { pool } = require('./config');
const WorldCountriesService = require('./WorldCountriesService');

class GeographicDistributionService {
  constructor() {
    // Default pool for FP, will be overridden per-query for other divisions
    this.pool = pool;
  }

  /**
   * Get excluded product groups from fp_product_group_exclusions table
   * @param {string} division - Division code (FP, etc.)
   * @returns {Promise<string[]>} Array of excluded product group names
   */
  async getExcludedProductGroups(division = 'FP') {
    try {
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(`
        SELECT product_group 
        FROM fp_product_group_exclusions 
        WHERE division_code = $1
      `, [division.toUpperCase()]);
      
      const excluded = result.rows.map(row => row.product_group);
      logger.info(`📋 Geographic Distribution using excluded product groups for ${division}:`, excluded);
      return excluded;
    } catch (error) {
      logger.error('Error fetching excluded product groups:', error);
      // Return empty array on error so queries still work
      return [];
    }
  }

  /**
   * Get the appropriate database pool for a division
   */
  getPool(division) {
    if (!division || division.toUpperCase() === 'FP') {
      return pool;
    }
    return getDivisionPool(division.toUpperCase());
  }

  /**
   * Get table name for a division
   * MIGRATED: Use fp_actualcommon for FP division (same as ProductPerformanceService)
   */
  getTableName(division) {
    const div = (division || 'FP').toUpperCase();
    // Use actualcommon tables - following 'avoid views' architecture
    return `${div.toLowerCase()}_actualcommon`;
  }
  
  /**
   * Get column mappings for the current table
   * fp_actualcommon uses: year, month_no, country, amount
   */
  getColumnMappings(division) {
    const div = (division || 'FP').toUpperCase();
    // fp_actualcommon column names (same as ProductPerformanceService)
    if (div === 'FP') {
      return {
        countryColumn: 'country',  // fp_actualcommon uses 'country' not 'countryname'
        yearColumn: 'year',
        monthColumn: 'month_no',
        amountColumn: 'amount'
      };
    }
    // Raw table column names for other divisions
    return {
      countryColumn: 'country',
      yearColumn: 'year',
      monthColumn: 'month_no',
      amountColumn: 'amount'
    };
  }

  /**
   * Get geographic distribution data for a specific period with comparison
   * MIGRATED: Uses fp_actualcommon directly (same pattern as ProductPerformanceService)
   * @param {Object} filters - Filter parameters
   * @param {string} filters.division - Division (FP, SB, TF, HCM)
   * @param {number} filters.year - Year (e.g., 2025)
   * @param {string[]} filters.months - Array of month names (e.g., ['January', 'February'])
   * @param {string} filters.type - Data type ('Actual' or 'Budget') - Note: fp_actualcommon only has Actual
   * @param {boolean} filters.includeComparison - Whether to include previous period data
   * @returns {Promise<Object>} Object with country sales and regional data
   */
  async getGeographicDistributionData(filters) {
    try {
      const { division = 'FP', year, months, type = 'Actual', includeComparison = false } = filters;

      // Convert month names to integers
      const monthIntegers = this.convertMonthsToIntegers(months);
      
      if (monthIntegers.length === 0) {
        throw new Error('No valid months provided. Please use month names (January, February) or numbers (1-12)');
      }

      // Get division-specific pool and table name
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      const columnMappings = this.getColumnMappings(division);
      const { countryColumn, yearColumn, monthColumn, amountColumn } = columnMappings;

      // MIGRATED: fp_actualcommon only has Actual data
      // For Budget/Estimate/Forecast, we'd need fp_budget_unified (future enhancement)
      // Currently, we query fp_actualcommon which has the 'amount' column directly
      // Uses LEFT JOIN pattern for exclusions (same as ProductGroupDataService)
      
      const params = [year, monthIntegers];
      
      const query = `
        SELECT 
          d.${countryColumn} as countryname,
          SUM(d.${amountColumn}) as total_sales
        FROM ${tableName} d
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE d.${yearColumn} = $1
          AND d.${monthColumn} = ANY($2)
          AND d.${countryColumn} IS NOT NULL
          AND TRIM(d.${countryColumn}) != ''
          AND e.product_group IS NULL
        GROUP BY d.${countryColumn}
        HAVING SUM(d.${amountColumn}) > 0
        ORDER BY total_sales DESC
      `;
      
      logger.info('🔍 Fetching geographic distribution data:', { 
        division, year, months, monthIntegers, type, tableName
      });
      logger.info('🔍 Query params:', { params, query: query.substring(0, 300) });
      
      const result = await divisionPool.query(query, params);
      
      logger.info(`✅ Retrieved ${result.rows.length} countries for geographic distribution`);
      
      // Log sample data for debugging
      if (result.rows.length > 0) {
        logger.info('📊 Sample country data:', result.rows.slice(0, 3).map(row => ({
          country: row.countryname,
          sales: row.total_sales
        })));
      } else {
        logger.warn('⚠️ No country data found for the given parameters');
      }
      
      // Process the data
      const countrySales = result.rows.map(row => ({
        name: row.countryname,
        value: parseFloat(row.total_sales) || 0
      }));

      // Calculate regional distribution
      const regionalSales = this.calculateRegionalSales(countrySales);
      
      // Calculate local vs export
      const totalSales = countrySales.reduce((sum, country) => sum + country.value, 0);
      const localSales = regionalSales['UAE'] || 0;
      const exportSales = totalSales - localSales;
      
      const localPercentage = totalSales > 0 ? (localSales / totalSales * 100) : 0;
      const exportPercentage = 100 - localPercentage;

      const currentData = {
        countrySales,
        regionalSales,
        totalSales,
        localSales,
        exportSales,
        // Absolute amounts for convenience
        localAmount: localSales,
        exportAmount: exportSales,
        localPercentage,
        exportPercentage,
        regionalPercentages: this.calculateRegionalPercentages(regionalSales, totalSales)
      };

      // If comparison is requested, fetch previous period data
      if (includeComparison) {
        const previousYear = parseInt(year) - 1;
        
        // Use same query with previous year - LEFT JOIN handles exclusions automatically
        const previousParams = [previousYear, monthIntegers];
        
        const previousResult = await divisionPool.query(query, previousParams);
        
        const previousCountrySales = previousResult.rows.map(row => ({
          name: row.countryname,
          value: parseFloat(row.total_sales) || 0
        }));

        const previousRegionalSales = this.calculateRegionalSales(previousCountrySales);
        const previousTotalSales = previousCountrySales.reduce((sum, country) => sum + country.value, 0);
        
        // Calculate growth percentages for each region
        const regionalGrowth = {};
        Object.keys(regionalSales).forEach(region => {
          const currentValue = regionalSales[region] || 0;
          const previousValue = previousRegionalSales[region] || 0;
          
          if (previousValue > 0) {
            regionalGrowth[region] = ((currentValue - previousValue) / previousValue * 100);
          } else if (currentValue > 0) {
            regionalGrowth[region] = 100; // New region with sales
          } else {
            regionalGrowth[region] = 0;
          }
        });

        // Calculate growth for Local (UAE) and Export totals
        const currentLocal = regionalSales['UAE'] || 0;
        const previousLocal = previousRegionalSales['UAE'] || 0;
        let localGrowth = 0;
        if (previousLocal > 0) {
          localGrowth = ((currentLocal - previousLocal) / previousLocal) * 100;
        } else if (currentLocal > 0) {
          localGrowth = 100;
        }

        const currentExport = (totalSales || 0) - currentLocal;
        const previousExport = (previousTotalSales || 0) - previousLocal;
        let exportGrowth = 0;
        if (previousExport > 0) {
          exportGrowth = ((currentExport - previousExport) / previousExport) * 100;
        } else if (currentExport > 0) {
          exportGrowth = 100;
        }

        currentData.regionalGrowth = regionalGrowth;
        currentData.localGrowth = localGrowth;
        currentData.exportGrowth = exportGrowth;
        // Include absolute amounts and deltas
        currentData.previousLocalAmount = previousLocal;
        currentData.previousExportAmount = previousExport;
        currentData.localAmountDelta = (currentLocal - previousLocal);
        currentData.exportAmountDelta = (currentExport - previousExport);
        currentData.previousPeriod = {
          year: previousYear,
          regionalSales: previousRegionalSales,
          totalSales: previousTotalSales
        };
      }

      return currentData;
      
    } catch (error) {
      logger.error('❌ Error fetching geographic distribution data:', error);
      throw error;
    }
  }

  /**
   * Convert month names to integers
   */
  convertMonthsToIntegers(months) {
    const monthMapping = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4,
      'May': 5, 'June': 6, 'July': 7, 'August': 8,
      'September': 9, 'October': 10, 'November': 11, 'December': 12,
      'Q1': [1, 2, 3], 'Q2': [4, 5, 6], 'Q3': [7, 8, 9], 'Q4': [10, 11, 12],
      'HY1': [1, 2, 3, 4, 5, 6], 'HY2': [7, 8, 9, 10, 11, 12]
    };

    const result = [];
    months.forEach(month => {
      // Handle month names
      if (monthMapping[month]) {
        if (Array.isArray(monthMapping[month])) {
          result.push(...monthMapping[month]);
        } else {
          result.push(monthMapping[month]);
        }
      } 
      // Handle integers (already converted by frontend)
      else if (typeof month === 'number' && month >= 1 && month <= 12) {
        result.push(month);
      }
      // Handle string numbers
      else if (typeof month === 'string' && !isNaN(month) && parseInt(month) >= 1 && parseInt(month) <= 12) {
        result.push(parseInt(month));
      }
      else {
        logger.warn(`⚠️ Invalid month value: ${month} (type: ${typeof month})`);
      }
    });

    const uniqueResult = [...new Set(result)]; // Remove duplicates
    logger.info(`🔍 Converted months: ${JSON.stringify(months)} → ${JSON.stringify(uniqueResult)}`);
    return uniqueResult;
  }

  /**
   * Calculate regional sales from country data
   */
  calculateRegionalSales(countrySales) {
    const regionalSales = {
      'UAE': 0,
      'Arabian Peninsula': 0,
      'West Asia': 0,
      'Levant': 0,
      'North Africa': 0,
      'Southern Africa': 0,
      'Europe': 0,
      'Americas': 0,
      'Asia-Pacific': 0,
      'Unassigned': 0
    };

    countrySales.forEach(country => {
      const region = this.getRegionForCountry(country.name);
      if (region && regionalSales[region] !== undefined) {
        regionalSales[region] += country.value;
      } else {
        regionalSales['Unassigned'] += country.value;
      }
    });

    return regionalSales;
  }

  /**
   * Calculate regional percentages
   */
  calculateRegionalPercentages(regionalSales, totalSales) {
    const regionalPercentages = {};
    Object.keys(regionalSales).forEach(region => {
      regionalPercentages[region] = totalSales > 0 ? (regionalSales[region] / totalSales * 100) : 0;
    });
    return regionalPercentages;
  }

  /**
   * Enhanced getRegionForCountry with comprehensive world countries database
   */
  getRegionForCountry(countryName) {
    if (!countryName) return 'Unassigned';
    
    // Use WorldCountriesService for smart assignment
    const worldCountriesService = new WorldCountriesService();
    const assignment = worldCountriesService.smartCountryAssignment(countryName);
    
    return assignment.region;
  }
}

module.exports = GeographicDistributionService;
