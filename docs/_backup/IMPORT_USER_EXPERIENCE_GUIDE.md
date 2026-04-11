# Import User Experience - Step by Step Guide

## 📋 What Happens After Selecting HTML File

This guide shows **exactly** what you'll see at each step of the import process.

---

## 🎬 Complete Import Flow

### **STEP 1: Click Import Button**
You'll see the Import card at the top of the page (always visible):

```
┌─────────────────────────────────────────────────────────┐
│  📤 Import Filled Budget                                │
│  Upload a completed budget HTML file. The file         │
│  contains all necessary information.                    │
│                                  [Import Filled HTML]   │
└─────────────────────────────────────────────────────────┘
```

**Action:** Click the blue "Import Filled HTML" button

---

### **STEP 2: Select File**
A file picker dialog opens.

**Action:** Select your HTML file (e.g., `BUDGET_FP_Narek_Koroukian_2026_20251122_100156.html`)

---

### **STEP 3: File Validation** (Instant)

#### ✅ **If Filename is Valid:**
You'll see a loading message:
```
⏳ Uploading and processing budget...
```

#### ❌ **If Filename is Invalid:**
You'll see an error notification:
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Invalid filename format.                             │
│                                                          │
│ Expected: BUDGET_[Division_SalesRep]_[Year]_[Date]_     │
│           [Time].html                                    │
│                                                          │
│ Your file: my_budget.html                               │
└─────────────────────────────────────────────────────────┘
```
**Duration:** 8 seconds  
**What to do:** Rename your file or re-export from the system

---

### **STEP 4: File Reading & Validation** (1-2 seconds)

The system reads the file and validates the content.

#### ❌ **If File is Missing Metadata:**
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Invalid file: Missing budget metadata                │
└─────────────────────────────────────────────────────────┘
```
**What to do:** Re-export the HTML form and save it properly using "Save Final" button

#### ❌ **If File is Corrupted:**
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Invalid file: Corrupted metadata                     │
└─────────────────────────────────────────────────────────┘
```
**What to do:** Re-export and save a new file

---

### **STEP 5: Backend Processing** (2-5 seconds)

While processing, you'll see:
```
⏳ Uploading and processing budget...
```

**What's happening behind the scenes:**
- Extracting budget data from HTML
- Checking for existing budget
- Fetching pricing data for calculations
- Calculating KGS, Amount, and MoRM values
- Inserting records into database

**Console logs (if DevTools open):**
```
🔍 Import started - File: BUDGET_FP_Narek_Koroukian_2026_20251122_100156.html
📄 File read successfully, size: 45678 characters
✅ Filename validated: BUDGET_FP_Narek_Koroukian_2026_20251122_100156.html
📋 Parsed metadata from file: {division: "FP", salesRep: "Narek Koroukian", ...}
🚀 Sending request to backend...
✅ Backend response received: {success: true, ...}
```

---

### **STEP 6A: Existing Budget Found** (Confirmation Required)

If a budget already exists for this sales rep and year, you'll see a **WARNING MODAL**:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Replace Existing Budget?                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  A budget already exists for this sales rep and year:   │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Division:         FP                            │    │
│  │ Sales Rep:        Narek Koroukian              │    │
│  │ Budget Year:      2026                          │    │
│  │ Existing Records: 432                           │    │
│  │ Last Upload:      11/22/2025, 10:01:56 AM      │    │
│  │ Last File:        BUDGET_FP_Narek_...html      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ⚠️ This action will DELETE the old budget and          │
│     replace it with the new one.                        │
│                                                          │
│  Do you want to proceed?                                │
│                                                          │
│                    [Cancel]  [Yes, Replace Budget]      │
└─────────────────────────────────────────────────────────┘
```

**Your Options:**

#### Option 1: Click "Cancel"
- Import is cancelled
- Old budget remains unchanged
- You'll see: `ℹ️ Budget import cancelled`

#### Option 2: Click "Yes, Replace Budget"
- Old budget is deleted
- New budget is imported
- Proceeds to **STEP 7** (Success Modal)

---

### **STEP 6B: No Existing Budget** (Auto-Import)

If no budget exists for this sales rep and year, the import proceeds automatically.

You'll see a brief success message:
```
✅ Successfully imported budget data!
```

Then proceeds to **STEP 7** (Success Modal)

---

### **STEP 7: Success Modal** (Final Result)

