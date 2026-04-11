# LIVE STATE — ProPackHub / PEBI
> **Machine-optimized project snapshot. Updated at the end of every agent session.**
> **Last Updated:** 2026-04-10

---

## Module Status

| Module | Status | Last Touched | Notes |
|--------|--------|-------------|-------|
| MIS/IMS | Production | 2026-03-26 | Dashboard perf fully optimized (MV + react-query). Raw Materials UX refined, RBAC gate added. |
| CRM | Production | 2026-03-25 | Field trip AI workflow updated (rep-owned analyze/apply, text-first meeting briefs). 76 components stable. |
| MES | Active Dev | 2026-04-10 | Material Specs rebuild complete. Parameter Admin (Phases A-E) complete. Custom Item Categories agreed scope complete (Phases A-E, G, I). Pricing-scope items intentionally deferred. |
| AI Engine | Integrated | 2026-03-25 | Customer merging AI active. Churn/seasonality/forecasting services exist. |
| Settings | Production | 2026-03-28 | Country/timezone support added. Tab persistence implemented. Sync time displays company timezone. |
| Auth | Stable | 2026-03-22 | JWT flow working. Preferences cached (30s TTL). Request deduplication active. |

## Active Work

**Last completed (2026-04-10):**
- Custom Item Categories implementation completed for agreed scope: schema-driven specs metadata (Unit/Group/Test Method), Use in Estimation handoff (preview/copy/save/save-open), global mapped-item search, material-class quick filter, category item-count badges, substrate unmapped audit KPI, and cutover active in MasterDataHub Item Master tab.

**In progress:** None for this track. Remaining items are optional backlog or pricing-scope dependent (bulk market price update, MAP/Standard/Last PO inline editing, optional waste % editing).

**Known issues from this session:**
- None blocking in completed scope. Latest diagnostics were clean for `server/routes/mes/master-data/items.js` and `src/components/MES/MasterData/CustomCategories.jsx`.

**Blocked:** RM sync requires VPN (FortiClient) — fails with 503 when VPN disconnected

## Hot Tech Debt

| ID | Severity | Issue | File(s) |
|----|----------|-------|---------|
| TD-001 | ✅ RESOLVED | SQL injection via unvalidated division — fixed with whitelist validation | `server/routes/divisionMergeRules.js` |
| TD-002 | ✅ RESOLVED | Two DB config files — `server/config/database.js` now deprecated shim | Canonical: `server/database/config.js` |
| TD-024 | 🔴 CRITICAL | 6-level nested providers mount globally | Mitigated with auth-token guards. Layout-route approach regressed CRM. |
| TD-003 | 🟠 HIGH | Hardcoded `localhost:3001` in frontend | Should use `src/config/api.js` |
| TD-025 | 🟠 HIGH | CRM duplicate API calls (my-customers ×8) | Needs consolidated data-loading hook |

Full list: `docs/TECH_DEBT.md` (33 items, 12 resolved)

## Recent Sessions

| Date | Summary |
|------|---------|
| 2026-04-10 | Custom Item Categories completion + full audit: backend metadata enrichment, estimation handoff, global search/filter/badges, substrate unmapped KPI, cutover validation, and docs/session close updated. |
| 2026-04-09 | Custom Item Categories (partial): DB + backend + test UI. Parameter Admin Phase E. RM Dashboard DB-driven. Multiple bug fixes. Feature incomplete — needs focused session. |
| 2026-04-08 | Parameter Admin Phases A-D + Material Specs rebuild complete + schema-driven PDF parser + frontend redesign |
| 2026-04-05 | MES Material Specs hardening: DB-mapped list UX, detail-access restore, dedupe/unique counts, spec-health + TDS status, Supplier filter, and width-based column tuning |

Full log: `docs/SESSION_LOG.md` (append one row each session)

## Environment

| Item | Value |
|------|-------|
| Frontend | `http://localhost:3000` (Vite dev server) |
| Backend | `http://localhost:3001` (Express) |
| Start command | `START-SERVERS.cmd` |
| VPN required | FortiClient for Oracle/RM sync |
| Dev login | `camille@interplast-uae.com` / `Admin@123` |
| Node version | Check `.nvmrc` or use latest LTS |
| Package manager | npm |

## Quick Links
- `AGENT.md` — full coding rules (17 sections)
- `docs/PROJECT_CONTEXT.md` — architecture + folder structure
- `docs/TECH_DEBT.md` — all known issues
- `docs/API_CONTRACTS.md` — endpoint documentation
- `.github/copilot-instructions.md` — auto-loaded Copilot rules
- `.github/instructions/` — module-specific auto-loading context
