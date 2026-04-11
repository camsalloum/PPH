# PROJECT CONTEXT — ProPackHub / PEBI

> **Master Reference for AI Assistants & Developers**
> Read this file first in every new session.
>
> **Last Updated:** March 11, 2026
> **Workspace:** `d:\PPH 26.2\26.2\`

---

## 0. QUICK REFERENCE

| Item | Value |
|------|-------|
| **Product** | ProPackHub — SaaS platform for the packaging industry |
| **App** | PEBI (Packaging Enterprise Business Intelligence) — the main application inside ProPackHub |
| **Tenant** | Interplast (default dev company) |
| **Division** | FP (Flexible Packaging) — combines Oracle `FP` + `BF` codes |
| **Frontend** | React 18 + Vite 7 + Ant Design 5, port `3000` |
| **Backend** | Express 4.18 + PostgreSQL 14 + Redis (optional), port `3001` |
| **Databases** | `fp_database` (data), `ip_auth_database` (auth), `propackhub_platform` (SaaS) |
| **Auth** | JWT access (15 min) + refresh (60 day, HTTP-only cookie) |
| **Admin Login** | `camille@interplast-uae.com` / `Admin@123` |
| **Start** | `START-SERVERS.cmd` or `cd server && npm run dev` + `npm start` |
| **Build** | `npm run build` → `build/` folder |

---

## 1. PROJECT IDENTITY

### ProPackHub (Platform)

Multi-tenant SaaS platform for packaging companies. Provides centralized auth, subscription management, tenant onboarding, and hosts multiple business modules.

### PEBI (Application)

The primary application inside ProPackHub. Four major modules:

| Module | Status | Description |
|--------|--------|-------------|
| **MIS/IMS** | Production | Dashboards, KPIs, AEBF budgeting, P&L, analytics, Oracle ERP sync |
| **CRM** | Production | Customers, contacts, deals, field visit planner, worklist, prospects, analytics |
| **MES** | Active Development | Pre-sales inquiries, estimation, QC lab, job cards, procurement, NCR management |
| **AI Engine** | Integrated | Customer merging AI, churn prediction, seasonality detection, sales forecasting |

### Target Users

| Role | Module Access |
|------|---------------|
| Platform Admin | SaaS platform management (separate from tenant admin) |
| Admin | All modules — settings, user management, budgets, reports |
| Manager / Sales Manager | MIS dashboards, CRM admin view, team reports, budget approval |
| Sales Coordinator | MIS dashboards, CRM admin-level views |
| Sales Rep / Sales Executive | CRM rep views (My Day, Worklist, My Customers), field visits |
| QC Manager / QC Lab | MES QC dashboard, sample analysis, CSE approval |
| Production Manager / Operator | MES flow, job cards |
| Accounts Manager / Accountant | MES procurement, invoicing |
| Logistics Manager / Stores Keeper | MES dispatch, stock |

---

## 2. TECHNOLOGY STACK

### Frontend (Root `package.json`)

| Category | Libraries | Versions |
|----------|-----------|----------|
| **Core** | React, ReactDOM, react-router-dom | 18.3.1, 18.3.1, 7.6.3 |
| **Build** | Vite, @vitejs/plugin-react | 7.3.0, 5.1.2 |
| **UI** | Ant Design, @ant-design/icons, framer-motion, lucide-react | 5.25.1, 6.0.0, 12.19.2, 0.525.0 |
| **Charts** | ECharts + echarts-for-react, Chart.js + react-chartjs-2, Recharts | 5.4.3, 4.5.0, 3.6.0 |
| **Maps** | @react-google-maps/api, @googlemaps/markerclusterer, Leaflet, react-simple-maps, mapbox-gl | 2.20.8, 2.6.2, 1.9.4, 3.0.0, 3.19.1 |
| **Export** | jspdf + jspdf-autotable, xlsx, exceljs, html2canvas, html2pdf.js, pdf-lib, react-to-print | Various |
| **Drag & Drop** | react-beautiful-dnd | 13.1.1 |
| **Date** | dayjs (via antd) | — |
| **HTTP** | axios | 1.13.2 |
| **QR** | qrcode.react | 4.2.0 |
| **Markdown** | marked, mermaid | 16.4.0, 11.12.3 |
| **NLP** | natural, double-metaphone, string-similarity | 8.1.0, 2.0.1, 4.0.4 |
| **Sanitize** | dompurify | 3.2.7 |
| **Testing** | Jest 30, Playwright 1.58, fast-check 4.5 | — |

### Backend (`server/package.json`)

| Category | Libraries | Versions |
|----------|-----------|----------|
| **Framework** | Express | 4.18.2 |
| **Database** | pg (PostgreSQL), oracledb | 8.11.3, 6.10.0 |
| **Cache** | Redis | 5.10.0 |
| **Auth** | jsonwebtoken, bcrypt / bcryptjs | 9.0.2, 6.0.0 / 2.4.3 |
| **Security** | helmet, express-rate-limit, cors | 8.1.0, 8.2.1, 2.8.5 |
| **Email** | nodemailer | 8.0.1 |
| **Microsoft** | @azure/msal-node, @microsoft/microsoft-graph-client | 3.8.1, 3.0.7 |
| **Scheduling** | node-cron | 4.2.1 |
| **Logging** | winston, winston-daily-rotate-file | 3.18.3, 5.0.0 |
| **Excel** | exceljs, xlsx | 4.4.0, 0.18.5 |
| **NLP** | natural, double-metaphone, compromise, string-similarity | — |
| **Upload** | multer | 1.4.5 |
| **Docs** | swagger-jsdoc, swagger-ui-express | 6.2.8, 5.0.1 |
| **SSH** | node-ssh | 13.2.1 |
| **Testing** | jest 30, supertest 7, artillery 2 | — |

### Vite Configuration (`vite.config.js`)

- **Dev port:** 3000 (auto-open)
- **Proxy:** `/api` and `/uploads` → `http://localhost:3001`
- **Path aliases:** `@` → `src/`, `@components`, `@contexts`, `@utils`, `@hooks`, `@services`, `@assets`
- **Manual chunks:** vendor-react, vendor-charts, vendor-ui, vendor-maps, vendor-export
- **Build:** output to `build/`, hidden sourcemaps, 2000 KB chunk warning limit
- **Custom plugin:** `noCache304Plugin` strips conditional request headers to prevent Chrome cache corruption

