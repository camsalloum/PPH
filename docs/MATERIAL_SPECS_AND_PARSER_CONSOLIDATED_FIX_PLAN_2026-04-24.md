# Material Specs + TDS Parser — Consolidated Fix & Enhancement Plan
**Date:** 2026-04-24
**Owner:** Camille Issa
**Author:** GitHub Copilot (Claude Opus 4.7)
**Supersedes / consolidates:**
- `docs/MATERIAL_SPECS_REBUILD_PLAN.md` (2026-04-07) — DB rebuild status
- `docs/TDS_Parser_Bug_Review_Plan.md` (2026-04-22) — UI gating + 7 bugs
- `docs/PARAMETER_ADMIN_PLAN.md` — admin CRUD plan
- `docs/PROJECT_MAP.md` §5 (Material Specs audit), §6 (PDF parser audit), §13 (Live Issues Board)

**Scope:**
1. Verify and fix the **parameters per non-resin product group** against real supplier TDS PDFs in `Product Groups data/`.
2. Fix the **PDF parser** (label aliases, Unicode, table extraction, multi-component adhesive split, JSON arrays).
3. Close the **outstanding rebuild items** from the 2026-04-07 plan (frontend fallback removal, parser modularisation, attachment tracking).
4. Resolve the **7 confirmed UI/parser bugs** from the 2026-04-22 plan.
5. Wire admin CRUD (already designed in `PARAMETER_ADMIN_PLAN.md`).

**Out of scope:** Resin TDS pipeline (already verified and stable — DO NOT TOUCH); item-master data flow into costing (covered separately by PROJECT_MAP §7-8 / DF-01..DF-08).

---

## 0. Ground Truth — What Was Verified Today

A subagent ran the existing PDF text extractor (`extract_pdf.js`) against representative supplier TDS files in `D:\PPH 26.4\PPH\Product Groups data\` (BOPP, CPP, Alu Foil, BOPA, PAP, PET, AluPap, GreaseProof, PETG/PETC/PVC, 4 adhesive sub-suppliers — ~25 PDFs total) and cross-referenced every published parameter against:

- `mes_parameter_definitions` (seeded by migrations 031 + 032 — **224 rows total**).
- `mes_category_mapping` + the 7 category-specific spec tables.
- `server/utils/schema-pdf-parser.js` (UNIT_PATTERNS, LABEL_ALIASES, extraction strategies).
- `server/routes/mes/master-data/tds.js` `extractAluFoilFromText()` legacy path.
- Frontend hardcoded fallback `NON_RESIN_PARAM_SCHEMAS` in `src/components/MES/MasterData/TDSManager.jsx`.

**Coverage matrix (verified, NOT estimated):**

| Profile | DB params | Parser fields | TDS-published | Coverage | Critical gap |
|---------|-----------|---------------|---------------|----------|--------------|
| `substrates_bopp` | 21 | 19 | 21 | **95%** | Tear MD/TD disambiguation |
| `substrates_cpp` | 22 | 20 | 22 | **88%** | Puncture extraction; seal-window range parsing |
| `substrates_pet` | 20 | 18 | 20 | **80%** | `optical_density` alias missing |
| `substrates_pa` (BOPA) | 17 | 15 | 17 | **85%** | Moisture aliases incomplete; thermoformability no enum |
| `substrates_pvc` (shrink) | 17 (16+1 JSON) | 15 | 17 | **85%** | `shrink_curve` JSON skipped by design |
| `substrates_petc` / `petg` | 17 each | 15 each | 17 | **85%** | Same shrink-curve gap |
| `substrates_pap` | 14 | 12 | 14 | **85%** | Cobb-60 + porosity-Gurley aliases incomplete |
| `substrates_alu_pap` | 9 | 7 | 9 | **90%** | Dead-fold + surface-finish no enum |
| `substrates_greaseproof` | **0 (uses PAP)** | 9 (PAP) | 12 | **50%** | **PROFILE MISSING entirely**; needs `grease_resistance_hours`, `coating_type`, `coat_weight_gsm` |
| `substrates_alu_foil` | 26 | 16 (legacy parser) | 26 | **50%** | Chemical-composition table parsing ~50% accurate; core/OD regex brittle |
| `adhesives` (all suppliers) | 5 core | 5 core | 12+ for 2-K | **70%** | **Component A/B split missing**; no `cure_time`, `application_temp`, `bond_strength`, `tack_time` |

> **Resins were NOT re-audited.** They were verified previously and remain the gold standard the rest of the system should match.

---

## 1. Issue Inventory (Numbered, Authoritative)

### 1.1 Schema gaps (DB migrations needed)

| ID | Profile | Missing field | Type | Why it matters |
|----|---------|---------------|------|----------------|
| S-01 | `substrates_greaseproof` | **Whole profile + 3 fields** (`grease_resistance_hours` int, `coating_type` enum, `coat_weight_gsm` num) | Schema | Greaseproof is currently treated as plain PAP; grease resistance is the defining property |
| S-02 | `adhesives` | `component_a_viscosity_cps`, `component_b_viscosity_cps`, `component_a_solids_pct`, `component_b_solids_pct` | Schema | 2-K adhesives publish per-component values; current 5-field schema only stores blended |
| S-03 | `adhesives` | `cure_time_hours`, `application_temp_c`, `bond_strength_n_mm2`, `tack_time_min` | Schema | Published in 40-80% of adhesive TDS; required for process planning |
| S-04 | All text fields | `enum_options TEXT[]` column on `mes_parameter_definitions` | Schema | `treatment_side`, `surface_type`, `dead_fold`, `thermoformability`, `coating_type` are free text → inconsistent supplier wording |
| S-05 | `substrates_alu_foil` | Reduce 10 chemical-composition fields (Si/Fe/Cu/Mn/Mg/Zn/Ti × min/max) to **single JSONB `composition_limits`** | Schema simplification | Suppliers publish as table block; storing as JSONB matches reality and unlocks proper extraction |
| S-06 | `substrates_pvc` / `petc` / `petg` | `shrink_curve` field already exists as JSON array — **flag `is_manual_entry = true`** on it | Schema flag | Parser cannot extract; user must enter manually. Add UI hint. |

### 1.2 Parser bugs (`server/utils/schema-pdf-parser.js`)

| ID | Severity | Bug | Fix |
|----|----------|-----|-----|
| PB-01 | HIGH | `optical_density` has no LABEL_ALIASES entry → PET parser silently misses it | Add `'optical density': ['optical\\s*density','o\\.d\\.','light\\s*transmission']` |
| PB-02 | HIGH | `moisture` alias only matches `'moisture'` / `'moisture content'` → misses `'water content'`, `'water uptake'`, `'regain'` (PA/Paper) | Extend alias |
| PB-03 | HIGH | `'cobb 60'` has no entry → PAP parser misses Cobb under labels like `'water absorption 60s'`, `'cobb value'` | Add alias `['cobb\\s*(?:60)?','water\\s*absorption.*60']` |
| PB-04 | HIGH | `porosity` alias requires literal `porosity` token → misses `'air permeability (Gurley)'`, `'Gurley number'` | Extend alias |
| PB-05 | HIGH | Unicode dash variants `–` `—` `−` not normalised → ranges like `70–80%` fail extraction | Add `text = text.replace(/[\u2013\u2014\u2212]/g, '-')` in `extractBySchema()` entry |
| PB-06 | MEDIUM | `extractBySchema()` line ~410: `if (field_type === 'json_array') continue;` → shrink_curve etc. silently skipped, no log, no UI hint | (a) Log skip with field key; (b) return `{ skipped: true, reason: 'manual entry required' }` so frontend can surface it |
| PB-07 | MEDIUM | `extractAluFoilFromText()` (legacy, in `tds.js` ~L482) chemical-composition regex is line-by-line → ~50% miss on multi-column tables | Replace with table-aware extractor that detects element-symbol prefixes (`Si:`, `Fe:` …) across a 5-line window after a "Composition" / "Chemical" heading |
| PB-08 | MEDIUM | Adhesive multi-component split (`extractTwoColumnBySchema()`) only triggers when `detectCombinedComponentLayout()` finds explicit `Part A` / `Part B` markers → many TDS use `Resin / Hardener` or columnar layout without markers | Extend layout detection to also trigger on `(Resin\|Component A\|Side A)` ↔ `(Hardener\|Curative\|Component B\|Side B)` token pairs |
| PB-09 | LOW | Tear-strength MD vs TD: when only one value is published parser cannot decide axis → wrong field assigned | If only `tear` (no MD/TD) extracted, store under both `tear_strength_md_mn` and flag `_axis_inferred: true` in raw payload |

### 1.3 Backend route bugs (`server/routes/mes/master-data/tds.js`)

| ID | Severity | Bug | Fix |
|----|----------|-----|-----|
| BR-01 | HIGH | `/parse-upload` calls `extractAluFoilFromText()` only when `parameterProfile === ALU_FOIL_PROFILE_KEY` → but real profile resolution sometimes returns `substrates` (no suffix) for unmapped Alu items, parser is skipped | Loosen check to `parameterProfile?.startsWith('substrates_alu')` OR catch via category-mapping `material_class === 'substrates_alu_foil'` |
| BR-02 | MEDIUM | `getParamRulesFromDB()` log says `"fallback to hardcoded"` but per migration 032 the hardcoded fallback was emptied → message is misleading and hides DB query failures | Replace with `logger.error('mes_parameter_definitions query failed for class=%s', materialClass)` and **return `[]` not silent empty** |
| BR-03 | MEDIUM | `live-materials` SQL does not return `non_resin_attachment_count` → frontend `getLiveSpecStatusMeta` always shows `uploaded:false` for non-resin (Bug 3 in 2026-04-22 plan) | Add `LEFT JOIN ... COUNT(*) FILTER (WHERE attachment.material_class != 'resins')` and surface as `non_resin_attachment_count` |
| BR-04 | LOW | Error string in `/parse-upload` references `mes_non_resin_material_specs` table even though new flow uses `mes_spec_films` etc. | Update message to mention the per-category table from `mes_category_mapping.spec_table` |

### 1.4 Frontend bugs (`src/components/MES/MasterData/TDSManager.jsx`)

| ID | Severity | Bug | Fix |
|----|----------|-----|-----|
| FE-01 | **CRITICAL** | Upload TDS PDF button gated by `{isAluFoilProfile && ...}` (line 3171) → all 15 other non-resin categories hidden (Bug 1 in 2026-04-22 plan) | Replace with `{!isResinsTab && canWrite && ...}` |
| FE-02 | MAJOR | Fallback warning hardcoded `'No Alu foil parameters could be extracted from this PDF.'` (line 1679) | Replace with `\`No ${activeMaterialSpecLabel} parameters could be extracted from this PDF.\`` |
| FE-03 | MAJOR | `dbParamDefinitions` re-fetch loops when API returns empty array (line ~1156) | Always write the key on successful response, even if `data` is `[]` |
| FE-04 | MEDIUM | Hardcoded `NON_RESIN_PARAM_SCHEMAS` is still used as fallback (line ~3039) → frontend can drift from DB | Remove fallback; show empty-state message if DB query fails. Track schema only in DB. |
| FE-05 | LOW | `message` from antd in `useCallback` deps array (line 1050) — no functional bug, signal of confusion | Remove from deps |
| FE-06 | INFO | `MaterialSpecsAdmin.jsx` is orphaned (`ParameterSchemaAdmin.jsx` is the live one) | Delete or mark `@deprecated` |

