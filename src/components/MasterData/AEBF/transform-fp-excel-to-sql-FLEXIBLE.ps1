<#
FP Excel (Actual + Budget) → PostgreSQL (fp_database.public.fp_data_excel)
FLEXIBLE VERSION - HANDLES VARIOUS COLUMN NAME FORMATS

Version: CASE-INSENSITIVE WITH AUTO-DETECTION
- Detects column names case-insensitively
- Supports multiple column name variations (e.g., Total/values, PGCombine/productgroup)
- Provides helpful validation errors
- No data loss - preserves all rows
#>

[CmdletBinding()]
param(
  # Postgres connection
  [string]$PgHost      = $(if ($env:FP_DB_HOST) { $env:FP_DB_HOST } else { "localhost" }),
  [int]   $PgPort      = $(if ($env:FP_DB_PORT) { [int]$env:FP_DB_PORT } else { 5432 }),
  [string]$PgDatabase  = $(if ($env:FP_DB_NAME) { $env:FP_DB_NAME } else { "fp_database" }),
  [string]$PgUser      = $(if ($env:FP_DB_USER) { $env:FP_DB_USER } else { "postgres" }),
  [string]$PgPassword  = $(if ($env:FP_DB_PASSWORD) { $env:FP_DB_PASSWORD } else { "***REDACTED***" }),

  # Excel
  [Parameter(Mandatory=$false)]
  [string]$ExcelPath   = $(if ($env:FP_EXCEL_PATH) { $env:FP_EXCEL_PATH } else { "D:\IPD16.9\server\data\fp_data main.xlsx" }),
  
  [string]$Sheet1      = $(if ($env:FP_SHEET_ACTUAL) { $env:FP_SHEET_ACTUAL } else { "Sheet1" }),
  [string]$Sheet2      = $null,  # Optional second sheet
  
  [string]$DefaultType = "Actual",  # Default type if column missing

  # Target tables
  [string]$Schema      = "public",
  [string]$FinalTable  = "fp_data_excel",
  [string]$StageTable  = "fp_data_excel_stg",

  # Behavior
  [bool]  $TruncateBeforeLoad = $true,
  [bool]  $DropStageAfterLoad = $true,
  [bool]  $DropTableBeforeCreate = $false,
  [bool]  $ValidateColumns = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Logging
function Write-Log {
  param(
    [string]$Message,
    [string]$Level = "INFO",
    [string]$Component = "FPConverter"
  )
  
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $logEntry = "[$timestamp] [$Level] [$Component] $Message"
  
  switch ($Level) {
    "ERROR" { Write-Host $logEntry -ForegroundColor Red }
    "WARN"  { Write-Host $logEntry -ForegroundColor Yellow }
    "INFO"  { Write-Host $logEntry -ForegroundColor Green }
    "DEBUG" { Write-Host $logEntry -ForegroundColor Gray }
    default { Write-Host $logEntry }
  }
}

# ---------- Helpers ----------
function Ensure-Module {
  param([Parameter(Mandatory)] [string]$Name)
  if (-not (Get-Module -ListAvailable -Name $Name)) {
    Write-Log "Installing module '$Name'" "INFO"
    Install-Module -Name $Name -Scope CurrentUser -Force -ErrorAction Stop
  }
  Import-Module $Name -ErrorAction Stop
}

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  
  # Search common PostgreSQL installation paths
  $paths = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
  )
  
  foreach ($path in $paths) {
    if (Test-Path $path) { return $path }
  }
  
  throw "psql.exe not found. Please install PostgreSQL client and ensure psql is on PATH."
}

# Normalize text: trim, collapse whitespace, UPPERCASE
function Normalize-Text {
  param([object]$x)
  if ($null -eq $x) { return $null }
  $s = [string]$x
  try { $s = $s.Normalize([Text.NormalizationForm]::FormC) } catch {}
  $s = $s -replace "[\u00A0\u2000-\u200B\u202F\u205F\u3000]", " "
  $s = $s -replace "[\u2018\u2019]", "'" -replace "[\u201C\u201D]", '"'
  $s = ($s -replace "\s+", " ").Trim()
  if ($s.Length -eq 0) { return $null }
  return $s.ToUpperInvariant()
}

