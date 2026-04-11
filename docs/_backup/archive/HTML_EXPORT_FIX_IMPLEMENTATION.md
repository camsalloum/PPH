# HTML Export Fix - Implementation Guide

## File to Modify
**File:** `server/routes/aebf.js`  
**Function:** `POST /api/aebf/export-html-budget-form` (around line 2600-3700)

---

## Changes Required

### Change 1: Update Table Body Generation (Line ~3071)

**Location:** Inside the `<tbody id="tableBody">` section

**Current Code (2 rows per customer):**
```javascript
return '<tr class="actual-row">' +
  '<td rowspan="2">' + row.customer + '</td>' +
  '<td rowspan="2">' + row.country + '</td>' +
  '<td rowspan="2">' + row.productGroup + '</td>' +
  actualCells +
  '<td style="background-color: #cce4ff; text-align: right; font-weight: 700;">' + actualRowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
'</tr>' +
'<tr class="budget-row">' +
  budgetCells +
  '<td class="budget-row-total" style="background-color: #FFEB3B; text-align: right; font-weight: 700;">' + budgetRowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
'</tr>';
```

**New Code (4 rows per customer - ADD BEFORE THE RETURN STATEMENT):**
```javascript
// Get pricing for this product group
const productGroupKey = (row.productGroup || '').toLowerCase();
const pricing = pricingMap[productGroupKey] || { sellingPrice: 0 };
const sellingPrice = pricing.sellingPrice || 0;

// Calculate actual Amount cells (MT * 1000 * sellingPrice)
let actualAmountTotal = 0;
const actualAmountCells = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  const mtValue = row.monthlyActual?.[month] || 0;
  const amountValue = mtValue * 1000 * sellingPrice;
  actualAmountTotal += amountValue;
  const formatted = amountValue >= 1000000 ? (amountValue / 1000000).toFixed(1) + 'M' :
                    amountValue >= 1000 ? (amountValue / 1000).toFixed(1) + 'K' :
                    amountValue.toFixed(0);
  return '<td style="background-color: #d4edda; text-align: right; font-weight: 500; padding: 6px 8px;">' + formatted + '</td>';
}).join('');

// Calculate budget Amount cells (MT * 1000 * sellingPrice)
let budgetAmountTotal = 0;
const budgetAmountCells = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  const key = row.customer + '|' + row.country + '|' + row.productGroup + '|' + month;
  const preFilledValue = budgetDataMap[key] || '';
  const mtValue = preFilledValue ? parseFloat(preFilledValue.toString().replace(/,/g, '')) || 0 : 0;
  const amountValue = mtValue * 1000 * sellingPrice;
  budgetAmountTotal += amountValue;
  const formatted = amountValue >= 1000000 ? (amountValue / 1000000).toFixed(1) + 'M' :
                    amountValue >= 1000 ? (amountValue / 1000).toFixed(1) + 'K' :
                    amountValue.toFixed(0);
  return '<td style="background-color: #fff3cd; text-align: right; font-weight: 500; padding: 6px 8px;">' + formatted + '</td>';
}).join('');

const actualAmountTotalFormatted = actualAmountTotal >= 1000000 ? (actualAmountTotal / 1000000).toFixed(1) + 'M' :
                                   actualAmountTotal >= 1000 ? (actualAmountTotal / 1000).toFixed(1) + 'K' :
                                   actualAmountTotal.toFixed(0);
const budgetAmountTotalFormatted = budgetAmountTotal >= 1000000 ? (budgetAmountTotal / 1000000).toFixed(1) + 'M' :
                                   budgetAmountTotal >= 1000 ? (budgetAmountTotal / 1000).toFixed(1) + 'K' :
                                   budgetAmountTotal.toFixed(0);
```

**THEN CHANGE THE RETURN STATEMENT TO:**
```javascript
return '<tr class="actual-row">' +
  '<td rowspan="4">' + row.customer + '</td>' +  // CHANGE: rowspan="2" to rowspan="4"
  '<td rowspan="4">' + row.country + '</td>' +    // CHANGE: rowspan="2" to rowspan="4"
  '<td rowspan="4">' + row.productGroup + '</td>' + // CHANGE: rowspan="2" to rowspan="4"
  actualCells +
  '<td style="background-color: #cce4ff; text-align: right; font-weight: 700;">' + actualRowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
'</tr>' +
'<tr class="budget-row">' +
  budgetCells +
  '<td class="budget-row-total" style="background-color: #FFEB3B; text-align: right; font-weight: 700;">' + budgetRowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
'</tr>' +
// ADD THESE TWO NEW ROWS:
'<tr class="actual-amount-row">' +
  actualAmountCells +
  '<td style="background-color: #c3e6cb; text-align: right; font-weight: 700;">' + actualAmountTotalFormatted + '</td>' +
'</tr>' +
'<tr class="budget-amount-row">' +
  budgetAmountCells +
  '<td style="background-color: #ffeeba; text-align: right; font-weight: 700;">' + budgetAmountTotalFormatted + '</td>' +
'</tr>';
```

---

### Change 2: Add CSS Styles for Amount Rows (Line ~2780)

**Location:** In the `<style>` section, after the existing tbody styles

