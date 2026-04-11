require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool, authPool } = require('../../database/config');
const { initializeApp } = require('../../config/express');

function mintToken(userId, role = 'sales_rep') {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign(
    { userId, email: `smoke_${userId}@local.test`, role, divisions: ['FP'], type: 'access' },
    secret,
    { expiresIn: '1h' }
  );
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function relationExists(dbPool, relationName) {
  const result = await dbPool.query('SELECT to_regclass($1) AS reg', [relationName]);
  return Boolean(result.rows[0]?.reg);
}

async function pickUsers() {
  const repRes = await authPool.query(
    `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
       FROM users
      WHERE role = 'sales_rep' AND is_active = true
      ORDER BY id ASC
      LIMIT 1`
  );
  if (!repRes.rows.length) throw new Error('No active sales_rep user found');

  const mgrRes = await authPool.query(
    `SELECT id, role, COALESCE(NULLIF(TRIM(name), ''), email) AS display_name, email
       FROM users
      WHERE role = ANY($1)
        AND is_active = true
      ORDER BY id ASC`,
    [['admin', 'manager', 'sales_manager', 'sales_coordinator']]
  );

  const manager = mgrRes.rows.find((m) => m.id !== repRes.rows[0].id);
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
  const app = initializeApp();
  const runId = Date.now();
  const tripTitle = `SMOKE_ADV_SETTLE_${runId}`;

  const results = [];
  let tripId = null;
  let accessCleanup = null;

  const record = (step, ok, detail) => {
    results.push({ step, ok, detail });
    const badge = ok ? 'PASS' : 'FAIL';
    console.log(`[${badge}] ${step} -> ${detail}`);
  };

  try {
    const { rep, manager } = await pickUsers();
    const repToken = mintToken(rep.id, 'sales_rep');
    const managerToken = mintToken(manager.id, manager.role);

    const access = await ensureManagerAccess(rep, manager);
    accessCleanup = access.cleanup;

    const dep = new Date().toISOString().split('T')[0];
    const ret = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    const createRes = await request(app)
      .post('/api/crm/field-trips')
      .set(authHeader(repToken))
      .send({
        title: tripTitle,
        country: 'United Arab Emirates',
        departure_date: dep,
        return_date: ret,
        status: 'planning',
        trip_type: 'local',
        transport_mode: 'car',
        budget_estimate: 1200,
      });

    const created = createRes.status === 201 && createRes.body?.success;
    tripId = createRes.body?.data?.id || null;
    record('Create trip (planning)', created, `status=${createRes.status} tripId=${tripId || 'n/a'}`);
    if (!created || !tripId) throw new Error('Trip creation failed');

    const submitRes = await request(app)
      .post(`/api/crm/field-trips/${tripId}/submit-approval`)
      .set(authHeader(repToken))
      .send({ advance_amount: 1000, advance_currency: 'AED', advance_notes: 'smoke request' });

    record(
      'Submit approval + advance request',
      submitRes.status === 200 && submitRes.body?.data?.status === 'pending_approval',
      `status=${submitRes.status} state=${submitRes.body?.data?.status || 'n/a'}`
    );

    const approveRes = await request(app)
      .patch(`/api/crm/field-trips/${tripId}/review-approval`)
      .set(authHeader(managerToken))
      .send({ decision: 'approved', approved_advance_amount: 950, approved_advance_currency: 'AED', comments: 'ok' });

    record(
      'Manager approves trip + advance',
      approveRes.status === 200 && approveRes.body?.data?.status === 'confirmed',
      `status=${approveRes.status} tripStatus=${approveRes.body?.data?.status || 'n/a'}`
    );

    const disburseRes = await request(app)
      .post(`/api/crm/field-trips/${tripId}/advance-disburse`)
      .set(authHeader(managerToken))
      .send({ disbursed_amount: 950, disbursed_currency: 'AED', payment_reference: `SMK-${runId}` });

    record(
      'Advance disbursement',
      disburseRes.status === 200 && disburseRes.body?.data?.advance_status === 'disbursed',
      `status=${disburseRes.status} advance=${disburseRes.body?.data?.advance_status || 'n/a'}`
    );

    const startRes = await request(app)
      .patch(`/api/crm/field-trips/${tripId}`)
      .set(authHeader(repToken))
      .send({ status: 'in_progress' });

    record(
      'Start trip (in_progress)',
      startRes.status === 200 && startRes.body?.data?.status === 'in_progress',
      `status=${startRes.status} trip=${startRes.body?.data?.status || 'n/a'}`
    );

    const expenseRes = await request(app)
      .post(`/api/crm/field-trips/${tripId}/expenses`)
      .set(authHeader(repToken))
      .send({ category: 'meals', description: 'smoke expense', amount: 220, currency: 'AED', expense_date: dep });

    record(
      'Add in-trip expense',
      expenseRes.status === 201 && expenseRes.body?.success,
      `status=${expenseRes.status}`
    );

    const settlementSubmitRes = await request(app)
      .post(`/api/crm/field-trips/${tripId}/settlement`)
      .set(authHeader(repToken))
      .send({ returned_amount: 100, returned_currency: 'AED', rep_notes: 'smoke settle', submit: true });

    record(
      'Submit settlement',
      settlementSubmitRes.status === 200 && settlementSubmitRes.body?.data?.status === 'submitted',
      `status=${settlementSubmitRes.status} settlement=${settlementSubmitRes.body?.data?.status || 'n/a'}`
    );

    const reportSubmitRes = await request(app)
      .post(`/api/crm/field-trips/${tripId}/travel-report`)
      .set(authHeader(repToken))
      .send({ summary: 'smoke summary', key_outcomes: 'ok', challenges: 'none', recommendations: 'none', next_steps: 'none', submit: true });

    record(
      'Submit travel report',
      reportSubmitRes.status === 200 && reportSubmitRes.body?.data?.status === 'submitted',
      `status=${reportSubmitRes.status} report=${reportSubmitRes.body?.data?.status || 'n/a'}`
    );

    const reportReviewRes = await request(app)
      .patch(`/api/crm/field-trips/${tripId}/travel-report/review`)
      .set(authHeader(managerToken))
      .send({ status: 'approved', manager_comments: 'approved in smoke' });

    record(
      'Manager approves travel report',
      reportReviewRes.status === 200 && reportReviewRes.body?.data?.status === 'approved',
      `status=${reportReviewRes.status} report=${reportReviewRes.body?.data?.status || 'n/a'}`
    );

    const settleReviewRes = await request(app)
      .patch(`/api/crm/field-trips/${tripId}/settlement/review`)
      .set(authHeader(managerToken))
      .send({ status: 'approved', manager_comments: 'approved in smoke' });

    record(
      'Manager approves settlement',
      settleReviewRes.status === 200 && settleReviewRes.body?.data?.status === 'approved',
      `status=${settleReviewRes.status} settlement=${settleReviewRes.body?.data?.status || 'n/a'}`
    );

    const finalTripRes = await request(app)
      .get(`/api/crm/field-trips/${tripId}`)
      .set(authHeader(repToken));

    const finalStatus = finalTripRes.body?.data?.status;
    record(
      'Trip auto-completes after both approvals',
      finalTripRes.status === 200 && finalStatus === 'completed',
      `status=${finalTripRes.status} trip=${finalStatus || 'n/a'}`
    );

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };

    console.log('\n=== SMOKE SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('\nSmoke run failed with exception:', err?.message || err);
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
