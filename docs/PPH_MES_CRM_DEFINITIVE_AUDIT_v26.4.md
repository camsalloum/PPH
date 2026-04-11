# PPH — MES & CRM DEFINITIVE AUDIT & PLAN
## Flexible Packaging · Industry 4.0 · v26.4
**Date:** April 2026 · **Based on:** Full code review of 2,059 files cloned from github.com/camsalloum/PPH  
**Tenant scope:** FP only — HC references must be cleaned throughout

---

## PART 1 — WHAT IS ACTUALLY BUILT (TRUE STATE)

Before listing problems, the system is significantly more complete than expected.

**Built and working:**
- Full 20-stage inquiry lifecycle: `sar_pending → qc_in_progress → qc_received → cse_pending → cse_approved → estimation → quoted → negotiating → price_accepted → preprod_sample → preprod_sent → sample_approved → pi_sent → order_confirmed → in_production → ready_dispatch → delivered → closed / lost`
- CRM↔MES auto-sync via `dealSyncService.js` — deal stage advances automatically when inquiry stage changes (transactional, within same DB client)
- CSE (Customer Sample Evaluation) reports with dual approval gates (QC manager + production manager)
- Job card creation and approval, auto-creates `mes_job_tracker` with 17-phase workflow on approval
- QC dashboard with batch receive, batch analysis, NCR management, equipment admin
- Estimation calculator with BOM auto-population from product group defaults
- Pipeline view with action-required flags, stagnant threshold alerts, `days_in_stage` counter
- Quotation PDF + Proforma Invoice PDF generation (Puppeteer-based)
- CoA PDF generation (client-side jsPDF, for incoming RM QC certificates)
- NCR full lifecycle (open → in_progress → resolved → verified → closed)
- Procurement dashboard with purchase requisition and supplier PO forms
- `mes_job_tracker` + `mes_job_phases` — 17-phase department handoff flow
- Unified deal+MES activity timeline in CRM
- SLA breach checker cron job
- `generate_inquiry_number()` and `generate_job_number()` DB-level sequence functions

---

## PART 2 — CONFIRMED BUGS (CODE-LEVEL, REAL)

### BUG-01 · `Space` not imported in `JobCardPanel.jsx` — RUNTIME CRASH
**File:** `src/components/MES/PreSales/JobCardPanel.jsx`  
**Line 5:** imports from antd: `Card, Button, Tag, Descriptions, Table, Timeline, Spin, Empty, App, Popconfirm`  
**Line 123:** uses `<Space>` — not imported → throws at runtime when a draft job card is displayed.

```jsx
// ❌ Current — crashes when draft job card renders
import { Card, Button, Tag, Descriptions, Table, Timeline, Spin, Empty, App, Popconfirm } from 'antd';

// ✅ Fix
import { Card, Button, Tag, Descriptions, Table, Space, Timeline, Spin, Empty, App, Popconfirm } from 'antd';
```

---

### BUG-02 · `EstimationCalculator.jsx` uses standalone `message` — violates AGENT.md rule
**File:** `src/components/MES/PreSales/EstimationCalculator.jsx`  
**Line 12:** `import { ... message ... } from 'antd'` — standalone hook, not `App.useApp()`.  
Used at lines 173, 255, 257, 406, 408, 429, 432.

```jsx
// ❌ Current
import { ..., message, ... } from 'antd';
// used as: message.error('...'), message.success('...')

// ✅ Fix — remove message from import, add App, use hook
import { ..., App, ... } from 'antd';
const { message } = App.useApp();
```

---

### BUG-03 · `GET /job-cards` ignores `inquiry_id` query param — returns all cards then filters client-side
**File:** `server/routes/mes/presales/jobCards.js` lines 121–160  
**File:** `src/components/MES/PreSales/JobCardPanel.jsx` line 34  

The frontend sends `?inquiry_id=X` but the route ignores this param — it only filters by `status`, `from`, `to`, and `sales_rep_group_id`. The component then does `.find(c => c.inquiry_id === inquiry.id)` client-side. For admins this returns every job card ever created, causing unnecessary data transfer and a potential data visibility issue.

