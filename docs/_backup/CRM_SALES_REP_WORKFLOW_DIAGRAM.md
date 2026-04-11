# CRM Module - Sales Rep Complete Workflow Diagram

> **Audit Date:** March 5, 2026  
> **Status:** ✅ All navigation flows verified  
> **Backend API:** ✅ Full CRUD coverage confirmed

---

## Master Navigation Flow

```mermaid
flowchart TB
    subgraph ENTRY["🚀 Entry Point"]
        LOGIN["/login"] --> AUTH{Authenticated?}
        AUTH -->|Yes| MODULES["/modules"]
        AUTH -->|No| LOGIN
        MODULES -->|Click CRM| CRMHOME
    end

    subgraph CRMTABS["📑 CRM Tab Navigation (Sales Rep)"]
        CRMHOME["Home<br/>/crm"]
        OVERVIEW["Overview<br/>/crm/overview"]
        MYDAY["My Day<br/>/crm/my-day"]
        WORKLIST["Worklist<br/>/crm/worklist"]
        CUSTOMERS["My Customers<br/>/crm/customers"]
        PROSPECTS["My Prospects<br/>/crm/prospects"]
        PERFORMANCE["Performance<br/>/crm/report"]
    end

    CRMHOME <--> OVERVIEW
    OVERVIEW <--> MYDAY
    MYDAY <--> WORKLIST
    WORKLIST <--> CUSTOMERS
    CUSTOMERS <--> PROSPECTS
    PROSPECTS <--> PERFORMANCE

    subgraph HOME_ACTIONS["🏠 Home Page Actions"]
        QA_TASKS["Quick: Tasks"] -->|Navigate| WL_TASKS
        QA_MEETINGS["Quick: Meetings"] -->|Navigate| WL_MEETINGS
        QA_CALLS["Quick: Calls"] -->|Navigate| WL_CALLS
        QA_DEALS["Quick: Deals"] -->|Navigate| WL_DEALS
        MENU_CREATE["⋮ Menu: Create Task/Meeting/Call/Deal"] -->|Modal| CREATE_MODALS
        ACT_LIST["Activity List Row"] -->|Click| LINKED_RECORD
        LEAD_ROW["Lead Row"] -->|Click Footer| PROSPECTS
        DEAL_FULL["Deal → Full View"] -->|Navigate| OVERVIEW
    end

    CRMHOME --> HOME_ACTIONS

    subgraph WORKLIST_TAB["📋 Worklist Tab"]
        WL_TASKS["/crm/worklist?type=tasks"]
        WL_MEETINGS["/crm/worklist?type=meetings"]
        WL_CALLS["/crm/worklist?type=calls"]
        WL_DEALS["/crm/worklist?type=deals"]
        
        WL_TASKS -->|Open Button| TASK_LINK{Linked To?}
        WL_MEETINGS -->|Open Button| MEETING_LINK{Linked To?}
        WL_CALLS -->|Open Button| CALL_LINK{Linked To?}
        WL_DEALS -->|Open Button| DEAL_LINK{Linked To?}
    end

    TASK_LINK -->|inquiry_id| INQ_DETAIL
    TASK_LINK -->|customer_id| CUST_DETAIL
    TASK_LINK -->|prospect_id| PROSP_HIGHLIGHT
    TASK_LINK -->|None| DISABLED["⛔ Disabled"]

    MEETING_LINK -->|inquiry_id| INQ_DETAIL
    MEETING_LINK -->|customer_id| CUST_DETAIL
    MEETING_LINK -->|prospect_id| PROSP_HIGHLIGHT

    CALL_LINK -->|inquiry_id| INQ_DETAIL
    CALL_LINK -->|customer_id| CUST_DETAIL
    CALL_LINK -->|prospect_id| PROSP_HIGHLIGHT

    DEAL_LINK -->|inquiry_id| INQ_DETAIL
    DEAL_LINK -->|customer_id| CUST_DETAIL
    DEAL_LINK -->|prospect_id| PROSP_HIGHLIGHT

    subgraph MYDAY_TAB["📅 My Day Tab"]
        COUNTER_OVERDUE["Counter: Overdue Tasks"] -->|Scroll| TASKS_SECTION
        COUNTER_INQ["Counter: Inquiries"] -->|Scroll| INQ_SECTION
        COUNTER_DORMANT["Counter: Dormant"] -->|Scroll| DORMANT_SECTION
        
        TASKS_SECTION["Open Tasks List"]
        INQ_SECTION["Inquiries List"]
        DORMANT_SECTION["Dormant Customers"]
        
        TASKS_SECTION -->|View Button| MYDAY_VIEW{Target?}
        INQ_SECTION -->|View Button| INQ_DETAIL
        DORMANT_SECTION -->|Click Row| CUST_DETAIL
    end

    MYDAY_VIEW -->|inquiry_id| INQ_DETAIL
    MYDAY_VIEW -->|customer_id| CUST_DETAIL
    MYDAY_VIEW -->|prospect_id| PROSP_HIGHLIGHT
    MYDAY_VIEW -->|None| DISABLED

    subgraph DETAIL_PAGES["📄 Detail Pages"]
        INQ_DETAIL["/crm/inquiries/:id<br/>Inquiry Detail"]
        CUST_DETAIL["/crm/customers/:id<br/>Customer Detail"]
        PROSP_HIGHLIGHT["/crm/prospects?highlight=:id<br/>→ Auto-opens Drawer"]
    end

    subgraph CUST_ACTIONS["👥 Customer Detail Actions"]
        CUST_DETAIL -->|Back Button| CUSTOMERS
        CUST_DETAIL -->|Edit Mode| CUST_EDIT["Edit Form"]
        CUST_EDIT -->|Save| API_CUST_PUT["PUT /api/crm/customers/:id"]
        CUST_EDIT -->|Cancel| DISCARD_MODAL["Confirm Discard"]
        
        CUST_DETAIL -->|Contacts Tab| CONTACTS_CRUD
        CUST_DETAIL -->|Notes Tab| NOTES_CRUD
        CUST_DETAIL -->|Deals Tab| DEAL_PIPELINE
        CUST_DETAIL -->|Inquiries Tab| CUST_INQ
    end

    subgraph PROSPECT_ACTIONS["🎯 Prospect Actions"]
        PROSPECTS -->|+ New Prospect| PROSP_ADD["POST /api/crm/prospects"]
        PROSPECTS -->|Row Click/Arrow| PROSP_DRAWER["Prospect Drawer"]
        PROSP_DRAWER -->|Update Status| PROSP_STATUS["PUT /api/crm/prospects/:id/status"]
        PROSP_DRAWER -->|Convert| PROSP_CONVERT["POST /api/crm/prospects/:id/convert"]
        PROSP_DRAWER -->|Delete| PROSP_DELETE["DELETE /api/crm/prospects/:id"]
        PROSP_HIGHLIGHT --> PROSP_DRAWER
    end

    subgraph CREATE_MODALS["➕ Create Modals"]
        TASK_MODAL["TaskCreateModal"]
        MEETING_MODAL["MeetingCreateModal"]
        CALL_MODAL["CallCreateModal"]
        DEAL_MODAL["DealCreateModal"]
        
        TASK_MODAL -->|Submit| API_TASK["POST /api/crm/tasks"]
        MEETING_MODAL -->|Submit| API_MEETING["POST /api/crm/meetings"]
        CALL_MODAL -->|Submit| API_CALL["POST /api/crm/calls"]
        DEAL_MODAL -->|Submit| API_DEAL["POST /api/crm/deals"]
    end

    style ENTRY fill:#e8f5e9
    style CRMTABS fill:#e3f2fd
    style WORKLIST_TAB fill:#fff3e0
    style MYDAY_TAB fill:#fce4ec
    style DETAIL_PAGES fill:#f3e5f5
    style CREATE_MODALS fill:#e0f7fa
    style DISABLED fill:#ffcdd2
```

