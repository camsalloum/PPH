/**
 * CRM Dashboard Routes
 *
 * Endpoints:
 *   GET /dashboard/stats          — admin-level overview
 *   GET /dashboard/active-customers — KPI drill-down
 *   GET /my-stats                 — personal dashboard for logged-in sales rep
 *   GET /sales-reps               — all active CRM sales reps
 *   GET /sales-rep-groups         — all FP sales rep groups
 *   GET /alerts/declining-customers
 *   GET /alerts/dormant-accounts
 *   GET /stats/conversion-rate
 *   GET /my-day/summary           — action counters for My Day dashboard
 *   GET /my-day/schedule          — today's merged timeline (tasks + meetings + calls)
 *   GET /my-day/priority-actions  — ranked action list (rules 1-7)
 *   POST /my-day/priority-actions/:id/snooze — snooze single action for 24h
 *   GET /my-day/customer-health   — customer health status + open deal context
 *   GET /my-day/notifications     — rep-scoped notifications
 *   PATCH /my-day/notifications/:id/read — mark notification as read
 *   GET /my-day/lookahead         — next 3-5 day action list
 *   GET /my-day/email-summary     — email activity snapshot for My Day
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate, requireRole } = require('../../middleware/auth');
const { resolveRepGroup } = require('../../services/crmService');
const { cacheGet, cacheSet, getCacheTTL } = require('../../services/crmCacheService');
const { getNotifications, markAsRead } = require('../../services/notificationService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// Lazy check: do field-trip tables exist? Resolved on first use.
let _fieldTripTablesExist = null;
async function hasFieldTripTables() {
  if (_fieldTripTablesExist !== null) return _fieldTripTablesExist;
  try {
    const r = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'crm_field_trip_stops'
       ) AS ok`
    );
    _fieldTripTablesExist = !!r.rows[0]?.ok;
  } catch { _fieldTripTablesExist = false; }
  return _fieldTripTablesExist;
}

// ============================================================================
// SALES REPS ENDPOINTS
// ============================================================================

/**
 * GET /api/crm/sales-reps
 */
router.get('/sales-reps', authenticate, requireRole('admin', 'sales_manager', 'manager'), async (req, res) => {
  try {
    const [viewRes, repUnifiedRes] = await Promise.all([
      authPool.query(`
        SELECT employee_id, full_name, user_id, email, designation, department, group_members, type
        FROM crm_sales_reps
        ORDER BY full_name
      `),
      pool.query(`
        SELECT su.group_id, sr.group_name, su.display_name, su.total_amount_all_time,
               su.customer_count, su.country_count
        FROM fp_sales_rep_unified su
        JOIN sales_rep_groups sr ON sr.id = su.group_id
        WHERE sr.division = 'FP'
      `)
    ]);

    const repData = repUnifiedRes.rows;
    const enriched = viewRes.rows.map(rep => {
      const firstName = rep.full_name.split(' ')[0].toLowerCase();
      const match = repData.find(r =>
        r.group_name.toLowerCase().includes(firstName) ||
        r.display_name?.toLowerCase().includes(firstName)
      );
      return {
        ...rep,
        group_id: match?.group_id || null,
        group_name: match?.group_name || null,
        total_amount_all_time: match?.total_amount_all_time || 0,
        customer_count: match?.customer_count || 0,
        country_count: match?.country_count || 0,
      };
    });

    res.json({ success: true, data: enriched, total: enriched.length });
  } catch (error) {
    logger.error('Error fetching CRM sales reps:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sales reps', message: error.message });
  }
});

/**
 * GET /api/crm/sales-rep-groups
 */