```js
// ❌ Current route — no inquiry_id WHERE clause
router.get('/job-cards', authenticate, async (req, res) => {
  // ...
  let statusFilter = '';
  if (req.query.status) { ... }
  // inquiry_id never used
});

// ✅ Fix — add inquiry_id filter
if (req.query.inquiry_id) {
  const iid = parseInt(req.query.inquiry_id, 10);
  if (Number.isInteger(iid) && iid > 0) {
    params.push(iid);
    inquiryFilter = `AND jc.inquiry_id = $${idx++}`;
  }
}
```

---

### BUG-04 · `generateQuotationNumber` race condition — two concurrent requests can get the same number
**File:** `server/routes/mes/presales/_helpers.js` lines 90–108  

The function uses `SELECT last_value, is_called FROM quot_fp_seq` outside of an advisory lock. If two requests hit simultaneously with `is_called = false`, both attempt `setval` with the same value, then both call `nextval`, producing duplicate numbers. The `job number` generator has the same pattern.

```js
// ✅ Fix — wrap in advisory lock
async function generateQuotationNumber(client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext(\'quot_fp_seq\'))');
  // ... rest of existing logic — safe now because lock is held for transaction duration
}
```

---

### BUG-05 · `JobCardForm.jsx` BOM rows have no stable key — index anti-pattern
**File:** `src/components/MES/PreSales/JobCardForm.jsx`

```jsx
// ❌ Current — key from index causes React reconciliation bugs when rows reorder
const addBomRow = () => {
  setBomRows(prev => [...prev, { material_name: '', qty_required: 0 ... }]);
};
// Table: rowKey={(_, i) => i}

// ✅ Fix — assign a stable ID on creation
import { useRef } from 'react';
const rowIdRef = useRef(0);
const addBomRow = () => {
  setBomRows(prev => [...prev, { _id: ++rowIdRef.current, material_name: '', qty_required: 0, qty_available: 0, status: 'pending' }]);
};
// Table: rowKey={(r) => r._id}
```

---

### BUG-06 · `JobCardPanel.jsx` `rowKey` is index-based
**File:** `src/components/MES/PreSales/JobCardPanel.jsx` line ~90  
`<Table rowKey={(_, i) => i}` — same anti-pattern, violates D5.

```jsx
// ✅ Fix
<Table rowKey={(r, i) => r.material_name ? `${r.material_name}-${i}` : i} .../>
```

---

### BUG-07 · `MESErrorBoundary.componentDidCatch` uses `console.error` — violates D4
**File:** `src/components/MES/index.jsx`

```jsx
// ❌ Current
componentDidCatch(err) { console.error('MES module load error:', err); }

// ✅ Fix — remove console, use window error event or leave silent
// (browser devtools still catches it; console.error leaks stack to users via Sentry)
componentDidCatch(err, info) { /* intentionally silent — caught by Sentry via errorTracking.js */ }
```

---

### BUG-08 · `getSalesRepGroup` fuzzy first-name match can assign wrong group
**File:** `server/routes/mes/presales/_helpers.js` lines 52–71  

If the exact match fails, it falls back to `group_name ILIKE '%firstName%'`. A rep named "Salim" would match a group named "Salim & Partners" OR a group named "Salim Al-Rashid" — whichever comes first by `id`. This silently gives a rep access to wrong group's inquiries.

```js
// ✅ Fix — remove fuzzy fallback; fail explicitly, log the miss
if (groupResult.rows.length === 0) {
  logger.warn(`getSalesRepGroup: no group found for user ${userId}, name="${fullName}"`);
  return null; // do NOT fuzzy-match — fail safe
}
```

---

### BUG-09 · Estimation stored in `mes_quotations` — burns quotation sequence numbers on every Save
**File:** `server/routes/mes/presales/estimation.js` lines 106–138  

Every time an estimator clicks Save (even draft), it calls `generateQuotationNumber()` if no existing record, permanently consuming a `QUOT-FP-2026-XXXXX` number. Re-saving updates the same record but the first save burns a number even for a draft that never becomes a real quotation.

```js
// ✅ Fix — create a separate mes_estimations table or use a draft flag that
// only generates a quotation number when explicitly promoted via
// POST /estimations/:id/create-quotation (which already exists correctly)
// Short-term: on POST /estimations, insert with quotation_number = NULL
// Only set quotation_number when create-quotation endpoint is called
```

---

### BUG-10 · `mes_job_cards` has no `division` column — data isolation gap
**File:** `server/migrations/mes-presales-015-job-cards.js`

