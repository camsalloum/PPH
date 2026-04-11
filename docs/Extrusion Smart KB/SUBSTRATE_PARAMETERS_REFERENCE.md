# Substrate & Film Parameters — Technical Reference

> **Smart MES Knowledge Base** — ProPackHub v26.4
> Last updated: 2026-04-04
> Purpose: Machine-readable parameter reference for Material Specs, QC Lab, Estimation, and AI-driven spec recommendation.

---

## 1. Overview

Flexible packaging uses multiple substrate types as structural, barrier, sealant, and decorative layers. Each substrate has a distinct set of **Technical Data Sheet (TDS)** parameters that define its performance. This document catalogues every parameter per substrate type, with ASTM/ISO test methods, typical ranges, and criticality for downstream modules (Estimation, QC, Production).

### Material Classification Hierarchy

```
Raw Material
├── Resins (PE, PP, EVA, mPE, ionomer…)    → mes_material_tds (14 fixed columns)
└── Non-Resins                               → mes_non_resin_material_specs (JSONB)
    ├── Films / Substrates
    │   ├── BOPP (Biaxially Oriented Polypropylene)
    │   ├── CPP  (Cast Polypropylene)
    │   ├── PET  (Polyethylene Terephthalate, BOPET)
    │   ├── PA   (Polyamide / Nylon, BOPA)
    │   ├── PE   (Polyethylene Lamination Film)
    │   ├── PVC  (Polyvinyl Chloride — Shrink)
    │   ├── PETC (PET Crystalline — Shrink)
    │   ├── PETG (PET Glycol-modified — Shrink)
    │   └── PAP  (Paper)
    ├── Alu/Pap (Aluminium-Paper Laminate)
    ├── Aluminium Foil
    ├── Adhesives
    ├── Inks / Chemicals
    ├── Coatings
    ├── Additives
    ├── Packing Materials
    └── Mounting Tapes
```

---

## 2. ASTM / ISO Test Method Reference

| Code | Standard | Parameter | Specimen |
|------|----------|-----------|----------|
| ASTM D882 | Tensile Properties of Thin Plastic Sheeting | Tensile Strength, Elongation at Break | Film strip |
| ASTM D1003 | Haze and Luminous Transmittance | Haze % | Film disc |
| ASTM D1204 | Unrestrained Linear Thermal Shrinkage (low temp) | Dimensional change % | Film specimen |
| ASTM D1894 | Static and Kinetic Coefficients of Friction | COF | Film-to-film or film-to-metal |
| ASTM D1922 | Propagation Tear Resistance (Elmendorf) | Tear Strength mN | Film strip |
| ASTM D2457 | Specular Gloss of Plastic Films | Gloss at 60° (GU) | Film surface |
| ASTM D2732 | Unrestrained Linear Thermal Shrinkage (heat tunnel) | Free Shrinkage % at temp | Film specimen in oven |
| ASTM D2838 | Shrink Tension and Orientation Release Stress | Shrink force / tension | Film in restrained holder |
| ASTM D3985 | Oxygen Transmission Rate (OTR) | cc/m²/24h | Film disc in cell |
| ASTM F1249 | Water Vapour Transmission Rate (WVTR/MVTR) | g/m²/24h | Film disc in cell |
| ASTM F88 | Seal Strength of Flexible Barrier Materials | N/15mm | Heat-sealed pouch strip |
| ASTM F1306 | Slow Rate Penetration Resistance (Puncture) | N/mm | Film disc, probe |
| ASTM D6988 | Thickness of Plastic Film | µm | Micrometer |
| ISO 2528 | WVTR (gravimetric method) | g/m²/24h | Film specimen |
| ISO 14616 | Heat Shrinkable Film — Determination of Free Shrink | % per direction | Heat tunnel |

---

## 3. Parameter Definitions by Substrate Type

### Notation
- **Req** = Required on save
- **Agg** = Aggregated in Item Master (weighted avg by stock)
- **QC** = Tested in QC Lab module
- Type column: `N` = numeric, `T` = text, `J` = JSONB array

---

### 3.1 BOPP — Biaxially Oriented Polypropylene

