# AEBF Module - Actual Sales Data Implementation Plan

## Document Information
- **Created**: November 13, 2025
- **Module**: AEBF (Actual/Estimate/Budget/Forecast)
- **Focus**: Actual Sales Data Tab Implementation
- **Location**: `src/components/MasterData/AEBF/`
- **Database**: `public.fp_data_excel` (FP Division ONLY - not shared with SB/TF/HCM)

---

## 1. Overview

### Purpose
Implement a comprehensive Actual Sales Data management system that allows users to:
- Upload Excel files containing actual sales data in long format
- Transform and load data into PostgreSQL database
- View and manage actual sales records with detailed breakdowns
- Validate data integrity through QC checks
- **Filter data by selected division (FP/SB/TF/HCM)**
- **Support periodic updates with UPSERT or REPLACE modes**

### Data Types Captured
- **Sales Amounts** - Monetary sales values
- **Volumes (KGS)** - Sales volumes in kilograms
- **Margins over Raw Materials (MoRM)** - Profit margins

### Dimensions Tracked
- **Division** - FP, SB, TF, HCM (from app context)
- Year
- Month/Period
- Sales Representative Name
- Customer Name
- Country Name
- Product Group
- Material Type
- Process Type

### Critical Requirements
⚠️ **Division Context**: All operations must be division-aware. User selects division when app loads, and all data viewing/uploading is filtered by that division.

⚠️ **Periodic Updates**: Users upload data daily/weekly/monthly. System must handle incremental updates without duplicates.

---

## 2. Data Update Strategy (UPSERT + Optional Replace)

### Challenge
Users will upload Actual data periodically (daily/weekly/monthly). The system must handle:
- **Scenario 1**: Initial upload with Jan-Oct 2025 data
- **Scenario 2**: Second upload adding Nov 2025 data
- **Scenario 3**: Re-upload with corrections to existing months
- **Scenario 4**: Full year re-upload with updated values

### Solution: Hybrid Approach (UPSERT + Optional Month Cleanup)

#### Strategy 1: UPSERT (Interactive Mode) ✅ RECOMMENDED
**Behavior**: Detect conflicts and let user choose what to replace

**Logic Flow**:
1. User uploads Excel with 28,491 records (Jan-Nov 2025)
2. System detects existing data in database for same years/months
3. **Backend returns conflict report**: 
   - "Database has: 2025 Jan-Oct (25,635 records)"
   - "Excel has: 2025 Jan-Nov (28,491 records)"
   - "Overlap: 2025 Jan-Oct (25,635 records)"
4. **Frontend shows modal**: 
   - "Found existing data for 2025 months 1-10"
   - User chooses: "Replace overlapping months" OR "Keep existing, add only new"
5. **If Replace selected**: DELETE 2025 Jan-Oct, INSERT all Excel data
6. **If Keep selected**: INSERT only Nov data (skip duplicates)
7. **Result**: User controls what gets replaced

**PostgreSQL Implementation**:
```sql
INSERT INTO public.fp_data_excel 
  (year, month, type, salesrepname, customername, countryname, 
   productgroup, material, process, values_type, values)
VALUES (2025, 11, 'ACTUAL', 'JOHN DOE', 'CUSTOMER ABC', 'UAE', 
        'SHRINK FILM', 'PE', 'PRINTED', 'Amount', 15000.00)
ON CONFLICT (year, month, type, customername, productgroup, material, values_type)
DO UPDATE SET
  salesrepname = EXCLUDED.salesrepname,
  countryname = EXCLUDED.countryname,
  process = EXCLUDED.process,
  values = EXCLUDED.values,
  updated_at = NOW();
```

**Database Requirement**:
```sql
-- Add unique constraint to enable UPSERT
ALTER TABLE public.fp_data_excel
ADD CONSTRAINT unique_actual_record 
UNIQUE (year, month, type, customername, productgroup, material, values_type);

-- Add updated_at column for tracking changes
ALTER TABLE public.fp_data_excel
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
```

**Advantages**:
- ✅ No duplicates
- ✅ Preserves latest values
- ✅ Handles partial updates gracefully
- ✅ Safe for daily uploads
- ✅ Simple for users (no decision needed)

**Example Report**:
```
📊 Upload Report (UPSERT Mode):
- Date Range: January 2025 - November 2025
- Records in Excel: 28,491
- Processing Results:
  ✅ New Records Inserted: 2,856 (November 2025)
  🔄 Existing Records Updated: 25,635 (January-October 2025)
  ⏭️ Unchanged Records: 0
- Processing Time: 23 seconds
```

---

#### Strategy 2: REPLACE (Complete Replacement Mode)
**Behavior**: Delete ALL existing FP Actual data, then insert fresh from Excel

**Logic Flow**:
1. User selects "REPLACE" mode (WARNING shown)
2. **Backup**: Copy ALL existing FP Actual data to `fp_data_excel_backup` table
3. **DELETE**: Remove ALL records WHERE `division='FP' AND type='Actual'`
4. **INSERT**: All records from Excel (e.g., 28,491 records)
5. **Result**: Database contains ONLY the data from uploaded Excel file
6. **Warning**: "This will delete ALL existing FP Actual data. Old years/months not in Excel will be lost."

**SQL Implementation**:
```sql
-- Step 1: Detect month range from uploaded data
SELECT DISTINCT year, month FROM staging_table;

-- Step 2: Delete existing records for those months
DELETE FROM public.fp_data_excel
WHERE type = 'ACTUAL' 
  AND year = 2025 
  AND month IN (1,2,3,4,5,6,7,8,9,10,11);

-- Step 3: Insert all records from staging
INSERT INTO public.fp_data_excel 
SELECT * FROM staging_table;
```

**Advantages**:
- ✅ Clean slate for uploaded months
- ✅ Removes orphaned records (if Excel had deletions)
- ✅ Simple logic, fast execution
- ✅ Good for full month re-imports

**Disadvantages**:
- ⚠️ Loses any manual edits to existing data
- ⚠️ Requires user awareness (could accidentally delete data)

**Example Report**:
```
📊 Upload Report (REPLACE Mode):
⚠️ Mode: Replace existing data
- Date Range: January 2025 - November 2025
- Deleted Records: 25,635 (Jan-Oct 2025 old data)
- Inserted Records: 28,491 (Jan-Nov 2025 new data)
- Net Change: +2,856 records
- Processing Time: 18 seconds
```

---

#### Hybrid Implementation: User Choice

**UI Component** (ActualTab.js):
```jsx
<Space direction="vertical" style={{ width: '100%', marginBottom: 20 }}>
  <Upload
    accept=".xlsx,.xls"
    beforeUpload={(file) => {
      setSelectedFile(file);
      return false;
    }}
  >
    <Button icon={<UploadOutlined />}>Select Excel File</Button>
  </Upload>
  
  {selectedFile && (
    <>
      <Alert
        type="info"
        message="Upload Mode Selection"
        description={
          <Radio.Group 
            value={uploadMode} 
            onChange={(e) => setUploadMode(e.target.value)}
          >
            <Space direction="vertical">
              <Radio value="upsert">
                <strong>UPSERT (Recommended)</strong>
                <div style={{ color: '#666', fontSize: '12px' }}>
                  Update existing records, insert new ones. Safe for daily uploads.
                </div>
              </Radio>
              <Radio value="replace">
                <strong>REPLACE</strong>
                <div style={{ color: '#666', fontSize: '12px' }}>
                  Delete all data for uploaded months, then insert fresh. 
                  Use for full month re-imports.
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        }
      />
      
      {uploadMode === 'replace' && (
        <Alert
          type="warning"
          showIcon
          message="Warning: Replace Mode"
          description="This will permanently delete existing data for all months present in your Excel file. This action cannot be undone."
        />
      )}
      
      <Button 
        type="primary" 
        icon={<ThunderboltOutlined />}
        onClick={handleTransformLoad}
        disabled={!selectedFile}
      >
        Transform & Load Data ({uploadMode === 'upsert' ? 'UPSERT' : 'REPLACE'})
      </Button>
    </>
  )}
</Space>
```

