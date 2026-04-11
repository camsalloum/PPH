# Substrate Material Specs — Full Implementation Plan

> Replicate the Resin pattern (Material Specs → Item Master aggregation) for all remaining substrate types.

---

## 1. Page Concepts (Clarification)

### Raw Material Dashboard
- **Purpose:** Live Oracle ERP sync viewer. Shows real-time stock, costs, pending orders from `fp_actualrmdata`.
- **Role:** Read-only operational dashboard. No parameter editing. Role-based views (Admin, QC, Procurement, etc.).
- **Data source:** `fp_actualrmdata` (Oracle mirror)

### Material Specs (TDS Manager)
- **Purpose:** Library of ALL individual material specifications — every grade, every supplier, every TDS.
- **Resins tab:** Each row = one resin grade (e.g., SABIC LLDPE 118NJ) with 14 physical/mechanical parameters.
- **Films tab (non-resin):** Each row = one film/foil SKU with type-specific parameters (BOPP, PET, CPP, Alu, etc.).
- **Data source:** `mes_material_tds` (resins) + `mes_non_resin_material_specs` (all others)
- **Key:** This is where ALL individual specs live — granular, per-grade, per-supplier.

### Item Master
- **Purpose:** Consolidated item registry for **estimation & costing**. Shows ONE row per material category (e.g., "HDPE", "BOPP Transparent HS Regular") with **averaged/aggregated** parameters from Material Specs.
- **Resins tab:** Each row = one resin category (e.g., "HDPE"). Edit modal shows:
  - Inventory KPIs (stock qty, value, WA prices) from Oracle
  - **Aggregated TDS parameters** (14 weighted averages across all HDPE grades)
  - Grades table listing individual TDS records feeding the averages
- **Substrates tab:** Each row = one substrate category. **Should show same pattern:** inventory KPIs + aggregated film parameters + individual specs table.
- **Data source:** `mes_item_master` + aggregation queries joining `mes_non_resin_material_specs` + `fp_actualrmdata`

### The Pattern (Resin = Reference)
```
Material Specs (TDS Manager)           Item Master
┌─────────────────────────┐            ┌──────────────────────────────┐
│ SABIC LLDPE 118NJ       │──┐         │ LLDPE (category row)         │
│ SABIC LLDPE 318BJ       │──┤ GROUP   │   Inventory: stock, prices   │
│ BOROUGE LLDPE FB2230    │──┼────────►│   Avg Params: MFI, density.. │
│ QAPCO LLDPE Q1018H     │──┘ BY      │   Grades: [118NJ, 318BJ..]  │
│                         │   cat_desc │                              │
└─────────────────────────┘            └──────────────────────────────┘

Same concept applies to substrates:

Material Specs (TDS Manager)           Item Master
┌─────────────────────────┐            ┌──────────────────────────────┐
│ BOPP T HS 20µ Supplier1 │──┐         │ BOPP Transparent HS Regular  │
│ BOPP T HS 25µ Supplier2 │──┤ GROUP   │   Inventory: stock, prices   │
│ BOPP T HS 30µ Supplier3 │──┼────────►│   Avg Params: thickness,     │
│                         │──┘ BY      │     COF, haze, tensile..     │
│                         │ catlinedesc│   Specs: [20µ S1, 25µ S2..]  │
└─────────────────────────┘            └──────────────────────────────┘
```

---

## 2. Current State vs Target

| Material | Material Specs Schema | Material Specs Params | Item Master Aggregation | Item Master Profile UI |
|----------|----------------------|----------------------|------------------------|----------------------|
| **Resins** | ✅ `mes_material_tds` (14 fixed cols) | ✅ 14 params (MFI, density, tensile..) | ✅ `/resin-profile` (stock-weighted avg) | ✅ KPIs + Material Specs + Grades table |
| **Alu Foil** | ✅ `films_alu_foil` (26 params JSONB) | ✅ 26 params (alloy, temper, mechanical, chemical) | ❌ No aggregation endpoint | ❌ Basic physical only |
| **BOPP** | ⚠️ Generic `films` (5 params only) | ❌ Missing: haze, gloss, tensile, COF static/kinetic, seal temp, shrinkage | ❌ No aggregation endpoint | ❌ Basic physical only |
| **CPP** | ⚠️ Generic `films` (5 params only) | ❌ Missing: seal temp range, tensile, hot tack, haze | ❌ No aggregation endpoint | ❌ Basic physical only |
| **PET** | ⚠️ Generic `films` (5 params only) | ❌ Missing: tensile, O₂ barrier, shrinkage, haze, gloss | ❌ No aggregation endpoint | ❌ Basic physical only |
| **PA** | ⚠️ Generic `films` (5 params only) | ❌ Missing: O₂ permeability, puncture, tensile, moisture | ❌ No aggregation endpoint | ❌ Basic physical only |
| **PAP** | ⚠️ Generic `films` (5 params only) | ❌ Missing: GSM, burst strength, moisture, Cobb | ❌ No aggregation endpoint | ❌ Basic physical only |
| **PVC** | ⚠️ Generic `films` (5 params only) | ❌ Missing: shrinkage MD/TD, tensile, gloss | ❌ No aggregation endpoint | ❌ Basic physical only |
| **Adhesives** | ✅ `adhesives` (5 params) | ✅ solids, viscosity, density, mix ratio, pot life | ❌ No aggregation endpoint | ❌ Not shown |
| **Inks** | ❌ No schema | ❌ No params defined | ❌ No aggregation endpoint | ❌ Not shown |

