# ProPackHub SaaS Platform Architecture

## 🎯 Executive Summary

ProPackHub is a **multi-tenant SaaS platform** for flexible packaging companies. Each customer (company) gets their own isolated database while sharing the same application codebase.

---

## 👤 User Roles & Access Levels

### Platform Owner (You)

| Attribute | Value |
|-----------|-------|
| **Email** | `admin@propackhub.com` |
| **Default Password** | `ProPackHub2025!` (change immediately!) |
| **Role** | `platform_admin` |
| **company_id** | `NULL` (not tied to any company) |
| **Access** | All companies, all settings, billing, onboarding |

### User Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USER ACCESS HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ PLATFORM ADMIN (ProPackHub Owner)                           │   │
│  │ • Email: admin@propackhub.com                               │   │
│  │ • Access: ALL companies, platform settings, billing         │   │
│  │ • Can: Create companies, manage subscriptions               │   │
│  │ • Dashboard: Platform Admin Dashboard                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│              ┌───────────────┴───────────────┐                     │
│              ▼                               ▼                     │
│  ┌─────────────────────┐         ┌─────────────────────┐          │
│  │ COMPANY ADMIN       │         │ COMPANY ADMIN       │          │
│  │ (Interplast)        │         │ (Future Customer)   │          │
│  │ • Access: Own Co.   │         │ • Access: Own Co.   │          │
│  │ • Can: Manage users │         │ • Can: Manage users │          │
│  │   divisions, data   │         │   divisions, data   │          │
│  └─────────────────────┘         └─────────────────────┘          │
│           │                                │                       │
│     ┌─────┴─────┐                    ┌─────┴─────┐                │
│     ▼           ▼                    ▼           ▼                │
│  ┌──────┐  ┌──────┐              ┌──────┐  ┌──────┐              │
│  │Manager│  │ User │              │Manager│  │ User │              │
│  │(FP)   │  │(HC)  │              │       │  │      │              │
│  └──────┘  └──────┘              └──────┘  └──────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Role Comparison

| Role | company_id | is_platform_admin | Can Access | Dashboard |
|------|------------|-------------------|------------|-----------|
| **Platform Admin** | NULL | true | All companies | Platform Admin |
| **Company Admin** | Set | false | Own company only | Company Admin |
| **Manager** | Set | false | Assigned divisions | Division Dashboard |
| **Sales Rep** | Set | false | Own data only | Sales Dashboard |
| **Viewer** | Set | false | Reports only | Reports View |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROPACKHUB SAAS PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PLATFORM DATABASE                                 │   │
│  │                  (propackhub_platform)                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │  Companies  │ │   Users     │ │   Plans     │ │  Platform   │   │   │
│  │  │  (tenants)  │ │  (global)   │ │(subscriptions)│ │   Admins   │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│  │ INTERPLAST DB    │ │   ACME DB        │ │  FLEXPACK DB     │           │
│  │ (interplast_db)  │ │   (acme_db)      │ │  (flexpack_db)   │           │
│  │                  │ │                  │ │                  │           │
│  │ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌──────────────┐ │           │
│  │ │ FP Division  │ │ │ │ FILM Division│ │ │ │ WRAP Division│ │           │
│  │ │ fp_*_tables  │ │ │ │ film_*_tables│ │ │ │ wrap_*_tables│ │           │
│  │ └──────────────┘ │ │ └──────────────┘ │ │ └──────────────┘ │           │
│  │ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌──────────────┐ │           │
│  │ │ HC Division  │ │ │ │ PACK Division│ │ │ │ POUCH Div    │ │           │
│  │ │ hc_*_tables  │ │ │ │ pack_*_tables│ │ │ │ pouch_*_tables│ │           │
│  │ └──────────────┘ │ │ └──────────────┘ │ │ └──────────────┘ │           │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Strategy: Database-Per-Tenant

### Why Database-Per-Tenant?

| Approach | Pros | Cons |
|----------|------|------|
| **Shared Database, Shared Schema** | Cheap, simple | Data leak risk, noisy neighbor |
| **Shared Database, Separate Schema** | Moderate isolation | Complex migrations |
| **Database-Per-Tenant** ✅ | Complete isolation, easy backup/restore, regulatory compliance | More databases to manage |

**We chose Database-Per-Tenant because:**
1. **Complete data isolation** - Each company's data is in its own database
2. **Easy backup/restore** - Backup one company without affecting others
3. **Compliance friendly** - Data residency requirements
4. **Performance isolation** - One tenant can't slow down others
5. **Custom configurations** - Each tenant can have different settings

---

## 🗄️ Database Naming Convention

### Platform Database
```
propackhub_platform    -- Central SaaS management database
```

### Company Databases
```
{company_code}_database

Examples:
- interplast_database  -- Interplast company data
- acme_database        -- Acme Packaging company data
- flexpack_database    -- FlexPack Industries data
```

### Table Naming (within company database)
```
{division_code}_{table_name}

Examples (inside interplast_database):
- fp_data_excel          -- FP division sales data
- fp_customer_master     -- FP division customers
- fp_product_groups      -- FP division products
- hc_data_excel          -- HC division sales data
- hc_customer_master     -- HC division customers
```

