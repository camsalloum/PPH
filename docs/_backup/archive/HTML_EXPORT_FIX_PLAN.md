# HTML Export Fix Plan - Budget Tab

## Problem Statement

The user reports that the **HTML export version** has many issues with styling, formatting, and functionality compared to the **live version**. The export should match the live version in all aspects.

### Key Requirements:
1. ✅ Export table should match live version styling exactly
2. ✅ Include formulas and calculations (MT and Amount)
3. ❌ **Remove MoRM** from export (only show MT and Amount)
4. ✅ Pricing per product group should be captured and embedded before exporting
5. ✅ All attached buttons should work correctly

---

## Current Issues Analysis

### Issue 1: Missing Amount Row in Export ❌
**Problem:** The exported HTML only shows:
- Actual MT row (blue)
- Budget MT row (yellow)

**Missing:** Amount rows are NOT displayed in the export

**Expected:** Should show 4 rows per customer:
1. Actual MT (blue background)
2. Budget MT (yellow background)
3. Actual Amount (green background)
4. Budget Amount (light yellow background)

### Issue 2: MoRM Should Be Hidden ❌
**Problem:** Export currently calculates and may show MoRM

**Fix:** Remove all MoRM calculations and display from export

### Issue 3: Pricing Data Not Embedded ❌
**Problem:** Pricing data is queried but may not be properly embedded in the exported HTML

**Fix:** Ensure pricing map is embedded in JavaScript for Amount calculations

### Issue 4: Table Structure Mismatch ❌
**Problem:** Export table structure doesn't match live version

**Current Export Structure:**
```
Customer | Country | Product Group | 1 | 2 | ... | 12 | Total
---------|---------|---------------|---|---|-----|----|----- 
[Actual MT Row - Blue]
[Budget MT Row - Yellow]
```

**Expected Structure (matching live):**
```
Customer | Country | Product Group | 1 | 2 | ... | 12 | Total
---------|---------|---------------|---|---|-----|----|----- 
[Actual MT Row - Blue]
[Budget MT Row - Yellow]
[Actual Amount Row - Green]
[Budget Amount Row - Light Yellow]
```

### Issue 5: Footer Totals Incomplete ❌
**Problem:** Footer only shows MT totals

**Expected:** Should show:
1. Total Actual (MT) - Blue
2. Total Budget (MT) - Yellow
3. Total Actual (Amount) - Green
4. Total Budget (Amount) - Light Yellow

### Issue 6: Styling Inconsistencies ❌
**Problem:** Colors, fonts, padding may not match live version exactly

**Fix:** Copy exact CSS from live BudgetTab.js component

---

## Implementation Plan

### Step 1: Update Table Structure ✅

**File:** `server/routes/aebf.js`
**Function:** `POST /api/aebf/export-html-budget-form`

**Changes:**
1. Modify table body generation to include 4 rows per customer instead of 2
2. Add Actual Amount row (green background)
3. Add Budget Amount row (light yellow background)
4. Calculate Amount values: `MT * 1000 * sellingPrice`

**Code Pattern:**
```javascript
${tableData.map((row, idx) => {
  // Row 1: Actual MT (blue)
  const actualMTCells = ...;
  
  // Row 2: Budget MT (yellow)
  const budgetMTCells = ...;
  
  // Row 3: Actual Amount (green) - NEW
  const actualAmountCells = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const mtValue = row.monthlyActual?.[month] || 0;
    const pricing = findPricing(row.productGroup);
    const amountValue = mtValue * 1000 * pricing.sellingPrice;
    return `<td style="background-color: #d4edda;">${formatAmount(amountValue)}</td>`;
  }).join('');
  
  // Row 4: Budget Amount (light yellow) - NEW
  const budgetAmountCells = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const key = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
    const mtValue = parseFloat(budgetDataMap[key] || 0);
    const pricing = findPricing(row.productGroup);
    const amountValue = mtValue * 1000 * pricing.sellingPrice;
    return `<td style="background-color: #fff3cd;">${formatAmount(amountValue)}</td>`;
  }).join('');
  
  return `
    <tr class="actual-row">${actualMTCells}</tr>
    <tr class="budget-row">${budgetMTCells}</tr>
    <tr class="actual-amount-row">${actualAmountCells}</tr>
    <tr class="budget-amount-row">${budgetAmountCells}</tr>
  `;
}).join('')}
```

### Step 2: Update Footer Totals ✅

**Add 4 footer rows:**

