---
description: "Use when working on master data management: AEBF budgets, product groups, raw materials, Oracle sync, customer merging, sales rep management, or pricing."
applyTo: ["src/components/MasterData/**", "server/routes/masterData.js", "server/routes/aebf/**", "server/routes/aebf-*.js", "server/routes/rm-sync*", "server/routes/oracle-direct*"]
---
# Master Data Module Context

## Structure
- **Frontend**: `src/components/MasterData/` — AEBF/ (budget tabs), CustomerMerging, SalesRep management
- **Backend**: `server/routes/aebf/` (8 files), `server/routes/masterData.js`, `server/routes/customerMaster.js`
- **Oracle sync**: `server/routes/rm-sync/` (raw materials), `server/routes/oracle-direct/` (actual sales)

## AEBF Data Model
AEBF = Actual, Estimate, Budget, Forecast — the four data types in the MIS module.

| Data Type | Source | Table |
|-----------|--------|-------|
| Actual | Oracle ERP sync | `fp_actualcommon` (via `fp_raw_oracle` staging) |
| Budget | Manual import/entry | `fp_budget_unified` |
| Estimate | Manual entry | `fp_budget_unified` (type='estimate') |
| Forecast | Generated | `fp_budget_unified` (type='forecast') |

## Oracle Sync (2 locations)
1. **RM Sync** (`/api/rm-sync/*`) — raw materials data. Requires VPN (FortiClient). Syncs to `fp_actualrmdata`.
2. **Oracle Direct** (`/api/oracle-direct/*`) — actual sales data. Syncs `fp_raw_oracle` → processes into `fp_actualcommon`.
- Sync timestamps stored as UTC ISO, displayed in company timezone (via `src/utils/companyTime.js`)
- Company timezone from `company_settings.company_timezone` (IANA validated, e.g., `Asia/Dubai`)

## Raw Materials
- Dashboard: `src/components/dashboard/RawMaterials.jsx`
- Product groups: `src/components/dashboard/ProductGroupMasterData.jsx`, `RawProductGroups.jsx`
- RBAC: requires `production_manager` role or designation level ≥ 6
- Server-side cache in `FPDataService.js` for raw product groups
- Combined endpoint: `GET /api/fp/master-data/raw-product-groups/combined`

## Product Group Pricing
- Tab in AEBF area for managing group-level pricing
- Linked to `fp_budget_unified` data

## Key Patterns
- Budget imports use Excel (xlsx/exceljs libraries)
- `UAEDirhamSymbol.jsx` for AED currency display — never render dirham as text
- Tab persistence in sessionStorage: `pph.masterData.activeTab`, `pph.productGroup.activeTab`
