# Fix Summary: HTML Export Save Functionality

## 1. Save Draft Fixes
**Issue:** Users reported that only the "Customer Name" was being saved in drafts, while other data (budget values, selections) was lost.
**Root Cause:** The `document.cloneNode(true)` method copies the HTML structure but does not capture the current *dynamic* state of form inputs (typed text, selected options) unless they are explicitly set as HTML attributes.
**Fix:**
- Updated `saveDraftBtn` logic in `server/routes/aebf.js`.
- Added a pre-save step that iterates through all `<input>` and `<select>` elements.
- Explicitly sets the `value` attribute for inputs and `selected` attribute for options to match the current user input.
- This ensures that when the HTML is saved to a file, all user data is persisted.

## 2. Save Final Fixes
**Issue:** "New Customer" names typed into the input field (but not yet confirmed) could be lost when saving as Final.
**Fix:**
- Updated `saveFinalBtn` logic to check for visible `.new-customer-input` fields with values.
- Converts these inputs into text `<span>` elements before removing the input fields, ensuring the customer name appears in the final static report.

## 3. Filename Updates
**Requirement:** "Save Draft" should have "DRAFT" in the name, and "Save Final" should have "FINAL".
**Updates:**
- **Save Draft:** Confirmed filename prefix is `DRAFT_`.
- **Save Final:** Changed filename prefix from `BUDGET_` to `FINAL_`.

## Verification
1.  **Draft:** Fill out a budget form (including custom rows and values). Click "Save Draft". Open the downloaded file. Verify all data is present and editable.
2.  **Final:** Click "Save Final". Verify the filename starts with `FINAL_`. Open the file and verify it is a static report with all data visible (including new customer names).
