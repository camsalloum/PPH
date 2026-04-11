# Parameter Schema Admin — Detailed Implementation Plan

> **Purpose:** Allow admins to manage parameter definitions per Category Group (material_class) and Item Group (profile) through a UI. Changes instantly reflect in the Material Specs edit view for all items in that group.
> **Created:** 2026-04-08
> **Depends on:** Material Specs Rebuild (Phases 1-5 complete), `mes_parameter_definitions` table (224 rows seeded)

---

## Architecture Overview

```
Admin UI (ParameterSchemaAdmin.jsx)
  ├── Left: Category/Profile selector
  ├── Center: Editable parameter table (CRUD + drag reorder)
  └── Right: Live preview of edit form layout
        │
        ▼
  API Endpoints (tds.js)
  POST/PUT/DELETE /api/mes/master-data/tds/parameter-definitions
        │
        ▼
  DB: mes_parameter_definitions (+ new columns for layout)
        │
        ▼
  Material Specs Edit View (TDSManager.jsx)
  Fetches definitions → renders dynamic form
```

---

## Phase A: Database Migration ✅ DONE — Kiro (2026-04-08)

### Migration: `mes-master-033-param-admin-columns.js`

Add these columns to `mes_parameter_definitions`:

```sql
ALTER TABLE mes_parameter_definitions
  ADD COLUMN IF NOT EXISTS display_width      INT DEFAULT 8,
  ADD COLUMN IF NOT EXISTS display_group      VARCHAR(40),
  ADD COLUMN IF NOT EXISTS display_row        INT,
  ADD COLUMN IF NOT EXISTS placeholder        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS help_text          VARCHAR(200),
  ADD COLUMN IF NOT EXISTS has_test_method    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_method_options TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
```

Column details:
- `display_width` (INT, default 8): Ant Design Col span out of 24. Controls field width in edit form. Values: 4=small, 6=quarter, 8=third, 12=half, 24=full.
- `display_group` (VARCHAR 40): Section header in edit form. E.g. "Mechanical Properties", "Optical Properties", "Thermal Properties". NULL = no group header.
- `display_row` (INT): Optional row number for explicit layout control. NULL = auto-flow.
- `placeholder` (VARCHAR 100): Input placeholder text. E.g. "Enter density in g/cm³"
- `help_text` (VARCHAR 200): Tooltip shown on hover of field label. E.g. "Measured at 23°C per ASTM D792"
- `has_test_method` (BOOLEAN, default false): When true, a test method input appears next to the value field.
- `test_method_options` (TEXT[]): Predefined test method options for dropdown. E.g. `{'ASTM D1238','ISO 1133'}`. Empty = free text input.

### Seed default display_group values:

For resins (material_class='resins', profile IS NULL):
- MFR fields → "Rheology"
- Density, melting point, vicat, HDT → "Thermal"
- Tensile, elongation, flexural → "Mechanical"
- Brittleness, bulk density → "Other"

For films profiles:
- Thickness, density, yield → "Physical"
- Tensile, elongation, tear, puncture, dart → "Mechanical"
- Haze, gloss → "Optical"
- OTR, WVTR → "Barrier"
- COF, corona, seal → "Surface & Sealing"
- Shrinkage fields → "Shrinkage" (PVC/PETC/PETG only)

Set `has_test_method = true` for all numeric parameters (the PDF parser already extracts test methods).

---

## Phase B: Backend CRUD Endpoints ✅ DONE — Kiro (2026-04-08)

### File: `server/routes/mes/master-data/tds.js`

All endpoints require `authenticate` middleware + `isTdsWriter(req.user)` role check.

### B1. POST `/tds/parameter-definitions`

Create a new parameter definition.

