# IPD26.10 PROJECT - ACTION PLAN
## Based on Bug Analysis Audit - 2025-11-21

---

## 📋 EXECUTIVE SUMMARY

**Total Estimated Effort:** 45-65 hours
**Priority Issues:** 5 Critical, 8 High, 15 Medium
**Current Risk Level:** MEDIUM-HIGH
**Target Risk Level:** LOW (after completion)

This action plan addresses security vulnerabilities, technical debt, and code quality issues identified in the comprehensive bug analysis audit. Issues are prioritized by severity and impact.

---

## 🚨 PHASE 1: CRITICAL SECURITY FIXES
**Timeline:** Week 1 (Days 1-3)
**Estimated Effort:** 8-12 hours
**Owner:** Backend Developer
**Status:** 🔴 URGENT

### Task 1.1: Remove Hardcoded Database Credentials
**Priority:** 🔴 CRITICAL
**Effort:** 1 hour
**Files:** `server/database/config.js`

**Actions:**
- [ ] Remove hardcoded password fallback `'654883'` from line 9
- [ ] Change database name from hardcoded `'fp_database'` to `process.env.DB_NAME`
- [ ] Add validation to fail if DB_PASSWORD is not set in production
- [ ] Update server README with environment variable requirements
- [ ] Verify .env file is in .gitignore

**Implementation:**
```javascript
// server/database/config.js
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database', // Fallback only for dev
  password: process.env.DB_PASSWORD, // NO FALLBACK
  port: process.env.DB_PORT || 5432,
};

// Add validation
if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD must be set in production environment');
}
```

**Verification:**
- [ ] Server fails to start without DB_PASSWORD in production mode
- [ ] No hardcoded credentials remain in codebase
- [ ] .env.example updated with clear instructions

---

### Task 1.2: Fix CORS Configuration
**Priority:** 🔴 CRITICAL
**Effort:** 1 hour
**Files:** `server/server.js:34-38`

**Actions:**
- [ ] Add `CORS_ORIGIN` to .env files
- [ ] Update CORS configuration to use environment variable
- [ ] Support multiple origins if needed (comma-separated)
- [ ] Document CORS setup in deployment guide

**Implementation:**
```javascript
// server/server.js
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
```

**Verification:**
- [ ] CORS works with production URL
- [ ] Development still works with localhost:3000
- [ ] Multiple origins supported if needed

---

### Task 1.3: Address XLSX Security Vulnerability
**Priority:** 🔴 HIGH
**Effort:** 3-4 hours
**Files:** `server/package.json`, all Excel parsing code

**Actions:**
- [ ] Research alternative Excel libraries (exceljs already installed)
- [ ] Evaluate risk: Is user-uploaded Excel data parsed? Or only trusted files?
- [ ] If user uploads: Migrate from `xlsx` to `exceljs` (more secure)
- [ ] If only trusted files: Add input validation and size limits
- [ ] Add security note in documentation

**Decision Matrix:**
| Scenario | Action | Priority |
|----------|--------|----------|
| User uploads Excel files | Migrate to exceljs | HIGH |
| Only internal/trusted files | Add validation, accept risk | MEDIUM |
| Files from external API | Add validation + consider migration | HIGH |

**Verification:**
- [ ] npm audit shows reduced vulnerabilities
- [ ] Excel parsing functionality still works
- [ ] File size limits enforced (e.g., max 10MB)

---

### Task 1.4: Synchronize Express Versions
**Priority:** 🔴 HIGH
**Effort:** 2-3 hours
**Files:** `package.json`, `server/package.json`

**Actions:**
- [ ] Audit Express 5 breaking changes
- [ ] **Decision:** Standardize on Express 4.18.2 (safer choice)
- [ ] Update root package.json to `"express": "^4.18.2"`
- [ ] Test all API endpoints after change
- [ ] Update any Express 5-specific code if found

**Implementation:**
```bash
# Root directory
npm install express@^4.18.2
npm test  # Run all tests
```