---

## 3. ARCHITECTURE

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

### Connection Pool (`server/config/database.js`)

- Pool: 20 max connections, 30s idle timeout, 10s connection timeout
- Retry: 3 attempts, 2s delay
- Exports: `pool`, `query(text, params)`, `getClient()`, `testConnection()`

---

## 4. FOLDER STRUCTURE

```
d:\PPH 26.2\26.2\
├── src/                          # React frontend
│   ├── App.jsx                   # Root router
│   ├── components/               # ~330 JSX components
│   │   ├── auth/                 #   Login, ProtectedRoute
│   │   ├── charts/               #   Chart wrappers (ECharts, Chart.js)
│   │   ├── charts/components/    #   27 chart components
│   │   ├── common/               #   Header, CurrencySymbol, PermissionGate, Spinner
│   │   ├── CRM/                  #   76 CRM components (see §6.2)
│   │   ├── dashboard/            #   65+ MIS dashboard components
│   │   ├── dashboard/components/ #   CustomerInsights, FinancialPerformance, ErrorBoundary
│   │   ├── MasterData/           #   ProjectWorkflow
│   │   ├── MasterData/AEBF/     #   8 budget tabs (Actual, Budget, Estimate, Forecast, etc.)
│   │   ├── MasterData/CustomerMerging/  # 3 customer merge components
│   │   ├── MasterData/SalesRep/ #   3 sales rep management components
│   │   ├── MES/                  #   2 entry points (WorkflowLandingPage, index)
│   │   ├── MES/Flow/            #   4 job flow components
│   │   ├── MES/PreSales/        #   20+ pre-sales components
│   │   ├── MES/PreSales/InquiryDetail/  # 16 inquiry detail panels
│   │   ├── MES/QC/              #   10 QC components
│   │   ├── modules/             #   ModuleSelector (app home)
│   │   ├── people/              #   9 user/org management components
│   │   ├── platform/            #   2 SaaS admin components
│   │   ├── reports/             #   16 report components
│   │   ├── settings/            #   15 settings components
│   │   ├── setup/               #   SetupWizard
│   │   └── shared/              #   ResizableTable
│   ├── contexts/                 # 10 React Context providers
│   │   ├── AuthContext.jsx       #   Auth state, login/logout, JWT refresh, permissions
│   │   ├── CurrencyContext.jsx   #   Currency symbol & formatting
│   │   ├── ExcelDataContext.jsx  #   Sales data state for MIS dashboards
│   │   ├── FilterContext.jsx     #   Dashboard filter state
│   │   ├── PLDataContext.jsx     #   P&L data provider
│   │   ├── SalesCountryContext.jsx
│   │   ├── SalesDataContext.jsx
│   │   ├── SalesRepReportsContext.jsx
│   │   └── ThemeContext.jsx      #   Light/dark theme
│   ├── services/                 # countriesService.jsx, regionService.jsx
│   └── utils/                    # 20 utility files
│       ├── authClient.jsx        #   Axios instance with auth interceptor
│       ├── roleChecks.js         #   isAdminOrMgmt, canAccessQC, etc.
│       ├── roleConstants.js      #   SALES_ROLES, MES_ONLY_ROLES, CRM_FULL_ACCESS_ROLES, etc.
│       ├── calculationUtils.js, filterUtils.js, normalization.js
│       ├── pdfExport.js, excelUtils.js
│       └── SalesIntelligenceEngine.js
│
├── server/                       # Express backend
│   ├── index.js                  # Entry point — route mounting, startup tasks, cron jobs
│   ├── config/
│   │   ├── database.js           # PostgreSQL pool (fp_database)
│   │   ├── express.js            # Middleware stack setup
│   │   ├── environment.js        # Env var validation
│   │   ├── swagger.js            # OpenAPI docs
│   │   └── alerting.js           # Monitoring config
│   ├── routes/                   # 45+ route files
│   │   ├── auth.js               # /api/auth — login, refresh, logout, me
│   │   ├── aebf/                 # /api/aebf — 12 sub-modules (actual, budget, bulk, etc.)
│   │   ├── crm/                  # /api/crm — 19 sub-routes (see §6.2)
│   │   ├── mes/                  # /api/mes — flow.js
│   │   ├── platform/             # /api/platform — auth, companies, metrics
│   │   ├── fp.js                 # /api/fp — division data, Oracle sync
│   │   ├── salesData.js          # /api/sales-data
│   │   ├── pl.js                 # /api/pl — P&L
│   │   ├── settings.js           # /api/settings
│   │   ├── employees.js          # /api/employees
│   │   ├── territories.js        # /api/territories
│   │   ├── permissions.js        # /api/permissions
│   │   └── ... (30+ more)
│   ├── middleware/               # 16 middleware files
│   │   ├── auth.js               # authenticate, requireRole, requireDivisionAccess
│   │   ├── security.js           # Helmet, CORS, rate limit headers
│   │   ├── rateLimiter.js        # express-rate-limit
│   │   ├── cache.js              # Redis init
│   │   ├── correlation.js        # Request ID tracking
│   │   └── errorHandler.js       # Global error + 404
│   ├── services/                 # 53 service files
│   │   ├── authService.js        # User auth, JWT, bcrypt
│   │   ├── crmAccessControl.js   # CRM rep-scope WHERE builder
│   │   ├── crmActivityLogger.js  # Activity logging
│   │   ├── crmNotificationService.js  # CRM notifications
│   │   ├── emailService.js       # SMTP via nodemailer
│   │   ├── outlookAuthService.js # OAuth2 for Outlook
│   │   ├── outlookSyncService.js # Graph API delta email sync
│   │   ├── dealSyncService.js    # CRM deal ↔ MES inquiry sync
│   │   ├── presalesPdfService.js # Quotation/Proforma PDF via Puppeteer
│   │   ├── OracleERPSyncService.js  # Oracle direct sync (oracledb thick mode)
│   │   ├── CustomerMergingAI.js  # AI duplicate detection
│   │   ├── AILearningService.js  # Self-learning engine
│   │   ├── CustomerLearningService.js  # Churn, segmentation, CLV
│   │   ├── migrationRunner.js    # Ordered SQL/JS migration execution
│   │   └── ... (39 more)
│   ├── database/                 # 24 DB service/config files
│   │   ├── config.js             # Main pool (same as config/database.js)
│   │   ├── multiTenantPool.js    # Per-tenant connection manager
│   │   ├── FPDataService.js      # FP division queries
│   │   ├── ProductGroupDataService.js  # Product group aggregations
│   │   ├── CustomerInsightsService.js  # Customer analysis
│   │   └── ... (19 more)
│   ├── migrations/               # 115 migration files (SQL + JS)
│   │   ├── 001–330_*.sql         # Schema baseline + data sync
│   │   ├── crm-001–017_*.js      # CRM tables (activities, tasks, deals, etc.)
│   │   ├── mes-presales-001–017_*.js  # MES pre-sales tables
│   │   ├── mes-qc-001–005_*.js   # QC tables
│   │   └── mes-flow-001_*.js     # Flow engine
│   ├── scripts/                  # 134+ utility scripts (analysis, fixes, VPS, sync)
│   └── utils/
│       └── logger.js             # Winston with daily-rotate-file
│
├── build/                        # Production build output
├── public/                       # Static assets
├── docs/                         # 150+ markdown documentation files
├── vite.config.js
├── package.json
├── jest.config.js
├── START-SERVERS.cmd              # Launches both servers
└── README.md
```

