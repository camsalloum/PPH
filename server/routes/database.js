/**
 * Database Operations Routes
 * Handles database queries, country data, customer data, and geographic distribution
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const WorldCountriesService = require('../database/WorldCountriesService');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');
const GeographicDistributionService = require('../database/GeographicDistributionService');
const CustomerInsightsService = require('../database/CustomerInsightsService');
const { findPotentialAliases } = require('../utils/fuzzyMatch');

// Use cached sales rep config instead of reading file on every request
const { 
  loadSalesRepConfig, 
  invalidateCache: invalidateSalesRepCache,
  SALES_REP_CONFIG_PATH
} = require('../utils/salesRepConfigCache');

// Helper to save sales rep config (LEGACY - no longer writes to JSON file)
// Only invalidates the in-memory cache now
function saveSalesRepConfig(config) {
  invalidateSalesRepCache();
  return true;
}

// GET /countries-db - Get countries from fp_actualcommon with proper region/currency matching
router.get('/countries-db', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division || division.toUpperCase() !== 'FP') {
      return res.status(400).json({ 
        success: false, 
        error: 'Currently only FP division is supported' 
      });
    }
    
    // Get distinct countries from fp_actualcommon
    const result = await pool.query(`
      SELECT DISTINCT 
        INITCAP(LOWER(TRIM(country))) as country,
        COUNT(*) as record_count
      FROM fp_actualcommon
      WHERE UPPER(TRIM(admin_division_code)) = 'FP'
        AND country IS NOT NULL
        AND TRIM(country) != ''
      GROUP BY INITCAP(LOWER(TRIM(country)))
      ORDER BY country
    `);
    
    // Get world countries master data for matching
    const WorldCountriesService = require('../database/WorldCountriesService');
    const worldService = new WorldCountriesService('FP');
    const worldDB = worldService.getWorldCountriesDatabase();
    
    // Match each country with master data (region, currency, coordinates)
    const enrichedCountries = result.rows.map(row => {
      const countryName = row.country;
      const assignment = worldService.smartCountryAssignment(countryName);
      
      return {
        country: countryName,
        region: assignment.region || 'Unassigned',
        marketType: assignment.marketType || 'Unknown',
        currency: assignment.currency || null,
        coordinates: assignment.coordinates || null,
        longitude: assignment.coordinates ? assignment.coordinates[0] : null,
        latitude: assignment.coordinates ? assignment.coordinates[1] : null,
        recordCount: parseInt(row.record_count)
      };
    });
    
    // Count statistics
    const totalCountries = enrichedCountries.length;
    const assignedCount = enrichedCountries.filter(c => c.region !== 'Unassigned').length;
    const unassignedCount = totalCountries - assignedCount;
    const withCoordinates = enrichedCountries.filter(c => c.coordinates !== null).length;
    
    res.json({ 
      success: true, 
      data: enrichedCountries,
      statistics: {
        totalCountries,
        assignedCount,
        unassignedCount,
        withCoordinates,
        inDivision: assignedCount,
        notInDivision: unassignedCount
      }
    });
  } catch (error) {
    logger.error('Error fetching countries from DB', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch countries: ' + error.message });
  }
});

// GET /world-countries - Get ALL countries from World Countries Reference (for dropdowns)
// This returns the complete master list, not just countries with existing sales data
router.get('/world-countries', async (req, res) => {
  try {
    const worldService = new WorldCountriesService('FP');
    const worldDB = worldService.getWorldCountriesDatabase();
    
    // Canonical country names - map ALL variants/abbreviations to the preferred display name
    const canonicalNames = {
      // UAE variants
      'uae': 'United Arab Emirates',
      'united arab emirates': 'United Arab Emirates',
      // UK variants
      'uk': 'United Kingdom',
      'united kingdom': 'United Kingdom',
      'great britain': 'United Kingdom',
      'britain': 'United Kingdom',
      'england': 'United Kingdom',
      // US variants
      'us': 'United States',
      'usa': 'United States',
      'united states': 'United States',
      'united states of america': 'United States',
      'america': 'United States',
      // Saudi Arabia variants
      'ksa': 'Saudi Arabia',
      'kingdom of saudi arabia': 'Saudi Arabia',
      'saudi arabia': 'Saudi Arabia',
      // Iran variants
      'iran': 'Iran',
      'islamic republic of iran': 'Iran',
      // Syria variants
      'syria': 'Syria',
      'syrian arab republic': 'Syria',
      // Palestine variants
      'palestine': 'Palestine',
      'state of palestine': 'Palestine',
      'palestinian territory': 'Palestine',
      // Korea variants
      'south korea': 'South Korea',
      'republic of korea': 'South Korea',
      'korea': 'South Korea',
      // Congo variants (DR Congo)
      'dr congo': 'Democratic Republic of Congo',
      'd.r. congo': 'Democratic Republic of Congo',
      'democratic republic of congo': 'Democratic Republic of Congo',
      'democratic republic of the congo': 'Democratic Republic of Congo',
      'democratic republic of the con': 'Democratic Republic of Congo',
      'congo-kinshasa': 'Democratic Republic of Congo',
      // Congo (Republic) variants
      'congo': 'Republic of Congo',
      'republic of congo': 'Republic of Congo',
      'republic of the congo': 'Republic of Congo',
      'congo-brazzaville': 'Republic of Congo',
      // Tanzania
      'tanzania': 'Tanzania',
      'united republic of tanzania': 'Tanzania',
      // Taiwan variants  
      'taiwan': 'Taiwan',
      'republic of china': 'Taiwan',
      'chinese taipei': 'Taiwan',
      // Myanmar variants
      'myanmar': 'Myanmar',
      'burma': 'Myanmar',
      // Czechia variants
      'czech republic': 'Czech Republic',
      'czechia': 'Czech Republic',
      // North Korea
      'north korea': 'North Korea',
      'dprk': 'North Korea',
      "democratic people's republic of korea": 'North Korea',
      // Macedonia
      'north macedonia': 'North Macedonia',
      'macedonia': 'North Macedonia',
      'fyrom': 'North Macedonia',
      // Eswatini/Swaziland
      'eswatini': 'Eswatini',
      'swaziland': 'Eswatini',
      // Cabo Verde
      'cabo verde': 'Cabo Verde',
      'cape verde': 'Cabo Verde',
      // Macau
      'macau': 'Macau',
      'macao': 'Macau',
      // Ivory Coast
      'ivory coast': 'Ivory Coast',
      "cote d'ivoire": 'Ivory Coast',
      // Russia
      'russia': 'Russia',
      'russian federation': 'Russia',
      // Somaliland (treat as Somalia for now)
      'somaliland': 'Somalia'
    };
    
    // Get unique normalized country names (no duplicates)
    const countryMap = new Map(); // Use Map to keep latest data for each country
    
    Object.entries(worldDB).forEach(([name, data]) => {
      const nameLower = name.toLowerCase().trim();
      
      // Get canonical name if exists, otherwise normalize the name
      let normalized = canonicalNames[nameLower];
      if (!normalized) {
        // Proper case normalization for names not in canonical list
        normalized = name.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        // Fix special cases like "D'ivoire" -> "D'Ivoire"
        normalized = normalized.replace(/'([a-z])/g, (match, letter) => "'" + letter.toUpperCase());
      }
      
      const normalizedLower = normalized.toLowerCase();
      
      // Skip if we already have this country (deduplicate)
      if (countryMap.has(normalizedLower)) return;
      
      countryMap.set(normalizedLower, {
        country: normalized,
        region: data.region || 'Unassigned',
        marketType: data.marketType || 'Export',
        currency: data.currency || null
      });
    });
    
    // Convert map to array and sort
    const countriesWithDetails = Array.from(countryMap.values())
      .sort((a, b) => a.country.localeCompare(b.country));
    
    // Simple country names array for dropdowns
    const countryNames = countriesWithDetails.map(c => c.country);
    
    res.json({
      success: true,
      data: countriesWithDetails,
      countries: countryNames, // Simple array for dropdowns
      totalCount: countryNames.length
    });
  } catch (error) {
    logger.error('Error fetching world countries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch world countries: ' + error.message });
  }
});

// GET /sales-reps-defaults - Get sales rep defaults for a division
router.get('/sales-reps-defaults', async (req, res) => {
  try {
    const { division } = req.query;
    const divPool = division ? getDivisionPool(division) : pool;
    const actualPool = await divPool;
    
    // Try to get from sales_rep_defaults table if exists
    try {
      const result = await actualPool.query('SELECT * FROM sales_rep_defaults ORDER BY salesrepname');
      res.json({ success: true, data: result.rows });
    } catch (tableError) {
      // Table might not exist, return empty array
      logger.warn('sales_rep_defaults table not found, returning empty', { division });
      res.json({ success: true, data: [] });
    }
  } catch (error) {
    logger.error('Error fetching sales rep defaults', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales rep defaults' });
  }
});

// GET /all-countries - Get all countries
router.get('/all-countries', async (req, res) => {
  try {
    const { division } = req.query;
    const pool = await getDivisionPool(division);
    
    const result = await pool.query(
      `SELECT DISTINCT country as country 
       FROM fp_actualcommon 
       WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND country IS NOT NULL 
       ORDER BY country`,
      [division || 'FP']
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching all countries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// POST /sales-by-country-db - Get sales by country from database
router.post('/sales-by-country-db', async (req, res) => {
  try {
    const { division, year, months, dataType, salesRep, groupMembers } = req.body;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'division is required' });
    }
    
    // Check if salesRep is a group name (for unified view - use group name directly)
    // If groupMembers is not provided but salesRep looks like a group name, use salesRep as group name
    let finalSalesRep = salesRep || null;
    let finalGroupMembers = groupMembers || null;
    
    // If salesRep is provided but groupMembers is not, check if it's a group name
    if (finalSalesRep && !finalGroupMembers) {
      try {
        const groupCheck = await pool.query(
          `SELECT id, group_name FROM sales_rep_groups WHERE group_name = $1 AND division = $2`,
          [finalSalesRep, division.toUpperCase()]
        );
        if (groupCheck.rows.length > 0) {
          // It's a group name - use it directly (unified view will use sales_rep_group_name)
          logger.info(`Detected group name: ${finalSalesRep}, will use sales_rep_group_name filter`);
        }
      } catch (err) {
        // If check fails, continue with salesRep as-is
        logger.debug('Could not check if salesRep is group name:', err.message);
      }
    }
    
    // Use static method with proper parameters
    const salesData = await UniversalSalesByCountryService.getSalesByCountry(
      division, 
      finalSalesRep, 
      year, 
      months, 
      dataType || 'Actual',
      finalGroupMembers
    );
    
    // Transform to expected format { country, region, value }
    const formattedData = salesData.map(row => ({
      country: row.countryname || row.country,
      region: row.region || row.country_region || null,  // Include region from unified view
      value: parseFloat(row.total_value || row.value || 0)
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    logger.error('Error fetching sales by country', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// GET /countries-by-sales-rep-db - Get countries by sales rep
router.get('/countries-by-sales-rep-db', async (req, res) => {
  try {
    const { division, salesRep } = req.query;
    const pool = await getDivisionPool(division);
    
    const result = await pool.query(
      `SELECT DISTINCT country as country 
       FROM fp_actualcommon 
       WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND sales_rep_name = $2 
         AND country IS NOT NULL 
       ORDER BY country`,
      [division || 'FP', salesRep]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching countries by sales rep', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// GET /unassigned-countries - Get unassigned countries
router.get('/unassigned-countries', async (req, res) => {
  try {
    const { division } = req.query;
    const worldCountriesService = new WorldCountriesService(division || 'FP');
    const unassignedData = await worldCountriesService.getUnassignedCountries(division || 'FP');
    res.json({ success: true, data: unassignedData });
  } catch (error) {
    logger.error('Error fetching unassigned countries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch unassigned countries' });
  }
});

// NOTE: /geographic-distribution and /customer-insights-db routes are handled by analyticsRoutes
// with the correct API signature that the frontend expects

// POST /country-sales-data-db - Get country sales data
router.post('/country-sales-data-db', async (req, res) => {
  try {
    const { division, country, filters } = req.body;
    const pool = await getDivisionPool(division);
    
    const result = await pool.query(
      `SELECT * FROM fp_actualcommon 
       WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND country = $2`,
      [division || 'FP', country]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching country sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// GET /customers-db - Get customers from database
router.get('/customers-db', async (req, res) => {
  try {
    const { division } = req.query;
    const pool = await getDivisionPool(division);
    
    // Use customer_name_unified for merged customer names
    const result = await pool.query(
      `SELECT DISTINCT customer_name_unified as customername 
       FROM fp_actualcommon 
       WHERE customer_name_unified IS NOT NULL 
       AND TRIM(customer_name_unified) != ''
       ORDER BY customer_name_unified`
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching customers from DB', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

// POST /sales-by-customer-db - Get sales by customer from database for any division
// This endpoint aggregates customer sales data for specified periods
router.post('/sales-by-customer-db', async (req, res) => {
  try {
    const { division, salesRep, year, months, dataType = 'Actual', valueType = 'AMOUNT' } = req.body;

    if (!division || !year || !months || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'division, year, and months (array) are required'
      });
    }
    
    logger.info(`🔍 Getting sales by customer from database for division: ${division}, salesRep: ${salesRep}, year: ${year}, months: [${months.join(', ')}], dataType: ${dataType}`);
    
    // Check if salesRep is actually a group name
    const config = loadSalesRepConfig();
    const divisionConfig = config[division] || { groups: {} };
    
    let customerSalesData;
    
    if (salesRep && divisionConfig.groups && divisionConfig.groups[salesRep]) {
      // It's a group - get sales by customer for all members
      const groupMembers = divisionConfig.groups[salesRep];
      logger.info(`Fetching sales by customer for group '${salesRep}' with members:`, { members: groupMembers });
      
      customerSalesData = await UniversalSalesByCountryService.getSalesByCustomer(division, salesRep, year, months, dataType, groupMembers, valueType);
    } else {
      // Individual or all sales reps (if salesRep missing or 'ALL')
      customerSalesData = await UniversalSalesByCountryService.getSalesByCustomer(division, salesRep || null, year, months, dataType, null, valueType);
    }
    
    const salesRepDisplay = salesRep || 'All Sales Reps';
    logger.info(`✅ Retrieved sales by customer data: ${customerSalesData.length} customers for ${salesRepDisplay}`);
    
    res.json({
      success: true,
      data: customerSalesData,
      message: `Retrieved sales by customer for ${salesRepDisplay} - ${year}/[${months.join(', ')}] (${dataType}) from database`
    });
    
  } catch (error) {
    logger.error('Error getting sales by customer from database', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sales by customer from database',
      message: error.message
    });
  }
});

// GET /customers-by-salesrep-db - Get customers by sales rep
router.get('/customers-by-salesrep-db', async (req, res) => {
  try {
    const { division, salesRep } = req.query;
    const pool = await getDivisionPool(division);
    
    // Use customer_name_unified for merged customer names
    const result = await pool.query(
      `SELECT DISTINCT customer_name as customername 
       FROM fp_actualcommon 
       WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
       AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
       AND customer_name IS NOT NULL 
       AND TRIM(customer_name) != ''
       ORDER BY customer_name`,
      [division || 'FP', salesRep]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching customers by sales rep', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

// GET /customer-sales-rep-mapping - Get customer to sales rep mapping with latest data
router.get('/customer-sales-rep-mapping', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'division parameter is required'
      });
    }
    
    logger.info(`🔍 Getting customer-sales rep mapping for division: ${division}`);
    
    const divisionPool = await getDivisionPool(division);
    const mergeRulesTable = `${division.toLowerCase()}_division_customer_merge_rules`;
    
    const normalizeKey = (value) => (value || '').toString().trim().toLowerCase();
    const cleanName = (value) => (value || '').toString().trim();
    
    const parseOriginalCustomers = (raw) => {
      if (Array.isArray(raw)) return raw.filter(Boolean).map(cleanName);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean).map(cleanName);
          }
        } catch (err) {
          // fall through to return empty
        }
      }
      return [];
    };
    
    // Fetch active merge rules for this division
    let mergeRules = [];
    try {
      const mergeRulesResult = await divisionPool.query(
        `SELECT merged_customer_name, original_customers
         FROM ${mergeRulesTable}
         WHERE division = $1
           AND is_active = true
           AND status = 'ACTIVE'`,
        [division]
      );
      mergeRules = mergeRulesResult.rows
        .map(row => ({
          mergedName: cleanName(row.merged_customer_name),
          originalCustomers: parseOriginalCustomers(row.original_customers)
        }))
        .filter(rule => rule.mergedName && rule.originalCustomers.length > 0);
      logger.info(`✅ Found ${mergeRules.length} active merge rules`);
    } catch (err) {
      logger.warn(`⚠️ Could not fetch merge rules: ${err.message}`);
    }
    
    // Load sales rep groups to map individual sales reps to group names
    const salesRepConfig = loadSalesRepConfig();
    const divisionConfig = salesRepConfig[division] || { defaults: [], groups: {} };
    const groups = divisionConfig.groups || {};
    
    // Create reverse mapping: individual sales rep -> group name
    const salesRepToGroupMap = new Map();
    for (const [groupName, members] of Object.entries(groups)) {
      if (Array.isArray(members)) {
        members.forEach(member => {
          salesRepToGroupMap.set(normalizeKey(member), groupName);
        });
      }
    }
    logger.info(`📋 Loaded ${Object.keys(groups).length} sales rep groups with ${salesRepToGroupMap.size} individual members`);
    
    // Query to get the most recent sales rep for each customer
    // Uses window function to rank by year DESC, month DESC, total_value DESC
    // FIXED: Use fp_actualcommon columns - customer_name, sales_rep_name, amount
    const mappingQuery = `
      WITH base AS (
        SELECT
          TRIM(customer_name) AS customer,
          TRIM(sales_rep_name) AS sales_rep,
          COALESCE(year::int, 0) AS year,
          COALESCE(month_no::int, 0) AS month,
          COALESCE(amount, 0)::numeric AS value
        FROM fp_actualcommon
        WHERE customer_name IS NOT NULL
          AND TRIM(customer_name) <> ''
          AND sales_rep_name IS NOT NULL
          AND TRIM(sales_rep_name) <> ''
          AND UPPER(admin_division_code) = UPPER($1)
      ),
      aggregated AS (
        SELECT
          customer,
          sales_rep,
          year,
          month,
          SUM(value) AS total_value
        FROM base
        GROUP BY customer, sales_rep, year, month
      ),
      ranked AS (
        SELECT
          customer,
          sales_rep,
          year,
          month,
          total_value,
          ROW_NUMBER() OVER (
            PARTITION BY customer
            ORDER BY year DESC, month DESC, total_value DESC
          ) AS rn
        FROM aggregated
      )
      SELECT customer, sales_rep, year, month, total_value
      FROM ranked
      WHERE rn = 1
      ORDER BY customer;
    `;
    
    logger.info(`📋 Querying fp_actualcommon for customer-sales rep mappings...`);
    const mappingResult = await divisionPool.query(mappingQuery, [division]);
    logger.info(`✅ Found ${mappingResult.rows.length} raw customer-sales rep mappings`);
    
    // Build normalized map - apply sales rep group mapping here
    const normalizedMap = {};
    let groupMappingsApplied = 0;
    mappingResult.rows.forEach(row => {
      const key = normalizeKey(row.customer);
      const rawSalesRep = cleanName(row.sales_rep);
      
      // Check if this sales rep belongs to a group
      const groupName = salesRepToGroupMap.get(normalizeKey(rawSalesRep));
      const displaySalesRep = groupName || rawSalesRep;
      
      if (groupName) {
        groupMappingsApplied++;
      }
      
      normalizedMap[key] = {
        customer: cleanName(row.customer),
        salesRep: displaySalesRep, // Use group name if exists, otherwise raw name
        rawSalesRep: rawSalesRep,  // Keep original for reference
        year: Number(row.year) || 0,
        month: Number(row.month) || 0,
        totalValue: Number(row.total_value) || 0,
        source: 'raw'
      };
    });
    
    logger.info(`📋 Applied sales rep groups: ${groupMappingsApplied} customers mapped to groups`);
    
    // Apply merge rules so merged customers get a sales rep assignment
    let mergedAssignments = 0;
    mergeRules.forEach(rule => {
      let bestEntry = null;
      
      rule.originalCustomers.forEach(originalName => {
        const normalizedOriginal = normalizeKey(originalName);
        const entry = normalizedMap[normalizedOriginal];
        if (entry) {
          // Check if this entry is newer than the current best
          if (!bestEntry || 
              entry.year > bestEntry.year || 
              (entry.year === bestEntry.year && entry.month > bestEntry.month) ||
              (entry.year === bestEntry.year && entry.month === bestEntry.month && entry.totalValue > bestEntry.totalValue)) {
            bestEntry = entry;
          }
        }
      });
      
      if (bestEntry) {
        const mergedKey = normalizeKey(rule.mergedName);
        normalizedMap[mergedKey] = {
          customer: rule.mergedName,
          salesRep: bestEntry.salesRep, // Already has group name applied
          rawSalesRep: bestEntry.rawSalesRep,
          year: bestEntry.year,
          month: bestEntry.month,
          totalValue: bestEntry.totalValue,
          source: 'merged',
          mergedFrom: rule.originalCustomers
        };
        mergedAssignments += 1;
      }
    });
    
    // Convert to response format keyed by customer name
    const responseData = {};
    Object.values(normalizedMap).forEach(entry => {
      responseData[entry.customer] = {
        salesRep: entry.salesRep,
        year: entry.year,
        month: entry.month,
        source: entry.source,
        mergedFrom: entry.mergedFrom || null
      };
    });
    
    logger.info(`✅ Customer-sales rep mapping ready: ${Object.keys(responseData).length} customers (${mergedAssignments} merged, ${groupMappingsApplied} grouped)`);
    
    res.json({
      success: true,
      data: responseData,
      meta: {
        totalCustomers: mappingResult.rowCount,
        mergedAssignments,
        division
      },
      message: `Retrieved ${Object.keys(responseData).length} customer-sales rep mappings`
    });
    
  } catch (error) {
    logger.error('Error fetching customer-sales rep mapping', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch mapping', message: error.message });
  }
});

// POST /customer-sales-data-db - Get customer sales data from database
router.post('/customer-sales-data-db', async (req, res) => {
  try {
    const { division, customer, filters } = req.body;
    const pool = await getDivisionPool(division);
    
    // Use customer_name_unified for merged customer names
    let query = `SELECT * FROM fp_actualcommon WHERE customer_name_unified = $1`;
    const params = [customer];
    
    // Add filters if provided
    if (filters?.year) {
      query += ` AND year = $${params.length + 1}`;
      params.push(filters.year);
    }
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching customer sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// POST /sales-rep-divisional-batch - Batch sales rep data by division
router.post('/sales-rep-divisional-batch', async (req, res) => {
  try {
    const { division, salesReps } = req.body;
    const pool = await getDivisionPool(division);
    
    const result = await pool.query(
      `SELECT * FROM fp_actualcommon WHERE salesrepname = ANY($1)`,
      [salesReps]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching batch sales rep data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch data' });
  }
});

// POST /sales-rep-divisional-ultra-fast - Ultra-fast sales rep query
// Returns aggregated sales data by sales rep for the requested columns (year/type)
// Uses UniversalSalesByCountryService for proper month range handling (Q1, Q2, HY1, FY, etc.)
router.post('/sales-rep-divisional-ultra-fast', async (req, res) => {
  try {
    const { division, salesReps, columns } = req.body;
    
    if (!division || !Array.isArray(salesReps) || !salesReps.length || !Array.isArray(columns)) {
      return res.status(400).json({ 
        success: false, 
        error: 'division, salesReps (array), and columns (array) are required' 
      });
    }
    
    logger.info(`🚀 ULTRA-FAST getting sales rep divisional data for division: ${division}, ${salesReps.length} sales reps, ${columns.length} columns`);
    
    // Use the proper service method that handles:
    // - Custom month ranges (months array)
    // - Quarters (Q1, Q2, Q3, Q4)
    // - Half-years (HY1, HY2)
    // - Full year (FY, Year)
    // - Estimate/Forecast type combination (Actual + Estimate)
    const ultraFastData = await UniversalSalesByCountryService.getSalesRepDivisionalUltraFast(
      division, 
      salesReps, 
      columns
    );
    
    logger.info(`⚡ ULTRA-FAST retrieved sales rep divisional data for ${salesReps.length} sales reps across ${columns.length} columns`);
    
    res.json({
      success: true,
      data: ultraFastData,
      message: `ULTRA-FAST retrieved sales rep divisional data for ${salesReps.length} sales reps across ${columns.length} columns`
    });
    
  } catch (error) {
    logger.error('Error in ultra-fast sales rep query', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch data', message: error.message });
  }
});

// POST /sales-by-customer-ultra-fast - Ultra-fast customer sales query for ALL columns
router.post('/sales-by-customer-ultra-fast', async (req, res) => {
  try {
    const { division, columns } = req.body;

    if (!division || !columns || !Array.isArray(columns)) {
      return res.status(400).json({
        success: false,
        message: 'division and columns (array) are required'
      });
    }
    
    logger.info(`🚀 ULTRA-FAST getting sales by customer data for division: ${division}, ${columns.length} columns`);
    
    // Get the ultra-fast data using optimized queries
    const ultraFastData = await UniversalSalesByCountryService.getSalesByCustomerUltraFast(
      division, 
      columns
    );
    
    logger.info(`⚡ ULTRA-FAST retrieved sales by customer data across ${columns.length} columns`);
    
    res.json({
      success: true,
      data: ultraFastData,
      message: `ULTRA-FAST retrieved sales by customer data across ${columns.length} columns`
    });
    
  } catch (error) {
    logger.error('Error in ultra-fast sales by customer query', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch data', message: error.message });
  }
});

// POST /sales-rep-reports-ultra-fast - Ultra-fast ALL sales rep reports
router.post('/sales-rep-reports-ultra-fast', async (req, res) => {
  console.log('\n\n🔥🔥🔥 ULTRA-FAST REPORT API CALLED! 🔥🔥🔥\n');
  try {
    const { division, salesReps, columns } = req.body;
    
    console.log('📝 Request body:', JSON.stringify({ division, salesRepsCount: salesReps?.length, salesReps: salesReps?.slice(0, 5), columnsCount: columns?.length }, null, 2));

    if (!division || !salesReps || !Array.isArray(salesReps) || !columns || !Array.isArray(columns)) {
      return res.status(400).json({
        success: false,
        message: 'division, salesReps (array), and columns (array) are required'
      });
    }
    
    logger.info(`🚀 ULTRA-FAST getting ALL sales rep reports for division: ${division}, ${salesReps.length} sales reps, ${columns.length} columns`);
    console.log('🚀 Sales reps passed to getSalesRepReportsUltraFast:', salesReps);
    
    // Get the ultra-fast data using optimized queries
    const ultraFastData = await UniversalSalesByCountryService.getSalesRepReportsUltraFast(
      division, 
      salesReps,
      columns
    );
    
    logger.info(`⚡ ULTRA-FAST retrieved reports data for ${salesReps.length} sales reps across ${columns.length} columns`);
    
    res.json({
      success: true,
      data: ultraFastData,
      message: `ULTRA-FAST retrieved reports data for ${salesReps.length} sales reps across ${columns.length} columns`
    });
    
  } catch (error) {
    logger.error('Error in ultra-fast sales rep reports', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate reports', message: error.message });
  }
});

// GET /sales-rep-groups-universal - Get sales rep groups from database
router.get('/sales-rep-groups-universal', async (req, res) => {
  try {
    const { division } = req.query;
    
    let query = `
      SELECT g.id, g.group_name, g.division, 
             COALESCE(json_agg(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL), '[]') as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON g.id = m.group_id
    `;
    
    const params = [];
    if (division) {
      query += ` WHERE g.division = $1`;
      params.push(division.toUpperCase());
    }
    
    query += ` GROUP BY g.id, g.group_name, g.division ORDER BY g.group_name`;
    
    const result = await pool.query(query, params);
    
    // Transform to the format expected by frontend: { groupName: [members] }
    if (division) {
      const groups = {};
      result.rows.forEach(row => {
        groups[row.group_name] = row.members || [];
      });
      res.json({ success: true, data: groups });
    } else {
      // Return all divisions' groups
      const allGroups = {};
      result.rows.forEach(row => {
        if (!allGroups[row.division]) {
          allGroups[row.division] = {};
        }
        allGroups[row.division][row.group_name] = row.members || [];
      });
      res.json({ success: true, data: allGroups });
    }
  } catch (error) {
    logger.error('Error fetching sales rep groups', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales rep groups' });
  }
});

// POST /sales-rep-groups-universal - Save sales rep group to database
router.post('/sales-rep-groups-universal', async (req, res) => {
  const client = await pool.connect();
  try {
    const { division, groupName, members, originalGroupName } = req.body;
    
    if (!division || !groupName) {
      return res.status(400).json({ success: false, error: 'Division and group name are required' });
    }
    
    const divKey = division.toUpperCase();
    
    await client.query('BEGIN');
    
    // Disable trigger during bulk operations to prevent slow row-by-row updates
    await client.query('ALTER TABLE sales_rep_group_members DISABLE TRIGGER trg_sync_sales_rep_groups');
    
    let groupId;
    
    // If renaming, delete the old group and create new one
    if (originalGroupName && originalGroupName !== groupName) {
      // Get the old group ID first
      const oldGroupResult = await client.query(
        'SELECT id FROM sales_rep_groups WHERE group_name = $1 AND division = $2',
        [originalGroupName, divKey]
      );
      
      if (oldGroupResult.rows.length > 0) {
        groupId = oldGroupResult.rows[0].id;
        
        // Update the group name
        await client.query(
          'UPDATE sales_rep_groups SET group_name = $1, updated_at = NOW() WHERE id = $2',
          [groupName, groupId]
        );
        logger.info('Renamed sales rep group', { division: divKey, from: originalGroupName, to: groupName, groupId });
      } else {
        // Old group doesn't exist, create new one
        const newGroupResult = await client.query(`
          INSERT INTO sales_rep_groups (group_name, division)
          VALUES ($1, $2)
          RETURNING id
        `, [groupName, divKey]);
        groupId = newGroupResult.rows[0].id;
      }
    } else {
      // Not renaming, just upsert the group
      const groupResult = await client.query(`
        INSERT INTO sales_rep_groups (group_name, division)
        VALUES ($1, $2)
        ON CONFLICT (group_name, division) DO UPDATE SET updated_at = NOW()
        RETURNING id
      `, [groupName, divKey]);
      groupId = groupResult.rows[0].id;
    }
    
    // Delete existing members for this group
    await client.query('DELETE FROM sales_rep_group_members WHERE group_id = $1', [groupId]);
    
    // Insert new members
    if (members && members.length > 0) {
      for (const memberName of members) {
        // Try to link to sales_rep_master
        const masterResult = await client.query(
          'SELECT id FROM sales_rep_master WHERE LOWER(TRIM(canonical_name)) = LOWER(TRIM($1))',
          [memberName]
        );
        const salesRepId = masterResult.rows[0]?.id || null;
        
        await client.query(
          'INSERT INTO sales_rep_group_members (group_id, member_name, sales_rep_id) VALUES ($1, $2, $3)',
          [groupId, memberName, salesRepId]
        );
      }
    }
    
    // Re-enable trigger
    await client.query('ALTER TABLE sales_rep_group_members ENABLE TRIGGER trg_sync_sales_rep_groups');
    
    await client.query('COMMIT');
    
    // SYNC: Do a single bulk update instead of row-by-row trigger updates
    try {
      // Update fp_actualcommon for all members in this group at once
      await pool.query(`
        UPDATE fp_actualcommon ac
        SET sales_rep_group_id = $1, sales_rep_group_name = $2, updated_at = NOW()
        WHERE UPPER(TRIM(ac.sales_rep_name)) IN (
          SELECT UPPER(TRIM(member_name)) FROM sales_rep_group_members WHERE group_id = $1
        )
      `, [groupId, groupName]);
      
      // Update customers for all members in this group at once
      await pool.query(`
        UPDATE fp_customer_unified cu
        SET sales_rep_group_id = $1, sales_rep_group_name = $2
        WHERE UPPER(TRIM(cu.primary_sales_rep_name)) IN (
          SELECT UPPER(TRIM(member_name)) FROM sales_rep_group_members WHERE group_id = $1
        )
      `, [groupId, groupName]);
      
      await pool.query(`
        UPDATE fp_budget_customer_unified bu
        SET sales_rep_group_id = $1, sales_rep_group_name = $2
        WHERE UPPER(TRIM(bu.primary_sales_rep_name)) IN (
          SELECT UPPER(TRIM(member_name)) FROM sales_rep_group_members WHERE group_id = $1
        )
      `, [groupId, groupName]);
      
      // Update budget unified for all members in this group
      // Match by group_id OR by old group name (for records that might have stale name but correct id)
      await pool.query(`
        UPDATE fp_budget_unified
        SET sales_rep_group_id = $1, sales_rep_group_name = $2
        WHERE sales_rep_group_id = $1
           OR (sales_rep_group_name = $3 AND (sales_rep_group_id IS NULL OR sales_rep_group_id = $1))
      `, [groupId, groupName, originalGroupName || groupName]);
      
      // Update budget allocation for this group
      await pool.query(`
        UPDATE fp_sales_rep_group_budget_allocation
        SET sales_rep_group_id = $1, sales_rep_group_name = $2
        WHERE sales_rep_group_id = $1
           OR (sales_rep_group_name = $3 AND (sales_rep_group_id IS NULL OR sales_rep_group_id = $1))
      `, [groupId, groupName, originalGroupName || groupName]);
      
      logger.info('🔄 Unified tables synced with group changes (bulk update)');
    } catch (syncErr) {
      logger.warn('Failed to sync unified tables:', syncErr.message);
    }
    
    // Invalidate the server-side sales rep groups cache so all endpoints use fresh data
    const { invalidateCache: invalidateGroupsCache } = require('../services/salesRepGroupsService');
    invalidateGroupsCache();
    // Reload cache immediately from database
    const { preloadCache: reloadGroupsCache } = require('../services/salesRepGroupsService');
    reloadGroupsCache().catch(err => logger.warn('Cache reload warning:', err.message));
    
    logger.info('Sales rep group saved', { division: divKey, groupName, memberCount: members?.length || 0 });
    res.json({ success: true, message: 'Group saved successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    // Re-enable trigger in case of error
    try {
      await client.query('ALTER TABLE sales_rep_group_members ENABLE TRIGGER trg_sync_sales_rep_groups');
    } catch (e) { /* ignore */ }
    logger.error('Error saving sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save sales rep group' });
  } finally {
    client.release();
  }
});

