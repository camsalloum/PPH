# 🔗 MODULE INTEGRATION GUIDE - PPH Estimate

**Integrating Existing Module into ProPackHub SaaS Platform**

**Source Project:** D:\PPH Estimate  
**Target Project:** D:\PPH 26.01 (ProPackHub)  
**Integration Type:** New Module in PEBI Application  
**Created:** February 4, 2026

---

## 📋 TABLE OF CONTENTS

1. [Understanding ProPackHub Architecture](#1-understanding-propackhub-architecture)
2. [Module Integration Strategy](#2-module-integration-strategy)
3. [Step-by-Step Integration](#3-step-by-step-integration)
4. [Database Integration](#4-database-integration)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Routing & Navigation](#6-routing--navigation)
7. [API Integration](#7-api-integration)
8. [Testing Integration](#8-testing-integration)
9. [Deployment Considerations](#9-deployment-considerations)

---

## 1. UNDERSTANDING PROPACKHUB ARCHITECTURE

### Current ProPackHub Structure

```
ProPackHub SaaS Platform
├── PEBI Application (Main App)
│   ├── MIS/IMS Module (Analytics, KPIs, Budgeting)
│   ├── CRM Module (Customer Management)
│   ├── MES Module (Manufacturing - Planned)
│   └── [NEW] Estimate Module ← Your PPH Estimate
│
├── Platform Administration (Multi-tenant)
├── Authentication System (JWT)
└── Shared Services (Database, API, Utils)
```

### Where Your Module Fits

Based on the ProPackHub architecture, your **PPH Estimate** project should become:

**Module Name:** Cost Estimation & Quoting  
**Category:** MES (Manufacturing Execution System)  
**Purpose:** Product costing, estimation, and quote generation

---

## 2. MODULE INTEGRATION STRATEGY

### Option A: Full Integration (Recommended)
- Merge PPH Estimate code into ProPackHub codebase
- Share authentication, database, and services
- Unified deployment and maintenance
- Single user experience

### Option B: Microservice Integration
- Keep PPH Estimate as separate service
- Integrate via API calls
- Independent deployment
- More complex but loosely coupled

**Recommendation:** Option A (Full Integration) for better user experience and easier maintenance.

---

## 3. STEP-BY-STEP INTEGRATION

### Phase 1: Analysis (Before Integration)

**Step 1: Analyze PPH Estimate Project**

Please provide the following information about your PPH Estimate project:

1. **Technology Stack:**
   - Frontend framework? (React, Vue, Angular, plain HTML?)
   - Backend? (Node.js, PHP, Python?)
   - Database? (PostgreSQL, MySQL, MongoDB?)

2. **Key Features:**
   - What does the estimate module do?
   - Main pages/components?
   - User roles?

3. **Database Schema:**
   - How many tables?
   - Main entities (products, estimates, quotes?)
   - Relationships?

4. **Current Authentication:**
   - How do users login?
   - Session management?
   - User roles?

5. **Dependencies:**
   - npm packages used?
   - External APIs?
   - Special libraries?

**Action:** Run these commands in PPH Estimate directory and share results:

```bash
cd "D:\PPH Estimate"

# Check if it's a Node.js project
type package.json

# Check if it's a React project
type src\App.jsx
# OR
type src\App.js

# Check backend
type server\index.js
# OR
type index.php

# List main directories
dir /B
```

### Phase 2: Preparation

**Step 2: Backup Both Projects**

```bash
# Backup ProPackHub
cd "D:\PPH 26.01"
git add .
git commit -m "Pre-integration backup"

# Backup PPH Estimate
cd "D:\PPH Estimate"
# Copy entire folder
xcopy "D:\PPH Estimate" "D:\PPH Estimate_BACKUP" /E /I /H
```

**Step 3: Create Integration Branch**

```bash
cd "D:\PPH 26.01"
git checkout -b feature/integrate-estimate-module
```

### Phase 3: Frontend Integration

**Step 4: Copy Frontend Components**

Assuming PPH Estimate is React-based:

```bash
cd "D:\PPH 26.01"

# Create estimate module directory
mkdir src\components\estimate

# Copy components from PPH Estimate
xcopy "D:\PPH Estimate\src\components\*" "src\components\estimate\" /E /I

# OR if different structure, adjust accordingly
```

**Step 5: Update Component Imports**

Update all imports in copied components to match ProPackHub structure:

```javascript
// ❌ OLD (PPH Estimate)
import { Button } from '../components/Button';
import api from '../services/api';

// ✅ NEW (ProPackHub)
import { Button } from '@ant-design/icons';  // Use ProPackHub's Ant Design
import { useAuth } from '../../contexts/AuthContext';  // Use ProPackHub auth
```

**Step 6: Create Module Entry Point**

Create: `src/components/estimate/EstimateModule.jsx`

```javascript
import React from 'react';
import { Routes, Route } from 'react-router-dom';

// Import your estimate components
import EstimateDashboard from './EstimateDashboard';
import CreateEstimate from './CreateEstimate';
import EstimateList from './EstimateList';
import EstimateDetail from './EstimateDetail';

const EstimateModule = () => {
  return (
    <div className="estimate-module">
      <Routes>
        <Route path="/" element={<EstimateDashboard />} />
        <Route path="/create" element={<CreateEstimate />} />
        <Route path="/list" element={<EstimateList />} />
        <Route path="/:id" element={<EstimateDetail />} />
      </Routes>
    </div>
  );
};

export default EstimateModule;
```

### Phase 4: Backend Integration

**Step 7: Copy Backend Routes**

```bash
cd "D:\PPH 26.01\server"

# Create estimate routes directory
mkdir routes\estimate

# Copy routes from PPH Estimate
xcopy "D:\PPH Estimate\server\routes\*" "routes\estimate\" /E /I
```

**Step 8: Update Backend Routes**

Update route files to use ProPackHub's authentication:

```javascript
// routes/estimate/index.js

const express = require('express');
const router = express.Router();

// Use ProPackHub's auth middleware
const { authenticateToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/auth');

// Your estimate routes
router.get('/estimates', authenticateToken, async (req, res) => {
  // Your logic here
  // Access user info: req.user
  // Access company: req.user.company_code
});

router.post('/estimates', authenticateToken, requireRole(['admin', 'sales_manager']), async (req, res) => {
  // Create estimate logic
});

module.exports = router;
```

**Step 9: Register Routes in Express**

Edit: `server/config/express.js`

```javascript
// Add estimate routes
const estimateRoutes = require('../routes/estimate');

// In the route registration section
app.use('/api/estimate', estimateRoutes);
```

### Phase 5: Database Integration

**Step 10: Export PPH Estimate Database Schema**

```bash
# If PPH Estimate has its own database
cd "D:\PPH Estimate"

# Export schema
pg_dump -U postgres -h localhost -d pph_estimate_db --schema-only > estimate_schema.sql

# Export data
pg_dump -U postgres -h localhost -d pph_estimate_db --data-only > estimate_data.sql
```

**Step 11: Create Migration for Estimate Tables**

Create: `server/migrations/400_create_estimate_tables.sql`

```sql
-- Cost Estimation Module Tables

-- Estimates table
CREATE TABLE IF NOT EXISTS fp_estimates (
  estimate_id SERIAL PRIMARY KEY,
  estimate_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
  sales_rep_id INTEGER,
  division_code VARCHAR(10) NOT NULL,
  
  -- Estimate details
  product_name VARCHAR(255),
  product_description TEXT,
  quantity NUMERIC(18,4),
  unit_of_measure VARCHAR(50),
  
  -- Costing
  material_cost NUMERIC(18,4),
  labor_cost NUMERIC(18,4),
  overhead_cost NUMERIC(18,4),
  total_cost NUMERIC(18,4),
  markup_percentage NUMERIC(5,2),
  quoted_price NUMERIC(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',  -- draft, submitted, approved, rejected, converted
  valid_until DATE,
  
  -- Audit
  created_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_estimate_customer (customer_id),
  INDEX idx_estimate_status (status),
  INDEX idx_estimate_division (division_code)
);

-- Estimate line items (if needed)
CREATE TABLE IF NOT EXISTS fp_estimate_items (
  item_id SERIAL PRIMARY KEY,
  estimate_id INTEGER REFERENCES fp_estimates(estimate_id) ON DELETE CASCADE,
  item_sequence INTEGER,
  
  -- Item details
  item_description VARCHAR(255),
  material_type VARCHAR(100),
  process_type VARCHAR(100),
  
  -- Quantities
  quantity NUMERIC(18,4),
  unit_cost NUMERIC(18,4),
  total_cost NUMERIC(18,4),
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Estimate history/audit trail
CREATE TABLE IF NOT EXISTS fp_estimate_history (
  history_id SERIAL PRIMARY KEY,
  estimate_id INTEGER REFERENCES fp_estimates(estimate_id) ON DELETE CASCADE,
  action VARCHAR(50),  -- created, updated, submitted, approved, rejected
  changed_by INTEGER REFERENCES users(user_id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  old_values JSONB,
  new_values JSONB,
  notes TEXT
);

-- Comments
COMMENT ON TABLE fp_estimates IS 'Cost estimates and quotes for customers';
COMMENT ON TABLE fp_estimate_items IS 'Line items for each estimate';
COMMENT ON TABLE fp_estimate_history IS 'Audit trail for estimate changes';
```

**Step 12: Run Migration**

```bash
cd "D:\PPH 26.01\server"

# Run migration
psql -U propackhub_user -d fp_database -f migrations/400_create_estimate_tables.sql

# Verify tables created
psql -U propackhub_user -d fp_database -c "\dt fp_estimate*"
```


---

## 4. DATABASE INTEGRATION

### Linking to Existing ProPackHub Data

**Step 13: Connect Estimate Tables to ProPackHub Tables**

Your estimate module should reference existing ProPackHub tables:

```sql
-- Link to customers
ALTER TABLE fp_estimates 
  ADD CONSTRAINT fk_estimate_customer 
  FOREIGN KEY (customer_id) 
  REFERENCES fp_customer_unified(customer_id);

-- Link to sales reps
ALTER TABLE fp_estimates 
  ADD CONSTRAINT fk_estimate_sales_rep 
  FOREIGN KEY (sales_rep_id) 
  REFERENCES fp_sales_rep_unified(sales_rep_id);

-- Link to users (for created_by)
ALTER TABLE fp_estimates 
  ADD CONSTRAINT fk_estimate_created_by 
  FOREIGN KEY (created_by) 
  REFERENCES users(user_id);
```

### Data Migration Strategy

If PPH Estimate has existing data:

```javascript
// server/scripts/migrate-estimate-data.js

const { Pool } = require('pg');

const sourcePool = new Pool({
  // PPH Estimate database
  host: 'localhost',
  database: 'pph_estimate_db',
  user: 'postgres',
  password: 'your_password'
});

const targetPool = new Pool({
  // ProPackHub database
  host: 'localhost',
  database: 'fp_database',
  user: 'propackhub_user',
  password: 'your_password'
});

async function migrateEstimates() {
  try {
    console.log('📥 Fetching estimates from PPH Estimate...');
    
    // Fetch from old database
    const oldEstimates = await sourcePool.query('SELECT * FROM estimates');
    
    console.log(`Found ${oldEstimates.rows.length} estimates to migrate`);
    
    // Insert into new database
    for (const estimate of oldEstimates.rows) {
      // Map old customer to new customer_id
      const customerResult = await targetPool.query(
        'SELECT customer_id FROM fp_customer_unified WHERE customer_name = $1',
        [estimate.customer_name]
      );
      
      const customer_id = customerResult.rows[0]?.customer_id;
      
      if (!customer_id) {
        console.warn(`⚠️  Customer not found: ${estimate.customer_name}`);
        continue;
      }
      
      // Insert estimate
      await targetPool.query(`
        INSERT INTO fp_estimates (
          estimate_number, customer_id, division_code,
          product_name, quantity, total_cost, quoted_price,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        estimate.estimate_number,
        customer_id,
        'FP',  // Default division
        estimate.product_name,
        estimate.quantity,
        estimate.total_cost,
        estimate.quoted_price,
        estimate.status,
        estimate.created_at
      ]);
      
      console.log(`✅ Migrated estimate: ${estimate.estimate_number}`);
    }
    
    console.log('✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

migrateEstimates();
```

---

## 5. AUTHENTICATION & AUTHORIZATION

### Using ProPackHub Authentication

**Step 14: Update Frontend to Use ProPackHub Auth**

Replace PPH Estimate's auth with ProPackHub's AuthContext:

```javascript
// In your estimate components

import React, { useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';

const CreateEstimate = () => {
  // Use ProPackHub's auth context
  const { user, isAuthenticated } = useContext(AuthContext);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  // Access user info
  console.log('Current user:', user.email);
  console.log('User role:', user.role);
  console.log('Company:', user.company_code);
  
  // Your component logic
  return (
    <div>
      <h1>Create Estimate</h1>
      {/* Your form */}
    </div>
  );
};
```

### Permission-Based Access

**Step 15: Add Estimate Permissions**

Add to: `ip_auth_database.permissions` table

```sql
-- Insert estimate permissions
INSERT INTO permissions (permission_name, description, module) VALUES
  ('estimate.view', 'View estimates', 'estimate'),
  ('estimate.create', 'Create new estimates', 'estimate'),
  ('estimate.edit', 'Edit estimates', 'estimate'),
  ('estimate.delete', 'Delete estimates', 'estimate'),
  ('estimate.approve', 'Approve estimates', 'estimate'),
  ('estimate.convert', 'Convert estimate to order', 'estimate');

-- Assign to roles
-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r, permissions p
WHERE r.role_name = 'admin' AND p.module = 'estimate';

-- Sales Manager gets most permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r, permissions p
WHERE r.role_name = 'sales_manager' 
  AND p.module = 'estimate'
  AND p.permission_name IN ('estimate.view', 'estimate.create', 'estimate.edit', 'estimate.approve');

-- Sales Rep gets basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r, permissions p
WHERE r.role_name = 'sales_rep' 
  AND p.module = 'estimate'
  AND p.permission_name IN ('estimate.view', 'estimate.create');
```

**Step 16: Protect Backend Routes**

```javascript
// server/routes/estimate/index.js

const { authenticateToken, requirePermission } = require('../../middleware/auth');

// View estimates - requires estimate.view permission
router.get('/estimates', 
  authenticateToken, 
  requirePermission('estimate.view'),
  async (req, res) => {
    // Your logic
  }
);

// Create estimate - requires estimate.create permission
router.post('/estimates', 
  authenticateToken, 
  requirePermission('estimate.create'),
  async (req, res) => {
    // Your logic
  }
);

// Approve estimate - requires estimate.approve permission
router.put('/estimates/:id/approve', 
  authenticateToken, 
  requirePermission('estimate.approve'),
  async (req, res) => {
    // Your logic
  }
);
```

---

## 6. ROUTING & NAVIGATION

### Adding Estimate Module to Navigation

**Step 17: Update Main App Routes**

Edit: `src/App.jsx`

```javascript
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Lazy load estimate module
const EstimateModule = lazy(() => import('./components/estimate/EstimateModule'));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Existing routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/crm/*" element={<CRMModule />} />
        
        {/* NEW: Estimate module routes */}
        <Route 
          path="/estimate/*" 
          element={
            <Suspense fallback={<div>Loading...</div>}>
              <EstimateModule />
            </Suspense>
          } 
        />
        
        {/* Other routes */}
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 18: Add to Main Navigation Menu**

Edit: `src/components/layout/Sidebar.jsx` (or wherever your menu is)

```javascript
import { 
  DashboardOutlined, 
  TeamOutlined, 
  CalculatorOutlined  // NEW: Icon for estimates
} from '@ant-design/icons';

const menuItems = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/dashboard'
  },
  {
    key: 'crm',
    icon: <TeamOutlined />,
    label: 'CRM',
    path: '/crm'
  },
  // NEW: Estimate menu item
  {
    key: 'estimate',
    icon: <CalculatorOutlined />,
    label: 'Cost Estimation',
    path: '/estimate',
    permission: 'estimate.view'  // Only show if user has permission
  },
  // ... other menu items
];
```

**Step 19: Add to Dashboard Cards**

Edit: `src/components/dashboard/Dashboard.jsx`

```javascript
// Add estimate card to dashboard
<Card 
  title="Cost Estimation" 
  onClick={() => navigate('/estimate')}
  style={{ cursor: 'pointer' }}
>
  <Statistic 
    title="Pending Estimates" 
    value={estimateStats.pending} 
    prefix={<CalculatorOutlined />}
  />
  <Statistic 
    title="This Month" 
    value={estimateStats.thisMonth} 
  />
</Card>
```

---

## 7. API INTEGRATION

### Sharing API Services

**Step 20: Create Estimate API Service**

Create: `src/services/estimateApi.js`

```javascript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Use ProPackHub's axios instance with auth
import { authClient } from '../utils/authClient';

export const estimateApi = {
  // Get all estimates
  getEstimates: async (filters = {}) => {
    const response = await authClient.get('/api/estimate/estimates', { params: filters });
    return response.data;
  },
  
  // Get single estimate
  getEstimate: async (id) => {
    const response = await authClient.get(`/api/estimate/estimates/${id}`);
    return response.data;
  },
  
  // Create estimate
  createEstimate: async (estimateData) => {
    const response = await authClient.post('/api/estimate/estimates', estimateData);
    return response.data;
  },
  
  // Update estimate
  updateEstimate: async (id, estimateData) => {
    const response = await authClient.put(`/api/estimate/estimates/${id}`, estimateData);
    return response.data;
  },
  
  // Delete estimate
  deleteEstimate: async (id) => {
    const response = await authClient.delete(`/api/estimate/estimates/${id}`);
    return response.data;
  },
  
  // Approve estimate
  approveEstimate: async (id) => {
    const response = await authClient.put(`/api/estimate/estimates/${id}/approve`);
    return response.data;
  },
  
  // Convert to order
  convertToOrder: async (id) => {
    const response = await authClient.post(`/api/estimate/estimates/${id}/convert`);
    return response.data;
  }
};
```

### Backend API Structure

**Step 21: Organize Backend Routes**

```
server/routes/estimate/
├── index.js              # Main router
├── estimates.js          # CRUD operations
├── costing.js            # Cost calculation logic
├── approval.js           # Approval workflow
└── conversion.js         # Convert estimate to order
```

Example: `server/routes/estimate/estimates.js`

```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../../middleware/auth');
const { pool } = require('../../config/database');

// GET /api/estimate/estimates - List all estimates
router.get('/', authenticateToken, requirePermission('estimate.view'), async (req, res) => {
  try {
    const { status, customer_id, division_code } = req.query;
    
    let query = `
      SELECT 
        e.*,
        c.customer_name,
        u.display_name as created_by_name
      FROM fp_estimates e
      LEFT JOIN fp_customer_unified c ON e.customer_id = c.customer_id
      LEFT JOIN users u ON e.created_by = u.user_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND e.status = $${params.length}`;
    }
    
    if (customer_id) {
      params.push(customer_id);
      query += ` AND e.customer_id = $${params.length}`;
    }
    
    if (division_code) {
      params.push(division_code);
      query += ` AND e.division_code = $${params.length}`;
    }
    
    query += ` ORDER BY e.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimates'
    });
  }
});

// POST /api/estimate/estimates - Create new estimate
router.post('/', authenticateToken, requirePermission('estimate.create'), async (req, res) => {
  try {
    const {
      customer_id,
      division_code,
      product_name,
      product_description,
      quantity,
      material_cost,
      labor_cost,
      overhead_cost,
      markup_percentage
    } = req.body;
    
    // Calculate total cost and quoted price
    const total_cost = parseFloat(material_cost) + parseFloat(labor_cost) + parseFloat(overhead_cost);
    const quoted_price = total_cost * (1 + parseFloat(markup_percentage) / 100);
    
    // Generate estimate number
    const estimateNumber = await generateEstimateNumber(division_code);
    
    const result = await pool.query(`
      INSERT INTO fp_estimates (
        estimate_number, customer_id, division_code,
        product_name, product_description, quantity,
        material_cost, labor_cost, overhead_cost, total_cost,
        markup_percentage, quoted_price,
        created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
      RETURNING *
    `, [
      estimateNumber, customer_id, division_code,
      product_name, product_description, quantity,
      material_cost, labor_cost, overhead_cost, total_cost,
      markup_percentage, quoted_price,
      req.user.user_id
    ]);
    
    // Log to history
    await pool.query(`
      INSERT INTO fp_estimate_history (estimate_id, action, changed_by, new_values)
      VALUES ($1, 'created', $2, $3)
    `, [result.rows[0].estimate_id, req.user.user_id, JSON.stringify(result.rows[0])]);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating estimate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create estimate'
    });
  }
});

