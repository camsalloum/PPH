/**
 * @fileoverview Jest Setup for Tests
 * @module tests/setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-do-not-use-in-production';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '60d';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Clean up after all tests
afterAll(async () => {
  // Close database connections, Redis, etc.
  // Add cleanup logic here
});