router.get('/sales-rep-groups', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sg.id,
        sg.group_name,
        sg.division,
        COALESCE(agg.total_amount_all_time, 0) AS total_amount_all_time,
        COALESCE(agg.total_kgs_all_time, 0)    AS total_kgs_all_time,
        COALESCE(agg.customer_count, 0)         AS customer_count,
        COALESCE(agg.country_count, 0)          AS country_count,
        agg.last_transaction_date
      FROM sales_rep_groups sg
      LEFT JOIN (
        SELECT group_id,
               SUM(total_amount_all_time) AS total_amount_all_time,
               SUM(total_kgs_all_time) AS total_kgs_all_time,
               SUM(customer_count) AS customer_count,
               MAX(country_count) AS country_count,
               MAX(last_transaction_date) AS last_transaction_date
        FROM fp_sales_rep_unified
        GROUP BY group_id
      ) agg ON agg.group_id = sg.id
      WHERE sg.division = 'FP'
      ORDER BY sg.group_name
    `);
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error) {
    logger.error('Error fetching sales rep groups:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sales rep groups', message: error.message });
  }
});


// ============================================================================
// ADMIN DASHBOARD STATS
// ============================================================================

router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied — admin dashboard requires elevated role' });
    }

    const { group_id, date_range, year } = req.query;

    const DIVISION = 'FP';
    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;
    const requestedYear = year ? parseInt(year) : nowYear;
    const currentYear = (isNaN(requestedYear) || requestedYear < 2000 || requestedYear > nowYear) ? nowYear : requestedYear;
    const isCurrentYear = currentYear === nowYear;
    const currentMonth = isCurrentYear ? nowMonth : 12;

    const cacheKey = `dash|${group_id || 'all'}|${date_range || 'ytd'}|${currentYear}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let periodMonths, periodLabel;
    switch (date_range) {
      case '1m':  periodMonths = [currentMonth]; periodLabel = 'This Month'; break;
      case 'q1':  periodMonths = [1, 2, 3];      periodLabel = 'Q1'; break;
      case 'q2':  periodMonths = [4, 5, 6];      periodLabel = 'Q2'; break;
      case 'q3':  periodMonths = [7, 8, 9];      periodLabel = 'Q3'; break;
      case 'q4':  periodMonths = [10, 11, 12];   periodLabel = 'Q4'; break;
      case 'fy':  periodMonths = [1,2,3,4,5,6,7,8,9,10,11,12]; periodLabel = 'Full Year'; break;
      default:    periodMonths = isCurrentYear ? Array.from({ length: currentMonth }, (_, i) => i + 1) : [1,2,3,4,5,6,7,8,9,10,11,12]; periodLabel = isCurrentYear ? 'YTD' : 'Full Year'; break;
    }
    // ── Resolve group (parameterized) ──
    let resolvedGroupName = '';
    let resolvedGroupId = null;
    if (group_id && group_id !== 'all') {
      const gid = parseInt(group_id);
      if (isNaN(gid)) return res.status(400).json({ success: false, error: 'Invalid group_id' });
      const groupResult = await pool.query('SELECT id, group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1', [gid]);
      if (groupResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Group not found' });
      resolvedGroupName = groupResult.rows[0].group_name;
      resolvedGroupId = groupResult.rows[0].id;
    }
    const prevMonthNo = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // ── Parameterized queries against mv_fp_sales_cube (replaces 12 raw scans) ──
    // Common: $1=division, $2=currentYear, $3=periodMonths[], $4=groupId|null
    const baseParams = [DIVISION, currentYear, periodMonths, resolvedGroupId];
    const pgExcl = `c.product_group IS NOT NULL AND c.product_group != ''
          AND LOWER(c.product_group) != 'not in pg'
          AND NOT EXISTS (
            SELECT 1 FROM fp_product_group_exclusions e
            WHERE UPPER(TRIM(e.product_group)) = UPPER(c.product_group)
              AND UPPER(TRIM(e.division_code)) = c.division
          )`;

    const results = await Promise.all([
      // 0 — Customer / country counts (no PG exclusion)
      pool.query(`
        SELECT COUNT(DISTINCT c.customer_name) AS total_customers,
               COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])) AS period_customers,
               COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 AND c.month_no = $5) AS month_customers,
               COUNT(DISTINCT c.country) FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])) AS countries
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year >= $2 - 1
      `, [...baseParams, currentMonth]),

      // 1 — Revenue KPIs: YTD + month + prev-year (with PG exclusion, combines old queries 2+3+9)
      pool.query(`
        SELECT
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_revenue,
          COALESCE(SUM(c.kgs)     FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_kgs,
          COALESCE(SUM(c.morm)    FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_morm,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 AND c.month_no = $5), 0) AS this_month_revenue,
          COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 AND c.month_no = $5) AS order_count,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $6 AND c.month_no = $7), 0) AS prev_month_revenue,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_revenue,
          COALESCE(SUM(c.morm)    FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_morm,
          COALESCE(SUM(c.kgs)     FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_kgs
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year IN ($2, $2 - 1)
          AND ${pgExcl}
      `, [...baseParams, currentMonth, prevMonthYear, prevMonthNo]),

      // 2 — Trend: monthly breakdown for BOTH years (combines old queries 4+5)
      pool.query(`
        SELECT c.year, c.month, c.month_no,
               ROUND(SUM(c.revenue)::numeric, 0) AS revenue,
               ROUND(SUM(c.kgs)::numeric, 0) AS kgs
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year IN ($2, $2 - 1)
          AND c.month_no = ANY($3::int[])
          AND ${pgExcl}
        GROUP BY c.year, c.month, c.month_no
        ORDER BY c.year, c.month_no
      `, baseParams),

      // 3 — Product mix: top 8 product groups
      pool.query(`
        SELECT c.product_group AS name,
               ROUND(SUM(c.revenue)::numeric, 0) AS value
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year = $2 AND c.month_no = ANY($3::int[])
          AND ${pgExcl}
        GROUP BY c.product_group
        ORDER BY value DESC
        LIMIT 8
      `, baseParams),

      // 4 — Top rep groups (no group filter — always shows all groups)
      pool.query(`
        SELECT c.sales_rep_group_name AS group_name,
               ROUND(SUM(c.revenue)::numeric, 0) AS total_amount,
               COUNT(DISTINCT c.customer_name) AS customer_count
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND c.year = $2 AND c.month_no = ANY($3::int[])
          AND ${pgExcl}
          AND c.sales_rep_group_name IS NOT NULL AND c.sales_rep_group_name != ''
        GROUP BY c.sales_rep_group_name
        ORDER BY total_amount DESC
        LIMIT 8
      `, [DIVISION, currentYear, periodMonths]),

      // 5 — Prospects (separate table, parameterized)
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE approval_status = 'pending')  AS pending,
               COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved,
               COUNT(*) FILTER (WHERE source = 'inquiry')           AS from_inquiry
        FROM fp_prospects
        WHERE division = $1
          ${resolvedGroupId ? 'AND TRIM(UPPER(sales_rep_group)) = TRIM(UPPER($2))' : ''}
      `, resolvedGroupId ? [DIVISION, resolvedGroupName] : [DIVISION]),

      // 6 — Top countries (no PG exclusion)
      pool.query(`
        SELECT c.country AS name, COUNT(DISTINCT c.customer_name) AS count
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year = $2 AND c.month_no = ANY($3::int[])
          AND c.country IS NOT NULL AND c.country != ''
        GROUP BY c.country
        ORDER BY count DESC
        LIMIT 5
      `, baseParams),

      // 7 — Recent customers: top 8 by revenue
      pool.query(`
        WITH top_custs AS (
          SELECT c.customer_name,
                 c.country,
                 c.sales_rep_group_name,
                 ROUND(SUM(c.revenue)::numeric, 0) AS total_amount,
                 MAX(c.year || '-' || LPAD(c.month_no::text, 2, '0')) AS last_order_ym
          FROM mv_fp_sales_cube c
          WHERE c.division = $1
            AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
            AND c.year = $2 AND c.month_no = ANY($3::int[])
            AND ${pgExcl}
          GROUP BY c.customer_name, c.country, c.sales_rep_group_name
          ORDER BY total_amount DESC
          LIMIT 8
        )
        SELECT tc.*, cu.customer_id
        FROM top_custs tc
        LEFT JOIN LATERAL (
          SELECT customer_id FROM fp_customer_unified
          WHERE LOWER(TRIM(display_name)) = LOWER(tc.customer_name)
          LIMIT 1
        ) cu ON true
      `, baseParams),

      // 8 — Budget target (separate table, parameterized)
      pool.query(`
        SELECT COALESCE(SUM(b.amount), 0) AS budget_amount
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = $1
        WHERE UPPER(TRIM(b.division_code)) = $1
          AND b.budget_year = $2
          AND b.month_no = ANY($3::int[])
          AND b.is_budget = true
          AND e.product_group IS NULL
          AND b.pgcombine IS NOT NULL AND TRIM(b.pgcombine) != ''
          ${resolvedGroupId ? 'AND TRIM(UPPER(b.sales_rep_group_name)) = TRIM(UPPER($4))' : ''}
      `, resolvedGroupId
        ? [DIVISION, currentYear, periodMonths, resolvedGroupName]
        : [DIVISION, currentYear, periodMonths]),
    ]);

    const [
      custStats, kpiStats, trendStats, productMix, topReps,
      prospectsStats, topCountriesStats, recentCustStats, budgetTargetStats,
    ] = results;

    const cust = custStats.rows[0];
    const totalCustomers   = parseInt(cust?.total_customers || 0);
    const ytdCustomers     = parseInt(cust?.period_customers || 0);
    const monthCustomers   = parseInt(cust?.month_customers || 0);
    const countryCount     = parseInt(cust?.countries || 0);

    const ytdRevenue       = parseFloat(kpiStats.rows[0]?.ytd_revenue || 0);
    const ytdKgs           = parseFloat(kpiStats.rows[0]?.ytd_kgs || 0);
    const ytdMorm          = parseFloat(kpiStats.rows[0]?.ytd_morm || 0);
    const thisMonthRevenue = parseFloat(kpiStats.rows[0]?.this_month_revenue || 0);
    const prevMonthRevenue = parseFloat(kpiStats.rows[0]?.prev_month_revenue || 0);
    const monthGrowth = prevMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : 0;

    const prevYearRevenue = parseFloat(kpiStats.rows[0]?.prev_year_revenue || 0);
    const prevYearMorm    = parseFloat(kpiStats.rows[0]?.prev_year_morm || 0);
    const prevYearKgs     = parseFloat(kpiStats.rows[0]?.prev_year_kgs || 0);
    const yoyGrowth = prevYearRevenue > 0
      ? Math.round(((ytdRevenue - prevYearRevenue) / prevYearRevenue) * 100)
      : 0;

    const mormPct     = ytdRevenue > 0 ? parseFloat(((ytdMorm / ytdRevenue) * 100).toFixed(2)) : 0;
    const prevMormPct = prevYearRevenue > 0 ? parseFloat(((prevYearMorm / prevYearRevenue) * 100).toFixed(2)) : 0;

    const avgOrderValue = ytdCustomers > 0
      ? Math.round(ytdRevenue / ytdCustomers)
      : 0;

    const budgetTarget = parseFloat(budgetTargetStats?.rows[0]?.budget_amount || 0);
    const budgetAchievementPct = budgetTarget > 0
      ? Math.round((ytdRevenue / budgetTarget) * 100)
      : null;

    // Build trend from combined 2-year query
    const MONTH_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTH_FULL  = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const thisYearMap = {};
    const prevYearMap = {};
    (trendStats?.rows || []).forEach(r => {
      const yr = parseInt(r.year);
      const key = r.month.trim().toUpperCase();
      if (yr === currentYear) {
        thisYearMap[key] = { revenue: parseFloat(r.revenue || 0), kgs: parseFloat(r.kgs || 0) };
      } else {
        prevYearMap[key] = parseFloat(r.revenue || 0);
      }
    });

    const responseBody = {
      success: true,
      data: {
        period_label: periodLabel,
        period_months: periodMonths.length,
        customers: {
          total: totalCustomers,
          active: ytdCustomers,
          month: monthCustomers,
          countries: countryCount,
        },
        revenue: {
          ytd: ytdRevenue,
          kgs_ytd: ytdKgs,
          prev_year_kgs: prevYearKgs,
          this_month: thisMonthRevenue,
          prev_month: prevMonthRevenue,
          month_growth_pct: monthGrowth,
          yoy_growth_pct: yoyGrowth,
          prev_year_ytd: prevYearRevenue,
          avg_order_value: avgOrderValue,
          morm: ytdMorm,
          morm_pct: mormPct,
          prev_year_morm_pct: prevMormPct,
          budget_target: budgetTarget,
          budget_achievement_pct: budgetAchievementPct,
        },
        trend: periodMonths.map(monthNo => {
          const fullKey = MONTH_FULL[monthNo];
          const thisData = thisYearMap[fullKey] || { revenue: 0, kgs: 0 };
          return {
            label: MONTH_SHORT[monthNo],
            revenue: thisData.revenue,
            kgs: thisData.kgs,
            prev_year_revenue: prevYearMap[fullKey] || 0,
          };
        }),
        product_mix: productMix.rows.map(r => ({
          name: r.name || 'Other',
          value: parseFloat(r.value || 0),
        })),
        rep_groups: topReps.rows,
        prospects: prospectsStats.rows[0],
        top_countries: topCountriesStats.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
        recent_customers: recentCustStats.rows.map(r => ({
          customer_id: r.customer_id ? parseInt(r.customer_id) : null,
          customer_name: r.customer_name,
          country: r.country,
          sales_rep_group_name: r.sales_rep_group_name,
          total_amount: parseFloat(r.total_amount || 0),
          last_order_ym: r.last_order_ym,
        })),
      },
    };

    cacheSet(cacheKey, responseBody, getCacheTTL(currentYear));
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching CRM dashboard stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats', message: error.message });
  }
});


// ============================================================================
// ACTIVE CUSTOMERS DETAIL (for KPI drill-down)
// ============================================================================

router.get('/dashboard/active-customers', authenticate, async (req, res) => {
  try {
    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);

    const { group_id, date_range, year } = req.query;
    const DIVISION = 'FP';
    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;
    const requestedYear = year ? parseInt(year) : nowYear;
    const currentYear = (isNaN(requestedYear) || requestedYear < 2000 || requestedYear > nowYear) ? nowYear : requestedYear;
    const isCurrentYear = currentYear === nowYear;
    const currentMonth = isCurrentYear ? nowMonth : 12;

    let resolvedGroupName = null;
    if (!isFullAccess) {
      const rep = await resolveRepGroup(req.user.id);
      if (!rep || !rep.groupName) {
        return res.json({ success: true, data: { customers: [], total: 0, new_count: 0, period_year: currentYear, period_months: [] } });
      }
      resolvedGroupName = rep.groupName;
    }

    const scopeKey = isFullAccess ? (group_id || 'all') : `u${req.user.id}`;
    const acCacheKey = `ac|${scopeKey}|${date_range || 'ytd'}|${currentYear}`;
    const acCached = cacheGet(acCacheKey);
    if (acCached) return res.json(acCached);

    let periodMonths;
    switch (date_range) {
      case '1m':  periodMonths = [currentMonth]; break;
      case 'q1':  periodMonths = [1, 2, 3]; break;
      case 'q2':  periodMonths = [4, 5, 6]; break;
      case 'q3':  periodMonths = [7, 8, 9]; break;
      case 'q4':  periodMonths = [10, 11, 12]; break;
      case 'fy':  periodMonths = [1,2,3,4,5,6,7,8,9,10,11,12]; break;
      default:    periodMonths = isCurrentYear ? Array.from({ length: currentMonth }, (_, i) => i + 1) : [1,2,3,4,5,6,7,8,9,10,11,12]; break;
    }
    // ── Resolve group ID (parameterized) ──
    let resolvedGroupId = null;
    if (resolvedGroupName) {
      const gr = await pool.query(
        `SELECT id FROM sales_rep_groups WHERE TRIM(UPPER(group_name)) = TRIM(UPPER($1)) LIMIT 1`,
        [resolvedGroupName]
      );
      if (gr.rows.length > 0) resolvedGroupId = gr.rows[0].id;
    } else if (group_id && group_id !== 'all') {
      const gid = parseInt(group_id);
      if (!isNaN(gid)) resolvedGroupId = gid;
    }

    const result = await pool.query(`
      WITH current_period AS (
        SELECT
          c.customer_name,
          c.country,
          c.sales_rep_group_name,
          ROUND(SUM(c.revenue)::numeric, 0) AS total_amount,
          ROUND(SUM(c.kgs)::numeric, 0) AS total_kgs,
          MAX(c.year || '-' || LPAD(c.month_no::text, 2, '0')) AS last_order_ym,
          SUM(c.txn_count) AS txn_count
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
          AND c.year = $3 AND c.month_no = ANY($4::int[])
        GROUP BY c.customer_name, c.country, c.sales_rep_group_name
      ),
      prev_year_names AS (
        SELECT DISTINCT c.customer_name
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
          AND c.year = $3 - 1
      )
      SELECT cp.*,
             cu.customer_id,
             CASE WHEN py.customer_name IS NULL THEN true ELSE false END AS is_new
      FROM current_period cp
      LEFT JOIN prev_year_names py ON LOWER(py.customer_name) = LOWER(cp.customer_name)
      LEFT JOIN LATERAL (
        SELECT customer_id FROM fp_customer_unified
        WHERE LOWER(TRIM(display_name)) = LOWER(cp.customer_name)
        LIMIT 1
      ) cu ON true
      ORDER BY cp.total_amount DESC
    `, [DIVISION, resolvedGroupId, currentYear, periodMonths]);

    const body = {
      success: true,
      data: {
        period_year: currentYear,
        period_months: periodMonths,
        customers: result.rows.map(r => ({
          customer_id: r.customer_id ? parseInt(r.customer_id) : null,
          customer_name: r.customer_name,
          country: r.country || '',
          sales_rep_group_name: r.sales_rep_group_name || '',
          total_amount: parseFloat(r.total_amount || 0),
          total_kgs: parseFloat(r.total_kgs || 0),
          last_order_ym: r.last_order_ym,
          txn_count: parseInt(r.txn_count || 0),
          is_new: r.is_new === true || r.is_new === 't',
        })),
        total: result.rows.length,
        new_count: result.rows.filter(r => r.is_new === true || r.is_new === 't').length,
      }
    };
    cacheSet(acCacheKey, body, getCacheTTL(currentYear));
    res.json(body);
  } catch (error) {
    logger.error('Error fetching active customers detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active customers' });
  }
});


// ============================================================================
// SALES REP PERSONAL DASHBOARD STATS
// ============================================================================

router.get('/my-stats', authenticate, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const repData = await resolveRepGroup(user.id);
    if (!repData) {
      return res.json({ success: true, data: { empty: true, message: 'Not a registered sales rep' } });
    }
    if (!repData.groupName) {
      return res.json({ success: true, data: { empty: true, message: 'No sales rep group found for this user' } });
    }
    const repFullName   = repData.fullName;
    const groupName     = repData.groupName;
    const DIVISION = 'FP';

    // Resolve group_id from group_name for parameterized MV queries
    const groupLookup = await pool.query(
      'SELECT id FROM sales_rep_groups WHERE TRIM(UPPER(group_name)) = TRIM(UPPER($1)) LIMIT 1',
      [groupName]
    );
    const repGroupId = groupLookup.rows.length > 0 ? groupLookup.rows[0].id : null;

    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;
    const yearParam = req.query.year ? parseInt(req.query.year) : nowYear;
    const currentYear = (isNaN(yearParam) || yearParam < 2000 || yearParam > nowYear) ? nowYear : yearParam;
    const isCurrentYear = currentYear === nowYear;
    const currentMonth = isCurrentYear ? nowMonth : 12;
    const prevMonthNo = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const dateRange = req.query.date_range || 'ytd';
    let periodMonths, periodLabel;
    switch (dateRange) {
      case '1m':  periodMonths = [currentMonth]; periodLabel = 'This Month'; break;
      case 'q1':  periodMonths = [1, 2, 3];      periodLabel = 'Q1'; break;
      case 'q2':  periodMonths = [4, 5, 6];      periodLabel = 'Q2'; break;
      case 'q3':  periodMonths = [7, 8, 9];      periodLabel = 'Q3'; break;
      case 'q4':  periodMonths = [10, 11, 12];   periodLabel = 'Q4'; break;
      case 'fy':  periodMonths = [1,2,3,4,5,6,7,8,9,10,11,12]; periodLabel = 'Full Year'; break;
      default:    periodMonths = isCurrentYear ? Array.from({ length: currentMonth }, (_, i) => i + 1) : [1,2,3,4,5,6,7,8,9,10,11,12]; periodLabel = isCurrentYear ? 'YTD' : 'Full Year'; break;
    }

    const myStatsCacheKey = `mystats|${user.id}|${dateRange}|${currentYear}`;
    const myCached = cacheGet(myStatsCacheKey);
    if (myCached) {
      return res.json(myCached);
    }

    // ── Parameterized queries against mv_fp_sales_cube ──
    // $1=division, $2=currentYear, $3=periodMonths[], $4=repGroupId
    const baseParams = [DIVISION, currentYear, periodMonths, repGroupId];
    const pgExcl = `c.product_group IS NOT NULL AND c.product_group != ''
          AND LOWER(c.product_group) != 'not in pg'
          AND NOT EXISTS (
            SELECT 1 FROM fp_product_group_exclusions e
            WHERE UPPER(TRIM(e.product_group)) = UPPER(c.product_group)
              AND UPPER(TRIM(e.division_code)) = c.division
          )`;

    const [kpiStats, trendStats, productMixStats, prospectsStats, topCustStats, myBudgetTargetStats] = await Promise.all([
      // 0 — Combined KPI: YTD, month, prev year (with PG exclusion)
      pool.query(`
        SELECT
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_revenue,
          COALESCE(SUM(c.kgs)     FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_kgs,
          COALESCE(SUM(c.morm)    FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])), 0) AS ytd_morm,
          COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 AND c.month_no = ANY($3::int[])) AS active_customers,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 AND c.month_no = $5), 0) AS this_month_revenue,
          COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 AND c.month_no = $5) AS order_count,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $6 AND c.month_no = $7), 0) AS prev_month_revenue,
          COALESCE(SUM(c.revenue) FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_revenue,
          COALESCE(SUM(c.morm)    FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_morm,
          COALESCE(SUM(c.kgs)     FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])), 0) AS prev_year_kgs,
          COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year = $2 - 1 AND c.month_no = ANY($3::int[])) AS prev_year_customers
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year IN ($2, $2 - 1)
          AND ${pgExcl}
      `, [...baseParams, currentMonth, prevMonthYear, prevMonthNo]),

      // 1 — Trend: both years combined
      pool.query(`
        SELECT c.year, c.month, c.month_no,
               ROUND(SUM(c.revenue)::numeric, 0) AS revenue,
               ROUND(SUM(c.kgs)::numeric, 0) AS kgs
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year IN ($2, $2 - 1)
          AND c.month_no = ANY($3::int[])
          AND ${pgExcl}
        GROUP BY c.year, c.month, c.month_no
        ORDER BY c.year, c.month_no
      `, baseParams),

      // 2 — Product mix: top 8
      pool.query(`
        SELECT c.product_group AS name,
               ROUND(SUM(c.revenue)::numeric, 0) AS value
        FROM mv_fp_sales_cube c
        WHERE c.division = $1
          AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
          AND c.year = $2 AND c.month_no = ANY($3::int[])
          AND ${pgExcl}
        GROUP BY c.product_group
        ORDER BY value DESC
        LIMIT 8
      `, baseParams),

      // 3 — Prospects (separate table, parameterized)
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE approval_status = 'pending') AS pending,
               COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved
        FROM fp_prospects
        WHERE UPPER(division) = $1
          AND TRIM(UPPER(sales_rep_group)) = TRIM(UPPER($2))
      `, [DIVISION, groupName]),

      // 4 — Top customers: top 15
      pool.query(`
        WITH top_custs AS (
          SELECT c.customer_name,
                 c.country,
                 ROUND(SUM(c.revenue)::numeric, 0) AS total_amount,
                 MAX(c.year || '-' || LPAD(c.month_no::text, 2, '0')) AS last_order_ym
          FROM mv_fp_sales_cube c
          WHERE c.division = $1
            AND ($4::int IS NULL OR c.sales_rep_group_id = $4)
            AND c.year = $2 AND c.month_no = ANY($3::int[])
            AND ${pgExcl}
          GROUP BY c.customer_name, c.country
          ORDER BY total_amount DESC
          LIMIT 15
        )
        SELECT tc.*, cu.customer_id
        FROM top_custs tc
        LEFT JOIN LATERAL (
          SELECT customer_id FROM fp_customer_unified
          WHERE LOWER(TRIM(display_name)) = LOWER(tc.customer_name)
          LIMIT 1
        ) cu ON true
      `, baseParams),

      // 5 — Budget target (separate table, parameterized)
      pool.query(`
        SELECT COALESCE(SUM(b.amount), 0) AS budget_amount
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = $1
        WHERE UPPER(TRIM(b.division_code)) = $1
          AND b.budget_year = $2
          AND b.month_no = ANY($3::int[])
          AND b.is_budget = true
          AND e.product_group IS NULL
          AND b.pgcombine IS NOT NULL AND TRIM(b.pgcombine) != ''
          AND TRIM(UPPER(b.sales_rep_group_name)) = TRIM(UPPER($4))
      `, [DIVISION, currentYear, periodMonths, groupName]),
    ]);

    const ytdRevenue = parseFloat(kpiStats.rows[0]?.ytd_revenue || 0);
    const kgsYTD = parseFloat(kpiStats.rows[0]?.ytd_kgs || 0);
    const ytdMorm = parseFloat(kpiStats.rows[0]?.ytd_morm || 0);
    const thisMonthRevenue = parseFloat(kpiStats.rows[0]?.this_month_revenue || 0);
    const prevMonthRevenue = parseFloat(kpiStats.rows[0]?.prev_month_revenue || 0);
    const prevYearYTD = parseFloat(kpiStats.rows[0]?.prev_year_revenue || 0);
    const prevYearMorm = parseFloat(kpiStats.rows[0]?.prev_year_morm || 0);
    const prevYearKgs  = parseFloat(kpiStats.rows[0]?.prev_year_kgs || 0);
    const prevYearCustomers = parseInt(kpiStats.rows[0]?.prev_year_customers || 0);
    const monthGrowth = prevMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : 0;
    const yoyGrowth = prevYearYTD > 0
      ? Math.round(((ytdRevenue - prevYearYTD) / prevYearYTD) * 100) : 0;
    const mormPct = ytdRevenue > 0 ? parseFloat(((ytdMorm / ytdRevenue) * 100).toFixed(2)) : 0;
    const prevMormPct = prevYearYTD > 0 ? parseFloat(((prevYearMorm / prevYearYTD) * 100).toFixed(2)) : 0;

    const myBudgetTarget = parseFloat(myBudgetTargetStats?.rows[0]?.budget_amount || 0);
    const myBudgetAchievementPct = myBudgetTarget > 0
      ? Math.round((ytdRevenue / myBudgetTarget) * 100)
      : null;

    let overdueTaskCount = 0;
    try {
      const overdueRes = await pool.query(
        `SELECT COUNT(*) FROM crm_tasks
         WHERE assignee_id = $1 AND status = 'open' AND due_date < CURRENT_DATE`,
        [user.id]
      );
      overdueTaskCount = parseInt(overdueRes.rows[0]?.count || 0);
    } catch (_) { /* crm_tasks may not exist yet */ }

    // Build trend from combined 2-year query
    const MONTH_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTH_FULL  = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const thisYearMap = {};
    const prevYearMap = {};
    (trendStats?.rows || []).forEach(r => {
      const yr = parseInt(r.year);
      const key = r.month.trim().toUpperCase();
      if (yr === currentYear) {
        thisYearMap[key] = { revenue: parseFloat(r.revenue || 0), kgs: parseFloat(r.kgs || 0) };
      } else {
        prevYearMap[key] = parseFloat(r.revenue || 0);
      }
    });

    const myStatsResponse = {
      success: true,
      data: {
        period_label: periodLabel,
        period_months: periodMonths.length,
        overdueTaskCount,
        salesRep: { name: repFullName, type: repData.type, groupName },
        revenue: {
          ytd: ytdRevenue,
          kgs_ytd: kgsYTD,
          prev_year_kgs: prevYearKgs,
          this_month: thisMonthRevenue,
          prev_month: prevMonthRevenue,
          prev_year_ytd: prevYearYTD,
          month_growth_pct: monthGrowth,
          yoy_growth_pct: yoyGrowth,
          active_customers: parseInt(kpiStats.rows[0]?.active_customers || 0),
          prev_year_customers: prevYearCustomers,
          morm: ytdMorm,
          morm_pct: mormPct,
          prev_year_morm_pct: prevMormPct,
          budget_target: myBudgetTarget,
          budget_achievement_pct: myBudgetAchievementPct,
        },
        trend: periodMonths.map(monthNo => {
          const fullKey = MONTH_FULL[monthNo];
          const thisData = thisYearMap[fullKey] || { revenue: 0, kgs: 0 };
          return {
            label: MONTH_SHORT[monthNo],
            revenue: thisData.revenue,
            kgs: thisData.kgs,
            prev_year_revenue: prevYearMap[fullKey] || 0,
          };
        }),
        product_mix: productMixStats.rows.map(r => ({
          name: r.name || 'Other',
          value: parseFloat(r.value || 0),
        })),
        prospects: prospectsStats.rows[0] || { total: 0, pending: 0, approved: 0 },
        recent_customers: (topCustStats?.rows || []).map(r => ({
          customer_id: r.customer_id ? parseInt(r.customer_id) : null,
          customer_name: r.customer_name,
          country: r.country,
          total_amount: parseFloat(r.total_amount || 0),
          last_order_ym: r.last_order_ym,
        })),
      },
    };

    cacheSet(myStatsCacheKey, myStatsResponse, getCacheTTL(currentYear));
    res.json(myStatsResponse);
  } catch (error) {
    logger.error('Error fetching my-stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch personal stats', message: error.message });
  }
});