// Helper function to generate estimate number
async function generateEstimateNumber(division_code) {
  const year = new Date().getFullYear();
  const result = await pool.query(`
    SELECT COUNT(*) as count 
    FROM fp_estimates 
    WHERE division_code = $1 
      AND EXTRACT(YEAR FROM created_at) = $2
  `, [division_code, year]);
  
  const count = parseInt(result.rows[0].count) + 1;
  return `${division_code}-EST-${year}-${String(count).padStart(4, '0')}`;
}

module.exports = router;
```


---

## 8. TESTING INTEGRATION

### Step 22: Test Checklist

**Frontend Testing:**
- [ ] Estimate module loads at `/estimate`
- [ ] Navigation menu shows "Cost Estimation"
- [ ] Dashboard card shows estimate statistics
- [ ] Create estimate form works
- [ ] Estimate list displays correctly
- [ ] Edit estimate works
- [ ] Delete estimate works
- [ ] Permissions are enforced (try with different user roles)

**Backend Testing:**
```bash
# Test API endpoints

# 1. Get all estimates
curl -X GET http://localhost:3001/api/estimate/estimates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 2. Create estimate
curl -X POST http://localhost:3001/api/estimate/estimates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "division_code": "FP",
    "product_name": "Custom Flexible Packaging",
    "quantity": 10000,
    "material_cost": 5000,
    "labor_cost": 2000,
    "overhead_cost": 1000,
    "markup_percentage": 25
  }'