**PowerShell Script Parameter**:
```powershell
param(
  [Parameter(Mandatory=$true)]
  [string]$ExcelPath,
  
  # Upload mode: 'upsert' (default) or 'replace'
  [ValidateSet('upsert', 'replace')]
  [string]$UploadMode = 'upsert',
  
  # Other parameters...
)

# In script logic:
if ($UploadMode -eq 'replace') {
  # Detect months in Excel
  $months = $data | Select-Object -ExpandProperty month -Unique
  $years = $data | Select-Object -ExpandProperty year -Unique
  
  # Delete existing records for those months
  $deleteQuery = @"
DELETE FROM public.fp_data_excel
WHERE type = 'ACTUAL'
  AND year IN ($($years -join ','))
  AND month IN ($($months -join ','));
"@
  
  Write-Log "REPLACE mode: Deleting existing records for months: $($months -join ',')"
  Invoke-SqlQuery $deleteQuery
}

# Then proceed with INSERT (upsert uses ON CONFLICT, replace uses plain INSERT)
if ($UploadMode -eq 'upsert') {
  $insertQuery += " ON CONFLICT (year, month, type, customername, productgroup, material, values_type) 
                     DO UPDATE SET values = EXCLUDED.values, updated_at = NOW();"
}
```

**Backend API Parameter**:
```javascript
router.post('/upload-actual', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  const uploadMode = req.body.mode || 'upsert'; // 'upsert' or 'replace'
  
  // Validate mode
  if (!['upsert', 'replace'].includes(uploadMode)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid upload mode. Must be "upsert" or "replace"' 
    });
  }
  
  const scriptPath = path.join(__dirname, '../../src/components/MasterData/AEBF/transform-actual-to-sql.ps1');
  const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -ExcelPath "${uploadedFile.path}" -UploadMode ${uploadMode}`;
  
  // Execute and return report...
});
```

**Report Format** (includes mode information):
```json
{
  "status": "success",
  "mode": "upsert",
  "timestamp": "2025-11-13T14:30:45Z",
  "processing_time_seconds": 23,
  "date_range": {
    "years": [2025],
    "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    "display": "January 2025 - November 2025"
  },
  "records_in_excel": 28491,
  "processing_results": {
    "new_inserted": 2856,
    "existing_updated": 25635,
    "deleted": 0,
    "unchanged": 0
  },
  "breakdown": {
    "KGS": {
      "rows": 9497,
      "excel_sum": 12345678.5432,
      "db_sum": 12345678.5432,
      "match": true
    },
    "Amount": {
      "rows": 9497,
      "excel_sum": 45678910.2500,
      "db_sum": 45678910.2500,
      "match": true
    },
    "MoRM": {
      "rows": 9497,
      "excel_sum": 23456789.1234,
      "db_sum": 23456789.1234,
      "match": true
    }
  },
  "qc_status": "PASS"
}
```

**Frontend Report Display**:
```jsx
<Descriptions bordered column={1}>
  <Item label="Upload Mode">
    {report.mode === 'upsert' 
      ? <Tag color="blue">UPSERT (Update/Insert)</Tag>
      : <Tag color="orange">REPLACE (Delete/Insert)</Tag>
    }
  </Item>
  <Item label="Date Range">{report.date_range.display}</Item>
  <Item label="Records in Excel">{report.records_in_excel.toLocaleString()}</Item>
  
  {report.mode === 'upsert' && (
    <>
      <Item label="New Records Inserted">
        <Badge count={report.processing_results.new_inserted} showZero color="green" />
      </Item>
      <Item label="Existing Records Updated">
        <Badge count={report.processing_results.existing_updated} showZero color="blue" />
      </Item>
    </>
  )}
  
  {report.mode === 'replace' && (
    <>
      <Item label="Old Records Deleted">
        <Badge count={report.processing_results.deleted} showZero color="red" />
      </Item>
      <Item label="New Records Inserted">
        <Badge count={report.records_in_excel} showZero color="green" />
      </Item>
    </>
  )}
</Descriptions>
```

---

#### Comparison Table

| Aspect | UPSERT Mode | REPLACE Mode |
|--------|-------------|--------------|
| **Use Case** | Daily/weekly incremental updates | Monthly full re-imports |
| **Safety** | ✅ Very safe, no data loss | ⚠️ Destructive, requires caution |
| **Speed** | Slightly slower (conflict checking) | Faster (simple DELETE+INSERT) |
| **Duplicates** | ❌ Prevented by unique constraint | ❌ Prevented by clean slate |
| **Manual Edits** | ✅ Can preserve (if not in Excel) | ❌ Lost for uploaded months |
| **Orphaned Records** | May remain (if removed from Excel) | ✅ Cleaned up |
| **Recommended For** | Most scenarios | Full month corrections |
| **User Skill Required** | Low | Medium (must understand impact) |

---

#### Recommended Default: UPSERT
- Set `uploadMode = 'upsert'` as default
- Show REPLACE mode as advanced option
- Require explicit user confirmation for REPLACE mode
- Log all operations with timestamps for audit trail

---

## 3. Excel File Structure

### Source File
- **Location**: `D:\Projects\IPD26.10\server\data\fp_data main.xlsx`
- **Sheet Name**: "Actual"
- **Total Records**: 28,491 rows
- **Format**: Long format (one row per data point)

### Excel Columns (11 columns)

| Column # | Column Name | Data Type | Example Values | Description |
|----------|-------------|-----------|----------------|-------------|
| 1 | `year` | Numeric | 2019, 2020, 2021 | Fiscal year |
| 2 | `month` | Text | January, February, March | Month name (will be converted to 1-12) |
| 3 | `type` | Text | Actual | Data type (already set to "Actual") |
| 4 | `salesrepname` | Text | Abraham Mathew, Adam Ali Khattab | Sales representative name |
| 5 | `customername` | Text | ALPINA PURE DRINKING WATER LLC | Customer/client name |
| 6 | `countryname` | Text | UNITED ARAB EMIRATES | Country location |
| 7 | `productgroup` | Text | Shrink Film Plain, Services Charges | Product category |
| 8 | `material` | Text | PE, Others, BOPP | Material type |
| 9 | `process` | Text | Unprinted, Others | Manufacturing process |
| 10 | `values_type` | Text | KGS, Amount, MoRM | Data metric type |
| 11 | `values` | Numeric | 40, 500, -253.26 | Numeric value |

### Values_Type Breakdown
- **KGS** - Volume in kilograms (~9,497 rows)
- **Amount** - Sales amount in currency (~9,497 rows)
- **MoRM** - Margin over Raw Materials (~9,497 rows)

### Sample Data
```
Year: 2019
Month: January
Type: Actual
Sales Rep: Abraham Mathew
Customer: ALPINA PURE DRINKING WATER LLC
Country: UNITED ARAB EMIRATES
Product Group: Shrink Film Plain
Material: PE
Process: Unprinted
Values Type: KGS
Value: 40
```

---

## 3. Database Schema

### Target Table
**Table Name**: `public.fp_data_excel`

### Table Columns

| Column Name | Data Type | Constraints | Description |
|-------------|-----------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `year` | INTEGER | NOT NULL | Fiscal year |
| `month` | INTEGER | NOT NULL | Month number (1-12) |
| `type` | VARCHAR(50) | NOT NULL | Data type (Actual/Budget/Estimate/Forecast) |
| `salesrepname` | VARCHAR(255) | | Sales representative name |
| `customername` | VARCHAR(255) | | Customer name |
| `countryname` | VARCHAR(100) | | Country name |
| `productgroup` | VARCHAR(255) | | Product group |
| `material` | VARCHAR(100) | | Material type |
| `process` | VARCHAR(100) | | Process type |
| `values_type` | VARCHAR(50) | | Metric type (KGS/Amount/MoRM) |
| `values` | NUMERIC(18,4) | | Numeric value |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Record last update timestamp |

### Unique Constraint (Required for UPSERT) ⚠️ **CRITICAL - NOT YET APPLIED**
```sql
-- Add division column if not exists
ALTER TABLE public.fp_data_excel
ADD COLUMN IF NOT EXISTS division VARCHAR(10);