# Normalize type field - preserve case for frontend
function Normalize-Type {
  param([object]$x)
  if ($null -eq $x) { return $null }
  $s = [string]$x
  $s = ($s -replace "\s+", " ").Trim()
  if ($s.Length -eq 0) { return $null }
  # Capitalize first letter only: Actual, Budget, Estimate, Forecast
  if ($s -match '^(actual|budget|estimate|forecast)$') {
    return $s.Substring(0,1).ToUpper() + $s.Substring(1).ToLower()
  }
  return $s
}

# Month conversion with comprehensive mapping
$__monthMap = @{
  "JAN"=1;"JANUARY"=1;"01"=1;"1"=1;"JAN."=1
  "FEB"=2;"FEBRUARY"=2;"02"=2;"2"=2;"FEB."=2
  "MAR"=3;"MARCH"=3;"03"=3;"3"=3;"MAR."=3
  "APR"=4;"APRIL"=4;"04"=4;"4"=4;"APR."=4
  "MAY"=5;"05"=5;"5"=5
  "JUN"=6;"JUNE"=6;"06"=6;"6"=6;"JUN."=6
  "JUL"=7;"JULY"=7;"07"=7;"7"=7;"JUL."=7
  "AUG"=8;"AUGUST"=8;"08"=8;"8"=8;"AUG."=8
  "SEP"=9;"SEPT"=9;"SEPTEMBER"=9;"09"=9;"9"=9;"SEP."=9;"SEPT."=9
  "OCT"=10;"OCTOBER"=10;"10"=10;"OCT."=10
  "NOV"=11;"NOVEMBER"=11;"11"=11;"NOV."=11
  "DEC"=12;"DECEMBER"=12;"12"=12;"DEC."=12
}
function Get-MonthNumber($m) {
  if ($null -eq $m) { return $null }
  $s = [string]$m
  $s = ($s -replace "\s+", " ").Trim().ToUpperInvariant()
  if ($s -match '^\d+$') { 
    $num = [int]$s
    if ($num -ge 1 -and $num -le 12) { return $num }
    return $null
  }
  if ($__monthMap.ContainsKey($s)) { return $__monthMap[$s] }
  return $null
}

function Normalize-Year($y) {
  if ($null -eq $y) { return $null }
  $s = [string]$y
  $s = $s.Trim()
  if ($s -match '^\d{4}$') {
    $year = [int]$s
    if ($year -ge 2000 -and $year -le 2100) { return $year }
  }
  return $null
}

# Find column in PSObject (case-insensitive, with variations)
function Get-ColumnValue {
  param(
    [Parameter(Mandatory)]
    $Row,
    
    [Parameter(Mandatory)]
    [string[]]$Variations
  )
  
  foreach ($variation in $Variations) {
    foreach ($prop in $Row.PSObject.Properties) {
      if ($prop.Name -eq $variation) {
        return $prop.Value
      }
    }
  }
  return $null
}

