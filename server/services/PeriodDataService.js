/**
 * PeriodDataService.js
 * 
 * Fetches period data from Oracle ERP (fp_raw_data)
 * - Years: From fp_raw_data.year1 column (actual years in data)
 * - Months: Hardcoded (January-December)
 * - Types: Hardcoded (Actual, Estimate, Budget, Forecast)
 * 
 * Created: January 6, 2026
 */

const multiTenantPool = require('../database/multiTenantPool');
const logger = require('../utils/logger');

class PeriodDataService {
  /**
   * Cache for period data to avoid repeated DB queries
   */
  periodCache = {
    years: [],
    months: [],
    types: [],
    lastUpdated: null
  };

  /**
   * Get available years from fp_raw_data.year1
   * Returns sorted list of actual years present in Oracle data
   * @param {string} companyCode - REQUIRED: Company code to query tenant database
   * @returns {Promise<Array>} - Sorted array of years from Oracle (e.g., [2019, 2020, ..., 2026])
   */
  async getAvailableYears(companyCode) {
    try {
      if (!companyCode) {
        throw new Error('companyCode is required to fetch years from tenant database');
      }

      const query = `
        SELECT DISTINCT year1
        FROM fp_raw_data
        WHERE year1 IS NOT NULL
        ORDER BY year1 ASC;
      `;

      // Query tenant-specific database
      const result = await multiTenantPool.tenantQuery(companyCode, query);
      
      const years = result.rows.map(row => parseInt(row.year1)).filter(y => !isNaN(y));
      
      logger.info(`✅ Fetched available years from Oracle: ${years.join(', ')}`);
      
      // Update cache
      this.periodCache.years = years;
      this.periodCache.lastUpdated = new Date();
      
      return years;
    } catch (error) {
      logger.error(`❌ Failed to fetch years from fp_raw_data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get hardcoded months
   * Using monthno (1-12) for performance and standardization
   * But returning both monthno and month names for frontend
   * @returns {Array} - Array of month objects: { monthno: 1, name: 'January' }
   */
  getAvailableMonths() {
    const months = [
      { monthno: 1, name: 'January' },
      { monthno: 2, name: 'February' },
      { monthno: 3, name: 'March' },
      { monthno: 4, name: 'April' },
      { monthno: 5, name: 'May' },
      { monthno: 6, name: 'June' },
      { monthno: 7, name: 'July' },
      { monthno: 8, name: 'August' },
      { monthno: 9, name: 'September' },
      { monthno: 10, name: 'October' },
      { monthno: 11, name: 'November' },
      { monthno: 12, name: 'December' }
    ];

    // Also add standard periods
    const standardPeriods = [
      { monthno: 'FY', name: 'Full Year' },
      { monthno: 'HY1', name: 'Half Year 1 (Jan-Jun)' },
      { monthno: 'HY2', name: 'Half Year 2 (Jul-Dec)' },
      { monthno: 'Q1', name: 'Quarter 1 (Jan-Mar)' },
      { monthno: 'Q2', name: 'Quarter 2 (Apr-Jun)' },
      { monthno: 'Q3', name: 'Quarter 3 (Jul-Sep)' },
      { monthno: 'Q4', name: 'Quarter 4 (Oct-Dec)' }
    ];

    this.periodCache.months = [...standardPeriods, ...months];
    return this.periodCache.months;
  }

  /**
   * Get hardcoded types (AEBF)
   * @returns {Array} - ['Actual', 'Estimate', 'Budget', 'Forecast']
   */
  getAvailableTypes() {
    this.periodCache.types = ['Actual', 'Estimate', 'Budget', 'Forecast'];
    return this.periodCache.types;
  }

  /**
   * Get all period data together (years from Oracle, months & types hardcoded)
   * @param {string} companyCode - REQUIRED: Company code for tenant database
   * @returns {Promise<Object>} - { years, months, types }
   */
  async getAllPeriodData(companyCode) {
    try {
      if (!companyCode) {
        throw new Error('companyCode is required to fetch period data');
      }

      const years = await this.getAvailableYears(companyCode);
      const months = this.getAvailableMonths();
      const types = this.getAvailableTypes();

      return {
        years,       // From fp_raw_data.year1 (actual Oracle years)
        months,      // Hardcoded + Standard Periods
        types        // Hardcoded AEBF
      };
    } catch (error) {
      logger.error(`❌ Failed to get all period data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh cache (call after new data is synced from Oracle)
   * @param {string} companyCode - Company code for tenant database
   */
  async refreshCache(companyCode) {
    if (!companyCode) {
      throw new Error('companyCode is required to refresh period cache');
    }
    logger.info('🔄 Refreshing period cache...', { companyCode });
    await this.getAvailableYears(companyCode);
    this.getAvailableMonths();
    this.getAvailableTypes();
  }

  /**
   * Get cache age (useful for monitoring)
   * @returns {Number} - Minutes since last update
   */
  getCacheAge() {
    if (!this.periodCache.lastUpdated) {
      return null;
    }
    const ageMs = Date.now() - this.periodCache.lastUpdated.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    return ageMinutes;
  }

  /**
   * Validate if a given year is available
   * @param {Number} year - Year to check
   * @returns {Boolean}
   */
  isYearAvailable(year) {
    return this.periodCache.years.includes(parseInt(year));
  }

  /**
   * Validate if a given month is available
   * @param {String|Number} monthno - Month number or name (e.g., 1, 'January', 'Q1', 'FY')
   * @returns {Boolean}
   */
  isMonthAvailable(monthno) {
    return this.periodCache.months.some(m => 
      m.monthno === monthno || m.monthno === parseInt(monthno)
    );
  }

  /**
   * Validate if a given type is available
   * @param {String} type - Type to check (e.g., 'Actual', 'Budget')
   * @returns {Boolean}
   */
  isTypeAvailable(type) {
    return this.periodCache.types.includes(type);
  }
}

module.exports = new PeriodDataService();
