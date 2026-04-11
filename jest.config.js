/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/tests/**/*.test.js'],
  testTimeout: 30000,
  // Run tests serially — they share a DB transaction
  maxWorkers: 1,
  // Don't transform node_modules
  transformIgnorePatterns: ['/node_modules/'],
  // Verbose output so you see each step
  verbose: true,
};