```javascript
<tfoot>
  <!-- Row 1: Total Actual MT (Blue) -->
  <tr class="actual-total">
    <td colSpan="3">Total Actual (MT)</td>
    ${monthlyActualMTTotals}
    <td>${yearTotalActualMT}</td>
  </tr>
  
  <!-- Row 2: Total Budget MT (Yellow) -->
  <tr class="budget-total">
    <td colSpan="3">Total Budget (MT)</td>
    ${monthlyBudgetMTTotals}
    <td>${yearTotalBudgetMT}</td>
  </tr>
  
  <!-- Row 3: Total Actual Amount (Green) - NEW -->
  <tr class="actual-amount-total">
    <td colSpan="3">Total Actual (Amount)</td>
    ${monthlyActualAmountTotals}
    <td>${yearTotalActualAmount}</td>
  </tr>
  
  <!-- Row 4: Total Budget Amount (Light Yellow) - NEW -->
  <tr class="budget-amount-total">
    <td colSpan="3">Total Budget (Amount)</td>
    ${monthlyBudgetAmountTotals}
    <td>${yearTotalBudgetAmount}</td>
  </tr>
</tfoot>
```

### Step 3: Update CSS Styling ✅

**Add styles for Amount rows:**

```css
/* Actual Amount Row - Green */
tbody tr.actual-amount-row {
  background-color: #d4edda;
}
tbody tr.actual-amount-row td {
  background-color: #d4edda;
  text-align: right;
  font-weight: 500;
  padding: 6px 8px;
}

/* Budget Amount Row - Light Yellow */
tbody tr.budget-amount-row {
  background-color: #fff3cd;
}
tbody tr.budget-amount-row td {
  background-color: #fff3cd;
  text-align: right;
  font-weight: 500;
  padding: 6px 8px;
}

/* Footer Amount Totals */
tfoot tr.actual-amount-total {
  background-color: #c3e6cb;
}
tfoot tr.actual-amount-total td {
  background-color: #c3e6cb;
  text-align: right;
  font-weight: 700;
}

tfoot tr.budget-amount-total {
  background-color: #ffeeba;
}
tfoot tr.budget-amount-total td {
  background-color: #ffeeba;
  text-align: right;
  font-weight: 700;
}
```

### Step 4: Update Legend ✅

**Add Amount indicators to legend:**

```html
<div class="legend">
  <div class="legend-item">
    <span class="legend-color legend-actual"></span>
    <span>Actual ${actualYear} Volume (MT)</span>
  </div>
  <div class="legend-item">
    <span class="legend-color legend-budget"></span>
    <span>Budget ${budgetYear} Volume (MT)</span>
  </div>
  <!-- NEW: Amount indicators -->
  <div class="legend-item">
    <span class="legend-color" style="background-color: #d4edda; border-color: #28a745;"></span>
    <span>Actual ${actualYear} Amount</span>
  </div>
  <div class="legend-item">
    <span class="legend-color" style="background-color: #fff3cd; border-color: #ffc107;"></span>
    <span>Budget ${budgetYear} Amount</span>
  </div>
</div>
```

### Step 5: Update JavaScript Calculations ✅

**Ensure pricing map is embedded and used:**

```javascript
const pricingMap = ${JSON.stringify(pricingMap)};

function findPricing(productGroup) {
  if (!productGroup) return { sellingPrice: 0 };
  const key = productGroup.toLowerCase().trim();
  return pricingMap[key] || { sellingPrice: 0 };
}

function calculateAmountTotals() {
  const monthlyActualAmountTotals = {};
  const monthlyBudgetAmountTotals = {};
  
  for (let month = 1; month <= 12; month++) {
    monthlyActualAmountTotals[month] = 0;
    monthlyBudgetAmountTotals[month] = 0;
  }
  
  // Calculate from table data
  document.querySelectorAll('tr.actual-row').forEach(row => {
    const productGroup = row.querySelector('td:nth-child(3)').textContent;
    const pricing = findPricing(productGroup);
    
    row.querySelectorAll('td:nth-child(n+4):not(:last-child)').forEach((cell, idx) => {
      const mtValue = parseFloat(cell.textContent.replace(/,/g, '')) || 0;
      const amountValue = mtValue * 1000 * pricing.sellingPrice;
      monthlyActualAmountTotals[idx + 1] += amountValue;
    });
  });
  
  // Similar for budget...
  
  return { monthlyActualAmountTotals, monthlyBudgetAmountTotals };
}
```

### Step 6: Remove MoRM ✅

