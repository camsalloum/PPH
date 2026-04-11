# Fix Summary: HTML Export Bug & Sales Rep Refresh

## 1. HTML Export Bug Fix
**Issue:** In the exported HTML budget file, adding a "New Row" resulted in a row missing the "Total" column, and the row total was not being calculated.

**Fix:**
- Modified `server/routes/aebf.js`:
  - Updated `addCustomRow` function in the generated HTML to append the missing `<td>` for the total column.
  - Updated `recalculateTotals` function to include `tr.custom-row` in the row total calculation loop (previously only targeted `tr.budget-row`).

## 2. Sales Rep Import Refresh Fix
**Issue:** When importing a Sales Rep budget file while already viewing that same Sales Rep/Year, the table would not refresh to show the new data because the filters didn't change.

**Fix:**
- Modified `src/components/MasterData/AEBF/BudgetTab.js`:
  - In `handleImportFilledHtml`, added logic to check if the imported file's filters match the current view.
  - If they match, explicitly called `fetchHtmlTableData()` to force a refresh.
  - Applied this fix to both the immediate success path and the confirmation dialog path (for consistency).

## Verification
- **HTML Export:** Newly added rows in the offline HTML file should now have a yellow "Total" column that updates automatically when monthly values are entered.
- **Sales Rep Import:** Importing a file for the currently selected Sales Rep should immediately update the table with the new values.
