# API CONTRACTS — ProPackHub / PEBI
> **Update this file every time you add or modify an API endpoint.**
> **Last Updated:** 2026-03-25

---

## Base URLs

| Environment | Frontend | Backend API |
|-------------|----------|-------------|
| Development | http://localhost:3000 | http://localhost:3001 |
| Production | https://propackhub.com | https://propackhub.com/api |

---

## Authentication

### POST `/api/auth/login`
```
Request:  { email: string, password: string }
Response: { user: User, accessToken: string }
Notes:    Refresh token set as HTTP-only cookie (60 day expiry)
```

### POST `/api/auth/refresh`
```
Request:  (no body — reads HTTP-only cookie)
Response: { accessToken: string }
Notes:    Access token expires in 15 minutes
```

### POST `/api/auth/logout`
```
Request:  (no body)
Response: { success: true }
Notes:    Clears refresh cookie
```

---

## MIS / IMS Module

### AEBF (Actual, Estimate, Budget, Forecast)
```
GET  /api/aebf/*           — Budget & forecast data endpoints (7 sub-modules)
POST /api/budget-draft/*    — Budget draft management
```

### Division Data
```
GET  /api/fp/*              — FP division data
POST /api/fp/sync-oracle-excel       — Sync data from Oracle ERP
GET  /api/fp/sync-oracle-excel/progress — Real-time sync progress (SSE)
GET  /api/universal/*       — Cross-division queries
```

### FP Master Data (Raw Product Groups)
```
GET  /api/fp/master-data/raw-product-groups                     — Get raw product group mappings
GET  /api/fp/master-data/raw-product-groups/distinct            — Get distinct raw product groups with item descriptions
GET  /api/fp/master-data/raw-product-groups/combined?division=FP — Get distinct + mappings + overrides in one payload
POST /api/fp/master-data/raw-product-groups                     — Save single or bulk raw product group mappings
GET  /api/fp/master-data/item-group-overrides                   — Get item-group override mappings
POST /api/fp/master-data/item-group-overrides                   — Save item-group override
DELETE /api/fp/master-data/item-group-overrides/:itemGroupDescription — Delete item-group override
```

Notes:
```
- `combined` endpoint is intended for Raw Product Groups initial load optimization.
- Division code should be validated and passed as `division` query (default `FP`).
```

### Sales & Analytics
```
GET  /api/sales-data/*      — Sales analytics & insights
GET  /api/sales-reps/*      — Sales representative data
GET  /api/product-groups/*  — Product group management
GET  /api/pl/*              — Profit & Loss reporting
```

> Full endpoint list to be documented. See `_backup/DATA_FLOWS_MERMAID.md` for reference.

---

## CRM Module

### Field Trip Planner

#### Trip CRUD
```
GET    /api/crm/field-trips                          — List trips (auto-complete debounced, settlement join)
GET    /api/crm/field-trips/:id                      — Trip detail (auto-complete debounced)
POST   /api/crm/field-trips                          — Create trip
PATCH  /api/crm/field-trips/:id                      — Update trip metadata
PUT    /api/crm/field-trips/:id/full                  — Full trip replace (auto-save / final save)
PATCH  /api/crm/field-trips/:id/start                — Start trip (confirmed → in_progress)
PATCH  /api/crm/field-trips/:id/cancel               — Cancel trip
DELETE /api/crm/field-trips/:id                      — Delete draft trip
```

#### Stops
```
POST   /api/crm/field-trips/:id/stops                — Add stop (guards: not completed/cancelled)
PUT    /api/crm/field-trips/:id/stops/reorder         — Reorder stops (guards: not completed/cancelled)
PATCH  /api/crm/field-trips/:id/stops/:stopId         — Update stop (guards: not completed/cancelled)
DELETE /api/crm/field-trips/:id/stops/:stopId         — Delete stop
POST   /api/crm/field-trips/:id/stops/:stopId/complete — Complete stop (outcome + GPS check-in)
POST   /api/crm/field-trips/:id/stops/:stopId/check-in — GPS check-in
```