**Changes:**
1. Remove all MoRM calculations from export
2. Remove MoRM from pricing map (keep only sellingPrice)
3. Remove MoRM footer rows
4. Remove MoRM from legend

**Before:**
```javascript
const pricingMap = {
  "product1": { sellingPrice: 10, morm: 2 },
  ...
};
```

**After:**
```javascript
const pricingMap = {
  "product1": { sellingPrice: 10 },
  ...
};
```

### Step 7: Fix Button Functionality ✅

**Ensure all buttons work:**

1. **Save Draft Button** - Should save with Amount rows
2. **Save Final Button** - Should finalize with Amount calculations
3. **Add Row Button** - Should add 4 rows (MT + Amount)
4. **Delete Row Button** - Should remove all 4 rows

**Update Save Final to include Amount data:**

```javascript
document.getElementById('saveFinalBtn').addEventListener('click', function() {
  // Validate both MT and Amount data
  const hasMTData = /* check MT inputs */;
  const hasAmountData = /* check Amount calculations */;
  
  if (!hasMTData) {
    alert('Please enter MT budget values');
    return;
  }
  
  // Include Amount in saved data
  const budgetData = [];
  document.querySelectorAll('input[data-month]').forEach(input => {
    const mtValue = parseFloat(input.value.replace(/,/g, ''));
    if (mtValue > 0) {
      const productGroup = input.dataset.group;
      const pricing = findPricing(productGroup);
      const amountValue = mtValue * 1000 * pricing.sellingPrice;
      
      budgetData.push({
        customer: input.dataset.customer,
        country: input.dataset.country,
        productGroup: productGroup,
        month: parseInt(input.dataset.month),
        mtValue: mtValue * 1000, // Convert to KGS
        amountValue: amountValue
      });
    }
  });
  
  // Save with metadata...
});
```

---

## Testing Checklist

### Visual Testing ✅
- [ ] Export matches live version layout exactly
- [ ] 4 rows per customer (MT Actual, MT Budget, Amount Actual, Amount Budget)
- [ ] Colors match: Blue, Yellow, Green, Light Yellow
- [ ] Footer shows 4 total rows
- [ ] Legend shows all 4 indicators
- [ ] No MoRM visible anywhere

### Functional Testing ✅
- [ ] Save Draft button works and preserves Amount data
- [ ] Save Final button works and includes Amount calculations
- [ ] Add Row button creates 4 rows
- [ ] Delete Row button removes all 4 rows
- [ ] Pricing data is correctly embedded
- [ ] Amount calculations are accurate (MT * 1000 * price)
- [ ] Totals recalculate correctly on input change

### Data Integrity Testing ✅
- [ ] Exported file can be imported back
- [ ] Amount values match live calculations
- [ ] No data loss on export/import cycle
- [ ] Pricing data persists in export

---

## Files to Modify

1. **server/routes/aebf.js**
   - Function: `POST /api/aebf/export-html-budget-form` (line ~3800)
   - Changes: Table structure, CSS, JavaScript, calculations

2. **Testing Required:**
   - Export HTML from live system
   - Open exported HTML in browser
   - Verify all 4 rows display correctly
   - Test Save Draft and Save Final buttons
   - Import back to system and verify data integrity

---

## Implementation Priority

### Phase 1: Critical Fixes (Must Have) 🔴
1. Add Amount rows to table body
2. Add Amount totals to footer
3. Update CSS for Amount rows
4. Embed pricing data correctly
5. Remove MoRM completely

### Phase 2: Functionality (Should Have) 🟡
1. Update Save Draft to include Amount
2. Update Save Final to include Amount
3. Fix Add/Delete row buttons for 4-row structure
4. Update legend with Amount indicators

### Phase 3: Polish (Nice to Have) 🟢
1. Match exact colors from live version
2. Match exact fonts and spacing
3. Add tooltips/help text
4. Improve mobile responsiveness

---

## Success Criteria

✅ **Export matches live version exactly**
✅ **Shows MT and Amount (no MoRM)**
✅ **Pricing embedded and working**
✅ **All buttons functional**
✅ **Can import exported file successfully**
✅ **Calculations accurate**

---

## Next Steps

1. Review this plan with user for approval
2. Implement Phase 1 critical fixes
3. Test export functionality
4. Implement Phase 2 functionality
5. Final testing and validation
6. Deploy to production

---

**Document Version:** 1.0  
**Created:** January 2025  
**Status:** Awaiting Approval
