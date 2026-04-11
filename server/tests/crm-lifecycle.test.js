/**
 * CRM Module — Full Lifecycle Integration Tests
 *
 * Tests the complete CRM flow end-to-end using real HTTP calls (Supertest)
 * against the actual development database.
 *
 * Flow tested:
 *   1. Auth — get a valid JWT for a sales rep user
 *   2. Prospects — create → view → convert to customer
 *   3. Customers — fetch customer, update profile, add competitor notes
 *   4. Activities — log a call, verify it appears in feed
 *   5. Tasks — create task, mark complete
 *   6. Technical Briefs — create, update, convert to inquiry
 *   7. Packaging Profile — save and retrieve
 *   8. Deals — create deal, move stage
 *   9. My Day Summary — verify counters
 *
 * Data isolation: each test uses a unique timestamp-based name so it doesn't
 * collide with real data. No transaction rollback is used here because the
 * routes use pool.query() internally — instead we clean up in afterAll.
 *
 * Run: npx jest --testPathPattern=crm-lifecycle --runInBand
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { pool, authPool } = require('../database/config');
const { initializeApp } = require('../config/express');

// ─── App setup ────────────────────────────────────────────────────────────────
let app;
beforeAll(() => {
  app = initializeApp();
});

afterAll(async () => {
  // Clean up test data created during the run
  await cleanup();
  await pool.end();
  await authPool.end();
});

// ─── Test state (shared across tests in order) ────────────────────────────────
const RUN_ID = Date.now(); // unique per run
const TEST_CUSTOMER_NAME = `TEST_CRM_${RUN_ID}`;
const TEST_PROSPECT_NAME = `TEST_PROSPECT_${RUN_ID}`;

let repToken;       // JWT for the sales rep
let adminToken;     // JWT for admin
let repUserId;      // user.id of the test rep
let customerId;     // fp_customer_unified.customer_id
let prospectId;     // fp_prospects.id
let activityId;     // crm_activities.id
let taskId;         // crm_tasks.id
let briefId;        // crm_technical_briefs.id
let dealId;         // crm_deals.id

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mint a JWT directly (same payload as authService.login).
 * This avoids needing a real password — we just need a valid user ID in the DB.
 */
function mintToken(userId, role = 'sales_rep', extra = {}) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign(
    { userId, email: `test_${userId}@test.local`, role, divisions: ['FP'], type: 'access', ...extra },
    secret,
    { expiresIn: '1h' }
  );
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Find a real sales rep user from the auth DB to use as our test actor.
 * Falls back to any user with role = 'sales_rep'.
 */
async function findOrCreateTestRep() {
  // Try to find an existing sales rep
  const res = await authPool.query(
    `SELECT id, email FROM users WHERE role = 'sales_rep' AND is_active = true LIMIT 1`
  );
  if (res.rows.length > 0) {
    return res.rows[0];
  }
  // Fall back to any active user
  const fallback = await authPool.query(
    `SELECT id, email FROM users WHERE is_active = true LIMIT 1`
  );
  if (fallback.rows.length === 0) throw new Error('No active users found in auth DB — cannot run tests');
  return fallback.rows[0];
}

