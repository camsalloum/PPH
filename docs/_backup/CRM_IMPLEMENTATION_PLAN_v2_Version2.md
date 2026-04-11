# CRM Module — Consolidated Implementation Plan v2

> **Merged from:** Code Review (2026-03-02) + Deep Analytical Review (March 2026) + Peer Review Corrections
> **Verified against codebase:** commit `475fe5c` on `main`
> **Total estimated effort:** 4–5 weeks

---

## How to Read This Plan

- **Phase 0** = Critical bugs — ship today
- **Phase 1** = Quick wins — 1 week, high daily impact, no backend changes
- **Phase 2** = Code health — clean up tech debt, enable future phases
- **Phase 3** = Core flow rebuild — the sales rep experience transformation
- **Phase 4** = FP industry enhancements — complete the product-market fit

Every item includes: **file(s)**, **what to do**, **effort estimate**, and **verification criteria**.

---

## Phase 0 — Critical Bugs (Day 1)

### P0-1: Missing `$` Prefix on Parameterised Placeholders (WRONG DATA BUG)

**Severity:** 🔴 CRITICAL — returns wrong customer data for most sales rep users
**Files:** `server/routes/crm/index.js`

> **Note:** This is NOT a SQL injection — `${paramIndex}` evaluates to the counter number (1, 2, 3...), not user input. The query becomes `sales_rep_group_id = 1` instead of `sales_rep_group_id = $1`. For a rep whose group ID happens to equal the counter position, the query accidentally works. For everyone else, it silently returns the **wrong rep group's customers** — or no customers at all. This is worse than a crash because it looks like it works.

**Affected locations (confirmed):**

| Endpoint | Lines | Pattern |
|---|---|---|
| `GET /customers` (rep scope) | ~392–398 | `sales_rep_group_id = ${paramIndex}` |
| `GET /my-customers` (rep scope) | ~729–738 | Same pattern |
| `GET /my-customers/map` | ~1655–1661 | Same pattern |

