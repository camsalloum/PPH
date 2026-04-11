# 📊 COMPREHENSIVE DASHBOARD CARDS STYLING AUDIT

**Generated:** December 4, 2025  
**Updated:** December 5, 2025  
**File:** `MultiChartHTMLExport.js`  
**Purpose:** Document all styling sources and export methods for the 11 dashboard cards

---

## 🔧 FIXES APPLIED (December 5, 2025)

### P&L Table Export Fix

**Root Cause Identified:** The CSS variables (`:root`) used for P&L table sticky headers were not being defined in the exported HTML.

**Variables Missing:**
- `--pl-hdr-h: 28px` (header row height)
- `--z-corner`, `--z-hdr4`, `--z-hdr3`, `--z-hdr2`, `--z-hdr1`, `--z-firstcol`, `--z-header`, `--z-separator` (z-index layering)
- `--sbsr-*` variables for Sales by Sales Rep

**Fix Applied:**
1. Added `:root` CSS variable definitions to the main `<style>` block in the export template
2. Updated CSS extraction functions (`getPLTableStyles()` and `getSalesBySalesRepTableStyles()`) to include `:root` rules when falling back to content-based filtering

---

## ✅ OVERLAY BANNER (Shared by ALL 11 Cards)

| Property | Source |
|----------|--------|
| **Live CSS File** | `DivisionalDashboardLanding.css` (line 162) |
| **Live Component** | `DivisionalDashboardLanding.js` (line 308) |
| **Export CSS** | Extracted via `extractOverlayCSS()` from `cssLoader.js` |
| **Classes** | `.divisional-dashboard__overlay`, `.divisional-dashboard__overlay-banner`, `.divisional-dashboard__overlay-close` |

---

## 📋 COMPLETE CARD-BY-CARD COMPARISON TABLE

| # | Card Name | Live Component | Live CSS File | Live Inline Styles? | Export Method | Export Inline Styles? | Export CSS Classes? | ⚠️ MISMATCH |
|---|-----------|---------------|--------------|---------------------|---------------|----------------------|--------------------|----|
| 1 | **Product Group** | `ProductGroupTable.js` | `ProductGroupTableStyles.css` | ✅ YES | DOM Clone + CSS Extract | ❌ NO (CSS only) | ✅ `.product-group-table` | ❌ |
| 2 | **P&L Financial** | `PLFinancialDetail.js` | `PLTableStyles.css` | ✅ YES | DOM Clone + CSS Extract | ❌ NO (CSS only) | ✅ `.pl-table` | ❌ |
| 3 | **Sales by Customer** | `SalesByCustomerTableNew.js` | `SalesByCustomerTableStyles.css` | ✅ YES | DOM Clone + CSS Extract | ❌ NO (CSS only) | ✅ `.sales-by-customer-table` | ❌ |
| 4 | **Sales by Sales Rep** | `SalesBySalesRepTable.js` | `SalesBySalesRepTable.css` | ✅ YES | DOM Clone + CSS Extract | ❌ NO (CSS only) | ✅ `.sales-by-sales-rep-table` | ❌ |
| 5 | **Sales by Country** | `SalesByCountryTable.js` | `SalesByCountryTableStyles.css` | ✅ YES | DOM Clone + CSS Extract | ❌ NO (CSS only) | ✅ `.sales-by-country-table` | ❌ |
| 6 | **Sales Volume** | `SalesVolumeDetail.js` | N/A (ECharts) | ✅ YES (legend) | ECharts Rebuild | ✅ YES | ❌ | ❌ |
| 7 | **Margin Analysis** | `MarginAnalysisDetail.js` | `ModernMarginGauge.css` | ✅ YES | SVG Rebuild | ✅ YES | ✅ | ❌ |
| 8 | **Manufacturing Cost** | `ManufacturingCostChart.tsx` | `ManufacturingCostTotals.css` | ✅ 100% INLINE (cards) | ECharts Rebuild + Totals | ❌ CSS CLASSES | ✅ `.manufacturing-totals-card` | ⚠️ **YES** |
| 9 | **Below GP Expenses** | `BelowGPExpensesChart.tsx` | `ManufacturingCostTotals.css` | ✅ 100% INLINE (cards) | ECharts Rebuild + Totals | ✅ YES (fixed) | ❌ | ❌ |
| 10 | **Combined Trends** | `ExpencesChart.js` + `Profitchart.js` | `CombinedTrends.css` | ✅ YES | DOM Clone + Rebuild | Mixed | ✅ | ❌ |
| 11 | **Customer Key Facts** | `CustomerKeyFacts.js` | Various | ✅ YES | DOM Clone | Mixed | ✅ | ❌ |