---

## 3. Substrate Parameter Definitions (Per Type)

### 3.1 BOPP — Biaxially Oriented Polypropylene

**Category descriptions** (from Excel/Oracle — 11 variants):
- BOPP Transparent HS Regular
- BOPP Transparent NHS Regular
- BOPP Transparent HS Low SIT
- BOPP White Label Grade
- BOPP Transparent Label Grade
- BOPP Transparent Matt HS
- BOPP Metalized HS Regular
- BOPP Metalized HS High Barrier
- BOPP White Pearlised
- BOPP White IML/Speciality
- BOPP Transparent IML/Speciality

**Parameters (from TDS PDFs in `TDS BOPP/`):**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 12 | 60 | Nominal gauge |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 0.88 | 0.95 | Standard ~0.91 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 20 | 100 | = 1000/(density×thickness) |
| 4 | `haze_pct` | Haze | % | | 0.1 | 15 | Optical clarity |
| 5 | `gloss_45` | Gloss 45° | GU | | 50 | 120 | Surface gloss |
| 6 | `cof_static` | COF Static | — | | 0.05 | 1.0 | Slip property |
| 7 | `cof_kinetic` | COF Kinetic | — | | 0.05 | 1.0 | Slip property |
| 8 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 80 | 350 | Machine direction |
| 9 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 80 | 350 | Transverse direction |
| 10 | `elongation_md_pct` | Elongation MD | % | | 50 | 300 | Machine direction |
| 11 | `elongation_td_pct` | Elongation TD | % | | 20 | 100 | Transverse direction |
| 12 | `seal_init_temp_c` | SIT | °C | | 80 | 180 | Seal Initiation Temperature |
| 13 | `seal_strength_n_25mm` | Seal Strength | N/25mm | | 0.5 | 15 | Heat seal strength |
| 14 | `shrinkage_md_pct` | Shrinkage MD | % | | 0 | 10 | 120°C/5min |
| 15 | `shrinkage_td_pct` | Shrinkage TD | % | | 0 | 5 | 120°C/5min |
| 16 | `wvtr_g_m2_day` | WVTR | g/m²/day | | 0.1 | 20 | Water vapor transmission rate |
| 17 | `otr_cc_m2_day` | OTR | cc/m²/day | | 100 | 3000 | Oxygen transmission rate |
| 18 | `corona_dyne` | Corona Treatment | dyne/cm | | 30 | 60 | Surface energy |
| 19 | `surface_treatment` | Surface Treatment | — | | — | — | Corona / Flame / None (text, maxLength 40) |

### 3.2 CPP — Cast Polypropylene

**Category descriptions** (2 variants):
- CPP Transparent HS
- CPP Metalized HS

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 15 | 100 | Nominal gauge |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 0.88 | 0.95 | ~0.91 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 10 | 80 | Calculated |
| 4 | `haze_pct` | Haze | % | | 0.3 | 10 | |
| 5 | `gloss_45` | Gloss 45° | GU | | 50 | 130 | |
| 6 | `cof_static` | COF Static | — | | 0.05 | 1.0 | |
| 7 | `cof_kinetic` | COF Kinetic | — | | 0.05 | 1.0 | |
| 8 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 30 | 150 | |
| 9 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 20 | 80 | |
| 10 | `elongation_md_pct` | Elongation MD | % | | 200 | 800 | |
| 11 | `elongation_td_pct` | Elongation TD | % | | 300 | 1000 | |
| 12 | `seal_init_temp_c` | SIT | °C | ✅ | 100 | 160 | Critical for CPP as sealant |
| 13 | `seal_strength_n_25mm` | Seal Strength | N/25mm | | 1 | 20 | |
| 14 | `hot_tack_temp_c` | Hot Tack Temp | °C | | 100 | 170 | |
| 15 | `hot_tack_strength_n_25mm` | Hot Tack Strength | N/25mm | | 0.5 | 15 | |
| 16 | `wvtr_g_m2_day` | WVTR | g/m²/day | | 0.5 | 20 | |
| 17 | `otr_cc_m2_day` | OTR | cc/m²/day | | 500 | 5000 | |
| 18 | `shrinkage_md_pct` | Shrinkage MD | % | | 0 | 5 | |
| 19 | `shrinkage_td_pct` | Shrinkage TD | % | | 0 | 3 | |
| 20 | `corona_dyne` | Corona Treatment | dyne/cm | | 30 | 60 | |
| 21 | `surface_treatment` | Surface Treatment | — | | — | — | Text, maxLength 40 |

### 3.3 PET — Polyethylene Terephthalate