---

## 5. AUTHENTICATION & ROLES

### JWT Flow

1. `POST /api/auth/login` → returns `{ accessToken, user }`
2. Access token stored in `localStorage` as `auth_token` + axios default header
3. Refresh token in HTTP-only cookie (60 day)
4. Axios interceptor catches 401 → `POST /api/auth/refresh` → new access token
5. Queues concurrent 401 requests while refresh is in-flight
6. If refresh fails → `auth:logout` event → clear state

### JWT Claims

```js
{ id, email, role, designation, department, divisions, isPlatformAdmin, companyId, companyCode }
```

### Middleware Functions (`server/middleware/auth.js`)

- `authenticate` — verify JWT, attach `req.user`
- `requireRole(...roles)` — check `req.user.role` against allowed list
- `requireDivisionAccess` — check user has access to requested division
- `optionalAuthenticate` — non-blocking token check

### AuthContext (`src/contexts/AuthContext.jsx`)

Exposes: `login()`, `logout()`, `hasRole()`, `hasPermission()`, `hasAccessToDivision()`, `isAuthenticated`, `user`, `token`, `permissions`, `refreshUser()`, `changePassword()`, `updateProfile()`, `getPreferences()`

### Defined Roles (`src/utils/roleConstants.js`)

| Role | Label | Module Access |
|------|-------|---------------|
| `admin` | Administrator | All |
| `manager` | Manager | MIS + CRM admin + MES |
| `sales_manager` | Sales Manager | MIS + CRM admin |
| `sales_coordinator` | Sales Coordinator | MIS + CRM admin views |
| `sales_rep` | Sales Representative | CRM rep views only |
| `sales_executive` | Sales Executive | CRM rep views only |
| `quality_control` | Quality Control | MES QC |
| `qc_manager` | QC Manager | MES QC |
| `qc_lab` | QC Lab | MES QC |
| `production_manager` | Production Manager | MES Flow |
| `operator` | Operator | MES Flow |
| `logistics_manager` | Logistics Manager | MES Dispatch |
| `stores_keeper` | Stores Keeper | MES Stock |
| `accounts_manager` | Accounts Manager | MES Procurement |
| `accountant` | Accountant | MES Procurement |

**Role Groups:**
- `SALES_ROLES` = admin, manager, sales_manager, sales_coordinator, sales_rep, sales_executive
- `CRM_FULL_ACCESS_ROLES` = admin, manager, sales_manager, sales_coordinator — **but non-admin roles also require `designation_level >= 6`** to get full (all-reps) access
- `MIS_ROLES` = admin, manager, sales_manager, sales_coordinator (+ `MIS_MIN_LEVEL = 6`)
- `QC_ROLES` = quality_control, qc_manager, qc_lab
- `MES_ONLY_ROLES` = QC + production + logistics + accounts roles

---

## 6. MODULES IN DETAIL

### 6.1 MIS/IMS — Management Information System

**Purpose:** Dashboards, KPIs, AEBF budgeting, P&L, sales analytics, Oracle ERP sync.

#### 6.1.1 Divisional Dashboard

**Components:** `DivisionalDashboardLanding.jsx` → sub-components: `ProductGroupTable`, `SalesByCountryTable`, `SalesBySalesRepDivisional`, `KPIExecutiveSummary`, `SalesCountryChart`, `MapSwitcher`

**Data Flow:**
- Actual data: `fp_actualcommon` (filtered by `admin_division_code`)
- Budget data: `fp_budget_unified` (`budget_type = 'DIVISIONAL'`)
- Product group exclusions: `fp_product_group_exclusions`
- All KPI services (`ProductPerformanceService`, `GeographicDistributionService`, `CustomerInsightsService`) apply exclusions dynamically

#### 6.1.2 Sales Dashboard

**Components:** `Dashboard.jsx` → `SalesBySalesRepTable`, `SalesCustomerDetail`, `SalesRepDetail`, `SalesRepHTMLExport`

**Data Flow:**
- Actual: `fp_actualcommon`
- Budget: `fp_budget_unified` (`budget_type = 'SALES_REP'`)
- Customer merge rules: `fp_division_customer_merge_rules` (31 rules)
- Sales rep groups: `sales_rep_groups` + `sales_rep_group_members`

#### 6.1.3 AEBF (Actual / Estimate / Budget / Forecast)

**Components:** `AEBFTab.jsx` → `ActualTab`, `BudgetTab`, `EstimateTab`, `BudgetPLTab`, `LiveBudgetEntryTab`

**Budget Sub-tabs inside BudgetTab:**
- **Divisional Budget** — Division-level by product group, no customers
- **Sales Budget** → Management Allocation, Sales Rep Import, Bulk Import
- **Export PG Allocated Budget** — HTML per sales rep group for reps to fill

**Management Allocation Flow:**
1. Select sales rep group + budget year
2. Enter yearly MT per product group → auto-distributes to 12 months based on actual pattern
3. Shows "Div Budget Remaining" = Div Budget − Σ(all group allocations)
4. Save Draft → distributes yearly to monthly rows
5. Submit Final → approve

**Budget Types in `fp_budget_unified`:**