The table schema has no `division` column. All MES presales tables use `division = 'FP'` as a hard filter, but `mes_job_cards` is queried without it. If HC data ever existed (or a second FP tenant is added), job cards would be cross-contaminated.

```sql
-- Migration fix
ALTER TABLE mes_job_cards ADD COLUMN division VARCHAR(10) DEFAULT 'FP';
CREATE INDEX IF NOT EXISTS idx_jobcard_division ON mes_job_cards(division);
-- Update existing rows
UPDATE mes_job_cards SET division = 'FP' WHERE division IS NULL;
```

---

### BUG-11 · `InquiryBoard.jsx` kanban COLUMNS are workflow-status based, not lifecycle-stage based
**File:** `src/components/MES/PreSales/InquiryBoard.jsx` lines 34–40

The board has 5 columns (New, In Progress, Converted, Lost, On Hold) based on `inquiry.status`. But the real workflow lives in `inquiry.inquiry_stage` with 20 stages. The `stage_label` badge on each card shows the lifecycle stage correctly, but dropping a card between columns changes `status` not `inquiry_stage`. This means:
- Sales rep moves a card to "Converted" but the inquiry stays at `sar_pending` in the pipeline
- The pipeline and board are out of sync
- `status` and `inquiry_stage` have overlapping but different semantics with no documented relationship

**Fix:** The kanban board should either (a) be driven by `inquiry_stage` with grouped columns, or (b) status changes should trigger the correct stage transition through the pipeline route's `MANUAL_TRANSITIONS` map.

---

### BUG-12 · Two `CurrencySymbol` components — violates D3/D6 (duplicate logic)
**Files:**
- `src/components/common/CurrencySymbol.jsx` — standalone, accepts `code` prop, exports `CURRENCY_SYMBOLS` map
- `src/components/dashboard/CurrencySymbol.jsx` — uses `CurrencyContext`, no props

Both exist and are imported from different places. The `dashboard` version imports `CURRENCY_SYMBOLS` from the `common` version. This creates a circular-ish dependency and two different APIs for the same thing.

```
✅ Fix:
1. Move CURRENCY_SYMBOLS map to src/constants/currencyConstants.js
2. Keep src/components/common/CurrencySymbol.jsx as the single component
3. Delete src/components/dashboard/CurrencySymbol.jsx
4. Update all imports in dashboard/ components to point to common/
```

---

### BUG-13 · `key={i}` violations in MES components
Multiple places use index as React key:

| File | Line pattern |
|---|---|
| `BOMConfigurator.jsx:311` | `warnings.map((w, i) => <li key={i}>` |
| `SamplesSection.jsx:402` | `<div key={i} style=...>` |
| `WinLossAnalytics.jsx:146` | `<Cell key={i} fill=...>` |
| `WinLossAnalytics.jsx:153` | `<div key={i} style=...>` |
| `WorkflowLandingPage.jsx:612,637,652` | multiple `key={i}` |

**Fix:** Use stable values — `key={w}` for warning strings, `key={entry.name}` for chart cells, etc.

---

### BUG-14 · `EstimationCalculator.jsx` is 624 lines — exceeds 300-line hard limit
**File:** `src/components/MES/PreSales/EstimationCalculator.jsx`

Must split per AGENT.md rule: `EstimationCalculator.jsx` → orchestrator only.

**Proposed split:**
```
EstimationCalculator/
├── index.jsx               ← orchestrator, data loading, save handler (~150 lines)
├── EstimationHeader.jsx    ← product type, qty, unit, remarks
├── EstimationDimensions.jsx← reel width, cut-off, trim, ups
├── BOMVersionSelector.jsx  ← BOM version picker
└── hooks/
    └── useEstimation.js    ← all calculation logic (safeDivide, derived totals)
```

---

### BUG-15 · `InquiryBoard.jsx` is 576 lines — exceeds 300-line hard limit
**File:** `src/components/MES/PreSales/InquiryBoard.jsx`

**Proposed split:**
```
InquiryBoard/
├── index.jsx              ← orchestrator, data fetch, filter state (~150 lines)
├── InquiryCard.jsx        ← card component (already extracted as const, just move)
├── InquiryFilters.jsx     ← search, priority, status, rep group filters
└── CreateInquiryModal.jsx ← the new-inquiry quick modal (currently inline)
```

---