**Verification:**
- [ ] Both package.json files use same Express version
- [ ] Server starts without errors
- [ ] All API endpoints respond correctly
- [ ] No Express-related warnings in console

---

### Task 1.5: Fix body-parser Dependency Issue
**Priority:** 🔴 HIGH
**Effort:** 1 hour
**Files:** `server/server.js`, `server/package.json`

**Actions:**
- [ ] **Recommended:** Remove body-parser entirely (Express 4.18+ has built-in JSON parsing)
- [ ] Remove `const bodyParser = require('body-parser');` from line 5
- [ ] Remove `app.use(bodyParser.json());` from line 31
- [ ] Keep only `app.use(express.json());` on line 30
- [ ] Test all POST/PUT endpoints

**Implementation:**
```javascript
// server/server.js
// REMOVE line 5: const bodyParser = require('body-parser');
// REMOVE line 31: app.use(bodyParser.json());

// KEEP line 30:
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add for form data if needed
```

**Verification:**
- [ ] All POST/PUT requests work correctly
- [ ] JSON payloads parsed properly
- [ ] No body-parser references remain

---

## 🟡 PHASE 2: HIGH PRIORITY IMPROVEMENTS
**Timeline:** Week 1-2 (Days 4-10)
**Estimated Effort:** 16-20 hours
**Owner:** Full Stack Team

### Task 2.1: Implement Rate Limiting
**Priority:** 🟡 HIGH
**Effort:** 2-3 hours
**Files:** `server/server.js`, `server/package.json`

**Actions:**
- [ ] Install express-rate-limit: `npm install express-rate-limit`
- [ ] Add rate limiting middleware
- [ ] Configure different limits for different endpoint types
- [ ] Add rate limit headers to responses

**Implementation:**
```javascript
// server/server.js
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Stricter limiter for data upload endpoints
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: 'Too many uploads, please try again later.'
});

// Apply to routes
app.use('/api/', apiLimiter);
app.use('/api/upload', uploadLimiter);
```

**Verification:**
- [ ] Rate limits enforced correctly
- [ ] Appropriate error messages returned
- [ ] Legitimate users not impacted

---

### Task 2.2: Add Request Validation Middleware
**Priority:** 🟡 HIGH
**Effort:** 4-5 hours
**Files:** New middleware, all API routes

**Actions:**
- [ ] Install validation library: `npm install express-validator`
- [ ] Create validation middleware directory: `server/middleware/validators/`
- [ ] Add validators for key endpoints (sales, countries, date ranges)
- [ ] Implement validation error handler
- [ ] Apply to all data endpoints

**Implementation:**
```javascript
// server/middleware/validators/salesValidator.js
const { query, validationResult } = require('express-validator');

const validateSalesQuery = [
  query('year').isInt({ min: 2020, max: 2030 }).withMessage('Invalid year'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Invalid month'),
  query('division').optional().isIn(['FP', 'SB', 'TF', 'HCM']).withMessage('Invalid division'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = { validateSalesQuery };
```

**Usage:**
```javascript
// server/server.js
const { validateSalesQuery } = require('./middleware/validators/salesValidator');

app.get('/api/sales-by-country-db', validateSalesQuery, async (req, res) => {
  // Handler code
});
```

**Verification:**
- [ ] Invalid requests rejected with clear error messages
- [ ] Valid requests processed normally
- [ ] SQL injection attempts blocked

---

### Task 2.3: Refactor server.js - Phase 1 (Route Extraction)
**Priority:** 🟡 HIGH
**Effort:** 6-8 hours
**Files:** `server/server.js` (4,042 lines), new route files

**Actions:**
- [ ] Create route directory structure
- [ ] Extract routes into logical modules
- [ ] Maintain existing functionality
- [ ] Update imports and exports

