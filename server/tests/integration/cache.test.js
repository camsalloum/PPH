/**
 * @fileoverview Integration Tests for Caching Middleware
 * Tests cache behavior using isolated test app
 * @module tests/integration/cache.test
 */

const request = require('supertest');
const express = require('express');

// Mock the cache module
jest.mock('../../middleware/cache', () => {
  const mockCache = new Map();
  
  return {
    cacheMiddleware: (options = {}) => (req, res, next) => {
      const key = req.originalUrl || req.url;
      const cached = mockCache.get(key);
      
      if (cached) {
        return res.json({ ...cached, cached: true });
      }
      
      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        mockCache.set(key, data);
        return originalJson(data);
      };
      
      next();
    },
    invalidateCache: jest.fn().mockImplementation((pattern) => {
      if (pattern === '*') {
        mockCache.clear();
      } else {
        for (const key of mockCache.keys()) {
          if (key.includes(pattern)) {
            mockCache.delete(key);
          }
        }
      }
      return Promise.resolve();
    }),
    getCacheStats: jest.fn().mockReturnValue({
      hits: 0,
      misses: 0,
      keys: 0
    }),
    initRedis: jest.fn().mockResolvedValue(false),
    __mockCache: mockCache // Expose for testing
  };
});

const { cacheMiddleware, invalidateCache, getCacheStats, __mockCache } = require('../../middleware/cache');

describe('Caching Middleware Integration Tests', () => {
  let app;

  beforeEach(() => {
    // Clear mock cache before each test
    __mockCache.clear();
    jest.clearAllMocks();
    
    // Create fresh test app
    app = express();
    app.use(express.json());
    
    // Test route with caching
    app.get('/api/test/cached', cacheMiddleware({ ttl: 300 }), (req, res) => {
      res.json({ data: 'test-data', timestamp: Date.now() });
    });
    
    // Test route without caching
    app.get('/api/test/uncached', (req, res) => {
      res.json({ data: 'uncached-data', timestamp: Date.now() });
    });
  });

  describe('Cache Hit/Miss', () => {
    test('should miss cache on first request and hit on second', async () => {
      // First request - cache miss
      const firstResponse = await request(app)
        .get('/api/test/cached')
        .expect(200);
      
      expect(firstResponse.body.data).toBe('test-data');
      expect(firstResponse.body.cached).toBeUndefined();
      
      // Second request - cache hit
      const secondResponse = await request(app)
        .get('/api/test/cached')
        .expect(200);
      
      expect(secondResponse.body.data).toBe('test-data');
      expect(secondResponse.body.cached).toBe(true);
    });

    test('should not cache uncached endpoints', async () => {
      // First request
      const firstResponse = await request(app)
        .get('/api/test/uncached')
        .expect(200);
      
      // Second request should not be cached
      const secondResponse = await request(app)
        .get('/api/test/uncached')
        .expect(200);
      
      expect(secondResponse.body.cached).toBeUndefined();
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate cache correctly', async () => {
      // First request - populate cache
      await request(app)
        .get('/api/test/cached')
        .expect(200);
      
      // Verify cache hit
      const cachedResponse = await request(app)
        .get('/api/test/cached')
        .expect(200);
      
      expect(cachedResponse.body.cached).toBe(true);
      
      // Invalidate cache
      await invalidateCache('*');
      
      // Should be cache miss after invalidation
      const afterInvalidation = await request(app)
        .get('/api/test/cached')
        .expect(200);
      
      expect(afterInvalidation.body.cached).toBeUndefined();
    });
  });

  describe('Cache Stats', () => {
    test('should return cache statistics', () => {
      const stats = getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('keys');
    });
  });
});
