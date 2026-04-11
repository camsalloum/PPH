# ProPackHub SaaS Platform - Multi-Tenant Architecture & Security

## Document Version
- **Created:** December 28, 2025
- **Last Updated:** December 28, 2025
- **Status:** Active Development

---

## 1. CORE PRINCIPLE: Data Isolation

### ⚠️ CRITICAL SECURITY RULE
**The SaaS Platform MUST NOT have direct access to tenant databases.**

The platform manages **subscriptions only**, not tenant business data.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ProPackHub SaaS Platform                         │
│                    (propackhub_platform DB)                         │
│                                                                     │
│  ✅ CAN ACCESS:                    ❌ CANNOT ACCESS:                │
│  - Company name                    - Customer data                  │
│  - Subscription plan               - Sales data                     │
│  - User count (reported)           - Financial data                 │
│  - Division count (reported)       - Any tenant business data       │
│  - Billing information             - Tenant database internals      │
│  - Platform admin users                                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ API only (no direct DB access)
                              ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Tenant A DB      │  │ Tenant B DB      │  │ Tenant C DB      │
│ (Interplast)     │  │ (Future Co)      │  │ (Future Co)      │
│                  │  │                  │  │                  │
│ - Sales data     │  │ - Sales data     │  │ - Sales data     │
│ - Customers      │  │ - Customers      │  │ - Customers      │
│ - Users          │  │ - Users          │  │ - Users          │
│ - Settings       │  │ - Settings       │  │ - Settings       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
     ISOLATED              ISOLATED              ISOLATED