**ADD THIS CSS:**
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
```

---

### Change 3: Update Legend (Line ~3040)

**Location:** In the legend section inside `<th colspan="16" class="legend-header">`

**Current Legend:**
```html
<div class="legend-item">
  <span class="legend-color legend-actual"></span>
  <span>Actual ${actualYear} Volume (MT)</span>
</div>
<div class="legend-item">
  <span class="legend-color legend-budget"></span>
  <span>Budget ${budgetYear} Volume (MT)</span>
</div>
```

**ADD AFTER THE ABOVE:**
```html
<div class="legend-item">
  <span class="legend-color" style="background-color: #d4edda; border-color: #28a745;"></span>
  <span>Actual ${actualYear} Amount</span>
</div>
<div class="legend-item">
  <span class="legend-color" style="background-color: #fff3cd; border-color: #ffc107;"></span>
  <span>Budget ${budgetYear} Amount</span>
</div>
```

---

### Change 4: Update JavaScript recalculateTotals() Function (Line ~3300)

**Location:** Inside the `<script>` section, in the `recalculateTotals()` function

**ADD THIS CODE at the end of the function (before the closing brace):**

```javascript
// Calculate Amount totals
const monthlyActualAmountTotals = {};
const monthlyBudgetAmountTotals = {};

for (let month = 1; month <= 12; month++) {
  monthlyActualAmountTotals[month] = 0;
  monthlyBudgetAmountTotals[month] = 0;
}

// Calculate actual Amount totals
document.querySelectorAll('tr.actual-row').forEach(row => {
  const productGroupCell = row.querySelector('td:nth-child(3)');
  if (!productGroupCell) return;
  const productGroup = productGroupCell.textContent.trim();
  const pricing = findPricing(productGroup);
  
  const cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
  cells.forEach((cell, idx) => {
    if (idx < 12) {
      const mtValue = parseFloat(cell.textContent.replace(/,/g, '')) || 0;
      const amountValue = mtValue * 1000 * pricing.sellingPrice;
      monthlyActualAmountTotals[idx + 1] += amountValue;
    }
  });
});

// Calculate budget Amount totals
document.querySelectorAll('input:not([disabled])').forEach(input => {
  const month = parseInt(input.dataset.month);
  const productGroup = input.dataset.group;
  const mtValue = parseFloat(input.value.replace(/,/g, '')) || 0;
  const pricing = findPricing(productGroup);
  
  if (month >= 1 && month <= 12 && !isNaN(mtValue)) {
    const amountValue = mtValue * 1000 * pricing.sellingPrice;
    monthlyBudgetAmountTotals[month] += amountValue;
  }
});

// Update Amount footer rows
const actualAmountRow = document.querySelector('tfoot tr.actual-amount-total');
const budgetAmountRow = document.querySelector('tfoot tr.budget-amount-total');

if (actualAmountRow) {
  const cells = actualAmountRow.querySelectorAll('td:not(:first-child):not(:last-child)');
  cells.forEach((cell, idx) => {
    if (idx < 12) {
      cell.textContent = formatAmount(monthlyActualAmountTotals[idx + 1]);
    }
  });
  const totalCell = actualAmountRow.querySelector('td:last-child');
  if (totalCell) {
    const total = Object.values(monthlyActualAmountTotals).reduce((sum, val) => sum + val, 0);
    totalCell.textContent = formatAmount(total);
  }
}

if (budgetAmountRow) {
  const cells = budgetAmountRow.querySelectorAll('td:not(:first-child):not(:last-child)');
  cells.forEach((cell, idx) => {
    if (idx < 12) {
      cell.textContent = formatAmount(monthlyBudgetAmountTotals[idx + 1]);
    }
  });
  const totalCell = budgetAmountRow.querySelector('td:last-child');
  if (totalCell) {
    const total = Object.values(monthlyBudgetAmountTotals).reduce((sum, val) => sum + val, 0);
    totalCell.textContent = formatAmount(total);
  }
}
```

**ALSO ADD THIS HELPER FUNCTION at the top of the script section:**
```javascript
function formatAmount(value) {
  if (!value || value === 0) return '0';
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
  return value.toFixed(0);
}

function findPricing(productGroup) {
  if (!productGroup) return { sellingPrice: 0 };
  const key = productGroup.toLowerCase().trim();
  return pricingMap[key] || { sellingPrice: 0 };
}
```

---

## Summary of Changes

1. ✅ **Table Body**: Changed from 2 rows to 4 rows per customer (MT + Amount)
2. ✅ **CSS**: Added styles for Amount rows (green and light yellow)
3. ✅ **Legend**: Added Amount indicators
4. ✅ **JavaScript**: Added Amount calculations to recalculateTotals()
5. ✅ **Footer**: Already has Amount rows (no changes needed)

---

## Testing Steps

1. Export HTML from live system
2. Open exported HTML in browser
3. Verify 4 rows per customer are displayed
4. Verify Amount calculations are correct
5. Verify totals recalculate when budget values change
6. Test Save Draft and Save Final buttons
7. Import exported file back to system

---

## Notes

- The footer already has Amount rows (lines 3213-3236), so no changes needed there
- MoRM has been removed from all calculations (only MT and Amount remain)
- Pricing data is already embedded in the pricingMap variable
- All buttons should work correctly with the new 4-row structure

---

**Status:** Ready for implementation  
**Priority:** Critical  
**Estimated Time:** 30-45 minutes
