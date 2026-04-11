# Pre-Sales → QC Sample Workflow — Deep Technical Audit
**PPH-26.2 · Flexible Packaging Division · February 27, 2026**  
**Scope:** Sales Rep registers samples → QC Lab analyses → Results returned to Sales Rep

---

## Executive Summary

The Pre-Sales → QC workflow is substantially complete and architecturally sound. The database schema, SLA tracking, SSE real-time notifications, CSE multi-stage approval, QR label printing, and PDF generation are all production-grade. However, there is **one confirmed critical bug** that silently breaks notifications, **one architectural bypass** where the QR Scan path skips the entire CSE approval chain, and **seven significant issues** ranging from missing notifications to incorrect template filtering. From a flexible packaging industry perspective, the QC analysis form also needs richer test parameter presets that match actual lab practices for BOPP, PET, LDPE, and laminated film.

---

## Step-by-Step Workflow Review

### STEP 1 — Sales Rep Creates Inquiry
**Route:** `POST /api/mes/presales/inquiries`  
**Frontend:** `InquiryCapture.jsx` (3-step wizard)  
**DB Tables:** `mes_presales_inquiries`

✅ Inquiry number auto-generated (`INQ-FP-YYYY-XXXXX`)  
✅ Role-based access: Sales rep sees only own group; admin sees all  
✅ Source tracking (exhibition, visit, WhatsApp, referral, etc.) — relevant for FP industry trade show pipeline  
✅ Priority field (high/medium/normal/low) — flows through to QC inbox ordering  
✅ `presales_phase` field initialised to `'inquiry'`  
✅ Activity log entry created on inquiry creation  

**Issue:** No validation that at least one product group is selected before saving. Flexible packaging inquiries always have a product (BOPP pouch, CPP film, laminate, etc.) — this should be required.

---

### STEP 2 — Sales Rep Registers Sample(s)
**Route:** `POST /api/mes/presales/inquiries/:id/samples`  
**Frontend:** `SamplesSection.jsx` → "Add New Sample" form  
**DB Tables:** `mes_presales_samples`

✅ Sample number auto-generated via `generate_sample_number('FP')` — format `SMP-FP-YYYY-XXXXX`  
✅ Ownership check: only the inquiry's group or admin can add samples  
✅ `product_group` is required and validated  
✅ Sample type: Physical / Digital Proof / Both — correct for FP (physical trials vs artwork proofs)  
✅ `estimated_quantity` + `quantity_unit` (Kgs, Kpcs, SQM, LM) — industry-appropriate units  
✅ File attachments uploaded inline during registration (TDS, Artwork, Email, Specification, Sample Photo)  
✅ On successful save, QR modal auto-opens — excellent UX, forces rep to print label immediately  
✅ Delete only allowed while `status = 'registered'` (before QC submission) — correct guard  

**Issue — Form locked too early:** `isBeforeSubmission = inquiry.presales_phase === 'inquiry'`. Once any sample is submitted to QC, the entire sample section locks and no new samples can be added. In real FP pre-sales, a customer may request an additional product group sample mid-evaluation (e.g., initial inquiry for BOPP pouch, customer later asks for a PA/PE laminate sample). The UI should allow adding new samples even during `sample_qc` phase, as long as the new samples are registered separately.

**Issue — No quantity on attachments:** When attaching a TDS, there's no version or date field. In flexible packaging, TDS versions matter (a film spec may have rev A vs rev B with different thickness tolerances). Should add optional `document_version` or `revision_date` to attachments.

---

### STEP 3 — Sales Rep Prints SAR (Sample Analysis Request) Form
**Frontend:** `handlePrintSAR()` in `SamplesSection.jsx`

✅ Opens print-optimised A4 HTML page in new window  
✅ Includes QR code (generated via `qrcode.react`) pointing to `/mes/qc/scan/:sampleNumber`  
✅ Company logo dynamically loaded from `localStorage` settings cache  
✅ Sample details, inquiry info, sales rep name, print date all populated  
✅ Auto-triggers `window.print()` after 200ms delay  
✅ `@media print` CSS included — page renders correctly on paper  

**Issue — QR URL uses `window.location.origin`:** In production environments where the app is behind a load balancer or accessed on different domains (e.g., internal vs external URL), the QR code will encode the wrong origin. Should use `import.meta.env.VITE_APP_URL` configured at build time, not `window.location.origin`.

