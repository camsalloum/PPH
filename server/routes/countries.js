/**
 * @fileoverview Countries Management Routes
 * @description API endpoints for managing master countries reference data
 * Common for all divisions - provides country lookup, region mapping, and currency info
 */

const express = require('express');
const router = express.Router();
const { authPool } = require('../database/config');
const { authenticate } = require('../middleware/auth');
const requireAnyRole = require('../middleware/requireAnyRole');
const logger = require('../utils/logger');

const isValidIanaTimezone = (timezone) => {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * GET /api/countries/list
 * Get all countries with optional filtering
 * @query region - Filter by region
 * @query active - Filter by active status (true/false)
 * @query withCurrency - Include only countries with currency data
 */
router.get('/list', async (req, res) => {
  try {
    const { region, active, withCurrency } = req.query;
    
    let query = `
      SELECT 
        mc.id,
        mc.country_name,
        mc.country_code_2,
        mc.country_code_3,
        mc.numeric_code,
        mc.currency_code,
        mc.region,
        mc.sub_region,
        mc.market_type,
        mc.longitude,
        mc.latitude,
        mc.phone_code,
        mc.capital,
        mc.continent,
        mc.timezone,
        mc.is_active,
        mc.display_order,
        c.name as currency_name,
        c.symbol as currency_symbol,
        c.decimal_places as currency_decimal_places
      FROM master_countries mc
      LEFT JOIN currencies c ON mc.currency_code = c.code
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (region) {
      paramCount++;
      query += ` AND mc.region = $${paramCount}`;
      params.push(region);
    }
    
    if (active !== undefined) {
      paramCount++;
      query += ` AND mc.is_active = $${paramCount}`;
      params.push(active === 'true');
    }
    
    if (withCurrency === 'true') {
      query += ` AND mc.currency_code IS NOT NULL`;
    }
    
    query += ` ORDER BY mc.country_name`;
    
    const result = await authPool.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      countries: result.rows
    });
  } catch (error) {
    logger.error('Error fetching countries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/regions
 * Get list of all unique regions
 */
router.get('/regions', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT region, COUNT(*) as country_count
      FROM master_countries
      WHERE is_active = true AND region IS NOT NULL
      GROUP BY region
      ORDER BY 
        CASE region
          WHEN 'UAE' THEN 1
          WHEN 'GCC' THEN 2
          WHEN 'Levant' THEN 3
          WHEN 'Europe' THEN 4
          WHEN 'North Africa' THEN 5
          WHEN 'Southern Africa' THEN 6
          WHEN 'Asia-Pacific' THEN 7
          WHEN 'Americas' THEN 8
          ELSE 99
        END
    `);
    
    res.json({
      success: true,
      regions: result.rows
    });
  } catch (error) {
    logger.error('Error fetching regions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/lookup/:name
 * Lookup a country by name (handles aliases)
 * @param name - Country name or alias to lookup
 */
router.get('/lookup/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    // First try exact match on country_name
    let result = await authPool.query(`
      SELECT 
        mc.*,
        c.name as currency_name,
        c.symbol as currency_symbol
      FROM master_countries mc
      LEFT JOIN currencies c ON mc.currency_code = c.code
      WHERE LOWER(mc.country_name) = LOWER($1)
    `, [name]);
    
    // If not found, try alias lookup
    if (result.rows.length === 0) {
      result = await authPool.query(`
        SELECT 
          mc.*,
          c.name as currency_name,
          c.symbol as currency_symbol,
          ca.alias_name as matched_alias
        FROM country_aliases ca
        JOIN master_countries mc ON ca.country_id = mc.id
        LEFT JOIN currencies c ON mc.currency_code = c.code
        WHERE LOWER(ca.alias_name) = LOWER($1)
      `, [name]);
    }
    
    if (result.rows.length === 0) {
      // Try partial match
      result = await authPool.query(`
        SELECT 
          mc.*,
          c.name as currency_name,
          c.symbol as currency_symbol
        FROM master_countries mc
        LEFT JOIN currencies c ON mc.currency_code = c.code
        WHERE LOWER(mc.country_name) LIKE LOWER($1)
        LIMIT 1
      `, [`%${name}%`]);
    }
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: `Country not found: ${name}`,
        country: null
      });
    }
    
    res.json({
      success: true,
      country: result.rows[0]
    });
  } catch (error) {
    logger.error('Error looking up country:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/by-code/:code
 * Get country by ISO code (2 or 3 letter)
 * @param code - ISO 3166-1 alpha-2 or alpha-3 code
 */
router.get('/by-code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();
    
    const codeColumn = upperCode.length === 2 ? 'country_code_2' : 'country_code_3';
    
    const result = await authPool.query(`
      SELECT 
        mc.*,
        c.name as currency_name,
        c.symbol as currency_symbol
      FROM master_countries mc
      LEFT JOIN currencies c ON mc.currency_code = c.code
      WHERE ${codeColumn} = $1
    `, [upperCode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Country with code ${code} not found`
      });
    }
    
    res.json({
      success: true,
      country: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching country by code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/aliases/:countryId
 * Get all aliases for a specific country
 * @param countryId - Country ID
 */
router.get('/aliases/:countryId', async (req, res) => {
  try {
    const { countryId } = req.params;
    
    const result = await authPool.query(`
      SELECT id, alias_name, alias_type, created_at
      FROM country_aliases
      WHERE country_id = $1
      ORDER BY alias_type, alias_name
    `, [countryId]);
    
    res.json({
      success: true,
      aliases: result.rows
    });
  } catch (error) {
    logger.error('Error fetching country aliases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/countries
 * Add a new country (admin only)
 * @body country_name, country_code_2, country_code_3, currency_code, region, etc.
 */
router.post('/', authenticate, requireAnyRole(['admin']), async (req, res) => {
  try {
    const {
      country_name,
      country_code_2,
      country_code_3,
      numeric_code,
      currency_code,
      region,
      sub_region,
      market_type,
      longitude,
      latitude,
      phone_code,
      capital,
      continent,
      timezone,
      display_order
    } = req.body;
    const normalizedTimezone = typeof timezone === 'string' ? timezone.trim() : timezone;
    
    if (!country_name) {
      return res.status(400).json({
        success: false,
        error: 'Country name is required'
      });
    }

    if (normalizedTimezone && !isValidIanaTimezone(normalizedTimezone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timezone. Please provide a valid IANA timezone (for example: Asia/Dubai).'
      });
    }
    
    const result = await authPool.query(`
      INSERT INTO master_countries (
        country_name, country_code_2, country_code_3, numeric_code,
        currency_code, region, sub_region, market_type,
        longitude, latitude, phone_code, capital, continent, timezone, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      country_name, country_code_2?.toUpperCase(), country_code_3?.toUpperCase(),
      numeric_code, currency_code?.toUpperCase(), region, sub_region, market_type,
      longitude, latitude, phone_code, capital, continent, normalizedTimezone || null, display_order || 999
    ]);
    
    logger.info(`Country added: ${country_name} by user ${req.user?.id}`);
    
    res.status(201).json({
      success: true,
      country: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Country with this name already exists'
      });
    }
    logger.error('Error adding country:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/countries/:id
 * Update a country (admin only)
 * @param id - Country ID
 */
router.put('/:id', authenticate, requireAnyRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      country_name,
      country_code_2,
      country_code_3,
      numeric_code,
      currency_code,
      region,
      sub_region,
      market_type,
      longitude,
      latitude,
      phone_code,
      capital,
      continent,
      timezone,
      is_active,
      display_order
    } = req.body;
    const normalizedTimezone = typeof timezone === 'string' ? timezone.trim() : timezone;

    if (normalizedTimezone && !isValidIanaTimezone(normalizedTimezone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timezone. Please provide a valid IANA timezone (for example: Asia/Dubai).'
      });
    }
    
    const result = await authPool.query(`
      UPDATE master_countries SET
        country_name = COALESCE($1, country_name),
        country_code_2 = COALESCE(UPPER($2), country_code_2),
        country_code_3 = COALESCE(UPPER($3), country_code_3),
        numeric_code = COALESCE($4, numeric_code),
        currency_code = COALESCE(UPPER($5), currency_code),
        region = COALESCE($6, region),
        sub_region = COALESCE($7, sub_region),
        market_type = COALESCE($8, market_type),
        longitude = COALESCE($9, longitude),
        latitude = COALESCE($10, latitude),
        phone_code = COALESCE($11, phone_code),
        capital = COALESCE($12, capital),
        continent = COALESCE($13, continent),
        timezone = COALESCE($14, timezone),
        is_active = COALESCE($15, is_active),
        display_order = COALESCE($16, display_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *
    `, [
      country_name, country_code_2, country_code_3, numeric_code,
      currency_code, region, sub_region, market_type,
      longitude, latitude, phone_code, capital, continent,
      normalizedTimezone || null, is_active, display_order, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Country not found'
      });
    }
    
    logger.info(`Country updated: ${result.rows[0].country_name} by user ${req.user?.id}`);
    
    // Sync unified tables with updated region info (non-blocking)
    try {
      await authPool.query('SELECT refresh_unified_stats()');
      await authPool.query('SELECT refresh_budget_unified_stats()');
      logger.info('✅ Unified tables synced after country update');
    } catch (syncErr) {
      logger.warn('⚠️ Unified sync failed (non-critical):', syncErr.message);
    }
    
    res.json({
      success: true,
      country: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating country:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/countries/:id/alias
 * Add an alias for a country (admin only)
 * @param id - Country ID
 * @body alias_name, alias_type
 */
router.post('/:id/alias', authenticate, requireAnyRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { alias_name, alias_type = 'common' } = req.body;
    
    if (!alias_name) {
      return res.status(400).json({
        success: false,
        error: 'Alias name is required'
      });
    }
    
    const result = await authPool.query(`
      INSERT INTO country_aliases (country_id, alias_name, alias_type)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, alias_name, alias_type]);
    
    logger.info(`Alias added for country ${id}: ${alias_name}`);
    
    // Sync unified tables with new alias (non-blocking)
    try {
      await authPool.query('SELECT refresh_unified_stats()');
      await authPool.query('SELECT refresh_budget_unified_stats()');
      logger.info('✅ Unified tables synced after alias creation');
    } catch (syncErr) {
      logger.warn('⚠️ Unified sync failed (non-critical):', syncErr.message);
    }
    
    res.status(201).json({
      success: true,
      alias: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'This alias already exists'
      });
    }
    if (error.code === '23503') {
      return res.status(404).json({
        success: false,
        error: 'Country not found'
      });
    }
    logger.error('Error adding alias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/countries/alias/:aliasId
 * Delete an alias (admin only)
 * @param aliasId - Alias ID
 */
router.delete('/alias/:aliasId', authenticate, requireAnyRole(['admin']), async (req, res) => {
  try {
    const { aliasId } = req.params;
    
    const result = await authPool.query(`
      DELETE FROM country_aliases WHERE id = $1 RETURNING *
    `, [aliasId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alias not found'
      });
    }
    
    logger.info(`Alias deleted: ${result.rows[0].alias_name}`);
    
    res.json({
      success: true,
      message: 'Alias deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting alias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/map-data
 * Get countries with coordinates for map visualization
 * Returns only countries with valid coordinates
 */
router.get('/map-data', async (req, res) => {
  try {
    const { region } = req.query;
    
    let query = `
      SELECT 
        mc.country_name,
        mc.country_code_2 as code,
        mc.longitude,
        mc.latitude,
        mc.region,
        mc.market_type,
        mc.currency_code,
        c.symbol as currency_symbol
      FROM master_countries mc
      LEFT JOIN currencies c ON mc.currency_code = c.code
      WHERE mc.is_active = true 
        AND mc.longitude IS NOT NULL 
        AND mc.latitude IS NOT NULL
    `;
    
    const params = [];
    if (region) {
      query += ` AND mc.region = $1`;
      params.push(region);
    }
    
    query += ` ORDER BY mc.region, mc.country_name`;
    
    const result = await authPool.query(query, params);
    
    // Transform to array format for map components [lng, lat]
    const mapData = result.rows.map(row => ({
      name: row.country_name,
      code: row.code,
      coordinates: [row.longitude, row.latitude],
      region: row.region,
      marketType: row.market_type,
      currency: {
        code: row.currency_code,
        symbol: row.currency_symbol
      }
    }));
    
    res.json({
      success: true,
      count: mapData.length,
      countries: mapData
    });
  } catch (error) {
    logger.error('Error fetching map data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/countries/with-aliases
 * Get all countries with their aliases (for data matching)
 */
router.get('/with-aliases', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT 
        mc.id,
        mc.country_name,
        mc.country_code_2,
        mc.region,
        mc.currency_code,
        COALESCE(
          json_agg(
            json_build_object('alias', ca.alias_name, 'type', ca.alias_type)
          ) FILTER (WHERE ca.id IS NOT NULL),
          '[]'::json
        ) as aliases
      FROM master_countries mc
      LEFT JOIN country_aliases ca ON mc.id = ca.country_id
      WHERE mc.is_active = true
      GROUP BY mc.id, mc.country_name, mc.country_code_2, mc.region, mc.currency_code
      ORDER BY mc.display_order, mc.country_name
    `);
    
    res.json({
      success: true,
      countries: result.rows
    });
  } catch (error) {
    logger.error('Error fetching countries with aliases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/countries/bulk-lookup
 * Lookup multiple countries at once (for data import/matching)
 * @body names - Array of country names to lookup
 */
router.post('/bulk-lookup', async (req, res) => {
  try {
    const { names } = req.body;
    
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Names array is required'
      });
    }
    
    // Get all countries and aliases for matching
    const countriesResult = await authPool.query(`
      SELECT mc.*, c.symbol as currency_symbol, c.name as currency_name
      FROM master_countries mc
      LEFT JOIN currencies c ON mc.currency_code = c.code
      WHERE mc.is_active = true
    `);
    
    const aliasesResult = await authPool.query(`
      SELECT ca.alias_name, ca.country_id
      FROM country_aliases ca
    `);
    
    // Build lookup maps
    const countryByName = new Map();
    const countryById = new Map();
    
    countriesResult.rows.forEach(c => {
      countryByName.set(c.country_name.toLowerCase(), c);
      countryById.set(c.id, c);
    });
    
    aliasesResult.rows.forEach(a => {
      countryByName.set(a.alias_name.toLowerCase(), countryById.get(a.country_id));
    });
    
    // Match input names
    const results = names.map(name => {
      const normalizedName = name?.toLowerCase()?.trim();
      const match = countryByName.get(normalizedName);
      
      return {
        input: name,
        matched: !!match,
        country: match ? {
          id: match.id,
          name: match.country_name,
          code: match.country_code_2,
          region: match.region,
          currency_code: match.currency_code,
          currency_symbol: match.currency_symbol,
          coordinates: match.longitude && match.latitude ? [match.longitude, match.latitude] : null
        } : null
      };
    });
    
    const matchedCount = results.filter(r => r.matched).length;
    
    res.json({
      success: true,
      total: names.length,
      matched: matchedCount,
      unmatched: names.length - matchedCount,
      results
    });
  } catch (error) {
    logger.error('Error in bulk lookup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
