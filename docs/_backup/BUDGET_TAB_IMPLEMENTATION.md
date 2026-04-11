# Budget Tab Implementation Plan
**Date:** November 15, 2025  
**Objective:** Develop Budget tab matching ActualTab functionality with data writing to `type='Budget'`

---

## 🎯 Requirements

### Functional Requirements
1. **Upload Excel File** - Long format like Actual tab
2. **Division Selection** - Auto-detect from context (FP)
3. **Year Selection** - For budget upload (default: current year + 1)
4. **Replace Mode Default** - Completely replace all budget data for selected year
5. **Table Display** - Same search, pagination, export as Actual tab
6. **Database Type** - Data goes to `type='Budget'` (not 'Actual')

### User Behavior
- **Upload fp_budget_2025.xlsx** → Replaces ALL 2025 Budget data for FP division
- If existing data has months 1-12, and upload has months 1-6 → Result: ONLY months 1-6 remain
- **Complete replacement per year** - no partial updates by default

---

## 📁 Files to Create/Modify

### Files to CREATE
```
scripts/transform-budget-to-sql.ps1          [NEW - 758 lines, copy from actual]
```

### Files to MODIFY
```
server/routes/aebf.js                        [ADD ~200 lines - 2 new endpoints]
src/components/MasterData/AEBF/BudgetTab.js  [REPLACE stub with ~875 lines]
```

---

## 🔧 Implementation Steps

### **STEP 1: PowerShell Script (Backend Foundation)**

#### Create: `scripts/transform-budget-to-sql.ps1`

**Action:** Copy `transform-actual-to-sql.ps1` → `transform-budget-to-sql.ps1`

**Changes Required:**
1. Update header documentation:
   ```powershell
   .SYNOPSIS
       Transform Excel Budget data to SQL and upload to PostgreSQL database
   
   .DESCRIPTION
       Reads Excel file (10 columns), maps columns, normalizes data, and uploads to fp_data_excel table
       DATABASE: public.fp_data_excel (type='Budget')
       REPLACE mode: Deletes ALL Budget data for division/year, then inserts from Excel
   ```

2. **CRITICAL: Change ALL SQL queries from `type = 'Actual'` to `type = 'Budget'`**
   
   **Locations to change:**
   - Line ~300: DELETE query for REPLACE mode
     ```sql
     DELETE FROM fp_data_excel 
     WHERE division = '$Division' AND type = 'Budget' AND year = $year
     ```
   
   - Line ~350: DELETE query for UPSERT mode
     ```sql
     DELETE FROM fp_data_excel 
     WHERE division = '$Division' AND type = 'Budget' 
       AND (year, month) IN ($yearMonthList)
     ```
   
   - Line ~450: INSERT statement
     ```sql
     INSERT INTO fp_data_excel 
     (division, type, year, month, customername, ...)
     VALUES ('$Division', 'Budget', ...)
     ```
   
   - Line ~600: Verification query
     ```sql
     SELECT COUNT(*) FROM fp_data_excel 
     WHERE division = '$Division' AND type = 'Budget'
     ```

3. Update log messages:
   - "Uploading Actual data..." → "Uploading Budget data..."
   - "REPLACE: Deleting ALL FP Actual data" → "REPLACE: Deleting ALL FP Budget data"

**Test Command:**
```powershell
.\scripts\transform-budget-to-sql.ps1 `
  -ExcelPath "server\data\fp_budget_2025.xlsx" `
  -Division "FP" `
  -UploadMode "replace" `
  -UploadedBy "test_user" `
  -TestMode
```

---

### **STEP 2: Backend API Endpoints**

#### File: `server/routes/aebf.js`

**Add after line ~1200 (before analyze-file endpoint):**

#### **Endpoint 1: GET /api/aebf/budget**

```javascript
/**
 * GET /api/aebf/budget
 * Retrieve Budget data for a specific division and year
 * 
 * Query params:
 * - division: Division code (required)
 * - year: Year (required)
 * - month: Month filter (optional)
 * - search: Global search term (optional)
 * 
 * Response:
 * - data: Array of budget records
 * - summary: { totalAmount, totalKgs, totalMorm }
 */
