# 🖥️ CRM FRONTEND IMPLEMENTATION GUIDE
## Ready-to-Build Reference

**For:** December 29, 2025 Session  
**Prerequisite:** CRM_DATABASE_FOUNDATION_COMPLETE.md
**Last Updated:** January 3, 2026

---

## 🎨 CSS STYLING GUIDELINES

### ⚠️ IMPORTANT: Use Separate CSS Files - NOT Inline Styles

All CRM components should use the centralized `CRM.css` file for styling instead of inline styles.

**Location:** `src/components/CRM/CRM.css`

### CSS Class Naming Convention
```css
/* Component classes */
.crm-page-title          /* Page headers with icon + title */
.crm-table-card          /* Cards containing tables */
.crm-section-card        /* General section cards */
.crm-metric-card         /* KPI/metric display cards */
.crm-info-card           /* Information display cards */
.crm-loading             /* Loading spinner containers */
.crm-animate-in          /* Entry animations */

/* Text utilities */
.crm-text-xs             /* 11px font size */
.crm-text-sm             /* 12px font size */
.crm-text-primary        /* Primary blue color */
.crm-text-success        /* Green color */

/* Spacing utilities */
.crm-row-mb-8            /* margin-bottom: 8px */
.crm-row-mb-16           /* margin-bottom: 16px */
.crm-row-mb-20           /* margin-bottom: 20px */
.crm-row-mb-24           /* margin-bottom: 24px */
.crm-row-mb-32           /* margin-bottom: 32px */

/* Layout utilities */
.crm-select-full-width   /* width: 100% for Select components */
.crm-header-space        /* Header row with space-between */
```

### When Inline Styles ARE Acceptable
Only use inline styles for **dynamic values** that cannot be predetermined:
```jsx
// ✅ ACCEPTABLE - Dynamic color from data
<div className="crm-legend-dot" style={{ background: item.color }} />

// ✅ ACCEPTABLE - Dynamic color from props
<Avatar style={{ backgroundColor: getAvatarColor(name) }} />

// ❌ AVOID - Static styles should be in CSS
<div style={{ marginBottom: 16, fontSize: 12 }} />  // Use CSS class instead
```

### Component Template
```jsx
import React from 'react';
import './CRM.css';  // Always import the CSS file

const MyComponent = () => {
  return (
    <div className="crm-my-component crm-animate-in">
      <div className="crm-page-title">
        <Icon />
        <Title level={2}>Page Title</Title>
      </div>
      
      <Card className="crm-table-card crm-row-mb-16">
        {/* Content */}
      </Card>
    </div>
  );
};
```

---

## 📦 BACKEND READY - DATA ACCESS

### Sales Reps Query
```sql
-- From ip_auth_database
SELECT * FROM crm_sales_reps ORDER BY full_name;
-- Returns: employee_id, full_name, user_id, email, designation, department, group_members, type
```

### Customers Query
```sql
-- From fp_database
SELECT * FROM fp_customer_master WHERE is_active = true ORDER BY customer_name;
-- 572 customers with codes, countries, sales reps, transaction history
```

### Products Query
```sql
-- From fp_database
SELECT * FROM crm_product_groups WHERE is_active = true ORDER BY display_order, product_group;
-- 13 product groups with CRM parameters
```

---

## 🗂️ SUGGESTED FILE STRUCTURE

```
src/
├── components/
│   └── CRM/
│       ├── CRMDashboard.jsx          # Main CRM landing page
│       ├── CRMLayout.jsx             # CRM layout wrapper with sidebar
│       ├── 
│       ├── SalesReps/
│       │   ├── SalesRepList.jsx      # Team directory
│       │   └── SalesRepCard.jsx      # Individual rep card
│       │
│       ├── Customers/
│       │   ├── CustomerList.jsx      # Customer table with search
│       │   ├── CustomerDetail.jsx    # 360° customer view
│       │   ├── CustomerCard.jsx      # Summary card
│       │   └── CustomerFilters.jsx   # Filter sidebar
│       │
│       └── Products/
│           ├── ProductGroupList.jsx  # Product admin table
│           └── ProductGroupEdit.jsx  # Edit CRM parameters
│
├── services/
│   └── crmService.js                 # API calls for CRM
│
└── contexts/
    └── CRMContext.js                 # CRM state management (optional)
```

---

## 🔌 API ENDPOINTS TO CREATE

### File: `server/routes/crm.js`