| `budget_type` | Has Customer | Has Country | Has Sales Rep | Used By |
|---------------|-------------|-------------|---------------|---------|
| `DIVISIONAL` | No | No | No | ProductGroupTable, P&L, division totals |
| `SALES_REP` | Yes | Yes | Yes | Sales Dashboard, rep reports, customer analysis |
| `ESTIMATE` | Yes | Yes | Yes | Estimate tab |
| `FORECAST` | Yes | Yes | Yes | Forecast tab |

**Allocation table:** `fp_sales_rep_group_budget_allocation` (group → PG → month)

#### 6.1.4 P&L (Profit & Loss)

**Route:** `/api/pl/*` — **Service:** `plDataService.js` — **Table:** `fp_pl_data`

Revenue → COGS → Gross Profit → OpEx → EBITDA → Interest & Tax → Net Income

#### 6.1.5 Reports

**Components:** 16 files in `src/components/reports/` — `SalesRepReport`, `ExecutiveSummary`, `PerformanceDashboard`, `BudgetAchievementChart`, customer/PG tables, `KeyInsights` (AI), `ExportActions` (PDF/Excel)

#### 6.1.6 Oracle ERP Sync

**Two methods:**
1. **Direct sync** (primary): `OracleERPSyncService.js` → `oracledb` thick mode → `fp_raw_oracle` → trigger → `fp_actualcommon`
2. **Excel import** (fallback): Upload `.xlsx` → `import-excel-to-raw-fast.js` → same flow

**Oracle source:** `HAP111.XL_FPSALESVSCOST_FULL` (~50K rows, 57 columns)

**Sync UI buttons in ActualTab:** "Sync Current Year (Direct)" / "Sync All Years (Direct)"

---

### 6.2 CRM — Customer Relationship Management

**76 components** in `src/components/CRM/`. **19 backend sub-routes** in `server/routes/crm/`.

#### CRM Route Map

| Route | Component | Who Sees |
|-------|-----------|----------|
| `/crm` | `AdminCRMDashboard` or `CRMHomePage` | Admin → admin dashboard; Rep → home page |
| `/crm/overview` | `CRMDashboard` | Rep |
| `/crm/my-day` | `MyDayDashboard` | Rep |
| `/crm/worklist` | `CRMWorklist` | Rep |
| `/crm/customers` | `CustomerList` or `MyCustomers` | Admin → full list; Rep → assigned only |
| `/crm/customers/map` | `CustomerMapView` | Admin |
| `/crm/customers/:id` | `CustomerDetail` | All |
| `/crm/products` | `ProductGroupList` | All |
| `/crm/prospects` | `ProspectManagement` or `MyProspects` | Admin → manage; Rep → my prospects |
| `/crm/lost-business` | `LostBusiness` | Rep |
| `/crm/pipeline` | `FullPipelineDashboard` | Admin/Manager |
| `/crm/analytics` | `CRMAnalytics` | Admin/Manager |
| `/crm/team` | `SalesRepList` | Admin/Manager |
| `/crm/reports` | `CRMReports` | Admin/Manager |
| `/crm/budget` | `CRMBudgetView` / `CRMBudgetEntry` | Depends |
| `/crm/calendar` | `FieldTripCalendar` | Manager/Admin |
| `/crm/visits` | `FieldVisitList` | All |
| `/crm/visits/new` | `FieldVisitPlanner` | All |
| `/crm/visits/:id` | `FieldVisitDetail` | All |
| `/crm/visits/:id/route` | `FieldVisitRouteView` | All |
| `/crm/visits/:id/in-trip` | `FieldVisitInTrip` | All |
| `/crm/visits/:id/report` | `FieldVisitReport` | All |
| `/crm/visits/:id/travel-report` | `FieldVisitTravelReport` | All |
| `/crm/inquiries/*` | PreSales inquiries (MES integration) | All |

#### CRM Backend Routes (`server/routes/crm/`)

| File | Prefix | Key Endpoints |
|------|--------|---------------|
| `customers.js` | `/customers` | CRUD, search, assignment, sales history |
| `contacts.js` | `/contacts` | Customer contact CRUD |
| `activities.js` | `/activities` | Activity logging & feed |
| `tasks.js` | `/tasks` | Task CRUD, assignment |
| `deals.js` | `/deals` | Deal pipeline CRUD, stage transitions |
| `field-trips.js` | `/field-trips` | Trip CRUD, stops, legs, check-in, route, status, clone, date-range filter (`fromDate`/`toDate`) |
| `meetings.js` | `/meetings` | Meeting scheduling |
| `calls.js` | `/calls` | Call logging |
| `emails.js` | `/emails` | Email sync & compose |
| `email-drafts.js` | `/email-drafts` | Draft management |
| `email-templates.js` | `/email-templates` | Template CRUD |
| `lost-business.js` | `/lost-business` | Lost business tracking (rep-scoped via `resolveRepGroup()`, search + reason query filters) |
| `products.js` | `/products` | Product catalog |
| `prospects.js` | `/prospects` | Prospect lifecycle (Lead → Prospect → Converted), conversion detection with checked/converted counts |
| `technical-briefs.js` | `/technical-briefs` | Technical brief forms |
| `analytics.js` | `/analytics` | CRM analytics & leaderboard (rank persisted on rows, stable across sorts) |
| `dashboard.js` | `/dashboard` | CRM dashboard data |
| `bulk.js` | `/bulk` | Bulk operations |
| `worklist-preferences.js` | `/worklist-preferences` | Worklist config |

#### CRM Key Components

**My Day Dashboard** (`MyDayDashboard.jsx`): Daily hub for reps — priority actions, schedule, KPI bar, field visit banner, lookahead, notifications, email queue, customer health.

**Worklist** (`CRMWorklist.jsx`): Task queue with preferences, tab-based filtering, detail drawer, keyboard shortcuts (↑/↓ arrow navigation, Enter to open, Escape to close), preference caching across tab switches.

**Customer Detail** (`CustomerDetail.jsx`): Full customer page — contacts tab, notes tab, activity feed, sales history modal, packaging profile, email thread, field visits, deals, technical briefs.

**Deal Pipeline** (`DealPipeline.jsx`): Kanban board with drag-and-drop (`react-beautiful-dnd`) — deal cards can be dragged between stage columns; confirmed/lost stages trigger a confirmation modal. `FullPipelineDashboard.jsx` for manager drill-down with stale-data clearing on phase switch.

**Sales Cockpit** (`SalesCockpit.jsx`): Rep performance — KPIs (volume, budget achievement, MoRM), at-risk customers heuristic, activity metrics.

