# Flexible Packaging Cost & Materials Estimation Calculator

## Comprehensive Technical & Calculation Reference

> **Purpose**: This document details every calculation concept, formula, frontend structure and interaction flow used in the ProPackHub Flexible Packaging Estimation Calculator. It serves as the definitive reference for re-implementing this module inside the PPH 26.2 project.

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Application Architecture (Frontend Focus)](#2-application-architecture-frontend-focus)
3. [UI Sections & Layout](#3-ui-sections--layout)
4. [Project Header — Input Fields](#4-project-header--input-fields)
5. [Product Type Dimensions](#5-product-type-dimensions)
   - 5.1 [Roll Dimensions](#51-roll-dimensions)
   - 5.2 [Sleeve Dimensions](#52-sleeve-dimensions)
   - 5.3 [Bag/Pouch Dimensions](#53-bagpouch-dimensions)
   - 5.4 [Zipper Calculations (Bag/Pouch only)](#54-zipper-calculations-bagpouch-only)
6. [Raw Material Cost Table](#6-raw-material-cost-table)
   - 6.1 [Material Types & Categories](#61-material-types--categories)
   - 6.2 [Row Fields & Calculations](#62-row-fields--calculations)
   - 6.3 [Total GSM Calculation per Row](#63-total-gsm-calculation-per-row)
   - 6.4 [Cost/M² Calculation per Row](#64-costm²-calculation-per-row)
   - 6.5 [Estimated Kg Required per Row](#65-estimated-kg-required-per-row)
   - 6.6 [Layer (%) Calculation per Row](#66-layer--calculation-per-row)
   - 6.7 [Solvent-Mix Cost Row](#67-solvent-mix-cost-row)
   - 6.8 [Solvent Ratio](#68-solvent-ratio)
7. [Raw Material Summary (Derived Fields)](#7-raw-material-summary-derived-fields)
   - 7.1 [Film Density](#71-film-density)
   - 7.2 [Total Micron](#72-total-micron)
   - 7.3 [Total GSM (Aggregate)](#73-total-gsm-aggregate)
   - 7.4 [Total Cost/M²](#74-total-costm²)
   - 7.5 [Pieces Per Kg](#75-pieces-per-kg)
   - 7.6 [Grams Per Piece](#76-grams-per-piece)
   - 7.7 [Square Meter Per Kg](#77-square-meter-per-kg)
   - 7.8 [Printing Film Width](#78-printing-film-width)
   - 7.9 [Linear Meter Per Kg (Film Width)](#79-linear-meter-per-kg-film-width)
   - 7.10 [Linear Meter Per Kg (Reel Width) — Hidden Field](#710-linear-meter-per-kg-reel-width--hidden-field)
   - 7.11 [Order Quantity Conversions](#711-order-quantity-conversions)
8. [Roll After Slitting](#8-roll-after-slitting)
9. [Operation Cost](#9-operation-cost)
   - 9.1 [Process List](#91-process-list)
   - 9.2 [Total Hours Calculation](#92-total-hours-calculation)
   - 9.3 [Process Cost Calculation](#93-process-cost-calculation)
   - 9.4 [Total Process Cost](#94-total-process-cost)
   - 9.5 [Operation Cost Per Kg](#95-operation-cost-per-kg)
10. [Total Cost Table](#10-total-cost-table)
    - 10.1 [Cost Columns](#101-cost-columns)
    - 10.2 [Per Kg Row](#102-per-kg-row)
    - 10.3 [Per Kpcs Row](#103-per-kpcs-row)
    - 10.4 [Per SQM Row](#104-per-sqm-row)
    - 10.5 [Per LM Row](#105-per-lm-row)
    - 10.6 [Per Roll 500 LM Row](#106-per-roll-500-lm-row)
    - 10.7 [Sale Price Column (Totals)](#107-sale-price-column-totals)
11. [Actual vs Estimation Section](#11-actual-vs-estimation-section)
    - 11.1 [Raw Material Actuals Table](#111-raw-material-actuals-table)
    - 11.2 [Actual Raw Material Cost Per Kg](#112-actual-raw-material-cost-per-kg)
    - 11.3 [Raw Material Difference %](#113-raw-material-difference-)
    - 11.4 [Operation Actuals Table](#114-operation-actuals-table)
    - 11.5 [Actual Operation Cost Per Kg](#115-actual-operation-cost-per-kg)
    - 11.6 [Operation Difference %](#116-operation-difference-)
12. [Final Summary Table](#12-final-summary-table)
    - 12.1 [Estimated Total Cost](#121-estimated-total-cost)
    - 12.2 [Actual Total Cost](#122-actual-total-cost)
    - 12.3 [Margins & Percentages](#123-margins--percentages)
    - 12.4 [Difference Calculations](#124-difference-calculations)
13. [Charts & Visualization](#13-charts--visualization)
14. [Data Model / Entity Relationships](#14-data-model--entity-relationships)
15. [Frontend Technology Stack](#15-frontend-technology-stack)
16. [Complete Formulas Quick-Reference](#16-complete-formulas-quick-reference)

---

## 1. Overview & Purpose

The **Flexible Packaging Cost & Materials Estimation Calculator** is a comprehensive tool designed for the flexible packaging industry. It allows estimators and production planners to:

- **Estimate raw material costs** for multi-layer flexible packaging structures (substrates, inks, adhesives)
- **Calculate operation/conversion costs** for all manufacturing processes (extrusion, printing, lamination, slitting, pouch-making, etc.)
- **Generate a total sale price** across multiple unit measurements (per Kg, per Kpcs, per SQM, per LM, per Roll)
- **Compare estimated vs actual costs** after production to identify variance and profitability
- **Visualize cost allocation** through bar charts for materials and operations

The calculator supports three product types: **Roll**, **Sleeve**, and **Bag/Pouch**, each with their own dimensional inputs and calculation variations.

---

## 2. Application Architecture (Frontend Focus)

| Aspect | Technology |
|--------|-----------|
| **Original Framework** | Laravel 11 (Blade templates) |
| **Frontend Rendering** | Server-side Blade + client-side JavaScript |
| **Styling** | Bootstrap 5 + custom CSS |
| **Charts** | Chart.js with `chartjs-plugin-datalabels` |
| **PDF Export** | DomPDF (server-side) |
| **All Calculations** | 100% client-side JavaScript (real-time) |

**Key Architectural Point**: Every single calculation is performed in the browser using vanilla JavaScript with DOM event listeners. There is **no server-side calculation logic**. The backend only persists form data and retrieves material master data (solid %, density, cost/kg, waste %).

---

## 3. UI Sections & Layout

The calculator is a single-page form divided into these visual sections (top to bottom):

1. **Header Bar** — Save / Reset buttons
2. **Project Info** — Customer, Job, Product Type, Order Quantity, Units, Date
3. **Product Dimensions** — Conditional tables (Roll / Sleeve / Bag-Pouch)
4. **Raw Material Cost Table** — Dynamic rows with material selection
5. **Raw Material Summary** — Derived metrics (Film Density, Total Micron, GSM, etc.)
6. **Roll After Slitting** — Roll geometry calculations
7. **Operation Cost Table** — 10 manufacturing processes
8. **Total Cost Table** — Multi-unit pricing grid
9. **Actual vs Estimation** — Post-production comparison
10. **Final Summary** — Margins, percentages, and differences
11. **Charts** — Horizontal bar charts for cost allocation
12. **Remarks** — Free-text notes

---

## 4. Project Header — Input Fields

| Field | Type | Notes |
|-------|------|-------|
| Customer Name | Text | Free text |
| Job Name | Text | Free text |
| Product Type | Select | `Roll` / `Sleeve` / `Bag/Pouch` — controls which dimension table & formulas are active |
| Project Number | Text | Internal reference |
| Order Quantity | Number (formatted with commas) | The base order amount |
| Units | Select | `Kgs` / `Kpcs` / `SQM` / `LM` / `Roll 500 LM` — determines how order quantity converts to Kgs |
| Date | Date picker | Project date |

**Behavior**: Changing `Product Type` shows/hides the corresponding dimension table and recalculates all dependent fields.

---

## 5. Product Type Dimensions

### 5.1 Roll Dimensions

| Field | ID/Class | Unit | Input Type |
|-------|----------|------|------------|
| Reel Width | `roll-real-width` | mm | User input |
| Cut Off | `roll-cut-off` | mm | User input |
| Extra Printing Trim | `roll-extra-printing-trim` | mm | User input |
| Pieces per Cut | `roll-pieces-per-cut` | count | User input |
| Number of Ups | `numberOfUpsRoll` | count | User input |

### 5.2 Sleeve Dimensions

| Field | ID/Class | Unit | Input Type |
|-------|----------|------|------------|
| Lay Flat | `lay-flat-value` | mm | User input |
| Reel Width | `real-width-value` | mm | User input |
| Cut Off | `cut-off-value` | mm | User input |
| Extra Printing Trim | `extra-printing-trim-value` | mm | User input |
| Number of Ups | `number-of-ups-value` | count | User input |

### 5.3 Bag/Pouch Dimensions

| Field | ID/Class | Unit | Input Type |
|-------|----------|------|------------|
| Open Height (F+G+B) | `open-height` | mm | User input |
| Open Width (with Gusset) | `open-width` | mm | User input |
| Extra Printing Trim | `extra-printing-trim` | mm | User input |
| Number of Ups | `no_of_ups` | count | User input |

### 5.4 Zipper Calculations (Bag/Pouch only)

Zipper calculations only appear when Product Type is `Bag/Pouch`.

| Field | Class | Formula | Type |
|-------|-------|---------|------|
| Weight of 1 Meter Zipper (gr) | `weight-of-one-meter-zip` | — | User input |
| Cost of 1 Meter Zipper | `cost-one-meter-zipper` | — | User input |
| Cost of 1 gr Zipper | `cost-one-gr-zipper` | `Cost_1m_Zipper / Weight_1m_Zipper` | Calculated |
| Zipper Weight per Pouch (gr) | `zipper-weight-per-pouch` | `Open_Width × Weight_1m_Zipper × 0.001` | Calculated |
| Zipper Cost per Pouch | `zipper-cost-per-pouch` | `Zipper_Weight_Per_Pouch × Cost_1gr_Zipper` | Calculated |
| Zipper Cost 1 kg | `zipper-cost-one-kg` | `Zipper_Cost_Per_Pouch × Pieces_Per_Kg` | Calculated |
| Qty Required Zippers (Mtr) | `quantity-req-zipper-one` | `(Zipper_Weight_Per_Pouch × Order_Kpcs × 1000) / Weight_1m_Zipper` | Calculated |
| Qty Required Zippers (Kgs) | `quantity-req-zipper-two` | `Zipper_Weight_Per_Pouch × Order_Kpcs` | Calculated |

---

## 6. Raw Material Cost Table

This is the core estimation table. It has **dynamic rows** (default 8, expandable) where each row represents one material layer in the packaging structure.

### 6.1 Material Types & Categories

Materials are organized in a **Type → Material** hierarchy:

| Type Value | Type Name | Description |
|------------|-----------|-------------|
| 1 | **Substrate** | Base films (PET, BOPP, PE, Nylon, etc.) |
| 2 | **Ink** | Printing inks (solvent-based, water-based, etc.) |
| 3 | **Adhesive** | Lamination adhesives (solvent-based, solventless, etc.) |

When a Type is selected, the Material dropdown is populated from the database (Categories → Subcategories). Selecting a material auto-fills: **Solid %**, **Density**, **Cost/Kg**, and **Waste %** from the material master data.

### 6.2 Row Fields & Calculations

Each row in the Raw Material Cost table contains:

| Column | Class | Input/Calc | Description |
|--------|-------|------------|-------------|
| Type | `typeSelect` | User select | Substrate (1) / Ink (2) / Adhesive (3) |
| Material | `materialSelect` | User select | Fetched from DB based on Type |
| Solid % | `solid-input` | Auto-filled / editable | Coverage percentage (mainly for inks/adhesives) |
| Micron | `micron-input` | User input | Layer thickness in microns |
| Density | `density-input` | Auto-filled (readonly) | Material density (g/cm³) |
| Total GSM | `total-gsm-input` | Calculated (readonly) | Grams per square meter for this layer |
| Cost per Kg | `cost-per-kg-input` | Auto-filled / editable | Material cost per kilogram |
| Waste % | `waste-input` | Auto-filled / editable | Expected production waste percentage |
| Cost/M² | `cost-m-input` | Calculated (readonly) | Cost per square meter for this layer |
| Required Kgs (Estimated) | `estimated-kg-req-input` | Calculated (readonly) | Total Kgs needed for the order |
| Layer % | `lower-input` | Calculated (readonly) | This layer's proportion of total GSM |

### 6.3 Total GSM Calculation per Row

The GSM formula depends on the material type:

**For Substrate (Type = 1):**

$$\text{Total GSM} = \text{Micron} \times \text{Density}$$

**For Ink (Type = 2) or Adhesive (Type = 3):**

$$\text{Total GSM} = \frac{\text{Solid \%} \times \text{Micron}}{100}$$

### 6.4 Cost/M² Calculation per Row

The Cost/M² formula also depends on the material type:

**For Substrate (Type = 1):**

$$\text{Cost/M²} = \frac{\text{Total GSM} \times \text{Cost per Kg}}{1000} \times \left(1 + \frac{\text{Waste \%}}{100}\right)$$

**For Ink (Type = 2) or Adhesive (Type = 3):**

$$\text{Cost/M²} = \frac{\text{Micron} \times \text{Cost per Kg}}{1000} \times \left(1 + \frac{\text{Waste \%}}{100}\right)$$

> **Note**: For Ink/Adhesive the formula uses the raw micron value (wet film thickness) rather than the Total GSM value (dry film), because Total GSM already accounts for solid content.

### 6.5 Estimated Kg Required per Row

$$\text{For Substrate:} \quad \text{Est. Kg} = \frac{\text{Order Qty (Kgs)} \times \text{Row Total GSM}}{\text{Aggregate Total GSM}} \times \left(1 + \frac{\text{Waste \%}}{100}\right)$$

$$\text{For Ink/Adhesive:} \quad \text{Est. Kg} = \frac{\text{Order Qty (Kgs)} \times \text{Micron}}{\text{Aggregate Total GSM}} \times \left(1 + \frac{\text{Waste \%}}{100}\right)$$

### 6.6 Layer (%) Calculation per Row

$$\text{Layer \%} = \frac{\text{Row Total GSM}}{\text{Aggregate Total GSM}} \times 100$$

### 6.7 Solvent-Mix Cost Row

Below the main table there is a special **Solvent-mix cost** row. This accounts for the solvent used to dilute inks and adhesives.

| Field | Class | Default | Description |
|-------|-------|---------|-------------|
| Solvent-Mix Cost/Kg | `cost-per-kg-last-value` | 1.50 | Cost per kg of solvent mix |
| Solvent-Mix Cost/M² | `cost-m-last-field-tableless` | Calculated | Cost/M² contribution from solvent |
| Solvent-Mix Est. Kg | `last-est-kg` | Calculated | Estimated kg of solvent required |

**Solvent-Mix Cost/M² formula:**

$$\text{Solvent Cost/M²} = \frac{(\text{Sum of TotalGSM where Type=2}) + (\text{Sum of TotalGSM where Material=Solvent Base})}{\text{Solvent Ratio}} \times \frac{\text{Solvent Cost/Kg}}{1000}$$

**Solvent-Mix Estimated Kg formula:**

$$\text{Solvent Est. Kg} = \left(\text{Sum of Est.Kg where Type=2} + \text{Sum of Est.Kg where Material=Solvent Base}\right) \times \text{Solvent Ratio}$$

### 6.8 Solvent Ratio

The solvent ratio represents the amount of solvent relative to solvent-based inks and adhesives.

| Field | Class | Description |
|-------|-------|-------------|
| Ratio Top | fixed | Always `1` |
| Ratio Bottom | `total-gsm-last-value` | User-editable (default `0.5`) |

This means for every 1 part of ink/adhesive, 0.5 parts of solvent is used (or whatever ratio the user sets).

---

## 7. Raw Material Summary (Derived Fields)

These fields appear below the raw material table and provide aggregate metrics.

### 7.1 Film Density

$$\text{Film Density (g/cm³)} = \frac{\text{Aggregate Total GSM}}{\text{Total Micron}}$$

### 7.2 Total Micron

$$\text{Total Micron} = \sum_{\text{Type=1}} \text{Micron}_i + \sum_{\text{Type=2}} \text{TotalGSM}_i + \sum_{\text{Type=3}} \text{TotalGSM}_i$$

> **Logic**: For substrates, the actual micron thickness is summed. For inks and adhesives, their Total GSM (dry film equivalent) is used as an equivalent micron contribution to the overall structure.

### 7.3 Total GSM (Aggregate)

$$\text{Total GSM} = \sum_{\text{all rows}} \text{TotalGSM}_i$$

### 7.4 Total Cost/M²

$$\text{Total Cost/M²} = \sum_{\text{all rows}} \text{CostM²}_i + \text{Solvent Cost/M²}$$

### 7.5 Pieces Per Kg

Depends on product type:

**Roll:**

$$\text{Pieces/Kg} = \frac{1000}{\text{Reel Width} \times \text{Cut Off} \times \text{Total GSM} \times 0.001 \times 0.001} \times \text{Pieces per Cut}$$

**Sleeve:**

$$\text{Pieces/Kg} = \frac{1000}{\text{Reel Width} \times \text{Cut Off} \times \text{Total GSM} \times 0.001 \times 0.001}$$

**Bag/Pouch:**

$$\text{Pieces/Kg} = \frac{1000}{\text{Open Width} \times \text{Open Height} \times \text{Total GSM} \times 0.001 \times 0.001}$$

> The `0.001 × 0.001` converts mm² to m² (mm × mm / 1,000,000 = m²).

### 7.6 Grams Per Piece

$$\text{Grams/Piece} = \frac{1000}{\text{Pieces/Kg}}$$

### 7.7 Square Meter Per Kg

$$\text{SQM/Kg} = \frac{1000}{\text{Total GSM}}$$

### 7.8 Printing Film Width

Depends on product type:

| Product Type | Formula |
|-------------|---------|
| **Roll** | `(Reel Width × Number of Ups) + Extra Printing Trim` |
| **Sleeve** | `(Reel Width × Number of Ups) + Extra Printing Trim` |
| **Bag/Pouch** | `(Open Width × Number of Ups) + Extra Printing Trim` |

### 7.9 Linear Meter Per Kg (Film Width)

$$\text{LM/Kg (Film Width)} = \frac{\text{SQM/Kg}}{\text{Printing Film Width}} \times 1000$$

### 7.10 Linear Meter Per Kg (Reel Width) — Hidden Field

This is an internal calculation used for unit conversions:

| Product Type | Formula |
|-------------|---------|
| **Roll** | `(SQM/Kg / Reel Width) × 1000` |
| **Sleeve** | `(SQM/Kg / Reel Width) × 1000` |
| **Bag/Pouch** | `(SQM/Kg / Open Height) × 1000` |

### 7.11 Order Quantity Conversions

The user enters order quantity in one unit; the system converts to all other units:

**Order Quantity in Kgs** (from whatever unit was selected):

| Selected Unit | Conversion to Kgs |
|--------------|-------------------|
| Kgs | `Order Qty` (no conversion) |
| SQM | `Order Qty / SQM_Per_Kg` |
| Kpcs | `Order Qty × Grams_Per_Piece` |
| LM | `Order Qty / LM_Per_Kg_ReelWidth` |
| Roll 500 LM | `(Order Qty / LM_Per_Kg_ReelWidth) × 500` |

**Order Quantity in Kpcs:**

$$\text{Kpcs} = \frac{\text{Order Qty (Kgs)} \times 1000}{\text{Grams/Piece}} \div 1000$$

**Order Quantity in Meters:**

$$\text{Meters} = \text{Order Qty (Kgs)} \times \text{LM/Kg (Film Width)}$$

---

## 8. Roll After Slitting

This section calculates roll specifications after the slitting process.

| Field | Class | Input/Calc | Formula |
|-------|-------|------------|---------|
| Core Inside Dia + Core Thickness × 2 | `core-inside` | User input (mm) | — |
| Roll Outside Diameter (With Core) | `roll-outside-diameter` | User input (mm) | — |
| Film On Roll Weight | `film-on-roll-weight` | Calculated (Kgs) | See below |
| Film On Roll: Length in Meter | `film-on-roll-length` | Calculated (Mtr) | See below |
| Roll Width | `roll-width` | Calculated (mm) | Equals Reel Width / Real Width / Open Height based on product type |
| Pieces Per Roll | `pieces-per-roll` | Calculated | `Film_On_Roll_Weight × Pieces_Per_Kg` |
| If Required Roll Weight (Without Core) | `required-roll-weight-kg` | User input (Kgs) | — |
| Roll Outside Diameter (calculated) | `core-inside-roll` | Calculated (mm) | See below |

**Film On Roll Weight:**

$$\text{Weight} = \frac{\left(\left(\frac{D_{outer}}{2}\right)^2 - \left(\frac{D_{core}}{2}\right)^2\right) \times \pi \times W \times \rho}{1{,}000{,}000}$$

Where:
- $D_{outer}$ = Roll Outside Diameter (mm)
- $D_{core}$ = Core Inside Diameter (mm)
- $W$ = Roll Width (mm) — varies by product type
- $\rho$ = Film Density (g/cm³)

**Film On Roll Length:**

$$\text{Length (m)} = \frac{\frac{\text{Weight} \times 1000}{\text{Film Density}}}{\frac{\text{Total Micron}}{10000} \times \frac{W}{10}} \div 100$$

**Roll Outside Diameter (from required weight):**

$$D_{outer} = 2 \times \sqrt{\frac{\frac{\text{Req. Weight} \times 1000}{\text{Film Density}}}{\frac{W}{10} \times \pi} + \left(\frac{D_{core}}{2 \times 10}\right)^2} \times 10$$

---

## 9. Operation Cost

This section estimates the cost of each manufacturing process.

### 9.1 Process List

| # | Process | Speed Unit | Checkbox Class |
|---|---------|-----------|----------------|
| 1 | Extrusion | Kgs/Hr | `extrusion-check` |
| 2 | Printing | Mtr/Min | `printing-check` |
| 3 | Rewinding | Mtr/Min | `rewinding-check` |
| 4 | Lamination 1 | Mtr/Min | `lamination-1-check` |
| 5 | Lamination 2 | Mtr/Min | `lamination-2-check` |
| 6 | Lamination 3 | Mtr/Min | `lamination-3-check` |
| 7 | Slitting | Mtr/Min | `slitting-check` |
| 8 | Sleeving | Mtr/Min | `sleeving-check` |
| 9 | Sleeve Doctoring | Mtr/Min | `doctoring-check` |
| 10 | Pouch Making | Pcs/Min | `pouch-making-check` |

Each process has a **checkbox** to enable/disable it. When disabled, all inputs in that row are set to readonly with value 0.

### 9.2 Total Hours Calculation

**Extrusion (unique formula):**

$$\text{Hours} = \text{Setup Hours} + \frac{\text{Sum of Est.Kg (LDPE Transparent + LDPE White)}}{\text{Speed (Kgs/Hr)}}$$

**Printing, Rewinding, Lamination 1-3, Slitting (Mtr/Min processes):**

$$\text{Hours} = \text{Setup Hours} + \frac{\text{Order Qty in Meters} / \text{Speed (Mtr/Min)}}{60}$$

**Sleeving & Sleeve Doctoring (includes ups multiplier):**

$$\text{Hours} = \text{Setup Hours} + \frac{(\text{Order Qty in Meters} \times \text{Number of Ups}) / \text{Speed (Mtr/Min)}}{60}$$

**Pouch Making (Pcs/Min):**

$$\text{Hours} = \text{Setup Hours} + \frac{(\text{Order Qty Kpcs} \times 1000) / \text{Speed (Pcs/Min)}}{60}$$

### 9.3 Process Cost Calculation

For each enabled process:

$$\text{Process Cost} = \text{Total Hours} \times \text{Process Cost/Hour}$$

Result is rounded to the nearest integer.

### 9.4 Total Process Cost

$$\text{Total Process Cost} = \sum_{\text{checked processes}} \text{Process Cost}_i$$

### 9.5 Operation Cost Per Kg

$$\text{Op. Cost/Kg} = \frac{\text{Total Process Cost}}{\text{Order Qty in Kgs}}$$

This value is also automatically set as the **Operation Cost** value in the Total Cost table column 5 (`fifth-per-kg`).

---

## 10. Total Cost Table

A grid showing the complete cost breakdown across multiple unit measurements.

### 10.1 Cost Columns

| Column | Description | Input Type |
|--------|-------------|------------|
| **Raw Material Cost** | From material calculations | Auto-calculated |
| **Markup** | Percentage markup on raw material cost | User enters % |
| **Plates/Cylinders Cost** | Fixed cost per kg for printing plates | User input |
| **Delivery Cost** | Fixed cost per kg for delivery | User input |
| **Operation Cost** | From operation cost calculation | Auto-calculated |
| **Sale Price** | Sum of all columns | Auto-calculated |

### 10.2 Per Kg Row

| Column | Formula |
|--------|---------|
| Raw Material Cost per Kg | `Total_Cost_M² / Total_GSM × 1000` |
| Markup per Kg | `Raw_Material_Per_Kg × Markup_% / 100` |
| Plates/Cylinders per Kg | User input directly |
| Delivery per Kg | User input directly |
| Operation per Kg | `Total_Process_Cost / Order_Qty_Kgs` |
| **Sale Price per Kg** | Sum of all 5 columns |

### 10.3 Per Kpcs Row

Each column's Per Kpcs value:

$$\text{Per Kpcs} = \frac{\text{Per Kg Value}}{\text{Pieces Per Kg}} \times 1000$$

### 10.4 Per SQM Row

Each column's Per SQM value:

$$\text{Per SQM} = \frac{\text{Per Kg Value}}{\text{SQM Per Kg}}$$

### 10.5 Per LM Row

Each column's Per LM value:

$$\text{Per LM} = \frac{\text{Per Kg Value}}{\text{LM Per Kg (Reel Width)}}$$

### 10.6 Per Roll 500 LM Row

Each column's Per Roll value:

$$\text{Per Roll 500 LM} = \text{Per LM Value} \times 500$$

### 10.7 Sale Price Column (Totals)

Each row in the Sale Price column is the **sum of the 5 preceding columns** in the same row:

$$\text{Sale Price} = \text{RM Cost} + \text{Markup} + \text{Plates} + \text{Delivery} + \text{Op. Cost}$$

The **Sale Price per Kg** also auto-fills the `lastSalesPrice` field in the final summary.

---

## 11. Actual vs Estimation Section

After production completes, actual consumption data is entered for comparison.

### 11.1 Raw Material Actuals Table

A **Final Output** field (in Kgs) captures the actual production output.

For each material row in the estimation table, a corresponding row appears in the actuals table:

| Column | Description |
|--------|-------------|
| Material | Auto-mirrored from estimation (readonly) |
| Actual Consumption | User input (Kgs consumed) |
| Cost Per Kg | Auto-mirrored from estimation (readonly) |
| Total Amount | `Actual Consumption × Cost Per Kg` |

A special **Solvent-Mix** row mirrors the solvent cost/kg.

**Total Actual Amount** = Sum of all Total Amounts (including solvent).

**Hidden Field (% allocation)**: For each row:

$$\text{Allocation \%} = \frac{\text{Row Total Amount}}{\text{Grand Total Amount}} \times 100$$

This percentage feeds the bar chart.

### 11.2 Actual Raw Material Cost Per Kg

$$\text{Actual RM Cost/Kg} = \frac{\text{Total Actual Amount}}{\text{Final Output (Kgs)}}$$

### 11.3 Raw Material Difference %

$$\text{RM Difference \%} = \frac{\text{Actual RM Cost/Kg} - \text{Estimated RM Cost/Kg}}{\text{Estimated RM Cost/Kg}} \times 100$$

### 11.4 Operation Actuals Table

For each enabled process (checked in operation cost), a row appears:

| Column | Description |
|--------|-------------|
| Process Name | Auto-mirrored (readonly) |
| Actual Hours | User input |
| Process Cost/Hour | Auto-mirrored (readonly) |
| Total Amount | `Actual Hours × Process Cost/Hour` |

**Total Actual Operation Amount** = Sum of all Total Amounts.

### 11.5 Actual Operation Cost Per Kg

$$\text{Actual Op. Cost/Kg} = \frac{\text{Total Actual Op. Amount}}{\text{Final Output (Kgs)}}$$

### 11.6 Operation Difference %

$$\text{Op. Difference \%} = \frac{\text{Actual Op. Cost/Kg} - \text{Estimated Op. Cost/Kg}}{\text{Estimated Op. Cost/Kg}} \times 100$$

---

## 12. Final Summary Table

### 12.1 Estimated Total Cost

$$\text{Est. Total Cost/Kg} = \text{RM Cost/Kg} + \text{Plates Cost/Kg} + \text{Delivery Cost/Kg} + \text{Op. Cost/Kg}$$

> Note: Markup is NOT included in Estimated Total Cost — it only appears in the Sale Price.

### 12.2 Actual Total Cost

$$\text{Actual Total Cost/Kg} = \text{Actual RM Cost/Kg} + \text{Actual Op. Cost/Kg} + \text{Plates Cost/Kg} + \text{Delivery Cost/Kg}$$

### 12.3 Margins & Percentages

| Metric | Formula |
|--------|---------|
| **Est. Total Cost % of Sales** | `(Est. Total Cost / Sale Price) × 100` |
| **Actual Total Cost % of Sales** | `(Actual Total Cost / Sale Price) × 100` |
| **Estimated Margin** | `Sale Price - Est. Total Cost` |
| **Estimated Margin %** | `(Estimated Margin / Sale Price) × 100` |
| **Actual Margin** | `Sale Price - Actual Total Cost` |
| **Actual Margin %** | `(Actual Margin / Sale Price) × 100` |

### 12.4 Difference Calculations

| Metric | Formula |
|--------|---------|
| **Absolute Difference** | `Actual Total Cost - Est. Total Cost` |
| **Difference %** | `((Actual Total Cost - Est. Total Cost) / Est. Total Cost) × 100` |

---

## 13. Charts & Visualization

Two horizontal bar charts are rendered using **Chart.js** with the `chartjs-plugin-datalabels` plugin:

### Chart 1: Raw Materials Cost Allocation (%)

- **Data Source**: The hidden allocation % field for each material row in the actuals table
- **Labels**: Material names from the actuals table
- **Values**: Percentage of total actual raw material cost per material
- **Appearance**: Blue bars (#1363A6), yellow data labels with blue text showing percentage

### Chart 2: Operation Cost Allocation (%)

- **Data Source**: The hidden percentage field for each process row in the operation actuals table
- **Labels**: Process names
- **Values**: Percentage of total actual operation cost per process
- **Appearance**: Same styling as Chart 1

Both charts:
- Horizontal orientation (`indexAxis: "y"`)
- X-axis scale: 0–100%
- Auto-update when actual data changes
- Responsive with minimum height of 350px

---

## 14. Data Model / Entity Relationships

The existing Laravel app uses these models (for reference when building the new implementation):

```
MainTable (1 per estimation project)
├── customerName, jobName, productType, orderQuantity, units, projectNumber, project_date, user_id
│
├── SecondaryTable (1:1) — All scalar fields
│   ├── Dimension inputs (roll, sleeve, pouch)
│   ├── Zipper fields
│   ├── Solvent fields
│   ├── All operation cost fields (speed, setup, hours, process cost per process)
│   ├── All total cost table fields
│   ├── All actual vs estimation fields
│   ├── Checkbox states for processes
│   ├── Summary fields, margins, percentages
│   └── Remarks
│
├── ArrayField (1:N) — Raw material rows
│   ├── typeSelect, materialSelect
│   ├── solid-input, micron-input, density-input, total-gsm-input
│   ├── cost-per-kg-input, waste-input, cost-m-input
│   ├── estimated-kg-req-input, lower-input
│   └── main_table_id
│
├── SecondArray (1:N) — Actual material consumption rows
│   ├── actual-material, actual-consumption
│   ├── actual-cost-per-kg, actual-total-amount
│   ├── row_id, hidden-field-value
│   └── main_table_id
│
└── ThirdArray (1:N) — Actual operation rows
    ├── process-name, actual-hours
    ├── process-cost-hour, total-amount-actual
    ├── hidden-value
    └── main_table_id
```

**Material Master Data:**
```
Category (Substrate=1, Ink=2, Adhesive=3)
└── Subcategory (material names)
    └── Material (name, solid%, density, costPerKg, waste%)
```

---

## 15. Frontend Technology Stack

| Component | Technology |
|-----------|-----------|
| Layout / Templating | Laravel Blade (to be converted to React/JSX) |
| CSS Framework | Bootstrap 5 |
| Charts | Chart.js + chartjs-plugin-datalabels |
| PDF Export | DomPDF (server-side; to be converted to client-side) |
| Icon Library | Font Awesome 6 |
| Font | Albert Sans (Google Fonts) |
| All Calculations | Vanilla JavaScript (DOM manipulation) |

### Key Frontend Behaviors

1. **Reactive Calculations**: Every input change triggers a cascade of recalculations through event listeners. Changes propagate through the dependency chain (e.g., changing Micron → Total GSM → Cost/M² → Total Cost/M² → Per Kg → Per Kpcs → Sale Price).

2. **Dynamic Rows**: The raw material table supports adding and removing rows. Each new row gets all event listeners re-attached.

3. **Conditional Sections**: Product Type selection shows/hides Roll, Sleeve, or Bag/Pouch dimension tables and adjusts all formulas accordingly.

4. **Number Formatting**: Order quantities and large numbers use comma formatting via `toLocaleString()`. Input fields strip commas before parsing.

5. **Material Auto-Fill**: When a material is selected, an AJAX fetch retrieves `solid`, `density`, `costPerKg`, and `waste` from the server and populates the row.

6. **Process Enable/Disable**: Checkboxes enable/disable operation rows. Disabled rows are set to readonly with 0 values.

7. **Actual Data Mirroring**: The actual vs estimation tables automatically mirror material names and cost/kg values from the estimation table.

---

## 16. Complete Formulas Quick-Reference

### Material Layer Formulas

| Formula | Expression |
|---------|-----------|
| **GSM (Substrate)** | `Micron × Density` |
| **GSM (Ink/Adhesive)** | `(Solid% × Micron) / 100` |
| **Cost/M² (Substrate)** | `(GSM × CostPerKg / 1000) × (1 + Waste%/100)` |
| **Cost/M² (Ink/Adhesive)** | `(Micron × CostPerKg / 1000) × (1 + Waste%/100)` |
| **Est. Kg (Substrate)** | `(OrderKgs × RowGSM / TotalGSM) × (1 + Waste%/100)` |
| **Est. Kg (Ink/Adhesive)** | `(OrderKgs × Micron / TotalGSM) × (1 + Waste%/100)` |
| **Layer %** | `(RowGSM / TotalGSM) × 100` |

### Aggregate Formulas

| Formula | Expression |
|---------|-----------|
| **Total Micron** | `Σ Micron(Subs) + Σ GSM(Ink) + Σ GSM(Adh)` |
| **Total GSM** | `Σ GSM(all rows)` |
| **Film Density** | `TotalGSM / TotalMicron` |
| **SQM/Kg** | `1000 / TotalGSM` |
| **Total Cost/M²** | `Σ CostM²(all rows) + SolventCostM²` |

### Unit Conversion Formulas

| Formula | Expression |
|---------|-----------|
| **Pieces/Kg (Roll)** | `(1e6 / (ReelWidth × CutOff × TotalGSM)) × PiecesPerCut` |
| **Pieces/Kg (Sleeve)** | `1e6 / (ReelWidth × CutOff × TotalGSM)` |
| **Pieces/Kg (Pouch)** | `1e6 / (OpenWidth × OpenHeight × TotalGSM)` |
| **Grams/Piece** | `1000 / PiecesPerKg` |
| **Print Film Width (Roll)** | `(ReelWidth × Ups) + ExtraTrim` |
| **LM/Kg (Film Width)** | `(SQM/Kg / PrintFilmWidth) × 1000` |
| **LM/Kg (Reel Width)** | `(SQM/Kg / ReelWidth) × 1000` |

### Pricing Formulas

| Formula | Expression |
|---------|-----------|
| **RM Cost/Kg** | `(TotalCostM² / TotalGSM) × 1000` |
| **Markup/Kg** | `RMCostPerKg × Markup% / 100` |
| **Op. Cost/Kg** | `TotalProcessCost / OrderQtyKgs` |
| **Sale Price/Kg** | `RMCost + Markup + Plates + Delivery + OpCost` |
| **Per Kpcs** | `PerKg / PiecesPerKg × 1000` |
| **Per SQM** | `PerKg / SQMPerKg` |
| **Per LM** | `PerKg / LMPerKg(ReelWidth)` |
| **Per Roll 500 LM** | `PerLM × 500` |

### Operation Hours Formulas

| Process Type | Formula |
|-------------|---------|
| **Extrusion** | `SetupHrs + (EstKg_LDPE / Speed_KgsHr)` |
| **Mtr/Min Processes** | `SetupHrs + (OrderMeters / Speed_MtrMin) / 60` |
| **With Ups (Sleeving/Doctoring)** | `SetupHrs + (OrderMeters × Ups / Speed_MtrMin) / 60` |
| **Pouch Making** | `SetupHrs + (OrderKpcs × 1000 / Speed_PcsMin) / 60` |

### Actual vs Estimation Formulas

| Formula | Expression |
|---------|-----------|
| **Actual RM Cost/Kg** | `TotalActualAmount / FinalOutput` |
| **RM Difference %** | `((ActualRMCostKg - EstRMCostKg) / EstRMCostKg) × 100` |
| **Actual Op. Cost/Kg** | `TotalActualOpAmount / FinalOutput` |
| **Op. Difference %** | `((ActualOpCostKg - EstOpCostKg) / EstOpCostKg) × 100` |
| **Est. Total Cost** | `RMCost/Kg + Plates/Kg + Delivery/Kg + OpCost/Kg` |
| **Actual Total Cost** | `ActualRMCost/Kg + ActualOpCost/Kg + Plates/Kg + Delivery/Kg` |
| **Estimated Margin** | `SalePrice - EstTotalCost` |
| **Actual Margin** | `SalePrice - ActualTotalCost` |
| **Cost Difference** | `ActualTotalCost - EstTotalCost` |
| **Difference %** | `((ActualTotalCost - EstTotalCost) / EstTotalCost) × 100` |

---

## Notes for PPH 26.2 Integration

1. **All calculations should remain client-side** for real-time responsiveness
2. The material master data (solid%, density, cost/kg, waste%) needs to be available via API or pre-loaded
3. Consider using React state management instead of DOM manipulation for cleaner code
4. The three product types (Roll/Sleeve/Pouch) share ~80% of the calculation logic with variations only in dimensional inputs and Pieces/Kg formula
5. The Zipper section only applies to Bag/Pouch and can be conditionally rendered
6. Charts should update reactively when actual data changes
7. PDF export can be implemented client-side using libraries like jsPDF or html2canvas
8. The "Actual vs Estimation" section is a post-production feature — the estimation can be saved and revisited later

---

*Document generated: 2026-02-23 | Source: PPH Estimate Dir (Laravel/Blade application)*