# 3. Get single estimate
curl -X GET http://localhost:3001/api/estimate/estimates/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Update estimate
curl -X PUT http://localhost:3001/api/estimate/estimates/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "submitted"}'
```

**Database Testing:**
```sql
-- Verify tables created
\dt fp_estimate*

-- Check data
SELECT * FROM fp_estimates LIMIT 5;

-- Check relationships
SELECT 
  e.estimate_number,
  c.customer_name,
  e.quoted_price,
  e.status
FROM fp_estimates e
JOIN fp_customer_unified c ON e.customer_id = c.customer_id;
```

---

## 9. DEPLOYMENT CONSIDERATIONS

### Production Deployment

**Step 23: Update Deployment Scripts**

The estimate module will be deployed automatically with ProPackHub since it's fully integrated.

**Verify in deployment checklist:**
- [ ] Estimate tables created in production database
- [ ] Estimate permissions added to roles
- [ ] Estimate routes registered in Express
- [ ] Frontend build includes estimate components
- [ ] Nginx serves estimate routes correctly

### Environment Variables

If estimate module needs specific config, add to `.env`:

```bash
# Estimate Module Configuration
ESTIMATE_DEFAULT_MARKUP=25
ESTIMATE_APPROVAL_REQUIRED=true
ESTIMATE_VALIDITY_DAYS=30
```

### Migration Script for Production

Create: `server/migrations/400_create_estimate_tables.js`

```javascript
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    console.log('🔄 Running estimate module migration...');
    
    // Read SQL file
    const sqlFile = fs.readFileSync(
      path.join(__dirname, '400_create_estimate_tables.sql'),
      'utf8'
    );
    
    // Execute SQL
    await pool.query(sqlFile);
    
    console.log('✅ Estimate tables created successfully');
    
    // Add permissions
    await pool.query(`
      INSERT INTO permissions (permission_name, description, module) VALUES
        ('estimate.view', 'View estimates', 'estimate'),
        ('estimate.create', 'Create new estimates', 'estimate'),
        ('estimate.edit', 'Edit estimates', 'estimate'),
        ('estimate.delete', 'Delete estimates', 'estimate'),
        ('estimate.approve', 'Approve estimates', 'estimate'),
        ('estimate.convert', 'Convert estimate to order', 'estimate')
      ON CONFLICT (permission_name) DO NOTHING
    `);
    
    console.log('✅ Estimate permissions added');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