**Applications:** Printed laminate overwrap, snack packaging, label stock, metallised barrier films.
**Base polymer:** Isotactic polypropylene, density 0.895–0.93 g/cm³, melting 160–166 °C.
**Orientation:** Biaxial stretching (5–10× MD, 8–10× TD) creates high clarity, stiffness, barrier.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 10 | 60 | | Typical: 15, 18, 20, 25, 30, 40 |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 0.89 | 0.93 | | 0.905 plain, 0.91 treated |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | N | | ✅ | | 20 | 120 | | Calculated: 1000/(density × thickness) |
| 4 | `haze_pct` | Haze | % | N | | ✅ | D1003 | 0.3 | 10 | | <1.5% premium, <2.5% standard |
| 5 | `gloss_60` | Gloss 60° | GU | N | | ✅ | D2457 | 60 | 150 | | ≥85 standard, ≥90 premium |
| 6 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 100 | 250 | | ≥120 typical |
| 7 | `tensile_strength_td_mpa` | Tensile Strength TD | MPa | N | | ✅ | D882 | 150 | 350 | | ≥200 typical |
| 8 | `elongation_md_pct` | Elongation at Break MD | % | N | | ✅ | D882 | 50 | 250 | | ≥100 typical |
| 9 | `elongation_td_pct` | Elongation at Break TD | % | N | | ✅ | D882 | 20 | 100 | | ≥50 typical |
| 10 | `cof_static` | COF Static | — | N | | ✅ | D1894 | 0.1 | 1.0 | | Plain: 0.2–0.4, treated may vary |
| 11 | `cof_kinetic` | COF Kinetic | — | N | | ✅ | D1894 | 0.05 | 0.8 | | 0.1–0.3 typical |
| 12 | `corona_dyne` | Corona Treatment | dyne/cm | N | | | | 32 | 50 | | ≥38 for printing, ≥42 for lamination |
| 13 | `shrinkage_md_pct` | Shrinkage MD (150°C/30min) | % | N | | | | 0 | 10 | D2732 | <3% standard BOPP |
| 14 | `shrinkage_td_pct` | Shrinkage TD (150°C/30min) | % | N | | | | 0 | 5 | D2732 | <1.5% standard BOPP |
| 15 | `otr_cc_m2_day` | OTR | cc/m²/24h | N | | ✅ | D3985 | 100 | 3000 | | ~1600 @20µm; metallised: <50 |
| 16 | `wvtr_g_m2_day` | WVTR | g/m²/24h | N | | ✅ | F1249 | 1 | 20 | | ~6 @20µm; metallised: <1 |
| 17 | `seal_strength_n_15mm` | Seal Strength | N/15mm | N | | ✅ | F88 | 0.5 | 10 | | Heat-sealable grades only |
| 18 | `treatment_side` | Treatment Side | — | T | | | | — | — | | "One side" / "Both sides" / "None" |
| 19 | `surface_type` | Surface Type | — | T | | | | — | — | | "Plain", "Metallised", "Coated", "Matte" |
| 20 | `tear_strength_md_mn` | Tear Strength MD | mN | N | | ✅ | D1922 | 20 | 500 | | Elmendorf tear, lower in MD |
| 21 | `tear_strength_td_mn` | Tear Strength TD | mN | N | | ✅ | D1922 | 50 | 1000 | | Higher in TD due to orientation |

**Metallised BOPP additional context:**
- Optical Density (OD): ≥2.2 for high-barrier metallised
- Metal adhesion (scotch-tape test): qualitative pass/fail
- OTR drops from ~1600 to <50 cc/m²/24h
- WVTR drops from ~6 to <1 g/m²/24h

---

### 3.2 CPP — Cast Polypropylene