Request body:
```json
{
  "material_class": "films",
  "profile": "films_bopp",
  "field_key": "puncture_resistance_n",
  "label": "Puncture Resistance",
  "unit": "N",
  "field_type": "number",
  "step": 0.1,
  "min_value": 0,
  "max_value": 100,
  "max_length": null,
  "is_required": false,
  "sort_order": 22,
  "display_width": 8,
  "display_group": "Mechanical",
  "placeholder": "Enter value",
  "help_text": "ASTM F1306",
  "has_test_method": true,
  "test_method_options": ["ASTM F1306", "ISO 7765-2"]
}
```

Validation:
- `material_class` required, must be one of known classes
- `field_key` required, must be unique within (material_class, profile)
- `label` required
- `field_type` must be one of: 'number', 'text', 'json_array'
- `display_width` must be 4, 6, 8, 12, or 24
- Auto-generate `field_key` from label if not provided: `label.toLowerCase().replace(/[^a-z0-9]+/g, '_')`

Response: `{ success: true, data: <created row> }`

### B2. PUT `/tds/parameter-definitions/:id`

Update an existing parameter definition.

Request body: same fields as POST (all optional, only provided fields are updated).

Validation:
- If `field_key` changed, check uniqueness within (material_class, profile)
- Cannot change `material_class` or `profile` (delete + recreate instead)

Response: `{ success: true, data: <updated row> }`

### B3. DELETE `/tds/parameter-definitions/:id`

Delete a parameter definition.

