# PPH v26.4 — VERIFIED Implementation Plan
**Date:** 2026-04-03  
**Based on:** Line-by-line code verification of `PPH_MES_CRM_DEFINITIVE_AUDIT_v26.4.md`

---

## Implementation Status (Updated 2026-04-03)

| Phase | Status |
|-------|--------|
| Phase 1 — Critical Fixes (7 items) | ✅ ALL DONE |
| Phase 2 — Data Integrity (6 items) | ✅ ALL DONE |
| Phase 3 — Code Quality (4 items) | ✅ ALL DONE |
| Phase 4 — File Splits (3 items) | ✅ ALL DONE |
| Phase 5 — UX Enhancements (3 recommended) | ✅ ALL DONE |
| BUG-11 — Lifecycle ↔ Status Sync | ✅ DONE |

---

## Verification Summary

Each audit point was checked against the actual source code. Items marked **CONFIRMED** are real and need fixing. Items marked **REJECTED** are wrong or already fixed. Items marked **DOWNGRADED** are real but less severe than the audit claims.

---

## PART A — CONFIRMED BUGS (Verified, Need Fix)

### ✅ BUG-01 · `Space` not imported in `JobCardPanel.jsx` — CONFIRMED CRASH
- **Verdict:** The import on line 5 does NOT include `Space`, but `<Space>` is used at line 123.
- **Severity:** Runtime crash when rendering a draft job card with approve buttons.
- **Fix:** Add `Space` to the antd import.

### ✅ BUG-02 · `EstimationCalculator.jsx` uses standalone `message` — CONFIRMED
- **Verdict:** Line 12 imports `message` directly from antd. Used at 7 call sites (lines 173, 255, 257, 406, 408, 429, 432). Violates App.useApp() convention.
- **Fix:** Remove `message` from import, use `const { message } = App.useApp()`.

### ✅ BUG-03 · `GET /job-cards` ignores `inquiry_id` query param — CONFIRMED
- **Verdict:** Route at `jobCards.js` lines 122–152 filters by status/date/rep-group only. Frontend sends `?inquiry_id=X` but backend ignores it, returning all cards. Client-side `.find()` filters afterward. Admin users get every job card returned.
- **Fix:** Add `inquiry_id` WHERE clause with parameterized query.

### ✅ BUG-04 · `generateQuotationNumber` race condition — CONFIRMED
- **Verdict:** Both `generateQuotationNumber` (line ~107) and `generateJobNumber` (jobCards.js line ~19) use `SELECT last_value, is_called` + `setval` + `nextval` without advisory lock. Two concurrent transactions can read the same `is_called=false` state.
- **Fix:** Add `pg_advisory_xact_lock` at the start of both functions.

### ✅ BUG-05 · `JobCardForm.jsx` BOM rows use index key — CONFIRMED
- **Verdict:** Line 104: `rowKey={(_, i) => i}`.
- **Fix:** Use stable row ID via useRef counter.

### ✅ BUG-06 · `JobCardPanel.jsx` rowKey is index-based — CONFIRMED
- **Verdict:** Line 118: `rowKey={(_, i) => i}` on BOM table.
- **Fix:** Use composite key from row data.

### ✅ BUG-07 · `MESErrorBoundary.componentDidCatch` uses `console.error` — CONFIRMED
- **Verdict:** `src/components/MES/index.jsx` line ~39: `console.error('MES module load error:', err)`.
- **Severity:** LOW. Browser devtools catches it anyway. Violates AGENT.md D4 but not a functional bug.
- **Fix:** Remove console.error or replace.

### ✅ BUG-08 · `getSalesRepGroup` fuzzy fallback — CONFIRMED
- **Verdict:** `_helpers.js` lines 62–69: Falls back to `ILIKE '%firstName%'` which can match wrong group.
- **Fix:** Remove fuzzy fallback. Return null and log a warning.

### ✅ BUG-09 · Draft estimation burns quotation number — CONFIRMED
- **Verdict:** `estimation.js` line 121: `generateQuotationNumber(client)` is called on every first save, even for drafts. The quotation number is permanently consumed.
- **Fix:** Insert with `quotation_number = NULL` for drafts. Only generate number when explicitly promoting via `POST /estimations/:id/create-quotation`.

### ✅ BUG-10 · `mes_job_cards` missing `division` column — CONFIRMED
- **Verdict:** Migration `mes-presales-015-job-cards.js` creates the table with no division column.
- **Fix:** Migration to add `division VARCHAR(10) DEFAULT 'FP'` + index.

