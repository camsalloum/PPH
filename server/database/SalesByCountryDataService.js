const { pool } = require('./config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');

class SalesByCountryDataService {
  
  /**
   * Get the appropriate database pool for a division
   */
  static getPool(division) {
    if (!division || division.toUpperCase() === 'FP') {
      return pool;
    }
    return getDivisionPool(division.toUpperCase());
  }

  /**
   * Get table name for a division
   * MIGRATED: Use fp_actualcommon for FP division
   */
  static getTableName(division) {
    const div = (division || 'FP').toUpperCase();
    if (div === 'FP') {
      return 'fp_actualcommon';
    }
    return `${div.toLowerCase()}_actualcommon`;
  }

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
    if (period === 'Year') {
      return this.fullYearMonths;
    } else if (this.quarterMonths[period]) {
      return this.quarterMonths[period];
    } else if (this.halfYearMonths[period]) {
      return this.halfYearMonths[period];
    } else if (this.monthMapping[period]) {
      return [this.monthMapping[period]];
    } else if (Array.isArray(period)) {
      // Custom months array
      return period.map(month => this.monthMapping[month]).filter(Boolean);
    }
    return [];
  }

  /**
   * Get countries for a specific division from database
   */
  static async getCountriesByDivision(division) {
    try {
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT countryname, 
               COUNT(*) as record_count,
               SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
               SUM(CASE WHEN values_type = 'Amount' THEN values ELSE 0 END) as total_amount
        FROM ${tableName} 
        WHERE countryname IS NOT NULL 
        AND TRIM(countryname) != '' 
        AND countryname != '(blank)'
        GROUP BY countryname
        ORDER BY total_kgs DESC, countryname ASC
      `;
      
      const result = await divisionPool.query(query);
      return result.rows.map(row => ({
        country: row.countryname,
        recordCount: parseInt(row.record_count),
        totalKgs: parseFloat(row.total_kgs || 0),
        totalAmount: parseFloat(row.total_amount || 0)
      }));
    } catch (error) {
      logger.error('Error fetching countries by division:', error);
      throw error;
    }
  }

  /**
   * Get sales by country for a specific division, sales rep, year, months (array), and data type
   */
  static async getSalesByCountry(division, salesRep, year, months, dataType = 'Actual', groupMembers = null) {
    try {
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      
      let query, params;
      // Support both string and array for months
      const monthsArray = Array.isArray(months) ? months : [months];
      
      // Handle "Estimate" or "Forecast" type - query both Actual and Estimate/Forecast
      const normalizedDataType = dataType.toUpperCase();
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
      
      if (groupMembers && groupMembers.length > 0) {
        // It's a group - get sales by country for all members
        const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');
        const monthPlaceholders = monthsArray.map((_, idx) => `$${groupMembers.length + 2 + idx}`).join(', ');
        
        const typeCondition = isEstimateType 
          ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE', 'FORECAST')`
          : `AND type = $${groupMembers.length + 2 + monthsArray.length}`;
        
        query = `
          SELECT countryname, SUM(values) as total_value 
          FROM ${tableName} 
          WHERE salesrepname IN (${placeholders}) 
          AND year = $${groupMembers.length + 1}
          AND month IN (${monthPlaceholders})
          ${typeCondition}
          AND countryname IS NOT NULL
          AND TRIM(countryname) != ''
          GROUP BY countryname
          ORDER BY total_value DESC
        `;
        params = isEstimateType 
          ? [...groupMembers, year, ...monthsArray]
          : [...groupMembers, year, ...monthsArray, dataType];
      } else {
        // Individual sales rep
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        const typeCondition = isEstimateType 
          ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE', 'FORECAST')`
          : `AND type = $${3 + monthsArray.length}`;
        
        query = `
          SELECT countryname, SUM(values) as total_value 
          FROM ${tableName} 
          WHERE salesrepname = $1 
          AND year = $2
          AND month IN (${monthPlaceholders})
          ${typeCondition}
          AND countryname IS NOT NULL
          AND TRIM(countryname) != ''
          GROUP BY countryname
          ORDER BY total_value DESC
        `;
        params = isEstimateType 
          ? [salesRep, year, ...monthsArray]
          : [salesRep, year, ...monthsArray, dataType];
      }
      
      const result = await divisionPool.query(query, params);
      return result.rows.map(row => ({
        country: row.countryname,
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error('Error fetching sales by country:', error);
      throw error;
    }
  }

  /**
   * Get countries with sales data for a specific sales rep (for country reference)
   */
  static async getCountriesBySalesRep(division, salesRep, groupMembers = null) {
    try {
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      
      let query, params;
      
      if (groupMembers && groupMembers.length > 0) {
        // It's a group - get countries for all members
        const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');
        
        query = `
          SELECT DISTINCT countryname,
                 SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
                 SUM(CASE WHEN values_type = 'Amount' THEN values ELSE 0 END) as total_amount,
                 COUNT(*) as record_count
          FROM ${tableName} 
          WHERE salesrepname IN (${placeholders}) 
          AND countryname IS NOT NULL 
          AND TRIM(countryname) != '' 
          AND countryname != '(blank)'
          GROUP BY countryname
          ORDER BY total_kgs DESC, countryname ASC
        `;
        
        params = [...groupMembers];
      } else {
        // Individual sales rep
        query = `
          SELECT DISTINCT countryname,
                 SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
                 SUM(CASE WHEN values_type = 'Amount' THEN values ELSE 0 END) as total_amount,
                 COUNT(*) as record_count
          FROM ${tableName} 
          WHERE salesrepname = $1 
          AND countryname IS NOT NULL 
          AND TRIM(countryname) != '' 
          AND countryname != '(blank)'
          GROUP BY countryname
          ORDER BY total_kgs DESC, countryname ASC
        `;
        
        params = [salesRep];
      }
      
      const result = await divisionPool.query(query, params);
      return result.rows.map(row => ({
        country: row.countryname,
        totalKgs: parseFloat(row.total_kgs || 0),
        totalAmount: parseFloat(row.total_amount || 0),
        recordCount: parseInt(row.record_count)
      }));
    } catch (error) {
      logger.error('Error fetching countries by sales rep:', error);
      throw error;
    }
  }

  /**
   * Get country sales data for a specific period and value type
   */
  static async getCountrySalesData(division, country, year, months, dataType = 'Actual', valueType = 'KGS') {
    try {
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      
      const monthsArray = Array.isArray(months) ? months : [months];
      const monthPlaceholders = monthsArray.map((_, idx) => `$${4 + idx}`).join(', ');
      
      const query = `
        SELECT SUM(values) as total_value 
        FROM ${tableName} 
        WHERE countryname = $1 
        AND year = $2
        AND month IN (${monthPlaceholders})
        AND type = $3
        AND values_type = $${3 + monthsArray.length + 1}
        AND countryname IS NOT NULL
        AND TRIM(countryname) != ''
      `;
      
      const params = [country, year, ...monthsArray, dataType, valueType];
      const result = await divisionPool.query(query, params);
      
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error('Error fetching country sales data:', error);
      throw error;
    }
  }

  /**
   * Get all unique countries from database
   */
  static async getAllCountries(division = 'FP') {
    try {
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT countryname 
        FROM ${tableName} 
        WHERE countryname IS NOT NULL 
        AND TRIM(countryname) != ''
        AND countryname != '(blank)'
        ORDER BY countryname
      `;
      
      const result = await divisionPool.query(query);
      return result.rows.map(row => row.countryname);
    } catch (error) {
      logger.error('Error fetching all countries:', error);
      throw error;
    }
  }
}

module.exports = SalesByCountryDataService;