Validation:
- Confirm the definition exists
- Warn if any specs have data for this field_key (return count in response, don't block)

Response: `{ success: true, affected_specs: 12 }` (count of specs that have data for this field)

### B4. PUT `/tds/parameter-definitions/reorder`

Bulk update sort_order for drag-and-drop reorder.

Request body:
```json
{
  "material_class": "films",
  "profile": "films_bopp",
  "order": [
    { "id": 45, "sort_order": 1 },
    { "id": 46, "sort_order": 2 },
    { "id": 47, "sort_order": 3 }
  ]
}
```

Response: `{ success: true, updated: 3 }`

### B5. POST `/tds/parameter-definitions/copy-profile`

Copy all definitions from one profile to another.

Request body:
```json
{
  "source_material_class": "films",
  "source_profile": "films_bopp",
  "target_material_class": "films",
  "target_profile": "films_new_substrate",
  "target_display_label": "New Substrate"
}
```

Validation:
- Source must exist with at least 1 definition
- Target must not already have definitions (or force=true to overwrite)

Response: `{ success: true, copied: 21 }`

---

## Phase C: Admin UI Component ✅ DONE — Kiro (2026-04-08)

### File: `src/components/MES/MasterData/ParameterSchemaAdmin.jsx`

Replace the current read-only `MaterialSpecsAdmin.jsx` with a full CRUD admin panel.

### C1. Layout (3-panel)

```
┌─────────────────────────────────────────────────────────────────┐
│ Parameter Schema Admin                              [Close]     │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│ Category │  Parameter Definitions       │  Live Preview         │
│ Selector │  (editable table)            │  (form layout)        │
│          │                              │                       │
│ ○ Resins │  [+ Add Parameter]           │  ┌─────┐ ┌─────┐     │
│ ● Films  │                              │  │ MFR │ │Dens │     │
│   ├ BOPP │  # │ Key    │ Label │ Unit  │  │     │ │     │     │
│   ├ CPP  │  1 │ thick  │ Thick │ µm   │  └─────┘ └─────┘     │
│   ├ PET  │  2 │ dens   │ Dens  │ g/cm³│  ┌─────┐ ┌─────┐     │
│   └ ...  │  3 │ haze   │ Haze  │ %    │  │Vicat│ │ HDT │     │
│ ○ Adhes  │  ↕ drag to reorder          │  │     │ │     │     │
│ ○ Chem   │                              │  └─────┘ └─────┘     │
│ ○ ...    │  [Copy Profile] [Export]     │                       │
│          │                              │  Shows actual form    │
│          │                              │  with field widths    │
└──────────┴──────────────────────────────┴───────────────────────┘
```

### C2. Left Panel — Category/Profile Selector

- Tree structure using Ant Design `Tree` or custom list
- Top level: material_class values from `mes_category_mapping` (only where `has_parameters = true`)
- Second level (for films only): profiles from `mes_parameter_definitions` WHERE material_class='films' AND profile IS NOT NULL, grouped by DISTINCT profile
- Clicking a node loads its parameter definitions in the center panel
- Show item count badge: "(21 params)"
- "Add Profile" button at bottom of films section

### C3. Center Panel — Editable Parameter Table

Ant Design `Table` with inline editing. Columns:

| Column | Width | Editable | Type |
|--------|-------|----------|------|
| ↕ (drag handle) | 30px | - | drag icon |
| # (sort_order) | 40px | auto | display only |
| Field Key | 160px | yes | Input (auto-generated from label if empty) |
| Label | 160px | yes | Input |
| Unit | 80px | yes | Input |
| Type | 80px | yes | Select: number/text/json_array |
| Min | 70px | yes (if number) | InputNumber |
| Max | 70px | yes (if number) | InputNumber |
| Step | 60px | yes (if number) | InputNumber |
| Required | 60px | yes | Checkbox |
| Width | 60px | yes | Select: 4/6/8/12/24 |
| Group | 120px | yes | AutoComplete (from existing groups) |
| Method | 60px | yes | Checkbox (has_test_method) |
| Actions | 60px | - | Delete button |

Editing behavior:
- Click any cell to edit inline
- Changes are saved on blur (auto-save, no Save button needed)
- New row: click "+ Add Parameter" → adds empty row at bottom, focuses on Label field
- Delete: click trash icon → confirmation modal showing "X specs have data for this field"
- Drag rows to reorder → calls PUT /reorder endpoint

### C4. Right Panel — Live Preview

Renders a mock edit form using the current parameter definitions:
- Groups fields by `display_group` (show section headers)
- Each field rendered as Ant Design `Form.Item` with correct `Col` span from `display_width`
- Number fields show `InputNumber` with step/min/max
- Text fields show `Input` with maxLength
- If `has_test_method`, show a small secondary input next to the value
- If `help_text`, show info icon with tooltip
- If `placeholder`, show in the input
- Updates in real-time as admin changes definitions in the center panel

### C5. Toolbar Actions

- **Copy Profile:** Opens modal → select source profile → enter new profile name → copies all definitions
- **Export JSON:** Downloads current profile's definitions as JSON file
- **Import JSON:** Upload a JSON file to bulk-create definitions (validates schema)

---

## Phase D: Edit View Refactor ✅ DONE — Kiro (2026-04-08)

### File: `src/components/MES/MasterData/TDSManager.jsx`

The current non-resin edit view (when you double-click an item) renders parameter fields. Refactor to use DB definitions with admin-configured layout.

### D1. Fetch definitions with layout columns

Update `fetchParamDefinitions` to also fetch: `display_width`, `display_group`, `display_row`, `placeholder`, `help_text`, `has_test_method`, `test_method_options`.

Update the backend `GET /tds/parameter-definitions` to include these columns in the response.

### D2. Render grouped form

Current: flat list of fields in a single `Row > Col` grid.

New rendering logic:
```jsx
// Group definitions by display_group
const groups = groupBy(paramDefs, 'display_group');

return (
  <Form>
    {Object.entries(groups).map(([groupName, fields]) => (
      <div key={groupName}>
        {groupName && <Divider orientation="left">{groupName}</Divider>}
        <Row gutter={[12, 8]}>
          {fields.map(def => (
            <Col key={def.field_key} span={def.display_width || 8}>
              <Form.Item
                label={
                  <span>
                    {def.label}
                    {def.help_text && <Tooltip title={def.help_text}><InfoCircleOutlined /></Tooltip>}
                  </span>
                }
                required={def.is_required}
              >
                {def.field_type === 'number' ? (
                  <InputNumber
                    style={{ width: '100%' }}
                    step={def.step}
                    min={def.min_value}
                    max={def.max_value}
                    placeholder={def.placeholder}
                  />
                ) : (
                  <Input
                    maxLength={def.max_length}
                    placeholder={def.placeholder}
                  />
                )}
              </Form.Item>
              {def.has_test_method && (
                <Form.Item label="Test Method" style={{ marginTop: -8 }}>
                  {def.test_method_options?.length ? (
                    <Select
                      allowClear
                      showSearch
                      placeholder="Select method"
                      options={def.test_method_options.map(m => ({ label: m, value: m }))}
                    />
                  ) : (
                    <Input placeholder="e.g. ASTM D1238" size="small" />
                  )}
                </Form.Item>
              )}
            </Col>
          ))}
        </Row>
      </div>
    ))}
  </Form>
);
```

### D3. Resin edit view

The resin edit view currently uses hardcoded `TECH_PARAM_CONFIG` (14 fields). Refactor to also fetch from DB:
- If DB has definitions for material_class='resins', use those
- Fallback to `TECH_PARAM_CONFIG` if DB is empty
- This allows admin to add new resin parameters (e.g. dart drop, tear, secant modulus) without code changes

---

## Phase E: Test Method Enhancements ✅ DONE — Kiro (2026-04-09)

### E1. Seed common test methods

Add `has_test_method = true` and `test_method_options` for common parameters:

| Parameter | Common Methods |
|-----------|---------------|
| MFR 190/2.16 | ASTM D1238, ISO 1133 |
| Density | ASTM D792, ASTM D1505, ISO 1183 |
| Vicat | ASTM D1525, ISO 306 |
| Tensile | ASTM D882, ASTM D638, ISO 527-3 |
| Elongation | ASTM D882, ISO 527-3 |
| Dart Drop | ASTM D1709, ISO 7765-1 |
| Tear | ASTM D1922, ASTM D1004, ISO 6383 |
| Haze | ASTM D1003, ISO 14782 |
| Gloss | ASTM D2457, ISO 2813 |
| COF | ASTM D1894, ISO 8295 |
| OTR | ASTM D3985, ASTM F2622 |
| WVTR | ASTM F1249, ASTM E96 |
| Seal Strength | ASTM F88, ASTM F2029 |
| Corona | ASTM D2578 |

### E2. PDF parser uses test_method_options

When the schema-driven parser extracts a test method, validate it against `test_method_options` if defined. If the extracted method doesn't match any option, flag it as "unrecognized method" in the diff view.

---

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `server/migrations/mes-master-033-param-admin-columns.js` | NEW — migration for new columns + seed display_group/has_test_method | A |
| `server/routes/mes/master-data/tds.js` | MODIFY — add POST/PUT/DELETE/reorder/copy-profile endpoints | B |
| `src/components/MES/MasterData/ParameterSchemaAdmin.jsx` | NEW — full CRUD admin panel (replaces MaterialSpecsAdmin.jsx) | C |
| `src/components/MES/MasterData/TDSManager.jsx` | MODIFY — wire admin panel, refactor edit view to use DB layout | C, D |
| `src/components/MES/MasterData/MaterialSpecsAdmin.jsx` | DELETE — replaced by ParameterSchemaAdmin.jsx | C |
| `server/utils/schema-pdf-parser.js` | MODIFY — use test_method_options for validation | E |

---

## Acceptance Criteria

1. Admin can see all parameter definitions grouped by Category Group and Item Group
2. Admin can add a new parameter → it appears in the edit view of all items in that group
3. Admin can edit label, unit, min/max, width, group, test method options → changes reflect immediately
4. Admin can drag-reorder parameters → new order persists and reflects in edit view
5. Admin can delete a parameter → removed from edit view (with warning about existing data)
6. Admin can copy a profile's parameters to create a new profile
7. Live preview shows exactly how the edit form will look
8. Test method dropdowns appear for parameters where admin enabled them
9. All changes are audit-trailed (updated_at, updated_by)
10. No code deploy needed to add/modify/remove parameters for any category
