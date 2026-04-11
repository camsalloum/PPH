const logger = require('../utils/logger');

const MAX_KGS_VALUE = 1_000_000_000;

const safeTrim = (value) => (value === null || value === undefined)
  ? ''
  : value.toString().trim();

const normalizeProductGroupKey = (value) => safeTrim(value).toLowerCase();

const extractDivisionCode = (division) => {
  const [code = ''] = safeTrim(division).split('-');
  return code.replace(/[^a-zA-Z]/g, '').toLowerCase();
};

/**
 * Get table name for divisional budget based on division
 */
const getDivisionalBudgetTable = (division) => {
  const code = extractDivisionCode(division);
  return `${code}_divisional_budget`;
};

/**
 * Get archive table name for divisional budget based on division
 */
const getDivisionalBudgetArchiveTable = (division) => {
  const code = extractDivisionCode(division);
  return `${code}_divisional_budget_archive`;
};

/**
 * Get pricing rounding table name based on division
 */
const getPricingRoundingTable = (division) => {
  const code = extractDivisionCode(division);
  return `${code}_product_group_pricing_rounding`;
};

const buildUploadedFilename = ({ prefix, division, budgetYear, savedAt }) => {
  const safeDivision = safeTrim(division).replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date(savedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${safeDivision}_${budgetYear}_${timestamp}.html`;
};

/**
 * Fetch material and process mapping from material_percentages table
 * @param {object} client - Database client/pool
 * @param {string} divisionCode - Division code (fp, hc)
 * @returns {object} Map of productGroup -> { material, process }
 */
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

const sanitizeRecords = (records = []) => {
  const validRecords = [];
  const errors = [];

  records.forEach((record, index) => {
    const productGroup = safeTrim(record.productGroup);
    const month = Number(record.month);
    let rawValue = record.value;

    if (!productGroup) {
      errors.push({ 
        index, 
        reason: `Missing product group at row ${index + 1}`,
        field: 'productGroup',
        suggestion: 'Ensure all rows have a product group selected. Check Product Group Management if not listed.'
      });
      return;
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push({ 
        index, 
        reason: `Invalid month "${month}" for product group "${productGroup}"`,
        field: 'month',
        suggestion: 'Month must be a whole number between 1 (January) and 12 (December)'
      });
      return;
    }

    if (typeof rawValue === 'string') {
      const cleaned = rawValue.replace(/,/g, '').trim();
      if (cleaned === '') {
        errors.push({ 
          index, 
          reason: `Value is required for "${productGroup}" - Month ${month}`,
          field: 'value',
          suggestion: 'Enter a numeric value. Use 0 to explicitly set zero budget.'
        });
        return;
      }
      rawValue = cleaned;
    }

    const value = Number(rawValue);

    if (rawValue === null || rawValue === undefined || rawValue === '' || Number.isNaN(value)) {
      errors.push({ 
        index, 
        reason: `Invalid value "${rawValue}" for "${productGroup}" - Month ${month}`,
        field: 'value',
        suggestion: 'Value must be a valid number. Remove text or special characters except commas.'
      });
      return;
    }

    if (value < 0) {
      errors.push({ 
        index, 
        reason: `Negative value (${value}) not allowed for "${productGroup}"`,
        field: 'value',
        suggestion: 'Divisional budget values must be zero or positive.'
      });
      return;
    }

    if (value > MAX_KGS_VALUE) {
      errors.push({ 
        index, 
        reason: `Value ${value.toLocaleString()} exceeds 1 billion KGS limit for "${productGroup}"`,
        field: 'value',
        suggestion: 'Maximum allowed value is 1,000,000,000 KGS. Verify the value is in correct units.'
      });
      return;
    }

    validRecords.push({
      productGroup,
      month,
      value
    });
  });

  return {
    validRecords,
    errors,
    skippedRecords: errors.length
  };
};

/**
 * Get existing divisional budget info from divisional_budget table
 */
const getDivisionalBudgetInfo = async (client, division, budgetYear) => {
  const tableName = getDivisionalBudgetTable(division);
  const query = `
    SELECT 
      COUNT(*) as record_count,
      MAX(uploaded_at) as last_upload,
      MAX(uploaded_filename) as last_filename
    FROM public.${tableName}
    WHERE UPPER(division) = UPPER($1)
      AND year = $2
  `;

  const result = await client.query(query, [division, budgetYear]);
  const row = result.rows[0] || {};
  return {
    recordCount: parseInt(row.record_count, 10) || 0,
    lastUpload: row.last_upload || null,
    lastFilename: row.last_filename || null
  };
};

const fetchPricingMap = async (client, division, divisionCode, pricingYear) => {
  if (!divisionCode || !pricingYear) {
    return {};
  }

  const pricingTable = getPricingRoundingTable(division);
  
  try {
    const pricingResult = await client.query(`
      SELECT product_group, asp_round, morm_round
      FROM ${pricingTable}
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

const saveDivisionalBudget = async (client, options) => {
  const {
    division,
    budgetYear,
    records,
    savedAt = new Date().toISOString(),
    filenamePrefix = 'LIVE_Divisional'
  } = options;

  if (!division || Number.isNaN(Number(budgetYear))) {
    throw new Error('division and budgetYear are required');
  }

  const { validRecords, errors, skippedRecords } = sanitizeRecords(records);
  if (validRecords.length === 0) {
    const message = skippedRecords > 0
      ? 'All records were invalid. Please review the data and try again.'
      : 'No budget records to save.';
    const validationError = new Error(message);
    validationError.details = errors;
    throw validationError;
  }

  const divisionCode = extractDivisionCode(division);
  const pricingYear = Number(budgetYear) - 1;
  const existingBudget = await getDivisionalBudgetInfo(client, division, budgetYear);

  // ============================================================================
  // OPTIMIZED APPROACH: Batch Upsert (Merge)
  // 1. No "Delete All" - preserves existing data not in the file
  // 2. Batch Insert - significantly faster than row-by-row
  // 3. ON CONFLICT UPDATE - updates existing records, inserts new ones
  // ============================================================================
  
  const budgetTable = getDivisionalBudgetTable(division);
  
  logger.info(`📝 Preparing divisional budget records for merge/upsert...`);

  const pricingMap = await fetchPricingMap(client, division, divisionCode, pricingYear);
  const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
  const missingPricingProducts = new Set();
  let warnings = [];
  
  // Prepare all rows in memory first
  const rowsToUpsert = [];
  const uploadedFilename = buildUploadedFilename({
    prefix: filenamePrefix,
    division,
    budgetYear,
    savedAt
  });

  for (const record of validRecords) {
    const productGroupKey = normalizeProductGroupKey(record.productGroup);
    const pricing = pricingMap[productGroupKey] || { sellingPrice: null, morm: null };
    const matProc = materialProcessMap[productGroupKey] || { material: '', process: '' };

    // 1. KGS Record (Always add)
    rowsToUpsert.push([
      division.toUpperCase(),
      budgetYear,
      record.month,
      record.productGroup,
      'KGS',
      record.value,
      matProc.material,
      matProc.process,
      uploadedFilename,
      new Date().toISOString() // uploaded_at
    ]);

    // 2. Amount Record (If pricing available)
    if (pricing.sellingPrice !== null) {
      rowsToUpsert.push([
        division.toUpperCase(),
        budgetYear,
        record.month,
        record.productGroup,
        'Amount',
        record.value * pricing.sellingPrice,
        matProc.material,
        matProc.process,
        uploadedFilename,
        new Date().toISOString() // uploaded_at
      ]);
    } else {
      missingPricingProducts.add(record.productGroup);
    }

    // 3. MoRM Record (If pricing available)
    if (pricing.morm !== null) {
      rowsToUpsert.push([
        division.toUpperCase(),
        budgetYear,
        record.month,
        record.productGroup,
        'MoRM',
        record.value * pricing.morm,
        matProc.material,
        matProc.process,
        uploadedFilename,
        new Date().toISOString() // uploaded_at
      ]);
    } else {
      missingPricingProducts.add(record.productGroup);
    }
  }

  if (missingPricingProducts.size > 0) {
    warnings = [`Missing pricing data for ${missingPricingProducts.size} product group(s). Amount/MoRM rows were skipped.`];
  }

  // Execute Batch Upsert
  // We chunk the inserts to avoid hitting parameter limits (Postgres limit ~65535 params)
  // Each row has 10 params. Safe chunk size is ~5000 rows. We'll use 1000 for safety.
  const COLS_PER_ROW = 10;
  const CHUNK_SIZE = 1000;
  let insertedCount = 0;

  if (rowsToUpsert.length > 0) {
    logger.info(`🚀 Executing batch upsert for ${rowsToUpsert.length} records...`);
    
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
      
      // Generate placeholders: ($1, $2, ..., $10), ($11, $12, ..., $20)
      const placeholders = chunk.map((_, rIndex) => 
        `(${Array.from({ length: COLS_PER_ROW }, (_, cIndex) => `$${rIndex * COLS_PER_ROW + cIndex + 1}`).join(', ')})`
      ).join(', ');

      const flatValues = chunk.flat();

      const upsertQuery = `
        INSERT INTO public.${budgetTable} (
          division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at
        ) VALUES ${placeholders}
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET
          value = EXCLUDED.value,
          material = EXCLUDED.material,
          process = EXCLUDED.process,
          uploaded_filename = EXCLUDED.uploaded_filename,
          uploaded_at = CURRENT_TIMESTAMP
      `;

      await client.query(upsertQuery, flatValues);
      insertedCount += chunk.length;
    }
  }

  // Calculate stats for response
  const insertedKGS = validRecords.length;
  const insertedAmount = rowsToUpsert.filter(r => r[4] === 'Amount').length;
  const insertedMoRM = rowsToUpsert.filter(r => r[4] === 'MoRM').length;
  
  // Calculate actual budget totals (sum of values)
  const totalKgs = validRecords.reduce((sum, r) => sum + (r.value || 0), 0);
  const totalMT = totalKgs / 1000; // Convert KGS to MT
  const totalAmount = rowsToUpsert
    .filter(r => r[4] === 'Amount')
    .reduce((sum, r) => sum + (r[5] || 0), 0);
  const totalMoRM = rowsToUpsert
    .filter(r => r[4] === 'MoRM')
    .reduce((sum, r) => sum + (r[5] || 0), 0);

  logger.info(`✅ Divisional budget saved successfully:`);
  logger.info(`   - Processed/Upserted: ${insertedCount} records`);
  logger.info(`   - Total Volume: ${totalMT.toFixed(2)} MT`);
  logger.info(`   - Total Amount: ${(totalAmount / 1000000).toFixed(2)}M`);
  logger.info(`   - Total MoRM: ${(totalMoRM / 1000000).toFixed(2)}M`);

  return {
    metadata: {
      division,
      budgetYear,
      savedAt,
      targetTable: budgetTable
    },
    existingBudget: existingBudget.recordCount > 0 ? existingBudget : null,
    recordsProcessed: validRecords.length,
    skippedRecords,
    validationErrors: errors.slice(0, 10),
    recordsInserted: {
      kgs: insertedKGS,
      amount: insertedAmount,
      morm: insertedMoRM,
      total: insertedCount
    },
    // Actual budget value totals
    budgetTotals: {
      volumeMT: totalMT,
      volumeKGS: totalKgs,
      amount: totalAmount,
      morm: totalMoRM
    },
    pricingYear,
    pricingDataAvailable: Object.keys(pricingMap).length,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

module.exports = {
  getDivisionalBudgetInfo,
  saveDivisionalBudget
};