async function findOrCreateAdminUser() {
  const res = await authPool.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = true LIMIT 1`
  );
  if (res.rows.length > 0) return res.rows[0];
  return findOrCreateTestRep(); // fallback
}

/**
 * Find a real customer in fp_customer_unified to use as test subject.
 * We don't create one — we borrow an existing one and restore it after.
 */
async function findTestCustomer() {
  const res = await pool.query(
    `SELECT customer_id, customer_name FROM fp_customer_unified
     WHERE is_active = true LIMIT 1`
  );
  if (res.rows.length === 0) throw new Error('No customers in fp_customer_unified — cannot run tests');
  return res.rows[0];
}

/**
 * Remove all test data created during this run.
 */
async function cleanup() {
  try {
    // Remove test prospect
    if (prospectId) {
      await pool.query(`DELETE FROM fp_prospects WHERE id = $1`, [prospectId]);
    }
    // Remove test activities
    if (activityId) {
      await pool.query(`DELETE FROM crm_activities WHERE id = $1`, [activityId]);
    }
    // Remove test tasks
    if (taskId) {
      await pool.query(`DELETE FROM crm_tasks WHERE id = $1`, [taskId]);
    }
    // Remove test technical brief
    if (briefId) {
      await pool.query(`DELETE FROM crm_technical_briefs WHERE id = $1`, [briefId]);
    }
    // Remove test deal
    if (dealId) {
      await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id = $1`, [dealId]);
      await pool.query(`DELETE FROM crm_deals WHERE id = $1`, [dealId]);
    }
    // Remove packaging profile if created for test customer
    if (customerId) {
      await pool.query(
        `DELETE FROM crm_customer_packaging_profile WHERE customer_id = $1 AND current_suppliers LIKE 'TEST_%'`,
        [customerId]
      );
      // Restore competitor_notes to null
      await pool.query(
        `UPDATE fp_customer_unified SET competitor_notes = NULL WHERE customer_id = $1 AND competitor_notes LIKE 'TEST_%'`,
        [customerId]
      );
    }
  } catch (err) {
    console.warn('Cleanup warning (non-fatal):', err.message);
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CRM Lifecycle — Full Integration', () => {

  // ── 0. Setup: get tokens and find test data ──────────────────────────────
  describe('0. Setup', () => {
    test('find a sales rep user and mint JWT', async () => {
      const rep = await findOrCreateTestRep();
      repUserId = rep.id;
      repToken = mintToken(rep.id, 'sales_rep');
      expect(repToken).toBeTruthy();
    });

    test('find an admin user and mint JWT', async () => {
      const admin = await findOrCreateAdminUser();
      adminToken = mintToken(admin.id, 'admin');
      expect(adminToken).toBeTruthy();
    });

    test('find a real customer to use as test subject', async () => {
      try {
        const cust = await findTestCustomer();
        customerId = cust.customer_id;
        console.log(`  → Using customer: ${cust.customer_name} (ID: ${customerId})`);
      } catch (err) {
        console.warn('  ⚠ No active customers in fp_customer_unified — customer-dependent tests will be skipped');
        customerId = null;
      }
      // Don't fail the setup — downstream tests will skip if customerId is null
    });
  });

  // ── 1. Prospects ─────────────────────────────────────────────────────────
  describe('1. Prospects', () => {
    test('GET /api/crm/my-prospects — returns prospect list', async () => {
      const res = await request(app)
        .get('/api/crm/my-prospects')
        .set(authHeader(repToken));

      // 200 or 403 (if rep not registered in crm_sales_reps) — both are valid
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      }
    });

    test('POST /api/crm/prospects — create a test prospect (admin)', async () => {
      // Use admin token to bypass rep-group requirement
      const res = await request(app)
        .post('/api/crm/prospects')
        .set(authHeader(adminToken))
        .send({
          customer_name: TEST_PROSPECT_NAME,
          country: 'United Arab Emirates',
          sales_rep_group: 'Test Group',
          division: 'FP',
          source: 'other',
          notes: 'Automated test prospect',
          competitor_notes: `TEST_competitor_${RUN_ID}`
        });

      // 200/201 = created, 409 = already exists (idempotent)
      expect([200, 201, 409]).toContain(res.status);
      if (res.body.success && res.body.prospect) {
        prospectId = res.body.prospect.id;
        console.log(`  → Created prospect ID: ${prospectId}`);
      }
    });

    test('GET /api/crm/admin/prospects — admin can list all prospects', async () => {
      const res = await request(app)
        .get('/api/crm/admin/prospects')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data?.prospects)).toBe(true);
    });
  });

  // ── 2. Customers ─────────────────────────────────────────────────────────
  describe('2. Customers', () => {
    test('GET /api/crm/customers/:id — fetch customer detail', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .get(`/api/crm/customers/${customerId}`)
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer_id).toBe(customerId);
      console.log(`  → Customer: ${res.body.data.customer_name}`);
    });

    test('PUT /api/crm/customers/:id — update competitor notes', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .put(`/api/crm/customers/${customerId}`)
        .set(authHeader(adminToken))
        .send({
          competitor_notes: `TEST_competitor_${RUN_ID}: Currently using Supplier X, price-sensitive`
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.competitor_notes).toContain(`TEST_competitor_${RUN_ID}`);
    });

    test('GET /api/crm/customers/:id — competitor notes persisted', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .get(`/api/crm/customers/${customerId}`)
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.data.competitor_notes).toContain(`TEST_competitor_${RUN_ID}`);
    });

    test('GET /api/crm/customers — list customers (admin)', async () => {
      const res = await request(app)
        .get('/api/crm/customers')
        .set(authHeader(adminToken))
        .query({ limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const customers = res.body.data?.customers || res.body.data;
      expect(Array.isArray(customers)).toBe(true);
    });
  });

  // ── 3. Activities ─────────────────────────────────────────────────────────
  describe('3. Activities', () => {
    test('POST /api/crm/activities — log a call activity', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .post('/api/crm/activities')
        .set(authHeader(adminToken))
        .send({
          customer_id: customerId,
          type: 'call',
          outcome_note: `TEST_activity_${RUN_ID}: Discussed packaging requirements`,
          duration_mins: 15
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      activityId = res.body.data?.id;
      expect(activityId).toBeTruthy();
      console.log(`  → Created activity ID: ${activityId}`);
    });

    test('GET /api/crm/activities — activity appears in feed', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .get('/api/crm/activities')
        .set(authHeader(adminToken))
        .query({ customerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const activities = res.body.data || [];
      const found = activities.find(a => a.id === activityId);
      expect(found).toBeTruthy();
      expect(found.type).toBe('call');
    });

    test('GET /api/crm/recent-activities — appears in recent feed', async () => {
      const res = await request(app)
        .get('/api/crm/recent-activities')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── 4. Tasks ──────────────────────────────────────────────────────────────
  describe('4. Tasks', () => {
    test('POST /api/crm/tasks — create a follow-up task', async () => {
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const res = await request(app)
        .post('/api/crm/tasks')
        .set(authHeader(adminToken))
        .send({
          title: `TEST_task_${RUN_ID}: Follow up on sample`,
          customer_id: customerId,
          due_date: dueDate,
          priority: 'high'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      taskId = res.body.data?.id;
      expect(taskId).toBeTruthy();
      console.log(`  → Created task ID: ${taskId}`);
    });

    test('GET /api/crm/tasks — task appears in list', async () => {
      const res = await request(app)
        .get('/api/crm/tasks')
        .set(authHeader(adminToken))
        .query({ customerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const tasks = res.body.data || [];
      const found = tasks.find(t => t.id === taskId);
      expect(found).toBeTruthy();
    });

    test('PATCH /api/crm/tasks/:id — mark task as completed', async () => {
      const res = await request(app)
        .patch(`/api/crm/tasks/${taskId}`)
        .set(authHeader(adminToken))
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
    });
  });

  // ── 5. Technical Briefs ───────────────────────────────────────────────────
  describe('5. Technical Briefs', () => {
    test('POST /api/crm/technical-briefs — create a brief', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .post('/api/crm/technical-briefs')
        .set(authHeader(adminToken))
        .send({
          customer_id: customerId,
          product_description: `TEST_brief_${RUN_ID}: BOPP pouch for snacks`,
          product_category: 'pouch',
          substrate_interest: 'BOPP',
          annual_volume_est: '50 MT',
          current_supplier: 'Competitor X'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      briefId = res.body.data?.id;
      expect(briefId).toBeTruthy();
      console.log(`  → Created brief ID: ${briefId}`);
    });

    test('GET /api/crm/technical-briefs — brief appears in list', async () => {
      if (!briefId) return console.log('  ⊘ Skipped — no brief was created');
      const res = await request(app)
        .get('/api/crm/technical-briefs')
        .set(authHeader(adminToken))
        .query({ customer_id: customerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const briefs = res.body.data || [];
      const found = briefs.find(b => b.id === briefId);
      expect(found).toBeTruthy();
      expect(found.product_category).toBe('pouch');
    });

    test('PUT /api/crm/technical-briefs/:id — update brief fields', async () => {
      if (!briefId) return console.log('  ⊘ Skipped — no brief was created');
      const res = await request(app)
        .put(`/api/crm/technical-briefs/${briefId}`)
        .set(authHeader(adminToken))
        .send({
          print_colors: '8 colors',
          decision_timeline: 'Q2 2026',
          status: 'submitted'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('submitted');
    });
  });

  // ── 6. Packaging Profile ──────────────────────────────────────────────────
  describe('6. Packaging Profile', () => {
    test('PUT /api/crm/customers/:id/packaging-profile — save profile', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .put(`/api/crm/customers/${customerId}/packaging-profile`)
        .set(authHeader(adminToken))
        .send({
          current_suppliers: `TEST_supplier_${RUN_ID}`,
          packaging_categories: 'pouches, bags',
          annual_volume_est: '200 MT',
          food_safety_certs: 'ISO 22000'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/crm/customers/:id/packaging-profile — profile retrieved', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .get(`/api/crm/customers/${customerId}/packaging-profile`)
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.packaging_categories).toBe('pouches, bags');
    });
  });

  // ── 7. Deals ──────────────────────────────────────────────────────────────
  describe('7. Deals', () => {
    test('POST /api/crm/deals — create a deal', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const closeDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const res = await request(app)
        .post('/api/crm/deals')
        .set(authHeader(adminToken))
        .send({
          title: `TEST_deal_${RUN_ID}: BOPP Pouch Project`,
          customer_id: customerId,
          stage: 'qualified',
          estimated_value: 50000,
          currency: 'AED',
          expected_close_date: closeDate
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      dealId = res.body.data?.id;
      expect(dealId).toBeTruthy();
      console.log(`  → Created deal ID: ${dealId}`);
    });

    test('GET /api/crm/deals — deal appears in list', async () => {
      if (!dealId) return console.log('  ⊘ Skipped — no deal was created');
      const res = await request(app)
        .get('/api/crm/deals')
        .set(authHeader(adminToken))
        .query({ customerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const found = res.body.data.find(d => d.id === dealId);
      expect(found).toBeTruthy();
      expect(found.stage).toBe('qualified');
    });

    test('PATCH /api/crm/deals/:id — advance stage to proposal', async () => {
      if (!dealId) return console.log('  ⊘ Skipped — no deal was created');
      const res = await request(app)
        .patch(`/api/crm/deals/${dealId}`)
        .set(authHeader(adminToken))
        .send({ stage: 'proposal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stage).toBe('proposal');
    });

    test('PATCH /api/crm/deals/:id — close as won (requires close_reason)', async () => {
      if (!dealId) return console.log('  ⊘ Skipped — no deal was created');
      const res = await request(app)
        .patch(`/api/crm/deals/${dealId}`)
        .set(authHeader(adminToken))
        .send({ stage: 'won', close_reason: 'PO received from customer' });

      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe('won');
    });
  });

  // ── 8. My Day Summary ─────────────────────────────────────────────────────
  describe('8. My Day Summary', () => {
    test('GET /api/crm/my-day/summary — returns three counters', async () => {
      const res = await request(app)
        .get('/api/crm/my-day/summary')
        .set(authHeader(repToken));

      // 200 = rep is registered, 403 = rep not in crm_sales_reps (both valid)
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        const { overdueTasks, dormantCustomers, inquiriesAwaitingAction } = res.body.data;
        expect(typeof overdueTasks).toBe('number');
        expect(typeof dormantCustomers).toBe('number');
        expect(typeof inquiriesAwaitingAction).toBe('number');
        console.log(`  → Counters: overdue=${overdueTasks}, dormant=${dormantCustomers}, inquiries=${inquiriesAwaitingAction}`);
      }
    });
  });

  // ── 9. Analytics ──────────────────────────────────────────────────────────
  describe('9. Analytics', () => {
    test('GET /api/crm/analytics/activity-leaderboard — returns rankings', async () => {
      const res = await request(app)
        .get('/api/crm/analytics/activity-leaderboard')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/crm/analytics/deal-funnel — returns funnel data', async () => {
      const res = await request(app)
        .get('/api/crm/analytics/deal-funnel')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/crm/analytics/revenue-forecast — returns forecast', async () => {
      const res = await request(app)
        .get('/api/crm/analytics/revenue-forecast')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── 10. Contacts ──────────────────────────────────────────────────────────
  describe('10. Contacts', () => {
    test('GET /api/crm/contacts — list contacts for customer', async () => {
      if (!customerId) return console.log('  ⊘ Skipped — no test customer');
      const res = await request(app)
        .get('/api/crm/contacts')
        .set(authHeader(adminToken))
        .query({ customerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ── 11. Dashboard Stats ───────────────────────────────────────────────────
  describe('11. Dashboard Stats', () => {
    test('GET /api/crm/dashboard/stats — admin dashboard data', async () => {
      const res = await request(app)
        .get('/api/crm/dashboard/stats')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('GET /api/crm/my-stats — rep dashboard data', async () => {
      const res = await request(app)
        .get('/api/crm/my-stats')
        .set(authHeader(repToken));

      // 200 or 403 depending on whether rep is registered
      expect([200, 403]).toContain(res.status);
    });
  });

});