## PART 3 — HC CLEANUP (All references to remove)

HC is a dead tenant. These files contain `'HC'` references that must be cleaned:

| File | Issue | Fix |
|---|---|---|
| `server/routes/mes/qc-certificates.js` | `VALID_DIVISIONS = ['FP', 'HC']` | Change to `['FP']` |
| `server/routes/mes/qc-incoming-rm.js` | `VALID_DIVISIONS = ['FP', 'HC']` | Change to `['FP']` |
| `server/routes/rmSync.js` | `WHEN ... = 'HC' THEN 'HC'` in CASE | Remove HC branch |
| `server/routes/sales-rep-group-allocation.js` | `divisionCode === 'HC' ? 'Hard Containers'` (×2) | Remove ternary, use `divisionCode` directly |
| `server/routes/aebf/*.js` | Multiple HC checks | Audit and remove |
| `server/routes/masterData.js` | HC references | Audit and remove |

**Note:** Do NOT delete migration data or historical DB rows. Only remove HC from active code logic, validation arrays, and display labels. Add a comment: `// HC division retired — FP only`.

---

## PART 4 — UI/UX ENHANCEMENT PLAN

### 4.1 InquiryBoard — Lifecycle-aware Kanban

**Current problem:** 5 columns based on `status` field don't reflect the 20-stage lifecycle. Sales reps cannot see where in the actual workflow their inquiry is.

**Enhancement:**
```
Option A (recommended): Replace 5-column kanban with grouped pipeline view
  Column Group 1: PRE-QC       → [ sar_pending, qc_in_progress, qc_received ]
  Column Group 2: CSE          → [ cse_pending, cse_approved ]
  Column Group 3: COMMERCIAL   → [ estimation, quoted, negotiating, price_accepted ]
  Column Group 4: PRE-PROD     → [ preprod_sample, preprod_sent, sample_approved ]
  Column Group 5: ORDER        → [ pi_sent, order_confirmed ]
  Column Group 6: PRODUCTION   → [ in_production, ready_dispatch ]
  Column Group 7: DONE         → [ delivered, closed, lost ]

Card click still opens InquiryDetail. No drag-drop status change (too risky given
the validated MANUAL_TRANSITIONS state machine — moves must go through pipeline route).
Replace drag-drop with a "Move Stage" button on card that uses allowed transitions.
```

### 4.2 InquiryDetail — Phase Stepper Enhancement

**Current state:** `LIFECYCLE_PHASES` has 9 phase groups. `PhaseStepperCard` shows current phase.

**Enhancement:**
- Show `days_in_stage` counter next to current phase (already available from pipeline query)
- Show action-required callout (orange banner) when `inquiry_stage` is in `ACTION_STAGES`
- Show which team member's court the ball is in (based on stage: QC, Sales, Production, Management)

### 4.3 Job Card Panel — Parameter Comparison View

**Current state:** Job card shows BOM table and basic details. No parameter tracking.

**Enhancement — target vs. actual parameters panel:**
```jsx
// Add to JobCardPanel when status = 'approved' or 'in_production'
<Table
  columns={[
    { title: 'Parameter', dataIndex: 'label' },
    { title: 'Target', dataIndex: 'target' },
    { title: 'Actual', dataIndex: 'actual' },
    { title: 'Status', render: (_, r) => {
      const deviation = Math.abs((r.actual - r.target) / r.target * 100);
      if (!r.actual) return <Tag>Not set</Tag>;
      if (deviation > 20) return <Tag color="red">⚠ {deviation.toFixed(0)}% off</Tag>;
      if (deviation > 10) return <Tag color="orange">{deviation.toFixed(0)}% off</Tag>;
      return <Tag color="green">OK</Tag>;
    }}
  ]}
/>
```

Params to track: melt temp, BUR, die gap, output rate, line speed, freeze line distance (from Film Extrusion KB).

### 4.4 Estimation Calculator — BOM Version Auto-Load UX

**Current state:** BOM versions dropdown exists but requires manual selection.

**Enhancement:**
- When inquiry has a product_group_id and active BOM exists, auto-select it silently on load
- Show a blue info banner: "BOM v{N} loaded from master data. Last updated {date}."
- Add a "Lock estimate" button that prevents further changes once quotation is sent

### 4.5 QC Dashboard — SPC Chart per Product (Quick Win)