**Category descriptions** (7 variants):
- PET Matt NF ChemTr.
- PET Metalized NF HB
- PET Metalized NF NB
- PET Metalized HF NB
- PET Transparent NF NB ChemTr.
- PET Transparent Twist
- PET Adhesive Film

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 6 | 50 | Nominal gauge |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.35 | 1.45 | ~1.40 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 15 | 120 | Calculated |
| 4 | `haze_pct` | Haze | % | | 0.5 | 15 | |
| 5 | `gloss_60` | Gloss 60° | GU | | 50 | 200 | |
| 6 | `cof_static` | COF Static | — | | 0.1 | 1.0 | |
| 7 | `cof_kinetic` | COF Kinetic | — | | 0.1 | 1.0 | |
| 8 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 150 | 350 | |
| 9 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 150 | 350 | |
| 10 | `elongation_md_pct` | Elongation MD | % | | 50 | 200 | |
| 11 | `elongation_td_pct` | Elongation TD | % | | 50 | 150 | |
| 12 | `shrinkage_md_pct` | Shrinkage MD | % | | 0 | 5 | 150°C/30min |
| 13 | `shrinkage_td_pct` | Shrinkage TD | % | | 0 | 3 | 150°C/30min |
| 14 | `wvtr_g_m2_day` | WVTR | g/m²/day | | 5 | 40 | |
| 15 | `otr_cc_m2_day` | OTR | cc/m²/day | | 20 | 200 | |
| 16 | `surface_tension_dyne` | Surface Tension | dyne/cm | | 30 | 60 | |
| 17 | `surface_treatment` | Surface Treatment | — | | — | — | Corona / ChemTreated / None |
| 18 | `optical_density` | Optical Density (Met) | OD | | 1.5 | 3.5 | Metalized films only |
| 19 | `metal_bond_strength` | Metal Bond | N/15mm | | 0.5 | 5 | Metalized films only |

### 3.4 PA (Nylon) — Polyamide

**Category descriptions** (1 variant):
- Polyamide

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 10 | 50 | |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.12 | 1.18 | ~1.15 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 18 | 90 | |
| 4 | `haze_pct` | Haze | % | | 0.5 | 10 | |
| 5 | `gloss_60` | Gloss 60° | GU | | 80 | 180 | |
| 6 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 100 | 300 | |
| 7 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 100 | 300 | |
| 8 | `elongation_md_pct` | Elongation MD | % | | 50 | 200 | |
| 9 | `elongation_td_pct` | Elongation TD | % | | 50 | 200 | |
| 10 | `otr_cc_m2_day` | OTR | cc/m²/day | | 10 | 100 | Excellent O₂ barrier |
| 11 | `wvtr_g_m2_day` | WVTR | g/m²/day | | 50 | 300 | Poor moisture barrier |
| 12 | `puncture_force_n` | Puncture Force | N | | 2 | 20 | |
| 13 | `dart_drop_g` | Dart Drop | g | | 50 | 500 | |
| 14 | `surface_tension_dyne` | Surface Tension | dyne/cm | | 30 | 60 | |
| 15 | `moisture_content_pct` | Moisture Content | % | | 0 | 5 | Hygroscopic — critical |

### 3.5 PAP — Paper

**Category descriptions** (5 variants):
- Greaseproof Paper
- Kraft Paper
- Coated Paper
- Coated Paper-PE
- Twist Wrap Paper

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `gsm` | Grammage | g/m² | ✅ | 20 | 200 | Basis weight |
| 2 | `thickness_mic` | Thickness (Caliper) | µm | | 15 | 300 | |
| 3 | `density_g_cm3` | Density | g/cm³ | | 0.6 | 1.3 | |
| 4 | `burst_strength_kpa` | Burst Strength | kPa | | 50 | 800 | Mullen test |
| 5 | `tensile_strength_md_kn_m` | Tensile MD | kN/m | | 1 | 20 | |
| 6 | `tensile_strength_td_kn_m` | Tensile TD | kN/m | | 0.5 | 15 | |
| 7 | `tear_strength_md_mn` | Tear MD | mN | | 100 | 2000 | Elmendorf |
| 8 | `tear_strength_td_mn` | Tear TD | mN | | 100 | 2000 | |
| 9 | `cobb_60_g_m2` | Cobb 60 | g/m² | | 10 | 150 | Water absorption |
| 10 | `moisture_pct` | Moisture | % | | 2 | 12 | |
| 11 | `porosity_sec` | Porosity (Gurley) | sec | | 1 | 10000 | |
| 12 | `brightness_pct` | Brightness | % | | 50 | 100 | ISO brightness |
| 13 | `opacity_pct` | Opacity | % | | 50 | 100 | |
| 14 | `smoothness_ml_min` | Smoothness | ml/min | | 10 | 500 | Bendtsen |

### 3.6 PVC — Polyvinyl Chloride

**Category descriptions** (1 variant):
- PVC Blow Shrink

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 10 | 100 | |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.25 | 1.45 | ~1.35 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 7 | 80 | |
| 4 | `haze_pct` | Haze | % | | 0.5 | 10 | |
| 5 | `gloss_45` | Gloss 45° | GU | | 50 | 150 | |
| 6 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 30 | 100 | |
| 7 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 30 | 100 | |
| 8 | `shrinkage_md_pct` | Shrinkage MD | % | ✅ | 30 | 80 | Critical for shrink films |
| 9 | `shrinkage_td_pct` | Shrinkage TD | % | ✅ | 5 | 30 | |
| 10 | `shrink_temp_c` | Shrink Temperature | °C | | 80 | 120 | |
| 11 | `natural_shrink_pct` | Natural Shrink | % | | 0 | 5 | Ambient shrinkage |