**Directory Structure:**
```
server/
├── routes/
│   ├── aebf.js (already exists)
│   ├── budget-draft.js (already exists)
│   ├── divisionMergeRules.js (already exists)
│   ├── fp-routes.js (NEW)
│   ├── sb-routes.js (NEW)
│   ├── tf-routes.js (NEW)
│   ├── hcm-routes.js (NEW)
│   ├── sales-rep-routes.js (NEW)
│   ├── upload-routes.js (NEW)
│   ├── excel-routes.js (NEW)
│   └── health-routes.js (NEW)
├── middleware/
│   ├── validators/ (from Task 2.2)
│   └── errorHandler.js (NEW)
└── server.js (reduced to ~500 lines)
```

**Implementation Steps:**
1. Create `server/routes/fp-routes.js`:
```javascript
const express = require('express');
const router = express.Router();
const fpDataService = require('../database/FPDataService');

// Move all /api/fp/* routes here
router.get('/sales-reps', async (req, res) => {
  // Move handler code from server.js
});

// ... more routes

module.exports = router;
```

2. Update `server/server.js`:
```javascript
// Import routes
const fpRoutes = require('./routes/fp-routes');
const sbRoutes = require('./routes/sb-routes');
// ... etc

// Use routes
app.use('/api/fp', fpRoutes);
app.use('/api/sb', sbRoutes);
// ... etc
```

**Verification:**
- [ ] All endpoints still work
- [ ] No broken routes
- [ ] server.js reduced to < 800 lines
- [ ] Code more maintainable

---

### Task 2.4: Add Health Check Endpoint
**Priority:** 🟡 MEDIUM
**Effort:** 1-2 hours
**Files:** `server/routes/health-routes.js`, `server/server.js`

**Actions:**
- [ ] Create health check endpoint
- [ ] Include database connection status
- [ ] Add version information
- [ ] Return system status

**Implementation:**
```javascript
// server/routes/health-routes.js
const express = require('express');
const router = express.Router();
const { testConnection } = require('../database/config');
const packageJson = require('../../package.json');

router.get('/health', async (req, res) => {
  const dbConnected = await testConnection();

  const health = {
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: packageJson.version,
    services: {
      database: dbConnected ? 'connected' : 'disconnected',
      api: 'operational'
    },
    uptime: process.uptime()
  };

  const statusCode = dbConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
```

**Verification:**
- [ ] /health returns correct status
- [ ] /status always responds
- [ ] Useful for monitoring and load balancers

---

### Task 2.5: Cleanup Backup Files
**Priority:** 🟡 MEDIUM
**Effort:** 1 hour
**Files:** Multiple backup files

**Actions:**
- [ ] Review backup files for any unique content
- [ ] Remove confirmed duplicates
- [ ] Update .gitignore to prevent future backups

**Files to Remove:**
```
src/components/dashboard/SalesBySaleRepTable backup.js
src/components/dashboard/SalesBySalesRepTable backup.css
src/components/MasterData/AEBF/ActualTab.backup.js
server/data/financials - Copy.xlsx
server/data/fp_data main - Copy.xlsx
```

**Commands:**
```bash
# Review first
git status

# Remove backup files
del "src\components\dashboard\SalesBySaleRepTable backup.js"
del "src\components\dashboard\SalesBySalesRepTable backup.css"
del "src\components\MasterData\AEBF\ActualTab.backup.js"
del "server\data\financials - Copy.xlsx"
del "server\data\fp_data main - Copy.xlsx"

# Update .gitignore
echo *.backup.* >> .gitignore
echo *backup.js >> .gitignore
echo *- Copy.* >> .gitignore
```

**Verification:**
- [ ] No backup files remain in src/
- [ ] Git history preserves old versions
- [ ] .gitignore prevents future backups

---

### Task 2.6: Standardize Error Response Format
**Priority:** 🟡 MEDIUM
**Effort:** 3-4 hours
**Files:** All API routes, new error handler middleware

**Actions:**
- [ ] Create centralized error handler
- [ ] Define standard error format
- [ ] Update all API endpoints to use standard format
- [ ] Update frontend error handling

**Implementation:**
```javascript
// server/middleware/errorHandler.js
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  const response = {
    success: false,
    message: err.message || 'Internal Server Error',
    ...(err.errors && err.errors.length > 0 && { errors: err.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  console.error(`[Error] ${req.method} ${req.path}:`, err);

  res.status(statusCode).json(response);
};

module.exports = { ApiError, errorHandler };
```

