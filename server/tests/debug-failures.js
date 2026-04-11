require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const jwt = require('jsonwebtoken');
const { authPool, pool } = require('../database/config');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 3001, path, method,
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

function mintToken(userId, role) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return jwt.sign(
    { userId, email: `test_${userId}@test.local`, role, divisions: ['FP'], type: 'access' },
    secret, { expiresIn: '1h' }
  );
}

async function run() {
  const adminRes = await authPool.query(`SELECT id FROM users WHERE role='admin' AND is_active=true LIMIT 1`);
  const custRes  = await pool.query(`SELECT customer_id FROM fp_customer_unified WHERE is_active=true LIMIT 1`);
  const adminId = adminRes.rows[0].id;
  const customerId = custRes.rows[0].customer_id;
  const token = mintToken(adminId, 'admin');

  console.log('Admin ID:', adminId, 'Customer ID:', customerId);

  // Test POST /activities with full error detail
  let r = await req('POST', '/api/crm/activities', {
    customer_id: customerId,
    type: 'call',
    outcome_note: 'Debug test',
    duration_mins: 15
  }, token);
  console.log('\nPOST /activities:', r.status, JSON.stringify(r.body));

  // Test GET /contacts
  r = await req('GET', `/api/crm/contacts?customerId=${customerId}`, null, token);
  console.log('\nGET /contacts:', r.status, JSON.stringify(r.body).slice(0, 200));

  // Test POST /deals
  const closeDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  r = await req('POST', '/api/crm/deals', {
    title: 'Debug deal',
    customer_id: customerId,
    stage: 'qualified',
    estimated_value: 50000,
    currency: 'AED',
    expected_close_date: closeDate
  }, token);
  console.log('\nPOST /deals:', r.status, JSON.stringify(r.body));

  // Test deal-funnel
  r = await req('GET', '/api/crm/analytics/deal-funnel', null, token);
  console.log('\nGET /deal-funnel:', r.status, JSON.stringify(r.body));

  await authPool.end();
  await pool.end();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
