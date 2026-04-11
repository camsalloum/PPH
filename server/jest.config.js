/**
 * Jest Configuration
 * Extracted from package.json for better maintainability
 */
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 3,
      lines: 4,
      statements: 4
    }
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Transform ESM modules to CommonJS
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  // Handle ES modules in node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(double-metaphone|natural)/)'
  ],
  // Mock problematic modules
  moduleNameMapper: {
    '^double-metaphone$': '<rootDir>/tests/__mocks__/double-metaphone.js'
  },
  // Increase timeout for integration tests
  testTimeout: 30000,
  // Run tests in parallel
  maxWorkers: '50%',
  // Verbose output
  verbose: true,
  // Force exit after tests complete
  forceExit: true
};
