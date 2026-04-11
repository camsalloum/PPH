# 🎯 SALES REP PORTAL & CRM IMPLEMENTATION PLAN
## Phased Implementation Guide

**Created:** December 29, 2025  
**Goal:** Role-based Sales Rep Portal with integrated CRM functionality  
**User:** Each sales rep sees only their own data

---

## 📋 EXECUTIVE SUMMARY

### What We're Building

When a Sales Rep (e.g., Narek Koroukian) logs in:
1. **Landing Page:** Personal KPIs Summary (like the attached report)
2. **My Customers:** Only customers assigned to this rep
3. **CRM Functions:** Leads, Activities, Follow-ups, Opportunities
4. **Reports:** Product groups, countries, customer analysis (filtered to this rep)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SALES REP PORTAL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Dashboard  │  │ My Customers│  │  CRM/Leads  │             │
│  │  (KPIs)     │  │ (Assigned)  │  │ (New/Exist) │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Activities  │  │  Targets &  │  │  Reports    │             │
│  │ Log (Calls, │  │  Budget     │  │  (Filtered) │             │
│  │ Visits)     │  │  Progress   │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗓️ IMPLEMENTATION PHASES

### PHASE 1: Sales Rep Dashboard (Landing Page)
**Duration:** 2-3 days  
**Status:** 🔵 FIRST PRIORITY

| Component | Description |
|-----------|-------------|
| `SalesRepPortal.jsx` | Main wrapper/layout |
| `SalesRepDashboard.jsx` | KPIs summary page |
| Route protection | Filter data by logged-in user |
| API endpoints | `/api/crm/my-dashboard` |

**KPIs to Display:**
- Sales (AED) - Current vs Budget vs Last Year
- Volume (KGS) - Current vs Budget vs Last Year
- Gross Profit % 
- Top 5 Customers
- Top 5 Product Groups
- Monthly Trend Chart
- Budget Achievement %

---

### PHASE 2: My Customers Module
**Duration:** 2-3 days  
**Depends on:** Phase 1

| Component | Description |
|-----------|-------------|
| `MyCustomerList.jsx` | Customer table (assigned only) |
| `MyCustomerDetail.jsx` | 360° customer view |
| `CustomerActivity.jsx` | Activity history per customer |
| API endpoints | `/api/crm/my-customers` |

**Features:**
- Search & filter customers
- Customer 360° view (sales history, contacts, products)
- Quick actions (log call, schedule visit)
- Customer classification (A/B/C)

---

### PHASE 3: CRM Activities & Interactions
**Duration:** 3-4 days  
**Depends on:** Phase 2

| Component | Description |
|-----------|-------------|
| `ActivityLogger.jsx` | Log calls/visits/emails |
| `ActivityTimeline.jsx` | Activity history |
| `FollowUpManager.jsx` | Scheduled follow-ups |
| `crm_activities` table | Database table |

**Activity Types:**
- Phone Call
- Customer Visit
- Email
- WhatsApp Message
- Meeting (Online/In-person)
- Sample Sent
- Quote Sent

---

### PHASE 4: Lead Management
**Duration:** 3-4 days  
**Depends on:** Phase 3

| Component | Description |
|-----------|-------------|
| `LeadList.jsx` | My leads pipeline |
| `LeadCreate.jsx` | New lead form |
| `LeadConvert.jsx` | Convert to customer/opportunity |
| `crm_leads` table | Database table |

**Lead Sources:**
- Existing Customer (upsell)
- New Company
- Referral
- Exhibition/Trade Show
- Website Inquiry
- Cold Call

**Lead Stages:**
1. New → 2. Contacted → 3. Qualified → 4. Sample Sent → 5. Quotation → 6. Negotiation → 7. Won/Lost

---

### PHASE 5: Opportunities & Pipeline
**Duration:** 3-4 days  
**Depends on:** Phase 4

| Component | Description |
|-----------|-------------|
| `OpportunityPipeline.jsx` | Visual pipeline (Kanban) |
| `OpportunityDetail.jsx` | Opportunity details |
| `crm_opportunities` table | Database table |

**Features:**
- Drag-and-drop pipeline
- Expected value & close date
- Win/loss tracking
- Weighted pipeline value

---