### ✅ BUG-11 · `InquiryBoard` kanban columns vs lifecycle mismatch — CONFIRMED
- **Verdict:** 5 columns based on `status` (new/in_progress/converted/lost/on_hold). The 20-stage lifecycle in `inquiry_stage` is hidden behind a badge only. Drag-drop changes `status` but not `inquiry_stage`.
- **Severity:** Design issue, not a crasher. Leads to data inconsistency.
- **Fix:** Medium-term redesign (see Part C).

### ✅ BUG-12 · Duplicate `CurrencySymbol` components — CONFIRMED
- **Verdict:** Both `src/components/common/CurrencySymbol.jsx` and `src/components/dashboard/CurrencySymbol.jsx` exist. Dashboard version imports from common version.
- **Severity:** LOW — functional duplication, not a bug.
- **Fix:** Consolidate to one component.

### ✅ BUG-13 · `key={i}` violations — PARTIALLY CONFIRMED
- **Confirmed in:**
  - `BOMConfigurator.jsx:311` — `key={i}` on warning list items (file is at `MasterData/` not `PreSales/`)
  - `SamplesSection.jsx:402` — `key={i}` (file is at `InquiryDetail/SamplesSection.jsx` not directly under `PreSales/`)
  - `WinLossAnalytics.jsx:146, 153` — `key={i}`
  - `WorkflowLandingPage.jsx:612, 637, 652` — `key={i}`
- **Note:** File paths in audit were slightly wrong but the bugs are real.

### ✅ BUG-14 · `EstimationCalculator.jsx` exceeds line limit — CONFIRMED (567 lines)
- **Audit said:** 624 lines. **Actual:** 567 lines. Still over 300 limit.

### ✅ BUG-15 · `InquiryBoard.jsx` exceeds line limit — CONFIRMED (533 lines)
- **Audit said:** 576 lines. **Actual:** 533 lines. Still over 300 limit.

---

## PART B — REJECTED OR ALREADY FIXED

### ❌ Q2 — `flow.js` queries `mes_job_tracker` without division filter — REJECTED
- **Verdict:** All `mes_job_tracker` queries in `flow.js` include `j.division = $1` with `DIVISION = 'FP'`. Audit was wrong.

### ❌ BUG-05/P5 — customerPO stage guard missing — ALREADY EXISTS
- **Verdict:** `customerPO.js` line 30 already guards: `if (!['price_accepted', 'sample_approved'].includes(inq.inquiry_stage))`. Audit claim P5 is wrong.

### ❌ TD-001 on `universal.js` — ALREADY FIXED
- **Verdict:** `universal.js` now uses parameterized queries for division. Only `divisionMergeRules.js` still has the injection risk.

---

## PART C — CONFIRMED NON-BUG ISSUES

### ✅ HC Cleanup — ALL CONFIRMED
| File | HC Reference | Status |
|---|---|---|
| `server/routes/mes/qc-certificates.js` | `VALID_DIVISIONS = ['FP', 'HC']` | Confirmed line 24 |
| `server/routes/mes/qc-incoming-rm.js` | `VALID_DIVISIONS = ['FP', 'HC']` | Confirmed line 24 |
| `server/routes/rmSync.js` | HC in CASE statement | Confirmed line 77 |
| `server/routes/sales-rep-group-allocation.js` | HC ternaries | Confirmed lines 1040, 2553, 2825 |
| `server/routes/aebf/*.js` | JSDoc + table name HC refs | Confirmed across all 3 files |

### ✅ TD-001 — SQL Injection in `divisionMergeRules.js` — CONFIRMED CRITICAL
- **Verdict:** `extractDivisionCode(division)` does `division.split('-')[0].toLowerCase()` then interpolates into table names like `${code}_actualcommon` directly in SQL. Not parameterized. Exploitable.

### ✅ TD-002 — `server/config/database.js` still exists — CONFIRMED
- **Verdict:** File exists. Creates confusion with the canonical `server/database/config.js`.

### ✅ WorkflowLandingPage.jsx — 904 lines (not mentioned separately in bugs but worse than audit said)

---

## PART D — IMPLEMENTATION PLAN (Priority Order)

### 🔴 PHASE 1 — Critical Fixes (Single Session)

These are bugs that cause crashes, data corruption, or security issues.

