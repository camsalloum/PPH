/**
 * CRM Customer Routes
 *
 * Endpoints:
 *   GET    /customers                    — list with search, filter, pagination
 *   GET    /customers/countries          — unique countries
 *   GET    /customers/country-regions    — country-region mapping
 *   GET    /customers/map               — map view with coordinates
 *   GET    /customers/:id               — single customer detail
 *   GET    /customers/:id/sales-history — transaction history
 *   PUT    /customers/:id               — update customer
 *   POST   /resolve-google-maps-url     — resolve Google Maps URL
 *   GET    /lookups                     — CRM lookup values
 *   GET    /my-customers                — sales rep filtered customers
 *   GET    /my-customers/map            — sales rep filtered map data
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { resolveRepGroup, getCustomerSearchNames } = require('../../services/crmService');
const { cacheGet, cacheSet, cacheInvalidateByPrefix } = require('../../services/crmCacheService');
const { safeLimit } = require('../../utils/pagination');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

const resolveCountryVariants = async (rawCountry) => {
  const input = String(rawCountry || '').trim();
  if (!input) return null;
  const fallback = [input.toUpperCase()];
  try {
    const result = await authPool.query(`
      WITH matched AS (
        SELECT mc.id
        FROM master_countries mc
        WHERE UPPER(TRIM(mc.country_name)) = UPPER(TRIM($1))
           OR UPPER(TRIM(mc.country_code_2)) = UPPER(TRIM($1))
           OR UPPER(TRIM(mc.country_code_3)) = UPPER(TRIM($1))
        UNION
        SELECT ca.country_id AS id
        FROM country_aliases ca
        WHERE UPPER(TRIM(ca.alias_name)) = UPPER(TRIM($1))
      )
      SELECT DISTINCT UPPER(TRIM(v.name)) AS variant
      FROM (
        SELECT mc.country_name AS name
        FROM master_countries mc
        WHERE mc.id IN (SELECT id FROM matched)
        UNION ALL
        SELECT mc.country_code_2 AS name
        FROM master_countries mc
        WHERE mc.id IN (SELECT id FROM matched)
        UNION ALL
        SELECT mc.country_code_3 AS name
        FROM master_countries mc
        WHERE mc.id IN (SELECT id FROM matched)
        UNION ALL
        SELECT ca.alias_name AS name
        FROM country_aliases ca
        WHERE ca.country_id IN (SELECT id FROM matched)
      ) v
      WHERE v.name IS NOT NULL AND TRIM(v.name) <> ''
    `, [input]);

    const variants = result.rows.map(r => String(r.variant || '').trim()).filter(Boolean);
    return variants.length ? variants : fallback;
  } catch (err) {
    logger.warn('Country variant lookup failed; using raw country filter fallback', { input, error: err.message });
    return fallback;
  }
};


// ============================================================================
// CUSTOMERS LIST
// ============================================================================

router.get('/customers', authenticate, async (req, res) => {
  try {
    const { 
      search, country, is_active, customer_status, is_merged,
      salesRep, group_id,
      sort = 'last_order', order = 'desc',
      limit = 50, offset = 0 
    } = req.query;
    
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    logger.info('CRM: Fetching customers from fp_customer_unified', { 
      userId: user.id, userEmail: user.email, userRole: user.role, 
      search, country, customer_status, salesRep, sort, order, limit, offset 
    });
    
    let whereConditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (FULL_ACCESS_ROLES.includes(user.role)) {
      if (salesRep && salesRep !== 'all') {
        whereConditions.push(`(cu.primary_sales_rep_name = $${paramIndex} OR cu.sales_rep_group_name ILIKE $${paramIndex + 1})`);
        params.push(salesRep, `%${salesRep}%`);
        paramIndex += 2;
      } else if (group_id && group_id !== 'all') {
        const gid = parseInt(group_id);
        if (!isNaN(gid)) {
          whereConditions.push(`cu.sales_rep_group_id = $${paramIndex}`);
          params.push(gid);
          paramIndex++;
        }
      }
    } else {
      const rep = await resolveRepGroup(user.id);
      if (!rep) {
        return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
      }
      if (rep.groupId) {
        whereConditions.push(
          `(cu.sales_rep_group_id = $${paramIndex} OR (cu.sales_rep_group_id IS NULL AND cu.primary_sales_rep_name ILIKE $${paramIndex + 1}))`
        );
        params.push(rep.groupId, `%${rep.firstName}%`);
        paramIndex += 2;
      } else {
        whereConditions.push(`cu.primary_sales_rep_name ILIKE $${paramIndex}`);
        params.push(`%${rep.firstName}%`);
        paramIndex++;
      }
    }
    
    if (search) {
      whereConditions.push(`(cu.display_name ILIKE $${paramIndex} OR cu.customer_code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (country) {
      whereConditions.push(`cu.primary_country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }
    if (is_active !== undefined) {
      whereConditions.push(`cu.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }
    if (is_merged !== undefined) {
      whereConditions.push(`cu.is_merged = $${paramIndex}`);
      params.push(is_merged === 'true');
      paramIndex++;
    }
    if (customer_status && ['active', 'dormant', 'inactive'].includes(customer_status)) {
      if (customer_status === 'active') {
        whereConditions.push(`COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months'`);
      } else if (customer_status === 'dormant') {
        whereConditions.push(`COALESCE(live_ltxn.last_txn, cu.last_transaction_date) < CURRENT_DATE - INTERVAL '12 months' AND COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months'`);
      } else {
        whereConditions.push(`(COALESCE(live_ltxn.last_txn, cu.last_transaction_date) < CURRENT_DATE - INTERVAL '24 months' OR COALESCE(live_ltxn.last_txn, cu.last_transaction_date) IS NULL)`);
      }
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const liveTxnJoin = `LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name`;
    
    const sortDirection = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let orderByClause;
    switch (sort) {
      case 'last_order':
        orderByClause = `ORDER BY COALESCE(live_ltxn.last_txn, cu.last_transaction_date) ${sortDirection} NULLS LAST, cu.display_name ASC`;
        break;
      case 'name':
        orderByClause = `ORDER BY cu.display_name ${sortDirection}`;
        break;
      case 'country':
        orderByClause = `ORDER BY cu.primary_country ${sortDirection} NULLS LAST, cu.display_name ASC`;
        break;
      case 'revenue':
        orderByClause = `ORDER BY cu.total_amount_all_time ${sortDirection} NULLS LAST, cu.display_name ASC`;
        break;
      case 'created':
        orderByClause = `ORDER BY cu.created_at ${sortDirection}`;
        break;
      default:
        orderByClause = `ORDER BY COALESCE(live_ltxn.last_txn, cu.last_transaction_date) DESC NULLS LAST, cu.display_name ASC`;
    }
    
    const dataQuery = `
      SELECT 
        COUNT(*) OVER() AS _total_count,
        cu.customer_id as id,
        cu.customer_code,
        cu.display_name as customer_name,
        cu.customer_type,
        cu.primary_country as country,
        cu.city,
        cu.primary_sales_rep_name as sales_rep,
        cu.sales_rep_group_name,
        cu.is_active,
        cu.is_merged,
        cu.total_amount_all_time,
        cu.total_kgs_all_time,
        cu.first_transaction_date,
        COALESCE(live_ltxn.last_txn, cu.last_transaction_date) as last_transaction_date,
        cu.transaction_years,
        cu.created_at,
        cu.updated_at,
        CASE
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
          ELSE 'inactive'
        END as customer_status
      FROM fp_customer_unified cu
      ${liveTxnJoin}
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(dataQuery, params);
    const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count) : 0;
    const rows = result.rows.map(({ _total_count, ...r }) => r);
    
    logger.info(`CRM: Found ${rows.length} customers (total: ${total})`);
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + rows.length < total
      }
    });
    
  } catch (error) {
    logger.error('Error fetching CRM customers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customers', message: error.message });
  }
});

router.get('/customers/countries', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT primary_country as country
      FROM fp_customer_unified 
      WHERE primary_country IS NOT NULL AND primary_country != ''
      ORDER BY primary_country
    `);
    res.json({ success: true, data: result.rows.map(r => r.country) });
  } catch (error) {
    logger.error('Error fetching customer countries:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

router.get('/customers/country-regions', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT country_name, region
      FROM master_countries 
      WHERE region IS NOT NULL
      ORDER BY country_name
    `);
    const countryRegionMap = {};
    result.rows.forEach(row => {
      countryRegionMap[row.country_name] = row.region;
    });
    res.json({ success: true, data: countryRegionMap });
  } catch (error) {
    logger.error('Error fetching country-region mapping:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch country-region mapping' });
  }
});


// ============================================================================
// LOOKUPS
// ============================================================================

router.get('/lookups', authenticate, async (req, res) => {
  try {
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'crm_lookup_%'
    `);
    
    let lookups = {
      customer_types: ['Company', 'Individual'],
      customer_categories: ['Direct', 'Distributor', 'Converter', 'End User', 'Trader', 'OEM'],
      industries: ['FMCG', 'Food & Beverage', 'Dairy', 'Snacks & Confectionery', 'Personal Care', 
                   'Pharmaceuticals', 'Pet Food', 'Agricultural', 'Industrial', 'Chemicals', 'Healthcare', 'Other'],
      market_segments: ['Chips & Snacks', 'Biscuits', 'Chocolate', 'Coffee', 'Tea', 'Spices', 
                        'Rice & Grains', 'Dairy Products', 'Cheese', 'Ice Cream', 'Shampoo & Soap',
                        'Detergent', 'Tablets & Capsules', 'Nutraceuticals', 'Pet Food Dry', 'Pet Food Wet',
                        'Fertilizers', 'Seeds'],
      payment_terms: ['Net 30', 'Net 45', 'Net 60', 'Net 90', 'Due on Receipt', 'Prepaid'],
      lead_sources: ['Website', 'Exhibition', 'Referral', 'Cold Call', 'Email Campaign', 
                     'LinkedIn', 'Trade Publication', 'Walk-in', 'Existing Customer', 'Partner Referral', 
                     'Google Search', 'Other']
    };
    
    const lookupTableNames = tablesCheck.rows.map(r => r.table_name);
    const lookupPromises = [];
    
    if (lookupTableNames.includes('crm_lookup_industries')) {
      lookupPromises.push(pool.query(`SELECT industry_name FROM crm_lookup_industries WHERE is_active = true ORDER BY industry_name`).then(r => ({ key: 'industries', rows: r.rows.map(x => x.industry_name) })));
    }
    if (lookupTableNames.includes('crm_lookup_market_segments')) {
      lookupPromises.push(pool.query(`SELECT segment_name FROM crm_lookup_market_segments WHERE is_active = true ORDER BY segment_name`).then(r => ({ key: 'market_segments', rows: r.rows.map(x => x.segment_name) })));
    }
    if (lookupTableNames.includes('crm_lookup_customer_types')) {
      lookupPromises.push(pool.query(`SELECT type_name FROM crm_lookup_customer_types WHERE is_active = true ORDER BY type_order`).then(r => ({ key: 'customer_types', rows: r.rows.map(x => x.type_name) })));
    }
    if (lookupTableNames.includes('crm_lookup_customer_categories')) {
      lookupPromises.push(pool.query(`SELECT category_name FROM crm_lookup_customer_categories WHERE is_active = true ORDER BY category_name`).then(r => ({ key: 'customer_categories', rows: r.rows.map(x => x.category_name) })));
    }
    if (lookupTableNames.includes('crm_lookup_lead_sources')) {
      lookupPromises.push(pool.query(`SELECT source_name FROM crm_lookup_lead_sources WHERE is_active = true ORDER BY source_name`).then(r => ({ key: 'lead_sources', rows: r.rows.map(x => x.source_name) })));
    }
    
    lookupPromises.push(pool.query(`SELECT DISTINCT industry FROM fp_customer_unified WHERE industry IS NOT NULL AND industry != '' ORDER BY industry`).then(r => ({ key: '_existing_industries', rows: r.rows.map(x => x.industry) })));
    lookupPromises.push(pool.query(`SELECT DISTINCT market_segment FROM fp_customer_unified WHERE market_segment IS NOT NULL AND market_segment != '' ORDER BY market_segment`).then(r => ({ key: '_existing_segments', rows: r.rows.map(x => x.market_segment) })));
    lookupPromises.push(pool.query(`SELECT DISTINCT customer_group FROM fp_customer_unified WHERE customer_group IS NOT NULL AND customer_group != '' ORDER BY customer_group`).then(r => ({ key: '_existing_groups', rows: r.rows.map(x => x.customer_group) })));
    lookupPromises.push(pool.query(`SELECT DISTINCT payment_terms FROM fp_customer_unified WHERE payment_terms IS NOT NULL AND payment_terms != '' ORDER BY payment_terms`).then(r => ({ key: '_existing_payment_terms', rows: r.rows.map(x => x.payment_terms) })));
    
    const lookupResults = await Promise.all(lookupPromises);
    
    const resultsMap = {};
    for (const r of lookupResults) resultsMap[r.key] = r.rows;
    
    if (resultsMap.industries?.length > 0) lookups.industries = resultsMap.industries;
    if (resultsMap.market_segments?.length > 0) lookups.market_segments = resultsMap.market_segments;
    if (resultsMap.customer_types?.length > 0) lookups.customer_types = resultsMap.customer_types;
    if (resultsMap.customer_categories?.length > 0) lookups.customer_categories = resultsMap.customer_categories;
    if (resultsMap.lead_sources?.length > 0) lookups.lead_sources = resultsMap.lead_sources;
    
    lookups.industries = [...new Set([...lookups.industries, ...(resultsMap._existing_industries || [])])].sort();
    lookups.market_segments = [...new Set([...lookups.market_segments, ...(resultsMap._existing_segments || [])])].sort();
    lookups.customer_groups = resultsMap._existing_groups || [];
    lookups.payment_terms = [...new Set([...lookups.payment_terms, ...(resultsMap._existing_payment_terms || [])])].sort();
    
    res.json({ success: true, data: lookups });
  } catch (error) {
    logger.error('Error fetching CRM lookups:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lookups' });
  }
});

// ============================================================================
// CUSTOMERS MAP
// ============================================================================

router.get('/customers/map', authenticate, async (req, res) => {
  try {
    const { country, is_active, customer_type } = req.query;
    const limit = safeLimit(req.query.limit, 100, 500);
    
    logger.info('CRM: Fetching customers for map view', { country, is_active, customer_type, limit });
    
    let whereConditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (country) {
      whereConditions.push(`cu.primary_country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }
    if (is_active !== undefined) {
      whereConditions.push(`cu.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }
    if (customer_type) {
      whereConditions.push(`cu.customer_type = $${paramIndex}`);
      params.push(customer_type);
      paramIndex++;
    }

    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(req.user.id);
      if (!rep) {
        return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
      }
      if (rep.groupId) {
        whereConditions.push(`(cu.sales_rep_group_id = $${paramIndex} OR (cu.sales_rep_group_id IS NULL AND cu.primary_sales_rep_name ILIKE $${paramIndex + 1}))`);
        params.push(rep.groupId, `%${rep.firstName}%`);
        paramIndex += 2;
      } else {
        whereConditions.push(`cu.primary_sales_rep_name ILIKE $${paramIndex}`);
        params.push(`%${rep.firstName}%`);
        paramIndex++;
      }
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    const dataQuery = `
      SELECT 
        COUNT(*) OVER() AS _total_count,
        cu.customer_id as id,
        cu.customer_code,
        cu.display_name as customer_name,
        cu.customer_type,
        cu.primary_country as country,
        cu.city,
        cu.latitude,
        cu.longitude,
        cu.is_active,
        cu.primary_sales_rep_name as sales_rep,
        cu.sales_rep_group_name,
        CASE
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
          ELSE 'inactive'
        END as customer_status
      FROM fp_customer_unified cu
      LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
      ${whereClause}
      ORDER BY cu.display_name
      LIMIT $${paramIndex}
    `;
    
    params.push(limit);
    
    const result = await pool.query(dataQuery, params);
    const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count) : 0;
    const rows = result.rows.map(({ _total_count, ...r }) => r);
    
    logger.info(`CRM: Found ${rows.length} customers for map (total: ${total})`);
    
    res.json({
      success: true,
      data: rows,
      pagination: { total, limit }
    });
  } catch (error) {
    logger.error('Error fetching customers for map:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customers for map', message: error.message });
  }
});


// ============================================================================
// CUSTOMER DETAIL
// ============================================================================

router.get('/customers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`CRM: Fetching customer detail for ID: ${id}`);
    
    const result = await pool.query(`
      SELECT cu.*,
        COALESCE(live_ltxn.last_txn, cu.last_transaction_date) as live_last_transaction_date,
        CASE
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
          ELSE 'inactive'
        END as customer_status
      FROM fp_customer_unified cu
      LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
      WHERE cu.customer_id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // Customer location/assignment updates should be reflected immediately in planner lookups.
    cacheInvalidateByPrefix('mycust|');
    
    const customer = result.rows[0];
    customer.last_transaction_date = customer.live_last_transaction_date || customer.last_transaction_date;

    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(req.user.id);
      if (!rep) return res.status(403).json({ success: false, error: 'Access denied' });
      const ownershipCheck = await pool.query(
        `SELECT 1 FROM fp_customer_unified WHERE customer_id = $1 AND (sales_rep_group_id = $2 OR (sales_rep_group_id IS NULL AND primary_sales_rep_name ILIKE $3))`,
        [customer.customer_id, rep.groupId, `%${rep.firstName}%`]
      );
      if (ownershipCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const searchNames = await getCustomerSearchNames(customer.customer_code, customer.display_name);
    
    if (!customer.primary_sales_rep_name && customer.display_name) {
      try {
        const salesDataResult = await pool.query(`
          SELECT DISTINCT d.sales_rep_group_name 
          FROM fp_actualcommon d
          WHERE LOWER(TRIM(d.customer_name)) = ANY($1)
            AND d.sales_rep_group_name IS NOT NULL 
            AND TRIM(d.sales_rep_group_name) != ''
          ORDER BY d.sales_rep_group_name
          LIMIT 1
        `, [searchNames]);
        
        if (salesDataResult.rows.length > 0) {
          customer.primary_sales_rep_name = salesDataResult.rows[0].sales_rep_group_name;
          customer.sales_rep_source = 'sales_data';
        }
      } catch (err) {
        logger.warn('Could not fetch sales rep from sales data:', err.message);
      }
    }
    
    const salesRepName = customer.primary_sales_rep_name;
    if (salesRepName) {
      try {
        const salesRepResult = await authPool.query(`
          SELECT 
            sr.employee_id, sr.full_name, sr.email, sr.designation, sr.type, sr.group_members
          FROM crm_sales_reps sr
          WHERE LOWER(sr.full_name) = LOWER($1)
        `, [salesRepName]);
        
        if (salesRepResult.rows.length > 0) {
          const salesRep = salesRepResult.rows[0];
          customer.sales_rep_info = salesRep;
          
          const managerResult = await authPool.query(`
            SELECT sr.employee_id, sr.full_name, sr.email, sr.designation
            FROM crm_sales_reps sr
            WHERE sr.group_members IS NOT NULL 
              AND $1 = ANY(sr.group_members)
          `, [salesRep.full_name]);
          
          if (managerResult.rows.length > 0) {
            customer.account_manager = managerResult.rows[0].full_name;
            customer.account_manager_info = managerResult.rows[0];
          } else {
            customer.account_manager = salesRepName;
            customer.account_manager_info = salesRep;
          }
        } else {
          customer.account_manager = salesRepName;
        }
      } catch (authErr) {
        logger.warn('Could not fetch sales rep info:', authErr.message);
        customer.account_manager = salesRepName;
      }
    }
    
    res.json({ success: true, data: customer });
  } catch (error) {
    logger.error('Error fetching customer detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer', message: error.message });
  }
});

// ============================================================================
// CUSTOMER SALES HISTORY
// ============================================================================

router.get('/customers/:id/sales-history', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    logger.info(`CRM: Fetching sales history for customer ID: ${id}`, { startDate, endDate });
    
    const customerResult = await pool.query(`
      SELECT customer_code, display_name, original_names
      FROM fp_customer_unified 
      WHERE customer_id = $1
    `, [id]);
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    const customer = customerResult.rows[0];

    let searchNames = [(customer.display_name || '').toLowerCase().trim()].filter(Boolean);
    if (customer.original_names && Array.isArray(customer.original_names) && customer.original_names.length > 0) {
      const originalNamesLower = customer.original_names.map(n => String(n).toLowerCase().trim()).filter(Boolean);
      searchNames = [...searchNames, ...originalNamesLower];
    }
    searchNames = [...new Set(searchNames)];

    if (searchNames.length === 0) {
      return res.status(400).json({ success: false, error: 'Customer has no searchable names' });
    }

    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);
    if (!isFullAccess) {
      const rep = await resolveRepGroup(req.user.id);
      if (!rep) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { firstName, groupId, groupName } = rep;

      let accessGranted = false;

      if (groupId) {
        const unifiedCheck = await pool.query(
          `SELECT 1 FROM fp_customer_unified
           WHERE customer_id = $1
             AND (sales_rep_group_id = $2
               OR (sales_rep_group_id IS NULL AND primary_sales_rep_name ILIKE $3))`,
          [id, groupId, `%${firstName}%`]
        );
        accessGranted = unifiedCheck.rows.length > 0;

        if (!accessGranted) {
          const txNamePlaceholders = searchNames.map((_, i) => `$${i + 1}`).join(', ');
          const txCheck = await pool.query(
            `SELECT 1 FROM fp_actualcommon
             WHERE LOWER(TRIM(customer_name)) IN (${txNamePlaceholders})
               AND sales_rep_group_name = $${searchNames.length + 1}
             LIMIT 1`,
            [...searchNames, groupName]
          );
          accessGranted = txCheck.rows.length > 0;
        }
      } else {
        const unifiedCheck = await pool.query(
          `SELECT 1 FROM fp_customer_unified
           WHERE customer_id = $1
             AND primary_sales_rep_name ILIKE $2`,
          [id, `%${firstName}%`]
        );
        accessGranted = unifiedCheck.rows.length > 0;
      }

      if (!accessGranted) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    logger.info(`CRM: Searching transactions with customer_id: ${id}`);

    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      dateFilter = `AND (d.year::int > $1 OR (d.year::int = $1 AND d.month_no >= $2))
                    AND (d.year::int < $3 OR (d.year::int = $3 AND d.month_no <= $4))`;
      params.push(
        start.getFullYear(),
        start.getMonth() + 1,
        end.getFullYear(),
        end.getMonth() + 1
      );
    }

    const nameParams = searchNames.map((_, i) => `$${params.length + i + 1}`);
    const nameFilter = `LOWER(TRIM(d.customer_name)) IN (${nameParams.join(', ')})`;
    const allParams = [...params, ...searchNames];

    const mormSelect = isFullAccess
      ? `,\n        ROUND(SUM(d.morm)::numeric, 4) as morm,\n        ROUND(SUM(d.margin_over_total)::numeric, 4) as margin_over_total`
      : '';

    const transactionsResult = await pool.query(`
      SELECT 
        MAKE_DATE(d.year::int, d.month_no, 1) as date,
        d.invoice_no as invoice_number,
        d.customer_name,
        d.pgcombine as product_group,
        d.month as month_name,
        d.year,
        d.month_no,
        ROUND(SUM(d.qty_kgs)::numeric, 2) as quantity_kgs,
        ROUND(SUM(d.amount)::numeric, 2) as amount,
        d.sales_rep_group_name as sales_rep,
        d.country,
        d.admin_division_code as division${mormSelect}
      FROM fp_actualcommon d
      WHERE ${nameFilter}
        ${dateFilter}
      GROUP BY d.year, d.month_no, d.month, d.customer_name, d.pgcombine,
               d.sales_rep_group_name, d.country, d.admin_division_code, d.invoice_no
      ORDER BY d.year::int DESC, d.month_no DESC, d.pgcombine
    `, allParams);
    
    const transactions = transactionsResult.rows;
    
    const summary = {
      transactionCount: transactions.length,
      totalAmount: transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
      totalKgs: transactions.reduce((sum, t) => sum + (parseFloat(t.quantity_kgs) || 0), 0),
      firstDate: transactions.length > 0 ? transactions[transactions.length - 1].date : null,
      lastDate: transactions.length > 0 ? transactions[0].date : null,
      currencyCode: 'AED'
    };
    
    logger.info(`CRM: Found ${transactions.length} transactions for customer ${customer.display_name}`);
    
    res.json({
      success: true,
      data: {
        customer: { id, code: customer.customer_code, name: customer.display_name, currencyCode: 'AED' },
        transactions,
        summary
      }
    });
  } catch (error) {
    logger.error('Error fetching customer sales history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sales history', message: error.message });
  }
});


// ============================================================================
// RESOLVE GOOGLE MAPS URL
// ============================================================================

router.post('/resolve-google-maps-url', authenticate, async (req, res) => {
  try {
    const rawUrl = req.body?.url;
    const url = String(rawUrl || '').trim().replace(/[\s);,!?]+$/g, '');
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    logger.info(`CRM: Resolving Google Maps URL: ${url}`);
    
    let resolvedUrl = url;
    let resolvedBody = '';
    let lat = null;
    let lng = null;

    const extractCoordinates = (text) => {
      const source = String(text || '');
      if (!source) return null;
      const patterns = [
        /@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
        /!3d([+-]?\d+\.?\d*)!4d([+-]?\d+\.?\d*)/,
        /[?&](?:q|ll|center)=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
        /\/(?:dir|search)\/([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
        /\/place\/[^/]+\/@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
      ];
      for (const p of patterns) {
        const m = source.match(p);
        if (!m) continue;
        const mLat = parseFloat(m[1]);
        const mLng = parseFloat(m[2]);
        if (Number.isFinite(mLat) && Number.isFinite(mLng)) return { lat: mLat, lng: mLng };
      }
      return null;
    };
    
    if (url.includes('goo.gl') || url.includes('maps.app') || url.includes('google.com/maps')) {
      try {
        const fetch = require('node-fetch');
        // redirect:'follow' lets node-fetch handle the full chain automatically.
        // This reliably reaches the final google.com/maps/place/.../@lat,lng URL.
        const followed = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1' },
          timeout: 8000
        });
        resolvedUrl = followed.url || url;
        logger.info(`CRM: Resolved URL: ${resolvedUrl}`);
        try { resolvedBody = await followed.text(); } catch (_) { resolvedBody = ''; }
      } catch (redirectError) {
        logger.warn(`CRM: Could not resolve short URL, trying to parse as-is: ${redirectError.message}`);
      }
    }
    const extractedFromUrl = extractCoordinates(resolvedUrl);
    if (extractedFromUrl) {
      lat = extractedFromUrl.lat;
      lng = extractedFromUrl.lng;
    }
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && resolvedBody) {
      const extractedFromBody = extractCoordinates(resolvedBody);
      if (extractedFromBody) {
        lat = extractedFromBody.lat;
        lng = extractedFromBody.lng;
      }
    }
    
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        logger.info(`CRM: Extracted coordinates: ${lat}, ${lng}`);
        return res.json({ success: true, coordinates: { lat, lng }, resolvedUrl });
      }
    }
    
    logger.warn(`CRM: Could not extract coordinates from URL: ${resolvedUrl}`);
    res.status(400).json({ 
      success: false, 
      error: 'Could not extract coordinates from this URL. Please ensure it\'s a valid Google Maps link.',
      resolvedUrl
    });
  } catch (error) {
    logger.error('Error resolving Google Maps URL:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve URL', message: error.message });
  }
});

// ============================================================================
// UPDATE CUSTOMER
// ============================================================================

router.put('/customers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(req.user.id);
      if (!rep) return res.status(403).json({ success: false, error: 'Access denied' });
      const ownershipCheck = await pool.query(
        `SELECT 1 FROM fp_customer_unified WHERE customer_id = $1 AND (sales_rep_group_id = $2 OR (sales_rep_group_id IS NULL AND primary_sales_rep_name ILIKE $3))`,
        [id, rep.groupId, `%${rep.firstName}%`]
      );
      if (ownershipCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Access denied — not your customer' });
    }

    const {
      customer_type, customer_group, industry, market_segment,
      primary_country, country_region, city, state,
      address_line1, address_line2, postal_code,
      primary_contact, email, phone, mobile, website,
      payment_terms, credit_limit, tax_id, is_active, notes,
      latitude, longitude, pin_confirmed,
      competitor_notes
    } = req.body;
    
    const updated_by = req.user?.username || req.user?.email || 'system';
    
    logger.info(`CRM: Updating customer ID: ${id} by ${updated_by}`, req.body);
    
    const isSettingPin = latitude !== undefined || longitude !== undefined;
    const isConfirmingPin = pin_confirmed === true;
    
    let pinSource = null;
    let pinConfirmedValue = null;
    let pinConfirmedBy = null;
    let pinConfirmedAt = null;
    
    if (isSettingPin || isConfirmingPin) {
      pinSource = 'user';
      pinConfirmedValue = true;
      pinConfirmedBy = updated_by;
      pinConfirmedAt = new Date();
    }
    
    const result = await pool.query(`
      UPDATE fp_customer_unified SET
        customer_type = COALESCE($2, customer_type),
        customer_group = COALESCE($3, customer_group),
        industry = COALESCE($4, industry),
        market_segment = COALESCE($5, market_segment),
        primary_country = COALESCE($6, primary_country),
        country_region = COALESCE($7, country_region),
        city = COALESCE($8, city),
        state = COALESCE($9, state),
        address_line1 = COALESCE($10, address_line1),
        address_line2 = COALESCE($11, address_line2),
        postal_code = COALESCE($12, postal_code),
        primary_contact = COALESCE($13, primary_contact),
        email = COALESCE($14, email),
        phone = COALESCE($15, phone),
        mobile = COALESCE($16, mobile),
        website = COALESCE($17, website),
        payment_terms = COALESCE($18, payment_terms),
        credit_limit = COALESCE($19, credit_limit),
        tax_id = COALESCE($20, tax_id),
        is_active = COALESCE($21, is_active),
        notes = COALESCE($22, notes),
        latitude = COALESCE($23, latitude),
        longitude = COALESCE($24, longitude),
        updated_at = NOW(),
        updated_by = $25,
        pin_source = COALESCE($26, pin_source),
        pin_confirmed = COALESCE($27, pin_confirmed),
        pin_confirmed_by = COALESCE($28, pin_confirmed_by),
        pin_confirmed_at = COALESCE($29, pin_confirmed_at),
        competitor_notes = COALESCE($30, competitor_notes)
      WHERE customer_id = $1
      RETURNING *
    `, [id, customer_type, customer_group, industry, market_segment,
        primary_country, country_region, city, state, address_line1, address_line2, postal_code,
        primary_contact, email, phone, mobile, website, payment_terms, credit_limit,
        tax_id, is_active, notes, latitude, longitude, updated_by,
        pinSource, pinConfirmedValue, pinConfirmedBy, pinConfirmedAt, competitor_notes]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    logger.info(`CRM: Customer ${id} updated successfully`);
    res.json({ success: true, data: result.rows[0], message: 'Customer updated successfully' });
  } catch (error) {
    logger.error('Error updating customer:', error);
    res.status(500).json({ success: false, error: 'Failed to update customer', message: error.message });
  }
});

// ============================================================================
// MY CUSTOMERS
// ============================================================================

router.get('/my-customers', authenticate, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const countryFilter = req.query.country || null;
    const countryVariants = await resolveCountryVariants(countryFilter);

    // Managers can view another rep's customers via ?forRepId=<userId>
    const isFullAccess = FULL_ACCESS_ROLES.includes(user.role);
    const forRepId = isFullAccess && req.query.forRepId ? parseInt(req.query.forRepId, 10) : null;

    const myCustCacheKey = `mycust|${forRepId || user.id}|${user.role}|${countryFilter || 'all'}`;
    const myCustCached = cacheGet(myCustCacheKey);
    if (myCustCached) {
      logger.info(`CRM: my-customers CACHE HIT for user ${forRepId || user.id}`);
      return res.json(myCustCached);
    }
    
    logger.info(`CRM: Fetching my-customers for user: ${user.email} (ID: ${user.id}), role: ${user.role}${forRepId ? `, forRepId: ${forRepId}` : ''}`);
    
    // Check if this user is also a registered sales rep (even if they have a manager role).
    // If they are a sales rep, filter to their group — don't show all customers.
    // When forRepId is set, resolve that rep's group instead.
    const repInfo = await resolveRepGroup(forRepId || user.id);
    
    if (isFullAccess && !repInfo) {
      const allCustomersResult = await pool.query(`
        SELECT 
          cu.customer_id as id, cu.customer_code,
          cu.display_name as customer_name, cu.customer_type,
          cu.primary_country as country, cu.city,
          cu.latitude, cu.longitude,
          cu.primary_sales_rep_name as sales_rep, cu.sales_rep_group_name,
          cu.is_active, cu.is_merged, cu.total_amount_all_time, cu.total_kgs_all_time,
          cu.first_transaction_date,
          COALESCE(live_ltxn.last_txn, cu.last_transaction_date) as last_transaction_date,
          cu.transaction_years, cu.created_at,
          CASE
            WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
            WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
            ELSE 'inactive'
          END as customer_status,
          (SELECT MAX(dt) FROM (
            SELECT activity_date AS dt FROM crm_activities WHERE customer_id = cu.customer_id
            UNION ALL
            SELECT date_start FROM crm_calls       WHERE customer_id = cu.customer_id
            UNION ALL
            SELECT date_start FROM crm_meetings    WHERE customer_id = cu.customer_id
          ) _acts) as last_activity_date
        FROM fp_customer_unified cu
        LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
        WHERE cu.is_merged = false
          AND ($1::text[] IS NULL OR UPPER(TRIM(cu.primary_country)) = ANY($1::text[]))
        ORDER BY cu.total_amount_all_time DESC NULLS LAST, cu.display_name
      `, [countryVariants]);
      
      logger.info(`CRM: Admin user (no rep record) - returning ${allCustomersResult.rows.length} customers${countryFilter ? ` (filtered by country: ${countryFilter})` : ''}`);
      
      const adminResp = {
        success: true,
        data: {
          salesRep: { name: 'All Sales Reps', type: 'ADMIN', groupMembers: [] },
          customers: allCustomersResult.rows,
          matchedCustomerCount: allCustomersResult.rows.length
        }
      };
      cacheSet(myCustCacheKey, adminResp);
      return res.json(adminResp);
    }
    if (!repInfo) {
      return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
    }
    logger.info(`CRM: Sales rep found: ${repInfo.fullName}, type: ${repInfo.type}`);
    const repGroupId = repInfo.groupId;

    const customersResult = await pool.query(`
      SELECT 
        cu.customer_id as id, cu.customer_code,
        cu.display_name as customer_name, cu.customer_type,
        cu.primary_country as country, cu.city,
        cu.latitude, cu.longitude,
        cu.primary_sales_rep_name as sales_rep, cu.sales_rep_group_name,
        cu.is_active, cu.is_merged, cu.total_amount_all_time,
        CASE
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
          ELSE 'inactive'
        END as customer_status,
        cu.total_kgs_all_time, cu.first_transaction_date,
        COALESCE(live_ltxn.last_txn, cu.last_transaction_date) as last_transaction_date,
        (SELECT MAX(dt) FROM (
          SELECT activity_date AS dt FROM crm_activities WHERE customer_id = cu.customer_id
          UNION ALL
          SELECT date_start FROM crm_calls       WHERE customer_id = cu.customer_id
          UNION ALL
          SELECT date_start FROM crm_meetings    WHERE customer_id = cu.customer_id
        ) _acts) as last_activity_date,
        cu.transaction_years, cu.created_at
      FROM fp_customer_unified cu
      LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
      WHERE (
        ($1::integer IS NOT NULL AND cu.sales_rep_group_id = $1::integer)
        OR cu.primary_sales_rep_name ILIKE $2
        OR cu.sales_rep_group_name ILIKE $3
        OR TRIM(UPPER(cu.sales_rep_group_name)) = TRIM(UPPER($4))
      )
        AND cu.is_merged = false
        AND ($5::text[] IS NULL OR UPPER(TRIM(cu.primary_country)) = ANY($5::text[]))
      ORDER BY cu.total_amount_all_time DESC NULLS LAST, cu.display_name
    `, [repGroupId, `%${repInfo.firstName}%`, `%${repInfo.groupName || repInfo.firstName}%`, repInfo.groupName || repInfo.firstName || '', countryVariants]);
    
    logger.info(`CRM: Found ${customersResult.rows.length} customers for ${repInfo.fullName}`);
    
    const repResp = {
      success: true,
      data: {
        salesRep: {
          name: repInfo.fullName, type: repInfo.type,
          groupMembers: repInfo.groupMembers,
          groupId: repGroupId, groupName: repInfo.groupName
        },
        customers: customersResult.rows,
        matchedCustomerCount: customersResult.rows.length
      }
    };
    cacheSet(myCustCacheKey, repResp);
    res.json(repResp);
  } catch (error) {
    logger.error('Error fetching my-customers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch your customers', message: error.message });
  }
});

// ============================================================================
// MY CUSTOMERS MAP
// ============================================================================

router.get('/my-customers/map', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { country, is_active, customer_type, sales_rep_group } = req.query;
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    logger.info(`CRM: Fetching my-customers map data for user: ${user.email} (ID: ${user.id}), role: ${user.role}`);
    
    let params = [];
    let whereConditions = ['cu.is_merged = false'];
    let paramIndex = 1;
    let salesRepInfo = { name: 'All Sales Reps', type: 'ADMIN', groupMembers: [] };
    
    // Always check if user is a sales rep - even managers who are also reps
    // should see only their group's customers here.
    const rep = await resolveRepGroup(user.id);
    if (rep) {
      salesRepInfo = { name: rep.fullName, type: rep.type, groupMembers: rep.groupMembers };
      logger.info(`CRM Map: Sales rep found: ${rep.fullName}, type: ${rep.type}`);
      if (rep.groupId) {
        whereConditions.push(`cu.sales_rep_group_id = $${paramIndex}`);
        params.push(rep.groupId);
        paramIndex++;
      } else {
        whereConditions.push(`(cu.primary_sales_rep_name ILIKE $${paramIndex} OR cu.sales_rep_group_name ILIKE $${paramIndex + 1})`);
        params.push(`%${rep.firstName}%`, `%${rep.groupName || rep.firstName}%`);
        paramIndex += 2;
      }
    } else if (!FULL_ACCESS_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
    } else {
      logger.info(`CRM Map: Admin/Manager user (no rep record) - returning all customers`);
    }
    if (customer_type) {
      whereConditions.push(`cu.customer_type = $${paramIndex}`);
      params.push(customer_type);
      paramIndex++;
    }
    if (sales_rep_group) {
      whereConditions.push(`cu.sales_rep_group_name = $${paramIndex}`);
      params.push(sales_rep_group);
      paramIndex++;
    }
    
    const result = await pool.query(`
      SELECT 
        cu.customer_id as id, cu.customer_code,
        cu.display_name as customer_name, cu.customer_type,
        cu.primary_country as country, cu.city,
        cu.latitude, cu.longitude, cu.is_active,
        cu.primary_sales_rep_name as sales_rep,
        cu.pin_confirmed, cu.pin_source, cu.pin_confirmed_by,
        CASE
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
          WHEN COALESCE(live_ltxn.last_txn, cu.last_transaction_date) >= CURRENT_DATE - INTERVAL '24 months' THEN 'dormant'
          ELSE 'inactive'
        END as customer_status
      FROM fp_customer_unified cu
      LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY cu.display_name
    `, params);
    
    logger.info(`CRM Map: Found ${result.rows.length} customers`);
    
    const confirmedPins = result.rows.filter(c => 
      c.latitude && c.longitude && (c.pin_confirmed === true || c.pin_source === 'user')
    );
    const unconfirmedPins = result.rows.filter(c => 
      c.latitude && c.longitude && c.pin_confirmed !== true && c.pin_source !== 'user'
    );
    const noPins = result.rows.filter(c => !c.latitude || !c.longitude);
    
    const countryCoverage = {};
    result.rows.forEach(c => {
      if (!c.country) return;
      if (!countryCoverage[c.country]) {
        countryCoverage[c.country] = { count: 0, customers: [], hasUnconfirmedPins: false, hasConfirmedPins: false };
      }
      countryCoverage[c.country].count++;
      if (c.latitude && c.longitude && (c.pin_confirmed === true || c.pin_source === 'user')) {
        countryCoverage[c.country].hasConfirmedPins = true;
      } else if (c.latitude && c.longitude) {
        countryCoverage[c.country].hasUnconfirmedPins = true;
      }
      countryCoverage[c.country].customers.push({ id: c.id, name: c.customer_name });
    });
    
    logger.info(`CRM Map: Confirmed pins: ${confirmedPins.length}, Unconfirmed: ${unconfirmedPins.length}, No pins: ${noPins.length}`);
    
    const groupsResult = await pool.query(`
      SELECT DISTINCT sales_rep_group_name 
      FROM fp_customer_unified 
      WHERE sales_rep_group_name IS NOT NULL AND TRIM(sales_rep_group_name) != '' 
      ORDER BY sales_rep_group_name
    `);
    const salesRepGroups = groupsResult.rows.map(r => r.sales_rep_group_name);
    
    res.json({
      success: true,
      data: confirmedPins,
      countryCoverage,
      salesRepGroups,
      totalCustomers: result.rows.length,
      salesRep: salesRepInfo,
      pagination: { 
        total: result.rows.length,
        confirmedPins: confirmedPins.length,
        unconfirmedPins: unconfirmedPins.length,
        noPins: noPins.length
      }
    });
  } catch (error) {
    logger.error('Error fetching my-customers map data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch map data', message: error.message });
  }
});

// ============================================================================
// ASSIGN CUSTOMER TO REP GROUP (management only)
// ============================================================================

router.patch('/customers/:id/assign', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Management access required' });
    }
    const { id } = req.params;
    const { sales_rep_group_id } = req.body;
    if (!sales_rep_group_id) {
      return res.status(400).json({ success: false, error: 'sales_rep_group_id is required' });
    }

    // Resolve group name from id
    const groupRes = await pool.query(
      'SELECT id, group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1',
      [parseInt(sales_rep_group_id)]
    );
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sales rep group not found' });
    }
    const groupName = groupRes.rows[0].group_name;

    const result = await pool.query(
      `UPDATE fp_customer_unified
       SET sales_rep_group_id = $1, sales_rep_group_name = $2, primary_sales_rep_name = $2, updated_at = NOW()
       WHERE customer_id = $3
       RETURNING customer_id, display_name, sales_rep_group_id, sales_rep_group_name`,
      [parseInt(sales_rep_group_id), groupName, parseInt(id)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    logger.info(`CRM: Customer ${id} assigned to group "${groupName}" by ${req.user.email}`);

    // Notify assigned rep(s)
    try {
      const { notifyLeadAssigned } = require('../../services/crmNotificationService');
      notifyLeadAssigned({
        entityType: 'customer',
        entityName: result.rows[0].display_name,
        entityId: parseInt(id),
        groupId: parseInt(sales_rep_group_id),
        assignerName: req.user.full_name || req.user.username || 'Management',
      }).catch(() => {});
    } catch (_) { /* non-critical */ }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error assigning customer:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Packaging Profile ───────────────────────────────────────────────────────