**Applications:** Sealant layer in laminations, retort pouches (RCPP), stand-up pouches, wicketed bags.
**Base polymer:** Isotactic PP (cast, not oriented), density 0.90–0.91 g/cm³, melting 130–171°C.
**Key characteristic:** Sealing layer — SIT (Seal Initiation Temperature) is THE critical parameter.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 15 | 100 | | 20, 25, 30, 40, 50, 60, 70 |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 0.89 | 0.92 | | ~0.90 homo, ~0.89 random copo |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | N | | ✅ | | 10 | 70 | | |
| 4 | `haze_pct` | Haze | % | N | | ✅ | D1003 | 0.5 | 10 | | <2% RCPP, <4% general |
| 5 | `gloss_60` | Gloss 60° | GU | N | | ✅ | D2457 | 60 | 130 | | ≥80 typical |
| 6 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 30 | 100 | | ≥60 typical |
| 7 | `tensile_strength_td_mpa` | Tensile Strength TD | MPa | N | | ✅ | D882 | 30 | 80 | | Lower than MD (not oriented) |
| 8 | `elongation_md_pct` | Elongation at Break MD | % | N | | ✅ | D882 | 200 | 800 | | ≥500 typical |
| 9 | `elongation_td_pct` | Elongation at Break TD | % | N | | ✅ | D882 | 200 | 800 | | |
| 10 | `cof_static` | COF Static | — | N | | ✅ | D1894 | 0.1 | 1.0 | | 0.2–0.5 |
| 11 | `cof_kinetic` | COF Kinetic | — | N | | ✅ | D1894 | 0.05 | 0.8 | | |
| 12 | `seal_init_temp_c` | Seal Initiation Temp (SIT) | °C | N | **✅** | ✅ | | 90 | 160 | | **CRITICAL.** Lower = faster line speed |
| 13 | `seal_strength_n_15mm` | Seal Strength | N/15mm | N | | ✅ | F88 | 1 | 15 | | ≥2.5 typical, ≥5 retort |
| 14 | `hot_tack_temp_c` | Hot Tack Temperature | °C | N | | ✅ | | 90 | 160 | | First temp achieving ≥1 N/15mm |
| 15 | `hot_tack_strength_n_15mm` | Hot Tack Strength | N/15mm | N | | ✅ | | 0.5 | 10 | | |
| 16 | `otr_cc_m2_day` | OTR | cc/m²/24h | N | | ✅ | D3985 | 500 | 5000 | | ~3000 @25µm |
| 17 | `wvtr_g_m2_day` | WVTR | g/m²/24h | N | | ✅ | F1249 | 2 | 30 | | ~8 @25µm |
| 18 | `corona_dyne` | Corona Treatment | dyne/cm | N | | | | 32 | 50 | | |
| 19 | `dart_drop_g` | Dart Drop Impact | g | N | | ✅ | | 30 | 500 | | Staircase method |
| 20 | `puncture_resistance_n` | Puncture Resistance | N | N | | ✅ | F1306 | 2 | 30 | | RCPP: ≥10 N |
| 21 | `seal_range_temp_c` | Sealing Window | °C text | T | | | | — | — | | "120–160" — width of usable range |
| 22 | `surface_type` | Surface Type | — | T | | | | — | — | | "Plain", "Matte", "Anti-fog", "Metallised" |

**Retort CPP (RCPP) specific:**
- Must survive 121°C / 30min or 135°C / 10min sterilisation
- SIT typically 135–145°C (higher than general CPP)
- Seal strength ≥5 N/15mm after retort
- Haze may increase after retort (acceptable if ≤5%)

---

### 3.3 PET — Polyethylene Terephthalate (BOPET)

**Applications:** Printing substrate, barrier layer, lamination, window pouches, metallised barrier.
**Base polymer:** PET, density 1.33–1.40 g/cm³ (amorphous 1.38, crystalline 1.455), Tg 67–81°C.
**Orientation:** Biaxially oriented (BOPET), high tensile, excellent printability, dimensional stability.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 6 | 50 | | 12, 15, 19, 23, 25, 36 |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 1.33 | 1.41 | | ~1.39 typical BOPET |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | N | | ✅ | | 18 | 120 | | |
| 4 | `haze_pct` | Haze | % | N | | ✅ | D1003 | 0.5 | 10 | | <2% standard, <1% premium |
| 5 | `gloss_60` | Gloss 60° | GU | N | | ✅ | D2457 | 70 | 180 | | ≥120 typical |
| 6 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 100 | 300 | | ≥180 typical |
| 7 | `tensile_strength_td_mpa` | Tensile Strength TD | MPa | N | | ✅ | D882 | 100 | 300 | | ≥200 typical |
| 8 | `elongation_md_pct` | Elongation at Break MD | % | N | | ✅ | D882 | 50 | 200 | | ~120% |
| 9 | `elongation_td_pct` | Elongation at Break TD | % | N | | ✅ | D882 | 50 | 200 | | ~100% |
| 10 | `shrinkage_md_pct` | Shrinkage MD (150°C/30min) | % | N | | | | 0 | 5 | D2732 | <1.5% dimensionally stable |
| 11 | `shrinkage_td_pct` | Shrinkage TD (150°C/30min) | % | N | | | | 0 | 3 | D2732 | <0.5% typical |
| 12 | `otr_cc_m2_day` | OTR | cc/m²/24h | N | | ✅ | D3985 | 10 | 200 | | ~50 @12µm; metallised: <1 |
| 13 | `wvtr_g_m2_day` | WVTR | g/m²/24h | N | | ✅ | F1249 | 2 | 30 | | ~15 @12µm; metallised: <0.5 |
| 14 | `corona_dyne` | Corona Treatment | dyne/cm | N | | | | 38 | 56 | | ≥42 for printing, ≥48 for metallising |
| 15 | `cof_static` | COF Static | — | N | | ✅ | D1894 | 0.1 | 0.8 | | |
| 16 | `cof_kinetic` | COF Kinetic | — | N | | ✅ | D1894 | 0.05 | 0.6 | | |
| 17 | `optical_density` | Optical Density (Metallised) | — | N | | ✅ | | 1.5 | 3.5 | | ≥2.2 high-barrier, ≥2.5 ultra |
| 18 | `surface_type` | Surface Type | — | T | | | | — | — | | "Plain", "Chemically treated", "Metallised", "Matte" |
| 19 | `treatment_side` | Treatment Side | — | T | | | | — | — | | |
| 20 | `solvent_retention_mg_m2` | Solvent Retention | mg/m² | N | | | QC | 0 | 30 | | ≤10 for print; food safety critical |

