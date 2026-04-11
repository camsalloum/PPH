# CRM Implementation Roadmap
**Last Updated:** February 22, 2026  
**Status:** Active Reference — Two-Phase Plan

---

## Guiding Principle

> "Does the rep know exactly what to do next within 5 seconds of opening the dashboard?"  
> If yes — it works. If no — something needs to be removed, not added.

Every number must have a comparison. Never show a KPI alone.  
Every alert must include: **What** happened · **Why** it matters · **What to do**  
Max 5 alerts at once. If everything is an alert, nothing is.

---

---

# SECTION 1 — NOW
### Everything buildable today with existing data + current stack

---

## 1. Customer Declining Alert

**What:** Flag customers whose orders dropped 40%+ vs same period last year.  
**Data source:** `fp_actualcommon` (already has `customer_name`, `sales_rep_group_name`, year/month columns)  
**Where it shows:** CRM rep dashboard + admin dashboard risk panel  

**Alert format:**
> ⚠️ **Al Ain Farms — Orders down 47% vs LY**  
> No open inquiry on file.  
> → *Schedule a review call*

**SQL logic:**
```sql
SELECT 
  customer_name,
  sales_rep_group_name,
  SUM(CASE WHEN EXTRACT(YEAR FROM invoice_date) = 2026 THEN net_amount ELSE 0 END) AS this_year,
  SUM(CASE WHEN EXTRACT(YEAR FROM invoice_date) = 2025 THEN net_amount ELSE 0 END) AS last_year,
  ROUND(
    (SUM(CASE WHEN EXTRACT(YEAR FROM invoice_date) = 2026 THEN net_amount ELSE 0 END) 
     - SUM(CASE WHEN EXTRACT(YEAR FROM invoice_date) = 2025 THEN net_amount ELSE 0 END))
    / NULLIF(SUM(CASE WHEN EXTRACT(YEAR FROM invoice_date) = 2025 THEN net_amount ELSE 0 END), 0) * 100, 1
  ) AS growth_pct
FROM fp_actualcommon
WHERE EXTRACT(MONTH FROM invoice_date) <= EXTRACT(MONTH FROM CURRENT_DATE)
GROUP BY customer_name, sales_rep_group_name
HAVING growth_pct < -40
ORDER BY growth_pct ASC
LIMIT 10;
```

**Endpoint:** `GET /api/crm/alerts/declining-customers`  
**Component:** `<RiskAlertPanel />` — shared between rep and admin dashboards

---

## 2. Dormant / White Space Accounts

**What:** Customers with no invoice in 90+ days AND no open inquiry.  
**Data source:** `fp_customer_unified` + `fp_actualcommon` + `crm_mes_inquiries`  
**Where it shows:** Rep dashboard "Hidden Pipeline" card  

**Alert format:**
> 💡 **5 accounts haven't ordered in 90+ days**  
> Combined LY value: AED 320,000  
> → *View list → Create inquiry*

**Logic:**
- Last invoice date from `fp_actualcommon` > 90 days ago
- No open inquiry in `crm_mes_inquiries` for that customer
- Scoped by `sales_rep_group_name` (rep sees only their accounts)

**Endpoint:** `GET /api/crm/alerts/dormant-accounts`

---

## 3. Stagnant Inquiry Alert

**What:** Inquiries stuck in the same stage for longer than expected.  
**Data source:** `crm_mes_inquiries` (`status`, `updated_at`, `created_at`)  
**Where it shows:** InquiryBoard cards (badge) + Admin dashboard  

**Thresholds by stage:**
| Stage | Max days before alert |
|---|---|
| NEW | 3 days |
| CONTACTED | 7 days |
| PROPOSAL | 10 days |
| SAMPLE_SENT | 14 days |
| NEGOTIATION | 21 days |

**Badge on card:**
> ⚠️ 18 days in PROPOSAL

**Endpoint:** Already possible from existing `crm_mes_inquiries` — add computed field `days_in_stage` to the list query  
**Component:** Badge on `InquiryBoardCard` — yellow at threshold, red at 2× threshold

