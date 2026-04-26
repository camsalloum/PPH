# FILM EXTRUSION OPTIMIZATION — KNOWLEDGE BASE
> Smart Optimization Module · Based on Qenos Technical Guide · Version 1.0
> Source: *Film Extrusion and Conversion – Qenos Technical Guides*

---

## TABLE OF CONTENTS
1. [Resin Database](#1-resin-database)
2. [Grade Selection Logic](#2-grade-selection-logic)
3. [Product Target Profiles](#3-product-target-profiles)
4. [Processing Parameter Ranges](#4-processing-parameter-ranges)
5. [Formula Blending Rules](#5-formula-blending-rules)
6. [Additive System](#6-additive-system)
7. [Extruder Setup Rules](#7-extruder-setup-rules)
8. [Die & Bubble Optimization](#8-die--bubble-optimization)
9. [Cooling System Rules](#9-cooling-system-rules)
10. [Film Property Optimization Maps](#10-film-property-optimization-maps)
11. [Optical Property Optimization](#11-optical-property-optimization)
12. [Mechanical Property Optimization](#12-mechanical-property-optimization)
13. [Heat Shrink Optimization](#13-heat-shrink-optimization)
14. [Surface & Sealing Properties](#14-surface--sealing-properties)
15. [Troubleshooting Decision Trees](#15-troubleshooting-decision-trees)
16. [Optimization Scoring Rules](#16-optimization-scoring-rules)

---

## 1. RESIN DATABASE

### 1.1 LDPE — Alkathene

| Parameter | Value / Range |
|---|---|
| **Brand** | Alkathene |
| **MFI Range** | 0.3 – 6.0 g/10 min |
| **Density Range** | 0.920 – 0.925 g/cm³ |
| **Molecular Structure** | Broad MWD, 1–5 long-chain branches per 1,000 C atoms |
| **Chain Branching** | Long-chain + short-chain branching |
| **Melt Behaviour** | High shear-thinning, strain-hardening (tension-stiffening) |
| **Extensional Viscosity** | High — increases at higher strain (melt strength HIGH) |
| **Bubble Stability** | EXCELLENT — self-damping due to strain hardening |
| **Melt Fracture Risk** | LOW — wide MWD reduces critical shear rate |
| **Extruder Power** | 0.20–0.25 kWh/kg |
| **Typical Melt Temp** | 160–200°C (gradual increase profile along barrel) |
| **Die Gap (typical)** | 0.5–1.2 mm (0.5–0.8 mm for 50 µm film) |
| **Shrink Performance** | EXCELLENT for shrink film |
| **Clarity / Haze** | BEST optical properties (lowest haze) |
| **Hot Tack** | LOW |
| **Impact Strength** | HIGH |
| **Seal Strength** | MODERATE |

**Key Advantages:**
- Lower extruder power consumption
- Lower melt temperature
- Lower tendency to melt fracture
- Superior bubble stability
- Highest film clarity
- Excellent shrink film performance
- Good processing on conventional LDPE equipment

**Key Limitations:**
- Lower stiffness vs. LLDPE
- Lower tensile strength vs. LLDPE
- Lower puncture resistance
- Inferior hot tack vs. LLDPE

---

### 1.2 LLDPE — Alkatuff

| Parameter | Value / Range |
|---|---|
| **Brand** | Alkatuff |
| **MFI Range** | 0.8 – 2.5 g/10 min |
| **Density Range** | 0.918 – 0.935 g/cm³ |
| **Comonomer types** | Butene, Hexene, Octene |
| **Molecular Structure** | Narrow MWD, no long-chain branching, short-chain branches only |
| **Melt Behaviour** | Low shear-thinning, NO strain hardening |
| **Extensional Viscosity** | LOW — poor melt strength |
| **Bubble Stability** | POOR — not self-damping, sensitive to disturbances |
| **Melt Fracture Risk** | HIGH — critical shear rate reached earlier |
| **Extruder Power** | Up to 0.33 kWh/kg |
| **Typical Melt Temp** | 200–230°C (reverse or flat profile often recommended) |
| **Die Gap (typical)** | 1.5–3.0 mm (wide gap to avoid melt fracture) |
| **Shrink Performance** | POOR on its own |
| **Clarity / Haze** | WORSE than LDPE (crystallisation haze dominates) |
| **Hot Tack** | HIGH |
| **Impact Strength** | HIGH (especially at low temperatures) |
| **Seal Strength** | HIGH |
| **Stiffness** | Higher than LDPE |

**Comonomer Effect on Sealing (LLDPE):**

| Comonomer | Seal Strength | Hot Tack | Comment |
|---|---|---|---|
| Butene | Moderate | Moderate | Lowest performance |
| Hexene | High | High | Preferred for sealing |
| Octene | High | High | Best performance, similar to hexene |

**Key Advantages:**
- Higher stiffness and tensile strength
- Higher tear strength (variable)
- Higher puncture resistance
- Superior hot tack and seal strength
- Higher impact strength, especially at low temps
- Higher softening point → better heat resistance
- Better drawdown capability
- Better melt pumping efficiency per screw revolution
- Less sensitive to contamination in melt (wide gap)

**Key Limitations:**
- Requires higher extruder power
- Needs wider die gap (or processing aid)
- Bubble instability requires special cooling rings
- Worse optical properties than LDPE
- Worse shrink performance than LDPE
- Difficult slitting (tougher film)

---

### 1.3 mLLDPE — Alkamax

| Parameter | Value / Range |
|---|---|
| **Brand** | Alkamax |
| **MFI** | 1.0 g/10 min (typical) |
| **Density Range** | 0.917 – 0.926 g/cm³ |
| **Molecular Structure** | Narrow MWD, controlled side-branch distribution (metallocene catalyst) |
| **Extensional Viscosity** | LOW (similar to Alkatuff) |
| **Bubble Stability** | POOR (similar to LLDPE, possibly worse) |
| **Melt Fracture Risk** | HIGH (requires processing aid) |
| **Typical Melt Temp** | Similar to LLDPE |
| **Die Gap** | Wide gap required |
| **Clarity** | Better than standard LLDPE, lower blocking tendency |
| **Hot Tack** | VERY HIGH — best of all PE types |
| **Impact Strength** | VERY HIGH — best of all PE types |
| **Seal Strength** | VERY HIGH |
| **Blocking** | Lower tendency to block vs. LLDPE |

**Key Advantages over standard LLDPE:**
- Much higher impact strength
- Superior hot tack performance (wider temperature window)
- Lower blocking tendency
- Improved balance of viscosity and melt strength (controlled branching)
- Better sealing through contamination

---

### 1.4 HDPE — Alkatane

| Parameter | Value / Range |
|---|---|
| **Brand** | Alkatane |
| **MFI Range** | 0.1 – 0.8 g/10 min |
| **Density Range** | 0.949 – 0.960 g/cm³ |
| **Molecular Structure** | Narrow MWD, no long-chain branching, high crystallinity |
| **Bubble Shape** | Long stalk (neck height = 5–8× die diameter) |
| **Melt Fracture Risk** | HIGH (similar to LLDPE) |
| **Die Gap** | 1.0–1.5 mm |
| **Haze** | HIGH — not suitable for clarity applications |
| **Stiffness** | VERY HIGH |
| **Yield Strength** | VERY HIGH |
| **Creep Resistance** | EXCELLENT |
| **Gas Barrier** | BEST among PE types |
| **Shrink Performance** | POOR (by itself) |
| **COF** | Generally lower than LDPE/LLDPE |

**Permeability Comparison (25 µm film, 20°C, 1 atm):**

| Gas | LDPE (0.920) | HDPE (0.960) |
|---|---|---|
| O₂ (cm³/m²/24h) | 8,500 | 3,000 |
| N₂ (cm³/m²/24h) | 3,000 | 650 |
| CO₂ (cm³/m²/24h) | 38,000 | 9,000 |
| H₂O (g/m²/24h @ 38°C, 90%RH) | 18 | 8 |

---

### 1.5 Resin Comparison Matrix

| Property | LDPE | LLDPE | mLLDPE | HDPE |
|---|---|---|---|---|
| Haze | Low ✅ | Medium ⚠️ | Medium ⚠️ | High ❌ |
| Tensile Strength | Low | Medium | Medium | High ✅ |
| Elongation | Medium | Very High ✅ | Very High ✅ | High |
| Tear Resistance | Medium | Variable | Variable | Low ❌ |
| Impact Strength | High | High | Very High ✅ | Variable |
| Puncture Resistance | Low ❌ | Very High ✅ | Very High ✅ | Medium |
| Hot Tack | Low ❌ | High | Very High ✅ | N/A |
| Bubble Stability | Excellent ✅ | Poor ❌ | Poor ❌ | Poor ❌ |
| Optical Clarity | Best ✅ | Moderate | Moderate | Poor ❌ |
| Melt Fracture Risk | Low ✅ | High ❌ | High ❌ | High ❌ |
| Shrink Film Suitability | Excellent ✅ | Poor | Poor | Poor |
| Gas Barrier | Moderate | Moderate+ | Moderate+ | Best ✅ |
| Stiffness | Low | Medium | Medium | Very High ✅ |
| Creep Resistance | Low | Medium | Medium | High ✅ |
| Extruder Power | Low ✅ | High ❌ | High ❌ | High ❌ |

---

## 2. GRADE SELECTION LOGIC

### 2.1 MFI Effect on Film Properties

```
LOWER MFI → 
  + Better impact strength
  + Higher melt strength / bubble stability (LDPE)
  + Higher shrink tension
  + Better hot tack (for LLDPE)
  - Harder to extrude (higher torque, temperature)
  - More power required

HIGHER MFI →
  + Easier extrusion
  + Lower extruder power
  + Better flow during sealing (lower minimum seal temperature)
  + Better seal through contamination
  - Lower impact strength
  - Lower melt strength
  - Lower shrink tension
```

### 2.2 Density Effect on Film Properties

```
HIGHER DENSITY →
  + Higher stiffness
  + Higher tensile/yield strength
  + Better creep resistance
  + Better gas barrier
  + Lower permeability
  - Lower MD tear strength (film becomes "splitty")
  - Higher haze
  - Higher crystallinity
  - Reduced impact strength

LOWER DENSITY →
  + Better impact strength
  + Lower haze (better opticals)
  + More flexible
  - Lower stiffness
  - Lower tensile strength
  - Worse barrier
```

### 2.3 Grade Selection Decision Rules

```
IF target = high_clarity AND haze must be minimal:
    → Primary: LDPE (Alkathene)
    → Blend option: LDPE + up to 20% LLDPE

IF target = high_impact_strength AND clarity acceptable as hazy:
    → Primary: mLLDPE (Alkamax) OR LLDPE (Alkatuff)
    → Alternative: LDPE/LLDPE blend 60/40

IF target = hot_tack AND vertical_form_fill_seal:
    → Primary: mLLDPE (Alkamax) OR hexene/octene LLDPE
    → Surface seal layer: mLLDPE

IF target = shrink_film:
    → Primary: LDPE (Alkathene) MFI 0.3–3.5, density 0.920–0.922
    → Boost toughness: add up to 30% LLDPE or mLLDPE
    → Avoid: pure LLDPE or HDPE as base

IF target = stiffness AND creep_resistance (heavy-duty sack):
    → Primary: LLDPE + small % HDPE
    → HDPE density > 0.955 preferred for creep
    → Or: LDPE/LLDPE blend with small HDPE addition

IF target = gas_barrier (food packaging):
    → Primary: HDPE or coextrude with EVOH/Nylon layers
    → Higher density polymer preferred

IF target = downgauging (thin film, strong):
    → Primary: mLLDPE or hexene/octene LLDPE
    → Support: small % LDPE for processability

IF comonomer = butene:
    → Seal/tack performance LOWER than hexene or octene
    → Prefer hexene or octene LLDPE for sealing applications

IF application = stretch_wrap:
    → Cling on one side: coextrude with high-cling layer
    → Good elongation: LLDPE rich blend

IF application = agricultural_film OR pallet_wrap:
    → Good UV resistance additive required (not standard grades)
    → Mechanical properties: LLDPE or LDPE/LLDPE blend
```

---

## 3. PRODUCT TARGET PROFILES

### 3.1 General Packaging Film

| Parameter | Target | Priority |
|---|---|---|
| Haze | < 8% | HIGH |
| Gloss (45°) | > 60% | HIGH |
| See-through clarity | High | HIGH |
| Impact strength (dart drop) | > 100 g/25 µm | HIGH |
| MD tear strength | Balanced with TD | MEDIUM |
| Heat seal range | Wide (≥ 20°C window) | HIGH |
| COF (kinetic) | 0.10–0.35 | HIGH |
| Blocking | Low | HIGH |
| Corona treatment level | 38–40 mN/m | HIGH |
| Film gauge typical | 25–75 µm | — |

**Recommended Formula:** LDPE-rich or LDPE/LLDPE blend 70–80% LDPE / 20–30% LLDPE

---

### 3.2 Industrial Film (Heavy-Duty Sack)

| Parameter | Target | Priority |
|---|---|---|
| Impact strength | Very high | HIGH |
| Tear strength (MD + TD) | Balanced, high | HIGH |
| Snagging resistance | High | HIGH |
| Stiffness | Moderate–High | MEDIUM |
| Haze | Acceptable (can be high) | LOW |
| Sealing reliability | Good | HIGH |
| Creep resistance | Good | MEDIUM |
| COF (film-on-film) | Low (for stacking) | HIGH |
| Film gauge typical | 100–250 µm | — |

**Recommended Formula:** LLDPE (Alkatuff hexene) as base + 10–20% LDPE for processability; optionally small % HDPE for creep resistance

---

### 3.3 Shrink Film — Full Overwrap

| Parameter | Target | Priority |
|---|---|---|
| MD shrink @ 130°C | 60–80% | HIGH |
| TD shrink @ 130°C | 40–60% | HIGH |
| Shrink tension (MD) | High | HIGH |
| Clarity / Gloss | High | HIGH |
| Toughness (no holes under shrink) | Good | HIGH |
| Film gauge | 25–100 µm | — |

**BUR Required:** 2.5:1 – 4:1
**Recommended Formula:** Alkathene LDPE MFI 0.3–2.5, density 0.920–0.922 as primary (≥ 70%)

---

### 3.4 Shrink Film — Sleeve Wrap

| Parameter | Target | Priority |
|---|---|---|
| MD shrink @ 130°C | 60–80% | HIGH |
| TD shrink | < 30% | HIGH |
| Film gauge | 35–100 µm | — |

**BUR Required:** 1.5:1 – 2:1 (low BUR to bias toward MD shrink)
**Recommended Formula:** Alkathene LDPE MFI 0.3–1.5

---

### 3.5 Shrink Film — Pallet Wrap / Shrink Hood

| Parameter | Target | Priority |
|---|---|---|
| MD shrink | ~60% | HIGH |
| TD shrink | ~60% (balanced) | HIGH |
| Film gauge | 100–150 µm | — |

**BUR Required:** ~4:1 (for balanced shrink)
**Recommended Formula:** Alkathene LDPE + 10–15% LLDPE or mLLDPE for toughness

---

### 3.6 Cast Film (Chill Roll)

| Parameter | Target | Priority |
|---|---|---|
| Haze | Very low | HIGH |
| Gloss | Very high | HIGH |
| Impact strength | Adequate | MEDIUM |
| Film stiffness | Adequate | MEDIUM |
| Sealing performance | Good | HIGH |

**MFI Requirement:** ≥ 2 g/10 min (for cast film)
**Melt Temp (LDPE):** 225–260°C
**Melt Temp (LLDPE):** Up to 290°C
**Chill Roll Temp:** 30–40°C
**Air Gap:** 25–75 mm (optimal)
**Recommended Base:** Alkatuff LLDPE (higher density preferred to offset low crystallinity)

---

### 3.7 Lamination Film

| Parameter | Target |
|---|---|
| Haze | Very low |
| Gloss | Very high |
| Gel level | Very low |
| Roll geometry | Excellent, uniform gauge |
| Corona treatment level | ~42 mN/m |
| Additive level | Low (especially slip — reduces adhesion) |
| Food contact approval | Required |
| Sealing properties | Good |

---

### 3.8 Stretch Wrap Film

| Parameter | Target |
|---|---|
| Elongation | Very high |
| Cling (one side) | High |
| COF | Controlled |
| Clarity | High |
| Gauge | 12–25 µm |

**Recommended:** Coextrusion — cling layer (high-cling mLLDPE or LLDPE) + core (LLDPE)

---

### 3.9 Food Packaging Film (High Barrier Requirement)

| Parameter | Target |
|---|---|
| O₂ transmission | < 100 cm³/m²/24h |
| Water vapour transmission | Very low |
| Sealing | Excellent (contamination-tolerant) |
| Safety | Food-contact approved grades only |

**Recommended:** Coextrusion with EVOH or Nylon barrier layer; LLDPE or mLLDPE as seal layers

---

## 4. PROCESSING PARAMETER RANGES

### 4.1 Blow-Up Ratio (BUR) — Effect Summary

| BUR | Effect |
|---|---|
| 1.5:1 | Excessive MD orientation, low TD orientation, risk of "splitty" film. Avoid unless sleeve wrap |
| 2:1 – 2.5:1 | Standard range. MD-biased orientation. Good for sleeve shrink or one-way shrink |
| 2.5:1 – 3:1 | Balanced orientation. Most general-purpose applications |
| > 3:1 | Bubble instability risk (especially LLDPE). High TD orientation. Better impact. Needed for balanced shrink |
| ~4:1 | Balanced shrink film (60% MD / 60% TD). High bubble instability. Bubble cage/guide required |

**Rules:**
```
IF BUR increases:
  → TD tear strength: INCREASES (LDPE) OR CONSTANT (mLLDPE)
  → MD tear strength: DECREASES
  → Impact strength: INCREASES
  → TD shrinkage: INCREASES
  → MD shrinkage: SLIGHT DECREASE
  → Haze (LDPE): Complex — improves at low freeze line, worsens at high freeze line
  → Haze (LLDPE): WORSENS (crystallisation haze increases)
  → Tensile strength MD: DECREASES
  → Tensile strength TD: SLIGHT INCREASE

IF BUR > 3.0 AND resin = LLDPE:
  → ALERT: High bubble instability risk. Use bubble cage/guide. Verify cooling ring type.

IF BUR < 2.0:
  → ALERT: Risk of excessive MD orientation. Impact strength may be low. Splitty film possible.
```

---

### 4.2 Drawdown Ratio (DDR)

```
DDR = (1000 × die_gap_h) / (film_thickness_t × BUR)

LDPE typical DDR:    5:1 – 20:1
LLDPE typical DDR:  10:1 – 50:1  (LLDPE tolerates higher drawdown due to low extensional viscosity)

Higher DDR → more MD orientation → higher MD tensile, lower MD tear, lower impact
Lower DDR → less MD orientation → better tear/impact balance
```

---

### 4.3 Freeze Line Distance (FLD)

| FLD | Optical Effect (LDPE) | Optical Effect (LLDPE) | Mechanical Effect |
|---|---|---|---|
| LOW (short) | Extrusion haze HIGH, crystallisation haze LOW | Haze LOW ✅ | Fast cooling → low crystallinity → better impact |
| HIGH (tall) | Extrusion haze LOW ✅, crystallisation haze HIGH | Haze HIGH ❌ | Slow cooling → high crystallinity → lower impact |

**Rules:**
```
IF resin = LLDPE:
  → Prefer LOW freeze line for best optical AND mechanical properties
  → High FLD is bad for LLDPE in all respects

IF resin = LDPE AND priority = optical:
  → Optimum FLD exists (trade-off between extrusion haze and crystallisation haze)
  → Figure 26 in source shows typical optimum

IF resin = LDPE AND priority = shrink:
  → Higher FLD → more MD orientation relaxation → lower MD shrink (can be used to balance)

IF FLD not uniform around bubble:
  → ALERT: Poor gauge control. Non-uniform shrink properties.
```

---

### 4.4 Melt Temperature

```
LDPE typical melt temp:   160–200°C
LLDPE typical melt temp:  200–230°C
mLLDPE:                   Similar to LLDPE
HDPE:                     210–240°C
Cast film LDPE:           225–260°C
Cast film LLDPE:          Up to 290°C

Higher melt temperature →
  + Reduces extrusion haze
  + Reduces melt fracture risk
  + Improves optical properties
  - Increases crystallisation haze (if freeze line unchanged)
  - Increases risk of oxidation / degradation
  - May reduce bubble stability
  - Higher energy cost

Lower melt temperature →
  + Better bubble stability (for LLDPE)
  - Higher melt fracture risk
  - Worse optical properties

Temperature Profile — LDPE:   Gradual increase along barrel
Temperature Profile — LLDPE:  Reverse or flat profile (higher in feed zone)
```

---

### 4.5 Output Rate

```
Higher output rate →
  + LLDPE: IMPROVES opticals (quicker cooling, less crystallisation haze)
  + Increases impact strength (stalk bubble effect)
  + LDPE: Slightly worse extrusion haze but lower crystallisation haze
  - May cause melt fracture if shear rate exceeds critical value
  - Increases bubble instability risk (LLDPE)

ALERT — if output rate increase leads to melt fracture:
  → Increase die gap
  → Add/increase processing aid
  → Increase melt temperature
  → Add LDPE to LLDPE blend
```

---

### 4.6 Film Thickness (Haul-off Rate)

```
Thinner film (higher haul-off rate) →
  + Faster cooling → lower crystallisation haze
  + Lower MD tear (higher DDR)
  - Lower creep resistance
  - Harder to handle in conversion equipment

Thicker film →
  + Higher impact (absolute)
  + Better creep resistance
  - More likely to block at nip
  - Requires higher seal temperature
```

---

### 4.7 Die Gap

| Resin | Recommended Die Gap |
|---|---|
| LDPE (50 µm film) | 0.5–0.8 mm |
| LDPE (thick gauges) | Up to 1.0–1.2 mm |
| LLDPE (standard) | 1.5–3.0 mm |
| LLDPE restrictor | 1.0–2.0 mm (behind main gap) |
| HDPE | 1.0–1.5 mm |
| If using both LDPE and LLDPE on same die | Two sets of die lips/mandrels recommended |

```
Wider die gap →
  - Lower shear rate → reduces melt fracture risk
  - Allows higher output rates without melt fracture
  + For LLDPE: essential for melt fracture-free production
  - Increases MD orientation (more drawdown required)
  - Reduces gauge control
  - Reduces clarity (slower cooling effect)

Narrow die gap (LDPE) →
  + Better gauge control
  + Better clarity
  - Not suitable for LLDPE at standard output rates
```

---

## 5. FORMULA BLENDING RULES

### 5.1 LDPE-Rich Blends (LDPE ≥ 60%)

**Use when:** Clarity is primary, conventional LDPE equipment, shrink film

```
LDPE base + up to 40% LLDPE or mLLDPE:
  + Improved tensile properties
  + Improved stiffness
  + Improved puncture resistance
  + Improved heat sealability
  + Can allow downgauging
  ≈ Processability similar to LDPE (extrude on LDPE equipment)
  - Slightly reduced clarity vs. 100% LDPE
  - Slightly reduced shrink vs. 100% LDPE

RECOMMENDATION: 5–20% LLDPE in LDPE gives good balance
```

---

### 5.2 LLDPE-Rich Blends (LLDPE ≥ 60%)

**Use when:** Mechanical properties are primary, some optical compromise acceptable

```
LLDPE base + 5–20% LDPE:
  + Significantly improved processability
  + Improved bubble stability
  + Improved optical properties (haze, gloss)
  + Slightly higher TD tear strength
  + Reduced melt fracture tendency
  + Less sensitive to disturbances
  ≈ Mechanical properties close to pure LLDPE
  - Still needs wide die gap or processing aid

RECOMMENDATION: 10–20% LDPE in LLDPE is highly effective
```

---

### 5.3 HDPE-Containing Blends

```
LLDPE + small % HDPE (5–15%):
  + Improved stiffness
  + Improved creep resistance
  + Improved yield strength
  - Reduced toughness
  - Reduced impact strength
  - Processing: Low MFI HDPE may not mix well with high MFI LLDPE
    → Use higher MFI HDPE in that case

LLDPE or mLLDPE + HDPE (up to 30%):
  + Even greater stiffness
  + LLDPE improves impact and tear vs. pure HDPE
  + mLLDPE further improves impact over standard LLDPE

HDPE + LDPE + LLDPE (three-component):
  + Optimise stiffness + toughness + processability simultaneously
  - Complex dispersion — require optimisation trials
  - LDPE + low MFI HDPE combination prone to poor dispersion
  → Optimise blend and extrusion conditions via trials
```

---

### 5.4 Blend Viscosity Rule

```
Viscosity of blend ≈ intermediate between components
Log(viscosity_blend) ≈ linear function of blend composition

→ Blending LDPE into LLDPE reduces extruder power requirement
→ Blending LLDPE into LDPE slightly increases power requirement
→ DSC shows two melting peaks for LDPE/LLDPE blends (separate phases)
   → Peak ratio ≈ blend composition estimate
```

---

### 5.5 Blend Compatibility Summary

| Blend Pair | Compatible | Notes |
|---|---|---|
| LDPE + LLDPE | YES ✅ | Widely used, complementary properties |
| LDPE + mLLDPE | YES ✅ | Best opticals + best sealing/impact |
| LLDPE + HDPE | YES ✅ | Stiffness + toughness combination |
| mLLDPE + HDPE | YES ✅ | Best stiffness + impact combination |
| LDPE + HDPE | YES with caution ⚠️ | Dispersion issues at low MFI HDPE |
| LDPE + LLDPE + HDPE | YES with trials ⚠️ | Complex — requires optimisation |

---

## 6. ADDITIVE SYSTEM

### 6.1 Slip Additives

| Parameter | Value |
|---|---|
| **Purpose** | Reduce coefficient of friction (COF) |
| **Common types** | Oleamide, Erucamide |
| **Typical dosage** | 300–1,000 ppm |
| **Target COF (medium slip)** | ~0.25 |
| **Target COF (high slip)** | 0.10–0.20 |
| **No additive COF** | > 0.8 |
| **Migration time to equilibrium** | ~24 hours post-extrusion |
| **Film thickness effect** | Thinner films need higher concentration |

**Rules:**
```
IF film is thin AND target_COF is low:
  → Increase slip additive concentration (thinner film = less total slip available)

IF corona_treatment is planned:
  → Treat in-line immediately after die (BEFORE slip migrates to surface)
  → High slip levels require higher corona power

IF sealing is critical:
  → Keep slip additive at minimum effective level
  → High slip levels raise minimum seal temperature

Oleamide → higher COF than Erucamide at same concentration
Erucamide → preferred for high-slip applications
```

---

### 6.2 Antiblocking Additives

| Parameter | Value |
|---|---|
| **Purpose** | Prevent film faces sticking together |
| **Type** | Finely-divided inorganic fillers (e.g. silica) |
| **Typical dosage** | 0.15–0.3% |
| **Mechanism** | Physical micro-roughness on surface |
| **Film thickness effect** | Limited — non-migratory, dispersed throughout |

**Rules:**
```
IF blocking is observed:
  → Increase antiblock level first
  → Consider changing antiblock type
  → Check nip roll pressure (reduce if excessive)
  → Check film temperature at nip (must be < 40°C)
  → Improve cooling efficiency

IF antiblock is increased:
  → ALERT: Haze will increase
  → ALERT: Some reduction in mechanical properties possible

Blocking tendency ranking (best to worst):
  mLLDPE < LLDPE < LDPE (in terms of blocking tendency)
  Higher density → lower blocking tendency
  High gloss smooth films → higher blocking tendency
```

---

### 6.3 Antistatic Additives

| Parameter | Value |
|---|---|
| **Purpose** | Dissipate electrostatic charges |
| **Mechanism** | Migrate to surface, absorb moisture, form conducting layer |
| **Effective range** | Surface resistivity: 10¹⁶ → 10⁸–10¹¹ ohms |
| **Maximum dosage** | < 1,000 ppm (above this, sealing and corona issues) |
| **Best humidity** | High humidity environments |

**Rules:**
```
IF application = electronic_component_packaging OR operating_theatre:
  → Antistatic film NOT adequate
  → Use semi-conducting film

IF antistatic_dosage > 1,000 ppm:
  → ALERT: Raises minimum seal temperature
  → ALERT: Interferes with corona discharge treatment
```

---

### 6.4 Processing Aid

| Parameter | Value |
|---|---|
| **Purpose** | Prevent / delay surface melt fracture |
| **Typical dosage** | < 0.1% (< 1,000 ppm) |
| **Mechanism** | Migrates, coats die land, lubricates melt/metal interface |
| **Induction time** | Build-up period required before full effect |
| **Effect** | Raises critical shear rate for melt fracture onset |

**Rules:**
```
IF resin = LLDPE OR mLLDPE AND die_gap = narrow:
  → Processing aid is HIGHLY RECOMMENDED

IF surface_melt_fracture observed AND no_processing_aid_in_formulation:
  → Add processing aid masterbatch immediately
  → Extrude higher concentration first to condition die
  → Do not reduce shear rate to below effective coating threshold

IF die_gap = wide (>1.5 mm) AND output_rate = low:
  → Processing aid may not coat die effectively (shear stress too low)
  → Consider narrow gap + processing aid instead

Processing aid must not interfere with antiblock additive
Some Alkamax/Alkatuff grades pre-formulated with processing aid
```

---

### 6.5 Stabiliser Package

- All standard film grades include stabiliser package
- Prevents oxidation during processing and storage
- Critical during shutdown: cool extruder rapidly, set to 100°C
- Add antioxidant masterbatch during extended shutdowns

---

### 6.6 Additive Interaction Matrix

| Additive A | Additive B | Interaction |
|---|---|---|
| Slip (high level) | Corona treatment | Slip inhibits treatment — treat in-line only |
| Slip (high level) | Heat sealing | Raises minimum seal temperature |
| Antistatic (>1000 ppm) | Heat sealing | Raises minimum seal temperature |
| Antistatic (>1000 ppm) | Corona treatment | Interferes with treatment |
| Antiblock | Optical properties | Increases haze |
| Antiblock | Mechanical properties | May slightly reduce performance |
| Processing aid | Antiblock | Possible interference — verify with supplier |

---

## 7. EXTRUDER SETUP RULES

### 7.1 Extruder Power Requirements

| Resin Type | Power (kWh/kg) |
|---|---|
| LDPE | 0.20–0.25 |
| LLDPE / mLLDPE | Up to 0.33 |
| HDPE | Up to 0.33 |

```
IF resin_changed_from_LDPE_to_LLDPE:
  → ALERT: Motor power increase required (up to 33% more)
  → Check extruder is rated for LLDPE operation
  → Verify maximum head pressure not exceeded
  → May require screw modification
```

---

### 7.2 Screw Design Rules

| Screw Parameter | LDPE | LLDPE / HDPE |
|---|---|---|
| L/D ratio | ≥ 20:1 (ideally 24–30:1) | ≥ 24:1 |
| Compression ratio | 2.5:1 – 4.5:1 | Lower (grooved feed section preferred) |
| Flight depth | Standard | Deeper channels, narrower flights |
| Screw type | Conventional or barrier | Barrier flighted preferred |
| Grooved feed | Optional | Beneficial — increases output, facilitates melting |
| Mixing section | Recommended | High-shear mixing section behind tip beneficial |

**Temperature Profile:**
```
LDPE:   Feed → Metering = gradual increase (e.g., 150 → 180 → 200°C)
LLDPE:  Feed → Metering = reverse or flat profile (higher at feed)
        Example: 200 → 195 → 190°C (avoids melt overheating in metering)
```

---

### 7.3 Screen Pack

- Mesh range: 40–100 mesh
- Purpose: Back pressure, homogenisation, contamination removal
- Replace with screen changer to avoid pressure build-up
- Finer screens → better homogenisation → improved film quality
- If dark specks/gels present: use finer screens first

---

### 7.4 Barrel Cooling

```
Throat section MUST be water-cooled:
  → Prevents premature pellet melting
  → Prevents bridging in feed hopper

Grooved feed section MUST have water cooling:
  → Prevents pellet softening and groove clogging
  → Maintains output rate stability

IF output drops unexpectedly:
  → Check grooved feed section cooling water flow
  → Check for bridging in feed hopper
```

---

## 8. DIE & BUBBLE OPTIMIZATION

### 8.1 Die Type Selection

| Die Type | Best For | Notes |
|---|---|---|
| Spiral mandrel (bottom-fed) | LDPE, LLDPE, coextrusion | Best film quality, best thickness uniformity |
| Side-fed | LDPE | Acceptable, but hold-up risk |
| Bottom-fed (spider) | LDPE | Risk of die lines at spider welds |
| Coextrusion (concentric cylinder or stacked plate) | Multi-layer films | Match viscosities at interfaces |

```
RECOMMENDED for all new installations: Spiral mandrel die
COEXTRUSION note: Viscosities of adjacent layers should be matched
  → Viscosity mismatch at interface → optical / mechanical instability
  → Use temperature adjustment to match viscosities
```

---

### 8.2 Gauge Control

```
Thickness variation causes:
  - Misaligned die → centre die manually or use auto-centering
  - Worn die → replace lips or mandrel
  - Non-uniform melt flow → check temperature uniformity
  - Non-uniform cooling → verify air ring flow uniformity (must be ±0.5%)

Solutions:
  1. Manual centring screws + film micrometer measurement
  2. Automatic feedback die gap adjustment (thermal expansion elements)
  3. Oscillating haul-off (top nips rotate ±90° over few minutes) → spreads gauge bands
  4. Rotating die (older method, high maintenance)
```

---

### 8.3 Melt Fracture Prevention Rules

**Critical shear rate exceeded → sharkskin / surface melt fracture → poor opticals, possible film failure**

```
PREVENTION HIERARCHY:
1. Use wide die gap (LLDPE primary solution)
2. Increase melt temperature
3. Add / increase processing aid
4. Change die metal (alpha brass > chrome-plated steel > mild steel)
5. Add LDPE to LLDPE blend (5–20%)
6. Reduce output rate (last resort — hurts productivity)
7. Use a die with reduced land length (< 25 mm for LLDPE wide-gap)

IF melt_fracture observed AND die_gap = narrow:
  → FIRST: check if processing aid is present and at sufficient level
  → SECOND: increase melt temperature by 5–10°C
  → THIRD: widen die gap if possible
  → FOURTH: add 5–10% LDPE to LLDPE blend

IF melt_fracture observed AND die_gap = wide:
  → Check processing aid coating — may need reconditioning
  → Check shear stress is above minimum threshold for coating
  → Verify melt temperature
```

---

### 8.4 Bubble Inflation & BUR Control

```
Inflation air pressure: 15–35 kPa
BUR minimum practical: 1.5:1 (avoid — excessive MD orientation)
BUR standard range:     2:1 – 3:1
BUR for balanced shrink: ~4:1

BUR formula:
  BUR = bubble_diameter / die_diameter = 2 × LFW / (π × die_diameter)

NOTE: LFW must be measured BEFORE any trimming or slitting
```

---

## 9. COOLING SYSTEM RULES

### 9.1 Air Ring Selection

| Resin | Air Ring Type | Notes |
|---|---|---|
| LDPE | Standard single-lip | Direct impingement acceptable |
| LLDPE | Dual-lip venturi (REQUIRED) | Parallel flow essential — avoid direct impingement |
| mLLDPE | Dual-lip venturi (REQUIRED) | Same as LLDPE |
| HDPE | Optimised HDPE air ring | Long stalk design, vertical air direction with low flow |

**LLDPE Air Ring Rules:**
```
LLDPE bubble cooling CRITICAL REQUIREMENTS:
  → Air flow PARALLEL to bubble surface (NOT direct impingement)
  → Lower air velocity, higher air volume vs. LDPE
  → Dual-lip design with venturi effect preferred
  → Chilled air beneficial
  → Air flow uniformity: ±0.5% around circumference (MANDATORY)

IF LDPE air ring used for LLDPE:
  → ALERT: Bubble shape distortion likely below freeze line
  → ALERT: Bubble instability at moderate output rates
  → SOLUTION: Modify air ring or replace with LLDPE-specific ring

IBC (Internal Bubble Cooling) for LLDPE:
  → Enables output rates up to 3.5 kg/h/cm die circumference
  → Requires: dual-lip air ring + IBC together
  → Requires: large die gap AND processing aid at these rates
  → Do NOT chill die lips when using IBC at high outputs
```

---

### 9.2 Output Rate Limits by Cooling System

| Configuration | Max Output (LLDPE) |
|---|---|
| Single-lip air ring | ~1.0 kg/h/cm die circumference |
| Dual-lip venturi | 1.6–2.3 kg/h/cm |
| Dual-lip venturi + IBC | Up to 3.5 kg/h/cm |
| Multiple stacked cooling rings | Up to 50% improvement on primary ring alone |

---

### 9.3 Film Temperature at Nip Rolls

```
CRITICAL: Film temperature at nip rolls MUST be < 40°C
→ Above 40°C → blocking will occur

IF blocking at nip:
  → Increase nip roll height (more after-cooling time)
  → Increase cooling air volume
  → Reduce output rate
  → Check air ring performance
  → Reduce extrusion temperature if possible

Nip roll height minimum: 2 metres above die
High nip → more cooling → but risk of bubble instability with LLDPE
```

---

### 9.4 Freeze Line Control

```
Freeze line = solidification zone where bubble reaches final diameter
Low FLD → fast cooling → good for LLDPE opticals + impact
High FLD → slow cooling → good for LDPE opticals (less extrusion haze)

LLDPE OPTIMISATION RULE:
  → Always target LOW freeze line for LLDPE films

LDPE OPTIMISATION RULE:
  → Balance between extrusion haze (needs high FLD) 
    and crystallisation haze (needs low FLD)
  → Refer to Figure 24 in source for grade-specific optimum

HDPE RULE:
  → Long stalk required → HIGH FLD intentional
  → Neck height = 5–8× die diameter
```

---

## 10. FILM PROPERTY OPTIMIZATION MAPS

### 10.1 How Processing Conditions Affect All Key Properties

| Processing Change | Impact | Tear MD | Tear TD | Haze LDPE | Haze LLDPE | Sealing |
|---|---|---|---|---|---|---|
| ↑ BUR | ↑↑ | ↓ | ↑ (LDPE) ↓ (mLLDPE) | Complex | Worse ❌ | Slight change |
| ↑ Melt Temp | ↑ | ↓ | ↓ | Better ✅ | Better ✅ | Slight ↓ min seal temp |
| ↑ FLD | Variable | ↑ MD | ↓ TD | Extrusion↓ crystal↑ | Worse ❌ | No effect |
| ↑ Output Rate | ↑↑ | ↓ both | ↓ both (LDPE) MD↑ (mLLDPE) | Extrusion↑ crystal↓ | Better ✅ | No direct effect |
| ↑ Die Gap | ↓ | Little | Little | Little | Little | No direct effect |
| ↑ Film Thickness (haul-off ↓) | ↑ | ↑ MD ↓ TD | ↑ MD ↓ TD | ↓ | ↑ | Higher min seal temp |
| Stalk bubble | ↑↑ | ↓ MD | ↑↑ TD | No major | No major | No direct |

---

## 11. OPTICAL PROPERTY OPTIMIZATION

### 11.1 Haze Reduction — LDPE Films

**Extrusion Haze (surface defects from die flow):**
```
To REDUCE extrusion haze:
  → Increase melt temperature
  → Increase freeze line distance (more relaxation time)
  → Increase BUR (draws out and smooths surface defects)
  → Reduce output rate (lower shear rate through die)
  → Widen die gap
  → Widen die entry angle
```

**Crystallisation Haze (crystallite growth near surface):**
```
To REDUCE crystallisation haze:
  → Decrease freeze line distance (faster cooling)
  → Increase haul-off speed (thinner film = faster cooling)
  → Decrease BUR (shorter cooling path per unit time)
  → Increase output rate (for given freeze line)
  → Increase melt temperature (if freeze line maintained, faster cooling rate)
```

**⚠️ For LDPE:** These two haze components respond OPPOSITELY to freeze line distance.
→ Optimal FLD must be found for each grade and thickness (J-curve behaviour)

---

### 11.2 Haze Reduction — LLDPE Films

```
Crystallisation haze DOMINATES in LLDPE.
All variables that slow cooling → increase haze.

To REDUCE haze in LLDPE:
  → MINIMISE freeze line distance (most important!)
  → Increase haul-off speed
  → Decrease BUR (if not limited by other requirements)
  → Increase output rate
  → Increase melt temperature
  → Use chilled cooling air
  → Use dual-lip venturi air ring for maximum cooling efficiency
  → Blend 20–40% LDPE into LLDPE (significant improvement to gloss and haze)
  → Use mLLDPE instead of standard LLDPE (slightly better opticals)
  → Use lower density LLDPE
  → Use lower MFI LLDPE
  
ELIMINATE surface melt fracture — it also destroys opticals
```

---

### 11.3 Optical Defect Reference

| Defect | Description | Cause | Solution |
|---|---|---|---|
| Extrusion haze | Milky surface, small raised areas < 5 µm | Melt flow elastic recovery at die exit | Lower output, higher melt temp, wider die gap, higher BUR |
| Crystallisation haze | Milky, mound features ~1 µm | Crystallite growth during cooling | Lower freeze line, faster cooling |
| Sharkskin / melt fracture | Curled ridges, loss of gloss | Critical shear stress exceeded at die | Wide die gap, processing aid, higher temp, LDPE addition |
| Orange peel | Coarse elongated fracture in MD | Surface fracture at die exit, coarser than sharkskin | Higher FLD, higher temp, higher drawdown/BUR |
| Grain | Discrete lumps projecting from surface | Melt inhomogeneity (high MW particles) | More homogenisation, cool screw, better screw design |
| Fish eyes / gels | Oval clear or hazy spots | Cross-linked particles, contamination | Better polymer quality, higher stabiliser, finer screens |
| Die lines | Longitudinal streaks | Die damage, hold-up in die, degradation | Clean die, reduce temp, check die lips |
| Windows / lensing | Thin oval spots | Trapped volatiles in melt | Purge polymer, check masterbatch for volatiles |

---

## 12. MECHANICAL PROPERTY OPTIMIZATION

### 12.1 Impact Strength Maximisation

```
POLYMER choices:
  Best: mLLDPE (Alkamax) for given density/MFI
  Good: LLDPE (hexene/octene Alkatuff)
  Moderate: LDPE
  Variable: HDPE (low MFI HDPE can be poor)

PROCESSING for maximum impact:
  → High BUR (>2.5:1)
  → Stalk-shaped bubble (transverse drawing just before freeze line)
  → High output rate
  → Low freeze line distance (fast cooling)
  → Low polymer density
  → Low MFI

IMPACT STRENGTH WARNING:
  → MD-dominant orientation → slit-like failures along MD → poor impact
  → Must achieve balanced or TD-dominant orientation at freeze line
  → Edge-fold impact = 40–80% of body impact (weakest point in bags)
```

---

### 12.2 Tear Strength Optimisation

```
MD TEAR improvement:
  → Decrease BUR (less TD orientation, more MD balance)
  → Increase FLD
  → Decrease output rate

TD TEAR improvement:
  → Increase BUR
  → Use stalk-shaped bubble
  → Avoid high MFI, avoid high density

BALANCED TEAR (MD ≈ TD):
  → BUR 2.5:1 – 3:1
  → Moderate output rate
  → LDPE of density ~0.921 g/cm³

LLDPE tear note:
  → Tear strength is highly variable with processing conditions
  → mLLDPE: Both MD and TD tear decrease with increasing BUR
  → LLDPE hexene/octene: Higher tear than butene-based

Tear strength vs. density:
  → Higher density → LOWER MD tear (splitty film)
  → Increasing density is DETRIMENTAL to tear
```

---

### 12.3 Creep Resistance Optimisation

```
Best resistance to creep:
  1. HDPE addition (especially high MW HDPE)
  2. LLDPE density > 0.925 g/cm³
  3. Higher density base polymer

Application: loaded carry bags, heavy-duty sacks under long-term stress
Recommended: LLDPE density ≥ 0.925 g/cm³ OR LLDPE/HDPE blend
```

---

### 12.4 Mechanical Balance Summary

```
For most general-purpose film (best all-round balance):
  → BUR: 2.5:1 – 3:1
  → Moderate freeze line
  → Moderate output rate
  → Result: MD ≈ TD tear, moderate-to-high impact

For heavy-duty applications (impact and tear priority):
  → BUR: 2.5:1 – 3.5:1
  → High output rate
  → Stalk bubble if possible
  → Low FLD (fast cooling)
  → mLLDPE or hexene/octene LLDPE base

NOTE: High impact at high BUR is inversely correlated with TD tear strength.
A compromise must always be made.
```

---

## 13. HEAT SHRINK OPTIMIZATION

### 13.1 Shrink Film Formula Selection

```
RULE 1: LDPE base is ESSENTIAL for good shrink film
  Best: Alkathene LDPE density 0.920–0.922, MFI 0.3–3.5
  Lower MFI → higher TD shrink (preferred)
  MFI 0.3–1.5 for highest performance shrink

RULE 2: LLDPE and HDPE alone = POOR shrink
  → Add only to improve toughness and puncture resistance
  → Keep LDPE content ≥ 70% for good shrink
  → If LLDPE/HDPE added: increase BUR or narrow die gap to restore shrinkage

RULE 3: More LDPE = more shrink
         Less MFI = more shrink tension
         Lower density = better clarity + more shrink
```

---

### 13.2 Shrink Level Control by Processing Variables

| To achieve this | Do this |
|---|---|
| MORE TD shrink | Increase BUR |
| LESS TD shrink | Decrease BUR |
| MORE MD shrink | Decrease BUR; use lower MFI LDPE; use narrower die gap |
| LESS MD shrink | Increase BUR; increase FLD; increase film thickness |
| BALANCED MD=TD shrink (~60%) | BUR ~4:1 with bubble stability precautions |
| Higher shrink TENSION | Lower MFI LDPE; higher BUR |

---

### 13.3 Shrink Tension Table (Alkathene LDPE, 50 µm)

| MFI | BUR 2:1 MD Tension (g/25mm) | BUR 2:1 TD Tension | BUR 2.5:1 TD Tension |
|---|---|---|---|
| 0.4 | 340 | 50 | 100 |
| 2.5 | 170 | 0 | 50 |

---

### 13.4 Shrink Processing Temperature

```
Minimum shrink temperature (LDPE film): ~110°C
Plateau temperature (LDPE film): ~115–130°C
Shrink tunnel air temperature: 170°C+
Transit time: ~few seconds

LLDPE/HDPE blend films:
  → Higher shrink temperature required (higher melting points)

Warning: If film becomes too soft before full shrink occurs → burn holes
→ Use melt-strength: low MFI LDPE reduces holing risk
```

---

## 14. SURFACE & SEALING PROPERTIES

### 14.1 Corona Treatment Targets

| Application | Required Level |
|---|---|
| Printing (solvent-based inks) | 38–40 mN/m |
| Printing (water-based inks) | 40–44 mN/m |
| Lamination | ~42 mN/m |
| Untreated film baseline | ~30 mN/m |

**Treatment Rules:**
```
Treat IN-LINE immediately after nip rolls (before slip additive migrates)
→ Wait = higher additive on surface = harder to treat

IF high slip or antistatic additive level:
  → Increase corona power to compensate

Electrode gap: ~1 mm, parallel to film surface
Electrode length: ~15 mm less than film width
Max treatment: > 400 g/cm peel force = over-treatment
Adequate treatment: 300–400 g/cm peel force

AVOID:
  → Reverse-side treatment (causes blocking, heat seal problems, ink pick-up)
  → Over-treatment (impairs heat sealing, increases blocking)
  → Operating with guard removed (HIGH VOLTAGE hazard)
  → Inadequate ozone ventilation (TOXIC at high concentration)
```

---

### 14.2 Heat Sealing Optimisation

**Sealing Parameters:**

| Parameter | Effect |
|---|---|
| Temperature (↑) | Improves seal strength up to burn-through point |
| Dwell time (↑) | Same effect as temperature — interchangeable |
| Jaw pressure (↑) | DECREASES seal strength (squeezes polymer away) |
| Cooling after seal | Must cool below melting point before loading |

**Minimum Seal Temperature by Resin:**
```
LDPE:        Lower minimum seal temperature
LLDPE:       ~10–20°C higher than LDPE
mLLDPE:      Slightly higher than LLDPE
HDPE:        Much higher (higher melting point)

OPTIMUM FOR LLDPE SEALING:
  → 10–20°C higher temperature than LDPE setting
  → Reduce dwell time (lower melt strength means faster fusion)
  → Reduce jaw pressure (lower melt strength = squeeze more easily)
  → Use sharper knife for side-sealing (0.4 mm radius)
```

**Hot Tack Rules:**
```
Hot tack = seal strength when seal still hot = critical for vertical FFS lines

Ranking: mLLDPE > LLDPE (hexene/octene) > LLDPE (butene) > LDPE

To improve hot tack:
  → Use mLLDPE as seal layer (coextrusion preferred)
  → Use hexene or octene based LLDPE
  → Use lower MFI resin
  → Avoid over-pressure during sealing

LLDPE hot tack advantage:
  → Wider temperature operating window
  → Maintained even through contaminated film surfaces
  → mLLDPE shows superior hot tack at LOWER seal temperatures
```

**Sealing Through Contamination:**
```
LLDPE and mLLDPE > LDPE for sealing through contamination
Higher MFI grades flow more easily around contamination
LLDPE-rich blends recommended where contamination is expected (food fill)
```

---

### 14.3 COF and Slip Management

```
COF ranges:
  No additive:     > 0.8 (unacceptable for most applications)
  Medium slip:     ~0.25
  High slip:       0.10–0.20

FACTORS THAT LOWER COF:
  + Erucamide (vs. oleamide)
  + Higher slip additive concentration
  + Antiblocking additive present
  + Higher density polymer
  + Lower MFI polymer
  + HDPE (generally lower COF than LDPE/LLDPE)

FACTORS THAT RAISE COF:
  + No or low slip additive
  + Oleamide (vs. erucamide)
  + Thin film (less additive available to surface)
  + Excessive corona treatment
  + High winding tension (delays migration)

EQUILIBRIUM: ~24 hours post-extrusion
```

---

## 15. TROUBLESHOOTING DECISION TREES

### 15.1 BLOCKING

```
Blocking detected
├── Is film temperature at nip > 40°C?
│   YES → Improve cooling (air volume, chilled air, lower output rate)
│         Lower FLD → faster cooling before nip
├── Is nip roll pressure too high?
│   YES → Reduce nip pressure
├── Is winding tension too high?
│   YES → Reduce winding tension
├── Is antiblock level adequate?
│   NO  → Increase antiblock concentration or change type
│         Consider switching to metallocene resin (lower blocking tendency)
├── Is film stored/transported in high heat?
│   YES → Improve storage conditions
└── Is surface treated (reverse-side or over-treatment)?
    YES → Reduce treatment level; fix reverse-side treatment cause
```

---

### 15.2 MELT FRACTURE / SHARKSKIN

```
Melt fracture observed
├── Is resin LLDPE or mLLDPE?
│   YES → Check die gap (should be 1.5–3.0 mm for LLDPE)
│         Is die gap < 1.5 mm?
│         YES → Widen die gap to LLDPE range
├── Is processing aid present in formulation?
│   NO  → Add processing aid masterbatch
│         Run high concentration first to condition die
│   YES → Has die been recently changed or cleaned?
│         YES → Recondition die with processing aid
├── Is melt temperature adequate?
│   LDPE < 160°C → Increase temperature
│   LLDPE < 200°C → Increase temperature
├── Is LDPE content sufficient in blend?
│   < 5% in LLDPE blend → Add 5–10% LDPE
├── Is output rate too high for die gap?
│   YES → Reduce output rate OR widen die gap
└── Is die material suitable?
    Chrome-plated or mild steel → Consider alpha brass die for higher output
```

---

### 15.3 BUBBLE INSTABILITY

```
Bubble instability (oscillation, corkscrew, sagging)
├── Is resin LLDPE or mLLDPE?
│   YES → Normal tendency. Check cooling ring type.
│         Air ring designed for LLDPE? (Dual-lip venturi required)
│         NO → Replace or modify air ring
├── Is LDPE content in blend < 10%?
│   YES → Add 10–20% LDPE (strongly reduces instability)
├── Is BUR > 3:1?
│   YES → Reduce BUR; or install bubble cage/guide
├── Is melt temperature too high?
│   YES → Reduce by 5–10°C
├── Is MFI of resin too high?
│   YES → Consider lower MFI grade
├── Are nip rolls too high?
│   YES → Reduce nip roll height (if acceptable)
├── Is air ring flow uniform (±0.5%)?
│   NO  → Check and balance air ring
└── Is bubble cage / iris diaphragm / guide rolls fitted?
    NO  → Add bubble stabilisation devices above freeze line
```

---

### 15.4 POOR OPTICAL PROPERTIES (HIGH HAZE)

```
Haze unacceptably high
├── Is resin HDPE-dominant?
│   YES → HDPE is inherently high haze. Consider reducing HDPE%.
│         Use HDPE only in coextrusion outer layers if opticals critical.
├── Is resin LLDPE or mLLDPE?
│   YES → Crystallisation haze dominates:
│         Is freeze line distance HIGH?
│         YES → Reduce FLD (most impactful action)
│         Is BUR high?
│         YES → Consider reducing BUR
│         Is LDPE blend content < 20%?
│         YES → Add 20–40% LDPE (significant improvement)
├── Is surface melt fracture present?
│   YES → Fix melt fracture first (see section 15.2)
├── Resin is LDPE:
│   → Determine which haze type dominates:
│     Extrusion haze? → Increase melt temp, increase FLD, increase BUR
│     Crystallisation haze? → Decrease FLD, increase output rate
├── Is melt temperature too low?
│   YES → Increase by 5–10°C
├── Is antiblock level too high?
│   YES → Reduce antiblock (contributes to haze)
└── Is polymer density too high?
    YES → Consider lower density grade
```

---

### 15.5 POOR MECHANICAL PROPERTIES

```
Low impact strength
├── BUR < 2:1? → Increase BUR to ≥ 2.5:1
├── FLD too high? → Reduce FLD (faster cooling → smaller crystallites → better impact)
├── Density too high? → Reduce polymer density
├── MFI too high? → Use lower MFI grade
├── Resin type suboptimal? → Switch to mLLDPE or hexene/octene LLDPE
└── Bubble shape not stalk-type? → Optimise conditions for stalk bubble (high output + FLD balance)

Low tear strength (splitty film in MD)
├── Density too high? → Reduce density
├── BUR too low? → Increase BUR
├── MD orientation excessive? → Increase BUR and reduce DDR
└── HDPE content too high? → Reduce HDPE %

Unbalanced tear (MD ≠ TD)
├── Adjust BUR toward 2.5:1 – 3:1
├── Check bubble shape → stalk bubble gives TD-dominant tear
└── Adjust output rate
```

---

### 15.6 POOR SEALING

```
Seal strength too low / no seal forming
├── Temperature too low → Increase sealing temperature
├── Dwell time too short → Increase dwell time
├── Is film over-treated (> 400 g/cm peel force)? → Reduce corona level
├── Is contamination on seal area? → Use LLDPE/mLLDPE for better tolerance
├── Film age issue (oxidised surface)? → Use fresh film
├── Creases in seal area? → Improve film handling; consider higher MFI grade

Hot tack failure (bag breaks after filling)
├── Sealing temperature too high (past peak)? → Reduce temperature
├── Sealing temperature too low (before peak)? → Increase temperature
├── Jaw pressure too high? → Reduce pressure
├── Wrong resin for hot tack? → Switch to mLLDPE or LLDPE hexene/octene

Seal failures at creases
├── Crease has extra layers → increase temperature and/or use higher MFI resin
└── Improve film stiffness to reduce crease formation
```

---

### 15.7 GELS / DARK SPECKS

```
Gels or dark specks in film
├── Oxidised material in equipment?
│   YES → Clean screw and barrel; clean die
│          Shutdown procedure: cool rapidly to 100°C, leave extruder full
├── Extrusion temperature too high or too low?
│   → Optimise temperature profile
├── Extruder speed causing degradation?
│   → Optimise screw speed for residence time
├── Purging inadequate after formulation change?
│   → Use purging compound between formulations
├── Screen pack broken or too coarse?
│   → Replace screenpack; use finer screens (80–100 mesh)
├── Thermocouple or heater fault?
│   → Check all heater controls and thermocouples
├── Contamination from feed?
│   → Inspect raw materials; clean hoppers
└── Moisture in resin?
    → Ensure resin is dry before processing
```

---

### 15.8 POOR SHRINK PROPERTIES

```
Insufficient shrinkage
├── BUR too low for required TD shrink? → Increase BUR
├── LDPE content too low? → Increase LDPE proportion (LDPE drives shrink)
├── MFI of LDPE too high? → Switch to lower MFI LDPE grade
├── Freeze line too high? → Lower FLD
├── Film too thick? → Reduce gauge (increases MD shrink)
├── Die gap too wide? → Narrow die gap increases MD orientation
└── LLDPE/HDPE content too high? → Reduce to ≤ 30% of blend

Unbalanced shrink (MD >> TD)
├── BUR too low → Increase BUR
└── Bubble not stalk-shaped → Adjust conditions for stalk bubble

Poor shrink tension
├── MFI too high → Switch to lower MFI LDPE
└── BUR too low → Increase BUR (see shrink tension table)
```

---

### 15.9 INCORRECT COF / SLIP

```
COF too high (film too sticky)
├── Slip additive level insufficient → Increase slip concentration
├── Wrong slip type? → Switch to erucamide (lower COF than oleamide)
├── Film tested too soon after extrusion? → Allow 24 hrs for equilibration
├── Film too thin? → Increase slip concentration for thin films
└── High winding tension? → Reduce tension (allows faster slip migration)

COF too low (film too slippery)
├── Slip additive level too high → Reduce concentration
├── For sacks that must stack → Use no or minimal slip additive
└── Consider antiblocking additive as partial substitute for slip
```

---

## 16. OPTIMIZATION SCORING RULES

### 16.1 Formula Optimization Algorithm Structure

```
INPUT:
  - Resin types selected (LDPE, LLDPE, mLLDPE, HDPE) + MFI + density
  - Blend ratios
  - Additive system (slip ppm, antiblock %, antistatic ppm, processing aid %)
  - Extruder parameters (melt temp, output rate, die gap, BUR, FLD)
  - Target product profile (from Section 3)

OUTPUT:
  - Property prediction scores (0–100%) for each target property
  - Constraint violations (ALERT flags)
  - Recommended adjustments
  - Confidence score
```

---

### 16.2 Property Prediction Scoring Matrix

For each target property P, score is computed as:

```
score(P) = base_resin_score(P) × blend_factor(P) × processing_factor(P) × additive_factor(P)

Where each factor is normalised 0–1.
Final score expressed as 0–100%.
```

**Base Resin Scores (relative, 0–10):**

| Property | LDPE | LLDPE (hex/oct) | mLLDPE | HDPE |
|---|---|---|---|---|
| Clarity / Low Haze | 9 | 5 | 6 | 1 |
| Impact Strength | 7 | 8 | 10 | 5 |
| Tear Balance | 7 | 7 | 6 | 3 |
| Puncture Resistance | 3 | 9 | 10 | 5 |
| Hot Tack | 2 | 8 | 10 | 0 |
| Seal Strength | 5 | 8 | 9 | 6 |
| Stiffness | 3 | 6 | 6 | 10 |
| Creep Resistance | 2 | 5 | 5 | 9 |
| Shrink Performance | 10 | 2 | 2 | 1 |
| Bubble Stability | 10 | 3 | 2 | 2 |
| Gas Barrier | 4 | 5 | 5 | 9 |
| Processability | 9 | 5 | 5 | 4 |

---

### 16.3 Constraint Violation Rules (HARD STOPS)

```
CONSTRAINT 1: 
  IF resin = LLDPE AND die_gap < 1.0 mm AND no_processing_aid:
  → VIOLATION: "Melt fracture risk — HIGH. Widen die gap or add processing aid."

CONSTRAINT 2:
  IF resin = LLDPE AND air_ring_type = single_lip_direct_impingement:
  → VIOLATION: "Bubble instability risk — CRITICAL. Use dual-lip venturi air ring."

CONSTRAINT 3:
  IF film_temp_at_nip > 40°C:
  → VIOLATION: "Blocking risk — CRITICAL. Improve cooling."

CONSTRAINT 4:
  IF BUR > 3.5 AND no_bubble_stabiliser:
  → WARNING: "High BUR without bubble cage — instability risk."

CONSTRAINT 5:
  IF antistatic_ppm > 1000 AND heat_sealing_required:
  → WARNING: "Antistatic level too high — will raise minimum seal temperature."

CONSTRAINT 6:
  IF corona_treatment = over_treatment AND heat_sealing_required:
  → WARNING: "Over-treatment will impair heat sealing."

CONSTRAINT 7:
  IF target = shrink_film AND LDPE_content < 50%:
  → WARNING: "Insufficient LDPE for effective shrink film. Increase LDPE to ≥ 70%."

CONSTRAINT 8:
  IF target = high_clarity AND HDPE_content > 10%:
  → WARNING: "HDPE will significantly increase haze."

CONSTRAINT 9:
  IF melt_temperature > 230°C AND resin = LDPE:
  → WARNING: "Risk of oxidation/degradation. Check stabiliser level."

CONSTRAINT 10:
  IF extruder_power_insufficient_for_LLDPE:
  → VIOLATION: "Extruder motor rated for LDPE only. LLDPE requires up to 0.33 kWh/kg."
```

---

### 16.4 Recommended Adjustment Logic

```
IF score(impact_strength) < 70 AND target_impact = high:
  → Increase BUR by 0.25
  → Consider mLLDPE addition
  → Reduce FLD if LLDPE-based
  → Check bubble shape → stalk recommended

IF score(haze) < 70 AND target_clarity = high:
  → IF LLDPE dominant: Add 20–40% LDPE; reduce FLD
  → IF LDPE dominant: Optimise melt temperature; adjust FLD to optimum
  → Remove or reduce antiblock if possible

IF score(hot_tack) < 70 AND target_hot_tack = high:
  → Switch LLDPE to hexene or octene copolymer
  → Consider mLLDPE seal layer (coextrusion)
  → Reduce MFI of sealing resin

IF score(processability) < 60:
  → Increase LDPE content in LLDPE blend
  → Add processing aid
  → Check die gap
  → Verify extruder motor capacity

IF score(shrink) < 70 AND target_shrink = high:
  → Increase LDPE content to ≥ 70%
  → Use lower MFI LDPE (MFI ≤ 1.5)
  → Increase BUR toward 3:1–4:1

IF score(seal_strength) < 70 AND target_sealing = high:
  → Increase LLDPE or mLLDPE content
  → Prefer hexene or octene LLDPE over butene
  → Check corona treatment level (not over-treated)
  → Reduce slip additive if very high
```

---

### 16.5 Coextrusion Layer Assignment Logic

```
For coextruded films, assign layers by function:

SEALING LAYER (inner/innermost):
  → Best: mLLDPE (Alkamax) — best hot tack, seal strength, seal through contamination
  → Good: Hexene/octene LLDPE
  → Avoid: High antiblock content in seal layer (reduces sealing)
  → Keep slip additive minimal in seal layer

STRUCTURAL / CORE LAYER:
  → Optimise for mechanical properties (stiffness, impact, tear)
  → LLDPE blend or LLDPE + small HDPE
  → Most of film mass

OUTER / SKIN LAYER:
  → Optimise for opticals if clarity required: LDPE or LDPE/LLDPE blend
  → Antiblock can be concentrated here if needed
  → Slip additive for COF if needed
  → Must be corona-treatable if printing required

BARRIER LAYER (if needed):
  → EVOH, HDPE, or Nylon
  → Position centrally in structure
  → Tie layers required for incompatible materials

VISCOSITY MATCHING RULE (mandatory for coextrusion):
  → Adjacent layers must have similar melt viscosities at interface temperature
  → Mismatch → interfacial instability → optical and mechanical defects
  → Use temperature control to adjust viscosity at interface
```

---

## QUICK REFERENCE FORMULAS

```
BUR         = Bubble_diameter / Die_diameter = 2 × LFW / (π × Die_diameter)
Blow Ratio  = LFW / Die_diameter
DDR         = (1000 × Die_gap_h) / (Film_thickness_t × BUR)
Output      = 2 × t × LFW × 60 × V × ρ / (1000 × 1000)   [kg/h]
              where V = line speed (m/min), ρ = density (g/cm³)

Units:
  t   = film thickness (µm)
  LFW = layflat width (mm) — BEFORE trimming
  V   = haul-off speed (m/min)
  h   = die gap (mm)
  d   = die diameter (mm)
  D   = bubble diameter (mm)
  G   = mass output rate (kg/h)
  ρ   = resin density (g/cm³)
```

---

## REVISION NOTES

```
Version: 1.0
Source: Qenos Technical Guide — Film Extrusion and Conversion (Issued July 2015)
Scope: LDPE (Alkathene), LLDPE (Alkatuff), mLLDPE (Alkamax), HDPE (Alkatane)
       Blown film and chill-roll cast film
       PE film packaging and industrial applications

For the optimization module:
  - Sections 1–6:   Resin and formula selection (static knowledge)
  - Sections 7–9:   Extruder and die setup (machine-specific)
  - Sections 10–14: Property optimization maps (function calls)
  - Section 15:     Troubleshooting (diagnostic engine)
  - Section 16:     Scoring and recommendation engine

Extend this file with:
  - Actual machine specifications (die diameter, extruder L/D, motor kW)
  - Supplier-specific resin data sheets
  - Historical trial data for calibration
  - Customer-specific product specs
```

---

*End of Film Extrusion Optimization Knowledge Base*
