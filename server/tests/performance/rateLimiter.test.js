/**
 * @fileoverview Performance Tests for Rate Limiting
 * Tests rate limiter behavior using isolated test app
 * @module tests/performance/rateLimiter.test
 */

const request = require('supertest');
const express = require('express');

// Create a test-specific rate limiter
const createRateLimiter = (options = {}) => {
  const { windowMs = 15 * 60 * 1000, max = 100 } = options;
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || 'test';
    const now = Date.now();
    
    // Clean up old entries
    const entries = requests.get(key) || [];
    const validEntries = entries.filter(time => now - time < windowMs);
    
    if (validEntries.length >= max) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((validEntries[0] + windowMs) / 1000));
      res.setHeader('Retry-After', Math.ceil((validEntries[0] + windowMs - now) / 1000));
      
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((validEntries[0] + windowMs - now) / 1000)
      });
    }
    
    validEntries.push(now);
    requests.set(key, validEntries);
    
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - validEntries.length);
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
    
    next();
  };
};

describe('Rate Limiter Performance Tests', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Test endpoint with rate limiting (max 10 for testing)
    app.get('/api/test/limited', createRateLimiter({ max: 10, windowMs: 60000 }), (req, res) => {
      res.json({ success: true, message: 'Request allowed' });
    });
    
    // Endpoint without rate limiting
    app.get('/api/test/unlimited', (req, res) => {
      res.json({ success: true, message: 'No limit' });
    });
  });

  describe('Rate Limiting Behavior', () => {
    test('should allow requests under limit', async () => {
      // Send 5 requests (under the limit of 10)
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .get('/api/test/limited')
          .expect(200);
        responses.push(res);
      }
      
      // All should succeed
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.headers).toHaveProperty('x-ratelimit-limit');
        expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      });
      
      // Check remaining count decreases
      const firstRemaining = parseInt(responses[0].headers['x-ratelimit-remaining']);
      const lastRemaining = parseInt(responses[4].headers['x-ratelimit-remaining']);
      expect(lastRemaining).toBeLessThan(firstRemaining);
    });

    test('should rate limit after exceeding threshold', async () => {
      // Send 12 requests (2 over the limit of 10)
      const responses = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(app).get('/api/test/limited');
        responses.push(res);
      }
      
      // First 10 should succeed
      const successfulRequests = responses.filter(r => r.status === 200).length;
      const rateLimitedRequests = responses.filter(r => r.status === 429).length;
      
      expect(successfulRequests).toBe(10);
      expect(rateLimitedRequests).toBe(2);
    });

    test('should return correct rate limit headers', async () => {
      const response = await request(app)
        .get('/api/test/limited')
        .expect(200);
      
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(parseInt(response.headers['x-ratelimit-remaining'])).toBeLessThanOrEqual(9);
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    test('should return 429 with retry-after header when rate limited', async () => {
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await request(app).get('/api/test/limited');
      }
      
      // This request should be rate limited
      const response = await request(app)
        .get('/api/test/limited')
        .expect(429);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Too many requests');
      expect(response.headers['retry-after']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Unlimited Endpoints', () => {
    test('should not rate limit unlimited endpoints', async () => {
      // Send 20 requests (would exceed limit if limited)
      const responses = [];
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .get('/api/test/unlimited')
          .expect(200);
        responses.push(res);
      }
      
      // All should succeed
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      });
    });
  });
});