### 3.7 PETC / PETG — Shrink PET variants

**Category descriptions:**
- PET-C Shrink (PETC)
- PET-G Shrink (PETG)

**Parameters:** Same as PVC shrink set with PET density range (1.27–1.38):

| # | Key | Label | Unit | Required | Min | Max |
|---|-----|-------|------|----------|-----|-----|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 20 | 80 |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.25 | 1.40 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 8 | 40 |
| 4 | `haze_pct` | Haze | % | | 0.5 | 10 |
| 5 | `gloss_45` | Gloss 45° | GU | | 50 | 150 |
| 6 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 40 | 200 |
| 7 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 40 | 200 |
| 8 | `shrinkage_md_pct` | Shrinkage MD | % | ✅ | 5 | 80 |
| 9 | `shrinkage_td_pct` | Shrinkage TD | % | ✅ | 1 | 20 |
| 10 | `shrink_temp_c` | Shrink Temperature | °C | | 60 | 100 |
| 11 | `natural_shrink_pct` | Natural Shrink | % | | 0 | 5 |

### 3.8 Alu/Pap — Aluminium/Paper laminate

**Category descriptions** (1 variant):
- Butter Foil

**Parameters:** Combination of Alu + Paper properties:

| # | Key | Label | Unit | Required | Min | Max |
|---|-----|-------|------|----------|-----|-----|
| 1 | `total_thickness_mic` | Total Thickness | µm | ✅ | 20 | 100 |
| 2 | `alu_thickness_mic` | Alu Layer Thickness | µm | ✅ | 5 | 20 |
| 3 | `paper_gsm` | Paper Grammage | g/m² | ✅ | 20 | 80 |
| 4 | `density_g_cm3` | Density | g/cm³ | | 1.0 | 1.3 |
| 5 | `dead_fold_pct` | Dead Fold | % | | 80 | 100 |
| 6 | `bond_strength_n_15mm` | Bond Strength | N/15mm | | 0.5 | 5 |
| 7 | `wvtr_g_m2_day` | WVTR | g/m²/day | | 0.01 | 2 |
| 8 | `grease_resistance` | Grease Resistance | — | | — | — | Text: Pass/Fail/Grade (maxLength 40) |
| 9 | `food_contact` | Food Contact Approved | — | | — | — | Boolean |

### 3.9 PE — Polyethylene (Lamination grade)

**Category descriptions** (1 variant):
- PE Lamination

**Parameters:**

| # | Key | Label | Unit | Required | Min | Max |
|---|-----|-------|------|----------|-----|-----|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 10 | 100 |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 0.91 | 0.96 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 10 | 110 |
| 4 | `mfi_g_10min` | MFI | g/10min | | 0.5 | 30 |
| 5 | `seal_init_temp_c` | SIT | °C | | 85 | 140 |
| 6 | `seal_strength_n_25mm` | Seal Strength | N/25mm | | 1 | 20 |
| 7 | `cof_static` | COF Static | — | | 0.05 | 1.0 |
| 8 | `cof_kinetic` | COF Kinetic | — | | 0.05 | 1.0 |
| 9 | `dart_drop_g` | Dart Drop | g | | 50 | 500 |
| 10 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 10 | 50 |
| 11 | `elongation_md_pct` | Elongation MD | % | | 200 | 800 |
| 12 | `haze_pct` | Haze | % | | 2 | 20 |

---

## 4. Implementation Tasks (Sprint-by-Sprint)

### Sprint A — Schemas & Validation (Backend + Frontend)

**Goal:** Define type-specific parameter schemas for ALL substrate types.

#### A1. Backend — `NON_RESIN_PARAM_RULES` in `tds.js`
Replace the generic `films` rule set with type-specific rules:
- `films_bopp` — 19 params (section 3.1)
- `films_cpp` — 21 params (section 3.2)
- `films_pet` — 19 params (section 3.3)
- `films_pa` — 15 params (section 3.4)
- `films_pap` — 14 params (section 3.5)
- `films_pvc` — 11 params (section 3.6)
- `films_petc_petg` — 11 params (section 3.7)
- `films_alu_pap` — 9 params (section 3.8)
- `films_pe` — 12 params (section 3.9)
- Keep `films_alu_foil` — already done (26 params)

#### A2. Frontend — `NON_RESIN_PARAM_SCHEMAS` in `TDSManager.jsx`
Mirror the rules → schemas (same field keys, add label/unit for UI):
- Add 9 new schema arrays matching the above
- Keep existing `films` as fallback for unknown film types

#### A3. Profile Auto-Detection in `tds.js`
Extend `resolveParameterProfile()` (currently only detects Alu Foil):
```
catlinedesc / maindescription contains:
  "BOPP"           → films_bopp
  "CPP"            → films_cpp
  "PET" (not PETC/PETG) → films_pet
  "Polyamide"|"PA" → films_pa
  "Paper"|"PAP"|"Kraft"|"Greaseproof" → films_pap
  "PVC"            → films_pvc
  "PET-C"|"PETC"|"PET-G"|"PETG" → films_petc_petg
  "Alu/Pap"|"Butter Foil" → films_alu_pap
  "PE Lam"         → films_pe
  "Alu"|"Aluminium" → films_alu_foil (already done)
  fallback         → films (generic 5-param)
```

