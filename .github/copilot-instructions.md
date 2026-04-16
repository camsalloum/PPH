# ProPackHub / PEBI — Copilot Instructions

> Auto-loaded every interaction. Module-specific context auto-loads from `.github/instructions/` when relevant files are in context.

## Project Identity
- **Product**: ProPackHub — SaaS for the packaging industry
- **App**: PEBI (Packaging Enterprise Business Intelligence)
- **Tenant**: Interplast | **Division**: FP (Flexible Packaging)
- **Stack**: React 18 + Vite 7 + Ant Design 5 → Express 4.18 + PostgreSQL 14 + Redis
- **Ports**: Frontend `3000`, Backend `3001` (Vite proxies `/api` + `/uploads`)
- **Auth**: JWT 15min access + 60-day HTTP-only refresh cookie. localStorage key: `auth_token` (never `token`)
- **Start**: `START-SERVERS.cmd` or `cd server && npm run dev` + `npm start`

## Three Databases (always use `server/database/config.js`)

| DB | Pool | Purpose | Key Tables |
|----|------|---------|------------|
| `fp_database` | `pool` / `getDivisionPool` | Business data | `fp_actualcommon`, `fp_budget_unified`, `fp_customer_unified`, CRM tables, MES tables |
| `ip_auth_database` | `authPool` | Auth + config | `users`, `user_sessions`, `company_settings`, `employees`, `master_countries` |
| `propackhub_platform` | `platformPool` | SaaS registry | `companies`, `subscription_plans`, `tenant_metrics` |

⚠️ **Never** use `server/config/database.js` — it is incomplete (TD-002).

## Module Map

| Module | Status | Frontend | Backend |
|--------|--------|----------|---------|
| MIS/IMS | Production | `src/components/dashboard/`, `MasterData/AEBF/`, `reports/` | `server/routes/aebf/`, `analytics.js` |
| CRM | Production | `src/components/CRM/` (76 components) | `server/routes/crm/` (20 sub-routes) |
| MES | Active Dev | `src/components/MES/` (PreSales, QC, Flow) | `server/routes/mes/` (30+ presales routes) |
| AI | Integrated | `MasterData/CustomerMerging.jsx` | `server/services/AILearningService.js`, `CustomerMergingAI.js` |

## Critical Rules (full details in `AGENT.md`)

- **SQL injection**: Validate division against `['FP','HC']` before any SQL query (TD-001)
- **Division column**: Use `admin_division_code` (not `division_code`) for `fp_actualcommon`
- **Logging**: Backend → `server/utils/logger.js` (winston). Never `console.log`
- **API URLs**: Frontend → `src/config/api.js`. Never hardcode `http://localhost:3001`
- **Ant Design**: Use `App.useApp()` for `message`/`modal`/`notification` — never static imports
- **Tables**: Set `rowKey` on every `<Table>` — never `key={index}`
- **UI fit**: Avoid horizontal scrollbars by default; keep one flexible text column, tighten numeric/action widths, and only use `scroll.x` when genuinely unavoidable
- **Currency**: AED Dirham uses SVG component `UAEDirhamSymbol.jsx` — never render as text
- **Cleanup**: Remove ALL unused imports and dead state before finishing any file
- **File limits**: Components 300 lines, services 250, routes 350
- **Error handling**: Every backend route needs try/catch with winston logger

## Session Protocol

**Start** — read `docs/LIVE_STATE.md` for current project state. Or use `/session-manager` for a guided briefing.

**End** — use `/session-manager` to update `docs/LIVE_STATE.md` + append `docs/SESSION_LOG.md`. Or do it manually:
1. Append one row to `docs/SESSION_LOG.md`
2. Update `docs/TECH_DEBT.md` if new issues found
3. Update `docs/API_CONTRACTS.md` if endpoints changed
4. Update `docs/LIVE_STATE.md` module table + active work section

## Deep References
- `AGENT.md` — full rules (17 sections, all agents)
- `docs/PROJECT_CONTEXT.md` — architecture, folder structure, roles
- `docs/TECH_DEBT.md` — 33 tracked issues (12 resolved)
- `docs/API_CONTRACTS.md` — all endpoint documentation
- `docs/_backup/` — 150+ historical docs (search here for deep module history)