---

## 4. Rep Performance Cards (Dashboard Top Row)

**What:** 4 KPI cards always visible at the top of every rep's dashboard.  
**Data source:** `fp_actualcommon` + `budget_data` (or `fp_budget` table)  

**Cards:**
1. **This Month vs Target** — `AED 142K — 78% of monthly budget · +12% vs LY`
2. **YTD vs Budget** — `AED 1.2M — 84% of YTD budget`
3. **Active Inquiries** — `12 open · 3 need action`
4. **Avg Deal Size** — `AED 18,400 · ↑ vs your Q4 average`

**Rule:** Every number shows comparison. No standalone amounts.  
**Scope:** Rep sees own group data; Admin/Manager sees team aggregate  
**Endpoint:** `GET /api/crm/dashboard/performance-summary`

---

## 5. Pipeline (Inquiry) Summary

**What:** Total value of open inquiries by stage — gives reps a "pipeline health" view.  
**Data source:** `crm_mes_inquiries` — requires `estimated_value` field (add if missing)  

**Display:**
```
Open Pipeline: AED 480K across 12 inquiries
Coverage vs monthly target: 3.4x  ← good
Inquiries closing this month: 4 (AED 120K)
```

**If `estimated_value` doesn't exist yet:** Use inquiry count as proxy until field is added.

**Component:** `<PipelineSummaryCard />` on CRM dashboard

---

## 6. Inquiry → Customer Conversion Tracking

**What:** Did the inquiry turn into an actual order?  
**Logic:** Match `crm_mes_inquiries.customer_name` against new invoices in `fp_actualcommon` after `closed_at` date  
**Where it shows:** Admin dashboard "Conversion Rate" KPI  

> *"Conversion rate this quarter: 34% (11 of 32 closed inquiries generated an invoice within 60 days)"*

**Endpoint:** `GET /api/crm/stats/conversion-rate`

---

## 7. UX Standards to Apply Everywhere (No New Features — Just Fixes)

These come directly from the dashboard design principles and apply to all existing CRM pages:

- **Every KPI needs a comparison** — never show `AED 142K` alone; always show vs target or vs LY
- **Alert = What + Why + What to do** — update all existing warning messages to follow this
- **Max 5 alerts** — if > 5 exist, rank by revenue impact and show top 5 only
- **Stale data label** — show "Last updated: 2 hours ago" on any cached data
- **Empty state messaging** — replace blank panels with actionable prompts, e.g., *"No open inquiries — ready to create one?"*

---

## 8. Admin Dashboard — Team Overview Panel

**What:** Admin/Manager sees a table of all rep groups with:
- This month sales vs budget
- Active inquiry count
- Declining customer count
- Last activity date

**Data sources:** All existing tables, all existing endpoints — just aggregate per `sales_rep_group_name`  
**Note:** Admin and CRM dashboards share ~80% logic — consolidate into shared `<DashboardShell />` to eliminate duplication (currently duplicated)

---

---

# SECTION 2 — AFTER
### Requires new infrastructure · AI/LLM integration · Future build

---

## A. AI Forecast Confidence Score

**What:** Each rep's monthly forecast gets a % confidence based on *their own* historical close rates by stage.  
**Requires:** 12+ months of closed inquiry history (win/loss tagged) to train patterns  
**Output:** *"Your forecast: AED 160K — AI confidence: 74%. Lower than usual — 3 top deals have had no activity in 10+ days."*

**Build after:** 6 months of tracked inquiry data (win/loss outcomes consistently logged)

---

## B. Deal DNA — "Does this deal look like a winner?"

**What:** Compare active inquiries against historical won deals across dimensions: company size, industry, stage timing, engagement cadence.  
**Requires:** ML model trained on won/lost history + structured deal attributes  
**Output:** *"This inquiry matches 71% of your typical wins — right industry, right timing, engaged correctly."*

**Build after:** Win/loss tagging in place + sufficient history (min 100 closed inquiries)