// ============================================================================
// ALERTS
// ============================================================================

router.get('/alerts/declining-customers', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const nowYear  = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;

    let safeGroupFilter = '';
    let filterParam     = null;

    if (FULL_ACCESS_ROLES.includes(user.role)) {
      if (req.query.group_id && req.query.group_id !== 'all') {
        const gid = parseInt(req.query.group_id);
        if (!isNaN(gid)) {
          const gRow = await pool.query('SELECT group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1', [gid]);
          if (gRow.rows.length) {
            filterParam   = gRow.rows[0].group_name;
            safeGroupFilter = `AND TRIM(UPPER(a.sales_rep_group_name)) = TRIM(UPPER($4))`;
          }
        }
      }
    } else {
      const rep = await resolveRepGroup(user.id);
      if (!rep || !rep.groupName) return res.json({ success: true, data: [] });
      filterParam     = rep.groupName;
      safeGroupFilter = `AND TRIM(UPPER(a.sales_rep_group_name)) = TRIM(UPPER($4))`;
    }

    const cacheKey = `decl:${user.role}:${filterParam || 'all'}:${nowYear}${nowMonth}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const params = [nowYear, nowYear - 1, nowMonth];
    if (filterParam) params.push(filterParam);

    const result = await pool.query(`
      SELECT
        a.customer_name,
        a.sales_rep_group_name,
        COALESCE(SUM(a.amount) FILTER (WHERE a.year = $1 AND a.month_no <= $3), 0) AS this_year,
        COALESCE(SUM(a.amount) FILTER (WHERE a.year = $2 AND a.month_no <= $3), 0) AS last_year
      FROM fp_actualcommon a
      WHERE a.customer_name IS NOT NULL
        AND TRIM(a.customer_name) != ''
        AND UPPER(TRIM(a.admin_division_code)) = 'FP'
        ${safeGroupFilter}
      GROUP BY a.customer_name, a.sales_rep_group_name
      HAVING
        COALESCE(SUM(a.amount) FILTER (WHERE a.year = $2 AND a.month_no <= $3), 0) > 0
        AND COALESCE(SUM(a.amount) FILTER (WHERE a.year = $1 AND a.month_no <= $3), 0)
          < COALESCE(SUM(a.amount) FILTER (WHERE a.year = $2 AND a.month_no <= $3), 0) * 0.60
      ORDER BY
        (COALESCE(SUM(a.amount) FILTER (WHERE a.year = $1 AND a.month_no <= $3), 0)
          - COALESCE(SUM(a.amount) FILTER (WHERE a.year = $2 AND a.month_no <= $3), 0)) ASC
      LIMIT 10
    `, params);

    const data = result.rows.map(r => {
      const thisY = parseFloat(r.this_year);
      const lastY = parseFloat(r.last_year);
      const pct   = lastY > 0 ? Math.round(((thisY - lastY) / lastY) * 100) : 0;
      return { customer_name: r.customer_name, sales_rep_group_name: r.sales_rep_group_name, this_year: thisY, last_year: lastY, growth_pct: pct };
    });

    const resp = { success: true, data };
    cacheSet(cacheKey, resp);
    res.json(resp);
  } catch (err) {
    logger.error('CRM: error fetching declining customers', err);
    res.status(500).json({ success: false, error: 'Failed to fetch declining customers', data: [] });
  }
});

router.get('/alerts/dormant-accounts', authenticate, async (req, res) => {
  try {
    const user = req.user;

    let safeGroupFilter = '';
    let filterParam     = null;

    if (FULL_ACCESS_ROLES.includes(user.role)) {
      if (req.query.group_id && req.query.group_id !== 'all') {
        const gid = parseInt(req.query.group_id);
        if (!isNaN(gid)) {
          const gRow = await pool.query('SELECT group_name FROM sales_rep_groups WHERE id = $1 LIMIT 1', [gid]);
          if (gRow.rows.length) {
            filterParam   = gRow.rows[0].group_name;
            safeGroupFilter = `AND TRIM(UPPER(cu.sales_rep_group_name)) = TRIM(UPPER($1))`;
          }
        }
      }
    } else {
      const rep = await resolveRepGroup(user.id);
      if (!rep || !rep.groupName) return res.json({ success: true, data: [] });
      filterParam     = rep.groupName;
      safeGroupFilter = `AND TRIM(UPPER(cu.sales_rep_group_name)) = TRIM(UPPER($1))`;
    }

    const cacheKey = `dorm:${user.role}:${filterParam || 'all'}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const params = filterParam ? [filterParam] : [];

    const dormantRes = await pool.query(`
      SELECT
        cu.customer_id,
        cu.display_name   AS customer_name,
        cu.sales_rep_group_name,
        COALESCE(live.last_txn, cu.last_transaction_date) AS last_order_date,
        COALESCE(cu.total_amount_all_time, 0)             AS total_revenue
      FROM fp_customer_unified cu
      LEFT JOIN mv_customer_last_txn live ON live.norm_name = cu.normalized_name
      WHERE cu.is_merged = false
        AND cu.display_name IS NOT NULL
        AND COALESCE(live.last_txn, cu.last_transaction_date) < CURRENT_DATE - INTERVAL '90 days'
        AND COALESCE(live.last_txn, cu.last_transaction_date) > CURRENT_DATE - INTERVAL '730 days'
        ${safeGroupFilter}
      ORDER BY COALESCE(live.last_txn, cu.last_transaction_date) ASC
      LIMIT 30
    `, params);

    const openInqRes = await pool.query(`
      SELECT DISTINCT UPPER(TRIM(customer_name)) AS norm_name
      FROM mes_presales_inquiries
      WHERE status NOT IN ('converted', 'lost')
    `);
    const openSet = new Set(openInqRes.rows.map(r => r.norm_name));

    const data = dormantRes.rows
      .filter(r => !openSet.has((r.customer_name || '').toUpperCase().trim()))
      .slice(0, 10)
      .map(r => ({
        customer_name:        r.customer_name,
        sales_rep_group_name: r.sales_rep_group_name,
        last_order_date:      r.last_order_date,
        days_dormant:         Math.floor((Date.now() - new Date(r.last_order_date)) / 86_400_000),
        total_revenue:        parseFloat(r.total_revenue),
      }));

    const resp = { success: true, data };
    cacheSet(cacheKey, resp);
    res.json(resp);
  } catch (err) {
    logger.error('CRM: error fetching dormant accounts', err);
    res.status(500).json({ success: false, error: 'Failed to fetch dormant accounts', data: [] });
  }
});