---

## Entity CRUD Matrix

```mermaid
flowchart LR
    subgraph TASKS["Tasks"]
        T_C["✅ Create<br/>POST /api/crm/tasks"]
        T_R["✅ Read<br/>GET /api/crm/tasks"]
        T_U["✅ Update<br/>PATCH /api/crm/tasks/:id"]
        T_D["⚠️ Delete<br/>Not exposed in UI"]
    end

    subgraph MEETINGS["Meetings"]
        M_C["✅ Create<br/>POST /api/crm/meetings"]
        M_R["✅ Read<br/>GET /api/crm/meetings"]
        M_U["✅ Update<br/>PATCH /api/crm/meetings/:id"]
        M_D["⚠️ Delete<br/>Not exposed in UI"]
    end

    subgraph CALLS["Calls"]
        C_C["✅ Create<br/>POST /api/crm/calls"]
        C_R["✅ Read<br/>GET /api/crm/calls"]
        C_U["✅ Update<br/>PATCH /api/crm/calls/:id"]
        C_D["⚠️ Delete<br/>Not exposed in UI"]
    end

    subgraph DEALS["Deals"]
        D_C["✅ Create<br/>POST /api/crm/deals"]
        D_R["✅ Read<br/>GET /api/crm/deals"]
        D_U["✅ Update Stage<br/>PATCH /api/crm/deals/:id"]
        D_D["⚠️ Delete<br/>Not exposed in UI"]
    end

    subgraph PROSPECTS["Prospects"]
        P_C["✅ Create<br/>POST /api/crm/prospects"]
        P_R["✅ Read<br/>GET /api/crm/my-prospects"]
        P_U["✅ Update Status<br/>PUT /api/crm/prospects/:id/status"]
        P_D["✅ Delete<br/>DELETE /api/crm/prospects/:id"]
        P_CONV["✅ Convert<br/>POST /api/crm/prospects/:id/convert"]
    end

    subgraph CUSTOMERS["Customers"]
        CU_C["🔒 Create<br/>Via ERP/Merge only"]
        CU_R["✅ Read<br/>GET /api/crm/my-customers"]
        CU_U["✅ Update<br/>PUT /api/crm/customers/:id"]
        CU_D["🔒 Delete<br/>Admin only"]
    end

    subgraph CONTACTS["Customer Contacts"]
        CO_C["✅ Create<br/>POST /api/crm/customers/:id/contacts"]
        CO_R["✅ Read<br/>GET /api/crm/customers/:id/contacts"]
        CO_U["✅ Update<br/>PATCH /api/crm/customers/:id/contacts/:cid"]
        CO_D["✅ Delete<br/>DELETE /api/crm/customers/:id/contacts/:cid"]
    end

    subgraph NOTES["Customer Notes"]
        N_C["✅ Create<br/>POST /api/crm/notes"]
        N_R["✅ Read<br/>GET /api/crm/notes"]
        N_U["✅ Update<br/>PATCH /api/crm/notes/:id"]
        N_D["✅ Delete<br/>DELETE /api/crm/notes/:id"]
    end

    style T_D fill:#fff3e0
    style M_D fill:#fff3e0
    style C_D fill:#fff3e0
    style D_D fill:#fff3e0
    style CU_C fill:#ffcdd2
    style CU_D fill:#ffcdd2
```