---

## 🔴 CRITICAL MISMATCH: Manufacturing Cost

| Property | LIVE Version | EXPORT Version |
|----------|-------------|----------------|
| **Totals Card Styling** | 100% Inline `style={{...}}` | CSS Classes `.manufacturing-totals-card` |
| **Card Class Used** | ❌ NO class on cards | ✅ `class="manufacturing-totals-card"` |
| **Variance Classes** | ✅ `.variance-arrow`, `.variance-text`, `.variance-percent` | ✅ Same |
| **Container** | Inline `style={{display: flex, ...}}` | `class="totals-scroll-container"` |

### Live ManufacturingCostChart.tsx (Lines 550-570):
```tsx
<div style={{
  padding: '12px 10px',
  borderRadius: '6px',
  backgroundColor: color,
  border: `1px solid ${color}`,
  boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
  minWidth: '150px',
  maxWidth: '180px',
  flex: '1',
  // ... ALL INLINE STYLES
}}>
```

### Export MultiChartHTMLExport.js (Line 6743):
```javascript
cardHTML += '<div class="manufacturing-totals-card" style="background-color: ' + color + '; border-color: ' + color + ';">';
```

---

## ✅ CORRECTLY MATCHED: Below GP Expenses

| Property | LIVE Version | EXPORT Version |
|----------|-------------|----------------|
| **Totals Card Styling** | 100% Inline `style={{...}}` | ✅ 100% Inline `style="..."` |
| **Card Class** | ❌ NO class | `class="below-gp-expenses-totals-card"` (but inline overrides) |
| **Container** | Inline `style={{...}}` | ✅ `class="below-gp-totals-container"` with inline |

---

## 📁 CSS FILE MAPPING

| CSS File | Used By | Location | Loaded in Export? |
|----------|---------|----------|-------------------|
| `DivisionalDashboardLanding.css` | Overlay/Banner | `src/components/dashboard/` | ✅ Via `extractOverlayCSS()` |
| `ProductGroupTableStyles.css` | Product Group | `src/components/dashboard/` | ✅ Via `getProductGroupTableStyles()` |
| `PLTableStyles.css` | P&L Financial | `src/components/dashboard/` | ✅ Via `getPLTableStyles()` |
| `SalesByCustomerTableStyles.css` | Sales by Customer | `src/components/dashboard/` | ✅ Via `getSalesByCustomerTableStyles()` |
| `SalesBySalesRepTable.css` | Sales by Rep | `src/components/dashboard/` | ✅ Via `getSalesBySalesRepTableStyles()` |
| `SalesByCountryTableStyles.css` | Sales by Country | `src/components/dashboard/` | ✅ Via `getSalesByCountryTableStyles()` |
| `ManufacturingCostTotals.css` | Manufacturing + Below GP | `src/components/charts/components/` | ⚠️ In main style block (line 2460) |
| `CombinedTrends.css` | Combined Trends | `src/components/charts/components/` | ⚠️ Partial |
| `ModernMarginGauge.css` | Margin Analysis | `src/components/charts/components/` | ✅ Embedded |

---

## 🔧 EXPORT METHODS BY CARD

### Method 1: DOM Clone + CSS Extract (Tables)
**Cards:** Product Group, P&L Financial, Sales by Customer, Sales by Rep, Sales by Country

