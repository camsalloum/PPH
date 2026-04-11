# PROJECT CONTEXT — ProPackHub / PEBI
> **Architecture reference. Module-specific details auto-load from `.github/instructions/` when relevant files are in context.**
> **For current project state, see `docs/LIVE_STATE.md`.**
> **Last Updated:** 2026-03-28

---

## QUICK REFERENCE

| Item | Value |
|------|-------|
| **Product** | ProPackHub — SaaS platform for the packaging industry |
| **App** | PEBI (Packaging Enterprise Business Intelligence) |
| **Default Tenant** | Interplast |
| **Division** | FP (Flexible Packaging) — combines Oracle FP + BF codes |
| **Frontend** | React 18 + Vite 7 + Ant Design 5 — port `3000` |
| **Backend** | Express 4.18 + PostgreSQL 14 + Redis — port `3001` |
| **Databases** | `fp_database` (data), `ip_auth_database` (auth), `propackhub_platform` (SaaS) |
| **Auth** | JWT access (15 min) + refresh (60 day, HTTP-only cookie) |
| **Dev Login** | `camille@interplast-uae.com` / `Admin@123` |
| **Start** | `START-SERVERS.cmd` OR `cd server && npm run dev` + `npm start` |
| **Build** | `npm run build` → `build/` folder |
| **Workspace** | `d:\PPH 26.2\26.2\` |
| **Production** | propackhub.com (GoDaddy VPS) |
| **Deployment** | PM2 + Nginx. See `docs/_backup/DAILY_DEVELOPMENT_WORKFLOW.md` |

---

## RECENT UPDATES
> See `docs/LIVE_STATE.md` for current module status and recent session summaries.
> See `docs/SESSION_LOG.md` for full session history.

---

## MODULES
> Deep module context auto-loads from `.github/instructions/` when you touch relevant files.

| Module | Status | Frontend | Backend | Instructions File |
|--------|--------|----------|---------|------------------|
| MIS/IMS | Production | `dashboard/`, `MasterData/AEBF/`, `reports/` | `routes/aebf/`, `analytics.js` | `dashboard.instructions.md`, `master-data.instructions.md` |
| CRM | Production | `CRM/` (76 components) | `routes/crm/` (20 sub-routes) | `crm.instructions.md` |
| MES | Active Dev | `MES/` (PreSales, QC, Flow) | `routes/mes/` (30+ presales routes) | `mes.instructions.md` |
| AI | Integrated | `MasterData/CustomerMerging.jsx` | `services/AILearningService.js` | — |

---

## TECH STACK

### Frontend (root `package.json`)
React 18 + Vite 7 + Ant Design 5 | ECharts + Chart.js + Recharts | axios | react-router-dom 7 | jspdf + xlsx + exceljs | dompurify | Jest 30 + Playwright 1.58

### Backend (`server/package.json`)
Express 4.18 + PostgreSQL (pg) + oracledb 6 + Redis 5 | jsonwebtoken + bcryptjs | helmet + express-rate-limit | winston | node-cron | nodemailer | @azure/msal-node | multer | swagger | node-ssh

### Vite Configuration
- **Dev port:** 3000 (auto-open)
- **Proxy:** `/api` and `/uploads` → `http://localhost:3001`
- **Path aliases:** `@` → `src/`, `@components`, `@contexts`, `@utils`, `@hooks`, `@services`, `@assets`
- **Manual chunks:** vendor-react, vendor-charts, vendor-ui, vendor-maps, vendor-export
- **Build:** output to `build/`, hidden sourcemaps, 2000 KB chunk warning limit

---

## ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────┐
│                  CLIENT (React SPA — Vite)                       │
│                    http://localhost:3000                          │
└──────────────────────────┬───────────────────────────────────────┘
                           │ Proxy /api/* → :3001
┌──────────────────────────▼───────────────────────────────────────┐
│                  API SERVER (Express)                             │
│                    http://localhost:3001                          │
│  Middleware: Helmet → Correlation ID → Metrics → Logger →        │
│  Cookie Parser → Body Parser → CORS → Rate Limiter → JWT Auth   │
└──────────┬──────────────┬──────────────┬─────────────────────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
    │ fp_database │ │ip_auth_db │ │platform_db │
    │  (data)     │ │  (users)  │ │  (SaaS)    │
    └─────────────┘ └───────────┘ └────────────┘
           │
    ┌──────▼──────┐
    │ Oracle ERP  │  (read-only sync via oracledb or Excel import)
    └─────────────┘
```

### Three Databases

| Database | Purpose | Key Tables |
|----------|---------|------------|
| `fp_database` | All business data for FP division | `fp_actualcommon`, `fp_budget_unified`, `fp_customer_unified`, CRM tables, MES tables |
| `ip_auth_database` | Auth + company config for Interplast tenant | `users`, `user_sessions`, `company_settings`, `company_divisions`, `employees`, `master_countries` |
| `propackhub_platform` | SaaS platform registry | `companies`, `subscription_plans`, `platform_users`, `tenant_metrics` |

---

## FOLDER STRUCTURE

```
/ (root)
├── src/                    ← React frontend
│   ├── App.jsx             ← Root router + QueryClientProvider
│   ├── components/         ← ~330 JSX components (auth, charts, common, CRM, dashboard, MasterData, MES, modules, people, platform, reports, settings, shared)
│   ├── contexts/           ← 10 React Context providers (Auth, Theme, Filter, Currency, SalesData, etc.)
│   ├── services/           ← API call functions (axios) + deduplicatedFetch
│   ├── hooks/              ← Custom hooks (useSalesCube, useDebouncedValue, useAuth, etc.)
│   ├── utils/              ← 20 utility files (roleChecks, roleConstants, companyTime, etc.)
│   ├── config/             ← API base URL, constants
│   └── styles/             ← Global CSS
├── server/                 ← Express backend
│   ├── routes/             ← 52 route files (auth, aebf/, crm/, mes/, platform/)
│   ├── middleware/         ← 17 middleware files (auth, rateLimiter, security, cache)
│   ├── database/config.js  ← SINGLE SOURCE for DB connections (pool, authPool, platformPool)
│   ├── services/           ← 44 business logic services
│   ├── jobs/               ← Cron jobs (refreshSalesCube, oracleSync, rmSync)
│   ├── utils/logger.js     ← Winston logger (always use this)
│   └── migrations/         ← JS migrations
├── migrations/             ← SQL migrations (numbered + versioned)
├── docs/                   ← Agent knowledge base
│   ├── LIVE_STATE.md       ← Current project snapshot (read first)
│   ├── PROJECT_CONTEXT.md  ← This file — architecture reference
│   ├── SESSION_LOG.md      ← Session history
│   ├── TECH_DEBT.md        ← Known issues (33 items)
│   ├── API_CONTRACTS.md    ← Endpoint documentation
│   └── _backup/            ← 150+ historical docs
├── .github/
│   ├── copilot-instructions.md  ← Auto-loaded Copilot rules
│   ├── instructions/       ← Module-specific auto-loading context (7 files)
│   └── skills/             ← session-manager skill
├── AGENT.md                ← Master rules for all agents
└── README.md
```

---

## USER ROLES

| Role | Access |
|------|--------|
| Platform Admin | SaaS platform management |
| Admin | All modules — full access |
| Manager / Sales Manager | MIS dashboards, CRM admin view, budget approval |
| Sales Coordinator | MIS dashboards, CRM admin-level views |
| Sales Rep / Executive | CRM rep views (My Day, Worklist, My Customers) |
| QC Manager / QC Lab | MES QC dashboard, sample analysis |
| Production Manager | MES flow, job cards |
| Accounts Manager | MES procurement, invoicing |
| Logistics / Stores | MES dispatch, stock |

---

## KEY ARCHITECTURAL DECISIONS

- **One DB config file**: Always use `server/database/config.js` (has authPool + getDivisionPool). Never use `server/config/database.js` — it is incomplete.
- **Division whitelisting**: Always validate division input against `['FP', 'HC']` before using in SQL queries. See `TECH_DEBT.md` TD-001.
- **Division query column**: Use `admin_division_code` (not `division_code`) for `fp_actualcommon` queries.
- **No hardcoded localhost**: Frontend API calls must use `src/config/api.js` base URL constant. Never write `http://localhost:3001` directly in components.
- **Auth token key**: The localStorage key is `auth_token` — never `token` (this caused 401 bugs).
- **Logging**: Backend always uses winston logger (`server/utils/logger.js`), never `console.log`.
- **Admin vs non-admin dashboards**: AdminCRMDashboard and CRMDashboard were historically duplicated. New shared logic must go into a shared service — never copy-paste between them again.
- **Connection pool**: `server/database/config.js` exports `pool`, `query(text, params)`, `getClient()`, `testConnection()` with 20 max connections, 30s idle timeout, 10s connection timeout, 3 retry attempts.
