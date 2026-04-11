/**
 * Test Platform Login Flow via API
 * Tests the complete authentication flow for ProPackHub
 */

const http = require('http');

const SERVER = 'localhost';
const PORT = 3001;

async function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SERVER,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('PROPACKHUB PLATFORM LOGIN TEST');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Check platform health
  console.log('TEST 1: Platform Health Check');
  console.log('-'.repeat(40));
  try {
    const health = await makeRequest('GET', '/api/platform/health');
    console.log(`Status: ${health.status}`);
    console.log(`Response:`, JSON.stringify(health.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();

  // Test 2: Login with platform admin
  console.log('TEST 2: Platform Admin Login');
  console.log('-'.repeat(40));
  let accessToken = null;
  try {
    const login = await makeRequest('POST', '/api/platform/auth/login', {
      email: 'admin@propackhub.com',
      password: 'ProPackHub2025!'
    });
    console.log(`Status: ${login.status}`);
    if (login.data.success) {
      console.log('✅ Login successful!');
      accessToken = login.data.accessToken;
      console.log('User:', JSON.stringify(login.data.user, null, 2));
    } else {
      console.log('❌ Login failed:', login.data.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();

  if (!accessToken) {
    console.log('Cannot continue tests without access token.');
    return;
  }

  // Test 3: Get current user
  console.log('TEST 3: Get Current User (/api/platform/auth/me)');
  console.log('-'.repeat(40));
  try {
    const me = await makeRequest('GET', '/api/platform/auth/me', null, accessToken);
    console.log(`Status: ${me.status}`);
    if (me.data.success) {
      console.log('✅ Current user retrieved!');
      console.log('User Details:', JSON.stringify(me.data.user, null, 2));
    } else {
      console.log('❌ Error:', me.data.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();

  // Test 4: List companies (platform admin only)
  console.log('TEST 4: List Companies (Platform Admin Only)');
  console.log('-'.repeat(40));
  try {
    const companies = await makeRequest('GET', '/api/platform/auth/companies', null, accessToken);
    console.log(`Status: ${companies.status}`);
    if (companies.data.success) {
      console.log('✅ Companies retrieved!');
      console.log('Companies:', JSON.stringify(companies.data.companies, null, 2));
    } else {
      console.log('❌ Error:', companies.data.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();

  // Test 5: Get subscription plans
  console.log('TEST 5: Get Subscription Plans');
  console.log('-'.repeat(40));
  try {
    const plans = await makeRequest('GET', '/api/platform/plans');
    console.log(`Status: ${plans.status}`);
    if (plans.data.success) {
      console.log('✅ Plans retrieved!');
      console.log('Plans:', JSON.stringify(plans.data.plans, null, 2));
    } else {
      console.log('❌ Error:', plans.data.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();

  console.log('='.repeat(60));
  console.log('ALL TESTS COMPLETED');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