**BOPET Intrinsic Viscosity (IV):** 0.60–0.70 dL/g (affects tensile + barrier). Not typically on TDS but relevant for resin selection.

---

### 3.4 PA — Polyamide (Nylon, BOPA)

**Applications:** Thermoforming, retort pouches, vacuum bags, high-puncture applications.
**Base polymer:** PA6 or PA6,6; density 1.12–1.15 g/cm³, Tg 47–57°C, melting 220–260°C.
**Key characteristic:** Excellent puncture resistance, O₂ barrier, thermoformability. Hygroscopic — absorbs moisture (2–3% equilibrium).

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 10 | 50 | | 15, 25 most common |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 1.10 | 1.16 | | ~1.14 BOPA |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | N | | ✅ | | 17 | 90 | | |
| 4 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 60 | 200 | | ≥80 typical |
| 5 | `tensile_strength_td_mpa` | Tensile Strength TD | MPa | N | | ✅ | D882 | 60 | 200 | | |
| 6 | `elongation_md_pct` | Elongation at Break MD | % | N | | ✅ | D882 | 50 | 500 | | ≥300 for thermoformability |
| 7 | `elongation_td_pct` | Elongation at Break TD | % | N | | ✅ | D882 | 50 | 500 | | |
| 8 | `puncture_resistance_n_mm` | Puncture Resistance | N/mm | N | | ✅ | F1306 | 5 | 40 | | ≥15 typical, key differentiator |
| 9 | `otr_cc_m2_day` | OTR | cc/m²/24h | N | | ✅ | D3985 | 5 | 100 | | ~30 @15µm @0%RH; degrades with moisture |
| 10 | `wvtr_g_m2_day` | WVTR | g/m²/24h | N | | ✅ | F1249 | 50 | 500 | | Poor moisture barrier: 90–300 |
| 11 | `corona_dyne` | Corona Treatment | dyne/cm | N | | | | 38 | 56 | | |
| 12 | `haze_pct` | Haze | % | N | | ✅ | D1003 | 1 | 10 | | ~3% BOPA |
| 13 | `moisture_content_pct` | Moisture Content | % | N | | ✅ | | 0 | 5 | | **Critical.** 2–3% equilibrium; affects OTR + processing |
| 14 | `seal_strength_n_15mm` | Seal Strength | N/15mm | N | | ✅ | F88 | 1 | 15 | | Sealable PA grades only |
| 15 | `thermoformability` | Thermoformability | — | T | | | | — | — | | "Standard" / "Deep draw" / "Not formable" |
| 16 | `cof_static` | COF Static | — | N | | ✅ | D1894 | 0.2 | 1.0 | | |
| 17 | `cof_kinetic` | COF Kinetic | — | N | | ✅ | D1894 | 0.1 | 0.8 | | |

**Note on PA OTR:** The oxygen barrier degrades significantly with humidity. At 0% RH: ~30 cc/m²/24h; at 80% RH: ~150 cc/m²/24h. Always pair PA with PE sealant for moisture protection.

---

### 3.5 PE — Polyethylene Lamination Film