#### A4. Frontend Profile Auto-Detection in `TDSManager.jsx`
Match the backend regex patterns so that when user selects a film item in Material Specs, the correct form schema renders.

### Sprint B — Material Specs UI (TDS Manager)

**Goal:** Films tab in Material Specs renders type-specific parameter forms.

#### B1. Dynamic Form Rendering
When user clicks "View" on a film row:
1. Resolve `parameterProfile` from `catlinedesc` / `maindescription`
2. Look up `NON_RESIN_PARAM_SCHEMAS[profile]`
3. Render fields dynamically (same as current Alu Foil flow)
- Already works for `films_alu_foil`; just needs the schemas from A2

#### B2. Batch Data Entry Support
For bulk population of specs by category:
- Filter by `catlinedesc` (e.g., "BOPP Transparent HS Regular")
- Show all items in that category
- Allow "Copy from" to duplicate params from one item to another

#### B3. PDF Upload Parsers (Future — per substrate type)
Currently only Alu Foil has a parser. BOPP/PET parsers can be added later:
- `extractBoppFromText()` — parse BOPP TDS PDFs for optical, mechanical, barrier params
- `extractPetFromText()` — parse PET TDS PDFs
- Lower priority — manual entry works fine first

### Sprint C — Item Master Aggregation (Backend)

**Goal:** Build `/substrate-profile` endpoint mirroring `/resin-profile`.

#### C1. New Endpoint — `GET /items/substrate-profile`
```
GET /api/mes/master-data/items/substrate-profile?cat_desc=BOPP+Transparent+HS+Regular
```

**Logic (mirrors resin-profile):**
1. **Inventory CTE** — from `fp_actualrmdata` WHERE `catlinedesc = $1`:
   - `total_stock_qty`, `total_stock_val`, `stock_price_wa`
   - `total_order_qty`, `total_order_val`, `on_order_price_wa`
   - `combined_price_wa`, `density_wa`

2. **Specs CTE** — from `mes_non_resin_material_specs` WHERE records match `catlinedesc = $1`:
   - Resolve `parameter_profile` from cat_desc
   - Read all matching rows' `parameters_json`
   - Stock-weight each numeric param (join `fp_actualrmdata` on `mainitem`)
   - Compute weighted average per param, fallback to simple average
   - Return `spec_count`, `spec_params: { thickness_mic: avg, haze_pct: avg, ... }`

3. **Specs Table** — individual spec rows:
   - `mainitem`, `maindescription`, `supplier`, `stock_qty`, `order_qty`
   - All params from `parameters_json`
   - Same GROUP BY + weighted-avg pattern as resin grades query

**Response shape:**
```json
{
  "success": true,
  "data": {
    "parameter_profile": "films_bopp",
    "inventory": { "total_stock_qty": 12500, "stock_price_wa": 2.45, ... },
    "pricing": { "stock_price_wa": 2.45, "on_order_price_wa": 2.38, ... },
    "spec_count": 8,
    "spec_params": {
      "thickness_mic": 20.5,
      "haze_pct": 1.2,
      "cof_static": 0.32,
      "tensile_strength_md_mpa": 180,
      ...
    },
    "specs": [
      {
        "mainitem": "BOPP20HS001",
        "maindescription": "BOPP 20mic HS Regular",
        "stock_qty": 5000,
        "parameters": { "thickness_mic": 20, "haze_pct": 1.1, ... }
      },
      ...
    ]
  }
}
```

### Sprint D — Item Master UI (Frontend)

**Goal:** Substrate edit modal shows same layout as Resin: KPIs + averaged params + specs table.

#### D1. `fetchSubstrateProfile()` Hook
Mirror `fetchResinProfile()`:
- Called when user opens a Substrate row in Item Master
- Passes `oracle_cat_desc` to `/substrate-profile`
- Returns profile with inventory, averaged params, specs list

#### D2. Substrate Edit Modal Layout
Mirror the Resin edit modal:

**Tab 1 — Inventory & Specs**
- 5 KPI cards: Stock Qty, Stock Value, On Order Qty, Order Value, WA Density
- Specs table (multi-select like grades table):
  - Columns: Item Code, Description, Supplier, Stock, Order Qty
  - User selects which specs to include in averages

**Tab 2 — Pricing**
- Oracle source (read-only): Stock Price WA, Order Price WA, Combined WA
- Editable: Market Price, MAP, Standard, Last PO

**Tab 3 — Material Specs (Averaged)**
- Dynamic grid of parameter cards based on `parameter_profile`
- Each card shows the stock-weighted average from selected specs
- For BOPP (19 params): 5 cols × 4 rows
- For CPP (21 params): 5 cols × 5 rows
- Etc.

#### D3. Substrate Category Column
In the Substrates tab table, show `catlinedesc` as the primary grouping column, with film count badge. Clicking opens the profile modal.

### Sprint E — Polish & Integration

#### E1. Auto-Seed from Oracle
When `catlinedesc` exists in `fp_actualrmdata` but no `mes_non_resin_material_specs` records exist:
- Show "No specs yet — seed from Oracle?" prompt
- Creates shell records for each `mainitem` in that category
- Pre-fills density from `SUBSTRATE_DENSITY_BY_TYPE`

