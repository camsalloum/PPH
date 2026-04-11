# AEBF Module - Implementation Plan Enhancements

## Document Information
- **Created**: November 13, 2025
- **Purpose**: Enhancements and missing elements for IMPLEMENTATION_PLAN.md
- **Status**: Recommendations for incorporation into main plan
- **Review Score**: 9.5/10 (Excellent with minor gaps)

---

## Executive Summary

The current implementation plan is **exceptionally comprehensive** and production-ready. This document contains recommended additions to address minor gaps in:
- Database indexing strategy
- Data validation rules
- Error handling details
- Testing strategy
- Security considerations
- Performance optimization
- Rollback procedures

---

## 1. Enhanced Database Schema

### 1.1 Additional Indexes for Performance

```sql
-- Current indexes in README.md:
-- ✅ ix_fp_data_excel_period - (year, month)
-- ✅ ix_fp_data_excel_customer - (customername)

-- RECOMMENDED ADDITIONS:

-- Division-based queries (critical for filtering)
CREATE INDEX ix_fp_data_excel_division 
ON public.fp_data_excel(division);

-- Data type filtering (Actual/Budget/Estimate/Forecast)
CREATE INDEX ix_fp_data_excel_type 
ON public.fp_data_excel(type);

-- Values type filtering (Amount/KGS/MoRM)
CREATE INDEX ix_fp_data_excel_values_type 
ON public.fp_data_excel(values_type);

-- Composite index for common query patterns
CREATE INDEX ix_fp_data_excel_composite 
ON public.fp_data_excel(division, type, year, month);

-- Product group filtering
CREATE INDEX ix_fp_data_excel_productgroup 
ON public.fp_data_excel(productgroup);

-- Country-based reporting
CREATE INDEX ix_fp_data_excel_country 
ON public.fp_data_excel(countryname);

-- Track when records were last updated
CREATE INDEX ix_fp_data_excel_updated_at 
ON public.fp_data_excel(updated_at DESC);
```

### 1.2 Index Usage Justification

| Index | Query Pattern | Frequency | Impact |
|-------|---------------|-----------|---------|
| `division` | `WHERE division = 'FP'` | Every page load | High |
| `type` | `WHERE type = 'ACTUAL'` | Every tab switch | High |
| `composite` | `WHERE division='FP' AND type='ACTUAL' AND year=2025` | Very common | Critical |
| `values_type` | Quick filter buttons (Amount/KGS/MoRM) | User interactions | Medium |
| `updated_at` | Audit trails, recent changes view | Reports | Low |

### 1.3 Source Sheet Column Clarification

**Issue**: README mentions `sourcesheet` column but implementation plan doesn't specify how to populate it.

**Recommended Implementation**:

```powershell
# In PowerShell transform script:

param(
  [Parameter(Mandatory=$true)]
  [string]$ExcelPath,
  
  [Parameter(Mandatory=$true)]
  [string]$SheetName,
  
  [Parameter(Mandatory=$true)]
  [ValidateSet('FP','SB','TF','HCM')]
  [string]$Division
)

# Generate source sheet identifier
$excelFileName = [System.IO.Path]::GetFileName($ExcelPath)
$sourceSheetValue = "${excelFileName} - ${SheetName}"

# Example output: "fp_data_main.xlsx - Actual"
# Example output: "monthly_sales_nov2025.xlsx - Sheet1"

# Use in INSERT statement:
$sql += "INSERT INTO public.fp_data_excel (sourcesheet, division, year, month, ...)
         VALUES ('$sourceSheetValue', '$Division', ...);"
```

**Benefits**:
- ✅ Tracks which file data came from
- ✅ Helps debug data issues
- ✅ Useful for audit trails
- ✅ Can identify duplicate uploads

---

## 2. Data Validation Rules

### 2.1 Business Rules Documentation

Add this section to **Section 7: Data Validation Framework**:

```markdown
### 2.1.1 Field-Level Validation Rules

#### Year
- **Rule**: Must be between 2020 and 2030
- **Rationale**: Prevents typos (e.g., 20255 instead of 2025)
- **Error Message**: "Year must be between 2020 and 2030. Found: {value}"

#### Month
- **Rule**: Must be integer 1-12 OR valid month name
- **Valid Names**: January, February, ..., December (case-insensitive)
- **Error Message**: "Invalid month: {value}. Must be 1-12 or month name."

#### Division
- **Rule**: Must be exactly one of: FP, SB, TF, HCM
- **Case**: Case-insensitive, normalized to uppercase
- **Error Message**: "Invalid division: {value}. Must be FP, SB, TF, or HCM."

#### Type
- **Rule**: Must be one of: ACTUAL, ESTIMATE, BUDGET, FORECAST
- **Case**: Case-insensitive, normalized to uppercase
- **Error Message**: "Invalid type: {value}. Must be ACTUAL, ESTIMATE, BUDGET, or FORECAST."

#### Values_Type
- **Rule**: Must be one of: Amount, KGS, MoRM
- **Case**: Case-insensitive, but preserve original case
- **Error Message**: "Invalid values_type: {value}. Must be Amount, KGS, or MoRM."

#### Values (Numeric)
- **Rule for Amount**: Cannot be negative
- **Rule for KGS**: Cannot be negative
- **Rule for MoRM**: Can be negative (margins can be losses)
- **Precision**: Up to 18 digits, 4 decimal places
- **Error Message**: "Invalid value: {value}. Amount and KGS cannot be negative."

#### Customer Name
- **Rule**: Cannot be NULL or empty string
- **Max Length**: 200 characters
- **Error Message**: "Customer name is required and cannot be empty."

#### Sales Rep Name
- **Rule**: Cannot be NULL or empty string
- **Max Length**: 100 characters
- **Error Message**: "Sales representative name is required."

#### Product Group
- **Rule**: Cannot be NULL
- **Valid Values**: Should match existing product groups in system
- **Error Message**: "Product group is required."

#### Country Name
- **Rule**: Cannot be NULL
- **Valid Values**: Should match ISO country codes or standard names
- **Error Message**: "Country name is required."
```

### 2.2 Pre-Upload Validation Checklist

Add to **ActualTab.js** before calling API:

```javascript
// Frontend validation before upload
const validateExcelStructure = (excelData) => {
  const errors = [];
  
  // Check required columns exist
  const requiredColumns = [
    'year', 'month', 'salesrepname', 'customername', 
    'countryname', 'productgroup', 'material', 
    'process', 'values_type', 'values'
  ];
  
  const firstRow = excelData[0];
  const missingColumns = requiredColumns.filter(col => !(col in firstRow));
  
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
  }
  
  // Check for empty data
  if (excelData.length === 0) {
    errors.push('Excel file contains no data rows.');
  }
  
  // Validate first 10 rows for data types
  excelData.slice(0, 10).forEach((row, idx) => {
    // Year validation
    if (row.year < 2020 || row.year > 2030) {
      errors.push(`Row ${idx + 2}: Invalid year ${row.year}`);
    }
    
    // Month validation
    if (typeof row.month === 'number' && (row.month < 1 || row.month > 12)) {
      errors.push(`Row ${idx + 2}: Invalid month ${row.month}`);
    }
    
    // Customer name validation
    if (!row.customername || row.customername.trim() === '') {
      errors.push(`Row ${idx + 2}: Customer name is empty`);
    }
    
    // Values validation
    if (isNaN(row.values)) {
      errors.push(`Row ${idx + 2}: Values must be numeric, found: ${row.values}`);
    }
  });
  
  return errors;
};

// Usage in handleTransformLoad:
const handleTransformLoad = async () => {
  const excelData = await parseExcelFile(selectedFile);
  const validationErrors = validateExcelStructure(excelData);
  
  if (validationErrors.length > 0) {
    Modal.error({
      title: 'Excel Validation Failed',
      content: (
        <div>
          <p>Please fix the following issues:</p>
          <ul>
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      ),
      width: 600
    });
    return;
  }
  
  // Proceed with upload...
};
```

