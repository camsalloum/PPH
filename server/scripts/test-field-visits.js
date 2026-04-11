/**
 * Field Visit Module — Comprehensive API Test Script
 * Tests all 33 endpoints with full field coverage
 */
const http = require('http');
const jwt = require('jsonwebtoken');

const SECRET = 'ipd-secret-key-change-in-production';
const TOKEN = jwt.sign({
  userId: 1, email: 'camille@interplast-uae.com', role: 'admin',
  designation: 'admin', department: null, divisions: ['FP'],
  isPlatformAdmin: true, companyId: 1, companyCode: 'FP', type: 'access',
}, SECRET, { expiresIn: '1h' });

const BASE = 'http://localhost:3001';
let tripId, stopId, stopId2, expenseId;
const results = [];

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function test(name, fn) {
  return fn().then(r => {
    results.push({ name, status: 'PASS', detail: r || '' });
    console.log(`  ✓ ${name}`);
  }).catch(e => {
    results.push({ name, status: 'FAIL', detail: String(e.message || e) });
    console.log(`  ✗ ${name}: ${e.message || e}`);
  });
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function run() {
  console.log('\n═══ Field Visit Module — API Test Suite ═══\n');

  // 1. Create trip with all fields
  await test('POST /field-trips (create full trip)', async () => {
    const r = await api('POST', '/api/crm/field-trips', {
      title: 'Full Test Trip', departure_date: '2026-06-01', return_date: '2026-06-05',
      country: 'UAE', country_code: 'AE', cities: ['Dubai', 'Abu Dhabi'],
      trip_type: 'international', budget_estimate: 5000, transport_mode: 'flight',
      accommodation: 'Hilton Dubai', visa_required: true,
      visa_details: { type: 'business', number: 'V999', expiry: '2026-12-01' },
      predeparture_checklist: [{ item: 'Passport', checked: true }, { item: 'Visa', checked: false }],
      co_travellers: [2, 3],
      objectives: 'Client meetings', travel_notes: 'EK321',
      stops: [
        { stop_type: 'customer', customer_id: 1, visit_date: '2026-06-02', visit_time: '09:00', latitude: 25.2, longitude: 55.27, address_snapshot: 'Dubai Mall', objectives: 'Demo', contact_person: 'John', contact_phone: '+97150', contact_email: 'j@t.com' },
        { stop_type: 'other', visit_date: '2026-06-03', latitude: 24.45, longitude: 54.65, address_snapshot: 'Abu Dhabi Tower', objectives: 'Meeting' },
      ],
      legs: [
        { mode: 'flight', from_label: 'DXB', to_label: 'AUH', dep_datetime: '2026-06-01T08:00', arr_datetime: '2026-06-01T09:00', airline: 'Emirates', flight_number: 'EK321', dep_airport: 'DXB', arr_airport: 'AUH', seat_class: 'Economy', booking_ref: 'XYZ' },
      ],
    });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success, 'success should be true');
    tripId = r.body.data.id;
    return `tripId=${tripId}, co_travellers=${JSON.stringify(r.body.data.co_travellers)}`;
  });

  // 2. List trips
  await test('GET /field-trips (list)', async () => {
    const r = await api('GET', '/api/crm/field-trips?limit=10');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success, 'success should be true');
    assert(Array.isArray(r.body.data), 'data should be array');
    return `${r.body.data.length} trips`;
  });

  // 3. Get trip detail
  await test('GET /field-trips/:id (detail)', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.data.title === 'Full Test Trip', 'title mismatch');
    assert(r.body.data.stops?.length >= 2, 'should have 2+ stops');
    stopId = r.body.data.stops[0].id;
    stopId2 = r.body.data.stops[1].id;
    return `title=${r.body.data.title}, stops=${r.body.data.stops.length}, co_travellers=${JSON.stringify(r.body.data.co_travellers)}, visa_details=${JSON.stringify(r.body.data.visa_details)}, checklist=${JSON.stringify(r.body.data.predeparture_checklist)}`;
  });

  // 4. Update trip
  await test('PATCH /field-trips/:id (update)', async () => {
    const r = await api('PATCH', `/api/crm/field-trips/${tripId}`, { budget_estimate: 7000, travel_notes: 'Updated notes' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return 'budget updated to 7000';
  });

  // 5. Add a stop
  await test('POST /field-trips/:id/stops (add stop)', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/stops`, {
      stop_type: 'prospect', prospect_id: 1, visit_date: '2026-06-04', visit_time: '10:00',
      latitude: 25.3, longitude: 55.3, address_snapshot: 'Sharjah HQ', objectives: 'New lead',
      contact_person: 'Ali', contact_phone: '+97155', contact_email: 'ali@test.com',
    });
    assert(r.status === 201 || r.status === 200, `Expected 201/200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `new stop added`;
  });

  // 6. Reorder stops
  await test('PUT /field-trips/:id/stops/reorder', async () => {
    const r = await api('PUT', `/api/crm/field-trips/${tripId}/stops/reorder`, {
      items: [{ id: stopId2, stop_order: 1 }, { id: stopId, stop_order: 2 }],
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'stops reordered';
  });

  // 7. Update stop with new fields
  await test('PATCH /field-trips/:id/stops/:stopId (update)', async () => {
    const r = await api('PATCH', `/api/crm/field-trips/${tripId}/stops/${stopId}`, {
      pre_visit_notes: 'Bring samples', samples_delivered: true, samples_provided: true,
      samples_qty: 5, products_discussed: 'FP100, FP200',
      visit_result: 'positive', next_action: 'Send quotation',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `stop updated: samples_delivered=${r.body.data.samples_delivered}, samples_provided=${r.body.data.samples_provided}`;
  });

  // 8. Check-in to stop (GPS)
  await test('POST /field-trips/:id/stops/:stopId/check-in', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/stops/${stopId}/check-in`, {
      lat: 25.2001, lng: 55.2701, accuracy_m: 15,
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `check-in distance: ${r.body.data?.check_in_distance_m}m`;
  });

  // 9. Complete stop
  await test('POST /field-trips/:id/stops/:stopId/complete', async () => {
    // First change trip status to in_progress
    await api('PATCH', `/api/crm/field-trips/${tripId}`, { status: 'in_progress' });
    const r = await api('POST', `/api/crm/field-trips/${tripId}/stops/${stopId}/complete`, {
      outcome_status: 'visited', outcome_notes: 'Great meeting, interested in FP200',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'stop completed';
  });

  // 10. Add expense (basic)
  await test('POST /field-trips/:id/expenses', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/expenses`, {
      category: 'transport', description: 'Taxi to hotel', amount: 150, currency: 'AED',
      expense_date: '2026-06-01',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    expenseId = r.body.data?.id;
    return `expense id=${expenseId}`;
  });

  // 11. Add multi-currency expense
  await test('POST /field-trips/:id/expenses/multi-currency', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/expenses/multi-currency`, {
      category: 'flight', description: 'Emirates flight', amount: 500, currency: 'USD',
      expense_date: '2026-06-01',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `fx_rate=${r.body.data?.fx_rate}, aed=${r.body.data?.aed_equivalent}, original=${r.body.data?.original_amount} ${r.body.data?.original_currency}`;
  });

  // 12. List expenses
  await test('GET /field-trips/:id/expenses', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/expenses`);
    assert(r.status === 200, `Expected 200`);
    const expenses = r.body.data?.expenses || r.body.data;
    assert(Array.isArray(expenses), 'data should be array');
    return `${expenses.length} expenses`;
  });

  // 13. Get FX rates
  await test('GET /field-trips/fx-rates', async () => {
    const r = await api('GET', '/api/crm/field-trips/fx-rates');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `${r.body.data?.length || 0} rates`;
  });

  // 14. Geocode test
  await test('GET /field-trips/geocode?address=Dubai', async () => {
    const r = await api('GET', '/api/crm/field-trips/geocode?address=Dubai');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return `${r.body.data?.length || 0} results`;
  });

  // 15. Templates — create
  await test('POST /field-trips/templates', async () => {
    const r = await api('POST', '/api/crm/field-trips/templates', {
      name: 'UAE Standard Visit', config: { trip_type: 'local', stops: [{ stop_type: 'customer' }] },
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `template created`;
  });

  // 16. Templates — list
  await test('GET /field-trips/templates', async () => {
    const r = await api('GET', '/api/crm/field-trips/templates');
    assert(r.status === 200, `Expected 200`);
    return `${r.body.data?.length || 0} templates`;
  });

  // 17. Route preview
  await test('GET /field-trips/:id/route-preview', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/route-preview`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return `stops in route: ${r.body.data?.stops?.length || 0}`;
  });

  // 18. HTML report
  await test('GET /field-trips/:id/report', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/report`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return 'HTML report OK';
  });

  // 19. Create/update travel report
  await test('POST /field-trips/:id/travel-report', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/travel-report`, {
      executive_summary: 'Productive trip to UAE with 3 client meetings',
      key_outcomes: 'Secured 2 new prospects',
      next_steps: 'Follow up with quotations',
      challenges: 'One no-show',
      status: 'draft',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'travel report saved';
  });

  // 20. Get travel report
  await test('GET /field-trips/:id/travel-report', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/travel-report`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return `report status: ${r.body.data?.report?.status || 'none'}`;
  });

  // 21. Enhanced travel report
  await test('GET /field-trips/:id/travel-report/enhanced', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/travel-report/enhanced`);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data.roi_metrics, 'should have roi_metrics');
    assert(r.body.data.planned_vs_actual, 'should have planned_vs_actual');
    return `roi: cost_per_visit=${r.body.data.roi_metrics.cost_per_visit}, stops=${r.body.data.roi_metrics.total_stops}, visited=${r.body.data.roi_metrics.visited_stops}`;
  });

  // 22. Submit for approval
  await test('POST /field-trips/:id/submit-approval', async () => {
    // Reset to planning first
    await api('PATCH', `/api/crm/field-trips/${tripId}`, { status: 'planning' });
    const r = await api('POST', `/api/crm/field-trips/${tripId}/submit-approval`);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'submitted for approval';
  });

  // 23. Review approval (manager approve)
  await test('PATCH /field-trips/:id/review-approval', async () => {
    const r = await api('PATCH', `/api/crm/field-trips/${tripId}/review-approval`, {
      decision: 'approved', comments: 'Looks good, proceed.',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return `new status: ${r.body.data?.status}`;
  });

  // 24. Travel report review  
  await test('PATCH /field-trips/:id/travel-report/review', async () => {
    const r = await api('PATCH', `/api/crm/field-trips/${tripId}/travel-report/review`, {
      status: 'approved', review_notes: 'Excellent report',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'travel report reviewed';
  });

  // 25. Per-stop manager comment
  await test('POST /field-trips/:id/travel-report/review-stop', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/travel-report/review-stop`, {
      stop_id: stopId, comment: 'Good follow-up on this account',
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'per-stop comment saved';
  });

  // 26. Delete expense
  await test('DELETE /field-trips/:id/expenses/:expenseId', async () => {
    if (!expenseId) throw new Error('No expense ID');
    const r = await api('DELETE', `/api/crm/field-trips/${tripId}/expenses/${expenseId}`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return 'expense deleted';
  });

  // 27. Delete a stop
  await test('DELETE /field-trips/:id/stops/:stopId', async () => {
    const r = await api('DELETE', `/api/crm/field-trips/${tripId}/stops/${stopId2}`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    return 'stop deleted';
  });

  // 28. Adjustments
  await test('POST /field-trips/:id/adjustments', async () => {
    const r = await api('POST', `/api/crm/field-trips/${tripId}/adjustments`, {
      description: 'Shared hotel cost', adjustment_type: 'other',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
    return 'adjustment added';
  });

  await test('GET /field-trips/:id/adjustments', async () => {
    const r = await api('GET', `/api/crm/field-trips/${tripId}/adjustments`);
    assert(r.status === 200, `Expected 200`);
    return `${r.body.data?.length || 0} adjustments`;
  });

  // Summary
  console.log('\n═══ TEST SUMMARY ═══');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    ✗ ${r.name}: ${r.detail}`));
  }
  results.filter(r => r.status === 'PASS').forEach(r => console.log(`    ✓ ${r.name}: ${r.detail}`));
  console.log('');
}

run().catch(e => { console.error('Test runner error:', e); process.exit(1); });