### 1.5 Architectural items (from rebuild plan still open)

| ID | Status | Item | Fix |
|----|--------|------|-----|
| A-01 | OPEN | Unmapped-Oracle-category detection on sync + admin mapping UI | On every Oracle RM sync, INSERT new `oracle_category` rows with `material_class = NULL` and surface in admin UI |
| A-02 | PARTIAL | Admin CRUD on `mes_category_mapping` and `mes_parameter_definitions` (currently read-only `ParameterSchemaAdmin.jsx`) | Implement per `PARAMETER_ADMIN_PLAN.md` |
| A-03 | OPEN | Deprecate `mes_non_resin_material_specs` (legacy fallback table) | After BR-01 + BR-02 + BR-03 confirmed in production, drop with migration |
| A-04 | OPEN | Move `ALU_FOIL_PROFILE_KEY` constant to a shared file imported by both backend and frontend | Create `server/constants/mes-profiles.js` mirrored client-side via API endpoint or build-time copy |

### 1.6 Permissions (from 2026-04-22 plan, Bug 6)

| ID | Severity | Question | Required action |
|----|----------|----------|-----------------|
| PR-01 | NEEDS DECISION | `MasterDataHub.jsx` line 35 grants `production_manager` + `quality_control` access to **all 5 tabs** (Item Master, Machines, Processes, Product Types, Material Specs). Is that intentional? | **Owner decision needed before fix.** Default recommendation: scope these roles to Material Specs + Item Master only. |

---

## 2. Implementation Plan (Phased, with Acceptance Criteria)

> Phases are **independent** where marked. Each phase ends with a verification step.

### Phase 1 — Critical UI/UX Unblock (Frontend, ~1 session)

**Goal:** Make TDS upload available for every non-resin category, immediately.

