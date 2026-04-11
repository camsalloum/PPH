/**
 * @fileoverview Unit Tests for Correlation Middleware
 * @module tests/middleware/correlation.test
 */

const {
  generateCorrelationId,
  getCorrelationId,
  getCorrelationContext,
  runWithCorrelation,
  getCorrelationHeaders
} = require('../../middleware/correlation');

describe('Correlation Middleware Unit Tests', () => {
  
  describe('generateCorrelationId', () => {
    test('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).not.toBe(id2);
    });

    test('should include timestamp', () => {
      const id = generateCorrelationId();
      const timestamp = parseInt(id.split('-')[0]);
      
      expect(timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    test('should include random hex component', () => {
      const id = generateCorrelationId();
      const random = id.split('-')[1];
      
      expect(random).toMatch(/^[a-f0-9]{8}$/);
    });

    test('should have consistent format', () => {
      const id = generateCorrelationId();
      
      expect(id).toMatch(/^\d+-[a-f0-9]{8}$/);
    });
  });

  describe('getCorrelationId', () => {
    test('should return null when no context', () => {
      const id = getCorrelationId();
      
      expect(id).toBeNull();
    });

    test('should return ID within correlation context', () => {
      const testId = 'test-correlation-id';
      const context = { correlationId: testId };
      
      const result = runWithCorrelation(context, () => {
        return getCorrelationId();
      });
      
      expect(result).toBe(testId);
    });
  });

  describe('getCorrelationContext', () => {
    test('should return null when no context', () => {
      const context = getCorrelationContext();
      
      expect(context).toBeNull();
    });

    test('should return full context within run', () => {
      const testContext = {
        correlationId: 'test-123',
        requestId: 'req-456',
        method: 'GET',
        path: '/test'
      };
      
      const result = runWithCorrelation(testContext, () => {
        return getCorrelationContext();
      });
      
      expect(result).toEqual(testContext);
    });
  });

  describe('runWithCorrelation', () => {
    test('should run function with context', () => {
      const context = { correlationId: 'run-test' };
      let capturedId = null;
      
      runWithCorrelation(context, () => {
        capturedId = getCorrelationId();
      });
      
      expect(capturedId).toBe('run-test');
    });

    test('should return function result', () => {
      const context = { correlationId: 'result-test' };
      
      const result = runWithCorrelation(context, () => {
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
    });

    test('should handle async functions', async () => {
      const context = { correlationId: 'async-test' };
      
      const result = await runWithCorrelation(context, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return getCorrelationId();
      });
      
      expect(result).toBe('async-test');
    });

    test('should isolate contexts', () => {
      const results = [];
      
      runWithCorrelation({ correlationId: 'context-1' }, () => {
        results.push(getCorrelationId());
      });
      
      runWithCorrelation({ correlationId: 'context-2' }, () => {
        results.push(getCorrelationId());
      });
      
      expect(results).toEqual(['context-1', 'context-2']);
    });
  });

  describe('getCorrelationHeaders', () => {
    test('should return headers object', () => {
      const headers = getCorrelationHeaders();
      
      expect(headers).toHaveProperty('X-Correlation-ID');
      expect(headers).toHaveProperty('X-Request-ID');
      expect(headers).toHaveProperty('X-Forwarded-For');
    });

    test('should generate new ID when no context', () => {
      const headers = getCorrelationHeaders();
      
      expect(headers['X-Correlation-ID']).toMatch(/^\d+-[a-f0-9]{8}$/);
    });

    test('should use context ID when available', () => {
      const context = { correlationId: 'header-test', requestId: 'req-test', ip: '127.0.0.1' };
      
      const headers = runWithCorrelation(context, () => {
        return getCorrelationHeaders();
      });
      
      expect(headers['X-Correlation-ID']).toBe('header-test');
      expect(headers['X-Request-ID']).toBe('req-test');
      expect(headers['X-Forwarded-For']).toBe('127.0.0.1');
    });
  });
});
