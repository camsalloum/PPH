const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');

const MAX_KGS_VALUE = 1_000_000_000; // 1 billion KGS limit per record

const safeTrim = (value) => (value === null || value === undefined)
  ? ''
  : value.toString().trim();

/**
 * Convert string to Proper Case for consistent naming across all data
 * Examples: "JOHN DOE" -> "John Doe", "masafi llc" -> "Masafi Llc"
 * 
 * FIXED: Now handles parentheses and periods to match INITCAP behavior:
 * - "kabour brothers (hermanos)" -> "Kabour Brothers (Hermanos)"
 * - "al manhal water factory, w.l.l" -> "Al Manhal Water Factory, W.L.L"
 */
const toProperCase = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .replace(/(?:^|\s|[-/(.])\w/g, (match) => match.toUpperCase());
};

const normalizeProductGroupKey = (value) => safeTrim(value).toLowerCase();

const extractDivisionCode = (division) => {
  const [code = ''] = safeTrim(division).split('-');
  return code.replace(/[^a-zA-Z]/g, '').toLowerCase();
};

/**
 * Helper function to get division-specific table names
 * Now uses budgetUnified instead of salesRepBudget
 */
const getTableNames = (division) => {
  const code = extractDivisionCode(division);
  return {
    budgetUnified: `${code}_budget_unified`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    materialPercentages: `${code}_material_percentages`
  };
};

const buildLiveEntryFilename = ({ division, salesRep, budgetYear }) => {
  const safeDivision = safeTrim(division).replace(/[^a-zA-Z0-9]/g, '_');
  const safeSalesRep = safeTrim(salesRep).replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `LIVE_BUDGET_${safeDivision}_${safeSalesRep}_${budgetYear}_${timestamp}.json`;
};

const sanitizeRecords = (records = []) => {
  const valid = [];
  const errors = [];
  records.forEach((record, index) => {
    const customer = safeTrim(record.customer);
    const country = safeTrim(record.country);
    const productGroup = safeTrim(record.productGroup);
    const month = Number(record.month);
    let rawValue = record.value;
    if (typeof rawValue === 'string') {
      const cleaned = rawValue.replace(/,/g, '').trim();
      if (cleaned === '') {
        errors.push({ 
          index, 
          reason: 'Value is required',
          field: 'value',
          suggestion: 'Enter a valid numeric value (e.g., 100 or 1,500)'
        });
        return;
      }
      rawValue = cleaned;
    }
    const value = Number(rawValue);

    if (!customer) {
      errors.push({ 
        index, 
        reason: `Missing customer name at row ${index + 1}`,
        field: 'customer',
        suggestion: 'Select a customer from the dropdown or add a new customer row'
      });
      return;
    }
    if (!country) {
      errors.push({ 
        index, 
        reason: `Missing country for customer "${customer}"`,
        field: 'country',
        suggestion: 'Select a country from the dropdown. Check Customer Master if country is not available.'
      });
      return;
    }
    if (!productGroup) {
      errors.push({ 
        index, 
        reason: `Missing product group for "${customer}"`,
        field: 'productGroup',
        suggestion: 'Select a product group. If not listed, add it in Product Group Management first.'
      });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push({ 
        index, 
        reason: `Invalid month value "${month}" for "${customer}"`,
        field: 'month',
        suggestion: 'Month must be between 1 and 12'
      });
      return;
    }
    if (rawValue === null || rawValue === undefined || rawValue === '' || Number.isNaN(value)) {
      errors.push({ 
        index, 
        reason: `Invalid value "${rawValue}" for "${customer}" - ${productGroup} - Month ${month}`,
        field: 'value',
        suggestion: 'Enter a valid number. Remove any text or special characters except commas.'
      });
      return;
    }
    if (value < 0) {
      errors.push({ 
        index, 
        reason: `Negative value (${value}) not allowed for "${customer}" - ${productGroup}`,
        field: 'value',
        suggestion: 'Budget values must be zero or positive. Use zero to clear a budget entry.'
      });
      return;
    }
    if (value > MAX_KGS_VALUE) {
      errors.push({ 
        index, 
        reason: `Value ${value.toLocaleString()} exceeds 1 billion KGS limit`,
        field: 'value',
        suggestion: 'Maximum allowed value is 1,000,000,000 KGS. Check if value was entered in wrong units.'
      });
      return;
    }

    valid.push({
      customer,
      country,
      productGroup,
      month,
      value
    });
  });

  return { validRecords: valid, skippedRecords: errors.length, errors };
};