// ============================================================================
// CONVERSION RATE
// ============================================================================

router.get('/stats/conversion-rate', authenticate, async (req, res) => {
  try {
    const cacheKey = 'convrate';
    const cached   = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [currentRes, prevRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_closed,
          COUNT(*) FILTER (WHERE status = 'converted')     AS converted
        FROM mes_presales_inquiries
        WHERE status IN ('converted', 'lost')
          AND updated_at >= CURRENT_DATE - INTERVAL '90 days'
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_closed,
          COUNT(*) FILTER (WHERE status = 'converted')     AS converted
        FROM mes_presales_inquiries
        WHERE status IN ('converted', 'lost')
          AND updated_at >= CURRENT_DATE - INTERVAL '180 days'
          AND updated_at <  CURRENT_DATE - INTERVAL '90 days'
      `),
    ]);

    const closed      = parseInt(currentRes.rows[0].total_closed);
    const converted   = parseInt(currentRes.rows[0].converted);
    const rate        = closed > 0 ? Math.round((converted / closed) * 100) : null;

    const prevClosed  = parseInt(prevRes.rows[0].total_closed);
    const prevConv    = parseInt(prevRes.rows[0].converted);
    const prevRate    = prevClosed > 0 ? Math.round((prevConv / prevClosed) * 100) : null;

    const resp = {
      success: true,
      data: {
        period:              'last_90_days',
        total_closed:        closed,
        converted,
        conversion_rate_pct: rate,
        prev_rate_pct:       prevRate,
        delta_pct:           rate !== null && prevRate !== null ? rate - prevRate : null,
      },
    };
    cacheSet(cacheKey, resp);
    res.json(resp);
  } catch (err) {
    logger.error('CRM: error fetching conversion rate', err);
    res.status(500).json({ success: false, error: 'Failed to fetch conversion rate', data: null });
  }
});

// ============================================================================
// MY DAY SUMMARY (Task 6.7)
// ============================================================================

router.get('/my-day/summary', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const repGroupNameLike = `%${rep.groupName || rep.firstName || ''}%`;
    const repNameLike = `%${rep.firstName || ''}%`;

    const [
      tasksRes,
      dormantRes,
      inquiriesRes,
      callsTodayRes,
      meetingsTodayRes,
      tasksCompletedTodayRes,
      newInquiriesTodayRes,
      dealsAdvancedWeekRes,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') AS overdue
         FROM crm_tasks WHERE assignee_id = $1`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM fp_customer_unified cu
         LEFT JOIN mv_customer_last_txn lt ON lt.norm_name = cu.normalized_name
         WHERE cu.sales_rep_group_id = $1
           AND COALESCE(
             GREATEST(
               (SELECT MAX(activity_date) FROM crm_activities WHERE customer_id = cu.customer_id),
               (SELECT MAX(date_start)    FROM crm_calls       WHERE customer_id = cu.customer_id),
               (SELECT MAX(date_start)    FROM crm_meetings    WHERE customer_id = cu.customer_id)
             ),
             lt.last_txn, cu.last_transaction_date
           ) < CURRENT_DATE - INTERVAL '30 days'`,
        [rep.groupId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM mes_presales_inquiries
         WHERE sales_rep_group_id = $1
           AND status IN ('quoted', 'sample_approved', 'price_accepted')`,
        [rep.groupId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_calls
         WHERE assigned_to_id = $1
           AND status = 'held'
           AND DATE(date_start) = CURRENT_DATE`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_meetings
         WHERE assigned_to_id = $1
           AND status = 'held'
           AND DATE(date_start) = CURRENT_DATE`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_tasks
         WHERE assignee_id = $1
           AND status = 'completed'
           AND DATE(completed_at) = CURRENT_DATE`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM mes_presales_inquiries
         WHERE sales_rep_group_id = $1
           AND DATE(created_at) = CURRENT_DATE`,
        [rep.groupId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_deal_stage_history h
         JOIN crm_deals d ON d.id = h.deal_id
         WHERE d.assigned_rep_id = $1
           AND h.changed_at >= date_trunc('week', CURRENT_DATE)`,
        [req.user.id]
      ),
    ]);

    let revenueMtd = 0;
    let revenueTargetMtd = 0;
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const [revenueMtdRes, revenueTargetRes] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(a.amount), 0) AS amt
           FROM fp_actualcommon a
           WHERE a.year = $1
             AND a.month_no = $2
             AND (
               a.sales_rep_group_name ILIKE $3
               OR a.sales_rep_name ILIKE $4
             )`,
          [currentYear, currentMonth, repGroupNameLike, repNameLike]
        ).catch(() => ({ rows: [{ amt: 0 }] })),
        pool.query(
          `SELECT COALESCE(SUM(b.amount), 0) AS amt
           FROM fp_budget_unified b
           WHERE b.budget_year = $1
             AND b.month_no = $2
             AND (
               b.sales_rep_group_name ILIKE $3
               OR b.sales_rep_name ILIKE $4
             )`,
          [currentYear, currentMonth, repGroupNameLike, repNameLike]
        ).catch(() => ({ rows: [{ amt: 0 }] })),
      ]);

      revenueMtd = Number(revenueMtdRes.rows[0]?.amt || 0);
      revenueTargetMtd = Number(revenueTargetRes.rows[0]?.amt || 0);
    } catch (revenueError) {
      logger.warn('My-day summary revenue calc fallback', { error: revenueError.message, userId: req.user.id });
    }

    let targetPrefs = {};
    try {
      const prefRes = await authPool.query(
        `SELECT theme_settings
         FROM user_preferences
         WHERE user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      targetPrefs = prefRes.rows[0]?.theme_settings?.my_day_targets || {};
    } catch (targetPrefError) {
      logger.warn('My-day summary target prefs fallback', { error: targetPrefError.message, userId: req.user.id });
    }

    res.json({
      success: true,
      data: {
        overdueTasks: parseInt(tasksRes.rows[0]?.overdue || 0),
        dormantCustomers: parseInt(dormantRes.rows[0]?.cnt || 0),
        inquiriesAwaitingAction: parseInt(inquiriesRes.rows[0]?.cnt || 0),
        callsToday: parseInt(callsTodayRes.rows[0]?.cnt || 0),
        meetingsHeldToday: parseInt(meetingsTodayRes.rows[0]?.cnt || 0),
        tasksCompletedToday: parseInt(tasksCompletedTodayRes.rows[0]?.cnt || 0),
        newInquiriesToday: parseInt(newInquiriesTodayRes.rows[0]?.cnt || 0),
        dealsAdvancedWeek: parseInt(dealsAdvancedWeekRes.rows[0]?.cnt || 0),
        callsTargetToday: Number(targetPrefs.callsTargetToday || 10),
        meetingsTargetToday: Number(targetPrefs.meetingsTargetToday || 3),
        tasksTargetToday: Number(targetPrefs.tasksTargetToday || 8),
        inquiriesTargetToday: Number(targetPrefs.inquiriesTargetToday || 2),
        dealsAdvancedTargetWeek: Number(targetPrefs.dealsAdvancedTargetWeek || 5),
        revenueMtd,
        revenueTargetMtd,
      }
    });
  } catch (error) {
    logger.error('Error fetching my-day summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch my-day summary', message: error.message });
  }
});

// ============================================================================
// CRM HOME SUMMARY (single-call payload for CRMHomePage)
// ============================================================================

router.get('/home-summary', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const isFullAccess = FULL_ACCESS_ROLES.includes(user.role);
    const rep = await resolveRepGroup(user.id).catch(() => null);

    const cacheKey = `home-summary:${user.id}:${user.role}:${rep?.groupId || 'none'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const safeRows = async (query, params = []) => {
      try {
        const r = await pool.query(query, params);
        return r.rows;
      } catch (err) {
        logger.warn('CRM home-summary subquery failed', { message: err.message });
        return [];
      }
    };

    const tasksPromise = isFullAccess
      ? safeRows(`
          SELECT t.*,
                 CASE WHEN t.due_date < CURRENT_DATE AND t.status = 'open' THEN 'overdue' ELSE t.status END AS computed_status,
                 cu.display_name AS customer_name,
                 fp.customer_name AS prospect_name
          FROM crm_tasks t
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
          WHERE t.status = 'open'
          ORDER BY t.due_date ASC
          LIMIT 50
        `)
      : safeRows(`
          SELECT t.*,
                 CASE WHEN t.due_date < CURRENT_DATE AND t.status = 'open' THEN 'overdue' ELSE t.status END AS computed_status,
                 cu.display_name AS customer_name,
                 fp.customer_name AS prospect_name
          FROM crm_tasks t
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
          WHERE (t.assignee_id = $1 OR t.created_by = $1)
            AND t.status = 'open'
          ORDER BY t.due_date ASC
          LIMIT 50
        `, [user.id]);

    const meetingsPromise = isFullAccess
      ? safeRows(`
          SELECT m.*, cu.display_name AS customer_name, fp.customer_name AS prospect_name
          FROM crm_meetings m
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = m.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = m.prospect_id
          ORDER BY m.date_start DESC
          LIMIT 50
        `)
      : safeRows(`
          SELECT m.*, cu.display_name AS customer_name, fp.customer_name AS prospect_name
          FROM crm_meetings m
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = m.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = m.prospect_id
          WHERE m.assigned_to_id = $1
          ORDER BY m.date_start DESC
          LIMIT 50
        `, [user.id]);

    const callsPromise = isFullAccess
      ? safeRows(`
          SELECT c.*, cu.display_name AS customer_name, fp.customer_name AS prospect_name
          FROM crm_calls c
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = c.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = c.prospect_id
          ORDER BY c.date_start DESC
          LIMIT 50
        `)
      : safeRows(`
          SELECT c.*, cu.display_name AS customer_name, fp.customer_name AS prospect_name
          FROM crm_calls c
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = c.customer_id
          LEFT JOIN fp_prospects fp ON fp.id = c.prospect_id
          WHERE c.assigned_to_id = $1
          ORDER BY c.date_start DESC
          LIMIT 50
        `, [user.id]);

    const dealsPromise = isFullAccess
      ? safeRows(`
          SELECT d.*,
                 COALESCE(cu.display_name, p.customer_name) AS customer_name,
                 i.inquiry_stage
          FROM crm_deals d
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = d.customer_id
          LEFT JOIN fp_prospects p ON p.id = d.prospect_id
          LEFT JOIN mes_presales_inquiries i ON i.id = d.inquiry_id
          ORDER BY d.expected_close_date ASC
          LIMIT 100
        `)
      : safeRows(`
          SELECT d.*,
                 COALESCE(cu.display_name, p.customer_name) AS customer_name,
                 i.inquiry_stage
          FROM crm_deals d
          LEFT JOIN fp_customer_unified cu ON cu.customer_id = d.customer_id
          LEFT JOIN fp_prospects p ON p.id = d.prospect_id
          LEFT JOIN mes_presales_inquiries i ON i.id = d.inquiry_id
          WHERE d.assigned_rep_id = $1
          ORDER BY d.expected_close_date ASC
          LIMIT 100
        `, [user.id]);

    const prospectsPromise = rep?.groupName
      ? safeRows(`
          SELECT id, customer_name, country, sales_rep_group, budget_year,
                 approval_status, source, notes, competitor_notes, created_at,
                 converted_to_customer, converted_at
          FROM fp_prospects
          WHERE UPPER(division) = 'FP'
            AND TRIM(UPPER(sales_rep_group)) = TRIM(UPPER($1))
          ORDER BY created_at DESC, customer_name
          LIMIT 20
        `, [rep.groupName])
      : safeRows(`
          SELECT id, customer_name, country, sales_rep_group, budget_year,
                 approval_status, source, notes, competitor_notes, created_at,
                 converted_to_customer, converted_at
          FROM fp_prospects
          WHERE UPPER(division) = 'FP'
          ORDER BY created_at DESC, customer_name
          LIMIT 20
        `);

    const tripsPromise = isFullAccess
      ? safeRows(`
          SELECT id, title, status, departure_date, return_date
          FROM crm_field_trips
          WHERE status IN ('planning', 'confirmed', 'in_progress')
            AND COALESCE(return_date, departure_date) >= CURRENT_DATE - INTERVAL '1 day'
          ORDER BY departure_date ASC
          LIMIT 20
        `)
      : safeRows(`
          SELECT id, title, status, departure_date, return_date
          FROM crm_field_trips
          WHERE rep_id = $1
            AND status IN ('planning', 'confirmed', 'in_progress')
            AND COALESCE(return_date, departure_date) >= CURRENT_DATE - INTERVAL '1 day'
          ORDER BY departure_date ASC
          LIMIT 20
        `, [user.id]);

    const [tasks, meetings, calls, deals, prospects, trips] = await Promise.all([
      tasksPromise,
      meetingsPromise,
      callsPromise,
      dealsPromise,
      prospectsPromise,
      tripsPromise,
    ]);

    const responseBody = {
      success: true,
      data: {
        tasks,
        activities: [],
        meetings,
        calls,
        prospects,
        deals,
        trips,
      },
    };

    cacheSet(cacheKey, responseBody, 30);
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching CRM home summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch CRM home summary', message: error.message });
  }
});

// GET /my-day/schedule — today's merged timeline for the logged-in rep
router.get('/my-day/schedule', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const includeOverdue = String(req.query.include_overdue || 'true').toLowerCase() !== 'false';
    const hasFT = await hasFieldTripTables();

    const taskWhere = includeOverdue
      ? `(t.due_date = CURRENT_DATE OR (t.due_date < CURRENT_DATE AND t.status != 'completed'))`
      : `t.due_date = CURRENT_DATE`;

    const visitUnion = hasFT ? `
        UNION ALL

        SELECT
          'visit'::text AS item_type,
          s.id,
          COALESCE(cu.display_name, fp.customer_name, CONCAT('Field Stop #', s.stop_order::text)) AS item_title,
          s.outcome_status AS status,
          NULL::text AS priority,
          (COALESCE(s.visit_date, CURRENT_DATE) + COALESCE(s.visit_time, TIME '09:00')) AS item_time,
          s.duration_mins,
          cu.display_name AS customer_name,
          fp.customer_name AS prospect_name,
          false AS is_overdue
        FROM crm_field_trip_stops s
        JOIN crm_field_trips ft ON ft.id = s.trip_id
        LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
        LEFT JOIN fp_prospects fp ON fp.id = s.prospect_id
        WHERE ft.rep_id = $1
          AND ft.status IN ('planning', 'confirmed', 'in_progress')
          AND (
            s.visit_date = CURRENT_DATE
            OR (
              s.visit_date IS NULL
              AND CURRENT_DATE BETWEEN ft.departure_date AND COALESCE(ft.return_date, ft.departure_date)
            )
          )` : '';

    const result = await pool.query(
      `
      SELECT *
      FROM (
        SELECT
          'task'::text AS item_type,
          t.id,
          t.title AS item_title,
          t.status,
          t.priority,
          NULL::timestamp AS item_time,
          NULL::integer AS duration_mins,
          cu.display_name AS customer_name,
          fp.customer_name AS prospect_name,
          CASE WHEN t.due_date < CURRENT_DATE AND t.status != 'completed' THEN true ELSE false END AS is_overdue
        FROM crm_tasks t
        LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
        LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
        WHERE t.assignee_id = $1
          AND ${taskWhere}

        UNION ALL

        SELECT
          'meeting'::text AS item_type,
          m.id,
          m.name AS item_title,
          m.status,
          NULL::text AS priority,
          m.date_start AS item_time,
          m.duration_mins,
          cu.display_name AS customer_name,
          fp.customer_name AS prospect_name,
          false AS is_overdue
        FROM crm_meetings m
        LEFT JOIN fp_customer_unified cu ON cu.customer_id = m.customer_id
        LEFT JOIN fp_prospects fp ON fp.id = m.prospect_id
        WHERE m.assigned_to_id = $1
          AND DATE(m.date_start) = CURRENT_DATE

        UNION ALL

        SELECT
          'call'::text AS item_type,
          c.id,
          c.name AS item_title,
          c.status,
          NULL::text AS priority,
          c.date_start AS item_time,
          c.duration_mins,
          cu.display_name AS customer_name,
          fp.customer_name AS prospect_name,
          false AS is_overdue
        FROM crm_calls c
        LEFT JOIN fp_customer_unified cu ON cu.customer_id = c.customer_id
        LEFT JOIN fp_prospects fp ON fp.id = c.prospect_id
        WHERE c.assigned_to_id = $1
          AND DATE(c.date_start) = CURRENT_DATE

        ${visitUnion}
      ) merged
      ORDER BY
        CASE WHEN is_overdue THEN 0 ELSE 1 END,
        item_time ASC NULLS LAST
      LIMIT 100
      `,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching my-day schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch my-day schedule' });
  }
});

// GET /my-day/priority-actions — ranked action list for the logged-in rep
router.get('/my-day/priority-actions', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const repGroupId = rep.groupId || null;
    const repNameLike = `%${rep.firstName || ''}%`;
    const repGroupNameLike = `%${rep.groupName || rep.firstName || ''}%`;

    const hasFT = await hasFieldTripTables();
    let todayTripCustomerIds = new Set();
    if (hasFT) {
      const todayTripStopsRes = await pool.query(
        `SELECT DISTINCT s.customer_id
         FROM crm_field_trip_stops s
         JOIN crm_field_trips ft ON ft.id = s.trip_id
         WHERE ft.rep_id = $1
           AND s.customer_id IS NOT NULL
           AND ft.status IN ('planning', 'confirmed', 'in_progress')
           AND (
             s.visit_date = CURRENT_DATE
             OR (
               s.visit_date IS NULL
               AND CURRENT_DATE BETWEEN ft.departure_date AND COALESCE(ft.return_date, ft.departure_date)
             )
           )`,
        [req.user.id]
      );
      todayTripCustomerIds = new Set(
        todayTripStopsRes.rows
          .map(r => parseInt(r.customer_id, 10))
          .filter(Number.isFinite)
      );
    }

    const [coldDealsRes, unansweredProposalRes, newUncontactedInquiriesRes, overdueTasksRes, cycleFieldRes, emailsTableRes] = await Promise.all([
      pool.query(
        `SELECT
           d.id AS entity_id,
           d.title,
           d.stage,
           COALESCE(cu.display_name, fp.customer_name) AS customer_name,
           (CURRENT_DATE - COALESCE(
             (
               SELECT MAX(dt)
               FROM (
                 SELECT activity_date AS dt FROM crm_activities WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
                 UNION ALL
                 SELECT date_start FROM crm_calls WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
                 UNION ALL
                 SELECT date_start FROM crm_meetings WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
               ) acts
             )::date,
             d.updated_at::date,
             d.created_at::date
           ))::int AS age_days
         FROM crm_deals d
         LEFT JOIN fp_customer_unified cu ON cu.customer_id = d.customer_id
         LEFT JOIN fp_prospects fp ON fp.id = d.prospect_id
         WHERE d.assigned_rep_id = $1
           AND d.stage IN ('qualified', 'proposal', 'negotiation')
           AND (CURRENT_DATE - COALESCE(
             (
               SELECT MAX(dt)
               FROM (
                 SELECT activity_date AS dt FROM crm_activities WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
                 UNION ALL
                 SELECT date_start FROM crm_calls WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
                 UNION ALL
                 SELECT date_start FROM crm_meetings WHERE customer_id = d.customer_id OR prospect_id = d.prospect_id
               ) acts
             )::date,
             d.updated_at::date,
             d.created_at::date
           )) > 14
         ORDER BY age_days DESC
         LIMIT 5`,
        [req.user.id]
      ),
      pool.query(
        `SELECT
           i.id AS entity_id,
           i.inquiry_number,
           i.customer_name,
           (CURRENT_DATE - i.updated_at::date)::int AS age_days
         FROM mes_presales_inquiries i
         WHERE (
           ($1::integer IS NOT NULL AND i.sales_rep_group_id = $1)
           OR i.sales_rep_group_name ILIKE $2
         )
           AND i.inquiry_stage IN ('proposal_sent', 'quoted')
           AND i.updated_at < NOW() - INTERVAL '3 days'
         ORDER BY age_days DESC
         LIMIT 4`,
        [repGroupId, repGroupNameLike]
      ),
      pool.query(
        `SELECT
           i.id AS entity_id,
           i.inquiry_number,
           i.customer_name,
           EXTRACT(HOUR FROM (NOW() - i.created_at))::int AS age_hours
         FROM mes_presales_inquiries i
         WHERE (
           ($1::integer IS NOT NULL AND i.sales_rep_group_id = $1)
           OR i.sales_rep_group_name ILIKE $2
         )
           AND i.status = 'new'
           AND i.created_at < NOW() - INTERVAL '24 hours'
         ORDER BY i.created_at ASC
         LIMIT 4`,
        [repGroupId, repGroupNameLike]
      ),
      pool.query(
        `SELECT
           t.id AS entity_id,
           t.title,
           COALESCE(cu.display_name, fp.customer_name) AS customer_name,
           (CURRENT_DATE - t.due_date::date)::int AS age_days
         FROM crm_tasks t
         LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
         LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
         WHERE t.assignee_id = $1
           AND t.status != 'completed'
           AND t.due_date < CURRENT_DATE
         ORDER BY t.due_date ASC
         LIMIT 3`,
        [req.user.id]
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'fp_customer_unified'
             AND column_name = 'avg_reorder_cycle_days'
         ) AS has_cycle`
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name = 'crm_emails'
         ) AS has_emails`
      ),
    ]);

    let reorderWindowRows = [];
    if (cycleFieldRes.rows[0]?.has_cycle) {
      const reorderRes = await pool.query(
        `SELECT
           cu.customer_id AS entity_id,
           cu.display_name AS customer_name,
           cu.avg_reorder_cycle_days,
           (CURRENT_DATE - COALESCE(live_ltxn.last_txn::date, cu.last_transaction_date::date))::int AS age_days
         FROM fp_customer_unified cu
         LEFT JOIN mv_customer_last_txn live_ltxn ON live_ltxn.norm_name = cu.normalized_name
         WHERE cu.is_merged = false
           AND cu.avg_reorder_cycle_days IS NOT NULL
           AND cu.avg_reorder_cycle_days > 0
           AND (
             ($1::integer IS NOT NULL AND cu.sales_rep_group_id = $1)
             OR cu.primary_sales_rep_name ILIKE $2
             OR cu.sales_rep_group_name ILIKE $3
           )
           AND (CURRENT_DATE - COALESCE(live_ltxn.last_txn::date, cu.last_transaction_date::date)) >= (cu.avg_reorder_cycle_days * 0.9)
         ORDER BY age_days DESC
         LIMIT 3`,
        [repGroupId, repNameLike, repGroupNameLike]
      );
      reorderWindowRows = reorderRes.rows.filter((row) => {
        const customerId = parseInt(row.entity_id, 10);
        // If a customer is already on today's field trip route, suppress reorder nudges.
        return !Number.isFinite(customerId) || !todayTripCustomerIds.has(customerId);
      });
    }

    let unreadEmailRows = [];
    let awaitingReplyRows = [];
    if (emailsTableRes.rows[0]?.has_emails) {
      const [unreadRes, awaitingRes] = await Promise.all([
        pool.query(
          `SELECT id AS entity_id, subject,
                  EXTRACT(HOUR FROM (NOW() - COALESCE(received_at, created_at)))::int AS age_hours
           FROM crm_emails
           WHERE rep_user_id = $1
             AND direction = 'inbound'
             AND is_read = false
             AND is_hidden = false
             AND COALESCE(received_at, created_at) < NOW() - INTERVAL '4 hours'
           ORDER BY COALESCE(received_at, created_at) ASC
           LIMIT 3`,
          [req.user.id]
        ),
        pool.query(
          `SELECT id AS entity_id, subject,
                  EXTRACT(HOUR FROM (NOW() - COALESCE(sent_at, created_at)))::int AS age_hours
           FROM crm_emails
           WHERE rep_user_id = $1
             AND direction = 'outbound'
             AND is_hidden = false
             AND COALESCE(sent_at, created_at) < NOW() - INTERVAL '48 hours'
             AND crm_status IN ('captured', 'pending_reply')
           ORDER BY COALESCE(sent_at, created_at) ASC
           LIMIT 3`,
          [req.user.id]
        ),
      ]);
      unreadEmailRows = unreadRes.rows;
      awaitingReplyRows = awaitingRes.rows;
    }

    const preferencesRes = await authPool.query(
      `SELECT theme_settings
       FROM user_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const themeSettings = preferencesRes.rows[0]?.theme_settings || {};
    const snoozeMap = (themeSettings && typeof themeSettings === 'object' && themeSettings.my_day_priority_snooze)
      ? themeSettings.my_day_priority_snooze
      : {};
    const nowTs = Date.now();

    const actions = [
      ...coldDealsRes.rows.map(r => ({
        rank: 1,
        type: 'cold_deal',
        entity_id: r.entity_id,
        title: `${r.customer_name || 'Deal'} is getting cold`,
        description: `${r.title} · stage: ${r.stage}`,
        age_days: r.age_days || 0,
        action_label: 'Follow Up',
      })),
      ...unansweredProposalRes.rows.map(r => ({
        rank: 2,
        type: 'unanswered_proposal',
        entity_id: r.entity_id,
        title: `Proposal pending reply: ${r.inquiry_number || `INQ-${r.entity_id}`}`,
        description: r.customer_name || 'Customer did not respond yet',
        age_days: r.age_days || 0,
        action_label: 'Follow Up',
      })),
      ...reorderWindowRows.map(r => ({
        rank: 3,
        type: 'reorder_window',
        entity_id: r.entity_id,
        title: `${r.customer_name} likely near reorder window`,
        description: `Cycle ${r.avg_reorder_cycle_days} days`,
        age_days: r.age_days || 0,
        action_label: 'Contact',
      })),
      ...newUncontactedInquiriesRes.rows.map(r => ({
        rank: 4,
        type: 'new_uncontacted_inquiry',
        entity_id: r.entity_id,
        title: `New inquiry uncontacted: ${r.inquiry_number || `INQ-${r.entity_id}`}`,
        description: r.customer_name || 'No contact logged yet',
        age_days: Math.floor((r.age_hours || 0) / 24),
        action_label: 'Open Inquiry',
      })),
      ...overdueTasksRes.rows.map(r => ({
        rank: 5,
        type: 'overdue_task',
        entity_id: r.entity_id,
        title: r.title,
        description: r.customer_name || 'Task overdue',
        age_days: r.age_days || 0,
        action_label: 'Open Task',
      })),
      ...unreadEmailRows.map(r => ({
        rank: 6,
        type: 'unread_email',
        entity_id: r.entity_id,
        title: `Unread email: ${r.subject || `Email #${r.entity_id}`}`,
        description: 'Inbound email pending review',
        age_days: Math.floor((r.age_hours || 0) / 24),
        action_label: 'Open Email',
      })),
      ...awaitingReplyRows.map(r => ({
        rank: 7,
        type: 'awaiting_reply',
        entity_id: r.entity_id,
        title: `Awaiting reply: ${r.subject || `Email #${r.entity_id}`}`,
        description: 'No inbound response in thread yet',
        age_days: Math.floor((r.age_hours || 0) / 24),
        action_label: 'Follow Up',
      })),
    ]
      .filter((a) => {
        const snoozeKey = `${a.type}:${a.entity_id}`;
        const expiresAt = snoozeMap?.[snoozeKey];
        if (!expiresAt) return true;
        const expiresTs = Date.parse(expiresAt);
        return !Number.isFinite(expiresTs) || expiresTs <= nowTs;
      })
      .sort((a, b) => (a.rank - b.rank) || ((b.age_days || 0) - (a.age_days || 0)))
      .slice(0, 7)
      .map(({ rank, ...rest }) => rest);

    res.json({ success: true, data: actions });
  } catch (error) {
    logger.error('Error fetching my-day priority actions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch priority actions' });
  }
});

// POST /my-day/priority-actions/:id/snooze — snooze one priority action for 24h
router.post('/my-day/priority-actions/:id/snooze', authenticate, async (req, res) => {
  try {
    const entityId = String(req.params.id || '').trim();
    const type = String(req.body?.type || '').trim();

    if (!entityId) {
      return res.status(400).json({ success: false, error: 'Invalid priority action id' });
    }
    if (!type) {
      return res.status(400).json({ success: false, error: 'type is required' });
    }

    const prefRes = await authPool.query(
      `SELECT theme_settings
       FROM user_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (!prefRes.rows.length) {
      await authPool.query(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [req.user.id]);
    }

    const currentSettings = prefRes.rows[0]?.theme_settings || {};
    const existingSnooze = (currentSettings && typeof currentSettings === 'object' && currentSettings.my_day_priority_snooze)
      ? currentSettings.my_day_priority_snooze
      : {};

    const snoozeKey = `${type}:${entityId}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const updatedSnooze = { ...existingSnooze, [snoozeKey]: expiresAt };
    const mergedSettings = {
      ...(currentSettings && typeof currentSettings === 'object' ? currentSettings : {}),
      my_day_priority_snooze: updatedSnooze,
    };

    await authPool.query(
      `UPDATE user_preferences
       SET theme_settings = $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(mergedSettings), req.user.id]
    );

    res.json({
      success: true,
      data: {
        key: snoozeKey,
        expires_at: expiresAt,
      },
    });
  } catch (error) {
    logger.error('Error snoozing my-day priority action:', error);
    res.status(500).json({ success: false, error: 'Failed to snooze priority action' });
  }
});