#### E2. Profile-Specific PDF Parsers
Build extractors per type (priority order):
1. BOPP — most TDS PDFs available (21 files in `TDS BOPP/`)
2. PET → 0 files but standard TDS format
3. CPP → derive from BOPP extractor (similar structure)
4. Others → manual entry sufficient

#### E3. Estimation Integration
Wire `mes_item_master` substrate averages into the estimation costing engine, so BOM material selection uses aggregated specs.

---

## 5. File Change Map

| File | Sprint | Changes |
|------|--------|---------|
| `server/routes/mes/master-data/tds.js` | A1, A3 | Add 9 new `NON_RESIN_PARAM_RULES` + extend `resolveParameterProfile()` |
| `src/components/MES/MasterData/TDSManager.jsx` | A2, A4, B1 | Add 9 new `NON_RESIN_PARAM_SCHEMAS` + extend profile resolution |
| `server/routes/mes/master-data/items.js` | C1 | Add `GET /items/substrate-profile` endpoint (~150 lines) |
| `src/components/MES/MasterData/ItemMaster.jsx` | D1-D3 | Add `fetchSubstrateProfile()`, substrate modal tabs, dynamic param cards |
| `src/utils/substrateExcelMapping.js` | — | No changes needed (reference data already complete) |

---

## 6. Priority Order

1. **Sprint A** (Schemas) — Foundation, unblocks everything. ~2-3 hours.
2. **Sprint B** (Material Specs UI) — Makes Films tab useful for all types.
3. **Sprint C** (Backend aggregation) — Enables Item Master profiles.
4. **Sprint D** (Item Master UI) — Full parity with Resin.
5. **Sprint E** (Polish) — PDF parsers, auto-seed, estimation wire-up.

---

## 7. Validation Checklist

After each sprint, verify:
- [ ] Each substrate type shows correct form fields in Material Specs
- [ ] Profile auto-detection works for all 11 category descriptions
- [ ] Saving specs persists to `mes_non_resin_material_specs` with correct `parameters_json`
- [ ] Item Master Substrates tab shows aggregated averages per category
- [ ] Weighted averaging uses `fp_actualrmdata` stock as weight
- [ ] Fallback to simple average when no stock data
- [ ] Edit modal: selecting/deselecting specs recalculates averages
- [ ] All schemas validated on save (backend `validateNonResinParameters`)

---

## 8. Parameter Refinements (Post-Research Review)

> Cross-referenced against: actual TDS PDFs in `Product Groups data/`, both KB markdown files,
> QC template migration seed (mes-presales-020), ASTM standards (D2732, D882, D1894, D1003, D2457, F88, D3985, F1249, F1306),
> Wikipedia polymer articles, and industry knowledge.

### 8.1 BOPP — Change Summary

**Gloss angle correction:** QC templates specify Gloss at 60° (ASTM D2457), not 45°. Most BOPP TDS PDFs report at 60° per industry standard.

| Change | Old | New | Reason |
|--------|-----|-----|--------|
| Param `gloss_45` | Gloss 45° | `gloss_60` — Gloss 60° (GU) | Industry standard for films is 60°; QC template confirms |
| Add param #20 | — | `tear_strength_md_mn` — Tear MD (mN, Elmendorf) | Common in BOPP TDS; value for slit quality |
| Add param #21 | — | `tear_strength_td_mn` — Tear TD (mN, Elmendorf) | Transverse direction tear; critical for bag opening |

**Validation cross-check:**
- QC templates confirm: Tensile MD ≥120 MPa / TD ≥200 MPa ✅
- QC templates confirm: Elongation MD ≥100% / TD ≥50% ✅
- QC templates confirm: COF Static 0.2–0.4, Kinetic 0.1–0.3 ✅
- QC templates confirm: Haze ≤2.5%, Gloss 60° ≥85 GU ✅
- QC templates confirm: Seal Strength ≥2.0 N/15mm, OTR (D3985), WVTR (F1249) ✅

**Updated BOPP total: 21 params** (was 19)

### 8.2 CPP — Change Summary

**Sealing is the entire purpose of CPP.** User explicitly flagged: "CPP sealing temperature is very important."

| Change | Old | New | Reason |
|--------|-----|-----|--------|
| Keep `seal_init_temp_c` | ✅ Required | ✅ Required (SIT) | Already correctly marked required |
| Add param #22 | — | `seal_range_temp_c` — Sealing Window (°C text, e.g., "120-160") | Width of the sealing range is critical for process control |
| Param `gloss_45` | Gloss 45° | `gloss_60` — Gloss 60° (GU) | Same 60° correction as BOPP |

**Validation cross-check (QC templates):**
- Tensile MD ≥60 MPa, Elongation ≥500%, COF Static 0.2–0.5 ✅
- Seal Strength ≥2.5 N/15mm ✅
- Hot tack temp + strength included ✅
- OTR, WVTR included ✅

**Updated CPP total: 22 params** (was 21)

### 8.3 PET — Change Summary

| Change | Old | New | Reason |
|--------|-----|-----|--------|
| Add param #20 | — | `solvent_retention_mg_m2` — Solvent Retention (mg/m²) | QC template: "Solvent Retention ≤10 mg/m²" for printed PET |
| Param `gloss_60` | Already 60° | ✅ Keep | Correct per ASTM D2457 |

