# TDS Upload & Parser Bug Review Plan
**Component:** `TDSManager.jsx` — Material Specs tab (`/mes/master-data`)  
**Scope:** Read-only audit. No code was modified.  
**Date:** 2026-04-22  
**Reviewed files:** MasterDataHub.jsx, TDSManager.jsx, MaterialSpecsAdmin.jsx, ParameterSchemaAdmin.jsx

---

## Summary

The Material Specs page supports two distinct flows depending on the active category: a **Resin** flow (TDS library with PDF upload, field diff, and locking) and a **Non-Resin** flow (parameter forms populated from `NON_RESIN_PARAM_SCHEMAS` or DB definitions). A TDS PDF upload-and-parse pipeline exists for non-resin items and is fully implemented in `handleNonResinUpload`, calling the generic backend endpoint `/api/mes/master-data/tds/non-resin-spec/parse-upload` with `material_class` and `parameter_profile` already passed correctly. However, the **Upload TDS PDF button is conditionally rendered only when `isAluFoilProfile === true`**, which means every other category (BOPP, CPP, PET, adhesives, chemicals, coatings, etc.) silently receives no upload UI at all. All other supporting logic — the diff modal, the auto-apply path, the save payload — is already category-agnostic. This is a one-line gate causing the entire feature gap.

---

## Affected Categories

| Category | Material Class | TDS Upload UI | Parser Supported | Param Schema Defined |
|---|---|---|---|---|
| Resins (PE/PP) | `resins` | ✅ Full flow (separate resin pipeline) | ✅ | ✅ `TECH_PARAM_CONFIG` |
| Alu Foil substrates | `substrates` / `substrates_alu_foil` | ✅ Shown | ✅ | ✅ 24 params |
| BOPP | `substrates_bopp` | ❌ Hidden | ✅ (backend generic) | ✅ 21 params |
| CPP | `substrates_cpp` | ❌ Hidden | ✅ | ✅ 22 params |
| PET / BOPET | `substrates_pet` | ❌ Hidden | ✅ | ✅ 20 params |
| PA / Nylon | `substrates_pa` | ❌ Hidden | ✅ | ✅ 17 params |
| PE Lam | `substrates_pe` | ❌ Hidden | ✅ | ✅ 12 params |
| PVC Shrink | `substrates_pvc` | ❌ Hidden | ✅ | ✅ 16 params |
| PETC / PETG | `substrates_petc/g` | ❌ Hidden | ✅ | ✅ 16 params each |
| Paper / PAP | `substrates_pap` | ❌ Hidden | ✅ | ✅ 14 params |
| Alu+Paper | `substrates_alu_pap` | ❌ Hidden | ✅ | ✅ 9 params |
| Adhesives | `adhesives` | ❌ Hidden | ✅ | ✅ 5 params |
| Chemicals | `chemicals` | ❌ Hidden | ✅ | ✅ 5 params |
| Additives | `additives` | ❌ Hidden | ✅ | ✅ 5 params |
| Coating | `coating` | ❌ Hidden | ✅ | ✅ 5 params |
| Packing Materials | `packing_materials` | ❌ Hidden | ✅ | ✅ 5 params |
| Mounting Tapes | `mounting_tapes` | ❌ Hidden | ✅ | ✅ 5 params |

> Note: "Parser Supported" means the backend endpoint and the frontend handler already accept `material_class` / `parameter_profile` generically. There is no parser logic that is category-specific on the frontend beyond the gate below.

---

## Root Cause

**File:** `TDSManager.jsx` — **Line 3171**

```jsx
{isAluFoilProfile && (
  <>
    <input
      ref={nonResinFileInputRef}
      type="file"
      accept=".pdf"
      style={{ display: 'none' }}
      onChange={handleNonResinUpload}
    />
    <Button icon={<UploadOutlined />} loading={nonResinUploading} onClick={() => nonResinFileInputRef.current?.click()}>
      Upload TDS PDF
    </Button>
  </>
)}
```

`isAluFoilProfile` is a derived boolean defined at **line 816**:

```js
const isAluFoilProfile = activeNonResinParamProfile === ALU_FOIL_PROFILE_KEY;
// ALU_FOIL_PROFILE_KEY = 'substrates_alu_foil'
```

The condition is `true` only when the resolved parameter profile matches `'substrates_alu_foil'`. For every other non-resin material — regardless of whether it has a defined schema and a working backend parser — this block is skipped and no upload button is rendered.

Everything else in the upload pipeline is already generic:

- `handleNonResinUpload` (line 1573) passes `material_class`, `mainitem`, `maindescription`, `catlinedesc` and `mainunit` to the backend. No Alu Foil specific logic inside the handler itself until the last fallback warning.
- The diff modal (`renderDiffModal`) uses `diffTargetType === 'non_resin'` and renders generic labels already.
- The auto-apply path and `handleApplyDiff` use `diffNonResinContext.material_class` and `parameter_profile` — fully generic.
- `NON_RESIN_PARAM_SCHEMAS` covers all 16 non-resin profiles already.