**Current state:** QC dashboard shows pending/in-progress/completed lists. No trend view.

**Enhancement:** Add a "Trends" tab with Recharts LineChart:
- X-axis: last 20 batches
- Y-axis: result value for selected parameter
- Reference lines at spec_min and spec_max
- Color: green when in spec, red dots when out

Data source: `mes_qc_analyses.test_parameters` JSONB — already stored, just not displayed.

### 4.6 Pipeline View — Action-Required Counter in Header

**Current state:** `MyPipeline.jsx` shows a list of inquiries grouped by stage.

**Enhancement:**
- Add a KPI bar at top: `Needs Action: N` | `Stagnant: N` | `High Priority: N` | `Total Active: N`
- Already calculated server-side in `/pipeline/stats` — just needs to be displayed
- Each KPI is a clickable filter

### 4.7 CRM Deal Detail — MES Status Chip

**Current state:** Deal card shows CRM stage (Won/Lost/Negotiation).

**Enhancement:** When `deal.inquiry_id` is set, show a secondary chip:
```jsx
{deal.inquiry_id && deal.inquiry_stage && (
  <Tag color={STAGE_LABELS[deal.inquiry_stage]?.color}>
    MES: {STAGE_LABELS[deal.inquiry_stage]?.label}
  </Tag>
)}
```
Already available — `inquiry_stage` is already joined in the GET /deals query.

### 4.8 WorkflowLandingPage — Simplify Navigation

**Current state:** 600+ line component with detailed module descriptions per department. Useful once but becomes noise for daily users.

**Enhancement:**
- Add a "compact mode" toggle in user preferences (save to `auth_preferences`)
- Compact mode: grid of department tiles with notification badge count only
- Full mode: current detailed view (keep for onboarding)

### 4.9 Empty States — Add Throughout MES

Every MES list/panel that can be empty should have a contextual empty state with a CTA.

| Component | Empty State Message | CTA |
|---|---|---|
| JobCardPanel (no card, wrong stage) | "Job card can only be created after Order is Confirmed" | — |
| SamplesSection (no samples) | "No samples registered yet" | + Register Sample |
| NCRManagement (no NCRs) | "No non-conformances — all good!" | — |
| ProcurementDashboard (no POs) | "No purchase orders created yet" | + Create PR |
| EstimationQueue (no items) | "No inquiries awaiting estimation" | — |

### 4.10 Loading States — Skeleton instead of Spin

Replace `<Spin size="large" />` with `<Skeleton active />` in:
- `InquiryDetail/index.jsx` — currently shows a full spinner on load
- `JobCardPanel.jsx` — blank card during load
- `QCDashboard.jsx` — 4 stats cards are blank on initial load

---

## PART 5 — MISSING FEATURES (Priority-Ordered)

### P1 — Actual Production Parameters on Job Card
**What's missing:** `mes_job_cards` has `product_specs` (JSONB) but no structured fields for production parameters. Operators cannot log actual BUR, melt temp, output rate against a job.

**Implementation:**
```sql
-- Migration
ALTER TABLE mes_job_cards ADD COLUMN target_parameters JSONB;
ALTER TABLE mes_job_cards ADD COLUMN actual_parameters JSONB;
ALTER TABLE mes_job_cards ADD COLUMN parameter_logged_by INTEGER;
ALTER TABLE mes_job_cards ADD COLUMN parameter_logged_at TIMESTAMPTZ;
```
```jsx
// New component: src/components/MES/PreSales/JobCardParameters.jsx
// Two-column table: Parameter | Target | Actual (editable) | Deviation %
// Pre-populated from Film Extrusion KB defaults for the product type
// PATCH /job-cards/:id with { actual_parameters: {...} }
```

### P2 — Finished Goods Register + Dispatch
**What's missing:** When a job card moves to `in_production` → `ready_dispatch`, there's no finished goods record and no delivery note generation.