#### CRM Field Visit Planner (14 components)

The visit planner is a multi-step wizard for planning customer/prospect visits:

| Component | Purpose |
|-----------|---------|
| `FieldVisitPlanner.jsx` | Main wizard — 3 steps: Trip Setup → Stops & GPS → Review & Save; travel conflict warnings |
| `FieldVisitMap.jsx` | Google Maps with AdvancedMarker pins for stops |
| `FieldVisitLegForm.jsx` | Transport legs (flight, drive, train) between cities |
| `FieldVisitChecklistPanel.jsx` | Pre-departure checklist (local vs international) |
| `FieldVisitDetail.jsx` | Trip detail — stops, legs, expenses, approvals, budget progress, clone & PDF buttons |
| `FieldVisitInTrip.jsx` | Real-time in-trip view — GPS check-in, auto-opens outcome modal, order_placed field |
| `FieldVisitRouteView.jsx` | Route visualization — date-grouped, numbered circles |
| `FieldVisitReport.jsx` | Post-trip report |
| `FieldVisitTravelReport.jsx` | Travel expense report |
| `FieldVisitKPIPanel.jsx` | Trip KPI stats |
| `FieldVisitList.jsx` | Trip listing with filters |
| `FieldTripCalendar.jsx` | Manager month calendar — all reps' trips as colored blocks (Ant Design Calendar) |
| `FieldVisitItineraryExport.js` | PDF itinerary export — jsPDF + autoTable (stops, legs, expenses, travel notes) |
| `FieldVisitStopList.jsx` | Dead code — orphaned, never imported |

**Maps:** Google Maps JS API (`version: 'weekly'`, `libraries: ['marker']`), `@react-google-maps/api`, `AdvancedMarkerElement` with plain `div` content (no `PinElement`, no `mapId`).

**Trip features:**
- **Statuses:** `planning` → `confirmed` → `in_progress` → `completed` / `cancelled`
- **Clone:** `POST /field-trips/:id/clone` — copies trip, stops (without dates), legs (without times); frontend Clone button in detail view
- **PDF Export:** `exportItineraryPDF()` — generates A4 PDF with header, trip info, stops table, legs table, expenses with totals, travel notes; lazy-loaded from detail view
- **Budget vs Actual:** Progress bar in detail view showing total expenses / budget estimate with color coding (green ≤75%, amber ≤100%, red >100%)
- **In-Trip Outcomes:** Auto-opens outcome modal after GPS check-in with pre-filled defaults; includes `order_placed` checkbox
- **Travel Conflicts:** Step 2 review shows per-stop late warnings and summary alert for schedule conflicts
- **Calendar View:** `/crm/calendar` — month calendar showing all reps' trips as colored blocks with legend, uses `fromDate`/`toDate` backend query params

---

### 6.3 MES — Manufacturing Execution System

**Purpose:** Pre-sales inquiry workflow, estimation, QC lab, job cards, procurement.

#### MES Route Map

| Route | Component |
|-------|-----------|
| `/mes` | `WorkflowLandingPage` |
| `/mes/flow/*` | `FlowModule` (JobFlowTracker, DeptDashboard) |
| `/mes/pipeline` | `MyPipeline` |
| `/mes/inquiries/*` | `PresalesInquiries` (InquiryBoard, InquiryCapture) |
| `/mes/qc` | `QCDashboard` |
| `/mes/qc/samples/:sampleId` | `QCSampleAnalysis` |
| `/mes/qc/cse/:cseId` | `CSEApprovalPage` |
| `/mes/qc/ncr` | `NCRManagement` |
| `/mes/qc/templates` | `QCTemplateAdmin` |
| `/mes/qc/scan/:sampleNumber` | `QCScanPage` |
| `/mes/analytics` | `WinLossAnalytics` |
| `/mes/job-cards` | `JobCardList` |
| `/mes/estimation` | `EstimationQueue` |
| `/mes/estimation/:inquiryId` | `EstimationCalculator` |
| `/mes/procurement` | `ProcurementDashboard` |
| `/mes/approvals` | `CSEApprovalQueue` |
| `/mes/public/cse/:token` | `PublicCSEView` (no auth — public link) |

#### MES Pre-Sales Components (20+)

`InquiryBoard` (Kanban), `InquiryCapture` (new inquiry form), `InquiryDetail/` (16 sub-panels: info card, phase stepper, quotation, proforma, samples, procurement, customer PO, delivery feedback, clearance, audit trail, etc.), `EstimationCalculator`, `EstimationQueue`, `JobCardForm`, `JobCardList`, `JobCardPDF`, `MyPipeline`, `NegotiationTimeline`, `NewCustomerModal`, `ProcurementDashboard`, `PurchaseRequisitionForm`, `StockReceiptForm`, `SupplierPurchaseOrderForm`, `WinLossAnalytics`

#### MES QC Components (10)

`QCDashboard`, `QCSampleAnalysis`, `QCTemplateAdmin`, `CSEApprovalPage`, `CSEApprovalQueue`, `NCRManagement`, `BatchAnalysisModal`, `EquipmentAdminModal`, `SampleProgressSteps`, `PublicCSEView`

#### CRM ↔ MES Integration

- `dealSyncService.js` keeps CRM deal stages aligned with MES inquiry stages
- When MES inquiry advances stage, CRM deal auto-updates
- Shared `crm_activities` table for logging across both modules

---

### 6.4 Platform Administration (SaaS)

**Route:** `/platform/*` — **Guard:** `isPlatformAdmin` only

**Components:** `PlatformDashboard.jsx`, `PlanManagement.jsx`

**Backend:** `server/routes/platform/` — `auth.js`, `companies.js`, `tenantMetrics.js`

**Features:** Company (tenant) CRUD, subscription plans (Free/Starter/Pro/Enterprise/Custom), database provisioning, usage metrics

**Current tenants:** Interplast (default dev tenant)

---

### 6.5 People & Access Module

**Route:** `/people-access/*` — **Guard:** admin only

**Components:** `PeopleAccessModule.jsx`, `UnifiedUserEmployee.jsx`, `RolesPermissions.jsx`, `AuthorizationRulesManager.jsx`, `SalesTeamManager.jsx`, `TerritoryManager.jsx`, `EnhancedOrgChart.jsx`, `AuditLog.jsx`, `UserProfile.jsx`

---

### 6.6 Settings Module

