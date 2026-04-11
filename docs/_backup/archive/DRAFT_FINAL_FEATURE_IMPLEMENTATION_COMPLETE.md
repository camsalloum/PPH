# Draft/Final Budget Feature - Implementation Complete

## ✅ Implementation Status

### **Completed:**
1. ✅ Created `sales_rep_budget_draft` table
2. ✅ Updated HTML export with Save Draft and Save Final buttons
3. ✅ Implemented backend API endpoints (save-draft, load-draft, submit-final, delete-draft)
4. ✅ Added backend validation to reject draft HTML uploads
5. ⏳ Live React version (IN PROGRESS - see below for implementation plan)
6. ⏳ Documentation (IN PROGRESS)

---

## 📋 What Was Implemented

### **1. Database - `sales_rep_budget_draft` Table**

```sql
CREATE TABLE sales_rep_budget_draft (
  id SERIAL PRIMARY KEY,
  division VARCHAR(50) NOT NULL,
  budget_year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  type VARCHAR(20) NOT NULL DEFAULT 'Budget',
  salesrepname VARCHAR(255) NOT NULL,
  customername VARCHAR(255) NOT NULL,
  countryname VARCHAR(255) NOT NULL,
  productgroup VARCHAR(255) NOT NULL,
  values DECIMAL(20, 2) NOT NULL,  -- KGS only
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_auto_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (division, budget_year, month, salesrepname, customername, countryname, productgroup)
);
```

---

### **2. HTML Export - Two Button System**

#### **UI:**
```
[+ Add New Row]  [💾 Save Draft]  [✓ Save Final]
                 (Blue button)    (Green button)

💡 Tip: Use "Save Draft" to save your work and continue later. 
        Use "Save Final" when ready to submit.
```

#### **Save Draft Button:**
- Saves entire HTML AS-IS (keeps all interactive elements)
- Filename: `DRAFT_Division_SalesRep_BudgetYear_YYYYMMDD_HHMMSS.html`
- Embeds `draftMetadata` with `isDraft: true`
- User can open file later and continue editing
- **Cannot be uploaded** (backend rejects)

#### **Save Final Button:**
- Validates data is entered
- Shows confirmation dialog
- Converts to static HTML (no editing)
- Embeds `budgetMetadata` and `savedBudget`
- Filename: `BUDGET_Division_SalesRep_BudgetYear_YYYYMMDD_HHMMSS.html`
- **Can be uploaded** to system

---

### **3. Backend API - Budget Draft Routes**

**File:** `server/routes/budget-draft.js`

#### **Endpoints:**

1. **POST /api/budget-draft/save-draft**
   - Saves draft to `sales_rep_budget_draft` table
   - Only stores KGS values
   - Replaces existing draft for same division/rep/year

2. **GET /api/budget-draft/load-draft/:division/:salesRep/:budgetYear**
   - Loads existing draft data
   - Returns `hasDraft` boolean and `draftData` array

3. **POST /api/budget-draft/submit-final**
   - Converts draft to final budget
   - Calculates Amount and MoRM
   - Inserts into `sales_rep_budget` table
   - Fetches material/process and pricing data

4. **DELETE /api/budget-draft/delete-draft/:division/:salesRep/:budgetYear**
   - Deletes draft after successful final submission

---

### **4. Backend Validation - Reject Draft Uploads**

**File:** `server/routes/aebf.js` (import-budget-html endpoint)

```javascript
// Check if it's a draft file
const draftCheck = htmlContent.match(/const draftMetadata = ({[^;]+});/);
if (draftCheck) {
  const draftMeta = JSON.parse(draftCheck[1]);
  if (draftMeta.isDraft === true) {
    return res.status(400).json({
      success: false,
      error: '⚠️ Cannot upload draft file! This is a work-in-progress draft. Please open the file, complete your budget, and click "Save Final" before uploading.',
      isDraft: true
    });
  }
}
```

