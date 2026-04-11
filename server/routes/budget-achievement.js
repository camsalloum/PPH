/**
 * Budget Achievement Report Route
 *
 * POST /api/budget-achievement-report
 * Body: { division, salesRepGroup, year }
 *
 * Returns monthly Actual vs Budget breakdown for:
 *  - productGroups: aggregated by pgcombine (after item_group_overrides + product_group_exclusions)
 *  - customers:     aggregated by customer_name + country (same exclusion rules)
 *  - totals:        division-level roll-up
 *
 * Actual source : {division}_actualcommon  (uses item_group_overrides for correct pgcombine)
 * Budget source : {division}_budget_unified (budget_type = 'SALES_REP')
 * Both sources apply LEFT JOIN product_group_exclusions to strip excluded product groups.
 * 'SERVICES CHARGES' is always excluded.
 *
 * Sales rep resolution:
 *   - A group name (e.g. "Riad & Nidal") is expanded to its individual member names
 *     for the actualcommon query (where sales_rep_name = individual).
 *   - The budget query filters on sales_rep_group_name (where budget is saved with group name)
 *     and falls back to sales_rep_name so both patterns are covered.
 *   - '__ALL__' skips the sales-rep filter entirely.
 */

const express = require('express');
const router = express.Router();
const { getPoolForDivision, getTableNames } = require('./aebf/shared');
const salesRepGroupsService = require('../services/salesRepGroupsService');

const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (m) => m.toUpperCase());
};

/** Build an empty 12-month data object */
function buildMonths() {
  const months = {};
  for (let i = 1; i <= 12; i++) {
    months[i] = { actual_mt: 0, budget_mt: 0, actual_amount: 0, budget_amount: 0 };
  }
  return months;
}

/** Sum months 1-12 into a YTD/Total object */
function sumMonths(months) {
  const ytd = { actual_mt: 0, budget_mt: 0, actual_amount: 0, budget_amount: 0 };
  for (let i = 1; i <= 12; i++) {
    ytd.actual_mt    += months[i].actual_mt;
    ytd.budget_mt    += months[i].budget_mt;
    ytd.actual_amount += months[i].actual_amount;
    ytd.budget_amount += months[i].budget_amount;
  }
  return ytd;
}

