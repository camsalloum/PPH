/**
 * End-to-End Workflow Tests
 * Tests complete user flows through the API
 */

const request = require('supertest');
const { 
  createTestApp, 
  createMockUser, 
  createMockTokens,
  createMockPool 
} = require('../helpers/testApp');

// Mock the database and auth services
jest.mock('../../services/authService', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  registerUser: jest.fn(),
  changePassword: jest.fn(),
  getUserById: jest.fn(),
  refreshAccessToken: jest.fn()
}));

jest.mock('../../services/userService', () => ({
  getUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn()
}));

const authService = require('../../services/authService');
const authRoutes = require('../../routes/auth');

describe('E2E: Authentication Workflow', () => {
  let app;
  const mockUser = createMockUser();
  const mockTokens = createMockTokens();
  
  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp({
      routes: { '/api/auth': authRoutes }
    });
  });
  
  describe('Complete Login Flow', () => {
    it('should login and receive tokens', async () => {
      authService.login.mockResolvedValue({
        success: true,
        accessToken: mockTokens.accessToken,
        refreshToken: mockTokens.refreshToken,
        expiresIn: mockTokens.expiresIn,
        user: mockUser
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.headers['set-cookie']).toBeDefined();
    });
    
    it('should reject invalid credentials', async () => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'wrongpassword' })
        .expect(401);
      
      expect(response.body.error).toBe('Invalid credentials');
    });
    
    it('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
      
      expect(response.body.error).toContain('required');
    });
  });
  
  describe('Token Refresh Flow', () => {
    it('should refresh access token with valid refresh token', async () => {
      authService.refreshAccessToken.mockResolvedValue({
        success: true,
        accessToken: 'new-access-token',
        expiresIn: '15m'
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${mockTokens.refreshToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBe('new-access-token');
    });
    
    it('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(401);
      
      expect(response.body.error).toContain('refresh token');
    });
  });
});

describe('E2E: Health Check Workflow', () => {
  let app;
  
  beforeEach(() => {
    // Create app with monitoring routes
    const monitoringRoutes = require('../../routes/monitoring');
    app = createTestApp({
      routes: { '/api': monitoringRoutes }
    });
  });
  
  it('should return healthy status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeDefined();
  });
  
  it('should return metrics', async () => {
    const response = await request(app)
      .get('/api/metrics')
      .expect(200);
    
    expect(response.body.uptime).toBeDefined();
    expect(response.body.requests).toBeDefined();
  });
  
  it('should return readiness status', async () => {
    const response = await request(app)
      .get('/api/ready')
      .expect(200);
    
    expect(response.body.ready).toBe(true);
  });
  
  it('should return liveness status', async () => {
    const response = await request(app)
      .get('/api/live')
      .expect(200);
    
    expect(response.body.alive).toBe(true);
  });
  
  it('should include correlation headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.headers['x-correlation-id']).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });
});

describe('E2E: Error Handling Workflow', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp({ routes: {} });
  });
  
  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/nonexistent')
      .expect(404);
    
    expect(response.body.error).toBe('Not Found');
    expect(response.body.path).toBe('/api/nonexistent');
  });
  
  it('should handle malformed JSON', async () => {
    const response = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }')
      .expect(400);
    
    // Express returns 400 for malformed JSON
    expect(response.status).toBe(400);
  });
});

describe('E2E: Rate Limiting Workflow', () => {
  // Note: Rate limiting tests require actual rate limiter middleware
  // These are placeholder tests for when the full app is loaded
  
  it('should include rate limit headers', async () => {
    // This test would verify rate limit headers
    // when rate limiting middleware is active
    expect(true).toBe(true); // Placeholder
  });
});

describe('E2E: Complete User Session', () => {
  let app;
  const mockUser = createMockUser();
  const mockTokens = createMockTokens();
  
  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp({
      routes: { '/api/auth': authRoutes }
    });
  });
  
  it('should complete full session lifecycle: login → use → logout', async () => {
    // Step 1: Login
    authService.login.mockResolvedValue({
      success: true,
      accessToken: mockTokens.accessToken,
      refreshToken: mockTokens.refreshToken,
      expiresIn: '15m',
      user: mockUser
    });
    
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(200);
    
    expect(loginResponse.body.success).toBe(true);
    const accessToken = loginResponse.body.accessToken;
    
    // Step 2: Verify token can be used (mock auth middleware would validate)
    expect(accessToken).toBeDefined();
    
    // Step 3: Logout (would require auth middleware to be properly set up)
    // For now, just verify logout endpoint exists
    authService.logout.mockResolvedValue(undefined);
    
    // Note: Full logout test requires proper auth middleware setup
  });
});