router.get('/budget', async (req, res) => {
  try {
    const { division, year, month, search } = req.query;
    
    console.log('📊 Get budget data request:', { division, year, month, search });
    
    // Validate parameters
    if (!division || !year) {
      return res.status(400).json({
        success: false,
        error: 'Division and year are required'
      });
    }
    
    // Build query
    let query = `
      SELECT 
        division, type, year, month, customername, salesrep, 
        country, productgroup, amount, kgs, morm,
        created_at, updated_at, uploaded_by
      FROM fp_data_excel
      WHERE division = $1 AND type = 'Budget' AND year = $2
    `;
    const params = [division.toUpperCase(), parseInt(year)];
    let paramIndex = 3;
    
    // Optional month filter
    if (month) {
      query += ` AND month = $${paramIndex}`;
      params.push(parseInt(month));
      paramIndex++;
    }
    
    // Optional search filter
    if (search) {
      query += ` AND (
        LOWER(customername) LIKE $${paramIndex} OR
        LOWER(salesrep) LIKE $${paramIndex} OR
        LOWER(country) LIKE $${paramIndex} OR
        LOWER(productgroup) LIKE $${paramIndex}
      )`;
      params.push(`%${search.toLowerCase()}%`);
      paramIndex++;
    }
    
    query += ' ORDER BY year, month, customername';
    
    const result = await pool.query(query, params);
    
    // Calculate summary stats
    const summary = {
      totalAmount: result.rows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0),
      totalKgs: result.rows.reduce((sum, row) => sum + (parseFloat(row.kgs) || 0), 0),
      totalMorm: result.rows.reduce((sum, row) => sum + (parseFloat(row.morm) || 0), 0),
      recordCount: result.rows.length
    };
    
    console.log(`✅ Found ${result.rows.length} budget records`);
    
    res.json({
      success: true,
      data: result.rows,
      summary
    });
    
  } catch (error) {
    console.error('❌ Get budget error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

#### **Endpoint 2: POST /api/aebf/upload-budget**

```javascript
/**
 * POST /api/aebf/upload-budget
 * Handle Budget Excel file upload and transform to SQL
 * Calls PowerShell script to process the upload
 * 
 * Form Data:
 * - file: Excel file (.xlsx)
 * - division: Division code (FP, SB, TF, HCM)
 * - uploadMode: upsert or replace (default: replace)
 * - uploadedBy: Username
 * - selectedYearMonths: Optional comma-separated "year-month" pairs
 */
router.post('/upload-budget', upload.single('file'), async (req, res) => {
  try {
    const { division, uploadMode, uploadedBy, selectedYearMonths } = req.body;
    const filePath = req.file.path;
    
    console.log('📤 Budget upload request received:', {
      division,
      uploadMode: uploadMode || 'replace',
      uploadedBy,
      selectedYearMonths,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
    
    // Validate parameters
    if (!division || !['FP', 'SB', 'TF', 'HCM'].includes(division.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division parameter'
      });
    }
    
    const mode = uploadMode ? uploadMode.toLowerCase() : 'replace';
    if (!['upsert', 'replace'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid uploadMode parameter (must be upsert or replace)'
      });
    }
    
    if (!uploadedBy) {
      return res.status(400).json({
        success: false,
        error: 'uploadedBy parameter is required'
      });
    }
    
    // Path to PowerShell script
    const scriptPath = path.join(__dirname, '../../scripts/transform-budget-to-sql.ps1');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        success: false,
        error: 'Budget transform script not found'
      });
    }
    
    // Execute PowerShell script
    console.log('🔄 Executing Budget PowerShell script...');
    
    const psArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-ExcelPath', filePath,
      '-Division', division.toUpperCase(),
      '-UploadMode', mode,
      '-UploadedBy', uploadedBy
    ];
    
    // Add selective year/months if provided
    if (selectedYearMonths) {
      psArgs.push('-SelectiveYearMonths', selectedYearMonths);
    }
    
    const psProcess = spawn('powershell.exe', psArgs);
    
    let stdout = '';
    let stderr = '';
    
    psProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });
    
    psProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });
    
    psProcess.on('close', (code) => {
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
        console.log('🗑️ Cleaned up uploaded file');
      } catch (err) {
        console.error('Failed to clean up file:', err);
      }
      
      if (code === 0) {
        console.log('✅ Budget upload completed successfully');
        res.json({
          success: true,
          message: 'Budget data uploaded successfully',
          output: stdout,
          mode: mode
        });
      } else {
        console.error('❌ Budget upload failed with exit code:', code);
        res.status(500).json({
          success: false,
          error: 'Budget upload failed',
          details: stderr || stdout,
          exitCode: code
        });
      }
    });
    
    psProcess.on('error', (error) => {
      console.error('❌ PowerShell process error:', error);
      
      // Clean up file
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Failed to clean up file:', err);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute budget transform script',
        details: error.message
      });
    });
    
  } catch (error) {
    console.error('❌ Budget upload error:', error);
    
    // Clean up file if exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Failed to clean up file:', err);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Location in file:** Add after line ~1200, before the `analyze-file` endpoint

---

### **STEP 3: Frontend Component**

#### File: `src/components/MasterData/AEBF/BudgetTab.js`

**Action:** COMPLETELY REPLACE existing stub (115 lines) with full implementation

**Copy from:** `ActualTab.js` (875 lines) with following changes:

#### **Global Find/Replace:**
```javascript
// API endpoints
'/api/aebf/actual' → '/api/aebf/budget'
'/api/aebf/upload-actual' → '/api/aebf/upload-budget'

// Display text
'Actual Data' → 'Budget Data'
'Upload Actual' → 'Upload Budget'
'Actual Excel' → 'Budget Excel'
'actual_' → 'budget_' (in export filenames)

// Component name (keep as is)
const BudgetTab = () => { ... }
export default BudgetTab;
```

#### **Key Sections to Verify:**

1. **State Variables** (lines 20-40):
   ```javascript
   const [data, setData] = useState([]);
   const [columns, setColumns] = useState([]);
   const [loading, setLoading] = useState(false);
   const [uploadModalVisible, setUploadModalVisible] = useState(false);
   const [configModalVisible, setConfigModalVisible] = useState(false);
   const [resultModalVisible, setResultModalVisible] = useState(false);
   const [selectedFile, setSelectedFile] = useState(null);
   const [uploadConfig, setUploadConfig] = useState(null);
   const [yearMonthOptions, setYearMonthOptions] = useState([]);
   const [selectedYearMonths, setSelectedYearMonths] = useState([]);
   const [analyzing, setAnalyzing] = useState(false);
   const [uploading, setUploading] = useState(false);
   const [uploadResult, setUploadResult] = useState(null);
   const [yearTabs, setYearTabs] = useState([]);
   const [activeYear, setActiveYear] = useState(null);
   const [globalSearchText, setGlobalSearchText] = useState('');
   const [summaryStats, setSummaryStats] = useState({
     totalAmount: 0,
     totalKgs: 0,
     totalMorm: 0
   });
   ```

2. **Fetch Data Function** (lines 50-100):
   ```javascript
   const fetchBudgetData = async (year, division = 'FP') => {
     setLoading(true);
     try {
       const response = await axios.get('/api/aebf/budget', {
         params: { division, year }
       });
       
       if (response.data.success) {
         setData(response.data.data);
         setSummaryStats(response.data.summary);
       }
     } catch (error) {
       message.error('Failed to load budget data');
       console.error(error);
     } finally {
       setLoading(false);
     }
   };
   ```

3. **Upload Handler** (lines 200-300):
   ```javascript
   const handleFinalUpload = async (selectedMonths) => {
     setUploading(true);
     const formData = new FormData();
     formData.append('file', selectedFile);
     formData.append('division', uploadConfig.division);
     formData.append('uploadMode', uploadConfig.uploadMode || 'replace');
     formData.append('uploadedBy', user?.username || 'system');
     
     if (selectedMonths && selectedMonths.length > 0) {
       const yearMonthPairs = selectedMonths.join(',');
       formData.append('selectedYearMonths', yearMonthPairs);
     }
     
     try {
       const response = await axios.post('/api/aebf/upload-budget', formData);
       
       if (response.data.success) {
         message.success('Budget data uploaded successfully!');
         setUploadResult({ success: true, message: response.data.message });
         
         // Refresh data
         if (activeYear) {
           fetchBudgetData(activeYear);
         }
       }
     } catch (error) {
       message.error('Upload failed');
       setUploadResult({ success: false, error: error.response?.data?.error });
     } finally {
       setUploading(false);
       setResultModalVisible(true);
     }
   };
   ```

4. **Export Function** (lines 400-450):
   ```javascript
   const handleExport = () => {
     const worksheet = XLSX.utils.json_to_sheet(data);
     const workbook = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget Data');
     const timestamp = new Date().toISOString().slice(0, 10);
     XLSX.writeFile(workbook, `budget_${activeYear}_${timestamp}.xlsx`);
     message.success('Budget data exported successfully');
   };
   ```

5. **Upload Mode Default** (lines 150-160):
   ```javascript
   // In config modal initial values
   const defaultUploadMode = 'replace'; // Changed from 'upsert'
   ```

---

## 🧪 Testing Checklist

### **Phase 1: Backend Testing**

#### Test 1: PowerShell Script (Standalone)
```powershell
# Test Mode - No DB changes
.\scripts\transform-budget-to-sql.ps1 `
  -ExcelPath "server\data\fp_budget_2025.xlsx" `
  -Division "FP" `
  -UploadMode "replace" `
  -UploadedBy "test_user" `
  -TestMode

# Expected: Validation passes, shows record counts
```

#### Test 2: PowerShell Script (REPLACE Mode)
```powershell
# Actual upload
.\scripts\transform-budget-to-sql.ps1 `
  -ExcelPath "server\data\fp_budget_2025.xlsx" `
  -Division "FP" `
  -UploadMode "replace" `
  -UploadedBy "admin"

# Check database after:
```
```sql
SELECT division, type, year, month, COUNT(*) 
FROM fp_data_excel 
WHERE type = 'Budget' AND division = 'FP'
GROUP BY division, type, year, month
ORDER BY year, month;
```

#### Test 3: GET Endpoint
```bash
# Using curl or Postman
curl "http://localhost:5000/api/aebf/budget?division=FP&year=2025"

# Expected: JSON with data array and summary
```

#### Test 4: Upload Endpoint
```bash
# Using Postman
POST http://localhost:5000/api/aebf/upload-budget
Form Data:
  - file: fp_budget_2025.xlsx
  - division: FP
  - uploadMode: replace
  - uploadedBy: test_user

# Expected: Success response with upload details
```

---

### **Phase 2: Frontend Testing**

#### Test 1: Page Load
- ✅ Navigate to Master Data → AEBF → Budget tab
- ✅ Year tabs appear (auto-select latest year)
- ✅ Summary cards show totals (Amount, KGS, MORM)
- ✅ Table displays budget data
- ✅ Pagination works

#### Test 2: Upload Flow
1. ✅ Click "Upload Budget" button
2. ✅ Config modal appears (Division: FP, Mode: replace)
3. ✅ Select Excel file → Analyzing...
4. ✅ Year/Month checkboxes appear
5. ✅ Select specific months (or all)
6. ✅ Click Upload → Progress indicator
7. ✅ Success modal appears
8. ✅ Data refreshes automatically

#### Test 3: Search & Filter
- ✅ Global search across customer/salesrep/country/productgroup
- ✅ Results update in real-time
- ✅ Summary cards update with filtered totals

#### Test 4: Export
- ✅ Click Export button
- ✅ Excel file downloads: `budget_2025_2025-11-15.xlsx`
- ✅ File contains all visible data

#### Test 5: Year Switching
- ✅ Click different year tab
- ✅ Data loads for that year
- ✅ Summary updates
- ✅ URL updates (if using routing)

---

### **Phase 3: Data Validation**

#### Validation 1: REPLACE Mode Behavior
**Scenario:** Upload 2025 Budget with only Jan-Jun data

**Before Upload:**
```sql
SELECT year, month, COUNT(*) FROM fp_data_excel 
WHERE division='FP' AND type='Budget' AND year=2025
GROUP BY year, month ORDER BY month;

-- Result: 12 months (Jan-Dec)
```

**Upload:** Excel file with Jan-Jun only (months 1-6)

**After Upload:**
```sql
SELECT year, month, COUNT(*) FROM fp_data_excel 
WHERE division='FP' AND type='Budget' AND year=2025
GROUP BY year, month ORDER BY month;

-- Expected: 6 months (Jan-Jun only), Jul-Dec deleted ✅
```

#### Validation 2: No Duplicates
```sql
SELECT customername, year, month, COUNT(*) 
FROM fp_data_excel 
WHERE type = 'Budget' AND division = 'FP'
GROUP BY customername, year, month 
HAVING COUNT(*) > 1;

-- Expected: No results (no duplicates)
```

#### Validation 3: Data Integrity
```sql
-- Check for NULL required fields
SELECT COUNT(*) FROM fp_data_excel 
WHERE type = 'Budget' 
  AND (customername IS NULL OR year IS NULL OR month IS NULL);

-- Expected: 0 rows

-- Check data types
SELECT 
  MIN(year) as min_year, MAX(year) as max_year,
  MIN(month) as min_month, MAX(month) as max_month,
  SUM(amount) as total_amount, SUM(kgs) as total_kgs
FROM fp_data_excel 
WHERE type = 'Budget' AND division = 'FP';

-- Expected: Reasonable values
```

---

## 🎬 Execution Sequence

### **Step 1: PowerShell Script** (30 minutes)
1. Copy `transform-actual-to-sql.ps1` → `transform-budget-to-sql.ps1`
2. Find/Replace: `type = 'Actual'` → `type = 'Budget'` (all occurrences)
3. Update documentation header
4. Test in TestMode
5. Test actual upload with sample data
6. Verify database results

### **Step 2: Backend Endpoints** (45 minutes)
1. Open `server/routes/aebf.js`
2. Add GET `/api/aebf/budget` endpoint (copy from actual)
3. Add POST `/api/aebf/upload-budget` endpoint (copy from upload-actual)
4. Update endpoint to call `transform-budget-to-sql.ps1`
5. Test with Postman/curl
6. Verify responses

### **Step 3: Frontend Component** (1 hour)
1. Backup current `BudgetTab.js` (just in case)
2. Copy entire `ActualTab.js` content
3. Global Find/Replace (actual→budget, Actual→Budget)
4. Verify component name stays `BudgetTab`
5. Change default uploadMode to 'replace'
6. Save file

### **Step 4: Integration Testing** (1 hour)
1. Start backend server
2. Start frontend server
3. Navigate to Budget tab
4. Test full upload flow with `fp_budget_2025.xlsx`
5. Verify data appears correctly
6. Test search, pagination, export
7. Test year switching

### **Step 5: Edge Case Testing** (30 minutes)
1. Upload empty file (should error)
2. Upload wrong format (should error)
3. Upload very large file (should handle)
4. Test REPLACE with partial data (should delete other months)
5. Test concurrent uploads (should queue)

---

## ⚠️ Critical Points

### **Data Safety**
- ⚠️ **REPLACE mode deletes ALL budget data for that year** - Add confirmation modal
- ✅ Script creates automatic backup before deletion
- ✅ Backup table: `fp_data_excel_backup_YYYYMMDD_HHMMSS`

### **Confirmation Modal (Add to Frontend)**
```javascript
// Before handleFinalUpload, show confirmation if REPLACE mode
if (uploadConfig.uploadMode === 'replace') {
  Modal.confirm({
    title: 'Replace All Budget Data?',
    content: `This will DELETE all existing ${activeYear} Budget data for ${uploadConfig.division} and replace with uploaded file. Continue?`,
    okText: 'Yes, Replace All',
    okType: 'danger',
    cancelText: 'Cancel',
    onOk: () => proceedWithUpload()
  });
}
```

### **Upload Mode Selector**
```javascript
// In config modal
<Radio.Group defaultValue="replace">
  <Radio value="upsert">
    Update/Insert - Merge with existing data
  </Radio>
  <Radio value="replace">
    Replace All - Delete all {year} data first ⚠️
  </Radio>
</Radio.Group>
```

---

## 📊 Success Metrics

- ✅ Budget tab matches ActualTab UX exactly
- ✅ Upload completes in < 10 seconds for 10K rows
- ✅ REPLACE mode correctly deletes old data
- ✅ No duplicate records created
- ✅ Search responds in < 500ms
- ✅ Export works for all data sizes
- ✅ Year tabs show correct data
- ✅ Summary cards accurate

---

## 🚀 Ready to Execute?

**Estimated Total Time:** 3-4 hours

**Order of Execution:**
1. ✅ PowerShell script (foundation)
2. ✅ Backend endpoints (API layer)
3. ✅ Frontend component (user interface)
4. ✅ Testing (validation)

**Next Command:**
```powershell
# Step 1: Create PowerShell script
Copy-Item scripts\transform-actual-to-sql.ps1 scripts\transform-budget-to-sql.ps1
```

**Shall I proceed with implementation?**
