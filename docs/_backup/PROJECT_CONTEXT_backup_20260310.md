# PEBI - Packaging Enterprise Business Intelligence

> **Part of ProPackHub SaaS Platform**
> 
> **Master Reference Document** - Complete System Architecture & Current State
> 
> **Last Updated:** February 1, 2026  
> **Status:** Production-Ready Multi-Tenant SaaS Platform

---

## 🎯 WHAT IS THIS PROJECT?

### ProPackHub - The SaaS Platform

**ProPackHub** is a comprehensive SaaS (Software as a Service) platform designed for the packaging industry. It serves as a unified workspace where multiple business applications and modules are hosted under one umbrella.

### PEBI - Packaging Enterprise Business Intelligence

**PEBI** is a major application within ProPackHub, focused on **Business Intelligence, Analytics, and Operational Excellence** for packaging manufacturing companies.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ProPackHub SaaS Platform                              │
│                   "Unified Digital Workspace for Packaging"                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │                    🧠 PEBI (This Project)                            │    │
│   │         Packaging Enterprise Business Intelligence                   │    │
│   │                                                                      │    │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│   │   │   MIS/IMS    │  │     MES      │  │     CRM      │              │    │
│   │   │  Management  │  │  Production  │  │  Customers   │              │    │
│   │   │  Information │  │  Execution   │  │ Relationship │              │    │
│   │   │    System    │  │   System     │  │  Management  │              │    │
│   │   └──────────────┘  └──────────────┘  └──────────────┘              │    │
│   │                                                                      │    │
│   │   ┌────────────────────────────────────────────────────────────┐    │    │
│   │   │              🤖 AI Conversational Interface                 │    │    │
│   │   │         Natural language chat for all PEBI modules         │    │    │
│   │   └────────────────────────────────────────────────────────────┘    │    │
│   │                                                                      │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│   │  Future Apps   │  │  Future Apps   │  │  Future Apps   │                 │
│   │  (Planned)     │  │  (Planned)     │  │  (Planned)     │                 │
│   └────────────────┘  └────────────────┘  └────────────────┘                 │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 PEBI CORE MODULES

### 1. MIS/IMS - Management Information System

**Purpose:** Analytics, KPIs, Finance & Budgeting, Insights, and Forecasting

**Sub-modules:**
- **Divisional Dashboard** - Division-level KPIs, product groups, geographic analysis
- **Sales Dashboard** - Sales rep performance, customer insights, territory analysis
- **AEBF** - Actual/Estimate/Budget/Forecast planning and management
- **P&L Analysis** - Profit & Loss financial reporting and projections
- **Executive Reports** - High-level summary reports for management
- **Forecasting** - Predictive analytics and trend analysis

**Key Features:**
- Real-time Oracle ERP data sync
- Multi-year budget planning
- YoY variance analysis
- Interactive data visualization (ECharts, Chart.js, Highcharts)
- Excel/PDF/HTML exports
- AI-powered insights

### 2. MES - Manufacturing Execution System (Planned/In Development)

**Purpose:** Production Execution and Manufacturing Operations

**Planned Sub-modules:**
- **Sampling** - Sample management and testing workflows
- **Specifications** - Product specifications and standards
- **TDS Forming** - Technical Data Sheet creation
- **Cost Estimation** - Product costing and estimation
- **Production Planning** - Process planning per product (multi-process workflows)
- **Quality Control** - Quality assurance and testing
- **Traceability** - Batch tracking and audit trails

### 3. CRM - Customer Relationship Management

**Purpose:** Customer Management, Orders, and Complaint Handling

**Current Sub-modules:**
- **Customer Master** - Unified customer database (565+ customers)
- **Contact Management** - Customer contacts and communication
- **Lead Tracking** - Sales leads and opportunities
- **Customer Segmentation** - AI-powered customer grouping
- **Customer Merging** - Duplicate detection and consolidation

**Planned Sub-modules:**
- **Order Management** - Order entry, tracking, and fulfillment
- **Complaint Handling** - Customer complaint logging and resolution
- **Customer Portal** - Self-service customer interface

### 4. AI Conversational Interface (Planned)

**Purpose:** Natural language chatbot for interacting with all PEBI modules

**Planned Capabilities:**
- Query sales data via natural language ("Show me top 10 customers this year")
- Generate reports on demand ("Create a budget variance report for Q1")
- Get insights and recommendations ("Which products are underperforming?")
- Navigate the application ("Take me to the budget page")
- Answer business questions ("What's our YoY growth?")

---

## 🏢 CURRENT IMPLEMENTATION STATE

**Platform:** ProPackHub  
**Default Tenant:** Interplast (Development Environment)  
**Current Division:** FP (Flexible Packaging) = Oracle FP + BF divisions combined

**Current Codebase Organization:**
```
d:\PPH 26.01\
├── src/                    # Frontend React application
│   ├── components/         # React components (PEBI UI)
│   │   ├── dashboard/      # MIS: Divisional & Sales dashboards
│   │   ├── MasterData/     # MIS: AEBF, Budget management
│   │   ├── CRM/            # CRM module components
│   │   ├── reports/        # MIS: Sales reports
│   │   ├── settings/       # System settings
│   │   ├── platform/       # SaaS platform admin
│   │   └── auth/           # Authentication (Login page)
│   ├── contexts/           # React Context providers
│   └── services/           # API client services
├── server/                 # Backend Node.js/Express API
│   ├── routes/             # API endpoints (62+ route files)
│   │   ├── aebf/           # Budget & forecast endpoints
│   │   ├── crm/            # CRM endpoints
│   │   └── platform/       # Platform admin endpoints
│   ├── services/           # Business logic (47+ services)
│   ├── database/           # Database services
│   └── migrations/         # Database migrations (323+)
├── docs/                   # Documentation files
└── PROJECT_CONTEXT.md      # This file - Master reference
```

---

## 🔄 AUTO-UPDATING DOCUMENTATION

**The System Workflow UI component (`ProjectWorkflow.jsx`) now auto-updates from the database!**

When any agent changes database tables or API routes, the documentation in Settings → Master Data → System Workflow
will automatically reflect those changes. This is powered by:

- **Backend API:** `/api/documentation/*` - Introspects database and route files
- **Service:** `server/services/DocumentationService.js` - Auto-discovers tables and routes
- **Frontend:** `src/components/MasterData/ProjectWorkflow.jsx` - Fetches live data

No manual documentation updates needed for:
- Database table additions/removals
- API route changes
- Data flow modifications

---

## ⚠️ CRITICAL: DIVISION ARCHITECTURE (READ FIRST!)

### Division Mapping Overview

**The FP (Flexible Packaging) division combines TWO Oracle ERP divisions:**
- **Oracle 'FP'** = Flexible Packaging
- **Oracle 'BF'** = Bags & Films

**These are MERGED into ONE admin division called 'FP'.**

### Key Tables & Fields

| Table | Field | Purpose |
|-------|-------|---------|
| `divisions` | `raw_divisions` | JSON array of Oracle codes: `['FP', 'BF']` |
| `fp_actualcommon` | `division_code` | **Original** Oracle code ('FP' or 'BF') |
| `fp_actualcommon` | `admin_division_code` | **Mapped** admin code (always 'FP' for both) |
| `fp_budget_unified` | `division_code` | Admin division code ('FP') |
| `vw_unified_sales_data` | `division` | **Mapped** admin code (uses `admin_division_code`) |
| `vw_unified_sales_data` | `raw_division_code` | **Original** Oracle code ('FP' or 'BF') |

### ⚠️ CRITICAL RULE: Query Filtering

**When querying ACTUAL data (fp_actualcommon):**
```sql
-- ✅ CORRECT: Use admin_division_code (gets BOTH FP and BF data)
WHERE UPPER(admin_division_code) = UPPER($1)

-- ❌ WRONG: Using division_code (gets ONLY FP data, misses BF!)
WHERE UPPER(division_code) = UPPER($1)
```

**When querying via vw_unified_sales_data view:**
```sql
-- ✅ CORRECT: The view exposes admin_division_code as 'division'
WHERE d.division = 'FP'  -- Gets BOTH FP and BF data

-- Use raw_division_code if you need the original Oracle code
WHERE d.raw_division_code = 'BF'  -- Gets only BF data
```

**When querying BUDGET data (fp_budget_unified):**
```sql
-- ✅ CORRECT: Budget data stores admin division code directly
WHERE UPPER(division_code) = UPPER($1)
```

### Data Flow

```
Oracle ERP
    ├── FP (Flexible Packaging) ─┐
    └── BF (Bags & Films) ───────┼──► fp_raw_oracle (raw data)
                                 │
                                 ▼
                    sync_oracle_to_actualcommon() trigger
                                 │
                                 ▼
                         fp_actualcommon
                    ┌─────────────────────┐
                    │ division_code = 'FP'│ ← Original Oracle code
                    │ admin_division_code │ ← MAPPED to 'FP' (from divisions.raw_divisions)
                    │                = 'FP'│
                    └─────────────────────┘
                    ┌─────────────────────┐
                    │ division_code = 'BF'│ ← Original Oracle code
                    │ admin_division_code │ ← MAPPED to 'FP' (from divisions.raw_divisions)
                    │                = 'FP'│
                    └─────────────────────┘
```

### Division Configuration (Company Info Page)

Divisions are configured in **Settings → Company Info → Divisions**:
- `division_code`: 'FP' (admin code used in UI)
- `division_name`: 'Flexible Packaging Division'
- `raw_divisions`: ['FP', 'BF'] (Oracle ERP codes to include)

### Common Mistakes to Avoid

1. **❌ Filtering fp_actualcommon by division_code** - This will miss BF data!
2. **❌ Not using the divisions table mapping** - Always check raw_divisions
3. **❌ Hardcoding division codes** - Use the divisions table for mapping

### Recent Fixes (January 2026)

