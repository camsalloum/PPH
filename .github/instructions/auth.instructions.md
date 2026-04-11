---
description: "Use when working on authentication, authorization, JWT tokens, user roles, permissions, middleware, rate limiting, or security."
applyTo: ["server/middleware/**", "src/contexts/AuthContext.jsx", "server/routes/auth.js", "server/routes/authorization.js", "server/services/authService.js", "server/services/authorizationService.js", "src/utils/roleChecks.js", "src/utils/roleConstants.js"]
---
# Auth & Security Context

## JWT Flow
- **Access token**: 15 min expiry, stored in `localStorage` key `auth_token` (⚠️ never `token`)
- **Refresh token**: 60 day expiry, HTTP-only cookie
- Login: `POST /api/auth/login` → returns access token + sets refresh cookie
- Refresh: `POST /api/auth/refresh` → reads cookie, returns new access token
- Logout: `POST /api/auth/logout` → clears cookie + invalidates session in DB
- Dev login: `camille@interplast-uae.com` / `Admin@123`

## Middleware Stack (order matters)
Helmet → Correlation ID → Metrics → Logger → Cookie Parser → Body Parser → CORS → Rate Limiter → JWT Auth

**17 middleware files** in `server/middleware/`:
`auth.js`, `permissions.js`, `requirePermission.js`, `rateLimiter.js`, `security.js`, `cache.js`, `errorHandler.js`, `correlation.js`, `requestLogger.js`, `monitoring.js`, `prometheus.js`, `pagination.js`, `advancedQuery.js`, `companyContext.js`, `setupCheck.js`, `aebfValidation.js`, `aebfErrorHandler.js`

## Role Hierarchy

| Group | Roles | Access |
|-------|-------|--------|
| `SALES_ROLES` | admin, manager, sales_manager, sales_coordinator, sales_rep, sales_executive | MIS + CRM |
| `CRM_FULL_ACCESS_ROLES` | admin, manager, sales_manager, sales_coordinator | CRM admin views |
| `MIS_ROLES` | admin, manager, sales_manager, sales_coordinator | MIS dashboards (level ≥ 6) |
| `QC_ROLES` | quality_control, qc_manager, qc_lab | MES QC only |
| `PRODUCTION_ROLES` | production_manager, operator | MES production |
| `ACCOUNTS_ROLES` | accounts_manager, accountant | MES procurement/invoicing |
| `MES_ONLY_ROLES` | All QC + Production + Accounts + logistics_manager, stores_keeper | MES only, skip MIS/CRM |

## Frontend Auth
- `AuthContext.jsx` — auth state, login/logout, JWT refresh, permissions, user object
- `ProtectedRoute.jsx` — route guard
- `PermissionGate` component (`src/components/common/PermissionGate.jsx`) — inline permission checks
- `src/utils/roleChecks.js` — role validation helpers
- `src/utils/roleConstants.js` — all role group constants + `MIS_MIN_LEVEL = 6`

## Security Notes
- CORS origin: currently hardcoded to localhost (TD-013 — should use env var)
- Rate limiter: applied globally via `express-rate-limit`
- Sanitization: `dompurify` for user-generated HTML
- ⚠️ DB password has hardcoded fallback in config (TD-014 — should require env var)