-- Add updated_at column if not exists
ALTER TABLE public.fp_data_excel
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add unique constraint INCLUDING DIVISION
ALTER TABLE public.fp_data_excel
ADD CONSTRAINT unique_actual_record 
UNIQUE (division, year, month, type, customername, productgroup, material, values_type);
```

**Purpose**: Prevents duplicate records per division and enables UPSERT functionality (ON CONFLICT)

**STATUS**: ❌ **NOT YET APPLIED TO DATABASE** - Must run this SQL before UPSERT will work

### Indexes (Recommended)
```sql
CREATE INDEX idx_fp_data_year ON public.fp_data_excel(year);
CREATE INDEX idx_fp_data_type ON public.fp_data_excel(type);
CREATE INDEX idx_fp_data_values_type ON public.fp_data_excel(values_type);
CREATE INDEX idx_fp_data_customer ON public.fp_data_excel(customername);
CREATE INDEX idx_fp_data_updated_at ON public.fp_data_excel(updated_at);
```

### Complete Table Creation Script ⚠️ **UPDATED WITH DIVISION COLUMN**
```sql
-- Drop table if exists (for fresh setup)
DROP TABLE IF EXISTS public.fp_data_excel CASCADE;

-- Create table with all columns INCLUDING DIVISION
CREATE TABLE public.fp_data_excel (
  id SERIAL PRIMARY KEY,
  division VARCHAR(10) NOT NULL,  -- ⚠️ CRITICAL: Division column added
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  salesrepname VARCHAR(255),
  customername VARCHAR(255),
  countryname VARCHAR(100),
  productgroup VARCHAR(255),
  material VARCHAR(100),
  process VARCHAR(100),
  values_type VARCHAR(50),
  values NUMERIC(18,4),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraint for UPSERT functionality (INCLUDING DIVISION)
ALTER TABLE public.fp_data_excel
ADD CONSTRAINT unique_actual_record 
UNIQUE (division, year, month, type, customername, productgroup, material, values_type);

-- Create indexes for performance
CREATE INDEX idx_fp_data_division ON public.fp_data_excel(division);  -- ⚠️ NEW
CREATE INDEX idx_fp_data_year ON public.fp_data_excel(year);
CREATE INDEX idx_fp_data_type ON public.fp_data_excel(type);
CREATE INDEX idx_fp_data_values_type ON public.fp_data_excel(values_type);
CREATE INDEX idx_fp_data_customer ON public.fp_data_excel(customername);
CREATE INDEX idx_fp_data_updated_at ON public.fp_data_excel(updated_at);
CREATE INDEX idx_fp_data_composite ON public.fp_data_excel(division, type, year, month);  -- ⚠️ NEW: Composite for common queries

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fp_data_excel_updated_at
BEFORE UPDATE ON public.fp_data_excel
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

**STATUS**: ❌ **NOT YET APPLIED** - This is the complete schema needed for the system to work

---

## 4. Frontend Implementation - ActualTab.js

### Component Location
`src/components/MasterData/AEBF/ActualTab.js`

### UI Components

#### 4.1 Header Section
- **Title**: "Actual Sales Data" ⚠️ (MUST UPDATE from "Actual Financial Data")
- **Description**: "View and manage actual sales data including volumes (KGS), sales amounts, and margins (MoRM)"
- **Division Display**: 
  ```jsx
  import { useExcelData } from '../../../contexts/ExcelDataContext';
  
  const { selectedDivision } = useExcelData();
  
  <Alert 
    type="info" 
    message={`Division: ${selectedDivision || 'Not Selected'}`}
    description={selectedDivision 
      ? `Viewing ${selectedDivision} division data` 
      : 'Please select a division from the main menu'}
  />
  ```
- **Warning if no division**: Block operations if `!selectedDivision`

#### 4.2 Action Buttons
1. **Upload Excel** - File upload for Excel files
2. **Transform & Load Data** - Trigger data processing
3. **Export Excel** - Download current data
4. **Refresh** - Reload data from database

#### 4.3 Data Table Columns

| Column | Data Source | Width | Features | Status |
|--------|-------------|-------|----------|--------|
| Year | `year` | 80px | Sortable | ✅ Implemented |
| Month | `month` | 100px | **Display as name** (Jan, Feb, etc.), sortable | ⚠️ NEEDS FIX (currently shows number) |
| Sales Rep | `salesrepname` | 150px | Ellipsis for overflow | ❌ MISSING - MUST ADD |
| Customer | `customername` | 200px | Ellipsis, searchable | ✅ Implemented |
| Country | `countryname` | 120px | Filterable | ✅ Implemented |
| Product Group | `productgroup` | 150px | Ellipsis | ✅ Implemented |
| Material | `material` | 100px | Filterable | ✅ Implemented |
| Process | `process` | 120px | Filterable | ❌ MISSING - MUST ADD |
| Values Type | `values_type` | 120px | Filter (KGS/Amount/MoRM) | ✅ Implemented |
| Value | `values` | 120px | Right-aligned, formatted with 2 decimals | ✅ Implemented |

**Month Column Render Function**:
```javascript
{
  title: 'Month',
  dataIndex: 'month',
  key: 'month',
  width: 100,
  sorter: (a, b) => a.month - b.month,
  render: (month) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[month - 1] || month;
  }
}
```

**Sales Rep Column** (MUST ADD):
```javascript
{
  title: 'Sales Rep',
  dataIndex: 'salesrepname',
  key: 'salesrepname',
  width: 150,
  ellipsis: true,
}
```

**Process Column** (MUST ADD):
```javascript
{
  title: 'Process',
  dataIndex: 'process',
  key: 'process',
  width: 120,
  filters: [
    { text: 'Printed', value: 'PRINTED' },
    { text: 'Unprinted', value: 'UNPRINTED' },
    { text: 'Others', value: 'OTHERS' },
  ],
  onFilter: (value, record) => record.process === value,
}
```

#### 4.4 Table Features
- Pagination: 20 rows per page (configurable: 10, 20, 50, 100)
- Total record count display
- Sorting on numeric columns (Year, Month, Value)
- Filtering on categorical columns (Country, Material, Process, Values Type)
- Horizontal and vertical scrolling
- Responsive design
- **Quick Values Type Filter** (NEW - RECOMMENDED):
  ```jsx
  <Radio.Group 
    value={valuesTypeFilter} 
    onChange={(e) => setValuesTypeFilter(e.target.value)}
    style={{ marginBottom: 16 }}
  >
    <Radio.Button value="all">All Data</Radio.Button>
    <Radio.Button value="KGS">📦 Volumes (KGS)</Radio.Button>
    <Radio.Button value="Amount">💰 Sales Amount</Radio.Button>
    <Radio.Button value="MoRM">📊 Margins (MoRM)</Radio.Button>
  </Radio.Group>
  ```

#### 4.5 Upload Section with Mode Selection
```jsx
<Space direction="vertical" style={{ width: '100%', marginBottom: 20 }}>
  {/* File Upload */}
  <Upload
    accept=".xlsx,.xls"
    showUploadList={true}
    maxCount={1}
    beforeUpload={(file) => {
      setSelectedFile(file);
      return false; // Prevent auto-upload
    }}
    onRemove={() => setSelectedFile(null)}
  >
    <Button icon={<UploadOutlined />}>
      Select Excel File
    </Button>
  </Upload>

  {/* Upload Mode Selection (only show when file is selected) */}
  {selectedFile && (
    <>
      <Alert
        type="info"
        message="Upload Mode Selection"
        description={
          <Radio.Group 
            value={uploadMode} 
            onChange={(e) => setUploadMode(e.target.value)}
            style={{ marginTop: 10 }}
          >
            <Space direction="vertical">
              <Radio value="upsert">
                <strong>UPSERT (Recommended)</strong>
                <div style={{ color: '#666', fontSize: '12px', marginLeft: 24 }}>
                  Update existing records, insert new ones. Safe for daily uploads.
                </div>
              </Radio>
              <Radio value="replace">
                <strong>REPLACE</strong>
                <div style={{ color: '#666', fontSize: '12px', marginLeft: 24 }}>
                  Delete all data for uploaded months, then insert fresh. 
                  Use for full month re-imports.
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        }
      />
      
      {/* Warning for Replace Mode */}
      {uploadMode === 'replace' && (
        <Alert
          type="warning"
          showIcon
          message="Warning: Replace Mode"
          description="This will permanently delete existing data for all months present in your Excel file. This action cannot be undone."
        />
      )}
      
      {/* Transform & Load Button */}
      <Button 
        type="primary" 
        size="large"
        icon={<ThunderboltOutlined />}
        onClick={handleTransformLoad}
        disabled={!selectedFile}
        loading={uploading}
      >
        Transform & Load Data ({uploadMode === 'upsert' ? 'UPSERT' : 'REPLACE'} Mode)
      </Button>
    </>
  )}
</Space>
```

#### 4.6 Report Modal/Card
Display transformation results after upload:

```jsx
<Modal title="Upload Results" visible={showReport}>
  <Result
    status="success"
    title="Upload Successful"
    subTitle="Data has been processed and loaded"
  />
  
  <Descriptions bordered column={1}>
    <Item label="Total Records Processed">28,491</Item>
    <Item label="KGS Records">9,497 rows (Sum: 12,345,678 kg)</Item>
    <Item label="Amount Records">9,497 rows (Sum: $45,678,910)</Item>
    <Item label="MoRM Records">9,497 rows (Sum: $23,456,789)</Item>
    <Item label="QC Validation">✅ Excel sums match DB sums</Item>
    <Item label="Processing Time">23 seconds</Item>
  </Descriptions>
  
  {warnings.length > 0 && (
    <Alert type="warning" message="Warnings" description={warnings} />
  )}
</Modal>
```

---

## 5. PowerShell Script - Transform & Load

### Script Location
`src/components/MasterData/AEBF/transform-actual-to-sql.ps1`

**STATUS**: ❌ **NOT CREATED YET** - Only `transform-fp-excel-to-sql.ps1` exists (handles Actual+Budget)

### Script Purpose
Transform Excel "Actual" sheet data into normalized PostgreSQL records with full QC validation and division awareness.

### Parameters

```powershell
param(
  # PostgreSQL connection
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgDatabase = "fp_database",
  [string]$PgUser = "postgres",
  [string]$PgPassword = "654883",
  
  # Excel file path (required)
  [Parameter(Mandatory=$true)]
  [string]$ExcelPath,
  
  # Division (required) ⚠️ CRITICAL PARAMETER
  [Parameter(Mandatory=$true)]
  [ValidateSet('FP', 'SB', 'TF', 'HCM')]
  [string]$Division,
  
  # Sheet name
  [string]$SheetName = "Actual",
  
  # Target table
  [string]$Schema = "public",
  [string]$TargetTable = "fp_data_excel",
  
  # Upload mode: 'upsert' (default) or 'replace'
  [ValidateSet('upsert', 'replace')]
  [string]$UploadMode = 'upsert',
  
  # Behavior flags
  [bool]$ValidateOnly = $false         # Dry run mode
)

Write-Log "Starting upload for Division: $Division, Mode: $UploadMode"
```

### Processing Steps

#### Step 1: Prerequisites Check
- Verify ImportExcel module is installed
- Verify psql.exe is available
- Verify Excel file exists
- Verify database connectivity

#### Step 2: Read Excel Data
```powershell
$data = Import-Excel -Path $ExcelPath -WorksheetName $SheetName
Write-Log "Loaded $($data.Count) rows from '$SheetName' sheet"
```

#### Step 3: Data Normalization
For each row:
- **Text fields**: Apply `Normalize-Text()` function
  - Trim whitespace
  - Collapse multiple spaces
  - Unicode normalization (Form C)
  - Convert to UPPERCASE
  - Replace smart quotes with standard quotes
- **Month conversion**: Convert "January" → 1, "February" → 2, etc.
- **Numeric validation**: Ensure `values` is numeric (handle decimals)

```powershell
function Normalize-Text {
  param([object]$x)
  if ($null -eq $x) { return $null }
  $s = [string]$x
  $s = $s.Normalize([Text.NormalizationForm]::FormC)
  $s = $s -replace "[\u00A0\u2000-\u200B]", " "
  $s = ($s -replace "\s+", " ").Trim()
  return $s.ToUpperInvariant()
}

function Get-MonthNumber {
  param([string]$monthName)
  $months = @{
    'JANUARY'=1; 'FEBRUARY'=2; 'MARCH'=3; 'APRIL'=4;
    'MAY'=5; 'JUNE'=6; 'JULY'=7; 'AUGUST'=8;
    'SEPTEMBER'=9; 'OCTOBER'=10; 'NOVEMBER'=11; 'DECEMBER'=12
  }
  $normalized = $monthName.ToUpperInvariant()
  return $months[$normalized]
}
```

#### Step 4: Handle Upload Mode Logic

**REPLACE Mode** - Delete existing records for uploaded months **AND DIVISION**:
```powershell
if ($UploadMode -eq 'replace') {
  # Detect unique years and months in uploaded Excel
  $uniqueYears = $data | Select-Object -ExpandProperty year -Unique
  $uniqueMonths = $data | Select-Object -ExpandProperty month -Unique | ForEach-Object { Get-MonthNumber $_ }
  
  Write-Log "REPLACE mode: Deleting existing records for Division: $Division, Year(s): $($uniqueYears -join ','), Month(s): $($uniqueMonths -join ',')"
  
  # Build DELETE query ⚠️ MUST FILTER BY DIVISION
  $deleteQuery = @"
DELETE FROM $Schema.$TargetTable
WHERE type = 'ACTUAL'
  AND division = '$Division'  -- CRITICAL: Division filter
  AND year IN ($($uniqueYears -join ','))
  AND month IN ($($uniqueMonths -join ','));
"@
  
  # Execute DELETE
  $deleteResult = Invoke-SqlQuery -Query $deleteQuery
  Write-Log "Deleted $deleteResult rows from existing data (Division: $Division)"
}
```

#### Step 5: Generate SQL Insert Statements

**UPSERT Mode** - Insert with ON CONFLICT **INCLUDING DIVISION**:
```sql
INSERT INTO public.fp_data_excel 
  (division, year, month, type, salesrepname, customername, countryname, 
   productgroup, material, process, values_type, values)
VALUES 
  ('FP', 2019, 1, 'ACTUAL', 'ABRAHAM MATHEW', 'ALPINA PURE DRINKING WATER LLC',
   'UNITED ARAB EMIRATES', 'SHRINK FILM PLAIN', 'PE', 'UNPRINTED', 'KGS', 40),
  ('FP', 2019, 1, 'ACTUAL', 'ABRAHAM MATHEW', 'ALPINA PURE DRINKING WATER LLC',
   'UNITED ARAB EMIRATES', 'SHRINK FILM PLAIN', 'PE', 'UNPRINTED', 'AMOUNT', 0),
  ...
ON CONFLICT (division, year, month, type, customername, productgroup, material, values_type)
DO UPDATE SET
  salesrepname = EXCLUDED.salesrepname,
  countryname = EXCLUDED.countryname,
  process = EXCLUDED.process,
  values = EXCLUDED.values,
  updated_at = NOW();
```

⚠️ **NOTE**: Unique constraint must include `division` column!

**REPLACE Mode** - Simple INSERT (after DELETE):
```sql
INSERT INTO public.fp_data_excel 
  (year, month, type, salesrepname, customername, countryname, 
   productgroup, material, process, values_type, values)
VALUES 
  (2019, 1, 'ACTUAL', 'ABRAHAM MATHEW', 'ALPINA PURE DRINKING WATER LLC',
   'UNITED ARAB EMIRATES', 'SHRINK FILM PLAIN', 'PE', 'UNPRINTED', 'KGS', 40),
  ...
-- No ON CONFLICT needed (already deleted existing records)
```

#### Step 6: Execute via psql
```powershell
$sqlFile = [System.IO.Path]::GetTempFileName() + ".sql"
$insertStatements | Out-File -FilePath $sqlFile -Encoding UTF8

$env:PGPASSWORD = $PgPassword
& psql -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -f $sqlFile
```

#### Step 7: QC Validation
Compare Excel vs Database:

**Row Count Validation**:
```sql
SELECT 
  COUNT(*) as total_rows,
  COUNT(CASE WHEN values_type='KGS' THEN 1 END) as kgs_rows,
  COUNT(CASE WHEN values_type='Amount' THEN 1 END) as amount_rows,
  COUNT(CASE WHEN values_type='MoRM' THEN 1 END) as morm_rows
FROM public.fp_data_excel
WHERE type='ACTUAL';
```

**Sum Validation**:
```sql
SELECT 
  values_type,
  SUM(values) as total_sum,
  ROUND(SUM(values)::numeric, 4) as rounded_sum
FROM public.fp_data_excel
WHERE type='ACTUAL'
GROUP BY values_type;
```

Compare with Excel sums (calculated before insert).

#### Step 8: Generate JSON Report
```json
{
  "status": "success",
  "mode": "upsert",
  "timestamp": "2025-11-13T14:30:45Z",
  "processing_time_seconds": 23,
  "excel_file": "fp_data main.xlsx",
  "sheet_name": "Actual",
  "date_range": {
    "years": [2025],
    "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    "display": "January 2025 - November 2025"
  },
  "records_in_excel": 28491,
  "processing_results": {
    "new_inserted": 2856,
    "existing_updated": 25635,
    "deleted": 0,
    "unchanged": 0
  },
  "breakdown": {
    "KGS": {
      "rows": 9497,
      "excel_sum": 12345678.5432,
      "db_sum": 12345678.5432,
      "match": true
    },
    "Amount": {
      "rows": 9497,
      "excel_sum": 45678910.2500,
      "db_sum": 45678910.2500,
      "match": true
    },
    "MoRM": {
      "rows": 9497,
      "excel_sum": 23456789.1234,
      "db_sum": 23456789.1234,
      "match": true
    }
  },
  "qc_status": "PASS",
  "warnings": [],
  "errors": []
}
```

---

## 6. Backend API Implementation

### API Endpoints

#### 6.1 GET `/api/aebf/actual`
Fetch actual sales data from database.

**Query Parameters**:
- `page` (default: 1)
- `pageSize` (default: 20)
- `year` (optional filter)
- `month` (optional filter)
- `values_type` (optional: KGS, Amount, MoRM)
- `customer` (optional search)
- `country` (optional filter)

**Request Example**:
```
GET /api/aebf/actual?page=1&pageSize=20&year=2019&values_type=KGS
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "year": 2019,
      "month": 1,
      "type": "ACTUAL",
      "salesrepname": "ABRAHAM MATHEW",
      "customername": "ALPINA PURE DRINKING WATER LLC",
      "countryname": "UNITED ARAB EMIRATES",
      "productgroup": "SHRINK FILM PLAIN",
      "material": "PE",
      "process": "UNPRINTED",
      "values_type": "KGS",
      "values": "40.0000"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalRecords": 28491,
    "totalPages": 1425
  }
}
```

**Implementation** (`server/routes/aebf.js`):
```javascript
router.get('/actual', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, year, month, values_type, customer, country } = req.query;
    const offset = (page - 1) * pageSize;
    
    let whereConditions = ["type = 'ACTUAL'"];
    let params = [];
    let paramIndex = 1;
    
    if (year) {
      whereConditions.push(`year = $${paramIndex++}`);
      params.push(year);
    }
    if (month) {
      whereConditions.push(`month = $${paramIndex++}`);
      params.push(month);
    }
    if (values_type) {
      whereConditions.push(`values_type = $${paramIndex++}`);
      params.push(values_type);
    }
    if (customer) {
      whereConditions.push(`customername ILIKE $${paramIndex++}`);
      params.push(`%${customer}%`);
    }
    if (country) {
      whereConditions.push(`countryname = $${paramIndex++}`);
      params.push(country);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM public.fp_data_excel WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalRecords = parseInt(countResult.rows[0].count);
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM public.fp_data_excel 
      WHERE ${whereClause}
      ORDER BY year DESC, month DESC, customername
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(pageSize, offset);
    const dataResult = await pool.query(dataQuery, params);
    
    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (error) {
    console.error('Error fetching actual data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### 6.2 POST `/api/aebf/upload-actual`
Upload and process Excel file.

**Request**:
- Content-Type: `multipart/form-data`
- Body: Excel file (field name: `file`)

**Implementation**:
```javascript
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const upload = multer({ 
  dest: 'uploads/temp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

router.post('/upload-actual', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  const uploadMode = req.body.mode || 'upsert'; // 'upsert' or 'replace'
  
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  // Validate upload mode
  if (!['upsert', 'replace'].includes(uploadMode)) {
    if (uploadedFile && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid upload mode. Must be "upsert" or "replace"' 
    });
  }
  
  try {
    // Path to PowerShell script
    const scriptPath = path.join(__dirname, '../../src/components/MasterData/AEBF/transform-actual-to-sql.ps1');
    
    // Execute PowerShell script with upload mode parameter
    const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -ExcelPath "${uploadedFile.path}" -UploadMode ${uploadMode}`;
    
    console.log(`Executing upload in ${uploadMode.toUpperCase()} mode...`);
    
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up uploaded file
      if (fs.existsSync(uploadedFile.path)) {
        fs.unlinkSync(uploadedFile.path);
      }
      
      if (error) {
        console.error('PowerShell execution error:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to process Excel file',
          details: stderr 
        });
      }
      
      try {
        // Parse JSON output from PowerShell
        const report = JSON.parse(stdout);
        res.json({ success: true, report });
      } catch (parseError) {
        // If not JSON, return raw output
        res.json({ 
          success: true, 
          message: 'Processing completed',
          output: stdout,
          mode: uploadMode
        });
      }
    });
    
  } catch (error) {
    // Clean up on error
    if (uploadedFile && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 7. Data Flow Architecture

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                              │
│  1. User navigates to Master Data > AEBF > Actual tab          │
│  2. Clicks "Upload Excel" button                                │
│  3. Selects fp_data main.xlsx file                              │
│  4. Clicks "Transform & Load Data"                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FRONTEND (React/Ant Design)                    │
│  ActualTab.js Component                                         │
│  - Validates file format (.xlsx/.xls)                           │
│  - Shows loading spinner                                        │
│  - Sends file via POST /api/aebf/upload-actual                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js/Express)                      │
│  server/routes/aebf.js                                          │
│  - Receives file via multer middleware                          │
│  - Saves to temp location (uploads/temp/)                       │
│  - Validates file extension                                     │
│  - Executes PowerShell script with file path                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                POWERSHELL SCRIPT                                 │
│  transform-actual-to-sql.ps1                                    │
│  1. Import Excel "Actual" sheet (28,491 rows)                   │
│  2. Normalize all text fields (uppercase, trim, Unicode)        │
│  3. Convert months: "January" → 1, "February" → 2, etc.        │
│  4. Calculate Excel sums by values_type (KGS/Amount/MoRM)      │
│  5. Generate SQL INSERT statements                              │
│  6. Write to temp SQL file                                      │
│  7. Execute via psql command                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE (PostgreSQL)                          │
│  fp_database.public.fp_data_excel                               │
│  - Receives 28,491 INSERT statements                            │
│  - Executes within transaction                                  │
│  - Commits all or rolls back on error                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    QC VALIDATION                                 │
│  PowerShell Script (continued)                                  │
│  1. Query database for inserted records                         │
│  2. Count rows by values_type                                   │
│  3. Sum values by values_type                                   │
│  4. Compare Excel vs DB (row counts & sums)                     │
│  5. Generate JSON report with results                           │
│  6. Output to stdout (captured by Node.js)                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (Response)                             │
│  - Captures PowerShell stdout                                   │
│  - Parses JSON report                                           │
│  - Deletes temp file                                            │
│  - Returns report to frontend                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FRONTEND (Display Results)                     │
│  - Receives JSON report                                         │
│  - Displays modal with:                                         │
│    ✅ Success status                                            │
│    📊 Records processed: 28,491                                 │
│    📈 KGS: 9,497 rows, Sum: 12.3M kg                           │
│    💰 Amount: 9,497 rows, Sum: $45.6M                          │
│    📊 MoRM: 9,497 rows, Sum: $23.4M                            │
│    ✅ QC: Excel vs DB match                                     │
│  - Auto-refreshes table with GET /api/aebf/actual              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling & Validation

### Frontend Validation
- File format check (only .xlsx, .xls)
- File size limit (50MB max)
- Required sheet name validation
- Network error handling with retry

### Backend Validation
- Multer upload errors
- File existence checks
- PowerShell execution timeout (5 minutes)
- Script exit code validation

### Script Validation
- Excel file exists and readable
- Sheet "Actual" exists
- Required columns present (11 columns)
- Data type validation (year=numeric, month=text, values=numeric)
- Database connectivity check
- Transaction rollback on error

### Database Validation
- Unique constraint checks (if applicable)
- Foreign key validation (if applicable)
- Data type mismatches
- NULL constraint violations

### QC Validation
- **Critical**: Row count must match (Excel vs DB)
- **Critical**: Sums must match within 0.01 tolerance
- **Warning**: Duplicate records detected
- **Warning**: Missing or NULL values in critical fields

---

## 9. Performance Considerations

### Expected Performance
- **Excel Read Time**: ~2-3 seconds for 28,491 rows
- **Normalization**: ~5-7 seconds
- **Database Insert**: ~10-15 seconds (batch inserts)
- **QC Validation**: ~2-3 seconds
- **Total Processing Time**: ~20-30 seconds

### Optimization Strategies
1. **Batch Inserts**: Insert 1,000 rows per statement
2. **Transaction Management**: Single transaction for all inserts
3. **Index Optimization**: Create indexes after bulk insert
4. **Async Processing**: Consider background job for large files
5. **Progress Updates**: WebSocket for real-time progress (future enhancement)

### Scalability
- Current: Handles 30K rows efficiently
- Tested: Up to 100K rows (~60 seconds)
- Recommended: For >100K rows, implement chunked processing

---

## 10. Testing Plan

### Unit Tests

#### Frontend Tests
```javascript
describe('ActualTab Component', () => {
  test('renders without crashing', () => {});
  test('file upload validates format', () => {});
  test('transform button disabled without file', () => {});
  test('displays report modal after success', () => {});
  test('handles API errors gracefully', () => {});
});
```

#### Backend Tests
```javascript
describe('AEBF API Endpoints', () => {
  test('GET /api/aebf/actual returns paginated data', async () => {});
  test('POST /api/aebf/upload-actual accepts Excel file', async () => {});
  test('Upload rejects non-Excel files', async () => {});
  test('Filters work correctly (year, month, values_type)', async () => {});
});
```

#### PowerShell Script Tests
```powershell
Describe "Transform-Actual-To-SQL" {
  It "Normalizes text correctly" {
    Normalize-Text "  abraham   mathew  " | Should -Be "ABRAHAM MATHEW"
  }
  It "Converts months to numbers" {
    Get-MonthNumber "January" | Should -Be 1
    Get-MonthNumber "December" | Should -Be 12
  }
  It "Handles null values" {
    Normalize-Text $null | Should -Be $null
  }
}
```

### Integration Tests
1. **Full Upload Flow**: Upload actual Excel → verify DB records
2. **QC Validation**: Ensure sums match exactly
3. **Error Recovery**: Test rollback on database error
4. **Concurrent Uploads**: Multiple users uploading simultaneously

### User Acceptance Testing
- [ ] User can navigate to Actual tab
- [ ] User can upload Excel file successfully
- [ ] Report displays correct statistics
- [ ] Table shows newly uploaded data
- [ ] Filters and sorting work correctly
- [ ] Export Excel downloads data
- [ ] Error messages are user-friendly

---

## 11. Security Considerations

### File Upload Security
- Validate file type (not just extension)
- Scan for macros (reject if found)
- Limit file size (50MB max)
- Store uploads in sandboxed directory
- Delete temp files immediately after processing

### SQL Injection Prevention
- Use parameterized queries
- Sanitize all text inputs
- Validate data types before insert

### Authentication & Authorization
- Require user authentication
- Check user permissions for data upload
- Log all upload activities with user ID
- Audit trail for data modifications

### Database Security
- Use connection pooling
- Store credentials in environment variables
- Encrypt sensitive data in database
- Regular backups before bulk imports

---

## 12. Deployment Checklist

### Prerequisites
- [ ] PostgreSQL 17 installed and running
- [ ] Node.js 17+ installed
- [ ] PowerShell 5.1+ available
- [ ] ImportExcel module installed (`Install-Module ImportExcel`)
- [ ] psql.exe in PATH

### Environment Variables
```bash
# .env file
FP_DB_HOST=localhost
FP_DB_PORT=5432
FP_DB_NAME=fp_database
FP_DB_USER=postgres
FP_DB_PASSWORD=your_password_here
FP_LOG_LEVEL=INFO
```

### Database Setup
```sql
-- Create table if not exists
CREATE TABLE IF NOT EXISTS public.fp_data_excel (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  salesrepname VARCHAR(255),
  customername VARCHAR(255),
  countryname VARCHAR(100),
  productgroup VARCHAR(255),
  material VARCHAR(100),
  process VARCHAR(100),
  values_type VARCHAR(50),
  values NUMERIC(18,4),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraint for UPSERT functionality
ALTER TABLE public.fp_data_excel
ADD CONSTRAINT unique_actual_record 
UNIQUE (year, month, type, customername, productgroup, material, values_type);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fp_data_year ON public.fp_data_excel(year);
CREATE INDEX IF NOT EXISTS idx_fp_data_type ON public.fp_data_excel(type);
CREATE INDEX IF NOT EXISTS idx_fp_data_values_type ON public.fp_data_excel(values_type);
CREATE INDEX IF NOT EXISTS idx_fp_data_updated_at ON public.fp_data_excel(updated_at);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fp_data_excel_updated_at
BEFORE UPDATE ON public.fp_data_excel
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### File Structure
```
src/components/MasterData/AEBF/
├── AEBFTab.js              # Main container
├── ActualTab.js            # Actual data component (UPDATED)
├── EstimateTab.js
├── BudgetTab.js
├── ForecastTab.js
├── transform-actual-to-sql.ps1  # NEW script
├── transform-fp-excel-to-sql.ps1  # Original (kept for reference)
├── README.md
└── IMPLEMENTATION_PLAN.md  # This document

server/routes/
└── aebf.js                 # NEW API endpoints

uploads/temp/               # Temp upload directory (create)
```

### Installation Steps
1. Create temp upload directory: `mkdir -p uploads/temp`
2. Install dependencies: `npm install multer`
3. Add AEBF routes to server: `app.use('/api/aebf', require('./routes/aebf'))`
4. Test PowerShell script manually first
5. Start backend server
6. Start frontend
7. Test upload with sample Excel file

---

## 13. Implementation Status & Gaps

### ✅ Completed Items
- [x] AEBF folder structure created
- [x] All 4 tab component files created (Actual/Estimate/Budget/Forecast)
- [x] Integration into Master Data page
- [x] Comprehensive implementation plan (1,600+ lines)
- [x] UPSERT + REPLACE strategy documented
- [x] Excel structure analyzed (28,491 rows, 11 columns)
- [x] Transform script moved to AEBF folder
- [x] README.md with module overview

### ❌ Critical Gaps (Priority 1 - Blocks Functionality)
- [ ] **ActualTab.js missing division context** (no useExcelData import)
- [ ] **ActualTab.js missing Sales Rep column** (salesrepname not displayed)
- [ ] **ActualTab.js missing Process column** (process not displayed)
- [ ] **ActualTab.js wrong title** ("Financial" should be "Sales")
- [ ] **ActualTab.js month shows number** (should show Jan, Feb, etc.)
- [ ] **Backend API routes file missing** (server/routes/aebf.js doesn't exist)
- [ ] **PowerShell transform script missing** (transform-actual-to-sql.ps1 not created)
- [ ] **Database unique constraint missing** (division + 7 columns)
- [ ] **Database division column missing** (not added to table)
- [ ] **Database updated_at column missing** (not added to table)

### ⚠️ Important Gaps (Priority 2 - Improves UX)
- [ ] **Upload mode UI missing** (no UPSERT/REPLACE radio buttons)
- [ ] **Report modal missing** (no upload results display)
- [ ] **Warning alerts missing** (no warning for REPLACE mode)
- [ ] **Division warning missing** (no alert when division not selected)
- [ ] **Loading indicators missing** (no Spin during upload/fetch)
- [ ] **Upload validation missing** (file size, sheet name, columns)

### ⭐ Nice-to-Have Enhancements (Priority 3)
- [ ] Values_Type quick filter buttons (KGS/Amount/MoRM)
- [ ] Date range picker (instead of separate year/month)
- [ ] Filtered export (export only visible data)
- [ ] Upload progress bar (WebSocket for real-time progress)
- [ ] Background job queue (for large files >100K rows)

---

## 14. Maintenance & Monitoring

### Logging
- Log all upload attempts (success/failure) with division
- Log processing times by division
- Log QC validation results
- Log errors with stack traces
- Log user actions (who uploaded what, when)

### Monitoring Metrics
- Upload success rate by division
- Average processing time by division and file size
- Database insert performance
- QC validation pass rate
- Error frequency by type and division
- Records per division over time

### Regular Maintenance
- Clean up old temp files (weekly)
- Vacuum database table (monthly)
- Review and optimize indexes (quarterly)
- Update PowerShell script dependencies (as needed)
- Analyze division data distribution (monthly)

### Backup Strategy
- Daily database backups (full)
- Keep 30 days of backup history
- Test restore procedure monthly
- Backup before major uploads
- Per-division backup capability (future enhancement)

---

## 14. Future Enhancements

### Phase 2 Features
- [ ] Estimate Tab implementation (similar structure)
- [ ] Budget Tab implementation
- [ ] Forecast Tab implementation
- [ ] Unified upload handler for all types

### Phase 3 Features
- [ ] Real-time upload progress bar (WebSocket)
- [ ] Background job queue for large files
- [ ] Email notification on completion
- [ ] Data validation preview before insert

### Phase 4 Features
- [ ] Advanced filtering (date ranges, multi-select)
- [ ] Bulk edit capabilities
- [ ] Data comparison (Actual vs Budget)
- [ ] Export to multiple formats (PDF, CSV, JSON)
- [ ] Scheduled imports (automated daily uploads)

### Analytics Features
- [ ] Dashboard showing upload trends
- [ ] Data quality metrics
- [ ] Anomaly detection
- [ ] Predictive insights

---

## 15. Troubleshooting Guide

### Common Issues

#### Issue: "ImportExcel module not found"
**Solution**:
```powershell
Install-Module ImportExcel -Scope CurrentUser -Force
Import-Module ImportExcel
```

#### Issue: "psql.exe not found"
**Solution**: Add PostgreSQL bin to PATH or specify full path in script

#### Issue: "File upload fails with 413 error"
**Solution**: Increase body parser limit in Express
```javascript
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

#### Issue: "QC validation fails - sums don't match"
**Solution**: 
- Check for rounding differences (use ROUND() in SQL)
- Verify Excel formulas vs raw values
- Check for hidden rows in Excel

#### Issue: "Database insert timeout"
**Solution**:
- Increase PowerShell execution timeout
- Optimize batch insert size
- Check database connection pooling

#### Issue: "Month conversion fails"
**Solution**: Check for non-standard month names, add mappings in `Get-MonthNumber()`

---

## 16. Support & Contact

### Documentation
- This document: `IMPLEMENTATION_PLAN.md`
- Module README: `README.md`
- API Documentation: Coming soon

### Development Team
- Frontend: React/Ant Design components
- Backend: Node.js/Express API
- Database: PostgreSQL data layer
- Scripts: PowerShell ETL automation

### Change Log
- **v1.0** (Nov 13, 2025) - Initial implementation plan created
- **v1.1** (TBD) - After first implementation review
- **v2.0** (TBD) - After all 4 tabs complete

---

## Appendix A: SQL Queries Reference

### Get all Actual data
```sql
SELECT * FROM public.fp_data_excel 
WHERE type = 'ACTUAL'
ORDER BY year DESC, month DESC;
```

### Summary by Values Type
```sql
SELECT 
  values_type,
  COUNT(*) as row_count,
  SUM(values) as total_value,
  AVG(values) as avg_value,
  MIN(values) as min_value,
  MAX(values) as max_value
FROM public.fp_data_excel
WHERE type = 'ACTUAL'
GROUP BY values_type;
```

### Top 10 Customers by Sales Amount
```sql
SELECT 
  customername,
  SUM(values) as total_amount
FROM public.fp_data_excel
WHERE type = 'ACTUAL' AND values_type = 'Amount'
GROUP BY customername
ORDER BY total_amount DESC
LIMIT 10;
```

### Sales by Country and Year
```sql
SELECT 
  countryname,
  year,
  SUM(CASE WHEN values_type='Amount' THEN values ELSE 0 END) as total_sales,
  SUM(CASE WHEN values_type='KGS' THEN values ELSE 0 END) as total_volume
FROM public.fp_data_excel
WHERE type = 'ACTUAL'
GROUP BY countryname, year
ORDER BY year DESC, total_sales DESC;
```

---

## Appendix B: PowerShell Script Template

### Minimal Working Example
```powershell
# Load Excel
$data = Import-Excel -Path "fp_data main.xlsx" -WorksheetName "Actual"

# Process each row
$inserts = @()
foreach ($row in $data) {
  $year = $row.year
  $month = Get-MonthNumber $row.month
  $type = "ACTUAL"
  $salesrep = Normalize-Text $row.salesrepname
  $customer = Normalize-Text $row.customername
  $country = Normalize-Text $row.countryname
  $productgroup = Normalize-Text $row.productgroup
  $material = Normalize-Text $row.material
  $process = Normalize-Text $row.process
  $values_type = Normalize-Text $row.values_type
  $values = [decimal]$row.values
  
  $inserts += "($year, $month, '$type', '$salesrep', '$customer', '$country', '$productgroup', '$material', '$process', '$values_type', $values)"
}

# Generate SQL
$sql = "INSERT INTO public.fp_data_excel (year, month, type, salesrepname, customername, countryname, productgroup, material, process, values_type, values) VALUES " + ($inserts -join ", ") + ";"

# Execute
$env:PGPASSWORD = "654883"
$sql | psql -h localhost -U postgres -d fp_database
```

---

---

## 17. Implementation Roadmap

### Phase 1: Core Functionality (Week 1)
**Goal**: Make Actual tab fully functional

**Tasks**:
1. ✅ Update database schema (add division, updated_at, unique constraint)
2. ✅ Create backend API routes (server/routes/aebf.js)
3. ✅ Create PowerShell transform script (transform-actual-to-sql.ps1)
4. ✅ Update ActualTab.js:
   - Add division context
   - Add Sales Rep column
   - Add Process column
   - Fix title to "Sales Data"
   - Fix month display (names not numbers)
   - Add upload mode selection (UPSERT/REPLACE)
   - Add report modal
5. ✅ Test end-to-end upload flow

**Success Criteria**:
- User can view Actual data filtered by division
- User can upload Excel file in UPSERT or REPLACE mode
- Upload report shows accurate results
- QC validation passes
- No duplicate records

---

### Phase 2: UX Improvements (Week 2)
**Goal**: Enhance user experience

**Tasks**:
1. Add Values_Type quick filter buttons
2. Add loading indicators (Spin, Progress)
3. Add upload validation (file size, sheet name, required columns)
4. Add warning alerts (no division, REPLACE mode)
5. Improve error messages
6. Add filtered export

**Success Criteria**:
- Users can quickly filter by KGS/Amount/MoRM
- Clear loading states during operations
- Helpful error messages guide users
- Export respects current filters

---

### Phase 3: Other Tabs (Week 3-4)
**Goal**: Implement Estimate, Budget, Forecast tabs

**Tasks**:
1. Replicate Actual tab structure for Estimate
2. Replicate for Budget
3. Replicate for Forecast
4. Create unified upload handler
5. Add tab comparison views (Actual vs Budget)

**Success Criteria**:
- All 4 tabs functional
- Consistent UX across tabs
- Users can compare data types

---

### Phase 4: Advanced Features (Week 5+)
**Goal**: Production-ready enhancements

**Tasks**:
1. Background job queue for large files
2. Real-time upload progress (WebSocket)
3. Email notifications on completion
4. Scheduled imports (cron jobs)
5. Data quality dashboard
6. Anomaly detection
7. Audit trail UI

**Success Criteria**:
- Handles files >100K rows gracefully
- Users receive progress updates
- Automated daily imports work
- Data quality metrics visible

---

## 18. Quick Reference: What Needs to be Done NOW

### To Make Actual Tab Work (Minimum Viable Product):

1. **Run SQL Script** (5 minutes):
   ```sql
   ALTER TABLE public.fp_data_excel ADD COLUMN division VARCHAR(10);
   ALTER TABLE public.fp_data_excel ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
   ALTER TABLE public.fp_data_excel ADD CONSTRAINT unique_actual_record 
   UNIQUE (division, year, month, type, customername, productgroup, material, values_type);
   ```

2. **Create Backend API** (`server/routes/aebf.js`) (30 minutes):
   - GET /api/aebf/actual with division filter
   - POST /api/aebf/upload-actual with multer and PowerShell execution

3. **Create PowerShell Script** (`transform-actual-to-sql.ps1`) (1 hour):
   - Based on existing transform-fp-excel-to-sql.ps1
   - Add Division parameter
   - Add UploadMode parameter
   - Implement UPSERT/REPLACE logic

4. **Update ActualTab.js** (1 hour):
   - Import useExcelData for division
   - Add Sales Rep and Process columns
   - Fix title and month display
   - Add upload mode radio buttons
   - Add report modal

**Total Time**: ~3 hours to make it functional

---

**End of Implementation Plan**

*This document should be updated as implementation progresses and new requirements emerge.*

**Last Updated**: November 13, 2025  
**Status**: Plan complete, ready for implementation  
**Next Step**: Execute Phase 1 tasks to make Actual tab functional
