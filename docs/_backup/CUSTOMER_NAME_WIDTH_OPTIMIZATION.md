# Customer Name Column Width Optimization

## Issue
The "Customers - Sales Kgs Comparison" table in Sales by Sales Rep had an excessively wide customer name column, making the table difficult to read and navigate.

## Solution Applied

### File Modified
[src/components/dashboard/SalesBySalesRepTable.css](src/components/dashboard/SalesBySalesRepTable.css)

### Changes Made

Updated `.product-header` class (lines 695-708) to include width constraints:

```css
.product-header {
  text-align: left !important;
  font-weight: 600 !important;
  background-color: #e8eef5 !important;
  font-size: 13px;
  color: #1e3a5f;
  padding-left: 36px !important;
  position: relative;
  /* NEW: Width optimization */
  max-width: 300px !important;
  min-width: 150px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
```

### Added Tooltip Support

Modified [SalesBySaleRepTable.js](src/components/dashboard/SalesBySaleRepTable.js) line 2137 to add `title` attribute:

```javascript
<td className="row-label product-header" title={customer.name}>
  {customer.name}
</td>
```

## Features

1. **Max Width**: Limited to 300px to prevent excessive width
2. **Min Width**: Set to 150px to ensure readability
3. **Ellipsis**: Long customer names are truncated with "..."
4. **Tooltip**: Hovering over truncated names shows the full customer name
5. **Responsive**: Works across all screen sizes

## Example

### Before
```
Customer Name Column Width: ~600px (too wide)
"COSMOPLAST IND CO LLC (Ecommerce) "  [takes up massive space]
```

### After
```
Customer Name Column Width: 150-300px (optimized)
"COSMOPLAST IND CO LLC (E..."  [hover to see full name]
```

## Benefits

1. ✅ More data columns visible without horizontal scrolling
2. ✅ Better table proportions and readability
3. ✅ Full customer names still accessible via tooltip
4. ✅ Consistent with modern UI/UX practices

## Testing

To verify the fix:
1. Navigate to **Sales by Sales Rep** > Select any sales rep tab
2. Scroll down to "**Customers - Sales Kgs Comparison**" table
3. Verify customer name column is now narrower (150-300px)
4. Hover over truncated customer names to see full name in tooltip

## Notes

- This optimization applies to both the header cell ("Customers") and all data cells
- The `.product-header` class is used in multiple tables, so this optimization may benefit other views as well
- If 300px max-width is still too wide, it can be adjusted by changing the `max-width` value in the CSS
