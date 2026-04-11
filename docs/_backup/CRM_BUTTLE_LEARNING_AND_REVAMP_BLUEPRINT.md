# CRM Learning File + Revamp Blueprint (B2B Flexible Packaging)

Source used: `francis_buttle-customer_relationship_management_second_edition-butterworth-heinemann2008_2.pdf` (text extracted to `docs/buttle_crm_book_extracted.txt`).

This file is a practical translation of Buttle’s CRM concepts into your ProPackHub CRM-MES reality (sales rep workflows, inquiries, quotations, pre-production, procurement, job card handoff).

---

## 1) What to Learn from Buttle (and keep as guiding principles)

## 1.1 CRM is not just software
- CRM must be designed across 4 layers together:
  - Strategic CRM (which customers to win/keep/develop)
  - Operational CRM (daily sales/marketing/service processes)
  - Analytical CRM (segmentation, forecasting, LTV, propensity)
  - Collaborative CRM (channel and team coordination)
- If one layer is missing, CRM appears busy but underperforms.

## 1.2 Lifecycle > isolated transactions
- Winning in B2B comes from managing the customer lifecycle:
  - Acquisition
  - Retention
  - Development
  - (Selective termination for low-value / high-risk accounts)
- KPI system must follow lifecycle stages, not only monthly sales totals.

## 1.3 Portfolio thinking is mandatory in B2B
- Customer portfolio management (segmentation, value tiers, cost-to-serve, forecast confidence) is core.
- "All customers are equal" is a strategic error in B2B packaging.

## 1.4 Value is multi-dimensional
- Customer value is not only price:
  - Product fit (spec performance)
  - Service reliability (delivery, complaint handling)
  - Process quality (quote speed, artwork cycle, approval latency)
  - Communication quality (clarity, speed, proactive updates)
  - Channel convenience

## 1.5 CRM project success needs phased implementation
- Strategy → foundations → requirements → implementation → performance evaluation.
- Continuous measurement and iteration is part of CRM, not post-project work.

---

## 2) Salesforce “Opportunities” vs your naming

In your CRM, Salesforce **Opportunity** = **Deal**.

- Existing object/API: `crm_deals`
- Existing route: `/api/crm/deals`
- Existing UI component: `DealPipeline.jsx`

Recommended naming policy:
- Keep internal schema/API as `deal` for compatibility.
- UI label can be “Deals (Opportunities)” during transition.
- After user adoption, optionally standardize UI to one term only.

---

## 3) Current Coverage Map (what you already have)

## 3.1 Strong areas
- Rep navigation structure exists: Home, Overview, My Day, My Customers, My Prospects, Performance.
- Core CRM objects exist:
  - Activities (`crm_activities`)
  - Tasks (`crm_tasks`)
  - Meetings (`crm_meetings`)
  - Calls (`crm_calls`)
  - Deals (`crm_deals`)
  - Prospects (`fp_prospects`)
- CRM ↔ MES bridge already exists:
  - `crm_activities.inquiry_id -> mes_presales_inquiries.id`
  - `crm_deals.inquiry_id -> mes_presales_inquiries.id`
- Overview has advanced analytics/risk panels (should remain the analytics cockpit).

## 3.2 Structural gaps
- No dedicated full list-workspace for Tasks/Meetings/Calls/Deals for reps.
- Quick access behavior not fully aligned to “view list” mental model.
- Limited formal retention/development playbooks (stale deal governance, save-at-risk campaigns).
- No single “customer health / account score” framework tying CRM + MES outcomes.
- Global search still missing across CRM+MES entities.

---

## 4) Target Operating Model for your B2B Flexible Packaging CRM

## 4.1 Tab roles (freeze this contract)
- **Home**: Daily launchpad (quick access, short lists, upcoming commitments).
- **Overview**: Analytics cockpit (pipeline value, risk, trend, forecast confidence).
- **My Day**: Action center (today/overdue actions, SLAs, escalations).
- **My Customers**: Account management workspace (health, activity, opportunity context).
- **My Prospects**: New business and conversion workspace.
- **Performance**: Target vs actual, budget, personal/team performance diagnostics.

Non-goal: duplicate the same widgets in multiple tabs.

## 4.2 Object model clarity
- Prospect -> converted to Customer
- Deal (Opportunity) -> links to Customer, optional Inquiry
- Inquiry (MES pre-sales) -> can spawn Deal + quotation/process events
- Activities/Tasks/Meetings/Calls -> link to Customer/Prospect/Deal/Inquiry where applicable

## 4.3 Process spine (flexible packaging specific)
Prospect -> Qualified Prospect -> Inquiry -> Technical/Commercial Qualification -> Quotation -> Negotiation -> PO Confirmed -> Job Card -> Dispatch -> Post-sale retention actions.

CRM must visualize this spine, not just store records.

---

## 5) What to Add / Remove / Revamp

## 5.1 ADD (high priority)

### A) Unified Worklist page for reps
Add `CRMWorklist.jsx` with tabs/filters for:
- Tasks
- Meetings
- Calls
- Deals (table + kanban switch)

Add deep links:
- `/crm/worklist?type=tasks`
- `/crm/worklist?type=meetings`
- `/crm/worklist?type=calls`
- `/crm/worklist?type=deals`

### B) Opportunity governance (Deal governance)
- Stale deal detector (e.g., no update in 7/14/21 days)
- Escalation ladder:
  - Day 7 -> rep reminder
  - Day 14 -> rep + manager
  - Day 21 -> mandatory review task
- “Next step required” rule on active deals.

### C) Customer health model (B2B packaging)
Create a weighted health score from:
- Order recency
- Inquiry-to-order conversion behavior
- On-time payment pattern
- Complaint/NCR frequency and severity
- Gross margin trend
- Engagement frequency (calls/meetings)