```javascript
const captureTableFromCard = async (cardTitle, tableSelector) => {
  // 1. Click card to open overlay
  // 2. Clone entire overlay DOM
  // 3. Extract CSS from document.styleSheets
  // 4. Embed as <style> + HTML
}
```

### Method 2: ECharts Rebuild (Charts)
**Cards:** Sales Volume, Manufacturing Cost, Below GP Expenses

```javascript
// 1. Embed ECharts library in export
// 2. Generate chart options via getSalesVolumeOption(), etc.
// 3. Initialize ECharts on load
// 4. Render totals cards separately
```

### Method 3: SVG Rebuild (Gauges)
**Cards:** Margin Analysis

```javascript
function renderMarginAnalysisGauges() {
  // 1. Build SVG elements programmatically
  // 2. Calculate gauge values from data
  // 3. Inline all styles
}
```

### Method 4: HTML Card Rebuild
**Cards:** Combined Trends

```javascript
function initializeCombinedTrends() {
  // 1. Clone overlay structure
  // 2. Rebuild card HTML
  // 3. Apply CSS classes + inline styles
}
```

---

## 📊 CSS EXTRACTION FUNCTIONS

| Function | File | Extracts |
|----------|------|----------|
| `extractOverlayCSS()` | `cssLoader.js` | `.divisional-dashboard__overlay*` classes |
| `getSalesByCountryTableStyles()` | `MultiChartHTMLExport.js` | Country table styles |
| `getSalesByCustomerTableStyles()` | `MultiChartHTMLExport.js` | Customer table styles |
| `getProductGroupTableStyles()` | `MultiChartHTMLExport.js` | Product group styles |
| `getSalesBySalesRepTableStyles()` | `MultiChartHTMLExport.js` | Sales rep styles |
| `getPLTableStyles()` | `MultiChartHTMLExport.js` | P&L table styles |
| `extractLiveKPICSS()` | `MultiChartHTMLExport.js` | KPI card styles |

---

## 🎯 RECOMMENDATIONS

### For Manufacturing Cost (CRITICAL FIX NEEDED)

**Option A: Change export to 100% inline styles** ✅ RECOMMENDED
- Match the live component behavior
- More reliable, no CSS dependency
- Copy the approach from Below GP Expenses

**Option B: Keep CSS classes but ensure CSS is always loaded**
- Current approach
- Fragile - CSS may not load in some scenarios
- CSS must be in main `<style>` block, not fallback

### CSS Location in Export

```
Line 2460+: Main <style> block (ALWAYS loaded)
Line 724+:  Fallback block (only on CSS extraction failure)
```

**Manufacturing Cost CSS is now in main block (line 2460)** but still uses classes instead of inline.

---

## 📝 FILE LOCATIONS

| File | Path |
|------|------|
| Main Export | `src/components/dashboard/MultiChartHTMLExport.js` |
| CSS Loader | `src/utils/cssLoader.js` |
| Manufacturing Cost Live | `src/components/charts/components/ManufacturingCostChart.tsx` |
| Below GP Live | `src/components/charts/components/BelowGPExpensesChart.tsx` |
| Manufacturing CSS | `src/components/charts/components/ManufacturingCostTotals.css` |
| Combined Trends CSS | `src/components/charts/components/CombinedTrends.css` |
| Landing Page CSS | `src/components/dashboard/DivisionalDashboardLanding.css` |

---

## ✅ VERIFIED WORKING

- [x] Below GP Expenses totals cards (100% inline styles)
- [x] Overlay banner for all cards
- [x] Table exports (DOM clone + CSS extract)
- [x] ECharts charts (embedded library)
- [x] Margin Analysis gauges (SVG rebuild)

## ⚠️ NEEDS ATTENTION

- [ ] Manufacturing Cost totals cards (CSS classes instead of inline)
- [ ] Combined Trends (partial CSS coverage)

---

*Last Updated: December 4, 2025*
