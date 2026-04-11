# Reference App Analysis — Pre-Sales / QC Sample Evaluation Feature Ideas

> Generated: 2026-02-25  
> Purpose: Extract patterns from 5 open-source apps to enhance the PPH Pre-Sales / QC Sample Evaluation workflow for flexible packaging manufacturing.

---

## 1. Per-App Analysis

---

### 1.1 Dolibarr (PHP ERP/CRM)

**Source path:** `Apps for Idea/dolibarr/dolibarr-develop/htdocs/`

#### Key Modules Analyzed
| Module | Path | Relevance |
|--------|------|-----------|
| Proposals (Propal) | `comm/propal/class/propal.class.php` | Pre-sales quotation workflow |
| Ticket System | `ticket/class/ticket.class.php` | Sample evaluation tracking |
| ECM (Document Management) | `ecm/class/ecmfiles.class.php` | File attachment pattern |
| Notifications | `core/modules/modNotification.class.php` | Event-driven email notifications |
| PDF Generation | `core/modules/propale/doc/pdf_azur.modules.php` | PDF report generation |

#### Feature Patterns Found

**A. Proposal Status Machine (6 statuses)**
```
CANCELED (-1) → DRAFT (0) → VALIDATED (1) → SIGNED (2) | NOTSIGNED (3) → BILLED (4)
```
- Each transition has a dedicated method with **permission checks** (`propal_advance.validate`), **trigger hooks** (`PROPAL_VALIDATE`), and **audit fields** (`date_valid`, `fk_user_valid`).
- The `valid()` method generates a sequential reference number only on validation, not creation.
- `reopen()` allows going back to draft with a required note.

**B. Built-in PDF Document Templates**
- Multiple PDF templates selectable per document (`pdf_azur`, `pdf_cyan`).
- Template model path pattern: documents can switch between ODT and PDF generators.
- `generateDocument()` delegates to `commonGenerateDocument()` — a shared engine across all modules.

**C. ECM (Electronic Content Management)**
- Every business object has a **Document** tab with file attachments stored in `ecm_files` table.
- Files linked via `src_object_type` + `src_object_id` — polymorphic relation.
- Version control per document with `share` and `acl` metadata.

**D. Ticket Status Workflow (maps well to sample evaluation)**
```
NOT_READ (0) → READ (1) → ASSIGNED (2) → IN_PROGRESS (3) → NEED_MORE_INFO (5) → WAITING (7) → CLOSED (8) | CANCELED (9)
```
- `NEED_MORE_INFO` state is perfect for "awaiting customer clarification" in pre-sales.
- `WAITING` state maps to "on hold / awaiting sample from customer".

**E. Trigger-Based Notification System**
- `modNotification` subscribes to **business events** (e.g., `PROPAL_VALIDATE`, `TICKET_CREATE`).
- Users subscribe per-object-type to choose which notifications they want.
- Notifications fire via email on state transitions.

---

### 1.2 ERPNext (Python/Frappe Manufacturing ERP)

**Source path:** `Apps for Idea/erpnext/erpnext-develop/erpnext/`

#### Key Modules Analyzed
| Module | Path | Relevance |
|--------|------|-----------|
| Quality Management | `quality_management/doctype/` | Full QC workflow system |
| CRM / Opportunity | `crm/doctype/opportunity/` | Pre-sales pipeline |
| Selling / Quotation | `selling/doctype/quotation/` | Quote generation |
| Manufacturing | `manufacturing/doctype/` | Work orders, BOM |
| Notifications | `manufacturing/notification/` | Event-driven notifications |

#### Feature Patterns Found

**A. Complete Quality Management Module (7 interconnected DocTypes)**

```
Quality Procedure (tree) ← Quality Goal (with objectives table) → Quality Review → Quality Action
                                                                                     ↑
Quality Feedback Template → Quality Feedback (with parameters table) ─────────────────┘
                                                              ↓
                                                   Non Conformance
```