**Standard Format:**
```javascript
// Success response
{
  success: true,
  data: { ... },
  message: "Operation successful" // optional
}

// Error response
{
  success: false,
  message: "Error description",
  errors: [ ... ] // optional, for validation errors
}
```

**Usage in routes:**
```javascript
const { ApiError } = require('../middleware/errorHandler');

app.get('/api/example', async (req, res, next) => {
  try {
    // ... code
    res.json({ success: true, data: result });
  } catch (error) {
    next(new ApiError(500, 'Failed to fetch data'));
  }
});

// Apply error handler last
app.use(errorHandler);
```

**Verification:**
- [ ] All errors follow standard format
- [ ] Frontend can handle errors consistently
- [ ] Proper status codes returned

---

## 🔵 PHASE 3: CODE QUALITY & PERFORMANCE
**Timeline:** Week 2-3 (Days 11-20)
**Estimated Effort:** 12-16 hours
**Owner:** Full Stack Team

### Task 3.1: Implement Logging System
**Priority:** 🔵 MEDIUM
**Effort:** 3-4 hours
**Files:** New logging module, update all console.log statements

**Actions:**
- [ ] Install Winston: `npm install winston`
- [ ] Create logger configuration
- [ ] Replace console.log with logger
- [ ] Configure log levels and transports
- [ ] Set up log rotation

**Implementation:**
```javascript
// server/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Console output for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
```

**Usage:**
```javascript
// Replace console.log
const logger = require('./utils/logger');

// Before: console.log('User logged in:', userId);
// After:  logger.info('User logged in', { userId });

// Before: console.error('Database error:', err);
// After:  logger.error('Database error', { error: err.message, stack: err.stack });
```

**Verification:**
- [ ] Logs written to files in production
- [ ] Console output in development
- [ ] Log levels work correctly
- [ ] Reduced console noise (256 → ~50 important logs)

---

### Task 3.2: Add Input Sanitization
**Priority:** 🔵 MEDIUM
**Effort:** 2-3 hours
**Files:** Backend validation middleware, frontend forms

**Actions:**
- [ ] Install sanitization libraries
- [ ] Add backend sanitization middleware
- [ ] Verify DOMPurify usage on frontend
- [ ] Document sanitization policy

**Backend Implementation:**
```javascript
// server/middleware/sanitizer.js
const validator = require('validator');

const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = validator.escape(req.query[key]);
      }
    });
  }

  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = validator.escape(req.body[key]);
      }
    });
  }

  next();
};

module.exports = sanitizeInput;
```

**Frontend Verification:**
```javascript
// Ensure DOMPurify is used for user-generated HTML
import DOMPurify from 'dompurify';

const SafeHTML = ({ html }) => {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
};
```

**Verification:**
- [ ] XSS attempts blocked
- [ ] SQL injection via input blocked
- [ ] Legitimate input not corrupted

---

### Task 3.3: Implement Frontend Code Splitting
**Priority:** 🔵 MEDIUM
**Effort:** 4-5 hours
**Files:** Frontend components, routing

**Actions:**
- [ ] Identify large component bundles
- [ ] Implement React.lazy() for route-level splitting
- [ ] Add Suspense fallbacks
- [ ] Lazy load heavy libraries (three.js, echarts)

**Implementation:**
```javascript
// src/App.js
import React, { Suspense, lazy } from 'react';

// Lazy load route components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ExecutiveSummary = lazy(() => import('./pages/ExecutiveSummary'));
const MasterData = lazy(() => import('./pages/MasterData'));

// Loading component
const LoadingFallback = () => (
  <div className="loading-spinner">Loading...</div>
);

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/executive" element={<ExecutiveSummary />} />
        <Route path="/master-data" element={<MasterData />} />
      </Routes>
    </Suspense>
  );
}
```