| Date | Issue | Fix | Migration |
|------|-------|-----|-----------|
| 2026-01-25 | Sales by Sales Reps showing 0 for actual | Fixed `getSalesRepDivisionalUltraFast` - removed incorrect `WHERE sales_rep_group_name IN (...)` filter that was matching individual names against group names | Code fix |
| 2026-01-25 | 2026 SALES_REP budget missing `sales_rep_group_name` | Fixed bulk.js to set `sales_rep_group_name = sales_rep_name` + updated 344 rows in DB | Code fix + Data fix |
| 2026-01-25 | Bulk import using wrong `division_name` | Fixed bulk.js to use `getDivisionName(divisionCode)` instead of raw code | Code fix |
| 2026-01-25 | Sales Dashboard KPI budget showing 0 | Fixed groupMembers undefined error + FY month handling in fpDataService.js | No migration needed |
| 2026-01-25 | SALES_REP budget division_name bug | Fixed budget-draft.js to use getDivisionName() + updated 2026 data | Data fix applied |
| 2026-01-25 | Divisional Dashboard 2025 Budget showing 0 | ProductGroupDataService: 2025 has no DIVISIONAL budget, added fallback to SALES_REP | No migration needed |
| 2026-01-26 | Sales Dashboard customer budget missing | Fixed getCustomersBySalesRep() to UNION budget-only customers | No migration needed |
| 2026-01-26 | Sales Dashboard product group budget tripled | Removed divisional budget fallback from _getSalesRepBudgetData() | No migration needed |

---

## 📊 COMPREHENSIVE DATA FLOW ARCHITECTURE

### Main Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `fp_actualcommon` | ALL actual sales data | `admin_division_code`, `sales_rep_name`, `sales_rep_group_name`, `pgcombine`, `amount`, `qty_kgs`, `morm` |
| `fp_budget_unified` | ALL budget/forecast/estimate data | `division_code`, `budget_type`, `sales_rep_name`, `sales_rep_group_name`, `customer_name`, `country`, `pgcombine` |

### Budget Type Rules

| budget_type | Has Customer | Has Country | Has Sales Rep | Use Case |
|-------------|--------------|-------------|---------------|----------|
| `DIVISIONAL` | ❌ No | ❌ No | ❌ No | Division-level totals by Product Group for P&L, ProductGroupTable |
| `SALES_REP` | ✅ Yes | ✅ Yes | ✅ Yes | Sales Rep-level with Customer & Country. For Sales Dashboard |
| `ESTIMATE` | ✅ Yes | ✅ Yes | ✅ Yes | Future estimates |
| `FORECAST` | ✅ Yes | ✅ Yes | ✅ Yes | Forecasts |

**⚠️ CRITICAL RULES:**
1. **Sales Dashboard queries:** ALWAYS use `WHERE budget_type = 'SALES_REP'`
2. **Divisional Dashboard queries:** Use `WHERE budget_type = 'DIVISIONAL'` (except 2025 which falls back to SALES_REP)
3. **NEVER mix DIVISIONAL and SALES_REP** for sales rep individual views

### Sub-Tables (MDM - Master Data Management)

| Table | Purpose | Managed Via |
|-------|---------|-------------|
| `sales_rep_groups` | Group definitions | Master Data → Sales Rep Groups |
| `sales_rep_group_members` | Group membership | Master Data → Sales Rep Groups |
| `fp_division_customer_merge_rules` | Customer merging | Master Data → Customer Merging |
| `fp_product_group_exclusions` | Excluded PGs (e.g., "Raw Materials") | Master Data → Raw Product Groups |

### Current Budget State (Jan 26, 2026)

| Year | Type | Rows | division_name | sales_rep_group_name | Notes |
|------|------|------|---------------|---------------------|-------|
| 2025 | SALES_REP | 1,584 | ✅ Flexible Packaging Division | ✅ Populated | Complete |
| 2025 | DIVISIONAL | 0 | - | - | **None - uses SALES_REP fallback** |
| 2026 | DIVISIONAL | 144 | ✅ Flexible Packaging Division | N/A | Complete |
| 2026 | SALES_REP | 0 | - | - | Pending import from sales reps |

### Budget 2026+ Workflow (NEW)

**Step-by-step process:**

```
1. DIVISIONAL BUDGET (Management creates division-level targets)
   ├── Page: AEBF → Budget → Divisional Budget tab
   ├── User enters: Budget by Product Group (pgcombine) for the TOTAL division
   ├── No customers at this level
   ├── Saved to: fp_budget_unified → budget_type = 'DIVISIONAL'
   └── Displayed in: Divisional Dashboard → Product Groups table

2. MANAGEMENT ALLOCATION (Management allocates to sales rep groups)
   ├── Page: AEBF → Budget → Sales Budget → Management Allocation tab
   ├── User allocates: MT volumes for each sales rep group by product group
   ├── Save Draft: Temporary saving to fp_sales_rep_group_budget_allocation
   ├── Approve Budget: Finalize allocation (still NOT in budget_unified yet!)
   └── Saved to: fp_sales_rep_group_budget_allocation (separate allocation table)

3. EXPORT PG ALLOCATED BUDGET (Management exports HTML for sales reps)
   ├── Button: "Export PG Allocated Budget" in Management Allocation tab
   ├── Generates: HTML file per sales rep group with allocated quantities
   └── Sales reps fill in: Customer details based on allocated amounts

4. BULK IMPORT (Management imports filled sales rep budgets)
   ├── Page: AEBF → Budget → Sales Budget → Bulk Import tab
   ├── Accepts: HTML files from "Export PG Allocated Budget" 
   ├── Final sales rep budget with customers
   ├── Saved to: fp_budget_unified → budget_type = 'SALES_REP'
   └── division_name: Dynamic from company_settings (e.g., "Flexible Packaging Division")
```

### Data Flow Diagrams

#### Actual Data Flow
```
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
            ↓
    fp_raw_oracle (staging)
            ↓ Trigger: sync_oracle_to_actualcommon()
    ⭐ fp_actualcommon (main table)
        • admin_division_code = 'FP' (always, for both FP+BF)
        • sales_rep_group_name = pre-aggregated group name
            ↓
    Dashboard Services (CustomerInsights, ProductPerformance, etc.)
        • JOIN with fp_product_group_exclusions
        • Filter by admin_division_code
```

#### Budget Data Flow (2026+)
```
1. Divisional Budget Entry:
   AEBF → Divisional Tab → fp_budget_unified (budget_type='DIVISIONAL')
        ↓ Displayed in Divisional Dashboard Product Groups

2. Management Allocation:
   AEBF → Management Allocation Tab → fp_sales_rep_group_budget_allocation
        ↓ Export PG Allocated Budget (HTML per sales rep group)

3. Sales Rep fills customers in HTML file
        ↓

4. Bulk Import:
   AEBF → Bulk Import Tab → fp_budget_unified (budget_type='SALES_REP')
        ↓ Displayed in Sales Dashboard
```

---