Key design patterns:
- **Quality Procedure** is a **nested tree** (`is_tree: 1`, `parent_quality_procedure`) — procedures can nest under parent procedures.
- **Quality Goal** has a `monitoring_frequency` field (None/Daily/Weekly/Monthly/Quarterly) that drives automated review schedules.
- **Quality Review** results in Pass/Fail status and links directly to corrective/preventive **Quality Actions**.
- **Quality Action** has a child table of **Resolutions**, each with its own status. The parent's status auto-computes: `"Open" if any resolution is open else "Completed"`.
- **Quality Feedback** uses a **template system** — `Quality Feedback Template` defines parameters, which are auto-populated into the feedback form.
- **Non Conformance** tracks corrective + preventive action text with process owner lookup.
- All entities have `track_changes: 1` — automatic audit logging.

**B. CRM Opportunity Model**
- Lead → Opportunity → Quotation pipeline.
- Opportunity has: `sales_stage` (linked to Sales Stage master), `probability %`, `expected_closing`, `opportunity_amount`.
- **Notes tab** with a `CRMNote` mixin for inline notes.
- **Activities tab** with `open_activities_html` and `all_activities_html` — server-rendered activity feeds.
- `lost_reasons` as multi-select table with `competitors` tracking.
- `first_response_time` (Duration field) — SLA tracking.
- Auto-fetches `opportunity_from` linked document's address/contact on load.

**C. Notification System (Declarative JSON)**
```json
{
  "document_type": "Material Request",
  "event": "Value Change",
  "value_changed": "status",
  "condition": "doc.status == 'Received' or doc.status == 'Partially Received'",
  "recipients": [{ "receiver_by_document_field": "requested_by" }],
  "subject": "{{ doc.name }} has been received"
}
```
- Notifications are **declarative**: event type, condition, recipients, and template are all config.
- Supports: `Value Change`, `Days Before/After`, `Method` event types.
- Recipients can be dynamic (from a document field), fixed roles, or specific users.

**D. Quotation DocType (comprehensive pricing)**
- Links to `Opportunity`, has `valid_till` date.
- Full tax calculation with `taxes_and_charges` child table.
- `payment_schedule` child table for payment terms.
- `packed_items` for bundle/kit support.
- Print format templates are selectable per document.

**E. Quality Meeting**
- Auto-named with date: `QA-MEET-{YY}-{MM}-{DD}`.
- Two child tables: **Agenda** items and **Minutes** — structured meeting records.
- Status: Open → Closed.

---

### 1.3 iDempiere (Java ERP)

**Source path:** `Apps for Idea/idempiere/idempiere-master/`

#### Key Modules Analyzed
| Module | Path | Relevance |
|--------|------|-----------|
| Quality Test | `org.adempiere.base/src/org/compiere/model/MQualityTest.java` | QC test definition |
| Quality Test Result | `org.adempiere.base/src/org/compiere/model/MQualityTestResult.java` | QC pass/fail results |
| Workflow Engine | `org.adempiere.base/src/org/compiere/wf/` | Full workflow engine |

#### Feature Patterns Found

**A. Quality Test → Product Linkage**
- `M_QualityTest` defines a test (Name, Description, Help text).
- `M_Product_QualityTest` is a **join table** linking Products to their required quality tests — one product can have multiple mandatory QC tests.
- `M_QualityTestResult` records each test execution with:
  - `M_AttributeSetInstance_ID` — links to the specific lot/batch.
  - `IsQCPass` (boolean) — pass/fail result.
  - `Processed` flag — prevents editing after completion.
- `createResult()` factory method on `MQualityTest` auto-populates the result record from the test definition.