// GET /my-day/customer-health — AI-driven transaction-pattern analysis
router.get('/my-day/customer-health', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const repGroupId = rep.groupId || null;
    const repNameLike = `%${rep.firstName || ''}%`;
    const repGroupNameLike = `%${rep.groupName || rep.firstName || ''}%`;
    const exactGroupName = rep.groupName || rep.firstName || '';
    const country = req.query.country || null;

    // ── Step 1: Get all rep's customers with their core info ──────────
    const custResult = await pool.query(
      `SELECT
         cu.customer_id    AS id,
         cu.display_name   AS customer_name,
         cu.normalized_name,
         cu.primary_country AS country,
         cu.total_amount_all_time,
         COALESCE(d.open_deal_count, 0)::int AS open_deal_count,
         COALESCE(d.open_deal_value, 0)      AS open_deal_value
       FROM fp_customer_unified cu
       LEFT JOIN (
         SELECT d.customer_id,
                COUNT(*)           FILTER (WHERE d.stage NOT IN ('won','lost','confirmed')) AS open_deal_count,
                COALESCE(SUM(d.estimated_value) FILTER (WHERE d.stage NOT IN ('won','lost','confirmed')), 0) AS open_deal_value
         FROM crm_deals d WHERE d.customer_id IS NOT NULL GROUP BY d.customer_id
       ) d ON d.customer_id = cu.customer_id
       WHERE cu.is_merged = false
         AND cu.is_active = true
         AND ($5::text IS NULL OR UPPER(TRIM(cu.primary_country)) = UPPER(TRIM($5)))
         AND (
           ($1::integer IS NOT NULL AND cu.sales_rep_group_id = $1)
           OR cu.primary_sales_rep_name ILIKE $2
           OR cu.sales_rep_group_name ILIKE $3
           OR TRIM(UPPER(cu.sales_rep_group_name)) = TRIM(UPPER($4))
         )`,
      [repGroupId, repNameLike, repGroupNameLike, exactGroupName, country]
    );

    if (custResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // ── Step 2: Get monthly transaction history for these customers ───
    const normNames = custResult.rows.map(r => r.normalized_name).filter(Boolean);
    const txnResult = await pool.query(
      `SELECT
         UPPER(TRIM(customer_name)) AS norm_name,
         year,
         month_no,
         SUM(amount)  AS monthly_amount,
         SUM(qty_kgs) AS monthly_kgs,
         COUNT(*)     AS line_count
       FROM fp_actualcommon
       WHERE UPPER(TRIM(customer_name)) = ANY($1)
         AND year >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 2
       GROUP BY UPPER(TRIM(customer_name)), year, month_no
       ORDER BY norm_name, year, month_no`,
      [normNames]
    );

    // ── Step 3: AI analysis per customer ──────────────────────────────
    const txnByCustomer = {};
    for (const row of txnResult.rows) {
      if (!txnByCustomer[row.norm_name]) txnByCustomer[row.norm_name] = [];
      txnByCustomer[row.norm_name].push(row);
    }

    const nowYear = new Date().getFullYear();
    const nowMonth = new Date().getMonth() + 1;
    const toMonthIndex = (y, m) => y * 12 + m;
    const currentMonthIdx = toMonthIndex(nowYear, nowMonth);

    const analyzed = custResult.rows.map((cust) => {
      const txns = txnByCustomer[cust.normalized_name] || [];

      // No transaction history at all → unknown pattern
      if (txns.length === 0) {
        return {
          ...cust,
          risk_score: 50,
          risk_level: 'unknown',
          insight: 'No transaction history found',
          avg_cycle_months: null,
          months_overdue: null,
          last_order_month: null,
          last_order_amount: null,
          trend: 'none',
          monthly_avg_revenue: 0,
        };
      }

      // Sort chronologically
      txns.sort((a, b) => toMonthIndex(a.year, a.month_no) - toMonthIndex(b.year, b.month_no));

      const lastTxn = txns[txns.length - 1];
      const lastTxnMonthIdx = toMonthIndex(lastTxn.year, lastTxn.month_no);
      const monthsSinceLastOrder = currentMonthIdx - lastTxnMonthIdx;

      // Calculate average cycle: spread of active months
      const activeMonthIndices = txns.map(t => toMonthIndex(t.year, t.month_no));
      const firstIdx = activeMonthIndices[0];
      const lastIdx = activeMonthIndices[activeMonthIndices.length - 1];
      const spanMonths = lastIdx - firstIdx + 1;

      // Average cycle = total span / number of order months
      // e.g. 12-month span with 6 order months → avg cycle is ~2 months
      const avgCycleMonths = txns.length > 1
        ? Math.max(1, Math.round(spanMonths / txns.length))
        : 2; // default 2 months when only 1 transaction

      // How many months overdue beyond their normal cycle
      const expectedNextMonth = avgCycleMonths;
      const monthsOverdue = Math.max(0, monthsSinceLastOrder - expectedNextMonth);

      // Revenue trend: compare recent 6 months avg vs prior 6 months avg
      const recentCutoff = currentMonthIdx - 6;
      const priorCutoff = currentMonthIdx - 12;
      const recentTxns = txns.filter(t => toMonthIndex(t.year, t.month_no) > recentCutoff);
      const priorTxns = txns.filter(t => {
        const idx = toMonthIndex(t.year, t.month_no);
        return idx > priorCutoff && idx <= recentCutoff;
      });
      const recentAvg = recentTxns.length > 0
        ? recentTxns.reduce((s, t) => s + Number(t.monthly_amount || 0), 0) / 6
        : 0;
      const priorAvg = priorTxns.length > 0
        ? priorTxns.reduce((s, t) => s + Number(t.monthly_amount || 0), 0) / 6
        : 0;

      let trend = 'stable';
      if (priorAvg > 0) {
        const change = (recentAvg - priorAvg) / priorAvg;
        if (change < -0.25) trend = 'declining';
        else if (change > 0.25) trend = 'growing';
      } else if (recentAvg > 0) {
        trend = 'growing';
      }

      // Monthly average revenue (over active months)
      const totalRevenue = txns.reduce((s, t) => s + Number(t.monthly_amount || 0), 0);
      const monthlyAvgRevenue = spanMonths > 0 ? totalRevenue / spanMonths : 0;

      // ── Risk scoring (0-100, higher = more at risk) ──
      let riskScore = 0;

      // Factor 1: Months overdue vs cycle (0-40 pts)
      if (monthsOverdue > 0) {
        riskScore += Math.min(40, monthsOverdue * (40 / Math.max(avgCycleMonths, 1)));
      }

      // Factor 2: Revenue trend (0-25 pts)
      if (trend === 'declining') riskScore += 25;
      else if (trend === 'stable') riskScore += 5;

      // Factor 3: Time since last order relative to history (0-20 pts)
      if (monthsSinceLastOrder >= 6) riskScore += 20;
      else if (monthsSinceLastOrder >= 3) riskScore += 10;

      // Factor 4: Revenue significance (0-15 pts) — higher-value customers get more urgency
      if (monthlyAvgRevenue > 50000) riskScore += 15;
      else if (monthlyAvgRevenue > 20000) riskScore += 10;
      else if (monthlyAvgRevenue > 5000) riskScore += 5;

      riskScore = Math.min(100, Math.round(riskScore));

      // Risk level
      let riskLevel;
      if (riskScore >= 60) riskLevel = 'critical';
      else if (riskScore >= 35) riskLevel = 'at_risk';
      else if (riskScore >= 15) riskLevel = 'watch';
      else riskLevel = 'healthy';

      // Human-readable insight
      let insight;
      if (monthsOverdue > 0) {
        insight = `Usually orders every ~${avgCycleMonths} mo — ${monthsOverdue} mo overdue`;
      } else if (trend === 'declining') {
        insight = `Orders on cycle but revenue declining ${Math.round(((priorAvg - recentAvg) / priorAvg) * 100)}%`;
      } else if (monthsSinceLastOrder === 0) {
        insight = 'Ordered this month — on track';
      } else {
        insight = `Last order ${monthsSinceLastOrder} mo ago — next expected within ${Math.max(0, expectedNextMonth - monthsSinceLastOrder)} mo`;
      }

      return {
        id: cust.id,
        customer_name: cust.customer_name,
        country: cust.country,
        open_deal_count: cust.open_deal_count,
        open_deal_value: cust.open_deal_value,
        risk_score: riskScore,
        risk_level: riskLevel,
        insight,
        avg_cycle_months: avgCycleMonths,
        months_overdue: monthsOverdue,
        months_since_last_order: monthsSinceLastOrder,
        last_order_month: `${lastTxn.year}-${String(lastTxn.month_no).padStart(2, '0')}`,
        last_order_amount: Number(lastTxn.monthly_amount || 0),
        trend,
        monthly_avg_revenue: Math.round(monthlyAvgRevenue),
      };
    });

    // Sort: critical first, then by risk score descending, then by revenue (high-value first)
    analyzed.sort((a, b) => {
      if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
      return (b.monthly_avg_revenue || 0) - (a.monthly_avg_revenue || 0);
    });

    // Filter: only show customers that are at_risk, critical, or watch (skip healthy ones)
    // But always return at least some if all are healthy
    let filtered = analyzed.filter(c => c.risk_level !== 'healthy');
    if (filtered.length === 0) filtered = analyzed.slice(0, 5);

    res.json({ success: true, data: filtered.slice(0, 20) });
  } catch (error) {
    logger.error('Error fetching my-day customer health:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer health' });
  }
});

