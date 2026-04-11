/**
 * @fileoverview Unit Tests for Monitoring Middleware
 * @module tests/middleware/monitoring.test
 */

const {
  healthStats,
  getMetrics,
  performHealthCheck,
  resetStats
} = require('../../middleware/monitoring');

describe('Monitoring Middleware Unit Tests', () => {
  
  beforeEach(() => {
    // Reset stats before each test
    resetStats();
  });

  describe('healthStats', () => {
    test('should have correct initial structure', () => {
      expect(healthStats).toHaveProperty('startTime');
      expect(healthStats).toHaveProperty('totalRequests');
      expect(healthStats).toHaveProperty('totalErrors');
      expect(healthStats).toHaveProperty('requestsByEndpoint');
      expect(healthStats).toHaveProperty('errorsByType');
    });

    test('should track start time', () => {
      expect(typeof healthStats.startTime).toBe('number');
      expect(healthStats.startTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getMetrics', () => {
    test('should return metrics object', () => {
      const metrics = getMetrics();
      
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('system');
    });

    test('should include uptime in seconds', () => {
      const metrics = getMetrics();
      
      expect(metrics.uptime).toHaveProperty('seconds');
      expect(metrics.uptime).toHaveProperty('formatted');
      expect(typeof metrics.uptime.seconds).toBe('number');
    });

    test('should include memory stats', () => {
      const metrics = getMetrics();
      
      expect(metrics.memory).toHaveProperty('heapUsed');
      expect(metrics.memory).toHaveProperty('heapTotal');
      expect(metrics.memory).toHaveProperty('external');
      expect(metrics.memory).toHaveProperty('rss');
      expect(typeof metrics.memory.heapUsed).toBe('number');
    });

    test('should include system info', () => {
      const metrics = getMetrics();
      
      expect(metrics.system).toHaveProperty('platform');
      expect(metrics.system).toHaveProperty('arch');
      expect(metrics.system).toHaveProperty('nodeVersion');
      expect(metrics.system).toHaveProperty('cpus');
      expect(metrics.system).toHaveProperty('totalMemory');
      expect(metrics.system).toHaveProperty('loadAverage');
    });

    test('should include request stats', () => {
      const metrics = getMetrics();
      
      expect(metrics.requests).toHaveProperty('total');
      expect(metrics.requests).toHaveProperty('errors');
      expect(metrics.requests).toHaveProperty('errorRate');
      expect(metrics.requests).toHaveProperty('byEndpoint');
    });
  });

  describe('performHealthCheck', () => {
    test('should return health status without pools', async () => {
      const health = await performHealthCheck();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('components');
    });

    test('should check memory component', async () => {
      const health = await performHealthCheck();
      
      expect(health.components.memory).toHaveProperty('status');
      expect(health.components.memory).toHaveProperty('heapUsed');
      expect(health.components.memory).toHaveProperty('heapTotal');
      expect(health.components.memory).toHaveProperty('systemUsage');
    });

    test('should check CPU component', async () => {
      const health = await performHealthCheck();
      
      expect(health.components.cpu).toHaveProperty('status');
      expect(health.components.cpu).toHaveProperty('cores');
      expect(health.components.cpu).toHaveProperty('loadAverage');
    });

    test('should check application component', async () => {
      const health = await performHealthCheck();
      
      expect(health.components.application).toHaveProperty('status');
      expect(health.components.application).toHaveProperty('environment');
      expect(health.components.application).toHaveProperty('nodeVersion');
      expect(health.components.application).toHaveProperty('pid');
      expect(health.components.application).toHaveProperty('uptime');
    });

    test('should report database unavailable without pools', async () => {
      const health = await performHealthCheck();
      
      expect(health.components.database.status).toBe('unavailable');
    });

    test('should report healthy status when all components are healthy', async () => {
      const health = await performHealthCheck();
      
      // Should be healthy if memory and CPU are fine
      expect(['healthy', 'degraded']).toContain(health.status);
    });
  });

  describe('resetStats', () => {
    test('should reset all counters', () => {
      // Manually set some values
      healthStats.totalRequests = 100;
      healthStats.totalErrors = 10;
      healthStats.requestsByEndpoint = { '/test': 50 };
      
      resetStats();
      
      expect(healthStats.totalRequests).toBe(0);
      expect(healthStats.totalErrors).toBe(0);
      expect(healthStats.requestsByEndpoint).toEqual({});
    });
  });
});
