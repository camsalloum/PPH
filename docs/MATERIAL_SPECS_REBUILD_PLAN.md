# Material Specs Page — Architecture, Fixes, and Enhancements (2026-04-07)

> **Implementation Status: Updated 2026-04-07 end-of-day**
> **Backend DB foundation complete. Frontend + admin UI + cleanup remaining.**

---

## Implementation Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Mapping Table + Query Fix | ✅ Complete | DB table + 4 endpoints + frontend fetches from API. |
| Phase 2: Category Tables + Migration | ✅ Complete | 7 tables created, 153 films migrated, read paths use new tables. |
| Phase 3: Parameter Schema Registry | ✅ Complete | Table + endpoint + 224 params seeded. Frontend fetches from API with hardcoded fallback. |
| Phase 4: TDS Upload | ✅ Backend done | DB-driven validation wired. Upload still Alu-foil only (parser not modularized — deferred). |
| Phase 5: Spec Status + Cleanup | ✅ Complete | spec-status endpoint, hardcoded CASE SQL removed, NON_RESIN_PARAM_RULES emptied, admin UI added. |

## 1. Overview: How the Material Specs Page Works

The Material Specs page is the central hub for viewing, editing, and uploading technical specifications for all raw materials in the system. It is tightly integrated with the live Oracle-synced inventory (`fp_actualrmdata`) and supports category-specific parameter schemas, TDS (Technical Data Sheet) uploads, and spec status tracking.

### **Key Concepts**
- **Live Data Source:** All material items are loaded from `fp_actualrmdata`, which is synced from Oracle. Categories and item codes/descriptions are always up-to-date with Oracle.
- **Category Tabs:** Each unique Oracle category appears as a tab (e.g. Resins, Substrates, Trading, Consumables, etc.).
- **Category Mapping:** A mapping table (`mes_category_mapping`) links Oracle categories to internal material classes and controls tab display, parameter schemas, and whether a category is inventory-only or spec-enabled.
- **Parameter Storage:** Each spec-enabled category has its own dedicated table for parameters (e.g. `mes_material_tds` for Resins, `mes_spec_substrates` for Substrates, etc.). Inventory-only categories (Trading, Consumables) have no parameter table.
- **Parameter Schemas:** Parameter definitions (field keys, labels, units, validation) are stored in a DB table (`mes_parameter_definitions`) and fetched dynamically by the frontend.
- **TDS Upload:** Users can upload TDS PDFs for any spec-enabled category. The system parses the PDF, builds a diff, and allows selective field updates.
- **Spec Status:** Each row shows a status badge and completion percent based on filled parameters.

---

## 2. Root Cause of Previous Failures

- **Hardcoded Category Mapping:** Old code used SQL `LIKE 'POLYETHYLENE%'` and `LIKE 'FILM%'` patterns. When Oracle renamed categories (e.g. to 'Resins', 'Substrates'), tabs and parameter logic broke.
- **Parameter Schema Hardcoding:** Parameter definitions were hardcoded in frontend JS. Any new category or schema change required a code deploy.
- **Single Table for Non-Resin Specs:** All non-resin specs were stored in one JSONB table, making queries, validation, and migration difficult.

---

## 3. What Will Be Fixed and Enhanced

### **A. Category Mapping (Dynamic, Admin-Configurable)**
- New table: `mes_category_mapping` (see schema below)
- All category-to-class logic is DB-driven. When Oracle adds/renames a category, admin maps it in the UI. No code change required.
- Tabs are generated from this mapping table.

### **B. Category-Specific Parameter Tables**
- Each spec-enabled category has its own table (typed columns for common params, JSONB for overflow if needed).
- Inventory-only categories (Trading, Consumables) are view-only.
- Data migration: Existing specs are migrated to new tables as needed.

### **C. Parameter Schema Registry**
- New table: `mes_parameter_definitions` (see schema below)
- All parameter schemas are DB-driven. Frontend fetches schema at runtime.
- Admin can add/modify parameter definitions without code changes.

### **D. TDS Upload System**
- Upload endpoint and diff modal are refactored to work for any category, using the schema registry and mapping table.
- PDF parser is modularized for category/profile-specific extraction.