---

## Deep Link Resolution Flow

```mermaid
sequenceDiagram
    participant U as User
    participant WL as CRMWorklist
    participant MD as MyDayDashboard
    participant MP as MyProspects
    participant CD as CustomerDetail
    participant INQ as InquiryDetail

    Note over U,INQ: Scenario: User clicks "Open" on a Task

    U->>WL: Click "Open" on Task Row
    WL->>WL: goToLinkedRecord(task)
    
    alt Has inquiry_id
        WL->>INQ: navigate(/crm/inquiries/{inquiry_id})
        INQ-->>U: Show Inquiry Detail Page
    else Has customer_id
        WL->>CD: navigate(/crm/customers/{customer_id})
        CD-->>U: Show Customer Detail Page
    else Has prospect_id
        WL->>MP: navigate(/crm/prospects?highlight={prospect_id})
        MP->>MP: useEffect reads highlight param
        MP->>MP: Find prospect in array
        MP->>MP: setSelected(prospect), setDrawerOpen(true)
        MP->>MP: Clear highlight from URL
        MP-->>U: Prospect Drawer auto-opens
    else No linked entity
        WL-->>U: Button disabled (greyed out)
    end
```

---

## Activity Creation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant HP as CRMHomePage
    participant MOD as Create Modal
    participant API as Backend API
    participant DB as Database

    U->>HP: Click "⋮" Menu → Create Task
    HP->>MOD: Open TaskCreateModal
    U->>MOD: Fill form (title, due date, priority, customer/prospect)
    U->>MOD: Click "Create Task"
    MOD->>API: POST /api/crm/tasks
    API->>DB: INSERT INTO crm_tasks
    DB-->>API: Success + task record
    API-->>MOD: { success: true, data: task }
    MOD->>MOD: message.success("Task created")
    MOD->>HP: onCreated() callback
    HP->>HP: refresh() → loadData()
    HP-->>U: Updated activity list shown
```

---

## Customer Edit Flow

```mermaid
stateDiagram-v2
    [*] --> ViewMode: Load Customer

    ViewMode --> EditMode: Click "Edit" button
    
    EditMode --> Saving: Click "Save"
    EditMode --> DiscardModal: Click "Cancel"
    
    DiscardModal --> ViewMode: Confirm discard
    DiscardModal --> EditMode: Keep editing
    
    Saving --> ViewMode: API success
    Saving --> EditMode: API error (show message)
    
    ViewMode --> [*]: Click "Back to Customers"
    
    state EditMode {
        [*] --> FormActive
        FormActive --> FieldChanged: User edits field
        FieldChanged --> FormActive: Continue editing
        
        note right of FormActive
            Read-only fields:
            - customer_code (🔒)
            - customer_name (🔒)
        end note
    }
