# ProPackHub / PEBI — v26.4

**ProPackHub** is a multi-tenant SaaS platform for the packaging industry.  
**PEBI** (Packaging Enterprise Business Intelligence) is the primary application inside ProPackHub.

> **Private repository** — do not share credentials or access outside the team.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 · Vite 7 · Ant Design 5 |
| Backend | Express 4.18 · Node.js 18+ |
| Database | PostgreSQL 14 · Redis (caching) |
| Auth | JWT (access 15 min + refresh 60 day HTTP-only cookie) |
| Testing | Jest · Playwright |
| Deployment | PM2 · Nginx (GoDaddy VPS) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install
```

### Running the Application

```bash
# Start both servers
START-SERVERS.cmd

# Or manually:
cd server && npm run dev    # Backend on port 3001
npm run dev                 # Frontend on port 3000
```

**Dev login:** `camille@interplast-uae.com` / `Admin@123`

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| API Docs (Swagger) | http://localhost:3001/api-docs |

---

## Project Structure

```
PPH/
├── src/                    # React frontend
│   ├── components/         # 16 module folders (CRM, MES, dashboard, charts, …)
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom hooks (useSalesCube, useAuth, …)
│   ├── services/           # API clients, deduplicatedFetch
│   ├── utils/              # Helpers, constants
│   └── assets/             # Images, static files
├── server/                 # Express backend
│   ├── routes/             # 50+ route files (REST API)
│   ├── services/           # Business logic, AI engine
│   ├── database/           # DB config, pools, data services
│   ├── middleware/          # Auth, RBAC, rate limiting
│   ├── jobs/               # Cron jobs (Oracle sync, metrics)
│   └── tests/              # Backend test suites
├── build/                  # Production build (committed for VPS deployment)
├── migrations/             # SQL migration files (up/down pairs)
├── docs/                   # Architecture docs, session logs, tech debt
├── tests/                  # E2E / integration tests (Playwright)
├── public/                 # Static assets served by Vite
└── scripts/                # Utility scripts
```

---

## Databases

| Database | Purpose |
|----------|---------|
| `fp_database` | Business data (sales, production, CRM) |
| `ip_auth_database` | Auth, users, company settings |
| `propackhub_platform` | SaaS platform registry |

---

## For AI Agents — Read This First

**Before doing anything, read `AGENT.md` at the project root.**

It contains:
- Session start and end protocol
- Pre-code checklist
- All coding rules
- Standard prompts to use for features, bugs, and session retros

Supporting context is in the `/docs/` folder:
- `docs/PROJECT_CONTEXT.md` — Stack, architecture, key decisions
- `docs/SESSION_LOG.md` — What was worked on previously
- `docs/TECH_DEBT.md` — Known issues and shortcuts
- `docs/API_CONTRACTS.md` — All API endpoints

---

## Modules

| Module | Status | Description |
|--------|--------|-------------|
| MIS/IMS | Production | Dashboards, KPIs, P&L, Oracle ERP sync |
| CRM | Production | Customers, deals, field visit planner |
| MES | Active Development | Pre-sales, estimation, QC lab, job cards |
| AI Engine | Integrated | Customer merging, churn prediction, forecasting |

---

## Deployment

- **Production:** propackhub.com (GoDaddy VPS, Nginx + PM2)
- **Deployment guide:** `docs/_backup/VPS_DEPLOYMENT_COMPLETE_GUIDE.md`
- **Push to GitHub:** `Upload-To-GitHub.cmd` (or `upload-to-github.ps1`)
