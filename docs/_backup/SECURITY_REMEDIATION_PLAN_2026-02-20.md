# Security Remediation Plan (JWT + Input Validation + CSP + Log Hygiene)

Date: 2026-02-20  
Project: ProPackHub (`26.2`)

## 1) Why we are doing this
Current findings indicate:
- Weak JWT secrets are present in environment/config usage.
- Production code still allows weak fallback JWT defaults.
- Validation is inconsistent across route files.
- CSP currently allows `unsafe-eval` in production security middleware.
- Upload log files are committed in git history and currently tracked.

This plan fixes urgent risk first, then hardens the backend safely without breaking existing features.

---

## 2) Goals
- Enforce strong JWT secrets in production.
- Remove insecure secret fallbacks from runtime auth services.
- Add server-side validation to high-risk routes first, then all remaining routes.
- Remove `unsafe-eval` from production CSP while keeping charts functional.
- Stop committing logs and clean historical log artifacts from git history.
- Introduce automated security checks to prevent regression.

---

## 3) Execution Plan

## Phase A — Immediate (Today, high priority)
### A1. Rotate JWT secrets
- Generate two strong random values (64-byte hex):
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
- Update production env values on VPS/server.
- Restart backend services.

Command to generate:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Success criteria:
- New secrets are set in production env.
- Backend starts successfully with new secrets.
- Existing user sessions/tokens are invalidated (users log in again).

### A2. Remove weak runtime fallbacks
- Update auth services so production **does not** use hardcoded fallback secrets.
- Add fail-fast startup check in production:
  - If `JWT_SECRET` or `JWT_REFRESH_SECRET` missing/weak => process exits with clear error.

Success criteria:
- No `dev-*secret*` fallback is used in production runtime.
- Startup fails safely if secrets are not properly configured.

---

## Phase B — Short Term (Next 2–3 days)
### B1. Validation rollout (high-risk routes first)
Start with routes that are write-sensitive or auth-sensitive:
- Auth / session / token routes
- Admin and permissions routes
- POST/PUT/PATCH/DELETE endpoints with request body
- Query-heavy endpoints with filters/sort/pagination

For each route:
- Validate required fields (presence, type, format, length).
- Normalize values where needed (trim, toInt, whitelist).
- Reject invalid input with standard 400 response.

Success criteria:
- All high-risk endpoints have explicit validation middleware.
- Invalid payloads return consistent validation errors.

### B2. SQL safety review during validation
- Ensure all SQL user input is parameterized.
- Remove unsafe dynamic SQL where possible, or strictly whitelist identifiers.

Success criteria:
- No direct string interpolation from user input into SQL statements.

---

## Phase C — Medium Term (This week)
### C1. Full route validation coverage
- Extend validation to remaining route modules.
- Centralize reusable validators in shared middleware modules.

Success criteria:
- Every endpoint accepting `body`, `query`, or `params` has a validation path.

### C2. Add regression guardrails
- Add a security check script in CI or pre-deploy:
  - Reject weak/placeholder JWT secrets.
  - Flag missing required env vars in production mode.
  - Flag routes added without validation (policy check/manual checklist).

Success criteria:
- New deployments are blocked when critical security checks fail.

### C3. CSP hardening (remove unsafe-eval)
Current status:
- Not fixed yet.
- `server/middleware/security.js` currently has:
  - `scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"]`

Actions:
- Remove `unsafe-eval` from production CSP.
- Keep development mode permissive if needed for debugging only.
- Validate ECharts compatibility using CSP-safe approach (nonce/hash-compatible setup or CSP-friendly build path).

Success criteria:
- Production CSP no longer includes `unsafe-eval`.
- Dashboard charts still load and render correctly.

### C4. Git log hygiene and history cleanup
Current status:
- Not fixed yet.
- Verified tracked log files:
  - `logs/*` tracked count: 120
  - `scripts/logs/*` tracked count: 5

Actions:
- Add explicit ignore rules for:
  - `logs/`
  - `scripts/logs/`
  - `*.txt` under those log folders if needed
- Untrack current log files from index while keeping local copies.
- Rewrite git history to remove committed log files from all branches/tags.
- Force-push rewritten history and re-align local clones.

Success criteria:
- No log files remain tracked in current branch.
- No historical log blobs remain in remote git history.
- New logs are never committed again.