### 2.3 PowerShell Validation Enhancement

Add to **transform-actual-to-sql.ps1**:

```powershell
function Validate-RowData {
  param($row, $rowIndex)
  
  $errors = @()
  
  # Year validation
  if ($row.year -lt 2020 -or $row.year -gt 2030) {
    $errors += "Row $rowIndex: Invalid year $($row.year)"
  }
  
  # Month validation
  if ($row.month -match '^\d+$') {
    $monthNum = [int]$row.month
    if ($monthNum -lt 1 -or $monthNum -gt 12) {
      $errors += "Row $rowIndex: Invalid month number $monthNum"
    }
  }
  
  # Customer name validation
  if ([string]::IsNullOrWhiteSpace($row.customername)) {
    $errors += "Row $rowIndex: Customer name is empty"
  }
  
  # Values validation
  if ($row.values_type -in @('Amount', 'KGS')) {
    if ([decimal]$row.values -lt 0) {
      $errors += "Row $rowIndex: $($row.values_type) cannot be negative"
    }
  }
  
  return $errors
}

# In main processing loop:
$allErrors = @()
$rowIndex = 2 # Start at 2 (Excel row 1 is header)

foreach ($row in $excelData) {
  $rowErrors = Validate-RowData -row $row -rowIndex $rowIndex
  $allErrors += $rowErrors
  $rowIndex++
}

if ($allErrors.Count -gt 0) {
  Write-Log "VALIDATION FAILED: $($allErrors.Count) errors found" -Level ERROR
  $allErrors | ForEach-Object { Write-Log $_ -Level ERROR }
  
  # Generate validation report
  $validationReport = @{
    success = $false
    errors = $allErrors
    errorCount = $allErrors.Count
  } | ConvertTo-Json
  
  Write-Output $validationReport
  exit 1
}
```

---

## 3. Enhanced Error Handling

### 3.1 PowerShell Transaction Management

Add to **Section 11: Error Handling**:

```powershell
# Complete transaction wrapper for PowerShell script

function Invoke-TransactionSafeUpload {
  param(
    [Parameter(Mandatory=$true)]
    $ExcelData,
    
    [Parameter(Mandatory=$true)]
    [string]$UploadMode,
    
    [Parameter(Mandatory=$true)]
    [string]$Division
  )
  
  $connectionString = "Host=localhost;Database=fp_database;Username=postgres;Password=654883"
  $connection = $null
  $transaction = $null
  
  try {
    # Open connection
    $connection = New-Object Npgsql.NpgsqlConnection($connectionString)
    $connection.Open()
    
    # Begin transaction
    $transaction = $connection.BeginTransaction()
    Write-Log "Transaction started"
    
    # If REPLACE mode, delete existing records
    if ($UploadMode -eq 'replace') {
      $months = $ExcelData | Select-Object -ExpandProperty month -Unique
      $years = $ExcelData | Select-Object -ExpandProperty year -Unique
      
      $deleteCmd = $connection.CreateCommand()
      $deleteCmd.Transaction = $transaction
      $deleteCmd.CommandText = @"
        DELETE FROM public.fp_data_excel
        WHERE division = @division
          AND type = 'ACTUAL'
          AND year = ANY(@years)
          AND month = ANY(@months)
"@
      $deleteCmd.Parameters.AddWithValue("division", $Division)
      $deleteCmd.Parameters.AddWithValue("years", $years)
      $deleteCmd.Parameters.AddWithValue("months", $months)
      
      $deletedCount = $deleteCmd.ExecuteNonQuery()
      Write-Log "REPLACE mode: Deleted $deletedCount existing records"
    }
    
    # Insert/Update records
    $insertCount = 0
    $updateCount = 0
    
    foreach ($row in $ExcelData) {
      $cmd = $connection.CreateCommand()
      $cmd.Transaction = $transaction
      
      if ($UploadMode -eq 'upsert') {
        $cmd.CommandText = @"
          INSERT INTO public.fp_data_excel 
            (sourcesheet, division, year, month, type, salesrepname, customername, 
             countryname, productgroup, material, process, values_type, values)
          VALUES 
            (@sourcesheet, @division, @year, @month, @type, @salesrepname, @customername,
             @countryname, @productgroup, @material, @process, @values_type, @values)
          ON CONFLICT (division, year, month, type, customername, productgroup, material, values_type)
          DO UPDATE SET
            salesrepname = EXCLUDED.salesrepname,
            countryname = EXCLUDED.countryname,
            process = EXCLUDED.process,
            values = EXCLUDED.values,
            sourcesheet = EXCLUDED.sourcesheet,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted
"@
      } else {
        $cmd.CommandText = @"
          INSERT INTO public.fp_data_excel 
            (sourcesheet, division, year, month, type, salesrepname, customername, 
             countryname, productgroup, material, process, values_type, values)
          VALUES 
            (@sourcesheet, @division, @year, @month, @type, @salesrepname, @customername,
             @countryname, @productgroup, @material, @process, @values_type, @values)
"@
      }
      
      # Add parameters
      $cmd.Parameters.AddWithValue("sourcesheet", $row.sourcesheet)
      $cmd.Parameters.AddWithValue("division", $Division)
      $cmd.Parameters.AddWithValue("year", $row.year)
      $cmd.Parameters.AddWithValue("month", $row.month)
      $cmd.Parameters.AddWithValue("type", "ACTUAL")
      $cmd.Parameters.AddWithValue("salesrepname", $row.salesrepname)
      $cmd.Parameters.AddWithValue("customername", $row.customername)
      $cmd.Parameters.AddWithValue("countryname", $row.countryname)
      $cmd.Parameters.AddWithValue("productgroup", $row.productgroup)
      $cmd.Parameters.AddWithValue("material", $row.material)
      $cmd.Parameters.AddWithValue("process", $row.process)
      $cmd.Parameters.AddWithValue("values_type", $row.values_type)
      $cmd.Parameters.AddWithValue("values", $row.values)
      
      $result = $cmd.ExecuteScalar()
      
      if ($UploadMode -eq 'upsert') {
        if ($result) { $insertCount++ } else { $updateCount++ }
      } else {
        $insertCount++
      }
    }
    
    # Commit transaction
    $transaction.Commit()
    Write-Log "Transaction committed successfully"
    
    return @{
      success = $true
      insertCount = $insertCount
      updateCount = $updateCount
      deletedCount = $(if ($UploadMode -eq 'replace') { $deletedCount } else { 0 })
    }
    
  } catch {
    # Rollback on error
    if ($transaction) {
      $transaction.Rollback()
      Write-Log "Transaction rolled back due to error" -Level ERROR
    }
    
    Write-Log "Error during upload: $($_.Exception.Message)" -Level ERROR
    Write-Log "Stack trace: $($_.Exception.StackTrace)" -Level ERROR
    
    return @{
      success = $false
      error = $_.Exception.Message
      stackTrace = $_.Exception.StackTrace
    }
    
  } finally {
    # Cleanup
    if ($transaction) { $transaction.Dispose() }
    if ($connection) { $connection.Close(); $connection.Dispose() }
  }
}
```