```

---

## Prospect Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Active: Create Prospect
    
    Active --> Active: Update notes/source
    Active --> Converted: Convert to Customer
    Active --> Rejected: Mark as Rejected
    Active --> [*]: Delete
    
    Converted --> CustomerRecord: Redirect to Customer Detail
    
    state Active {
        [*] --> Pending
        Pending --> Approved: Admin approves
        Approved --> InProgress: Sales rep working
    }
    
    note right of Converted
        POST /api/crm/prospects/:id/convert
        Sets converted_to_customer = true
        Shows success modal with CTA
    end note
```

---

## Backend API Coverage Summary

| Entity | Create | Read | Update | Delete | Notes |
|--------|--------|------|--------|--------|-------|
| **Tasks** | ✅ POST | ✅ GET | ✅ PATCH | ⚠️ API exists, UI hidden | Status: open/completed/overdue |
| **Meetings** | ✅ POST | ✅ GET | ✅ PATCH | ⚠️ API exists, UI hidden | Status: planned/held/not_held |
| **Calls** | ✅ POST | ✅ GET | ✅ PATCH | ⚠️ API exists, UI hidden | Direction: inbound/outbound |
| **Deals** | ✅ POST | ✅ GET | ✅ PATCH | ⚠️ API exists, UI hidden | Stages: qualified→won/lost |
| **Prospects** | ✅ POST | ✅ GET | ✅ PUT status | ✅ DELETE | Convert endpoint exists |
| **Customers** | 🔒 ERP only | ✅ GET | ✅ PUT | 🔒 Admin only | Editable fields limited |
| **Contacts** | ✅ POST | ✅ GET | ✅ PATCH | ✅ DELETE | Under customer context |
| **Notes** | ✅ POST | ✅ GET | ✅ PATCH | ✅ DELETE | Under customer context |
| **Activities** | ✅ POST | ✅ GET | — | — | Log-only (immutable) |
| **Worklist Prefs** | — | ✅ GET | ✅ PUT | ✅ DELETE | Per-user per-list-type |

---

## Issues Found & Fixed (This Session)

| Issue | Root Cause | Fix Applied |
|-------|-----------|-------------|
| Task "View" → `/crm/customers/undefined` | Missing validation for customer_id | Added `disabled` prop + priority logic |
| Prospect-linked items → generic list | No highlight param handling | Added `?highlight=` + auto-open drawer |
| MyProspects didn't auto-open drawer | Missing URL param listener | Added `useEffect` with `location.search` |

---

## Keyboard Shortcuts (CRMWorklist)

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Alt+1` | Switch to Tasks tab |
| `Alt+2` | Switch to Meetings tab |
| `Alt+3` | Switch to Calls tab |
| `Alt+4` | Switch to Deals tab |

---

## File Reference

| Component | File | Purpose |
|-----------|------|---------|
| Tab Router | [CRMModule.jsx](../src/components/CRM/CRMModule.jsx) | Main container, tab navigation |
| Home | [CRMHomePage.jsx](../src/components/CRM/CRMHomePage.jsx) | Daily planner, quick access, calendar |
| My Day | [MyDayDashboard.jsx](../src/components/CRM/MyDayDashboard.jsx) | Action counters, open tasks, inquiries |
| Worklist | [CRMWorklist.jsx](../src/components/CRM/CRMWorklist.jsx) | Unified list for tasks/meetings/calls/deals |
| Prospects | [MyProspects.jsx](../src/components/CRM/MyProspects.jsx) | Prospect management with drawer |
| Customer | [CustomerDetail.jsx](../src/components/CRM/CustomerDetail.jsx) | Full customer profile with tabs |
| Deals | [DealPipeline.jsx](../src/components/CRM/DealPipeline.jsx) | Kanban pipeline view |
| Create Task | [TaskCreateModal.jsx](../src/components/CRM/TaskCreateModal.jsx) | Task creation form |
| Create Meeting | [MeetingCreateModal.jsx](../src/components/CRM/MeetingCreateModal.jsx) | Meeting creation form |
| Create Call | [CallCreateModal.jsx](../src/components/CRM/CallCreateModal.jsx) | Call logging form |
| Create Deal | [DealCreateModal.jsx](../src/components/CRM/DealCreateModal.jsx) | Deal creation form |

---

> **Audit Result:** All navigation links, CRUD operations, and backend API endpoints verified for the Sales Rep CRM view. The system follows a consistent pattern where clickable items navigate to the appropriate detail page based on the linked entity type (inquiry → customer → prospect), with proper fallback handling when no link exists.
