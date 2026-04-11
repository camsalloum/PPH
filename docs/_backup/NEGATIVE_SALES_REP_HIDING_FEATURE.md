# Negative Sales Rep Hiding Feature

## Overview

Implemented a feature to hide sales reps/groups with total negative sales (< 0) from the Sales by Sales Rep Divisional table while maintaining their contribution to the divisional totals.

## Implementation Details

### File Modified
- [src/components/dashboard/SalesBySalesRepDivisional.js](src/components/dashboard/SalesBySalesRepDivisional.js)

### Changes Made

#### 1. Filter Sales Reps by Total Sales (Lines 278-310)

**Logic**:
- After aggregating group data, calculate the total sales across ALL periods for each sales rep/group
- Filter out entities where the sum of all period sales is negative (< 0)
- Store both visible entities (for display) and all entities (for totals calculation)

**Code**:
```javascript
// Calculate total sales across all periods for each entity
const entityTotals = {};
displayEntities.forEach(entityName => {
  let totalSales = 0;
  dataColumnsOnly.forEach(column => {
    const columnKey = getColumnKey(column);
    const salesValue = salesRepDataMap[columnKey]?.[entityName]?.sales || 0;
    totalSales += salesValue;
  });
  entityTotals[entityName] = totalSales;
});

// Filter to only show entities with non-negative totals
const visibleEntities = displayEntities.filter(entityName => {
  const total = entityTotals[entityName];
  if (total < 0) {
    console.log(`🚫 Hiding "${entityName}" due to negative total: ${total}`);
    return false;
  }
  return true;
});

// Store both visible entities (for display) and all entities (for totals)
setSalesReps(visibleEntities);
setSalesRepData(prev => ({
  ...prev,
  _allEntities: displayEntities  // Hidden metadata for calculating accurate totals
}));
```

#### 2. Updated Total Calculation (Lines 551-579)

**Logic**:
- Use all entities (including hidden ones) when calculating divisional totals
- This ensures the "Total Sales" row reflects the true total, including negative sales reps

**Code**:
```javascript
const summaryData = useMemo(() => {
  const summary = {};

  // Get all entities including hidden ones for accurate totals
  const allEntitiesForTotals = salesRepData._allEntities || salesReps;

  dataColumnsOnly.forEach(column => {
    const key = getColumnKey(column);

    let totalSales = 0;
    let salesRepsWithData = 0;

    // Calculate total for ALL entities (including hidden ones with negative totals)
    allEntitiesForTotals.forEach(salesRep => {
      const value = getSalesRepValue(salesRep, column);
      totalSales += value; // include all (even negative total entities) in divisional totals
      if (value > 0) salesRepsWithData++;
    });

    summary[key] = {
      totalSales,
      salesRepsWithData
    };
  });

  return { summary };
}, [dataColumnsOnly, getSalesRepValue, salesReps, salesRepData._allEntities]);
```

## Behavior

### Display Rules

**Visible Sales Reps**:
- Sales reps/groups with total sales ≥ 0 across all periods are displayed
- Example: If a sales rep has sales of [100, -50, 200] = total 250, they are VISIBLE

**Hidden Sales Reps**:
- Sales reps/groups with total sales < 0 across all periods are hidden
- Example: If a sales rep has sales of [100, -50, -200] = total -150, they are HIDDEN
- Hidden sales reps are logged to console: `🚫 Hiding "Sales Rep Name" due to negative total: -150`

### Total Calculation

The "Total Sales" row at the bottom of the table includes:
- ✅ All visible sales reps
- ✅ All hidden sales reps (those with negative totals)

This ensures the divisional total is accurate and represents the true total sales, including losses.

## Example Scenarios

### Scenario 1: Sales Rep with Positive Total
```
Sales Rep: John Doe
2024 Actual: 100,000
2024 Estimate: -20,000
2025 Budget: 150,000
Total: 230,000

Result: ✅ VISIBLE in table
```

### Scenario 2: Sales Rep with Negative Total
```
Sales Rep: Jane Smith
2024 Actual: 50,000
2024 Estimate: -30,000
2025 Budget: -40,000
Total: -20,000

Result: 🚫 HIDDEN from table, but included in Total Sales row
```

### Scenario 3: Group with Mixed Members
```
Group: "Team A" (members: Rep1, Rep2, Rep3)
Rep1: 100,000
Rep2: -30,000
Rep3: -80,000
Total: -10,000

Result: 🚫 HIDDEN from table (group total is negative)
Note: Individual members are not shown, only the aggregated group
```

## Testing

To verify the feature is working:

1. **Check Console Logs**:
   - Look for messages like: `🚫 Hiding "Sales Rep Name" due to negative total: -XXX`
   - Check entity counts: `📊 Total entities: X, Visible: Y, Hidden: Z`

2. **Verify Table Display**:
   - Sales reps with negative totals should not appear in the table
   - Only sales reps with total ≥ 0 should be visible

3. **Verify Total Calculation**:
   - The "Total Sales" row should include all sales reps (visible + hidden)
   - Sum of visible sales reps should be less than or equal to the total (if any reps are hidden)

## Benefits

1. **Cleaner UI**: Removes clutter from sales reps who are net negative
2. **Accurate Totals**: Divisional totals remain accurate by including all data
3. **Focus on Performance**: Users see only sales reps who are contributing positively
4. **Transparency**: Console logs provide visibility into which reps are hidden

## Future Enhancements

Consider adding:
1. A toggle to show/hide negative sales reps
2. Visual indicator in the table header showing how many reps are hidden
3. Export functionality that includes hidden reps
4. Drill-down capability to view hidden reps on demand