### 3.2 File System Error Logging

```powershell
# Add to script initialization:

$logDirectory = "C:\FP_Logs\AEBF_Uploads"
if (-not (Test-Path $logDirectory)) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

$logFileName = "upload_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
$logFilePath = Join-Path $logDirectory $logFileName

function Write-Log {
  param(
    [string]$Message,
    [ValidateSet('INFO','WARNING','ERROR','SUCCESS')]
    [string]$Level = 'INFO'
  )
  
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $logEntry = "[$timestamp] [$Level] $Message"
  
  # Write to console
  switch ($Level) {
    'ERROR'   { Write-Host $logEntry -ForegroundColor Red }
    'WARNING' { Write-Host $logEntry -ForegroundColor Yellow }
    'SUCCESS' { Write-Host $logEntry -ForegroundColor Green }
    default   { Write-Host $logEntry }
  }
  
  # Write to file
  Add-Content -Path $logFilePath -Value $logEntry
}

# Usage:
Write-Log "Starting upload process" -Level INFO
Write-Log "Validation failed for row 42" -Level ERROR
Write-Log "Upload completed successfully" -Level SUCCESS
```

### 3.3 Email Notifications on Critical Errors

```powershell
function Send-ErrorNotification {
  param(
    [string]$ErrorMessage,
    [string]$LogFilePath
  )
  
  $emailParams = @{
    To = "datateam@company.com"
    From = "noreply@company.com"
    Subject = "AEBF Upload Failed - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    Body = @"
An error occurred during AEBF Actual data upload:

Error: $ErrorMessage

Upload Details:
- Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- Division: $Division
- Upload Mode: $UploadMode
- Excel File: $ExcelPath

Log File: $LogFilePath

Please investigate and retry the upload.
"@
    SmtpServer = "smtp.company.com"
  }
  
  try {
    Send-MailMessage @emailParams
    Write-Log "Error notification email sent" -Level INFO
  } catch {
    Write-Log "Failed to send error notification email: $($_.Exception.Message)" -Level WARNING
  }
}

# Call when critical error occurs:
if (-not $uploadResult.success) {
  Send-ErrorNotification -ErrorMessage $uploadResult.error -LogFilePath $logFilePath
}
```

---

## 4. API Security & Rate Limiting

### 4.1 Backend Security Enhancements

Add to **Section 9: Backend API Implementation**:

```javascript
// server/routes/aebf.js

const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');

// Rate limiting for upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 uploads per 15 minutes per IP
  message: {
    success: false,
    error: 'Too many upload requests. Please wait 15 minutes before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/aebf/'); // Ensure this directory exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'aebf-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Authentication middleware (example)
const authenticateUser = (req, res, next) => {
  // Check if user is authenticated (implement your auth logic)
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }
  next();
};

// Authorization middleware for division access
const authorizeDivisionAccess = (req, res, next) => {
  const { division } = req.query || req.body;
  const userDivisions = req.session.userDivisions || []; // User's allowed divisions
  
  if (!division) {
    return res.status(400).json({
      success: false,
      error: 'Division parameter is required'
    });
  }
  
  if (!userDivisions.includes(division)) {
    return res.status(403).json({
      success: false,
      error: `You do not have access to division: ${division}`
    });
  }
  
  next();
};

// Apply middleware to routes
router.get('/api/aebf/actual', 
  authenticateUser, 
  authorizeDivisionAccess, 
  async (req, res) => {
    // ... existing code
  }
);

router.post('/api/aebf/upload-actual',
  authenticateUser,
  authorizeDivisionAccess,
  uploadLimiter,
  upload.single('excelFile'),
  async (req, res) => {
    // ... existing code
  }
);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('AEBF Route Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

module.exports = router;
```

### 4.2 Frontend Security Considerations

```javascript
// ActualTab.js security enhancements

const ActualTab = () => {
  const { selectedDivision, userDivisions } = useExcelData();
  
  // Prevent upload if no division selected
  useEffect(() => {
    if (!selectedDivision) {
      message.warning('Please select a division before uploading data');
    }
  }, [selectedDivision]);
  
  // Check user has access to selected division
  const hasDivisionAccess = useMemo(() => {
    return userDivisions.includes(selectedDivision);
  }, [selectedDivision, userDivisions]);
  
  const handleTransformLoad = async () => {
    // Security checks before upload
    if (!selectedDivision) {
      Modal.error({
        title: 'No Division Selected',
        content: 'Please select a division from the top navigation before uploading data.'
      });
      return;
    }
    
    if (!hasDivisionAccess) {
      Modal.error({
        title: 'Access Denied',
        content: `You do not have permission to upload data for division: ${selectedDivision}`
      });
      return;
    }
    
    if (!selectedFile) {
      message.error('Please select an Excel file first');
      return;
    }
    
    // Proceed with upload...
  };
  
  return (
    <div>
      {!hasDivisionAccess && (
        <Alert
          type="warning"
          showIcon
          message="Limited Access"
          description={`You do not have permission to modify data for division: ${selectedDivision}`}
          style={{ marginBottom: 16 }}
        />
      )}
      
      {/* Rest of component */}
    </div>
  );
};
```

---

## 5. Performance Optimization

### 5.1 Database Query Optimization

Add to **Section 14: Performance Optimization**:

```sql
-- Optimize the main data retrieval query

-- BEFORE (Slow for large datasets):
SELECT * FROM public.fp_data_excel
WHERE division = 'FP' AND type = 'ACTUAL'
ORDER BY year DESC, month DESC;

-- AFTER (Optimized with pagination):
SELECT 
  year,
  month,
  salesrepname,
  customername,
  countryname,
  productgroup,
  material,
  process,
  values_type,
  values,
  updated_at
FROM public.fp_data_excel
WHERE division = @division 
  AND type = @type
ORDER BY year DESC, month DESC, customername ASC
LIMIT @pageSize OFFSET @offset;

-- Add total count query for pagination:
SELECT COUNT(*) as total_count
FROM public.fp_data_excel
WHERE division = @division AND type = @type;
```

### 5.2 Frontend Pagination Strategy

