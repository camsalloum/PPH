require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { pool, authPool } = require('../../database/config');

function mintToken(userId, role = 'sales_rep') {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign(
    { userId, email: `smoke_${userId}@local.test`, role, divisions: ['FP'], type: 'access' },
    secret,
    { expiresIn: '1h' }
  );
}

async function relationExists(dbPool, relationName) {
  const result = await dbPool.query('SELECT to_regclass($1) AS reg', [relationName]);
  return Boolean(result.rows[0]?.reg);
}

async function pickUsers() {
  let repRes = await authPool.query(
    `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
       FROM users
      WHERE role = 'sales_rep' AND is_active = true
      ORDER BY id ASC
      LIMIT 1`
  );
  if (!repRes.rows.length) {
    repRes = await authPool.query(
      `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
         FROM users
        WHERE is_active = true
          AND role <> 'admin'
        ORDER BY id ASC
        LIMIT 1`
    );
  }
  if (!repRes.rows.length) {
    repRes = await authPool.query(
      `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
         FROM users
        WHERE is_active = true
        ORDER BY id ASC
        LIMIT 1`
    );
  }
  if (!repRes.rows.length) throw new Error('No active users found in auth.users');

  const mgrRes = await authPool.query(
    `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
       FROM users
      WHERE role = ANY($1)
        AND is_active = true
      ORDER BY id ASC`,
    [['admin', 'manager', 'sales_manager', 'sales_coordinator']]
  );
  const manager =
    mgrRes.rows.find((m) => m.role === 'admin' && m.id !== repRes.rows[0].id) ||
    mgrRes.rows.find((m) => m.id !== repRes.rows[0].id);
  if (!manager) throw new Error('No manager-capable user found');

  return { rep: repRes.rows[0], manager };
}