// DELETE /sales-rep-groups-universal - Delete sales rep group from database
router.delete('/sales-rep-groups-universal', async (req, res) => {
  try {
    const { division, groupName } = req.query;
    
    if (!division || !groupName) {
      return res.status(400).json({ success: false, error: 'Division and group name are required' });
    }
    
    const divKey = division.toUpperCase();
    
    // First, get the group ID
    const groupResult = await pool.query(
      'SELECT id FROM sales_rep_groups WHERE group_name = $1 AND division = $2',
      [groupName, divKey]
    );
    
    if (groupResult.rows.length > 0) {
      const groupId = groupResult.rows[0].id;
      
      // Clear group references in fp_actualcommon (transactions remain, just ungroup them)
      await pool.query(
        'UPDATE fp_actualcommon SET sales_rep_group_id = NULL, sales_rep_group_name = NULL, updated_at = NOW() WHERE sales_rep_group_id = $1',
        [groupId]
      );
      logger.info('Cleared group references in fp_actualcommon', { groupId, groupName });
      
      // Clear group_id reference in fp_sales_rep_unified (makes them solo sales reps)
      await pool.query(
        'UPDATE fp_sales_rep_unified SET group_id = NULL, group_name = NULL WHERE group_id = $1',
        [groupId]
      );
      logger.info('Cleared group references in unified table', { groupId, groupName });
      
      // Clear references in customer tables
      await pool.query(
        'UPDATE fp_customer_unified SET sales_rep_group_id = NULL, sales_rep_group_name = NULL WHERE sales_rep_group_id = $1',
        [groupId]
      );
      await pool.query(
        'UPDATE fp_budget_customer_unified SET sales_rep_group_id = NULL, sales_rep_group_name = NULL WHERE sales_rep_group_id = $1',
        [groupId]
      );
      logger.info('Cleared group references in customer tables', { groupId, groupName });
      
      // Delete group members explicitly (triggers fire to update customer tables)
      await pool.query(
        'DELETE FROM sales_rep_group_members WHERE group_id = $1',
        [groupId]
      );
      logger.info('Deleted group members', { groupId, groupName });
    }
    
    // Now delete the group itself
    const result = await pool.query(
      'DELETE FROM sales_rep_groups WHERE group_name = $1 AND division = $2',
      [groupName, divKey]
    );
    
    if (result.rowCount > 0) {
      // SYNC: Update unified sales rep table with group deletion
      try {
        await pool.query('SELECT * FROM sync_sales_rep_groups_to_unified()');
        logger.info('🔄 Unified sales rep table synced after group deletion');
      } catch (syncErr) {
        logger.warn('Failed to sync unified table:', syncErr.message);
      }
      
      logger.info('Sales rep group deleted', { division: divKey, groupName });
      res.json({ success: true, message: 'Group deleted successfully' });
    } else {
      res.json({ success: true, message: 'Group not found, nothing to delete' });
    }
  } catch (error) {
    logger.error('Error deleting sales rep group', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete sales rep group' });
  }
});

// ============================================
// SALES REP MASTER DATA ENDPOINTS
// ============================================

// GET /sales-rep-master - Get all sales rep master records with aliases
router.get('/sales-rep-master', async (req, res) => {
  try {
    const { division } = req.query;
    
    let query = `
      SELECT 
        m.id,
        m.canonical_name,
        m.division,
        m.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', a.id, 'alias', a.alias_name)
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) as aliases,
        (SELECT COUNT(*) FROM sales_rep_group_members gm WHERE gm.sales_rep_id = m.id) as group_count
      FROM sales_rep_master m
      LEFT JOIN sales_rep_aliases a ON m.id = a.sales_rep_id
    `;
    
    const params = [];
    if (division) {
      query += ' WHERE m.division = $1';
      params.push(division.toUpperCase());
    }
    
    query += ' GROUP BY m.id, m.canonical_name, m.division, m.created_at ORDER BY m.canonical_name';
    
    const result = await pool.query(query, params);
    
    res.json({ 
      success: true, 
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    logger.error('Error fetching sales rep master', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales rep master data' });
  }
});

// POST /sales-rep-master/alias - Add an alias to a sales rep
router.post('/sales-rep-master/alias', async (req, res) => {
  try {
    const { salesRepId, alias } = req.body;
    
    if (!salesRepId || !alias) {
      return res.status(400).json({ success: false, error: 'Sales rep ID and alias are required' });
    }
    
    // Check if alias already exists
    const existing = await pool.query(
      'SELECT id FROM sales_rep_aliases WHERE LOWER(alias_name) = LOWER($1)',
      [alias.trim()]
    );
    
    if (existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: 'This alias already exists' });
    }
    
    // Add the alias
    const result = await pool.query(
      'INSERT INTO sales_rep_aliases (sales_rep_id, alias_name) VALUES ($1, $2) RETURNING id, alias_name as alias',
      [salesRepId, alias.trim()]
    );
    
    logger.info('Sales rep alias added', { salesRepId, alias: alias.trim() });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error adding sales rep alias', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add alias' });
  }
});