---

## 4) Rollout Strategy (safe and practical)
- Do not attempt all route fixes in one mega-change.
- Use small batches (e.g., 5–10 routes per PR/commit).
- Test each batch before moving to next.
- Keep deployment reversible.

---

## 5) Test & Verification Checklist
After each batch:
- API happy path works.
- Invalid payloads are rejected with 400.
- No new server errors in logs.
- Auth/login/token refresh still work.
- Deployment smoke test passes.

After final rollout:
- Security audit script passes.
- No weak JWT secret findings remain.
- Validation coverage documented per route group.

---

## 6) Ownership (simple)
- Infra/DevOps: rotate JWT secrets, restart service.
- Backend: remove fallbacks, add fail-fast checks, implement validation.
- QA/UAT: verify critical workflows and invalid-input handling.

---

## 7) Proposed immediate next action
1. Execute Phase A now (rotate secrets + remove fallback behavior).  
2. Add Phase C3/C4 hotfix tasks to the next deployment window.  
3. Then start Phase B on auth/admin/write routes as first validation batch.

---

## 8) Quick status snapshot (as of 2026-02-20)
- JWT rotation: pending.
- JWT fallback hardening: pending.
- Validation rollout: partial (strong in AEBF routes, inconsistent elsewhere).
- CSP unsafe-eval removal: pending.
- Git log cleanup (tracking + history): **DONE** (tracking). History rewrite deferred.

### Completed today (2026-02-20):
| Commit | Items | Summary |
|--------|-------|---------|
| `37ee1d8` | C4, D11 | .gitignore hardened; 142 IDE/log files untracked; highcharts removed |
| `4f58ad0` | D1-D5, D6(partial), D7(partial) | Removed 372 unused packages total; sourcemap hidden; vendor-3d chunk removed |

Packages removed from **root** `package.json`:
- `highcharts`, `highcharts-react-official` (zero imports)
- `plotly.js`, `react-plotly.js` (WaterfallChart orphaned, replaced by ECharts)
- `react-globe.gl`, `three` (ReactGlobe/ThreeGlobe orphaned components)
- `@playwright/mcp` (testing tool in production deps)
- `express`, `cors`, `odbc` (server-only; `oracledb` kept for standalone scripts)

Packages removed from **server** `package.json`:
- `react-beautiful-dnd` (frontend lib, zero server usage)
- `mysql2` (unused, project uses PostgreSQL)

Build changes:
- `sourcemap: true` → `sourcemap: 'hidden'` (no browser exposure)
- `vendor-3d` chunk removed from `vite.config.js`

Vulnerability count: **34 → 29** (5 fewer from removed packages)

---

## 9) Deferred hardening backlog (fix later)

These are valid architecture/security-maintenance issues and should be handled after immediate security items (JWT/CSP/log history) are complete.

### D1. Package boundary cleanup (frontend vs server) — ✅ DONE
Completed: 2026-02-20 (commit `4f58ad0`).
- Removed `express`, `cors`, `odbc` from root `package.json`.
- Kept `oracledb` in root (used by standalone scripts in `scripts/` and `exports/`).
- Server `package.json` unchanged (already had its own copies).

### D2. Remove frontend package from server runtime — ✅ DONE
Completed: 2026-02-20 (commit `4f58ad0`).
- Removed `react-beautiful-dnd` from `server/package.json`.

### D3. Express version alignment — ✅ DONE
Completed: 2026-02-20 (commit `4f58ad0`).
- Removed `express` from root `package.json` (was ^5.1.0).
- Server retains `express` ^4.18.2 as the single canonical version.

### D4. Remove unused DB driver (`mysql2`) from server — ✅ DONE
Completed: 2026-02-20 (commit `4f58ad0`).
- Removed `mysql2` from `server/package.json`.

### D5. Move `@playwright/mcp` out of production dependencies — ✅ DONE
Completed: 2026-02-20 (commit `4f58ad0`).
- Removed `@playwright/mcp` entirely (zero source usage).

### D6. Stop committing `build/` artifacts — PARTIAL
Completed (sourcemaps): 2026-02-20 (commit `4f58ad0`).
- Changed `vite.config.js` `sourcemap: true` → `sourcemap: 'hidden'` (generates .map files for error tracking but strips `//# sourceMappingURL` from output).