/**
 * Fetch existing budget info from budgetUnified table
 */
const fetchExistingBudgetInfo = async (client, { division, salesRep, budgetYear }) => {
  const tables = getTableNames(division);
  const divisionCode = extractDivisionCode(division);
  
  const existingQuery = `
    SELECT 
      COUNT(*) as record_count,
      MAX(uploaded_at) as last_upload
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND UPPER(sales_rep_name) = UPPER($2)
      AND budget_year = $3
      AND is_budget = true
      AND budget_type = 'SALES_REP'
  `;

  const result = await client.query(existingQuery, [divisionCode, salesRep, budgetYear]);
  const row = result.rows[0] || {};
  return {
    recordCount: parseInt(row.record_count, 10) || 0,
    lastUpload: row.last_upload || null
  };
};

const fetchMaterialProcessMap = async (client, divisionCode) => {
  if (!divisionCode) {
    return {};
  }

  const tableName = `${divisionCode}_material_percentages`;
  try {
    const result = await client.query(`
      SELECT product_group, material, process 
      FROM ${tableName}
    `);

    return result.rows.reduce((map, row) => {
      map[normalizeProductGroupKey(row.product_group)] = {
        material: row.material || '',
        process: row.process || ''
      };
      return map;
    }, {});
  } catch (error) {
    logger.warn(`⚠️ Material percentages lookup failed for table ${tableName}:`, error.message);
    return {};
  }
};

const fetchPricingMap = async (client, division, divisionCode, pricingYear) => {
  if (!divisionCode || !pricingYear) {
    return {};
  }

  const tables = getTableNames(division);
  try {
    const pricingResult = await client.query(`
      SELECT product_group, asp_round, morm_round
      FROM ${tables.pricingRounding}
      WHERE UPPER(division) = UPPER($1)
        AND year = $2
    `, [divisionCode, pricingYear]);

    return pricingResult.rows.reduce((map, row) => {
      const key = normalizeProductGroupKey(row.product_group);
      map[key] = {
        sellingPrice: row.asp_round !== null && row.asp_round !== undefined
          ? parseFloat(row.asp_round)
          : null,
        morm: row.morm_round !== null && row.morm_round !== undefined
          ? parseFloat(row.morm_round)
          : null
      };
      return map;
    }, {});
  } catch (error) {
    logger.warn(`⚠️ Pricing lookup failed for division ${divisionCode}, year ${pricingYear}:`, error.message);
    return {};
  }
};

const insertRecord = async (client, insertQuery, params) => client.query(insertQuery, params);

/**
 * Save Sales Rep Budget to budgetUnified table
 * Each record stores KGS, Amount, and MoRM in a single row
 */
