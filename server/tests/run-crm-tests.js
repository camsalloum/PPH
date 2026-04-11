/**
 * CRM Integration Test Runner
 * Runs directly against the live server on localhost:3001
 * Usage: node server/tests/run-crm-tests.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const jwt = require('jsonwebtoken');
const { authPool, pool } = require('../database/config');

const BASE = 'http://localhost:3001';
const RUN_ID = Date.now();
let ADMIN_TOKEN = '';
let REP_TOKEN = '';
let customerId = null;
let prospectId = null;
let activityId = null;
let taskId = null;
let briefId = null;
let dealId = null;

// ── Counters ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function pass(name) {
  passed++;
  console.log(`  ✅ PASS  ${name}`);
}
function fail(name, reason) {
  failed++;
  console.log(`  ❌ FAIL  ${name}`);
  console.log(`         → ${reason}`);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 3001,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Mint JWT directly ─────────────────────────────────────────────────────────
function mintToken(userId, role) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign(
    { userId, email: `test_${userId}@test.local`, role, divisions: ['FP'], type: 'access' },
    secret, { expiresIn: '1h' }
  );
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
  const ops = [];
  if (prospectId) ops.push(pool.query('DELETE FROM fp_prospects WHERE id=$1', [prospectId]));
  if (activityId) ops.push(pool.query('DELETE FROM crm_activities WHERE id=$1', [activityId]));
  if (taskId)     ops.push(pool.query('DELETE FROM crm_tasks WHERE id=$1', [taskId]));
  if (briefId)    ops.push(pool.query('DELETE FROM crm_technical_briefs WHERE id=$1', [briefId]));
  if (dealId) {
    ops.push(pool.query('DELETE FROM crm_deal_stage_history WHERE deal_id=$1', [dealId]));
    ops.push(pool.query('DELETE FROM crm_deals WHERE id=$1', [dealId]));
  }
  if (customerId) {
    ops.push(pool.query(`UPDATE fp_customer_unified SET competitor_notes=NULL WHERE customer_id=$1 AND competitor_notes LIKE 'TEST_%'`, [customerId]));
    ops.push(pool.query(`DELETE FROM crm_customer_packaging_profile WHERE customer_id=$1 AND current_suppliers LIKE 'TEST_%'`, [customerId]));
  }
  await Promise.allSettled(ops);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  CRM LIFECYCLE INTEGRATION TESTS');
  console.log(`  Run ID: ${RUN_ID}`);
  console.log('══════════════════════════════════════════════════\n');

  // ── 0. Setup ────────────────────────────────────────────────────────────────
  console.log('── 0. Setup ──────────────────────────────────────');
  try {
    const adminRes = await authPool.query(`SELECT id FROM users WHERE role='admin' AND is_active=true LIMIT 1`);
    const repRes   = await authPool.query(`SELECT id FROM users WHERE role='sales_rep' AND is_active=true LIMIT 1`);
    const custRes  = await pool.query(`SELECT customer_id, display_name FROM fp_customer_unified WHERE is_active=true LIMIT 1`);

    if (!adminRes.rows.length) throw new Error('No admin user found');
    if (!custRes.rows.length)  throw new Error('No customers found');

    ADMIN_TOKEN = mintToken(adminRes.rows[0].id, 'admin');
    REP_TOKEN   = repRes.rows.length ? mintToken(repRes.rows[0].id, 'sales_rep') : ADMIN_TOKEN;
    customerId  = custRes.rows[0].customer_id;

    pass(`DB connected — admin ID: ${adminRes.rows[0].id}`);
    pass(`Test customer: "${custRes.rows[0].display_name}" (ID: ${customerId})`);
    pass(`Rep token: ${repRes.rows.length ? 'real sales_rep' : 'using admin as fallback'}`);
  } catch (e) {
    fail('Setup', e.message);
    console.log('\n⛔ Cannot continue without DB access. Is the server running?\n');
    process.exit(1);
  }

  // ── 1. Customers ────────────────────────────────────────────────────────────
  console.log('\n── 1. Customers ──────────────────────────────────');

  let r = await req('GET', `/api/crm/customers/${customerId}`, null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`GET /customers/${customerId} → ${r.body.data.customer_name}`)
    : fail(`GET /customers/${customerId}`, `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);

  r = await req('GET', '/api/crm/customers?limit=5', null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`GET /customers?limit=5 → ${(r.body.data?.customers || r.body.data || []).length} rows`)
    : fail('GET /customers', `${r.status}`);

  r = await req('PUT', `/api/crm/customers/${customerId}`, { competitor_notes: `TEST_${RUN_ID}: Supplier X` }, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`PUT /customers/${customerId} competitor_notes saved`)
    : fail(`PUT /customers/${customerId}`, `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);

  // verify it persisted
  r = await req('GET', `/api/crm/customers/${customerId}`, null, ADMIN_TOKEN);
  r.body.data?.competitor_notes?.includes(`TEST_${RUN_ID}`)
    ? pass('competitor_notes persisted correctly')
    : fail('competitor_notes persistence', `got: ${r.body.data?.competitor_notes}`);

  // ── 2. Prospects ────────────────────────────────────────────────────────────
  console.log('\n── 2. Prospects ──────────────────────────────────');

  r = await req('POST', '/api/crm/prospects', {
    customer_name: `TEST_PROSPECT_${RUN_ID}`,
    country: 'United Arab Emirates',
    sales_rep_group: 'Test Group',
    division: 'FP',
    source: 'other',
    notes: 'Automated test',
    competitor_notes: `TEST_comp_${RUN_ID}`
  }, ADMIN_TOKEN);
  if ((r.status === 200 || r.status === 201) && r.body.success) {
    prospectId = r.body.prospect?.id;
    pass(`POST /prospects → ID: ${prospectId}`);
  } else if (r.status === 409) {
    pass('POST /prospects → already exists (idempotent)');
  } else {
    fail('POST /prospects', `${r.status} ${JSON.stringify(r.body).slice(0,100)}`);
  }

  r = await req('GET', '/api/crm/admin/prospects', null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`GET /admin/prospects → ${r.body.data?.prospects?.length} prospects`)
    : fail('GET /admin/prospects', `${r.status}`);

  r = await req('GET', '/api/crm/my-prospects', null, REP_TOKEN);
  [200, 403].includes(r.status)
    ? pass(`GET /my-prospects → ${r.status} (${r.status === 403 ? 'rep not in crm_sales_reps — expected' : r.body.data?.prospects?.length + ' rows'})`)
    : fail('GET /my-prospects', `${r.status}`);

  // ── 3. Activities ────────────────────────────────────────────────────────────
  console.log('\n── 3. Activities ─────────────────────────────────');

  r = await req('POST', '/api/crm/activities', {
    customer_id: customerId,
    type: 'call',
    outcome_note: `TEST_${RUN_ID}: Discussed packaging`,
    duration_mins: 15
  }, ADMIN_TOKEN);
  if (r.status === 201 && r.body.success) {
    activityId = r.body.data?.id;
    pass(`POST /activities → ID: ${activityId}, type: call`);
  } else {
    fail('POST /activities', `${r.status} ${JSON.stringify(r.body).slice(0,100)}`);
  }

  r = await req('GET', `/api/crm/activities?customerId=${customerId}`, null, ADMIN_TOKEN);
  if (r.status === 200 && r.body.success) {
    const found = (r.body.data || []).find(a => a.id === activityId);
    found
      ? pass(`GET /activities → found activity ID ${activityId}`)
      : fail('GET /activities', `activity ${activityId} not in response`);
  } else {
    fail('GET /activities', `${r.status}`);
  }

  r = await req('GET', '/api/crm/recent-activities', null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`GET /recent-activities → ${(r.body.data || []).length} items`)
    : fail('GET /recent-activities', `${r.status}`);

  // ── 4. Tasks ─────────────────────────────────────────────────────────────────
  console.log('\n── 4. Tasks ──────────────────────────────────────');

  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  r = await req('POST', '/api/crm/tasks', {
    title: `TEST_task_${RUN_ID}: Follow up on sample`,
    customer_id: customerId,
    due_date: dueDate,
    priority: 'high'
  }, ADMIN_TOKEN);
  if (r.status === 201 && r.body.success) {
    taskId = r.body.data?.id;
    pass(`POST /tasks → ID: ${taskId}, due: ${dueDate}`);
  } else {
    fail('POST /tasks', `${r.status} ${JSON.stringify(r.body).slice(0,100)}`);
  }

  r = await req('GET', `/api/crm/tasks?customerId=${customerId}`, null, ADMIN_TOKEN);
  if (r.status === 200 && r.body.success) {
    const found = (r.body.data || []).find(t => t.id === taskId);
    found ? pass(`GET /tasks → found task ID ${taskId}`) : fail('GET /tasks', 'task not found');
  } else {
    fail('GET /tasks', `${r.status}`);
  }

  if (taskId) {
    r = await req('PATCH', `/api/crm/tasks/${taskId}`, { status: 'completed' }, ADMIN_TOKEN);
    r.status === 200 && r.body.data?.status === 'completed'
      ? pass(`PATCH /tasks/${taskId} → status: completed`)
      : fail(`PATCH /tasks/${taskId}`, `${r.status} status=${r.body.data?.status}`);
  }

  // ── 5. Technical Briefs ───────────────────────────────────────────────────────
  console.log('\n── 5. Technical Briefs ───────────────────────────');

  r = await req('POST', '/api/crm/technical-briefs', {
    customer_id: customerId,
    product_description: `TEST_brief_${RUN_ID}: BOPP pouch for snacks`,
    product_category: 'pouch',
    substrate_interest: 'BOPP',
    annual_volume_est: '50 MT',
    current_supplier: 'Competitor X'
  }, ADMIN_TOKEN);
  if (r.status === 201 && r.body.success) {
    briefId = r.body.data?.id;
    pass(`POST /technical-briefs → ID: ${briefId}`);
  } else {
    fail('POST /technical-briefs', `${r.status} ${JSON.stringify(r.body).slice(0,100)}`);
  }

  r = await req('GET', `/api/crm/technical-briefs?customer_id=${customerId}`, null, ADMIN_TOKEN);
  if (r.status === 200 && r.body.success) {
    const found = (r.body.data || []).find(b => b.id === briefId);
    found ? pass(`GET /technical-briefs → found brief ID ${briefId}`) : fail('GET /technical-briefs', 'brief not found');
  } else {
    fail('GET /technical-briefs', `${r.status}`);
  }

  if (briefId) {
    r = await req('PUT', `/api/crm/technical-briefs/${briefId}`, {
      print_colors: '8 colors', decision_timeline: 'Q2 2026', status: 'submitted'
    }, ADMIN_TOKEN);
    r.status === 200 && r.body.data?.status === 'submitted'
      ? pass(`PUT /technical-briefs/${briefId} → status: submitted`)
      : fail(`PUT /technical-briefs/${briefId}`, `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);
  }

  // ── 6. Packaging Profile ──────────────────────────────────────────────────────
  console.log('\n── 6. Packaging Profile ──────────────────────────');

  r = await req('PUT', `/api/crm/customers/${customerId}/packaging-profile`, {
    current_suppliers: `TEST_supplier_${RUN_ID}`,
    packaging_categories: 'pouches, bags',
    annual_volume_est: '200 MT',
    food_safety_certs: 'ISO 22000'
  }, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`PUT /customers/${customerId}/packaging-profile → saved`)
    : fail('PUT /packaging-profile', `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);

  r = await req('GET', `/api/crm/customers/${customerId}/packaging-profile`, null, ADMIN_TOKEN);
  r.status === 200 && r.body.success && r.body.data?.packaging_categories === 'pouches, bags'
    ? pass(`GET /packaging-profile → packaging_categories: "${r.body.data.packaging_categories}"`)
    : fail('GET /packaging-profile', `${r.status} data=${JSON.stringify(r.body.data).slice(0,80)}`);

  // ── 7. Deals ──────────────────────────────────────────────────────────────────
  console.log('\n── 7. Deals ──────────────────────────────────────');

  const closeDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  r = await req('POST', '/api/crm/deals', {
    title: `TEST_deal_${RUN_ID}: BOPP Pouch Project`,
    customer_id: customerId,
    stage: 'qualified',
    estimated_value: 50000,
    currency: 'AED',
    expected_close_date: closeDate
  }, ADMIN_TOKEN);
  if (r.status === 201 && r.body.success) {
    dealId = r.body.data?.id;
    pass(`POST /deals → ID: ${dealId}, stage: qualified`);
  } else {
    fail('POST /deals', `${r.status} ${JSON.stringify(r.body).slice(0,100)}`);
  }

  r = await req('GET', `/api/crm/deals?customerId=${customerId}`, null, ADMIN_TOKEN);
  if (r.status === 200 && r.body.success) {
    const found = (r.body.data || []).find(d => d.id === dealId);
    found ? pass(`GET /deals → found deal ID ${dealId}`) : fail('GET /deals', 'deal not found');
  } else {
    fail('GET /deals', `${r.status}`);
  }

  if (dealId) {
    r = await req('PATCH', `/api/crm/deals/${dealId}`, { stage: 'proposal' }, ADMIN_TOKEN);
    r.status === 200 && r.body.data?.stage === 'proposal'
      ? pass(`PATCH /deals/${dealId} → stage: proposal`)
      : fail(`PATCH /deals/${dealId}`, `${r.status} stage=${r.body.data?.stage}`);

    r = await req('PATCH', `/api/crm/deals/${dealId}`, { stage: 'won', close_reason: 'PO received' }, ADMIN_TOKEN);
    r.status === 200 && r.body.data?.stage === 'won'
      ? pass(`PATCH /deals/${dealId} → stage: won (closed)`)
      : fail(`PATCH /deals/${dealId} close`, `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);
  }

  // ── 8. My Day Summary ─────────────────────────────────────────────────────────
  console.log('\n── 8. My Day Summary ─────────────────────────────');

  r = await req('GET', '/api/crm/my-day/summary', null, REP_TOKEN);
  if (r.status === 200 && r.body.success) {
    const { overdueTasks, dormantCustomers, inquiriesAwaitingAction } = r.body.data;
    pass(`GET /my-day/summary → overdue:${overdueTasks} dormant:${dormantCustomers} inquiries:${inquiriesAwaitingAction}`);
  } else if (r.status === 403) {
    pass('GET /my-day/summary → 403 (rep not in crm_sales_reps — expected)');
  } else {
    fail('GET /my-day/summary', `${r.status} ${JSON.stringify(r.body).slice(0,80)}`);
  }

  // ── 9. Analytics ──────────────────────────────────────────────────────────────
  console.log('\n── 9. Analytics ──────────────────────────────────');

  for (const endpoint of [
    '/api/crm/analytics/activity-leaderboard',
    '/api/crm/analytics/deal-funnel',
    '/api/crm/analytics/revenue-forecast',
    '/api/crm/analytics/engagement-scores'
  ]) {
    r = await req('GET', endpoint, null, ADMIN_TOKEN);
    r.status === 200 && r.body.success
      ? pass(`GET ${endpoint}`)
      : fail(`GET ${endpoint}`, `${r.status}`);
  }

  // ── 10. Dashboard ─────────────────────────────────────────────────────────────
  console.log('\n── 10. Dashboard ─────────────────────────────────');

  r = await req('GET', '/api/crm/dashboard/stats', null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass('GET /dashboard/stats → admin dashboard data')
    : fail('GET /dashboard/stats', `${r.status}`);

  r = await req('GET', '/api/crm/my-stats', null, REP_TOKEN);
  [200, 403].includes(r.status)
    ? pass(`GET /my-stats → ${r.status}`)
    : fail('GET /my-stats', `${r.status}`);

  // ── 11. Contacts ──────────────────────────────────────────────────────────────
  console.log('\n── 11. Contacts ──────────────────────────────────');

  r = await req('GET', `/api/crm/contacts?customerId=${customerId}`, null, ADMIN_TOKEN);
  r.status === 200 && r.body.success
    ? pass(`GET /contacts → ${(r.body.data || []).length} contacts`)
    : fail('GET /contacts', `${r.status}`);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  console.log('\n── Cleanup ───────────────────────────────────────');
  try {
    await cleanup();
    pass('Test data cleaned up');
  } catch (e) {
    fail('Cleanup', e.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${total} passed  |  ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  await pool.end().catch(() => {});
  await authPool.end().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
