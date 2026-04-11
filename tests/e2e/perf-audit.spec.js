/**
 * Performance Audit — ProPackHub Module Loading (v2 — sequential single-test)
 *
 * Run:  npx playwright test tests/e2e/perf-audit.spec.js --project=chromium --workers=1
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const LOGIN_EMAIL = 'camille@interplast-uae.com';
const LOGIN_PASS = 'Admin@123';

// All module pages to audit
const PAGES = [
  { name: 'Login Page (cold)',       path: '/login',            requiresAuth: false },
  { name: 'Module Selector',         path: '/modules',          requiresAuth: true },
  { name: 'MIS Dashboard',           path: '/dashboard',        requiresAuth: true },
  { name: 'CRM Admin Dashboard',     path: '/crm',              requiresAuth: true },
  { name: 'CRM Customers',           path: '/crm/customers',    requiresAuth: true },
  { name: 'CRM Customer Map',        path: '/crm/customers/map',requiresAuth: true },
  { name: 'CRM Pipeline',            path: '/crm/pipeline',     requiresAuth: true },
  { name: 'CRM Analytics',           path: '/crm/analytics',    requiresAuth: true },
  { name: 'CRM Field Visits',        path: '/crm/visits',       requiresAuth: true },
  { name: 'CRM Calendar',            path: '/crm/calendar',     requiresAuth: true },
  { name: 'CRM Reports',             path: '/crm/reports',      requiresAuth: true },
  { name: 'CRM Budget',              path: '/crm/budget',       requiresAuth: true },
  { name: 'CRM Products',            path: '/crm/products',     requiresAuth: true },
  { name: 'CRM Prospects',           path: '/crm/prospects',    requiresAuth: true },
  { name: 'CRM Team',                path: '/crm/team',         requiresAuth: true },
  { name: 'MES Landing',             path: '/mes',              requiresAuth: true },
  { name: 'MES Inquiries',           path: '/mes/inquiries',    requiresAuth: true },
  { name: 'MES QC Dashboard',        path: '/mes/qc',           requiresAuth: true },
  { name: 'MES Job Flow',            path: '/mes/flow',         requiresAuth: true },
  { name: 'MES Estimation',          path: '/mes/estimation',   requiresAuth: true },
  { name: 'MES Procurement',         path: '/mes/procurement',  requiresAuth: true },
  { name: 'MES Job Cards',           path: '/mes/job-cards',    requiresAuth: true },
  { name: 'MES Approvals',           path: '/mes/approvals',    requiresAuth: true },
  { name: 'MES Pipeline',            path: '/mes/pipeline',     requiresAuth: true },
  { name: 'Settings',                path: '/settings',         requiresAuth: true },
  { name: 'People & Access',         path: '/people-access',    requiresAuth: true },
  { name: 'Profile',                 path: '/profile',          requiresAuth: true },
];

// Helper: collect all API requests during a navigation
function createApiCollector(page) {
  const requests = [];
  const handler = (request) => {
    const url = request.url();
    if (url.includes('/api/')) {
      requests.push({
        method: request.method(),
        url: url.replace(BASE, ''),
        timestamp: Date.now(),
      });
    }
  };
  page.on('request', handler);
  return {
    requests,
    stop: () => page.removeListener('request', handler),
  };
}

// Helper: collect all API responses with timing
function createResponseCollector(page) {
  const responses = [];
  const handler = async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      let size = 0;
      try {
        const body = await response.body();
        size = body.length;
      } catch { /* redirect or aborted */ }
      responses.push({
        method: response.request().method(),
        url: url.replace(BASE, ''),
        status: response.status(),
        size,
        timestamp: Date.now(),
      });
    }
  };
  page.on('response', handler);
  return {
    responses,
    stop: () => page.removeListener('response', handler),
  };
}

// Finds duplicate API calls (same method+url called more than once)
function findDuplicates(requests) {
  const counts = {};
  for (const r of requests) {
    const key = `${r.method} ${r.url.split('?')[0]}`; // ignore query params for dupe detection
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([endpoint, count]) => ({ endpoint, count }));
}

