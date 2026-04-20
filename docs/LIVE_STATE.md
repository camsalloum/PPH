# LIVE STATE — ProPackHub / PEBI
> **Machine-optimized project snapshot. Updated at the end of every agent session.**
> **Last Updated:** 2026-04-17

---

## Module Status

| Module | Status | Last Touched | Notes |
|--------|--------|-------------|-------|
| MIS/IMS | Production | 2026-03-26 | Dashboard perf fully optimized (MV + react-query). Raw Materials UX refined, RBAC gate added. |
| CRM | Production | 2026-03-25 | Field trip AI workflow updated (rep-owned analyze/apply, text-first meeting briefs). 76 components stable. |
| MES | Active Dev | 2026-04-17 | Material Specs rebuild complete. Parameter Admin (Phases A-E) complete. Custom Item Categories: live assignment hardened. **Multi-level BOM/Formulation system: Phases 1-3 COMPLETE** (DB migration, backend API, frontend FormulationsTab). Audited and all fixes applied. Next: Phase 4 (Comparator), Phase 5 (Estimation bridge). |
| AI Engine | Integrated | 2026-03-25 | Customer merging AI active. Churn/seasonality/forecasting services exist. |
| Settings | Production | 2026-03-28 | Country/timezone support added. Tab persistence implemented. Sync time displays company timezone. |
| Auth | Stable | 2026-03-22 | JWT flow working. Preferences cached (30s TTL). Request deduplication active. |

## Active Work

**Last completed (2026-04-17):**
- **BOM/Formulation system Phases 1-3 fully implemented and audited:**
  - Phase 1: DB migration `mes-master-050-formulations.js` — `mes_formulations` + `mes_formulation_components` tables with proper constraints, partial unique indexes, and FK cascades.
  - Phase 2: Backend API `server/routes/mes/master-data/formulations.js` — full CRUD, BOM save (draft-only guard), duplicate/version, 3-step cascading item picker, sub-formulation picker with circular-ref exclusion, delete with reference check.
  - Phase 2: Recursive resolver `server/utils/formulation-resolver.js` — memoized BOM cost/solids engine, `wouldCreateCircle`, `getBomDepth`, MAX_BOM_DEPTH=5.
  - Phase 3: Frontend `FormulationEditor.jsx` (universal `FormulationsTab`) — list view + BOM editor, role options per material class, summary/quick-estimate cards, item picker modal, sub-formulation picker modal, dirty tracking.
  - Phase 3: `CustomCategories.jsx` cleanup — removed ~800 lines of old adhesive/custom-group code, integrated universal FormulationsTab for all `scope_type === 'category_group'`.
  - Phase 3: `items.js` profile endpoint enriched with `formulation_count`, `active_formulation_count`, `default_formulation_*` per group.
- **Full audit completed with all fixes applied:**
  - Fix A: Status whitelist on PUT (prevents `status='deleted'` bypass)
  - Fix B: BOM save response merges metadata (prevents `activeFormulation` losing id/name/status)
  - Fix C: Numeric `parts` validation (`isNaN` check for clean 400 instead of raw 500)
  - Fix D: Candidates step 3 filters by both `category_id` and `catlinedesc`
  - Fix E: Resolver NULL guard on orphaned `sub_formulation_id`
  - Fix K: `GET /by-group` enriches with `price_per_kg_wet` / `solids_share_pct`

**BOM Item Picker — Corrected Architecture (2026-04-17):**
- Root issue: item picker was sourcing items from `fp_actualrmdata` (Oracle raw sync only — no spec data → solids always null).
- Correct design: picker queries the spec table for the selected category (same source as Material Specs page), joined to `fp_actualrmdata` for pricing only.
- Spec table map (from `mes_category_mapping.spec_table`):
  - `adhesives` → `mes_spec_adhesives` (direct `solids_pct` column)
  - `coating` → `mes_spec_coating` (direct `solids_pct` column)
  - `substrates/films` → `mes_spec_substrates` (`parameters_json`)
  - `chemicals` → `mes_spec_chemicals` (`parameters_json`)
  - `additives` → `mes_spec_additives` (`parameters_json`)
  - `packing_materials` → `mes_spec_packing_materials` (no solids)
  - `mounting_tapes` → `mes_spec_mounting_tapes` (no solids)
  - `resins` → `mes_material_tds` (`density` column; all DB items can be compounded)
  - `trading` / `consumables` → excluded (no spec table, inventory-only)
- Picker simplified from 3-step (category → group → item) to 2-step (category → item). Items carry `catlinedesc` label. Oracle group-step was redundant.
- Resolver solids fallback also updated to check all spec tables in order.

**Next steps:**
- Phase 4: Formulation Comparator (side-by-side BOM comparison UI)
- Phase 5: Estimation bridge (link formulations to MES estimation calculator)
- Dead code cleanup: ~500 lines of old adhesive formulation code in `items.js` (L553-5268)

**Known issues:**
- Old adhesive formulation routes still present in `items.js` (dead code, harmless, not called by new frontend)
- Low-priority items from audit: no status state machine (arbitrary transitions like active→draft allowed), `is_default` can be set on non-active formulations, `as_new_version` string coercion edge case

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
| 2026-04-17 | BOM/Formulation Phases 1-3 complete: migration #050, formulations.js backend CRUD, formulation-resolver.js recursive engine, FormulationEditor.jsx universal frontend, CustomCategories.jsx cleanup (~800 lines removed). Full audit completed — 6 fixes applied (status whitelist, BOM save merge, numeric validation, category filter, NULL guard, by-group enrichment). Build clean. |
| 2026-04-16 | Multi-level BOM plan: added rename + parent/child sub-groups (rejected by user), then rewrote ADHESIVE_FORMULATION_PLAN.md as universal recursive BOM system across all categories. Plan only — no implementation. |
| 2026-04-15 | Custom Categories full-day work: fixed profile 500 + deprecations, completed 13-gap audit and plan, implemented unmapped-only custom-group assignment logic, corrected top unmapped live counters, and identified next blocker (direct unassign UX from custom-group detail). |
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
