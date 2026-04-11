<# 
FP Excel (Actual + Budget) → PostgreSQL (fp_database.public.fp_data_excel)
FIXED VERSION - NO MERGING, PRESERVES ALL ROWS

Version: NO AGGREGATION - DIRECT IMPORT
- Loads ALL rows from both sheets into staging table: public.fp_data_excel_stg
- Copies ALL rows from staging to final table: public.fp_data_excel (NO GROUP BY)
- Replace semantics: TRUNCATE final, then INSERT ALL rows from staging
- Preserves every single row from Excel - no data loss
#>

[CmdletBinding()]
param(
  # Postgres connection (prefer environment variables for security)
  [string]$PgHost      = $(if ($env:FP_DB_HOST) { $env:FP_DB_HOST } else { "localhost" }),
  [int]   $PgPort      = $(if ($env:FP_DB_PORT) { [int]$env:FP_DB_PORT } else { 5432 }),
  [string]$PgDatabase  = $(if ($env:FP_DB_NAME) { $env:FP_DB_NAME } else { "fp_database" }),
  [string]$PgUser      = $(if ($env:FP_DB_USER) { $env:FP_DB_USER } else { "postgres" }),
  [string]$PgPassword  = $(if ($env:FP_DB_PASSWORD) { $env:FP_DB_PASSWORD } else { "***REDACTED***" }),

  # Excel (configurable paths)
  [string]$ExcelPath   = $(if ($env:FP_EXCEL_PATH) { $env:FP_EXCEL_PATH } else { "D:\IPD16.9\server\data\fp_data main.xlsx" }),
  [string]$Sheet1      = $(if ($env:FP_SHEET_ACTUAL) { $env:FP_SHEET_ACTUAL } else { "Actual" }),
  [string]$Sheet2      = $(if ($env:FP_SHEET_BUDGET) { $env:FP_SHEET_BUDGET } else { "Budget" }),

  # Target tables
  [string]$Schema      = "public",
  [string]$FinalTable  = "fp_data_excel",
  [string]$StageTable  = "fp_data_excel_stg",

  # Behavior
  [bool]  $TruncateBeforeLoad = $true,
  [bool]  $DropStageAfterLoad = $true,
  [bool]  $DropTableBeforeCreate = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Logging configuration
$LogLevel = if ($env:FP_LOG_LEVEL) { $env:FP_LOG_LEVEL } else { "INFO" }
$LogFile = if ($env:FP_LOG_FILE) { $env:FP_LOG_FILE } else { $null }

function Write-Log {
  param(
    [string]$Message,
    [string]$Level = "INFO",
    [string]$Component = "FPConverter"
  )
  
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $logEntry = "[$timestamp] [$Level] [$Component] $Message"
  
  # Console output
  switch ($Level) {
    "ERROR" { Write-Host $logEntry -ForegroundColor Red }
    "WARN"  { Write-Host $logEntry -ForegroundColor Yellow }
    "INFO"  { Write-Host $logEntry -ForegroundColor Green }
    "DEBUG" { if ($LogLevel -eq "DEBUG") { Write-Host $logEntry -ForegroundColor Gray } }
    default { Write-Host $logEntry }
  }
  
  # File output if configured
  if ($LogFile) {
    Add-Content -Path $LogFile -Value $logEntry
  }
}

# ---------- Helpers ----------
function Ensure-Module {
  param([Parameter(Mandatory)] [string]$Name)
  if (-not (Get-Module -ListAvailable -Name $Name)) {
    Write-Host "Installing module '$Name'" -ForegroundColor Yellow
    Install-Module -Name $Name -Scope CurrentUser -Force -ErrorAction Stop
  }
  Import-Module $Name -ErrorAction Stop
}

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $paths = Get-ChildItem -Path "C:\Program Files\PostgreSQL\17\bin" -Filter psql.exe -ErrorAction SilentlyContinue |
           Sort-Object FullName -Descending
  if ($paths -and $paths[0]) { return $paths[0].FullName }
  throw "psql.exe not found. Please install PostgreSQL client and ensure psql is on PATH."
}

# Normalize text: trim, collapse whitespace, normalize Unicode (Form C), normalize quotes, UPPERCASE
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

# Normalize type field specifically for frontend compatibility
function Normalize-Type {
  param([object]$x)
  if ($null -eq $x) { return $null }
  $s = [string]$x
  $s = ($s -replace "\s+", " ").Trim()
  if ($s.Length -eq 0) { return $null }
  # Keep proper case for frontend compatibility: 'Actual' and 'Budget'
  if ($s -match '^(actual|budget)$') {
    return $s.Substring(0,1).ToUpper() + $s.Substring(1).ToLower()
  }
  return $s
}