```

---

## 2. What the SaaS Platform Stores

### Platform Database (propackhub_platform)

| Table | Purpose | Data Stored |
|-------|---------|-------------|
| `subscription_plans` | Available plans | Plan name, price, limits |
| `companies` | Registered tenants | Company name, code, subscription status |
| `company_divisions` | Division metadata | Division code, name (for display only) |
| `platform_users` | Platform admins ONLY | SaaS admin accounts |
| `platform_audit_log` | Platform actions | Subscription changes, billing |

### What Platform DOES NOT Store
- ❌ Tenant database connection strings
- ❌ Tenant user credentials
- ❌ Tenant business data
- ❌ Tenant customer lists
- ❌ Tenant sales/financial data

---

## 3. Tenant Metrics Reporting (Push Model) ✅ IMPLEMENTED

Instead of the platform querying tenant databases, tenants **push** their metrics using API keys:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TENANT SIDE (Interplast)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  PlatformMetricsReporter Service                        │               │
│  │  - Collects: users, divisions, storage, activity       │               │
│  │  - Runs: every 1 hour (configurable)                   │               │
│  │  - Auth: API Key + Secret from .env                    │               │
│  └─────────────────────────────────────────────────────────┘               │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                               │ POST /api/platform/tenant-metrics/report
                               │ Headers: X-API-Key, X-API-Secret
                               │ Body: { active_user_count, division_count, ... }
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM SIDE (ProPackHub)                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  POST /api/platform/tenant-metrics/report               │               │
│  │  1. Authenticate API key + secret (SHA256 hash)         │               │
│  │  2. Validate tenant is active                          │               │
│  │  3. Store in tenant_reported_metrics table             │               │
│  │  4. Update companies.reported_* columns                │               │
│  │  5. Return success                                     │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                             │
│  Platform Dashboard displays reported_user_count, reported_division_count  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Metrics Tenants Report (via API):
- `active_user_count` - Active users in tenant system
- `total_user_count` - Total users in tenant system
- `division_count` - Number of divisions
- `storage_used_mb` - Storage usage in MB
- `monthly_active_users` - Users active this month
- `data_records_count` - Count of business records
- `last_activity_at` - Last user activity timestamp

### API Authentication
Each tenant has an API key pair:
- **API Key** (public identifier): `ppk_xxxxx...`
- **API Secret** (private, hashed): Used to verify requests

Generated with: `node scripts/fix-platform-security.js`

### Platform Database Tables
1. **tenant_api_keys** - API credentials for secure reporting
2. **tenant_reported_metrics** - Historical metrics (audit trail)
3. **companies.reported_*** - Latest metrics (for quick display)

### Platform NEVER:
- ❌ Connects to tenant databases
- ❌ Queries tenant tables
- ❌ Stores tenant database credentials
- ❌ Accesses tenant business data

---

## 4. Authentication Flow

### Platform Admin Login
1. User logs in at login page
2. Check `propackhub_platform.platform_users` for `is_platform_admin = true`
3. Route to `/platform` (SaaS admin dashboard)
4. Can view subscription status, NOT tenant data

### Tenant User Login
1. User logs in at login page
2. Check `propackhub_platform.platform_users` for company association
3. If found, get company_code
4. Route to `/dashboard` (tenant app)
5. Tenant app connects to tenant's own database

**OR** (Current Interplast setup during development):
1. Check legacy `ip_auth_database.users`
2. Authenticate against tenant's own auth system
3. No platform involvement in tenant authentication

---

## 5. Dynamic Data Linking Rules

### ✅ ALL Company Info Must Come From:
1. **company_settings table** (in tenant's auth database) - Source of truth for tenant
2. **Reported to platform** via API - For subscription management only

### ❌ NEVER Hardcode:
- Company names
- Division names
- User counts
- Any tenant-specific data

### Sync Mechanism (Tenant → Platform):
```javascript
// Tenant app reports metrics to platform (e.g., daily cron job)
POST /api/platform/tenants/metrics
Authorization: Bearer <tenant_api_key>
{
  "company_code": "interplast",
  "metrics": {
    "active_users": 7,
    "total_divisions": 1,
    "storage_mb": 250,
    "last_activity": "2025-12-28T10:00:00Z"
  }
}
```

---

## 6. Security Implementation Checklist

### Completed:
- [x] Separate platform database (propackhub_platform)
- [x] Platform admin user table
- [x] Company registration without DB credentials
- [x] Division metadata (names only, no connection info)

### To Be Implemented:
- [ ] Remove `database_name` from companies table (security risk)
- [ ] Remove `multiTenantPool` direct tenant access from platform code
- [ ] Implement tenant metrics reporting API
- [ ] Add tenant API keys for secure metrics push
- [ ] Platform should only display reported metrics, never query

## 7. Implementation Status ✅

### ✅ Completed Security Fixes (December 28, 2025)

1. **Tenant Metrics Tables Created**
   - `tenant_api_keys` - Secure API authentication
   - `tenant_reported_metrics` - Historical metrics audit trail
   - `companies.reported_*` columns - Latest metrics for dashboard

2. **API Endpoints Implemented**
   - `POST /api/platform/tenant-metrics/report` - Tenants push metrics
   - `POST /api/platform/tenant-metrics/health` - Health check reporting
   - `GET /api/platform/tenant-metrics/my-status` - Tenants get subscription info

3. **Tenant-Side Reporter Created**
   - `server/services/PlatformMetricsReporter.js`
   - Collects metrics from local databases
   - Reports to platform every hour (configurable)
   - Uses API key authentication

4. **CompanyService Refactored**
   - Uses `reported_*` columns instead of querying tenant DBs
   - Platform queries only `propackhub_platform` database
   - No direct tenant database access

5. **Database Schema Updated**
   - `companies.database_name` marked as DEPRECATED
   - Comments added warning not to use for platform queries
   - Dashboard view uses only reported metrics

### 🔐 Security Compliance
- ✅ Platform NEVER queries tenant databases
- ✅ Tenants authenticate with API keys (SHA256 hashed secrets)
- ✅ Each tenant reports their own metrics
- ✅ Platform stores only subscription data
- ✅ Complete data isolation enforced

### 📋 Deprecation Notices
The following columns are kept for backward compatibility but marked DEPRECATED:
- `companies.database_name` - Do not use in platform code
- `companies.auth_database_name` - Do not use in platform code

These will be removed in a future version after complete migration.

---

## 8. API Reference

### Platform Admin Routes (Requires Platform Admin JWT)
- `GET /api/platform/companies` - List all subscribed companies
- `GET /api/platform/companies/:code` - View company subscription details
- `POST /api/platform/companies` - Register new company (creates subscription)
- `PUT /api/platform/companies/:code/subscription` - Update subscription plan
- `GET /api/platform/stats` - Platform-wide statistics
- `GET /api/platform/plans` - List available subscription plans

### Tenant Metrics Routes (Requires API Key Authentication)
- `POST /api/platform/tenant-metrics/report` - Report metrics to platform
- `POST /api/platform/tenant-metrics/health` - Report health status
- `GET /api/platform/tenant-metrics/my-status` - Get subscription status

### Authentication Headers
**Platform Admin:**
```
Authorization: Bearer <jwt_token>
```

**Tenant Metrics API:**
```
X-API-Key: ppk_xxxxx...
X-API-Secret: <secret_hash>
```

---

## 9. Setup Instructions

### For New Tenants

1. **Register Company** (Platform Admin):
   ```bash
   POST /api/platform/companies
   {
     "company_code": "acme",
     "company_name": "ACME Corp",
     "plan_id": 1
   }
   ```

2. **Generate API Key** (Done automatically):
   - Run: `node scripts/fix-platform-security.js`
   - Save the API key and secret
   - Add to tenant's `.env`:
   ```env
   PLATFORM_URL=https://platform.propackhub.com
   PLATFORM_API_KEY=ppk_xxxxx...
   PLATFORM_API_SECRET=xxxxx...
   METRICS_REPORT_INTERVAL=3600000  # 1 hour
   ```

3. **Initialize Metrics Reporter** (Tenant Server):
   ```javascript
   const metricsReporter = require('./services/PlatformMetricsReporter');
   
   // In server startup
   await metricsReporter.init();
   metricsReporter.startPeriodicReporting();
   ```

4. **Verify Metrics** (Platform Dashboard):
   - Login as platform admin
   - View company in dashboard
   - Check `reported_user_count`, `reported_division_count`
   - Verify `metrics_last_reported_at` is recent

---

## 10. Important Notes

### multiTenantPool.js Usage
The `multiTenantPool.js` file contains `getTenantPool()` method. This is used by **TENANT USERS** when they login and access their own data, NOT by platform admins.

**Correct Usage:**
```javascript
// Tenant user logs in → gets pool to THEIR OWN database
const tenantPool = await poolManager.getTenantPool(user.companyCode);
await tenantPool.query('SELECT * FROM fp_customers'); // ✅ OK - user accessing own data
```

**Incorrect Usage:**
```javascript
// Platform admin trying to access tenant data
const tenantPool = await poolManager.getTenantPool('acme'); // ❌ WRONG
await tenantPool.query('SELECT * FROM customers'); // ❌ Security violation
```

### Platform vs Tenant Context
- **Platform Context:** SaaS admin managing subscriptions
  - Database: `propackhub_platform`
  - Access: Subscription data only
  
- **Tenant Context:** Company user accessing own data
  - Database: Their own tenant database
  - Access: Full access to their business data

### Platform NEVER Has:
- Routes to query tenant data
- Connection pools to tenant databases
- Access to tenant authentication

---

## 9. Development vs Production

### During Development (Current State):
- Interplast is our development/demo data
- Single database for simplicity
- Platform and tenant code coexist

### Production Architecture:
- Each tenant gets completely separate database
- Platform has ZERO access to tenant DBs
- Tenants report metrics via secure API
- Complete data isolation

---

## 10. Action Items Before Proceeding

1. **Audit current code** - Identify all places where platform accesses tenant data
2. **Remove database_name** from companies table
3. **Implement metrics reporting API** - Tenants push, platform receives
4. **Add tenant API keys** - Secure authentication for metrics reporting
5. **Update PlatformDashboard** - Show reported metrics only

---

## Document Maintenance

This document must be updated whenever:
- New platform features are added
- Security policies change
- Multi-tenancy architecture evolves

**Remember: The platform manages SUBSCRIPTIONS, not tenant DATA.**
