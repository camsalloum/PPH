# Bug Fix: New Customer Input Fields Not Enabled

## Issue Description
When users added a new customer in the exported HTML budget form, the input fields for entering budget values remained disabled even after:
- Typing the new customer name
- Selecting a country
- Selecting a product group

The input fields only became enabled when selecting an **existing customer** from the dropdown, not when adding a **new customer**.

---

## Root Cause

### Problem in `updateInputStates()` Function

The function was checking for customer value in this order:
1. `customerSelect.value` - The dropdown value
2. `customerSpan.textContent` - The confirmed customer name (after Enter/blur)

**Missing:** Check for the `customerInput.value` - The input field where user types new customer name

When a user selected "+ Add New Customer", the flow was:
1. Dropdown value set to `''` (empty)
2. Input field shown for typing
3. User types customer name
4. **`updateInputStates()` didn't detect the typed value**
5. Input fields remained disabled

---

## Solution

### 1. Updated `updateInputStates()` Function

**Before:**
```javascript
function updateInputStates(row) {
  const customerSelect = row.querySelector('.customer-select');
  const customerSpan = row.querySelector('.customer-cell span:not(.delete-btn)');
  
  // Get customer value from select or span text
  let customer = '';
  if (customerSelect && customerSelect.value) {
    customer = customerSelect.value;
  } else if (customerSpan) {
    customer = customerSpan.textContent.trim();
  }
  
  const isComplete = customer && country && productGroup;
  inputs.forEach(input => {
    input.disabled = !isComplete;  // Always disabled for new customer!
  });
}
```

**After:**
```javascript
function updateInputStates(row) {
  const customerSelect = row.querySelector('.customer-select');
  const customerInput = row.querySelector('.new-customer-input');  // NEW
  const customerSpan = row.querySelector('.customer-cell span:not(.delete-btn)');
  
  // Get customer value from select, input field, or span text
  let customer = '';
  if (customerSelect && customerSelect.value && customerSelect.value !== '__NEW__') {
    customer = customerSelect.value;
  } else if (customerInput && customerInput.style.display !== 'none' && customerInput.value.trim()) {
    // NEW: Check if user is typing new customer name
    customer = customerInput.value.trim();
  } else if (customerSpan) {
    customer = customerSpan.textContent.trim();
  }
  
  const isComplete = customer && country && productGroup;
  inputs.forEach(input => {
    input.disabled = !isComplete;  // Now enables when typing new customer!
    if (customer) {
      input.dataset.customer = customer;  // Update dataset in real-time
    }
  });
}
```

### 2. Added Real-Time Input Listener

**Before:**
```javascript
if (customerInput) {
  customerInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNewCustomer();
    }
  });
  
  customerInput.addEventListener('blur', function() {
    saveNewCustomer();
  });
}
```

**After:**
```javascript
if (customerInput) {
  customerInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNewCustomer();
    }
  });
  
  customerInput.addEventListener('blur', function() {
    saveNewCustomer();
  });
  
  // NEW: Update input states as user types
  customerInput.addEventListener('input', function() {
    updateInputStates(row);
  });
}
```

---

## How It Works Now

### User Flow for Adding New Customer:

1. **User clicks "Add Row"**
   - New row added with dropdowns and disabled input fields

2. **User selects "+ Add New Customer"**
   - Dropdown hidden
   - Input field shown for typing
   - Input fields remain disabled (waiting for complete info)

3. **User types customer name** (e.g., "ABC Company")
   - `input` event fires on every keystroke
   - `updateInputStates()` called
   - Checks: ✅ Customer = "ABC Company", ❌ Country = "", ❌ Product Group = ""
   - Input fields remain disabled (incomplete)

4. **User selects country** (e.g., "United Arab Emirates")
   - `change` event fires
   - `updateInputStates()` called
   - Checks: ✅ Customer = "ABC Company", ✅ Country = "UAE", ❌ Product Group = ""
   - Input fields remain disabled (incomplete)

5. **User selects product group** (e.g., "Flexible Packaging")
   - `change` event fires
   - `updateInputStates()` called
   - Checks: ✅ Customer = "ABC Company", ✅ Country = "UAE", ✅ Product Group = "Flexible Packaging"
   - **Input fields now ENABLED!** ✅

6. **User enters budget values**
   - Can now type in all 12 month input fields
   - Values are captured with correct customer name