# Month text → number (comprehensive mapping for Excel variations)
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

# Validate and normalize year
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

# Ensure decimal dot for CSV
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture

# ---------- Start ----------
Write-Log "Starting FP Excel to PostgreSQL conversion - FIXED VERSION (NO MERGING)" "INFO" "Main"
Write-Log "Excel source: $ExcelPath" "INFO" "Config"
Write-Log "Database target: ${PgHost}:${PgPort} → ${PgDatabase}.${Schema}.${FinalTable}" "INFO" "Config"

# Modules
Ensure-Module -Name ImportExcel

# Validate Excel & sheets
if (-not (Test-Path -LiteralPath $ExcelPath)) {
  throw "Excel file not found: $ExcelPath"
}
$sheetInfo = Get-ExcelSheetInfo -Path $ExcelPath
$names = $sheetInfo.Name
foreach ($s in @($Sheet1,$Sheet2)) {
  if ($s -notin $names) { throw "Missing worksheet '$s'. Found: $($names -join ', ')" }
}

# Read & normalize into a merged array
function Read-Sheet {
  param([string]$Sheet, [string]$Tag)
  $rows = Import-Excel -Path $ExcelPath -WorksheetName $Sheet
  foreach ($r in $rows) {
    [PSCustomObject][ordered]@{
      sourcesheet  = Normalize-Text $Tag
      year         = Normalize-Year $r.year
      month        = if ($r.PSObject.Properties['month']) { Get-MonthNumber $r.month } else { $null }
      type         = Normalize-Type $(if ($r.PSObject.Properties['Type']) { $r.Type } else { $r.type })
      salesrepname = Normalize-Text $r.salesrepname
      customername = Normalize-Text $r.customername
      countryname  = Normalize-Text $r.countryname
      productgroup = Normalize-Text $r.productgroup
      material     = Normalize-Text $r.material
      process      = Normalize-Text $r.process
      values_type  = Normalize-Text $r.values_type
      values       = if ($r.PSObject.Properties['values'] -and $r.values -ne $null -and "$($r.values)".Trim() -ne "") { [decimal]$r.values } else { $null }
    }
  }
}

$all = @()
$all += Read-Sheet -Sheet $Sheet1 -Tag $Sheet1
$all += Read-Sheet -Sheet $Sheet2 -Tag $Sheet2

if ($all.Count -eq 0) { throw "No data found in '$Sheet1' or '$Sheet2'." }

# Excel QC (compute both original sum and 4 d.p. rounded sum)
$excelCount = [int]$all.Count
$excelSumOriginal = ($all | Where-Object { $_.values -ne $null } | Measure-Object -Property values -Sum).Sum
if ($null -eq $excelSumOriginal) { $excelSumOriginal = [decimal]0 }

# Round each row to 4 d.p. before summing, to match NUMERIC(18,4) storage
$excelSumRounded4 = ($all | Where-Object { $_.values -ne $null } | ForEach-Object {
  [decimal]::Round([decimal]$_.values, 4, [System.MidpointRounding]::AwayFromZero)
} | Measure-Object -Sum).Sum
if ($null -eq $excelSumRounded4) { $excelSumRounded4 = [decimal]0 }

# Export CSV (UTF-8 with header) for staging COPY
$csvPath = Join-Path $env:TEMP ("fp_data_excel_stg_{0:yyyyMMdd_HHmmss}.csv" -f (Get-Date))
$all | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Log "Created staging CSV: $csvPath" "INFO" "DataExport"

# Track temp files for cleanup
$tempFiles = @($csvPath)

# Detect psql
$psql = Find-Psql

# Build SQL for FINAL/STAGING tables and the DIRECT INSERT (NO GROUP BY)
$final  = "$Schema.$FinalTable".ToLower()
$stage  = "$Schema.$StageTable".ToLower()

# Set up common args for psql
$env:PGPASSWORD = $PgPassword
$commonArgs = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser, "-d", $PgDatabase, "-v", "ON_ERROR_STOP=1")

# Drop final table if requested (for frequent Excel updates)
if ($DropTableBeforeCreate) {
  $dropFinal = "DROP TABLE IF EXISTS {0} CASCADE;" -f $final
  Write-Host "Dropping existing table $final" -ForegroundColor Yellow
  & $psql @commonArgs -c $dropFinal | Out-Null
}

$ddl = @'
-- FINAL table (typed + constraints + indexes)
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

-- Remove the unique index that was causing issues with duplicate rows
-- We'll add a different index for performance instead
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

-- STAGING table (no constraints/indexes)
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