**Validation cross-check (QC templates):**
- Tensile MD/TD, Elongation MD/TD ✅
- Shrinkage MD/TD (150°C/30min for standard BOPET) ✅
- OTR, WVTR ✅
- Optical Density ≥2.2 for metalized ✅
- Metal Bond Strength ✅

**Updated PET total: 20 params** (was 19)

### 8.4 PA (Nylon) — Change Summary

| Change | Old | New | Reason |
|--------|-----|-----|--------|
| Add param #16 | — | `cof_static` — COF Static | PA films have COF spec on TDS; needed for converting |
| Add param #17 | — | `cof_kinetic` — COF Kinetic | Kinetic friction for machine speed |

**Validation cross-check (QC templates):**
- Tensile MD ≥80 MPa ✅
- Elongation ≥300% ✅
- Puncture ≥15 N/mm (F1306) ✅
- Seal ≥3.0 N/15mm ✅
- OTR ≤1.0 (excellent O₂ barrier) ✅
- WVTR ≤5.0 — **Note:** QC has ≤5.0 but PA is poor moisture barrier (50–300 g/m²/day for thicker films). QC template likely references laminated PA/PE, not standalone PA. For standalone PA TDS, WVTR range should be 10–300 g/m²/day.
- `moisture_content_pct` critical for hygroscopic PA ✅

**Updated PA total: 17 params** (was 15)

### 8.5 PVC / PETC / PETG — MAJOR REDESIGN: Shrink Curve

**The single biggest finding from research.** User specifically asked: "there are shrink curves where the film shrinks based on a specific temperature — how to add these in the specs?"

#### The Problem
Current plan has `shrinkage_md_pct` and `shrinkage_td_pct` as single values. But shrink film TDS data provides a **shrink curve** — shrinkage % at multiple temperature points. This is the defining characteristic of shrink film and the key differentiator between grades.

#### ASTM D2732 — Unrestrained Linear Thermal Shrinkage
The standard test method measures free shrinkage of film specimens at elevated temperatures. Suppliers test at multiple temperatures to generate a characteristic curve.

#### Typical Shrink Curve Data Points
```
PVC Shrink 40µm:        PETG Shrink 50µm:        PET-C Shrink 45µm:
60°C: MD=2%, TD=1%      60°C: MD=5%, TD=2%       60°C: MD=3%, TD=1%
70°C: MD=10%, TD=3%     65°C: MD=15%, TD=5%      70°C: MD=12%, TD=4%
80°C: MD=30%, TD=8%     70°C: MD=35%, TD=10%     80°C: MD=30%, TD=8%
90°C: MD=55%, TD=12%    75°C: MD=55%, TD=15%     90°C: MD=50%, TD=12%
100°C: MD=65%, TD=15%   80°C: MD=65%, TD=18%     100°C: MD=60%, TD=15%
```

#### Data Structure: JSONB shrink_curve Array
Since `mes_non_resin_material_specs.parameters_json` is already JSONB, the shrink curve stores naturally:

```json
{
  "thickness_mic": 40,
  "density_g_cm3": 1.35,
  "shrinkage_md_pct_max": 65,
  "shrinkage_td_pct_max": 15,
  "shrink_onset_temp_c": 60,
  "shrink_curve": [
    { "temp_c": 60, "md_pct": 2, "td_pct": 1 },
    { "temp_c": 70, "md_pct": 10, "td_pct": 3 },
    { "temp_c": 80, "md_pct": 30, "td_pct": 8 },
    { "temp_c": 90, "md_pct": 55, "td_pct": 12 },
    { "temp_c": 100, "md_pct": 65, "td_pct": 15 }
  ],
  "natural_shrink_pct": 2,
  ...
}
```

**Advantages:**
1. Variable number of data points per supplier TDS
2. No schema migration needed — already JSONB
3. Can be charted (Ant Design / ECharts line chart of temp vs shrinkage)
4. Aggregation: Item Master can average the max shrinkage or interpolate curves

#### UI: Shrink Curve Editor Component (Sprint B)
In the Material Specs form for PVC/PETC/PETG films, add:
- **Scalar fields** at top: thickness, density, max shrinkage MD/TD, onset temp, natural shrink
- **Curve editor** below: table with rows [temp_c, md_pct, td_pct] + "Add row" button
- **Chart preview**: line chart showing MD (blue) and TD (orange) curves vs temperature