**Route:** `/settings` — **Components:** 15 files in `src/components/settings/`

Key pages: `OrganizationSettings` (company info, divisions), `DivisionManagement`, `EmployeesManagement`, `TerritoriesManagement`, `UserPermissions`, `DatabaseBackup`, `PeriodConfiguration`, `OutlookConnectSettings`, `DeploymentPanel`, `PendingCountries`, `ThemeSelector`

---

### 6.7 AI Learning System

**Services:** `AILearningService.js`, `CustomerLearningService.js`, `SalesRepLearningService.js`, `ProductLearningService.js`, `DivisionLearningService.js`, `PLLearningService.js`, `FeedbackLearningService.js`, `AutoLearningService.js`, `CausalityEngine.js`, `PrescriptiveEngine.js`, `FinancialHealthService.js`, `SupplyChainIntelligenceService.js`, `DataCaptureService.js`, `LearningScheduler.js`

**Capabilities:** Customer merging AI (fuzzy matching), churn prediction, seasonality detection, sales forecasting, anomaly detection, coaching recommendations, cross-sell patterns

**Schedule:** Nightly at 2 AM via `LearningScheduler.js`

---

## 7. DATABASE TABLES

### 7.1 Core Data Tables (`fp_database`)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `fp_actualcommon` | **Primary actual sales data** (50K+ rows) | `admin_division_code`, `division_code`, `sales_rep_name`, `sales_rep_group_name`, `customer_name`, `country`, `pgcombine`, `amount`, `qty_kgs`, `morm`, `year`, `month_no` |
| `fp_budget_unified` | **All budget/forecast/estimate data** | `budget_type`, `budget_status`, `division_code`, `sales_rep_name`, `customer_name`, `country`, `pgcombine`, `amount`, `qty_kgs`, `morm`, `budget_year`, `month_no` |
| `fp_raw_oracle` | Raw Oracle staging (50K+ rows) | 57 Oracle columns + metadata |
| `fp_pl_data` | P&L financial data (~1K rows) | Revenue, COGS, expenses by period |
| `fp_budget_bulk_import` | Budget bulk import staging | Batch tracking + review |
| `fp_sales_rep_group_budget_allocation` | Management allocation by group | Group → PG → month |

### 7.2 Master Data Tables

| Table | Purpose | Rows |
|-------|---------|------|
| `fp_customer_unified` | Customer master | 565 |
| `fp_sales_rep_unified` | Sales rep master | 51 |
| `fp_product_group_unified` | Product group master | 20 |
| `fp_raw_product_groups` | PG → pgcombine mapping | 18 |
| `fp_division_customer_merge_rules` | Customer merge rules | 31 |
| `fp_product_group_exclusions` | Excluded PGs (e.g., "Raw Materials") | 1 |
| `sales_rep_groups` | Group definitions | 14 |
| `sales_rep_group_members` | Group membership | ~60 |

### 7.3 CRM Tables

Created by migrations `crm-001` through `crm-017`:
`crm_activities`, `crm_tasks`, `crm_notes`, `crm_deals`, `crm_contacts`, `crm_field_trips`, `crm_field_trip_stops`, `crm_field_trip_legs`, `crm_field_trip_expenses`, `crm_field_trip_checklist`, `crm_meetings`, `crm_calls`, `crm_email_drafts`, `crm_email_templates`, `crm_technical_briefs`, `crm_packaging_profiles`, `crm_worklist_preferences`, `crm_prospects`, `crm_lost_business`

### 7.4 MES Tables

Created by migrations `mes-presales-001` through `mes-presales-017` + `mes-qc-001` through `mes-qc-005` + `mes-flow-001`:
Inquiry lifecycle tables, sample tracking, quotation workflow, customer PO, dispatch/feedback, job cards, procurement, QC analysis, CSE approval, NCR, equipment

### 7.5 Auth Tables (`ip_auth_database`)

| Table | Purpose | Rows |
|-------|---------|------|
| `users` | User accounts | 51 |
| `user_sessions` | JWT sessions | ~100 |
| `user_divisions` | User-to-division access | ~60 |
| `permissions` | Permission definitions | 50+ |
| `roles` | Role definitions | 5 |
| `company_settings` | Key-value config | ~20 |
| `company_divisions` | Division definitions (with `raw_divisions` JSONB) | ~5 |
| `employees` | Employee records | 51 |
| `departments` | Department definitions | 10 |
| `master_countries` | Country reference (199 countries) | 199 |
| `currencies` | Currency definitions | 34 |

### 7.6 Materialized Views

| View | Purpose | Refresh |
|------|---------|---------|
| `mv_sales_by_customer` | Pre-aggregated by customer | Auto-trigger |
| `mv_sales_by_rep_group` | Pre-aggregated by rep group | Auto-trigger |
| `mv_sales_by_product_group` | Pre-aggregated by PG | Auto-trigger |
| `mv_sales_by_country` | Pre-aggregated by country | Auto-trigger |
| `mv_product_group_pricing` | Product pricing by period | 2 AM daily cron |

---

## 8. CRITICAL RULES

### 8.1 Division Architecture

**FP division = Oracle `FP` + Oracle `BF` (Bags & Films)**

The `divisions` table stores a `raw_divisions` JSONB array mapping admin codes to Oracle codes:
```sql
-- divisions table
division_code = 'FP', raw_divisions = ['FP', 'BF']
```

**Querying actual data:**
```sql
-- ✅ CORRECT: Use admin_division_code (gets both FP and BF data)
WHERE UPPER(admin_division_code) = UPPER($1)

-- ❌ WRONG: Using division_code (misses BF data)
WHERE UPPER(division_code) = UPPER($1)
```

**Currently only FP division exists.** No other divisions have been created.

### 8.2 Budget Type Rules

```sql
-- Divisional Dashboard (no sales rep filter)
WHERE budget_type = 'DIVISIONAL'

-- Sales Dashboard (specific rep, with customers)
WHERE budget_type = 'SALES_REP' AND sales_rep_name = $1

-- NEVER fall back from SALES_REP to DIVISIONAL for individual rep views
-- NEVER mix DIVISIONAL and SALES_REP in the same query
```

### 8.3 Product Group Exclusions

All KPI queries must exclude product groups from `fp_product_group_exclusions`:
```sql
AND pgcombine NOT IN (SELECT product_group FROM fp_product_group_exclusions WHERE division_code = 'FP')
```
Currently excludes: "Raw Materials"