### PHASE 6: Reports & Analytics (Filtered)
**Duration:** 2-3 days  
**Depends on:** Phase 1-5

| Component | Description |
|-----------|-------------|
| `SalesRepReports.jsx` | Filtered report access |
| `PerformanceAnalytics.jsx` | Personal performance metrics |

**Reports Available:**
- Product Group Analysis (my customers only)
- Customer Analysis (my customers only)
- Country Analysis (my territories)
- Budget vs Actual
- Lead Conversion Rate
- Activity Summary

---

## 📊 DATABASE TABLES NEEDED

### Existing (Ready to Use)
```sql
-- Already created yesterday
crm_sales_reps (VIEW) - 6 active reps
fp_customer_master - 572 customers
crm_product_groups - 13 products
```

### To Create in Phase 3
```sql
-- Activities / Interactions
CREATE TABLE crm_activities (
  id SERIAL PRIMARY KEY,
  activity_type VARCHAR(50) NOT NULL,  -- Call, Visit, Email, Meeting
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Relationships
  sales_rep_id INTEGER NOT NULL,       -- Links to employee
  customer_id INTEGER,                  -- Links to fp_customer_master
  lead_id INTEGER,                      -- Links to crm_leads (optional)
  opportunity_id INTEGER,               -- Links to crm_opportunities (optional)
  
  -- Activity Details
  activity_date TIMESTAMP NOT NULL,
  duration_minutes INTEGER,
  outcome VARCHAR(100),                 -- Positive, Neutral, Negative
  next_action TEXT,
  next_action_date DATE,
  
  -- Location (for visits)
  location VARCHAR(255),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### To Create in Phase 4
```sql
-- Leads
CREATE TABLE crm_leads (
  id SERIAL PRIMARY KEY,
  lead_number VARCHAR(50) UNIQUE,       -- LEAD-2025-0001
  
  -- Source
  lead_source VARCHAR(100),             -- Existing Customer, New, Referral, Exhibition
  source_customer_id INTEGER,           -- If from existing customer
  
  -- Company Info
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  country VARCHAR(100),
  
  -- Sales Assignment
  assigned_to INTEGER NOT NULL,         -- sales_rep employee_id
  
  -- Qualification
  status VARCHAR(50) DEFAULT 'New',     -- New, Contacted, Qualified, Lost
  stage VARCHAR(50) DEFAULT 'New',      -- Pipeline stage
  probability INTEGER DEFAULT 10,       -- Win probability %
  
  -- Requirements
  interested_products TEXT[],           -- Product group names
  estimated_volume VARCHAR(100),        -- e.g., "500 MT/year"
  estimated_value DECIMAL(14,2),        -- Expected annual value
  requirements TEXT,
  
  -- Dates
  expected_close_date DATE,
  converted_date DATE,
  converted_to_customer_id INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### To Create in Phase 5
```sql
-- Opportunities
CREATE TABLE crm_opportunities (
  id SERIAL PRIMARY KEY,
  opportunity_number VARCHAR(50) UNIQUE, -- OPP-2025-0001
  name VARCHAR(255) NOT NULL,
  
  -- Relationships
  customer_id INTEGER NOT NULL,         -- From fp_customer_master
  lead_id INTEGER,                      -- If converted from lead
  sales_rep_id INTEGER NOT NULL,
  
  -- Pipeline
  stage VARCHAR(50) DEFAULT 'Qualification',
  probability INTEGER DEFAULT 20,
  
  -- Value
  expected_value DECIMAL(14,2),
  expected_volume DECIMAL(12,2),        -- KGS
  currency VARCHAR(10) DEFAULT 'AED',
  
  -- Products
  product_groups TEXT[],
  
  -- Dates
  expected_close_date DATE,
  actual_close_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Open',    -- Open, Won, Lost
  won_reason TEXT,
  lost_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 DATA ISOLATION LOGIC

### API Layer
Every API endpoint filters by the logged-in sales rep:

```javascript
// Middleware to inject sales rep info
const injectSalesRepFilter = async (req, res, next) => {
  const userId = req.user.id;
  
  // Get employee info for this user
  const result = await authPool.query(`
    SELECT e.id as employee_id, e.first_name, e.last_name,
           (SELECT group_name FROM fp_database.public.sales_rep_groups g
            JOIN fp_database.public.sales_rep_group_members m ON g.id = m.group_id
            WHERE m.member_name ILIKE e.first_name || '%' OR m.member_name ILIKE e.last_name || '%'
            LIMIT 1) as group_name
    FROM employees e
    WHERE e.user_id = $1
  `, [userId]);
  
  if (result.rows[0]) {
    req.salesRep = {
      employeeId: result.rows[0].employee_id,
      fullName: `${result.rows[0].first_name} ${result.rows[0].last_name}`,
      groupName: result.rows[0].group_name
    };
  }
  
  next();
};

// Example: GET /api/crm/my-customers
router.get('/my-customers', injectSalesRepFilter, async (req, res) => {
  const { salesRep } = req;
  
  // Filter customers by this sales rep's group
  const customers = await pool.query(`
    SELECT * FROM fp_customer_master
    WHERE sales_rep ILIKE $1 || '%'
       OR sales_rep ILIKE '%' || $2 || '%'
       OR sales_reps::text ILIKE '%' || $1 || '%'
    ORDER BY customer_name
  `, [salesRep.fullName, salesRep.groupName]);
  
  res.json({ success: true, data: customers.rows });
});
```

---

## 📁 FILE STRUCTURE

```
src/
├── components/
│   └── SalesRepPortal/
│       ├── SalesRepPortal.jsx          # Main layout
│       ├── SalesRepPortal.css
│       ├── SalesRepSidebar.jsx         # Navigation sidebar
│       │
│       ├── Dashboard/
│       │   ├── SalesRepDashboard.jsx   # KPIs landing page
│       │   ├── KPICards.jsx            # Summary cards
│       │   ├── SalesChart.jsx          # Trend chart
│       │   └── TopLists.jsx            # Top customers/products
│       │
│       ├── Customers/
│       │   ├── MyCustomerList.jsx
│       │   ├── MyCustomerDetail.jsx
│       │   └── CustomerCard.jsx
│       │
│       ├── Activities/
│       │   ├── ActivityLogger.jsx
│       │   ├── ActivityTimeline.jsx
│       │   ├── FollowUpManager.jsx
│       │   └── ActivityCalendar.jsx
│       │
│       ├── Leads/
│       │   ├── LeadList.jsx
│       │   ├── LeadCreate.jsx
│       │   ├── LeadDetail.jsx
│       │   └── LeadPipeline.jsx
│       │
│       └── Opportunities/
│           ├── OpportunityPipeline.jsx
│           ├── OpportunityDetail.jsx
│           └── OpportunityCard.jsx
│
server/
├── routes/
│   └── crm/
│       ├── index.js                    # CRM routes aggregator
│       ├── dashboard.js                # /api/crm/my-dashboard
│       ├── customers.js                # /api/crm/my-customers
│       ├── activities.js               # /api/crm/activities
│       ├── leads.js                    # /api/crm/leads
│       └── opportunities.js            # /api/crm/opportunities
│
├── middleware/
│   └── salesRepFilter.js               # Data isolation middleware
│
└── migrations/
    ├── 300_create_crm_activities.sql
    ├── 301_create_crm_leads.sql
    └── 302_create_crm_opportunities.sql
```

---

## ✅ PHASE 1 CHECKLIST (Start Today)

### Backend
- [ ] Create `server/routes/crm/index.js`
- [ ] Create `server/routes/crm/dashboard.js` with `/my-dashboard` endpoint
- [ ] Create `server/middleware/salesRepFilter.js`
- [ ] Add CRM routes to `server/index.js`

### Frontend
- [ ] Create `src/components/SalesRepPortal/` folder
- [ ] Create `SalesRepPortal.jsx` layout
- [ ] Create `SalesRepDashboard.jsx` with KPIs
- [ ] Create `KPICards.jsx` component
- [ ] Add route `/sales-portal` to App.jsx

### Data
- [ ] Query existing sales data filtered by rep
- [ ] Calculate KPIs from `fp_data_excel` + `fp_sales_rep_budget`
- [ ] Get top customers and products for the rep

---

## 🚀 READY TO START?

**Confirm Phase 1 and I'll begin implementation!**

The approach:
1. Build backend API first
2. Build frontend components
3. Test with actual data
4. Move to next phase

Each phase will be testable before moving forward.