**Conclusion:** The upload feature was implemented generically but the UI button was never promoted from the Alu Foil pilot to all categories. The gate at line 3171 is the single root cause of the entire feature gap.

---

## Bug List

### Bug 1 — CRITICAL: TDS Upload button hidden for all non-Alu Foil categories
**File:** `TDSManager.jsx` line 3171  
**Symptom:** Users on BOPP, CPP, PET, adhesives, coatings, and every other non-resin tab see no upload option. They must enter all parameters manually even when a supplier TDS PDF is available.  
**Cause:** `{isAluFoilProfile && ...}` gates the entire upload block.  
**Fix:** Change the condition to `{!isResinsTab && canWrite && ...}` — the same guard used for the `Edit Parameters` button above it. The Alu Foil profile is already handled identically by the generic handler; no special casing is needed.

---

### Bug 2 — MAJOR: Fallback warning message is Alu Foil specific
**File:** `TDSManager.jsx` line 1679  
**Symptom:** If the backend parser returns neither a `diff` nor an `extracted` object, the UI displays: `"No Alu foil parameters could be extracted from this PDF."` — even when the user is on a BOPP or adhesive item.  
**Cause:** The message was written during the Alu Foil pilot and was never made generic.  
**Fix:** Replace with a dynamic message using `activeMaterialSpecLabel`:
```js
message.warning(`No ${activeMaterialSpecLabel} parameters could be extracted from this PDF.`);
```

---

### Bug 3 — MAJOR: Non-resin attachment/upload tracking is absent
**File:** `TDSManager.jsx` line 2724  
**Symptom:** The `Spec Status` column in the live material table always shows `uploaded: false` for non-resin rows, even after a TDS has been parsed and applied. The resin flow correctly reads `row.resin_attachment_count`.  
**Cause:** `getLiveSpecStatusMeta` hardcodes `uploaded: false` for non-resin and does not attempt to read any attachment count from the row data.  
**Fix:** The backend response for `/api/mes/master-data/tds/live-materials` should include a `non_resin_attachment_count` field (or similar). The frontend should read it in `getLiveSpecStatusMeta`:
```js
const uploaded = Number(row?.non_resin_attachment_count || 0) > 0;
```
This requires a backend query change in addition to the frontend read. Must be scoped with the backend team.

---

### Bug 4 — MINOR: `message` (antd static API) in `useCallback` dependency array
**File:** `TDSManager.jsx` line 1050  
```js
}, [headers, message]);
```
**Symptom:** No runtime error, but `message` from `import { message } from 'antd'` is a static module-level object reference. It never changes between renders. Including it in `useCallback` deps is incorrect — it signals a misunderstanding of the dependency model and may confuse future maintainers or linters.  
**Fix:** Remove `message` from the deps array. The correct deps for `fetchLiveResinCategories` are `[headers]` only.

---

### Bug 5 — MINOR: `dbParamDefinitions` fetch can loop if backend returns an empty definition list
**File:** `TDSManager.jsx` — the `useEffect` on line ~1156 and `fetchParamDefinitions` on line ~1003  
**Symptom:** If the API returns `json.data = []` (no definitions seeded for a profile), the condition `json.success && json.data?.length` is falsy, so `dbParamDefinitions[key]` is never set. On the next render where `activeNonResinParamProfile` or `activeSpecMaterialClass` is still set, `!dbParamDefinitions[profile]` is still `true`, triggering another fetch. This can produce repeated API calls on every re-render for any category without seeded DB definitions.  
**Fix:** Store an empty sentinel value when the API returns an empty list:
```js
setDbParamDefinitions((prev) => ({
  ...prev,
  [key]: json.data?.length ? json.data.map(...) : [],
}));
```
Move this outside the `if (json.success && json.data?.length)` guard so the key is always written on a successful response.

---

### Bug 6 — MINOR: MasterDataHub role access too broad
**File:** `MasterDataHub.jsx` line 35  
```js
if (MATERIAL_SPECS_OPS_ROLES.includes(role)) return true;
```
**Symptom:** `production_manager` and `quality_control` roles bypass the `designation_level >= 6` gate entirely, giving them access to all five tabs: Item Master, Machines, Processes, Product Types, and Material Specs. If the intent was to give them scoped access only to Material Specs, the current implementation is over-permissive for the other tabs.  
**Fix (if scoped access was the intent):** Either implement per-tab role guards inside each child component, or add a `canAccessAllTabs` flag and conditionally hide restricted tabs for ops roles in the `items` array.  
**Note:** If full access for these roles is intentional, this is not a bug — confirm with product owner.