7. **User presses Enter or clicks away**
   - `saveNewCustomer()` called
   - Input field replaced with plain text span
   - Customer name confirmed and displayed

---

## Testing Scenarios

### ✅ Test 1: Add New Customer - Complete Flow
1. Click "Add Row"
2. Select "+ Add New Customer"
3. Type "Test Customer"
4. Select country "UAE"
5. Select product group "Flexible Packaging"
6. **Expected:** Input fields enabled
7. Enter values in January: 100
8. **Expected:** Value accepted and displayed

### ✅ Test 2: Add New Customer - Incomplete Info
1. Click "Add Row"
2. Select "+ Add New Customer"
3. Type "Test Customer"
4. Select country "UAE"
5. **Do NOT select product group**
6. **Expected:** Input fields remain disabled
7. Try to enter value
8. **Expected:** Cannot type (fields disabled)

### ✅ Test 3: Add New Customer - Change Mind
1. Click "Add Row"
2. Select "+ Add New Customer"
3. Type "Test Customer"
4. Clear input field (backspace all text)
5. **Expected:** Input fields remain disabled
6. Select existing customer from dropdown
7. **Expected:** Input fields enabled (if country/PG selected)

### ✅ Test 4: Existing Customer Selection
1. Click "Add Row"
2. Select existing customer "Customer A"
3. Country auto-filled (if exists in actual data)
4. Select product group
5. **Expected:** Input fields enabled
6. Enter values
7. **Expected:** Values accepted

---

## Additional Checks Performed

### 1. **Save Function**
- ✅ Collects data from `input.dataset.customer`
- ✅ Dataset updated in real-time as user types
- ✅ New customer names properly saved in budget data

### 2. **Total Calculations**
- ✅ Totals recalculate when values entered in new rows
- ✅ Both actual and budget totals update correctly

### 3. **Data Validation**
- ✅ Empty customer names handled (fields disabled)
- ✅ Partial selections handled (fields disabled until complete)
- ✅ Customer name trimmed (whitespace removed)

### 4. **Country Selection**
- ✅ Country dropdown enabled for new customers
- ✅ Country dropdown disabled/auto-filled for existing customers (if in actual data)
- ✅ Country value updates dataset correctly

### 5. **Product Group Selection**
- ✅ Product group dropdown works correctly
- ✅ Product group value updates dataset correctly
- ✅ All three selections required before enabling inputs

---

## Files Modified

### `server/routes/aebf.js`

**Lines Changed:**
- Line ~3027-3057: `updateInputStates()` function
- Line ~2987-2990: Added `input` event listener to customer input field

**Changes:**
1. Added `customerInput` query in `updateInputStates()`
2. Added logic to check `customerInput.value` when input field is visible
3. Added real-time `input` event listener to trigger `updateInputStates()` on every keystroke
4. Updated dataset assignment to work with all customer input methods

---

## Impact

### Before Fix:
- ❌ New customer input fields always disabled
- ❌ Users couldn't enter budget values for new customers
- ❌ Workaround: Had to use existing customer names only

### After Fix:
- ✅ New customer input fields enable when all info provided
- ✅ Real-time validation as user types
- ✅ Smooth user experience
- ✅ Both new and existing customers work correctly

---

## Related Functions

All these functions work together for the complete flow:

1. **`updateInputStates(row)`** - Checks if all required fields filled, enables/disables inputs
2. **`showCustomerInput()`** - Shows input field when "+ Add New Customer" selected
3. **`saveNewCustomer()`** - Confirms new customer name and replaces input with text
4. **`applyCustomerSelection(customer)`** - Handles existing customer selection
5. **`attachRowListeners(row)`** - Sets up all event listeners for a row

---

## Verification

### Console Logging
The `updateInputStates()` function includes console logging:
```javascript
console.log('updateInputStates:', { 
  customer, 
  country, 
  productGroup, 
  isComplete, 
  customerInput: customerInput?.value 
});
```

**To verify fix:**
1. Open browser console (F12)
2. Add new row
3. Select "+ Add New Customer"
4. Type customer name
5. Watch console logs showing:
   - `customer: "ABC Company"` (as you type)
   - `isComplete: false` (until all fields filled)
   - `isComplete: true` (when all fields filled)

---

**Status:** ✅ Bug Fixed and Tested

**Date:** November 21, 2025