**B. Enterprise Workflow Engine (18 classes)**
Key entities:
| Class | Purpose |
|-------|---------|
| `MWorkflow` | Workflow definition with nodes and transitions |
| `MWFNode` | Individual step (approval, action, condition) |
| `MWFNodeNext` | Transition between nodes with conditions |
| `MWFNextCondition` | Conditional branching logic |
| `MWFActivity` | Runtime instance of a workflow step |
| `MWFProcess` | Runtime instance of a workflow execution |
| `MWFResponsible` | Who is responsible for an activity (Role/User/Org) |
| `MWFEventAudit` | Audit trail of every workflow event |

Design patterns:
- **Node types**: Approval, User Choice, Set Variable, Document Action, Sub-Workflow, EMail, Report.
- **MWFActivity** implements `Runnable` — activities can execute asynchronously.
- **MWFActivityApprover** — dedicated model for tracking who approved each activity.
- **MWFEventAudit** — every state transition logged with user, timestamp, old/new state.
- **MWFResponsible** determines the approver dynamically: by Role, by specific User, by Organization, or by Invoking User's supervisor.
- Workflows are **document-generic** — any table can have workflow attached via `AD_Table_ID`.

**C. Document Action Pattern**
- Standard document lifecycle: Draft → In Progress → Complete → Close / Void / Reverse.
- `DocAction` interface implemented by all business documents.
- `completeIt()`, `voidIt()`, `closeIt()`, `reverseIt()` — standard API.
- Actions are validated against current state via `StateEngine`.

---

### 1.4 Metafresh (Java ERP, fresh produce focus)

**Source path:** `Apps for Idea/metafresh/metasfresh-new_dawn_uat/backend/`

#### Key Modules Analyzed
| Module | Path | Relevance |
|--------|------|-----------|
| Quality Management | `de.metas.qualitymgmt/` | QM analysis reports |
| RFQ (Request for Quote) | `de.metas.rfq/` | Pre-sales inquiry pattern |
| Sales Candidate | `de.metas.salescandidate.base/` | Pre-sales pipeline |
| Material Tracking | referenced by qualitymgmt | Lot/batch tracking |
| Document Archive | `de.metas.document.archive/` | PDF archiving |

#### Feature Patterns Found

**A. QM Analysis Report with Document Lifecycle**
- `QMAnalysisReportDocumentHandler` implements `DocumentHandler` interface.
- Full document lifecycle: Draft → Complete → ReActivate.
- On completion:
  - Sets `Processed = true` (prevents further editing).
  - Looks up `MaterialTracking` via `AttributeSetInstance` — links the QC report to the specific batch/lot.
  - Creates `M_Material_Tracking_Ref` — a reference record linking the analysis report to the material tracking record.
- `getDocumentDate()`, `getSummary()`, `getDocumentInfo()` — standard metadata API.

**B. RFQ Module (Full Request-for-Quote Lifecycle)**

Architecture (interfaces + implementations + events):
```
IRfqBL (business logic)
├── getSummary(), isCompleted(), assertComplete()
├── isDraft(), complete(), close(), unclose()
└── calculatePriceWithoutDiscount()

IRfQResponseProducer (generates responses from RFQ)
├── create() → List<I_C_RfQResponse>
└── setPublish(boolean) → auto-publish after generation

IRfQResponseRankingStrategy (selects winner)
├── rank(rfq) → evaluates all completed responses
└── DefaultRfQResponseRankingStrategy:
    - Ignores invalid/zero responses
    - Ranks by net amount per line qty
    - Selects per-line or total winners

IRfQEventDispatcher → IRfQEventListener
├── CompositeRfQEventListener → multiple listeners
└── Event types: RFQ state changes

IRfQResponsePublisher
├── MailRfqResponsePublisher → emails responses to vendors
└── Composite pattern for multiple publishers
```

Key patterns:
- **Topic-based RFQ**: `C_RfQ_Topic` groups RFQ types — could map to "Packaging Type" in PPH.
- **Response ranking**: automated comparison of vendor responses by price/quantity.
- **Event dispatcher**: pub/sub pattern for RFQ lifecycle events.
- **Publisher pattern**: responses can be auto-emailed to participants.
- **Rich exception hierarchy**: `RfQDocumentClosedException`, `RfQResponseLineInvalidException`, etc. — granular error handling.

