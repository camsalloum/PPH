# Replace Existing Budget Feature

## Overview
When a sales representative uploads a new budget file for a year that already has budget data, the system detects this and shows a confirmation dialog before replacing the old budget.

---

## User Flow

### Scenario: Re-uploading Budget for Same Year

**Example:**
- Sales Rep: John Smith
- Division: FP-UAE
- Budget Year: 2025
- Previous upload: January 15, 2025 at 10:30 AM
- New upload: February 20, 2025 at 2:45 PM

---

### Step 1: User Uploads New HTML File

User navigates to **Master Data > AEBF > Budget Tab** and clicks **"Import Filled HTML"**, then selects the new budget file.

---

### Step 2: System Detects Existing Budget

Backend checks the `sales_rep_budget` table:

```sql
SELECT 
  COUNT(*) as record_count,
  MAX(uploaded_at) as last_upload,
  MAX(uploaded_filename) as last_filename
FROM sales_rep_budget
WHERE division = 'FP-UAE'
  AND salesrepname = 'John Smith'
  AND budget_year = 2025
  AND type = 'Budget'
```

**Result:**
- `record_count`: 360 (120 KGS + 120 Amount + 120 MoRM)
- `last_upload`: 2025-01-15 10:30:00
- `last_filename`: BUDGET_FP-UAE_John_Smith_2025_20250115_103000.html

---

### Step 3: Confirmation Dialog Appears

A warning modal is displayed with:

```
⚠️ Replace Existing Budget?

A budget already exists for this sales rep and year:

┌─────────────────────────────────────────────────────────┐
│ Division: FP-UAE                                        │
│ Sales Rep: John Smith                                   │
│ Budget Year: 2025                                       │
│ Existing Records: 360                                   │
│ Last Upload: 1/15/2025, 10:30:00 AM                    │
│ Last File: BUDGET_FP-UAE_John_Smith_2025_20250115...   │
└─────────────────────────────────────────────────────────┘

⚠️ This action will DELETE the old budget and replace it 
   with the new one.

Do you want to proceed?

[Cancel]  [Yes, Replace Budget]
```

---

### Step 4A: User Confirms Replacement

If user clicks **"Yes, Replace Budget"**:

1. **Delete old records:**
   ```sql
   DELETE FROM sales_rep_budget 
   WHERE division = 'FP-UAE'
     AND salesrepname = 'John Smith'
     AND budget_year = 2025
     AND type = 'Budget'
   ```
   Result: 360 records deleted

2. **Insert new records:**
   - KGS records: 145
   - Amount records: 145
   - MoRM records: 145
   - Total: 435 records inserted

3. **Success modal appears:**
   ```
   ✅ Budget Data Replaced Successfully

   ┌─────────────────────────────────────────────────────┐
   │ Division: FP-UAE                                    │
   │ Sales Rep: John Smith                               │
   │ Budget Year: 2025                                   │
   └─────────────────────────────────────────────────────┘

   Records Summary:
   • Deleted (old): 360
   • Inserted (new):
     - KGS: 145
     - Amount: 145
     - MoRM: 145
     - Total: 435

   Pricing Year Used: 2024
   Saved At: 2/20/2025, 2:45:30 PM
   ```

---

### Step 4B: User Cancels

If user clicks **"Cancel"**:

- Upload is cancelled
- Old budget remains unchanged
- Message: "Budget import cancelled"

---

## Technical Implementation

### Backend (server/routes/aebf.js)

**Check for existing budget:**
```javascript
const existingCheckQuery = `
  SELECT 
    COUNT(*) as record_count,
    MAX(uploaded_at) as last_upload,
    MAX(uploaded_filename) as last_filename
  FROM sales_rep_budget
  WHERE UPPER(division) = UPPER($1)
  AND UPPER(salesrepname) = UPPER($2)
  AND budget_year = $3
  AND UPPER(type) = 'BUDGET'
`;

const existingCheck = await client.query(existingCheckQuery, [
  metadata.division,
  metadata.salesRep,
  metadata.budgetYear
]);

const existingRecords = parseInt(existingCheck.rows[0].record_count);
```