```javascript
// ActualTab.js - Add pagination

import { Table, Pagination } from 'antd';

const ActualTab = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0
  });
  
  const fetchData = async (page = 1, pageSize = 100) => {
    setLoading(true);
    
    try {
      const response = await fetch(
        `/api/aebf/actual?division=${selectedDivision}&page=${page}&pageSize=${pageSize}`
      );
      const result = await response.json();
      
      setData(result.data);
      setPagination({
        current: page,
        pageSize: pageSize,
        total: result.totalCount
      });
    } catch (error) {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTableChange = (newPagination) => {
    fetchData(newPagination.current, newPagination.pageSize);
  };
  
  return (
    <Table
      dataSource={data}
      columns={columns}
      loading={loading}
      pagination={pagination}
      onChange={handleTableChange}
      scroll={{ x: 1500, y: 600 }}
    />
  );
};
```

### 5.3 Backend Pagination Implementation

```javascript
// server/routes/aebf.js

router.get('/api/aebf/actual', async (req, res) => {
  const { division, page = 1, pageSize = 100 } = req.query;
  
  // Validate pagination parameters
  const validatedPage = Math.max(1, parseInt(page));
  const validatedPageSize = Math.min(1000, Math.max(10, parseInt(pageSize)));
  const offset = (validatedPage - 1) * validatedPageSize;
  
  try {
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM public.fp_data_excel WHERE division = $1 AND type = $2',
      [division, 'ACTUAL']
    );
    
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Get paginated data
    const dataResult = await pool.query(
      `SELECT 
         year, month, salesrepname, customername, countryname,
         productgroup, material, process, values_type, values, updated_at
       FROM public.fp_data_excel
       WHERE division = $1 AND type = $2
       ORDER BY year DESC, month DESC, customername ASC
       LIMIT $3 OFFSET $4`,
      [division, 'ACTUAL', validatedPageSize, offset]
    );
    
    res.json({
      success: true,
      data: dataResult.rows,
      totalCount: totalCount,
      page: validatedPage,
      pageSize: validatedPageSize,
      totalPages: Math.ceil(totalCount / validatedPageSize)
    });
    
  } catch (error) {
    console.error('Error fetching actual data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data'
    });
  }
});
```

### 5.4 React Table Virtualization (Alternative to Pagination)

For datasets with 10K+ rows that need to be displayed all at once:

```javascript
// Install: npm install react-window

import { FixedSizeList as List } from 'react-window';

const VirtualizedActualTable = ({ data }) => {
  const Row = ({ index, style }) => {
    const record = data[index];
    
    return (
      <div style={style} className="table-row">
        <div className="table-cell">{record.year}</div>
        <div className="table-cell">{record.month}</div>
        <div className="table-cell">{record.customername}</div>
        <div className="table-cell">{record.values_type}</div>
        <div className="table-cell">{record.values.toLocaleString()}</div>
      </div>
    );
  };
  
  return (
    <List
      height={600}
      itemCount={data.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </List>
  );
};
```

### 5.5 Export Performance Limits

```javascript
// ActualTab.js - Limit export size

const handleExport = async () => {
  const { totalCount } = pagination;
  
  // Warn if dataset is very large
  if (totalCount > 50000) {
    Modal.confirm({
      title: 'Large Dataset Export',
      content: `You are about to export ${totalCount.toLocaleString()} records. This may take several minutes. Continue?`,
      okText: 'Yes, Export',
      cancelText: 'Cancel',
      onOk: async () => {
        await performExport();
      }
    });
  } else if (totalCount > 100000) {
    Modal.error({
      title: 'Export Too Large',
      content: `Cannot export more than 100,000 records at once. Please apply filters to reduce the dataset size.`,
    });
  } else {
    await performExport();
  }
};

const performExport = async () => {
  message.loading('Preparing export...', 0);
  
  try {
    // Fetch all data for export (with server-side filtering)
    const response = await fetch(
      `/api/aebf/actual/export?division=${selectedDivision}&filters=${JSON.stringify(filters)}`
    );
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actual_sales_${selectedDivision}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    
    message.destroy();
    message.success('Export completed');
  } catch (error) {
    message.destroy();
    message.error('Export failed');
  }
};
```

---

## 6. Testing Strategy

### 6.1 Testing Framework

Add new **Section 19: Testing Strategy**:

```markdown
## 19. Testing Strategy

### 19.1 Testing Tools

- **Backend**: Jest + Supertest
- **Frontend**: React Testing Library + Jest
- **E2E**: Cypress or Playwright
- **Load Testing**: Apache JMeter
- **Database**: pgTAP (PostgreSQL Testing Framework)

### 19.2 Unit Tests

#### PowerShell Script Tests

Create `transform-actual-to-sql.Tests.ps1`:

```powershell
Describe "AEBF Transform Script Tests" {
  
  Context "Month Parsing" {
    It "Should convert 'January' to 1" {
      Get-MonthNumber 'January' | Should -Be 1
    }
    
    It "Should convert 'December' to 12" {
      Get-MonthNumber 'December' | Should -Be 12
    }
    
    It "Should handle numeric input" {
      Get-MonthNumber '5' | Should -Be 5
    }
    
    It "Should throw error for invalid month" {
      { Get-MonthNumber 'InvalidMonth' } | Should -Throw
    }
  }
  
  Context "Text Normalization" {
    It "Should trim whitespace" {
      Normalize-Text '  Customer ABC  ' | Should -Be 'Customer ABC'
    }
    
    It "Should handle NULL values" {
      Normalize-Text $null | Should -Be ''
    }
    
    It "Should escape single quotes" {
      Normalize-Text "O'Reilly" | Should -Be "O''Reilly"
    }
  }
  
  Context "Data Validation" {
    It "Should reject negative values for Amount" {
      $row = @{ values_type = 'Amount'; values = -100 }
      $errors = Validate-RowData -row $row -rowIndex 1
      $errors.Count | Should -BeGreaterThan 0
    }
    
    It "Should accept negative values for MoRM" {
      $row = @{ values_type = 'MoRM'; values = -50 }
      $errors = Validate-RowData -row $row -rowIndex 1
      $errors.Count | Should -Be 0
    }
  }
}

# Run tests:
# Invoke-Pester -Path .\transform-actual-to-sql.Tests.ps1
```

#### Backend API Tests

Create `server/routes/aebf.test.js`:

```javascript
const request = require('supertest');
const app = require('../app');
const pool = require('../database/config');