**New tables needed:**
```sql
CREATE TABLE mes_finished_goods (
  id SERIAL PRIMARY KEY,
  fg_number VARCHAR(30) UNIQUE NOT NULL,   -- FG-FP-2026-00001
  job_card_id INTEGER REFERENCES mes_job_cards(id),
  inquiry_id INTEGER REFERENCES mes_presales_inquiries(id),
  customer_id INTEGER,
  customer_name VARCHAR(255),
  batch_number VARCHAR(50),
  qty_produced_kg NUMERIC(14,2),
  qty_rolls INTEGER,
  warehouse_location VARCHAR(100),
  qc_status VARCHAR(30) DEFAULT 'pending_qc',
  released_by INTEGER,
  released_at TIMESTAMPTZ,
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mes_delivery_notes (
  id SERIAL PRIMARY KEY,
  dn_number VARCHAR(30) UNIQUE NOT NULL,   -- DN-FP-2026-00001
  fg_id INTEGER REFERENCES mes_finished_goods(id),
  inquiry_id INTEGER,
  customer_id INTEGER NOT NULL,
  customer_name VARCHAR(255),
  despatch_date DATE,
  driver_name VARCHAR(100),
  vehicle_plate VARCHAR(30),
  status VARCHAR(20) DEFAULT 'draft',
  pdf_generated BOOLEAN DEFAULT FALSE,
  created_by INTEGER,
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Gate rule:** `mes_delivery_notes` cannot be created unless `mes_finished_goods.qc_status = 'released'`.

### P3 — Film Extrusion Optimization UI (KB already built)
**What's missing:** The KB (`film_extrusion_optimization_kb.md`) exists. No UI. No API.

**Implementation path:**
```
New route: server/routes/mes/master-data/film-optimizer.js
  POST /film-optimizer/optimize
  Body: { resins: [{type, mfi, density, blend_pct}], extruder: {...}, target_product: string }
  Returns: { scores, violations, recommendations, computed_params }

New components:
  src/components/MES/MasterData/FilmOptimizer/
  ├── FilmOptimizerMain.jsx     ← entry point, tabs
  ├── ResinBlendInput.jsx       ← add/remove resins, set blend %
  ├── ExtruderConfigInput.jsx   ← die gap, BUR, output rate, etc.
  ├── ProductProfileSelect.jsx  ← choose from 9 target profiles
  ├── OptimizationResult.jsx    ← scores radar chart + violations + recommendations
  └── useFilmOptimizer.js       ← KB rule engine (pure JS, no API needed initially)
```

The KB rules are deterministic IF/THEN logic — run them client-side first (no API call needed). API version comes when you want to log optimization history to DB.

### P4 — In-Process QC Checks on Job Card
**What's missing:** Operators need to log periodic checks during a production run.

```sql
ALTER TABLE mes_job_cards ADD COLUMN inprocess_checks JSONB DEFAULT '[]';
-- Each check: { timestamp, operator, thickness_um, width_mm, notes, pass_fail }
```
```jsx
// Inline quick-check form in JobCardPanel (only visible when status = 'approved')
// "Log Check" button → small form: thickness, width, any anomaly
// Results append to inprocess_checks array
// Table shows last 10 checks with pass/fail colours
```

### P5 — Customer PO → Proforma Invoice link validation
**What's missing:** A customer PO can be created on any inquiry regardless of stage. Should only be possible at `price_accepted` or later.

```js
// server/routes/mes/presales/customerPO.js
// Add stage guard:
if (!['price_accepted', 'sample_approved', 'pi_sent', 'order_confirmed'].includes(inq.inquiry_stage)) {
  return res.status(400).json({ success: false, error: 'Customer PO can only be added after price is accepted' });
}
```

---

## PART 6 — BACKEND QUALITY ISSUES

### Q1 — VALID_DIVISIONS must be simplified across all MES routes
Every MES route that validates division must change from `['FP', 'HC']` to `['FP']`.

**Affected files (confirmed via grep):**
- `server/routes/mes/qc-certificates.js`
- `server/routes/mes/qc-incoming-rm.js`
- Any other file with `VALID_DIVISIONS` including HC

**Fix pattern:**
```js
// Create a shared constant in server/database/config.js or a new constants file
const VALID_DIVISIONS = Object.freeze(['FP']); // HC retired
// Then import and use everywhere
```

### Q2 — `mes_job_tracker` division-less query in flow route
**File:** `server/routes/mes/flow.js`  
The flow tracker queries `mes_job_tracker` without a division filter. Add `WHERE division = 'FP'`.

### Q3 — TD-001 still open: SQL injection in `universal.js` and `divisionMergeRules.js`
These are critical-severity items from the existing tech debt. Must fix before any new feature work. Pattern: `req.params.division` interpolated directly into SQL.

```js
// ✅ Pattern to apply immediately
const VALID_DIVISIONS = ['FP'];
const div = req.params.division?.toUpperCase();
if (!VALID_DIVISIONS.includes(div)) {
  return res.status(400).json({ error: 'Invalid division' });
}
```

### Q4 — TD-002 still open: `server/config/database.js` must be deleted
Confirmed this file still exists. Any developer touching a new route might accidentally import it. Delete it. Add a comment in `server/database/config.js`: `// This is the ONLY database config file. server/config/database.js has been removed.`