#### Updated PVC Schema (16 params + curve)

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 10 | 100 | |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.25 | 1.45 | ~1.35 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 7 | 80 | |
| 4 | `haze_pct` | Haze | % | | 0.5 | 10 | |
| 5 | `gloss_60` | Gloss 60° | GU | | 50 | 150 | |
| 6 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 30 | 100 | |
| 7 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 30 | 100 | |
| 8 | `elongation_md_pct` | Elongation MD | % | | 50 | 400 | |
| 9 | `elongation_td_pct` | Elongation TD | % | | 50 | 300 | |
| 10 | `shrinkage_md_pct_max` | Max Shrinkage MD | % | ✅ | 5 | 80 | Free shrink at max test temp |
| 11 | `shrinkage_td_pct_max` | Max Shrinkage TD | % | ✅ | 1 | 30 | |
| 12 | `shrink_onset_temp_c` | Shrink Onset Temp | °C | | 50 | 90 | Temperature where shrinkage starts |
| 13 | `shrink_tunnel_temp_c` | Recommended Tunnel Temp | °C | | 70 | 120 | Supplier recommendation |
| 14 | `shrink_force_n` | Shrink Force | N | | 0.1 | 10 | Force during shrinking (label fit) |
| 15 | `natural_shrink_pct` | Natural Shrink | % | | 0 | 5 | Ambient shrinkage (shelf life) |
| 16 | `shrink_curve` | Shrink Curve | JSONB array | | — | — | `[{temp_c, md_pct, td_pct}, ...]` per ASTM D2732 |

#### Updated PETC/PETG Schema (same structure, different ranges)

| # | Key | Label | Unit | Required | Min | Max | Notes |
|---|-----|-------|------|----------|-----|-----|-------|
| 1 | `thickness_mic` | Thickness | µm | ✅ | 20 | 80 | |
| 2 | `density_g_cm3` | Density | g/cm³ | ✅ | 1.25 | 1.40 | PETG ~1.27, PETC ~1.33 |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | | 8 | 40 | |
| 4 | `haze_pct` | Haze | % | | 0.5 | 10 | |
| 5 | `gloss_60` | Gloss 60° | GU | | 50 | 150 | |
| 6 | `tensile_strength_md_mpa` | Tensile MD | MPa | | 40 | 200 | |
| 7 | `tensile_strength_td_mpa` | Tensile TD | MPa | | 40 | 200 | |
| 8 | `elongation_md_pct` | Elongation MD | % | | 20 | 300 | |
| 9 | `elongation_td_pct` | Elongation TD | % | | 20 | 200 | |
| 10 | `shrinkage_md_pct_max` | Max Shrinkage MD | % | ✅ | 5 | 80 | |
| 11 | `shrinkage_td_pct_max` | Max Shrinkage TD | % | ✅ | 1 | 20 | |
| 12 | `shrink_onset_temp_c` | Shrink Onset Temp | °C | | 50 | 80 | PETG has lower onset than PVC |
| 13 | `shrink_tunnel_temp_c` | Recommended Tunnel Temp | °C | | 60 | 100 | |
| 14 | `shrink_force_n` | Shrink Force | N | | 0.1 | 10 | |
| 15 | `natural_shrink_pct` | Natural Shrink | % | | 0 | 5 | |
| 16 | `shrink_curve` | Shrink Curve | JSONB array | | — | — | Same structure as PVC |

**Updated PVC total: 16 params + curve** (was 11)
**Updated PETC/PETG total: 16 params + curve** (was 11)

### 8.6 PAP — No Changes Needed

14 params are comprehensive for paper substrates. The Cobb test, burst strength, porosity, brightness, opacity and smoothness cover all standard paper TDS parameters per WALKI and FlexPak-Rotocote TDS files in `TDS PAP/`.

### 8.7 Alu/Pap — No Changes Needed

9 params adequate for this specialty product (butter foil laminate). The WALKI TDS files (75µ and 95µ) primarily specify total thickness, alu thickness, paper grammage, dead fold, and barrier.

### 8.8 PE Lamination — No Changes Needed

12 params match standard PE lamination TDS data: MFI, seal temp, dart drop, COF, and tensile.

### 8.9 Global Changes

| Change | Scope | Details |
|--------|-------|---------|
| Gloss angle | BOPP, CPP, PVC, PETC/PETG | All change from `gloss_45` to `gloss_60` (ASTM D2457 standard) |
| Shrink curve component | PVC, PETC, PETG | New ShrinkCurveEditor React component needed for Sprint B |
| Shrink curve aggregation | Sprint C | `/substrate-profile` must handle shrink_curve averaging — interpolate at common temps or average max values only |

---

## 9. Final Parameter Count Summary

| Substrate | Original Count | Revised Count | Key Additions |
|-----------|---------------|---------------|---------------|
| BOPP | 19 | **21** | Tear MD/TD, Gloss 60° correction |
| CPP | 21 | **22** | Sealing window range, Gloss 60° |
| PET | 19 | **20** | Solvent retention |
| PA | 15 | **17** | COF static/kinetic |
| PAP | 14 | **14** | No change |
| PVC | 11 | **16 + curve** | Shrink curve JSONB, elongation, onset temp, shrink force |
| PETC/PETG | 11 | **16 + curve** | Same as PVC with different ranges |
| Alu/Pap | 9 | **9** | No change |
| PE | 12 | **12** | No change |
| **Total unique params** | | **~147 + curves** | |

---

## 10. Sprint A Priority Adjustments

Based on research, Sprint A implementation order should be:

1. **BOPP schema** — most Oracle inventory rows (40), most TDS PDFs (24 files), highest usage
2. **CPP schema** — critical for sealant layer, sealing temp is essential for estimation
3. **PET schema** — 31 Oracle rows, common substrate
4. **PVC + PETC/PETG schemas** — shrink curve component adds complexity; implement together
5. **PA, PAP, Alu/Pap, PE schemas** — lower volume, simpler schemas