**Issue — SAR form shows no attached files list:** The physical SAR document printed for lab workers doesn't list the attached TDS or artwork files. Lab workers need to know what reference documents exist so they can open them in the system. Should add an "Attached Documents" section to the printout listing file names and types.

**Minor:** Company name falls back to hardcoded `'InterPlast'` if `company_settings_cache` is empty. Should fall back to a generic `'Company'` or pull from the auth context.

---

### STEP 4 — Sales Rep Submits Samples to QC Lab
**Route:** `POST /api/mes/presales/inquiries/:id/submit-to-qc`  
**Frontend:** "Submit N Samples to QC Lab" button in `SamplesSection.jsx`

✅ Confirmation modal before submission  
✅ All `registered` samples atomically updated to `sent_to_qc` in one transaction  
✅ Inquiry `presales_phase` updated to `'sample_qc'`  
✅ If inquiry was `new`, automatically advances to `in_progress`  
✅ Activity logged: sample count + all sample numbers  
✅ Email sent to `QC_LAB_EMAIL` + `QC_MANAGER_EMAIL` via `notifyQCSamplesReceived()` — includes sample table with product groups, types, quantities, and attached documents  
✅ In-app notifications sent to all `quality_control`, `qc_manager`, `qc_lab`, and `manager` roles  
✅ In-app notifications delivered in real-time via SSE (Server-Sent Events)  
✅ Recall available: `POST /inquiries/:id/recall` — reverts if QC hasn't started processing  

**🐛 BUG — Double Notification on Manual Status Patch:**  
`PATCH /samples/:id/status` with `status = 'sent_to_qc'` also fires `notifyQCSamplesReceived` and `notifyRoleUsers`. This same route is called by the QR scan page when marking individual samples. If a rep manually patches a sample status (unlikely but possible via API), QC receives duplicate email + in-app notifications. The email notification should only fire from the batch `submit-to-qc` endpoint, not from the individual status patch.

**Fix:**
```js
// samples.js PATCH /status route — remove the notification block
// Notification should only fire via /submit-to-qc
if (status === 'sent_to_qc') {
  pool.query(`UPDATE mes_presales_inquiries SET presales_phase = 'sample_qc' ...`);
  // ← REMOVE the notifyQCSamplesReceived / notifyRoleUsers block from here
}
```

---

### STEP 5 — QC Lab Receives Notification & Opens Inbox
**Route:** `GET /api/mes/presales/qc/inbox`  
**Frontend:** `QCDashboard.jsx` — Pending / In Progress / Completed tabs

✅ Real-time notification bell (`MESNotificationBell.jsx`) with SSE connection  
✅ Unread count badge updates instantly on sample submission  
✅ Notification click navigates to `/mes/qc`  
✅ Inbox ordered by priority (high → medium → normal → low), then by date  
✅ Shows: sample number, inquiry number, customer, country, product group, type, attachment count  
✅ Batch receive: QC can select multiple samples and mark all as received in one click  

**🐛 BUG — QC Inbox Missing Division Filter:**  
```js
// qc.js GET /qc/inbox
SELECT ... FROM mes_presales_samples s
JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
WHERE s.status = ANY($1::text[])
// ← NO division filter!
```
The query joins with `mes_presales_inquiries` but never filters by `i.division = 'FP'`. If the platform is deployed for multiple divisions (the code already has `DIVISION = 'FP'` constant), the QC inbox will show samples from ALL divisions.

**Fix:**
```sql
WHERE s.status = ANY($1::text[]) AND i.division = 'FP'
```

---

### STEP 6 — QC Lab Scans QR Code (Physical Receipt)
**Route:** `GET /api/mes/presales/samples/by-number/:sampleNumber`  
**Frontend:** `QCScanPage.jsx` at `/mes/qc/scan/:sampleNumber`

✅ Sample looked up by number (not ID) — correct, matches what's on the physical label  
✅ Shows all TDS and specification attachments from the linked inquiry  
✅ 7-step progress tracker (`SampleProgressSteps.jsx`) — visual workflow guide for lab  
✅ "Mark as Received" button → status to `received_by_qc`, records `received_by_qc_user` + `received_at`  
✅ "Start Testing" button → status to `testing`, records `qc_started_at`  
✅ Role check: redirects non-QC users to `/mes`  