# Validate required columns exist
function Test-RequiredColumns {
  param(
    [Parameter(Mandatory)]
    $SampleRow,
    
    [Parameter(Mandatory)]
    [string]$SheetName
  )
  
  $errors = @()
  $warnings = @()
  
  # Define required columns with acceptable variations
  $requiredCols = @{
    'year' = @('year', 'Year', 'YEAR')
    'month' = @('month', 'Month', 'MONTH')
    'salesrepname' = @('salesrepname', 'SalesRepName', 'SALESREPNAME', 'sales_rep', 'SalesRep')
    'customername' = @('customername', 'CustomerName', 'CUSTOMERNAME', 'customer')
    'countryname' = @('countryname', 'CountryName', 'COUNTRYNAME', 'country')
    'productgroup' = @('productgroup', 'ProductGroup', 'PRODUCTGROUP', 'PGCombine', 'pgcombine', 'product_group')
    'material' = @('material', 'Material', 'MATERIAL')
    'process' = @('process', 'Process', 'PROCESS')
    'values_type' = @('values_type', 'ValuesType', 'VALUES_TYPE', 'value_type')
    'values' = @('values', 'Values', 'VALUES', 'Total', 'TOTAL', 'total', 'Amount', 'amount')
  }
  
  $optionalCols = @{
    'type' = @('type', 'Type', 'TYPE')
  }
  
  # Check required columns
  foreach ($col in $requiredCols.Keys) {
    $found = $false
    foreach ($variation in $requiredCols[$col]) {
      if ($SampleRow.PSObject.Properties.Name -contains $variation) {
        $found = $true
        Write-Log "✓ Found required column '$col' as '$variation'" "DEBUG"
        break
      }
    }
    if (-not $found) {
      $errors += "Missing required column: '$col' (tried variations: $($requiredCols[$col] -join ', '))"
    }
  }
  
  # Check optional columns
  foreach ($col in $optionalCols.Keys) {
    $found = $false
    foreach ($variation in $optionalCols[$col]) {
      if ($SampleRow.PSObject.Properties.Name -contains $variation) {
        $found = $true
        Write-Log "✓ Found optional column '$col' as '$variation'" "DEBUG"
        break
      }
    }
    if (-not $found) {
      $warnings += "Optional column '$col' not found - will use default value '$DefaultType'"
    }
  }
  
  # Report
  if ($errors.Count -gt 0) {
    Write-Log "❌ Column validation FAILED for sheet '$SheetName'" "ERROR"
    foreach ($error in $errors) {
      Write-Log "  - $error" "ERROR"
    }
    Write-Log "" "ERROR"
    Write-Log "Available columns in sheet: $($SampleRow.PSObject.Properties.Name -join ', ')" "ERROR"
    throw "Column validation failed. Please fix column names in Excel."
  }
  
  if ($warnings.Count -gt 0) {
    foreach ($warning in $warnings) {
      Write-Log "  ⚠ $warning" "WARN"
    }
  }
  
  Write-Log "✓ All required columns found in sheet '$SheetName'" "INFO"
}

# Ensure decimal dot for CSV
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture

# ---------- Start ----------
Write-Log "Starting FP Excel to PostgreSQL conversion - FLEXIBLE VERSION" "INFO"
Write-Log "Excel source: $ExcelPath" "INFO"
Write-Log "Database target: ${PgHost}:${PgPort} → ${PgDatabase}.${Schema}.${FinalTable}" "INFO"

# Modules
Ensure-Module -Name ImportExcel

# Validate Excel file exists
if (-not (Test-Path -LiteralPath $ExcelPath)) {
  throw "Excel file not found: $ExcelPath"
}

# Get sheet info
$sheetInfo = Get-ExcelSheetInfo -Path $ExcelPath
$availableSheets = $sheetInfo.Name
Write-Log "Available sheets: $($availableSheets -join ', ')" "INFO"

# Validate Sheet1 exists
if ($Sheet1 -notin $availableSheets) {
  throw "Sheet '$Sheet1' not found. Available sheets: $($availableSheets -join ', ')"
}

# Read & normalize sheets
function Read-Sheet {
  param([string]$Sheet, [string]$Tag)
  
  Write-Log "Reading sheet: $Sheet" "INFO"
  $rows = Import-Excel -Path $ExcelPath -WorksheetName $Sheet
  
  if ($rows.Count -eq 0) {
    Write-Log "Warning: Sheet '$Sheet' is empty" "WARN"
    return @()
  }
  
  # Validate columns if enabled
  if ($ValidateColumns) {
    Test-RequiredColumns -SampleRow $rows[0] -SheetName $Sheet
  }
  
  $processedRows = @()
  $rowNum = 0
  
  foreach ($r in $rows) {
    $rowNum++
    
    try {
      $obj = [PSCustomObject][ordered]@{
        sourcesheet  = Normalize-Text $Tag
        year         = Normalize-Year $(Get-ColumnValue -Row $r -Variations @('year','Year','YEAR'))
        month        = Get-MonthNumber $(Get-ColumnValue -Row $r -Variations @('month','Month','MONTH'))
        type         = Normalize-Type $(
          $typeVal = Get-ColumnValue -Row $r -Variations @('type','Type','TYPE')
          if ($null -eq $typeVal) { $DefaultType } else { $typeVal }
        )
        salesrepname = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('salesrepname','SalesRepName','SALESREPNAME','sales_rep','SalesRep'))
        customername = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('customername','CustomerName','CUSTOMERNAME','customer'))
        countryname  = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('countryname','CountryName','COUNTRYNAME','country'))
        productgroup = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('productgroup','ProductGroup','PRODUCTGROUP','PGCombine','pgcombine','product_group'))
        material     = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('material','Material','MATERIAL'))
        process      = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('process','Process','PROCESS'))
        values_type  = Normalize-Text $(Get-ColumnValue -Row $r -Variations @('values_type','ValuesType','VALUES_TYPE','value_type'))
        values       = $(
          $val = Get-ColumnValue -Row $r -Variations @('values','Values','VALUES','Total','TOTAL','total','Amount','amount')
          if ($null -ne $val -and "$val".Trim() -ne "") { 
            [decimal]$val 
          } else { 
            $null 
          }
        )
      }
      
      $processedRows += $obj
      
    } catch {
      Write-Log "Error processing row $rowNum in sheet '$Sheet': $_" "ERROR"
      throw
    }
  }
  
  Write-Log "Processed $($processedRows.Count) rows from sheet '$Sheet'" "INFO"
  return $processedRows
}