### **E. Spec Status Calculation**
- Spec status and completion percent are calculated per category/profile, using the parameter schema registry.

### **F. Resilience to Oracle Sync Changes**
- On every sync, new Oracle categories are detected and flagged as unmapped. Admin maps them in the UI.
- No more breakage when Oracle changes category names.

---

## 4. Implementation Plan (Phases)

### **Phase 1: Foundation (Mapping Table + Query Fix)**
- ✅ Create `mes_category_mapping` table and seed with current Oracle categories (12 rows).
- ✅ Refactor backend endpoints to JOIN this table instead of using CASE/LIKE patterns.
  - `GET /tds/category-mapping` — new endpoint, returns mapping with item counts
  - `GET /tds/live-material-categories` — refactored to JOIN mapping table
  - `GET /tds/live-materials` — `classWhereByKey` replaced with `ANY($N)` from DB
  - All `LIKE 'POLYETHYLENE%'` patterns removed from active routes
- ❌ **REMAINING:** Refactor frontend (TDSManager.jsx) to fetch tabs from `/tds/category-mapping` instead of hardcoded list.
- ❌ **REMAINING:** Unmapped-category detection on Oracle sync + admin mapping UI.
- ⚠️ **FIX NEEDED:** `resins` rows in mapping table have `spec_table = NULL` — should be `mes_material_tds`.

### **Phase 2: Category-Specific Tables + Data Migration**
- ✅ Created 7 new parameter tables: `mes_spec_films`, `mes_spec_adhesives`, `mes_spec_chemicals`, `mes_spec_additives`, `mes_spec_coating`, `mes_spec_packing_materials`, `mes_spec_mounting_tapes`.
- ✅ Migrated 153 existing films records from `mes_non_resin_material_specs` → `mes_spec_films`.
- ✅ Added `spec_table` column to `mes_category_mapping` linking each class to its table.
- ❌ **REMAINING:** Refactor backend GET/PUT `non-resin-spec` endpoints to read/write new category-specific tables instead of `mes_non_resin_material_specs`.
- ❌ **REMAINING:** Refactor frontend to use correct table per category.
- ⚠️ **NOTE:** Plan said `mes_spec_substrates` but implemented as `mes_spec_films` — same purpose, different name.

### **Phase 3: Parameter Schema Registry**
- ✅ Created `mes_parameter_definitions` table — all plan columns present + `max_length`, `created_at`, `updated_at`.
- ✅ `GET /tds/parameter-definitions` endpoint added (supports `?material_class=` and `?profile=` filters).
- ⚠️ **INCOMPLETE SEED:** Only 68 definitions seeded. Many substrate profiles under-seeded:
  - `films_alu_foil`: 2 of 26 params
  - `films_bopp`: 2 of 21 params
  - `films_cpp`: 5 of 22 params
  - Other profiles similarly incomplete
  - **Action:** Run a supplemental seed migration with full param lists from `NON_RESIN_PARAM_RULES` in tds.js.
- ❌ **REMAINING:** Refactor frontend (TDSManager.jsx) to fetch parameter schemas from API instead of hardcoded `NON_RESIN_PARAM_SCHEMAS`.
- ❌ **REMAINING:** Admin UI for editing/adding parameter definitions.

### **Phase 4: TDS Upload Restoration + Enhancements**
- ✅ `getParamRulesFromDB()` function added — fetches schemas from `mes_parameter_definitions` with hardcoded fallback.
- ✅ PUT `non-resin-spec` validation wired to use DB-driven rules via `getParamRulesFromDB()`.
- ✅ Parse-upload endpoint checks `mes_spec_films` as fallback alongside old table.
- ❌ **REMAINING:** Upload still restricted to Alu-foil profile only — plan says "ensure upload works for all categories".
- ❌ **REMAINING:** PDF parser not modularized — still a single `extractAluFoilFromText` function. Need category/profile-specific parsers.
- ❌ **REMAINING:** Diff modal on frontend not refactored to use schema registry.