> ⚠️ Do a **global search** for `= ${paramIndex}` (without the `$` prefix) across the entire file to catch all instances. [Search in GitHub UI](https://github.com/search?q=repo%3Acamsalloum%2FPPH-26.2+%22%3D+%24%7BparamIndex%7D%22+path%3Aserver%2Froutes%2Fcrm&type=code)

**Before:**
```js
whereConditions.push(
  `(cu.sales_rep_group_id = ${paramIndex} OR ...)`
);
```

**After:**
```js
whereConditions.push(
  `(cu.sales_rep_group_id = $${paramIndex} OR ...)`
);
```

**Effort:** 15 minutes
**Verify:** Login as a sales rep user whose group_id ≠ 1 → navigate to My Customers → confirm they see their own customers, not group 1's.

---

### P0-2: `salesRep` is Undefined in `/my-customers` Logger

**Severity:** 🔴 RUNTIME BUG — throws ReferenceError on every my-customers request
**File:** `server/routes/crm/index.js` (line ~1592)

After the refactored `/my-customers` endpoint queries customers using `repInfo`, the logger line still references the old variable name:

```js
logger.info(`CRM: Found ${customersResult.rows.length} customers for ${salesRep.full_name}`);
```

`salesRep` is not in scope — the variable is `repInfo` (set earlier via `resolveRepGroup()`). This throws a `ReferenceError`. Node's express error handler catches it and the request may still succeed (the `res.json()` on line ~1603 is reached because the logger call is not in the response path), but the log line always fails, masking diagnostics.

**Fix:**
```js
logger.info(`CRM: Found ${customersResult.rows.length} customers for ${repInfo.fullName}`);
```

**Effort:** 5 seconds
**Verify:** Open My Customers as a sales rep → check server logs → line logs correctly without error.

---

### P0-3: `resolveRepGroup()` Uses Fuzzy Name Matching

**Severity:** 🔴 HIGH — wrong group = wrong data for the entire session
**Files:** `server/routes/crm/index.js` (lines ~96–114)

The shared `resolveRepGroup()` helper matches `ILIKE '%firstName%'` against `sales_rep_groups.group_name`. A rep named "John Smith" could match "Johnson Group". This was flagged in the Pre-Sales audit (ISS-07) and remains unfixed.

**Current code:**
```js
const grpRes = await pool.query(
  `SELECT id, group_name FROM sales_rep_groups
   WHERE division = 'FP' AND group_name ILIKE $1
   ORDER BY id LIMIT 1`,
  [`%${firstName}%`]
);
```

**Fix — 3-Step Rollout:**

| Step | What | When | Effort |
|---|---|---|---|
| **Step 1** | `ALTER TABLE crm_sales_reps ADD COLUMN IF NOT EXISTS sales_rep_group_id INTEGER;` | Day 1 deploy | 5 min |
| **Step 2** | Admin screen OR one-time script to populate `sales_rep_group_id` for all existing reps | Day 1, immediately after Step 1 | 30 min |
| **Step 3** | Update `resolveRepGroup()` to read direct mapping first, fuzzy fallback only if NULL | Day 1, after Step 2 verified | 30 min |

> ⚠️ **Critical:** If you deploy Step 1 + Step 3 without Step 2, the column is NULL for all reps and the new direct mapping never fires — everyone falls back to fuzzy, making the fix inert. Steps 2 and 3 must be deployed together.

**One-time population script (Step 2):**
```sql
-- Run manually for each rep, or build a quick admin API endpoint
-- Example: "Ahmed" → group ID 3
UPDATE crm_sales_reps SET sales_rep_group_id = 3 WHERE user_id = 12;
UPDATE crm_sales_reps SET sales_rep_group_id = 5 WHERE user_id = 15;
-- ... for each of the ~6 active reps
```

**Updated resolveRepGroup() (Step 3):**
```js
async function resolveRepGroup(userId) {
  const repRes = await authPool.query(
    `SELECT full_name, group_members, type, sales_rep_group_id
     FROM crm_sales_reps WHERE user_id = $1`,
    [userId]
  );
  if (repRes.rows.length === 0) return null;
  const rep = repRes.rows[0];
  const firstName = rep.full_name.split(' ')[0];

  // Step 3a: Direct mapping first (no fuzzy)
  if (rep.sales_rep_group_id) {
    const grpRes = await pool.query(
      `SELECT id, group_name FROM sales_rep_groups WHERE id = $1`,
      [rep.sales_rep_group_id]
    );
    if (grpRes.rows.length) {
      return {
        fullName: rep.full_name, firstName,
        type: rep.type, groupMembers: rep.group_members,
        groupId: grpRes.rows[0].id, groupName: grpRes.rows[0].group_name,
      };
    }
  }

  // Step 3b: Fuzzy fallback — REMOVE once all reps have sales_rep_group_id populated
  const grpRes = await pool.query(
    `SELECT id, group_name FROM sales_rep_groups
     WHERE division = 'FP' AND group_name ILIKE $1
     ORDER BY id LIMIT 1`,
    [`%${firstName}%`]
  );
  return {
    fullName: rep.full_name, firstName,
    type: rep.type, groupMembers: rep.group_members,
    groupId: grpRes.rows[0]?.id ?? null,
    groupName: grpRes.rows[0]?.group_name ?? rep.full_name,
  };
}
```

**Effort:** 2 hours total (all 3 steps)
**Verify:** Confirm each rep's dashboard loads their correct group data. Check reps whose first names are substrings of other group names. Verify `sales_rep_group_id` is non-NULL for all active reps before removing fuzzy fallback.

---

### P0-4: Remove MoRM from Sales Rep Dashboard

**Severity:** 🟠 HIGH — data privacy / commercial risk
**File:** `src/components/CRM/CRMDashboard.jsx` (line ~237)

MoRM % (Margin over Raw Material) is shown to users with `designation_level >= 6`. In FP manufacturing, margin data is commercially sensitive — reps may inadvertently signal to customers that margins are comfortable.

```js
const canSeeMorm = useMemo(() => (user?.designation_level ?? 99) >= 6, [user?.designation_level]);
```

**Fix — remove from rep dashboard; keep in admin dashboard only:**
```js
const canSeeMorm = false; // MoRM removed from rep dashboard — visible only in AdminCRMDashboard
```

**Effort:** 5 minutes
**Verify:** Login as sales rep with level 6 → confirm MoRM card no longer appears.

---

## Phase 1 — Quick Wins (Week 1)

### P1-1: Reduce Sales Rep Navigation from 7 Tabs to 4

**File:** `src/components/CRM/CRMModule.jsx` (lines ~206–280)

**Current sales rep tabs (7):**
`Overview` | `My Report` | `Pre-Sales` | `Budget` | `My Customers` | `My Prospects` | `My Map`

**Proposed tabs (4):**

| # | Tab | Content | Notes |
|---|-----|---------|-------|
| 1 | **My Day** | Action center (Phase 3 build) — temporarily alias to Overview | Rename now, rebuild content in Phase 3 |
| 2 | **My Customers** | Customer list + map toggle inside | Move Map from top-level tab into a toggle/button within MyCustomers |
| 3 | **My Prospects** | Keep as-is | No change |
| 4 | **Performance** | My Report + Budget combined | Two sub-tabs within one view |

**What to remove as top-level tabs:**
- `Pre-Sales` → Move into CustomerDetail (see P3-3)
- `My Map` → Toggle button inside My Customers
- Merge `My Report` + `Budget` → Single "Performance" tab

**Effort:** 30 minutes (tab config change) + 2 hours (map toggle integration)
**Verify:** Sales rep login → only 4 tabs visible. Map accessible from My Customers. Pre-Sales accessible from CustomerDetail.

---

### P1-2: Rename Deal Pipeline Stages to FP-Appropriate Language

**Files:**
- `src/components/CRM/DealPipeline.jsx` (STAGES constant, line ~18)
- `src/components/CRM/DealCard.jsx` (STAGE_COLOR map)
- `src/components/CRM/PipelineSummaryCard.jsx` (STAGE_CONFIG)

**Current stages:** `qualified → proposal → negotiation → won → lost`

> **Note:** This rename is a short-term fix. The long-term plan (Phase 4) is to merge Deals into the Pre-Sales Inquiry lifecycle entirely. For now, just relabel the UI — no migration needed, DB values stay unchanged.

**Short-term — relabel the UI only:**
```js
const STAGES = [
  { value: 'qualified',   label: 'Interest',          color: '#1890ff' },
  { value: 'proposal',    label: 'Technical Brief',   color: '#722ed1' },
  { value: 'negotiation', label: 'Quoted',             color: '#fa8c16' },
  { value: 'won',         label: 'PO Confirmed',      color: '#52c41a' },
  { value: 'lost',        label: 'Lost',               color: '#ff4d4f' },
];
```

**Effort:** 30 minutes
**Verify:** Open any customer's Deal Pipeline → stages show FP-appropriate labels.

---

### P1-3: Fix QuickLogFAB Customer Pre-Selection

**File:** `src/components/CRM/QuickLogFAB.jsx` + dashboard integration

When the QuickLogFAB is used from the Overview dashboard (no `defaultCustomerId`), it creates orphaned activities not linked to any customer.

**Fix:** When `defaultCustomerId` is not provided, make customer selection **required** in the FAB modal before saving. Add a customer search/select field that appears only when no customer context exists.

**Effort:** 2 hours
**Verify:** Click FAB from dashboard → customer field is required. Click FAB from CustomerDetail → customer is pre-filled.

---

### P1-4: Expand RiskAlertPanel by Default

**File:** `src/components/CRM/CRMDashboard.jsx` (line ~782) + `AdminCRMDashboard.jsx` (line ~819)

The Pipeline & Alerts panel is inside a `<Collapse defaultActiveKey={[]}>` — collapsed and invisible by default. As a quick win until Phase 3 rebuilds the dashboard:

```js
// Current:
defaultActiveKey={[]}

// Fix:
defaultActiveKey={['pipeline-alerts']}
```

**Effort:** 1 minute (one line in each dashboard file)
**Verify:** Load dashboard → Pipeline & Alerts section is visible without clicking.

---

## Phase 2 — Code Health & Tech Debt (Week 2)

### P2-1: Dashboard Deduplication (~80% Identical Code)

**Files:** `src/components/CRM/AdminCRMDashboard.jsx` (999 lines) + `CRMDashboard.jsx` (952 lines)

~80% of code is copy-pasted. The actual differences:

| Feature | Admin | Rep |
|---|---|---|
| Group selector dropdown | ✅ | ❌ (locked to own) |
| Rep Groups mini-list | ✅ | ❌ |
| Conversion rate card | ✅ | ❌ |
| Volume KPI card layout | Different | Separate card |
| DailyActivitySummary | ❌ | ✅ |
| QuickLogFAB | ❌ | ✅ |
| API endpoint | `/dashboard/stats` | `/my-stats` |

**Approach:** Extract a single `<SalesCockpit>` component:

```jsx
<SalesCockpit
  isAdmin={boolean}
  lockedGroupId={string|null}
  apiEndpoint={string}
  showGroupSelector={boolean}
  showDailyActivity={boolean}
  showQuickLog={boolean}
  showRepGroups={boolean}
  showConversionRate={boolean}
  selectedSalesRep={string|null}     // controlled externally for admin
  onSalesRepChange={function|null}   // admin group selector callback
/>
```

The admin wrapper owns the group selector state and passes it down. The 20% difference is handled via conditional rendering. Saves ~40KB of duplicated code.

**Effort:** 2–3 hours
**Verify:** Both admin and rep dashboards render identically to before. No visual regression.

---

### P2-2: Remove Wasted API Call (`recentActivities`)

**Files:** Both dashboards → after dedup, just `SalesCockpit`

Both dashboards fetch `GET /api/crm/recent-activities` and store in `recentActivities` state (line 55 in CRMDashboard, line 82 in AdminCRMDashboard), but the variable is **never referenced in JSX**. The `<ActivityFeed>` component fetches its own data internally.

**Fix:** Remove `recentActivities` state variable and the `/recent-activities` call from `Promise.all` in `loadDashboardData`.

**Effort:** 10 minutes
**Verify:** Dashboard loads. Network tab shows one fewer API call. Activity feed still works.

---

### P2-3: Fix `fetch()` Without `API_BASE_URL`

**Files:** Both dashboards → `handleActiveCustomersClick`

```js
// Current (broken if VITE_API_URL is set):
const res = await fetch(`/api/crm/dashboard/active-customers?${params}`, { ... });

// Fix — convert to axios for consistency:
const res = await axios.get(`${API_BASE_URL}/api/crm/dashboard/active-customers`, {
  headers, params: { date_range: dateRange, year: selectedYear },
  timeout: CRM_DASHBOARD_TIMEOUT_MS, signal,
});
```

**Effort:** 15 minutes
**Verify:** Set `VITE_API_URL` to a non-empty value → active customers modal still loads.

---

### P2-4: Remove Dead Variables

| File | Variable | Line | Action |
|---|---|---|---|
| `CRMDashboard.jsx` | `maxRepValue = 1` | ~252 | Remove |
| `CRMDashboard.jsx` | `recentActivities` state | ~55 | Remove (covered by P2-2) |
| `AdminCRMDashboard.jsx` | `recentActivities` state | ~82 | Remove (covered by P2-2) |

**Effort:** 5 minutes

---

### P2-5: Canonicalise `crm_activities` Column Names (`type` vs `activity_type`)

**Files:** `server/routes/crm/index.js` (recent-activities endpoint), `src/components/CRM/ActivityFeed.jsx`

The `crm_activities` table has **both** `type` (from original migration `crm-001`) and `activity_type` (added by migration `crm-005-activities-unify` for PreSales compatibility). The recent-activities endpoint does:

```js
const actType = r.type || r.activity_type || 'follow_up';
```

CRM routes write to `type`. PreSales routes write to `activity_type`. Some records may have one, the other, or both. The `ActivityFeed` component's `TYPE_CONFIG` maps against `type` only.

**Fix:**
1. Decide `type` is canonical (it was the original column, shorter, more records use it)
2. **Migration:** `UPDATE crm_activities SET type = activity_type WHERE type IS NULL AND activity_type IS NOT NULL;`
3. Going forward, all insert routes write to `type`
4. `activity_type` kept as a deprecated alias (drop in a future cleanup)
5. Remove the `|| r.activity_type` fallback from the query — single source of truth

**Effort:** 1 hour
**Verify:** Query `SELECT * FROM crm_activities WHERE type IS NULL AND activity_type IS NOT NULL` → returns 0 rows. Activity feed shows correct type badges for all activities.

---

### P2-6: Backend Route File Split + `my-day/summary` Endpoint

**File:** `server/routes/crm/index.js` (~3,465 lines, 27+ endpoints)

**Proposed structure:**
```
server/routes/crm/
├── index.js              ← Router mount point only (imports sub-routers)
├── dashboard.js          ← /dashboard/stats, /my-stats, /active-customers, /sales-rep-groups, /my-day/summary
├── customers.js          ← /customers, /customers/:id, /customers/map, /my-customers/*
├── prospects.js          ← /prospects CRUD + status
├── activities.js         ← /activities, /recent-activities
├── tasks.js              ← /tasks CRUD
├── deals.js              ← /deals CRUD
├── contacts.js           ← /contacts CRUD
└── products.js           ← /products

server/services/
├── crmService.js         ← resolveRepGroup(), getCustomerSearchNames()
├── crmCacheService.js    ← cacheGet(), cacheSet(), refreshLastTxnView()
└── crmAccessControl.js   ← buildRepScopeWhereClause()
```

> ⚠️ **Pool injection note:** `resolveRepGroup()` queries **both** `pool` (main DB) and `authPool` (auth DB). When extracted to `server/services/crmService.js`, both pools must be explicitly imported. The current file gets them via `require('../../database/config')` — the extracted service must use the same import path:
> ```js
> const { pool, authPool } = require('../../database/config');
> ```
> Same applies to `crmCacheService.js` which uses `pool` for materialized view refresh.

The `buildRepScopeWhereClause()` helper is the **structural prevention** for the P0-1 parameterisation bug:

```js
// server/services/crmAccessControl.js
const { pool, authPool } = require('../../database/config');

function buildRepScopeWhereClause(rep, paramIndex) {
  const conditions = [];
  const params = [];
  if (rep.groupId) {
    conditions.push(
      `(cu.sales_rep_group_id = $${paramIndex} OR
        (cu.sales_rep_group_id IS NULL AND cu.primary_sales_rep_name ILIKE $${paramIndex + 1}))`
    );
    params.push(rep.groupId, `%${rep.firstName}%`);
    return { conditions, params, nextIndex: paramIndex + 2 };
  }
  conditions.push(`cu.primary_sales_rep_name ILIKE $${paramIndex}`);
  params.push(`%${rep.firstName}%`);
  return { conditions, params, nextIndex: paramIndex + 1 };
}

module.exports = { buildRepScopeWhereClause };
```

**Also create in this phase:** The `GET /api/crm/my-day/summary` endpoint (needed by Phase 3's P3-1). Building it now prevents a frontend blocker in Week 3. This endpoint returns **all three counters** that P3-1's action center expects:

```js
// In server/routes/crm/dashboard.js
router.get('/my-day/summary', authenticate, async (req, res) => {
  const rep = await resolveRepGroup(req.user.id);
  if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

  const [tasksRes, dormantRes, inquiriesRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'completed') AS overdue
       FROM crm_tasks WHERE assignee_id = $1`,
      [req.user.id]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM fp_customer_unified cu
       LEFT JOIN mv_customer_last_txn lt ON lt.norm_name = cu.normalized_name
       WHERE cu.sales_rep_group_id = $1
         AND COALESCE(lt.last_txn, cu.last_transaction_date) < CURRENT_DATE - INTERVAL '30 days'`,
      [rep.groupId]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM mes_presales_inquiries
       WHERE sales_rep_group_id = $1
         AND status IN ('quoted', 'sample_approved', 'price_accepted')`,
      [rep.groupId]
    ),
  ]);

  res.json({
    success: true,
    data: {
      overdueTasks: parseInt(tasksRes.rows[0]?.overdue || 0),
      dormantCustomers: parseInt(dormantRes.rows[0]?.cnt || 0),
      inquiriesAwaitingAction: parseInt(inquiriesRes.rows[0]?.cnt || 0),
    }
  });
});
```

**Effort:** 2–3 hours (route split) + 1 hour (my-day endpoint)
**Verify:** All CRM API endpoints return same responses as before. `GET /api/crm/my-day/summary` returns all three counters for a sales rep user.

---

## Phase 3 — Core Flow Rebuild (Weeks 3–4)

### P3-1: Rebuild Sales Rep Dashboard as "My Day" Action Center

**File:** New `src/components/CRM/MyDayDashboard.jsx` (replaces CRMDashboard content for Overview tab)

> **Prerequisite:** `GET /api/crm/my-day/summary` must be deployed (built in P2-6).

The current dashboard answers questions the sales rep never asks. Rebuild around: **"What needs my attention right now?"**

**Layout:**

```
ROW 1 — 3 Action Counters (no charts, just numbers + click-to-drill)
┌─────────────────┬──────────────────────────┬───────────────────────────┐
│ ⚠️ 3 Overdue    │ 📋 5 Inquiries Awaiting  │ 😶 7 Customers Not        │
│    Tasks        │    My Action             │    Contacted in 30 days   │
└─────────────────┴──────────────────────────┴───────────────────────────┘