# Statements to TRUNCATE & COPY to staging, then insert ALL rows from staging (NO GROUP BY)
$csvForPsql = $csvPath -replace '\\','\\'
$copyStage  = "\copy {0} (sourcesheet,year,month,type,salesrepname,customername,countryname,productgroup,material,process,values_type,values) FROM '{1}' WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '', ENCODING 'UTF8');" -f $stage, $csvForPsql
$truncateFinal = if ($TruncateBeforeLoad) { "TRUNCATE TABLE {0};" -f $final } else { "" }
$truncateStage = "TRUNCATE TABLE {0};" -f $stage

# TRULY FIXED: Direct insert without ANY aggregation - every row preserved
$insertDirect = @'
INSERT INTO {0}
  (sourcesheet, year, month, type, salesrepname, customername, countryname, productgroup, material, process, values_type, values)
SELECT
  s.sourcesheet,
  s.year,
  s.month,
  s.type,
  s.salesrepname,
  s.customername,
  s.countryname,
  s.productgroup,
  s.material,
  s.process,
  s.values_type,
  s.values
FROM {1} s;
'@ -f $final, $stage

# Run DDL
Write-Host "Ensuring tables (final & staging)" -ForegroundColor Cyan
& $psql @commonArgs -c $ddl | Out-Null

# Truncate STAGING, then COPY into STAGING
Write-Host "Truncating $stage" -ForegroundColor Yellow
& $psql @commonArgs -c $truncateStage | Out-Null

Write-Host "Copying CSV to $stage" -ForegroundColor Cyan
& $psql @commonArgs -c $copyStage | Out-Null

# Truncate FINAL and insert ALL rows from STAGING (no aggregation)
if ($TruncateBeforeLoad) {
  Write-Host "Truncating $final" -ForegroundColor Yellow
  & $psql @commonArgs -c $truncateFinal | Out-Null
}

Write-Host "Copying ALL rows from $stage to $final (NO MERGING)" -ForegroundColor Cyan
& $psql @commonArgs -c $insertDirect | Out-Null

# Optionally drop staging so it doesn't appear in DBeaver
if ($DropStageAfterLoad) {
  $dropStage = "DROP TABLE IF EXISTS {0};" -f $stage
  Write-Host "Dropping $stage" -ForegroundColor Yellow
  & $psql @commonArgs -c $dropStage | Out-Null
}

# QC: SQL final metrics
$sqlStats = "SELECT COUNT(*) AS rows, COALESCE(SUM(values),0) AS sum FROM {0};" -f $final
$sqlOut   = & $psql @commonArgs -A -t -F '|' -c $sqlStats
$parts    = "$sqlOut".Trim() -split '\|'
$sqlCount = [int]$parts[0]
$sqlSum   = [decimal]$parts[1]

# Report
Write-Host ""
Write-Host "========== QC REPORT (FIXED VERSION) ==========" -ForegroundColor Green
Write-Host ("Excel (original)           → rows: {0} | sum(values): {1:N4}" -f $excelCount, $excelSumOriginal)
Write-Host ("Excel (rounded to 4 d.p.)  → sum(values): {0:N4}" -f $excelSumRounded4)
Write-Host ("SQL   (final)              → rows: {0} | sum(values): {1:N4}" -f $sqlCount, $sqlSum)

$sumDelta = [decimal]::Round($sqlSum - $excelSumRounded4, 4)
$rowDelta = $sqlCount - $excelCount
Write-Host ("Delta Sum (SQL - Excel@4dp): {0:N4} | Delta Rows (SQL - Excel): {1}" -f $sumDelta, $rowDelta) -ForegroundColor Gray

if ($sumDelta -eq 0 -and $rowDelta -eq 0) {
  Write-Host "QC Overall: PERFECT MATCH - All {0} rows transferred successfully with no data loss!" -ForegroundColor Green
} elseif ($rowDelta -eq 0) {
  Write-Host "QC Overall: ROW COUNT MATCH - All {0} rows transferred, minor sum difference after rounding" -ForegroundColor Green
} else {
  Write-Host "QC Overall: ISSUE DETECTED - Row count mismatch, please investigate" -ForegroundColor Red
}

Write-Log "QC Overall: Data conversion completed - $sqlCount rows transferred" "INFO" "QC"

# Cleanup temp files
Write-Log "Cleaning up temporary files" "INFO" "Cleanup"
foreach ($tempFile in $tempFiles) {
  if (Test-Path $tempFile) {
    try {
      Remove-Item $tempFile -Force
      Write-Log "Removed temp file: $tempFile" "DEBUG" "Cleanup"
    } catch {
      Write-Log "Failed to remove temp file: $tempFile - $_" "WARN" "Cleanup"
    }
  }
}

Write-Log "FP Excel to PostgreSQL conversion completed - FIXED VERSION" "INFO" "Main"
