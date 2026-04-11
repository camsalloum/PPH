# Verify HTML Export Fix - Quick Guide

## ✅ Server Restarted Successfully

Both frontend and backend servers have been restarted and are now running the updated code.

---

## 🧪 Quick Verification Steps

### Step 1: Navigate to Budget Tab
1. Open your browser and go to the application (usually http://localhost:3000)
2. Click on **"AEBF Data"** tab
3. Click on **"Budget"** sub-tab
4. Click on **"HTML Format"** tab
5. Make sure **"Sales Reps"** sub-tab is selected

### Step 2: Select Filters
1. **Actual Year:** Select any year (e.g., 2024)
2. **Budget Year:** Will auto-populate (e.g., 2025)
3. **Sales Rep:** Select any sales representative

### Step 3: Export HTML
1. Click the **"Export HTML Form"** button
2. A file will download (e.g., `Budget_FP_John_Doe_2024_20250115-143022.html`)

### Step 4: Open Exported HTML
1. Open the downloaded HTML file in your browser
2. **VERIFY:** You should now see **4 rows per customer**:
   - ✅ Row 1: **Actual MT** (Blue background #e6f4ff)
   - ✅ Row 2: **Budget MT** (Yellow background #FFFFB8)
   - ✅ Row 3: **Actual Amount** (Green background #d4edda) ← **NEW**
   - ✅ Row 4: **Budget Amount** (Light yellow background #fff3cd) ← **NEW**

### Step 5: Verify Footer Totals
Scroll to the bottom of the table and verify **4 total rows**:
1. ✅ Total Actual (MT) - Blue
2. ✅ Total Budget (MT) - Yellow
3. ✅ Total Actual (Amount) - Green ← **NEW**
4. ✅ Total Budget (Amount) - Light Yellow ← **NEW**

### Step 6: Verify Legend
At the top of the table, verify the legend shows **4 indicators**:
1. ✅ Actual 2024 Volume (MT) - Blue square
2. ✅ Budget 2025 Volume (MT) - Yellow square
3. ✅ Actual 2024 Amount - Green square ← **NEW**
4. ✅ Budget 2025 Amount - Light yellow square ← **NEW**

### Step 7: Verify Calculations
1. Pick any customer row
2. Check the Amount value for any month
3. **Formula:** Amount = MT × 1000 × Selling Price
4. Example:
   - If MT = 5.50
   - And Selling Price = 12.00 (per KG)
   - Then Amount = 5.50 × 1000 × 12.00 = 66,000
   - Display: "66.0K"

### Step 8: Verify No MoRM
1. ✅ Confirm there is NO MoRM row anywhere
2. ✅ Confirm footer does NOT have MoRM totals
3. ✅ Confirm legend does NOT mention MoRM

---

## ✅ Expected Result

### Before Fix (OLD)
```
Customer A | Country | Product | 1 | 2 | ... | 12 | Total
-----------|---------|---------|---|---|-----|----|----- 
Actual MT  | [Blue row with 12 months]
Budget MT  | [Yellow row with 12 months - editable]
```

### After Fix (NEW) ✅
```
Customer A | Country | Product | 1 | 2 | ... | 12 | Total
-----------|---------|---------|---|---|-----|----|----- 
Actual MT     | [Blue row with 12 months]
Budget MT     | [Yellow row with 12 months - editable]
Actual Amount | [Green row with 12 months]        ← NEW
Budget Amount | [Light yellow row with 12 months] ← NEW
```

---

## 🐛 Troubleshooting

### Issue: Still seeing only 2 rows
**Solution:**
1. Hard refresh the browser (Ctrl+Shift+R or Ctrl+F5)
2. Clear browser cache
3. Try exporting again
4. Check that server restarted successfully (check terminal windows)

### Issue: Amount values are all zero
**Possible Causes:**
1. Missing pricing data for that product group
2. Pricing year mismatch
3. Product group name mismatch (case-sensitive)

**Solution:**
1. Check the browser console (F12) for errors
2. Verify pricing data exists in `product_group_pricing_rounding` table
3. Check that product group names match exactly

### Issue: Calculations seem wrong
**Verify:**
1. MT value is correct
2. Selling price is correct (check pricing table)
3. Formula: Amount = MT × 1000 × Price
4. Example: 5.50 MT × 1000 × 12.00 = 66,000 (displays as "66.0K")

---

## 📸 Screenshot Comparison

### What You Should See

**Table Header:**
```
Legend:
[Blue] Actual 2024 Volume (MT)
[Yellow] Budget 2025 Volume (MT)
[Green] Actual 2024 Amount        ← NEW
[Light Yellow] Budget 2025 Amount ← NEW

[+ Add New Row] [💾 Save Draft] [✓ Save Final]
```

**Table Body (per customer):**
```
Customer Name | Country | Product Group | 1 | 2 | 3 | ... | 12 | Total
--------------|---------|---------------|---|---|---|-----|----|----- 
              |         |               | [Blue cells - Actual MT]
              |         |               | [Yellow cells - Budget MT - editable]
              |         |               | [Green cells - Actual Amount]  ← NEW
              |         |               | [Light yellow cells - Budget Amount] ← NEW
```

**Table Footer:**
```
Total Actual (MT)     | [Blue cells]
Total Budget (MT)     | [Yellow cells]
Total Actual (Amount) | [Green cells]        ← NEW
Total Budget (Amount) | [Light yellow cells] ← NEW
```

---

## ✅ Success Indicators

If you see ALL of these, the fix is working:

1. ✅ 4 rows per customer (not 2)
2. ✅ Green and light yellow rows visible
3. ✅ Amount values calculated and displayed
4. ✅ Footer has 4 total rows
5. ✅ Legend has 4 indicators
6. ✅ No MoRM anywhere
7. ✅ Buttons work (Save Draft, Save Final)

---

## 📞 If Issues Persist

If you still don't see the changes after:
1. ✅ Server restarted
2. ✅ Browser refreshed
3. ✅ New export downloaded

Then let me know and I'll:
1. Check the server logs for errors
2. Verify the code changes are correct
3. Debug the export endpoint
4. Test with a sample export

---

**Last Updated:** January 2025  
**Status:** Ready for Verification  
**Expected Result:** 4 rows per customer with MT and Amount
