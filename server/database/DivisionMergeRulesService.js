const { pool } = require('./config');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "FP" -> "fp"
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get division-specific table names
 * MIGRATED: Use actualcommon instead of data_excel
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    divisionMergeRules: `${code}_division_customer_merge_rules`,
    actualData: `${code}_actualcommon`  // Used by previewImpact
  };
}

class DivisionMergeRulesService {
  static normalizeName(name) {
    if (!name) return '';
    return name.toString().trim().replace(/\s+/g, ' ');
  }

  static normalizeArray(arr) {
    return (arr || [])
      .map(s => this.normalizeName(s))
      .filter(s => s.length > 0);
  }
  
  /**
   * Get the correct database pool for a division
   */
  static getPoolForDivision(division) {
    const divisionCode = extractDivisionCode(division);
    return getDivisionPool(divisionCode.toUpperCase());
  }

  static async listRules(division) {
    const divisionPool = this.getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const query = `
      SELECT id, division, merged_customer_name, original_customers, status, is_active, created_at, updated_at
      FROM ${tables.divisionMergeRules}
      WHERE division = $1
      ORDER BY status DESC, merged_customer_name
    `;
    const result = await divisionPool.query(query, [division]);
    return result.rows;
  }

  static async upsertRule(division, mergedName, originalCustomers, status = 'ACTIVE') {
    const normMerged = this.normalizeName(mergedName);
    const normOriginals = this.normalizeArray(originalCustomers);

    if (!normMerged || normOriginals.length === 0) {
      throw new Error('mergedName and at least one original customer are required');
    }

    const divisionPool = this.getPoolForDivision(division);
    const tables = getTableNames(division);

    const query = `
      INSERT INTO ${tables.divisionMergeRules}
        (division, merged_customer_name, original_customers, status, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (division, merged_customer_name)
      DO UPDATE SET
        original_customers = EXCLUDED.original_customers,
        status = EXCLUDED.status,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const params = [division, normMerged, JSON.stringify(normOriginals), status];
    const result = await divisionPool.query(query, params);
    return result.rows[0];
  }

  static async setStatus(division, mergedName, status) {
    const normMerged = this.normalizeName(mergedName);
    const divisionPool = this.getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const result = await divisionPool.query(
      `UPDATE ${tables.divisionMergeRules}
       SET status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE division = $1 AND merged_customer_name = $2
       RETURNING *`,
      [division, normMerged, status]
    );
    return result.rows[0];
  }

  // Simple impact preview for a given period (sum of originals, count, current merged existence)
  static async previewImpact(division, { year, months, type, mergedName, originalCustomers }) {
    const divisionPool = this.getPoolForDivision(division);
    const tables = getTableNames(division);
    const tableName = tables.actualData;

    const monthsArray = Array.isArray(months) ? months : [];
    const monthPlaceholders = monthsArray.map((_, idx) => `$${5 + idx}`).join(', ');

    // Estimate/Forecast handling: combine with Actual
    const isEstimate = (type || '').toUpperCase().includes('ESTIMATE') || (type || '').toUpperCase().includes('FORECAST');
    const typeCondition = isEstimate ? `AND UPPER(type) IN ('ACTUAL','ESTIMATE','FORECAST')` : `AND UPPER(type) = UPPER($4)`;

    const normOriginals = this.normalizeArray(originalCustomers);

    // Sum originals
    const query = `
      SELECT MIN(TRIM(customername)) as customername, SUM(CASE WHEN UPPER(values_type)='AMOUNT' THEN values ELSE 0 END) AS total_value
      FROM ${tableName}
      WHERE year = $1
        ${monthsArray.length ? `AND month IN (${monthPlaceholders})` : ''}
        ${isEstimate ? '' : `AND UPPER(type) = UPPER($4)`}
        AND customername IS NOT NULL
        AND TRIM(customername) != ''
        AND TRIM(UPPER(customername)) = ANY($2)
      GROUP BY LOWER(TRIM(customername))
    `;

    const params = [
      parseInt(year),
      normOriginals.map(n => n.toUpperCase()),
      division,
      type || 'Actual',
      ...monthsArray
    ];

    const res = await divisionPool.query(query, params);
    const totalOriginalsAmount = res.rows.reduce((s, r) => s + (parseFloat(r.total_value) || 0), 0);
    const uniqueOriginalsCount = res.rows.length;

    // Check if merged already exists in data
    const mergedRes = await divisionPool.query(
      `SELECT 1 FROM ${tableName} WHERE TRIM(UPPER(customername)) = $1 LIMIT 1`,
      [this.normalizeName(mergedName).toUpperCase()]
    );

    return {
      totalOriginalsAmount,
      uniqueOriginalsCount,
      mergedExistsInData: mergedRes.rowCount > 0
    };
  }
}

module.exports = DivisionMergeRulesService;






