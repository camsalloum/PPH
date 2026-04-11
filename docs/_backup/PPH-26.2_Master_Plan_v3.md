**PPH-26.2**

**CRM / MES Integration**

**Master Implementation Plan**

Version 3.0 \| March 2026 \| Flexible Packaging Division

  ----------------- ----------------- ----------------- -----------------
  **23 / 32 Steps   **11 Bugs → Fix   **15 New Tables** **9 Weeks Total**
  Built**           First**                             

  ----------------- ----------------- ----------------- -----------------

**1. Role-Based View Model**

*The system enforces two tiers of access across every module. The gate
condition is: role ∈ FULL_ACCESS_ROLES AND designation_level ≥ 6. This
is already implemented in CRMModule.jsx and must be consistently applied
to all new and refactored views.*

**1.1 Access Tier Definitions**

  -----------------------------------------------------------------------------------------
  **Tier**      **Roles**              **Level**   **What They See**     **Can Do**
  ------------- ---------------------- ----------- --------------------- ------------------
  MANAGEMENT    admin, manager,        ≥ 6         All teams, all        Send leads to any
  (Tier 1)      sales_manager,                     customers, all        rep, create &
                sales_coordinator                  inquiries, all tasks, assign tasks,
                                                   all QC samples, all   allocate projects,
                                                   production jobs       approve
                                                   across all reps       quotations, full
                                                                         pipeline
                                                                         dashboard,
                                                                         cross-team reports

  SALES REP     sales_rep,             \< 6        Own customers only,   Create inquiries,
  (Tier 2)      sales_executive                    own inquiries, own    log activities,
                                                   tasks, own pipeline   submit quotations
                                                                         for approval,
                                                                         capture PO, record
                                                                         dispatch

  QC MANAGER    qc_manager + level ≥ 6 ≥ 6         All QC samples all    Approve/reject
  (Tier 1)                                         divisions, all CSEs,  CSE, assign QC
                                                   NCR list              tasks to analysts,
                                                                         view full QC
                                                                         dashboard with
                                                                         team metrics

  QC ANALYST    quality_control,       \< 6        Samples assigned to   Perform analysis,
  (Tier 2)      qc_lab                             them or in QC inbox,  submit results,
                                                   own analyses          cannot approve CSE

  PRODUCTION    production_manager +   ≥ 6         All job cards, all    Create job cards,
  MGR (Tier 1)  level ≥ 6                          production jobs, all  approve job cards,
                                                   material checks       advance MES
                                                                         phases, assign
                                                                         operators

  PROCUREMENT   stores_keeper,         any         Purchase requisitions Raise PR, create
  (Tier 2)      procurement                        and orders related to PO, confirm
                                                   own department        material receipt

  ADMIN (Super) admin                  any         Everything            All actions
                                                   system-wide           including user
                                                                         management and
                                                                         system config
  -----------------------------------------------------------------------------------------

**1.2 Role Check --- Single Source of Truth**

All role checks MUST use these helpers. Never hardcode role strings
inline in components or routes.