**Heavy Library Optimization:**
```javascript
// Lazy load echarts only when needed
const EChartsReact = lazy(() => import('echarts-for-react'));

// In component:
{showChart && (
  <Suspense fallback={<div>Loading chart...</div>}>
    <EChartsReact option={chartOptions} />
  </Suspense>
)}
```

**Verification:**
- [ ] Initial bundle size reduced by 30-50%
- [ ] Fast initial page load
- [ ] Smooth transitions between routes
- [ ] No loading flickering

---

### Task 3.4: Optimize State Management
**Priority:** 🔵 MEDIUM
**Effort:** 3-4 hours
**Files:** Context providers, potentially add Redux/Zustand

**Actions:**
- [ ] Audit current context usage
- [ ] Identify unnecessary re-renders
- [ ] Optimize context structure
- [ ] Consider Zustand for complex state

**Current Issue:**
```javascript
// src/App.js - Nested contexts cause re-render cascades
<ExcelDataProvider>
  <SalesDataProvider>
    <SalesRepReportsProvider>
      <FilterProvider>
        {/* App content */}
      </FilterProvider>
    </SalesRepReportsProvider>
  </SalesDataProvider>
</ExcelDataProvider>
```

**Option 1: Optimize Contexts (Quick Fix)**
```javascript
// Use memo and useMemo to prevent unnecessary re-renders
import { useMemo, memo } from 'react';

export const ExcelDataProvider = memo(({ children }) => {
  const [data, setData] = useState(null);

  const value = useMemo(() => ({
    data,
    setData,
    // ... other values
  }), [data]); // Only re-render when data changes

  return (
    <ExcelDataContext.Provider value={value}>
      {children}
    </ExcelDataContext.Provider>
  );
});
```

**Option 2: Migrate to Zustand (Better Long-term)**
```bash
npm install zustand
```

```javascript
// src/stores/salesStore.js
import create from 'zustand';

export const useSalesStore = create((set) => ({
  salesData: null,
  filters: {},
  setSalesData: (data) => set({ salesData: data }),
  setFilters: (filters) => set({ filters }),
}));

// Usage in component:
const { salesData, setSalesData } = useSalesStore();
```

**Verification:**
- [ ] Reduced re-renders (use React DevTools Profiler)
- [ ] Faster UI interactions
- [ ] No performance regressions

---

## 🧪 PHASE 4: TESTING & CI/CD
**Timeline:** Week 4 (Days 21-25)
**Estimated Effort:** 10-14 hours
**Owner:** QA + DevOps

### Task 4.1: Setup Basic E2E Tests with Playwright
**Priority:** 🔵 MEDIUM
**Effort:** 4-5 hours
**Files:** `tests/` directory (new)

**Actions:**
- [ ] Configure Playwright (already installed)
- [ ] Create test directory structure
- [ ] Write smoke tests for critical flows
- [ ] Document test execution

**Directory Structure:**
```
tests/
├── e2e/
│   ├── auth.spec.js
│   ├── dashboard.spec.js
│   ├── sales-data.spec.js
│   └── master-data.spec.js
├── fixtures/
│   └── test-data.json
└── playwright.config.js
```

**Sample Test:**
```javascript
// tests/e2e/dashboard.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Dashboard', () => {
  test('should load main dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check page title
    await expect(page).toHaveTitle(/Dashboard/);

    // Check key elements load
    await expect(page.locator('[data-testid="sales-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-cards"]')).toBeVisible();
  });

  test('should filter by division', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Select FP division
    await page.selectOption('select[name="division"]', 'FP');

    // Verify data updates
    await expect(page.locator('.division-label')).toHaveText('FP');
  });
});
```

**Configuration:**
```javascript
// playwright.config.js
module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};
```

**Verification:**
- [ ] Tests run successfully
- [ ] Critical user flows covered
- [ ] Easy to add new tests

---

### Task 4.2: Setup CI/CD Pipeline
**Priority:** 🔵 MEDIUM
**Effort:** 4-5 hours
**Files:** `.github/workflows/` (new)