test.describe('Performance Audit — All Modules', () => {
  let authToken = null;
  const allResults = [];

  test.beforeAll(async ({ browser }) => {
    // Login once, capture the auth token
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

    // Fill login form
    await page.fill('input[type="email"], input#email, input[name="email"], input[placeholder*="email" i]', LOGIN_EMAIL);
    await page.fill('input[type="password"], input#password, input[name="password"], input[placeholder*="password" i]', LOGIN_PASS);
    await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');

    // Wait for navigation away from login
    await page.waitForURL(/\/(modules|dashboard|crm|mes)/, { timeout: 30000 });

    // Grab auth token from localStorage
    authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(authToken).toBeTruthy();

    await page.close();
  });

  for (const pageConfig of PAGES) {
    test(`Audit: ${pageConfig.name} (${pageConfig.path})`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Set auth token if needed
      if (pageConfig.requiresAuth && authToken) {
        await page.goto(`${BASE}/login`, { waitUntil: 'commit' });
        await page.evaluate((token) => {
          localStorage.setItem('auth_token', token);
        }, authToken);
      }

      // Set up collectors
      const reqCollector = createApiCollector(page);
      const resCollector = createResponseCollector(page);

      // Navigate and measure
      const startTime = Date.now();
      const response = await page.goto(`${BASE}${pageConfig.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for network to settle (API calls completing)
      try {
        await page.waitForLoadState('networkidle', { timeout: 30000 });
      } catch {
        // networkidle timeout is OK — some pages have polling
      }

      // Extra wait for any late-firing React effects
      await page.waitForTimeout(2000);

      const loadTime = Date.now() - startTime;

      // Stop collecting
      reqCollector.stop();
      resCollector.stop();

      // Analyze
      const apiCalls = reqCollector.requests;
      const apiResponses = resCollector.responses;
      const duplicates = findDuplicates(apiCalls);
      const totalTransferKB = Math.round(apiResponses.reduce((sum, r) => sum + r.size, 0) / 1024);
      const failedCalls = apiResponses.filter(r => r.status >= 400);

      // Performance metrics from browser
      const perfMetrics = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0];
        if (!perf) return null;
        return {
          domContentLoaded: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
          loadEvent: Math.round(perf.loadEventEnd - perf.startTime),
          ttfb: Math.round(perf.responseStart - perf.startTime),
          domInteractive: Math.round(perf.domInteractive - perf.startTime),
        };
      });

      // Build result
      const result = {
        page: pageConfig.name,
        path: pageConfig.path,
        loadTimeMs: loadTime,
        perfMetrics,
        apiCallCount: apiCalls.length,
        uniqueApiCalls: new Set(apiCalls.map(r => `${r.method} ${r.url.split('?')[0]}`)).size,
        duplicateApis: duplicates,
        failedCalls: failedCalls.map(f => `${f.status} ${f.method} ${f.url}`),
        totalTransferKB,
        allApiCalls: apiCalls.map(r => `${r.method} ${r.url}`),
      };

      allResults.push(result);

      // Log to console for immediate visibility
      console.log(`\n========================================`);
      console.log(`📊 ${pageConfig.name} (${pageConfig.path})`);
      console.log(`   Load time: ${loadTime}ms`);
      if (perfMetrics) {
        console.log(`   TTFB: ${perfMetrics.ttfb}ms | DOM Interactive: ${perfMetrics.domInteractive}ms | DCL: ${perfMetrics.domContentLoaded}ms`);
      }
      console.log(`   API calls: ${apiCalls.length} total (${result.uniqueApiCalls} unique)`);
      console.log(`   Transfer: ${totalTransferKB} KB`);
      if (duplicates.length > 0) {
        console.log(`   ⚠️ DUPLICATES:`);
        duplicates.forEach(d => console.log(`      ${d.endpoint} × ${d.count}`));
      }
      if (failedCalls.length > 0) {
        console.log(`   ❌ FAILED:`);
        failedCalls.forEach(f => console.log(`      ${f.status} ${f.method} ${f.url}`));
      }
      console.log(`   All API calls:`);
      apiCalls.forEach(r => console.log(`      ${r.method} ${r.url}`));
      console.log(`========================================\n`);

      await context.close();
    });
  }

  test.afterAll(async () => {
    // Print summary table
    console.log('\n\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                            PERFORMANCE AUDIT SUMMARY                                                ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Page                        │ Load(ms) │ APIs │ Unique │ Dupes │ Failed │ KB     ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣');

    // Sort by load time desc
    allResults.sort((a, b) => b.loadTimeMs - a.loadTimeMs);

    for (const r of allResults) {
      const name = r.page.padEnd(27);
      const load = String(r.loadTimeMs).padStart(8);
      const apis = String(r.apiCallCount).padStart(4);
      const unique = String(r.uniqueApiCalls).padStart(6);
      const dupes = String(r.duplicateApis.length > 0 ? r.duplicateApis.reduce((s, d) => s + d.count - 1, 0) : 0).padStart(5);
      const failed = String(r.failedCalls.length).padStart(6);
      const kb = String(r.totalTransferKB).padStart(6);
      console.log(`║ ${name} │ ${load} │ ${apis} │ ${unique} │ ${dupes} │ ${failed} │ ${kb} ║`);
    }

    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝');

    // Highlight worst offenders
    const dupePages = allResults.filter(r => r.duplicateApis.length > 0);
    if (dupePages.length > 0) {
      console.log('\n⚠️  DUPLICATE API CALLS FOUND:');
      for (const p of dupePages) {
        console.log(`\n  ${p.page} (${p.path}):`);
        for (const d of p.duplicateApis) {
          console.log(`    ${d.endpoint} × ${d.count}`);
        }
      }
    }

    const slowPages = allResults.filter(r => r.loadTimeMs > 3000);
    if (slowPages.length > 0) {
      console.log('\n🐌  SLOW PAGES (>3s):');
      for (const p of slowPages) {
        console.log(`  ${p.page}: ${p.loadTimeMs}ms (${p.apiCallCount} API calls, ${p.totalTransferKB} KB)`);
      }
    }

    const failPages = allResults.filter(r => r.failedCalls.length > 0);
    if (failPages.length > 0) {
      console.log('\n❌  PAGES WITH FAILED API CALLS:');
      for (const p of failPages) {
        console.log(`\n  ${p.page}:`);
        for (const f of p.failedCalls) {
          console.log(`    ${f}`);
        }
      }
    }
  });
});