---

## C. Customer Sentiment Detection

**What:** Read emails and call notes to detect tone shifts and flag deals drifting negative.  
**Requires:** Email integration (IMAP/OAuth) + NLP/LLM API call per thread  
**Output:** *"Sentiment on TechCorp dropped last 2 weeks — language suggests budget pressure."*

**Build after:** Email logging infrastructure + LLM API (OpenAI / Azure OpenAI)

---

## D. AI-Written Follow-Up Drafts

**What:** After a meeting or stage change, AI drafts the follow-up email based on inquiry notes + what worked in similar past deals.  
**Requires:** LLM API + structured meeting notes + deal context  
**Output:** Draft email ready to review/send inside the inquiry detail view  

**Build after:** LLM integration + email send capability from the app

---

## E. Best Time to Reach Out (Per Rep)

**What:** AI learns from logged activity when *this specific rep* gets best engagement rates.  
**Requires:** Activity logging (calls, emails, meetings with timestamps + outcomes)  
**Output:** *"Your Thursday morning calls have 2x higher meeting conversion. You have 3 follow-ups due — schedule them Thursday?"*

**Build after:** Activity log table + 3+ months of outcome-tagged activity data

---

## F. Objection Playbook

**What:** AI builds a personal objection library from call notes and emails — and tells you what worked.  
**Requires:** Structured call notes + LLM extraction + outcome tagging  
**Output:** *"Most common objection: 'We need to review internally.' In your 6 wins, you booked a follow-up within 3 days every time."*

**Build after:** Call notes feature + LLM integration

---

## G. What-If Simulator

**What:** Interactive scenario tool — drag a deal out of the month, forecast updates live.  
**Requires:** Pipeline valuation (`estimated_value` on all inquiries) + quota data in system  
**Output:** *"If you lose your top 2 deals, you end the month at 61% of target."*

**Build after:** `estimated_value` field added + budget/quota linked to each rep in system  
**Note:** This is actually close — just needs `estimated_value` field + a UI component. Mid-term, not far future.

---

## H. Competitive Radar

**What:** Flag when a competitor is mentioned across active deals.  
**Requires:** Structured competitor list + NLP scan of notes/emails  
**Output:** *"Competitor X mentioned in 3 active deals this month. Your win rate vs them: 40%."*

**Build after:** Competitor master list + email/note scanning infrastructure

---

## I. Meeting Quality Score

**What:** After each logged meeting, auto-score it on 4 criteria: next step set, decision maker present, notes logged, follow-up sent within 24h.  
**Requires:** Meeting log feature (currently absent) + reminder/follow-up tracking  
**Output:** Score tracked over time, rep can see if meeting quality is improving

**Build after:** Meeting log feature is implemented

---

---

## Summary Table

| Feature | Section | Effort | Value |
|---|---|---|---|
| Customer Declining Alert | NOW | Low | High |
| Dormant Account (White Space) | NOW | Low | High |
| Stagnant Inquiry Badge | NOW | Low | High |
| Rep Performance Cards | NOW | Medium | High |
| Pipeline Summary Card | NOW | Medium | High |
| Inquiry → Invoice Conversion | NOW | Medium | High |
| UX Standards (comparisons, alerts) | NOW | Low | Medium |
| Admin Team Overview Panel | NOW | Medium | Medium |
| AI Forecast Confidence | AFTER | High | High |
| Deal DNA | AFTER | Very High | High |
| Customer Sentiment | AFTER | Very High | Medium |
| AI Follow-Up Drafts | AFTER | High | Medium |
| Best Time to Reach Out | AFTER | High | Low |
| Objection Playbook | AFTER | Very High | Medium |
| What-If Simulator | AFTER | Medium | High |
| Competitive Radar | AFTER | High | Medium |
| Meeting Quality Score | AFTER | Medium | Medium |

---

*This document replaces CRM_IMPLEMENTATION_PLAN.md (January 2026 — outdated theoretical spec)*