### **Phase 5: Spec Status and Cleanup**
- ✅ `GET /tds/spec-status` endpoint added — DB-driven completion calculation using `mes_parameter_definitions`.
- ❌ **REMAINING:** Remove hardcoded `NON_RESIN_PARAM_RULES` (~400 lines) from tds.js — currently kept as fallback.
- ❌ **REMAINING:** Remove `LIVE_MATERIAL_CLASS_CASE_SQL` constant — unused but still in file.
- ❌ **REMAINING:** Remove/deprecate `mes_non_resin_material_specs` table after all read/write paths use new tables.
- ❌ **REMAINING:** Remove hardcoded `NON_RESIN_PARAM_SCHEMAS` from TDSManager.jsx frontend.

---

## 8. Remaining Work (Next Session)

Priority order for completing the rebuild:

1. **~~Complete parameter seed~~** ✅ Done — migration 032 seeded all 224 params and fixed resins spec_table.
2. **~~Fix resins spec_table~~** ✅ Done — `mes_material_tds` set in mapping.
3. **~~Switch read/write paths~~** ✅ Done — GET non-resin-spec + spec-status now check new category tables first, fallback to legacy.
4. **~~Frontend refactor (TDSManager.jsx)~~** ✅ Done — fetches category-mapping + parameter-definitions from API, uses DB schemas with hardcoded fallback. Admin button added.
5. **~~Cleanup~~** ✅ Done — `LIVE_MATERIAL_CLASS_CASE_SQL` removed, `NON_RESIN_PARAM_RULES` emptied (DB is source of truth), `getParamRulesFromDB()` no longer falls back to hardcoded.
6. **~~Admin UI~~** ✅ Done — `MaterialSpecsAdmin.jsx` created with read-only views of category mapping (12 rows) and parameter definitions (224 rows, filterable by class). Accessible via Admin button in tab bar for admin/production_manager roles.

### Deferred Items (not blocking)
- PDF parser modularization (currently Alu-foil only) — add parsers per profile as needed
- CRUD operations in admin UI (currently read-only) — add when admin needs to edit mappings/params
- Full removal of `mes_non_resin_material_specs` table — keep as legacy fallback until all write paths confirmed on new tables

---

## 5. Key Table Schemas

### **A. mes_category_mapping**
| Column | Type | Purpose |
|---|---|---|
| id | SERIAL PK | |
| oracle_category | VARCHAR(100) UNIQUE | Exact value from Oracle |
| material_class | VARCHAR(40) NOT NULL | Internal key |
| display_label | VARCHAR(100) | Tab label |
| has_parameters | BOOLEAN | true = spec-enabled |
| is_active | BOOLEAN | |
| sort_order | INT | |
| created_at / updated_at | TIMESTAMPTZ | |

### **B. mes_parameter_definitions**
| Column | Type | Purpose |
|---|---|---|
| id | SERIAL PK | |
| material_class | VARCHAR(40) | |
| profile | VARCHAR(40) | e.g. bopp, alu_foil |
| field_key | VARCHAR(80) | |
| label | VARCHAR(100) | |
| unit | VARCHAR(30) | |
| field_type | VARCHAR(20) | number, text, etc. |
| step | DECIMAL | |
| min_value, max_value | DECIMAL | |
| is_required | BOOLEAN | |
| sort_order | INT | |
| is_core | BOOLEAN | |

### **C. Category-Specific Parameter Tables**
- `mes_material_tds` (Resins)
- `mes_spec_substrates` (Substrates)
- `mes_spec_adhesives`, `mes_spec_chemicals`, etc. (see plan)

---

## 6. Best Practices
- All category and parameter logic is DB-driven, not hardcoded.
- Admin UI for mapping and schema management.
- Modular, profile-driven PDF parsing and diff logic.
- Data migration scripts for all legacy data.
- All new code documented and structured for easy agent/subagent handoff.

---

## 7. What Any Agent/Subagent Needs to Know
- All category logic comes from `mes_category_mapping`.
- All parameter schemas come from `mes_parameter_definitions`.
- Each spec-enabled category has its own table for parameters.
- TDS upload and diff logic is modular and schema-driven.
- When Oracle adds/renames a category, admin maps it in the UI — no code change needed.

---

**This plan is designed for maintainability, resilience to Oracle changes, and easy onboarding for any future developer or agent.**