**C. Sales Candidate Module**
- `de.metas.salescandidate.base` — pre-sales pipeline management.
- Candidates are sales opportunities tracked before they become formal orders.
- Separate from the main sales order flow — dedicated pre-sales tracking.

---

### 1.5 Twenty (Modern TypeScript CRM)

**Source path:** `Apps for Idea/twenty/twenty-main/packages/`

#### Key Modules Analyzed
| Module | Path | Relevance |
|--------|------|-----------|
| Opportunity | `twenty-server/src/modules/opportunity/` | Sales pipeline entity |
| Workflow Engine | `twenty-server/src/modules/workflow/` | Visual workflow builder |
| Timeline/Activity | `twenty-server/src/modules/timeline/` | Activity feed logging |
| Attachments | `twenty-server/src/modules/attachment/` | File attachment system |
| Notes | `twenty-server/src/modules/note/` | Inline notes |
| Messaging | `twenty-server/src/modules/messaging/` | Communication tracking |
| Dashboard | `twenty-server/src/modules/dashboard/` | Dashboard/KPI widgets |
| Front-end Workflow | `twenty-front/src/modules/workflow/` | Visual workflow diagram |

#### Feature Patterns Found

**A. Opportunity Entity (Modern CRM Pipeline)**
```typescript
class OpportunityWorkspaceEntity {
  name: string;
  amount: CurrencyMetadata | null;    // Structured currency type
  closeDate: Date | null;
  stage: string;                       // Pipeline stage
  position: number;                    // Kanban position
  createdBy: ActorMetadata;            // Audit: who created
  updatedBy: ActorMetadata;            // Audit: who last updated
  pointOfContact: PersonRelation;      // Primary contact
  company: CompanyRelation;            // Linked company
  owner: WorkspaceMemberRelation;      // Sales rep owner

  // Polymorphic relations:
  favorites: FavoriteRelation[];       // User favorites/bookmarks
  taskTargets: TaskTargetRelation[];   // Linked tasks
  noteTargets: NoteTargetRelation[];   // Linked notes
  attachments: AttachmentRelation[];   // File attachments
  timelineActivities: TimelineActivityRelation[];  // Activity feed
}
```
- **Polymorphic attachments/notes/tasks** — any entity can have these linked to it.
- `position` field for drag-and-drop Kanban ordering.
- `ActorMetadata` captures creator/updater identity with structured metadata.
- `searchVector` for full-text search.

**B. Visual Workflow Builder (Most Sophisticated)**

Workflow Version lifecycle:
```
DRAFT → ACTIVE → DEACTIVATED → ARCHIVED
```

Workflow action types (16 types):
| Action Type | Purpose |
|------------|---------|
| `CODE` | Custom JavaScript/TypeScript code execution |
| `LOGIC_FUNCTION` | Reusable logic function call |
| `SEND_EMAIL` | Send email notification |
| `DRAFT_EMAIL` | Create draft email |
| `CREATE_RECORD` | Create a new record |
| `UPDATE_RECORD` | Update existing record |
| `DELETE_RECORD` | Delete record |
| `UPSERT_RECORD` | Create or update |
| `FIND_RECORDS` | Query records |
| `FORM` | Show a form for user input (approval forms!) |
| `FILTER` | Filter/route based on conditions |
| `IF_ELSE` | Conditional branching |
| `HTTP_REQUEST` | External API call |
| `AI_AGENT` | AI-powered action |
| `ITERATOR` | Loop over records |
| `DELAY` | Wait/schedule action |

Front-end components:
- `workflow-diagram/` — Visual node-based diagram editor with drag & drop.
- `workflow-nodes/`, `workflow-edges/` — React Flow-based visual components.
- `workflow-steps/` — Step configuration panels.
- `workflow-trigger/` — Trigger configuration (on record create/update, scheduled, manual).
- `workflow-variables/` — Variable binding system.

