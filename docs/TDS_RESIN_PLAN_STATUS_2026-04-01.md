# Resin TDS Plan Status (Updated 2026-04-02)

## Direction Update (2026-04-02)
- Resin TDS is now constrained to Resin-only scope based on business clarification.
- Film properties and process templates are deferred to the future Production module.
- Active execution plan moved to: `docs/RESIN_TDS_STRICT_SCOPE_PLAN_2026-04-02.md`.

## Objective
Stabilize Resin TDS so Resin Core data is clean and protected, while deferring film-converted properties to a dedicated Film Parameters module.

## Initial Scope From This Chat
- Use resin_library baseline for resin records.
- Protect curated values from sync overwrite.
- Allow edits only for admin, production_manager, quality_control.
- Keep sales_manager read-only.
- Pilot one resin first, then continue.
- Support PDF upload with review modal and apply-selected flow.
- Compare parsed values vs DB before update.
- Show remaining resin list from fp_actualrmdata for staged uploads.

## Completed
- Role and write access policy implemented (admin, production_manager, quality_control write; sales_manager read-only).
- Sync-protection logic implemented with user_locked_fields behavior.
- Pilot completed for FB5600 (source import + PDF enrichment + lock updates).
- PDF parser improved for Borouge and Exxon-style formats.
- Upload flow fixed so PDF diff modal opens immediately from detail view (not only after returning to library).
- Resin list aligned with live fp_actualrmdata linkage in TDS listing (live_rm_only behavior).
- Data Source card removed from detail/edit UI as requested.
- UI alignment improvements applied in library/detail tables.
- Remaining resin upload list generated from fp_actualrmdata and saved.
- Resin Core mode applied in Edit TDS:
  - Film-converted edit fields removed from active editing flow.
  - Film tab converted to deferred placeholder.
  - PDF diff modal filtered to resin-core fields only.
  - Over-strict required rules relaxed (Supplier and Grade remain required; core technical fields now optional).
- Film Parameters backend foundation implemented:
  - New table `mes_tds_film_parameters` created via migration 019.
  - Backfill from existing `mes_material_tds` film-converted columns completed.
  - Dedicated API routes added for read/update/unlock:
    - `GET /api/mes/master-data/tds/:id/film-parameters`
    - `PUT /api/mes/master-data/tds/:id/film-parameters`
    - `PATCH /api/mes/master-data/tds/:id/film-parameters/unlock-fields`
  - Migration execution verified (current backfill snapshot: 29 rows in film table, 22 with optical values).
- Parser and upload diff split implemented by domain:
  - Extracted values are now divided into `resin_core` and `film` domains.
  - Upload response now returns `resinDiff`, `filmDiff`, and domain-tagged combined `diff`.
- Frontend PDF apply flow is now dual-routed:
  - Resin Core fields apply via `PUT /api/mes/master-data/tds/:id`.
  - Film fields apply via `PUT /api/mes/master-data/tds/:id/film-parameters`.
  - Diff modal now shows target module tag per field.
- Film Parameters UI module activated in Edit TDS:
  - Tab 4 now has full editable film fields and process type.
  - Film values are persisted to dedicated film API on save.
- Detail view film section now reads from Film Parameters API with legacy fallback.
- Validation/helper tooling added:
  - New script: `server/scripts/validate-tds-domain-split.js`
  - NPM command: `npm run verify:tds-domain-split`
  - Latest validator run: total TDS=39, film rows=29, missing backfill=0, status=PASS.

## Current Resin Core (Active)
- Identity: supplier, grade, main item, resin/catalyst/comonomer/process.
- Core rheology: mfi, hlmi, melt flow ratio, density, melting/vicat, melt temp range.
- Additives and compliance: additive package, stabilizer/uv, food contact, tnpp.
- Reference resin durability fields: escr_value, escr_condition.

## Deferred To Film Parameters Module (Next Phase)
- Optical: haze, gloss.
- Mechanical film metrics: dart drop, tear md/td, tensile md/td, elongation md/td, puncture metrics, secant md/td.
- Sealing and surface: seal init/peak, hot tack, cof static/kinetic/config.

## Remaining Work
- Decide process-specific templates (blown film, cast film, molded) for film metrics.
- Add regression tests for:
  - upload modal immediate display,
  - dual-domain diff and apply routing,
  - lock-field protection,
  - role-based edit restrictions.
- Execute staged PDF upload for remaining resin grades and verify parsed coverage per supplier format.

## Operational Notes
- Parser still extracts both resin and film-like fields, but apply routing is now module-aware and writes to the correct destination API.
- Existing legacy film columns remain as fallback display only; active writes are now directed to `mes_tds_film_parameters`.