// DELETE /sales-rep-master/alias/:id - Delete an alias
router.delete('/sales-rep-master/alias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM sales_rep_aliases WHERE id = $1', [id]);
    
    if (result.rowCount > 0) {
      logger.info('Sales rep alias deleted', { aliasId: id });
      res.json({ success: true, message: 'Alias deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Alias not found' });
    }
  } catch (error) {
    logger.error('Error deleting sales rep alias', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete alias' });
  }
});

// PUT /sales-rep-master/:id - Update sales rep canonical name
router.put('/sales-rep-master/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { canonical_name } = req.body;
    
    if (!canonical_name) {
      return res.status(400).json({ success: false, error: 'Canonical name is required' });
    }
    
    const result = await pool.query(
      'UPDATE sales_rep_master SET canonical_name = $1 WHERE id = $2 RETURNING *',
      [canonical_name.trim(), id]
    );
    
    if (result.rowCount > 0) {
      logger.info('Sales rep updated', { id, canonical_name: canonical_name.trim() });
      res.json({ success: true, data: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: 'Sales rep not found' });
    }
  } catch (error) {
    logger.error('Error updating sales rep', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update sales rep' });
  }
});

// POST /sales-rep-master/merge - Merge two sales reps (move aliases from source to target, delete source)
router.post('/sales-rep-master/merge', async (req, res) => {
  const client = await pool.connect();
  try {
    const { sourceId, targetId } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ success: false, error: 'Source and target IDs are required' });
    }
    
    if (sourceId === targetId) {
      return res.status(400).json({ success: false, error: 'Cannot merge a sales rep with itself' });
    }
    
    await client.query('BEGIN');
    
    // Get source sales rep info
    const sourceResult = await client.query(
      'SELECT canonical_name FROM sales_rep_master WHERE id = $1',
      [sourceId]
    );
    
    if (sourceResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Source sales rep not found' });
    }
    
    const sourceName = sourceResult.rows[0].canonical_name;
    
    // Add source's canonical name as an alias to target
    await client.query(
      'INSERT INTO sales_rep_aliases (sales_rep_id, alias_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [targetId, sourceName]
    );
    
    // Move all aliases from source to target
    await client.query(
      'UPDATE sales_rep_aliases SET sales_rep_id = $1 WHERE sales_rep_id = $2',
      [targetId, sourceId]
    );
    
    // Update group memberships to point to target
    await client.query(
      'UPDATE sales_rep_group_members SET sales_rep_id = $1 WHERE sales_rep_id = $2',
      [targetId, sourceId]
    );
    
    // Delete source sales rep
    await client.query('DELETE FROM sales_rep_master WHERE id = $1', [sourceId]);
    
    await client.query('COMMIT');
    
    logger.info('Sales reps merged', { sourceId, targetId, sourceName });
    res.json({ success: true, message: `Merged "${sourceName}" into target` });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error merging sales reps', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to merge sales reps' });
  } finally {
    client.release();
  }
});