**C. Timeline Activity System**
```typescript
class TimelineActivityWorkspaceEntity {
  happensAt: Date;
  name: string;
  properties: JSON;                  // Flexible metadata
  linkedRecordCachedName: string;    // Denormalized for display
  linkedRecordId: string;
  linkedObjectMetadataId: string;    // Generic link to any object type

  // Auto-links to many target types:
  targetPerson, targetCompany, targetOpportunity,
  targetNote, targetTask, targetWorkflow,
  targetWorkflowVersion, targetWorkflowRun, targetDashboard
}
```
- **Polymorphic activity log** — one timeline for all entity types.
- `properties` JSON field stores arbitrary event data.
- `linkedRecordCachedName` — denormalized name for fast rendering without joins.

**D. Attachment System with Categories**
```typescript
class AttachmentWorkspaceEntity {
  file: FileOutput[];         // Multiple files per attachment
  fileCategory: string;       // Category: "Document", "Image", "Spreadsheet"
  createdBy: ActorMetadata;
  // Polymorphic targets:
  targetTask, targetNote, targetPerson,
  targetCompany, targetOpportunity, targetDashboard, targetWorkflow
}
```

**E. Dashboard Module**
- `twenty-front/src/modules/dashboards/` — dashboard with custom widgets.
- GraphQL-based data fetching for real-time KPIs.

---

## 2. Consolidated Feature Ideas to Borrow

### Priority 1: Core QC / Sample Evaluation Workflow

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 1 | **QC Feedback Template System** | ERPNext | Define reusable evaluation templates with configurable parameters. When a sample arrives, select a template → parameters auto-populate the form. Each parameter has a rating scale. |
| 2 | **Quality Procedure Tree** | ERPNext | Define QC procedures as a hierarchical tree (e.g., "Film Testing" → "Tensile Strength" → "MD/TD"). Each leaf procedure has a process owner. |
| 3 | **Product ↔ Quality Test Matrix** | iDempiere | `M_Product_QualityTest` join table. Each product/SKU has a set of mandatory QC tests. When a sample arrives for that product, auto-generate the required test checklist. |
| 4 | **QC Test Result with Pass/Fail + Lot Tracking** | iDempiere | `MQualityTestResult` pattern: each test execution records pass/fail, links to lot/batch via `AttributeSetInstance`, and becomes immutable via `Processed` flag. |
| 5 | **Non-Conformance Tracking** | ERPNext | When a QC test fails, auto-create a Non-Conformance record with: subject, procedure link, corrective action, preventive action, and process owner lookup. |
| 6 | **Quality Action with Resolution Table** | ERPNext | Quality Action has a child table of resolutions. Parent status auto-computes from children: `"Open" if any child is Open else "Completed"`. Perfect for tracking multiple corrective/preventive actions per NCR. |
| 7 | **QM Analysis Report Document Lifecycle** | Metafresh | QC reports follow Draft → Complete → ReActivate lifecycle. On completion: locks editing, links to material tracking batch, creates reference records. |

### Priority 2: Pre-Sales Pipeline Enhancement

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 8 | **6-Stage Proposal Status Machine** | Dolibarr | `DRAFT → VALIDATED → SIGNED/NOT_SIGNED → BILLED`. Each transition has: permission check, trigger hook for notifications, audit fields (who/when). Reference number only assigned on validation. |
| 9 | **Sales Stage + Probability Tracking** | ERPNext + Twenty | Opportunity has a linked `SalesStage` master with associated probability %. Pipeline value = amount × probability. Use for weighted pipeline forecasting. |
| 10 | **"Need More Info" Status** | Dolibarr Ticket | Add a `NEED_MORE_INFO` / `AWAITING_CUSTOMER` status to the pre-sales inquiry flow. When the sales rep needs clarification or a sample from the customer, the inquiry pauses in this state. |
| 11 | **Lost Reason Tracking with Competitors** | ERPNext | When an inquiry is lost/rejected: capture structured `lost_reasons` (multi-select) + free-text detail + `competitors` (multi-select). Enables loss analytics. |
| 12 | **First Response Time SLA** | ERPNext | `first_response_time` Duration field on Opportunity — track how quickly the team responds to a new inquiry. Can feed KPI dashboards and SLA alerts. |
| 13 | **RFQ Topic Categorization** | Metafresh | `C_RfQ_Topic` groups RFQs by type. Map to packaging type: "Pouches", "Labels", "Shrink Wrap", etc. Enables filtering and routing by product category. |
| 14 | **Kanban Position Field** | Twenty | `position: number` on Opportunity. Enables drag-and-drop reordering within pipeline stages without changing status. |