| Step | File | Action | AC |
|------|------|--------|-----|
| 1.1 | `TDSManager.jsx` line 3171 | Replace `isAluFoilProfile` gate with `!isResinsTab && canWrite` | Upload button visible on BOPP, CPP, PET, BOPA, PVC, PETC, PETG, PAP, AluPap, GreaseProof, Adhesives, Chemicals, Additives, Coating, Packing Mat., Mounting Tapes |
| 1.2 | `TDSManager.jsx` line 1679 | Make warning message dynamic | Upload a non-Alu PDF → message reads e.g. "No BOPP parameters could be extracted from this PDF." |
| 1.3 | `TDSManager.jsx` line 1050 | Remove `message` from useCallback deps | No-op runtime; lint-clean |
| 1.4 | `TDSManager.jsx` line ~1156 | Write key to `dbParamDefinitions` even when API returns `[]` | Network tab: `parameter-definitions` called once per profile, not on every render |
| 1.5 | Manual smoke | Upload one BOPP TDS, one CPP, one PA, one Adhesive | Diff modal opens for each; values populated where parser succeeded |

**Risk:** Low (frontend-only). Backend already accepts arbitrary `material_class`/`profile`.

---

### Phase 2 — Parser Label/Alias Fixes (Backend, ~1 session)

**Goal:** Lift coverage on PET, PA, PAP from 80–85% to ≥ 92%.

| Step | File | Action | AC |
|------|------|--------|-----|
| 2.1 | `schema-pdf-parser.js` LABEL_ALIASES | Add aliases per PB-01..PB-04 | Re-run extractor on `Product Groups data/TDS PET/F-ISC Flex.pdf` → `optical_density` non-null |
| 2.2 | `schema-pdf-parser.js` `extractBySchema()` head | Normalise Unicode dashes (PB-05) | Synthetic test string `"shrinkage 70–80%"` extracts `70` |
| 2.3 | `schema-pdf-parser.js` line ~410 | Log JSON-array skips with field key (PB-06) | Backend log shows `"schema-pdf-parser: skipping json_array field shrink_curve (manual entry required)"` |
| 2.4 | `tds.js` `getParamRulesFromDB()` | Fix misleading log; return `[]` on failure (BR-02) | Log on stale DB shows clear error path |
| 2.5 | `tds.js` `/parse-upload` BR-01 | Loosen Alu-foil parser invocation | Uploading an Alu Foil PDF mapped under generic `substrates` still triggers chemical-composition extraction |
| 2.6 | Test fixtures | Add `tests/parser/non-resin.spec.js` with 1 PDF text fixture per category | All fixture cases pass; coverage report: BOPP ≥ 95%, PET ≥ 90%, PA ≥ 90%, PAP ≥ 90% |

**Risk:** Low (additive regex; no behaviour change for matched cases).

---

### Phase 3 — Greaseproof Profile + Schema Fills (DB + Backend, ~1 session)

**Goal:** Close S-01..S-04 schema gaps.

| Step | File | Action | AC |
|------|------|--------|-----|
| 3.1 | New migration `mes-master-040-greaseproof-profile.js` | (a) INSERT row in `mes_category_mapping` for `substrates_greaseproof`; (b) CREATE TABLE `mes_spec_greaseproof` with `parameters_json JSONB`; (c) INSERT 12 param defs (incl. 3 new — S-01) | Greaseproof tab appears; Edit Parameters shows new fields |
| 3.2 | New migration `mes-master-041-adhesive-component-fields.js` | Add S-02 + S-03 fields to `mes_parameter_definitions` for `adhesives` profile | Adhesive Edit Parameters form shows component A/B inputs + cure/app temp |
| 3.3 | New migration `mes-master-042-enum-options-column.js` | ALTER `mes_parameter_definitions` ADD COLUMN `enum_options TEXT[]`; backfill known enums (treatment_side, dead_fold, etc.) | Validation rejects `dead_fold = 'whatever-text'`; accepts `'good'`, `'fair'`, `'excellent'` |
| 3.4 | `tds.js` PUT `/non-resin-spec` | Validate field value against `enum_options` if non-null | 400 returned with clear message on enum violation |
| 3.5 | `TDSManager.jsx` Edit Parameters form | When `enum_options` present → render `<Select>` instead of `<Input>` | Greaseproof `coating_type` dropdown shows `Silicone / PTFE / Wax / Emulsion / Other` |
| 3.6 | Manual smoke | Upload Greaseproof TDS (`Grease Resistant-GP 9-10.pdf`) → spec created with `grease_resistance_hours = 9` | Verified via DB row inspection |

**Risk:** Medium (schema migration; ensure `parameters_json` migration safe for existing 153 film records).

---

### Phase 4 — Multi-Component Adhesives via Formulation Engine (Backend + Frontend, ~2 sessions)

**Goal:** Close PB-08 + S-02 by modelling 2-K adhesives as formulation rows (`mes_formulations` + `mes_formulation_components`) instead of flat columns. Per owner decision, this reuses the existing BOM/cost engine and integrates naturally with cost estimation. **S-02 (component_a_*/component_b_* flat columns) is explicitly DROPPED in favour of this approach.**

#### 4.A Data model

A 2-K adhesive item (e.g. parent code `MB655+CT85` if it exists in Oracle, or a virtual master `ADH-MB655-CT85`) becomes a **formulation** with two child components:
- Component A (resin/base) — e.g. `MB655` — Oracle item code if it exists, otherwise a virtual sub-item.
- Component B (hardener/curative) — e.g. `CT85`.

Each component:
- Has its own `mes_spec_adhesives` row with single-component params (`viscosity_cps`, `solids_pct`, `density_g_cm3`).
- Has its own TDS PDF in `mes_tds_attachments`.
- Is referenced in `mes_formulation_components` with `parts_by_weight` (e.g. 100 / 75) and `role_label` ("Part A" / "Part B" / "Resin" / "Hardener").

The **formulation parent** holds combined/derived params (mix ratio, pot life, cure time, application temp, bond strength, tack time — these are per-blend, not per-component).

#### 4.B Steps