// POST /check-sales-rep-aliases - Check for potential aliases in new data
router.post('/check-sales-rep-aliases', async (req, res) => {
  try {
    const { division, salesRepNames } = req.body;
    
    if (!division || !salesRepNames || !Array.isArray(salesRepNames)) {
      return res.status(400).json({ success: false, error: 'Division and salesRepNames array required' });
    }
    
    // Get existing sales rep names from database
    const result = await pool.query(
      'SELECT DISTINCT canonical_name FROM sales_rep_master WHERE division = $1',
      [division.toUpperCase()]
    );
    
    const existingNames = result.rows.map(row => row.canonical_name);
    
    // Find potential aliases
    const potentialAliases = findPotentialAliases(salesRepNames, existingNames);
    
    logger.info('Alias check completed', { 
      division, 
      newNamesCount: salesRepNames.length,
      existingNamesCount: existingNames.length,
      potentialAliasesFound: potentialAliases.length 
    });
    
    res.json({ 
      success: true, 
      potentialAliases,
      hasAliases: potentialAliases.length > 0
    });
  } catch (error) {
    logger.error('Error checking for aliases', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to check for aliases' });
  }
});

// Note: Country mapping routes are available via /api/pending-countries/* 
// See server/routes/pendingCountries.js for the pending country management API

module.exports = router;