```

---

## 10. INTEGRATION CHECKLIST

### Complete Integration Checklist

**Phase 1: Analysis**
- [ ] Analyzed PPH Estimate project structure
- [ ] Identified technology stack
- [ ] Documented key features
- [ ] Mapped database schema
- [ ] Listed dependencies

**Phase 2: Preparation**
- [ ] Backed up ProPackHub project
- [ ] Backed up PPH Estimate project
- [ ] Created integration branch
- [ ] Reviewed ProPackHub architecture

**Phase 3: Frontend Integration**
- [ ] Copied components to `src/components/estimate/`
- [ ] Updated imports to use ProPackHub libraries
- [ ] Created EstimateModule.jsx entry point
- [ ] Updated component styling to match ProPackHub theme
- [ ] Replaced auth with ProPackHub AuthContext

**Phase 4: Backend Integration**
- [ ] Copied routes to `server/routes/estimate/`
- [ ] Updated routes to use ProPackHub auth middleware
- [ ] Registered routes in Express config
- [ ] Created estimate API service
- [ ] Added error handling and logging

**Phase 5: Database Integration**
- [ ] Created estimate tables migration
- [ ] Added foreign keys to ProPackHub tables
- [ ] Migrated existing data (if any)
- [ ] Added database indexes
- [ ] Verified relationships

**Phase 6: Authentication & Authorization**
- [ ] Added estimate permissions to database
- [ ] Assigned permissions to roles
- [ ] Protected backend routes with permissions
- [ ] Updated frontend to check permissions
- [ ] Tested with different user roles

**Phase 7: Navigation & Routing**
- [ ] Added estimate routes to App.jsx
- [ ] Added estimate to navigation menu
- [ ] Added estimate card to dashboard
- [ ] Tested all routes work correctly

**Phase 8: Testing**
- [ ] Tested frontend components
- [ ] Tested backend API endpoints
- [ ] Tested database queries
- [ ] Tested permissions enforcement
- [ ] Tested with different user roles
- [ ] Fixed any bugs found

**Phase 9: Documentation**
- [ ] Updated README.md
- [ ] Documented estimate module features
- [ ] Created user guide for estimate module
- [ ] Updated API documentation

**Phase 10: Deployment**
- [ ] Merged integration branch to main
- [ ] Ran migrations on production database
- [ ] Deployed to production
- [ ] Verified estimate module works in production
- [ ] Monitored for errors

---

## 11. COMMON ISSUES & SOLUTIONS

### Issue 1: Import Errors

**Problem:** Components can't find imports after moving to ProPackHub

**Solution:**
```javascript
// Update all relative imports
// ❌ OLD
import Button from '../components/Button';