**Backend: server/routes/mes/presales/\_helpers.js +
server/services/crmAccessControl.js**

  ------------------------------------------------------------------------------------------------------------------------------------------------
  **Function**                 **Logic**                                                                           **Used In**
  ---------------------------- ----------------------------------------------------------------------------------- -------------------------------
  isManagement(user)           FULL_ACCESS_ROLES.includes(role) && level \>= 6                                     All routes --- data scoping

  isAdminOrMgmt(user)          \[\'admin\',\'manager\',\'sales_manager\'\].includes(role)                          Approval gates

  canApproveQuotation(user)    isAdminOrMgmt(user)                                                                 quotations.js approve/reject

  canCreateJobCard(user)       \[\'admin\',\'manager\',\'production_manager\',\'sales_manager\'\].includes(role)   jobCards.js

  canApproveMaterial(user)     \[\'admin\',\'procurement\',\'stores_keeper\'\].includes(role)                      materialOrders.js

  canAccessQCDashboard(user)   role in QC_ROLES or department ILIKE \'%qc%\'                                       \_helpers.js

  canApproveQCStage(user)      \[\'admin\',\'manager\',\'qc_manager\'\].includes(role)                             cse.js

  buildRepScopeWhere(user,p)   isManagement → no filter; else → sales_rep_group_id=\$p                             All list queries
  ------------------------------------------------------------------------------------------------------------------------------------------------

**Frontend: src/utils/roleChecks.js + src/utils/roleConstants.js**

  ----------------------------------------------------------------------------
  **Export**              **Usage**
  ----------------------- ----------------------------------------------------
  isManagement(user)      CRMModule, InquiryBoard, QCDashboard --- controls
                          whether rep filter is shown

  CRM_FULL_ACCESS_ROLES   Tab visibility, lead assignment, task allocation

  QC_ROLES                QC module access

  PRODUCTION_ROLES        Job card access

  MIS_MIN_LEVEL (= 6)     ProtectedRoute minLevel check
  ----------------------------------------------------------------------------

**1.3 Management View --- What They See Per Module**

**CRM Module (isManagement = true)**

Tabs: Overview (SalesCockpit), All Customers, Prospects (all reps),
Deals Pipeline (all reps), Inquiries (all reps + rep filter dropdown),
Team, Analytics, Reports, Budget

-   Rep filter dropdown: visible only to management. Selecting \'All\'
    shows everything; selecting a rep scopes all lists.

-   Lead Assignment: \'Assign to Rep\' button on any Prospect or
    Customer card. Opens a dropdown of active sales reps.

-   Task Allocation: \'New Task\' modal has Assign To field (rep
    selector). Reps only see tasks assigned to them.

-   Project Allocation: \'Link Inquiry\' action on Deal. Management can
    re-assign inquiry ownership to another rep.

-   Full Pipeline Dashboard: funnel chart, cycle times, stalled items,
    revenue forecast --- management only.

-   Cross-rep activities feed: ActivityFeed shows events from all reps
    with rep name badge.

**CRM Module (isManagement = false --- Sales Rep)**

Tabs: My Day, My Customers, My Prospects, My Pipeline (deals + inquiries
merged), My Performance

-   All data pre-scoped to own sales_rep_group_id. Rep cannot see
    another rep\'s customers.

-   No rep filter dropdown. No assign-to-rep controls.

-   Tasks: only tasks where assigned_to = req.user.id.

-   Inquiries: only inquiries where sales_rep_group_id = own group.

**MES PreSales / QC (isManagement = true)**

InquiryBoard: Rep filter dropdown, columns show all inquiries across all
reps with rep name on card. Approval queue for quotations and job cards
visible in sidebar.

QC Dashboard: all samples all reps, CSE approval queue, SLA breach
alerts for all analysts, NCR management across all labs.

**MES PreSales / QC (isManagement = false --- Sales Rep)**

InquiryBoard: only own inquiries. No rep filter. Cards do not show rep
name. Actions limited to: submit for QC, record customer response,
capture PO, capture dispatch.

QC Dashboard: QC analysts see only samples in QC inbox that are
unassigned or assigned to them. Cannot approve CSE.

**Production Module (isManagement = true --- Production Manager level
6+)**

Job Card list: all job cards all reps. Filter by status, product group,
delivery date. Create Job Card button. Approve Job Card button.

-   Material check overview: see all BOM lines across all jobs,
    highlight not-available.

-   MES Flow board: all active production jobs with phase indicators.

-   Assign operator to job phase.

**Production Module (isManagement = false --- Operator / Procurement)**

Operator: only jobs assigned to their phase/machine. Cannot approve job
cards.

Procurement: only purchase requisitions and purchase orders. Receipt
confirmation.

**2. Codebase Audit --- Status of All 32 Pipeline Steps**

  --------------------------------------------------------------------------------------------
  **\#**   **Step**                  **File**                   **Status**
  -------- ------------------------- -------------------------- ------------------------------
  1        Prospect creation         MyProspects.jsx +          ✅ Built
                                     crm/prospects.js           

  2        Technical Brief capture   TechnicalBriefForm.jsx +   ✅ Built
                                     technical-briefs.js        

  3        Deal pipeline creation    DealPipeline.jsx +         ✅ Built
                                     crm/deals.js               

  4        Inquiry creation (3-step  InquiryCapture.jsx +       ✅ Built
           wizard)                   inquiries.js               

  5        TDS / attachment upload   SamplesSection.jsx +       ✅ Built
                                     attachments.js             

  6        SAR print + QR label      SamplesSection.jsx +       ✅ Built
                                     samples.js                 

  7        Batch submit to QC lab    samples.js POST            ✅ Built
                                     /submit-to-qc              

  8        QC inbox batch receive    QCDashboard.jsx + qc.js    ✅ Built

  9        QR scan → redirect to     QCScanPage.jsx             ⚠️ BUG-02
           analysis                                             

  10       Full QC analysis form     QCSampleAnalysis.jsx +     ✅ Built
                                     qc.js                      

  11       CSE auto-generation on    qc.js POST                 ✅ Built
           analysis submit           /analyses/:id/submit       

  12       QC Manager CSE approval   cse.js POST                ⚠️ BUG-01
                                     /cse/:id/approve           

  13       Production Manager final  cse.js POST                ✅ Built
           approval                  /cse/:id/approve           

  14       Pre-sales clearance       ClearanceSection.jsx +     ✅ Built
                                     inquiries.js               

  15       MOQ check                 checks.js                  ✅ Built

  16       Material availability     checks.js                  ✅ Built
           check                                                

  17       Quotation creation        QuotationPanel.jsx +       ✅ Built
           (estimation)              quotations.js              

  18       Submit quotation for      quotations.js              ⚠️ GAP --- no /submit endpoint
           approval                                             

  19       Manager approve quotation quotations.js POST         ⚠️ Incomplete --- no
                                     /approve                   reject/revise

  20       Quotation PDF             presalesPdfService.js      ⚠️ GAP --- no DRAFT watermark,
                                                                no quotation type

  21       Send quotation to         quotations.js POST /send   ✅ Built
           customer                                             

  22       Customer response         quotations.js POST         ✅ Built
           (accept/reject/counter)   /customer-response         

  23       Negotiation versioning    quotations.js              ⚠️ GAP --- no
                                                                parent_quotation_id, no
                                                                version_number

  24       Proforma Invoice creation ProformaPanel.jsx +        ✅ Built
                                     proforma.js                

  25       PO confirmation           proforma.js POST /confirm  ✅ Built
           (Proforma)                                           

  26       Customer PO capture       ---                        ❌ MISSING --- no
           (formal)                                             mes_customer_purchase_orders

  27       Pre-production sample     PreprodSamplePanel.jsx +   ✅ Built
                                     preprod.js                 

  28       Pre-prod sample approval  preprod.js                 ✅ Built

  29       Job Card creation         ---                        ❌ MISSING --- no
                                                                mes_job_cards table

  30       Material procurement flow ---                        ❌ MISSING --- no
                                                                PR/PO/receipt tables

  31       MES production phases (17 flow.js                    ✅ Built (not linked to
           phases)                                              pre-sales)

  32       Dispatch / Deliver /      proforma.js orders routes  ⚠️ Incomplete --- no
           Close                                                transporter/AWB fields
  --------------------------------------------------------------------------------------------

**3. Critical Bugs --- Fix Before Any New Feature**

**ALL bugs in this section must be resolved before Phase 1 work begins.
They cause data corruption or broken workflow gates today.**

**3.1 P0 --- Data Integrity Bugs (Day 1)**

**P0-01 --- SQL Placeholder Missing \$ Prefix**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/crm/index.js (legacy) → now distributed
                   across crm/customers.js, crm/dashboard.js,
                   crm/prospects.js

  Root Cause       WHERE cu.sales_rep_group_id = \${paramIndex} should be
                   = \$\${paramIndex}. Without the dollar sign, Postgres
                   receives the literal string \'\${paramIndex}\' and the
                   query fails silently, returning wrong or empty data.

  Impact           Sales reps see wrong customers. Managers may see all
                   or no data depending on group_id.

  Fix              Global search: = \${paramIndex} → replace with =
                   \$\${paramIndex}. Verify with: login as rep whose
                   group_id ≠ 1 and confirm only own customers returned.

  Effort           15 minutes

  Test             Login as rep group_id=3, GET /api/crm/customers ---
                   must return only group 3 customers
  -----------------------------------------------------------------------

**P0-02 --- ReferenceError: salesRep.full_name**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/crm/index.js line \~1592 (now in
                   crm/customers.js or crm/dashboard.js)

  Root Cause       salesRep.full_name used but variable is
                   repInfo.fullName. Throws ReferenceError in production
                   silently caught by Express.

  Fix              Single variable rename: salesRep.full_name →
                   repInfo.fullName

  Effort           5 seconds
  -----------------------------------------------------------------------

**P0-03 --- resolveRepGroup() Uses ILIKE Fuzzy Match**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/services/crmService.js resolveRepGroup()

  Root Cause       Fuzzy first-name match → wrong group ID assigned when
                   two reps share first name or name changes in HR
                   system.

  Fix              \(1\) Migration crm-007 already added
                   sales_rep_group_id column to crm_sales_reps. (2)
                   Populate all active reps: UPDATE crm_sales_reps SET
                   sales_rep_group_id = (SELECT id FROM sales_rep_groups
                   WHERE \...). (3) Update resolveRepGroup() to use
                   direct ID first, fall back to fuzzy only when column
                   is NULL. Use buildRepScopeWhere() helper everywhere.

  Effort           2 hours
  -----------------------------------------------------------------------

**3.2 BUG --- Pre-Sales Workflow Bugs (Day 2)**

**BUG-01 --- Production Manager Never Notified of CSE Approval**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/cse.js line 189

  Root Cause       Status check is \'pending_qc\' but should be
                   \'pending_qc_manager\'. Production Managers receive
                   zero notifications.

  Fix              Change one string: \'pending_qc\' →
                   \'pending_qc_manager\'

  Effort           5 minutes
  -----------------------------------------------------------------------

**BUG-02 --- QR Scan Bypasses Full CSE Approval Chain**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             src/components/MES/PreSales/QCScanPage.jsx

  Root Cause       QR scan page has a \'Submit Testing Result\' button
                   that directly marks a sample as tested without
                   creating an analysis record, generating a CSE, or
                   going through management approval. Completely bypasses
                   the QC workflow.

  Fix              Remove the result submission block from QCScanPage
                   entirely. Replace testing card with Alert component +
                   \'Open Full Analysis Form\' button linking to
                   /mes/qc/samples/:id.

  Effort           2 hours
  -----------------------------------------------------------------------

**BUG-03 --- Template product_group Filter Ignored**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/templates.js

  Root Cause       Query param product_group passed but not used in SQL
                   WHERE. Wrong template auto-loads for most product
                   groups.

  Fix              Add: AND (\$1 = ANY(product_groups) OR product_groups
                   IS NULL) when query param provided.

  Effort           30 minutes
  -----------------------------------------------------------------------

**BUG-04 --- QC Inbox Shows All Divisions**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/qc.js GET /qc/inbox

  Root Cause       No division filter. FP QC lab sees samples from HC and
                   other divisions.

  Fix              Add: AND i.division = \'FP\' to WHERE clause (or
                   parameterise for multi-division support).

  Effort           15 minutes
  -----------------------------------------------------------------------

**BUG-05 --- Double Email Notification on Sample Status Patch**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/samples.js PATCH
                   /:id/status

  Root Cause       notifyQCSamplesReceived called both in batch
                   submit-to-qc route AND in individual patch. Customer /
                   QC team receives duplicate emails.

  Fix              Remove notifyQCSamplesReceived block from individual
                   PATCH route. Keep only in POST
                   /inquiries/:id/submit-to-qc.

  Effort           30 minutes
  -----------------------------------------------------------------------

**ISS-01 --- Sales Rep Not Notified When QC Analysis Completed**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/qc.js POST
                   /analyses/:id/submit

  Root Cause       After CSE creation, owner of the inquiry is never
                   notified. Rep has no way to know QC is done without
                   polling the system.

  Fix              After CSE creation: query inquiry owner →
                   notifyUsers(\[ownerId\], {type:\'qc_result_ready\',
                   inquiry_id, inquiry_number, customer_name}).

  Effort           1 hour
  -----------------------------------------------------------------------

**ISS-02 --- Clearance Restricted to admin Role Only**

  -----------------------------------------------------------------------
  **Field**        **Detail**
  ---------------- ------------------------------------------------------
  File             server/routes/mes/presales/inquiries.js PATCH
                   /clearance

  Root Cause       !isAdminOrMgmt check passes for admin only.
                   sales_manager and manager with level 6+ are blocked.

  Fix              Replace role check with: isManagement(req.user) (which
                   checks FULL_ACCESS_ROLES AND level \>= 6).

  Effort           30 minutes
  -----------------------------------------------------------------------

**4. Gap Analysis --- Missing Features**

  ------------------------------------------------------------------------------------
  **ID**   **Gap**                            **Priority**   **Source**    **Phase**
  -------- ---------------------------------- -------------- ------------- -----------
  G-01     Quotation submit/reject/revise     CRITICAL       Req Doc §1    Phase 1
           endpoints +                                                     
           mes_quotation_approvals audit                                   
           table                                                           

  G-02     Quotation PDF DRAFT watermark +    HIGH           Req Doc §2    Phase 1
           approver name                                                   

  G-03     Negotiation versioning:            HIGH           Req Doc §3    Phase 1
           parent_quotation_id,                                            
           version_number, negotiation_round                               

  G-04     Customer PO capture:               CRITICAL       Req Doc §4    Phase 2
           mes_customer_purchase_orders                                    
           table + ±5% validation                                          

  G-05     Job Card creation: mes_job_cards   CRITICAL       Both plans    Phase 3
           table + routes + UI                                             

  G-06     Material procurement:              CRITICAL       Both plans    Phase 4
           mes_purchase_requisitions +                                     
           mes_supplier_pos +                                              
           mes_stock_receipts                                              

  G-07     CRM Deal ↔ Inquiry auto-sync (no   CRITICAL       Req Doc §7    Phase 2
           bidirectional link exists)                                      

  G-08     Full Pipeline Dashboard (funnel,   HIGH           Req Doc §8    Phase 5
           cycle times, stalled items,                                     
           revenue forecast)                                               

  G-09     Dispatch fields:                   HIGH           Req Doc §9    Phase 2
           transporter_name + awb_number on                                
           deliver endpoint                                                

  G-10     Customer delivery feedback:        MEDIUM         Req Doc §9    Phase 2
           mes_delivery_feedback table + form                              

  G-11     SLA breach scheduled job + OVERDUE HIGH           Original plan Phase 1
           badge in QC                                                     

  G-12     CustomerInquiries.jsx: live        MEDIUM         Original plan Phase 1
           stage + New Inquiry CTA                                         

  G-13     Lead Assignment: Assign-to-Rep     HIGH           New           Phase 2
           button (management only)                          requirement   

  G-14     Task Allocation: Assign-to field   HIGH           New           Phase 2
           in task form (management only)                    requirement   

  G-15     MES production flow linked to Job  HIGH           Both plans    Phase 5
           Card (inquiry_stage auto-updates)                               
  ------------------------------------------------------------------------------------

NAMING CONFLICT RESOLVED: The term \'Purchase Order\' is used for two
different things. The plan uses:

-   mes_customer_purchase_orders --- the customer\'s formal PO document
    confirming the sale (G-04)

-   mes_purchase_requisitions --- internal request for materials

-   mes_supplier_purchase_orders --- PO raised to external material
    suppliers

**5. Database Migrations**

Migrations run in order. Each is idempotent (CREATE TABLE IF NOT
EXISTS). Last existing migration number is 319 in the main sequence and
crm-013 in the CRM sequence.

**5.1 Migration: crm-014-rep-scope-fix.js**

Ensures sales_rep_group_id is populated for all active reps.
Pre-requisite for P0-03 fix.

ALTER TABLE crm_sales_reps ADD COLUMN IF NOT EXISTS sales_rep_group_id
INTEGER;

UPDATE crm_sales_reps sr SET sales_rep_group_id = (SELECT id FROM
sales_rep_groups WHERE division=\'FP\' AND group_name ILIKE
\'%\'\|\|split_part(sr.full_name,\' \',1)\|\|\'%\' LIMIT 1) WHERE
sales_rep_group_id IS NULL;

**5.2 Migration: mes-presales-012-quotation-workflow.js**

Adds quotation approval workflow tables and versioning columns.

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS
    parent_quotation_id INTEGER REFERENCES mes_quotations(id)

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS version_number
    INTEGER DEFAULT 1

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS
    negotiation_round INTEGER DEFAULT 0

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS submitted_by
    INTEGER, submitted_at TIMESTAMPTZ

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS rejected_by
    INTEGER, rejected_at TIMESTAMPTZ, rejection_reason TEXT

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS revision_notes
    TEXT

-   CREATE TABLE mes_quotation_approvals (id SERIAL PK, quotation_id INT
    FK, action VARCHAR(30) CHECK (IN
    \'submitted\',\'approved\',\'rejected\',\'revision_requested\'),
    actor_id INT, actor_name VARCHAR(255), notes TEXT, created_at
    TIMESTAMPTZ DEFAULT NOW())

**5.3 Migration: mes-presales-013-customer-po.js**

Customer\'s formal Purchase Order document.

-   CREATE TABLE mes_customer_purchase_orders (id SERIAL PK, po_number
    VARCHAR(100) NOT NULL, po_date DATE NOT NULL, inquiry_id INT FK
    mes_presales_inquiries, quotation_id INT FK mes_quotations, po_value
    NUMERIC(15,2), currency VARCHAR(10) DEFAULT \'USD\',
    delivery_address TEXT, requested_delivery_date DATE, attachment_id
    INT FK mes_presales_attachments, status VARCHAR(20) DEFAULT
    \'active\', value_deviation_pct NUMERIC(5,2), created_by INT,
    created_at TIMESTAMPTZ DEFAULT NOW())

**5.4 Migration: mes-presales-014-dispatch-feedback.js**

Extends dispatch and adds delivery feedback.

-   ALTER TABLE mes_presales_inquiries ADD COLUMN IF NOT EXISTS
    transporter_name VARCHAR(255)

-   ALTER TABLE mes_presales_inquiries ADD COLUMN IF NOT EXISTS
    awb_number VARCHAR(100)

-   ALTER TABLE mes_presales_inquiries ADD COLUMN IF NOT EXISTS
    dispatch_date DATE

-   ALTER TABLE mes_presales_inquiries ADD COLUMN IF NOT EXISTS
    expected_delivery_date DATE

-   CREATE TABLE mes_delivery_feedback (id SERIAL PK, inquiry_id INT FK,
    satisfaction_rating SMALLINT CHECK(1..5), feedback_text TEXT,
    reorder_likelihood VARCHAR(10) CHECK(IN \'yes\',\'maybe\',\'no\'),
    captured_by INT, captured_at TIMESTAMPTZ DEFAULT NOW())

**5.5 Migration: crm-015-deal-sync.js**

Adds note column to crm_deal_stage_history for system-generated entries.

-   ALTER TABLE crm_deal_stage_history ADD COLUMN IF NOT EXISTS note
    TEXT

-   ALTER TABLE crm_deal_stage_history ADD COLUMN IF NOT EXISTS source
    VARCHAR(20) DEFAULT \'manual\' CHECK(IN \'manual\',\'system\')

**5.6 Migration: mes-presales-015-job-cards.js**

Job Card table --- production work orders.

-   CREATE TABLE mes_job_cards (id SERIAL PK, job_card_number
    VARCHAR(30) UNIQUE NOT NULL, inquiry_id INT FK, quotation_id INT FK,
    customer_po_id INT FK mes_customer_purchase_orders, cse_id INT FK
    mes_cse_reports, product_name VARCHAR(255), product_group
    VARCHAR(100), run_quantity NUMERIC(15,3), quantity_unit VARCHAR(20)
    DEFAULT \'Kgs\', delivery_date DATE, material_bom JSONB DEFAULT
    \'\[\]\', print_colors INT, substrate VARCHAR(255), dimensions
    VARCHAR(100), special_instructions TEXT, status VARCHAR(30) DEFAULT
    \'draft\' CHECK(IN
    \'draft\',\'pending_approval\',\'approved\',\'in_production\',\'completed\',\'cancelled\'),
    mes_job_id INT REFERENCES mes_jobs(id), approved_by INT, approved_at
    TIMESTAMPTZ, created_by INT, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())

material_bom JSONB structure: \[{material_name, spec, required_qty,
unit, available_qty, status:
\'available\'\|\'not_available\'\|\'ordered\'\|\'received\', pr_id,
po_id}\]

**5.7 Migration: mes-presales-016-procurement.js**

Material procurement chain.

-   CREATE TABLE mes_purchase_requisitions (id SERIAL PK, pr_number
    VARCHAR(30) UNIQUE, job_card_id INT FK mes_job_cards, items JSONB
    DEFAULT \'\[\]\', total_estimated_value NUMERIC(15,2), status
    VARCHAR(20) DEFAULT \'draft\' CHECK(IN
    \'draft\',\'pending_approval\',\'approved\',\'partially_ordered\',\'fully_ordered\'),
    requested_by INT, approved_by INT, approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW())

-   CREATE TABLE mes_supplier_purchase_orders (id SERIAL PK, po_number
    VARCHAR(30) UNIQUE, pr_id INT FK, supplier_name VARCHAR(255), items
    JSONB DEFAULT \'\[\]\', total_amount NUMERIC(15,2), currency
    VARCHAR(10) DEFAULT \'USD\', expected_delivery_date DATE,
    actual_delivery_date DATE, status VARCHAR(20) DEFAULT \'draft\'
    CHECK(IN
    \'draft\',\'pending_approval\',\'approved\',\'sent\',\'acknowledged\',\'received\',\'cancelled\'),
    created_by INT, approved_by INT, created_at TIMESTAMPTZ DEFAULT
    NOW())

-   CREATE TABLE mes_stock_receipts (id SERIAL PK, supplier_po_id INT
    FK, received_by INT, received_date DATE, items JSONB DEFAULT
    \'\[\]\', notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())

**5.8 Migration: mes-presales-017-sla-tracking.js**

Tracks sent_to_qc_at for SLA calculation.

-   ALTER TABLE mes_presales_samples ADD COLUMN IF NOT EXISTS
    sent_to_qc_at TIMESTAMPTZ

-   CREATE INDEX IF NOT EXISTS idx_mes_qc_analyses_sla ON
    mes_qc_analyses(sla_due_at) WHERE sla_due_at IS NOT NULL

**6. Phased Implementation Plan**

  --------------------------------------------------------------------------------------
  **Phase**   **Name**        **Duration**   **Goal**                      **Block?**
  ----------- --------------- -------------- ----------------------------- -------------
  Phase 0     Critical Bug    Day 1--2       Fix all 7 bugs. No new        Yes ---
              Fixes                          features until done.          blocks
                                                                           everything

  Phase 1     Quotation       Week 1         Submit/reject/revise          No
              Workflow + QC                  quotation, PDF watermark, SLA 
              Notifications                  breach job, CustomerInquiries 
                                             upgrade                       

  Phase 2     Deal Sync +     Week 2         Bidirectional deal-inquiry    No
              Customer PO +                  sync, customer PO capture,    
              Dispatch                       dispatch fields, delivery     
                                             feedback                      

  Phase 3     Job Card +      Week 3--4      Job Card full CRUD, PDF       No
              Estimation UI +                generation, negotiation       
              Quotation PDF                  versioning, estimation        
                                             dedicated view                

  Phase 4     Material        Week 5         PR → manager approve →        No
              Procurement                    supplier PO → receipt → job   
              Flow                           confirmed                     

  Phase 5     Pipeline        Week 6--7      Full pipeline funnel, MES     No
              Dashboard + MES                flow linked to job card, lead 
              Link +                         assignment, task allocation   
              Enhancements                                                 

  Phase 6     Refactoring +   Week 8--9      Route splitting, dead code    No
              Test Coverage                  removal, unit + integration + 
                                             E2E test suite                
  --------------------------------------------------------------------------------------

**Phase 0 --- Critical Bug Fixes (Day 1--2)**

Rule: each fix is a separate PR. No mixing fixes. PRs are merged in
order P0-01 → P0-02 → P0-03 → BUG-01 → BUG-02 → BUG-03 → BUG-04 → BUG-05
→ ISS-01 → ISS-02.

  -----------------------------------------------------------------------------------------------------
  **Task**             **File(s) to Edit**                          **Accept Criterion**
  -------------------- -------------------------------------------- -----------------------------------
  P0-01: Fix \$ prefix server/routes/crm/customers.js,              login as rep group_id=3 → see only
  in parameterised SQL prospects.js, dashboard.js, activities.js    group 3 customers

  P0-02: Fix           server/routes/crm/customers.js or            No ReferenceError in server logs
  salesRep.full_name   dashboard.js                                 for any crm endpoint
  ReferenceError                                                    

  P0-03:               server/services/crmService.js +              Reps with identical first names get
  resolveRepGroup()    crm-014-rep-scope-fix migration              correct group
  direct ID lookup                                                  

  BUG-01: Fix CSE      server/routes/mes/presales/cse.js            Production Manager receives SSE
  notification status                                               notification after QC manager
  string                                                            approves CSE

  BUG-02: Remove       src/components/MES/PreSales/QCScanPage.jsx   QR scan page shows only \'Open
  result submission                                                 Analysis Form\' link, no submit
  from QCScanPage                                                   button

  BUG-03: Fix template server/routes/mes/presales/templates.js      Correct template loads for BOPP,
  product_group filter                                              PET, PA/PE separately

  BUG-04: Add division server/routes/mes/presales/qc.js             FP QC inbox shows only FP samples
  filter to QC inbox                                                

  BUG-05: Remove       server/routes/mes/presales/samples.js        Single email on batch submit, none
  double notification                                               on individual patch

  ISS-01: Notify sales server/routes/mes/presales/qc.js             Sales rep receives SSE after
  rep on QC complete                                                analysis submitted

  ISS-02: Fix          server/routes/mes/presales/inquiries.js      sales_manager with level 6 can
  clearance role check                                              grant clearance
  -----------------------------------------------------------------------------------------------------

**Phase 1 --- Quotation Workflow + QC Notifications (Week 1)**

**P1-1: Quotation Submit / Reject / Revise Endpoints**

-   POST /quotations/:id/submit --- Sales Rep submits draft →
    pending_approval. Validates: status must be \'draft\'. Notifies all
    isAdminOrMgmt users. Inserts into mes_quotation_approvals.

-   POST /quotations/:id/reject --- Manager only. Status → \'rejected\'.
    Stores rejection_reason. Notifies submitter. Logs in
    mes_quotation_approvals.

-   POST /quotations/:id/request-revision --- Manager only. Status →
    \'draft\'. Stores revision_notes. Notifies submitter.

-   PATCH /quotations/:id/send --- Guard: status must be \'approved\'.
    Remove current loophole that sends draft quotations.

-   GET /quotations/:id/approval-history --- Returns all
    mes_quotation_approvals entries for a quotation.

File: server/routes/mes/presales/quotations.js (add 4 new endpoints)

**P1-2: Quotation PDF --- DRAFT Watermark + Approver Name**

-   In server/services/presalesPdfService.js: detect quotation.status
    !== \'approved\' → render diagonal DRAFT --- NOT FOR CUSTOMER
    watermark (red 45° rotated text).

-   When status = \'approved\': render approved by: \[approver_name\] on
    \[approved_at\] in footer.

-   Add company header with logo to quotation PDF (re-use CSE PDF header
    pattern).

File: server/services/presalesPdfService.js

**P1-3: Quotation Versioning for Negotiation**

-   POST /quotations/:id/create-revision --- Creates a new
    mes_quotations record with parent_quotation_id = :id, version_number
    = parent.version_number + 1, negotiation_round =
    parent.negotiation_round + 1, status = \'draft\'. Copies all fields
    from parent.

-   QuotationPanel.jsx: show version history list. Show original price
    vs revised price. Show negotiation_round badge.

-   NegotiationTimeline.jsx (new component): vertical timeline showing
    all quotation versions, customer counter-offers, manager decisions.
    Rendered on InquiryDetail.

Files: quotations.js (1 new endpoint), QuotationPanel.jsx (edit),
NegotiationTimeline.jsx (new)

**P1-4: SLA Breach Scheduled Job**

-   New file: server/jobs/slaBreachChecker.js --- runs every 30 minutes
    via setInterval in index.js.

-   Query: SELECT \* FROM mes_qc_analyses WHERE sla_due_at \< NOW() AND
    overall_result IS NULL.

-   For each overdue analysis:
    notifyRoleUsers(\[\'qc_manager\',\'manager\'\],
    {type:\'sla_breach\', \...}).

-   QCDashboard.jsx: add red OVERDUE badge when NOW() \> sla_due_at and
    analysis not submitted.

Files: server/jobs/slaBreachChecker.js (new),
src/components/MES/QC/QCDashboard.jsx (edit)

**P1-5: CustomerInquiries.jsx --- Full Integration**

-   Show live inquiry_stage badge with colour coding per stage group.

-   Show PhaseStepperCard: horizontal stepper showing which of 6
    macro-phases (QC / Clearance / Quotation / PO / Production /
    Delivered) is active.

-   Show \'Action Needed\' flag when inquiry is waiting for current
    user\'s action.

-   \'New Inquiry\' button opens InquiryCapture with customer
    pre-filled.

-   Management view: shows inquiries across all reps for this customer.
    Rep filter not needed here (scoped to customer).

File: src/components/CRM/CustomerInquiries.jsx (edit)

**P1-6: Management --- Lead Assignment**

-   Add \'Assign to Rep\' button on ProspectManagement.jsx and
    CustomerList.jsx (management only --- isManagement check).

-   Opens modal: dropdown of active crm_sales_reps. On confirm: PATCH
    /crm/prospects/:id or /crm/customers/:id with { assigned_rep_id }.

-   Backend: crm/prospects.js + crm/customers.js --- update assigned
    rep, log in crm_activities with type \'lead_assigned\'.

-   SSE notification to newly assigned rep: \'You have been assigned a
    new lead: \[Customer Name\]\'.

Files: ProspectManagement.jsx (edit), crm/prospects.js (edit),
crm/customers.js (edit)

**Phase 2 --- Deal Sync + Customer PO + Dispatch (Week 2)**

**P2-1: CRM Deal ↔ Inquiry Auto-Sync**

Create server/services/dealSyncService.js with the following exported
function:

-   syncDealFromInquiry(inquiryId, newStage, client) --- looks up
    crm_deals WHERE inquiry_id = :inquiryId AND stage NOT IN
    (\'won\',\'lost\'). Maps inquiry stage to deal stage:

    -   estimation / quoted / negotiating → deal.stage = \'negotiation\'

    -   order_confirmed / in_production / ready_dispatch / delivered →
        deal.stage = \'won\', closes deal with reason \'PO confirmed via
        \[inquiry_number\]\'

    -   lost → deal.stage = \'lost\'

-   Inserts into crm_deal_stage_history with source=\'system\'.

-   Called from: pipeline.js (stage advance), proforma.js (confirm),
    quotations.js (customer-response accepted).

-   InquiryBoard badge: pass linked deal stage to DealCard.jsx via
    joined query --- show inquiry_stage badge on DealCard.

-   DealDetail unified timeline: GET /api/crm/deals/:id/unified-timeline
    merges crm_activities + mes_presales_activity_log for linked
    inquiry, sorted by timestamp DESC.

-   \'Link to Existing Inquiry\' on DealCreateModal --- dropdown of
    unlinked inquiries for same customer.

Files: server/services/dealSyncService.js (new), pipeline.js (edit),
proforma.js (edit), quotations.js (edit), DealCard.jsx (edit),
crm/deals.js (new endpoint)

**P2-2: Customer PO Capture**

-   New file: server/routes/mes/presales/customerPO.js

-   POST /customer-po --- requires: po_number, po_date, inquiry_id,
    quotation_id. Optional: po_value, delivery_address,
    requested_delivery_date, attachment.

-   Validation: fetch accepted quotation total. If abs(po_value - total)
    / total \> 0.05 → return warning (not error). Client shows yellow
    warning banner.

-   On success: advance inquiry_stage to order_confirmed. Log activity.
    Call dealSyncService.syncDealFromInquiry.

-   Notify: Sales Manager, Production Manager, stores_keeper role.

-   If attachment provided: store as inquiry attachment with type
    \'purchase_order\'.

-   CustomerPOPanel.jsx (new): shown on InquiryDetail when stage =
    price_accepted or sample_approved. Form with fields. After
    submission shows PO summary card.

Files: server/routes/mes/presales/customerPO.js (new),
src/components/MES/PreSales/InquiryDetail/CustomerPOPanel.jsx (new),
mes/presales/index.js (mount new router)

**P2-3: Dispatch Fields + Customer Notification**

-   Extend POST /orders/:inquiryId/deliver in proforma.js: add
    transporter_name, awb_number, dispatch_date to request body. Store
    on mes_presales_inquiries.

-   After stage → \'delivered\': if inquiry has linked customer contact
    with email → send dispatch notification email (emailService.js) with
    tracking details.

-   Sales rep SSE notification with tracking number.

File: server/routes/mes/presales/proforma.js (edit deliver endpoint)

**P2-4: Delivery Feedback**

-   POST /orders/:inquiryId/feedback --- accepts: satisfaction_rating
    (1-5), feedback_text, reorder_likelihood. Stores in
    mes_delivery_feedback.

-   DeliveryFeedbackPanel.jsx (new): shown on InquiryDetail when stage =
    \'delivered\'. Star rating widget + textarea + three-option button
    group.

-   Full Pipeline Dashboard (Phase 5) uses aggregate feedback scores per
    rep for management view.

Files: proforma.js (new endpoint),
src/components/MES/PreSales/InquiryDetail/DeliveryFeedbackPanel.jsx
(new)

**P2-5: Task Allocation (Management → Reps)**

-   Extend crm/tasks.js POST /tasks: add assigned_to field. Management
    can set this to any user ID.

-   GET /tasks?mine=true: for non-management, filter WHERE assigned_to =
    req.user.id OR created_by = req.user.id.

-   GET /tasks (management): returns all tasks with assigned_to user
    name populated via JOIN.

-   TaskCreateModal.jsx: add \'Assign To\' rep selector dropdown when
    isManagement. Default: current user.

-   TaskWidget.jsx: show \'Assigned by \[name\]\' badge on tasks
    assigned by management.

-   SSE notification to assigned user.

Files: crm/tasks.js (edit), TaskCreateModal.jsx (edit), TaskWidget.jsx
(edit)

**Phase 3 --- Job Card + Estimation UI + Quotation PDF (Week 3--4)**

**P3-1: Job Card Backend**

-   New file: server/routes/mes/presales/jobCards.js

-   POST /job-cards --- role check: canCreateJobCard(user).
    Auto-generates job_card_number: JC-FP-{YEAR}-{NNNNN}.
    Auto-populates: product_name, substrate, dimensions from inquiry +
    CSE. material_bom from mes_presales_material_checks. run_quantity
    from accepted quotation. delivery_date from customer PO.

-   GET /job-cards --- Management: all. Rep: only job cards for own
    inquiries.

-   GET /job-cards/:id --- full detail with material_bom expanded.

-   PATCH /job-cards/:id --- update only when status = \'draft\'.
    Validates no read-only fields changed.

-   POST /job-cards/:id/approve --- role: canCreateJobCard(user) AND
    isManagement. Status → \'approved\'. Creates mes_jobs entry. Sets
    inquiry_stage → \'in_production\'. Calls dealSyncService. Notifies
    all production depts + sales rep.

-   PATCH /job-cards/:id/material-status --- Updates individual BOM line
    status. If all lines available → auto-approve materials and notify
    production manager.

File: server/routes/mes/presales/jobCards.js (new, \~280 lines)

**P3-2: Job Card UI**

-   JobCardPanel.jsx --- tab on InquiryDetail (visible after
    order_confirmed). Shows: status badge, material BOM table with
    availability indicators (green/red/orange dots), delivery date,
    \'Create Job Card\' button (management only).

-   JobCardForm.jsx --- Create / edit form. Pre-fills from inquiry +
    quotation + CSE. Editable BOM table (management can add/remove
    lines). \'Submit for Approval\' button.

-   JobCardPDF.jsx --- A4 printable using jsPDF. Header with logo, job
    number, customer, delivery date. Specifications table. Material BOM
    table. Print parameters. Two signature blocks (Production Manager /
    QC). Download as PDF button.

-   JobCardList.jsx --- Management view at /mes/job-cards. Table with
    columns: JC Number, Inquiry, Customer, Status, Delivery Date,
    Material Status. Filters: status, date range. Click row →
    JobCardForm.

Files: InquiryDetail/JobCardPanel.jsx (new), JobCardForm.jsx (new),
JobCardPDF.jsx (new), JobCardList.jsx (new), MES/index.jsx (add route)

**P3-3: Estimation UI --- Dedicated Estimator View**

-   New route /mes/estimation --- protected, accessible to admin +
    sales_manager + sales_coordinator.

-   EstimationQueue.jsx --- lists all inquiries at \'estimation\' or
    \'cse_approved\' stage. Management sees all reps; rep sees own.

-   EstimationForm.jsx --- cost calculation table: material cost (kg \*
    price), conversion cost (m²), overhead percentage, target margin
    percentage. Live unit price calculation. \'Create Quotation\' button
    saves estimation data as JSONB snapshot on
    mes_quotations.estimation_data column.

-   ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS estimation_data
    JSONB --- stores full cost breakdown for PDF generation.

Files: EstimationQueue.jsx (new), EstimationForm.jsx (new),
MES/index.jsx (add route)

**Phase 4 --- Material Procurement Flow (Week 5)**

**P4-1: Procurement Backend**

-   New file: server/routes/mes/presales/procurement.js

-   POST /purchase-requisitions --- auto-created when Job Card BOM has
    not_available lines. Also manually creatable by procurement role.
    pr_number: PR-FP-{YEAR}-{NNNNN}. Notifies procurement manager +
    manager.

-   POST /purchase-requisitions/:id/approve --- manager role. Status →
    \'approved\'. Notifies procurement team.

-   POST /supplier-purchase-orders --- procurement role. Linked to
    approved PR. po_number: SPO-FP-{YEAR}-{NNNNN}.

-   POST /supplier-purchase-orders/:id/approve --- manager role.
    Notifies procurement to send to supplier.

-   POST /supplier-purchase-orders/:id/send --- status → \'sent\'.
    Optionally emails supplier.

-   POST /stock-receipts --- stores_keeper role. Records received
    quantities. Updates job card BOM lines. If all BOM lines received:
    job card material_status → \'available\'. Notifies production
    manager.

-   GET /purchase-requisitions?job_card_id=N --- management sees all,
    procurement sees own

-   GET /supplier-purchase-orders?pr_id=N --- role-scoped

File: server/routes/mes/presales/procurement.js (new, \~350 lines)

**P4-2: Procurement UI**

-   ProcurementPanel.jsx --- Tab on InquiryDetail (visible after job
    card created). Shows PR status, PO status, expected delivery date.
    \'Raise PR\' button (procurement role only). Management sees full
    procurement chain.

-   PurchaseRequisitionForm.jsx --- Create / edit PR. Auto-populates
    from job card BOM not_available lines. Editable.

-   SupplierPurchaseOrderForm.jsx --- Create PO from approved PR. Select
    supplier, set unit prices, expected delivery date.

-   StockReceiptForm.jsx --- Storekeeper form. Lists PO lines. Input
    received quantities. Submit.

-   ProcurementDashboard.jsx --- Management only at /mes/procurement.
    Open PRs, POs awaiting approval, pending deliveries, overdue
    receipts.

Files: InquiryDetail/ProcurementPanel.jsx (new),
PurchaseRequisitionForm.jsx (new), SupplierPurchaseOrderForm.jsx (new),
StockReceiptForm.jsx (new), ProcurementDashboard.jsx (new),
MES/index.jsx (add route)

**Phase 5 --- Pipeline Dashboard + MES Link + Enhancements (Week 6--7)**

**P5-1: Full Pipeline Dashboard (Management Only)**

-   New route /crm/pipeline-dashboard --- protected: isManagement AND
    level \>= 6.

-   Backend: GET /api/crm/pipeline-dashboard --- returns:

    -   funnel_counts: { opportunity, technical_assessment,
        estimation_quotation, order_processing, production, delivery }
        --- counts from crm_deals and mes_presales_inquiries

    -   avg_cycle_times: average days per phase computed from
        stage_changed_at timestamps

    -   stalled_items: inquiries where stage_changed_at \< NOW() - 7
        days, sorted by days_in_stage DESC

    -   revenue_forecast: SUM(accepted quotation values) WHERE
        inquiry_stage IN
        (\'order_confirmed\',\'in_production\',\'ready_dispatch\')

    -   phase_drill: on click of funnel phase → GET
        /api/crm/pipeline-dashboard?phase=production → returns
        individual inquiry list

-   FullPipelineDashboard.jsx: Recharts FunnelChart for phase counts.
    CycleTimeBar chart. StalledItemsTable with deep link to inquiry.
    RevenueForecastCard. Management only tab in CRMModule.

Files: crm/dashboard.js (new endpoint), FullPipelineDashboard.jsx (new),
CRMModule.jsx (add tab)

**P5-2: MES Flow Engine Linked to Job Card**

-   In POST /job-cards/:id/approve: after inserting into mes_jobs, set
    mes_jobs.job_card_id = job_card_id, mes_jobs.inquiry_id =
    inquiry_id.

-   Extend mes/flow.js advance-phase handler: on each phase advance,
    call UPDATE mes_presales_inquiries SET inquiry_stage =
    \'in_production\', updated_at = NOW() (for phases \< dispatch) or
    \'ready_dispatch\' (for final production phase).

-   SSE notification to sales rep on each phase advance: \'Production
    update: \[job_number\] advanced to \[phase_name\]\'.

Files: server/routes/mes/presales/jobCards.js (edit approve handler),
server/routes/mes/flow.js (edit advance handler)

**P5-3: QC Enhancements**

-   ENH-01: FP-specific parameter presets --- in QCTemplateAdmin, add
    preset templates for BOPP, PET, PA/PE, CPP with parameters:
    thickness (μm), tensile MD/TD (N/mm²), elongation MD/TD (%), COF
    static/kinetic, ΔE colour, ink adhesion (%), seal strength (N/15mm),
    OTR (cc/m²/day), MVTR (g/m²/day).

-   ENH-02: Solvent retention auto-warning --- in qc.js POST
    /analyses/:id/submit: if solvent_retention_value \> 10 (mg/m²) AND
    product is food-contact → append warning to CSE notes and flag
    cse.has_safety_warning = TRUE.

-   ENH-03: CSE PDF --- add company logo + signature block (QC Manager +
    Production Manager) using presalesPdfService.

-   ENH-04: Sample disposition --- ALTER TABLE mes_presales_samples ADD
    COLUMN disposition VARCHAR(20) CHECK(IN
    \'retain\',\'return\',\'dispose\'). QCSampleAnalysis.jsx: add
    disposition selector before submitting.

Files: QCTemplateAdmin.jsx (edit), qc.js (edit submit),
presalesPdfService.js (edit CSE PDF), QCSampleAnalysis.jsx (edit)

**Phase 6 --- Refactoring + Test Coverage (Week 8--9)**

**P6-1: Code Health --- Route File Size Enforcement**

No route file should exceed 300 lines. Current violations and their
remediation:

  ----------------------------------------------------------------------------------------------
  **File**                                   **Current   **Split Into**
                                             Lines**     
  ------------------------------------------ ----------- ---------------------------------------
  server/routes/mes/presales/qc.js           \~420       qc-inbox.js (receive/scan),
                                                         qc-analysis.js (CRUD + submit),
                                                         qc-cse.js (split from cse.js)

  server/routes/mes/presales/proforma.js     \~480       proforma.js (PI create/send/confirm),
                                                         orders.js (ready-dispatch, deliver,
                                                         feedback, close)

  server/routes/mes/presales/quotations.js   \~450       quotations.js (CRUD + PDF),
                                                         quotation-approval.js
                                                         (submit/approve/reject/revision)

  server/routes/mes/presales/inquiries.js    \~520       inquiries-core.js (CRUD + stage),
                                                         inquiries-clearance.js (clearance +
                                                         MOQ + material), inquiries-admin.js
                                                         (stats + management views)
  ----------------------------------------------------------------------------------------------

**P6-2: Shared Helpers Consolidation**

-   buildRepScopeWhere(user, paramIndex) in
    server/services/crmAccessControl.js --- returns {clause, params}.
    Replace every inline rep-scoping WHERE clause across all route
    files.

-   generateSequenceNumber(prefix, sequenceName, client) in
    server/utils/sequenceGenerator.js --- replace duplicated numbering
    logic in quotations.js, jobCards.js, procurement.js.

-   standardNotify(inquiryId, eventType, extraData, client) in
    server/services/mesNotificationService.js --- wraps notifyUsers +
    notifyRoleUsers + logActivity in one call.

**P6-3: Frontend Dead Code Removal**

-   Remove AdminCRMDashboard.jsx and CRMDashboard.jsx inline duplication
    --- both now delegate to SalesCockpit.jsx with props { isAdmin,
    lockedGroupId }. Saves \~40KB.

-   Remove dead recentActivities state in MyDayDashboard.jsx.

-   Remove dead getCustomerSearchNames() function in crm/customers.js.

-   Remove unused http/https imports in crm/ routes (legacy from
    original monolith).

-   Consolidate inline role checks: replace all component-level
    \[\'admin\',\'manager\'\].includes(user?.role) with imported
    roleChecks.js functions.

**P6-4: CSS Architecture Cleanup**

-   All CRM component styles in src/components/CRM/CRM.css using naming:
    .crm-{component}-{element}.

-   All MES PreSales styles in
    src/components/MES/PreSales/PresalesInquiries.css.

-   No inline styles except dynamic values (colors from data, calculated
    widths).

-   New components from Phases 1--5 must follow these conventions.

**7. Testing Plan**

Every phase ships with corresponding tests. No phase is \'done\' until
tests pass.

**7.1 Unit Tests --- server/tests/unit/**

  --------------------------------------------------------------------------------------------------
  **Test File**                   **Covers**                     **Key Cases**
  ------------------------------- ------------------------------ -----------------------------------
  crm/crmAccessControl.test.js    buildRepScopeWhere(),          rep vs manager scoping, level
                                  isManagement()                 boundary (5 vs 6)

  crm/resolveRepGroup.test.js     P0-03 direct ID lookup         direct match, fuzzy fallback, null
                                                                 handling

  mes/quotationApproval.test.js   submit/approve/reject/revise   invalid transitions, duplicate
                                  state machine                  submissions

  mes/dealSync.test.js            syncDealFromInquiry()          each stage mapping, already-won
                                                                 deal skip, missing FK

  mes/customerPO.test.js          ±5% validation                 exact match, 4.9%, 5.1%, no PO
                                                                 value provided

  mes/jobCard.test.js             BOM auto-population, number    empty BOM, partial availability,
                                  generation                     sequence collision

  mes/procurement.test.js         PR→PO→receipt chain            full receipt, partial receipt,
                                                                 receipt triggers job confirm

  mes/slaBreachChecker.test.js    overdue detection              overdue, due in future,
                                                                 already-submitted skipped
  --------------------------------------------------------------------------------------------------

**7.2 Integration Tests --- server/tests/integration/**

  ------------------------------------------------------------------------------
  **Test File**               **Workflow Tested**
  --------------------------- --------------------------------------------------
  quotationWorkflow.test.js   Draft → submit → approve → send → customer
                              response → create-revision → approve revision →
                              send revised

  customerPOFlow.test.js      price_accepted → capture PO → order_confirmed →
                              deal syncs to \'won\'

  jobCardFlow.test.js         order_confirmed → create job card → approve →
                              mes_job created → in_production stage

  procurementFlow.test.js     job card BOM not_available → auto-PR created →
                              approve PR → create SPO → receive → BOM available
                              → notify prod mgr

  dealInquirySync.test.js     Create deal → link inquiry → advance inquiry
                              stages → verify deal stage at each point

  rbacRoutes.test.js          Each restricted endpoint returns 403 for wrong
                              role, 200 for correct role
  ------------------------------------------------------------------------------

**7.3 End-to-End Tests --- server/tests/e2e/**

  ---------------------------------------------------------------------------
  **Test**      **Persona**     **Steps**
  ------------- --------------- ---------------------------------------------
  Full Sales    Sales Rep +     Prospect → Inquiry → QC → Clearance →
  Cycle         Sales Manager   Quotation (approve cycle) → Customer PO → Job
                                Card → Dispatch → Close

  Management    Sales Manager   Login → open Full Pipeline Dashboard → verify
  Pipeline View (level 7)       funnel counts → click production phase →
                                verify stalled items → assign task to rep

  QC Workflow   QC Analyst + QC Sample batch receive → full analysis → CSE
                Manager         generated → QC Manager approves → Production
                                Manager approves → Rep notified

  Procurement   Production      Job card approved with not-available BOM → PR
  Chain         Manager +       auto-created → Manager approves → SPO created
                Procurement +   → Storekeeper receives → Job confirmed
                Storekeeper     

  Role          Sales Rep A     Login as Rep A → attempt to view Rep B\'s
  Isolation                     customer → must get 403. Attempt to approve
                                quotation → must get 403.
  ---------------------------------------------------------------------------

**7.4 Phase Verification Checklists**

**After Phase 0 --- run before any Phase 1 work begins**

-   Login as sales rep with group_id ≠ 1 → confirm only own customers
    visible

-   Submit samples as rep → QC Manager approves CSE → Production Manager
    receives SSE notification (BUG-01 fixed)

-   QR scan sample URL → confirm NO submit result button, only \'Open
    Analysis Form\' link (BUG-02 fixed)

-   Server logs show no ReferenceError: salesRep.full_name

-   FP QC inbox shows only FP division samples

-   Individual sample PATCH generates one email, not two

-   sales_manager with designation_level=6 can grant clearance

**After Phase 1**

-   Sales rep submits quotation → manager receives in-app notification
    with quotation details

-   Manager rejects quotation with reason → rep receives notification +
    rejection_reason visible

-   Manager requests revision → quotation back to draft, revision_notes
    visible in mes_quotation_approvals history

-   Draft quotation PDF shows diagonal DRAFT watermark

-   Approved quotation PDF shows approver name

-   QC analyst submits analysis → sales rep receives SSE
    \'qc_result_ready\'

-   QC sample with sla_due_at in past shows red OVERDUE badge in
    QCDashboard

-   Management assigns lead via \'Assign to Rep\' → assigned rep
    receives SSE notification

**After Phase 2**

-   Inquiry advances to \'quoted\' → linked crm_deal.stage updates to
    \'negotiation\'

-   Inquiry advances to \'order_confirmed\' → linked deal.stage =
    \'won\', close reason = \'PO confirmed via \[number\]\'

-   Capture PO with value 12% higher than quotation total → yellow
    warning banner shown (not blocked)

-   Capture PO with correct value → inquiry_stage → order_confirmed

-   Mark dispatch with transporter + AWB → customer contact receives
    tracking email

-   Management task assigned to rep → rep sees it in TaskWidget with
    \'Assigned by \[name\]\' badge

**After Phase 3**

-   Production Manager creates job card from order_confirmed inquiry →
    BOM pre-populated

-   Job card approved → mes_jobs entry created, inquiry_stage =
    in_production, all production depts notified

-   Print job card PDF → A4 renders correctly with specs, BOM, signature
    blocks

-   Estimator opens /mes/estimation → enters costs → creates quotation
    with estimation_data snapshot

**After Phase 4**

-   Job card BOM has not_available line → PR auto-created → Procurement
    Manager notified

-   Manager approves PR → Procurement team notified

-   Supplier PO created → Manager approves → marked sent

-   Storekeeper records full receipt → all BOM lines → available → Job
    confirmed → Production Manager notified → Sales Rep notified

**After Phase 5**

-   Full Pipeline Dashboard shows correct funnel counts from live data

-   Stalled items list shows inquiries stuck \> 7 days with correct
    days_in_stage

-   Revenue forecast matches SUM of accepted quotations at
    order_confirmed+ stages

-   Production phase advance (flow.js) updates inquiry_stage and
    notifies sales rep

**After Phase 6 --- Regression**

-   All Phase 0 verification checklist items still pass

-   All API endpoints still return expected data after route splitting

-   No inline role checks remain in components (all use roleChecks.js
    functions)

-   No CSS file has rules for components outside its designated scope

-   npm test returns 0 failures

**8. Complete Notification Map**

  ---------------------------------------------------------------------------------------------------------
  **Event**            **Trigger**                              **Channel**   **Recipients**   **Status**
  -------------------- ---------------------------------------- ------------- ---------------- ------------
  Samples submitted to POST /inquiries/:id/submit-to-qc         Email + SSE   QC Lab, QC Mgr,  ✅ Built
  QC                                                                          Manager          

  QC analysis complete POST /qc/analyses/:id/submit             SSE           QC roles         ✅ Built
  → CSE                                                                                        

  QC analysis complete POST /qc/analyses/:id/submit             SSE           Sales Rep        ⚠️ ISS-01 →
  → Rep                                                                       (owner)          Phase 0

  QC Mgr approved →    POST /cse/:id/approve                    SSE           Production Mgr,  ⚠️ BUG-01 →
  Prod Mgr                                                                    Manager          Phase 0

  Prod Mgr final       POST /cse/:id/approve                    SSE           Sales Rep        ✅ Built
  approval → Rep                                                                               

  Clearance granted    PATCH /inquiries/:id/clearance           SSE           Sales Rep        ✅ Built

  SLA breach           Job every 30 min                         SSE           QC Mgr, Manager  ❌ Phase 1

  Quotation submitted  POST /quotations/:id/submit              SSE + Email   All Sales        ❌ Phase 1
  for approval                                                                Managers         

  Quotation approved   POST /quotations/:id/approve             SSE           Sales Rep        ✅ Built

  Quotation rejected   POST /quotations/:id/reject              SSE           Sales Rep        ❌ Phase 1
                                                                              (submitter)      

  Lead assigned to rep PATCH /prospects/:id or /customers/:id   SSE           Assigned Sales   ❌ Phase 1
                                                                              Rep              

  Task assigned to rep POST /tasks                              SSE           Assigned user    ❌ Phase 2

  PO confirmed         POST /proforma-invoices/:id/confirm      SSE           Production Mgr,  ✅ Built
  (Proforma)                                                                  Manager          

  Customer PO captured POST /customer-po                        SSE + Email   Sales Mgr,       ❌ Phase 2
                                                                              Production Mgr,  
                                                                              Procurement      

  Dispatch with        POST /orders/:id/deliver                 Email         Customer         ❌ Phase 2
  tracking                                                                    contact, Sales   
                                                                              Rep              

  Job Card created     POST /job-cards                          SSE           Production Mgr,  ❌ Phase 3
                                                                              Manager,         
                                                                              Storekeeper      

  Job Card approved    POST /job-cards/:id/approve              SSE           All production   ❌ Phase 3
                                                                              depts, Sales Rep 

  Material not in      BOM check on job card                    SSE           Procurement Mgr, ❌ Phase 4
  stock → PR                                                                  Manager          

  PR approved          POST /purchase-requisitions/:id/approve  SSE           Procurement team ❌ Phase 4

  SPO approved         POST /supplier-pos/:id/approve           SSE + Email   Procurement,     ❌ Phase 4
                                                                              Supplier         

  Materials fully      POST /stock-receipts                     SSE           Production Mgr,  ❌ Phase 4
  received                                                                    Manager, Sales   
                                                                              Rep              

  Production phase     POST /mes/jobs/:id/advance               SSE           Sales Rep        ❌ Phase 5
  advance                                                                                      

  Pre-prod sample sent PATCH /preprod-samples/:id/status        SSE           Sales Rep        ✅ Built

  Pre-prod sample      POST                                     SSE           Production,      ✅ Built
  approved             /preprod-samples/:id/customer-response                 Manager          
  ---------------------------------------------------------------------------------------------------------

**9. Complete File Inventory**

**9.1 Files to EDIT (Bug Fixes + Enhancements)**

  ---------------------------------------------------------------------------------------------------------
  **File**                                              **Phase**   **Change Summary**
  ----------------------------------------------------- ----------- ---------------------------------------
  server/routes/crm/customers.js                        P0          Fix \$\${paramIndex}, fix
                                                                    salesRep.full_name, add \'Assign to
                                                                    Rep\' endpoint

  server/routes/crm/prospects.js                        P0, P1      Fix \$\${paramIndex}, add \'Assign to
                                                                    Rep\' endpoint

  server/routes/crm/dashboard.js                        P0          Fix \$\${paramIndex}, add
                                                                    /pipeline-dashboard endpoint (Phase 5)

  server/routes/crm/deals.js                            P2          Add /unified-timeline endpoint,
                                                                    \'link-inquiry\' action

  server/routes/crm/tasks.js                            P2          Add assigned_to field, scope tasks by
                                                                    assignment for reps

  server/services/crmService.js                         P0          Fix resolveRepGroup() to use direct ID

  server/services/crmAccessControl.js                   P0, P6      Add buildRepScopeWhere(),
                                                                    isManagement() exported

  server/routes/mes/presales/\_helpers.js               P0          Add isManagement(), canCreateJobCard(),
                                                                    canApproveMaterial()

  server/routes/mes/presales/cse.js                     P0          Fix BUG-01: \'pending_qc\' →
                                                                    \'pending_qc_manager\'

  server/routes/mes/presales/qc.js                      P0, P1      Fix BUG-04 division filter, add ISS-01
                                                                    rep notification, SLA breach endpoint

  server/routes/mes/presales/samples.js                 P0          Fix BUG-05 double notification

  server/routes/mes/presales/inquiries.js               P0          Fix ISS-02 clearance role check

  server/routes/mes/presales/templates.js               P0          Fix BUG-03 product_group filter

  server/routes/mes/presales/quotations.js              P1, P3      Add
                                                                    submit/reject/revise/create-revision
                                                                    endpoints, enforce approved-only send

  server/routes/mes/presales/pipeline.js                P2          Call dealSyncService on stage advance

  server/routes/mes/presales/proforma.js                P2          Add transporter_name, awb_number,
                                                                    customer notification to deliver; add
                                                                    feedback endpoint

  server/routes/mes/presales/index.js                   P2--P4      Mount customerPO.js, jobCards.js,
                                                                    procurement.js routers

  server/routes/mes/flow.js                             P5          Call dealSyncService + update
                                                                    inquiry_stage on phase advance

  server/services/presalesPdfService.js                 P1, P3      Add DRAFT watermark, approver name,
                                                                    quotation PDF type, CSE logo +
                                                                    signature

  server/jobs/crmDailyDigest.js                         P1          Add SLA breach check call

  src/utils/roleChecks.js                               P0, P1      Add isManagement(), canCreateJobCard()
                                                                    exports

  src/utils/roleConstants.js                            P0          Add PROCUREMENT_ROLES, ensure
                                                                    MIS_MIN_LEVEL = 6

  src/components/CRM/CRMModule.jsx                      P1, P5      Add Full Pipeline Dashboard tab
                                                                    (management only)

  src/components/CRM/ProspectManagement.jsx             P1          Add \'Assign to Rep\' button
                                                                    (management only)

  src/components/CRM/CustomerList.jsx                   P1          Add \'Assign to Rep\' button
                                                                    (management only)

  src/components/CRM/CustomerInquiries.jsx              P1          Full integration: live stage, phase
                                                                    stepper, New Inquiry CTA

  src/components/CRM/TaskCreateModal.jsx                P2          Add \'Assign To\' rep selector
                                                                    (management only)

  src/components/CRM/TaskWidget.jsx                     P2          Show \'Assigned by \[name\]\' badge

  src/components/CRM/DealCard.jsx                       P2          Show inquiry_stage badge when deal has
                                                                    linked inquiry

  src/components/MES/PreSales/QCScanPage.jsx            P0          Remove result submission, replace with
                                                                    \'Open Analysis Form\' link

  src/components/MES/PreSales/InquiryBoard.jsx          P2          Add inquiry_stage badge to deal cards,
                                                                    rep filter (management only)

  src/components/MES/PreSales/InquiryDetail/index.jsx   P1--P4      Add tabs: CustomerPOPanel,
                                                                    JobCardPanel, ProcurementPanel,
                                                                    DeliveryFeedbackPanel

  src/components/MES/QC/QCDashboard.jsx                 P1          Add OVERDUE badge, management vs
                                                                    analyst view scoping

  src/components/MES/QC/QCSampleAnalysis.jsx            P5          Add disposition selector (ENH-04)

  src/components/MES/QC/QCTemplateAdmin.jsx             P5          Add FP-specific parameter presets
                                                                    (ENH-01)

  src/components/MES/index.jsx                          P3--P4      Add routes for JobCardList,
                                                                    EstimationQueue, ProcurementDashboard
  ---------------------------------------------------------------------------------------------------------

**9.2 Files to CREATE (New Components and Services)**

  -------------------------------------------------------------------------------------------------------------------------
  **File**                                                              **Phase**   **Purpose**
  --------------------------------------------------------------------- ----------- ---------------------------------------
  server/migrations/crm-014-rep-scope-fix.js                            P0          Populate sales_rep_group_id for all
                                                                                    active reps

  server/migrations/mes-presales-012-quotation-workflow.js              P1          parent_quotation_id, version_number,
                                                                                    mes_quotation_approvals table

  server/migrations/mes-presales-013-customer-po.js                     P2          mes_customer_purchase_orders table

  server/migrations/mes-presales-014-dispatch-feedback.js               P2          transporter/awb columns,
                                                                                    mes_delivery_feedback table

  server/migrations/crm-015-deal-sync.js                                P2          note + source columns on
                                                                                    crm_deal_stage_history

  server/migrations/mes-presales-015-job-cards.js                       P3          mes_job_cards table

  server/migrations/mes-presales-016-procurement.js                     P4          mes_purchase_requisitions,
                                                                                    mes_supplier_purchase_orders,
                                                                                    mes_stock_receipts tables

  server/migrations/mes-presales-017-sla-tracking.js                    P1          sent_to_qc_at column, SLA index

  server/routes/mes/presales/quotation-approval.js                      P1          submit / reject / revise /
                                                                                    approval-history endpoints

  server/routes/mes/presales/customerPO.js                              P2          Customer PO capture CRUD

  server/routes/mes/presales/jobCards.js                                P3          Job Card CRUD + approve +
                                                                                    material-status

  server/routes/mes/presales/procurement.js                             P4          PR / SPO / receipt endpoints

  server/services/dealSyncService.js                                    P2          syncDealFromInquiry() function

  server/services/mesNotificationService.js                             P6          standardNotify() wrapper function

  server/utils/sequenceGenerator.js                                     P6          generateSequenceNumber() shared utility

  server/jobs/slaBreachChecker.js                                       P1          30-min interval SLA breach detector

  server/tests/unit/crmAccessControl.test.js                            P6          Unit tests for buildRepScopeWhere,
                                                                                    isManagement

  server/tests/unit/quotationApproval.test.js                           P6          Unit tests for quotation state machine

  server/tests/unit/dealSync.test.js                                    P6          Unit tests for syncDealFromInquiry

  server/tests/unit/customerPO.test.js                                  P6          Unit tests for ±5% validation

  server/tests/unit/jobCard.test.js                                     P6          Unit tests for BOM population and
                                                                                    number generation

  server/tests/unit/procurement.test.js                                 P6          Unit tests for PR→PO→receipt chain

  server/tests/integration/quotationWorkflow.test.js                    P6          Integration: full quotation approval
                                                                                    cycle

  server/tests/integration/customerPOFlow.test.js                       P6          Integration: PO capture → deal sync

  server/tests/integration/jobCardFlow.test.js                          P6          Integration: job card create → approve
                                                                                    → MES job

  server/tests/integration/procurementFlow.test.js                      P6          Integration: full procurement chain

  server/tests/integration/dealInquirySync.test.js                      P6          Integration: bidirectional deal sync

  server/tests/integration/rbacRoutes.test.js                           P6          Integration: 403 for wrong roles on all
                                                                                    restricted endpoints

  server/tests/e2e/fullSalesCycle.test.js                               P6          E2E: Prospect → Closed across all
                                                                                    personas

  src/components/MES/PreSales/NegotiationTimeline.jsx                   P1          Vertical timeline of quotation versions

  src/components/MES/PreSales/InquiryDetail/CustomerPOPanel.jsx         P2          Customer PO capture form + status

  src/components/MES/PreSales/InquiryDetail/DeliveryFeedbackPanel.jsx   P2          Delivery feedback star rating form

  src/components/MES/PreSales/JobCardForm.jsx                           P3          Job card create/edit form with BOM
                                                                                    table

  src/components/MES/PreSales/JobCardPanel.jsx                          P3          Job card status tab on InquiryDetail

  src/components/MES/PreSales/JobCardPDF.jsx                            P3          jsPDF printable job card A4

  src/components/MES/PreSales/JobCardList.jsx                           P3          Management view of all job cards

  src/components/MES/PreSales/EstimationQueue.jsx                       P3          Queue of inquiries awaiting estimation

  src/components/MES/PreSales/EstimationForm.jsx                        P3          Cost calculation table with live unit
                                                                                    price

  src/components/MES/PreSales/InquiryDetail/ProcurementPanel.jsx        P4          PR/PO status tab on InquiryDetail

  src/components/MES/PreSales/PurchaseRequisitionForm.jsx               P4          Create/edit PR

  src/components/MES/PreSales/SupplierPurchaseOrderForm.jsx             P4          Create PO from approved PR

  src/components/MES/PreSales/StockReceiptForm.jsx                      P4          Storekeeper receipt confirmation

  src/components/MES/PreSales/ProcurementDashboard.jsx                  P4          Management procurement overview

  src/components/CRM/FullPipelineDashboard.jsx                          P5          Funnel, cycle times, stalled items,
                                                                                    revenue forecast
  -------------------------------------------------------------------------------------------------------------------------

**10. Coding Rules --- Every File, Every Commit**

  -------------------------------------------------------------------------
  **Rule**        **Detail**
  --------------- ---------------------------------------------------------
  Small files     Every route file ≤ 300 lines. Split when approaching
                  limit. No God files.

  Small PRs       Each PR = one atomic change. Never mix a bug fix with a
                  new feature in the same PR.

  Parameterised   ALWAYS use \$1, \$2 placeholders. NEVER interpolate \${}
  queries         into SQL strings. NEVER concatenate SQL.

  Transactions    All writes touching \>1 table: BEGIN / COMMIT / ROLLBACK.
                  On any error: ROLLBACK before returning 500.

  Role checks     ALWAYS import from roleChecks.js (frontend) or
                  \_helpers.js (backend). Never hardcode role strings
                  inline.

  Scoped queries  ALWAYS use buildRepScopeWhere() helper for any query that
                  lists customers, inquiries, tasks, or deals. Never write
                  the WHERE rep filter inline.

  Notifications   Every status change affecting another person MUST fire a
                  notification. No silent stage transitions.

  SSE labels      Every new notification type must be added to
                  MESNotificationBell.jsx typeLabel map before the PR is
                  merged.

  CSS naming      CRM: .crm-{component}-{element} in CRM.css. MES:
                  .presales-{component}-{element} in PresalesInquiries.css.
                  No inline styles except dynamic values.

  Soft delete     Never DELETE or destructive UPDATE without: soft-delete
                  (is_deleted flag) or explicit user-initiated confirmation
                  with a confirm dialog.

  Audit trail     All presales state changes: call logActivity(). All CRM
                  mutations: call logAudit(). All deal stage changes:
                  insert crm_deal_stage_history.

  Error responses All errors return { success: false, error:
                  \'\<message\>\' }. All 403s log the attempt. All 500s log
                  the full stack trace.

  Test before     Before marking any task done: (1) happy path, (2) missing
  ship            required field → 400, (3) unauthorised role → 403, (4)
                  run npm test.

  No data loss    No migration runs DELETE or DROP without explicit
                  is_deleted soft-delete migration first. Keep all data.

  Migration       CRM migrations: crm-014, crm-015\... MES migrations:
  numbering       mes-presales-012, mes-presales-013\... Never reuse a
                  number.
  -------------------------------------------------------------------------

**11. Sprint Schedule**

  -------------------------------------------------------------------------
  **Week**   **Phase**   **Tasks**                    **Output**
  ---------- ----------- ---------------------------- ---------------------
  Week 1 --- Phase 0     P0-01 → ISS-02 (all 10 bug   All critical bugs
  Days 1--2              fixes, one PR each)          resolved, zero
                                                      wrong-data risk

  Week 1 --- Phase 1     P1-1: quotation              Quotation workflow
  Days 3--5  (Part 1)    submit/reject/revise, P1-2:  enforced end-to-end
                         PDF watermark, P1-3:         
                         versioning                   

  Week 1 --- Phase 1     P1-4: SLA breach job, P1-5:  Notifications live,
  Days 4--5  (Part 2)    CustomerInquiries, P1-6:     management can assign
                         Lead assignment              leads

  Week 2     Phase 2     P2-1: Deal sync, P2-2:       Bidirectional sync
                         Customer PO, P2-3: Dispatch  live, PO captured,
                         fields, P2-4: Delivery       dispatch tracked
                         feedback, P2-5: Task         
                         allocation                   

  Weeks 3--4 Phase 3     P3-1+2: Job Card backend +   Job Card working,
                         UI, P3-3: Estimation view,   estimation dedicated
                         run Phase 3 verification     view

  Week 5     Phase 4     P4-1: Procurement backend,   Full material
                         P4-2: Procurement UI, run    procurement chain
                         Phase 4 verification         live

  Weeks 6--7 Phase 5     P5-1: Pipeline Dashboard,    Full pipeline visible
                         P5-2: MES flow link, P5-3:   to management, loop
                         QC enhancements              complete

  Weeks 8--9 Phase 6     P6-1--P6-4: Refactoring,     Clean codebase, test
                         test suite, verification     coverage ≥ 80%, all
                         regression run               checklists pass
  -------------------------------------------------------------------------

Total: 9 weeks from Phase 0 kickoff to Phase 6 completion.

Parallel tracks: After Phase 0, Phases 1 and 2 can overlap if two
developers are available. Phase 3 depends on Phase 2 (needs Customer PO
table). Phase 4 depends on Phase 3 (needs Job Card table). Phase 5
depends on Phase 4.

**Appendix --- End-to-End Workflow Reference**

Complete 32-step pipeline from Prospect to Closed order.

  --------------------------------------------------------------------------------------------------
  **\#**   **Stage**         **Actor**     **System**                        **Notification Sent
                                                                             To**
  -------- ----------------- ------------- --------------------------------- -----------------------
  1        Prospect created  Sales Rep     CRM: fp_prospects                 ---
           (exhibition /                                                     
           referral / cold                                                   
           call)                                                             

  2        Technical Brief   Sales Rep     CRM: crm_technical_briefs         ---
           captured                                                          
           (substrate,                                                       
           dimensions,                                                       
           volume)                                                           

  3        Deal created &    Sales Rep     CRM: crm_deals                    ---
           linked to                                                         
           prospect                                                          

  4        Prospect approved Sales Manager CRM: fp_customer_unified          Sales Rep
           by manager →                                                      
           convert to                                                        
           Customer                                                          

  5        Inquiry created   Sales Rep     MES: mes_presales_inquiries       ---
           (3-step wizard)                                                   

  6        TDS / samples     Sales Rep     MES: mes_presales_samples         ---
           uploaded                                                          

  7        SAR printed with  Sales Rep     MES: SAR PDF                      ---
           QR label                                                          

  8        Batch samples     Sales Rep     MES: samples status → sent_to_qc  QC Lab, QC Mgr, Manager
           submitted to QC                                                   

  9        QC inbox: batch   QC Analyst    MES: status → qc_received         ---
           receive samples                                                   

  10       QR scan → Open    QC Analyst    MES: redirect to QCSampleAnalysis ---
           full analysis                                                     
           form                                                              

  11       Full QC analysis  QC Analyst    MES: mes_qc_analyses              Sales Rep (ISS-01)
           completed                                                         

  12       CSE               System        MES: mes_cse_reports              ---
           auto-generated                                                    

  13       QC Manager        QC Manager    MES: cse status →                 Production Manager,
           reviews +                       qc_manager_approved               Manager
           approves CSE                                                      

  14       Production        Prod Manager  MES: cse status → approved        Sales Rep
           Manager final                                                     
           approval                                                          

  15       Pre-sales         Sales Manager MES: presales_cleared = true      Sales Rep
           clearance granted (level 6+)                                      

  16       MOQ check         Management    MES: mes_presales_moq_checks      ---
           completed                                                         

  17       Material          Management    MES: mes_presales_material_checks ---
           availability                                                      
           check                                                             

  18       Estimation: unit  Estimator /   MES:                              ---
           price calculated  Sales Mgr     mes_quotations.estimation_data    

  19       Quotation created Sales Rep /   MES: mes_quotations status →      ---
           (draft)           Estimator     draft                             

  20       Sales Rep submits Sales Rep     MES: status → pending_approval    All Sales Managers
           quotation for                                                     (NEW)
           approval                                                          

  21       Manager approves  Sales Manager MES: status → approved            Sales Rep
           quotation                                                         

  22       Quotation sent to Sales Rep     MES: status → sent                ---
           customer                                                          

  23       Customer          Sales Rep     MES: status →                     ---
           response:         records       accepted/rejected/counter_offer   
           accepted /                                                        
           rejected /                                                        
           counter                                                           

  24       If counter:       Sales Rep     MES: new quotation with           Sales Manager
           escalate to                     parent_quotation_id (NEW)         
           manager, create                                                   
           revision                                                          

  25       Manager approves  Sales Manager MES: revised quotation → approved Sales Rep
           revised quotation                                                 

  26       Customer accepts  Sales Rep     MES: inquiry → price_accepted     ---
           final quotation                                                   

  27       Proforma Invoice  Sales Rep     MES: mes_proforma_invoices        Customer (email)
           created and sent                                                  

  28       Customer PO       Sales Rep     MES: mes_customer_purchase_orders Sales Mgr, Prod Mgr,
           captured                        (NEW)                             Procurement

  29       Pre-production    Sales Rep /   MES: mes_preprod_samples          Sales Rep
           sample            Production                                      
           requested + sent                                                  

  30       Customer approves Sales Rep     MES: preprod status → approved    Production, Manager
           pre-prod sample   records                                         

  31       Job Card created  Prod Manager  MES: mes_job_cards (NEW)          All production, Sales
           from confirmed                                                    Rep
           inquiry                                                           

  32       Job Card approved Prod Manager  MES: mes_jobs created, inquiry →  All production, Sales
                             (level 6+)    in_production                     Rep

  33       If material not   System        MES: mes_purchase_requisitions    Procurement, Manager
           in stock → PR                   (NEW)                             
           auto-created                                                      

  34       PR approved →     Manager,      MES: mes_supplier_purchase_orders Procurement, Supplier
           Supplier PO       Procurement   (NEW)                             
           created → sent                                                    

  35       Materials         Storekeeper   MES: mes_stock_receipts (NEW),    Prod Manager, Sales Rep
           received                        BOM updated                       

  36       Production phases Production    MES: mes_jobs phases              Sales Rep (each
           1--17 (prepress → Operators                                       advance)
           dispatch)                                                         

  37       Dispatch with     Production /  MES: inquiry → delivered          Sales Rep, Customer
           transporter + AWB Logistics                                       contact

  38       Customer feedback Sales Rep     MES: mes_delivery_feedback (NEW)  ---
           captured                                                          

  39       Inquiry closed →  Sales Rep     MES: inquiry → closed; CRM: deal  ---
           Deal marked Won                 → won                             
  --------------------------------------------------------------------------------------------------

This document is the single source of truth for the PPH-26.2 CRM/MES
implementation. All PRs reference phase and task numbers from this
document.

Last updated: March 2026 \| Owner: Development Lead \| Review cycle: end
of each phase