// GET /my-day/notifications — thin wrapper around core notifications service
router.get('/my-day/notifications', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const result = await getNotifications(req.user.id, {
      page: 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 6, 20),
      unreadOnly: req.query.unreadOnly,
    });

    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error('Error fetching my-day notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch my-day notifications' });
  }
});

// PATCH /my-day/notifications/:id/read
router.patch('/my-day/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid notification id' });
    }

    const row = await markAsRead(id, req.user.id);
    if (!row) return res.status(404).json({ success: false, error: 'Notification not found' });

    res.json({ success: true, data: row });
  } catch (error) {
    logger.error('Error marking my-day notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

// GET /my-day/lookahead — next N days of meetings/deal closes/urgent tasks
router.get('/my-day/lookahead', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 3, 1), 7);

    const [meetingsRes, dealsRes, tasksRes] = await Promise.all([
      pool.query(
        `SELECT
           'meeting'::text AS item_type,
           m.id AS entity_id,
           m.name AS title,
           m.date_start::date AS event_date,
           COALESCE(cu.display_name, fp.customer_name) AS subtitle
         FROM crm_meetings m
         LEFT JOIN fp_customer_unified cu ON cu.customer_id = m.customer_id
         LEFT JOIN fp_prospects fp ON fp.id = m.prospect_id
         WHERE m.assigned_to_id = $1
           AND DATE(m.date_start) >= CURRENT_DATE
           AND DATE(m.date_start) <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
         ORDER BY m.date_start ASC
         LIMIT 12`,
        [req.user.id, days]
      ),
      pool.query(
        `SELECT
           'deal'::text AS item_type,
           d.id AS entity_id,
           d.title,
           d.expected_close_date::date AS event_date,
           COALESCE(cu.display_name, fp.customer_name) AS subtitle
         FROM crm_deals d
         LEFT JOIN fp_customer_unified cu ON cu.customer_id = d.customer_id
         LEFT JOIN fp_prospects fp ON fp.id = d.prospect_id
         WHERE d.assigned_rep_id = $1
           AND d.stage NOT IN ('won', 'lost', 'confirmed')
           AND d.expected_close_date IS NOT NULL
           AND d.expected_close_date >= CURRENT_DATE
           AND d.expected_close_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
         ORDER BY d.expected_close_date ASC
         LIMIT 12`,
        [req.user.id, days]
      ),
      pool.query(
        `SELECT
           'task'::text AS item_type,
           t.id AS entity_id,
           t.title,
           t.due_date::date AS event_date,
           COALESCE(cu.display_name, fp.customer_name) AS subtitle
         FROM crm_tasks t
         LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
         LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
         WHERE t.assignee_id = $1
           AND t.status != 'completed'
           AND t.due_date >= CURRENT_DATE
           AND t.due_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
         ORDER BY t.due_date ASC
         LIMIT 12`,
        [req.user.id, days]
      ),
    ]);

    const merged = [
      ...meetingsRes.rows,
      ...dealsRes.rows,
      ...tasksRes.rows,
    ]
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
      .slice(0, 15);

    res.json({ success: true, data: merged });
  } catch (error) {
    logger.error('Error fetching my-day lookahead:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lookahead' });
  }
});

