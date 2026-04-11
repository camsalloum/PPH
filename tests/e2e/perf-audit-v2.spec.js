/**
 * Performance Audit v2 — ProPackHub Module Loading (sequential)
 *
 * Run:  npx playwright test tests/e2e/perf-audit-v2.spec.js --project=chromium --workers=1
 */
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const LOGIN_EMAIL = 'camille@interplast-uae.com';
const LOGIN_PASS = 'Admin@123';
const RESULTS_FILE = path.join(__dirname, '..', '..', 'perf-audit-results.json');

const PAGES = [
  { name: 'Module Selector',         path: '/modules' },
  { name: 'MIS Dashboard',           path: '/dashboard' },
  { name: 'CRM Admin Dashboard',     path: '/crm' },
  { name: 'CRM Customers',           path: '/crm/customers' },
  { name: 'CRM Customer Map',        path: '/crm/customers/map' },
  { name: 'CRM Pipeline',            path: '/crm/pipeline' },
  { name: 'CRM Analytics',           path: '/crm/analytics' },
  { name: 'CRM Field Visits',        path: '/crm/visits' },
  { name: 'CRM Calendar',            path: '/crm/calendar' },
  { name: 'CRM Reports',             path: '/crm/reports' },
  { name: 'CRM Budget',              path: '/crm/budget' },
  { name: 'CRM Products',            path: '/crm/products' },
  { name: 'CRM Prospects',           path: '/crm/prospects' },
  { name: 'CRM Team',                path: '/crm/team' },
  { name: 'MES Landing',             path: '/mes' },
  { name: 'MES Inquiries',           path: '/mes/inquiries' },
  { name: 'MES QC Dashboard',        path: '/mes/qc' },
  { name: 'MES Job Flow',            path: '/mes/flow' },
  { name: 'MES Estimation',          path: '/mes/estimation' },
  { name: 'MES Procurement',         path: '/mes/procurement' },
  { name: 'MES Job Cards',           path: '/mes/job-cards' },
  { name: 'MES Approvals',           path: '/mes/approvals' },
  { name: 'MES Pipeline',            path: '/mes/pipeline' },
  { name: 'Settings',                path: '/settings' },
  { name: 'People & Access',         path: '/people-access' },
  { name: 'Profile',                 path: '/profile' },
];

