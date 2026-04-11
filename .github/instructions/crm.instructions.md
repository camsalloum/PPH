---
description: "Use when working on CRM module: customers, contacts, deals, field visits, worklist, prospects, sales rep activities, travel reports, lost business analysis."
applyTo: ["src/components/CRM/**", "server/routes/crm/**", "server/services/crm*"]
---
# CRM Module Context

## Structure
- **76 frontend components** in `src/components/CRM/`
- **20 backend route files** in `server/routes/crm/`: activities, analytics, bulk, calls, contacts, customers, dashboard, deals, email-drafts, email-templates, emails, field-trips, index, lost-business, meetings, products, prospects, tasks, technical-briefs, worklist-preferences
- **Business logic**: `server/services/crmService.js`, `server/services/crmCacheService.js`, `server/services/crmActivityLogger.js`

## Key Tables (all in `fp_database`)
- `fp_customer_unified` — master customer records (merged from Oracle + local)
- `fp_prospects` — prospect pipeline
- `crm_activities` — activity log (calls, meetings, emails, tasks)
- `crm_deals` — deal/opportunity tracking
- `crm_calls`, `crm_emails`, `crm_notes`, `crm_tasks` — activity subtypes
- `crm_sales_reps` — sales rep profiles and targets
- `crm_field_trips` — field visit planning/execution
- `crm_field_trip_stops` — individual stops within a trip
- `crm_travel_reports` — post-trip AI-analyzed travel reports

## Field Trip Lifecycle
1. **Planning** → rep creates trip with stops (customers/prospects)
2. **Approval** → manager approves trip plan
3. **In-Trip** → rep executes, captures meeting briefs per stop (text-first, conditional for visited only)
4. **Travel Report** → rep-owned AI analyze/apply flow: generates tasks + reminders, manager gets info notification (no approval gate)
5. **Settlement** → expense claims against approved trips

## Key Patterns
- **Customer merging**: AI-powered duplicate detection in `server/services/CustomerMergingAI.js` — uses NLP (natural, double-metaphone, string-similarity)
- **Cache**: `crmCacheService.js` uses tiered TTL — SHORT 60s, MEDIUM 300s, LONG 1800s, VERY_LONG 3600s (via `server/middleware/cache.js`)
- **Dashboard dedup**: CRM sub-components fetch independently — known tech debt (TD-025). Don't add more duplicate fetches.
- **Access roles**: `CRM_FULL_ACCESS_ROLES` (admin, manager, sales_manager, sales_coordinator) vs sales reps who see only their own data

## History
- See `docs/_backup/CRM_FULL_AUDIT.md`, `CRM_DATA_FLOW_AND_ARCHITECTURE.md` for deep architecture docs
- Customer merge system: `docs/_backup/CUSTOMER_MERGE_SYSTEM_COMPLETE_ARCHITECTURE.md`