ROW 2 — Action Center (most important section)
┌──────────────────────────────────┬────────────────────────────────────┐
│ Left 60%: Open Tasks             │ Right 40%: Inquiries Needing       │
│ Sorted by due date               │ My Response (quoted, estimation,   │
│ Red highlight for overdue        │ follow-up required)                │
└──────────────────────────────────┴────────────────────────────────────┘

ROW 3 — My Customers Quick List
  Last 5 contacted + 5 not contacted in 30+ days (at-risk)
  Each row: Name | Last activity | Open inquiry count | Quick-log button

ROW 4 — Today's Activity Feed
  Recent activities by this rep, today-first, with date separators
```

**Design Principle:** Remove every number that does not require an action. Revenue trends go to the Performance tab. Tasks due tomorrow stay here.

**Data sources — all endpoints already exist (or built in P2-6):**
- Summary counters: `GET /api/crm/my-day/summary` (built in P2-6 — returns all 3 values)
- Tasks: `GET /api/crm/tasks?assignee=me&status=open` → filter overdue client-side
- Inquiries: `GET /api/mes/presales/inquiries?sales_rep_group_id=X` → filter by action-needed statuses
- Activities: `GET /api/crm/recent-activities`

**Effort:** 2–3 days
**Verify:** Sales rep login → Overview tab shows action center. Zero KPI charts visible. Every item is clickable and navigates to the relevant record. All 3 ROW 1 counters show real data from `my-day/summary`.

---

### P3-2: Reorder CustomerDetail Sections + Add Relationship Health Badge

**File:** `src/components/CRM/CustomerDetail.jsx` (~1,387 lines)

**Current order:** Basic Info → Business Details → Address/Map → Contacts → Notes → Activities → Tasks → Deals → Inquiries → System Info

**Problem:** The content that matters daily (inquiries, tasks, recent activity) is buried at the bottom. Business details that rarely change occupy the hero position.

**New order:**

| # | Section | Why |
|---|---------|-----|
| 1 | **Overview card** (NEW) | At-a-glance: last activity date, last order date, open inquiry count, open task count, relationship health badge |
| 2 | **Inquiries** (Product Projects) | The main working view — all active pre-sales inquiries for this customer |
| 3 | **Activities** | Full activity log with quick-log button |
| 4 | **Tasks** | Open and completed tasks |
| 5 | **Contacts** | Contact list |
| 6 | **Notes** | Free-text notes |
| 7 | **Deals** | Deal pipeline (until merged with inquiries in Phase 4) |
| 8 | **Profile** | All business details, address, financials, map — edit mode |
| 9 | **System Info** | Created/updated timestamps |

**New: Relationship Health Badge** (in overview card):
```
🟢 Healthy  — Activity in last 14 days AND order in last 6 months
🟡 Cooling  — No activity in 14-30 days OR no order in 6-12 months
🔴 At Risk  — No activity in 30+ days OR no order in 12+ months
```

Computed client-side from `customer.last_activity_date` + `customer.last_transaction_date`.

**Effort:** 4 hours (reorder) + 4 hours (overview card + health badge)
**Verify:** Open any customer → Inquiries and Activities are visible without scrolling. Health badge reflects actual data.

---

### P3-3: Move Pre-Sales Inquiries into CustomerDetail

**Files:**
- `src/components/CRM/CRMModule.jsx` — remove Pre-Sales tab for sales reps
- `src/components/CRM/CustomerDetail.jsx` — promote CustomerInquiries section
- `src/components/CRM/CustomerInquiries.jsx` — enhance to be action-capable

**Current problem:** Pre-Sales (the inquiry Kanban board) is a top-level CRM tab that loads the full MES `PresalesInquiries` module. A rep must leave the customer context entirely to manage inquiries.

**Fix:**
1. Remove "Pre-Sales" as a top-level tab for sales reps (keep for QC/admin roles)
2. Make `CustomerInquiries` the primary inquiry surface inside CustomerDetail
3. Add a "New Inquiry" button within CustomerInquiries that opens InquiryCapture with the customer pre-filled
4. Show current inquiry phase prominently: "QC Testing", "Awaiting CSE Approval", "Pre-Sales Cleared"
5. Highlight inquiries where the rep has an action needed

**CustomerInquiries enhancements:**
```
Each inquiry row shows:
  [Product Name] | [Status Badge: "QC Testing 🔬"] | [Days in stage] | [Action needed? ⚡]