async function ensureManagerAccess(rep, manager) {
  const hasMap = await relationExists(authPool, 'user_sales_rep_access');
  if (!hasMap) return { used: false, cleanup: null };

  const salesRepName = rep.display_name || rep.email;
  await authPool.query(
    `INSERT INTO user_sales_rep_access (manager_id, sales_rep_name, division)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [manager.id, salesRepName, '']
  );

  return {
    used: true,
    cleanup: async () => {
      await authPool.query(
        `DELETE FROM user_sales_rep_access
          WHERE manager_id = $1
            AND sales_rep_name = $2
            AND COALESCE(division, '') = COALESCE($3, '')`,
        [manager.id, salesRepName, '']
      ).catch(() => {});
    },
  };
}

(async () => {
  const baseURL = process.env.SMOKE_API_BASE || 'http://localhost:3001';
  const api = axios.create({ baseURL, timeout: 30000 });

  const runId = Date.now();
  const tripTitle = `SMOKE_ADV_SETTLE_${runId}`;

  const results = [];
  let tripId = null;
  let accessCleanup = null;

  const record = (step, ok, detail) => {
    results.push({ step, ok, detail });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} -> ${detail}`);
  };

  const call = async (method, url, token, data) => {
    try {
      const response = await api.request({ method, url, data, headers: { Authorization: `Bearer ${token}` } });
      return { ok: true, status: response.status, data: response.data };
    } catch (err) {
      return {
        ok: false,
        status: err?.response?.status || 0,
        data: err?.response?.data || { error: err.message },
      };
    }
  };

  const detailWithError = (res, extra = '') => {
    const err = res?.data?.error || res?.data?.message || '';
    const suffix = err ? ` error=${String(err)}` : '';
    return `${extra}status=${res?.status || 'n/a'}${suffix}`.trim();
  };

  try {
    const { rep, manager } = await pickUsers();
    const repToken = mintToken(rep.id, 'sales_rep');
    const managerToken = mintToken(manager.id, manager.role);

    const access = await ensureManagerAccess(rep, manager);
    accessCleanup = access.cleanup;

    const dep = new Date().toISOString().split('T')[0];
    const ret = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    const createRes = await call('post', '/api/crm/field-trips', repToken, {
      title: tripTitle,
      country: 'United Arab Emirates',
      departure_date: dep,
      return_date: ret,
      status: 'planning',
      trip_type: 'local',
      transport_mode: 'car',
      budget_estimate: 1200,
    });

    tripId = createRes.data?.data?.id || null;
    record('Create trip (planning)', createRes.status === 201, `status=${createRes.status} tripId=${tripId || 'n/a'}`);
    if (!tripId) throw new Error('Trip creation failed');

    const submitRes = await call('post', `/api/crm/field-trips/${tripId}/submit-approval`, repToken, {
      advance_amount: 1000,
      advance_currency: 'AED',
      advance_notes: 'smoke request',
    });
    record('Submit approval + advance request', submitRes.status === 200 && submitRes.data?.data?.status === 'pending_approval', detailWithError(submitRes, `state=${submitRes.data?.data?.status || 'n/a'} `));

    const approveRes = await call('patch', `/api/crm/field-trips/${tripId}/review-approval`, managerToken, {
      decision: 'approved',
      approved_advance_amount: 950,
      approved_advance_currency: 'AED',
      comments: 'ok',
    });
    record('Manager approves trip + advance', approveRes.status === 200 && approveRes.data?.data?.status === 'confirmed', detailWithError(approveRes, `trip=${approveRes.data?.data?.status || 'n/a'} `));

    const disburseRes = await call('post', `/api/crm/field-trips/${tripId}/advance-disburse`, managerToken, {
      disbursed_amount: 950,
      disbursed_currency: 'AED',
      payment_reference: `SMK-${runId}`,
    });
    record('Advance disbursement', disburseRes.status === 200 && disburseRes.data?.data?.advance_status === 'disbursed', detailWithError(disburseRes, `advance=${disburseRes.data?.data?.advance_status || 'n/a'} `));

    const startRes = await call('patch', `/api/crm/field-trips/${tripId}`, repToken, { status: 'in_progress' });
    record('Start trip (in_progress)', startRes.status === 200 && startRes.data?.data?.status === 'in_progress', detailWithError(startRes, `trip=${startRes.data?.data?.status || 'n/a'} `));

    const expenseRes = await call('post', `/api/crm/field-trips/${tripId}/expenses`, repToken, {
      category: 'meals',
      description: 'smoke expense',
      amount: 220,
      currency: 'AED',
      expense_date: dep,
    });
    record('Add in-trip expense', expenseRes.status === 201, detailWithError(expenseRes));

    const settlementSubmitRes = await call('post', `/api/crm/field-trips/${tripId}/settlement`, repToken, {
      returned_amount: 100,
      returned_currency: 'AED',
      rep_notes: 'smoke settle',
      submit: true,
    });
    record('Submit settlement', settlementSubmitRes.status === 200 && settlementSubmitRes.data?.data?.status === 'submitted', detailWithError(settlementSubmitRes, `settlement=${settlementSubmitRes.data?.data?.status || 'n/a'} `));

    const reportSubmitRes = await call('post', `/api/crm/field-trips/${tripId}/travel-report`, repToken, {
      summary: 'smoke summary',
      key_outcomes: 'ok',
      challenges: 'none',
      recommendations: 'none',
      next_steps: 'none',
      submit: true,
    });
    record('Submit travel report', reportSubmitRes.status === 200 && reportSubmitRes.data?.data?.status === 'submitted', detailWithError(reportSubmitRes, `report=${reportSubmitRes.data?.data?.status || 'n/a'} `));

    const reportReviewRes = await call('patch', `/api/crm/field-trips/${tripId}/travel-report/review`, managerToken, {
      status: 'approved',
      manager_comments: 'approved in smoke',
    });
    record('Manager approves travel report', reportReviewRes.status === 200 && reportReviewRes.data?.data?.status === 'approved', detailWithError(reportReviewRes, `report=${reportReviewRes.data?.data?.status || 'n/a'} `));

    const settleReviewRes = await call('patch', `/api/crm/field-trips/${tripId}/settlement/review`, managerToken, {
      status: 'approved',
      manager_comments: 'approved in smoke',
    });
    record('Manager approves settlement', settleReviewRes.status === 200 && settleReviewRes.data?.data?.status === 'approved', detailWithError(settleReviewRes, `settlement=${settleReviewRes.data?.data?.status || 'n/a'} `));

    const finalTripRes = await call('get', `/api/crm/field-trips/${tripId}`, repToken);
    const finalStatus = finalTripRes.data?.data?.status;
    record('Trip auto-completes after both approvals', finalTripRes.status === 200 && finalStatus === 'completed', detailWithError(finalTripRes, `trip=${finalStatus || 'n/a'} `));

    console.log('\n=== SMOKE SUMMARY ===');
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('Smoke run failed with exception:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      if (tripId) {
        await pool.query('DELETE FROM crm_trip_adjustments WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_trip_expenses WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_travel_reports WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_trip_settlements WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_field_trip_stops WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_field_trip_legs WHERE trip_id = $1', [tripId]).catch(() => {});
        await pool.query('DELETE FROM crm_field_trips WHERE id = $1', [tripId]).catch(() => {});
      }
      if (accessCleanup) await accessCleanup();
    } catch (_) {}

    await pool.end().catch(() => {});
    await authPool.end().catch(() => {});
  }
})();