**Applications:** Sealant layer for lamination, stand-up pouch sealant, heavy-duty bags.
**Types:** LDPE, LLDPE, mLLDPE (metallocene), HDPE; density 0.915–0.965 g/cm³.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 15 | 200 | | |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 0.90 | 0.97 | | LDPE 0.918, LLDPE 0.920, HDPE 0.95 |
| 3 | `mfi_g_10min` | Melt Flow Index | g/10min | N | | ✅ | | 0.1 | 30 | | Higher = easier extrusion coat |
| 4 | `seal_temp_min_c` | Sealing Temp Min | °C | N | | ✅ | | 80 | 150 | | |
| 5 | `seal_temp_max_c` | Sealing Temp Max | °C | N | | ✅ | | 120 | 200 | | |
| 6 | `seal_strength_n_15mm` | Seal Strength | N/15mm | N | | ✅ | F88 | 1 | 20 | | |
| 7 | `dart_drop_g` | Dart Drop Impact | g | N | | ✅ | | 50 | 1000 | | |
| 8 | `cof_static` | COF Static | — | N | | ✅ | D1894 | 0.1 | 1.0 | | |
| 9 | `cof_kinetic` | COF Kinetic | — | N | | ✅ | D1894 | 0.1 | 0.8 | | |
| 10 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 10 | 50 | | |
| 11 | `elongation_md_pct` | Elongation MD | % | N | | ✅ | D882 | 100 | 800 | | |
| 12 | `corona_dyne` | Corona Treatment | dyne/cm | N | | | | 32 | 50 | | |

---

### 3.6 PAP — Paper

**Applications:** Label face stock, paper-based flexible packaging, sustainable mono-material, butter wrap.
**Types:** MG Kraft, Bleached Kraft, Greaseproof, Glassine, Clay-coated.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `grammage_gsm` | Grammage | g/m² | N | ✅ | ✅ | | 20 | 200 | | Weight per area (replaces thickness for paper) |
| 2 | `thickness_mic` | Thickness (Caliper) | µm | N | | ✅ | | 20 | 300 | | |
| 3 | `density_g_cm3` | Apparent Density | g/cm³ | N | | ✅ | | 0.6 | 1.3 | | |
| 4 | `tensile_strength_md_kn_m` | Tensile MD | kN/m | N | | ✅ | | 1 | 20 | | Paper uses kN/m not MPa |
| 5 | `tensile_strength_td_kn_m` | Tensile TD | kN/m | N | | ✅ | | 0.5 | 15 | | |
| 6 | `elongation_md_pct` | Elongation MD | % | N | | ✅ | | 1 | 15 | | Low for paper |
| 7 | `burst_strength_kpa` | Burst Strength (Mullen) | kPa | N | | ✅ | | 50 | 800 | | |
| 8 | `tear_strength_md_mn` | Tear MD (Elmendorf) | mN | N | | ✅ | D1922 | 100 | 2000 | | |
| 9 | `cobb_60_g_m2` | Cobb 60 (Water Absorption) | g/m² | N | | ✅ | | 15 | 200 | | <30 = good water resistance |
| 10 | `porosity_sec` | Porosity (Gurley) | sec/100ml | N | | | | 5 | 5000 | | Higher = less porous |
| 11 | `brightness_pct` | Brightness (ISO) | % | N | | | | 40 | 100 | | >80% bleached |
| 12 | `opacity_pct` | Opacity | % | N | | | | 50 | 100 | | |
| 13 | `smoothness_sec` | Smoothness (Bekk) | sec | N | | | | 5 | 500 | | Print side quality |
| 14 | `moisture_content_pct` | Moisture Content | % | N | | | | 3 | 10 | | 6–8% typical; affects curl |

---

### 3.7 PVC — Polyvinyl Chloride (Shrink Film)