**🚨 CRITICAL ARCHITECTURAL BYPASS — QCScanPage Skips CSE Workflow:**  
QCScanPage has a final step: "Submit QC Result" with pass/fail/conditional dropdown + notes. This calls `PATCH /samples/:id/qc-result` which:
1. Updates `qc_result` directly on the sample
2. Sets sample status to `approved`/`rejected`/`tested`
3. Does **NOT** create a `mes_qc_analyses` record
4. Does **NOT** create a `mes_cse_reports` record
5. Does **NOT** trigger the CSE multi-stage approval (QC Manager → Production Manager)
6. Does **NOT** notify the sales rep

This means a lab worker scanning the QR code and submitting a quick result **completely bypasses the formal QC analysis form, CSE report, and dual-approval chain**. The sample gets marked `approved` with no documented test parameters, no seal strength data, no visual inspection record, and no management sign-off.

**Fix options:**
- **Option A (recommended):** Remove the result submission from QCScanPage entirely. Use QCScanPage only for: receive + start testing. After "Start Testing", show a prominent button: "Open Full Analysis Form →" navigating to `/mes/qc/samples/:id`.
- **Option B:** Keep quick-result but demote it to "quick note" only (changes status to `testing`, not final). Force completion via the full analysis form.

```jsx
// QCScanPage.jsx — Replace the testing card section
{sample.status === 'testing' && (
  <div style={{ textAlign: 'center' }}>
    <Alert
      type="info"
      message="Sample is in testing"
      description="Complete the full analysis form to submit results and generate a CSE report."
    />
    <Button
      type="primary"
      size="large"
      style={{ marginTop: 16 }}
      onClick={() => navigate(`/mes/qc/samples/${sample.id}`)}
    >
      Open Analysis Form →
    </Button>
  </div>
)}
```

---

### STEP 7 — QC Lab Completes Analysis Form
**Route:** `GET /api/mes/presales/qc/analyses/:sampleId` (load) + `POST /qc/analyses` (save draft) + `PATCH /qc/analyses/:id` (update)  
**Frontend:** `QCSampleAnalysis.jsx` at `/mes/qc/samples/:sampleId`

✅ Auto-loads QC template for product group on first open (G-001)  
✅ Auto pass/fail evaluation when result entered for parameters with min/max spec (G-002)  
✅ Multiple readings per parameter with mean/std dev/min/max statistics (G-003)  
✅ Equipment selector per parameter — logs calibrated instrument used (G-008)  
✅ Equipment usage logged to `qc_equipment_used` table  
✅ Test categories: Physical, Print, Seal, Optical, Chemical, Custom  
✅ Visual inspection, print quality, seal strength sections  
✅ Overall result: Pass / Fail / Conditional — correct for flexible packaging  
✅ Observations + Recommendation text fields  
✅ Save Draft → `status = 'draft'` (incremental saves, no data loss)  
✅ QC Evidence upload (photos, charts, lab certs) stored as `qc_evidence` attachment type  

**🐛 BUG — Template Filter Ignored by Backend:**  
Frontend requests templates filtered by product group:
```js
`/api/mes/presales/qc/templates?product_group=${encodeURIComponent(data.sample.product_group)}`
```
Backend ignores the `product_group` query parameter:
```js
// templates.js
const result = await pool.query(
  `SELECT * FROM mes_qc_templates WHERE is_active = true ORDER BY name ASC`
  // ← product_group filter completely ignored!
);
```
Result: the first active template (alphabetically) is loaded regardless of product group. A BOPP film template could pre-fill a PA/PE laminate sample.

**Fix:**
```js
router.get('/qc/templates', authenticate, async (req, res) => {
  const { product_group } = req.query;
  let query = `SELECT * FROM mes_qc_templates WHERE is_active = true`;
  const params = [];
  if (product_group) {
    query += ` AND ($1 = ANY(product_groups) OR product_groups IS NULL OR product_groups = '{}')`;
    params.push(product_group);
  }
  query += ` ORDER BY name ASC`;
  const result = await pool.query(query, params);
  res.json({ success: true, data: result.rows });
});
```

**Industry Issue — Insufficient Test Parameter Presets:**  
The `categoryPresets` in `QCSampleAnalysis.jsx` are far too sparse for professional FP quality evaluation:

```js
// Current — inadequate
physical: [
  { name: 'Thickness', spec: 'As per TDS', ... },
  { name: 'Width', spec: 'As per drawing', ... },
]
```

A proper flexible packaging QC form should include:

