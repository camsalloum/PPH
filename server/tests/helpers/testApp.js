/**
 * Test helper — creates the Express app and a transaction-wrapped DB client.
 *
 * Each test file calls setupTestDb() in beforeAll and teardownTestDb() in afterAll.
 * All DB writes happen inside a single transaction that is ROLLED BACK at the end,
 * so the real database is never permanently modified.
 *
 * NOTE: Because we use a single transaction client, any query that uses pool.query()
 * directly (not the client) will NOT be rolled back. The integration tests are
 * designed to clean up after themselves via the rollback, but if a test fails
 * mid-way the rollback still fires in afterAll.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { initializeApp } = require('../../config/express');
const { pool, authPool } = require('../../database/config');

let app;
let txClient;   // transaction client for main DB
let authClient; // transaction client for auth DB

/**
 * Build the Express app (once per test file).
 * Returns the supertest-ready app instance.
 */
function getApp() {
  if (!app) {
    app = initializeApp();
  }
  return app;
}

/**
 * Begin a transaction on both pools.
 * Call in beforeAll().
 */
async function setupTestDb() {
  txClient = await pool.connect();
  await txClient.query('BEGIN');

  authClient = await authPool.connect();
  await authClient.query('BEGIN');
}

/**
 * Roll back the transaction and release clients.
 * Call in afterAll().
 */
async function teardownTestDb() {
  if (txClient) {
    await txClient.query('ROLLBACK');
    txClient.release();
    txClient = null;
  }
  if (authClient) {
    await authClient.query('ROLLBACK');
    authClient.release();
    authClient = null;
  }
}

/**
 * Run a query on the main DB transaction client.
 * Use this in tests instead of pool.query() to stay inside the transaction.
 */
async function dbQuery(sql, params = []) {
  return txClient.query(sql, params);
}

/**
 * Run a query on the auth DB transaction client.
 */
async function authDbQuery(sql, params = []) {
  return authClient.query(sql, params);
}

// ─── Mock factories (used by e2e/workflows.test.js) ──────────────────────────

/**
 * Create a lightweight Express app with only the supplied routes mounted.
 * Mirrors the real app's middleware stack without touching the database.
 */
function createTestApp({ routes = {} } = {}) {
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());

  // Correlation-ID header (matches real app behaviour)
  testApp.use((req, res, next) => {
    const id = req.headers['x-correlation-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    res.set('x-correlation-id', id);
    res.set('x-request-id', id);
    next();
  });

  // Mount supplied route modules
  for (const [prefix, handler] of Object.entries(routes)) {
    testApp.use(prefix, handler);
  }

  // 404 catch-all
  testApp.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
  });

  // Error handler
  testApp.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
  });

  return testApp;
}

/**
 * Return a mock user object matching the shape our auth routes expect.
 */
function createMockUser(overrides = {}) {
  return {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'sales_rep',
    divisions: ['FP'],
    is_active: true,
    ...overrides,
  };
}

/**
 * Return mock JWT tokens.
 */
function createMockTokens(overrides = {}) {
  return {
    accessToken: 'mock-access-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now(),
    expiresIn: '15m',
    ...overrides,
  };
}

/**
 * Create a mock pg Pool whose .query() returns the supplied rows.
 */
function createMockPool(defaultRows = []) {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: defaultRows, rowCount: defaultRows.length }),
    release: jest.fn(),
  };
  return {
    query: jest.fn().mockResolvedValue({ rows: defaultRows, rowCount: defaultRows.length }),
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn(),
    _client: mockClient, // for direct access in tests
  };
}

module.exports = {
  getApp, setupTestDb, teardownTestDb, dbQuery, authDbQuery,
  createTestApp, createMockUser, createMockTokens, createMockPool,
};