A detailed success modal appears showing complete import information:

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Budget Data Imported Successfully                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Division:     FP                                │    │
│  │ Sales Rep:    Narek Koroukian                  │    │
│  │ Budget Year:  2026                              │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Records Inserted:                                      │
│  • KGS:    144                                          │
│  • Amount: 144                                          │
│  • MoRM:   144                                          │
│  • Total:  432                                          │
│                                                          │
│  Pricing Year Used: 2025                                │
│  Saved At: 11/22/2025, 10:01:56 AM                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ 💡 To view this budget:                         │    │
│  │ Set filters to: FP / Narek Koroukian / 2025   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│                                          [OK]            │
└─────────────────────────────────────────────────────────┘
```

**What the numbers mean:**
- **KGS: 144** - Number of quantity records inserted (one per customer/country/product/month)
- **Amount: 144** - Number of revenue records (KGS × Selling Price)
- **MoRM: 144** - Number of margin records (KGS × MORM Price)
- **Total: 432** - Total database records (144 × 3)

**The blue box appears if:**
- Your current filters don't match the imported budget
- It tells you exactly what filters to select to view the data

**The blue box does NOT appear if:**
- Your current filters already match the imported budget
- The table will auto-refresh with the new data

---

### **STEP 8: Table Auto-Refresh** (If Filters Match)

If your current view matches the imported budget:

**Before Import:**
```
┌─────────────────────────────────────────────────────────┐
│  Customer A | UAE | Product 1 | Jan: 100 | Feb: 150... │
│  Customer B | UAE | Product 2 | Jan: 200 | Feb: 250... │
└─────────────────────────────────────────────────────────┘
```

**After Import (Auto-Refreshed):**
```
┌─────────────────────────────────────────────────────────┐
│  Customer A | UAE | Product 1 | Jan: 120 | Feb: 180... │
│  Customer B | UAE | Product 2 | Jan: 220 | Feb: 280... │
│  Customer C | UAE | Product 3 | Jan: 150 | Feb: 200... │ ← NEW
└─────────────────────────────────────────────────────────┘
```

**You'll see:**
- Updated values for existing customers
- New rows for new customers
- No need to refresh manually

---

## 🎯 Different Scenarios

### **Scenario 1: First Time Import (No Existing Budget)**

**Timeline:**
1. Click Import → File picker opens (instant)
2. Select file → Loading message (instant)
3. Processing → 2-5 seconds
4. Success modal appears → Shows record counts
5. Click OK → Done!

**Total Time:** ~5-10 seconds

---

### **Scenario 2: Replace Existing Budget**

**Timeline:**
1. Click Import → File picker opens (instant)
2. Select file → Loading message (instant)
3. Processing → 2-5 seconds
4. Warning modal appears → Shows existing budget info
5. Click "Yes, Replace Budget" → Brief success message
6. Success modal appears → Shows record counts
7. Click OK → Done!

**Total Time:** ~10-15 seconds (includes user decision time)

---

### **Scenario 3: Import with Matching Filters**

**Timeline:**
1. Click Import → File picker opens (instant)
2. Select file → Loading message (instant)
3. Processing → 2-5 seconds
4. Success modal appears → NO blue "To view" box
5. Table refreshes automatically → New data appears
6. Click OK → Done!

**Total Time:** ~5-10 seconds

---

### **Scenario 4: Import with Different Filters**

**Timeline:**
1. Click Import → File picker opens (instant)
2. Select file → Loading message (instant)
3. Processing → 2-5 seconds
4. Success modal appears → WITH blue "To view" box
5. Note the filter values shown
6. Click OK → Current table unchanged
7. Manually set filters to view imported data

**Total Time:** ~5-10 seconds + time to change filters

---

## ❌ Error Scenarios

### **Error 1: Draft File**
```
┌─────────────────────────────────────────────────────────┐
│  ❌ Import Failed                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Error: ⚠️ Cannot upload draft file!                    │
│                                                          │
│  This is a work-in-progress draft. Please open the     │
│  file, complete your budget, and click "Save Final"     │
│  before uploading.                                       │
│                                                          │
│                                          [OK]            │
└─────────────────────────────────────────────────────────┘
```

**Solution:** Open the HTML file, click "Save Final" button, upload the new file

---

### **Error 2: Missing Pricing Data**
```
┌─────────────────────────────────────────────────────────┐
│  ✅ Budget Data Imported Successfully                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Records Inserted:                                      │
│  • KGS:    144  ✅                                      │
│  • Amount: 0    ⚠️ (No pricing data for 2025)          │
│  • MoRM:   0    ⚠️ (No pricing data for 2025)          │
│  • Total:  144                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**What this means:** 
- Quantity data (KGS) imported successfully
- Revenue/Margin calculations skipped (missing pricing data)
- You'll need to add pricing data for the previous year

---

### **Error 3: Network Error**
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Failed to import budget data                         │
│                                                          │
│ Network Error: Cannot connect to server                 │
└─────────────────────────────────────────────────────────┘
```

**Solution:** Check if backend server is running

---

## 📊 Summary of Notifications

| Step | Notification Type | Duration | Dismissible |
|------|------------------|----------|-------------|
| File validation error | Error message (red) | 8 sec | Yes |
| Processing | Loading message (blue) | Until done | No |
| Existing budget | Warning modal | Until user decides | Yes (Cancel) |
| Success (brief) | Success message (green) | 5 sec | Yes |
| Success (detailed) | Success modal | Until user clicks OK | Yes (OK button) |
| Error | Error modal | Until user clicks OK | Yes (OK button) |

---

## 🎨 Visual Elements

### **Loading Message:**
- Color: Blue background
- Icon: ⏳ Spinning loader
- Text: "Uploading and processing budget..."
- Position: Top center of screen

### **Success Message:**
- Color: Green background
- Icon: ✅ Checkmark
- Text: "Successfully imported budget data!"
- Position: Top center of screen

### **Error Message:**
- Color: Red background
- Icon: ❌ X mark
- Text: Specific error description
- Position: Top center of screen

### **Modals:**
- Size: 600px wide
- Position: Center of screen
- Backdrop: Semi-transparent dark overlay
- Buttons: Bottom right

---

## 💡 Pro Tips

1. **Keep DevTools Open** (F12) during import to see detailed console logs
2. **Note the filter values** shown in the success modal if you want to view the data
3. **If nothing happens**, check the console for errors
4. **Import is instant** - if you don't see any notification, check browser console
5. **You can import multiple budgets** for different sales reps without changing filters

---

## 🎉 Expected Behavior Summary

**After successful import, you should see:**
1. ✅ Brief success message (5 seconds)
2. ✅ Detailed success modal with record counts
3. ✅ Guidance on viewing the data (if filters don't match)
4. ✅ Auto-refreshed table (if filters match)
5. ✅ Console logs confirming the import (if DevTools open)

**If you see nothing:**
- Open browser console (F12)
- Look for error messages
- Check if backend server is running
- Verify file format is correct

---

**Need help?** Check the console logs - they show exactly what's happening at each step! 🚀


