router.post('/budget-achievement-report', async (req, res) => {
  try {
    const { division, salesRepGroup, year } = req.body;

    if (!division || !year) {
      return res.status(400).json({ success: false, message: 'division and year are required' });
    }

    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const budgetYear = parseInt(year, 10);

    // ----------------------------------------------------------------
    // Resolve sales rep filters (group + member aware)
    // ----------------------------------------------------------------
    const isAll = !salesRepGroup || salesRepGroup === '__ALL__';
    let groupFilters = [];   // normalized group names
    let memberFilters = [];  // normalized individual member names

    if (!isAll) {
      // Ensure the cache is warm (first call after server start may be cold)
      await salesRepGroupsService.getConfig();

      const selected = salesRepGroup.toString().trim().toUpperCase();
      const isGroup = salesRepGroupsService.isSalesRepGroupSync(division, salesRepGroup);

      if (isGroup) {
        const members = salesRepGroupsService.getGroupMembersSync(division, salesRepGroup) || [];
        groupFilters = [selected];
        memberFilters = members.map(m => m.toString().trim().toUpperCase()).filter(Boolean);
      } else {
        const config = salesRepGroupsService.getConfigSync() || {};
        const divisionGroups = config[division?.toUpperCase()]?.groups || {};

        const parentGroups = Object.entries(divisionGroups)
          .filter(([, members]) => Array.isArray(members) && members.some(m => m && m.toString().trim().toUpperCase() === selected))
          .map(([groupName]) => groupName.toString().trim().toUpperCase());

        groupFilters = [...new Set(parentGroups)];
        memberFilters = [selected];
      }
    }

    // ----------------------------------------------------------------
    // SQL fragments
    // ----------------------------------------------------------------
    // Extra condition appended ONLY when filtering on a specific sales rep / group
    // Compare against both group + individual columns to match dashboard/report behavior.
    const actualRepCond  = isAll
      ? ''
      : `AND (
            TRIM(UPPER(COALESCE(d.sales_rep_group_name, ''))) = ANY($3::text[])
            OR TRIM(UPPER(COALESCE(d.sales_rep_name, '')))    = ANY($4::text[])
         )`;
    const budgetRepCond  = isAll
      ? ''
      : `AND (
            TRIM(UPPER(COALESCE(b.sales_rep_group_name, ''))) = ANY($3::text[])
            OR TRIM(UPPER(COALESCE(b.sales_rep_name, '')))    = ANY($4::text[])
         )`;

    const actualParams = isAll ? [division, budgetYear] : [division, budgetYear, groupFilters, memberFilters];
    const budgetParams = isAll ? [division, budgetYear] : [division, budgetYear, groupFilters, memberFilters];

    // ----------------------------------------------------------------
    // Actual: By Product Group (monthly)
    // Mirrors the pattern used in html-budget.js exactly
    // ----------------------------------------------------------------
    const actualPGQuery = `
      SELECT
        COALESCE(igo.pg_combine, d.pgcombine) AS pg,
        d.month_no                             AS month,
        SUM(d.qty_kgs)  / 1000.0              AS mt,
        SUM(d.amount)                          AS amount
      FROM   ${tables.actualcommon} d
      LEFT JOIN ${tables.itemGroupOverrides} igo
             ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
      LEFT JOIN ${tables.productGroupExclusions} e
             ON UPPER(TRIM(COALESCE(igo.pg_combine, d.pgcombine))) = UPPER(TRIM(e.product_group))
            AND UPPER(e.division_code) = UPPER($1)
      WHERE  UPPER(d.admin_division_code) = UPPER($1)
        AND  d.year = $2
        ${actualRepCond}
        AND  d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
        AND  UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
        AND  e.product_group IS NULL
      GROUP BY COALESCE(igo.pg_combine, d.pgcombine), d.month_no
    `;

    // ----------------------------------------------------------------
    // Actual: By Customer (monthly)
    // ----------------------------------------------------------------
    const actualCustQuery = `
      SELECT
        TRIM(d.customer_name)                  AS customer,
        TRIM(d.country)                        AS country,
        COALESCE(igo.pg_combine, d.pgcombine) AS pg,
        d.month_no                             AS month,
        SUM(d.qty_kgs)  / 1000.0              AS mt,
        SUM(d.amount)                          AS amount
      FROM   ${tables.actualcommon} d
      LEFT JOIN ${tables.itemGroupOverrides} igo
             ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
      LEFT JOIN ${tables.productGroupExclusions} e
             ON UPPER(TRIM(COALESCE(igo.pg_combine, d.pgcombine))) = UPPER(TRIM(e.product_group))
            AND UPPER(e.division_code) = UPPER($1)
      WHERE  UPPER(d.admin_division_code) = UPPER($1)
        AND  d.year = $2
        ${actualRepCond}
        AND  d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
        AND  d.pgcombine IS NOT NULL     AND TRIM(d.pgcombine)     != ''
        AND  UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
        AND  e.product_group IS NULL
      GROUP BY TRIM(d.customer_name), TRIM(d.country),
               COALESCE(igo.pg_combine, d.pgcombine), d.month_no
    `;

    // ----------------------------------------------------------------
    // Budget: By Product Group (monthly)
    // Budget already has correct pgcombine; no need for item_group_overrides
    // ----------------------------------------------------------------
    const budgetPGQuery = `
      SELECT
        TRIM(b.pgcombine)  AS pg,
        b.month_no         AS month,
        SUM(b.qty_kgs) / 1000.0 AS mt,
        SUM(b.amount)      AS amount
      FROM   ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
             ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(e.division_code)   = UPPER($1)
      WHERE  UPPER(b.division_code) = UPPER($1)
        AND  b.budget_year = $2
        AND  UPPER(b.budget_type) = 'SALES_REP'
        ${budgetRepCond}
        AND  b.pgcombine IS NOT NULL AND TRIM(b.pgcombine) != ''
        AND  UPPER(TRIM(b.pgcombine)) != 'SERVICES CHARGES'
        AND  e.product_group IS NULL
      GROUP BY TRIM(b.pgcombine), b.month_no
    `;

    // ----------------------------------------------------------------
    // Budget: By Customer (monthly)
    // ----------------------------------------------------------------
    const budgetCustQuery = `
      SELECT
        TRIM(b.customer_name) AS customer,
        TRIM(b.country)       AS country,
        TRIM(b.pgcombine)     AS pg,
        b.month_no            AS month,
        SUM(b.qty_kgs) / 1000.0 AS mt,
        SUM(b.amount)         AS amount
      FROM   ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
             ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(e.division_code)   = UPPER($1)
      WHERE  UPPER(b.division_code) = UPPER($1)
        AND  b.budget_year = $2
        AND  UPPER(b.budget_type) = 'SALES_REP'
        ${budgetRepCond}
        AND  b.customer_name IS NOT NULL AND TRIM(b.customer_name) != ''
        AND  b.pgcombine IS NOT NULL     AND TRIM(b.pgcombine)     != ''
        AND  UPPER(TRIM(b.pgcombine)) != 'SERVICES CHARGES'
        AND  e.product_group IS NULL
      GROUP BY TRIM(b.customer_name), TRIM(b.country), TRIM(b.pgcombine), b.month_no
    `;

    // ----------------------------------------------------------------
    // Execute all 4 queries in parallel
    // ----------------------------------------------------------------
    const [aPG, aCust, bPG, bCust] = await Promise.all([
      divisionPool.query(actualPGQuery,  actualParams),
      divisionPool.query(actualCustQuery, actualParams),
      divisionPool.query(budgetPGQuery,  budgetParams),
      divisionPool.query(budgetCustQuery, budgetParams),
    ]);

    // ----------------------------------------------------------------
    // Assemble: Product Groups
    // ----------------------------------------------------------------
    const pgMap = {};

    aPG.rows.forEach(row => {
      const name = toProperCase(row.pg);
      if (!pgMap[name]) pgMap[name] = { name, months: buildMonths() };
      const m = parseInt(row.month, 10);
      if (m >= 1 && m <= 12) {
        pgMap[name].months[m].actual_mt     += parseFloat(row.mt)     || 0;
        pgMap[name].months[m].actual_amount += parseFloat(row.amount) || 0;
      }
    });

    bPG.rows.forEach(row => {
      const name = toProperCase(row.pg);
      if (!pgMap[name]) pgMap[name] = { name, months: buildMonths() };
      const m = parseInt(row.month, 10);
      if (m >= 1 && m <= 12) {
        pgMap[name].months[m].budget_mt     += parseFloat(row.mt)     || 0;
        pgMap[name].months[m].budget_amount += parseFloat(row.amount) || 0;
      }
    });

    const productGroups = Object.values(pgMap)
      .map(pg => ({ ...pg, total: sumMonths(pg.months) }))
      .sort((a, b) => {
        const aU = a.name.toUpperCase();
        const bU = b.name.toUpperCase();
        if (aU === 'OTHERS') return 1;
        if (bU === 'OTHERS') return -1;
        return aU.localeCompare(bU);
      });

    // ----------------------------------------------------------------
    // Assemble: Customers
    // ----------------------------------------------------------------
    const custMap = {};
    const custKey = (name, country) => `${name}|||${country}`;

    aCust.rows.forEach(row => {
      const name    = toProperCase(row.customer);
      const country = toProperCase(row.country);
      const key = custKey(name, country);
      if (!custMap[key]) custMap[key] = { name, country, months: buildMonths() };
      const m = parseInt(row.month, 10);
      if (m >= 1 && m <= 12) {
        custMap[key].months[m].actual_mt     += parseFloat(row.mt)     || 0;
        custMap[key].months[m].actual_amount += parseFloat(row.amount) || 0;
      }
    });

    bCust.rows.forEach(row => {
      const name    = toProperCase(row.customer);
      const country = toProperCase(row.country);
      const key = custKey(name, country);
      if (!custMap[key]) custMap[key] = { name, country, months: buildMonths() };
      const m = parseInt(row.month, 10);
      if (m >= 1 && m <= 12) {
        custMap[key].months[m].budget_mt     += parseFloat(row.mt)     || 0;
        custMap[key].months[m].budget_amount += parseFloat(row.amount) || 0;
      }
    });

    const customers = Object.values(custMap)
      .map(c => ({ ...c, total: sumMonths(c.months) }))
      // Sort descending by total actual MT
      .sort((a, b) => b.total.actual_mt - a.total.actual_mt);

    // ----------------------------------------------------------------
    // Assemble: Division-level totals (rolled up from product groups)
    // ----------------------------------------------------------------
    const totalsMonths = buildMonths();
    productGroups.forEach(pg => {
      for (let m = 1; m <= 12; m++) {
        totalsMonths[m].actual_mt     += pg.months[m].actual_mt;
        totalsMonths[m].budget_mt     += pg.months[m].budget_mt;
        totalsMonths[m].actual_amount += pg.months[m].actual_amount;
        totalsMonths[m].budget_amount += pg.months[m].budget_amount;
      }
    });

    res.json({
      success: true,
      data: {
        year: budgetYear,
        salesRepGroup: salesRepGroup || '__ALL__',
        productGroups,
        customers,
        totals: {
          months: totalsMonths,
          total: sumMonths(totalsMonths)
        }
      }
    });

  } catch (err) {
    console.error('[budget-achievement-report] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