Still pending:
- `build/` is still tracked in git (commented out in `.gitignore` for VPS deployment).
- Decision needed: move to CI/CD artifact transfer to stop committing build output.

### D7. Charting library consolidation — PARTIAL
Completed: 2026-02-20.
- Removed `highcharts` + `highcharts-react-official` (commit `37ee1d8`) — zero imports.
- Removed `plotly.js` + `react-plotly.js` (commit `4f58ad0`) — only used by orphaned `WaterfallChart.jsx` (replaced by ECharts version).
- Removed `react-globe.gl` + `three` (commit `4f58ad0`) — orphaned `ReactGlobe.jsx`/`ThreeGlobe.jsx` never wired into navigation.
- Removed `vendor-3d` chunk from `vite.config.js`.

Still active (in use):
- **ECharts** (primary, 10+ components)
- **Chart.js / react-chartjs-2** (BudgetTab)
- **Recharts** (CRMDashboard)

Remaining action: consider migrating Chart.js and Recharts usage to ECharts for consistency.

### D8. API base URL centralization
Current status:
- The reported "66 localhost:3001 references" is outdated; current `src/` has 1 direct `localhost:3001` mention (comment text).
- However, API base URL usage is duplicated across many components (`import.meta.env.VITE_API_URL` repeated inline).

Actions:
- Create one frontend API config/service module (single source of truth).
- Replace repeated component-level `API_BASE_URL` declarations with shared import.
- Standardize on one env key (`VITE_API_URL`) and remove legacy `VITE_API_BASE_URL` usage.

Success criteria:
- No hardcoded backend host/port in frontend runtime code.
- API base URL is defined and consumed in one centralized module.

### D9. Remove PAT-in-URL deployment pattern
Current status:
- PAT-in-URL pattern exists in local env/examples and helper scripts (often redacted placeholders now).
- `server/.env` is not tracked in git, but PAT-in-URL still risks leakage via logs/process output.

Actions:
- Replace `GITHUB_REPO_URL=https://<token>@github.com/...` with SSH remote workflow.
- Update deployment scripts/docs to require SSH key auth only.
- Remove any PAT-bearing URL examples from operational docs/scripts.

Success criteria:
- No deployment path depends on PAT embedded in URL.
- All git operations use SSH remotes and key-based auth.

### D10. Excel package risk reduction (`xlsx`)
Current status:
- `xlsx` is pinned at `0.18.5` in project dependencies.
- `exceljs` is also present, so overlap exists.

Actions:
- Audit actual `xlsx` usage in frontend/server.
- Migrate remaining `xlsx` use-cases to `exceljs` where feasible.
- Remove `xlsx` if no longer required.

Success criteria:
- No vulnerable/legacy Excel parser remains in production dependencies.
- Excel import/export workflows remain functional.

### D11. IDE metadata in repository — ✅ DONE
Completed: 2026-02-20 (commit `37ee1d8`).
- Added `.idea/` and `.vscode/` to `.gitignore`.
- Untracked 14 `.idea/` files and 3 `.vscode/` files from git index.
- Local copies preserved.

---

## 10) Validated positives (with caveats)
- Helmet/HSTS/frame/referrer protections are implemented in `server/middleware/security.js`.
- Rate limiting tiers are implemented (`uploadLimiter`, `queryLimiter`, `generalLimiter`) in `server/middleware/rateLimiter.js`.
- Swagger/OpenAPI is wired (`/api-docs`, `/api-docs.json`) via `server/config/swagger.js` and `server/config/express.js`.
- bcrypt/bcryptjs hashing is used for password and token-hash workflows in auth services.
- Prometheus-style metrics route exists (`/api/metrics`) with middleware support.
- Multi-tenant platform/tenant pool architecture is implemented (`server/database/multiTenantPool.js`).
- Request correlation middleware exists and is applied in express bootstrap.
- Input validation middleware exists (notably AEBF), but coverage outside that area remains incomplete.

Important caveats:
- "JWT refresh token rotation" is not fully implemented as strict refresh-token rotation in current code path; current refresh flow mainly issues a new access token.
- Winston daily rotation is not currently configured in logger code despite dependency availability; current setup uses file size + max files.