**Applications:** Shrink sleeves, shrink bands, tamper-evident, bottle labels, multi-packs.
**Base polymer:** PVC + plasticiser, density 1.25–1.45 g/cm³, Tg 82°C.
**Key characteristic:** High shrinkage at low temperature. Shrinkage is temperature-dependent — data is a CURVE, not a single value.

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | ASTM | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|------|-------|
| 1 | `thickness_mic` | Thickness | µm | N | ✅ | ✅ | D6988 | 10 | 100 | | 40, 45, 50 common |
| 2 | `density_g_cm3` | Density | g/cm³ | N | ✅ | ✅ | | 1.25 | 1.45 | | ~1.35 typical |
| 3 | `yield_m2_per_kg` | Yield | m²/kg | N | | ✅ | | 7 | 80 | | |
| 4 | `haze_pct` | Haze | % | N | | ✅ | D1003 | 0.5 | 10 | | <5% per QC template |
| 5 | `gloss_60` | Gloss 60° | GU | N | | ✅ | D2457 | 50 | 150 | | |
| 6 | `tensile_strength_md_mpa` | Tensile Strength MD | MPa | N | | ✅ | D882 | 30 | 100 | | |
| 7 | `tensile_strength_td_mpa` | Tensile Strength TD | MPa | N | | ✅ | D882 | 30 | 100 | | |
| 8 | `elongation_md_pct` | Elongation MD | % | N | | ✅ | D882 | 50 | 400 | | |
| 9 | `elongation_td_pct` | Elongation TD | % | N | | ✅ | D882 | 50 | 300 | | |
| 10 | `shrinkage_md_pct_max` | Max Free Shrinkage MD | % | N | ✅ | ✅ | D2732 | 5 | 80 | | At max test temperature |
| 11 | `shrinkage_td_pct_max` | Max Free Shrinkage TD | % | N | ✅ | ✅ | D2732 | 1 | 30 | | |
| 12 | `shrink_onset_temp_c` | Shrink Onset Temperature | °C | N | | ✅ | | 50 | 90 | | Where shrinkage begins |
| 13 | `shrink_tunnel_temp_c` | Recommended Tunnel Temp | °C | N | | | | 70 | 120 | | Supplier recommendation |
| 14 | `shrink_force_n` | Shrink Force | N | N | | ✅ | D2838 | 0.1 | 10 | | Label fit tightness |
| 15 | `natural_shrink_pct` | Natural Shrink (ambient) | % | N | | | | 0 | 5 | | Shelf life impact |
| 16 | `shrink_curve` | Shrink Curve | JSONB | J | | | | — | — | D2732 | `[{temp_c, md_pct, td_pct}]` |

**Shrink Curve Data Format:**
```json
[
  {"temp_c": 60, "md_pct": 2,  "td_pct": 1},
  {"temp_c": 70, "md_pct": 10, "td_pct": 3},
  {"temp_c": 80, "md_pct": 30, "td_pct": 8},
  {"temp_c": 90, "md_pct": 55, "td_pct": 12},
  {"temp_c": 100,"md_pct": 65, "td_pct": 15}
]
```
Variable data points per supplier. Used for process optimisation — match tunnel temperature to required shrinkage.

---

### 3.8 PETC / PETG — PET Crystalline & Glycol-modified (Shrink Film)

**Applications:** Same as PVC shrink but superior: no chlorine, better recycling, higher clarity.
**PETG:** PET + CHDM comonomer → amorphous, easy to shrink, density ~1.27 g/cm³.
**PETC:** PET crystalline oriented → higher strength, density ~1.33 g/cm³.

Schema is identical to PVC (Section 3.7) with these range differences:

| Parameter | PVC Range | PETC/PETG Range | Notes |
|-----------|-----------|----------------|-------|
| `density_g_cm3` | 1.25–1.45 | 1.25–1.40 | PETG lighter than PVC |
| `thickness_mic` | 10–100 | 20–80 | |
| `shrink_onset_temp_c` | 50–90 | 50–80 | PETG has lower onset |
| `shrink_tunnel_temp_c` | 70–120 | 60–100 | PETG shrinks at lower temp |
| `tensile_strength_md_mpa` | 30–100 | 40–200 | PETC can be much stronger |
| `elongation_md_pct` | 50–400 | 20–300 | |

---

### 3.9 Alu/Pap — Aluminium-Paper Laminate

**Applications:** Butter wrap, cheese wrap, margarine, chocolate inner wrap.
**Structure:** Aluminium foil laminated to paper (typically 7–12µm alu + 30–60 g/m² paper).

