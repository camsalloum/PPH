# Pre-Sales / QC Sample Evaluation — Feature Ideas from Reference Apps

> Extracted from actual source code of ERPNext, Dolibarr, Twenty, Metafresh, and iDempiere.
> Each feature includes: what it is, how the reference app implements it, how it maps to your workflow, and complexity estimate.

---

## Table of Contents

1. [ERPNext — Quality Inspection Module](#1-erpnext--quality-inspection-module)
2. [Dolibarr — Commercial Proposal (Propal) Module](#2-dolibarr--commercial-proposal-propal-module)
3. [Metafresh — RFQ Lifecycle & QM Analysis](#3-metafresh--rfq-lifecycle--qm-analysis)
4. [iDempiere — Workflow Engine & Quality Tests](#4-idempiere--workflow-engine--quality-tests)
5. [Twenty — Workflow Automation & Timeline](#5-twenty--workflow-automation--timeline)
6. [Cross-App Synthesis — Top Priority Features](#6-cross-app-synthesis--top-priority-features)

---

## 1. ERPNext — Quality Inspection Module

Source: `erpnext/stock/doctype/quality_inspection/` and `erpnext/quality_management/doctype/`

### 1.1 Template-Based Inspection Parameters

**How ERPNext implements it:**
- `quality_inspection_template.json` defines a reusable template that holds a table of `Quality Inspection Parameter` records.
- Each parameter (`quality_inspection_parameter.json`) has: `parameter` (unique name), `parameter_group` (grouping label), `description`.
- When a Quality Inspection is created and a template is selected, `validate()` in `quality_inspection.py` (line ~95) auto-loads all template readings into the `readings` child table via `get_template_details()`.
- Each reading row (`quality_inspection_reading.json`) has: `specification` (link to parameter), `parameter_group`, `value` (acceptance text), `numeric` (checkbox), `min_value`, `max_value`, `formula_based_criteria` (checkbox), `acceptance_formula`, and fields `reading_1` through `reading_10` for up to 10 measurements, plus `reading_value` for non-numeric results.

**How it maps to your Pre-Sales/QC workflow:**
- Your Phase 2 "Sample & QC Review" currently has QC perform testing and submit Pass/Fail/Conditional. Templates would let you define **standard test profiles per product group** (e.g., "Flexible Packaging Film - Print Adhesion Tests", "Lamination Bond Strength Tests") so QC technicians don't manually enter parameter names each time.
- When a SAR (Sample Analysis Request) is created for a specific product group, the system auto-populates the correct test parameters.

**Implementation approach:**
```
QCSampleTemplate {
  id, name, product_group_id,
  parameters: [
    { name: "Print Adhesion (cross-hatch)", type: "numeric", min: 3, max: 5, unit: "rating" },
    { name: "Bond Strength", type: "numeric", min: 200, max: null, unit: "g/15mm" },
    { name: "Colour Match", type: "value", acceptance_values: ["Pass","Conditional","Fail"] },
    { name: "Seal Strength", type: "numeric", min: 800, max: null, unit: "g/25mm" }
  ]
}
```

**Complexity:** Medium — Need a template CRUD UI, a parameter library, and auto-populate logic on SAR creation.

---

### 1.2 Formula-Based Acceptance Criteria

**How ERPNext implements it:**
- `quality_inspection_reading.json` has `formula_based_criteria` checkbox and `acceptance_formula` field.
- In `quality_inspection.py` → `set_status_based_on_acceptance_formula()` (line ~170):
  ```python
  data = {"reading_1": ..., "reading_2": ..., ..., "reading_10": ..., "mean": mean}
  result = frappe.safe_eval(acceptance_formula, None, data)
  ```
- The formula is a Python expression that can reference `reading_1`..`reading_10` and `mean`. Returns truthy = Pass, falsy = Fail.
- Example formulas: `mean > 150 and reading_1 > 100`, `(reading_1 + reading_2) / 2 >= 200`.

**How it maps to your Pre-Sales/QC workflow:**
- Some QC tests in flexible packaging need composite pass/fail logic: "bond strength average must exceed 200 g/15mm AND no single reading below 150". Simple min/max can't express this.
- Formula-based criteria let QC managers define complex acceptance rules without code changes.

**Implementation approach:**
- Add an `acceptance_formula` text field on each test parameter.
- Parse with a safe JS expression evaluator (e.g., `mathjs` or a small sandbox). Variables: `r1`..`r10`, `mean`, `min`, `max`.
- Evaluate after all readings are entered. Display formula + result in the SAR card.

**Complexity:** Medium — The expression evaluator needs sandboxing; UI needs formula builder/helper.

---

### 1.3 Multi-Reading Statistical Evaluation (10-Reading System)

**How ERPNext implements it:**
- Each `quality_inspection_reading` row supports 10 numeric readings (`reading_1` through `reading_10`).
- `calculate_mean()` (line ~215) computes mean of all non-empty readings.
- `min_max_criteria_passed()` (line ~200) checks ALL 10 readings fall within [min_value, max_value].
- `set_status_based_on_acceptance_values()` handles both numeric (min/max + mean) and value-based (text match) criteria.
- If ANY reading is out of spec, the entire parameter row fails; if ANY parameter fails, the entire inspection is Rejected.

**How it maps to your Pre-Sales/QC workflow:**
- When QC evaluates a sample batch, they often take multiple measurements (e.g., 5 seal-strength readings across the sample). Currently your system captures a single Pass/Fail. Multi-reading lets QC log actual measurements, auto-calculate mean, and auto-determine pass/fail.
- Adds traceability: you can see WHICH reading failed, not just "it failed".

**Implementation approach:**
```
SARReading {
  sar_id, parameter_id,
  readings: [number, number, ...],  // up to 10
  mean: computed,
  status: "Pass" | "Fail" | "Conditional",
  auto_evaluated: boolean
}
```
- Show readings as a compact row of input cells (like a mini spreadsheet).
- Auto-compute mean and auto-set status based on min/max or formula.

**Complexity:** Low-Medium — UI is the main work; logic is straightforward.

---

### 1.4 Quality Feedback → Action → Review Loop

**How ERPNext implements it:**
- `quality_feedback.json`: QA-FB-##### numbering, links to a specific User or Customer via Dynamic Link, has a "Quality Action" link.
- `quality_action.json`: QA-ACT-#####, type is "Corrective" or "Preventive", status "Open"/"Completed", linked to feedback and a goal/procedure. Has a `resolutions` child table for tracking resolution steps.
- `quality_review.json`: QA-REV-#####, linked to a quality goal, status "Open"/"Passed"/"Failed", has `reviews` child table.
- `quality_goal.json`: Monitoring frequency (None/Daily/Weekly/Monthly/Quarterly), linked to a procedure, has `objectives` child table.
- `quality_procedure.json`: **Tree structure** (`is_tree=true`, nested set with `lft`/`rgt`), process steps table, process_owner.
- `non_conformance.json` + `.py`: QA-NC-#####, linked to procedure, status Open/Resolved/Cancelled, rich text fields for details, corrective_action, preventive_action.

**How it maps to your Pre-Sales/QC workflow:**
- When a sample FAILS QC in Phase 2, your system currently just records "Fail" with notes. This feature adds a structured follow-up:
  1. QC failure auto-creates a **Non-Conformance Report** (NCR)
  2. NCR triggers a **Quality Action** (corrective: "re-test with adjusted sample prep" or preventive: "update TDS for this material")
  3. Actions have tracked resolution steps with owners and deadlines
  4. Periodic **Quality Reviews** tied to goals ("reduce first-sample reject rate to <10%")
- For Phase 15 "Post-Delivery & Feedback", customer complaints create Quality Feedback → Action chain.

**Implementation approach:**
- Add a `NonConformanceReport` entity: `{ id, sar_id, inquiry_id, type: "corrective"|"preventive", status, details_html, corrective_action_html, preventive_action_html, assigned_to, due_date }`.
- Auto-create NCR when SAR status changes to "Fail".
- Add NCR list/detail views in the QC section of Inquiry Detail.
- Dashboard widget: "Open NCRs by age" for QC Manager.

**Complexity:** Medium-High — Multiple entities, relationships, and a follow-up workflow. But high value.

---

### 1.5 Inspection Type Classification (Incoming / Outgoing / In-Process)

**How ERPNext implements it:**
- `quality_inspection.json` has `inspection_type` field with options: "Incoming", "Outgoing", "In Process".
- `reference_type` field links to: Purchase Receipt, Purchase Invoice, Subcontracting Receipt, Delivery Note, Sales Invoice, Stock Entry, Job Card.
- The inspection result is written back to the reference document via `update_qc_reference()`.

**How it maps to your Pre-Sales/QC workflow:**
- Your system currently only does "pre-sales sample evaluation". But your Phase 11 (Production Execution) and Phase 12 (Final QC & Packaging) also need QC.
- Classification lets the SAME QC infrastructure serve:
  - **Pre-Sales** (current SAR): "Incoming" type linked to Inquiry/SAR
  - **In-Process** (Phase 11): "In Process" type linked to Job Order
  - **Final QC** (Phase 12): "Outgoing" type linked to Production Order
- Unified QC dashboard shows all three with filters.

**Implementation approach:**
- Add `inspection_type` enum to your QC record model.
- Add `reference_type` + `reference_id` polymorphic link.
- Adjust QC queue views to filter by type.

**Complexity:** Low — Schema change + filter logic. High strategic value for reuse.

---

## 2. Dolibarr — Commercial Proposal (Propal) Module

Source: `dolibarr/htdocs/comm/propal/class/propal.class.php` (4121 lines)

### 2.1 Six-State Lifecycle with Guarded Transitions

**How Dolibarr implements it:**
- Six explicit status constants:
  ```
  STATUS_CANCELED = -1
  STATUS_DRAFT = 0
  STATUS_VALIDATED = 1
  STATUS_SIGNED = 2
  STATUS_NOTSIGNED = 3
  STATUS_BILLED = 4
  ```
- Each transition is a dedicated method with permission checks, state guards, and triggers:
  - `valid()` (DRAFT→VALIDATED): Checks user permission `propale->valider`, assigns sequential document number, triggers `PROPAL_VALIDATE`.
  - `closeProposal($status)` (VALIDATED→SIGNED or VALIDATED→NOTSIGNED): Records `date_signature`, `fk_user_signature`, auto-generates PDF, auto-classifies company as customer on SIGNED.
  - `classifyBilled()` (SIGNED→BILLED): Records `date_cloture`.
  - `reopen()`: Moves SIGNED/NOTSIGNED/BILLED back to VALIDATED.
  - `setCancel()`, `setDraft()`: With appropriate resets.
- Each method calls a trigger (e.g., `PROPAL_CLOSE_SIGNED`, `PROPAL_CLOSE_REFUSED`, `PROPAL_MODIFY`, `PROPAL_REOPEN`, `PROPAL_CANCEL`).
- **Lines are only addable in DRAFT status** — `addline()` checks `$this->statut == self::STATUS_DRAFT`.

**How it maps to your Pre-Sales/QC workflow:**
- Your inquiry currently has implicit statuses. Dolibarr's pattern gives you a **formal state machine** for the Inquiry lifecycle:
  ```
  DRAFT → SUBMITTED → QC_IN_PROGRESS → QC_COMPLETE → CLEARED → CONVERTED → CLOSED/CANCELLED
  ```
- Each transition has:
  - **Permission guard**: Only QC role can move to QC_COMPLETE; only Sales Manager can CLEAR.
  - **Trigger**: Send notification email, log activity, auto-generate PDF report.
  - **Auto-numbering**: On SUBMITTED, assign `INQ-FP-YYYY-XXXXX` if not already set.
  - **Side effects**: On CLEARED, auto-create Cost Estimation record (your Phase 4).
- **Locked editing**: SAR parameters only editable when inquiry is in QC_IN_PROGRESS; no changes after QC_COMPLETE.

**Implementation approach:**
```javascript
const INQUIRY_STATUS = {
  DRAFT: 0,
  SUBMITTED: 1,
  QC_IN_PROGRESS: 2,
  QC_COMPLETE: 3,
  CLEARED: 4,
  CONVERTED: 5,
  CLOSED: 6,
  CANCELLED: -1,
};

const TRANSITIONS = {
  submit:     { from: [0],    to: 1, roles: ['sales_rep'], trigger: 'INQUIRY_SUBMITTED' },
  startQC:    { from: [1],    to: 2, roles: ['qc','qc_manager'], trigger: 'QC_STARTED' },
  completeQC: { from: [2],    to: 3, roles: ['qc','qc_manager'], trigger: 'QC_COMPLETED' },
  clear:      { from: [3],    to: 4, roles: ['sales_manager','admin'], trigger: 'INQUIRY_CLEARED' },
  convert:    { from: [4],    to: 5, roles: ['sales_rep','admin'], trigger: 'INQUIRY_CONVERTED' },
  close:      { from: [5],    to: 6, roles: ['sales_rep','admin'], trigger: 'INQUIRY_CLOSED' },
  cancel:     { from: [0,1,2],to: -1,roles: ['sales_manager','admin'], trigger: 'INQUIRY_CANCELLED' },
  reopen:     { from: [-1,6], to: 0, roles: ['admin'], trigger: 'INQUIRY_REOPENED' },
};
```

**Complexity:** Medium — State machine logic + UI state indicators + permission checks per transition.

---

### 2.2 Trigger/Event System for Side Effects

**How Dolibarr implements it:**
- Every status change calls `$this->call_trigger('PROPAL_CLOSE_SIGNED', $user)`.
- 8 trigger types: `PROPAL_CREATE`, `PROPAL_VALIDATE`, `PROPAL_CLOSE_SIGNED`, `PROPAL_CLOSE_REFUSED`, `PROPAL_MODIFY`, `PROPAL_REOPEN`, `PROPAL_CANCEL`, `PROPAL_CLASSIFY_BILLED`.
- Triggers are PHP hooks registered by modules — any module can listen to any trigger and execute side effects (send email, update CRM, generate PDF, create linked document).

**How it maps to your Pre-Sales/QC workflow:**
- When inquiry moves to `QC_IN_PROGRESS` → trigger sends email notification to QC Lab (your existing Phase 2 step "Dispatch samples to QC Lab triggers email notification").
- When SAR status changes to `FAIL` → trigger auto-creates NCR.
- When inquiry CLEARED → trigger auto-generates Pre-Sales Clearance PDF.
- When inquiry CONVERTED → trigger creates Cost Estimation skeleton in Phase 4.

**Implementation approach:**
```javascript
// server/triggers/inquiryTriggers.js
const TRIGGER_HANDLERS = {
  'INQUIRY_SUBMITTED': [sendToQCQueue, logActivity],
  'QC_STARTED': [notifyQCLab, logActivity],
  'QC_COMPLETED': [notifySalesRep, generateCSEReport, logActivity],
  'INQUIRY_CLEARED': [generateClearancePDF, notifyEstimation, logActivity],
  'SAR_FAILED': [createNCR, notifyQCManager, logActivity],
};

async function fireTrigger(triggerName, context) {
  const handlers = TRIGGER_HANDLERS[triggerName] || [];
  for (const handler of handlers) {
    await handler(context);
  }
}
```

**Complexity:** Low-Medium — Pattern is simple; value is in having a centralized extensible hook system.

---

### 2.3 Rich Field Metadata System

**How Dolibarr implements it:**
- The `$fields` array in `propal.class.php` defines metadata per field:
  ```php
  'fk_soc' => ['type' => 'integer:Societe', 'label' => 'ThirdParty',
    'enabled' => 'isModEnabled("societe")', 'visible' => -1,
    'notnull' => 1, 'position' => 20, 'foreignkey' => 'societe.rowid',
    'css' => 'maxwidth500 widthcentpercentminusxx', 'help' => 'LinkToThirdparty']
  ```
- Each field has: `type` (with linked entity), `label` (i18n key), `enabled` (expression to show/hide based on modules), `visible` (level: -1=always, 0=hidden, 1=visible_in_list, 2=detail_only), `notnull`, `position` (ordering), `foreignkey`, `searchall` (fulltext searchable), `isameasure` (for aggregate queries), `css`, `help`, `arrayofkeyval` (for Select type enums).

**How it maps to your Pre-Sales/QC workflow:**
- Instead of hardcoding form fields in React, define a schema-driven approach where SAR forms, Inquiry forms, and QC result forms are generated from metadata.
- Benefits: Admin can add/reorder fields without code changes. Different user roles see different field sets (QC sees test parameters; Sales sees customer info). Fields can be conditionally shown based on product group.

**Implementation approach:**
- You already have `_schema.js` in your project root. Extend it with per-field metadata:
  ```javascript
  const SAR_FIELDS = [
    { key: 'product_group', type: 'select:ProductGroup', label: 'Product Group', visible: 'always', required: true, position: 10 },
    { key: 'sample_qty', type: 'integer', label: 'Sample Quantity', visible: 'detail', required: false, position: 20 },
    { key: 'tds_file', type: 'file', label: 'TDS Document', visible: 'detail', position: 30, help: 'Upload Technical Data Sheet' },
    // ...
  ];
  ```
- Build a `<SchemaForm fields={SAR_FIELDS} data={sarData} onChange={...} />` generic component.

**Complexity:** Medium — Needs a generic form renderer + field types. But pays off with every future form.

---

### 2.4 Deep Clone with Customer-Specific Adjustments

**How Dolibarr implements it:**
- `createFromClone()` method (line ~1700) does a full deep clone:
  - Copies all header fields, resets status to DRAFT, assigns new provisional number.
  - Clones all line items.
  - Optionally updates prices/descriptions for a different customer.
  - Copies linked objects, contacts, extra fields.
  - Renames associated directory.

**How it maps to your Pre-Sales/QC workflow:**
- When a customer asks for a variation of an existing product (different gauge, different print), the sales rep currently fills out a new inquiry from scratch. **Clone Inquiry** would:
  1. Copy all inquiry fields + SAR cards
  2. Reset status to DRAFT
  3. Let the rep adjust only what's different (new gauge, new customer)
  4. Link the clone to the original as "derived from"
- Also useful for re-testing: clone a failed SAR with adjusted parameters.

**Implementation approach:**
```javascript
async function cloneInquiry(originalId, { newCustomerId, resetSamples = false }) {
  const original = await db.inquiry.findById(originalId, { include: ['sars', 'contacts'] });
  const clone = {
    ...original,
    id: undefined,
    inquiry_number: undefined,  // auto-generated on submit
    status: INQUIRY_STATUS.DRAFT,
    created_at: new Date(),
    parent_inquiry_id: originalId,
    customer_id: newCustomerId || original.customer_id,
    sars: original.sars.map(sar => ({
      ...sar, id: undefined, status: resetSamples ? 'PENDING' : sar.status,
      readings: resetSamples ? [] : sar.readings,
    })),
  };
  return db.inquiry.create(clone);
}
```

**Complexity:** Low — Mostly a copy + reset operation. Link to parent is the main schema addition.

---

### 2.5 Auto-Generated PDF on Status Change

**How Dolibarr implements it:**
- On `closeProposal()` with STATUS_SIGNED, Dolibarr auto-calls `generateDocument()`.
- `generateDocument()` uses a template model class (e.g., `pdf_azur.modules.php` which extends `ModelePDFPropales`, using FPDF/TCPDF).
- PDF includes: company logo, document number, date, customer details, line items with quantities/prices, terms, signatures.
- PDF file is stored in a document directory named after the proposal reference number.

**How it maps to your Pre-Sales/QC workflow:**
- When QC completes evaluation → auto-generate **CSE Report PDF** with: inquiry details, all SAR results (parameters, readings, pass/fail), QC technician, timestamp.
- When Pre-Sales Clearance granted → auto-generate **Clearance Certificate PDF**.
- Both become downloadable from the inquiry detail page and are emailed to relevant parties.
- You already have HTML export components (`MultiChartHTMLExport.jsx`, `SalesRepHTMLExport.jsx`), so the pattern is familiar.

**Implementation approach:**
- Use your existing `html2pdf` / print dialog approach, or server-side with Puppeteer/Playwright:
  ```javascript
  // On QC_COMPLETED trigger:
  async function generateCSEReport(inquiry) {
    const html = renderCSEReportTemplate(inquiry, inquiry.sars);
    const pdf = await htmlToPdf(html);
    await saveDocument(inquiry.id, 'CSE_REPORT', pdf);
    await emailPdf(inquiry.salesRep.email, pdf, `CSE Report - ${inquiry.inquiry_number}`);
  }
  ```

**Complexity:** Low-Medium — Template HTML + PDF generation. You already have the building blocks.

---

## 3. Metafresh — RFQ Lifecycle & QM Analysis

Source: `de.metas.rfq/` (93 Java files) and `de.metas.qualitymgmt/`

### 3.1 Full Document Lifecycle with Event Dispatching

**How Metafresh implements it:**
- `RfQDocumentHandler.java` (288 lines) implements the `DocumentHandler` interface with methods: `completeIt()`, `closeIt()`, `unCloseIt()`, `reactivateIt()`, `approveIt()`, `rejectIt()`, `voidIt()`.
- **Event dispatcher** (`IRfQEventDispacher.java`) fires 12 lifecycle events:
  ```
  fireBeforeComplete(RfQ) / fireAfterComplete(RfQ)
  fireBeforeClose(RfQ) / fireAfterClose(RfQ)
  fireBeforeUnClose(RfQ) / fireAfterUnClose(RfQ)
  fireDraftCreated(RfQResponse) / fireBeforeComplete(RfQResponse) / fireAfterComplete(RfQResponse)
  fireBeforeClose(RfQResponse) / fireBeforeUnClose(RfQResponse) / fireAfterClose(RfQResponse) / fireAfterUnClose(RfQResponse)
  ```
- Listeners registered via `registerListener(IRfQEventListener)` — plug-in architecture.
- On `completeIt()`: fires beforeComplete → validates lines → marks COMPLETED → **auto-generates RfQResponses** → fires afterComplete.
- On `closeIt()`: fires beforeClose → marks CLOSED → **auto-completes all draft responses** → fires afterClose.
- On `reactivateIt()`: **voids and deletes all responses** → resets to unprocessed.

**How it maps to your Pre-Sales/QC workflow:**
- Your Inquiry is like an RfQ, and SARs are like RfQLines. The before/after event pattern lets you:
  - `beforeCompleteQC`: Validate all SAR parameters have readings
  - `afterCompleteQC`: Auto-generate CSE report, notify sales rep
  - `beforeClearance`: Validate all SARs are evaluated (no "Pending" left)
  - `afterClearance`: Create cost estimation record
  - `reactivateInquiry`: Reset all SARs to pending, delete generated reports
- The listener pattern means new modules (e.g., a future audit module) can hook into events without modifying core code.

**Implementation approach:**
```javascript
// server/events/inquiryEventBus.js
class InquiryEventBus {
  listeners = new Map();

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  async emit(event, context) {
    for (const handler of (this.listeners.get(event) || [])) {
      await handler(context);
    }
  }
}

// Usage:
eventBus.on('BEFORE_QC_COMPLETE', validateAllSARsEvaluated);
eventBus.on('AFTER_QC_COMPLETE', generateCSEReport);
eventBus.on('AFTER_QC_COMPLETE', notifySalesRep);
eventBus.on('BEFORE_CLEARANCE', ensureAllSARsPassed);
```

**Complexity:** Low — Event emitter is simple. The value is architectural: decouples triggers from core logic.

---

### 3.2 Response Ranking Strategy (Pluggable Scoring)

**How Metafresh implements it:**
- `IRfQResponseRankingStrategy.java` defines a single method: `void rank(I_C_RfQ rfq)` with a constant `RANK_Invalid = 999`.
- `C_RfQ_RankResponses.java` (process class) gets the ranking strategy from `IRfQConfiguration` and calls `rank(rfq)`.
- The strategy is **configurable per RfQ** via `rfqConfiguration.newRfQResponseRankingStrategyFor(rfq)` — different RfQs can use different ranking algorithms.
- After ranking, the ranked responses are used to determine the "Selected Winner" (used later in `C_RfQ_CreatePO`).

**How it maps to your Pre-Sales/QC workflow:**
- When multiple samples are evaluated for the same product (e.g., testing 3 supplier materials), you need to **rank** them. A pluggable scoring strategy lets you:
  - **Best Overall Score**: Weighted average across all parameters
  - **Must-Pass-All**: Only samples passing all critical parameters rank; then sort by non-critical scores
  - **Cost-Performance**: Factor in material cost alongside QC scores
- QC Manager selects ranking strategy when comparing samples. The "winner" is recommended for production.

**Implementation approach:**
```javascript
const RANKING_STRATEGIES = {
  weightedAverage: (sars) => {
    return sars.map(sar => ({
      ...sar,
      score: sar.readings.reduce((sum, r) => sum + r.score * r.weight, 0) / sar.readings.reduce((sum, r) => sum + r.weight, 0),
    })).sort((a, b) => b.score - a.score);
  },
  mustPassFirst: (sars) => {
    const allPass = sars.filter(s => s.readings.every(r => r.status === 'Pass'));
    const partial = sars.filter(s => !s.readings.every(r => r.status === 'Pass'));
    return [...allPass.sort((a,b) => b.overallScore - a.overallScore), ...partial];
  },
};
```

**Complexity:** Medium — Ranking logic + UI for strategy selection + comparison view.

---

### 3.3 RFQ-to-Order Conversion (One-Click)

**How Metafresh implements it:**
- `C_RfQ_CreateSO.java`: Creates a Sales Order from the RfQ:
  1. Gets BPartner from RfQ
  2. Creates MOrder header (SOTrx=true, BPartner, SalesRep, DeliveryDate)
  3. For each RfQLine → RfQLineQty marked as `isOfferQty`: creates MOrderLine with product, qty, price
  4. Price logic: uses `OfferAmt` if set → else `BestResponseAmt` + margin % → else zero with warning
  5. Links Order back to RfQ: `rfq.setC_Order(order)`
- `C_RfQ_CreatePO.java` (252 lines): Creates Purchase Orders from ranked responses:
  1. **Winner-level**: If response has `isSelectedWinner`, creates one PO for entire response
  2. **Line-level**: If no overall winner, creates POs per `isSelectedWinner` lines, grouping by BPartner
  3. Each PO line gets price from `calculatePriceWithoutDiscount(rfqResponseLineQty)`

**How it maps to your Pre-Sales/QC workflow:**
- After Pre-Sales Clearance (Phase 3 → Phase 4/5), the inquiry needs to become a **Quotation** and eventually a **Sales Order**. Currently this is a manual step.
- One-click conversion: Inquiry → Quotation pre-fills: customer, product lines (from SARs), estimated quantities, approved material specs.
- After quotation is signed: Quotation → Sales Order pre-fills everything from quotation.
- The "margin" concept (Metafresh adds margin % to best response price) maps to your cost estimation adding profit margin.

**Implementation approach:**
```javascript
async function convertInquiryToQuotation(inquiryId) {
  const inquiry = await db.inquiry.findById(inquiryId, { include: ['sars', 'customer'] });
  if (inquiry.status !== INQUIRY_STATUS.CLEARED) throw new Error('Inquiry must be cleared first');

  const quotation = await db.quotation.create({
    inquiry_id: inquiryId,
    customer_id: inquiry.customer_id,
    sales_rep_id: inquiry.sales_rep_id,
    status: 'DRAFT',
    lines: inquiry.sars
      .filter(sar => sar.status === 'PASS')
      .map(sar => ({
        product_group_id: sar.product_group_id,
        description: sar.description,
        estimated_qty: sar.estimated_qty,
        // price to be filled in cost estimation
      })),
  });

  inquiry.quotation_id = quotation.id;
  inquiry.status = INQUIRY_STATUS.CONVERTED;
  await inquiry.save();

  return quotation;
}
```

**Complexity:** Medium — Needs quotation/order entities if not already built; mapping logic is straightforward.

---

### 3.4 Work Dates Auto-Calculation

**How Metafresh implements it:**
- `RfQWorkDatesUtil.java` (113 lines) handles 3 interlinked date fields: `DateWorkStart`, `DateWorkComplete`, `DeliveryDays`.
- Tri-directional calculation:
  - If `startDate` + `deliveryDays` exist → compute `completeDate`
  - If `startDate` + `completeDate` exist → compute `deliveryDays`
  - If `completeDate` + `deliveryDays` exist → compute `startDate`
- Methods: `updateWorkDates()`, `updateFromDateWorkStart()`, `updateFromDateWorkComplete()`, `updateFromDeliveryDays()`.
- Applied to both RfQ and individual RfQResponse via the `IRfQWorkDatesAware` interface.

**How it maps to your Pre-Sales/QC workflow:**
- Your Phase 2 "Sample & QC Review" has a duration of "2–5 days". Auto-calculating dates:
  - Sales rep sets target completion date → system calculates QC start deadline
  - QC logs actual start date → system shows expected completion date
  - If delivery days change (rush order), dates adjust automatically
- Same pattern for entire inquiry lifecycle: priority level sets delivery days → all phase dates cascade.

**Implementation approach:**
```javascript
function updateWorkDates(record) {
  const { start_date, complete_date, delivery_days } = record;
  if (start_date && delivery_days && !complete_date) {
    record.complete_date = addDays(start_date, delivery_days);
  } else if (start_date && complete_date && !delivery_days) {
    record.delivery_days = daysBetween(start_date, complete_date);
  } else if (!start_date && complete_date && delivery_days) {
    record.start_date = addDays(complete_date, -delivery_days);
  }
}
```

**Complexity:** Low — Pure date math. Add to inquiry/SAR models and forms.

---

### 3.5 QM Analysis Report with Material Tracking

**How Metafresh implements it:**
- `QMAnalysisReportDocumentHandler.java` (126 lines) links the QM Analysis Report to `Material Tracking` via `AttributeSetInstance`:
  ```java
  final AttributeSetInstanceId asiId = AttributeSetInstanceId.ofRepoIdOrNone(analysisReport.getM_AttributeSetInstance_ID());
  final I_M_Material_Tracking materialTracking = materialTrackingAttributeBL.getMaterialTrackingOrNull(asiId);
  if (materialTracking != null) {
    final I_M_Material_Tracking_Ref ref = materialTrackingDAO.createMaterialTrackingRefNoSave(materialTracking, analysisReport);
    InterfaceWrapperHelper.save(ref);
  }
  ```
- On `completeIt()`: Links the report to material tracking, marks processed, sets next action to ReActivate.
- On `reactivateIt()`: Unmarks processed, sets next action to Complete.
- The `de.metas.materialtracking` module (189 Java files) tracks materials through the entire lifecycle with `Material_Tracking_Ref` cross-references to any document.

**How it maps to your Pre-Sales/QC workflow:**
- When QC evaluates a sample, link the QC result to the **specific material batch/lot**:
  - Sample SMP-FP-2025-00123 was cut from Film Batch LOT-2025-0456
  - If the sample passes, the material batch is "pre-approved" for this customer's product
  - If it fails, the material batch is flagged
  - When the order goes to production (Phase 11), the system can verify the approved material batch is being used
- Creates full traceability: Customer complaint → Sales Order → Production Batch → Material Lot → QC Sample → QC Result.

**Implementation approach:**
- Add `material_batch_id` to SAR entity.
- When SAR is completed, create a `MaterialTrackingRef` linking the SAR to the batch.
- In production phase, validate material batch has an approved QC reference.

**Complexity:** Medium — Needs material/batch tracking entities (may already exist in your system).

---

## 4. iDempiere — Workflow Engine & Quality Tests

Source: `org.compiere.wf/` and `org.compiere.model/`

### 4.1 Configurable Workflow Engine with Node Types

**How iDempiere implements it:**
- `MWorkflow.java` (1008 lines): Defines a workflow as a directed graph of nodes connected by transitions.
- `MWFNode` has 12 action types:
  ```
  ACTION_AppsProcess    — Run a server process
  ACTION_DocumentAction — Execute a document lifecycle action (Complete, Approve, etc.)
  ACTION_AppsReport     — Generate a report
  ACTION_AppsTask       — Execute an OS task
  ACTION_SetVariable    — Set a column value
  ACTION_SubWorkflow    — Launch a nested workflow
  ACTION_UserChoice     — Present choices to a user
  ACTION_UserWorkbench  — Open a workbench
  ACTION_UserForm       — Open a form
  ACTION_UserWindow     — Open a window
  ACTION_UserInfo       — Display information
  ACTION_WaitSleep      — Pause/wait for duration
  ```
- `MWFNodeNext` defines transitions between nodes with routing conditions (`MWFNextCondition`).
- `MWFActivity` implements `Runnable` — each node execution is an activity that can run asynchronously.
- `MWFProcess` tracks the entire workflow execution with state.
- `MWFBlock` groups nodes into logical blocks.
- `MWFResponsible` defines who handles each node (user, role, org, or invoker).
- `MWFEventAudit` records every activity for audit trail.

**How it maps to your Pre-Sales/QC workflow:**
- Instead of hardcoding the 15-phase workflow in `WorkflowLandingPage.jsx`, make it **configurable**:
  - Admin defines phases as workflow nodes
  - Nodes have types: "UserForm" (QC fills out form), "DocumentAction" (auto-change status), "UserChoice" (approve/reject gate), "SubWorkflow" (nested process)
  - Transitions have conditions: "move to Phase 3 only if all SARs pass"
  - Each activity logs to audit trail automatically
- Future: Admin can add new phases, change the order, add parallel paths — without code changes.

**Implementation approach (simplified):**
```javascript
const WORKFLOW_NODES = [
  { id: 'inquiry_reg', type: 'UserForm', form: 'InquiryCapture', responsible: 'sales_rep' },
  { id: 'sar_creation', type: 'UserForm', form: 'SARBuilder', responsible: 'sales_rep' },
  { id: 'qc_dispatch', type: 'DocumentAction', action: 'setStatus', value: 'QC_IN_PROGRESS', responsible: 'system' },
  { id: 'qc_eval', type: 'UserForm', form: 'QCResultForm', responsible: 'qc_role' },
  { id: 'qc_gate', type: 'UserChoice', choices: ['Approve','Reject','Conditional'], responsible: 'qc_manager' },
  { id: 'clearance', type: 'UserChoice', choices: ['Clear','Reject'], responsible: 'sales_manager' },
  { id: 'convert', type: 'DocumentAction', action: 'convertToQuotation', responsible: 'system' },
];

const TRANSITIONS = [
  { from: 'inquiry_reg', to: 'sar_creation', condition: null },
  { from: 'sar_creation', to: 'qc_dispatch', condition: 'sars.length > 0' },
  { from: 'qc_dispatch', to: 'qc_eval', condition: null },
  { from: 'qc_eval', to: 'qc_gate', condition: 'allSARsEvaluated' },
  { from: 'qc_gate', to: 'clearance', condition: 'choice === "Approve"' },
  { from: 'qc_gate', to: 'qc_eval', condition: 'choice === "Conditional"' }, // loop back
  { from: 'clearance', to: 'convert', condition: 'choice === "Clear"' },
];
```

**Complexity:** High — Full workflow engine is a big build. But can be done incrementally: start with a simple state machine (Feature 2.1), evolve toward configurable nodes later.

---

### 4.2 Quality Test → Result → Attribute Set Chain

**How iDempiere implements it:**
- `MQualityTest.java`: Defines a quality test with `createResult(m_attributesetinstance_id)` that creates a `MQualityTestResult` linked to an `AttributeSetInstance`.
- `X_M_QualityTestResult.java`: Fields include `IsQCPass` (boolean), `M_AttributeSetInstance_ID`, `M_QualityTest_ID`, `Processed`, `ExpectedResult` (virtual/computed), `Description` (virtual).
- `AttributeSetInstance` is iDempiere's way of attaching attributes (like batch info, serial number, test results) to any product/material instance.
- The QC test result is directly attached to the material's attribute set — so when that material appears anywhere in the system (inventory, production order, shipment), the QC result "travels with it."

**How it maps to your Pre-Sales/QC workflow:**
- Attach QC results **directly to the sample/material record** as attributes, not just as a separate QC record:
  - Sample SMP-FP-2025-00123 has attributes: `{ qc_status: "Pass", bond_strength: 285, print_adhesion: 4.5, tested_by: "John", tested_at: "2025-06-01" }`
  - When this sample's material is referenced in a quotation or production order, the QC attributes are visible inline.
  - Eliminates "where are the QC results for this material?" — they're embedded on the material itself.

**Implementation approach:**
- Add a `qc_attributes` JSON field on your sample/material record.
- On QC completion, write summary attributes:
  ```javascript
  sample.qc_attributes = {
    status: 'PASS',
    tested_at: new Date(),
    tested_by: user.id,
    results: readings.map(r => ({ param: r.name, value: r.mean, status: r.status })),
  };
  ```
- Display these attributes as badges/chips on any view that references this material.

**Complexity:** Low — Schema addition + UI badges. Very high usability value.

---

### 4.3 Workflow Event Audit Trail

**How iDempiere implements it:**
- `MWFEventAudit` records every workflow activity execution:
  - Workflow ID, Node ID, Activity ID, Table/Record ID
  - User who performed the action
  - Old value, New value
  - Timestamp
  - Event type (state changes, assignments, escalations)
- This creates a complete, queryable history of every decision and action in every workflow execution.

**How it maps to your Pre-Sales/QC workflow:**
- Your Phase 3 mentions "Full audit trail of clearance decision". This extends it to EVERY phase:
  - Who submitted the inquiry and when
  - Who dispatched samples and when
  - Who performed each QC test, what values they entered, when
  - Who approved/rejected at QC gate
  - Who granted clearance
  - Every edit to any field, with before/after values
- Queryable: "Show me all inquiries where QC was re-done more than twice" or "Average time from sample dispatch to QC completion."

**Implementation approach:**
```javascript
// server/middleware/auditTrail.js
async function logAudit({ entity_type, entity_id, action, user_id, old_values, new_values, metadata }) {
  await db.audit_log.create({
    entity_type,    // 'inquiry', 'sar', 'qc_reading'
    entity_id,
    action,         // 'STATUS_CHANGE', 'FIELD_UPDATE', 'APPROVAL', 'REJECTION'
    user_id,
    old_values: JSON.stringify(old_values),
    new_values: JSON.stringify(new_values),
    metadata: JSON.stringify(metadata),  // e.g., { workflow_node: 'qc_gate', transition: 'approve' }
    timestamp: new Date(),
  });
}
```
- Display as a timeline in the Inquiry Detail page (similar to your existing "Full activity history tracked automatically" in Phase 1).

**Complexity:** Low-Medium — Audit table + middleware to intercept changes + timeline UI component.

---

### 4.4 Responsible Assignment (Role-Based Node Ownership)

**How iDempiere implements it:**
- `MWFResponsible` defines 4 responsibility types for each workflow node:
  - **Human** — specific user
  - **Role** — any user with a specific role
  - **Organization** — any user in the org
  - **Invoker** — the user who triggered the workflow
- Each `MWFNode` links to a `MWFResponsible`, determining who can perform the activity.
- If responsibility is Role-based, all users with that role see the task in their queue.

**How it maps to your Pre-Sales/QC workflow:**
- Phase 2 currently says "QC Lab" receives samples — but WHO specifically?
  - Auto-assign to specific QC technician based on product group expertise
  - Or assign to QC role (any QC person can pick it up from queue)
  - Escalation: if not acted on within SLA, reassign to QC Manager
- Phase 3 clearance: Currently "Sales Manager reviews" — auto-assign to the sales rep's direct manager.

**Implementation approach:**
```javascript
const PHASE_RESPONSIBILITY = {
  'qc_eval': { type: 'role', role: 'quality_control', fallback: 'qc_manager' },
  'qc_gate': { type: 'role', role: 'qc_manager' },
  'clearance': { type: 'invoker_manager', fallback_role: 'sales_manager' },
};

function assignTask(phase, inquiry) {
  const config = PHASE_RESPONSIBILITY[phase];
  if (config.type === 'role') {
    return db.users.findAll({ where: { role: config.role, active: true } });
  }
  if (config.type === 'invoker_manager') {
    const manager = db.users.findManagerOf(inquiry.created_by);
    return manager || db.users.findAll({ where: { role: config.fallback_role } });
  }
}
```

**Complexity:** Low-Medium — User role/manager hierarchy likely already exists; assignment logic on top.

---

## 5. Twenty — Workflow Automation & Timeline

Source: `packages/twenty-server/src/modules/workflow/`

### 5.1 Visual Workflow Builder with Action Types

**How Twenty implements it:**
- 17+ action types as a union type:
  ```typescript
  WorkflowCodeAction | WorkflowSendEmailAction | WorkflowCreateRecordAction |
  WorkflowUpdateRecordAction | WorkflowDeleteRecordAction | WorkflowFilterAction |
  WorkflowIfElseAction | WorkflowFormAction | WorkflowHttpRequestAction |
  WorkflowIteratorAction | WorkflowDelayAction | WorkflowAiAgentAction | ...
  ```
- 4 trigger types: `DatabaseEventTrigger` (record created/updated/deleted), `ManualTrigger`, `CronTrigger` (scheduled), `WebhookTrigger`.
- Workflow has versions: `lastPublishedVersionId`, statuses: DRAFT → ACTIVE → DEACTIVATED.
- WorkflowRun tracks execution: NOT_STARTED → RUNNING → COMPLETED/FAILED, with `stepsOutput` recording each step's output.

**How it maps to your Pre-Sales/QC workflow:**
- Build automated workflows that trigger on database events:
  - **DatabaseEventTrigger**: When SAR status changes to "EVALUATED" → run automation
  - **Actions chain**: Filter (is status = PASS?) → If-Else (all parameters pass?) → Send Email (notify sales rep) → Update Record (set inquiry status) → Create Record (create CSE report)
  - **CronTrigger**: Daily at 8 AM → check for overdue QC evaluations → send reminder emails
  - **WebhookTrigger**: External lab system posts results → update SAR readings automatically

**Implementation approach (simplified automation engine):**
```javascript
const AUTOMATIONS = [
  {
    name: 'QC Complete Notification',
    trigger: { type: 'database', entity: 'sar', event: 'update', condition: 'new.status === "EVALUATED"' },
    steps: [
      { type: 'filter', condition: 'record.status === "PASS"' },
      { type: 'sendEmail', to: 'record.inquiry.salesRep.email', template: 'qc_pass_notification' },
      { type: 'updateRecord', entity: 'inquiry', field: 'last_qc_update', value: 'now()' },
    ],
  },
  {
    name: 'Overdue QC Reminder',
    trigger: { type: 'cron', schedule: '0 8 * * *' },
    steps: [
      { type: 'findRecords', entity: 'sar', filter: 'status = PENDING AND created_at < now() - 3 days' },
      { type: 'iterator', forEach: 'record', steps: [
        { type: 'sendEmail', to: 'record.assignedTo.email', template: 'overdue_qc_reminder' },
      ]},
    ],
  },
];
```

**Complexity:** High for a full visual builder; Medium for a code-defined automation engine.

---

### 5.2 If-Else Branching with Dynamic Context Resolution

**How Twenty implements it:**
- `if-else.workflow-action.ts`: Evaluates filter conditions with dynamic context resolution:
  ```typescript
  const resolvedValue = await resolveInput(filter.value, context);
  const resolvedStepOutputKey = await resolveInput(filter.stepOutputKey, context);
  ```
- Filters are organized as `stepFilterGroups` (AND groups of OR filters).
- Calls `findMatchingBranch()` to determine which branch to follow based on filter evaluation.
- Returns `{ result: { matchingBranchId } }` which the workflow engine uses to route to the next step.

**How it maps to your Pre-Sales/QC workflow:**
- QC evaluation outcomes need branching:
  - **All Pass** → Route to clearance
  - **Some Conditional** → Route to QC Manager review with highlighted conditional items
  - **Any Fail** → Route to NCR creation + re-test scheduling
  - **Critical Fail** → Route directly to Sales Manager with alert
- Each branch can have different notification recipients, different next steps, different SLAs.

**Implementation approach:**
```javascript
function evaluateQCOutcome(inquiry) {
  const sars = inquiry.sars;
  const allPass = sars.every(s => s.status === 'PASS');
  const anyFail = sars.some(s => s.status === 'FAIL');
  const anyConditional = sars.some(s => s.status === 'CONDITIONAL');
  const criticalFail = sars.some(s => s.status === 'FAIL' && s.is_critical);

  if (criticalFail) return { branch: 'CRITICAL_FAIL', actions: ['alertSalesManager', 'createNCR'] };
  if (anyFail) return { branch: 'FAIL', actions: ['createNCR', 'scheduleRetest'] };
  if (anyConditional) return { branch: 'CONDITIONAL', actions: ['routeToQCManager'] };
  return { branch: 'ALL_PASS', actions: ['routeToClearance', 'notifySalesRep'] };
}
```

**Complexity:** Low-Medium — The logic is simple; the value is in making it configurable vs. hardcoded.

---

### 5.3 Timeline Activity Feed with Cross-Entity Links

**How Twenty implements it:**
- `timeline-activity.workspace-entity.ts` defines:
  - `happensAt` (timestamp), `name` (event name), `properties` (JSON blob)
  - `linkedRecordCachedName`, `linkedRecordId`, `linkedRecordObjectMetadataId` — polymorphic link to ANY entity
  - Relations to: `workspaceMember`, `targetPerson`, `targetCompany`, `targetOpportunity`, `targetNote`, `targetTask`, `targetWorkflow`, `targetWorkflowVersion`, `targetWorkflowRun`, `targetDashboard`
  - Also supports custom entity targets (plugin architecture).
- Every action in the system creates a TimelineActivity record.
- Timeline is displayed chronologically on entity detail pages, showing all activities related to that entity.

**How it maps to your Pre-Sales/QC workflow:**
- Build a **unified activity timeline** on the Inquiry Detail page showing:
  - "Sales Rep John created inquiry" (timestamp)
  - "SAR-001 created for Product Group: Films" (linked to SAR)
  - "3 samples dispatched to QC Lab" (linked to samples)
  - "QC Tech Sarah scanned sample SMP-FP-2025-00123" (linked to sample)
  - "QC evaluation: Bond Strength = 285 g/15mm (PASS)" (linked to reading)
  - "QC Manager approved SAR-001" (linked to SAR)
  - "Pre-Sales Clearance granted by Manager Tom" (linked to inquiry)
  - "CSE Report PDF generated" (linked to document)
- Each activity links to the related entity, so clicking takes you to the specific SAR, sample, or document.
- Your Phase 1 already mentions "Full activity history tracked automatically" — this is the full implementation.

**Implementation approach:**
```javascript
// Activity entry format:
{
  id: uuid(),
  entity_type: 'inquiry',     // or 'sar', 'sample', 'qc_reading'
  entity_id: inquiry.id,
  happens_at: new Date(),
  name: 'QC_EVALUATION_COMPLETE',   // event type
  properties: {                      // event-specific details
    sar_id: sar.id,
    sar_name: 'SAR-001',
    result: 'PASS',
    evaluated_by: 'Sarah',
    readings_count: 5,
  },
  linked_record_type: 'sar',
  linked_record_id: sar.id,
  linked_record_name: 'SAR-001 - Films',
  user_id: currentUser.id,
}
```
- Render as a vertical timeline with icons per event type, timestamps, and clickable links.

**Complexity:** Low-Medium — Table + insert-on-event + timeline UI component. You likely have some of this already.

---

### 5.4 Workflow Versioning (Draft → Active → Deactivated)

**How Twenty implements it:**
- `WorkflowWorkspaceEntity` has `statuses` enum: DRAFT, ACTIVE, DEACTIVATED.
- `lastPublishedVersionId` links to the currently active workflow version.
- When a workflow is edited, a new version is created (draft). Publishing makes it active and deactivates the previous version.
- `WorkflowRunWorkspaceEntity` links to a specific `workflowVersionId`, so historical runs always reference the version that was active when they ran.

**How it maps to your Pre-Sales/QC workflow:**
- As your QC process evolves (new test parameters added, acceptance thresholds changed, new workflow steps), you need to track which version of the process was used for each inquiry:
  - Inquiry INQ-2025-00100 was evaluated with "QC Process v3" (had 5 parameters)
  - Inquiry INQ-2025-00200 was evaluated with "QC Process v4" (added a 6th parameter)
  - Audit/compliance can compare processes used across time periods.
- Also applies to QC templates: version the templates so you know which parameter definitions were in effect.

**Implementation approach:**
```javascript
// QC Template versioning:
QCSampleTemplate {
  id, name, current_version_id,
  versions: [
    { version_id, version_num: 1, status: 'archived', parameters: [...], created_at, published_at },
    { version_id, version_num: 2, status: 'active', parameters: [...], created_at, published_at },
    { version_id, version_num: 3, status: 'draft', parameters: [...], created_at },
  ]
}

// SAR links to specific template version:
SAR { ..., template_version_id: '...' }
```

**Complexity:** Medium — Versioning adds schema complexity but is essential for compliance.

---

## 6. Cross-App Synthesis — Top Priority Features

### Recommended Implementation Order (based on value/effort ratio)

| Priority | Feature | Source App(s) | Complexity | Impact |
|----------|---------|---------------|-----------|--------|
| **1** | Formal State Machine for Inquiry Lifecycle | Dolibarr + Metafresh | Medium | Very High — Foundation for all other features |
| **2** | Template-Based QC Parameters | ERPNext | Medium | Very High — Eliminates manual parameter entry |
| **3** | Multi-Reading Evaluation (measurements + auto pass/fail) | ERPNext | Low-Med | Very High — Captures actual test data, not just pass/fail |
| **4** | Unified Activity Timeline | Twenty | Low-Med | High — Visibility into inquiry progress |
| **5** | Trigger/Event System for Notifications | Dolibarr + Metafresh | Low-Med | High — Automates email notifications |
| **6** | Audit Trail on Every Action | iDempiere | Low-Med | High — Compliance and traceability |
| **7** | Auto-Generated PDF on Status Change | Dolibarr | Low-Med | High — CSE Report, Clearance Certificate |
| **8** | Non-Conformance Reports (NCR) | ERPNext | Med-High | High — Structured failure handling |
| **9** | If-Else Branching on QC Outcome | Twenty + iDempiere | Low-Med | Medium — Different paths for pass/conditional/fail |
| **10** | QC Result Attributes on Material | iDempiere + Metafresh | Low | Medium — Traceability |
| **11** | Work Dates Auto-Calculation | Metafresh | Low | Medium — SLA tracking |
| **12** | Clone Inquiry | Dolibarr | Low | Medium — Productivity for variations |
| **13** | Inquiry → Quotation Conversion | Metafresh | Medium | Medium — End-to-end flow |
| **14** | Formula-Based Acceptance Criteria | ERPNext | Medium | Medium — Complex pass/fail rules |
| **15** | Response Ranking / Sample Comparison | Metafresh | Medium | Medium — Multi-supplier comparison |
| **16** | QC Template Versioning | Twenty | Medium | Medium — Process compliance |
| **17** | Role-Based Node Ownership + Auto-Assignment | iDempiere | Low-Med | Medium — Task routing |
| **18** | Rich Field Metadata / Schema-Driven Forms | Dolibarr | Medium | Medium — Long-term maintainability |
| **19** | Configurable Workflow Engine | iDempiere + Twenty | High | High — But only needed when process changes frequently |

### Phase 1 Sprint (Weeks 1–3): Foundation

Build features 1–3: State Machine + QC Templates + Multi-Reading Evaluation.
These three together transform the QC experience from "someone types Pass/Fail in a text box" to "system auto-evaluates 10 measurements against predefined parameters and determines pass/fail."

### Phase 2 Sprint (Weeks 4–5): Visibility & Automation

Build features 4–7: Timeline + Triggers + Audit Trail + Auto-PDF.
These make the system self-documenting and proactive with notifications.

### Phase 3 Sprint (Weeks 6–8): Structured Follow-Up

Build features 8–12: NCR + Branching + Material Attributes + Dates + Clone.
These handle the "what happens when things fail" path that's currently unstructured.

### Phase 4 Sprint (Weeks 9+): Advanced

Build features 13–19 as needed based on actual usage patterns.

---

## Appendix: Source File References

### ERPNext
- `erpnext/stock/doctype/quality_inspection/quality_inspection.py` (470 lines) — Core inspection logic
- `erpnext/stock/doctype/quality_inspection/quality_inspection.json` — DocType definition
- `erpnext/stock/doctype/quality_inspection_reading/quality_inspection_reading.json` — Reading row definition
- `erpnext/stock/doctype/quality_inspection_template/quality_inspection_template.json` — Template definition
- `erpnext/quality_management/doctype/quality_feedback/quality_feedback.json`
- `erpnext/quality_management/doctype/quality_action/quality_action.json`
- `erpnext/quality_management/doctype/quality_procedure/quality_procedure.json`
- `erpnext/quality_management/doctype/quality_goal/quality_goal.json`
- `erpnext/quality_management/doctype/quality_review/quality_review.json`
- `erpnext/quality_management/doctype/non_conformance/non_conformance.json` + `.py`

### Dolibarr
- `dolibarr/htdocs/comm/propal/class/propal.class.php` (4121 lines) — Full Propal lifecycle
- `dolibarr/htdocs/core/modules/propale/doc/pdf_azur.modules.php` — PDF template

### Metafresh
- `de.metas.rfq/src/main/java/de/metas/rfq/RfQDocumentHandler.java` (288 lines) — RFQ document lifecycle
- `de.metas.rfq/src/main/java/de/metas/rfq/IRfqBL.java` — Business logic interface
- `de.metas.rfq/src/main/java/de/metas/rfq/IRfQResponseRankingStrategy.java` — Pluggable ranking
- `de.metas.rfq/src/main/java/de/metas/rfq/event/IRfQEventDispacher.java` — Event system
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_CreateSO.java` — RFQ→Sales Order
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_CreatePO.java` (252 lines) — RFQ→Purchase Order
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_RankResponses.java` — Response ranking
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_Publish.java` — Publish invitations
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_CloseResults.java` — Close responses
- `de.metas.rfq/src/main/java/de/metas/rfq/process/C_RfQ_CreateResponses.java` — Generate responses
- `de.metas.rfq/src/main/java/de/metas/rfq/util/RfQWorkDatesUtil.java` — Date calculations
- `de.metas.qualitymgmt/src/main/java/de/metas/qualitymgmt/analysis/QMAnalysisReportDocumentHandler.java` — QM+Material Tracking

### iDempiere
- `org.compiere.wf/MWorkflow.java` (1008 lines) — Workflow engine core
- `org.compiere.wf/MWFNode.java` — Workflow node (12 action types)
- `org.compiere.wf/MWFActivity.java` — Runnable activity execution
- `org.compiere.wf/MWFProcess.java` — Workflow process tracking
- `org.compiere.wf/MWFNodeNext.java` — Transitions
- `org.compiere.wf/MWFNextCondition.java` — Conditional routing
- `org.compiere.wf/MWFEventAudit.java` — Audit trail
- `org.compiere.wf/MWFResponsible.java` — Node ownership
- `org.compiere.model/MQualityTest.java` — Quality test definition
- `org.compiere.model/MQualityTestResult.java` — Test result with AttributeSetInstance link

### Twenty
- `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow.workspace-entity.ts`
- `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-run.workspace-entity.ts`
- `packages/twenty-server/src/modules/timeline/standard-objects/timeline-activity.workspace-entity.ts`
- `packages/twenty-front/src/modules/workflow/types/Workflow.ts` (17+ action types defined)
- `packages/twenty-server/src/modules/workflow/workflow-action-runner/workflow-actions/if-else.workflow-action.ts`
- `packages/twenty-server/src/modules/workflow/workflow-action-runner/workflow-actions/record-crud/create-record.workflow-action.ts`