describe('AEBF API Tests', () => {
  
  beforeAll(async () => {
    // Setup test database
    await pool.query('DELETE FROM public.fp_data_excel WHERE division = $1', ['TEST']);
  });
  
  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM public.fp_data_excel WHERE division = $1', ['TEST']);
    await pool.end();
  });
  
  describe('GET /api/aebf/actual', () => {
    
    it('should return 400 if division is missing', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/division/i);
    });
    
    it('should return actual data for valid division', async () => {
      // Insert test data
      await pool.query(`
        INSERT INTO public.fp_data_excel 
        (division, year, month, type, customername, productgroup, material, values_type, values)
        VALUES ('TEST', 2025, 1, 'ACTUAL', 'Test Customer', 'Test Product', 'PE', 'Amount', 1000)
      `);
      
      const response = await request(app)
        .get('/api/aebf/actual')
        .query({ division: 'TEST' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
    
    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/aebf/actual')
        .query({ division: 'TEST', page: 1, pageSize: 10 })
        .expect(200);
      
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(10);
      expect(response.body.totalCount).toBeDefined();
    });
  });
  
  describe('POST /api/aebf/upload-actual', () => {
    
    it('should reject non-Excel files', async () => {
      const response = await request(app)
        .post('/api/aebf/upload-actual')
        .attach('excelFile', Buffer.from('fake data'), 'test.txt')
        .field('division', 'TEST')
        .field('uploadMode', 'upsert')
        .expect(400);
      
      expect(response.body.error).toMatch(/Excel/i);
    });
    
    it('should reject files larger than 50MB', async () => {
      // Create a buffer larger than 50MB
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
      
      const response = await request(app)
        .post('/api/aebf/upload-actual')
        .attach('excelFile', largeBuffer, 'large.xlsx')
        .field('division', 'TEST')
        .expect(400);
      
      expect(response.body.error).toMatch(/too large/i);
    });
  });
});
```

#### Frontend Component Tests

Create `ActualTab.test.js`:

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActualTab from './ActualTab';
import { ExcelDataContext } from '../../contexts/ExcelDataContext';

describe('ActualTab Component', () => {
  
  const mockContextValue = {
    selectedDivision: 'FP',
    userDivisions: ['FP', 'SB']
  };
  
  const renderWithContext = (component) => {
    return render(
      <ExcelDataContext.Provider value={mockContextValue}>
        {component}
      </ExcelDataContext.Provider>
    );
  };
  
  it('should render without crashing', () => {
    renderWithContext(<ActualTab />);
    expect(screen.getByText(/Sales Data/i)).toBeInTheDocument();
  });
  
  it('should display warning when no division is selected', () => {
    const noSelectionContext = { ...mockContextValue, selectedDivision: null };
    
    render(
      <ExcelDataContext.Provider value={noSelectionContext}>
        <ActualTab />
      </ExcelDataContext.Provider>
    );
    
    expect(screen.getByText(/select a division/i)).toBeInTheDocument();
  });
  
  it('should show upload button when file is selected', async () => {
    renderWithContext(<ActualTab />);
    
    const file = new File(['dummy content'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    const input = screen.getByLabelText(/select excel file/i);
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(screen.getByText(/Transform & Load/i)).toBeInTheDocument();
    });
  });
  
  it('should display UPSERT mode as default', () => {
    renderWithContext(<ActualTab />);
    
    const upsertRadio = screen.getByLabelText(/UPSERT/i);
    expect(upsertRadio).toBeChecked();
  });
  
  it('should show warning when REPLACE mode is selected', async () => {
    renderWithContext(<ActualTab />);
    
    const replaceRadio = screen.getByLabelText(/REPLACE/i);
    fireEvent.click(replaceRadio);
    
    await waitFor(() => {
      expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    });
  });
});
```

### 19.3 Integration Tests

Create `integration/aebf-flow.test.js`:

```javascript
describe('AEBF Upload Flow Integration Test', () => {
  
  it('should complete full upload flow: Excel → DB → UI', async () => {
    // Step 1: Prepare test Excel file
    const testExcelPath = './test/fixtures/test_actual_data.xlsx';
    
    // Step 2: Upload via API
    const formData = new FormData();
    formData.append('excelFile', fs.createReadStream(testExcelPath));
    formData.append('division', 'TEST');
    formData.append('uploadMode', 'upsert');
    
    const uploadResponse = await request(app)
      .post('/api/aebf/upload-actual')
      .send(formData)
      .expect(200);
    
    expect(uploadResponse.body.success).toBe(true);
    expect(uploadResponse.body.report.insertCount).toBeGreaterThan(0);
    
    // Step 3: Verify data in database
    const dbResult = await pool.query(
      'SELECT COUNT(*) FROM public.fp_data_excel WHERE division = $1 AND type = $2',
      ['TEST', 'ACTUAL']
    );
    
    expect(parseInt(dbResult.rows[0].count)).toBe(uploadResponse.body.report.insertCount);
    
    // Step 4: Verify data appears in UI via API
    const uiResponse = await request(app)
      .get('/api/aebf/actual')
      .query({ division: 'TEST' })
      .expect(200);
    
    expect(uiResponse.body.data.length).toBeGreaterThan(0);
  });
});
```

### 19.4 Performance Tests

Create `performance/load-test.jmx` (JMeter config):

```markdown
**Load Test Scenarios:**

1. **Concurrent Reads**: 50 users fetching Actual data simultaneously
   - Expected: <2 second response time
   - Success rate: >99%

2. **Large File Upload**: 100MB Excel file (100K rows)
   - Expected: <5 minutes processing time
   - Success rate: 100%

3. **Concurrent Uploads**: 5 users uploading simultaneously
   - Expected: Rate limiting kicks in for excess requests
   - No database corruption

4. **Database Query Performance**:
   - SELECT with filters: <500ms for 1M records
   - INSERT batch (10K rows): <30 seconds
   - UPSERT batch (10K rows): <60 seconds
```

### 19.5 Database Tests (pgTAP)

Create `database/tests/aebf_schema.sql`:

```sql
-- Install pgTAP: https://pgtap.org/

BEGIN;
SELECT plan(10);

-- Test table exists
SELECT has_table('public', 'fp_data_excel', 'Table fp_data_excel should exist');

-- Test columns exist
SELECT has_column('public', 'fp_data_excel', 'division', 'Column division should exist');
SELECT has_column('public', 'fp_data_excel', 'updated_at', 'Column updated_at should exist');

-- Test indexes exist
SELECT has_index('public', 'fp_data_excel', 'ix_fp_data_excel_division', 'Division index should exist');
SELECT has_index('public', 'fp_data_excel', 'ix_fp_data_excel_composite', 'Composite index should exist');

-- Test constraints
SELECT has_pk('public', 'fp_data_excel', 'Table should have primary key');

-- Test unique constraint
SELECT col_is_unique(
  'public', 'fp_data_excel', 
  ARRAY['division', 'year', 'month', 'type', 'customername', 'productgroup', 'material', 'values_type'],
  'Unique constraint should exist'
);

-- Test data types
SELECT col_type_is('public', 'fp_data_excel', 'year', 'integer', 'Year should be integer');
SELECT col_type_is('public', 'fp_data_excel', 'values', 'numeric(18,4)', 'Values should be numeric');

SELECT * FROM finish();
ROLLBACK;
```

Run tests:
```bash
pg_prove -h localhost -U postgres -d fp_database database/tests/aebf_schema.sql
```

### 19.6 Testing Checklist