| Category | Parameters |
|---|---|
| **Physical (Film)** | Thickness (μm) ±tolerance, Width (mm), Tensile Strength MD (N/mm²), Tensile Strength TD (N/mm²), Elongation at Break MD (%), Elongation at Break TD (%), COF Static, COF Kinetic, Haze (%), Gloss (GU) |
| **Print Quality** | Color Density (by channel), Delta-E (ΔE vs standard), Registration (mm), Ink Adhesion (tape test), Solvent Retention (mg/m²), Pin-holes count/m² |
| **Seal Integrity** | Hot Tack Strength (N/15mm), Cold Seal Strength (N/15mm), Seal Appearance, Peel Type (cohesive/adhesive/interfacial) |
| **Barrier** | OTR cc/m²/day, MVTR g/m²/day, Grease Resistance |
| **Chemical/Safety** | Solvent Residuals (mg/m²), Heavy Metals (if applicable), Migration (food contact if applicable) |
| **Dimensional** | Roll Width, Core Diameter, Roll Weight (kg), Gauge Variation (max-min/avg %) |

---

### STEP 8 — QC Submits Analysis → CSE Auto-Generated
**Route:** `POST /api/mes/presales/qc/analyses/:id/submit`  
**Frontend:** "Submit Analysis" button in `QCSampleAnalysis.jsx`

✅ Analysis status changes from `draft` → `submitted`  
✅ Sample status updated to `tested`, `qc_result` and `qc_completed_at` recorded  
✅ CSE (Customer Sample Evaluation) automatically created — number format `CSE-FP-YYYY-XXXXX`  
✅ Test summary snapshotted into `test_summary` JSONB column  
✅ SLA set: 24 hours for QC Manager to review (`sla_due_at = NOW() + INTERVAL '24 hours'`)  
✅ If all inquiry samples are now `tested`/`approved`/`rejected`, inquiry phase auto-advances to `clearance`  
✅ In-app notification sent to QC roles: "CSE ready for QC review"  
✅ If no prior draft exists, creates draft first then submits in one call  

**Issue — No Notification to Sales Rep on Sample Completion:**  
When QC submits the analysis, the originating sales rep receives **zero notification**. The rep has no idea their samples have been evaluated unless they manually open the inquiry detail. 

