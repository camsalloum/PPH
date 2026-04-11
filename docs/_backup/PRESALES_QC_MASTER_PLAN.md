# Pre-Sales & QC Sample Evaluation — Master Plan

> **Module:** MES Pre-Sales → QC Analysis → CSE Approval → Quotation → Pre-Prod → PI → Production → Delivery  
> **Division:** Flexible Packaging (FP) — Interplast  
> **Date:** 2026-03-01  
> **Status:** ✅ IMPLEMENTED — Sprints 1-5.1 complete (see completion notes below)  
> **Prepared by:** AI Engineering Review  
> **Based on:** Full code audit + 8 documentation files + 5 reference ERP apps
>
> ### Completion Summary
> All Phases (Bugs, Security, UX, F, G, H) are **complete** except:
> - **H-001** (Workflow Automation Engine) — deferred to Phase I, P3, 15-20h
> - **H-004** (RFQ Bridge Module) — deferred to Phase I, P3, 8-10h
> - **F-007** (File Header Documentation) — pending, P2, 1h
> - **ARCH-001/002/003** — optional refactoring, not yet started
>
> ### Sprint 5.1 Bug Fix Sprint (2026-03-01)
> 6 bugs fixed from reference app study (Twenty CRM + ERPNext analysis):
> - **BUG-A** — Stage SET moved inside DB transaction (was fire-and-forget after COMMIT)
> - **BUG-B** — Soft-delete: DELETE → sets `deleted_at`, `deleted_by`, `deleted_by_name`. All queries filter `deleted_at IS NULL`
> - **BUG-D** — Paginated activities endpoint (`?page=1&limit=50`)
> - **BUG-E** — `stage_changed_at` column + 22 update points across 8 files. Pipeline uses `COALESCE(stage_changed_at, updated_at)` for accurate days-in-stage
> - **BUG-F** — Lost/on_hold from ANY active stage (16 MANUAL_TRANSITIONS). On_hold resumes to 5 targets
> - **ISS-18** — Lost guard: cannot mark lost if active quotations exist
> - **DB columns added:** `stage_changed_at`, `deleted_at`, `deleted_by`, `deleted_by_name`
> - **21 pipeline stages** including `new_inquiry` (#0) and `qc_received` (#2.5)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Critical Bugs — Must Fix Immediately](#3-critical-bugs--must-fix-immediately)
4. [Security & Access Control Fixes](#4-security--access-control-fixes)
5. [UX & Functional Fixes](#5-ux--functional-fixes)
6. [Feature Enhancements — Phase F (Polish)](#6-feature-enhancements--phase-f-polish)
7. [Feature Enhancements — Phase G (Professional QC)](#7-feature-enhancements--phase-g-professional-qc)
8. [Feature Enhancements — Phase H (Advanced)](#8-feature-enhancements--phase-h-advanced)
9. [Reference App Feature Adoption](#9-reference-app-feature-adoption)
10. [Architecture Improvements](#10-architecture-improvements)
11. [Updated Document Structure](#11-updated-document-structure)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Risk Register](#13-risk-register)
14. [Login & Dashboard Journey Review](#14-login--dashboard-journey-review)

---

## 1. Executive Summary

### What exists today (Phases A–E complete)

The Pre-Sales module has **49 backend API routes**, **12 frontend components**, and **3 database migration files** covering:

- ✅ Inquiry capture (3-step wizard)
- ✅ Sample registration with QR codes and SAR printing
- ✅ Batch submission to QC Lab with email notifications
- ✅ QC Dashboard with inbox, stats, batch receive
- ✅ Full QC analysis form (test parameters, category presets, observations)
- ✅ CSE auto-generation from analysis submission
- ✅ Two-level CSE approval (QC Manager → Production Manager)
- ✅ In-app notification bell with polling
- ✅ Role-based module access (Sales → CRM, QC → MES/QC)
- ✅ Department-aware JWT tokens

### What this plan covers

| Category | Items | Priority |
|----------|-------|----------|
| **Critical bugs** | 3 items — SQL injection, race conditions, silent failures | 🔴 P0 |
| **Security fixes** | 15 routes missing access control | 🔴 P0 |
| **Navigation & role bugs** | 3 manager bugs + 3 critical UX traps + 5 medium issues | 🔴 P0 / 🟡 P1 |
| **UX fixes** | 18 issues across all components | 🟡 P1 |
| **Polish (Phase F)** | 8 features — CSE PDF, evidence upload, confirmation dialogs | 🟡 P1 |
| **Professional QC (Phase G)** | 10 features — templates, NCR, audit trail, comments | 🟢 P2 |
| **Advanced (Phase H)** | 8 features — workflow engine, analytics, SLA tracking | 🔵 P3 |

### Estimated effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| P0 Critical + Security + Navigation | 3–4 days | None |
| P1 UX + Polish | 3–4 days | P0 complete |
| P2 Professional QC | 5–7 days | P1 complete |
| P3 Advanced | 5–7 days | P2 complete |
| **Total** | **16–22 days** | Sequential |

---

## 2. Current State Assessment

### 2.1 Backend Routes Audit (49 routes in presales.js)

| Area | Routes | Status |
|------|--------|--------|
| Inquiry CRUD | 7 | ✅ Working, some need access control hardening |
| Prospect management | 4 | ✅ Working, prospect update lacks ownership check |
| Sample management | 6 | ✅ Working, status change has SQL injection + race condition |
| QC submission/recall | 2 | ✅ Working |
| Attachments | 3 | ✅ Working, all missing ownership checks |
| QC inbox/stats/batch | 3 | ✅ Working, properly guarded |
| QC analysis CRUD | 4 | ✅ Working, properly guarded |
| CSE approval workflow | 5 | ✅ Working, properly guarded |
| MOQ checks | 5 | ⚠️ Working, no role checks at all |
| Material checks | 5 | ⚠️ Working, no role checks at all |
| Clearance/phase | 2 | ✅ Clearance admin-only; phase change UNGUARDED |
| Stats/history | 2 | ✅ Working |
| Misc (sales-reps, products) | 2 | ✅ Working |

### 2.2 Frontend Components Audit (12 components)

| Component | Lines | Quality | Issues |
|-----------|-------|---------|--------|
| InquiryDetail.jsx | 1365 | ⚠️ | Too large, needs decomposition, DOM manipulation anti-pattern |
| InquiryCapture.jsx | 871 | ⚠️ | Silent partial failures, no draft save, no validation messages |
| QCSampleAnalysis.jsx | 282 | 🟡 | No evidence upload, no progress steps, no confirm on submit |
| InquiryBoard.jsx | 252 | 🟡 | No debounce on search, inline component definition, no pagination |
| QCScanPage.jsx | 219 | 🟡 | No role guard, stale token, no file download |
| QCDashboard.jsx | 152 | 🟡 | No auto-refresh, no date columns, stale token |
| CSEApprovalPage.jsx | 142 | 🟡 | No confirm dialogs, no required rejection notes, no evidence display |
| CSEApprovalQueue.jsx | 97 | 🟢 | Minor: double-render on mount, no date column |
| NewCustomerModal.jsx | 179 | 🟡 | Missing contact name/email fields, no phone validation |
| WorkflowLandingPage.jsx | 661 | 🟢 | Static reference page, well-built |
| MES/index.jsx | 51 | 🟢 | No error boundary for lazy imports |
| PreSales/index.jsx | 29 | ✅ | Clean routing wrapper |

### 2.3 Cross-Cutting Issues

| Issue | Impact | Files Affected |
|-------|--------|---------------|
| **No centralized HTTP client** | Every component reads `localStorage` directly; stale tokens after refresh | All 10+ components |
| **Inconsistent CSS strategy** | PreSales uses CSS file; QC uses 100% inline styles | 7 components |
| **No TypeScript** | No type safety, prop mismatches go unreported | All files |
| **`user.name` vs `user.full_name`** | Some routes read wrong field → undefined display names | 5 backend locations |
| **Error message leakage** | All 500 responses expose `err.message` to client | All 49 routes |
| **38/49 routes undocumented** | File header lists only 11 routes | presales.js header |

---

## 3. Critical Bugs — Must Fix Immediately

### BUG-001: SQL Injection in Sample Status Update 🔴

**File:** `server/routes/mes/presales.js` lines ~1203–1211  
**Route:** `PATCH /samples/:sampleId/status`

**Problem:** Direct string interpolation of `req.user.id` and `req.user.full_name` into SQL:
```js
extra = `, received_by_qc_user = ${req.user?.id || 'NULL'},
         received_by_qc_name = '${(req.user?.full_name || '').replace(/'/g, "''")}'`;
```

**Impact:** A crafted user ID or name could execute arbitrary SQL.

**Fix:** Convert to parameterized query:
```js
// Replace string interpolation with $N parameters
const params = [newStatus, sampleId];
let extra = '';
if (newStatus === 'received_by_qc') {
  extra = `, received_by_qc_user = $3, received_by_qc_name = $4, received_at = NOW()`;
  params.push(req.user?.id || null, actorName(req.user));
}
await pool.query(`UPDATE mes_presales_samples SET status = $1 ${extra} WHERE id = $2`, params);
```

**Effort:** 30 minutes

---

### BUG-002: Race Condition on Sample Status Transitions 🔴

**File:** `server/routes/mes/presales.js` lines ~1175–1268  
**Route:** `PATCH /samples/:sampleId/status`

**Problem:** SELECT and UPDATE are separate non-transactional queries. Between the two, another request could change the status, allowing invalid transitions (e.g., two users both marking the same sample as "received").

**Fix:** Wrap in a transaction with `SELECT ... FOR UPDATE`:
```js
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    'SELECT * FROM mes_presales_samples WHERE id = $1 FOR UPDATE', [sampleId]
  );
  // ... validate transition ...
  await client.query('UPDATE ...', [...]);
  await client.query('COMMIT');
} catch { await client.query('ROLLBACK'); throw; }
finally { client.release(); }
```

**Effort:** 1 hour

---

### BUG-003: Silent Partial Failures in Inquiry Creation 🔴

**File:** `src/components/MES/PreSales/InquiryCapture.jsx` lines ~770–830  
**Route:** `POST /inquiries` → then sequential `POST /samples` × N + `POST /attachments` × M

**Problem:** If 3 out of 5 samples fail creation, the user sees a "Success" toast. Failed samples and failed attachment uploads are silently swallowed (only logged to console).

**Fix:** Track each sample/attachment creation result, show a summary:
```jsx
const results = await Promise.allSettled(samples.map(s => createSample(inquiryId, s)));
const failed = results.filter(r => r.status === 'rejected');
if (failed.length > 0) {
  message.warning(`Inquiry created, but ${failed.length} sample(s) failed. Please check and re-add them.`);
} else {
  message.success('Inquiry created successfully with all samples.');
}
```

**Effort:** 1 hour

---

## 4. Security & Access Control Fixes

### SEC-001: Routes Missing Ownership / Role Checks

The following 15 routes accept any authenticated user — no ownership verification or role requirement:

| # | Route | Risk | Proposed Fix |
|---|-------|------|-------------|
| 1 | `PATCH /prospects/:id` | Any user can edit any prospect | Add: ownership check (linked inquiry's rep group must match user's group) or admin override |
| 2 | `GET /inquiries/:id/attachments` | Any user can list any inquiry's files | Add: ownership check or admin/QC override |
| 3 | `POST /inquiries/:id/attachments` | Any user can upload to any inquiry | Same as above |
| 4 | `DELETE /inquiries/:id/attachments/:attId` | Any user can delete any attachment | Same + require status is pre-submission |
| 5 | `POST /inquiries/:id/samples` | Any user can add samples to any inquiry | Add: ownership check + phase must be `inquiry` |
| 6 | `GET /inquiries/:id/samples` | Any user can list any inquiry's samples | Add: ownership check or QC/admin override |
| 7 | `DELETE /samples/:sampleId` | Any user can delete any registered sample | Add: ownership check on parent inquiry |
| 8 | `PATCH /samples/:sampleId/status` | Any user can change any sample status | Add: QC role check for QC-specific transitions; sales role for send_to_qc |
| 9 | `PATCH /samples/:sampleId/qc-result` | Any user can submit QC results | Add: `canAccessQCDashboard(user)` check |
| 10 | `GET /inquiries/:id/history` | Any user can read any activity log | Add: ownership check or admin override |
| 11 | `POST/PATCH/DELETE /moq-checks/*` | Any user can CRUD MOQ checks | Add: admin/manager/sales_coordinator role check |
| 12 | `POST/PATCH/DELETE /material-checks/*` | Any user can CRUD material checks | Same as MOQ |
| 13 | `PATCH /inquiries/:id/moq-status` | Any user can advance MOQ phase | Add: admin/management role check |
| 14 | `PATCH /inquiries/:id/material-status` | Any user can advance material phase | Same |
| 15 | `PATCH /inquiries/:id/presales-phase` | Any user can manually set any phase | Add: admin-only check (like clearance) |

**Implementation approach:** Create a shared `checkInquiryOwnership(req, inquiryId)` helper that either:
- Confirms the user's sales_rep_group matches the inquiry's, OR
- User has `admin`/`manager`/`sales_manager`/`sales_coordinator` role, OR
- User has QC role (for QC-specific routes)

**Effort:** 3–4 hours

---

### SEC-002: Error Message Leakage

**Problem:** All 49 routes return `err.message` to the client in 500 responses, exposing table names, column names, constraint details.

**Fix:** Replace in all catch blocks:
```js
// Before:
res.status(500).json({ success: false, error: err.message });
// After:
logger.error('Route X failed:', err);
res.status(500).json({ success: false, error: 'Internal server error' });
```

**Effort:** 1 hour (find-and-replace)

---

### SEC-003: Input Validation — parseInt on Route Params

**Problem:** All `req.params.id` values are passed directly to PostgreSQL. Non-numeric values cause unhandled 500 errors instead of clean 400 errors.

**Fix:** Create middleware or add validation at the top of handlers:
```js
const id = parseInt(req.params.id, 10);
if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
```

**Effort:** 1 hour

---

## 5. UX & Functional Fixes

### UX-001: Stale Auth Token in QC Components

**Files:** QCDashboard.jsx, QCSampleAnalysis.jsx, CSEApprovalPage.jsx, CSEApprovalQueue.jsx, QCScanPage.jsx

**Problem:** All compute `headers = { Authorization: 'Bearer ${token}' }` via `useMemo(() => …, [])` — token captured at mount. If token refreshes via interceptor, these components keep the old token.

**Fix:** Create a shared `useApiHeaders()` hook:
```jsx
// src/hooks/useApiHeaders.js
export function useApiHeaders() {
  return useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`
  }), []); // Or better: use the AuthContext's axios instance
}
```

Or ideally, switch all components to use the AuthContext axios instance which already has the interceptor.

**Effort:** 2 hours (all 5+ components)

---

### UX-002: Search Debounce on InquiryBoard

**File:** InquiryBoard.jsx

**Problem:** Every keystroke in the search box triggers `loadData` which fires an API request.

**Fix:** Add debounce (300ms) on the search input:
```jsx
const debouncedSearch = useMemo(
  () => debounce((value) => setFilters(f => ({ ...f, search: value })), 300),
  []
);
```

**Effort:** 15 minutes

---

### UX-003: InquiryCard Defined Inside Render

**File:** InquiryBoard.jsx

**Problem:** `InquiryCard` is defined inside the render function — re-created on every cycle, degrading performance.

**Fix:** Extract to separate file or use `React.memo` outside the component.

**Effort:** 30 minutes

---

### UX-004: Confirmation Dialogs Missing

**Files:** QCSampleAnalysis.jsx, CSEApprovalPage.jsx

**Problem:**
- Submitting analysis (generates irreversible CSE) has no confirmation dialog
- Approving/rejecting CSE has no confirmation dialog

**Fix:** Add `Modal.confirm` before these actions:
```jsx
Modal.confirm({
  title: 'Submit Analysis & Generate CSE?',
  content: 'This will finalize the analysis and generate a CSE report for approval. This cannot be undone.',
  okText: 'Submit',
  onOk: () => handleSubmit()
});
```

**Effort:** 30 minutes

---

### UX-005: Required Notes for CSE Rejection

**File:** CSEApprovalPage.jsx

**Problem:** Users can reject a CSE without providing a reason.

**Fix:** Validate `notes.trim()` length > 0 before allowing reject/revision actions:
```jsx
if (!notes.trim()) {
  message.warning('Please provide a reason for rejection.');
  return;
}
```

**Effort:** 15 minutes

---

### UX-006: InquiryDetail Decomposition ✅ COMPLETED

**File:** InquiryDetail.jsx (1510 lines → 8 sub-components)

**Problem:** Monolithic component handling inquiry info, prospect management, sample registration, QC submission, clearance, and activity history.

**Implemented:** Extracted into `src/components/MES/PreSales/InquiryDetail/`:
```
InquiryDetail/
├── index.jsx            (orchestrator, ~150 lines)
├── constants.jsx        (STATUS_CONFIG, SOURCE_LABELS, icons)
├── InquiryInfoCard.jsx  (inquiry metadata display)
├── PhaseStepperCard.jsx (presales phase stepper)
├── SamplesSection.jsx   (~350 lines, sample management)
├── ClearanceSection.jsx (clearance workflow)
├── ProspectPanel.jsx    (prospect management)
├── ActivityTimeline.jsx (activity log)
└── AuditTrailSection.jsx(H-008 audit trail)
```

**Effort:** 3–4 hours

---

### UX-007: Country Field Inconsistency in Prospect Forms

**Files:** InquiryDetail.jsx (free-text `<Input>` for country), NewCustomerModal.jsx (API-loaded `<Select>`)

**Problem:** Two different UIs for the same field. InquiryDetail's prospect form uses plain text input.

**Fix:** Replace the free-text country input in InquiryDetail's prospect form with the same API-loaded Select dropdown used in NewCustomerModal.

**Effort:** 30 minutes

---

### UX-008: Rejection Reason Anti-Pattern

**File:** InquiryDetail.jsx

**Problem:** Uses `document.getElementById('reject-reason')` inside `Modal.confirm` to get the rejection reason value — a React anti-pattern that breaks if the modal DOM isn't synchronous.

**Fix:** Use Ant Design's Modal with a controlled input:
```jsx
const [rejectReason, setRejectReason] = useState('');
// In Modal's content:
<Input.TextArea value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
```

**Effort:** 30 minutes

---

### UX-009: NewCustomerModal Missing Fields

**File:** NewCustomerModal.jsx

**Problem:** The `deferSave` mode returns `contact_name` and `contact_email` in the data object, but no form fields exist for them — they'll always be `undefined`/`null`.

**Fix:** Add `contact_name` and `contact_email` Form.Items:
```jsx
<Form.Item name="contact_name" label="Contact Person">
  <Input placeholder="John Smith" />
</Form.Item>
<Form.Item name="contact_email" label="Contact Email">
  <Input type="email" placeholder="john@company.com" />
</Form.Item>
```

**Effort:** 15 minutes

---

### UX-010: TDS Attachment Downloads Not Working

**File:** QCScanPage.jsx

**Problem:** TDS attachment cards are displayed but have no download link or click handler — files are unreachable.

**Fix:** Add download link:
```jsx
<a href={`${API_BASE}/uploads/inquiry-attachments/${att.file_path}`}
   target="_blank" rel="noopener noreferrer">
  📎 {att.original_name}
</a>
```

**Effort:** 15 minutes

---

### UX-011: Auto-Refresh for QC Dashboard

**File:** QCDashboard.jsx

**Problem:** No auto-refresh — QC lab users must manually click Refresh to see new samples.

**Fix:** Add polling with configurable interval (suggested: 60 seconds):
```jsx
useEffect(() => {
  loadAll();
  const interval = setInterval(loadAll, 60000);
  return () => clearInterval(interval);
}, []);
```

**Effort:** 15 minutes

---

### UX-012: Missing Date/Time Columns in QC Tables

**Files:** QCDashboard.jsx, CSEApprovalQueue.jsx

**Problem:** No date column in any table — users can't see when samples were submitted or how long they've been pending.

**Fix:** Add columns:
- QCDashboard pending: `submitted_at` (formatted as "2 hours ago" relative time)
- QCDashboard in-progress: `received_at`
- CSEApprovalQueue: `created_at` column

**Effort:** 30 minutes

---

### UX-013: Error Boundary for Lazy MES Components

**File:** MES/index.jsx

**Problem:** If a lazy-loaded chunk fails (network error), the entire MES module crashes with no recovery option.

**Fix:** Wrap Suspense in an ErrorBoundary:
```jsx
<ErrorBoundary fallback={<Result status="error" title="Failed to load" extra={<Button onClick={retry}>Retry</Button>} />}>
  <Suspense fallback={<Spin size="large" />}>
    <Routes>...</Routes>
  </Suspense>
</ErrorBoundary>
```

**Effort:** 30 minutes

---

### UX-014: QCScanPage Role Guard

**File:** QCScanPage.jsx

**Problem:** Any authenticated user (including sales reps) can access the QC scan page and perform QC actions (mark received, start testing, submit results).

**Fix:** Add QC role check at the top of the component:
```jsx
const { user } = useAuth();
if (!canAccessQCDashboard(user)) {
  return <Result status="403" title="Access Denied" subTitle="Only QC staff can access this page" />;
}
```
Where `canAccessQCDashboard` is a client-side mirror of the backend check.

**Effort:** 30 minutes

---

### UX-015: Recall Phase Bug

**File:** InquiryDetail.jsx

**Problem:** The `isBeforeSubmission` check uses `inquiry.presales_phase === 'inquiry'` to show the "Add New Sample" button. But after recalling samples, the phase reverts to `inquiry` with status `in_progress` — the recalled samples have status `registered` again. The button should correctly appear. Need to verify backend recall actually sets phase back to `inquiry` (not `sample_qc`).

**Fix:** Verify backend recall endpoint sets phase to `inquiry` and add a comment documenting the expected behavior. If the backend sets it to `sample_qc`, update the frontend check.

**Effort:** 30 minutes

---

### UX-016: Department-Universal MES Workflow Access ✅ COMPLETED

**Files:** MES/index.jsx, WorkflowLandingPage.jsx  
**Priority:** P0 (Critical)  
**Status:** ✅ Completed — 2026-02-27  
**Effort:** 1 hour

**Problem:** QC department users navigating to `/mes` were shown `<QCDashboard />` instead of the MES Workflow Landing Page (swimlane flowchart with department filter sidebar). QC users navigating to `/mes/flow/*` or `/mes/inquiries/*` were hard-redirected to `/mes/qc`. Additionally, the `getRoleMesConfig()` function restricted which departments appeared in the sidebar filter — QC could only see `['qc']`, production only 4 departments, accounts only 3, logistics only 3. Only sales/admin could see all departments. QC users also only saw 1 of 17 workflow phases (p02 Sample & QC Review).

**Root Cause:** Five issues in two files:
1. `MES/index.jsx` — QC-specific conditional routing replaced WorkflowLandingPage with QCDashboard
2. `MES/index.jsx` — QC redirect intercepted `/mes/flow/*` and `/mes/inquiries/*` routes
3. `WorkflowLandingPage.jsx` — `renderedStages` useMemo filtered QC to only p02
4. `WorkflowLandingPage.jsx` — `getRoleMesConfig()` restricted department sidebar per role
5. `WorkflowLandingPage.jsx` — `qcCse` quick link was disabled (route: null)

**Fix Applied:**
1. **MES/index.jsx** — Removed all QC-specific conditional routing. ALL users now see `<WorkflowLandingPage />` at `/mes` index route. Removed `useAuth` import and `isQCRole` detection logic.
2. **WorkflowLandingPage.jsx** — `getRoleMesConfig()` updated: ALL departments now get `allowAllDepartments: true` and `allowedDepts: allDepts` (all 10 departments). Each department retains its own `defaultDept` (pre-selected) and department-specific `quickLinkIds`.
3. **WorkflowLandingPage.jsx** — Replaced `renderedStages` useMemo with `const renderedStages = STAGES;` — all users see all 17 workflow phases. Department filter controls highlighting/clickability, not stage visibility.
4. **WorkflowLandingPage.jsx** — Removed `isQCRole` memo, fixed JOBS button navigation.
5. **WorkflowLandingPage.jsx** — Enabled `qcCse` quick link → `/mes/approvals` (was disabled with `route: null`).

**Behaviour After Fix:**
- ALL department users (Sales, QC, Logistics, Accounts, Production, Prepress, Estimation, Procurement, Inkhead, Maintenance) see the full MES workflow landing page at `/mes`
- Each department's sidebar filter is pre-selected to their own department
- All 10 departments are visible in the sidebar filter for every user
- All 17 workflow phases are visible across all 5 stage groups
- QC Dashboard remains accessible at `/mes/qc` for QC-specific tasks
- Vite build verified passing

---

### Summary UX Fixes Table

| ID | Issue | File(s) | Effort | Status |
|----|-------|---------|--------|--------|
| UX-001 | Stale auth token | 5 QC components | 2h | |
| UX-002 | Search debounce | InquiryBoard | 15m | |
| UX-003 | Inline component | InquiryBoard | 30m | |
| UX-004 | Missing confirm dialogs | QCSampleAnalysis, CSEApprovalPage | 30m | |
| UX-005 | Required rejection notes | CSEApprovalPage | 15m | |
| UX-006 | Component decomposition | InquiryDetail | 3-4h | ✅ |
| UX-007 | Country field inconsistency | InquiryDetail | 30m | |
| UX-008 | DOM anti-pattern | InquiryDetail | 30m | |
| UX-009 | Missing form fields | NewCustomerModal | 15m | |
| UX-010 | Attachment downloads | QCScanPage | 15m | |
| UX-011 | Auto-refresh | QCDashboard | 15m | |
| UX-012 | Date columns | QCDashboard, CSEApprovalQueue | 30m | |
| UX-013 | Error boundary | MES/index | 30m | |
| UX-014 | Role guard | QCScanPage | 30m | |
| UX-015 | Recall phase logic | InquiryDetail | 30m | |
| UX-016 | Dept-universal MES access | MES/index, WorkflowLandingPage | 1h | ✅ |

**Total P1 UX effort: ~10–11 hours**

---

## 6. Feature Enhancements — Phase F (Polish)

> Phase F was already planned in the original documentation. These items finalize the existing workflow.

### F-001: CSE PDF Generation

**Priority:** P1  
**Effort:** 4–6 hours

**What:** Generate a professional printable PDF version of the CSE report, matching the layout described in the docs (company header, customer info, test results table, observations, recommendations, approval signatures, QR code).

**How (inspired by Dolibarr's PDF template engine):**
- Backend: `GET /api/mes/presales/cse/:id/pdf`
- Use `puppeteer` or `html-pdf-node` to render HTML template → PDF
- Template includes: company logo, CSE number, date, customer/sample info, test results table, observations, recommendation, approval chain with signatures/dates, footer with branding
- Frontend: "Download PDF" / "Print" button on CSEApprovalPage and InquiryDetail

**Database changes:** None

---

### F-002: QC Evidence File Upload

**Priority:** P1  
**Effort:** 3–4 hours

**What:** Allow QC lab to upload test evidence (photos, charts, lab certificates) directly from the analysis form.

**How:**
- Backend: Extend `POST /api/mes/presales/inquiries/:id/attachments` to accept `attachment_type = 'qc_evidence'` with `analysis_id` reference
- Frontend: Add file upload section to QCSampleAnalysis.jsx (Ant Design Upload component with drag-and-drop)
- Display uploaded evidence in: QCSampleAnalysis (editable), CSEApprovalPage (read-only), CSE PDF

**Database changes:** Add `analysis_id` column to `inquiry_attachments` table (nullable FK)

---

### F-003: CSE Document Viewer Component

**Priority:** P1  
**Effort:** 2–3 hours

**What:** Dedicated CSE document view component for the Sales Rep to see the completed evaluation from the InquiryDetail page.

**How:**
- New component: `CSEDocument.jsx` (already planned but not implemented)
- Show: formatted CSE report inline in InquiryDetail when CSE exists for a sample
- Include: all test results, approval chain status, download PDF button
- Access: Sales Rep (inquiry owner), admin, QC staff

---

### F-004: Activity Log Completeness

**Priority:** P2  
**Effort:** 2 hours

**What:** Ensure every workflow action creates an activity log entry.

**Currently missing logs for:**
- QC analysis draft saved
- QC analysis submitted (CSE generated)
- CSE approved (by whom, at which level)
- CSE rejected (with reason)
- CSE revision requested
- Prospect approved/rejected
- MOQ/material check created/updated
- Pre-sales clearance granted/revoked

**How:** Add `logActivity()` calls to the ~12 routes that currently skip it.

---

### F-005: Sales Rep CSE View in InquiryDetail

**Priority:** P1  
**Effort:** 2 hours

**What:** In InquiryDetail, for each sample that has a CSE report, show a summary card with:
- CSE number and status (tag)
- Overall result (PASS/FAIL/CONDITIONAL)
- Approval chain progress (QC Manager ✅/❌, Production Manager ✅/❌)
- Link to view full CSE / download PDF
- Timeline of approval actions

**How:** 
- Modify `GET /inquiries/:id` to include CSE data per sample (LEFT JOIN `mes_cse_reports`)
- Add CSE summary section per sample card in InquiryDetail

---

### F-006: User Name Consistency Fix

**Priority:** P1  
**Effort:** 30 minutes

**What:** Fix inconsistent `user.name` vs `user.full_name` across 5 backend locations.

**Where:**
- `presales.js` line ~2821: `req.user?.name` → should be `actorName(req.user)`
- `presales.js` line ~2950: same
- `presales.js` line ~3022: same
- Ensure `actorName()` helper is used everywhere for display names

---

### F-007: File Header Documentation ⏳ PENDING

**Priority:** P2  
**Effort:** 1 hour

**What:** Update presales route file headers to document all routes per sub-module.
**Note:** Since ARCH-004 decomposition is complete, each sub-module file already has a header comment describing its purpose. Full JSDoc route documentation per file is remaining.

---

### F-008: Missing Notifications

**Priority:** P1  
**Effort:** 2 hours

**What:** Add in-app notifications for currently un-notified events:

| Event | Recipient | Type |
|-------|-----------|------|
| Prospect approved | Sales Rep (inquiry creator) | `prospect_approved` |
| Prospect rejected | Sales Rep (inquiry creator) | `prospect_rejected` |
| Pre-sales clearance granted | Sales Rep (inquiry creator) | `clearance_granted` |
| Inquiry status changed | Inquiry creator if changed by admin | `inquiry_status_changed` |

---

### Phase F Summary

| ID | Feature | Effort | Priority |
|----|---------|--------|----------|
| F-001 | CSE PDF generation | 4–6h | P1 |
| F-002 | QC evidence upload | 3–4h | P1 |
| F-003 | CSE document viewer | 2–3h | P1 |
| F-004 | Activity log completeness | 2h | P2 |
| F-005 | Sales Rep CSE view | 2h | P1 |
| F-006 | User name consistency | 30m | P1 |
| F-007 | File header docs | 1h | P2 |
| F-008 | Missing notifications | 2h | P1 |
| **Total** | | **~17–20h** | |

---

## 7. Feature Enhancements — Phase G (Professional QC)

> These features transform the QC module from basic to professional-grade, inspired by ERPNext Quality Inspection, iDempiere's quality test system, and industry best practices.

### G-001: QC Inspection Templates

**Inspired by:** ERPNext `quality_inspection_template` DocType

**What:** Pre-defined test parameter templates per product group. When QC starts analysis, the template auto-populates all test parameters with specifications and acceptance criteria.

**How:**
- New table: `mes_qc_templates`
  ```sql
  CREATE TABLE mes_qc_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    product_group VARCHAR(255),
    test_category VARCHAR(100),
    parameters JSONB NOT NULL, -- [{name, spec, min, max, unit, method, acceptance_formula}]
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- Admin UI: Template management page to create/edit templates
- Integration: When QC selects product group in analysis form → auto-load matching template → pre-fill parameters
- Override: QC can still modify/add/remove parameters after template load

**Effort:** 4–5 hours

---

### G-002: Formula-Based Acceptance Criteria

**Inspired by:** ERPNext `acceptance_formula` field in quality_inspection

**What:** Instead of manual pass/fail per parameter, define formulas that auto-evaluate:
```
reading >= min AND reading <= max → PASS
reading > spec * 1.1 → FAIL (>10% deviation)
```

**How:**
- Add `acceptance_formula`, `min_value`, `max_value` to template parameter schema
- Frontend: Auto-calculate pass/fail when QC enters a reading
- Show visual indicator (green/red) immediately

**Effort:** 2–3 hours

---

### G-003: Multiple Readings Per Parameter

**Inspired by:** ERPNext `quality_inspection_reading` child table

**What:** For statistical QC, allow multiple readings per test parameter (e.g., 5 thickness readings at different positions) and auto-calculate mean, std deviation, min, max.

**How:**
- Extend `test_parameters` JSONB to support `readings: [value1, value2, …]`
- Frontend: Add "Multiple Readings" toggle per parameter → shows input for N readings → auto-calculates stats
- Result: `mean`, `std_dev`, `min`, `max`, `status` (all within spec?)

**Effort:** 3–4 hours

---

### G-004: Non-Conformance Reports (NCR)

**Inspired by:** ERPNext `quality_feedback` + `quality_action` DocTypes

**What:** When QC analysis result is FAIL or CONDITIONAL, auto-generate a Non-Conformance Report that tracks corrective actions.

**How:**
- New table: `mes_ncr_reports`
  ```sql
  CREATE TABLE mes_ncr_reports (
    id SERIAL PRIMARY KEY,
    ncr_number VARCHAR(50) UNIQUE, -- NCR-FP-2026-00001
    sample_id INTEGER REFERENCES mes_presales_samples(id),
    analysis_id INTEGER REFERENCES mes_qc_analyses(id),
    category VARCHAR(50), -- 'material', 'process', 'equipment', 'human_error'
    description TEXT,
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    status VARCHAR(30) DEFAULT 'open', -- open → in_progress → resolved → verified → closed
    assigned_to INTEGER, -- responsible person
    due_date DATE,
    resolution_notes TEXT,
    verified_by INTEGER,
    verified_at TIMESTAMP,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- UI: NCR form in QCSampleAnalysis when result is FAIL/CONDITIONAL
- Dashboard: NCR tracker for QC Manager
- Integration: NCR status feeds into CSE approval decision

**Effort:** 5–6 hours

---

### G-005: CSE Multi-Level Comments / Discussion Thread

**Inspired by:** Twenty's timeline activity feed, Metafresh event dispatcher

**What:** Instead of just one "notes" field per approver, add a threaded comment/discussion system on each CSE report. QC Manager, Production Manager, and QC Lab can exchange comments before making a decision.

**How:**
- New table: `mes_cse_comments`
  ```sql
  CREATE TABLE mes_cse_comments (
    id SERIAL PRIMARY KEY,
    cse_id INTEGER REFERENCES mes_cse_reports(id),
    user_id INTEGER,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE, -- internal QC discussion vs visible to sales
    parent_comment_id INTEGER REFERENCES mes_cse_comments(id), -- threading
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- UI: Comment section on CSEApprovalPage with threaded replies
- Notifications: New comment → notify other participants

**Effort:** 3–4 hours

---

### G-006: CSE Revision History Tracking

**Inspired by:** iDempiere's event audit trail, Twenty's workflow versioning

**What:** Track every revision cycle of a CSE. When a CSE is sent back for revision, preserve the previous version's data and show a diff on resubmission.

**How:**
- New table: `mes_cse_revisions`
  ```sql
  CREATE TABLE mes_cse_revisions (
    id SERIAL PRIMARY KEY,
    cse_id INTEGER REFERENCES mes_cse_reports(id),
    revision_number INTEGER,
    test_summary_snapshot JSONB, -- snapshot of analysis at revision time
    action VARCHAR(50), -- 'submitted', 'revision_requested', 'revised', 'approved', 'rejected'
    actor_id INTEGER,
    actor_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- UI: "Revision History" accordion/tab on CSEApprovalPage
- Show: previous versions with side-by-side diff of changed parameters

**Effort:** 3–4 hours

---

### G-007: Sample Progress Tracking (Step-by-Step)

**Inspired by:** iDempiere workflow states, Metafresh document lifecycle

**What:** Visual progress tracker showing exactly where each sample is in the workflow, displayed on InquiryDetail, QCDashboard, and QCScanPage.

**Current state:** QCScanPage has Steps component, but QCSampleAnalysis and InquiryDetail don't.

**How:**
- Shared component: `SampleProgressSteps.jsx`
- Steps: Registered → Submitted → Received → Testing → Evaluated → CSE Review → Approved
- Show who performed each step and when (timestamps from DB)
- Reuse in: QCScanPage (keep), QCSampleAnalysis (add), InquiryDetail per-sample card (add)

**Effort:** 2 hours

---

### G-008: QC Equipment/Instrument Logging

**Inspired by:** iDempiere QualityTest → equipment attributes, ERPNext inspection instrument fields

**What:** Track which equipment/instruments were used for each test parameter. Important for calibration tracking and audit compliance.

**How:**
- New table: `mes_qc_equipment`
  ```sql
  CREATE TABLE mes_qc_equipment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255), -- 'Tensile Tester Model X'
    equipment_code VARCHAR(50), -- 'TT-001'
    category VARCHAR(100), -- 'tensile', 'thickness', 'optical', 'seal'
    calibration_due DATE,
    is_active BOOLEAN DEFAULT TRUE
  );
  ```
- Extend `test_parameters` JSONB schema to include `equipment_id`
- UI: Equipment dropdown per test parameter row in QCSampleAnalysis
- Admin UI: Equipment management page

**Effort:** 3–4 hours

---

### G-009: QC Dashboard Statistics Enhancement

**What:** Enhanced QC dashboard with:
- Trend charts (analyses completed per day/week, pass/fail ratio)
- Turnaround time metrics (submission → analysis → approval average)
- Product group breakdown
- Pending items aging (flagging items pending > 24h, > 48h, > 72h)

**How:**
- Backend: New `GET /qc/analytics` endpoint with aggregated queries
- Frontend: Chart section on QCDashboard using ECharts (already in project)
- Cards: Average turnaround time, Pass rate %, Overdue items count

**Effort:** 4–5 hours

---

### G-010: Batch Sample Analysis

**What:** When multiple samples from the same inquiry have the same product group, allow QC to create a batch analysis with shared test parameters but individual results.

**How:**
- UI: "Batch Analysis" button on QCDashboard when multiple same-group samples are selected
- Backend: New endpoint `POST /qc/batch-analyses` that creates one analysis template but individual analysis records per sample
- Frontend: Tabbed interface showing each sample's results within the shared test parameter framework

**Effort:** 4–5 hours

---

### Phase G Summary

| ID | Feature | Source | Effort | Priority |
|----|---------|--------|--------|----------|
| G-001 | QC inspection templates | ERPNext | 4–5h | P2 |
| G-002 | Formula-based acceptance | ERPNext | 2–3h | P2 |
| G-003 | Multiple readings/parameter | ERPNext | 3–4h | P2 |
| G-004 | Non-Conformance Reports | ERPNext/Metafresh | 5–6h | P2 |
| G-005 | CSE comment thread | Twenty | 3–4h | P2 |
| G-006 | CSE revision history | iDempiere/Twenty | 3–4h | P2 |
| G-007 | Sample progress steps | iDempiere/Metafresh | 2h | P2 |
| G-008 | Equipment logging | iDempiere | 3–4h | P3 |
| G-009 | QC analytics dashboard | — | 4–5h | P2 |
| G-010 | Batch sample analysis | — | 4–5h | P3 |
| **Total** | | | **~34–40h** | |

---

## 8. Feature Enhancements — Phase H (Advanced)

> These are longer-term enhancements that require more significant architectural work.

### H-001: Workflow Automation Engine

**Inspired by:** Twenty's visual workflow builder (17 action types), iDempiere's enterprise workflow engine

**What:** A configurable workflow engine that allows admins to:
- Define approval chains without code changes
- Add conditional routing (e.g., if result is FAIL → skip Production Manager → go to NCR)
- Set SLA timers (e.g., if pending > 48h → auto-escalate → notify management)
- Define automatic actions (e.g., on CSE approval → auto-create quotation template)

**How:**
- New tables: `mes_workflow_definitions`, `mes_workflow_steps`, `mes_workflow_instances`
- Admin UI: Visual workflow configuration
- Runtime: Step resolver that processes transitions based on conditions

**Effort:** 15–20 hours (large feature)

---

### H-002: SLA Tracking & Auto-Escalation

**Inspired by:** ERPNext CRM Opportunity SLA tracking, iDempiere event audit trail

**What:** Track time spent at each workflow stage and alert/escalate when SLAs are breached.

**SLAs:**
| Stage | Target | Escalation |
|-------|--------|------------|
| QC Receipt | 4 hours from submission | Notify QC Manager |
| QC Analysis | 24 hours from receipt | Notify QC Manager |
| QC Manager Review | 24 hours from CSE creation | Notify Management |
| Production Manager Review | 24 hours from QC approval | Notify Management |
| Overall Pre-Sales | 5 business days total | Notify Sales Manager |

**How:**
- Scheduled job (node-cron): Check `mes_cse_reports` and `mes_presales_samples` for overdue items every 30 minutes
- Auto-create notifications for escalation
- Dashboard widget: SLA compliance rate
- Color-coding: Green (on track), Yellow (approaching), Red (breached)

**Effort:** 4–5 hours

---

### H-003: Lost Reason Analytics

**Inspired by:** ERPNext CRM `lost_reason_detail` on Opportunity

**What:** When an inquiry is marked as "Lost", capture structured reason data:
- Reason category: Price, Quality, Lead Time, Competition, Customer Decision, Specification, Other
- Competitor name (if applicable)
- Notes
- Dashboard: Lost reason breakdown chart, win/loss ratio by product group

**How:**
- New table or JSONB field on inquiry: `lost_reason_category`, `lost_reason_notes`, `lost_to_competitor`
- UI: Modal on status → Lost transition
- Dashboard: Chart widget

**Effort:** 2–3 hours

---

### H-004: RFQ Module — Sample-to-Quotation Bridge

**Inspired by:** Metafresh RFQ module with ranking strategy

**What:** After CSE approval, auto-generate a Quotation Request (bridging Pre-Sales → Phase 6: Cost Estimation).

**How:**
- New table: `mes_quotation_requests`
- Pre-fill from CSE: customer info, product group, test results, material requirements
- Link back to inquiry/CSE for traceability
- Status flow: Draft → Submitted → Costed → Quoted → Accepted/Rejected

**Effort:** 8–10 hours (new module)

---

### H-005: Customer Portal — CSE View

**What:** Allow customers to view their CSE report via a secure link (no login required). Useful for sharing test results externally.

**How:**
- Generate unique token per CSE: `CSE-FP-2026-00001-{random_token}`
- Public route: `GET /api/public/cse/:token` → returns CSE data (no auth required)
- UI: Clean, branded report view (like SAR print but for CSE)
- Admin can revoke/regenerate shared links

**Effort:** 3–4 hours

---

### H-006: Kanban Drag-and-Drop for Inquiry Board

**Inspired by:** Twenty's Kanban with position field, Dolibarr's opportunity pipeline

**What:** Enable drag-and-drop status transitions on InquiryBoard.

**How:**
- Use `@dnd-kit/core` or `react-beautiful-dnd`
- Drag card between columns → trigger status update API
- Add position field for ordering within columns
- Validation: certain transitions should be blocked (e.g., can't drag from "Converted" back to "New")

**Effort:** 4–5 hours

---

### H-007: Real-Time Notifications via WebSocket/SSE

**What:** Replace 30-second polling with real-time push notifications.

**How:**
- Backend: Add Socket.IO or Server-Sent Events (SSE) endpoint
- On notification creation → emit to connected user
- Frontend: Replace `setInterval` polling with WebSocket listener
- Benefit: Instant update, reduced server load

**Effort:** 3–4 hours

---

### H-008: Audit Trail — Full Change Log

**Inspired by:** iDempiere's WFEventAudit, Dolibarr's trigger system

**What:** Track every field-level change to inquiry, sample, analysis, and CSE records.

**How:**
- PostgreSQL audit trigger on key tables
- New table: `mes_audit_log` (table_name, record_id, field_name, old_value, new_value, changed_by, changed_at)
- UI: "Change History" panel accessible from InquiryDetail
- Filterable by date range, user, field

**Effort:** 4–5 hours

---

### Phase H Summary

| ID | Feature | Source | Effort | Priority |
|----|---------|--------|--------|----------|
| H-001 | Workflow engine | Twenty/iDempiere | 15–20h | P3 |
| H-002 | SLA tracking | ERPNext | 4–5h | P2 |
| H-003 | Lost reason analytics | ERPNext | 2–3h | P2 |
| H-004 | RFQ bridge module | Metafresh | 8–10h | P3 |
| H-005 | Customer portal CSE | — | 3–4h | P3 |
| H-006 | Kanban drag-and-drop | Twenty | 4–5h | P3 |
| H-007 | Real-time notifications | — | 3–4h | P3 |
| H-008 | Full audit trail | iDempiere/Dolibarr | 4–5h | P2 |
| **Total** | | | **~44–56h** | |

---

## 9. Reference App Feature Adoption

### Features Borrowed by Source

| Source App | Features Adopted | Phase |
|-----------|-----------------|-------|
| **ERPNext** | QC templates (G-001), formula acceptance (G-002), multiple readings (G-003), NCR reports (G-004), SLA tracking (H-002), lost reasons (H-003) | G, H |
| **Dolibarr** | PDF generation pattern (F-001), trigger system concept (F-008), file header docs (F-007) | F |
| **Twenty** | Comment threads (G-005), workflow engine concept (H-001), Kanban DnD (H-006), revision history (G-006) | G, H |
| **iDempiere** | Equipment logging (G-008), audit trail (H-008), workflow versioning (H-001) | G, H |
| **Metafresh** | Document lifecycle (G-007), RFQ module (H-004), event dispatcher (F-008) | F, G, H |

### Features NOT Adopted (and why)

| Feature | Source | Reason for Exclusion |
|---------|--------|---------------------|
| Role-based task pool (4 modes) | iDempiere | Current team is small; fixed role assignment is sufficient for now |
| Full document versioning system | Dolibarr ECM | Overkill for current needs; revision history (G-006) covers the requirement |
| Tree-based quality procedures | ERPNext | Current flat parameter list is simpler and sufficient for FP QC |
| Multi-currency quotation | Metafresh | Not relevant for pre-sales phase; would be considered for Phase 6 |
| Platform-wide BPMN engine | iDempiere | H-001 (simpler workflow engine) addresses the core need without full BPMN complexity |

---

## 10. Architecture Improvements

### ARCH-001: Centralized HTTP Client

**What:** Replace per-component `localStorage.getItem('auth_token')` with a shared axios instance from AuthContext.

**How:**
- AuthContext already has an axios interceptor for token refresh
- Create `useApi()` hook that returns the pre-configured axios instance
- Migrate all components to use `const api = useApi(); api.get('/api/...')`

**Effort:** 3–4 hours  
**Benefit:** Single place for auth headers, automatic token refresh, consistent error handling

---

### ARCH-002: Consistent CSS Strategy

**What:** Standardize styling approach across PreSales (CSS file) and QC (inline styles).

**Recommendation:** Move QC components to CSS modules or extend PresalesInquiries.css with QC-specific sections. Use CSS custom properties for theming consistency.

**Effort:** 3–4 hours  
**Benefit:** Consistent look, easier theme changes, better maintainability

---

### ARCH-003: Shared Role-Check Utilities

**What:** Client-side mirrors of `canAccessQCDashboard`, `canAccessCSEWorkflow`, etc.

**How:**
- Create `src/utils/roleChecks.js` with exported functions
- Import in components that need role-based UI decisions
- Keep in sync with backend checks in presales.js

**Effort:** 1 hour  
**Benefit:** DRY role logic, easier to maintain

---

### ARCH-004: presales.js Route File Decomposition ✅ COMPLETED

**What:** The 4443-line presales.js monolith decomposed into 14 focused modules.

**Implemented structure:**
```
server/routes/mes/presales/
├── index.js          (router + param validators, requires all sub-modules)
├── _helpers.js       (shared imports, multer, constants, 12 helper functions)
├── lookups.js        (2 routes: sales-reps, product-groups)
├── inquiries.js      (10 routes: CRUD, status, stats, history, clearance, phase, kanban)
├── prospects.js      (5 routes: CRUD, approve, reject, register)
├── attachments.js    (3 routes: upload, list, delete)
├── samples.js        (8 routes: registration, status+SLA, submit-to-qc, recall, qc-result, scan)
├── qc.js             (8 routes: inbox, stats, batch-receive, batch-analyses, analyses CRUD, submit)
├── cse.js            (12 routes: list, detail, approve/reject/revision, share, public, comments, revisions)
├── checks.js         (10 routes: MOQ CRUD+status, material CRUD+status)
├── equipment.js      (5 routes: equipment CRUD, equipment-used)
├── templates.js      (4 routes: template CRUD, soft-delete)
├── ncr.js            (5 routes: NCR CRUD+stats)
└── analytics.js      (5 routes: lost-reasons, SLA, QC analytics, audit trail, admin audit)
```

**Pattern:** Sub-modules export `function(router) { ... }` sharing a single router with param validators.
**Old file:** `presales.js` renamed to `presales.js.bak` (Node.js resolves `require('presales')` → `presales/index.js` transparently).

**Effort:** 4–5 hours  
**Benefit:** Each file < 500 lines, 77 routes across 13 feature modules

---

## 11. Updated Document Structure

After implementing this plan, the documentation should be updated:

| Document | Current State | Action |
|----------|---------------|--------|
| PRESALES_PROCESS_FLOW.md | Accurate but needs F/G/H additions | ✏️ Update after each phase |
| QC_SAMPLE_EVALUATION_PLAN.md | Complete for Phases A–E | ✏️ Add F/G/H sections |
| MES_IMPLEMENTATION_PROGRESS.md | Tracks Phase 1 only | ✏️ Major update needed (Phases A–H) |
| MES_WORKFLOW_LANDING_PAGE_IMPLEMENTATION_PLAN.md | Static reference | ✅ No change needed |
| MES_PHASE_1_COMPLETE_README.md | Accurate | ✅ No change needed |
| MES_QUICK_START.md | Accurate | ✏️ Add QC quick start steps |
| **PRESALES_QC_MASTER_PLAN.md** (this file) | New | ✅ Created |

---

## 12. Implementation Roadmap

### Sprint 1 — Critical Fixes + Navigation (3–4 days)

| Day | Items | Details |
|-----|-------|---------|
| **Day 1 AM** | BUG-001 | Fix SQL injection in sample status route |
| **Day 1 AM** | BUG-002 | Fix race condition with transaction + FOR UPDATE |
| **Day 1 PM** | SEC-001 | Add ownership/role checks to 15 unprotected routes |
| **Day 1 PM** | SEC-002 | Replace error message leakage in all 49 routes |
| **Day 2 AM** | SEC-003 | Add parseInt validation on route params |
| **Day 2 AM** | BUG-003 | Fix silent partial failures in InquiryCapture |
| **Day 2 PM** | F-006 | Fix user name inconsistency |
| **Day 2 PM** | UX-001 | Fix stale auth tokens in QC components |
| **Day 3 AM** | NAV-B1, NAV-B2 | Add `manager` to CRM `FULL_ACCESS_ROLES` + Dashboard `requiredRole` |
| **Day 3 AM** | NAV-U1 | Add navigation header to QCDashboard (back, settings, profile) |
| **Day 3 PM** | NAV-U2 | Add "Back to MES" button to JobFlowTracker + DeptDashboard |
| **Day 3 PM** | NAV-U4 | Fix Settings "Back to Dashboard" → use `navigate('/modules')` |
| **Day 3 PM** | NAV-U6 | Add 404 catch-all route in App.jsx |
| **Day 4 AM** | NAV-U7 | Extract shared SALES_ROLES / MES_ONLY_ROLES constants |
| **Day 4 AM** | NAV-U8 | Guard `/platform` route with `isPlatformAdmin` check |
| **Day 4 AM** | NAV-U11 | Fix QC-by-department login redirect (skip /modules) |
| **Day 4 PM** | Testing | End-to-end testing of all 13 user types: login → dashboard → navigation |

**Deliverable:** Secure, stable foundation + proper navigation for every user type

---

### Sprint 2 — UX Polish + Phase F (4–5 days)

| Day | Items | Details |
|-----|-------|---------|
| **Day 1** | UX-002 to UX-005 | Search debounce, inline component, confirm dialogs, required rejection notes |
| **Day 1** | UX-007 to UX-012 | Country field, DOM anti-pattern, missing form fields, attachment downloads, auto-refresh, date columns |
| **Day 2** | UX-013, UX-014 | Error boundary, role guard |
| **Day 2** | F-008 | Missing notifications (prospect, clearance) |
| **Day 3** | F-001 | CSE PDF generation |
| **Day 4 AM** | F-002 | QC evidence file upload |
| **Day 4 PM** | F-003 | CSE document viewer component |
| **Day 5** | F-004, F-005 | Activity log completeness, Sales Rep CSE view |

**Deliverable:** Professional, polished UX

---

### Sprint 3 — Professional QC (Phase G, 5–7 days)

| Day | Items | Details |
|-----|-------|---------|
| **Day 1** | G-001 | QC inspection templates (table + admin UI + auto-fill) |
| **Day 2** | G-002, G-003 | Formula-based acceptance + multiple readings |
| **Day 3** | G-004 | Non-Conformance Reports |
| **Day 4** | G-005, G-006 | CSE comments thread + revision history |
| **Day 5** | G-007, G-009 | Sample progress steps + QC analytics dashboard |
| **Day 6** | UX-006 | InquiryDetail decomposition into sub-components |
| **Day 7** | ARCH-001, ARCH-003 | Centralized HTTP client + shared role utilities |

**Deliverable:** Professional QC lab workflow with templates, NCRs, and analytics

---

### Sprint 4 — Advanced Features (Phase H, 5–7 days)

| Day | Items | Details |
|-----|-------|---------|
| **Day 1** | H-002 | SLA tracking + auto-escalation |
| **Day 2** | H-003 | Lost reason analytics |
| **Day 3** | G-008, G-010 | Equipment logging + batch analysis |
| **Day 4** | H-006, H-007 | Kanban DnD + real-time notifications |
| **Day 5** | H-005, H-008 | Customer portal CSE + audit trail |
| **Day 6–7** | ARCH-002, ARCH-004 | CSS standardization + presales.js decomposition |

**Deliverable:** Advanced workflow automation, analytics, and real-time features

---

### Future (Not in this plan)

| Feature | Phase | Notes |
|---------|-------|-------|
| H-001: Full workflow engine | Phase I | ⏳ Deferred — P3, 15-20h, requires significant BPMN architecture |
| H-004: RFQ bridge module | Phase I | ⏳ Deferred — P3, 8-10h, connects pre-sales to quotation (Phase 6) |
| F-007: File header documentation | Pending | ⏳ Remaining — P2, 1h, update JSDoc per sub-module |
| Production-side modules | Phases 6–17 | MES workflow stages 2–5 |
| TypeScript migration | Ongoing | Can be done incrementally per component |

---

## 13. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **SQL injection exploited before fix** | Low (internal users only) | Critical | Fix BUG-001 on Day 1 |
| **Role system confusion** (legacy `user` role vs planned QC roles) | Medium | Medium | Department-based access control (already implemented) handles this. Document the mapping. |
| **Migration breaks existing data** | Low | High | Always backup before migration. Test in staging first. |
| **InquiryDetail decomposition breaks existing features** | Medium | Medium | ✅ Completed — Sprint 3. Build passes, old file removed. |
| **presales.js split introduces routing bugs** | Medium | Medium | ✅ Completed — Sprint 4. All 77 routes across 13 sub-modules verified. |
| **Feature creep** | High | Medium | This plan is approval-gated. No implementation without sign-off per sprint. |
| **QC template maintenance burden** | Low | Low | Keep templates simple (JSONB). Admin can manage. |

---

## Appendix A: File Inventory

### Backend files to modify

| File | Sprint | Changes |
|------|--------|---------|
| `server/routes/mes/presales.js` | S1, S2, S3 | Security, fixes, new routes |
| `server/services/notificationService.js` | S2 | New notification types |
| `server/services/authService.js` | — | Already fixed (department in JWT) |
| `server/middleware/auth.js` | — | Already fixed (department exposed) |

### Backend files to create

| File | Sprint | Purpose |
|------|--------|---------|
| `server/migrations/mes-qc-003-templates.js` | S3 | QC templates, equipment tables |
| `server/migrations/mes-qc-004-ncr-comments.js` | S3 | NCR, CSE comments, revision history |
| `server/migrations/mes-qc-005-audit-sla.js` | S4 | Audit log, SLA tracking |

### Frontend files to modify

| File | Sprint | Changes |
|------|--------|---------|
| `src/components/MES/PreSales/InquiryCapture.jsx` | S1 | Fix partial failure handling |
| `src/components/MES/PreSales/InquiryDetail.jsx` | S2, S3 | UX fixes, then decomposition |
| `src/components/MES/PreSales/InquiryBoard.jsx` | S2 | Debounce, extract InquiryCard |
| `src/components/MES/PreSales/NewCustomerModal.jsx` | S2 | Add contact fields |
| `src/components/MES/PreSales/QCScanPage.jsx` | S2 | File downloads, role guard |
| `src/components/MES/QC/QCDashboard.jsx` | S2, S3 | Auto-refresh, date columns, analytics |
| `src/components/MES/QC/QCSampleAnalysis.jsx` | S2, S3 | Confirm dialog, evidence upload, templates |
| `src/components/MES/QC/CSEApprovalPage.jsx` | S2, S3 | Confirm dialogs, required notes, comments |
| `src/components/MES/QC/CSEApprovalQueue.jsx` | S2 | Date column |
| `src/components/MES/index.jsx` | S2 | Error boundary |

### Frontend files to create

| File | Sprint | Purpose |
|------|--------|---------|
| `src/hooks/useApi.js` | S3 | Centralized HTTP client hook |
| `src/utils/roleChecks.js` | S3 | Shared role-check utilities |
| `src/components/MES/QC/CSEDocument.jsx` | S2 | CSE printable document viewer |
| `src/components/MES/QC/NCRForm.jsx` | S3 | Non-Conformance Report form |
| `src/components/MES/QC/QCTemplateManager.jsx` | S3 | Admin template management |
| `src/components/MES/QC/QCAnalytics.jsx` | S3 | QC dashboard analytics charts |
| `src/components/MES/QC/SampleProgressSteps.jsx` | S3 | Reusable progress indicator |
| `src/components/MES/PreSales/InquiryHeader.jsx` | S3 | Extracted from InquiryDetail |
| `src/components/MES/PreSales/SamplesPanel.jsx` | S3 | Extracted from InquiryDetail |
| `src/components/MES/PreSales/ProspectPanel.jsx` | S3 | Extracted from InquiryDetail |
| `src/components/MES/PreSales/ClearancePanel.jsx` | S3 | Extracted from InquiryDetail |
| `src/components/MES/PreSales/ActivityTimeline.jsx` | S3 | Extracted from InquiryDetail |

---

## Appendix B: Database Schema Changes

### Sprint 1 — No schema changes

### Sprint 2

```sql
-- Add analysis_id to attachments for QC evidence linking
ALTER TABLE inquiry_attachments ADD COLUMN analysis_id INTEGER REFERENCES mes_qc_analyses(id);
```

### Sprint 3

```sql
-- QC Inspection Templates
CREATE TABLE mes_qc_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  product_group VARCHAR(255),
  test_category VARCHAR(100),
  parameters JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- QC Equipment Registry
CREATE TABLE mes_qc_equipment (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  equipment_code VARCHAR(50) UNIQUE,
  category VARCHAR(100),
  calibration_due DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Non-Conformance Reports
CREATE TABLE mes_ncr_reports (
  id SERIAL PRIMARY KEY,
  ncr_number VARCHAR(50) UNIQUE NOT NULL,
  sample_id INTEGER REFERENCES mes_presales_samples(id),
  analysis_id INTEGER REFERENCES mes_qc_analyses(id),
  inquiry_id INTEGER REFERENCES mes_presales_inquiries(id),
  category VARCHAR(50),
  description TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  status VARCHAR(30) DEFAULT 'open',
  assigned_to INTEGER,
  due_date DATE,
  resolution_notes TEXT,
  verified_by INTEGER,
  verified_at TIMESTAMP,
  created_by INTEGER,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CSE Comments / Discussion Thread
CREATE TABLE mes_cse_comments (
  id SERIAL PRIMARY KEY,
  cse_id INTEGER NOT NULL REFERENCES mes_cse_reports(id),
  user_id INTEGER NOT NULL,
  user_name VARCHAR(255),
  user_role VARCHAR(50),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  parent_comment_id INTEGER REFERENCES mes_cse_comments(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cse_comments_cse ON mes_cse_comments(cse_id);

-- CSE Revision History
CREATE TABLE mes_cse_revisions (
  id SERIAL PRIMARY KEY,
  cse_id INTEGER NOT NULL REFERENCES mes_cse_reports(id),
  revision_number INTEGER NOT NULL,
  test_summary_snapshot JSONB,
  action VARCHAR(50) NOT NULL,
  actor_id INTEGER,
  actor_name VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cse_revisions_cse ON mes_cse_revisions(cse_id);
```

### Sprint 4

```sql
-- Full Audit Log
CREATE TABLE mes_audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id INTEGER NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  action VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  changed_by INTEGER,
  changed_by_name VARCHAR(255),
  changed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_table_record ON mes_audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON mes_audit_log(changed_at);

-- Inquiry lost reason tracking
ALTER TABLE mes_presales_inquiries
  ADD COLUMN lost_reason_category VARCHAR(50),
  ADD COLUMN lost_reason_notes TEXT,
  ADD COLUMN lost_to_competitor VARCHAR(255);

-- CSE shared link tokens
ALTER TABLE mes_cse_reports
  ADD COLUMN share_token VARCHAR(100) UNIQUE,
  ADD COLUMN share_token_created_at TIMESTAMP;
```

---

---

## 14. Login & Dashboard Journey Review

> **Added:** 2026-02-25 — Full code-level trace of every user type's login → landing → dashboard → navigation experience.

### 14.1 Navigation Matrix

| User Type | Login → | Modules | MIS | CRM | MES | Settings | Profile | Back to Home |
|-----------|---------|---------|-----|-----|-----|----------|---------|--------------|
| **Admin** | /modules | 3 cards | Full | Admin view | Full | All tabs | Yes | N/A (is home) |
| **Manager** | /modules | 3 cards | **BLOCKED** | **Sales rep view (BUG)** | Full | Limited | Yes | N/A |
| **Sales Mgr** | /crm | Via back btn | Full | Admin view | Full | Via dropdown | Via dropdown | ← Modules |
| **Sales Coord** | /crm | Via back btn | Full | Admin view | Full | Via dropdown | Via dropdown | ← Modules |
| **Sales Rep** | /crm | Via back btn | Blocked | Personal view | Full | Via dropdown | Via dropdown | ← Modules |
| **QC Lab** | /mes | **No link** | Blocked | Blocked | QC only | **No link** | **No link** | **NONE** |
| **QC Manager** | /mes | **No link** | Blocked | Blocked | QC only | **No link** | **No link** | **NONE** |
| **Prod Mgr** | /mes | Via back (1 card) | Blocked | Blocked | Prod depts | Via URL only | Via URL only | ← button |
| **Operator** | /mes | Via back (1 card) | Blocked | Blocked | Prod depts | Via URL only | Via URL only | ← button |
| **Logistics** | /mes | Via back (1 card) | Blocked | Blocked | Logi depts | Via URL only | Via URL only | ← button |
| **Accounts** | /mes | Via back (1 card) | Blocked | Blocked | Acct depts | Via URL only | Via URL only | ← button |
| **Stores** | /mes | Via back (1 card) | Blocked | Blocked | Logi depts | Via URL only | Via URL only | ← button |
| **Platform** | /platform | Via URL only | Depends | Depends | Depends | Via dropdown | Via dropdown | **NONE** |

**Legend:** "Via URL only" = no visible link in the UI. "Blocked" = ProtectedRoute redirects silently. "NONE" = no mechanism at all.

---

### 14.2 Per-User Journey Details

#### Admin (`role='admin'`)
- **Login → /modules** → ModuleSelector with 3 cards (MIS, CRM, MES)
- **MIS dashboard:** Full access with Divisional/Sales/AI sub-views. Has "Back to Modules" button.
- **CRM:** AdminCRMDashboard + full 9 tabs (Overview, Reports, Budget, Customers, Pre-Sales, Prospects, Map, Products, Sales Team). "← Modules" back button.
- **MES:** WorkflowLandingPage with all departments, all quick links. "← Back" to /modules.
- **Settings:** All tabs: Company Info, Periods, Master Data, Appearance, Backup, Admin, Deploy (localhost only).
- **People & Access:** Admin-only route, passes ProtectedRoute.
- **⚠️ Issue:** Settings "Back to Dashboard" uses `window.location.href='/dashboard'` (full reload, should be /modules).

#### Manager (`role='manager'`) — ⛔ MULTIPLE BUGS
- **Login → /modules** → ModuleSelector shows 3 cards (MIS, CRM, MES)
- **MIS → BLOCKED:** ProtectedRoute `requiredRole=['admin','sales_manager','sales_coordinator']` does NOT include `manager`. Silently redirected to /crm.
- **CRM → WRONG VIEW:** `FULL_ACCESS_ROLES` in CRMModule.jsx = `['admin','sales_manager','sales_coordinator']` — `manager` missing. Gets CRMDashboard (personal sales rep view) with limited tabs. CRM tries to load personal sales rep data which doesn't exist for a manager → likely empty/broken state.
- **MES:** Works fine — WorkflowLandingPage with full access.
- **Settings:** Only Periods + Appearance (non-admin). No People & Access.

#### Sales Manager (`role='sales_manager'`) — ✅ Cleanest journey
- **Login → /crm** → AdminCRMDashboard with full 9 tabs
- Can reach /dashboard (MIS), /mes, and all modules via "← Modules" back button.
- No issues.

#### Sales Coordinator (`role='sales_coordinator'`) — ✅
- Identical to Sales Manager in every respect.

#### Sales Rep / Sales Executive (`role='sales_rep'` or `'sales_executive'`) — ✅
- **Login → /crm** → CRMDashboard (personal) with avatar + name + designation.
- Tabs: Overview, My Report, Pre-Sales, Budget, My Customers, My Prospects, My Map.
- Cannot reach /dashboard (MIS) — redirected to /crm. Can reach /mes.
- "← Modules" shows CRM + MES cards (no MIS).

#### Legacy User (`role='user'`) — ⚠️ Extra click for QC dept
- **Login → /modules** (not in SALES_ROLES or MES_ONLY_ROLES → default)
- ModuleSelector shows only MES card.
- If `dept='QC'`: must click MES → QCDashboard (extra pointless click-through).
- If no QC dept: MES → WorkflowLandingPage with default config.

#### QC Lab / QC Manager (`role='quality_control'`, `'qc_lab'`, `'qc_manager'`) — ⛔ TRAPPED
- **Login → /mes** → MESModule detects QC → QCDashboard directly.
- Stats: Pending Receipt, Received, Testing, Completed Today. 3 tables with batch receive.
- **CRITICAL:** No back button, no module switch, no settings/profile links. User is trapped with no navigation chrome.
- Can navigate to /mes/qc/samples/:id and /mes/approvals (CSE). That's it.
- Cannot reach /crm (redirected to /mes). Cannot reach /modules without typing URL.

#### Production Manager / Operator (`role='production_manager'`, `'operator'`)
- **Login → /mes** → WorkflowLandingPage with production config.
- Quick links: Job Flow Tracker, Dept Dashboard. Sidebar depts: Production, QC, Procurement, Maintenance.
- Has "←" back to /modules (but only sees 1 MES card there).
- **Issue:** Sub-pages (/mes/flow, /mes/flow/dept) have NO back navigation to WorkflowLandingPage.
- No role differentiation between production_manager and operator.

#### Logistics Manager / Stores Keeper (`role='logistics_manager'`, `'stores_keeper'`)
- **Login → /mes** → WorkflowLandingPage with logistics config.
- Same sub-page navigation gap as production.
- Stores Keeper treated identically to Logistics Manager.

#### Accounts Manager / Accountant (`role='accounts_manager'`, `'accountant'`)
- **Login → /mes** → WorkflowLandingPage with accounts config.
- Same sub-page navigation gap. Accounts users can see "sales" department filter which may be confusing.

#### Platform Admin (`isPlatformAdmin` flag)
- **Login → /platform** → PlatformDashboard (company management, stats, companies table).
- Menu: Companies, Subscription Plans. User dropdown: Profile, Settings, Logout.
- **Issue:** No way to switch to company modules (/crm, /mes, /dashboard) from the UI. Platform route not guarded at route level — any logged-in user can access it.

---

### 14.3 Bugs — Logic Errors

| ID | Issue | File(s) | Impact | Sprint |
|----|-------|---------|--------|--------|
| **NAV-B1** | Manager excluded from CRM `FULL_ACCESS_ROLES` | CRMModule.jsx | Manager sees sales-rep personal view with no data | S1 |
| **NAV-B2** | Manager excluded from Dashboard `requiredRole` | App.jsx | Manager clicks MIS → redirected to /crm instead of MIS | S1 |
| **NAV-B3** | Manager CRM crash risk — loads personal sales rep data that doesn't exist | CRMModule.jsx | Empty/broken state for My Report, My Customers, etc. | S1 (fixed by NAV-B1) |

### 14.4 Critical UX Gaps

| ID | Issue | File(s) | Impact | Sprint |
|----|-------|---------|--------|--------|
| **NAV-U1** | QC users trapped — zero navigation chrome | QCDashboard.jsx | No back button, no module switch, no settings/profile. Only escape is browser back. | S1 |
| **NAV-U2** | MES sub-pages have no back navigation | JobFlowTracker, DeptDashboard | After clicking Flow or Dept, no way back to WorkflowLandingPage | S1 |
| **NAV-U3** | Platform Admin isolated | PlatformDashboard | No way to switch to company modules from the platform UI | S2 |

### 14.5 Medium Issues

| ID | Issue | File(s) | Impact | Sprint |
|----|-------|---------|--------|--------|
| **NAV-U4** | Settings "Back to Dashboard" uses `window.location.href='/dashboard'` | Settings.jsx | Full page reload + redirect chain for non-MIS users | S1 |
| **NAV-U5** | No onboarding/welcome for any user type | Entire app | Generic "Welcome Back!" for everyone, no role-specific guidance | S2 |
| **NAV-U6** | No 404/catch-all route | App.jsx | Undefined paths show blank page | S1 |
| **NAV-U7** | SALES_ROLES defined in 3+ files | Login.jsx, App.jsx, WorkflowLandingPage.jsx | Same array copy-pasted. Risk of drift when roles change. | S1 |
| **NAV-U8** | `/platform` route not guarded by `isPlatformAdmin` | App.jsx | Any logged-in user can reach the route | S1 |

### 14.6 Low / Cosmetic Issues

| ID | Issue | Impact |
|----|-------|--------|
| **NAV-U9** | Inconsistent navigation patterns per module | ModuleSelector: dropdown. CRM admin: back button. CRM rep: avatar header. MES: sidebar+topbar. QCDashboard: nothing. Every module feels different. |
| **NAV-U10** | MES-only roles see single-card ModuleSelector | Pointless click-through when they already land at /mes. |
| **NAV-U11** | QC-by-department (`role='user'` + `dept='QC'`) gets extra click to reach QCDashboard | Login goes to /modules first instead of /mes directly. |
| **NAV-U12** | No role differentiation: Operator = Production Manager | Identical config, no write/read permission differences. |
| **NAV-U13** | No role differentiation: QC Manager = QC Lab | No management-level features for qc_manager. |
| **NAV-U14** | Accounts users see "sales" department filter | May show flow boxes they can't act on. |

### 14.7 Recommended Fix Priority (Top 5)

1. **NAV-B1 + NAV-B2:** Add `'manager'` to `FULL_ACCESS_ROLES` in CRMModule.jsx AND to Dashboard's `requiredRole` in App.jsx — fixes all 3 manager bugs. **~15 min.**
2. **NAV-U1:** Add navigation header to QCDashboard — back button + settings gear + profile link. **~1 hour.**
3. **NAV-U2:** Add "← Back to MES" button to JobFlowTracker and DeptDashboard. **~30 min.**
4. **NAV-U6:** Add 404 catch-all route in App.jsx. **~15 min.**
5. **NAV-U4:** Fix Settings back button: `navigate('/modules')` instead of `window.location.href='/dashboard'`. **~10 min.**

**Total estimated effort for all Section 14 Sprint 1 items: ~4 hours.**

---

*End of Master Plan — Awaiting approval before implementation.*
