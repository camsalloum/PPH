/**
 * P&L Data Service
 * Handles P&L data operations: refresh from Excel, query data, audit logging
 */

const { pool } = require('../database/config');
const { PL_ROW_MAPPING, getInputColumns } = require('../config/plRowMapping');
const logger = require('../utils/logger');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class PLDataService {
  /**
   * Get the table name for a division
   */
  getTableName(divisionCode) {
    this.validateDivisionCode(divisionCode);
    return `${divisionCode.toLowerCase()}_pl_data`;
  }

  /**
   * Get the Excel file path for a division
   */
  getExcelPath(divisionCode) {
    this.validateDivisionCode(divisionCode);
    return path.join(__dirname, '..', 'data', `financials -${divisionCode.toLowerCase()}.xlsx`);
  }

  /**
   * Validate division code for safe identifier interpolation
   */
  validateDivisionCode(divisionCode) {
    if (!divisionCode || typeof divisionCode !== 'string') {
      throw new Error('Division code is required');
    }

    const normalized = divisionCode.trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,10}$/.test(normalized)) {
      throw new Error(`Invalid division code: ${divisionCode}`);
    }
  }

  /**
   * Ensure the division table exists before querying
   */
  async ensureTableExists(divisionCode) {
    const exists = await this.tableExists(divisionCode);
    if (!exists) {
      throw new Error(
        `P&L table does not exist for division ${divisionCode}. Please run migrations first.`
      );
    }
  }

  /**
   * Check if a division's P&L table exists
   */
  async tableExists(divisionCode) {
    const tableName = this.getTableName(divisionCode);
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    return result.rows[0].exists;
  }

  /**
   * Refresh P&L data from Excel file for a division
   * @param {string} divisionCode - Division code (e.g., 'FP')
   * @param {number} userId - User ID performing the refresh
   * @returns {object} - Result with records count and status
   */
  async refreshPLData(divisionCode, userId) {
    const startTime = Date.now();
    this.validateDivisionCode(divisionCode);
    const tableName = this.getTableName(divisionCode);
    const excelPath = this.getExcelPath(divisionCode);
    
    logger.info(`Starting P&L refresh for division ${divisionCode}`);
    
    // Check if Excel file exists
    if (!fs.existsSync(excelPath)) {
      const error = `Excel file not found: ${excelPath}`;
      await this.logRefresh(divisionCode, userId, 0, 'failed', error, null, Date.now() - startTime);
      throw new Error(error);
    }

    // Check if table exists
    try {
      await this.ensureTableExists(divisionCode);
    } catch (e) {
      await this.logRefresh(
        divisionCode,
        userId,
        0,
        'failed',
        e.message,
        path.basename(excelPath),
        Date.now() - startTime
      );
      throw e;
    }

    const client = await pool.connect();
    
    try {
      // Read Excel file
      const workbook = XLSX.readFile(excelPath);
      const sheetName = workbook.SheetNames[0]; // Use first sheet (should be division code)
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      
      logger.info(`Read ${data.length} rows from Excel sheet "${sheetName}"`);
      
      // Extract header rows
      const years = data[0];
      const months = data[1];
      const types = data[2];
      
      // Build records for each column (each column = one period)
      const records = [];
      
      for (let col = 1; col < years.length; col++) {
        const year = years[col];
        const month = months[col];
        const dataType = types[col];
        
        // Skip if missing period info
        if (!year || !month || !dataType) continue;
        
        // Build record with all input fields
        const record = {
          year: parseInt(year),
          month: month,
          data_type: dataType
        };
        
        // Extract values for each input row
        for (const [rowIndex, columnName] of Object.entries(PL_ROW_MAPPING)) {
          const value = data[parseInt(rowIndex)]?.[col];
          record[columnName] = this.parseNumericValue(value);
        }
        
        records.push(record);
      }
      
      logger.info(`Parsed ${records.length} period records from Excel`);
      
      // Start transaction
      await client.query('BEGIN');
      
      // Delete existing data ONLY for periods that exist in the Excel file
      // This preserves manually entered Budget data that's not in the Excel
      const periodsToDelete = records.map(r => `(year = ${r.year} AND month = '${r.month}' AND data_type = '${r.data_type}')`).join(' OR ');
      
      if (periodsToDelete) {
        await client.query(`DELETE FROM ${tableName} WHERE ${periodsToDelete}`);
        logger.info(`Cleared existing data from ${tableName} for ${records.length} periods`);
      }
      
      // Insert new records
      const inputColumns = getInputColumns();
      const columnList = ['year', 'month', 'data_type', ...inputColumns, 'uploaded_by'];
      const placeholders = columnList.map((_, i) => `$${i + 1}`).join(', ');
      
      const insertQuery = `
        INSERT INTO ${tableName} (${columnList.join(', ')})
        VALUES (${placeholders})
      `;
      
      let insertedCount = 0;
      for (const record of records) {
        const values = [
          record.year,
          record.month,
          record.data_type,
          ...inputColumns.map(col => record[col] || 0),
          userId
        ];
        
        await client.query(insertQuery, values);
        insertedCount++;
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      const duration = Date.now() - startTime;
      logger.info(`P&L refresh completed: ${insertedCount} records in ${duration}ms`);
      
      // Invalidate cache so next GET returns fresh data
      PLDataService.invalidatePLCache(divisionCode);
      
      // Log success
      await this.logRefresh(divisionCode, userId, insertedCount, 'success', null, path.basename(excelPath), duration);
      
      return {
        success: true,
        recordsCount: insertedCount,
        duration: duration,
        message: `Successfully refreshed ${insertedCount} P&L records for ${divisionCode}`
      };
      
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        // Ignore rollback errors (e.g., if BEGIN was never reached)
      }
      logger.error(`P&L refresh failed for ${divisionCode}:`, error);
      
      const duration = Date.now() - startTime;
      await this.logRefresh(divisionCode, userId, 0, 'failed', error.message, path.basename(excelPath), duration);
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Parse numeric value from Excel cell
   */
  parseNumericValue(value) {
    if (value === null || value === undefined || value === '') return 0;

    if (typeof value === 'number') {
      return isNaN(value) ? 0 : value;
    }

    let str = String(value).trim();
    if (!str) return 0;

    // Handle accounting negatives like (1,234.56)
    let isNegative = false;
    if (str.startsWith('(') && str.endsWith(')')) {
      isNegative = true;
      str = str.slice(1, -1);
    }

    // Remove thousands separators and non-numeric symbols
    str = str.replace(/,/g, '');
    str = str.replace(/[^0-9.+-]/g, '');

    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return isNegative ? -num : num;
  }

  /**
   * Log refresh operation to audit table
   */
  async logRefresh(divisionCode, userId, recordsCount, status, errorMessage, excelFileName, durationMs) {
    try {
      await pool.query(`
        INSERT INTO pl_refresh_log 
        (division_code, refreshed_by, records_count, status, error_message, excel_file_name, duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [divisionCode, userId, recordsCount, status, errorMessage, excelFileName, durationMs]);
    } catch (error) {
      logger.error('Failed to log P&L refresh:', error);
    }
  }

  // ── In-memory P&L cache (per division, 5-min TTL) ─────────────────
  // P&L data rarely changes — only on admin refresh — so caching avoids
  // hitting the DB + recomputing 20+ calculated fields on every page load.
  static _plCache = {};          // { divCode: { data, ts } }
  static PL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Invalidate the P&L cache for a division (call after refresh/import)
   */
  static invalidatePLCache(divisionCode) {
    if (divisionCode) {
      delete PLDataService._plCache[divisionCode.toUpperCase()];
    } else {
      PLDataService._plCache = {};
    }
  }

  /**
   * Get P&L data for a division with optional filters
   * All calculated fields (blue rows in Excel) are computed here
   * Uses an in-memory cache (5-min TTL) to avoid repeated DB + compute work.
   */
  async getPLData(divisionCode, filters = {}) {
    this.validateDivisionCode(divisionCode);
    const upperDiv = divisionCode.toUpperCase();
    const hasFilters = filters.year || filters.month || filters.dataType;

    // ── Serve from cache when no filters are applied ──
    if (!hasFilters) {
      const cached = PLDataService._plCache[upperDiv];
      if (cached && (Date.now() - cached.ts < PLDataService.PL_CACHE_TTL)) {
        logger.debug(`[PLDataService] Cache HIT for ${upperDiv} (${cached.data.length} rows)`);
        return cached.data;
      }
    }

    await this.ensureTableExists(upperDiv);
    const tableName = this.getTableName(upperDiv);
    
    let query = `SELECT * FROM ${tableName} WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (filters.year) {
      query += ` AND year = $${paramIndex++}`;
      params.push(filters.year);
    }
    
    if (filters.month) {
      query += ` AND month = $${paramIndex++}`;
      params.push(filters.month);
    }
    
    if (filters.dataType) {
      query += ` AND data_type = $${paramIndex++}`;
      params.push(filters.dataType);
    }
    
    query += ' ORDER BY year, CASE month ' +
      "WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3 " +
      "WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6 " +
      "WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9 " +
      "WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12 END, " +
      "CASE data_type WHEN 'Actual' THEN 1 WHEN 'Estimate' THEN 2 WHEN 'Budget' THEN 3 END";
    
    const start = Date.now();
    const result = await pool.query(query, params);
    
    // Add calculated fields to each row (all the blue rows from Excel)
    const data = result.rows.map(row => this.addCalculatedFields(row));

    const elapsed = Date.now() - start;
    logger.info(`[PLDataService] ${upperDiv} query+calc: ${elapsed}ms, ${data.length} rows`);

    // ── Populate cache for unfiltered requests ──
    if (!hasFilters) {
      PLDataService._plCache[upperDiv] = { data, ts: Date.now() };
    }

    return data;
  }

  /**
   * Add all calculated fields (blue rows in Excel) to a P&L record
   * These formulas match the Excel P&L structure exactly
   * 
   * IMPORTANT: Excel rows are 1-indexed, our database fields map to 0-indexed array
   * Excel Row N = Array index N-1
   */
  addCalculatedFields(row) {
    const num = (val) => Number(val) || 0;
    
    // Row 6: Material cost as % of Sales
    const sales = num(row.sales);
    row.material_pct_of_sales = sales !== 0 ? (num(row.material) / sales) * 100 : 0;
    
    // Row 14 (Excel Row 15): Actual Direct Cost Spent = SUM(Row 10:14) = Labour + Depreciation + Electricity + Others Mfg
    row.actual_direct_cost = num(row.labour) + num(row.depreciation) + num(row.electricity) + num(row.others_mfg_overheads);
    
    // Row 16 (Excel Row 17): Dir.Cost of goods sold = SUM(Row 15:16) = Actual Direct Cost + Dir.Cost Stock Adj
    row.dir_cost_goods_sold = num(row.actual_direct_cost) + num(row.dir_cost_stock_adj);
    
    // Row 4 (Excel Row 5): Cost of Sales = Material + Dir.Cost of goods sold
    row.cost_of_sales = num(row.material) + num(row.dir_cost_goods_sold);
    
    // Row 18: Direct cost as % of C.O.G.S
    const cogs = num(row.cost_of_sales);
    row.direct_cost_pct_of_cogs = cogs !== 0 ? (num(row.dir_cost_goods_sold) / cogs) * 100 : 0;
    
    // Row 19 (Excel Row 20): Gross profit (after Depn.) = Sales - Cost of Sales
    row.gross_profit = sales - cogs;
    
    // Row 20: Gross profit (after Depn.) %
    row.gross_profit_pct = sales !== 0 ? (num(row.gross_profit) / sales) * 100 : 0;
    
    // Row 21: Gross profit (before Depn.) = Gross profit + Depreciation
    row.gross_profit_before_depn = num(row.gross_profit) + num(row.depreciation);
    
    // Row 22: Gross profit (before Depn.) %
    row.gross_profit_before_depn_pct = sales !== 0 ? (num(row.gross_profit_before_depn) / sales) * 100 : 0;
    
    // Row 31 (Excel Row 32): Selling expenses = SUM(Row 25:31) = sum of rows 24-29 in 0-index
    const sellingExpensesCalc = num(row.sales_manpower_cost) + num(row.sales_incentive) + 
                                num(row.sales_office_rent) + num(row.sales_travel) + 
                                num(row.advt_promotion) + num(row.other_selling_expenses);
    // Use override value if calculated is 0 (Budget data has total in summary row)
    row.selling_expenses = sellingExpensesCalc > 0 ? sellingExpensesCalc : num(row.selling_expenses_override);
    
    // Row 38 (Excel Row 39): Administration = Row 35 + Row 36 = Admin Manpower + Telephone/Fax
    const administrationCalc = num(row.admin_manpower_cost) + num(row.telephone_fax);
    // Use override value if calculated is 0 (Budget data has total in summary row)
    row.administration = administrationCalc > 0 ? administrationCalc : num(row.administration_override);
    
    // Row 40 (Excel Row 41): Administration & Management Fee = SUM(Row 38:40) = Other Admin Cost + Administration
    // Note: Excel row 40 is empty, so it's just Other Admin + Administration
    const adminMgmtFeeCalc = num(row.other_admin_cost) + num(row.administration);
    // Use override value if calculated is 0 (Budget data has total in summary row)
    row.admin_mgmt_fee_total = adminMgmtFeeCalc > 0 ? adminMgmtFeeCalc : num(row.admin_mgmt_fee_override);
    
    // Row 46 (Excel Row 47): Total Finance Cost & Amortization = Row 43 + Row 44 + Row 45
    // In 0-index: arr[42] + arr[43] + arr[44] = Bank Interest + Bank Charges + R&D Pre-production
    row.total_finance_cost = num(row.bank_interest) + num(row.bank_charges) + num(row.rd_preproduction);
    
    // Row 52 (Excel Row 53): Total Below GP Expenses 
    // Formula: B51+B50+B49+B47+B41+B33+B32+B52 
    // = Other Income + Bad Debts + Stock Prov + Finance Cost + Admin&Mgmt Fee + Transportation + Selling Exp + Other Provision
    // Note: Other Income is stored as NEGATIVE in DB (so adding it reduces expenses)
    row.total_below_gp_expenses = num(row.other_income) + num(row.bad_debts) + num(row.stock_provision_adj) + 
                                  num(row.total_finance_cost) + num(row.admin_mgmt_fee_total) + 
                                  num(row.transportation) + num(row.selling_expenses) + num(row.other_provision);
    
    // Row 54 (Excel Row 55): Net Profit = Gross Profit - Total Below GP Expenses
    // Formula: B20-B53 = Gross Profit - Total Below GP
    row.net_profit = num(row.gross_profit) - num(row.total_below_gp_expenses);
    
    // Row 55: Net Profit %
    row.net_profit_pct = sales !== 0 ? (num(row.net_profit) / sales) * 100 : 0;
    
    // EBIT = Net Profit + Bank Interest (Earnings Before Interest and Taxes)
    row.ebit = num(row.net_profit) + num(row.bank_interest);
    
    // EBIT %
    row.ebit_pct = sales !== 0 ? (num(row.ebit) / sales) * 100 : 0;
    
    // Row 56 (Excel Row 57): EBITDA 
    // Formula: B55+B11+B43+B45+B52 = Net Profit + Depreciation + Bank Interest + R&D Pre-prod + Other Provision
    row.ebitda = num(row.net_profit) + num(row.depreciation) + num(row.bank_interest) + 
                 num(row.rd_preproduction) + num(row.other_provision);
    
    // Row 57: EBITDA %
    row.ebitda_pct = sales !== 0 ? (num(row.ebitda) / sales) * 100 : 0;
    
    // Row 59: Total Expenses = Actual Direct Cost + Total Below GP Expenses
    // Excel formula: B15+B53 (Row 14 + Row 52 in 0-index)
    row.total_expenses = num(row.actual_direct_cost) + num(row.total_below_gp_expenses);
    
    // Row 60: Total Expenses /Kg = Total Expenses / Production Volume
    const prodVolume = num(row.production_volume_kg);
    row.total_expenses_per_kg = prodVolume !== 0 ? num(row.total_expenses) / prodVolume : 0;
    
    return row;
  }

  /**
   * Get available periods (years, months, types) for a division
   */
  async getAvailablePeriods(divisionCode) {
    this.validateDivisionCode(divisionCode);
    await this.ensureTableExists(divisionCode);
    const tableName = this.getTableName(divisionCode);
    
    const [yearsResult, typesResult] = await Promise.all([
      pool.query(`SELECT DISTINCT year FROM ${tableName} ORDER BY year`),
      pool.query(`SELECT DISTINCT data_type FROM ${tableName} ORDER BY data_type`)
    ]);
    
    return {
      years: yearsResult.rows.map(r => r.year),
      types: typesResult.rows.map(r => r.data_type),
      months: ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December']
    };
  }

  /**
   * Get last refresh status for a division
   */
  async getRefreshStatus(divisionCode) {
    this.validateDivisionCode(divisionCode);
    const result = await pool.query(`
      SELECT * FROM pl_refresh_log 
      WHERE division_code = $1 
      ORDER BY refreshed_at DESC 
      LIMIT 1
    `, [divisionCode]);
    
    if (result.rows.length === 0) {
      return { hasData: false, lastRefresh: null };
    }
    
    const lastRefresh = result.rows[0];
    
    // Get current record count
    const tableName = this.getTableName(divisionCode);
    let recordCount = 0;
    try {
      await this.ensureTableExists(divisionCode);
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
      recordCount = parseInt(countResult.rows[0].count);
    } catch (e) {
      // Table might not exist
    }
    
    return {
      hasData: recordCount > 0,
      recordCount: recordCount,
      lastRefresh: {
        timestamp: lastRefresh.refreshed_at,
        status: lastRefresh.status,
        recordsCount: lastRefresh.records_count,
        durationMs: lastRefresh.duration_ms,
        errorMessage: lastRefresh.error_message
      }
    };
  }

  /**
   * Get refresh history for a division
   */
  async getRefreshHistory(divisionCode, limit = 10) {
    this.validateDivisionCode(divisionCode);
    const result = await pool.query(`
      SELECT rl.*, u.email as refreshed_by_email
      FROM pl_refresh_log rl
      LEFT JOIN users u ON rl.refreshed_by = u.id
      WHERE rl.division_code = $1
      ORDER BY rl.refreshed_at DESC
      LIMIT $2
    `, [divisionCode, limit]);
    
    return result.rows;
  }
}

module.exports = new PLDataService();