### Q5 — `requireRole` middleware not used in MES routes
All MES routes use `authenticate` + inline role check (`if (!canCreateJobCard(req.user)) return 403`). This is functional but inconsistent with the documented pattern and makes route-level security audit harder.

The inline checks are correct — this is not a security bug. But for consistency, either:
- Document that MES intentionally uses inline checks (add a comment in `_helpers.js`), OR
- Wrap the helper functions as middleware factories: `requireCanCreateJobCard = (req, res, next) => { if (!canCreateJobCard(req.user)) return res.status(403)...; next(); }`

---

## PART 7 — PRIORITY IMPLEMENTATION ORDER

This is the sequence to give to your agent. Each item is self-contained.

### 🔴 IMMEDIATE — Bugs that cause crashes or data issues (do first, in one session)

| # | Task | Files | Effort |
|---|---|---|---|
| I-01 | Fix Space import in JobCardPanel | `JobCardPanel.jsx` L5 | 1 min |
| I-02 | Fix EstimationCalculator message → App.useApp() | `EstimationCalculator.jsx` L12 + 7 usage sites | 10 min |
| I-03 | Add inquiry_id filter to GET /job-cards route | `jobCards.js` | 15 min |
| I-04 | Fix advisory lock on generateQuotationNumber | `_helpers.js` | 20 min |
| I-05 | Fix BOM row keys in JobCardForm | `JobCardForm.jsx` | 10 min |
| I-06 | Remove fuzzy getSalesRepGroup fallback | `_helpers.js` | 10 min |
| I-07 | Remove HC from VALID_DIVISIONS across all MES routes | `qc-certificates.js`, `qc-incoming-rm.js` | 10 min |
| I-08 | Remove HC from sales-rep-group-allocation.js, rmSync.js | 2 files | 10 min |
| I-09 | Fix TD-001: SQL injection in universal.js, divisionMergeRules.js | 2 files | 20 min |
| I-10 | Delete server/config/database.js (TD-002) | 1 file | 5 min |

---

### 🟠 SHORT-TERM — Quality and UX (next 2–3 sessions)

| # | Task | Files | Notes |
|---|---|---|---|
| S-01 | Split EstimationCalculator.jsx into sub-components | New folder | 624→5 files, stay under 300 lines each |
| S-02 | Split InquiryBoard.jsx into sub-components | New folder | 576→4 files |
| S-03 | Fix key={index} violations across MES | 5 files | D5 compliance |
| S-04 | Consolidate CurrencySymbol to one component | common/CurrencySymbol, constants file | D3/D6 |
| S-05 | Add division column to mes_job_cards + migration | Migration + route | Data isolation |
| S-06 | Add empty states to all MES panels | 6 components | UX polish |
| S-07 | Replace Spin with Skeleton in InquiryDetail, JobCardPanel, QCDashboard | 3 files | UX polish |
| S-08 | Add inquiry_id stage guard to customerPO route | `customerPO.js` | Business rule |
| S-09 | Show MES stage chip on CRM deal cards | `DealCard.jsx` or `DealPipeline.jsx` | 2 hours |
| S-10 | Add action-required KPI bar to MyPipeline | `MyPipeline.jsx` | 1 hour |

---

### 🟡 MEDIUM-TERM — New Features (4–8 sessions)

| # | Task | Key Files | Notes |
|---|---|---|---|
| M-01 | Production parameters fields on job card (target + actual + deviation) | Migration + `JobCardPanel.jsx` + `JobCardParameters.jsx` (new) | Core I4.0 feature |
| M-02 | InquiryBoard lifecycle-grouped columns (replace 5-column kanban) | `InquiryBoard/index.jsx` | Rethink kanban UX |
| M-03 | In-process QC checks on job card | Migration + `InProcessQC.jsx` (new) | I4.0 traceability |
| M-04 | Finished Goods register | Migration + `FinishedGoods.jsx` + route | Missing module |
| M-05 | Delivery Note generation | Migration + `DeliveryNote.jsx` + route + PDF | Missing module |
| M-06 | SPC trend chart in QC Dashboard | `QCDashboard.jsx` new tab | Quality analytics |
| M-07 | Fix estimation versioning (no quotation number burn on draft save) | Migration + `estimation.js` | Data integrity |