---

### Bug 7 — INFO: MaterialSpecsAdmin.jsx is orphaned / unused
**File:** `MaterialSpecsAdmin.jsx`  
**Symptom:** The file exists in the MasterData folder but is never imported anywhere. `TDSManager.jsx` imports `ParameterSchemaAdmin` from `./ParameterSchemaAdmin` (a separate, more complete component). `MaterialSpecsAdmin.jsx` appears to be an earlier draft or a parallel implementation that was superseded.  
**Risk:** Not a runtime bug, but it creates confusion for any developer who picks up this codebase. It also duplicates fetch logic for category-mapping and parameter-definitions endpoints.  
**Fix:** Either delete `MaterialSpecsAdmin.jsx` or clearly mark it deprecated with a comment at the top.

---

## Recommended Fixes (Step-by-Step Plan)

> All changes require approval before implementation.

### Phase 1 — Core Fix (Bug 1 + Bug 2) — Frontend only, low risk

**Step 1.1** — In `TDSManager.jsx` at the non-resin detail view render path (around line 3171), replace:
```jsx
{isAluFoilProfile && (
  <>
    <input ref={nonResinFileInputRef} ... onChange={handleNonResinUpload} />
    <Button ...>Upload TDS PDF</Button>
  </>
)}
```
with:
```jsx
{!isResinsTab && canWrite && (
  <>
    <input ref={nonResinFileInputRef} ... onChange={handleNonResinUpload} />
    <Button ...>Upload TDS PDF</Button>
  </>
)}
```

**Step 1.2** — In `handleNonResinUpload` at line 1679, replace:
```js
message.warning('No Alu foil parameters could be extracted from this PDF.');
```
with:
```js
message.warning(`No ${activeMaterialSpecLabel} parameters could be extracted from this PDF.`);
```

**Expected outcome:** All 16 non-resin category profiles will now show the Upload TDS PDF button. The `handleNonResinUpload` handler already sends the correct `material_class` and profile to the backend. The diff modal, auto-apply, and save flows already work generically. No other frontend changes needed for the core feature to function.

---

### Phase 2 — Stability Fixes (Bugs 4 + 5) — Low risk

**Step 2.1** — Remove `message` from `fetchLiveResinCategories` useCallback deps (line 1050).

**Step 2.2** — In `fetchParamDefinitions`, unconditionally write the result to `dbParamDefinitions` on any successful API response, even if `json.data` is empty, to prevent re-fetch loops.

---

### Phase 3 — Attachment Tracking (Bug 3) — Requires backend coordination

**Step 3.1** — Confirm with backend whether `non_resin_attachment_count` (or equivalent) is returned by the `/live-materials` endpoint. If not, add a LEFT JOIN or subquery in the backend query to count related TDS attachment records by `mainitem` / `maindescription`.

**Step 3.2** — Update `getLiveSpecStatusMeta` in TDSManager to read the count and set `uploaded` accordingly.

---

### Phase 4 — Role Access Clarification (Bug 6) — Requires product decision

**Step 4.1** — Confirm with product owner whether `production_manager` and `quality_control` should access all five tabs or only Material Specs.

**Step 4.2** — If scoped: add tab-level role guards inside the individual manager components, or add a `restrictedTabs` list filtered out of the `items` array in MasterDataHub based on role.

---

### Phase 5 — Cleanup (Bug 7)

**Step 5.1** — Delete `MaterialSpecsAdmin.jsx` or add a `@deprecated` JSDoc comment and note pointing to `ParameterSchemaAdmin.jsx`.

---

## Open Questions

1. **Backend parser coverage** — Does the `/api/mes/master-data/tds/non-resin-spec/parse-upload` endpoint have category-specific extraction logic for BOPP, CPP, adhesives, etc., or is it currently only implemented for Alu Foil? If backend parsing is also Alu Foil-only, Phase 1 will make the button visible but the parser will return empty/no diff for other categories. Needs backend review before Phase 1 is communicated to users.

2. **Role access intent** — Was `MATERIAL_SPECS_OPS_ROLES` in MasterDataHub intentionally given access to all tabs, or was it expected to be scoped? (Bug 6 above.)

3. **Attachment storage for non-resin** — Non-resin TDS PDFs are parsed and values are applied to the `non_resin_spec` record, but is the PDF file itself stored anywhere? The resin flow stores attachments in a separate `tds_attachments` table. Is there an equivalent for non-resin uploads?

4. **`ParameterSchemaAdmin` vs `MaterialSpecsAdmin`** — Confirm `MaterialSpecsAdmin.jsx` is safe to remove and there is no future plan to wire it in separately.

---

## Out of Scope

This document is a planning and bug review artefact only. **No source files, components, API routes, database schemas, or configuration records were modified during this review.** All changes described above require explicit approval before implementation.