## 📋 TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Database Architecture](#4-database-architecture)
5. [Core Modules](#5-core-modules)
6. [Data Flow](#6-data-flow)
7. [API Endpoints](#7-api-endpoints)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Security & Authentication](#9-security--authentication)
10. [Development Workflow](#10-development-workflow)
11. [Deployment](#11-deployment)
12. [Current Status & Known Issues](#12-current-status--known-issues)

---

## 1. PROJECT OVERVIEW

### What is PEBI?

**PEBI** (Packaging Enterprise Business Intelligence) is an application within the **ProPackHub** SaaS platform. It is a full-stack enterprise solution for sales data management, budget forecasting, production execution, customer relationship management, and business analytics in the flexible packaging industry.

### ProPackHub Platform

**ProPackHub** is the overarching SaaS platform that hosts PEBI and other applications. It provides:
- Multi-tenant architecture (multiple companies)
- Centralized authentication and user management
- Subscription management
- Platform administration

### PEBI Modules

| Module | Status | Description |
|--------|--------|-------------|
| **MIS/IMS** | ✅ Production | Management Information System - Analytics, KPIs, Finance, Budgeting, Dashboards |
| **MES** | 🚧 Planned | Manufacturing Execution System - Sampling, Specs, TDS, Cost Estimation, Production Planning |
| **CRM** | 🔄 Partial | Customer Relationship Management - Customer master, contacts, segmentation (orders/complaints planned) |
| **AI Chat** | 🚧 Planned | Conversational interface for natural language queries across all modules |

### Multi-Tenant Architecture

- **Platform**: ProPackHub (SaaS platform where multiple companies can be added)
- **Default Tenant**: **Interplast** (the company used for development)
- **Current Division**: **FP (Flexible Packaging)** - combines Oracle FP + BF data
- **Division Creation**: Divisions are dynamically created via the **Company Info** page
- **Note**: Currently only FP division exists - no other divisions or tables for other divisions

### Core Capabilities (MIS/IMS Module)

- **Sales Performance Tracking** - Real-time sales analytics across divisions
- **AEBF System** - Actual, Estimate, Budget, Forecast planning and management
- **CRM Module** - Customer relationship management with contacts and opportunities
- **P&L Analysis** - Profit & Loss financial reporting and projections
- **AI Learning** - Self-learning algorithms for customer merging and pattern recognition
- **Multi-Tenant SaaS** - Platform administration for multiple companies

### Target Users

| Role | Primary Use Case |
|------|------------------|
| **Platform Admins** | SaaS platform management, tenant onboarding |
| **Company Admins** | Company settings, division management, user management |
| **Sales Managers** | Team performance tracking, budget approval, forecasting |
| **Sales Representatives** | Personal dashboards, customer insights, territory management |
| **Financial Analysts** | P&L analysis, forecasting, budget variance reports |
| **Production Managers** (MES) | Production planning, quality control, traceability (planned) |
| **Customer Service** (CRM) | Order management, complaint handling (planned) |

---

## 2. TECHNOLOGY STACK

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.3.1 | UI framework |
| **Vite** | 7.3.0 | Build tool & dev server |
| **React Router DOM** | 7.6.3 | Routing |
| **Ant Design** | 5.25.1 | UI component library |
| **Framer Motion** | 12.19.2 | Animations |
| **Lucide React** | 0.525.0 | Icon library |

### Visualization Libraries

| Library | Version | Use Case |
|---------|---------|----------|
| **ECharts** | 5.4.3 | Primary charts (bar, line, pie) |
| **Chart.js** | 4.5.0 | Secondary charts |
| **Recharts** | 3.6.0 | React-native charts |
| **Highcharts** | 12.4.0 | Advanced charts |
| **Plotly.js** | 3.3.1 | 3D visualizations |
| **Leaflet** | 1.9.4 | Geographic maps |
| **Three.js/react-globe.gl** | 0.177.0/2.36.0 | 3D globe visualization |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Express** | 5.1.0 | API server framework |
| **PostgreSQL** | 14+ | Primary database |
| **Redis** | 5.10.0 | Caching layer (optional) |
| **Winston** | 3.18.3 | Logging |
| **JWT** | 9.0.2 | Authentication tokens |

### Data Processing

| Library | Purpose |
|---------|---------|
| **ExcelJS** | Excel file processing |
| **XLSX** | Excel parsing |
| **jsPDF** | PDF generation |
| **html2canvas** | HTML to image conversion |

### AI/ML Libraries

| Library | Purpose |
|---------|---------|
| **natural** | Natural language processing |
| **double-metaphone** | Phonetic matching for names |
| **string-similarity** | Fuzzy string matching |
| **compromise** | Advanced NLP |

### Testing & Quality

| Tool | Purpose |
|------|---------|
| **Jest** | Unit testing |
| **Supertest** | API testing |
| **Playwright** | E2E testing |
| **Artillery** | Load testing |

---

## 3. ARCHITECTURE

### Overall Pattern

**Three-tier layered architecture** with multi-tenant SaaS capabilities:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (React SPA)                     │
│  Vite Dev Server (port 3000) → Production Static Files          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/REST API
┌─────────────────────────────────────────────────────────────────┐
│                    API LAYER (Express Server)                    │
│  • JWT Authentication     • Rate Limiting                        │
│  • Business Logic         • Request Logging                      │
│  • Data Transformation    • Error Handling                       │
│  Port 3001 → /api/*       Redis Cache (Optional)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ SQL Queries
┌─────────────────────────────────────────────────────────────────┐
│                   DATA LAYER (PostgreSQL)                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Platform DB      │  │ Tenant Auth DB   │  │ Tenant Data DB│ │
│  │ propackhub_      │  │ ip_auth_database │  │ fp_database   │ │
│  │ platform         │  │                  │  │               │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Structure

```
server/
├── index.js                    # Main entry point (~260 lines)
├── config/                     # Configuration modules
│   ├── express.js              # Express middleware setup
│   ├── database.js             # PostgreSQL connection pool
│   ├── environment.js          # Environment validation
│   ├── swagger.js              # API documentation
│   └── alerting.js             # Monitoring config
├── routes/                     # API endpoints (62 route files)
│   ├── auth.js                 # Authentication
│   ├── aebf/                   # Budget & forecast (7 modules)
│   ├── crm/                    # CRM endpoints
│   ├── platform/               # Platform administration
│   └── ...                     # 45+ more route modules
├── middleware/                 # Express middleware (17 files)
│   ├── auth.js                 # JWT verification
│   ├── rateLimiter.js          # Rate limiting
│   ├── cache.js                # Redis caching
│   ├── security.js             # Helmet security headers
│   └── ...
├── services/                   # Business logic (47 services)
│   ├── authService.js          # Auth logic
│   ├── AILearningService.js    # AI/ML algorithms
│   ├── CustomerLearningService.js
│   └── ...
├── database/                   # Database services (24 modules)
│   ├── GlobalConfigService.js
│   ├── multiTenantPool.js      # Multi-tenant pool manager
│   ├── DynamicDivisionConfig.js
│   └── ...
├── migrations/                 # Database migrations (323+)
├── utils/                      # Utilities
│   ├── logger.js               # Winston logger
│   └── divisionDatabaseManager.js
└── scripts/                    # Maintenance scripts
```

### Frontend Structure

```
src/
├── App.jsx                     # Root component with routing
├── index.jsx                   # Entry point
├── components/                 # React components (156 components)
│   ├── dashboard/              # Main dashboard
│   ├── auth/                   # Login, ProtectedRoute
│   ├── MasterData/             # AEBF, Budget management
│   │   └── AEBF/               # Actual, Budget, Forecast tabs
│   ├── CRM/                    # Customer relationship management
│   ├── platform/               # Platform administration
│   ├── people/                 # User management
│   ├── reports/                # Sales reports
│   ├── settings/               # Settings UI
│   └── setup/                  # Setup wizard
├── contexts/                   # React Context providers
│   ├── AuthContext.jsx         # Authentication state
│   ├── ThemeContext.jsx        # Theme management
│   ├── CurrencyContext.jsx     # Currency handling
│   ├── ExcelDataContext.jsx    # Sales data state
│   └── ...
├── services/                   # API client services
│   └── api.js                  # Axios instance with auth
├── utils/                      # Utility functions
│   └── authClient.js           # Auth token management
└── styles/                     # CSS styles
    └── themes.css              # Theme definitions
```

---

## 4. DATABASE ARCHITECTURE

### Multi-Tenant Database Design

The system uses **database-per-tenant isolation** with three database types:

#### 1. Platform Database (`propackhub_platform`)

**Purpose:** SaaS platform management - stores all tenant companies

**Key Tables:**

| Table | Rows | Purpose |
|-------|------|---------|
| `companies` | ~10 | Tenant companies (Interplast is the default for development) |
| `company_divisions` | ~20 | Division configs per company |
| `subscription_plans` | 5 | SaaS plans (Free, Starter, Pro, Enterprise, Custom) |
| `platform_users` | ~5 | Platform administrators |
| `tenant_metrics` | Growing | Usage metrics from tenants |

**Multi-Tenant Design:**
- Each company gets their own auth database and data database
- Platform database stores company registry and subscription info
- New companies can be added via Platform Administration

#### 2. Tenant Auth Database (`ip_auth_database`)

**Purpose:** User authentication and authorization for Interplast (default tenant)

**Note:** `ip` = Interplast. Each tenant company would have their own auth database (e.g., `acme_auth_database` for a company called Acme).

**Key Tables:**

| Table | Rows | Purpose |
|-------|------|---------|
| `users` | 51 | User accounts with roles |
| `user_sessions` | ~100 | Active JWT sessions |
| `user_divisions` | ~60 | User-to-division access |
| `permissions` | 50+ | Permission definitions |
| `roles` | 5 | Role definitions (admin, sales_manager, etc.) |
| `company_settings` | ~20 | Company configuration key-value store |
| `company_divisions` | ~5 | Division definitions with Oracle mappings |
| `employees` | 51 | Employee records |
| `departments` | 10 | Department definitions |
| `currencies` | 34 | Currency definitions |
| `exchange_rates` | 20+ | Exchange rate history |
| `master_countries` | 199 | Country reference with regions, currency, coordinates |
| `country_aliases` | 4 | Country name variations |

#### 3. Tenant Data Database (`fp_database`)

**Purpose:** Sales data, budgets, analytics for Interplast's FP division

**Note:** `fp` = Flexible Packaging division. This database contains all data tables for the FP division. Currently, this is the **only division** - no tables for other divisions (HC, etc.) exist.

**⭐ MAIN DATA TABLES (SOURCE OF TRUTH):**

| Table | Rows | Purpose |
|-------|------|---------|
| **`fp_actualcommon`** | 50,529 | **PRIMARY TABLE** - Actual sales data (transformed from Oracle FP + BF) |
| **`fp_budget_unified`** | ~1,000+ | **PRIMARY TABLE** - All Budget, Forecast, and Estimate data |

**Supporting Data Tables:**

| Table | Rows | Purpose |
|-------|------|---------|
| `fp_raw_oracle` | 50,745 | Raw Oracle ERP data (direct sync, feeds into fp_actualcommon) |
| `fp_divisional_budget` | 876 | Official divisional budgets (legacy, for P&L) |
| `fp_sales_rep_budget` | 0 | Sales rep targets (legacy - use fp_budget_unified instead) |
| `fp_budget_bulk_import` | ~100+ | Bulk budget import staging (from HTML/Excel) |
| `fp_sales_rep_group_budget_allocation` | ~200+ | Management budget allocations at Group + Product Group level |
| `fp_pl_data` | ~1,000 | P&L financial data |
| `fp_data_excel` | 32,247 | Legacy sales data table (being deprecated) |
| `fp_product_group_exclusions` | 1 | Product groups to exclude from KPI calculations (currently: "Raw Materials") |
| `fp_division_customer_merge_rules` | 31 | Customer merge rules for combining related customers |

**Key Architecture:**
- **Actual Data**: `Oracle ERP` → `fp_raw_oracle` → (trigger) → `fp_actualcommon` (main table for all actual queries)
- **Budget/Forecast/Estimate**: All stored in `fp_budget_unified` with `budget_type` column to differentiate
- **All tables use `fp_` prefix** because they belong to the FP division
- **No tables for other divisions** currently exist (HC, TF, etc.)
- **fp_raw_data** - DELETED (replaced by fp_raw_oracle for direct Oracle sync)

**⚠️ CRITICAL: fp_budget_unified budget_type Rules:**

| budget_type | Has Customer | Has Country | Use Case |
|-------------|--------------|-------------|----------|
| `DIVISIONAL` | ❌ No | ❌ No | Division-level totals by Product Group only. Use for: ProductGroupTable, P&L, division totals |
| `SALES_REP` | ✅ Yes | ✅ Yes | Sales Rep-level with Customer & Country breakdown. Use for: Sales Dashboard, Sales Rep reports, customer/country analysis |
| `ESTIMATE` | ✅ Yes | ✅ Yes | Future estimates by Sales Rep, Customer, Country |
| `FORECAST` | ✅ Yes | ✅ Yes | Forecasts by Sales Rep, Customer, Country |

**Query Rules:**
```sql
-- ✅ CORRECT: Divisional Dashboard Product Groups (no sales rep filter)
WHERE budget_type = 'DIVISIONAL'

-- ✅ CORRECT: Sales Dashboard for specific sales rep (with customer/country)
WHERE budget_type = 'SALES_REP' AND sales_rep_name = 'Christopher Dela Cruz'

-- ❌ WRONG: Using DIVISIONAL for sales rep view (shows division totals, not rep's budget)
-- ❌ WRONG: Falling back to DIVISIONAL when SALES_REP budget is 0
```

**Key Principle:** When showing data for a specific sales rep, use `budget_type = 'SALES_REP'` and return 0 if no budget exists. Never fall back to DIVISIONAL budget for individual sales rep views.

**Unified Master Tables (Migration 300-312):**

| Table | Rows | Purpose |
|-------|------|---------|
| `fp_customer_unified` | 565 | Master customer table |
| `fp_sales_rep_unified` | 51 | Master sales rep table (with group assignment) |
| `fp_product_group_unified` | 20 | Master product group table |
| `fp_raw_product_groups` | 18 | Product group → pgcombine mapping |
| `sales_rep_groups` | 14 | Sales rep group definitions |
| `sales_rep_group_members` | ~60 | Group membership (links reps to groups) |

**⭐ Countries System (Unified Source):**

All country dropdowns now use the `master_countries` database table (199 countries) as the single source of truth.

| Component | API Endpoint | Data Source |
|-----------|-------------|-------------|
| Master Data → Country Reference | `/api/countries/list` | `master_countries` table |
| Sales Rep Budget HTML Export | `/api/countries/list` | `master_countries` table |
| Management Allocation HTML Export | Database query | `master_countries` table |
| Live Budget Table | `/api/countries/list` | `master_countries` table |

**Key Tables:**
- `master_countries` - 199 countries with regions, currency, coordinates
- `country_aliases` - Country name variations for matching

**⚠️ DEPRECATED: `WorldCountriesService.js` (179 countries) - Use `master_countries` table instead!**

The `/api/world-countries` endpoint still exists for backward compatibility but uses the less comprehensive `WorldCountriesService.js` hardcoded list. All new code should use `/api/countries/list`.

**⭐ Product Groups System (Unified Source):**

All product group dropdowns use `fp_actualcommon.pgcombine` with exclusions from `fp_product_group_exclusions`.
Currently returns **13 product groups** (excludes "Services Charges" and any admin-excluded PGs).

| Component | API Endpoint | Data Source | Count |
|-----------|-------------|-------------|-------|
| Sales Rep Budget HTML Export | `/api/product-groups-universal?division=FP` | `fp_actualcommon` + exclusions | 13 |
| Management Allocation HTML Export | Database query | `fp_actualcommon` + exclusions | 13 |
| Live Budget Table | `/api/product-groups-universal?division=FP` | `fp_actualcommon` + exclusions | 13 |
| Master Data → Product Groups | `/api/unified/product-groups` | `fp_product_group_unified` | 20 |

**⚠️ IMPORTANT: HTML exports show ALL product groups (not filtered by sales rep)**

**Key Query Pattern (excludes Services Charges and admin-excluded PGs):**
```sql
SELECT DISTINCT a.pgcombine
FROM fp_actualcommon a
LEFT JOIN fp_product_group_exclusions e ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
WHERE UPPER(a.admin_division_code) = 'FP'
  AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
  AND e.product_group IS NULL
ORDER BY a.pgcombine
```

**⭐ Sales Rep Management (Unified Source):**

All sales rep data flows through a single unified system managed via **Master Data → Sales Rep Management**:

```
sales_rep_groups (group definitions)
    │
    ├── id, group_name, division, is_active
    │
    └── sales_rep_group_members (membership)
            │
            └── group_id, member_name
                    │
                    └── Links to fp_sales_rep_unified.display_name
```

**Key Points:**
- **Group names can equal member names** (e.g., "Narek Koroukian" group contains Narek Koroukian + Salil Punnilath)
- **Single source of truth** for all budget-related group queries
- **fp_sales_rep_unified** contains `group_id` and `group_name` for each sales rep
- Used by: Sales Rep Budget, Management Allocation, Reports, Analytics

**Materialized Views (Performance):**

| View | Rows | Purpose | Refresh |
|------|------|---------|---------|
| `mv_sales_by_customer` | 1,442 | Pre-aggregated by customer | Auto-trigger |
| `mv_sales_by_rep_group` | 57 | Pre-aggregated by sales rep group | Auto-trigger |
| `mv_sales_by_product_group` | 96 | Pre-aggregated by pgcombine | Auto-trigger |
| `mv_sales_by_country` | 137 | Pre-aggregated by country | Auto-trigger |
| `mv_product_group_pricing` | ~200 | Product pricing by period | 2AM daily |

**Key Views:**

| View | Purpose |
|------|---------|
| `vw_unified_sales_data` | ⚠️ DEPRECATED - Use `fp_actualcommon` directly instead. This view is no longer maintained |
| `crm_sales_reps` | Active sales reps with employee & user accounts |

---

## 4.5 SERVICE DATA SOURCES (January 2026 Update)

### KPI Executive Summary Services ✅ UPDATED

All KPI services now use **`fp_actualcommon` + `fp_product_group_exclusions`** for proper data filtering:

| Service | Actual Data | Budget Data | Exclusions | Status |
|---------|------------|------------|-----------|--------|
| `ProductPerformanceService.js` | `fp_actualcommon` + pgcombine exclusion filter | N/A (Actual only) | `fp_product_group_exclusions` | ✅ UPDATED |
| `GeographicDistributionService.js` | `fp_actualcommon` + pgcombine exclusion filter | N/A (Actual only) | `fp_product_group_exclusions` | ✅ UPDATED |
| `CustomerInsightsService.js` | `fp_actualcommon` + pgcombine exclusion filter | N/A (Actual only) | `fp_product_group_exclusions` | ✅ UPDATED |

**Key Pattern (all KPI services):**
```javascript
// Get dynamic exclusions
const excludedCategories = await this.getExcludedProductGroups('FP');

// Query with exclusion filter
const query = `
  SELECT ... FROM fp_actualcommon d
  WHERE UPPER(d.admin_division_code) = 'FP'
  AND LOWER(d.pgcombine) NOT IN (${excludedPlaceholders})
  ...
`;
```

### Sales Dashboard Services ✅ UPDATED

**UniversalSalesByCountryService.js** (used by Sales Dashboard tables & reports):

| Component | Previous | Updated | Status |
|-----------|----------|---------|--------|
| Actual data source | `vw_unified_sales_data` (view) | `fp_actualcommon` (table) | ✅ |
| Product group filtering | None (view had no exclusions) | `fp_product_group_exclusions` | ✅ |
| Budget data source | Legacy `{division}_sales_rep_budget` | `fp_budget_unified` | ✅ |
| Division filtering | `division='FP'` | `admin_division_code='FP'` | ✅ |

**Updated Methods:**
- `getSalesRepDivisionalUltraFast()` - Now excludes product groups
- `getSalesByCustomerUltraFast()` - Now excludes product groups  
- `getSalesByCountry()` - Fixed division filtering
- `getCustomersBySalesRep()` - Fixed column naming & division filtering

### Divisional Dashboard Services ✅ UPDATED (Jan 23, 2026)

**ProductGroupDataService.js** (used by Divisional Dashboard Product Groups table):

| Component | Previous | Updated | Status |
|-----------|----------|---------|--------|
| Actual data source | `vw_unified_sales_data` (view) | `fp_actualcommon` (table) | ✅ |
| Budget data source | `fp_divisional_budget` (legacy) | `fp_budget_unified` (unified) | ✅ |
| Column names | `type`, `metric`, `value`, `year`, `month` | `data_type`, `value_type`, `amount`, `budget_year`, `month_no` | ✅ |

**Updated Methods:**
- `getProductGroupsData()` - Actual queries use `fp_actualcommon`, Budget uses `fp_budget_unified`
- `getMaterialCategoriesData()` - Actual queries use `fp_actualcommon`, Budget uses `fp_budget_unified`
- `getProcessCategoriesData()` - Actual queries use `fp_actualcommon`, Budget uses `fp_budget_unified`
- `getAllProductGroups()` - Uses `fp_actualcommon`
- `validateProductGroupData()` - Uses `fp_actualcommon` with `data_type` column

### Database Routes ✅ UPDATED (Jan 23, 2026)

**All routes in `server/routes/database.js` now use `fp_actualcommon`:**
- `/all-countries` - ✅ Migrated
- `/countries-by-sales-rep-db` - ✅ Migrated
- `/country-sales-data-db` - ✅ Migrated
- `/customers-db` - ✅ Migrated
- `/customers-by-salesrep-db` - ✅ Migrated
- `/customer-sales-rep-mapping` - ✅ Migrated
- `/customer-sales-data-db` - ✅ Migrated
- `/sales-rep-divisional-batch` - ✅ Migrated

**Result:** Complete migration from deprecated `vw_unified_sales_data` to `fp_actualcommon` table.

---

## 5. CORE MODULES


### 5.1 Authentication & Authorization

**Location:** `server/routes/auth.js`, `server/services/authService.js`

**Features:**
- JWT access tokens (15 min expiry)
- Refresh tokens (60 days, HTTP-only cookie)
- Role-based access control (RBAC)
- Permission-based granular access
- Auto-refresh on 401 responses
- Session management

**Roles:**
- `platform_admin` - Platform administration
- `admin` - Company administrator
- `sales_manager` - Sales management
- `sales_rep` - Sales representative
- `viewer` - Read-only access

**Key Endpoints:**
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### 5.2 AEBF (Actual/Estimate/Budget/Forecast)

**Location:** `server/routes/aebf/`, `src/components/MasterData/AEBF/`

**Purpose:** Budget planning, actual sales tracking, forecasting, Excel import/export

**Sub-modules:**
1. **Actual Tab** - Real sales data from Oracle ERP
2. **Budget Tab** - Divisional budget planning (official)
3. **Sales Rep Budget** - Individual sales rep targets
4. **Estimate Tab** - Sales estimates
5. **Forecast Tab** - Predictive forecasting

**Two-Tier Budget System:**

| Budget Type | Table | Structure | Purpose |
|-------------|-------|-----------|---------|
| **Divisional Budget** | `fp_budget_unified` | Division → Product Group → Month | Official company budget for P&L |
| **Sales Rep Budget** | `fp_budget_unified` | Division → Sales Rep → Customer → Product Group → Month | Individual targets (stretch goals) |

**Main Tables:**
- **`fp_actualcommon`** - All actual sales data (queries for Actual Tab)
- **`fp_budget_unified`** - All Budget, Forecast, Estimate data (unified table)
  - Uses `budget_type` column: 'DIVISIONAL' (no customer), 'SALES_REP' (with customer)
  - Uses `budget_status` column: 'draft', 'approved'
  - `is_budget` column: true for budgets, false for forecasts/estimates

**Key Features:**
- Excel import/export (multiple formats)
- HTML budget form import
- Draft/Approved workflow
- Year-over-year comparison
- Variance analysis
- Real-time sync with Oracle

**Data Flow:**
```
ACTUAL DATA (Oracle Direct Sync - NEW):
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
    ↓ Direct Connection (oracledb Thick Mode)
scripts/sync-oracle-direct.js
    ↓
fp_raw_oracle (Raw Oracle data, 50,745 rows)
    ↓ Trigger: after_fp_raw_oracle_change → sync_oracle_to_actualcommon()
fp_actualcommon ⭐ (MAIN TABLE - Proper Case, INITCAP formatting)
    ↓ All API Queries
Frontend UI

Oracle Connection Details:
  - Client: D:\app\client\Administrator\product\12.1.0\client_1
  - User: noor / ***REDACTED***
  - Connect String: PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com
  - View: HAP111.XL_FPSALESVSCOST_FULL (57 columns, ~50K rows, 3-5 min query)

UI Sync Buttons (ActualTab.jsx):
  - "Sync Current Year (Direct)" - syncs current year only
  - "Sync All Years (Direct)" - syncs all data (2019-2026)

BUDGET DATA FLOW:

1. DIVISIONAL BUDGET (no customers):
   Budget Tab → Divisional Budget sub-tab
   → fp_budget_unified (budget_type = 'DIVISIONAL')

2. SALES REP BUDGET (with customers):
   a) Sales Rep Import (single file):
      Budget Tab → Sales Budget → Sales Rep Import
      → fp_budget_unified (budget_type = 'SALES_REP')
   
   b) Bulk Import (multiple files):
      Budget Tab → Sales Budget → Bulk Import
      → fp_budget_bulk_import (staging)
      → fp_budget_unified (if 'Save to Final')

3. MANAGEMENT ALLOCATION (group level, no customers):
   Budget Tab → Sales Budget → Management Allocation
   → fp_sales_rep_group_budget_allocation
   (Uses same sales_rep_groups as source)
```

### 5.2.1 Management Allocation (Budget Allocation to Sales Rep Groups)

**Location:** `server/routes/sales-rep-group-allocation.js`, `src/components/MasterData/AEBF/ManagementAllocationTab.jsx`

**Purpose:** Management allocates yearly budget per **Sales Rep Group** per **Product Group**. This is a top-down approach where management decides how much each sales team should target.

**Table:** `fp_sales_rep_group_budget_allocation`

**UI Access:** Master Data → AEBF → Budget Tab → Sales Budget → Management Allocation (Admin only)

#### Key Concepts

1. **Yearly to Monthly Distribution:**
   - User enters a **yearly total** (e.g., 65 MT for "Commercial Items Plain")
   - System automatically distributes to 12 months
   - Distribution is based on **Actual Year sales pattern** (NOT fixed 8.33%)

2. **Monthly Distribution Pattern Logic (Priority Order):**
   ```
   1. Sales Rep Group's actual pattern for that product group
      ↓ (if no data)
   2. Division-wide actual pattern for that product group
      ↓ (if no data)
   3. Equal distribution (8.33% per month, adjusted for rounding)
   ```

3. **Adjustable Monthly Percentages:**
   - User can click "View/Edit Monthly %" button
   - Opens modal showing actual pattern and editable budget percentages
   - System ensures total = 100%
   - "Reset to Actual Pattern" button available

4. **Div Budget Remaining Tracking:**
   - Shows **TRUE remaining** divisional budget (includes ALL allocations)
   - Formula: `Remaining = Div Budget - Sum(ALL Groups Allocated)`
   - Example:
     ```
     Div Budget for "Pouches" = 200 MT
     Group A allocated = 60 MT (saved)
     Group B allocated = 80 MT (saved)
     
     When viewing ANY group:
     Remaining shown = 200 - 60 - 80 = 60 MT
     
     When Group A saves 65 MT for "Commercial Items Plain":
     Remaining updates from 240 MT → 175 MT immediately
     ```
   - **NOT a hard limit** - user can allocate MORE than remaining
   - Allows buffer since sales reps may not achieve 100% of targets
   - Remaining refreshes immediately after "Save Draft"

5. **Data Storage:**
   - Stored as **12 monthly rows** per product group per sales rep group
   - Each row has: `month_no`, `qty_kgs`, `amount`, `morm`
   - `budget_status`: 'draft' or 'approved'

#### Table Columns

| Column | Description |
|--------|-------------|
| `Product Group` | Product group name (pgcombine) |
| `{Year} Actual (MT)` | Previous year actual sales for the group |
| `Div Budget (MT)` | Total divisional budget for this product group |
| `Div Budget Remaining (MT)` | Remaining after all group allocations |
| `{Year} Group Submitted (MT)` | Sum of sales rep submitted budgets in this group |
| `{Year} Management Allocation (MT)` | Editable yearly allocation (auto-distributes to months) |

**Group Submitted Calculation:**
```sql
-- Get members of the selected group
SELECT member_name FROM sales_rep_group_members WHERE group_id = ?

-- Sum their submitted budgets (aggregated by product group, no customers)
SELECT pgcombine, SUM(qty_kgs) as submitted_kgs
FROM fp_budget_unified
WHERE budget_type = 'SALES_REP'
  AND sales_rep_name = ANY(members)  -- e.g., ['Narek Koroukian', 'Salil Punnilath']
GROUP BY pgcombine
```

#### UI Flow

```
1. Select Sales Rep Group (dropdown)
2. Select Actual Year (for pattern reference)
3. Select Budget Year (year being allocated)
4. Click "Load Data"
5. View table with all product groups
6. Enter yearly allocation in "Management Allocation" column
7. (Optional) Click "View/Edit Monthly %" to adjust distribution
8. Click "Save Draft" → distributes yearly to 12 months based on pattern
9. Click "Submit Final" to approve allocation
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sales-rep-group-allocation/groups` | GET | Get all sales rep groups |
| `/api/sales-rep-group-allocation/load-data` | POST | Load allocation data for a group |
| `/api/sales-rep-group-allocation/div-budget-summary` | GET | Get divisional budget totals |
| `/api/sales-rep-group-allocation/div-budget-remaining` | GET | Get **remaining** div budget per product group |
| `/api/sales-rep-group-allocation/save-draft` | POST | Save draft allocation (distributes to months) |
| `/api/sales-rep-group-allocation/submit-final` | POST | Approve/finalize allocation |

### 5.3 Division Management

**Location:** `server/database/DynamicDivisionConfig.js`, `server/database/divisionOracleMapping.js`

**Key Concept:** **Fully Dynamic - NO Hardcoded Divisions**

All division codes and names come from the `divisions` table. Divisions are **dynamically created via the Company Info page**. System adapts automatically when divisions are renamed or added.

**⚠️ CRITICAL: raw_divisions Mapping**

Each division in the `divisions` table has a `raw_divisions` JSONB array that maps multiple Oracle ERP division codes to a single admin division:

```sql
-- divisions table structure
CREATE TABLE divisions (
  division_code VARCHAR(10) PRIMARY KEY,  -- e.g., 'FP'
  division_name VARCHAR(100),              -- e.g., 'Flexible Packaging Division'
  raw_divisions JSONB DEFAULT '[]'         -- e.g., ['FP', 'BF'] - Oracle ERP codes
);

-- Current configuration:
-- FP division includes BOTH 'FP' and 'BF' from Oracle ERP
INSERT INTO divisions VALUES ('FP', 'Flexible Packaging Division', '["FP", "BF"]');
```

**How Division Queries MUST Work:**

When querying by division, you MUST use the `raw_divisions` array to include all mapped Oracle divisions:

```javascript
// ❌ WRONG - Only gets FP, misses BF data
const result = await pool.query(
  `SELECT * FROM fp_actualcommon WHERE admin_division_code = $1`,
  ['FP']
);

// ✅ CORRECT - Gets both FP and BF data
const rawDivisionsResult = await pool.query(
  `SELECT raw_divisions FROM divisions WHERE division_code = $1`,
  ['FP']
);
const rawDivisions = rawDivisionsResult.rows[0].raw_divisions; // ['FP', 'BF']

const result = await pool.query(
  `SELECT * FROM fp_actualcommon WHERE admin_division_code = ANY($1)`,
  [rawDivisions]
);
```

**Helper Function Available:**
```javascript
// In server/routes/fp.js - use this pattern in other routes
async function getRawDivisions(divisionCode) {
  const result = await pool.query(
    'SELECT raw_divisions FROM divisions WHERE division_code = $1',
    [divisionCode.toUpperCase()]
  );
  return result.rows[0]?.raw_divisions || [divisionCode.toUpperCase()];
}
```

**Current State (Interplast - Development Tenant):**
```
Company: Interplast
└── Division: FP (Flexible Packaging Division)
    ├─ raw_divisions: ['FP', 'BF']
    ├─ Oracle FP = 227 distinct customers
    └─ Oracle BF = 459 distinct customers
    Total: 606 distinct customers combined

⚠️ CURRENTLY ONLY FP DIVISION EXISTS
   No other divisions have been created
   No tables for other divisions (HC, etc.) exist
```

**Division Management UI (Company Settings → Company Info):**
- Shows Division Code, Division Name, and Raw Divisions (ERP) columns
- Edit dialog allows selecting multiple Oracle ERP divisions
- Saving triggers `sync_oracle_to_actualcommon()` to re-sync data

**Architecture:**
- `divisions` table defines divisions with Oracle code mappings
- `admin_division_code` column in data tables stores the Oracle ERP division code (FP or BF)
- Queries MUST use `admin_division_code = ANY(raw_divisions)` pattern
- UI components call `/api/divisions` for CRUD operations

### 5.4 Sales Data & Analytics

**Location:** `server/routes/salesData.js`, `server/routes/analytics.js`

**Features:**
- Geographic distribution analysis
- Customer insights and segmentation
- Sales rep performance tracking
- Product group analysis
- Time-series analysis
- Trend detection

**Key Services:**
- `GeographicDistributionService.js` - Country/region analytics
- `CustomerInsightsService.js` - Customer analysis with merge rules
- `ProductPerformanceService.js` - Product analytics with KGS, Amount, MoRM

#### ⭐ KPI Executive Summary (Divisional KPIs Card)

**Location:** `src/components/dashboard/KPIExecutiveSummary.jsx`, `src/components/dashboard/components/CustomerInsights.jsx`

**API Endpoints:**
| Endpoint | Service | Data Source |
|----------|---------|-------------|
| `/api/fp/product-performance` | ProductPerformanceService | `fp_actualcommon` + `fp_product_group_unified` |
| `/api/geographic-distribution` | GeographicDistributionService | `fp_actualcommon` + WorldCountriesService |
| `/api/customer-insights-db` | CustomerInsightsService | `fp_actualcommon` + merge rules |

**⚠️ CRITICAL: All KPI services use dynamic product group exclusions from `fp_product_group_exclusions` table**

Current exclusions for FP division: **"Raw Materials"**

**KPI Metrics (all exclude Raw Materials):**

| KPI | Calculation | Service Method |
|-----|-------------|----------------|
| Total Sales Volume | SUM(qty_kgs) | `getProductPerformanceData()` |
| Selling Price | SUM(amount) / SUM(qty_kgs) | Calculated in frontend |
| MoRM | SUM(morm) / SUM(qty_kgs) | Calculated in frontend |
| AVG Sales per Customer | totalSales / totalCustomers (after merge rules) | `getCustomerInsights()` |
| UAE vs Export % | By country grouping | `getGeographicDistributionData()` |
| Top Revenue Drivers | Top 3 by sales | Calculated in frontend |
| Process Categories | Aggregated by process type | `getProcessCategories()` |
| Material Categories | Aggregated by material type | `getMaterialCategories()` |

**Customer Insights with Merge Rules:**
- Raw customers from `fp_actualcommon` (e.g., 154 in 2025)
- After merge rules applied: 153 customers (Cosmoplast has 2 entries merged)
- Merge rules from `fp_division_customer_merge_rules` table (31 active rules)
- AVG Sales per Customer: 102,804,588.09 / 153 = **671.93K**

**YoY Comparison:**
- All KPIs show YoY growth comparison
- Previous year data fetched automatically
- Growth display: ▲ positive (blue), ▼ negative (red), — 0% (gray/neutral)
- Near-zero threshold: < 0.1% shows as neutral

**Key Query Pattern (with exclusions):**
```sql
SELECT SUM(amount) as total_amount, SUM(qty_kgs) as total_kgs
FROM fp_actualcommon
WHERE year = $1 AND month_no = ANY($2)
  AND (pgcombine IS NULL OR pgcombine NOT IN (
    SELECT product_group FROM fp_product_group_exclusions WHERE division_code = 'FP'
  ))
```

**Region Mapping (WorldCountriesService.js):**
- Hardcoded in-memory database (~700 lines)
- Maps countries to regions: UAE, Arabian Peninsula, West Asia, Levant, North Africa, Southern Africa, Europe, Americas, Asia-Pacific

**HTML Export:**
- MultiChartHTMLExport captures live DOM (cloneNode)
- All exclusions and merge rules automatically included
- CSS extracted at runtime from stylesheets

### 5.5 P&L (Profit & Loss)

**Location:** `server/routes/pl.js`, `server/services/plDataService.js`

**Purpose:** Financial P&L reporting and projections

**Features:**
- Monthly/Quarterly/Annual P&L
- Budget vs Actual comparison
- Variance analysis
- Excel export
- Refresh from Excel data

**P&L Structure:**
```
Revenue
  - Cost of Goods Sold (COGS)
    = Gross Profit
  - Operating Expenses
    = Operating Income (EBITDA)
  - Interest & Taxes
    = Net Income
```

### 5.6 CRM (Customer Relationship Management)

**Location:** `server/routes/crm/`, `src/components/CRM/`

**Features:**
- Customer master data management
- Contact management
- Lead tracking
- Opportunity pipeline
- Customer segmentation
- Customer lifetime value (CLV)

**Tables:**
- `fp_customer_unified` - Master customer table (565 customers)
- `crm_contacts` - Customer contacts
- `crm_leads` - Sales leads
- `crm_opportunities` - Sales opportunities
- `crm_product_groups` - Product group definitions

### 5.7 AI Learning System

**Location:** `server/routes/ai-learning.js`, `server/services/*LearningService.js`

**Purpose:** Self-learning algorithms for pattern recognition and predictions

**Capabilities:**
- **Customer Merging** - Automatic detection of duplicate customers
- **Churn Prediction** - Identify at-risk customers
- **Seasonality Detection** - Learn seasonal patterns
- **Sales Forecasting** - Predictive forecasting
- **Product Recommendations** - Cross-sell/up-sell suggestions
- **Anomaly Detection** - Detect unusual patterns

**Services:**
- `AILearningService.js` - Core learning engine
- `CustomerLearningService.js` - Customer analysis
- `SalesRepLearningService.js` - Sales rep patterns
- `ProductLearningService.js` - Product analysis
- `DivisionLearningService.js` - Division patterns

**Scheduler:**
- `LearningScheduler.js` - Background job scheduler
- Runs nightly at 2:00 AM
- Processes new data and updates models

### 5.8 Platform Administration (SaaS)

**Location:** `server/routes/platform/`, `src/components/platform/`

**Purpose:** Multi-tenant platform management - add/manage companies

**Features:**
- **Company Management** - Add new tenant companies to the platform
- Subscription plan management
- User provisioning
- Database provisioning (tenant setup)
- Usage metrics tracking
- Billing integration (planned)

**Current Tenants:**
- **Interplast** (default, used for development)
- New companies can be added via Platform Dashboard

**Platform Database:** `propackhub_platform`
- Companies, divisions, plans
- Platform users
- Tenant metrics

### 5.9 People & Access Module

**Location:** `src/components/people/`

**Purpose:** User management, roles, permissions, organization structure

**Components:**
- `PeopleAccessModule.jsx` - Main module container
- `UnifiedUserEmployee.jsx` - User/Employee management
- `RolesPermissions.jsx` - Role and permission management
- `AuthorizationRulesManager.jsx` - Access rules configuration
- `SalesTeamManager.jsx` - Sales team organization
- `TerritoryManager.jsx` - Territory assignments
- `EnhancedOrgChart.jsx` - Organization chart visualization
- `AuditLog.jsx` - Activity audit trail
- `UserProfile.jsx` - User profile settings

**Features:**
- User CRUD operations
- Role assignment
- Permission management
- Sales team hierarchy
- Territory mapping
- Audit logging

### 5.10 Customer Merging System

**Location:** `src/components/MasterData/CustomerMerging/`

**Purpose:** AI-assisted duplicate customer detection and merging

**Components:**
- `CustomerMergingPageRedesigned.jsx` - Main merging interface
- `CustomerMergingAISuggestions.jsx` - AI-powered merge suggestions
- `CustomerMergingActiveRules.jsx` - Active merge rules
- `CustomerManagement.jsx` - Customer CRUD
- `CustomerMasterPage.jsx` - Customer master data

**Features:**
- Fuzzy name matching (string-similarity, double-metaphone)
- AI learning from user decisions
- Merge rule management
- Batch merge operations
- Merge history tracking

### 5.11 Sales Rep Management

**Location:** `src/components/MasterData/SalesRep/`

**Purpose:** Sales rep master data and group management

**Components:**
- `SalesRepManagement.jsx` - Sales rep CRUD
- `SalesRepMaster.jsx` - Master data view
- `SalesRepGroups.jsx` - Group management

**Tables:**
- `fp_sales_rep_unified` - Master sales rep table
- `sales_rep_groups` - Group definitions
- `sales_rep_group_members` - Group membership

### 5.12 Reports Module

**Location:** `src/components/reports/`

**Purpose:** Sales performance reports and analytics

**Components:**
- `SalesRepReport.jsx` - Sales rep performance reports
- `ExecutiveSummary.jsx` - Executive summary dashboard
- `PerformanceDashboard.jsx` - Performance metrics
- `BudgetAchievementChart.jsx` - Budget vs actual charts
- `ProductGroupsAmountTable.jsx` - Product group analysis
- `ProductGroupsKgsTable.jsx` - Volume analysis
- `CustomersAmountTable.jsx` - Customer revenue analysis
- `CustomersKgsTable.jsx` - Customer volume analysis
- `TopCustomersTable.jsx` - Top customer ranking
- `PeriodComparison.jsx` - Period-over-period comparison
- `KeyInsights.jsx` - AI-generated insights
- `ExportActions.jsx` - PDF/Excel export

### 5.13 Settings Module

**Location:** `src/components/settings/`

**Purpose:** System configuration and administration

**Components:**
- `Settings.jsx` - Main settings container
- `OrganizationSettings.jsx` - Company info, divisions
- `DivisionManagement.jsx` - Division configuration with raw_divisions mapping
- `MasterDataSettings.jsx` - Master data configuration
- `DatabaseBackup.jsx` - Database backup/restore
- `PeriodConfiguration.jsx` - Fiscal period setup
- `TerritoriesManagement.jsx` - Territory configuration
- `EmployeesManagement.jsx` - Employee management
- `EmployeeBulkImport.jsx` - Bulk employee import
- `UserPermissions.jsx` - User permission matrix
- `ThemeSelector.jsx` - UI theme selection
- `PendingCountries.jsx` - Country mapping for unmatched data
- `AuthorizationRules.jsx` - Authorization configuration

---

## 6. DATA FLOW

### 6.1 Oracle to Application Flow (Actual Data)

```
┌────────────────────────────────────────────────────────────────┐
│              ORACLE ERP DATABASE (Production)                   │
│           Table: HAP111.XL_FPSALESVSCOST_FULL                   │
│                   ~50,000 rows × 57 columns                     │
└────────────────────────────────────────────────────────────────┘
                            ↓ Manual Export (XLSX)
┌────────────────────────────────────────────────────────────────┐
│                    EXCEL FILE (Local)                           │
│        server/data/FPSALESVSCOST_FULL.xlsx                      │
│             Sheet: XL_FPSALESVSCOST_FULL                        │
└────────────────────────────────────────────────────────────────┘
                            ↓ POST /api/fp/sync-oracle-excel
┌────────────────────────────────────────────────────────────────┐
│              IMPORT SCRIPT (Server-Side)                        │
│          import-excel-to-raw-fast.js                            │
│                                                                 │
│  1. DISABLE trigger (after_fp_raw_data_change)                 │
│  2. Read Excel with XLSX library                               │
│  3. Batch INSERT (500 rows at a time)                          │
│  4. Progress: 📊 45.2% | 22,850/50,529 rows                    │
│  5. RE-ENABLE trigger                                           │
│  6. Run sync_raw_to_actualcommon() ONCE                        │
│                                                                 │
│  Performance: ~50 seconds for 50K rows                         │
└────────────────────────────────────────────────────────────────┘
                            ↓ Direct INSERT
┌────────────────────────────────────────────────────────────────┐
│              fp_raw_data (Staging Table Only)                   │
│                (Raw Oracle Data - UPPERCASE)                    │
│                                                                 │
│  Columns: 57 from Oracle + 3 metadata                          │
│  Purpose: Staging area only - NOT queried by application       │
│  Rows: 50,529                                                  │
└────────────────────────────────────────────────────────────────┘
                            ↓ TRIGGER: after_fp_raw_data_change
                            ↓ Calls: sync_raw_to_actualcommon()
┌────────────────────────────────────────────────────────────────┐
│       ⭐ fp_actualcommon (MAIN ACTUAL DATA TABLE)              │
│             (Transformed & Unified Data)                        │
│                                                                 │
│  Transformations Applied:                                      │
│  ✅ INITCAP() for all text (Proper Case)                       │
│  ✅ Joined with company_divisions for division_name            │
│  ✅ Product groups mapped via fp_raw_product_groups            │
│  ✅ Sales rep groups looked up                                 │
│  ✅ admin_division_code denormalized                           │
│                                                                 │
│  Key Columns:                                                  │
│  • division_code (Oracle: FP, BF)                              │
│  • admin_division_code (Admin: FP) ⭐                          │
│  • customer_name, country, sales_rep_name                      │
│  • product_group, pgcombine                                    │
│  • amount, qty_kgs, morm                                       │
│  • year, month_no                                              │
│                                                                 │
│  ⚠️ ALL ACTUAL DATA QUERIES USE THIS TABLE                     │
│  Rows: 50,529                                                  │
└────────────────────────────────────────────────────────────────┘
                            ↓ API Queries
┌────────────────────────────────────────────────────────────────┐
│                   VIEW: vw_unified_sales_data                   │
│  Joins fp_actualcommon + customer/salesrep/country unified     │
└────────────────────────────────────────────────────────────────┘
                            ↓ REST API
┌────────────────────────────────────────────────────────────────┐
│         FRONTEND UI: ActualTab.jsx, Dashboards, Reports         │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Budget/Forecast/Estimate Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│                      DATA ENTRY SOURCES                         │
├────────────────────────────────────────────────────────────────┤
│  • HTML Budget Form Import                                     │
│  • Excel File Upload                                           │
│  • Direct UI Entry (Budget Tab)                                │
│  • Sales Rep Budget Entry                                      │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│      ⭐ fp_budget_bulk_import (STAGING TABLE)                  │
│             (Batch tracking & Review)                          │
└────────────────────────────────────────────────────────────────┘
                            ↓ (Finalize / Copy)
┌────────────────────────────────────────────────────────────────┐
│     ⭐ fp_budget_unified (MAIN BUDGET/FORECAST/ESTIMATE)       │
│                (All Planning Data in One Table)                 │
│                                                                 │
│  Key Columns:                                                  │
│  • budget_type: 'BUDGET' | 'FORECAST' | 'ESTIMATE'             │
│  • budget_status: 'draft' | 'approved'                         │
│  • division_code, admin_division_code                          │
│  • year, month_no (1-12)                                       │
│  • product_group, pgcombine                                    │
│  • sales_rep_name (for sales rep budgets)                      │
│  • customer_name (for sales rep budgets)                       │
│  • country                                                     │
│  • amount, kgs, morm                                           │
│                                                                 │
│  ⚠️ ALL BUDGET/FORECAST/ESTIMATE QUERIES USE THIS TABLE        │
└────────────────────────────────────────────────────────────────┘
                            ↓ API Queries
┌────────────────────────────────────────────────────────────────┐
│  FRONTEND UI:                                                  │
│  • BudgetTab.jsx (Divisional Budget)                           │
│  • ForecastTab.jsx (Forecasts)                                 │
│  • EstimateTab.jsx (Estimates)                                 │
│  • SalesRepBudget.jsx (Sales Rep Budget)                       │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 User Request Flow

```
User Browser
    ↓ HTTP Request
Vite Dev Server (port 3000)
    ↓ Proxy /api/* → localhost:3001
Express Server (port 3001)
    ↓
correlationMiddleware (assign request ID)
    ↓
metricsMiddleware (start timer)
    ↓
requestLogger (log incoming request)
    ↓
cookieParser (parse cookies for refresh token)
    ↓
body parsing (JSON, URL-encoded)
    ↓
CORS middleware (allow localhost:3000)
    ↓
security middleware (Helmet headers)
    ↓
rateLimiter (100 requests/15 min per IP)
    ↓
auth middleware (verify JWT)
    ↓
Route Handler (e.g., /api/fp/actual-data)
    ↓
Service Layer (business logic)
    ↓
Database Query (PostgreSQL)
    ↓
Redis Cache (if enabled)
    ↓
Response (JSON)
    ↓
requestSummaryMiddleware (log completed)
    ↓
Browser (update UI)
```

---

## 7. API ENDPOINTS

### 7.1 Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/change-password` | POST | Change password |

### 7.2 AEBF (Budget & Forecast)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aebf/actual/*` | Various | Actual sales data |
| `/api/aebf/budget/*` | Various | Divisional budget |
| `/api/aebf/estimate/*` | Various | Sales estimates |
| `/api/aebf/forecast/*` | Various | Sales forecasts |
| `/api/aebf/bulk-import` | POST | Bulk import budget files |
| `/api/aebf/config/*` | Various | AEBF configuration |
| `/api/budget-draft/*` | Various | Budget draft management |

### 7.3 Division Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fp/*` | Various | FP division data |
| `/api/fp/sync-oracle-excel` | POST | Sync from Oracle |
| `/api/fp/sync-oracle-excel/progress` | GET (SSE) | Sync progress stream |
| `/api/fp/raw-data/years` | GET | Available years |
| `/api/fp/raw-data/year-summary` | GET | Year summary (AMOUNT, KGS, MORM) |
| `/api/fp/raw-data/export` | GET | Export to Excel |

### 7.4 Universal (Cross-Division)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/universal/*` | Various | Cross-division queries |
| `/api/sales-data/*` | Various | Sales data analytics |
| `/api/sales-reps/*` | Various | Sales rep data |
| `/api/product-groups/*` | Various | Product group data |
| `/api/countries/*` | Various | Country data |

### 7.5 CRM

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/crm/customers` | GET | List customers |
| `/api/crm/customers/:id` | GET | Get customer details |
| `/api/crm/contacts` | GET/POST | Manage contacts |
| `/api/crm/leads` | GET/POST | Manage leads |
| `/api/crm/opportunities` | GET/POST | Manage opportunities |

### 7.6 Platform Administration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/platform/companies` | GET/POST | Manage companies |
| `/api/platform/companies/:id` | GET/PUT/DELETE | Company operations |
| `/api/platform/divisions` | GET/POST | Manage divisions |
| `/api/platform/metrics` | GET | Usage metrics |
| `/api/platform/sync` | POST | Sync tenant data |

### 7.7 Settings & Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings/*` | Various | Company settings |
| `/api/admin/*` | Various | Admin operations |
| `/api/database/*` | Various | Database operations |
| `/api/master-data/*` | Various | Master data management |

### 7.8 Monitoring & Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/metrics` | GET | Prometheus metrics |
| `/api-docs` | GET | Swagger API documentation |

### 7.9 Documentation (Auto-Update System)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documentation/overview` | GET | Full system overview (tables, routes, data flows) |
| `/api/documentation/tables` | GET | All database tables with row counts and categories |
| `/api/documentation/tables/:tableName` | GET | Detailed schema for specific table |
| `/api/documentation/routes` | GET | All registered API routes from route files |
| `/api/documentation/data-flows` | GET | Data flow diagrams (sync processes, budget flows) |
| `/api/documentation/modules` | GET | Frontend and backend module inventory |
| `/api/documentation/health` | GET | Documentation service health check |

> **Note:** These endpoints power the auto-updating System Workflow UI in Settings → Master Data.
> The documentation is generated dynamically by introspecting the actual database schema and route files.

---

## 8. FRONTEND ARCHITECTURE

### 8.1 Component Hierarchy

```
App.jsx (Root)
├── AuthProvider (Authentication context)
├── ThemeProvider (Theme context)
├── CurrencyProvider (Currency context)
├── Router
    ├── /login → Login.jsx
    ├── /setup → SetupWizard.jsx
    ├── /dashboard → Dashboard.jsx (Protected)
    │   ├── ExcelDataProvider
    │   ├── PLDataProvider
    │   ├── SalesDataProvider
    │   ├── SalesRepReportsProvider
    │   └── FilterProvider
    ├── /settings → Settings.jsx (Protected, Admin)
    ├── /people-access/* → PeopleAccessModule (Protected, Admin)
    ├── /profile → UserProfile.jsx (Protected)
    ├── /platform/* → PlatformDashboard.jsx (Protected)
    └── /crm/* → CRMModule (Protected)
```

### 8.2 Context Providers

| Context | Purpose | Location |
|---------|---------|----------|
| **AuthContext** | User authentication state | `src/contexts/AuthContext.jsx` |
| **ThemeContext** | UI theme (dark, light, colorful, classic) | `src/contexts/ThemeContext.jsx` |
| **CurrencyContext** | Currency conversion & formatting | `src/contexts/CurrencyContext.jsx` |
| **ExcelDataContext** | Sales data state management | `src/contexts/ExcelDataContext.jsx` |
| **PLDataContext** | P&L data state | `src/contexts/PLDataContext.jsx` |
| **SalesDataContext** | Sales analytics state | `src/contexts/SalesDataContext.jsx` |
| **SalesRepReportsContext** | Sales rep report state | `src/contexts/SalesRepReportsContext.jsx` |
| **SalesCountryContext** | Country sales data | `src/contexts/SalesCountryContext.jsx` |
| **FilterContext** | Global filter state | `src/contexts/FilterContext.jsx` |

### 8.3 Key Components

#### Dashboard

**Location:** `src/components/dashboard/Dashboard.jsx`

**Features:**
- KPI cards (Revenue, Growth, Customers, Orders)
- Sales trends chart
- Top products/customers
- Geographic distribution map
- Recent activities

**Key Dashboard Components:**
- `Dashboard.jsx` - Main dashboard container
- `DivisionalDashboardLanding.jsx` - Division-specific landing with card overlay system
- `FilterPanel.jsx` - Global filters (year, division, period)
- `KPIExecutiveSummary.jsx` - Executive KPI summary (Product Performance, Geographic, Customer Insights)
- `components/CustomerInsights.jsx` - Customer insights component with AVG Sales YoY
- `ChartView.jsx` / `TableView.jsx` - Chart/table toggle views
- `TabsComponent.jsx` - Tab navigation
- `MasterData.jsx` - Master data section
- `SalesByCustomerTableNew.jsx` - Customer sales table
- `SalesBySalesRepDivisional.jsx` - Sales rep performance
- `ProductGroupTable.jsx` - Product group analysis
- `SalesCountryLeafletMap.jsx` - Geographic sales map
- `ReactGlobe.jsx` / `ThreeGlobe.jsx` - 3D globe visualizations
- `RealWorld2DMap.jsx` - 2D map view
- `AILearningDashboard.jsx` - AI insights dashboard
- `PLFinancialDetail.jsx` - P&L details
- `MarginAnalysisDetail.jsx` - Margin analysis
- `BudgetActualWaterfallDetail.jsx` - Budget vs actual waterfall
- `PDFExport.jsx` / `MultiChartHTMLExport.jsx` - Export functionality
- `CountryReference.jsx` - Country master data

**DivisionalDashboardLanding Overlay:**
- Cards open in full-screen overlay with banner
- Banner shows only base period (e.g., "2025 FY Actual")
- "vs" comparison period removed from banner (Jan 22, 2026)

#### AEBF Module

**Location:** `src/components/MasterData/AEBF/`

**Components:**
- `AEBFTab.jsx` - Main AEBF container with tab navigation
- `ActualTab.jsx` - Actual sales data with Oracle sync
- `BudgetTab.jsx` - Divisional budget management
- `BudgetTab/` - Budget sub-components (helpers, index)
- `EstimateTab.jsx` - Sales estimates
- `ForecastTab.jsx` - Sales forecasts
- `ForecastSalesTab.jsx` - Forecast sales view
- `ForecastPLTab.jsx` - Forecast P&L integration
- `BudgetPLTab.jsx` - Budget P&L integration
- `BulkImportTab.jsx` - Bulk budget import
- `ManagementAllocationTab.jsx` - Group budget allocation
- `AEBFWorkflow.jsx` - Workflow management

#### CRM Module

**Location:** `src/components/CRM/`

**Components:**
- `CRMModule.jsx` - Main CRM container
- `CRMDashboard.jsx` - CRM overview dashboard
- `AdminCRMDashboard.jsx` - Admin CRM view
- `CustomerList.jsx` - Customer listing with filters
- `CustomerDetail.jsx` - Customer details page
- `CustomerMapView.jsx` - Geographic customer map
- `CustomerLocationPicker.jsx` - Location selection
- `CustomerSalesHistoryModal.jsx` - Sales history popup
- `MyCustomers.jsx` - Sales rep's assigned customers
- `SalesRepList.jsx` - Sales rep listing
- `ProductGroupList.jsx` - Product group listing
- `CRMAnalytics.jsx` - CRM analytics dashboard
- `CRMReports.jsx` - CRM reporting

#### Platform Dashboard

**Location:** `src/components/platform/PlatformDashboard.jsx`

**Features:**
- Company management
- Subscription plans
- User provisioning
- Usage metrics
- Tenant database management

### 8.4 Routing

**Protected Routes:**
- All routes except `/login` and `/setup` require authentication
- `ProtectedRoute` component verifies JWT token
- Auto-redirects to `/login` if unauthenticated
- Auto-refresh on 401 responses

**Platform Admin Routes:**
- `/platform` - Platform dashboard (platform_admin role only)
- Role-based access control

---

## 9. SECURITY & AUTHENTICATION

### 9.1 Authentication Flow

```
User Login
    ↓
POST /api/auth/login { email, password }
    ↓
Server validates credentials (bcrypt)
    ↓
Generate Access Token (JWT, 15 min expiry)
Generate Refresh Token (JWT, 60 days expiry)
    ↓
Store refresh token in user_sessions table
    ↓
Response:
{
  accessToken: "eyJhbGc...",
  user: { id, email, role, ... }
}
+ Set-Cookie: refreshToken (HTTP-only, secure, sameSite)
    ↓
Frontend stores accessToken in memory (not localStorage!)
    ↓
All API requests include: Authorization: Bearer <accessToken>
    ↓
On 401 Unauthorized:
  → POST /api/auth/refresh (with HTTP-only cookie)
  → Get new accessToken
  → Retry original request
    ↓
On refresh failure:
  → Logout user
  → Redirect to /login
```

### 9.2 JWT Token Structure

**Access Token (15 min):**
```json
{
  "userId": 1,
  "email": "user@example.com",
  "role": "sales_manager",
  "divisions": ["FP"],
  "permissions": ["view_sales", "edit_budget"],
  "iat": 1705446000,
  "exp": 1705446900
}
```

**Refresh Token (60 days):**
```json
{
  "userId": 1,
  "sessionId": "uuid-v4",
  "type": "refresh",
  "iat": 1705446000,
  "exp": 1710630000
}
```

### 9.3 Security Middleware

**Helmet.js Security Headers:**
- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

**Rate Limiting:**
- 100 requests per 15 minutes per IP
- Configurable per endpoint
- Redis-backed (if available)

**CORS Configuration:**
```javascript
{
  origin: 'http://localhost:3000',  // Dev
  credentials: true,                // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

### 9.4 Password Security

- bcrypt hashing (12 rounds)
- Password complexity requirements
- Password history (prevent reuse)
- Account lockout after failed attempts

### 9.5 Role-Based Access Control

**Roles:**
1. `platform_admin` - Full platform access
2. `admin` - Company administrator
3. `sales_manager` - Sales management
4. `sales_rep` - Sales representative
5. `viewer` - Read-only access

**Permission System:**
- Granular permissions (50+ permissions)
- Role-to-permission mapping
- User-specific permission overrides
- Division-based access control

---

## 10. DEVELOPMENT WORKFLOW

### 10.1 Environment Setup

**Prerequisites:**
- Node.js 18+
- PostgreSQL 14+
- Redis (optional)

**Installation:**
```bash
# Clone repository