### 8.4 Countries

**Source of truth:** `master_countries` table (199 countries) in `ip_auth_database`

**API:** `/api/countries/list`

**Deprecated:** `WorldCountriesService.js` (hardcoded 179 countries) — still exists for backward compatibility but use `master_countries` table for all new code.

### 8.5 Sales Rep Groups

```
sales_rep_groups (group definitions: id, group_name, division)
  └── sales_rep_group_members (membership: group_id, member_name)
        └── Links to fp_sales_rep_unified.display_name
```
Group names can equal member names (e.g., "Narek Koroukian" group contains Narek + Salil).

---

## 9. SCHEDULED JOBS

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 2 * * *` | Product Groups MV refresh | Refresh materialized views |
| `0 7 * * *` | CRM Daily Digest | Email daily summary to reps |
| `*/30 * * * *` | SLA Breach Checker | Check MES SLA deadlines |
| `0 */12 * * *` | Outlook Webhook Renewal | Renew Microsoft Graph subscriptions |
| `0 */6 * * *` | Outlook Webhook Migration | Migrate webhook-less users |
| `*/10 * * * *` | Outlook Primary Polling | Poll email for non-webhook users |
| `0 * * * *` | Outlook Safety-Net Polling | Catch missed webhook events |

---

## 10. STARTUP SEQUENCE (`server/index.js`)

1. Load environment variables
2. Initialize Express middleware stack (via `config/express.js`)
3. Multi-tenant pool initialization
4. Redis cache initialization
5. Global configuration loading
6. Database connection test (with retry)
7. Auth database migrations (user sessions)
8. CRM database migrations (crm-001 through crm-017)
9. MES database migrations (mes-presales-*, mes-qc-*, mes-flow-*)
10. Sales rep alias cache loading
11. Sales rep groups preloading from DB
12. Mount 45+ route prefixes
13. Division table sync (background)
14. Database warm-up queries (background)
15. Start cron jobs
16. Listen on port 3001

---

## 11. API ENDPOINT MAP

### Core Business

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/auth` | `auth.js` | Login, refresh, logout, me, profile |
| `/api/aebf` | `aebf/index.js` | Actual/Budget/Forecast (12 sub-files) |
| `/api/budget-draft` | `budget-draft.js` | Live budget draft operations |
| `/api/fp` | `fp.js`, `fpPerformance.js` | FP division data, Oracle sync, performance |
| `/api/sales-data` | `salesData.js` | Sales analytics & summaries |
| `/api/sales-reps` | `salesReps.js` | Sales rep defaults, groups, complete data |
| `/api/product-groups` | `productGroups.js` | Product group master |
| `/api/pl` | `pl.js` | P&L reporting |
| `/api/crm` | `crm/index.js` | CRM module (19 sub-routes) |

### Master Data & Config

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/settings` | `settings.js` | Company settings, divisions, logo |
| `/api/divisions` | `divisions.js` | Division CRUD |
| `/api/master-data` | `masterData.js` | Raw PGs, material columns, item groups |
| `/api/countries` | `countries.js` | Country master |
| `/api/currency` | `currency.js` | Currency management |
| `/api/standard-config` | `globalConfig.js` | Global config settings |
| `/api/config` | `config.js` | Dynamic material & pricing config |
| `/api/customer-master` | `customerMaster.js` | Customer CRUD, codes, aliases |
| `/api/confirmed-merges` | `confirmedMerges.js` | Customer merge records |
| `/api/division-merge-rules` | `divisionMergeRules.js` | Division merge rules |

### Allocation & Budget

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/sales-rep-group-allocation` | `sales-rep-group-allocation.js` | Group-level budget allocation |
| `/api/sales-rep-allocation` | `sales-rep-allocation.js` | Individual rep allocation |

### Users & Permissions

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/employees` | `employees.js` | Employee hierarchy |
| `/api/territories` | `territories.js` | Territory management |
| `/api/permissions` | `permissions.js` | Permission CRUD |
| `/api/authorization` | `authorization.js` | Approval workflows |
| `/api/unified-users` | `unifiedUsers.js` | User-employee linking, org chart |
| `/api/notifications` | `notifications.js` | In-app notifications (SSE) |

### Analytics & AI

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/analytics` | `analytics.js` | Analytics & reporting |
| `/api/customer-dashboard` | `dashboards.js` | Customer & division dashboards |
| `/api/ai-learning` | `ai-learning.js` | AI learning system |
| `/api/report-ai` | `report-ai.js` | AI-powered reports |
| `/api/forecast-sales` | `forecastSales.js` | Sales forecasts |

### MES & Platform

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/mes/presales` | MES presales router | Pre-sales inquiry workflow |
| `/api/mes/flow` | `mes/flow.js` | Job flow tracking |
| `/api/platform` | `platform/index.js` | SaaS platform admin (3 sub-routes) |

### ERP & Sync

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/erp` | `erp.js` | Oracle ERP operations |
| `/api/oracle-direct` | `oracleDirectSync.js` | Direct Oracle sync |
| `/api/unified` | `unified.js` | Unified data sync & rebuild |
| `/api/rm-sync` | `rmSync.js` | Raw material sync |
| `/api/periods` | `erp-periods.js` | ERP period data |

### Infrastructure

| Prefix | Route File | Description |
|--------|-----------|-------------|
| `/api/setup` | `setup.js` | Initial system setup (no auth) |
| `/api/backup` | `backup.js` | Database backup |
| `/api/deployment` | `deployment.js` | VPS deployment via SSH |
| `/api/documentation` | `documentation.js` | Auto-generated system docs |
| `/api/export-pdf` | `exportPdf.js` | Server-side PDF (Puppeteer) |
| `/api/webhooks` | `webhooks.js` | Outlook webhook notifications |
| `/api/metrics` | `metrics.js` | Prometheus metrics |
| `/api/health` | `monitoring.js` | Health check (public) |

---

## 12. ENVIRONMENT VARIABLES