### D) Account plans for key customers
For strategic accounts, store:
- annual volume target
- margin target
- risk register
- competitor notes
- action plan with owner/date

### E) Global Search (CRM+MES)
Cross-search customers, prospects, inquiries, quotations, deals, contacts.

---

## 5.2 REMOVE / DEPRECATE
- Remove duplicated KPI widgets across Home and Overview.
- Avoid opening create modals from Home quick-access when user intent is list navigation.
- Remove ambiguous vocabulary in UI (“prospect/lead/opportunity/deal”) by standard glossary.

---

## 5.3 REVAMP

### Home quick-access bar
- Must open filtered lists, not create forms.
- Create remains in contextual “...” menus and Add buttons.

### My Day
- Keep as action dashboard.
- Add explicit links “View all tasks/meetings/calls/deals” into Worklist with correct filters.

### Overview
- Keep as non-duplicated analytics cockpit.
- Add forecast confidence and coverage ratio (pipeline / target).

### Deal Pipeline
- Keep existing Kanban, add:
  - age-in-stage
  - inactivity days
  - required next action
  - confidence score

---

## 6) Data Model Plan (DB required)

Existing core tables already in place:
- `crm_activities`, `crm_tasks`, `crm_meetings`, `crm_calls`, `crm_deals`
- `fp_prospects`, `fp_customer_unified`, `mes_presales_inquiries`

Additions (new tables):

### 6.1 `crm_worklist_views`
Purpose: saved filters/personal views per rep.
- id, user_id, name, object_type, filter_json, sort_json, is_default, created_at, updated_at

### 6.2 `crm_deal_signals`
Purpose: computed deal risk and quality indicators.
- id, deal_id, stale_days, age_in_stage_days, has_next_step, confidence_score, risk_band, computed_at

### 6.3 `crm_customer_health_snapshots`
Purpose: periodic account health scoring.
- id, customer_id, score_total, score_components_json, risk_band, snapshot_date

### 6.4 `crm_account_plans`
Purpose: strategic account planning.
- id, customer_id, owner_id, year, target_volume_mt, target_margin_pct, competitor_notes, strategy_notes, status

### 6.5 `crm_account_plan_actions`
Purpose: execution tasks for account plans.
- id, account_plan_id, action_title, owner_id, due_date, status, progress_note

### 6.6 `crm_automation_rules` (optional if building native automation)
Purpose: stale-alerts, SLA-trigger tasks, manager notifications.
- id, rule_name, object_type, trigger_type, condition_json, action_json, is_active

Indexes to add (minimum):
- `crm_deal_signals(deal_id, computed_at desc)`
- `crm_customer_health_snapshots(customer_id, snapshot_date desc)`
- `crm_worklist_views(user_id, object_type, is_default)`
- `crm_account_plans(customer_id, year)`

---

## 7) Integration Blueprint (CRM x MES)

## 7.1 Mandatory links
- Deal <-> Inquiry (already partially supported)
- Activity <-> Inquiry/Customer/Prospect/Deal
- Quotation outcomes feed Deal stage and confidence signals
- Procurement and production milestones feed customer communication prompts

## 7.2 Event flow to implement
- Inquiry created -> optional Deal auto-create rule
- Quotation approved/rejected -> Deal stage update + activity task
- Job card started/completed -> customer update reminder task
- Dispatch delay / quality issue -> risk alert on customer + deal context

---

## 8) KPI Framework (balanced, lifecycle aligned)

## 8.1 Acquisition
- New qualified prospects/month
- Prospect->Inquiry conversion
- Inquiry->Deal conversion
- Time-to-first-quote

## 8.2 Retention
- Active customer ratio
- Revenue retention %
- Customer health distribution (green/amber/red)
- Dormant strategic accounts

## 8.3 Development
- Cross-sell penetration by product group
- Margin improvement by account tier
- Share of wallet proxy (if available)

## 8.4 Pipeline quality
- Open pipeline value
- Coverage ratio vs target
- Stale deals count
- Average age in stage
- Forecast confidence

---

## 9) 90-Day Execution Plan

### Phase 1 (Weeks 1–3): UX correction + worklist
- Deliver `CRMWorklist`
- Deep-link routes + quick-access rewiring
- Keep create actions only in contextual menus

### Phase 2 (Weeks 4–6): Deal governance + automation
- Stale deal rules and escalation
- Next-step enforcement
- Risk indicator chips on deal cards/lists

### Phase 3 (Weeks 7–9): Account health + planning
- Customer health snapshots
- Account plans/actions
- Dashboard additions for retention and development

### Phase 4 (Weeks 10–12): Search + analytics hardening
- Global search across CRM/MES
- Forecast confidence model
- KPI instrumentation and UAT closeout

---

## 10) Practical Design Rules (for consistency)
- One page = one job-to-be-done.
- No duplicate widgets across Home and Overview.
- Always show “what changed” + “what next action is required”.
- Prefer guided actions over passive charts.
- Every alert must include owner + due date + clear next step.

---

## 11) Recommended Immediate Decisions
1. Confirm official term in UI: “Deals” or “Opportunities”.
2. Approve Worklist as mandatory rep feature.
3. Approve customer health scoring dimensions and weights.
4. Approve stale-deal SLA thresholds (7/14/21 or custom).
5. Prioritize migration order for new CRM tables above.

---

## 12) Notes on use of source book
This file is a distilled implementation guide based on extracted reading notes from the provided Buttle CRM book. It intentionally summarizes concepts and converts them into your platform-specific action plan for B2B flexible packaging operations.