**Actions:**
- [ ] Create GitHub Actions workflow
- [ ] Add automated testing
- [ ] Add build verification
- [ ] Optional: Add deployment automation

**Implementation:**
```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test-backend:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install server dependencies
        run: |
          cd server
          npm ci

      - name: Run backend tests
        run: |
          cd server
          npm test
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: test_db
          DB_USER: postgres
          DB_PASSWORD: test_password

  test-frontend:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Run Playwright tests
        run: |
          npx playwright install --with-deps
          npx playwright test

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-results
          path: test-results/

  lint:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present
```

**Package.json Scripts:**
```json
{
  "scripts": {
    "test": "echo 'Tests will be added'",
    "lint": "eslint src/ server/",
    "lint:fix": "eslint src/ server/ --fix"
  }
}
```

**Verification:**
- [ ] CI runs on every push
- [ ] Failed builds block merge
- [ ] Test results visible in GitHub

---

### Task 4.3: Add Unit Tests (Backend Services)
**Priority:** 🔵 LOW
**Effort:** 2-4 hours
**Files:** `server/__tests__/` (new)

**Actions:**
- [ ] Install Jest: `npm install --save-dev jest`
- [ ] Create test files for services
- [ ] Mock database connections
- [ ] Write tests for critical functions

**Example:**
```javascript
// server/__tests__/FPDataService.test.js
const fpDataService = require('../database/FPDataService');
const { pool } = require('../database/config');

// Mock database
jest.mock('../database/config');

describe('FPDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSalesReps returns array', async () => {
    const mockData = [
      { salesrep: 'John Doe', count: 10 }
    ];

    pool.query.mockResolvedValue({ rows: mockData });

    const result = await fpDataService.getSalesReps();

    expect(result).toEqual(mockData);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('handles database errors', async () => {
    pool.query.mockRejectedValue(new Error('DB Error'));

    await expect(fpDataService.getSalesReps()).rejects.toThrow('DB Error');
  });
});
```

**Verification:**
- [ ] Tests pass
- [ ] Coverage > 50% for services
- [ ] Easy to add more tests

---

## 📚 PHASE 5: DOCUMENTATION & CLEANUP
**Timeline:** Week 5 (Days 26-30)
**Estimated Effort:** 8-10 hours
**Owner:** Tech Lead

### Task 5.1: Consolidate Documentation
**Priority:** 🔵 LOW
**Effort:** 3-4 hours
**Files:** Multiple MD files, create organized docs/

**Actions:**
- [ ] Review existing documentation files
- [ ] Create unified documentation structure
- [ ] Consolidate duplicate information
- [ ] Remove outdated documents

**Current Files (from git status):**
```
DATABASE_INDEXING_AUDIT.md
DRAFT_FINAL_FEATURE_COMPLETE_SUMMARY.md
DRAFT_FINAL_QUICK_REFERENCE.md
LIVE_VERSION_WORKFLOW_EXPLAINED.md
REMOVED_REDUNDANT_SAVE_BUTTON.md
YEAR_TOTAL_ROW_IMPLEMENTATION.md
bug_analysis_report.md
ACTION_PLAN_IPD26.10.md (this file)
```

**Proposed Structure:**
```
docs/
├── README.md (main documentation)
├── SETUP.md (installation & environment setup)
├── ARCHITECTURE.md (system design)
├── API.md (API documentation)
├── DEPLOYMENT.md (production deployment guide)
├── CHANGELOG.md (version history)
├── audits/
│   ├── bug_analysis_report.md
│   └── DATABASE_INDEXING_AUDIT.md
├── feature-specs/
│   ├── aebf-workflow.md
│   ├── year-total-implementation.md
│   └── ui-improvements.md
└── archived/
    └── (old/outdated docs)
```

**Actions:**
1. Create docs/ directory structure
2. Consolidate feature specs into single files
3. Create comprehensive README.md
4. Archive or delete DRAFT_* files after review
5. Update root README.md with links to docs/

**Verification:**
- [ ] Clear documentation structure
- [ ] No duplicate information
- [ ] Easy for new developers to onboard