---

### 🟢 FUTURE — I4.0 Intelligence Layer (after M series)

| # | Task |
|---|---|
| F-01 | Film Extrusion Optimizer UI (KB already built — needs UI + API wrapper) |
| F-02 | OEE calculation from job card actuals (Availability × Performance × Quality) |
| F-03 | Waste trend analytics per machine / product |
| F-04 | Estimation accuracy tracker (estimated cost vs. actual cost from actuals tab) |
| F-05 | Supplier lot traceability (link raw material lot numbers to finished goods batch) |

---

## PART 8 — AGENT INSTRUCTIONS (Standard Bootstrap for This Plan)

```
BOOTSTRAP

1. Read AGENT.md completely.
2. Read docs/PROJECT_CONTEXT.md completely.
3. Read last 5 rows of docs/SESSION_LOG.md.
4. Read docs/TECH_DEBT.md completely.
5. Confirm: tenant is FP only. HC is retired.

Then confirm:
- Bullet 1: Current project state
- Bullet 2: What was last worked on
- Bullet 3: Today's task from the plan (specify which item: I-01 through F-05)

Do NOT write any code until approved.

TODAY'S TASK: [paste the task ID and description from Part 7]

After completing:
- Append row to docs/SESSION_LOG.md
- Update docs/TECH_DEBT.md if anything changed
- Update docs/API_CONTRACTS.md if new endpoints added
```

---

## APPENDIX — CONFIRMED FILE LOCATIONS FOR ALL ISSUES

| Bug/Task | File(s) | Line(s) |
|---|---|---|
| BUG-01 Space import | `src/components/MES/PreSales/JobCardPanel.jsx` | L5, L123 |
| BUG-02 message standalone | `src/components/MES/PreSales/EstimationCalculator.jsx` | L12, L173, L255, L257, L406, L408, L429, L432 |
| BUG-03 no inquiry_id filter | `server/routes/mes/presales/jobCards.js` | L121–160 |
| BUG-03 client-side filter | `src/components/MES/PreSales/JobCardPanel.jsx` | L34 |
| BUG-04 race condition | `server/routes/mes/presales/_helpers.js` | L90–108 |
| BUG-05/06 key=index | `src/components/MES/PreSales/JobCardForm.jsx`, `JobCardPanel.jsx` | — |
| BUG-07 console.error | `src/components/MES/index.jsx` | componentDidCatch |
| BUG-08 fuzzy match | `server/routes/mes/presales/_helpers.js` | L52–71 |
| BUG-09 estimation burns quotnum | `server/routes/mes/presales/estimation.js` | L106–138 |
| BUG-10 no division on job cards | `server/migrations/mes-presales-015-job-cards.js` | Schema |
| BUG-11 kanban vs lifecycle | `src/components/MES/PreSales/InquiryBoard.jsx` | L34–40 |
| BUG-12 duplicate CurrencySymbol | `src/components/common/CurrencySymbol.jsx`, `src/components/dashboard/CurrencySymbol.jsx` | — |
| BUG-13 key={i} | BOMConfigurator L311, SamplesSection L402, WinLossAnalytics L146/153, WorkflowLandingPage L612/637/652 | — |
| BUG-14 file too long | `src/components/MES/PreSales/EstimationCalculator.jsx` | 624 lines |
| BUG-15 file too long | `src/components/MES/PreSales/InquiryBoard.jsx` | 576 lines |
| HC cleanup | `server/routes/mes/qc-certificates.js`, `qc-incoming-rm.js`, `rmSync.js`, `sales-rep-group-allocation.js` | VALID_DIVISIONS |
| TD-001 SQL injection | `server/routes/universal.js`, `server/routes/divisionMergeRules.js` | Unvalidated division |
| TD-002 wrong DB config | `server/config/database.js` | Delete file |

---

*End of Audit — v26.4 · FP Tenant Only · Based on full codebase review April 2026*