| # | Key | Label | Unit | Type | Req | Agg | QC | Min | Max | Notes |
|---|-----|-------|------|------|-----|-----|-----|-----|-----|-------|
| 1 | `total_thickness_mic` | Total Thickness | µm | N | ✅ | ✅ | | 40 | 150 | Alu + paper combined |
| 2 | `alu_thickness_mic` | Aluminium Thickness | µm | N | | ✅ | | 5 | 20 | Typical: 7, 9, 12 |
| 3 | `paper_grammage_gsm` | Paper Grammage | g/m² | N | | ✅ | | 20 | 100 | |
| 4 | `total_grammage_gsm` | Total Grammage | g/m² | N | | ✅ | | 40 | 200 | |
| 5 | `dead_fold` | Dead Fold | — | T | | | | — | — | "Good" / "Excellent" |
| 6 | `seal_strength_n_15mm` | Seal Strength | N/15mm | N | | ✅ | | 0.5 | 10 | If heat-sealable coating |
| 7 | `wvtr_g_m2_day` | WVTR | g/m²/24h | N | | ✅ | | 0 | 2 | Near-zero with intact alu |
| 8 | `otr_cc_m2_day` | OTR | cc/m²/24h | N | | ✅ | | 0 | 1 | Near-zero with intact alu |
| 9 | `surface_finish` | Surface Finish | — | T | | | | — | — | "Bright", "Matte", "Embossed" |

---

### 3.10 Aluminium Foil (standalone)

Already handled by `films_alu_foil` schema (26 params) — see existing `NON_RESIN_PARAM_SCHEMAS` in TDSManager.jsx. No changes needed.

---

## 4. Cross-Substrate Parameter Index

Quick lookup: which substrates share which parameters.

| Parameter Key | BOPP | CPP | PET | PA | PE | PVC | PETC/G | PAP | Alu/P |
|---------------|------|-----|-----|----|----|-----|--------|-----|-------|
| `thickness_mic` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `density_g_cm3` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `tensile_strength_md_mpa` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `elongation_md_pct` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `cof_static` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `haze_pct` | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `gloss_60` | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — | — |
| `otr_cc_m2_day` | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| `wvtr_g_m2_day` | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| `seal_strength_n_15mm` | ✅ | ✅ | — | ✅ | ✅ | — | — | — | ✅ |
| `corona_dyne` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `shrink_curve` | — | — | — | — | — | ✅ | ✅ | — | — |

---

## 5. Parameter Validation Rules

### Numeric Constraint Patterns
```javascript
// Thickness: must be positive, no more than 3 decimal places
thickness_mic: { min: 1, max: 500, decimals: 1 }

// Density: 2-3 decimal places
density_g_cm3: { min: 0.5, max: 2.0, decimals: 3 }

// Percentage: 0-100 or higher for elongation
elongation_md_pct: { min: 0, max: 1000, decimals: 1 }

// COF: dimensionless ratio
cof_static: { min: 0, max: 2.0, decimals: 3 }

// Barrier: very wide range (metallised vs plain)
otr_cc_m2_day: { min: 0, max: 10000, decimals: 1 }

// Shrink curve array: min 2 points, max 20
shrink_curve: { type: 'array', minItems: 2, maxItems: 20 }
// Each point: temp_c (30-200), md_pct (0-100), td_pct (0-100)
```

### Business Logic Validations
1. **Yield auto-calc:** If thickness and density present → `yield = 1000 / (density × thickness)`
2. **Shrink films:** If `shrinkage_md_pct_max` > 20%, substrate is likely shrink-intended
3. **Metallised films:** If `optical_density` > 0, flag as metallised → expect lower OTR/WVTR
4. **Retort CPP:** If `seal_init_temp_c` > 130, flag as RCPP → different quality checks

---

## 6. Smart MES Integration Points

### 6.1 Estimation Module
- Pull averaged parameters from Item Master substrate profile
- Use SIT/seal strength for sealing speed calculation
- Use OTR/WVTR for shelf-life estimation
- Match shrink curve to product container geometry

### 6.2 QC Lab Module
- Map TDS parameters to QC templates test methods
- Auto-generate incoming inspection checklists from material specs
- Traffic-light comparison: measured value vs TDS spec ± tolerance

### 6.3 AI Recommendation
- Suggest substitute materials with similar parameter profiles
- Predict cost impact of switching between grades
- Flag out-of-spec deliveries vs historical averages

### 6.4 Production / Job Card
- Auto-populate machine parameters from substrate specs (e.g., shrink tunnel temperature from TDS)
- Alert operators if substrate lot parameters differ from standard

---

## 7. Data Flow Architecture

```
TDS PDF Upload → Parse → mes_non_resin_material_specs (parameters_json JSONB)
                              ↓
                    Item Master Aggregation ← fp_actualrmdata (stock weights)
                              ↓
                    mes_item_master (substrate_profile JSONB)
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         Estimation      QC Templates    Production
         (spec lookup)   (test methods)  (machine params)
```