### Priority 3: Approval & Workflow Engine

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 15 | **Versioned Workflow Definitions** | Twenty | Workflows have DRAFT → ACTIVE → DEACTIVATED → ARCHIVED versions. Edit a draft version while active version keeps running. |
| 16 | **Workflow Form Action** | Twenty | `FORM` action type pauses the workflow and presents a form to the user (e.g., approval form). After submission, workflow continues. Perfect for multi-level approvals. |
| 17 | **If/Else Conditional Branching** | Twenty | `IF_ELSE` workflow action routes to different paths based on conditions (e.g., if sample value > $10K, require VP approval). |
| 18 | **Delay/Schedule Action** | Twenty | `DELAY` action waits for a specified duration before continuing (e.g., wait 24h for customer response, then auto-escalate). |
| 19 | **Responsible Determination (4 modes)** | iDempiere | `MWFResponsible`: determine approver by (a) specific User, (b) Role, (c) Organization hierarchy, (d) Invoking user's supervisor. |
| 20 | **Workflow Event Audit Trail** | iDempiere | `MWFEventAudit` — every workflow state transition logged with user, timestamp, old state, new state, comments. |
| 21 | **Document Action Pattern** | iDempiere + Metafresh | Standard lifecycle interface: `completeIt()`, `voidIt()`, `closeIt()`, `reverseIt()`. Every business document implements the same lifecycle API. |

### Priority 4: Notification System

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 22 | **Declarative Notification Rules** | ERPNext | Define notifications as JSON config: document type, trigger event (value change / days before / method), condition expression, recipient field, email template. No code changes needed to add new notifications. |
| 23 | **Trigger-Based Subscription Model** | Dolibarr | Users subscribe to specific event types per object (e.g., "notify me on PROPAL_VALIDATE"). Granular control over what notifications each role receives. |
| 24 | **RFQ Event Dispatcher (Pub/Sub)** | Metafresh | `IRfQEventDispatcher` + `IRfQEventListener` pattern. Composite listener supports multiple subscribers. Decouple notification logic from business logic. |
| 25 | **Auto-Email on Workflow Transition** | Twenty | `SEND_EMAIL` and `DRAFT_EMAIL` workflow actions. On sample evaluation completion → auto-email the sales rep and customer. |

### Priority 5: Document Generation & Attachments

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 26 | **Selectable PDF Templates** | Dolibarr | Multiple PDF templates per document type. Users choose template on generation. Templates stored at `core/modules/{module}/doc/`. Common generation engine. |
| 27 | **Polymorphic File Attachments** | Twenty + Dolibarr | Any entity (inquiry, sample, QC result) can have file attachments. Use `targetEntityType` + `targetEntityId` polymorphic pattern. File categories: "Document", "Image", "Test Result", "COA". |
| 28 | **Document Versioning** | Dolibarr ECM | ECM module tracks file versions, share settings, and ACL metadata. When a QC report is revised, keep history of all versions. |