---

## 🔄 Live React Version - Implementation Plan

### **Required Changes:**

#### **1. Add State Management**

```javascript
// Add to BudgetTab.js
const [draftStatus, setDraftStatus] = useState('saved'); // 'saving', 'saved', 'error'
const [lastSaveTime, setLastSaveTime] = useState(null);
const [hasFinalBudget, setHasFinalBudget] = useState(false);
```

#### **2. Auto-Save Effect**

```javascript
// Auto-save draft every 30 seconds
useEffect(() => {
  const timer = setTimeout(() => {
    if (htmlBudgetData && Object.keys(htmlBudgetData).length > 0) {
      saveDraft();
    }
  }, 30000);
  
  return () => clearTimeout(timer);
}, [htmlBudgetData]);

// Also save 5 seconds after last change
useEffect(() => {
  const timer = setTimeout(() => {
    if (htmlBudgetData && Object.keys(htmlBudgetData).length > 0) {
      saveDraft();
    }
  }, 5000);
  
  return () => clearTimeout(timer);
}, [htmlBudgetData, htmlCustomRows]);
```

#### **3. Save Draft Function**

```javascript
const saveDraft = async () => {
  setDraftStatus('saving');
  
  try {
    const response = await axios.post('/api/budget-draft/save-draft', {
      division: selectedDivision,
      salesRep: htmlFilters.salesRep,
      budgetYear: parseInt(htmlFilters.actualYear) + 1,
      customRows: htmlCustomRows,
      budgetData: htmlBudgetData,
    });
    
    if (response.data.success) {
      setDraftStatus('saved');
      setLastSaveTime(new Date());
    }
  } catch (error) {
    setDraftStatus('error');
    message.error('Failed to auto-save draft');
  }
};
```

#### **4. Submit Final Budget Function**

```javascript
const submitFinalBudget = async () => {
  Modal.confirm({
    title: '📋 Submit Final Budget?',
    content: (
      <div>
        <p>This will finalize your budget and:</p>
        <ul>
          <li>Calculate Amount and MoRM values</li>
          <li>Submit to the system</li>
          <li>Lock the budget</li>
        </ul>
      </div>
    ),
    okText: 'Yes, Submit Final Budget',
    okType: 'primary',
    onOk: async () => {
      const response = await axios.post('/api/budget-draft/submit-final', {
        division: selectedDivision,
        salesRep: htmlFilters.salesRep,
        budgetYear: parseInt(htmlFilters.actualYear) + 1,
      });
      
      if (response.data.success) {
        Modal.success({
          title: '✅ Budget Submitted Successfully',
          content: `Records inserted: ${response.data.recordsInserted.total}`,
        });
        
        // Clear draft
        await axios.delete(`/api/budget-draft/delete-draft/${selectedDivision}/${htmlFilters.salesRep}/${parseInt(htmlFilters.actualYear) + 1}`);
        
        fetchHtmlTableData();
      }
    },
  });
};
```

#### **5. UI Component**

```javascript
<div style={{ 
  padding: '8px 16px', 
  background: draftStatus === 'saved' ? '#f6ffed' : '#fff7e6',
  border: `1px solid ${draftStatus === 'saved' ? '#b7eb8f' : '#ffd591'}`,
  borderRadius: 4,
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
}}>
  <div>
    <span style={{ fontWeight: 500 }}>
      {draftStatus === 'saving' && '💾 Saving draft...'}
      {draftStatus === 'saved' && '✅ Draft saved'}
      {draftStatus === 'error' && '⚠️ Failed to save draft'}
    </span>
    {lastSaveTime && draftStatus === 'saved' && (
      <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: '12px' }}>
        (Last saved: {formatDistanceToNow(lastSaveTime)} ago)
      </span>
    )}
  </div>
  
  <Button
    type="primary"
    icon={<CheckCircleOutlined />}
    onClick={submitFinalBudget}
    disabled={Object.keys(htmlBudgetData).length === 0}
  >
    Submit Final Budget
  </Button>
</div>
```