// GET /my-day/email-summary — email activity snapshot for My Day
router.get('/my-day/email-summary', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const [emailsTableRes, draftsTableRes, outlookTableRes] = await Promise.all([
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'crm_emails'
         ) AS ok`
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'crm_email_drafts'
         ) AS ok`
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'crm_outlook_connections'
         ) AS ok`
      ),
    ]);

    const hasEmails = !!emailsTableRes.rows[0]?.ok;
    const hasDrafts = !!draftsTableRes.rows[0]?.ok;
    const hasOutlook = !!outlookTableRes.rows[0]?.ok;

    let unreadFromCustomers = 0;
    let awaitingReply = 0;
    let emailsToday = 0;
    let draftsDueToday = 0;
    let outlookConnected = false;
    let topUnread = [];

    if (hasEmails) {
      const [unreadRes, waitingRes, todayRes, topUnreadRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM crm_emails
           WHERE rep_user_id = $1
             AND direction = 'inbound'
             AND is_read = false`,
          [req.user.id]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM crm_emails
           WHERE rep_user_id = $1
             AND direction = 'outbound'
             AND crm_status IN ('captured', 'pending_reply')
             AND COALESCE(sent_at, created_at) < NOW() - INTERVAL '48 hours'`,
          [req.user.id]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM crm_emails
           WHERE rep_user_id = $1
             AND DATE(COALESCE(received_at, sent_at, created_at)) = CURRENT_DATE`,
          [req.user.id]
        ),
        pool.query(
          `SELECT id,
                  subject,
                  from_email,
                  EXTRACT(HOUR FROM (NOW() - COALESCE(received_at, created_at)))::int AS age_hours
           FROM crm_emails
           WHERE rep_user_id = $1
             AND direction = 'inbound'
             AND is_read = false
             AND is_hidden = false
           ORDER BY COALESCE(received_at, created_at) ASC
           LIMIT 3`,
          [req.user.id]
        ),
      ]);

      unreadFromCustomers = parseInt(unreadRes.rows[0]?.cnt || 0, 10);
      awaitingReply = parseInt(waitingRes.rows[0]?.cnt || 0, 10);
      emailsToday = parseInt(todayRes.rows[0]?.cnt || 0, 10);
      topUnread = topUnreadRes.rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        from_email: r.from_email,
        age_hours: parseInt(r.age_hours || 0, 10),
      }));
    }

    if (hasDrafts) {
      const draftsRes = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_email_drafts
         WHERE rep_id = $1
           AND status = 'pending'
           AND due_by = CURRENT_DATE`,
        [req.user.id]
      );
      draftsDueToday = parseInt(draftsRes.rows[0]?.cnt || 0, 10);
    }

    if (hasOutlook) {
      const connRes = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM crm_outlook_connections
         WHERE user_id = $1 AND connection_status = 'active'`,
        [req.user.id]
      );
      outlookConnected = parseInt(connRes.rows[0]?.cnt || 0, 10) > 0;
    }

    res.json({
      success: true,
      data: {
        unreadFromCustomers,
        awaitingReply,
        emailsToday,
        draftsDueToday,
        topUnread,
        outlookConnected,
        emailIntegrationReady: hasEmails && hasDrafts,
      },
    });
  } catch (error) {
    logger.error('Error fetching my-day email summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email summary' });
  }
});