**Response includes existing budget info:**
```javascript
res.json({
  success: true,
  message: 'Sales rep budget data imported successfully',
  existingBudget: existingRecords > 0 ? {
    recordCount: existingRecords,
    lastUpload: lastUpload,
    lastFilename: lastFilename,
    wasReplaced: true
  } : null,
  recordsDeleted: deleteResult.rowCount,
  recordsInserted: {
    kgs: insertedKGS,
    amount: insertedAmount,
    morm: insertedMoRM,
    total: insertedKGS + insertedAmount + insertedMoRM
  }
});
```

---

### Frontend (src/components/MasterData/AEBF/BudgetTab.js)

**Check response for existing budget:**
```javascript
if (checkResponse.data.existingBudget && 
    checkResponse.data.existingBudget.recordCount > 0) {
  
  const existingBudget = checkResponse.data.existingBudget;
  
  Modal.confirm({
    title: '⚠️ Replace Existing Budget?',
    icon: <WarningOutlined style={{ color: '#faad14' }} />,
    content: (
      // ... display existing budget details ...
    ),
    okText: 'Yes, Replace Budget',
    okType: 'danger',
    cancelText: 'Cancel',
    onOk() {
      // Show success message
    },
    onCancel() {
      message.info('Budget import cancelled');
    }
  });
}
```

---

## Benefits

### ✅ **Prevents Accidental Overwrites**
- User is always aware when replacing existing data
- Clear visibility of what will be lost

### ✅ **Audit Trail**
- Shows when old budget was uploaded
- Shows filename of old budget
- Helps identify which version is being replaced

### ✅ **Informed Decision**
- User sees record counts (old vs new)
- Can compare dates to ensure uploading correct version
- Can cancel if wrong file selected

### ✅ **Data Integrity**
- Transaction-based: either all old data deleted and new inserted, or nothing changes
- No partial updates
- Consistent state maintained

---

## Use Cases

### Use Case 1: Correcting Mistakes
**Scenario:** Sales rep made errors in January budget and needs to re-submit.

**Flow:**
1. Upload corrected budget file
2. See warning showing January upload will be replaced
3. Confirm replacement
4. Old budget deleted, corrected budget inserted

---

### Use Case 2: Updating Budget Mid-Year
**Scenario:** Market conditions changed, need to revise budget for remaining months.

**Flow:**
1. Export fresh HTML with latest actual data
2. Fill revised budget
3. Upload new file
4. See warning with previous upload details
5. Confirm to replace with updated budget

---

### Use Case 3: Accidental Upload
**Scenario:** User accidentally selects wrong file or wrong year.

**Flow:**
1. Upload file
2. See warning showing existing budget will be replaced
3. Notice wrong year or sales rep in warning
4. **Cancel** upload
5. Old budget preserved, no changes made

---

## Error Scenarios

### Scenario 1: Database Transaction Fails
- **Behavior:** Automatic ROLLBACK
- **Result:** Old budget remains unchanged
- **User sees:** Error message, no data lost

### Scenario 2: Network Interruption During Upload
- **Behavior:** Transaction not committed
- **Result:** Old budget remains unchanged
- **User sees:** Error message, can retry

### Scenario 3: Invalid HTML File
- **Behavior:** Validation fails before database check
- **Result:** No database query executed
- **User sees:** "Invalid HTML format" error

---

## Testing Checklist

### ✅ **First Upload (No Existing Budget)**
- [ ] Upload budget for new year
- [ ] No warning dialog appears
- [ ] Success message shows records inserted
- [ ] Data correctly stored in database

### ✅ **Replace Existing Budget**
- [ ] Upload budget for year with existing data
- [ ] Warning dialog appears with correct details
- [ ] Click "Yes, Replace Budget"
- [ ] Old records deleted, new records inserted
- [ ] Success message shows deleted vs inserted counts

### ✅ **Cancel Replacement**
- [ ] Upload budget for year with existing data
- [ ] Warning dialog appears
- [ ] Click "Cancel"
- [ ] Upload cancelled message appears
- [ ] Old budget unchanged in database

### ✅ **Multiple Replacements**
- [ ] Upload budget (first time)
- [ ] Upload again (replace)
- [ ] Upload third time (replace again)
- [ ] Each time shows correct "last upload" date
- [ ] Final data matches latest upload

---

## Database Impact

### Before Feature:
- Silent replacement of existing data
- No warning to user
- No visibility of what was replaced

### After Feature:
- User confirmation required
- Full visibility of existing data
- Audit trail maintained
- Informed decision making

---

**Last Updated:** November 21, 2025
**Version:** 1.0