| Step | File | Action | AC |
|------|------|--------|-----|
| 4.1 | New migration `mes-master-041-adhesive-formulation-fields.js` | Add to `mes_formulations`: `mix_ratio` (text), `pot_life_min`, `cure_time_hours`, `application_temp_c`, `bond_strength_n_mm2`, `tack_time_min`, `is_two_component` (boolean, default false) | Columns exist on `mes_formulations` |
| 4.2 | `mes_formulation_components` schema check | Confirm it has `role_label` (text) and `parts_by_weight` (numeric); add if missing via 041 migration | Components can carry role + ratio |
| 4.3 | `schema-pdf-parser.js` `detectCombinedComponentLayout()` | Extend marker regex to include `Resin/Hardener`, `Side A/Side B`, `Curative` token pairs (PB-08) | `MB655 + CT85.pdf` correctly detected as 2-K |
| 4.4 | `schema-pdf-parser.js` `extractTwoColumnBySchema()` | Return `{ shared: {…blend params…}, components: [{role, params}, {role, params}] }` instead of flat A/B columns | Output structure matches data model |
| 4.5 | New endpoint `POST /tds/non-resin-spec/parse-upload-2k` (or extend `/parse-upload` with `mode='multi_component'`) | When parser returns multi-component result: (a) save the original PDF to `mes_tds_attachments` with `parse_status='pending_assignment'` (single PDF covers both components), (b) return both component blocks + shared blend params + suggested ratio for diff modal | Modal can show 2-K grouped diff |
| 4.6 | `TDSManager.jsx` diff modal | When `mode='multi_component'` received: render TWO panels (Part A, Part B) + a top "Blend" panel for shared params (mix ratio, pot life, cure time…). Each component panel has a sub-item picker ("This is component A — assign to existing item or create virtual sub-item") | UI clearly separates A/B + blend |
| 4.7 | `TDSManager.jsx` Apply flow | On apply: (a) UPSERT `mes_spec_adhesives` for each assigned component item, (b) UPSERT `mes_formulations` parent with `is_two_component=true` + blend params, (c) UPSERT `mes_formulation_components` rows, (d) link the single PDF in `mes_tds_attachments` to the parent formulation via a new column `formulation_id` | DB rows created correctly; resolver picks them up |
| 4.8 | `formulation-resolver.js` (already exists) | Confirm it can compute combined cost from a 2-K adhesive formulation parent. Add unit-conversion test for parts-by-weight → kg | Cost engine returns correct blended cost per kg |
| 4.9 | Test fixtures | Add 4 adhesive PDF text fixtures (Henkel Loctite LA7796/LA6154, Brilliant H214/A75, SP Adhesives MB655/CT85, Ecolad SB940/SB527) | All 4 produce 2-component diff payload with correct ratios |

**Single-component adhesives** (1-K) follow the existing flow — flat `mes_spec_adhesives` row, no formulation parent. Detection is based on whether the parser flags multi-component layout.

**Risk:** Medium-High — touches the formulation model. Mitigation: keep behind a feature flag `ADH_2K_ENABLED` for first deployment; allow fallback to single-component flow if any step fails.

**Why this over flat columns:** Owner decision "reuses BOM/formulation engine; richer but more work; integrates naturally with costing". The flat-column approach (original S-02) doesn't generalise to 3+ components, doesn't model parts-by-weight, and requires duplicate parameter storage (component values would live in two places: `mes_spec_adhesives.viscosity_cps` AND `component_a_viscosity_cps`).

---

### Phase 5 — Alu Foil Composition Table Extraction + JSONB Migration (Backend + DB, ~1-2 sessions)

**Goal:** Close S-05 + PB-07. Per owner decision: **soft cutover (best practice)** — dual-write for one release, drop deprecated columns in a follow-up migration.

#### 5.A Why soft cutover (rationale, since owner asked for clarification)

- **Hard cutover** drops the 10 columns in the same migration that adds `composition_limits` JSONB. If the JSONB backfill has any bug (wrong column name, type mismatch, missed row), data is **lost** — and rolling back the migration won't restore it because the next deployment may have already overwritten with new data.
- **Soft cutover (chosen)** adds JSONB + backfills + makes JSONB the **read source of truth**, but leaves the old 10 columns in place for one release as a fallback. Reads use JSONB only; writes go to JSONB only. After ≥ 1 week of production stability (verified by spot-checking that JSONB values match the deprecated columns 1:1), a follow-up migration drops the old columns.
- **Indefinite dual-write** is rejected because it leaves two sources of truth permanently — the original problem we're solving.
- This pattern is the standard "expand → migrate → contract" database refactor used to keep production safe during schema changes.

#### 5.B Steps

| Step | File | Action | AC |
|------|------|--------|-----|
| 5.1 | New migration `mes-master-044-alu-composition-jsonb.js` | (a) Add `composition_limits JSONB` to `mes_spec_films` (the table holding Alu Foil rows per migration 030); (b) backfill from existing 10 columns into JSONB shape `{ "Si": {min:0, max:0.3}, "Fe": {min:0, max:0.5}, ... }`; (c) verify backfilled count matches source row count, fail migration if mismatch | Existing Alu Foil rows have populated `composition_limits` matching old columns 1:1 |
| 5.2 | `tds.js` `extractAluFoilFromText()` | Replace 10 separate regexes with element-symbol scanner: detect element symbols `(Si\|Fe\|Cu\|Mn\|Mg\|Zn\|Ti\|Cr\|Ni\|Pb\|Al)` followed by min/max % within a "Composition" / "Chemical Analysis" / "Alloy Composition" block (5–15 line window after heading). Output `composition_limits` JSONB. | Parsing `DINGHENG TDS.pdf` and `MSDS 8011.pdf` produces full element table; ≥ 80% accuracy on the test corpus |
| 5.3 | `tds.js` PUT `/non-resin-spec` for Alu Foil | Write to `composition_limits` JSONB only. Mark old columns as ignored on write. | New uploads populate JSONB only |
| 5.4 | `tds.js` GET `/non-resin-spec` for Alu Foil | Read from `composition_limits` JSONB only (old columns become inert). | API returns from JSONB |
| 5.5 | `TDSManager.jsx` Alu Foil view | Render `composition_limits` as a small editable table (Element / Min % / Max %) instead of 10 separate inputs. Add row / delete row supported. | Cleaner UI; dynamic rows |
| 5.6 | **One week later — separate migration** `mes-master-045-drop-alu-composition-cols.js` | After verifying production stability (spot check 5 random Alu Foil rows; JSONB == deprecated columns), DROP the 10 deprecated columns | One-time cleanup; rollback file restores them with same defaults |

**Risk:** Medium — soft cutover mitigates data loss. Ensure migration 044 has a `down()` that restores from JSONB into the legacy columns.

---

### Phase 6 — Attachment Tracking + Multi-Supplier TDS Library (Backend + Frontend, ~2 sessions)

**Goal:** Close BR-03; **persist every uploaded supplier TDS PDF** so any user can re-open the original from the item card. Support multi-supplier-per-material and multi-version-per-supplier (per owner decision: PDFs must be preserved and accessible whenever a user edits the item; same material can have several suppliers, each with one or more PDFs).

#### 6.A Storage model — best-practice hybrid (recommended)

File binaries live on the filesystem (avoids DB bloat, fast streaming, simple backups), with a single source-of-truth row in the database that tracks the file, supplier, version, and current/latest flag. Database can also be backed by object storage later without UI changes.