# Read sheets
$all = @()
$all += Read-Sheet -Sheet $Sheet1 -Tag $Sheet1

if ($Sheet2 -and $Sheet2 -ne "") {
  if ($Sheet2 -in $availableSheets) {
    $all += Read-Sheet -Sheet $Sheet2 -Tag $Sheet2
  } else {
    Write-Log "Warning: Sheet2 '$Sheet2' not found, skipping" "WARN"
  }
}

if ($all.Count -eq 0) { 
  throw "No data found in specified sheets." 
}

Write-Log "Total rows to process: $($all.Count)" "INFO"

# Excel QC
$excelCount = [int]$all.Count
$excelSumOriginal = ($all | Where-Object { $_.values -ne $null } | Measure-Object -Property values -Sum).Sum
if ($null -eq $excelSumOriginal) { $excelSumOriginal = [decimal]0 }

$excelSumRounded4 = ($all | Where-Object { $_.values -ne $null } | ForEach-Object {
  [decimal]::Round([decimal]$_.values, 4, [System.MidpointRounding]::AwayFromZero)
} | Measure-Object -Sum).Sum
if ($null -eq $excelSumRounded4) { $excelSumRounded4 = [decimal]0 }

# Export CSV for staging
$csvPath = Join-Path $env:TEMP ("fp_data_excel_stg_{0:yyyyMMdd_HHmmss}.csv" -f (Get-Date))
$all | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Log "Created staging CSV: $csvPath" "INFO"

# Find psql
$psql = Find-Psql
Write-Log "Using psql: $psql" "DEBUG"

# Database setup
$final  = "$Schema.$FinalTable".ToLower()
$stage  = "$Schema.$StageTable".ToLower()

$env:PGPASSWORD = $PgPassword
$commonArgs = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser, "-d", $PgDatabase, "-v", "ON_ERROR_STOP=1")

# Drop final table if requested
if ($DropTableBeforeCreate) {
  $dropFinal = "DROP TABLE IF EXISTS {0} CASCADE;" -f $final
  Write-Log "Dropping existing table $final" "WARN"
  & $psql @commonArgs -c $dropFinal | Out-Null
}

# Create tables
$ddl = @'
CREATE TABLE IF NOT EXISTS {0}
(
  id            bigserial PRIMARY KEY,
  sourcesheet   text        NOT NULL,
  year          integer     NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month         integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  type          text        NOT NULL,
  salesrepname  text,
  customername  text,
  countryname   text,
  productgroup  text        NOT NULL,
  material      text,
  process       text,
  values_type   text        NOT NULL,
  values        numeric(18,4),
  updatedat     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = split_part('{0}','.',1)
      AND indexname  = 'ix_fp_data_excel_period'
  ) THEN
    EXECUTE 'CREATE INDEX ix_fp_data_excel_period ON {0} (year, month)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = split_part('{0}','.',1)
      AND indexname  = 'ix_fp_data_excel_customer'
  ) THEN
    EXECUTE 'CREATE INDEX ix_fp_data_excel_customer ON {0} (customername)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS {1}