---

### Task 5.2: Create API Documentation
**Priority:** 🔵 LOW
**Effort:** 3-4 hours
**Files:** `docs/API.md` or Swagger setup

**Actions:**
- [ ] Document all API endpoints
- [ ] Include request/response examples
- [ ] Document error codes
- [ ] Optional: Setup Swagger/OpenAPI

**Manual Documentation:**
```markdown
# API Documentation

## Sales Endpoints

### GET /api/fp/sales-by-country-db
Retrieves sales data grouped by country for FP division.

**Query Parameters:**
- `year` (required): Integer, year (2020-2030)
- `month` (optional): Integer, month (1-12)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "country": "UAE",
      "sales": 150000,
      "count": 45
    }
  ]
}
```

**Error Responses:**
- 400: Invalid parameters
- 500: Server error
```

**Swagger Option (Better):**
```javascript
// Install: npm install swagger-jsdoc swagger-ui-express

// server/server.js
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IPD26.10 API',
      version: '1.0.0',
      description: 'Sales Analytics Dashboard API',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
  },
  apis: ['./routes/*.js'], // Path to API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// In route files, add JSDoc comments:
/**
 * @swagger
 * /api/fp/sales-by-country-db:
 *   get:
 *     summary: Get sales by country
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Success
 */
```

**Verification:**
- [ ] All endpoints documented
- [ ] Examples included
- [ ] API docs accessible at /api-docs

---

### Task 5.3: Create Deployment Guide
**Priority:** 🔵 MEDIUM
**Effort:** 2 hours
**Files:** `docs/DEPLOYMENT.md`

**Actions:**
- [ ] Document production setup steps
- [ ] List required environment variables
- [ ] Include database migration steps
- [ ] Document troubleshooting

**Template:**
```markdown
# Deployment Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 15+
- 2GB RAM minimum
- SSL certificate (for production)

## Environment Variables

### Required
```bash
NODE_ENV=production
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=IPDashboard
DB_USER=your-db-user
DB_PASSWORD=your-secure-password  # NEVER commit this
CORS_ORIGIN=https://yourdomain.com
```

### Optional
```bash
PORT=3001
LOG_LEVEL=info
```

## Deployment Steps

### 1. Setup Database
```bash
# Create database
createdb IPDashboard

# Run migrations
psql -d IPDashboard -f server/database/schema.sql
```

### 2. Install Dependencies
```bash
# Backend
cd server
npm ci --production

# Frontend
cd ..
npm ci
npm run build
```

### 3. Start Server
```bash
# Production mode
NODE_ENV=production node server/server.js

# Or with PM2
pm2 start server/server.js --name ipd-backend
```

## Monitoring
- Health check: `https://yourdomain.com/health`
- Logs: `server/logs/`

## Troubleshooting
[Common issues and solutions]
```

**Verification:**
- [ ] Deployment guide tested on clean environment
- [ ] All steps documented
- [ ] Troubleshooting section helpful

---

## 📊 TRACKING & METRICS

### Success Metrics

| Phase | Metric | Target | Current | Status |
|-------|--------|--------|---------|--------|
| 1 | Security vulnerabilities | 0 critical | 5 critical | 🔴 |
| 1 | Hardcoded secrets | 0 | 1 | 🔴 |
| 2 | API error consistency | 100% | ~60% | 🟡 |
| 2 | server.js lines | < 800 | 4,042 | 🔴 |
| 3 | Bundle size reduction | -30% | 0% | 🔴 |
| 3 | Console statements | < 50 | 256 | 🟡 |
| 4 | Test coverage | > 50% | 0% | 🔴 |
| 4 | CI/CD status | Passing | None | 🔴 |

### Progress Tracking Template

```markdown
## Week 1 Progress

### Completed ✅
- [x] Task 1.1: Removed hardcoded credentials
- [x] Task 1.2: Fixed CORS configuration

### In Progress 🟡
- [ ] Task 1.3: XLSX migration (60% complete)

### Blocked 🔴
- [ ] Task 2.3: Waiting for code review

