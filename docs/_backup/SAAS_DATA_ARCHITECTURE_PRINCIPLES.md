# ⚠️ DEPRECATED - ProPackHub SaaS Platform - Data Architecture Principles

## ⚠️⚠️⚠️ DEPRECATION NOTICE ⚠️⚠️⚠️

**This document is OUTDATED and describes an architecture that VIOLATES security principles.**

**DO NOT IMPLEMENT anything from this document.**

**Refer to:** [PROPACKHUB_SAAS_MASTER_GUIDE.md](./PROPACKHUB_SAAS_MASTER_GUIDE.md)

---

## Why This Architecture Was Rejected

This document describes a system where:
- ❌ Platform queries tenant databases directly
- ❌ Platform stores tenant database credentials
- ❌ CompanySyncService accesses tenant data
- ❌ Violates multi-tenant security isolation

## Correct Architecture

The SaaS platform now implements:
- ✅ **Metrics Push Model** - Tenants report their own metrics
- ✅ **Zero Trust** - Platform NEVER accesses tenant databases
- ✅ **API Key Authentication** - Secure tenant-to-platform communication
- ✅ **Complete Isolation** - No cross-tenant data access

## Migration Path

If you're using CompanySyncService or database_name columns:

1. **Stop using CompanySyncService.syncCompany()**
2. **Implement PlatformMetricsReporter** on tenant side
3. **Use reported_* columns** in companies table
4. **Remove tenant database credentials** from platform

---

## Original Document (FOR REFERENCE ONLY - DO NOT USE)

**Core Principle: NO HARDCODED DATA**

**All company, division, and user data must be dynamically linked - NEVER hardcoded.**

---

## Database Architecture (Per Tenant)

Each tenant company has TWO types of databases:

### 1. AUTH Database (e.g., `ip_auth_database`)
- Contains `company_settings` table (key-value store)
- Contains `users` table for authentication
- **This is the SOURCE OF TRUTH for company metadata**

### 2. DATA Database(s) (e.g., `fp_database`)
- Contains division-prefixed tables (e.g., `fp_data_excel`, `fp_customer_master`)
- Sales, budget, and operational data
- One database per division (or shared)

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TENANT AUTH DATABASE (e.g., ip_auth_database)    │
│                                                                     │
│  company_settings table (key-value store):                          │
│    - company_name: "Interplast Co LTD"                             │
│    - company_logo_url: "/uploads/logos/Ip Logo.png"                │
│    - divisions: [{ code: "FP", name: "Flexible Packaging Division" }]│
│    - company_currency: { code: "AED", ... }                        │
│                                                                     │
│  users table:                                                       │
│    - Authentication data for tenant users                           │
│                                                                     │
│  *** THIS IS THE SOURCE OF TRUTH FOR COMPANY METADATA ***           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ SYNC (via CompanySyncService)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PLATFORM DATABASE (propackhub_platform)          │
│                                                                     │
│  companies table:                                                   │
│    - company_name: synced from tenant's company_settings            │
│    - company_code: unique identifier (e.g., 'interplast')          │
│    - auth_database_name: 'ip_auth_database' (for sync)             │
│    - database_name: 'fp_database' (for division data)              │
│                                                                     │
│  company_divisions table:                                           │
│    - division_code: synced from tenant's divisions setting          │
│    - division_name: synced from tenant's divisions setting          │
│                                                                     │
│  *** THIS IS A CACHE FOR PLATFORM-LEVEL QUERIES ***                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ References
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TENANT DATA DATABASE (e.g., fp_database)         │
│                                                                     │
│  Division-prefixed tables:                                          │
│    - fp_data_excel: Sales data                                      │
│    - fp_customer_master: Customer records                           │
│    - fp_budget_*: Budget tables                                     │
│                                                                     │
│  *** THIS IS THE SOURCE OF TRUTH FOR OPERATIONAL DATA ***           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Rules

### 1. Company Registration
When registering a new company:
```javascript
// CORRECT: Read from tenant database
const tenantSettings = await tenantPool.query(
  "SELECT setting_value FROM company_settings WHERE setting_key = 'company_name'"
);
const companyName = tenantSettings.rows[0].setting_value;

// WRONG: Hardcode values
const companyName = "Interplast LLC"; // ❌ NEVER DO THIS
```

### 2. Division Sync
Divisions must be read from the tenant's company_settings:
```javascript
// CORRECT: Read divisions from tenant
const divResult = await tenantPool.query(
  "SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'"
);
const divisions = divResult.rows[0].setting_value; // Array of { code, name }

// WRONG: Hardcode division names
const divisions = [{ code: 'FP', name: 'Flexible Packaging' }]; // ❌ NEVER
```

### 3. Periodic Sync
The platform should periodically sync data from tenant databases to keep the platform cache updated:
- Company name changes
- Division additions/removals
- Logo updates

### 4. User Data
When migrating existing users to the platform:
- Read from tenant's `users` table
- Preserve original user IDs as reference
- Sync permissions from tenant database

---

## Implementation Checklist

### Company Onboarding
- [ ] Read company_name from tenant's company_settings
- [ ] Read company_logo_url from tenant's company_settings
- [ ] Read divisions array from tenant's company_settings
- [ ] Read currency settings from tenant's company_settings
- [ ] Store database_name reference for future queries

### Data Sync Service
- [ ] Create CompanySyncService to periodically refresh platform data
- [ ] Sync on company settings update (webhook or polling)
- [ ] Handle schema differences between tenants gracefully

### Platform Dashboard
- [ ] Company list shows data from platform DB (cached from tenant)
- [ ] "Login As" feature connects to actual tenant database
- [ ] Changes in tenant reflect in platform after sync

---

## Database References

### Platform Database: propackhub_platform
- `companies` - Cached company info (synced from tenant's auth database)
  - `auth_database_name` - Points to tenant's auth database
  - `database_name` - Points to tenant's data database
- `company_divisions` - Cached divisions (synced from tenant's company_settings)
- `platform_users` - Platform-level user accounts

### Tenant Auth Database: (e.g., ip_auth_database)
- `company_settings` - **SOURCE OF TRUTH** for company/division info (key-value store)
- `users` - Tenant's user accounts

### Tenant Data Database: (e.g., fp_database)
- Division-prefixed data tables (sales, customers, budget, etc.)

---

## Migration Notes

### Initial Setup (December 2025)
- First tenant: Interplast
  - Auth database: `ip_auth_database` (contains company_settings)
  - Data database: `fp_database` (contains division data)
- Company name synced from company_settings: "Interplast Co LTD"
- Division synced: FP - "Flexible Packaging Division"

### Future Tenants
When adding new companies:
1. Create their auth database with company_settings table
2. Create their data database with division-prefixed tables
3. They configure company_settings through UI
4. Platform reads and caches their settings via CompanySyncService
5. No manual data entry in platform DB

---

## Code Locations

- `server/services/CompanySyncService.js` - Sync logic ✅ CREATED
- `server/services/CompanyService.js` - Company CRUD
- `server/database/multiTenantPool.js` - Multi-tenant connection manager
- `server/routes/platform/companies.js` - Company management API

---

**Created:** December 28, 2025
**Last Updated:** December 28, 2025
**Author:** ProPackHub Development Team