#### Approval Workflow
```
PATCH  /api/crm/field-trips/:id/submit               — Submit for approval (draft → pending_approval)
PATCH  /api/crm/field-trips/:id/approve               — Approve/reject trip (manager only)
GET    /api/crm/field-trips/pending-my-approval       — Manager's approval queue (settlement join)
```

#### Advance & Settlement
```
PATCH  /api/crm/field-trips/:id/advance/disburse      — Disburse advance (manager only)
POST   /api/crm/field-trips/:id/settlement/submit      — Submit settlement
PATCH  /api/crm/field-trips/:id/settlement/review      — Review settlement (manager only)
```

#### Expenses
```
GET    /api/crm/field-trips/:id/expenses              — List expenses
POST   /api/crm/field-trips/:id/expenses              — Add expense (guards: confirmed/in_progress only)
DELETE /api/crm/field-trips/:id/expenses/:expenseId   — Delete expense (guards: confirmed/in_progress only)
POST   /api/crm/field-trips/:id/expenses/multi-currency — Add expense with FX conversion + receipt
```

#### Travel Report
```
GET    /api/crm/field-trips/:id/travel-report          — Get report (user names via authPool)
POST   /api/crm/field-trips/:id/travel-report          — Save/submit report (guards: not if approved)
PATCH  /api/crm/field-trips/:id/travel-report/review   — Review report (manager only)
GET    /api/crm/field-trips/:id/travel-report/enhanced  — Auto-populated report with ROI metrics
POST   /api/crm/field-trips/:id/travel-report/analyze   — Generate AI follow-up plan (trip owner only)
POST   /api/crm/field-trips/:id/travel-report/analyze/apply — Apply selected AI tasks/reminders (trip owner only)
POST   /api/crm/field-trips/:id/travel-report/review-stop — Per-stop manager comment
```

Notes:
```
- AI follow-up workflow is rep-owned (no manager approval step).
- Managers receive informational notifications when AI actions are applied.
```

#### Adjustments & Attachments
```
GET    /api/crm/field-trips/:id/adjustments            — List adjustments
POST   /api/crm/field-trips/:id/adjustments            — Create adjustment (manager only)
GET    /api/crm/field-trips/:id/attachments             — List attachments
POST   /api/crm/field-trips/:id/attachments             — Upload attachment
DELETE /api/crm/field-trips/:id/attachments/:attachmentId — Delete attachment
```

#### Utilities
```
GET    /api/crm/field-trips/geocode                    — Nominatim geocode
GET    /api/crm/field-trips/route-geometry              — OSRM route geometry
GET    /api/crm/fx-rates                               — FX rates list
POST   /api/crm/fx-rates                               — Create/update FX rate
```

### Other CRM Endpoints
```
GET  /api/crm/*             — Customer relationship management endpoints
GET  /api/master-data/*     — Master data management
```

---

## MES Module

> Module under active development. Document endpoints as they are built.

---

## Admin & Platform

```
GET  /api/admin/*           — Admin operations
GET  /api/settings/*        — Company settings
GET  /api/platform/*        — Multi-tenant administration (SaaS)
```

> Full endpoint list to be documented. See `_backup/ADMIN_SETTINGS_AUDIT_PLAN.md` for reference.

---

## Health & Monitoring

```
GET  /api/health            — Health check
GET  /api/metrics           — Prometheus metrics
GET  /api-docs              — Swagger API documentation
```

---

## Notes for Agents

- All protected endpoints require `Authorization: Bearer <accessToken>` header
- Division filtering uses `?division=FP` query param (always validate against whitelist)
- Pagination: `?page=1&limit=20` (standard across all list endpoints)
- Dates: Always ISO 8601 format (`YYYY-MM-DD`)
- Currency: AED (UAE Dirham) unless otherwise specified