---

## 📊 Feature Comparison

| Aspect | HTML Export | Live React |
|--------|-------------|------------|
| **Draft Save** | Manual button | Auto-save (30s + 5s after change) |
| **Draft Storage** | Local file | Database |
| **Draft Editing** | Open file, edit | Always accessible |
| **Final Save** | Manual button → Static HTML | Submit button → Database |
| **Upload** | Manual file upload | Automatic (in database) |
| **Offline Work** | ✅ Yes | ❌ No |
| **Data Loss Risk** | ⚠️ If file lost | ✅ Protected |

---

## 🎯 User Workflows

### **HTML Export Workflow:**

```
Day 1:
1. Export HTML
2. Fill 50% of budget
3. Click "Save Draft" → DRAFT_..._20251121_140000.html
4. Close file

Day 2:
5. Open DRAFT_..._20251121_140000.html
6. All data still there, editable
7. Fill remaining 50%
8. Click "Save Final" → BUDGET_..._20251122_100000.html
9. Upload BUDGET file to system
✅ Done
```

### **Live React Workflow:**

```
Day 1:
1. Open Budget Tab
2. Fill 50% of budget
3. System auto-saves every 30 seconds
4. Close browser

Day 2:
5. Open Budget Tab
6. Draft automatically loaded
7. Fill remaining 50%
8. Click "Submit Final Budget"
9. System calculates Amount/MoRM and saves
✅ Done
```

---

## 🔒 Security & Validation

### **Draft File Protection:**
- ✅ Filename starts with `DRAFT_`
- ✅ Contains `draftMetadata` with `isDraft: true`
- ✅ Backend rejects draft uploads with clear error message

### **Final File Validation:**
- ✅ Filename starts with `BUDGET_`
- ✅ Contains `budgetMetadata` and `savedBudget`
- ✅ No `isDraft` flag
- ✅ Backend accepts for import

---

## 📁 Files Modified/Created

### **Created:**
1. `server/scripts/create-sales-rep-budget-draft-table.sql`
2. `server/routes/budget-draft.js`
3. `DRAFT_FINAL_FEATURE_IMPLEMENTATION_COMPLETE.md` (this file)

### **Modified:**
1. `server/routes/aebf.js`
   - Added Save Draft button and logic
   - Renamed Save to Save Final
   - Added validation confirmation
   - Added draft file rejection

2. `server/server.js`
   - Registered budget-draft routes

3. `src/components/MasterData/AEBF/BudgetTab.js` (TO BE COMPLETED)
   - Add auto-save functionality
   - Add Submit Final Budget button
   - Add draft status indicator

---

## ⏳ Remaining Work

### **Live React Implementation:**
Due to message length constraints, the live React implementation needs to be completed separately. The implementation plan is documented above and includes:

1. Add state management for draft status
2. Implement auto-save effect (30s + 5s after change)
3. Add saveDraft() function
4. Add submitFinalBudget() function
5. Add UI status indicator
6. Load existing draft on component mount

**Estimated effort:** ~2-3 hours
**Complexity:** Medium
**Priority:** High

---

## ✅ Testing Checklist

### **HTML Export:**
- [ ] Save Draft creates editable file
- [ ] Draft file can be reopened and edited
- [ ] Save Final creates static file
- [ ] Final file can be uploaded
- [ ] Draft file upload is rejected
- [ ] Validation works correctly

### **Live React:**
- [ ] Auto-save works every 30 seconds
- [ ] Auto-save works 5 seconds after change
- [ ] Draft persists across browser sessions
- [ ] Submit Final calculates Amount/MoRM
- [ ] Draft is deleted after final submission
- [ ] Status indicator shows correct state

---

**Status:** 80% Complete
**Next Step:** Implement Live React auto-save and Submit Final button
**Date:** November 21, 2025