**Before Each Release:**

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Frontend renders correctly on desktop, tablet, mobile
- [ ] Upload with 100 rows completes successfully
- [ ] Upload with 10K rows completes successfully
- [ ] Upload with 50K rows completes successfully
- [ ] UPSERT mode doesn't create duplicates
- [ ] REPLACE mode deletes old data correctly
- [ ] QC validation catches invalid data
- [ ] Error messages are user-friendly
- [ ] Division filtering works correctly
- [ ] Export functionality works
- [ ] Performance benchmarks met (<2s query, <5min large upload)
- [ ] Security: unauthorized users cannot access other divisions' data
- [ ] Logs are being written correctly
- [ ] Email notifications work (if implemented)
```

---

## 7. Excel Template & Documentation

### 7.1 Excel Template Specification

Add new **Section 20: Excel Template Requirements**:

```markdown
## 20. Excel Template Requirements

### 20.1 Required Columns (Exact Names)

| Column Name | Data Type | Required | Description | Example |
|-------------|-----------|----------|-------------|---------|
| year | Integer | ✅ Yes | 4-digit year (2020-2030) | 2025 |
| month | Text or Integer | ✅ Yes | Month name or 1-12 | January, 1 |
| salesrepname | Text | ✅ Yes | Sales rep full name | John Doe |
| customername | Text | ✅ Yes | Customer company name | ABC Trading LLC |
| countryname | Text | ✅ Yes | Country name | United Arab Emirates |
| productgroup | Text | ✅ Yes | Product category | SHRINK FILM |
| material | Text | ✅ Yes | Material type | PE, PP, PET |
| process | Text | ✅ Yes | Manufacturing process | PRINTED, PLAIN |
| values_type | Text | ✅ Yes | Must be: Amount, KGS, or MoRM | Amount |
| values | Number | ✅ Yes | Numeric value (4 decimals) | 15000.5000 |

### 20.2 Data Format Rules

#### Year
- **Format**: Integer
- **Valid Range**: 2020 to 2030
- **Invalid Examples**: 25, 202, 20255

#### Month
- **Format**: Text (month name) OR Integer (1-12)
- **Valid Examples**: January, Jan, 1, 01
- **Invalid Examples**: Janaury (typo), 13, 0

#### Sales Rep Name
- **Format**: Text
- **Max Length**: 100 characters
- **Cannot be**: Empty, NULL
- **Examples**: John Doe, Sarah Al-Ahmed, 李明

#### Customer Name
- **Format**: Text
- **Max Length**: 200 characters
- **Cannot be**: Empty, NULL
- **Examples**: ABC Trading LLC, XYZ Industries

#### Country Name
- **Format**: Text
- **Max Length**: 100 characters
- **Cannot be**: Empty, NULL
- **Valid Examples**: United Arab Emirates, UAE, Saudi Arabia, KSA

#### Product Group
- **Format**: Text
- **Common Values**: SHRINK FILM, WRAP AROUND LABELS, LIDS, LAMINATES
- **Cannot be**: Empty, NULL

#### Material
- **Format**: Text
- **Common Values**: PE, PP, PET, BOPE, BOPP
- **Cannot be**: Empty, NULL

#### Process
- **Format**: Text
- **Common Values**: PRINTED, PLAIN, LAMINATED
- **Cannot be**: Empty, NULL

#### Values Type
- **Format**: Text (case-insensitive)
- **Valid Values ONLY**: Amount, KGS, MoRM
- **Cannot be**: Any other value, empty, NULL
- **Note**: Will be normalized to standard case