// GET /my-day/inquiries — inquiries awaiting action for the logged-in rep
router.get('/my-day/inquiries', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const result = await pool.query(
      `SELECT i.id, i.inquiry_number, i.inquiry_stage, i.status, i.customer_name,
              i.created_at, i.updated_at
       FROM mes_presales_inquiries i
       WHERE i.sales_rep_group_id = $1
         AND i.status IN ('quoted', 'sample_approved', 'price_accepted')
       ORDER BY i.updated_at DESC
       LIMIT 20`,
      [rep.groupId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching my-day inquiries:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inquiries' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /dashboard/pipeline — Full Pipeline Dashboard (Management Only)
//   Returns funnel_counts, avg_cycle_times, stalled_items, revenue_forecast
//   Optional ?phase=X for drill-down
// ═════════════════════════════════════════════════════════════════════════════
router.get('/dashboard/pipeline', authenticate, async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Management access required' });
    }

    const { phase } = req.query;

    // ── Drill-down mode: return individual inquiries for a phase ──
    if (phase) {
      const stageMap = {
        prospecting:    ['new', 'sar_pending'],
        qualification:  ['sent_to_qc', 'qc_in_progress', 'qc_received', 'cse_pending', 'cse_approved'],
        clearance:      ['presales_cleared', 'moq_check', 'material_check'],
        quotation:      ['estimation', 'quoted', 'negotiation'],
        order:          ['price_accepted', 'proforma_sent', 'proforma_confirmed', 'order_confirmed'],
        production:     ['in_production', 'ready_dispatch', 'delivered', 'closed'],
      };
      const stages = stageMap[phase];
      if (!stages) {
        return res.status(400).json({ success: false, error: `Invalid phase: ${phase}. Valid: ${Object.keys(stageMap).join(', ')}` });
      }
      const placeholders = stages.map((_, i) => `$${i + 1}`).join(',');
      const drillRes = await pool.query(
        `SELECT i.id, i.inquiry_number, i.inquiry_stage, i.status, i.customer_name,
                i.customer_country, i.created_at, i.stage_changed_at,
                EXTRACT(DAY FROM (NOW() - COALESCE(i.stage_changed_at, i.updated_at)))::int AS days_in_stage,
                srg.group_name AS sales_rep
         FROM mes_presales_inquiries i
         LEFT JOIN sales_rep_groups srg ON srg.id = i.sales_rep_group_id
         WHERE i.inquiry_stage IN (${placeholders})
           AND i.status != 'deleted'
         ORDER BY i.stage_changed_at ASC NULLS FIRST`,
        stages
      );
      return res.json({ success: true, phase, data: drillRes.rows });
    }

    // ── Full dashboard mode ──
    // 1. Funnel counts — 6 pipeline phases mapped from inquiry_stage
    const funnelRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE inquiry_stage IN ('new','sar_pending'))                                                      AS prospecting,
         COUNT(*) FILTER (WHERE inquiry_stage IN ('sent_to_qc','qc_in_progress','qc_received','cse_pending','cse_approved')) AS qualification,
         COUNT(*) FILTER (WHERE inquiry_stage IN ('presales_cleared','moq_check','material_check'))                          AS clearance,
         COUNT(*) FILTER (WHERE inquiry_stage IN ('estimation','quoted','negotiation'))                                      AS quotation,
         COUNT(*) FILTER (WHERE inquiry_stage IN ('price_accepted','proforma_sent','proforma_confirmed','order_confirmed'))  AS "order",
         COUNT(*) FILTER (WHERE inquiry_stage IN ('in_production','ready_dispatch','delivered','closed'))                     AS production
       FROM mes_presales_inquiries
       WHERE status != 'deleted'`
    );
    const funnel_counts = funnelRes.rows[0] || {};
    // Convert string counts to integers
    Object.keys(funnel_counts).forEach(k => { funnel_counts[k] = parseInt(funnel_counts[k]) || 0; });

    // 2. Average cycle times (days between stage_changed_at and NOW) for active stages
    const cycleRes = await pool.query(
      `SELECT inquiry_stage,
              ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(stage_changed_at, updated_at))) / 86400)::numeric, 1) AS avg_days,
              COUNT(*) AS count
       FROM mes_presales_inquiries
       WHERE status != 'deleted' AND inquiry_stage NOT IN ('closed','delivered')
       GROUP BY inquiry_stage
       ORDER BY avg_days DESC`
    );
    const avg_cycle_times = cycleRes.rows.map(r => ({
      stage: r.inquiry_stage,
      avg_days: parseFloat(r.avg_days) || 0,
      count: parseInt(r.count) || 0,
    }));

    // 3. Stalled items (stage_changed_at > 7 days ago, not closed/delivered)
    const stalledRes = await pool.query(
      `SELECT i.id, i.inquiry_number, i.inquiry_stage, i.customer_name,
              i.stage_changed_at, i.updated_at,
              EXTRACT(DAY FROM (NOW() - COALESCE(i.stage_changed_at, i.updated_at)))::int AS days_in_stage,
              srg.group_name AS sales_rep
       FROM mes_presales_inquiries i
       LEFT JOIN sales_rep_groups srg ON srg.id = i.sales_rep_group_id
       WHERE i.status != 'deleted'
         AND i.inquiry_stage NOT IN ('closed', 'delivered')
         AND COALESCE(i.stage_changed_at, i.updated_at) < NOW() - INTERVAL '7 days'
       ORDER BY days_in_stage DESC
       LIMIT 50`
    );
    const stalled_items = stalledRes.rows;

    // 4. Revenue forecast: SUM of quotation total_price for inquiries at order_confirmed+
    const revenueRes = await pool.query(
      `SELECT
         COALESCE(SUM(q.total_price) FILTER (WHERE i.inquiry_stage = 'order_confirmed'), 0) AS confirmed_revenue,
         COALESCE(SUM(q.total_price) FILTER (WHERE i.inquiry_stage IN ('in_production','ready_dispatch')), 0) AS in_production_revenue,
         COALESCE(SUM(q.total_price) FILTER (WHERE i.inquiry_stage = 'delivered'), 0) AS delivered_revenue,
         COALESCE(SUM(q.total_price) FILTER (WHERE i.inquiry_stage = 'closed'), 0) AS closed_revenue,
         COALESCE(SUM(q.total_price) FILTER (WHERE i.inquiry_stage IN ('price_accepted','proforma_sent','proforma_confirmed')), 0) AS pipeline_revenue,
         COUNT(DISTINCT i.id) FILTER (WHERE i.inquiry_stage IN ('order_confirmed','in_production','ready_dispatch','delivered','closed')) AS won_count
       FROM mes_presales_inquiries i
       LEFT JOIN mes_quotations q ON q.inquiry_id = i.id AND q.status IN ('accepted','approved','sent')
       WHERE i.status != 'deleted'`
    );
    const rev = revenueRes.rows[0] || {};
    const revenue_forecast = {
      confirmed: parseFloat(rev.confirmed_revenue) || 0,
      in_production: parseFloat(rev.in_production_revenue) || 0,
      delivered: parseFloat(rev.delivered_revenue) || 0,
      closed: parseFloat(rev.closed_revenue) || 0,
      pipeline: parseFloat(rev.pipeline_revenue) || 0,
      won_count: parseInt(rev.won_count) || 0,
      total: (parseFloat(rev.confirmed_revenue) || 0) + (parseFloat(rev.in_production_revenue) || 0) +
             (parseFloat(rev.delivered_revenue) || 0) + (parseFloat(rev.closed_revenue) || 0),
    };

    // 5. Total active inquiries + conversion rate
    const totalRes = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE inquiry_stage IN ('order_confirmed','in_production','ready_dispatch','delivered','closed')) AS converted
       FROM mes_presales_inquiries
       WHERE status != 'deleted'`
    );
    const total = parseInt(totalRes.rows[0]?.total) || 0;
    const converted = parseInt(totalRes.rows[0]?.converted) || 0;
    const conversion_rate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;

    res.json({
      success: true,
      data: {
        funnel_counts,
        avg_cycle_times,
        stalled_items,
        revenue_forecast,
        summary: { total_inquiries: total, converted, conversion_rate },
      },
    });
  } catch (error) {
    logger.error('Error fetching pipeline dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pipeline dashboard' });
  }
});

module.exports = router;