```env
# Server
NODE_ENV, PORT

# PostgreSQL (main)
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
DB_POOL_MAX, DB_POOL_IDLE_TIMEOUT, DB_POOL_CONNECTION_TIMEOUT

# Auth database
AUTH_DB_NAME, AUTH_DB_HOST, AUTH_DB_PORT, AUTH_DB_USER, AUTH_DB_PASSWORD

# Platform database
PLATFORM_DB_NAME

# Oracle ERP
ORACLE_HOST, ORACLE_PORT, ORACLE_SID, ORACLE_USER, ORACLE_PASSWORD
ORACLE_SYNC_USER, ORACLE_SYNC_PASSWORD, ORACLE_CONNECT_STRING

# JWT
JWT_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY

# Security
CORS_ORIGIN, SESSION_SECRET, SESSION_COOKIE_NAME, SESSION_MAX_AGE

# Uploads
MAX_UPLOAD_SIZE, MAX_FILE_SIZE, UPLOAD_DIR

# Logging
LOG_LEVEL

# VPS Deployment
VPS_HOST, VPS_SSH_PORT, VPS_SSH_USER, VPS_SSH_PASSWORD
VPS_APP_DIR, VPS_PUBLIC_HTML, VPS_SERVER_DIR, VPS_DB_USER, VPS_DB_PASSWORD

# VPN (for Oracle sync on VPS)
VPN_GATEWAY, VPN_PORT, VPN_USER, VPN_PASSWORD, VPN_TRUSTED_CERT

# Email (SMTP)
SMTP_DEV_MODE, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
QC_LAB_EMAIL, QC_MANAGER_EMAIL

# Google Maps
VITE_GOOGLE_MAPS_API_KEY

# GitHub
GITHUB_REPO_URL

# App
APP_URL, STARTUP_PROFILE
```

---

## 13. DEVELOPMENT WORKFLOW

### Start Development
```bash
START-SERVERS.cmd       # Recommended — starts both servers
# OR manually:
cd server && npm run dev     # Backend with nodemon auto-reload
npm start                    # Frontend Vite dev server
```

### Run Tests
```bash
# Frontend
npm test                     # Jest unit tests
npm run test:e2e             # Playwright E2E
npm run test:crm             # CRM lifecycle tests

# Backend
cd server && npm test        # Jest + Supertest
```

### Build for Production
```bash
npm run build                # Output → build/ folder
```

### Database Migrations

Migrations run automatically on server startup via `migrationRunner.js`. Order:
1. Auth DB migrations (user sessions)
2. CRM migrations (crm-001 through crm-017)
3. MES migrations (mes-presales-*, mes-qc-*, mes-flow-*)

### Code Patterns

**Frontend auth check:**
```jsx
import { useAuth } from '../contexts/AuthContext';
const { user, hasRole, hasPermission } = useAuth();
if (hasRole(['admin', 'manager'])) { /* admin view */ }
```

**Frontend API calls:**
```jsx
import axios from 'axios';
const API_BASE = '';  // Empty — Vite proxy handles /api
const headers = { Authorization: `Bearer ${localStorage.getItem('auth_token')}` };
const res = await axios.get(`${API_BASE}/api/crm/customers`, { headers });
```

**Backend route pattern:**
```js
const { authenticate, requireRole } = require('../../middleware/auth');
router.get('/endpoint', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  const userId = req.user.id;
  const { rows } = await pool.query('SELECT * FROM table WHERE user_id = $1', [userId]);
  res.json({ success: true, data: rows });
});
```

---

## 14. KNOWN ARCHITECTURAL PATTERNS

1. **JWT decode on frontend:** Several CRM components use `atob(token.split('.')[1])` inline instead of a shared `useCurrentUser()` hook — fragile, duplicated in `FieldVisitList`, `FieldVisitDetail`, `CustomerDetail`
2. **CRM dual-tier access:** Admin has unconditional full access; other manager roles (sales_manager, sales_coordinator, manager) see all data only if `designation_level >= 6`. Sales reps always see only their assigned customers. Enforced via `crmAccessControl.js` WHERE clause builder on backend and `hasFullAccess(user)` helper in `field-trips.js`.
3. **Static `message` from antd:** Some components import `message` directly from antd instead of using `App.useApp()` — bypasses antd App context config
4. **Google Maps:** Using `AdvancedMarkerElement` with plain `div` content; no `mapId` (removed to fix grey loading); `GMAP_LIBS = ['marker']`
5. **CRM ↔ MES bridge:** `dealSyncService.js` auto-syncs deal stages when MES inquiry stages change
6. **Outlook integration:** OAuth2 via `@azure/msal-node`, delta email sync via Microsoft Graph API, webhook subscriptions with polling fallback
7. **Oracle sync:** Direct Oracle connection via `oracledb` thick mode + VPN on VPS; fallback to Excel file import

---

## 15. FILE INDEX — KEY FILES BY TASK

### "I need to fix a CRM bug"
- Frontend: `src/components/CRM/` (73 files)
- Backend: `server/routes/crm/` (19 files)
- Services: `server/services/crmAccessControl.js`, `crmActivityLogger.js`, `crmNotificationService.js`, `crmService.js`, `crmCacheService.js`

### "I need to fix a dashboard/KPI issue"
- Frontend: `src/components/dashboard/` (65+ files)
- Contexts: `src/contexts/ExcelDataContext.jsx`, `FilterContext.jsx`, `SalesDataContext.jsx`
- Services: `server/database/ProductGroupDataService.js`, `CustomerInsightsService.js`, `GeographicDistributionService.js`, `ProductPerformanceService.js`

### "I need to fix budget/AEBF"
- Frontend: `src/components/MasterData/AEBF/` (8 files)
- Backend: `server/routes/aebf/` (12 files)
- Key tables: `fp_budget_unified`, `fp_sales_rep_group_budget_allocation`

### "I need to fix auth/permissions"
- Frontend: `src/contexts/AuthContext.jsx`, `src/utils/roleChecks.js`, `src/utils/roleConstants.js`
- Backend: `server/middleware/auth.js`, `server/services/authService.js`, `server/services/permissionService.js`

### "I need to fix MES/Pre-Sales"
- Frontend: `src/components/MES/PreSales/` (20+), `src/components/MES/QC/` (10)
- Backend: `server/routes/mes/` + pre-sales router
- Services: `server/services/presalesPdfService.js`, `dealSyncService.js`, `mesNotificationService.js`

### "I need to fix settings/config"
- Frontend: `src/components/settings/` (15 files)
- Backend: `server/routes/settings.js`, `server/routes/divisions.js`
- Database: `company_settings`, `company_divisions` (in `ip_auth_database`)

---

*End of PROJECT_CONTEXT.md — backup saved as `PROJECT_CONTEXT_backup_20260310.md`*