#### Values
- **Format**: Number with up to 4 decimal places
- **Amount**: Cannot be negative (sales can't be negative)
- **KGS**: Cannot be negative (volume can't be negative)
- **MoRM**: Can be negative (margins can be losses)
- **Examples**: 15000.5000, -250.25 (for MoRM only)

### 20.3 Sample Template

Create file: `templates/AEBF_Actual_Template.xlsx`

**Sheet Name**: Actual (or any name, will be specified during upload)

| year | month | salesrepname | customername | countryname | productgroup | material | process | values_type | values |
|------|-------|--------------|--------------|-------------|--------------|----------|---------|-------------|--------|
| 2025 | January | John Doe | ABC Trading LLC | United Arab Emirates | SHRINK FILM | PE | PRINTED | Amount | 15000.5000 |
| 2025 | January | John Doe | ABC Trading LLC | United Arab Emirates | SHRINK FILM | PE | PRINTED | KGS | 1200.0000 |
| 2025 | January | John Doe | ABC Trading LLC | United Arab Emirates | SHRINK FILM | PE | PRINTED | MoRM | 3500.2500 |
| 2025 | February | Sarah Ahmed | XYZ Industries | Saudi Arabia | WRAP AROUND LABELS | PP | PLAIN | Amount | 22000.0000 |

### 20.4 Common Excel Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing required columns" | Column names don't match exactly | Check spelling and case |
| "Invalid month: 13" | Month number out of range | Use 1-12 or month names |
| "Year must be between 2020-2030" | Typo in year | Check for 20255 instead of 2025 |
| "Customer name is empty" | Blank cell in customer column | Fill all rows |
| "Values must be numeric" | Text in values column | Remove currency symbols, letters |
| "Amount cannot be negative" | Negative value for Amount | Check if should be MoRM |
| "Values type must be Amount, KGS, or MoRM" | Typo or invalid value | Use exact values |

### 20.5 Download Template Link

In ActualTab.js, add button to download template:

```javascript
const downloadTemplate = () => {
  const templateUrl = '/templates/AEBF_Actual_Template.xlsx';
  const a = document.createElement('a');
  a.href = templateUrl;
  a.download = 'AEBF_Actual_Template.xlsx';
  a.click();
};

// In JSX:
<Button 
  icon={<DownloadOutlined />} 
  onClick={downloadTemplate}
  style={{ marginBottom: 16 }}
>
  Download Excel Template
</Button>
```
```

---

## 8. Data Archiving Strategy

### 8.1 Archival Policy

Add new **Section 21: Data Archiving & Retention**:

```markdown
## 21. Data Archiving & Retention

### 21.1 Retention Policy

**Active Data** (Recent 3 years):
- Stored in: `public.fp_data_excel`
- Performance: Fully indexed, fast queries
- Access: Real-time via UI

**Archived Data** (Older than 3 years):
- Stored in: `public.fp_data_excel_archive`
- Performance: Slower queries (fewer indexes)
- Access: Via special "Archive View" in UI

**Backup Before REPLACE**:
- Automatic snapshot before any REPLACE operation
- Stored in: `public.fp_data_excel_backup`
- Retention: 30 days

### 21.2 Archive Table Schema

```sql
-- Create archive table (same structure as main table)
CREATE TABLE public.fp_data_excel_archive (
  LIKE public.fp_data_excel INCLUDING ALL
);

-- Add archive metadata
ALTER TABLE public.fp_data_excel_archive 
ADD COLUMN archived_at TIMESTAMP DEFAULT NOW();

-- Minimal indexes for archive table (save space)
CREATE INDEX ix_archive_year ON public.fp_data_excel_archive(year);
CREATE INDEX ix_archive_division ON public.fp_data_excel_archive(division);
```

### 21.3 Automated Archival Script

Create `scripts/archive-old-data.ps1`:

```powershell
# Archive data older than 3 years
# Run monthly via scheduled task

param(
  [int]$YearsToKeep = 3
)

$archiveBeforeYear = (Get-Date).Year - $YearsToKeep

Write-Host "Archiving data older than year: $archiveBeforeYear"

# Connect to database
$env:PGPASSWORD = "654883"

# Step 1: Copy old data to archive table
$copyQuery = @"
INSERT INTO public.fp_data_excel_archive
SELECT *, NOW() as archived_at
FROM public.fp_data_excel
WHERE year < $archiveBeforeYear
  AND id NOT IN (SELECT id FROM public.fp_data_excel_archive WHERE year < $archiveBeforeYear);
"@

Write-Host "Copying old records to archive..."
$copyResult = $copyQuery | psql -h localhost -U postgres -d fp_database -t

# Step 2: Verify copy was successful
$verifyQuery = @"
SELECT 
  (SELECT COUNT(*) FROM public.fp_data_excel WHERE year < $archiveBeforeYear) as active_count,
  (SELECT COUNT(*) FROM public.fp_data_excel_archive WHERE year < $archiveBeforeYear) as archive_count;
"@

$verification = $verifyQuery | psql -h localhost -U postgres -d fp_database -t

if ($verification -match "(\d+).*(\d+)") {
  $activeCount = $matches[1]
  $archiveCount = $matches[2]
  
  if ($activeCount -eq $archiveCount) {
    Write-Host "✅ Verification passed: $activeCount records match in both tables"
    
    # Step 3: Delete from active table
    $deleteQuery = "DELETE FROM public.fp_data_excel WHERE year < $archiveBeforeYear;"
    Write-Host "Deleting old records from active table..."
    $deleteQuery | psql -h localhost -U postgres -d fp_database
    
    Write-Host "✅ Archive complete: $activeCount records archived"
  } else {
    Write-Host "❌ Verification failed: Counts don't match. Archive aborted."
    exit 1
  }
}

# Step 4: Vacuum to reclaim space
Write-Host "Running VACUUM ANALYZE..."
"VACUUM ANALYZE public.fp_data_excel;" | psql -h localhost -U postgres -d fp_database

Write-Host "✅ Archival process complete"
```

### 21.4 Backup Before REPLACE Operations

Enhance PowerShell script:

```powershell
# In transform-actual-to-sql.ps1

if ($UploadMode -eq 'replace') {
  Write-Log "Creating backup before REPLACE operation..."
  
  # Detect months that will be deleted
  $months = $data | Select-Object -ExpandProperty month -Unique
  $years = $data | Select-Object -ExpandProperty year -Unique
  
  # Create backup table if not exists
  $createBackupTable = @"
CREATE TABLE IF NOT EXISTS public.fp_data_excel_backup (
  LIKE public.fp_data_excel INCLUDING ALL,
  backup_timestamp TIMESTAMP DEFAULT NOW(),
  backup_reason TEXT
);
"@
  
  $createBackupTable | psql -h localhost -U postgres -d fp_database
  
  # Backup data that will be deleted
  $backupQuery = @"
INSERT INTO public.fp_data_excel_backup
SELECT *, NOW(), 'REPLACE mode backup before upload'
FROM public.fp_data_excel
WHERE division = '$Division'
  AND type = 'ACTUAL'
  AND year = ANY(ARRAY[$($years -join ',')])
  AND month = ANY(ARRAY[$($months -join ',')]);
"@
  
  $backupResult = $backupQuery | psql -h localhost -U postgres -d fp_database -t
  Write-Log "Backup created: $backupResult records"
  
  # Now safe to delete
  # ... continue with DELETE operation
}
```

### 21.5 Backup Cleanup Job

```powershell
# Delete backups older than 30 days
# Run daily via scheduled task

$retentionDays = 30
$cutoffDate = (Get-Date).AddDays(-$retentionDays).ToString("yyyy-MM-dd")

$cleanupQuery = @"
DELETE FROM public.fp_data_excel_backup
WHERE backup_timestamp < '$cutoffDate';
"@

Write-Host "Cleaning up backups older than $cutoffDate..."
$cleanupQuery | psql -h localhost -U postgres -d fp_database

Write-Host "✅ Backup cleanup complete"
```
```

---

## 9. Frontend State Management

### 9.1 Division Change Handling

Add to **Section 10.2: State Management**:

```javascript
// ActualTab.js - Handle division changes

import { useEffect, useState, useRef } from 'react';
import { Modal } from 'antd';

const ActualTab = () => {
  const { selectedDivision } = useExcelData();
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({});
  const previousDivisionRef = useRef(selectedDivision);
  
  // Detect division change
  useEffect(() => {
    const previousDivision = previousDivisionRef.current;
    
    if (previousDivision && previousDivision !== selectedDivision) {
      // Division changed - confirm with user
      Modal.confirm({
        title: 'Division Changed',
        content: `You changed from ${previousDivision} to ${selectedDivision}. This will reload the data and clear current filters. Continue?`,
        okText: 'Yes, Reload',
        cancelText: 'Cancel',
        onOk: () => {
          // Clear filters
          setFilters({});
          
          // Reload data for new division
          fetchData(selectedDivision);
          
          // Update ref
          previousDivisionRef.current = selectedDivision;
        },
        onCancel: () => {
          // User cancelled - revert division (if possible)
          // Or just keep showing old data with warning
          message.warning('Division not changed. Please reload to see new division data.');
        }
      });
    } else if (!previousDivision && selectedDivision) {
      // Initial load
      fetchData(selectedDivision);
      previousDivisionRef.current = selectedDivision;
    }
  }, [selectedDivision]);
  
  // Prevent upload if division changes during upload
  const handleTransformLoad = async () => {
    if (selectedDivision !== previousDivisionRef.current) {
      Modal.error({
        title: 'Division Mismatch',
        content: 'Division changed during upload preparation. Please start over.'
      });
      return;
    }
    
    // Continue with upload...
  };
  
  return (
    <div>
      {!selectedDivision && (
        <Alert
          type="warning"
          showIcon
          message="No Division Selected"
          description="Please select a division from the top navigation to view data."
          style={{ marginBottom: 16 }}
        />
      )}
      
      {/* Rest of component */}
    </div>
  );
};
```

---

## 10. Pre-Implementation Checklist

Add new **Section 22: Pre-Implementation Checklist**:

```markdown
## 22. Pre-Implementation Checklist

### Before You Start Coding

#### Database Setup
- [ ] Backup current `fp_data_excel` table
- [ ] Run SQL schema updates (division, updated_at, unique constraint)
- [ ] Create additional indexes (division, type, composite)
- [ ] Create archive table
- [ ] Create backup table
- [ ] Verify all indexes created successfully
- [ ] Test database connection from PowerShell

#### Development Environment
- [ ] Install PowerShell ImportExcel module: `Install-Module ImportExcel`
- [ ] Install Node.js dependencies: `npm install multer express-rate-limit`
- [ ] Configure PostgreSQL connection in `.env`
- [ ] Create uploads directory: `mkdir uploads/aebf/`
- [ ] Create logs directory: `mkdir C:\FP_Logs\AEBF_Uploads\`
- [ ] Set up email SMTP configuration (if using notifications)

#### Test Data Preparation
- [ ] Create sample Excel file with 100 test rows
- [ ] Create sample Excel file with 10K test rows
- [ ] Create sample Excel with invalid data (for testing validation)
- [ ] Document division codes in app settings (FP, SB, TF, HCM)
- [ ] Create Excel template file

#### Code Setup
- [ ] Create folder structure: `src/components/MasterData/AEBF/`
- [ ] Copy transform script to project: `scripts/transform-actual-to-sql.ps1`
- [ ] Create backend route file: `server/routes/aebf.js`
- [ ] Update Express app to use new routes
- [ ] Configure multer for file uploads
- [ ] Set up rate limiting middleware

#### Documentation
- [ ] Document API endpoints in Postman or Swagger
- [ ] Create Excel template with instructions
- [ ] Write user guide for upload process
- [ ] Document common error messages and solutions

#### Security
- [ ] Review authentication middleware
- [ ] Implement division access control
- [ ] Set file upload size limits (50MB)
- [ ] Configure rate limiting (5 uploads per 15 min)
- [ ] Ensure SQL injection protection (parameterized queries)

#### Testing
- [ ] Write unit tests for PowerShell functions
- [ ] Write backend API tests
- [ ] Write frontend component tests
- [ ] Prepare integration test scenarios
- [ ] Set up test database

#### Deployment
- [ ] Review staging environment setup
- [ ] Plan production deployment schedule
- [ ] Prepare rollback plan
- [ ] Notify users of upcoming changes
- [ ] Schedule maintenance window (if needed)

### Quick Start Command Checklist

```bash
# Database
psql -h localhost -U postgres -d fp_database -f schema_updates.sql

# PowerShell
Install-Module ImportExcel -Scope CurrentUser -Force
.\transform-actual-to-sql.ps1 -ExcelPath "test.xlsx" -Division "FP" -UploadMode "upsert"

# Backend
npm install multer express-rate-limit
npm test

# Frontend
npm install @ant-design/icons
npm start
```
```

---

## 11. Rollback Plan

Add new **Section 23: Rollback & Recovery**:

```markdown
## 23. Rollback & Recovery Plan

### If Implementation Fails

#### Scenario 1: Database Migration Failed

**Problem**: Schema updates broke database

**Solution**:
```sql
-- Rollback schema changes
DROP CONSTRAINT IF EXISTS unique_actual_record;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS division;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS updated_at;

-- Drop new indexes
DROP INDEX IF EXISTS ix_fp_data_excel_division;
DROP INDEX IF EXISTS ix_fp_data_excel_type;
DROP INDEX IF EXISTS ix_fp_data_excel_composite;

-- Restore from backup (if needed)
-- pg_restore -h localhost -U postgres -d fp_database backup_file.dump
```

#### Scenario 2: Upload Corrupted Data

**Problem**: Bad data uploaded, database integrity compromised

**Solution**:
```sql
-- Option A: Delete recent bad uploads
DELETE FROM public.fp_data_excel
WHERE updated_at > '2025-11-13 10:00:00'  -- Adjust timestamp
  AND division = 'FP'
  AND type = 'ACTUAL';

-- Option B: Restore from backup table
INSERT INTO public.fp_data_excel
SELECT * FROM public.fp_data_excel_backup
WHERE backup_timestamp = (SELECT MAX(backup_timestamp) FROM public.fp_data_excel_backup);

-- Option C: Full restore from daily backup
-- pg_restore -h localhost -U postgres -d fp_database daily_backup.dump
```

#### Scenario 3: Frontend Broken

**Problem**: React component not rendering, blocking users

**Solution**:
```bash
# Revert to previous commit
git log --oneline  # Find last working commit
git revert <commit-hash>

# Or checkout previous version
git checkout <commit-hash> -- src/components/MasterData/AEBF/ActualTab.js

# Redeploy
npm run build
# Deploy build folder
```

#### Scenario 4: API Route Causing 500 Errors

**Problem**: Backend API crashes server

**Solution**:
```javascript
// In server/app.js, comment out the route temporarily
// const aebfRoutes = require('./routes/aebf');
// app.use('/api/aebf', aebfRoutes);

// Restart server
// npm restart
```

#### Scenario 5: PowerShell Script Hangs

**Problem**: Transform script runs indefinitely, locks database

**Solution**:
```sql
-- Find and kill long-running queries
SELECT pid, usename, state, query
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start < NOW() - INTERVAL '5 minutes';

-- Kill specific process
SELECT pg_terminate_backend(12345);  -- Replace with actual PID

-- Kill all connections from postgres user (if desperate)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'postgres'
  AND pid <> pg_backend_pid();
```

### Recovery Checklist

After any failure:

- [ ] Document what went wrong
- [ ] Check database integrity: `SELECT COUNT(*) FROM public.fp_data_excel;`
- [ ] Verify no duplicate records: Check unique constraint violations
- [ ] Test basic queries work
- [ ] Verify frontend loads correctly
- [ ] Check logs for error patterns
- [ ] Notify team of issue and resolution
- [ ] Update documentation with lessons learned

### Emergency Contacts

- **Database Admin**: [Name] - [Email] - [Phone]
- **Backend Developer**: [Name] - [Email] - [Phone]
- **Frontend Developer**: [Name] - [Email] - [Phone]
- **DevOps**: [Name] - [Email] - [Phone]

### Backup Schedule

- **Database Dump**: Daily at 2:00 AM
- **Backup Location**: `/backups/fp_database/`
- **Retention**: 30 days
- **Backup Before Deploy**: Always create manual backup before major changes
```

---

## 12. Summary of Enhancements

### Critical Additions
1. ✅ **Database indexes** for performance (division, type, composite)
2. ✅ **Source sheet tracking** implementation details
3. ✅ **Comprehensive validation rules** with examples
4. ✅ **Transaction management** in PowerShell
5. ✅ **API security** (rate limiting, authentication, authorization)
6. ✅ **Pagination strategy** for large datasets
7. ✅ **Complete testing framework** (unit, integration, E2E, performance)
8. ✅ **Excel template** specification and download
9. ✅ **Data archiving policy** with automated scripts
10. ✅ **Division change handling** in frontend
11. ✅ **Pre-implementation checklist**
12. ✅ **Rollback and recovery procedures**

### Implementation Priority

**High Priority (Must Have)**:
- Database indexes
- Validation rules
- Transaction management
- API security
- Testing framework

**Medium Priority (Should Have)**:
- Pagination
- Excel template
- Archive strategy
- Division change handling

**Low Priority (Nice to Have)**:
- Performance tests
- Email notifications
- Real-time progress (Phase 4)

---

## Next Steps

1. **Review this document** with the development team
2. **Incorporate additions** into main IMPLEMENTATION_PLAN.md
3. **Update README.md** with new database schema details
4. **Create Excel template** and make it downloadable
5. **Run pre-implementation checklist**
6. **Begin Phase 1 implementation**

---

**Document Status**: Ready for Integration  
**Review Score**: 9.5/10 → 10/10 (after incorporating enhancements)  
**Estimated Implementation Time**: +2 hours for enhancements (total 5 hours for MVP)

---

**End of Enhancement Document**