const saveLiveSalesRepBudget = async (client, payload) => {
  const {
    division,
    budgetYear,
    salesRep,
    records
  } = payload;

  if (!Array.isArray(records)) {
    throw new Error('records array is required');
  }

  const metadata = {
    division: safeTrim(division),
    budgetYear: parseInt(budgetYear, 10),
    salesRep: safeTrim(salesRep),
    savedAt: new Date().toISOString()
  };

  if (!metadata.division || !metadata.salesRep || Number.isNaN(metadata.budgetYear)) {
    const invalidMetadataError = new Error('division, salesRep, and budgetYear are required');
    invalidMetadataError.details = { division, budgetYear, salesRep };
    throw invalidMetadataError;
  }

  const { validRecords, skippedRecords, errors } = sanitizeRecords(records);
  if (validRecords.length === 0) {
    const errorMessage = skippedRecords > 0
      ? 'All records were invalid. Please review the data and try again.'
      : 'No budget records to save.';
    const validationError = new Error(errorMessage);
    validationError.details = errors;
    throw validationError;
  }

  const divisionCode = extractDivisionCode(metadata.division);
  const pricingYear = metadata.budgetYear - 1;
  const tables = getTableNames(metadata.division);

  const existingBudget = await fetchExistingBudgetInfo(client, metadata);
  
  // Delete existing sales rep budget records from budgetUnified
  // This includes both BULK_IMPORT (management allocation) and previous SALES_REP_IMPORT data
  // When a sales rep imports their final budget, it replaces their bulk import allocation
  const deleteResult = await client.query(`
    DELETE FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND UPPER(sales_rep_name) = UPPER($2)
      AND budget_year = $3
      AND is_budget = true
      AND budget_type = 'SALES_REP'
  `, [divisionCode, metadata.salesRep, metadata.budgetYear]);

  const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
  const pricingMap = await fetchPricingMap(client, metadata.division, divisionCode, pricingYear);
  const warnings = [];
  const missingPricingProducts = new Set();
  let insertedCount = 0;

  // Insert query for budgetUnified - single row with KGS, Amount, MoRM
  // data_source = 'SALES_REP_IMPORT' distinguishes from BULK_IMPORT (management allocation)
  const insertQuery = `
    INSERT INTO ${tables.budgetUnified} (
      division_name,
      division_code,
      budget_year,
      month_no,
      sales_rep_name,
      customer_name,
      country,
      pgcombine,
      qty_kgs,
      amount,
      morm,
      material,
      process,
      is_budget,
      budget_type,
      budget_status,
      created_at,
      updated_at,
      uploaded_at,
      created_by,
      data_source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 'SALES_REP', 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'SALES_REP_IMPORT')
  `;

  // Normalize sales rep name once for all records
  const normalizedSalesRep = toProperCase(metadata.salesRep);
  
  for (const record of validRecords) {
    // Trust the data from export - it's already normalized from fp_actualcommon
    // Only trim whitespace, don't re-transform the case
    const customerName = (record.customer || '').trim();
    const countryName = (record.country || '').trim();
    const productGroupName = (record.productGroup || '').trim();
    
    const productGroupKey = normalizeProductGroupKey(record.productGroup);
    const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };
    const pricing = pricingMap[productGroupKey] || { sellingPrice: null, morm: null };

    // Calculate Amount and MoRM from KGS using pricing
    const kgsValue = record.value;
    let amountValue = null;
    let mormValue = null;

    if (pricing.sellingPrice !== null) {
      amountValue = kgsValue * pricing.sellingPrice;
    } else {
      missingPricingProducts.add(record.productGroup);
    }

    if (pricing.morm !== null) {
      mormValue = kgsValue * pricing.morm;
    } else {
      missingPricingProducts.add(record.productGroup);
    }

    await client.query(insertQuery, [
      metadata.division,           // division_name
      divisionCode,               // division_code
      metadata.budgetYear,        // budget_year
      record.month,               // month_no
      normalizedSalesRep,         // sales_rep_name
      customerName,               // customer_name - already normalized from export
      countryName,                // country - already normalized from export
      productGroupName,           // pgcombine - already normalized from export
      kgsValue,                   // qty_kgs
      amountValue,                // amount (can be null if no pricing)
      mormValue,                  // morm (can be null if no pricing)
      materialProcess.material,   // material
      materialProcess.process     // process
    ]);
    insertedCount++;
  }

  if (missingPricingProducts.size > 0) {
    warnings.push(`Missing pricing data for ${missingPricingProducts.size} product group(s). Amount/MoRM values were set to null.`);
  }

  return {
    metadata,
    existingBudget: existingBudget.recordCount > 0 ? {
      ...existingBudget,
      wasReplaced: deleteResult.rowCount > 0
    } : null,
    recordsDeleted: deleteResult.rowCount,
    recordsProcessed: validRecords.length,
    skippedRecords,
    validationErrors: errors.slice(0, 10),
    recordsInserted: insertedCount,
    pricingYear,
    pricingDataAvailable: Object.keys(pricingMap).length,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

module.exports = {
  saveLiveSalesRepBudget
};
