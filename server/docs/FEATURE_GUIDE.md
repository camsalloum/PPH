# IPD Application - Complete Feature Guide

## 🎯 Project Overview

The IPD (Industrial Parts Distribution) application is a full-stack enterprise solution for sales forecasting, budget management, and analytics. This document provides a comprehensive guide to all features and configurations.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Authentication System](#authentication-system)
4. [AEBF Module](#aebf-module)
5. [API Documentation](#api-documentation)
6. [Testing](#testing)
7. [Monitoring & Observability](#monitoring--observability)
8. [Deployment](#deployment)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis (optional, for session storage)
- Docker (optional, for containerized deployment)

### Installation

```bash
# Clone and install
cd server
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run migrate

# Start development server
npm run dev

# Run tests
npm test
```

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ipd_database
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Authentication
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=another-secret-key-min-32-chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Optional: Monitoring
SENTRY_DSN=your-sentry-dsn
SLACK_WEBHOOK_URL=your-slack-webhook
PAGERDUTY_ROUTING_KEY=your-pagerduty-key
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  React   │  │  Mobile  │  │  Admin   │  │   API    │   │
│  │   App    │  │   App    │  │  Portal  │  │  Client  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼─────────────┼─────────────┼─────────────┼─────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             │
┌────────────────────────────┼────────────────────────────────┐
│                      API Gateway                            │
│  ┌─────────────────────────┴─────────────────────────────┐ │
│  │              Express.js Application                    │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │ │
│  │  │  Auth   │ │  AEBF   │ │ Budget  │ │  Analytics  │ │ │
│  │  │ Routes  │ │ Routes  │ │ Routes  │ │   Routes    │ │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘ │ │
│  │       │           │           │             │         │ │
│  │  ┌────┴───────────┴───────────┴─────────────┴──────┐ │ │
│  │  │              Middleware Layer                    │ │ │
│  │  │  • JWT Auth  • Rate Limiting  • CORS            │ │ │
│  │  │  • Helmet    • Error Handler  • Metrics         │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────┐
│                      Data Layer                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │  PostgreSQL   │  │    Redis      │  │   File Store  │   │
│  │   Database    │  │    Cache      │  │    (Uploads)  │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication System

### JWT Token Flow

```
┌──────────┐     Login Request      ┌──────────┐
│  Client  │ ───────────────────────▶│  Server  │
└──────────┘                        └──────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │ Validate Credentials │
                              └─────────────────────┘
                                          │
     Access Token (15m)                   │
     Refresh Token (7d)                   ▼
┌──────────┐◀────────────────────── ┌──────────┐
│  Client  │                        │  Server  │
└──────────┘                        └──────────┘
```

### Token Refresh Mechanism

The frontend `authClient.js` handles automatic token refresh:

```javascript
import { AuthClient } from './utils/authClient';

const authClient = new AuthClient({
  baseUrl: '/api',
  refreshInterval: 12 * 60 * 1000, // 12 minutes
  onLogout: () => window.location.href = '/login'
});

// Login
await authClient.login(username, password);

// Make authenticated requests
const response = await authClient.request('/api/protected-route');

// Logout
authClient.logout();
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate user |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/logout` | POST | Logout and invalidate tokens |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/change-password` | POST | Change password |

---

## 📊 AEBF Module

**AEBF** = **A**ctual, **E**stimate, **B**udget, **F**orecast

The AEBF module provides comprehensive financial data management for sales tracking and forecasting.

### Features

- **Actual Data**: Historical sales data from completed transactions
- **Estimate Data**: Sales rep projections and estimates
- **Budget Data**: Approved budget allocations
- **Forecast Data**: AI-assisted predictions

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aebf/health` | GET | Module health check |
| `/api/aebf/data` | GET | Fetch AEBF data with filters |
| `/api/aebf/summary` | GET | Get summary statistics |
| `/api/aebf/export` | GET | Export data to Excel/CSV |

### Query Parameters

```
GET /api/aebf/data?
  year=2024&
  division=INDUSTRIAL&
  salesRep=john.doe&
  page=1&
  limit=50
```

---

## 📖 API Documentation

### Swagger UI

Access interactive API documentation at:
```
http://localhost:3000/api-docs
```

### OpenAPI Specification

All routes are documented with JSDoc Swagger annotations:

```javascript
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 */
```

---

## 🧪 Testing

### Test Structure

```
server/tests/
├── unit/              # Unit tests for individual functions
│   ├── auth.test.js
│   ├── jwt.test.js
│   └── ...
├── integration/       # Integration tests for API endpoints
│   └── routes.test.js
├── e2e/              # End-to-end workflow tests
│   └── workflows.test.js
├── load/             # Load testing with Artillery
│   ├── artillery.yml
│   ├── smoke.yml
│   ├── stress.yml
│   └── load.yml
└── helpers/          # Test utilities
    └── testApp.js
```

### Running Tests

```bash
# All unit tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Integration tests only
npm test -- --testPathPattern=integration

# E2E tests only
npm test -- --testPathPattern=e2e

# Load tests
npm run test:smoke     # Quick smoke test
npm run test:load      # Standard load test
npm run test:stress    # Stress test
```

### Test Coverage Requirements

- Statements: 80%
- Branches: 70%
- Functions: 80%
- Lines: 80%

---

## 📈 Monitoring & Observability

### Metrics Endpoint

Prometheus metrics available at:
```
GET /api/metrics
```

Metrics include:
- HTTP request counts and latencies
- Error rates by status code
- Memory and CPU usage
- Database connection pool status

### Health Checks

```bash
# Basic health
GET /api/health

# Detailed health with database status
GET /api/metrics/health

# Metrics summary (JSON)
GET /api/metrics/summary
```

### Grafana Dashboard

Import the pre-built dashboard:
```
server/monitoring/grafana-dashboard.json
```

Features:
- Request rate panels
- Error rate tracking
- Response time percentiles
- Memory/CPU usage gauges

### Error Tracking (Sentry)

Configure Sentry for production error monitoring:

```env
SENTRY_DSN=https://your-key@sentry.io/project
SENTRY_ENVIRONMENT=production
```

### Alerting

Webhooks configured in `config/alerting.js`:

```javascript
const { alert, templates } = require('./config/alerting');

// Send custom alert
await alert.error('High Error Rate', 'Error rate exceeded 5%', {
  metadata: { errorRate: 5.2 }
});

// Use predefined templates
await templates.databaseConnectionLost({ host: 'db.example.com' });
await templates.highErrorRate(5.2, 5.0);
```

Supported channels:
- **Slack**: Rich message blocks with severity colors
- **PagerDuty**: Critical incident alerting
- **Email**: SMTP-based alerts (configure SMTP settings)

---

## 🚢 Deployment

### Docker Deployment

```bash
# Build image
docker build -t ipd-server .

# Run with Docker Compose
docker-compose up -d
```

### Docker Compose Stack

```yaml
services:
  api:      # Node.js API server
  db:       # PostgreSQL database
  redis:    # Session/cache storage
  nginx:    # Reverse proxy
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure strong JWT secrets (32+ characters)
- [ ] Enable database SSL
- [ ] Set up rate limiting
- [ ] Configure CORS origins
- [ ] Enable Sentry error tracking
- [ ] Set up monitoring alerts
- [ ] Configure backup strategy

### Kubernetes (Helm)

```bash
helm install ipd ./helm/ipd \
  --set image.tag=v1.0.0 \
  --set database.host=postgres.example.com
```

---

## 🔒 Security

### Security Audit

Run the automated security audit:

```bash
node scripts/security-audit.js

# Generate report file
node scripts/security-audit.js --report
```

Checks include:
- npm vulnerability audit
- Environment configuration
- Authentication security
- Middleware configuration
- Database security
- Data exposure risks
- File upload security
- Security headers

### Security Best Practices

1. **JWT Tokens**
   - Short-lived access tokens (15 min)
   - Long-lived refresh tokens (7 days)
   - Token rotation on refresh

2. **Password Security**
   - bcrypt hashing with salt rounds
   - Minimum password requirements
   - Rate limiting on auth endpoints

3. **API Security**
   - Helmet security headers
   - CORS configuration
   - Request size limits
   - Input validation

4. **Database Security**
   - Parameterized queries
   - Connection pooling
   - SSL connections (production)

---

## 🔧 Troubleshooting

### Common Issues

#### OneDrive Sync Issues (macOS)

If experiencing ETIMEDOUT errors with node_modules:

```bash
# Option 1: Pause OneDrive sync
# Option 2: Move project outside OneDrive
# Option 3: Add node_modules to OneDrive exceptions
```

#### Database Connection Errors

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify connection string in .env
DB_HOST=localhost
DB_PORT=5432
```

#### JWT Token Errors

```javascript
// Error: jwt malformed
// Check token format and secret key

// Error: jwt expired
// Access token expired, use refresh endpoint
```

### Debug Mode

Enable debug logging:

```env
DEBUG=ipd:*
LOG_LEVEL=debug
```

### Health Check

```bash
# Quick system check
curl http://localhost:3000/api/health

# Detailed health
curl http://localhost:3000/api/metrics/health
```

---

## 📚 Additional Resources

- [API Reference](./docs/API_REFERENCE.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

---

## 🤝 Support

For issues and questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Search existing issues
3. Create a new issue with:
   - Environment details
   - Steps to reproduce
   - Expected vs actual behavior
   - Error logs

---

*Last updated: June 2025*