---

## 🔐 Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                          LOGIN FLOW                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User enters: email + password                                    │
│                     │                                                │
│                     ▼                                                │
│  2. Platform DB: Validate credentials                                │
│     SELECT * FROM platform_users WHERE email = ?                     │
│                     │                                                │
│                     ▼                                                │
│  3. Get company assignment:                                          │
│     SELECT company_code, database_name FROM companies                │
│     WHERE company_id = user.company_id                               │
│                     │                                                │
│                     ▼                                                │
│  4. Generate JWT with company context:                               │
│     {                                                                │
│       user_id: 123,                                                  │
│       company_id: 1,                                                 │
│       company_code: 'interplast',                                    │
│       database_name: 'interplast_database',                          │
│       divisions: ['fp', 'hc'],                                       │
│       role: 'admin'                                                  │
│     }                                                                │
│                     │                                                │
│                     ▼                                                │
│  5. All subsequent API calls use company's database                  │
│     Connection pool switches to: interplast_database                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🏢 Platform Database Schema

### Core Tables

```sql
-- ============================================================================
-- PROPACKHUB PLATFORM DATABASE (propackhub_platform)
-- ============================================================================

-- Companies (Tenants)
CREATE TABLE companies (
  company_id SERIAL PRIMARY KEY,
  company_code VARCHAR(50) UNIQUE NOT NULL,      -- 'interplast', 'acme'
  company_name VARCHAR(200) NOT NULL,             -- 'Interplast LLC'
  database_name VARCHAR(100) UNIQUE NOT NULL,     -- 'interplast_database'
  
  -- Company Details
  logo_url VARCHAR(500),
  website VARCHAR(200),
  country VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Subscription
  plan_id INTEGER REFERENCES subscription_plans(plan_id),
  subscription_status VARCHAR(20) DEFAULT 'trial',  -- trial, active, suspended, cancelled
  trial_ends_at TIMESTAMP,
  subscription_starts_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  
  -- Limits
  max_users INTEGER DEFAULT 5,
  max_divisions INTEGER DEFAULT 2,
  max_storage_gb INTEGER DEFAULT 10,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Divisions
CREATE TABLE company_divisions (
  division_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id),
  division_code VARCHAR(20) NOT NULL,            -- 'fp', 'hc'
  division_name VARCHAR(100) NOT NULL,           -- 'Flexible Packaging'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, division_code)
);

-- Platform Users (all users across all companies)
CREATE TABLE platform_users (
  user_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id),
  
  -- Identity
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  avatar_url VARCHAR(500),
  
  -- Access
  role VARCHAR(50) DEFAULT 'user',               -- platform_admin, company_admin, manager, user
  allowed_divisions TEXT[],                       -- ['fp', 'hc'] or NULL for all
  permissions JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Sessions
CREATE TABLE user_sessions (
  session_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES platform_users(user_id),
  token_hash VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription Plans
CREATE TABLE subscription_plans (
  plan_id SERIAL PRIMARY KEY,
  plan_code VARCHAR(50) UNIQUE NOT NULL,         -- 'starter', 'professional', 'enterprise'
  plan_name VARCHAR(100) NOT NULL,
  
  -- Limits
  max_users INTEGER,
  max_divisions INTEGER,
  max_storage_gb INTEGER,
  
  -- Features
  features JSONB DEFAULT '{}',                   -- { "ai_enabled": true, "api_access": true }
  
  -- Pricing
  monthly_price DECIMAL(10,2),
  annual_price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log (platform-level)
CREATE TABLE platform_audit_log (
  log_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id),
  user_id INTEGER REFERENCES platform_users(user_id),
  action VARCHAR(100) NOT NULL,                  -- 'company.created', 'user.login', 'division.added'
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Database Provisioning Queue
CREATE TABLE provisioning_queue (
  queue_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(company_id),
  status VARCHAR(20) DEFAULT 'pending',          -- pending, in_progress, completed, failed
  action VARCHAR(50) NOT NULL,                   -- 'create_database', 'add_division', 'backup'
  parameters JSONB,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🏭 Company Database Template

Each new company gets a database with these core tables:

```sql
-- ============================================================================
-- COMPANY DATABASE TEMPLATE
-- Tables are prefixed with division code: {division}_table_name
-- ============================================================================

-- Division Configuration (shared across divisions in this company)
CREATE TABLE division_config (
  config_id SERIAL PRIMARY KEY,
  division_code VARCHAR(20) NOT NULL,
  config_key VARCHAR(100) NOT NULL,
  config_value JSONB,
  UNIQUE(division_code, config_key)
);

-- For each division, these tables are created with prefix:
-- Example: fp_data_excel, fp_customer_master, etc.