```javascript
const express = require('express');
const router = express.Router();
const { pool, authPool } = require('../database/config');

// GET /api/crm/sales-reps
router.get('/sales-reps', async (req, res) => {
  const result = await authPool.query('SELECT * FROM crm_sales_reps ORDER BY full_name');
  res.json({ success: true, data: result.rows });
});

// GET /api/crm/customers
router.get('/customers', async (req, res) => {
  const { search, country, salesRep, limit = 50, offset = 0 } = req.query;
  // Build dynamic query with filters
  let query = 'SELECT * FROM fp_customer_master WHERE is_active = true';
  const params = [];
  
  if (search) {
    params.push(`%${search}%`);
    query += ` AND customer_name ILIKE $${params.length}`;
  }
  if (country) {
    params.push(country);
    query += ` AND country = $${params.length}`;
  }
  if (salesRep) {
    params.push(salesRep);
    query += ` AND sales_rep = $${params.length}`;
  }
  
  query += ` ORDER BY customer_name LIMIT ${limit} OFFSET ${offset}`;
  
  const result = await pool.query(query, params);
  res.json({ success: true, data: result.rows });
});

// GET /api/crm/customers/:id
router.get('/customers/:id', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM fp_customer_master WHERE id = $1',
    [req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

// GET /api/crm/products
router.get('/products', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM crm_product_groups WHERE is_active = true ORDER BY display_order, product_group'
  );
  res.json({ success: true, data: result.rows });
});

// PUT /api/crm/products/:id
router.put('/products/:id', async (req, res) => {
  const { 
    is_active, display_order, description,
    min_order_qty, min_order_value, lead_time_days,
    commission_rate, monthly_target, target_margin_pct, price_floor,
    sales_notes, internal_notes 
  } = req.body;
  
  const result = await pool.query(`
    UPDATE crm_product_groups SET
      is_active = COALESCE($2, is_active),
      display_order = COALESCE($3, display_order),
      description = COALESCE($4, description),
      min_order_qty = COALESCE($5, min_order_qty),
      min_order_value = COALESCE($6, min_order_value),
      lead_time_days = COALESCE($7, lead_time_days),
      commission_rate = COALESCE($8, commission_rate),
      monthly_target = COALESCE($9, monthly_target),
      target_margin_pct = COALESCE($10, target_margin_pct),
      price_floor = COALESCE($11, price_floor),
      sales_notes = COALESCE($12, sales_notes),
      internal_notes = COALESCE($13, internal_notes),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [req.params.id, is_active, display_order, description,
      min_order_qty, min_order_value, lead_time_days,
      commission_rate, monthly_target, target_margin_pct, price_floor,
      sales_notes, internal_notes]);
  
  res.json({ success: true, data: result.rows[0] });
});

module.exports = router;
```

---

## 🎨 COMPONENT TEMPLATES

### CRM Dashboard (Landing Page)

```jsx
// src/components/CRM/CRMDashboard.jsx
import React, { useState, useEffect } from 'react';
import './CRM.css';

const CRMDashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeReps: 0,
    productGroups: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const [customers, reps, products] = await Promise.all([
      fetch('/api/crm/customers?limit=1').then(r => r.json()),
      fetch('/api/crm/sales-reps').then(r => r.json()),
      fetch('/api/crm/products').then(r => r.json())
    ]);
    
    setStats({
      totalCustomers: customers.total || 572,
      activeReps: reps.data?.length || 0,
      productGroups: products.data?.length || 0
    });
  };

  return (
    <div className="crm-dashboard">
      <h1>CRM Dashboard</h1>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Customers</h3>
          <span className="stat-value">{stats.totalCustomers}</span>
        </div>
        <div className="stat-card">
          <h3>Sales Team</h3>
          <span className="stat-value">{stats.activeReps}</span>
        </div>
        <div className="stat-card">
          <h3>Product Groups</h3>
          <span className="stat-value">{stats.productGroups}</span>
        </div>
      </div>
      
      {/* Quick links */}
      <div className="quick-links">
        <a href="/crm/customers">View Customers →</a>
        <a href="/crm/products">Manage Products →</a>
        <a href="/crm/team">Sales Team →</a>
      </div>
    </div>
  );
};

export default CRMDashboard;
```

### Customer List

```jsx
// src/components/CRM/Customers/CustomerList.jsx
import React, { useState, useEffect } from 'react';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomers();
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    const url = `/api/crm/customers?search=${encodeURIComponent(search)}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    setCustomers(data.data || []);
    setLoading(false);
  };

  return (
    <div className="customer-list">
      <h2>Customers ({customers.length})</h2>
      
      <input 
        type="text"
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-input"
      />
      
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="customer-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Customer Name</th>
              <th>Country</th>
              <th>Sales Rep</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td>{c.customer_code}</td>
                <td>{c.customer_name}</td>
                <td>{c.country}</td>
                <td>{c.sales_rep}</td>
                <td>{c.total_transactions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CustomerList;
```

---

## 🛤️ ROUTING

### Add to App.jsx or Router

```jsx
import CRMDashboard from './components/CRM/CRMDashboard';
import CustomerList from './components/CRM/Customers/CustomerList';
import CustomerDetail from './components/CRM/Customers/CustomerDetail';
import ProductGroupList from './components/CRM/Products/ProductGroupList';
import SalesRepList from './components/CRM/SalesReps/SalesRepList';

// In routes:
<Route path="/crm" element={<CRMDashboard />} />
<Route path="/crm/customers" element={<CustomerList />} />
<Route path="/crm/customers/:id" element={<CustomerDetail />} />
<Route path="/crm/products" element={<ProductGroupList />} />
<Route path="/crm/team" element={<SalesRepList />} />
```

---

## ✅ TOMORROW'S CHECKLIST

- [ ] Create `server/routes/crm.js` with API endpoints
- [ ] Register route in `server/index.js`
- [ ] Create `src/components/CRM/` folder structure
- [ ] Build CRMDashboard component
- [ ] Build CustomerList with search
- [ ] Build ProductGroupList with edit
- [ ] Add CRM to main navigation
- [ ] Test all endpoints

---

**Ready to build!** 🚀