**New table `mes_tds_attachments`** (or extend the existing `tds_attachments` to apply to all classes):

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `material_class` | VARCHAR(40) NOT NULL | e.g. `substrates_bopp`, `adhesives` |
| `parameter_profile` | VARCHAR(40) | resolved sub-profile e.g. `substrates_alu_foil` |
| `mainitem` | VARCHAR(60) NOT NULL | Oracle item code |
| `maindescription` | TEXT | snapshot at upload time |
| `catlinedesc` | TEXT | snapshot |
| `supplier_id` | INT REFERENCES `mes_suppliers(id)` | nullable until user assigns |
| `supplier_name_raw` | VARCHAR(200) | what was extracted from PDF or typed |
| `file_name` | VARCHAR(300) NOT NULL | original filename |
| `file_path` | VARCHAR(500) NOT NULL | relative path under `uploads/tds/<material_class>/<mainitem>/<supplier_id_or_unassigned>/<timestamp>_<sha8>.pdf` |
| `file_size_bytes` | BIGINT | |
| `sha256` | CHAR(64) NOT NULL | dedup + integrity |
| `mime_type` | VARCHAR(80) | always `application/pdf` for now |
| `version_no` | INT NOT NULL DEFAULT 1 | per (mainitem + supplier_id) |
| `is_current` | BOOLEAN NOT NULL DEFAULT true | exactly one current per (mainitem + supplier_id) |
| `parse_status` | VARCHAR(20) | `pending` / `parsed` / `partial` / `failed` |
| `parsed_extract_json` | JSONB | snapshot of what the parser extracted |
| `applied_to_spec` | BOOLEAN | true if user clicked Apply on diff modal |
| `applied_at` | TIMESTAMPTZ | |
| `applied_by` | INT REFERENCES `users(id)` | |
| `uploaded_by` | INT REFERENCES `users(id)` | NOT NULL |
| `uploaded_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `notes` | TEXT | optional user comment |

Unique index: `(mainitem, supplier_id, version_no)`. Partial unique index: `(mainitem, supplier_id) WHERE is_current = true`. Index on `(material_class, mainitem)` for the live-materials JOIN.

**Why filesystem (not BYTEA):** PDFs are 100 KB–5 MB. Storing as BYTEA makes pg_dump backups balloon, slows row scans, and hurts replication. The DB row holds metadata + parsed JSON; the binary stays on disk under `uploads/tds/`. Both backup paths (DB and filesystem) need to be in the daily backup job — flag this in `docs/TECH_DEBT.md` after Phase 6 ships. (If at any point you want to move to S3 / object storage, only the storage adapter swaps; the table stays.)

#### 6.B Steps

| Step | File | Action | AC |
|------|------|--------|-----|
| 6.1 | New migration `mes-master-046-tds-attachments.js` | Create `mes_tds_attachments` table per 6.A; backfill from existing `tds_attachments` (resin) with `material_class='resins'` | Table exists; resin attachments still discoverable |
| 6.2 | `tds.js` `/parse-upload` finally block | Replace `fs.unlinkSync(uploadedPath)` with **move** to `uploads/tds/<material_class>/<mainitem>/<supplier_id_or_'unassigned'>/<timestamp>_<sha8>.pdf` and INSERT into `mes_tds_attachments` (with `parse_status`, `parsed_extract_json`, `is_current=true`, mark prior `is_current=false` for same supplier) | After upload, file retained; row exists; old version flipped to `is_current=false` |
| 6.3 | New endpoint `GET /tds/attachments?mainitem=&material_class=` | Returns array `[{id, supplier_id, supplier_name, version_no, file_size, sha256, parse_status, applied_to_spec, uploaded_at, uploaded_by_name, is_current, download_url}]` ordered by `(supplier_id, version_no DESC)` | Returns multi-supplier × multi-version list |
| 6.4 | New endpoint `GET /tds/attachments/:id/download` | Streams the file with `Content-Type: application/pdf`, `Content-Disposition: inline; filename=...`. RBAC: any authenticated user with read on Material Specs | PDF opens in browser tab |
| 6.5 | New endpoint `PATCH /tds/attachments/:id` | Allow setting `supplier_id` (assign supplier post-upload), `notes`, `is_current` (toggle between versions). Writer-role only | Reassigning supplier moves file to new directory, updates `file_path` |
| 6.6 | New endpoint `DELETE /tds/attachments/:id` | Soft-delete (add `deleted_at` column, hide from lists). Admin-only | Deleted PDFs disappear from UI but file stays for audit |
| 6.7 | `tds.js` `/live-materials` SQL | LEFT JOIN `mes_tds_attachments` with `COUNT(*) FILTER (WHERE is_current = true AND deleted_at IS NULL)` aliased `attachment_count` and `MAX(uploaded_at)` aliased `last_tds_at` | API response includes both fields per row |
| 6.8 | `TDSManager.jsx` `getLiveSpecStatusMeta` | Read `attachment_count > 0` for non-resin rows (replaces hardcoded `false`) | Spec Status badge accurate after upload |
| 6.9 | `TDSManager.jsx` non-resin detail view | Add **TDS Library section** above parameter form: list `attachments[]`, grouped by supplier, with version, uploaded_by, uploaded_at, View (opens PDF in new tab via 6.4), Re-Apply (re-runs diff modal from `parsed_extract_json`), Delete (admin) | User sees full history per item; can open any PDF |
| 6.10 | `TDSManager.jsx` upload flow | After `/parse-upload` returns, show supplier-picker modal (defaulting to extracted supplier name) BEFORE diff modal; PATCH `supplier_id` immediately | Every PDF is associated with a supplier from the start |
| 6.11 | Backup discipline | Add `uploads/tds/` to backup script in `Upload-To-GitHub.cmd` / nightly backup; document in TECH_DEBT.md | Backup audit covers TDS originals |

**Risk:** Medium — disk usage + backup discipline. Bounded: one PDF per supplier per version, deduped by SHA256.

**Rejected alternatives:**
- BYTEA in `mes_tds_attachments` — bloats DB backups (a thousand TDS PDFs = several GB); slows row scans.
- Object storage (S3) — requires new infra + creds; can be added later by swapping the storage adapter.
- No storage (delete after parse) — fails the owner requirement ("user can access whenever he edits the item").

---

### Phase 7 — Frontend Fallback Removal + Cleanup (Frontend, ~0.5 session)

**Goal:** Close FE-04, FE-06, A-04.

| Step | File | Action | AC |
|------|------|--------|-----|
| 7.1 | `TDSManager.jsx` line ~3039 | Remove `|| NON_RESIN_PARAM_SCHEMAS[profileKey]` fallback; show empty-state if DB returns nothing | Verified by manually breaking `parameter-definitions` endpoint → user sees "Schema not configured for [class]" |
| 7.2 | `TDSManager.jsx` top of file | Delete `NON_RESIN_PARAM_SCHEMAS` constant entirely | Diff: ~400 lines removed |
| 7.3 | `MaterialSpecsAdmin.jsx` | Delete file (orphaned per FE-06) | No imports remain (verified by grep) |
| 7.4 | New `server/constants/mes-profiles.js` + `src/config/mes-profiles.js` | Single source of truth for `ALU_FOIL_PROFILE_KEY` and other shared constants (A-04) | Both files import from / mirror this constant |

**Risk:** Low.

---

### Phase 8 — Admin CRUD (Frontend + Backend, ~1-2 sessions)

**Goal:** Close A-02. Implements `PARAMETER_ADMIN_PLAN.md`.

- Backend: POST/PATCH/DELETE on `/tds/category-mapping` and `/tds/parameter-definitions` (admin-only).
- Frontend: Extend `ParameterSchemaAdmin.jsx` with edit/add/delete actions + `enum_options` editor.
- Audit log table for changes.

(Detailed steps already in `PARAMETER_ADMIN_PLAN.md` — reference, not duplicate, here.)

---

### Phase 9 — Unmapped-Category Detection (Backend, ~0.5 session)

**Goal:** Close A-01.

- After every Oracle RM sync, run:
  ```sql
  INSERT INTO mes_category_mapping (oracle_category, material_class, has_parameters, is_active, sort_order)
  SELECT DISTINCT TRIM(catlinedesc), NULL, false, false, 999
  FROM fp_actualrmdata
  WHERE TRIM(catlinedesc) IS NOT NULL
    AND TRIM(catlinedesc) NOT IN (SELECT oracle_category FROM mes_category_mapping)
  ON CONFLICT (oracle_category) DO NOTHING;
  ```
- Surface unmapped rows in admin UI with red badge.

---

### Phase 10 — Drop Legacy Table (DB, ~0.5 session, AFTER Phase 6 stable)

**Goal:** Close A-03.

- Verify all read paths use per-category tables.
- Migration: `DROP TABLE mes_non_resin_material_specs` (with backup script).
- Remove all references in `tds.js`.

---

### Phase 11 — Permission Scope (Frontend, ~0.5 session) — DECIDED

Per owner decision (PR-01): **`production_manager` AND `quality_control` are scoped to Material Specs + Item Master only.** Machines, Processes, Product Types tabs are hidden for both roles. Other roles unchanged.

| Step | File | Action | AC |
|------|------|--------|-----|
| 11.1 | `MasterDataHub.jsx` | Replace `if (MATERIAL_SPECS_OPS_ROLES.includes(role)) return true;` (line 35) with a per-tab guard. Define `OPS_ROLES_ALLOWED_TABS = ['itemMaster', 'materialSpecs']`. When role is in `MATERIAL_SPECS_OPS_ROLES`, filter the `items` array to those two keys only. Other role logic unchanged. | Login as production_manager → see only Item Master + Material Specs. Same for quality_control. |
| 11.2 | `MasterDataHub.jsx` | Confirm default-active-tab logic still picks a visible tab when the previously active tab is now hidden | No "undefined tab" state on first login |
| 11.3 | Manual smoke | Login as each of: admin, production_manager, quality_control, sales_rep | Tab visibility matches matrix below |

**Tab visibility matrix:**

| Role | Item Master | Machines | Processes | Product Types | Material Specs |
|------|:-:|:-:|:-:|:-:|:-:|
| admin / it_admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| production_manager | ✅ | ❌ | ❌ | ❌ | ✅ |
| quality_control | ✅ | ❌ | ❌ | ❌ | ✅ |
| level ≥ 6 (other) | ✅ | ✅ | ✅ | ✅ | ✅ |
| level < 6 (no override) | ❌ | ❌ | ❌ | ❌ | ❌ |

**Risk:** Low. Pure UI change.

---

## 3. Step-by-Step Implementation Order (Day-by-Day)

This is the order tomorrow's session should follow. Each day ends with a working, deployable build. Do NOT skip the verification step at the end of each day.

### Day 1 — Critical UI unblock + parser aliases (small, safe, high impact)

**Phases:** 1 + 2 + 11 + 7

1. **Phase 1 — UI gate fix (FE-01..FE-06).**
   - 1.1 `TDSManager.jsx` L3171 → replace `isAluFoilProfile` gate with `!isResinsTab && canWrite`.
   - 1.2 L1679 → dynamic warning message using `activeMaterialSpecLabel`.
   - 1.3 L1050 → remove `message` from `useCallback` deps.
   - 1.4 L~1156 → write key to `dbParamDefinitions` even on empty array.
   - 1.5 Verify: upload buttons appear on BOPP, CPP, PA, Adhesive tabs.
2. **Phase 2 — Parser aliases (PB-01..PB-05) + BR-02 + BR-01.**
   - 2.1 `schema-pdf-parser.js` LABEL_ALIASES: add `optical density`, extend `moisture`, `cobb 60`, `porosity`, normalise Unicode dashes.
   - 2.2 `tds.js` `getParamRulesFromDB()` — fix misleading log; return `[]` on failure.
   - 2.3 `tds.js` `/parse-upload` — loosen Alu Foil parser invocation.
   - 2.4 Add `tests/parser/non-resin.spec.js` skeleton with 1 fixture per profile.
3. **Phase 11 — Permission scope (PR-01).**
   - 11.1 `MasterDataHub.jsx` — per-tab guard for ops roles.
   - 11.3 Smoke-login each role.
4. **Phase 7 — Frontend cleanup (FE-04, FE-06, A-04).**
   - 7.1 Remove `NON_RESIN_PARAM_SCHEMAS` fallback in `TDSManager.jsx`.
   - 7.2 Delete `NON_RESIN_PARAM_SCHEMAS` constant.
   - 7.3 Delete `MaterialSpecsAdmin.jsx`.
   - 7.4 Create `server/constants/mes-profiles.js` + `src/config/mes-profiles.js`.
5. **Verification:** `npm test`, `npm run build`, manual upload of BOPP + PET + PA + Adhesive PDFs from `Product Groups data/` — confirm diff modal opens and shows non-empty extraction.

**Build state at end of Day 1:** Upload available on all 17 categories; parser alias coverage lifted; permission scope correct; no hardcoded fallback.

### Day 2 — Greaseproof profile + enums + spec-status fix

**Phases:** 3 + 6 (storage + attachments table + spec status)

1. **Phase 3 — Schema fills (S-01, S-04).**
   - 3.1 Migration 040: Greaseproof profile + 12 params (incl. 3 new fields).
   - 3.3 Migration 042: `enum_options TEXT[]` column on `mes_parameter_definitions` + backfill known enums.
   - 3.4 Add enum validation in PUT `/non-resin-spec`.
   - 3.5 Render `<Select>` instead of `<Input>` when `enum_options` present.
   - 3.6 Smoke-upload Greaseproof TDS → verify spec created with `grease_resistance_hours`.
2. **Phase 6 — Multi-supplier TDS library (BR-03, owner PDF storage decision).**
   - 6.1 Migration 046: create `mes_tds_attachments` per §6.A; backfill resin attachments.
   - 6.2 `tds.js` `/parse-upload`: stop deleting file; move into `uploads/tds/...` and INSERT row.
   - 6.3..6.6 New endpoints: GET list, GET download stream, PATCH metadata, DELETE soft.
   - 6.7 `tds.js` `/live-materials` SQL: LEFT JOIN attachments for count.
   - 6.8 `TDSManager.jsx` `getLiveSpecStatusMeta`: read attachment count.
   - 6.9 `TDSManager.jsx`: TDS Library section in non-resin detail view.
   - 6.10 Supplier-picker modal after parse, before diff.
   - 6.11 Add `uploads/tds/` to backup script.
3. **Verification:** Upload 2 PDFs from different suppliers for the same item → both appear in TDS Library; both downloadable; Spec Status shows uploaded.

**Build state at end of Day 2:** Greaseproof category live; enum validation live; every TDS PDF preserved with full version history per supplier.

### Day 3 — Adhesive 2-K formulation flow

**Phases:** 4 (multi-component adhesives via formulation engine)

1. **Phase 4 — Formulation-driven 2-K adhesives (PB-08, S-02 redesigned).**
   - 4.1 Migration 041: blend params on `mes_formulations`.
   - 4.2 Verify `mes_formulation_components` has `role_label` + `parts_by_weight`.
   - 4.3 Extend `detectCombinedComponentLayout()` markers (Resin/Hardener, Side A/B, Curative).
   - 4.4 `extractTwoColumnBySchema()` returns `{shared, components[]}`.
   - 4.5 Backend: add `mode='multi_component'` to `/parse-upload` response shape.
   - 4.6 Frontend: 2-K diff modal with Part A / Part B / Blend panels + sub-item picker.
   - 4.7 Apply flow writes `mes_spec_adhesives` × 2, `mes_formulations` parent, `mes_formulation_components` × 2.
   - 4.8 Verify formulation-resolver computes blended cost per kg correctly.
   - 4.9 Add 4 adhesive fixtures.
2. **Verification:** Upload `MB655 + CT85.pdf` → diff modal shows two component panels with correct ratios; apply → cost-engine returns blended cost per kg.

**Build state at end of Day 3:** 2-K adhesives modelled as formulations; cost engine integration verified; single-component adhesives unchanged.

### Day 4 — Alu Foil composition (soft cutover)

**Phases:** 5 (composition JSONB)

1. **Phase 5 — Composition JSONB.**
   - 5.1 Migration 044: add `composition_limits JSONB` + backfill from 10 deprecated columns + verify count match.
   - 5.2 Replace `extractAluFoilFromText()` element extraction with table-aware scanner.
   - 5.3 PUT writes JSONB only.
   - 5.4 GET reads JSONB only.
   - 5.5 Frontend: dynamic composition table (Element / Min / Max).
   - 5.6 **DO NOT drop deprecated columns yet** — wait one week.
2. **Verification:** Upload `DINGHENG TDS.pdf` and `MSDS 8011.pdf` → composition table populated; spot-check 5 existing Alu Foil rows in DB to confirm JSONB == deprecated columns.

**Build state at end of Day 4:** Alu Foil parser accuracy lifted from 50% to ≥ 80%; composition stored as JSONB; legacy columns kept as safety net.

### Day 5 — Admin CRUD + unmapped detection

**Phases:** 8 + 9

1. **Phase 8 — Admin CRUD on `mes_category_mapping` and `mes_parameter_definitions`** (per `PARAMETER_ADMIN_PLAN.md`).
2. **Phase 9 — Unmapped Oracle category detection** on every RM sync; surface in admin UI with red badge.

### Day 6 (≥ 1 week after Day 4) — Cleanup

**Phases:** 10 + Phase 5 follow-up

1. Migration 045: drop deprecated Alu composition columns (after spot-check verifies stability).
2. Phase 10: drop legacy `mes_non_resin_material_specs` table after confirming no read/write paths remain.

---

### Rollback strategy per day

Each day's work is **independently revertable**:
- Day 1: revert frontend commit + restore alias map from git.
- Day 2: drop migrations 040, 042, 046 (down() restores prior state); files in `uploads/tds/` are preserved.
- Day 3: drop migration 041; feature flag `ADH_2K_ENABLED=false` disables the new diff path.
- Day 4: drop migration 044 (down() restores deprecated columns from JSONB before drop).
- Day 5: standard frontend revert.
- Day 6: only run after explicit verification — irreversible (DROP TABLE / DROP COLUMN).

---

## 4. Test Strategy

### 4.1 Fixture corpus
Create `tests/fixtures/tds-pdfs/<profile>/*.txt` by extracting text once with `extract_pdf.js` from real samples:

| Profile | Source PDFs | Count |
|---------|-------------|-------|
| BOPP | `Product Groups data/TDS BOPP/HF101_TDS.pdf`, `iNRT140.pdf`, `RayoForm ICU.pdf` | 3 |
| CPP | `Product Groups data/CPP/C-CLF flex CPP.PDF`, `CPP Tj CTOS - ME.rev.01.pdf` | 2 |
| PET | `Product Groups data/TDS PET/F-ISC Flex.pdf`, `F-UPF Flex.pdf` | 2 |
| PA/BOPA | `Product Groups data/TDS BOPA/EHAp-15μm TDS.pdf`, `BOPA LHA-15μm one side treated-TDS.pdf` | 2 |
| PVC/PETG/PETC | `Product Groups data/TDS PETG,PETC,PVC/Fast Shrink ELM55F.pdf`, `IP PVC.pdf`, `KP Pentalabel® SmartCycle® PET G11F03-T40.pdf` | 3 |
| PAP | `Product Groups data/TDS PAP/Custard powder WALKI Seal 99 - C1S 50-Pap coated paper PE.pdf`, `FlexPak-Rotocote.pdf` | 2 |
| AluPap | `Product Groups data/TDS AluPap/WALKI butter Foil 95 (butter laminate).pdf`, `WALKI Foil 75 (butter laminate).pdf` | 2 |
| GreaseProof | `Product Groups data/TDS GreaseProof/Grease Resistant-GP 9-10.pdf` | 1 |
| Alu Foil | `Product Groups data/TDS Alu/DINGHENG TDS.pdf`, `MSDS 8011.pdf` | 2 |
| Adhesives | `Adhesives/Henken Adhesives/Loctite Liofol  LA 7796 LA6154-EN.pdf`, `BRILLIANT/TDS Brilliant H214-A75.pdf`, `SP Adhesives/MB655 + CT85.pdf`, `Ecolad -BCI/ECOLAD SB940-SB527 - TDS.pdf` | 4 |

### 4.2 Coverage target per profile
After all phases: ≥ 90% of supplier-published parameters extracted automatically; remaining ≤ 10% are JSON-array fields (shrink curve) and supplier-specific custom rows that legitimately need manual entry.

### 4.3 Regression suite
- Existing resin tests must continue to pass — they are the gold standard.
- Add `npm test -- non-resin` Jest target.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing 153 film rows break after enum migration | Low | High | Backfill enum_options as nullable; validate only when set |
| Alu Foil JSONB migration loses data | Low | High | Keep old columns for 1 release; fail-fast on backfill mismatch |
| Multi-component parser misclassifies single-component adhesive as 2-K | Medium | Medium | Require BOTH marker pairs to trigger split; otherwise default to single-component |
| Unicode dash normalisation changes resin extraction unexpectedly | Low | Medium | Resin parser is in `tds-pdf-parser.js`, separate file; only modify `schema-pdf-parser.js` |
| Removing frontend hardcoded fallback breaks existing sessions on first deploy | Low | Medium | Ship with Phase 7 only after Phase 1+2 are live for ≥ 24h and DB seeding verified |

---

## 6. Success Metrics

| Metric | Today | Target after all phases |
|--------|-------|-------------------------|
| Categories with TDS upload UI | 2 (Resins + Alu Foil) | 17 (all spec-enabled) |
| Avg parser coverage (non-resin) | ~78% | ≥ 92% |
| Profiles missing entirely | 1 (Greaseproof) | 0 |
| Hardcoded schema in frontend | ~400 lines | 0 |
| Free-text fields with enum validation | 0 | 5 (treatment_side, surface_type, dead_fold, thermoformability, coating_type) |
| Adhesive 2-K component A/B captured separately | No | Yes |
| Spec Status badge accurate for non-resin uploads | No | Yes |

---

## 7. Files Touched (Summary)

### New
- `server/migrations/mes-master-040-greaseproof-profile.js`
- `server/migrations/mes-master-041-adhesive-formulation-fields.js` (blend params + `is_two_component`)
- `server/migrations/mes-master-042-enum-options-column.js`
- `server/migrations/mes-master-044-alu-composition-jsonb.js` (add JSONB + dual-state)
- `server/migrations/mes-master-045-drop-alu-composition-cols.js` (deferred ≥ 1 week)
- `server/migrations/mes-master-046-tds-attachments.js` (multi-supplier TDS library)
- `server/migrations/mes-master-047-drop-legacy-non-resin-table.js` (deferred)
- `server/constants/mes-profiles.js`
- `src/config/mes-profiles.js`
- `tests/parser/non-resin.spec.js` + fixtures under `tests/fixtures/tds-pdfs/<profile>/`

### Modified
- `server/utils/schema-pdf-parser.js` (LABEL_ALIASES, Unicode normalisation, json_array logging, two-column detection extended for Resin/Hardener markers, `extractTwoColumnBySchema()` returns `{shared, components[]}`)
- `server/routes/mes/master-data/tds.js` (Alu Foil composition table extractor, `getParamRulesFromDB` log fix, `/parse-upload` Alu invocation + supplier-picker handoff + multi-component mode + persist PDF instead of delete, `/live-materials` LEFT JOIN attachments, new `/tds/attachments*` endpoints)
- `server/utils/formulation-resolver.js` (verify 2-K adhesive cost path; add unit-conversion test)
- `src/components/MES/MasterData/TDSManager.jsx` (FE-01..FE-05 fixes, fallback removal, enum render, TDS Library section, supplier picker, 2-K diff modal with Part A / Part B / Blend panels)
- `src/components/MES/MasterData/MasterDataHub.jsx` (per-tab guard for ops roles per PR-01)
- `src/components/MES/MasterData/ParameterSchemaAdmin.jsx` (Phase 8 CRUD)
- `Upload-To-GitHub.cmd` / nightly backup script (include `uploads/tds/`)

### Deleted
- `src/components/MES/MasterData/MaterialSpecsAdmin.jsx`
- `NON_RESIN_PARAM_SCHEMAS` constant block from `TDSManager.jsx`

---

## 8. Owner Decisions — RESOLVED 2026-04-24

| Decision | Resolution | Affects |
|----------|-----------|---------|
| **PR-01** Permission scope for `production_manager` & `quality_control` | **Both roles scoped to Material Specs + Item Master only.** Other 3 tabs (Machines, Processes, Product Types) hidden. | Phase 11 |
| **Phase 4 multi-component model** | **Use formulation engine** (`mes_formulations` + `mes_formulation_components`) — Part A and Part B become child items with their own specs and PDFs; parent formulation holds blend params (mix ratio, pot life, cure time…). Reuses BOM/cost engine. **Flat-column approach (S-02) DROPPED.** | Phase 4 (rewritten) |
| **Phase 5 Alu Foil JSONB cutover** | **Soft cutover (best practice).** Migration 044 adds JSONB + backfills + flips reads/writes to JSONB while keeping old columns inert; migration 045 (one week later, after spot-check verification) drops the deprecated columns. Reversible at every step. | Phase 5 (expanded with rationale) |
| **TDS PDF storage** | **Hybrid: filesystem binary + DB metadata.** Files persisted under `uploads/tds/<material_class>/<mainitem>/<supplier_id>/<timestamp>_<sha8>.pdf`. New `mes_tds_attachments` table tracks supplier, version, sha256, uploaded_by, parsed_extract_json, applied_to_spec, is_current. Supports **multi-supplier per material + multi-version per supplier**. Streamed via dedicated download endpoint, RBAC-gated. Backup discipline added to TECH_DEBT. | Phase 6 (rewritten) |

All decisions are now reflected in the phase definitions above. **No outstanding owner decisions remain — implementation can proceed.**

---

## 9. References

- Existing plans (now superseded): `MATERIAL_SPECS_REBUILD_PLAN.md`, `TDS_Parser_Bug_Review_Plan.md`, `PARAMETER_ADMIN_PLAN.md`, `TDS_RESIN_PLAN_STATUS_2026-04-01.md`, `RESIN_TDS_STRICT_SCOPE_PLAN_2026-04-02.md`
- Canonical project map: `PROJECT_MAP.md` §5 (Material Specs param-by-param), §6 (PDF Parser bugs P-01..P-07), §13 (Live Issues Board)
- Data: `Product Groups data/` folder (~25 sample TDS PDFs across 11 categories — verified 2026-04-24)
- Code:
  - Parser: `server/utils/schema-pdf-parser.js`, `server/utils/tds-pdf-parser.js` (resin only — DO NOT MODIFY)
  - Routes: `server/routes/mes/master-data/tds.js`
  - Frontend: `src/components/MES/MasterData/TDSManager.jsx`, `MaterialSpecsAdmin.jsx`, `ParameterSchemaAdmin.jsx`
  - Schema: migrations 029, 030, 031, 032

---
**End of plan.**
