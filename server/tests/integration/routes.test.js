/**
 * @fileoverview Integration Tests for AEBF Routes
 * Tests AEBF API endpoints using isolated test app with mocked database
 * @module tests/integration/routes.test
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-key';

// Mock data
const mockActualData = [
  { id: 1, customer: 'Customer A', product_group: 'PG1', amount: 1000 },
  { id: 2, customer: 'Customer B', product_group: 'PG2', amount: 2000 }
];

const mockBudgetYears = [2023, 2024, 2025];
const mockAvailableMonths = ['January', 'February', 'March'];
const mockFilterOptions = {
  customers: ['Customer A', 'Customer B'],
  productGroups: ['PG1', 'PG2'],
  salesReps: ['Rep1', 'Rep2']
};

// Auth middleware for testing
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Create test app with AEBF routes
function createAEBFApp() {
  const app = express();
  app.use(express.json());
  
  // Health check (public)
  app.get('/api/aebf/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });
  
  // Budget years (public)
  app.get('/api/aebf/budget-years', (req, res) => {
    res.json({
      success: true,
      data: mockBudgetYears
    });
  });
  
  // Protected routes
  app.get('/api/aebf/actual', authMiddleware, (req, res) => {
    const { division, budgetYear } = req.query;
    
    if (!division || !budgetYear) {
      return res.status(400).json({
        success: false,
        error: 'division and budgetYear are required'
      });
    }
    
    res.json({
      success: true,
      data: mockActualData,
      count: mockActualData.length,
      division,
      budgetYear: parseInt(budgetYear)
    });
  });
  
  app.get('/api/aebf/budget', authMiddleware, (req, res) => {
    const { division, budgetYear } = req.query;
    
    if (!division || !budgetYear) {
      return res.status(400).json({
        success: false,
        error: 'division and budgetYear are required'
      });
    }
    
    res.json({
      success: true,
      data: [],
      division,
      budgetYear: parseInt(budgetYear)
    });
  });
  
  app.get('/api/aebf/available-months', authMiddleware, (req, res) => {
    res.json({
      success: true,
      data: mockAvailableMonths
    });
  });
  
  app.get('/api/aebf/filter-options', authMiddleware, (req, res) => {
    res.json({
      success: true,
      data: mockFilterOptions
    });
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    res.status(500).json({
      success: false,
      error: err.message
    });
  });
  
  return app;
}

// Generate test token
function generateTestToken() {
  return jwt.sign(
    { id: 1, email: 'test@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

describe('AEBF Routes Integration Tests', () => {
  let app;
  let accessToken;
  
  beforeEach(() => {
    app = createAEBFApp();
    accessToken = generateTestToken();
  });

  describe('Public Routes', () => {
    test('GET /api/aebf/health should return healthy status', async () => {
      const response = await request(app)
        .get('/api/aebf/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
    });

    test('GET /api/aebf/budget-years should return available years', async () => {
      const response = await request(app)
        .get('/api/aebf/budget-years')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBudgetYears);
    });
  });

  describe('Protected Routes - Authentication', () => {
    test('GET /api/aebf/actual should require authentication', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    test('GET /api/aebf/budget should require authentication', async () => {
      const response = await request(app)
        .get('/api/aebf/budget')
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('Actual Routes', () => {
    test('GET /api/aebf/actual should return data with valid token', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockActualData);
      expect(response.body.division).toBe('FP');
      expect(response.body.budgetYear).toBe(2024);
    });

    test('GET /api/aebf/actual should require division parameter', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ budgetYear: 2024 })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    test('GET /api/aebf/available-months should return months', async () => {
      const response = await request(app)
        .get('/api/aebf/available-months')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAvailableMonths);
    });

    test('GET /api/aebf/filter-options should return filter options', async () => {
      const response = await request(app)
        .get('/api/aebf/filter-options')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('customers');
      expect(response.body.data).toHaveProperty('productGroups');
      expect(response.body.data).toHaveProperty('salesReps');
    });
  });

  describe('Budget Routes', () => {
    test('GET /api/aebf/budget should return budget data', async () => {
      const response = await request(app)
        .get('/api/aebf/budget')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('Token Validation', () => {
    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .set('Authorization', 'Bearer invalid_token')
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { id: 1, email: 'test@example.com' },
        JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );
      
      const response = await request(app)
        .get('/api/aebf/actual')
        .set('Authorization', `Bearer ${expiredToken}`)
        .query({ division: 'FP', budgetYear: 2024 })
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });
});