-- {division}_data_excel         -- Sales transaction data
-- {division}_customer_master    -- Customer master data
-- {division}_customer_aliases   -- Customer name variations
-- {division}_product_group_pricing_rounding  -- Product pricing
-- {division}_material_percentages  -- Material breakdown
-- {division}_divisional_budget   -- Budget data
-- {division}_sales_rep_budget    -- Sales rep budgets
-- ... (all existing tables)
```

---

## 🔄 Connection Pool Management

```javascript
// server/database/multiTenantPool.js

class MultiTenantPoolManager {
  constructor() {
    this.platformPool = new Pool({ database: 'propackhub_platform' });
    this.tenantPools = new Map();  // company_code -> Pool
  }

  // Get platform pool for authentication
  getPlatformPool() {
    return this.platformPool;
  }

  // Get or create pool for a specific company
  async getTenantPool(companyCode) {
    if (!this.tenantPools.has(companyCode)) {
      // Get database name from platform
      const result = await this.platformPool.query(
        'SELECT database_name FROM companies WHERE company_code = $1',
        [companyCode]
      );
      
      if (!result.rows[0]) {
        throw new Error(`Company not found: ${companyCode}`);
      }

      const pool = new Pool({ 
        database: result.rows[0].database_name 
      });
      this.tenantPools.set(companyCode, pool);
    }
    
    return this.tenantPools.get(companyCode);
  }
}
```

---

## 🚀 Phase 1: SaaS Platform Foundation

### What We Build First

| Component | Priority | Description |
|-----------|----------|-------------|
| **Platform Database** | P0 | Create `propackhub_platform` with core tables |
| **Company Management** | P0 | CRUD for companies + database provisioning |
| **User Authentication** | P0 | Platform-level login with company routing |
| **Division Management** | P0 | Add/manage divisions per company |
| **Connection Routing** | P0 | Route requests to correct company database |
| **Company Onboarding** | P1 | Wizard to set up new company + divisions |
| **Platform Admin UI** | P1 | Super admin to manage all companies |

### Migration Path for Interplast

```
Current State:
  - fp_database (with all Interplast FP data)
  - ip_auth_database (authentication data)

Target State:
  1. Create: propackhub_platform database
  2. Rename: fp_database → interplast_database
  3. Migrate: auth data from ip_auth_database → propackhub_platform
  4. Create: companies record for Interplast
  5. Create: division records (FP, HC)
  6. Update: connection routing in application
```

---

## 📋 Implementation Checklist

### Phase 1A: Platform Database (Week 1)
- [ ] Create `propackhub_platform` database
- [ ] Create `companies` table
- [ ] Create `company_divisions` table
- [ ] Create `platform_users` table
- [ ] Create `subscription_plans` table
- [ ] Seed initial plans (Starter, Professional, Enterprise)
- [ ] Create Interplast as first company

### Phase 1B: Authentication Refactor (Week 1-2)
- [ ] Create `MultiTenantPoolManager` class
- [ ] Refactor auth service for platform-level login
- [ ] Update JWT to include company context
- [ ] Create middleware to inject company pool
- [ ] Update all routes to use company-aware pool

### Phase 1C: Company Onboarding (Week 2)
- [ ] Create database provisioning service
- [ ] Create division setup automation
- [ ] Build company admin dashboard
- [ ] Build platform super-admin UI

### Phase 1D: Migrate Interplast (Week 2)
- [ ] Backup existing databases
- [ ] Rename fp_database → interplast_database
- [ ] Migrate user data to platform
- [ ] Test all existing functionality
- [ ] Deploy and verify

---

## 🔒 Security Considerations

1. **Database Isolation**: Each company's data in separate database
2. **Connection Validation**: Verify user belongs to company before connecting
3. **Cross-Tenant Prevention**: Middleware validates company context on every request
4. **Audit Logging**: Track all cross-company admin actions
5. **Encryption**: All connections use SSL, passwords bcrypt hashed

---

## 📁 File Structure Changes

```
server/
├── database/
│   ├── config.js              -- Existing (keep for backwards compat)
│   ├── platformPool.js        -- NEW: Platform database pool
│   ├── multiTenantPool.js     -- NEW: Company pool manager
│   └── provisioning.js        -- NEW: Database provisioning
├── routes/
│   ├── platform/              -- NEW: Platform admin routes
│   │   ├── companies.js       -- Company CRUD
│   │   ├── divisions.js       -- Division management
│   │   ├── users.js           -- Platform user management
│   │   └── subscriptions.js   -- Subscription management
│   └── ... (existing routes)
├── middleware/
│   ├── companyContext.js      -- NEW: Inject company into request
│   └── ... (existing middleware)
└── services/
    ├── CompanyService.js      -- NEW: Company management
    ├── ProvisioningService.js -- NEW: Database setup
    └── ... (existing services)
```

---

## ✅ Success Criteria

Phase 1 is complete when:

1. ✅ `propackhub_platform` database exists with all core tables
2. ✅ Interplast registered as first company
3. ✅ Users can login and be routed to Interplast database
4. ✅ All existing functionality works unchanged
5. ✅ Platform admin can view company list
6. ✅ New company can be created (database provisioned automatically)

---

*Document Version: 1.0*
*Last Updated: December 28, 2025*
*Author: GitHub Copilot*