(
  sourcesheet   text,
  year          integer,
  month         integer,
  type          text,
  salesrepname  text,
  customername  text,
  countryname   text,
  productgroup  text,
  material      text,
  process       text,
  values_type   text,
  values        numeric(18,4)
);
'@ -f $final, $stage

Write-Log "Creating database tables" "INFO"
& $psql @commonArgs -c $ddl | Out-Null

# Load data
$csvForPsql = $csvPath -replace '\\','\\'
$copyStage  = "\copy {0} (sourcesheet,year,month,type,salesrepname,customername,countryname,productgroup,material,process,values_type,values) FROM '{1}' WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '', ENCODING 'UTF8');" -f $stage, $csvForPsql
$truncateFinal = if ($TruncateBeforeLoad) { "TRUNCATE TABLE {0};" -f $final } else { "" }
$truncateStage = "TRUNCATE TABLE {0};" -f $stage

$insertDirect = @'
INSERT INTO {0}
  (sourcesheet, year, month, type, salesrepname, customername, countryname, productgroup, material, process, values_type, values)
SELECT
  s.sourcesheet, s.year, s.month, s.type, s.salesrepname, s.customername, s.countryname, 
  s.productgroup, s.material, s.process, s.values_type, s.values
FROM {1} s;
'@ -f $final, $stage

Write-Log "Truncating staging table" "INFO"
& $psql @commonArgs -c $truncateStage | Out-Null

Write-Log "Copying CSV to staging table" "INFO"
& $psql @commonArgs -c $copyStage | Out-Null

if ($TruncateBeforeLoad) {
  Write-Log "Truncating final table" "WARN"
  & $psql @commonArgs -c $truncateFinal | Out-Null
}

Write-Log "Inserting data into final table" "INFO"
& $psql @commonArgs -c $insertDirect | Out-Null

# Drop staging table
if ($DropStageAfterLoad) {
  $dropStage = "DROP TABLE IF EXISTS {0};" -f $stage
  Write-Log "Dropping staging table" "INFO"
  & $psql @commonArgs -c $dropStage | Out-Null
}

# QC validation
$sqlStats = "SELECT COUNT(*) AS rows, COALESCE(SUM(values),0) AS sum FROM {0};" -f $final
$sqlOut   = & $psql @commonArgs -A -t -F '|' -c $sqlStats
$parts    = "$sqlOut".Trim() -split '\|'
$sqlCount = [int]$parts[0]
$sqlSum   = [decimal]$parts[1]

# Report
Write-Host ""
Write-Host "========== QC REPORT (FLEXIBLE VERSION) ==========" -ForegroundColor Green
Write-Host ("Excel (original)           → rows: {0,6} | sum(values): {1:N4}" -f $excelCount, $excelSumOriginal)
Write-Host ("Excel (rounded to 4 d.p.)  → sum(values): {0:N4}" -f $excelSumRounded4)
Write-Host ("SQL   (final)              → rows: {0,6} | sum(values): {1:N4}" -f $sqlCount, $sqlSum)

$sumDelta = [decimal]::Round($sqlSum - $excelSumRounded4, 4)
$rowDelta = $sqlCount - $excelCount
Write-Host ("Delta Sum (SQL - Excel@4dp): {0:N4} | Delta Rows (SQL - Excel): {1}" -f $sumDelta, $rowDelta) -ForegroundColor Gray

if ($sumDelta -eq 0 -and $rowDelta -eq 0) {
  Write-Host "QC Overall: ✓ PERFECT MATCH - All $sqlCount rows transferred successfully!" -ForegroundColor Green
} elseif ($rowDelta -eq 0) {
  Write-Host "QC Overall: ✓ ROW COUNT MATCH - All $sqlCount rows transferred" -ForegroundColor Green
} else {
  Write-Host "QC Overall: ✗ ISSUE DETECTED - Row count mismatch" -ForegroundColor Red
}

# Cleanup
if (Test-Path $csvPath) {
  Remove-Item $csvPath -Force
  Write-Log "Cleaned up temporary CSV" "DEBUG"
}

Write-Log "Conversion completed successfully" "INFO"