### Next Week
- Task 2.4, 2.5, 2.6
```

---

## 🚦 RISK MANAGEMENT

### High Risk Items

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking API changes during refactor | HIGH | Comprehensive testing, gradual rollout |
| XLSX migration breaks upload | MEDIUM | Test thoroughly, keep rollback option |
| Performance regression from validation | LOW | Benchmark before/after |
| State management refactor breaks UI | MEDIUM | Feature flags, incremental migration |

### Rollback Plans

**If Phase 1 breaks production:**
1. Revert git commits: `git revert <commit-hash>`
2. Redeploy previous version
3. Review logs for specific failure
4. Fix in development environment
5. Re-test before re-deploy

**If Phase 2 refactor breaks APIs:**
1. Keep old server.js as server.backup.js during migration
2. Test each route module independently
3. Use feature flags to enable new routes gradually
4. Monitor error rates closely

---

## 📝 NOTES & ASSUMPTIONS

1. **Database Access:** Assumes PostgreSQL credentials will be provided securely
2. **Testing Environment:** Assumes separate test database available
3. **Deployment:** Assumes familiarity with Node.js deployment
4. **Downtime:** Phase 1-2 can be done with zero downtime if deployed carefully
5. **Team Size:** Assumes 1-2 developers working on this plan
6. **Priority:** Security fixes (Phase 1) should not be delayed

---

## 🎯 QUICK START CHECKLIST

### Week 1 Must-Do Items
- [ ] Remove hardcoded password from config.js
- [ ] Fix CORS to use environment variable
- [ ] Remove body-parser duplication
- [ ] Decide on Express version (recommend 4.18.2)
- [ ] Start XLSX vulnerability assessment

### First Day Actions
1. Back up current code: `git tag pre-action-plan`
2. Create feature branch: `git checkout -b security-fixes`
3. Update .env files with proper credentials
4. Test database connection
5. Begin Phase 1, Task 1.1

---

## 📞 SUPPORT & QUESTIONS

### Decision Points Requiring User Input

1. **XLSX Migration (Task 1.3):**
   - Are Excel files user-uploaded or only from trusted sources?
   - Can we migrate to exceljs or must we keep xlsx?

2. **Express Version (Task 1.4):**
   - Any specific reason for Express 5 in root package.json?
   - OK to standardize on Express 4.18.2?

3. **State Management (Task 3.4):**
   - Current performance issues with contexts?
   - Open to migrating to Zustand/Redux?

4. **Deployment (Phase 5):**
   - What's the target deployment platform? (AWS, Azure, Heroku, VPS)
   - Any existing CI/CD requirements?

---

## ✅ COMPLETION CRITERIA

### Phase 1 (Critical)
- ✅ No hardcoded credentials in code
- ✅ CORS configurable via environment
- ✅ Express version consistent
- ✅ Security audit shows no critical issues
- ✅ All endpoints functional after changes

### Phase 2 (High Priority)
- ✅ Rate limiting active on all APIs
- ✅ Request validation on data endpoints
- ✅ server.js under 800 lines
- ✅ All routes modularized
- ✅ Standard error format across APIs

### Phase 3 (Quality)
- ✅ Winston logging implemented
- ✅ Initial bundle size reduced 30%+
- ✅ No unnecessary re-renders
- ✅ Code quality improved

### Phase 4 (Testing)
- ✅ 10+ E2E tests passing
- ✅ CI pipeline active
- ✅ Tests run on every PR

### Phase 5 (Documentation)
- ✅ All docs consolidated
- ✅ API documented
- ✅ Deployment guide complete

---

**Document Version:** 1.0
**Created:** 2025-11-21
**Last Updated:** 2025-11-21
**Owner:** Development Team
**Status:** ACTIVE

---

## 🔄 CHANGELOG

### v1.0 - 2025-11-21
- Initial action plan created based on bug analysis audit
- 5 phases defined with 28 tasks
- Estimated 45-65 hours total effort
- Prioritized security fixes in Phase 1