### Priority 6: Activity Logging & Audit

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 29 | **Polymorphic Timeline Activity** | Twenty | Single `TimelineActivity` table with `linkedObjectMetadataId` for generic linking. Properties stored as JSON. Cached display name for fast rendering. |
| 30 | **Auto-Track Changes** | ERPNext | `track_changes: 1` flag on DocType automatically logs all field changes with before/after values, user, and timestamp. No manual audit code needed. |
| 31 | **CRM Notes Mixin** | ERPNext | `CRMNote` mixin adds an inline notes tab to any entity. Notes support rich text, mention users, and appear in activity timeline. |
| 32 | **Activity Tabs (Open + All)** | ERPNext | Opportunity has separate "Open Activities" and "All Activities" sections. Open shows pending tasks/events; All shows complete history. |

### Priority 7: Dashboard & KPI

| # | Feature Idea | Source App | Details |
|---|-------------|-----------|---------|
| 33 | **Quality Workspace Dashboard** | ERPNext | Pre-built workspace with shortcuts to: Quality Goal, Quality Procedure, Quality Inspection, Quality Review, Quality Action, Non Conformance. Card-based layout with "Reports & Masters" section. |
| 34 | **RFQ Response Ranking Dashboard** | Metafresh | Automated comparison of responses by net amount. Visual ranking of vendor/supplier quotes. Selected winner flagging. |
| 35 | **Pipeline Summary by Stage** | ERPNext + Twenty | Number cards showing count + value per pipeline stage. Weighted pipeline value (amount × probability). |
| 36 | **Quality Goal Monitoring Frequency** | ERPNext | Goals can be set with monitoring frequency (Daily/Weekly/Monthly/Quarterly) that auto-creates review schedules. |

---

## 3. Recommended Implementation Roadmap

### Phase 1: QC Sample Evaluation Core
Implement ideas: **1, 3, 4, 5, 6, 7**
- Template-based evaluation forms
- Product → QC test matrix
- Pass/fail results with lot tracking
- Non-conformance with corrective/preventive actions
- Document lifecycle (Draft → Complete → Lock)

### Phase 2: Pre-Sales Pipeline Enhancement
Implement ideas: **8, 9, 10, 11, 12, 14**
- Rich status machine with transition permissions
- Sales stage + probability tracking
- "Awaiting Customer" status
- Lost reason analytics
- SLA tracking

### Phase 3: Notifications & Workflow
Implement ideas: **22, 24, 25, 15, 16, 17**
- Declarative notification rules engine
- Event pub/sub pattern
- Visual workflow with form actions for approvals
- Conditional branching in workflows

### Phase 4: Documents & Activity Trail
Implement ideas: **26, 27, 29, 30, 31**
- PDF template selection
- Polymorphic file attachments with categories
- Unified activity timeline
- Auto-track changes audit log
- Inline notes system

### Phase 5: Dashboards & Analytics
Implement ideas: **33, 34, 35, 36**
- QC workspace dashboard
- Pipeline summary KPIs
- Response comparison tools
- Monitoring frequency automation

---

## 4. Key Architecture Principles Observed Across All Apps

1. **Separation of Definition vs. Execution**: Templates/procedures define the "what", instances/results record the "when" (ERPNext templates, iDempiere workflows).
2. **Polymorphic Relations**: Attachments, notes, and activities link to ANY entity type via generic foreign keys (Twenty, Dolibarr ECM).
3. **Declarative over Imperative**: Notifications, workflows, and validations are config-driven, not hard-coded (ERPNext notifications, Twenty workflows).
4. **Status Machine with Hooks**: Every status transition has (a) permission check, (b) validation, (c) trigger/event, (d) audit log entry (all 5 apps).
5. **Immutability on Completion**: Completed documents become read-only (`Processed = true`) to maintain data integrity (iDempiere, Metafresh).
6. **Composite/Strategy Patterns**: Pluggable algorithms for ranking, publishing, and notification (Metafresh RFQ ranking, response publishers).
7. **Hierarchical Data**: Tree structures for procedures, categories, and organization units (ERPNext nested set, iDempiere organization tree).
