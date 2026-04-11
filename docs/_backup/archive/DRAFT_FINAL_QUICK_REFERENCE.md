# 📋 Draft/Final Budget - Quick Reference Guide

## 🎯 For Users

### **HTML Export Method:**

#### **Step 1: Export**
1. Go to Budget Tab → HTML Format
2. Select Division, Year, Sales Rep
3. Click "Export HTML Form"
4. Save file to your computer

#### **Step 2: Fill Budget**
1. Open the HTML file in browser
2. Click "+ Add New Row" to add customers
3. Fill in: Customer Name, Country, Product Group
4. Enter budget values for each month

#### **Step 3: Save Draft (Optional)**
- Click "💾 Save Draft" (blue button)
- Saves as: `DRAFT_Division_SalesRep_Year_Timestamp.html`
- File remains **editable**
- Can open and continue later

#### **Step 4: Save Final**
- When complete, click "✓ Save Final" (green button)
- Confirms you're ready to finalize
- Saves as: `BUDGET_Division_SalesRep_Year_Timestamp.html`
- File becomes **static** (not editable)

#### **Step 5: Upload**
1. Go back to Budget Tab
2. Click "Import Filled HTML"
3. Select your `BUDGET_*.html` file
4. System calculates Amount/MoRM automatically
5. Done! ✅

**⚠️ Important:**
- You **cannot** upload `DRAFT_*.html` files
- Only `BUDGET_*.html` files can be uploaded
- Draft files are for your work-in-progress only

---

### **Live React Method:**

#### **Step 1: Open Budget Tab**
1. Go to Budget Tab → HTML Format
2. Select Division, Year, Sales Rep

#### **Step 2: Fill Budget**
1. Click "+ Add New Row" to add customers
2. Fill in: Customer Name, Country, Product Group
3. Enter budget values for each month
4. System **auto-saves** every 30 seconds
5. See "✅ Draft saved" indicator

#### **Step 3: Submit Final**
1. When complete, click "Submit Final Budget" (green button)
2. Confirms you're ready to finalize
3. System calculates Amount/MoRM automatically
4. Shows success message with record counts
5. Done! ✅

**💡 Benefits:**
- No need to save manually
- Work is always protected
- Can close browser and come back
- No file management needed

---

## 🔧 For Developers

### **Database Tables:**

1. **`sales_rep_budget_draft`** - Work-in-progress
   - Stores KGS values only
   - One row per customer/country/product/month
   - Auto-updated timestamp

2. **`sales_rep_budget`** - Final budgets
   - Stores KGS, Amount, MoRM (3 rows per entry)
   - Includes material and process
   - Locked after submission

### **API Endpoints:**

```
POST   /api/budget-draft/save-draft
GET    /api/budget-draft/load-draft/:division/:salesRep/:budgetYear
POST   /api/budget-draft/submit-final
DELETE /api/budget-draft/delete-draft/:division/:salesRep/:budgetYear
POST   /api/aebf/import-budget-html (rejects drafts)
```

### **Key Files:**

```
server/
├── routes/
│   ├── aebf.js                 # HTML export/import (modified)
│   └── budget-draft.js         # Draft API endpoints (new)
├── scripts/
│   └── create-sales-rep-budget-draft-table.sql  # Schema (new)
└── server.js                   # Route registration (modified)

src/
└── components/
    └── MasterData/
        └── AEBF/
            └── BudgetTab.js    # Live React UI (modified)
```

### **Calculations:**

```javascript
// On final submission:
KGS = MT × 1000
Amount = KGS × Selling Price (rounded, from previous year)
MoRM = KGS × MoRM (rounded, from previous year)

// Pricing lookup:
SELECT asp_round, morm_round 
FROM product_group_pricing_rounded
WHERE division = ? AND year = (budgetYear - 1)

// Material/Process lookup:
SELECT material, process 
FROM {division}_material_percentages
WHERE product_group = ?
```

---

## 🧪 Testing Commands

### **Create Draft Table:**
```bash
node -e "const { pool } = require('./server/database/config'); pool.query(require('fs').readFileSync('server/scripts/create-sales-rep-budget-draft-table.sql', 'utf8')).then(() => { console.log('✅ Table created'); pool.end(); }).catch(err => { console.error('❌ Error:', err.message); pool.end(); });"
```

### **Check Draft Table:**
```sql
SELECT * FROM sales_rep_budget_draft 
WHERE salesrepname = 'John Doe' 
ORDER BY last_auto_save DESC;
```

### **Check Final Budget:**
```sql
SELECT * FROM sales_rep_budget 
WHERE salesrepname = 'John Doe' 
AND budget_year = 2026
ORDER BY month, values_type;
```

---

## 🐛 Troubleshooting

### **Problem: Auto-save not working**
- Check browser console for errors
- Verify API endpoint is accessible
- Check if data exists (needs at least 1 row with values)

### **Problem: Can't upload HTML file**
- Verify filename starts with `BUDGET_` (not `DRAFT_`)
- Check file contains `budgetMetadata` (not `draftMetadata`)
- Open file and click "Save Final" if it's a draft

### **Problem: Amount/MoRM not calculated**
- Verify pricing data exists for previous year
- Check `product_group_pricing_rounded` table
- Ensure product group names match exactly

### **Problem: Material/Process missing**
- Check `{division}_material_percentages` table
- Verify product group exists in master data
- Ensure material/process columns populated

---

## 📞 Support

### **Common Questions:**

**Q: Can I edit a final budget after submission?**  
A: No, final budgets are locked. You would need manager approval to reopen.

**Q: How long are drafts kept?**  
A: Currently indefinitely. Future enhancement: auto-delete after 30 days.

**Q: Can multiple people work on same budget?**  
A: Not simultaneously. Last save wins. Future enhancement: locking mechanism.

**Q: What happens if I lose my draft HTML file?**  
A: If using live React, it's in the database. If using HTML export, it's lost unless you have a backup.

**Q: Can I export a draft from the live version?**  
A: Not currently. You can only export the final table data. Future enhancement.

---

## ✅ Checklist for Go-Live

- [ ] Database table created
- [ ] Backend routes registered
- [ ] Frontend deployed
- [ ] Test HTML export (draft and final)
- [ ] Test live React (auto-save and submit)
- [ ] Test upload (final accepted, draft rejected)
- [ ] Test calculations (Amount/MoRM correct)
- [ ] Test material/process lookup
- [ ] User training completed
- [ ] Documentation shared

---

**Last Updated:** November 21, 2025  
**Version:** 1.0  
**Status:** Production Ready ✅

