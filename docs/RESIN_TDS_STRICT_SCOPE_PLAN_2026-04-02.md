# Resin TDS Strict Scope Plan (2026-04-02)

## 1) Direction Lock (Business Rule)
Resin TDS will contain only resin-level properties.
Film properties are deferred to the future Production module (finished product specs).

This means:
- Upload parser for Resin TDS keeps only resin properties.
- Resin View/Edit screens show only resin parameters.
- All non-resin fields are removed from Resin TDS flows now.

## 2) Canonical Resin Property Set (for all resin PDFs)
Confirmed against your direction, the Resin Core property set is:

- density (kg/m3 or g/cm3 converted to kg/m3)
- mfr_190_2_16 (g/10min)
- mfr_190_5_0 (g/10min)
- hlmi_190_21_6 (g/10min)
- mfr_230_2_16_pp (g/10min, PP only)
- melting_temp_dsc (C)
- crystalline_melting_point (C)
- vicat_softening_temp (C)
- heat_deflection_temp (C)
- escr_f50_hours (hours)
- escr_condition (for example 10% Igepal, F50%, ASTM D1693-B)
- brittleness_temp (C)
- bulk_density (kg/m3)
- flexural_modulus (MPa)

Per-parameter test methods are retained when present in the PDF:
- density_test_method
- mfr_190_2_16_test_method
- mfr_190_5_0_test_method
- hlmi_190_21_6_test_method
- mfr_230_2_16_pp_test_method
- melting_temp_dsc_test_method
- crystalline_melting_point_test_method
- vicat_softening_temp_test_method
- heat_deflection_temp_test_method
- escr_test_method
- brittleness_temp_test_method
- bulk_density_test_method
- flexural_modulus_test_method

Derived metric policy:
- melt_flow_ratio is optional derived display only (not part of strict source-truth parameter set).

Identity fields kept for traceability (not resin properties, but required metadata):
- supplier_id
- brand_grade
- oracle_item_code
- resin_type
- category / cat_desc
- source_name, source_url, source_date
- notes

## 3) Fields Removed From Resin TDS Now
All fields below are removed from Resin TDS parser/UI/API write flow and deferred to Production module:

- Film mechanics: tear_md, tear_td, tensile_yield_md, tensile_yield_td, tensile_break_md, tensile_break_td, elongation_md, elongation_td, secant_modulus, secant_modulus_td, puncture_force, puncture_energy
- Film optics and sealing: haze, gloss, dart_drop, seal_init_temp, seal_peak_strength, hot_tack_temp, hot_tack_strength, cof_static, cof_kinetic, cof_config
- Resin additive package details: slip_type, slip_ppm, antiblock_type, antiblock_pct, antistatic_type, antistatic_ppm, processing_aid, processing_aid_pct, stabiliser, stabiliser_notes, tnpp_free
- Compliance and advanced placeholders not needed in Resin TDS now: food_contact, food_contact_reg, uv_stabilised, viscosity_curve_avail, ext_viscosity_avail, dsc_avail, advanced_data_ref

## 4) UI Plan (View + Edit)
### Library view
Keep columns only for:
- Status
- Main Item
- Grade
- Supplier
- MFR (190C/2.16kg)
- HLMI (190C/21.6kg)
- Density
- Melting Temp (DSC)
- Vicat Softening
- ESCR

### Detail view
Keep sections only for:
- Header identity block
- Resin physical properties card (from Section 2)
- Attachments
- Source metadata

Remove from detail:
- Mechanical Properties - Film table
- Film source tags/fallback labels

### Edit view
Reduce to 2 tabs:
- Identity
- Resin Properties

Remove tabs:
- Additives
- Film Parameters
- Compliance
- Advanced

## 5) Parser + Upload Diff Plan
- Keep parser extraction only for Section 2 fields.
- Remove domain split behavior from Resin upload response.
- Upload response returns one diff list: resinDiff only.
- Diff modal labels and apply route become Resin-only.
- Ignore film lines in PDF parsing (do not persist, do not show in diff).
- Ignore processing-condition lines (barrel/die zones) in strict Resin parameter extraction.

## 6) API Contract Plan
### Keep
- GET /api/mes/master-data/tds
- GET /api/mes/master-data/tds/:id
- POST /api/mes/master-data/tds
- PUT /api/mes/master-data/tds/:id
- POST /api/mes/master-data/tds/:id/attachments

### Change
- POST attachments returns only resin fields and resin diff.
- PUT /tds/:id accepts/writes only keep-list fields.

### Defer/Disable for now
- /tds/:id/film-parameters endpoints unmounted from active Resin UI flow.
- Keep code/table only as transitional archive until Production module starts.

## 7) Data Deletion Strategy (safe but aligned to your request)
### Stage A (now)
- Hard-remove non-resin fields from UI and parser/application flow.
- Stop writing non-resin fields in Resin endpoints.

### Stage B (same sprint, after backup)
- Backup non-resin historical values to archive table or JSON snapshot.
- Remove non-resin columns from active Resin write allowlist.

### Stage C (start of Production module)
- Move archived film/additive/compliance fields into Production domain model.
- Drop deprecated Resin columns and old transitional routes.

## 8) Regression Coverage (includes earlier items from image 3)
### Backend tests
- Parser tests: only resin fields extracted from mixed PDF text.
- Upload route tests: response includes resin-only diff.
- Locking tests: locked resin fields are not overwritten.
- Role tests: only write roles can apply updates.
- Variant tests: correct capture for 190/2.16, 190/5.0, 190/21.6, and 230/2.16 (PP) patterns.

### Frontend tests
- Upload opens diff modal immediately.
- Diff modal contains only resin fields.
- Apply selected updates sends only Resin PUT payload.
- Re-upload same file shows no unnecessary diff.

### Defer from earlier plan
- Process-specific film templates (blown/cast/injection) are moved to Production module backlog, not Resin TDS.

## 9) Execution Milestones
- M1: Scope lock and field whitelist signoff (same day)
- M2: Backend parser/API resin-only implementation
- M3: UI cleanup (view/edit) to resin-only
- M4: Regression tests pass (backend + frontend smoke)
- M5: Staging UAT with 3-5 supplier resin PDFs
- M6: Production rollout and monitoring

## 10) Acceptance Criteria
A release is accepted only if:
- Resin View/Edit shows only approved Resin Core fields.
- Upload of resin PDF never writes film/additive/compliance fields.
- Diff modal shows only resin fields.
- All new tests pass.
- Existing resin workflows (create/edit/verify/attachments) remain functional.

## 11) Risks and Controls
- Risk: historical data loss during deletion.
  - Control: mandatory archive snapshot before dropping old columns.
- Risk: hidden dependencies on removed fields.
  - Control: grep-based dependency audit + targeted smoke tests.
- Risk: user confusion during transition.
  - Control: release note stating "Resin TDS is now strict resin-only; film specs move to Production module."

## 12) Production Module Backlog Seed (for later)
When Production module starts, create a dedicated Finished Film Spec entity linked to:
- finished_sku
- recipe/formulation
- process type (blown/cast/injection)
- line/machine condition set

Film parameters and process-specific templates belong there, not in Resin TDS.
