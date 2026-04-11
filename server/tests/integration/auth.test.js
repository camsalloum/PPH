/**
 * @fileoverview Integration Tests for Authentication with Refresh Tokens
 * Tests authentication flows using isolated test app
 * @module tests/integration/auth.test
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Test secrets
const JWT_SECRET = 'test-secret-key';
const JWT_REFRESH_SECRET = 'test-refresh-secret';

// Mock user database
const mockUsers = new Map([
  ['test@example.com', {
    id: 1,
    email: 'test@example.com',
    password: '$2a$10$test.hash', // Mocked hash
    name: 'Test User',
    role: 'admin'
  }]
]);

// Mock refresh tokens
const validRefreshTokens = new Set();

// Create test app with auth routes
function createAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  // Mock login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    const user = mockUsers.get(email);
    
    if (!user || password !== 'Test123!') {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    validRefreshTokens.add(refreshToken);
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    res.json({
      success: true,
      accessToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  });
  
  // Mock refresh endpoint
  app.post('/api/auth/refresh', (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'No refresh token provided',
        requireLogin: true
      });
    }
    
    try {
      if (!validRefreshTokens.has(refreshToken)) {
        throw new Error('Invalid refresh token');
      }
      
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
      
      const newAccessToken = jwt.sign(
        { id: decoded.id, email: decoded.email },
        JWT_SECRET,
        { expiresIn: '15m' }
      );
      
      res.json({
        success: true,
        accessToken: newAccessToken,
        expiresIn: 900
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        requireLogin: true
      });
    }
  });
  
  // Mock logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      validRefreshTokens.delete(refreshToken);
    }
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  });
  
  // Mock me endpoint (requires auth)
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = mockUsers.get(decoded.email);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
  });
  
  return app;
}

describe('Authentication Integration Tests', () => {
  let app;
  let accessToken;
  let refreshTokenCookie;
  
  const testUser = {
    email: 'test@example.com',
    password: 'Test123!'
  };

  beforeEach(() => {
    app = createAuthApp();
    validRefreshTokens.clear();
  });

  describe('POST /api/auth/login', () => {
    test('should login successfully and return access token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(testUser)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn', 900);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
      
      // Should set refresh token cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      
      accessToken = response.body.accessToken;
      refreshTokenCookie = refreshCookie;
    });

    test('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
        .expect(401);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    test('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    beforeEach(async () => {
      // Login first to get tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(testUser);
      
      accessToken = loginResponse.body.accessToken;
      refreshTokenCookie = loginResponse.headers['set-cookie'].find(c => c.startsWith('refreshToken='));
    });

    test('should refresh access token with valid cookie', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshTokenCookie])
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn', 900);
    });

    test('should fail without refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(401);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'No refresh token provided');
      expect(response.body).toHaveProperty('requireLogin', true);
    });

    test('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=invalid_token'])
        .expect(401);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('requireLogin', true);
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(testUser);
      
      accessToken = loginResponse.body.accessToken;
      refreshTokenCookie = loginResponse.headers['set-cookie'].find(c => c.startsWith('refreshToken='));
    });

    test('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [refreshTokenCookie])
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
    });

    test('should invalidate refresh token after logout', async () => {
      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [refreshTokenCookie])
        .expect(200);
      
      // Try to refresh - should fail
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshTokenCookie])
        .expect(401);
      
      expect(response.body).toHaveProperty('requireLogin', true);
    });
  });

  describe('GET /api/auth/me', () => {
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(testUser);
      
      accessToken = loginResponse.body.accessToken;
    });

    test('should return user data with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });

    test('should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);
      
      expect(response.body).toHaveProperty('success', false);
    });

    test('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });
});
