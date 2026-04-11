/**
 * CRM Prospects Routes
 *
 * Endpoints:
 *   POST   /prospects                    — create prospect
 *   GET    /prospects                    — list prospects
 *   PUT    /prospects/:id/status         — update status
 *   DELETE /prospects/:id                — delete prospect
 *   POST   /prospects/:id/convert        — manual convert
 *   POST   /prospects/detect-conversions — auto-detect (admin)
 *   GET    /prospects/metrics            — conversion metrics
 *   GET    /admin/prospects              — admin prospect pool
 *   PATCH  /prospects/:id/assign         — assign to group (admin)
 *   GET    /my-prospects                 — sales rep prospects
 *   GET    /prospects-count              — count for dashboard card
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { resolveRepGroup } = require('../../services/crmService');
const { notifyProspectStatusChange } = require('../../services/crmNotificationService');
const prospectsService = require('../../services/prospectsService');
const { safeLimit } = require('../../utils/pagination');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

const buildRepOwnershipFilters = (rep) => {
  const raw = [rep?.groupName, rep?.fullName]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .map((v) => v.toUpperCase());
  return [...new Set(raw)];
};

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

router.post('/prospects', authenticate, async (req, res) => {
  try {
    const { customer_name, country, sales_rep_group, rep_id, city, division, notes, source, competitor_notes } = req.body;
    const user = req.user;

    // Auto-resolve sales_rep_group if not provided (e.g. quick-add from Field Visit Planner)
    let resolvedRepGroup = sales_rep_group || null;
    if (!resolvedRepGroup) {
      const targetUserId = rep_id || user.id;
      const rep = await resolveRepGroup(targetUserId);
      resolvedRepGroup = rep?.groupName || rep?.fullName || null;
    }

    if (!customer_name || !country || !resolvedRepGroup) {
      return res.status(400).json({ success: false, error: 'Missing required fields: customer_name, country, sales_rep_group' });
    }
    
    const result = await prospectsService.createProspect({
      customer_name, country, sales_rep_group: resolvedRepGroup,
      division: division || 'FP', source: source || 'other', notes, competitor_notes
    }, user.id);
    
    if (!result.success) return res.status(409).json(result);
    // Merge city back into prospect (city is not a DB column yet; used for geocoding in planner)
    res.json({ ...result, prospect: { ...result.prospect, city: city || null } });
  } catch (error) {
    logger.error('Error creating prospect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/prospects', authenticate, async (req, res) => {
  try {
    const { division = 'FP', year, salesRep, status } = req.query;

    let filterSalesRep = salesRep;
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(req.user.id);
      filterSalesRep = buildRepOwnershipFilters(rep);
      if (!filterSalesRep.length) return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
    }

    const result = await prospectsService.getAllProspects({
      division, year: year ? parseInt(year) : undefined, salesRep: filterSalesRep, status
    });
    res.json(result);
  } catch (error) {
    logger.error('Error fetching prospects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/prospects/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status is required' });
    
    const result = await prospectsService.updateProspectStatus(parseInt(id), status, notes || '');
    res.json(result);

    if (['approved', 'rejected'].includes(status)) {
      try {
        const prospectRes = await pool.query(
          'SELECT id, customer_name, sales_rep_group FROM fp_prospects WHERE id = $1', [parseInt(id)]
        );
        if (prospectRes.rows.length > 0) {
          notifyProspectStatusChange({
            prospect: prospectRes.rows[0],
            newStatus: status,
            changedByName: req.user.full_name || req.user.username || 'Management',
          }).catch(() => {});
        }
      } catch (_) { /* non-critical */ }
    }
  } catch (error) {
    logger.error('Error updating prospect status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/prospects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM fp_prospects WHERE id = $1 RETURNING id, customer_name', [parseInt(id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Prospect not found' });
    logger.info(`CRM: Deleted prospect ${id} ("${result.rows[0].customer_name}")`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error deleting prospect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/prospects/:id/convert', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied — elevated role required to convert prospects' });
    }
    const { id } = req.params;
    const { reason } = req.body;
    const result = await prospectsService.manualConvert(parseInt(id), reason || 'Manually converted from CRM');
    res.json(result);
  } catch (error) {
    logger.error('Error converting prospect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/prospects/detect-conversions', authenticate, async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const result = await prospectsService.detectConversions();
    res.json(result);
  } catch (error) {
    logger.error('Error detecting conversions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/prospects/metrics', authenticate, async (req, res) => {
  try {
    const { division = 'FP', year, salesRep } = req.query;

    let filterSalesRep = salesRep;
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const rep = await resolveRepGroup(req.user.id);
      filterSalesRep = buildRepOwnershipFilters(rep);
      if (!filterSalesRep.length) return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
    }

    const result = await prospectsService.getConversionMetrics({
      division, year: year ? parseInt(year) : undefined, salesRep: filterSalesRep
    });
    res.json(result);
  } catch (error) {
    logger.error('Error fetching conversion metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ADMIN PROSPECT POOL
// ============================================================================

router.get('/admin/prospects', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { status, unassigned, group_id, year } = req.query;
    const conditions = [`UPPER(division) = 'FP'`];
    const params = [];

    if (unassigned === '1') {
      conditions.push(`(sales_rep_group IS NULL OR TRIM(sales_rep_group) = '')`);
    } else if (group_id) {
      const gr = await pool.query('SELECT group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1', [parseInt(group_id)]);
      if (gr.rows.length) {
        params.push(gr.rows[0].group_name);
        conditions.push(`TRIM(UPPER(sales_rep_group)) = TRIM(UPPER($${params.length}))`);
      }
    }
    if (status) {
      params.push(status);
      conditions.push(`approval_status = $${params.length}`);
    }
    if (year) {
      params.push(parseInt(year));
      conditions.push(`budget_year = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [prospectsRes, metricsRes] = await Promise.all([
      pool.query(`SELECT * FROM fp_prospects ${where} ORDER BY created_at DESC`, params),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE NOT converted_to_customer)                        AS active,
          COUNT(*) FILTER (WHERE converted_to_customer = true)                     AS converted
        FROM fp_prospects WHERE UPPER(division) = 'FP'`),
    ]);

    const m = metricsRes.rows[0];
    res.json({
      success: true,
      data: {
        prospects: prospectsRes.rows,
        count: prospectsRes.rows.length,
        metrics: {
          total:     parseInt(m.total     || 0),
          active:    parseInt(m.active    || 0),
          converted: parseInt(m.converted || 0),
        },
      },
    });
  } catch (err) {
    logger.error('Error fetching admin prospects:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/prospects/:id/assign', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { id } = req.params;
    const { sales_rep_group_name } = req.body;
    if (!sales_rep_group_name) {
      return res.status(400).json({ success: false, error: 'sales_rep_group_name is required' });
    }
    const result = await pool.query(
      `UPDATE fp_prospects SET sales_rep_group = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, customer_name, sales_rep_group, approval_status`,
      [sales_rep_group_name.trim(), parseInt(id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Prospect not found' });
    logger.info(`CRM: Prospect ${id} assigned to group "${sales_rep_group_name}"`);

    // Notify assigned rep(s)
    try {
      const groupRes = await pool.query(
        'SELECT id FROM sales_rep_groups WHERE LOWER(TRIM(group_name)) = LOWER(TRIM($1)) LIMIT 1',
        [sales_rep_group_name.trim()]
      );
      if (groupRes.rows.length > 0) {
        const { notifyLeadAssigned } = require('../../services/crmNotificationService');
        notifyLeadAssigned({
          entityType: 'prospect',
          entityName: result.rows[0].customer_name,
          entityId: parseInt(id),
          groupId: groupRes.rows[0].id,
          assignerName: req.user.full_name || req.user.username || 'Management',
        }).catch(() => {});
      }
    } catch (_) { /* non-critical */ }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error assigning prospect:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/crm/prospects/:id/location
router.patch('/prospects/:id/location', authenticate, async (req, res) => {
  try {
    const prospectId = parseInt(req.params.id, 10);
    if (!prospectId) {
      return res.status(400).json({ success: false, error: 'Invalid prospect ID' });
    }

    const {
      latitude,
      longitude,
      city,
      state,
      address_line1,
    } = req.body || {};

    const colRes = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fp_prospects'
          AND column_name IN ('latitude', 'longitude', 'city', 'state', 'address_line1', 'updated_at')`
    );
    const available = new Set(colRes.rows.map((r) => r.column_name));

    const sets = [];
    const params = [];
    let p = 1;

    if (latitude !== undefined && available.has('latitude')) {
      sets.push(`latitude = $${p++}`);
      params.push(latitude === null || latitude === '' ? null : Number(latitude));
    }
    if (longitude !== undefined && available.has('longitude')) {
      sets.push(`longitude = $${p++}`);
      params.push(longitude === null || longitude === '' ? null : Number(longitude));
    }
    if (city !== undefined && available.has('city')) {
      sets.push(`city = $${p++}`);
      params.push(city || null);
    }
    if (state !== undefined && available.has('state')) {
      sets.push(`state = $${p++}`);
      params.push(state || null);
    }
    if (address_line1 !== undefined && available.has('address_line1')) {
      sets.push(`address_line1 = $${p++}`);
      params.push(address_line1 || null);
    }

    if (available.has('updated_at')) {
      sets.push('updated_at = NOW()');
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No location fields available to update' });
    }

    params.push(prospectId);
    const result = await pool.query(
      `UPDATE fp_prospects
          SET ${sets.join(', ')}
        WHERE id = $${p}
    RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Error updating prospect location:', err);
    res.status(500).json({ success: false, error: 'Failed to update prospect location' });
  }
});

// ============================================================================
// MY PROSPECTS (Legacy)
// ============================================================================

router.get('/my-prospects', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const budgetYear = req.query.year || null;
    const limit = req.query.limit ? safeLimit(req.query.limit, 50, 500) : null;
    
    logger.info(`CRM: Fetching prospects for user ${user.id} (${user.email})`);

    // Managers can view another rep's prospects via ?forRepId=<userId>
    const isFullAccess = FULL_ACCESS_ROLES.includes(user.role);
    const forRepId = isFullAccess && req.query.forRepId ? parseInt(req.query.forRepId, 10) : null;
    
    const repData = await resolveRepGroup(forRepId || user.id);
    if (!repData && !isFullAccess) {
      return res.status(403).json({ success: false, error: 'User is not a registered sales rep' });
    }
    const salesRepName  = repData?.fullName || 'All';
    const groupName     = repData?.groupName;
    const repOwnershipFilters = buildRepOwnershipFilters(repData);

    const statusFilter = req.query.status || null;
    const countryFilter = req.query.country || null;
    const countryVariants = await resolveCountryVariants(countryFilter);

    const baseParams = [];
    let p = 1;
    const whereConds = [
      `UPPER(division) = 'FP'`,
    ];

    // Scope by assigned owner labels (group name and/or rep full name)
    if (repOwnershipFilters.length > 0) {
      whereConds.push(`UPPER(TRIM(sales_rep_group)) = ANY($${p++}::text[])`);
      baseParams.push(repOwnershipFilters);
    }

    const parsedYear = budgetYear ? parseInt(budgetYear, 10) : null;
    if (Number.isFinite(parsedYear)) {
      whereConds.push(`budget_year = $${p++}`);
      baseParams.push(parsedYear);
    }

    if (statusFilter) {
      whereConds.push(`approval_status = $${p++}`);
      baseParams.push(statusFilter);
    }

    if (countryVariants && countryVariants.length) {
      whereConds.push(`UPPER(TRIM(country)) = ANY($${p++}::text[])`);
      baseParams.push(countryVariants);
    }

    const whereSql = whereConds.join('\n        AND ');
    const limitClause = limit ? `\n      LIMIT $${p++}` : '';
    if (limit) baseParams.push(limit);

    const prospectsSqlWithLocation = `
      SELECT id, customer_name, country, sales_rep_group, budget_year,
             approval_status, source, notes, competitor_notes, created_at,
             converted_to_customer, converted_at,
             latitude, longitude, city,
             COALESCE(address_line1, '') AS address_line1
      FROM fp_prospects
      WHERE ${whereSql}
      ORDER BY created_at DESC, customer_name${limitClause}
    `;

    const prospectsSqlLegacy = `
      SELECT id, customer_name, country, sales_rep_group, budget_year,
             approval_status, source, notes, competitor_notes, created_at,
             converted_to_customer, converted_at
      FROM fp_prospects
      WHERE ${whereSql}
            ORDER BY created_at DESC, customer_name${limitClause}
    `;

    const prospectsPromise = pool.query(prospectsSqlWithLocation, baseParams).catch(async (e) => {
      if (e.code === '42703') {
        return pool.query(prospectsSqlLegacy, baseParams);
      }
      throw e;
    });

    const metricsParams = [];
    let mp = 1;
    const metricsConds = [
      `UPPER(division) = 'FP'`,
    ];
    if (repOwnershipFilters.length > 0) {
      metricsConds.push(`UPPER(TRIM(sales_rep_group)) = ANY($${mp++}::text[])`);
      metricsParams.push(repOwnershipFilters);
    }
    if (Number.isFinite(parsedYear)) {
      metricsConds.push(`budget_year = $${mp++}`);
      metricsParams.push(parsedYear);
    }
    if (countryVariants && countryVariants.length) {
      metricsConds.push(`UPPER(TRIM(country)) = ANY($${mp++}::text[])`);
      metricsParams.push(countryVariants);
    }
    const metricsWhereSql = metricsConds.join('\n          AND ');

    const [prospectsResult, metricsResult] = await Promise.all([
      prospectsPromise,
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE NOT converted_to_customer) AS active,
          COUNT(*) FILTER (WHERE converted_to_customer = true) AS converted
        FROM fp_prospects
        WHERE ${metricsWhereSql}
      `, metricsParams)
    ]);

    const m = metricsResult.rows[0];
    logger.info(`CRM: Found ${prospectsResult.rows.length} prospects for rep filters "${repOwnershipFilters.join(', ')}"`);

    res.json({
      success: true,
      data: {
        prospects: prospectsResult.rows,
        count: prospectsResult.rows.length,
        groupName, salesRepName,
        budgetYear: budgetYear ? parseInt(budgetYear) : null,
        metrics: {
          total:     parseInt(m.total     || 0),
          active:    parseInt(m.active    || 0),
          converted: parseInt(m.converted || 0)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching CRM prospects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch prospects', message: error.message });
  }
});

router.get('/prospects-count', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const budgetYear = req.query.year || new Date().getFullYear();
    
    const repData = await resolveRepGroup(user.id);
    if (!repData) {
      return res.json({ success: true, data: { count: 0 } });
    }
    const repOwnershipFilters = buildRepOwnershipFilters(repData);
    if (!repOwnershipFilters.length) {
      return res.json({ success: true, data: { count: 0, budgetYear: parseInt(budgetYear) } });
    }

    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM fp_prospects
      WHERE UPPER(division) = 'FP'
        AND budget_year = $1
        AND UPPER(TRIM(sales_rep_group)) = ANY($2::text[])
    `, [parseInt(budgetYear), repOwnershipFilters]);
    
    res.json({
      success: true,
      data: { count: parseInt(countResult.rows[0]?.count || 0), budgetYear: parseInt(budgetYear) }
    });
  } catch (error) {
    logger.error('Error fetching prospects count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch prospects count', data: { count: 0 } });
  }
});

module.exports = router;