The `mes_presales_inquiries` table has `created_by` (the sales rep's user ID). A notification should be sent:
```js
// After successful submit in qc.js /analyses/:id/submit
const ownerRes = await pool.query(
  `SELECT created_by FROM mes_presales_inquiries WHERE id = $1`, [current.inquiry_id]
);
const ownerId = ownerRes.rows[0]?.created_by;
if (ownerId) {
  await notifyUsers([ownerId], {
    type: 'qc_result_ready',
    title: `QC result ready — ${current.sample_number}`,
    message: `Result: ${submitResult.toUpperCase()} · CSE ${cseReport.cse_number} generated`,
    link: `/crm/inquiries/${current.inquiry_id}`,
    referenceType: 'inquiry', referenceId: current.inquiry_id,
  });
}
```
Also add `'qc_result_ready'` to `MESNotificationBell.jsx` `typeLabel` map.

---

### STEP 9 — QC Manager Reviews & Approves CSE (Stage 1)
**Route:** `POST /api/mes/presales/cse/:id/approve`  
**Frontend:** `CSEApprovalPage.jsx` at `/mes/qc/cse/:cseId`  
**Also:** `CSEApprovalQueue.jsx` at `/mes/approvals` (list view)

✅ QC Manager can: Approve → advances to `pending_production` | Reject → terminal | Request Revision → back to `testing`  
✅ Role guard: `canApproveQCStage` — only `admin`, `manager`, `quality_control`, `qc_manager`, `qc_lab`  
✅ On revision: analysis status reverts to `draft`, sample reverts to `testing`  
✅ Revision history (`mes_cse_revisions`) records every action with actor, notes, snapshot  
✅ Discussion tab: comments with internal/external flag, threaded replies  
✅ PDF export: full CSE report via jsPDF — header, test parameters table, observations, approval chain  
✅ Shareable link: `/mes/public/cse/:token` with configurable expiry (30 days default)  
✅ Public CSE page (`PublicCSEView.jsx`) works without login — correct for sharing with customers  

**🚨 CRITICAL BUG — QC Manager Approval Notification Never Fires:**  

```js
// cse.js POST /cse/:id/approve — AFTER commit
try {
  if (cse.status === 'pending_qc') {          // ← BUG: status value doesn't exist
    await notifyRoleUsers(['production_manager', 'manager'], { ... });
  } else if (cse.status === 'pending_production') {  // ← handles final Production approval
    // notify sales rep owner
  }
}
```

**The problem:** `cse` is the object read BEFORE the update. When QC Manager approves:
- `cse.status` was `'pending_qc_manager'` (before update)
- The check is for `'pending_qc'` — a status that doesn't exist anywhere in the codebase
- Result: **Production Managers are NEVER notified** when QC Manager approves a CSE
- CSE sits silently in `pending_production` with no one knowing

The second branch `cse.status === 'pending_production'` works correctly for the Production Manager final approval because at that point `cse.status` (pre-update) really is `'pending_production'`.

**Fix — one character change:**
```js
// cse.js line 189
if (cse.status === 'pending_qc_manager') {    // ← was 'pending_qc'
  await notifyRoleUsers(
    ['production_manager', 'manager'],
    {
      type: 'cse_pending_production',
      title: `CSE pending production approval — ${cse.cse_number}`,
      message: `QC stage approved by ${actorName(req.user)}`,
      link: `/mes/qc/cse/${cse.id}`,
      referenceType: 'cse', referenceId: cse.id,
    },
    { excludeUserIds: [req.user?.id] }
  );
}
```

---

### STEP 10 — Production Manager Reviews & Approves CSE (Stage 2)
**Route:** `POST /api/mes/presales/cse/:id/approve`  
**Frontend:** Same `CSEApprovalPage.jsx`

✅ Role guard: `canApproveProductionStage` — only `admin`, `manager`, `production_manager`  
✅ On final approval: sample status → `approved`, CSE `final_status = 'approved'`, `completed_at` recorded  
✅ Notification sent to inquiry owner (sales rep) — "CSE approved — [CSE number]" ✅  
✅ Audit trail: `logAudit()` records old vs new state on every action  

**Issue — Clearance Gating Too Strict (Admin Only):**  
```js
// inquiries.js /clearance route
if (req.user?.role !== 'admin') {
  return res.status(403).json({ error: 'Only admin can grant or revoke pre-sales clearance.' });
}
```
In flexible packaging operations, the Sales Manager or Commercial Manager typically grants pre-sales clearance, not the IT system admin. `admin` in this system appears to be the IT/system admin role. This should be:
```js
if (!isAdminOrMgmt(req.user)) { ... }
```
The `isAdminOrMgmt` function already includes `sales_manager` and `sales_coordinator`.

---

### STEP 11 — Results Visible to Sales Rep
**Frontend:** `SamplesSection.jsx` in `InquiryDetail` — per-sample CSE badges

✅ Each sample card shows CSE number, overall result (PASS/FAIL/CONDITIONAL), CSE status  
✅ QC Manager and Production status shown as compact badges  
✅ "View CSE →" link in each sample card  
✅ `ActivityTimeline.jsx` shows full audit trail: sample registered → submitted → result submitted → cleared  

**Issue — ActivityTimeline missing new event types:**  
The `ACTIVITY_LABELS` constants don't include `qc_batch_received`, `qc_analysis_saved`, `qc_analysis_updated`, `cse_generated`, `cse_qc_manager_approved`, `cse_production_approved`, `cse_revision_requested`, `cse_rejected`. These events ARE logged by the backend but rendered as raw action strings (`cse_production_approved`) in the timeline instead of human labels.

**Fix in `constants.jsx`:**
```js
export const ACTIVITY_LABELS = {
  // ... existing ...
  qc_batch_received:       'QC Batch Received',
  qc_analysis_saved:       'QC Analysis Saved',
  cse_generated:           'CSE Report Generated',
  cse_qc_manager_approved: 'QC Manager Approved',
  cse_production_approved: 'Production Manager Approved',
  cse_revision_requested:  'Revision Requested',
  cse_rejected:            'CSE Rejected',
  samples_recalled:        'Samples Recalled from QC',
};
```

---

### STEP 12 — Pre-Sales Clearance Granted → Inquiry Converted
**Route:** `PATCH /api/mes/presales/inquiries/:id/clearance`  
**Frontend:** `ClearanceSection.jsx`

✅ All approved samples check visible before granting clearance  
✅ Inquiry moves to `status = 'converted'`, `presales_phase = 'cleared'`  
✅ `presales_cleared = TRUE`, clearance actor and timestamp recorded  
✅ Sales rep owner notified in-app: "Pre-sales clearance granted"  
✅ Revoke available (admin only, with confirmation) — resets phase to `clearance`  

---

## Routing Audit

| Route | Component | Correct? |
|---|---|---|
| `/crm/inquiries` | InquiryBoard (Kanban) via CRMModule | ✅ |
| `/crm/inquiries/new` | InquiryCapture (wizard) | ✅ |
| `/mes/inquiries` | InquiryBoard via MES PresalesInquiries | ✅ |
| `/mes/inquiries/:id` | InquiryDetail | ✅ |
| `/mes/qc` | QCDashboard | ✅ |
| `/mes/qc/samples/:sampleId` | QCSampleAnalysis | ✅ |
| `/mes/qc/cse/:cseId` | CSEApprovalPage | ✅ |
| `/mes/qc/scan/:sampleNumber` | QCScanPage | ✅ |
| `/mes/approvals` | CSEApprovalQueue | ✅ |
| `/mes/qc/ncr` | NCRManagement | ✅ |
| `/mes/qc/templates` | QCTemplateAdmin | ✅ |
| `/mes/public/cse/:token` | PublicCSEView (no auth) | ✅ |

**Routing Issue — Dual Mounting of InquiryBoard:**  
InquiryBoard is mounted at `/crm/inquiries` (CRMModule) AND at `/mes/inquiries` (MES PresalesInquiries). The full InquiryDetail is only at `/mes/inquiries/:id`. When InquiryBoard is opened from the CRM tab and a user clicks a card, the navigation target must be `/mes/inquiries/:id`. Verify InquiryBoard's `useNavigate()` calls navigate to `/mes/inquiries/${id}` not `/crm/inquiries/${id}`. The PreSales `index.jsx` comment still shows `/crm/inquiries/:id → InquiryDetail` which is wrong — update the comment.

**QCScanPage — Login Required on Scan:**  
A factory floor worker scanning the QR label on a physical sample hits `/mes/qc/scan/:sampleNumber`. This route is inside the MES protected route and requires login. Workers without the app already open will be redirected to the login page. Consider a 30-day session persistence for QC lab devices, or implement a PIN-based quick-auth for QC lab tablets.

---

## Notification Audit

| Event | Channel | Recipients | Status |
|---|---|---|---|
| Samples submitted to QC | Email + In-app SSE | QC Lab + QC Manager + Manager | ✅ |
| QR scan: Sample received | In-app (via batch receive) | QC roles | ✅ |
| Analysis submitted → CSE created | In-app SSE | QC roles (pending QC review) | ✅ |
| QC Manager approved → pending Production | In-app SSE | Production Manager + Manager | 🔴 **BROKEN (dead branch)** |
| QC Manager rejected → terminal | In-app SSE | CSE creator (QC analyst) | ✅ |
| Revision requested | In-app SSE | CSE creator (QC analyst) | ✅ |
| Production Manager final approved | In-app SSE | Inquiry owner (Sales Rep) | ✅ |
| Production Manager rejected | In-app SSE | CSE creator | ✅ |
| Pre-Sales Clearance granted | In-app SSE | Inquiry owner (Sales Rep) | ✅ |
| QC result completed → rep informed | — | Sales Rep | 🔴 **MISSING** |
| QCScanPage result submitted | — | Nobody | 🔴 **BYPASSES WORKFLOW** |

---

## Confirmed Bugs

### BUG-01 🔴 CSE Production Manager Notification Never Fires
**File:** `server/routes/mes/presales/cse.js:189`  
**Severity:** Critical — Production Managers are never notified of pending approvals  
**Fix:** Change `'pending_qc'` → `'pending_qc_manager'`

### BUG-02 🔴 QCScanPage Bypasses Entire CSE Approval Chain
**File:** `src/components/MES/PreSales/QCScanPage.jsx` + `server/routes/mes/presales/samples.js` (`/qc-result` endpoint)  
**Severity:** Critical — results submitted via QR scan create no analysis record, no CSE, no management approval  
**Fix:** Remove result submission from QCScanPage; redirect to full analysis form after "Start Testing"

### BUG-03 🟠 QC Templates Backend Ignores Product Group Filter
**File:** `server/routes/mes/presales/templates.js`  
**Severity:** Medium — wrong template auto-loads for product group  
**Fix:** Add product_group filter to SQL query

### BUG-04 🟡 QC Inbox Missing Division Filter
**File:** `server/routes/mes/presales/qc.js` — `GET /qc/inbox`  
**Severity:** Medium — would expose cross-division samples in multi-division deployment  
**Fix:** Add `AND i.division = $N` to WHERE clause

### BUG-05 🟡 Double Email Notification on Individual Sample Status Patch
**File:** `server/routes/mes/presales/samples.js` — `PATCH /samples/:id/status`  
**Severity:** Low — duplicate QC notifications if per-sample status is patched directly  
**Fix:** Remove notification block from PATCH route; keep only in `/submit-to-qc`

---

## Issues (Design / Logic)

### ISSUE-01 — No Notification to Sales Rep When QC Analysis Completed
Sales rep has no real-time awareness of QC result. Must manually check. Add `notifyUsers([ownerId], ...)` in `/analyses/:id/submit` after CSE is created.

### ISSUE-02 — ClearanceSection Restricted to `admin` Role Only
`sales_manager` and `manager` cannot grant clearance. Should use `isAdminOrMgmt`. Update both backend route and frontend `isStrictAdmin` check.

### ISSUE-03 — SampleProgressSteps Missing `sent_to_qc_at` Timestamp
DB has no `sent_to_qc_at` column — the "Sent to QC" step shows no timestamp. Add `sent_to_qc_at` timestamp column via migration, populated when status changes to `sent_to_qc`.

### ISSUE-04 — ActivityTimeline Missing Labels for New Event Types
CSE-related events (`cse_generated`, `cse_qc_manager_approved`, etc.) render as raw strings. Add to `ACTIVITY_LABELS` in `constants.jsx`.

### ISSUE-05 — New Samples Blocked After QC Submission
Once `presales_phase = 'sample_qc'`, no new samples can be added. Should allow additional sample registration even during QC phase — common in FP pre-sales when a customer requests an extra material variant mid-evaluation.

### ISSUE-06 — QR Code Encodes `window.location.origin` (Fragile)
SAR print and QR modal both use `window.location.origin` as the QR target. Use `import.meta.env.VITE_APP_URL` instead for stable production URLs.

### ISSUE-07 — `getSalesRepGroup` Uses Fuzzy Name Matching
Group lookup matches on `ILIKE '%firstName%'`. Could grant wrong group access if names overlap. Should store a direct `user_id → group_id` mapping.

---

## Enhancements — Flexible Packaging Industry

### ENH-01 — Richer QC Test Parameter Presets
Current presets are generic. Recommended per-category templates for flexible packaging:

**Physical (Film properties):**
- Thickness (μm) with ±5% tolerance evaluation
- Tensile Strength MD / TD (N/mm² or MPa)  
- Elongation at Break MD / TD (%)
- COF Static / Kinetic (dimensionless)
- Gauge variation (max - min / average × 100 %)

**Print Quality:**
- Delta-E (ΔE00) per color against approved standard
- Ink adhesion — tape test (pass/fail, % transfer)
- Registration accuracy (mm, each color to black)
- Solvent retention (mg/m²) — critical for food safety compliance
- Pinholes per m² (visual, illuminated table count)

**Seal Integrity:**
- Seal strength (N/15mm) at standard dwell/temp/pressure
- Hot tack strength (N/15mm) at production speeds
- Peel type: cohesive / adhesive / interfacial
- Seal appearance: clear / hazy / wrinkled / contaminated

**Barrier Properties:**
- OTR — Oxygen Transmission Rate (cc/m²/day at 23°C, 0% RH)
- MVTR — Moisture Vapor Transmission Rate (g/m²/day at 38°C, 90% RH)
- These are critical for food, pharma, and agricultural packaging

**Dimensional:**
- Roll width (mm) vs specification ± tolerance
- Core inner diameter (76mm or 152mm standard)
- Roll weight (kg) for freight and costing verification

### ENH-02 — Spectrophotometer Integration for Print Approval
Flexible packaging printers use densitometers and spectrophotometers (X-Rite, Techkon). Add a structured "Color Measurement" section with L\*a\*b\* values and auto-computed ΔE against job-specific approved standards stored per product group.

### ENH-03 — Solvent Retention Warning
When a QC analyst enters solvent retention > 10 mg/m² (industry threshold for food-contact packaging per Swiss Ordinance and EuPIA guidelines), auto-flag as a warning in the form and require explicit acknowledgment. This prevents inadvertently passing hazardous material.

### ENH-04 — CSE PDF — Logo and Signature Block
The current CSE PDF has no company logo and no signature lines. Industry practice requires the PDF to show the company logo, analyst name/signature space, QC Manager approval stamp, and document control number. Add these to `downloadCSEPdf()`.

### ENH-05 — Sample Retention / Disposal Tracking
In FP pre-sales, physical samples sent to QC need to be returned or disposed after evaluation. Add a `disposition` field (return to customer / retain as reference / dispose) and `disposition_date` to `mes_presales_samples`. Approved samples are often kept as "golden samples" for production reference.

### ENH-06 — Batch Analysis for Same Product Group
When an inquiry has 3 samples all from the same product group (e.g., three BOPP pouch variants differing only in size), QC could run one analysis set for all three. The batch analysis endpoint (`POST /qc/batch-analyses`) exists on the backend but has no UI entry point. Add a "Batch Analyze" button on QCDashboard when multiple selected samples share the same product group.

### ENH-07 — SLA Breach Alerts
SLA tracking (`sla_due_at`) exists on both samples and CSE reports but there is no SLA breach notification or dashboard indicator. Add a scheduled job (every 30 minutes) that queries overdue SLAs and sends in-app notifications to relevant managers. Display a red "OVERDUE" badge in QCDashboard for breached SLAs.

### ENH-08 — Customer Portal Link from CSE
The public CSE share link (`/mes/public/cse/:token`) is currently only generated manually by management. Consider auto-generating a share link when Production Manager finally approves, and including it in the sales rep notification: "Share this link with your customer: [link]". This eliminates manual share generation and speeds up customer communication.

---

## Summary Table

| # | Category | Item | Severity | Effort |
|---|---|---|---|---|
| BUG-01 | Bug | CSE Production Manager notification dead branch (`'pending_qc'`) | 🔴 Critical | 5 min |
| BUG-02 | Bug | QCScanPage result submission bypasses CSE workflow | 🔴 Critical | 2 hrs |
| BUG-03 | Bug | QC template product_group filter ignored by backend | 🟠 Medium | 30 min |
| BUG-04 | Bug | QC inbox missing division filter | 🟠 Medium | 15 min |
| BUG-05 | Bug | Double notification on per-sample status PATCH | 🟡 Low | 30 min |
| ISS-01 | Issue | No notification to sales rep on QC result | 🟠 Medium | 1 hr |
| ISS-02 | Issue | Clearance locked to admin role only | 🟠 Medium | 30 min |
| ISS-03 | Issue | `sent_to_qc_at` timestamp missing from schema | 🟡 Low | 1 hr |
| ISS-04 | Issue | ActivityTimeline missing CSE event labels | 🟡 Low | 30 min |
| ISS-05 | Issue | New samples blocked during QC phase | 🟡 Low | 2 hrs |
| ISS-06 | Issue | QR URL uses fragile `window.location.origin` | 🟡 Low | 15 min |
| ISS-07 | Issue | Fuzzy name match for sales rep group lookup | 🟡 Low | 2 hrs |
| ENH-01 | Enhancement | FP-specific QC test parameter presets | — | 1 day |
| ENH-02 | Enhancement | Spectrophotometer/color measurement section | — | 2 days |
| ENH-03 | Enhancement | Solvent retention auto-warning for food contact | — | 2 hrs |
| ENH-04 | Enhancement | CSE PDF logo + signature block | — | 3 hrs |
| ENH-05 | Enhancement | Sample disposition/retention tracking | — | 1 day |
| ENH-06 | Enhancement | Batch analysis UI entry point in QCDashboard | — | 1 day |
| ENH-07 | Enhancement | SLA breach alerts (scheduled job + badges) | — | 1 day |
| ENH-08 | Enhancement | Auto-share CSE link on final approval | — | 2 hrs |

---

## What's Working Very Well

The overall architecture is excellent. Highlights worth noting:

- **Transaction safety:** Every write operation uses `BEGIN/COMMIT/ROLLBACK` — no orphaned records on failure
- **SSE real-time notifications:** Properly implemented with heartbeat (25s), connection cleanup, and fallback polling
- **SLA tracking:** Timestamps at every stage with automatic deadline calculation
- **CSE revision history:** Full immutable audit log with snapshots — production-grade compliance
- **SAR print form:** The A4 QR label form with dynamic company branding is professional and practical
- **Auto pass/fail evaluation:** The G-002 feature that auto-evaluates parameter status against min/max ranges is exactly what a lab analyst needs to avoid manual errors
- **Multi-reading statistics:** Mean, std dev, min/max for repeated measurements (G-003) is advanced for a custom QC system
- **Template system:** The QC template admin with product group assignment is the right architecture — just needs the filter bug fixed
- **Public CSE sharing:** Tokenized, expiry-controlled sharing with no-auth public view is a solid customer-facing feature