// GET /api/crm/customers/:id/packaging-profile
router.get('/customers/:id/packaging-profile', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    if (!customerId) return res.status(400).json({ success: false, error: 'Invalid customer ID' });

    const result = await pool.query(
      `SELECT * FROM crm_customer_packaging_profile WHERE customer_id = $1`,
      [customerId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: null });
    logger.error('CRM: error fetching packaging profile', err);
    res.status(500).json({ success: false, error: 'Failed to fetch packaging profile' });
  }
});

// PUT /api/crm/customers/:id/packaging-profile — upsert
router.put('/customers/:id/packaging-profile', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    if (!customerId) return res.status(400).json({ success: false, error: 'Invalid customer ID' });

    const { current_suppliers, packaging_categories, converting_equipment,
            food_safety_certs, annual_volume_est, sustainability_reqs } = req.body;

    const result = await pool.query(
      `INSERT INTO crm_customer_packaging_profile
         (customer_id, current_suppliers, packaging_categories, converting_equipment,
          food_safety_certs, annual_volume_est, sustainability_reqs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (customer_id) DO UPDATE SET
         current_suppliers    = EXCLUDED.current_suppliers,
         packaging_categories = EXCLUDED.packaging_categories,
         converting_equipment = EXCLUDED.converting_equipment,
         food_safety_certs    = EXCLUDED.food_safety_certs,
         annual_volume_est    = EXCLUDED.annual_volume_est,
         sustainability_reqs  = EXCLUDED.sustainability_reqs,
         updated_at           = NOW()
       RETURNING *`,
      [customerId, current_suppliers || null, packaging_categories || null,
       converting_equipment || null, food_safety_certs || null,
       annual_volume_est || null, sustainability_reqs || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: error saving packaging profile', err);
    res.status(500).json({ success: false, error: 'Failed to save packaging profile' });
  }
});

module.exports = router;