// ✅ NEW
import { Button } from 'antd';  // Use ProPackHub's Ant Design
```

### Issue 2: Authentication Not Working

**Problem:** Estimate module can't access user info

**Solution:**
```javascript
// Use ProPackHub's AuthContext
import { useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';

const { user, isAuthenticated } = useContext(AuthContext);
```

### Issue 3: Database Connection Errors

**Problem:** Estimate routes can't connect to database

**Solution:**
```javascript
// Use ProPackHub's database pool
const { pool } = require('../../config/database');

// NOT: Create new pool
```

### Issue 4: Styling Conflicts

**Problem:** Estimate components look different from ProPackHub

**Solution:**
```javascript
// Use ProPackHub's theme
import '../../styles/themes.css';

// Use Ant Design components for consistency
import { Card, Table, Button, Form } from 'antd';
```

### Issue 5: Permission Denied

**Problem:** Users can't access estimate module

**Solution:**
```sql
-- Verify permissions are assigned
SELECT r.role_name, p.permission_name
FROM roles r
JOIN role_permissions rp ON r.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.permission_id
WHERE p.module = 'estimate';

-- Assign missing permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r, permissions p
WHERE r.role_name = 'sales_manager' 
  AND p.permission_name = 'estimate.view';
```

---

## 12. NEXT STEPS

### Immediate Actions

1. **Analyze PPH Estimate Project**
   ```bash
   cd "D:\PPH Estimate"
   
   # Share these files with me:
   type package.json
   type README.md
   dir /B src\components
   dir /B server\routes
   ```

2. **Provide Project Details**
   - What does PPH Estimate do?
   - What are the main features?
   - How many tables in the database?
   - What's the current tech stack?

3. **Plan Integration Timeline**
   - When do you want to integrate?
   - Any critical features that must work?
   - Any data that must be migrated?

### After Integration

1. **Test Thoroughly**
   - Test all estimate features
   - Test with different user roles
   - Test data migration (if any)

2. **Train Users**
   - Create user guide
   - Show how to access estimate module
   - Explain new workflow

3. **Monitor**
   - Watch for errors in logs
   - Check database performance
   - Get user feedback

---

## 13. SUPPORT & ASSISTANCE

### What I Need From You

To help you integrate PPH Estimate, please provide:

1. **Project Structure:**
   ```bash
   cd "D:\PPH Estimate"
   tree /F /A > project_structure.txt
   # Share project_structure.txt
   ```

2. **Package.json:**
   ```bash
   type package.json
   ```

3. **Main Components:**
   ```bash
   dir /B src\components
   ```

4. **Database Schema:**
   ```bash
   # If you have a schema file
   type database\schema.sql
   
   # OR export from database
   pg_dump -U postgres -d pph_estimate_db --schema-only > schema.sql
   ```

5. **Screenshots:**
   - Main pages of PPH Estimate
   - Key features you want to keep

### What I Can Help With

Once you provide the above information, I can:

1. Create specific migration scripts for your data
2. Update your components to work with ProPackHub
3. Create API routes that match your current functionality
4. Write database migrations for your tables
5. Set up permissions for your module
6. Create integration tests
7. Update documentation

---

## 📞 READY TO START?

**Step 1:** Share PPH Estimate project details (see section 13)

**Step 2:** I'll create custom integration scripts for your specific project

**Step 3:** Follow the integration checklist step-by-step

**Step 4:** Test and deploy!

---

**Document Version:** 1.0  
**Created:** February 4, 2026  
**Status:** Awaiting PPH Estimate project details

**Next:** Please share the information from section 13 so I can create specific integration scripts for your project.
