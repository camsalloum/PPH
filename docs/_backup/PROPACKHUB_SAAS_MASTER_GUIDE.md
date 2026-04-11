# ProPackHub SaaS Platform - Complete Implementation Guide

**Version:** 1.0  
**Created:** December 28, 2025  
**Status:** Production Ready  

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Security Principles](#security-principles)
3. [Database Structure](#database-structure)
4. [API Reference](#api-reference)
5. [Implementation Status](#implementation-status)
6. [Setup Instructions](#setup-instructions)
7. [Deprecated Components](#deprecated-components)

---

## Architecture Overview

### Multi-Tenant SaaS Model

ProPackHub is a **Database-per-Tenant** SaaS platform where:
- Each customer (tenant) gets their own isolated databases
- Platform database manages subscriptions ONLY
- Complete data isolation between tenants
- No cross-tenant data access

```
┌─────────────────────────────────────────────────────────────┐
│              ProPackHub Platform Database                    │
│                (propackhub_platform)                         │
│                                                              │
│  Purpose: SUBSCRIPTION MANAGEMENT ONLY                       │
│  • Companies & subscription plans                            │
│  • Company divisions (for billing/limits)                    │
│  • Platform admin users                                      │
│  • Reported metrics (tenant-pushed)                          │
│  • API keys for tenant authentication                        │
│                                                              │
│  ❌ DOES NOT STORE:                                          │
│  • Customer data                                             │
│  • Sales data                                                │
│  • Financial records                                         │
│  • Tenant user credentials                                   │
│  • ANY tenant business data                                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ API Communication Only
                          │ (Tenant pushes metrics)
                          ▼
    ┌──────────────────────────────────────────────────┐
    │         Tenant: Interplast Co LTD                │
    ├──────────────────────────────────────────────────┤
    │  Auth DB: ip_auth_database                       │
    │  • users, permissions, company_settings          │
    │                                                  │
    │  Data DB: fp_database                            │
    │  • fp_customer_master, fp_data_excel            │
    │  • Sales, budget, operational data               │
    └──────────────────────────────────────────────────┘
                          │
    ┌──────────────────────────────────────────────────┐
    │         Tenant: Future Company                   │
    ├──────────────────────────────────────────────────┤
    │  Auth DB: company_auth_database                  │
    │  • Completely isolated                           │
    │                                                  │
    │  Data DB: company_data_database                  │
    │  • Completely isolated                           │
    └──────────────────────────────────────────────────┘
```

---

## Security Principles

### 🔒 Core Security Rule

**THE PLATFORM NEVER ACCESSES TENANT DATABASES**

This is enforced through:

1. **No Database Credentials Stored**
   - Platform does NOT store `database_name` or `auth_database_name`
   - These columns are marked DEPRECATED (kept for backward compatibility only)
   
2. **Metrics Push Model**
   - Tenants PUSH their metrics via authenticated API
   - Platform NEVER queries tenant databases
   
3. **Separate User Management**
   - Platform admins: Stored in `propackhub_platform.platform_users`
   - Tenant users: Stored in tenant's own auth database
   - No shared authentication

4. **API Key Authentication**
   - Each tenant has API key + secret for metrics reporting
   - SHA256 hashed secrets
   - Rate limiting and expiration

### Access Matrix

| User Type | Can Access | Cannot Access |
|-----------|-----------|---------------|
| **Platform Admin** | • Subscription dashboard<br>• Reported metrics<br>• Billing info<br>• Company list | • Tenant business data<br>• Customer records<br>• Sales data<br>• Tenant user credentials |
| **Tenant Admin** | • Own company data<br>• Own users<br>• All business data | • Platform administration<br>• Other tenants' data<br>• Subscription management |
| **Tenant User** | • Assigned data only<br>• Based on permissions | • Other tenants<br>• Platform administration |

---

## Database Structure

### Platform Database: `propackhub_platform`

#### Tables

**1. subscription_plans**
- Available subscription tiers (Free, Pro, Enterprise)
- Price, limits, features

**2. companies**
```sql
CREATE TABLE companies (
  company_id SERIAL PRIMARY KEY,
  company_code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'interplast'
  company_name VARCHAR(200) NOT NULL,         -- e.g., 'Interplast Co LTD'
  
  -- Subscription
  plan_id INTEGER REFERENCES subscription_plans,
  subscription_status VARCHAR(20) DEFAULT 'trial',
  trial_ends_at TIMESTAMP,
  
  -- Limits
  max_users INTEGER,
  max_divisions INTEGER,
  max_storage_gb INTEGER,
  
  -- Reported Metrics (tenant-pushed)
  reported_user_count INTEGER DEFAULT 0,
  reported_division_count INTEGER DEFAULT 0,
  reported_storage_mb INTEGER DEFAULT 0,
  metrics_last_reported_at TIMESTAMP,
  
  -- DEPRECATED (kept for backward compatibility)
  database_name VARCHAR(100),         -- ⚠️ DO NOT USE
  auth_database_name VARCHAR(100),    -- ⚠️ DO NOT USE
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**3. company_divisions**
- Division metadata for billing/limits
- NOT tenant business data, just subscription info
```sql
CREATE TABLE company_divisions (
  division_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies,
  division_code VARCHAR(50) NOT NULL,    -- e.g., 'FP'
  division_name VARCHAR(200) NOT NULL,   -- e.g., 'Flexible Packaging Division'
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);
```

**4. platform_users**
- Platform administrators ONLY
- NOT tenant users
```sql
CREATE TABLE platform_users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(200),
  is_platform_admin BOOLEAN DEFAULT FALSE,
  company_id INTEGER REFERENCES companies,  -- NULL for pure platform admins
  is_active BOOLEAN DEFAULT TRUE
);
```

**5. tenant_api_keys**
- Authentication for metrics reporting
```sql
CREATE TABLE tenant_api_keys (
  key_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies,
  api_key VARCHAR(100) UNIQUE NOT NULL,      -- e.g., 'ppk_xxxxx...'
  api_secret_hash VARCHAR(200) NOT NULL,     -- SHA256 hashed
  can_report_metrics BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

**6. tenant_reported_metrics**
- Historical audit trail of tenant-reported metrics
```sql
CREATE TABLE tenant_reported_metrics (
  metric_id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies,
  active_user_count INTEGER DEFAULT 0,
  total_user_count INTEGER DEFAULT 0,
  division_count INTEGER DEFAULT 0,
  storage_used_mb INTEGER DEFAULT 0,
  monthly_active_users INTEGER DEFAULT 0,
  data_records_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP,
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tenant Databases

Each tenant has TWO databases (architecture may vary):

**Auth Database** (e.g., `ip_auth_database`)
- `users` - Tenant user accounts
- `user_permissions` - Access control
- `company_settings` - Company configuration (key-value store)
- `divisions` - Division definitions (may vary by tenant)

**Data Database** (e.g., `fp_database`)
- Division-prefixed tables (e.g., `fp_customer_master`)
- Sales, budget, operational data
- Business records

---

## API Reference

### Platform Admin APIs

Base URL: `/api/platform`

Authentication: `Authorization: Bearer <jwt_token>`

#### Companies
```http
GET /api/platform/auth/companies
# List all companies with reported metrics

GET /api/platform/companies/:id
# Get company details

POST /api/platform/companies
# Register new company (subscription)

PUT /api/platform/companies/:id/subscription
# Update subscription plan
```

#### Statistics
```http
GET /api/platform/stats
# Platform-wide statistics (requires platform admin)
```

### Tenant Metrics APIs

Base URL: `/api/platform/tenant-metrics`

Authentication:
```
X-API-Key: ppk_xxxxx...
X-API-Secret: <secret>
```

#### Metrics Reporting
```http
POST /api/platform/tenant-metrics/report
Content-Type: application/json

{
  "active_user_count": 7,
  "total_user_count": 7,
  "division_count": 1,
  "storage_used_mb": 250,
  "monthly_active_users": 3,
  "data_records_count": 76,
  "last_activity_at": "2025-12-28T12:00:00Z"
}

# Response:
{
  "success": true,
  "message": "Metrics reported successfully",
  "data": {
    "company_id": 1,
    "reported_at": "2025-12-28T12:00:00Z"
  }
}
```

#### Health Check
```http
POST /api/platform/tenant-metrics/health
Content-Type: application/json

{
  "status": "healthy",
  "version": "1.0.0",
  "message": "All systems operational"
}
```

#### Subscription Status
```http
GET /api/platform/tenant-metrics/my-status

# Response:
{
  "success": true,
  "data": {
    "company_code": "interplast",
    "company_name": "Interplast Co LTD",
    "subscription": {
      "status": "trial",
      "plan": "Enterprise",
      "trial_ends_at": "2026-01-28T00:00:00Z"
    },
    "limits": {
      "max_users": 50,
      "max_divisions": 10,
      "max_storage_gb": 100
    },
    "current_usage": {
      "users": 7,
      "divisions": 1,
      "storage_mb": 250
    }
  }
}
```

---

## Implementation Status

### ✅ Completed

1. **Platform Database**
   - Created `propackhub_platform` database
   - 9 tables including companies, divisions, API keys
   - Migration script: `server/migrations/setup-platform-database.js`

2. **Metrics Reporting System**
   - API endpoints for tenant metrics reporting
   - API key authentication (SHA256 hashed)
   - Historical metrics audit trail
   - Routes: `server/routes/platform/tenantMetrics.js`

3. **Tenant-Side Reporter**
   - Service to collect and report metrics
   - Configurable reporting interval
   - File: `server/services/PlatformMetricsReporter.js`

4. **Platform Admin Dashboard**
   - React component for subscription management
   - Shows reported metrics (NOT queried from tenants)
   - Removed dangerous "Login As" feature
   - File: `src/components/platform/PlatformDashboard.jsx`

5. **Security Enforcement**
   - Platform queries only `propackhub_platform`
   - Tenant database credentials not stored
   - Marked deprecated columns with warnings
   - Updated `CompanyService` to use reported metrics

6. **Documentation**
   - Security architecture documented
   - API reference created
   - Setup instructions provided

### 🟡 Partially Complete

1. **Metrics Collection**
   - Manual script works: `scripts/report-metrics-now.js`
   - Automatic periodic reporting needs to be enabled in server startup

2. **Company Management UI**
   - "Manage" button placeholder exists
   - Needs modal/page for subscription management

3. **Metrics Detail View**
   - "View Metrics" button placeholder exists
   - Needs detailed metrics history view

### ⚠️ Deprecated (Do Not Use)

These components exist but VIOLATE the security architecture:

1. **CompanySyncService.js**
   - ❌ Accesses tenant databases from platform
   - ❌ Queries `company_settings` from tenant auth DB
   - Should be replaced with metrics push model
   - File: `server/services/CompanySyncService.js`

2. **Database Name Columns**
   - `companies.database_name` - ⚠️ DEPRECATED
   - `companies.auth_database_name` - ⚠️ DEPRECATED
   - Kept for backward compatibility only
   - DO NOT use in new code

3. **Platform Access to Tenant DBs**
   - Any code using `getTenantPool()` from platform context
   - Should only be used by TENANT users accessing their own data

---

## Setup Instructions

### Initial Setup

1. **Create Platform Database**
   ```bash
   cd "D:\Projects\IPD 10-12\server"
   node migrations/setup-platform-database.js
   ```

2. **Run Security Fix**
   ```bash
   cd "D:\Projects\IPD 10-12"
   node scripts/fix-platform-security.js
   ```
   
   This creates:
   - API keys table
   - Metrics tables
   - Generates API key for existing companies
   - **Save the API key and secret!**

3. **Configure Tenant Environment**
   
   Add to tenant's `.env`:
   ```env
   PLATFORM_URL=http://localhost:5000
   PLATFORM_API_KEY=ppk_xxxxx...
   PLATFORM_API_SECRET=xxxxx...
   METRICS_REPORT_INTERVAL=3600000  # 1 hour in milliseconds
   ```

4. **Enable Periodic Reporting**
   
   In `server/index.js`, add after server starts:
   ```javascript
   const metricsReporter = require('./services/PlatformMetricsReporter');
   
   // Initialize and start reporting
   metricsReporter.init().then(() => {
     metricsReporter.startPeriodicReporting();
     logger.info('Platform metrics reporting started');
   });
   ```

5. **Report Initial Metrics**
   ```bash
   cd "D:\Projects\IPD 10-12"
   node scripts/report-metrics-now.js
   ```

### Testing

1. **Start Servers**
   ```bash
   START-SERVERS.cmd
   ```

2. **Login as Platform Admin**
   - URL: `http://localhost:3000/login`
   - Email: `admin@propackhub.com`
   - Password: `ProPackHub2025!`
   - Will redirect to `/platform`

3. **Verify Dashboard**
   - Should show Interplast Co LTD
   - Total Users: 7 (reported)
   - Divisions: 1
   - Metrics last reported date visible

4. **Test Metrics Reporting**
   ```bash
   node scripts/test-metrics-reporting.js
   ```

### Adding New Tenant

1. **Register Company** (API or manual SQL)
   ```sql
   INSERT INTO companies (
     company_code, company_name, plan_id, subscription_status
   ) VALUES (
     'acme', 'ACME Corp', 1, 'trial'
   );
   ```

2. **Generate API Key**
   Run security fix script or manual:
   ```bash
   node scripts/fix-platform-security.js
   ```

3. **Setup Tenant Databases**
   - Create auth database
   - Create data database(s)
   - Initialize with tenant's structure

4. **Configure Metrics Reporter**
   - Add API credentials to tenant's .env
   - Enable PlatformMetricsReporter in tenant's server

---

## Code Locations

### Platform Backend

- **Routes**
  - `server/routes/platform/index.js` - Main platform router
  - `server/routes/platform/auth.js` - Platform authentication
  - `server/routes/platform/companies.js` - Company management
  - `server/routes/platform/tenantMetrics.js` - Metrics reporting API

- **Services**
  - `server/services/platformAuthService.js` - Platform auth logic
  - `server/services/CompanyService.js` - Company CRUD (uses reported metrics)
  - `server/services/PlatformMetricsReporter.js` - Tenant-side reporter
  - ⚠️ `server/services/CompanySyncService.js` - DEPRECATED

- **Database**
  - `server/database/multiTenantPool.js` - Multi-tenant pool manager
  - Note: `getTenantPool()` for TENANT users only, not platform

- **Migrations**
  - `server/migrations/setup-platform-database.js` - Initial platform DB
  - `server/migrations/fix-platform-admin-password.js` - Admin password
  - `server/migrations/fix-company-names.js` - Update company data

- **Scripts**
  - `scripts/fix-platform-security.js` - Security architecture setup
  - `scripts/report-metrics-now.js` - Manual metrics reporting
  - `scripts/test-metrics-reporting.js` - End-to-end test

### Platform Frontend

- **Components**
  - `src/components/platform/PlatformDashboard.jsx` - Main dashboard
  - `src/components/platform/PlatformDashboard.css` - Styling

- **Routes**
  - `src/App.jsx` - Platform route: `/platform/*`

---

## Security Checklist

Before deployment, verify:

- [ ] Platform does NOT store tenant database credentials
- [ ] All tenant metrics use `reported_*` columns
- [ ] No platform code queries tenant databases
- [ ] API keys are properly hashed (SHA256)
- [ ] API keys have expiration dates set
- [ ] Rate limiting enabled on metrics endpoints
- [ ] "Login As" feature completely removed
- [ ] CompanySyncService disabled or removed
- [ ] HTTPS enabled for production
- [ ] Secure cookie settings for production
- [ ] Database backups configured
- [ ] Tenant databases are isolated
- [ ] No shared database connections
- [ ] Audit logging enabled for platform actions

---

## Troubleshooting

### Metrics Not Showing

**Problem:** Dashboard shows 0 users  
**Solution:**
1. Check server is running
2. Run: `node scripts/report-metrics-now.js`
3. Refresh dashboard

**Problem:** "Cannot connect to platform server"  
**Solution:**
1. Start servers: `START-SERVERS.cmd`
2. Verify server running on port 5000
3. Check PLATFORM_URL in .env

### Authentication Issues

**Problem:** Platform admin cannot login  
**Solution:**
1. Reset password: `node server/migrations/fix-platform-admin-password.js`
2. Use: `admin@propackhub.com` / `ProPackHub2025!`

**Problem:** Metrics API returns 401  
**Solution:**
1. Verify API key and secret in .env
2. Check key is active in `tenant_api_keys` table
3. Regenerate if needed: `node scripts/fix-platform-security.js`

### Dashboard Issues

**Problem:** Dashboard shows wrong data  
**Solution:**
1. Check `listCompanies()` uses `reported_*` columns
2. Verify no subqueries to platform_users or company_divisions
3. Clear browser cache and reload

---

## Future Enhancements

### Phase 2 (Planned)

1. **Company Management Modal**
   - Edit subscription plan
   - Adjust limits
   - View billing history

2. **Metrics Detail View**
   - Historical trends
   - Usage charts
   - Anomaly detection

3. **Billing Integration**
   - Stripe/payment gateway
   - Invoice generation
   - Usage-based billing

4. **Tenant Provisioning**
   - Automated database creation
   - Initial setup wizard
   - Email verification

5. **Platform Analytics**
   - Churn prediction
   - Usage patterns
   - Revenue tracking

---

## Support

For issues or questions:
- Review this document thoroughly
- Check [SAAS_PLATFORM_SECURITY_ARCHITECTURE.md](./SAAS_PLATFORM_SECURITY_ARCHITECTURE.md)
- Review code comments in implementation files

---

**Last Updated:** December 28, 2025  
**Version:** 1.0  
**Maintainer:** ProPackHub Development Team