function findDuplicates(requests) {
  const counts = {};
  for (const r of requests) {
    const key = `${r.method} ${r.url.split('?')[0]}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([endpoint, count]) => ({ endpoint, count }));
}

test('Full performance audit of all pages', async ({ browser }) => {
  test.setTimeout(600_000);
  const allResults = [];

  const context = await browser.newContext();
  const page = await context.newPage();

  // ── LOGIN ─────────────────────────────────────────────────────
  const loginStart = Date.now();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  const loginPageLoad = Date.now() - loginStart;

  await page.waitForSelector('input', { timeout: 10000 });
  const emailInput = page.locator('input[type="email"], input[id*="email"], input[name*="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill(LOGIN_EMAIL);
  await passInput.fill(LOGIN_PASS);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  const loginSubmitStart = Date.now();
  await page.waitForURL(/\/(modules|dashboard|crm|mes)/, { timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  const loginToLanding = Date.now() - loginSubmitStart;

  allResults.push({
    page: 'Login Page (cold)', path: '/login', loadTimeMs: loginPageLoad,
    perfMetrics: null, apiCallCount: 0, uniqueApiCalls: 0, duplicateApis: [],
    failedCalls: [], totalTransferKB: 0, allApiCalls: [],
  });
  allResults.push({
    page: 'Login->Landing (auth)', path: '/login->redirect', loadTimeMs: loginToLanding,
    perfMetrics: null, apiCallCount: 0, uniqueApiCalls: 0, duplicateApis: [],
    failedCalls: [], totalTransferKB: 0, allApiCalls: [],
  });

  console.log(`Login cold load: ${loginPageLoad}ms`);
  console.log(`Login->landing: ${loginToLanding}ms`);

  // ── AUDIT EACH PAGE ───────────────────────────────────────────
  for (const pg of PAGES) {
    const requests = [];
    const responses = [];

    const reqHandler = (req) => {
      const url = req.url();
      if (url.includes('/api/')) {
        requests.push({ method: req.method(), url: url.replace(BASE, '') });
      }
    };
    const resHandler = async (res) => {
      const url = res.url();
      if (url.includes('/api/')) {
        let size = 0;
        try { const b = await res.body(); size = b.length; } catch {}
        responses.push({
          method: res.request().method(),
          url: url.replace(BASE, ''),
          status: res.status(), size,
        });
      }
    };

    page.on('request', reqHandler);
    page.on('response', resHandler);

    const startTime = Date.now();
    await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
    await page.waitForTimeout(1500);
    const loadTime = Date.now() - startTime;

    page.removeListener('request', reqHandler);
    page.removeListener('response', resHandler);

    const duplicates = findDuplicates(requests);
    const totalTransferKB = Math.round(responses.reduce((s, r) => s + r.size, 0) / 1024);
    const failedCalls = responses.filter(r => r.status >= 400);
    const perfMetrics = await page.evaluate(() => {
      const p = performance.getEntriesByType('navigation')[0];
      if (!p) return null;
      return {
        domContentLoaded: Math.round(p.domContentLoadedEventEnd - p.startTime),
        loadEvent: Math.round(p.loadEventEnd - p.startTime),
        ttfb: Math.round(p.responseStart - p.startTime),
        domInteractive: Math.round(p.domInteractive - p.startTime),
      };
    });

    const result = {
      page: pg.name, path: pg.path, loadTimeMs: loadTime, perfMetrics,
      apiCallCount: requests.length,
      uniqueApiCalls: new Set(requests.map(r => `${r.method} ${r.url.split('?')[0]}`)).size,
      duplicateApis: duplicates,
      failedCalls: failedCalls.map(f => `${f.status} ${f.method} ${f.url}`),
      totalTransferKB,
      allApiCalls: requests.map(r => `${r.method} ${r.url}`),
    };
    allResults.push(result);

    console.log(`${pg.name} | ${loadTime}ms | ${requests.length} APIs (${result.uniqueApiCalls} uniq) | ${totalTransferKB}KB`);
    if (duplicates.length > 0) duplicates.forEach(d => console.log(`  DUP: ${d.endpoint} x${d.count}`));
    if (failedCalls.length > 0) failedCalls.forEach(f => console.log(`  ERR: ${f.status} ${f.method} ${f.url}`));
    requests.forEach(r => console.log(`  -> ${r.method} ${r.url}`));
  }

  await context.close();

  // ── WRITE RESULTS ─────────────────────────────────────────────
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  // ── PRINT SUMMARY ─────────────────────────────────────────────
  console.log('\n========= PERFORMANCE AUDIT SUMMARY =========');
  console.log('Page                        | Load(ms) | APIs | Uniq | Dupes | Err | KB');
  console.log('----------------------------|----------|------|------|-------|-----|------');
  const sorted = [...allResults].sort((a, b) => b.loadTimeMs - a.loadTimeMs);
  for (const r of sorted) {
    const n = r.page.substring(0, 27).padEnd(27);
    const l = String(r.loadTimeMs).padStart(8);
    const a = String(r.apiCallCount).padStart(4);
    const u = String(r.uniqueApiCalls).padStart(4);
    const d = String(r.duplicateApis.reduce((s, x) => s + x.count - 1, 0)).padStart(5);
    const e = String(r.failedCalls.length).padStart(3);
    const k = String(r.totalTransferKB).padStart(5);
    console.log(`${n} | ${l} | ${a} | ${u} | ${d} | ${e} | ${k}`);
  }
  console.log('=============================================');

  const dupePages = allResults.filter(r => r.duplicateApis.length > 0);
  if (dupePages.length > 0) {
    console.log('\nDUPLICATE API CALLS:');
    for (const p of dupePages) {
      console.log(`  ${p.page} (${p.path}):`);
      for (const d of p.duplicateApis) console.log(`    ${d.endpoint} x${d.count}`);
    }
  }

  const slowPages = allResults.filter(r => r.loadTimeMs > 3000);
  if (slowPages.length > 0) {
    console.log('\nSLOW PAGES (>3s):');
    for (const p of slowPages) console.log(`  ${p.page}: ${p.loadTimeMs}ms`);
  }

  const failPages = allResults.filter(r => r.failedCalls.length > 0);
  if (failPages.length > 0) {
    console.log('\nPAGES WITH FAILED CALLS:');
    for (const p of failPages) {
      console.log(`  ${p.page}:`);
      for (const f of p.failedCalls) console.log(`    ${f}`);
    }
  }

  console.log('\nResults saved to: ' + RESULTS_FILE);
});