| # | Task | Confirmed Bug | Files to Edit |
|---|---|---|---|
| **1.1** | Fix Space import in JobCardPanel | BUG-01 | `src/components/MES/PreSales/JobCardPanel.jsx` |
| **1.2** | Fix EstimationCalculator standalone message | BUG-02 | `src/components/MES/PreSales/EstimationCalculator.jsx` |
| **1.3** | Add inquiry_id filter to GET /job-cards | BUG-03 | `server/routes/mes/presales/jobCards.js` |
| **1.4** | Add advisory lock to generateQuotationNumber + generateJobNumber | BUG-04 | `server/routes/mes/presales/_helpers.js`, `jobCards.js` |
| **1.5** | Remove fuzzy getSalesRepGroup fallback | BUG-08 | `server/routes/mes/presales/_helpers.js` |
| **1.6** | Fix SQL injection in divisionMergeRules.js | TD-001 | `server/routes/divisionMergeRules.js` |
| **1.7** | Delete server/config/database.js | TD-002 | Delete 1 file |

### 🟠 PHASE 2 — Data Integrity & Hygiene (Next Session)

| # | Task | Confirmed Bug | Files to Edit |
|---|---|---|---|
| **2.1** | Fix draft estimation burning quotation numbers | BUG-09 | `server/routes/mes/presales/estimation.js` |
| **2.2** | Add division column to mes_job_cards | BUG-10 | New migration + `jobCards.js` route updates |
| **2.3** | Remove HC from VALID_DIVISIONS in qc-certificates, qc-incoming-rm | HC cleanup | 2 files |
| **2.4** | Remove HC from rmSync.js CASE statement | HC cleanup | 1 file |
| **2.5** | Remove HC ternaries from sales-rep-group-allocation.js | HC cleanup | 1 file |
| **2.6** | Clean HC references from aebf/*.js | HC cleanup | 3 files (JSDoc + table logic) |

### 🟡 PHASE 3 — Code Quality (2-3 Sessions)

| # | Task | Confirmed Bug | Files to Edit |
|---|---|---|---|
| **3.1** | Fix BOM row keys in JobCardForm + JobCardPanel | BUG-05, BUG-06 | 2 files |
| **3.2** | Remove console.error from MESErrorBoundary | BUG-07 | `src/components/MES/index.jsx` |
| **3.3** | Fix key={i} violations across MES components | BUG-13 | 4 files (BOMConfigurator, SamplesSection, WinLossAnalytics, WorkflowLandingPage) |
| **3.4** | Consolidate CurrencySymbol to single component | BUG-12 | 2 files + import updates |

### 🔵 PHASE 4 — File Size / Architecture (Separate Sessions)

| # | Task | Confirmed Bug | Notes |
|---|---|---|---|
| **4.1** | Split EstimationCalculator.jsx (567→ sub-components) | BUG-14 | Already partially split (5 sub-components imported). Remaining orchestrator is still 567 lines. |
| **4.2** | Split InquiryBoard.jsx (533→ sub-components) | BUG-15 | Extract InquiryCard, filters, create modal. |
| **4.3** | Split WorkflowLandingPage.jsx (904 lines) | Not in audit | Worse than the files the audit flagged. |

### 🟢 PHASE 5 — UI/UX Enhancements (Conditional — Only If Needed)

The Part 4 enhancements in the audit (4.1–4.10) are **nice-to-have feature requests**, not bugs. They should only be pursued after all Phase 1–4 items are resolved.

**Recommended from the enhancement list (high value / low effort):**
| # | Enhancement | Why |
|---|---|---|
| 4.6 | Pipeline Action-Required KPI bar | Data already exists server-side, just display it |
| 4.7 | MES stage chip on CRM deal cards | `inquiry_stage` already joined in GET /deals |
| 4.9 | Empty states in MES panels | UX polish, low effort |

**Deferred (high effort / design needed):**
- 4.1 InquiryBoard lifecycle kanban — requires UX rethink, touches BUG-11
- 4.3 Job card parameter comparison — needs P1 (actual parameters) first
- 4.5 SPC trend chart — needs production data volume first
- 4.8 WorkflowLandingPage compact mode — cosmetic only

### ⚪ PHASE 6 — New Features (Part 5 — Future Sprints)

**P1 (Production Parameters)** and **P2 (Finished Goods)** are the most impactful missing features. The rest (P3 Film Optimizer, P4 In-Process QC, P5 PO stage guard) are either already done (P5) or future I4.0 scope.

---

## Items NOT Included (Rejected from Audit)

| Audit Item | Reason for Rejection |
|---|---|
| Q2 — flow.js division-less query | Already filtered by division |
| P5 — Customer PO stage guard | Already implemented at customerPO.js line 30 |
| TD-001 on universal.js | Already fixed with parameterized queries |
| Q5 — requireRole not used in MES | Inline checks work correctly; style preference only |

---

*Prepared by code verification against actual source. Only confirmed issues are in the plan.*