Action-needed statuses for a sales rep:
  - "quoted" → Follow up with customer
  - "sample_approved" → Send PI
  - "price_accepted" → Confirm order
```

**Effort:** 1 day
**Verify:** Sales rep opens customer → sees inquiries prominently → can create new inquiry without leaving the page → no Pre-Sales top-level tab visible.

---

### P3-4: Add Bridge from Prospect Conversion to First Inquiry

**Files:** `src/components/CRM/MyProspects.jsx`

When a prospect is approved and converted to a customer, there is no guided next step. The rep must manually navigate to the new customer record.

**Fix:** When prospect status changes to "converted":
1. Show a success modal with CTA: **"Create First Inquiry for [Customer Name]"**
2. Button navigates to `/crm/customers/:newId` with the Inquiries section expanded and InquiryCapture ready

**Effort:** 3 hours
**Verify:** Convert a prospect → modal appears → clicking CTA opens customer detail with inquiry creation ready.

---

### P3-5: Activity Feed — Today-Scoped with Date Separators

**File:** `src/components/CRM/ActivityFeed.jsx`

Currently shows last N activities in descending order with no temporal context. A rep needs to see: "What did I do today?" and more importantly, "I haven't logged anything today yet."

**Fix:**
- Add date separator headers: "Today", "Yesterday", "This Week", "Earlier"
- If no activities logged today, show a nudge: "No activities logged today — use the ⚡ Quick Log button"
- Use `dayjs` relative time formatting (already imported in several CRM components)

**Effort:** 1 hour
**Verify:** Activity feed shows date separators. Empty day shows nudge message.

---

### P3-6: Budget View — Add Action Signals

**File:** `src/components/CRM/CRMBudgetView.jsx`

Currently read-only reporting. Add contextual action signals per product group:

```
[BOPP Pouches]  42% of monthly target | 8 working days left | ⚠️ Below pace
[PET Laminates] 89% of monthly target | 8 working days left | ✅ On track
```

**Data:** Already available — `budgetTarget` vs `actualSales` per product group per month. This is a frontend calculation only.

**Effort:** 1 day
**Verify:** Budget view shows red/green pace indicators per product group row.

---

## Phase 4 — FP Industry Enhancements (Weeks 5–6)

### P4-1: Technical Brief / Product Interest Capture

**Files:** New `src/components/CRM/TechnicalBriefForm.jsx` + new DB table + new API endpoints

The biggest missing piece: no structured capture of pre-inquiry technical discussions.

**New table:**
```sql
CREATE TABLE crm_technical_briefs (
  id                  SERIAL PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES fp_customer_unified(customer_id),
  created_by          INTEGER NOT NULL,
  -- Product specs
  product_description VARCHAR(500) NOT NULL,
  product_category    VARCHAR(100),          -- pouch, bag, wrapper, roll, lidding
  substrate_interest  VARCHAR(255),          -- BOPP, PET, PE, PA, CPP, metallized, paper
  approx_dimensions   VARCHAR(100),          -- W × L × gusset
  print_colors        VARCHAR(100),          -- 1-8, roto vs flexo
  barrier_requirements TEXT,                 -- OTR/MVTR targets
  annual_volume_est   VARCHAR(100),          -- MT or '000 sqm
  target_price_range  VARCHAR(100),
  current_supplier    VARCHAR(255),
  decision_timeline   VARCHAR(100),
  next_step_agreed    TEXT,
  -- Lifecycle
  status              VARCHAR(30) DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','converted')),
  inquiry_id          INTEGER,               -- set when converted to inquiry
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

> ⚠️ **FK note:** The PK on `fp_customer_unified` is the column named `customer_id`, **not** `id`. This is confirmed by every existing CRM migration (`crm-001-activities`, `crm-002-tasks`, `crm-004-deals`, `migration-313`). The SESSION_CONTEXT.md planning doc that shows `REFERENCES fp_customer_unified(id)` was written before the actual table was created and is incorrect. Always use `REFERENCES fp_customer_unified(customer_id)`.

**Workflow:**
1. Rep creates Technical Brief during/after qualification call (within CustomerDetail)
2. Captures specs incrementally — not all fields required upfront
3. When ready: "Submit as Pre-Sales Inquiry" → pre-fills InquiryCapture with all captured data
4. Brief status becomes "converted", linked to the new inquiry ID

**Effort:** 2 days
**Verify:** Create brief → fill partially → come back later → complete → convert to inquiry → inquiry has all pre-filled data.

---

### P4-2: Auto-Task Creation on Sample Dispatch

**Files:** `server/routes/mes/presales/pipeline.js` (status transition handler)

When a pre-sales inquiry moves to "sample dispatched" status, automatically create a CRM task:

```
Title: "Follow up with [Customer] on sample evaluation"
Due date: 7 days from dispatch
Assigned to: The sales rep who owns the inquiry
Customer: Linked to the inquiry's customer
```

This directly addresses the #1 sales rep failure point in FP: forgetting to follow up after samples are sent.

**Effort:** 1 day
**Verify:** Move an inquiry to "sample dispatched" → check CRM tasks → auto-created task appears with correct due date and customer link.

---

### P4-3: Customer Packaging Profile

**File:** `src/components/CRM/CustomerDetail.jsx` — new section within Profile tab

Add fields to `fp_customer_unified` or a new `crm_customer_packaging_profile` table:

| Field | Why It Matters |
|---|---|
| Current packaging supplier(s) | Competitive intelligence |
| Packaging categories purchased | Cross-sell identification |
| Converting equipment on-site | Determines viable structures |
| Food safety certifications | Affects substrate/ink choices |
| Annual packaging volume (est) | Sizing the opportunity |
| Sustainability requirements | Mono-material, recyclable, bio-based |

**Effort:** 1 day
**Verify:** Open customer Profile tab → Packaging Profile section visible and editable.

---

### P4-4: Competitor Intel Capture

**Files:** `src/components/CRM/CustomerDetail.jsx` + `src/components/CRM/MyProspects.jsx`

Add a simple "Competitor Notes" field on:
- Customer profile (who they currently buy from, known pricing, pain points)
- Prospect form (same fields)

**Effort:** 2 hours
**Verify:** Edit customer → competitor notes field saves and displays.

---

### P4-5: Merge Deal Pipeline into Inquiry Lifecycle (Long-term)

**Decision:** Adopt **Option A** from the deep review — remove DealPipeline as a separate entity. The Pre-Sales Inquiry (with SAR → QC → CSE → clearance → quotation → PO) IS the deal.

**Rationale:** Currently a rep could create both a "Deal" and a "Pre-Sales Inquiry" for the same product request — two separate records with no link. For FP manufacturing, the formal inquiry process is already a complete sales pipeline. Adding a generic "Deals" layer creates redundancy.

**Migration path:**
1. P1-2 renames deal stages (already done) — reduces confusion short-term
2. P3-3 promotes CustomerInquiries to the main working surface
3. This item: deprecate `crm_deals` creation for sales reps, add a migration to link existing deals to inquiries where possible, and hide DealPipeline from CustomerDetail

**Effort:** 1–2 days
**Verify:** No orphaned deals. All tracking happens through the inquiry lifecycle. Admin analytics still report on historical deals.

---

### P4-6: Customer Map — Visit Route Planning

**File:** `src/components/CRM/CustomerMapView.jsx`

Add a "Plan Visit" feature: rep selects 2-5 nearby customers on the map → "Open Route in Google Maps" button generates a multi-stop directions URL.

```js
const googleMapsUrl = `https://www.google.com/maps/dir/${stops.map(s => `${s.lat},${s.lng}`).join('/')}`;
window.open(googleMapsUrl, '_blank');
```

**Effort:** 1 day
**Verify:** Select 3 customers on map → click "Plan Route" → Google Maps opens with multi-stop directions.

---

## Implementation Schedule

```
WEEK 1 — Phase 0 + Phase 1
├── Day 1 (AM): P0-1 (parameterisation fix), P0-2 (salesRep→repInfo logger)
├── Day 1 (PM): P0-3 Step 1+2 (add column + populate group IDs for all reps)
│               P0-3 Step 3 (deploy updated resolveRepGroup)
│               P0-4 (MoRM removal)
│               P1-4 (expand RiskAlertPanel)
├── Day 2: P1-1 (navigation reduction), P1-2 (deal stage rename)
├── Day 3: P1-3 (QuickLogFAB customer selection)
└── Day 4-5: Buffer + testing all Phase 0/1 changes
│
│   ⚠️ GATE: Verify P0-3 by confirming sales_rep_group_id is non-NULL
│            for ALL active reps before proceeding. If any are NULL,
│            do not remove fuzzy fallback yet.

WEEK 2 — Phase 2 (Code Health)
├── Day 1-2: P2-6 (backend route split + my-day endpoint + pool imports)
├── Day 2: P2-2 (remove wasted API call), P2-3 (fetch fix), P2-4 (dead vars)
├── Day 3: P2-5 (canonicalise crm_activities type/activity_type)
└── Day 3-5: P2-1 (dashboard deduplication into SalesCockpit)

WEEK 3-4 — Phase 3 (Core Flow Rebuild)
├── Day 1-3: P3-1 (My Day action center — uses my-day endpoint from P2-6)
├── Day 4: P3-2 (CustomerDetail reorder + health badge)
├── Day 5: P3-3 (Pre-Sales into CustomerDetail)
├── Day 6: P3-4 (prospect→inquiry bridge), P3-5 (activity date separators)
└── Day 7: P3-6 (budget action signals)

WEEK 5-6 — Phase 4 (FP Industry Enhancements)
├── Day 1-2: P4-1 (Technical Brief capture)
├── Day 3: P4-2 (auto-task on sample dispatch)
├── Day 4: P4-3 (packaging profile), P4-4 (competitor intel)
├── Day 5: P4-5 (merge deals into inquiries)
└── Day 6: P4-6 (map route planning)
```

---

## Verification Checklist (End-to-End)

After all phases are complete, verify these user journeys:

- [ ] **Sales rep morning routine:** Login → My Day tab → see overdue tasks + inquiries needing action + dormant customers → click task → goes to customer → see full context
- [ ] **New customer qualification:** Open customer → create Technical Brief → capture specs → convert to Pre-Sales Inquiry → specs pre-filled
- [ ] **Sample follow-up:** Inquiry moves to "sample dispatched" → auto-task created → appears in My Day → rep follows up → logs activity
- [ ] **Prospect conversion:** Approve prospect → "Create First Inquiry" CTA → navigates to customer with inquiry wizard ready
- [ ] **Field visit planning:** My Customers → toggle map → select 3 nearby customers → "Plan Route" → Google Maps opens
- [ ] **Admin still works:** Admin login → full dashboard with KPIs, trends, product mix → group selector → all analytics intact
- [ ] **No parameterisation bugs:** Sales rep with group_id ≠ 1 → My Customers loads correct data → server logs show `repInfo.fullName` without error
- [ ] **Group resolution:** Each rep's dashboard shows their own group data (not a fuzzy-matched wrong group)

---

## What We Are NOT Changing

For clarity, these items were reviewed and deliberately left as-is:

| Item | Reason |
|---|---|
| Backend caching strategy (45s TTL) | Working well, no performance issues |
| Materialized view refresh (5 min) | Appropriate for data freshness needs |
| Prospect approval workflow | Correct for capital-intensive manufacturing |
| Activity types (call, visit, WhatsApp, email, follow-up) | Perfect fit for FP sales |
| Contact management (multi-contact with primary flag) | Correct for B2B |
| Admin dashboard (AdminCRMDashboard) | Appropriate for management — KPIs belong here |
| Transaction safety (BEGIN/COMMIT/ROLLBACK) | Already correct |
| AbortController pattern | Already correct |

---

## Change Log

### v1 → v2
| Change | Source | What Changed |
|---|---|---|
| P0-1 reframed | Peer review #2 | "SQL injection" → "wrong value bug" — literal counter, not user input |
| P0-2 added | Peer review #1 | `salesRep.full_name` ReferenceError in `/my-customers` logger |
| P0-3 expanded | Peer review #3 | 3-step rollout (schema + data + code) instead of just schema |
| P1-4 added | Peer review #5 | RiskAlertPanel `defaultActiveKey` — one-line quick win |
| P2-5 added | Peer review #7 | `crm_activities` `type` vs `activity_type` column inconsistency |
| P2-6 expanded | Peer review #4, #6 | Pool injection note for extracted services + `my-day/summary` endpoint moved here |
| Schedule updated | Peer review #3, #6 | P0-3 has explicit gate check; P3-1 prerequisite documented |

### v2 errata (applied in-place)
| Change | Source | What Changed |
|---|---|---|
| P2-6 `my-day/summary` endpoint | Errata review | Added missing `inquiriesAwaitingAction` query to `Promise.all` — endpoint now returns all 3 counters that P3-1 expects (`overdueTasks`, `dormantCustomers`, `inquiriesAwaitingAction`) |
| P4-1 FK reference | Errata review (rejected) | Kept `REFERENCES fp_customer_unified(customer_id)` — verified against all 4 existing CRM migrations (`crm-001`, `crm-002`, `crm-004`, migration `313`). The `customer_id` column IS the PK. Added explicit warning note to prevent future confusion with SESSION_CONTEXT.md which incorrectly shows `(id)` |

---

*Plan authored: 2026-03-02 · Last updated: 2026-03-02 · Based on codebase commit `475fe5c`*