#Requires -Version 5.1
<#
.SYNOPSIS
    Transform Excel AEBF data to SQL and upload to PostgreSQL database
    Step 5: PowerShell Transform Script

.DESCRIPTION
    Reads Excel file (10 columns), maps columns, normalizes data, and uploads to fp_data_excel table
    Supports two modes: UPSERT (update existing) and REPLACE (complete replacement with backup)
    
    DATABASE: public.fp_data_excel (FP Division ONLY - not shared with other divisions)
    
    MODES:
    - UPSERT: Deletes overlapping year/month records, then inserts from Excel
    - REPLACE: Deletes ALL existing FP Actual data, then inserts ONLY data from Excel

.PARAMETER ExcelPath
    Path to the Excel file (.xlsx)

.PARAMETER Division
    Division code (FP, SB, TF, HCM)

.PARAMETER UploadMode
    Upload mode: 'upsert' or 'replace'
    - UPSERT: Deletes records for years/months in Excel, then inserts Excel data (keeps other years/months)
    - REPLACE: Deletes ALL FP Actual data, then inserts ONLY Excel data (WARNING: data loss for years/months not in Excel)

.PARAMETER UploadedBy
    Username of the person uploading (for audit trail)

.PARAMETER TestMode
    If specified, validates data but doesn't upload to database

.EXAMPLE
    .\transform-actual-to-sql.ps1 -ExcelPath "fp_data_actual.xlsx" -Division "FP" -UploadMode "upsert" -UploadedBy "john.doe"

.EXAMPLE
    .\transform-actual-to-sql.ps1 -ExcelPath "fp_data_actual.xlsx" -Division "FP" -UploadMode "replace" -UploadedBy "admin" -TestMode

.NOTES
    Author: IPDashboard Team
    Date: 2025-11-13
    Version: 1.0
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ExcelPath,
    
    [Parameter(Mandatory=$true)]
    [string]$Division,  # Division code - validated by backend before calling script
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('upsert', 'replace')]
    [string]$UploadMode = 'upsert',
    
    [Parameter(Mandatory=$true)]
    [string]$UploadedBy,
    
    [Parameter(Mandatory=$false)]
    [string]$SelectiveYearMonths,  # Comma-separated list like "2025-1,2025-2,2025-3"
    
    [Parameter(Mandatory=$false)]
    [string]$Currency = 'AED',  # Currency code for the data in the Excel file
    
    [Parameter(Mandatory=$false)]
    [switch]$TestMode
)

# ============================================================================
# CONFIGURATION
# ============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# PostgreSQL connection details
$PG_HOST = "localhost"
$PG_PORT = "5432"
$PG_DATABASE = "fp_database"
$PG_USER = "postgres"
$PG_PASSWORD = "***REDACTED***"
$PSQL_PATH = "C:\Program Files\PostgreSQL\17\bin\psql.exe"

# Batch size for inserts
$BATCH_SIZE = 1000

# Log file
$LogFile = "logs\upload-$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

# Determine table names based on division
$TABLE_NAME = if ($Division -eq 'HC') { "hc_data_excel" } else { "fp_data_excel" }
$BACKUP_TABLE_NAME = if ($Division -eq 'HC') { "hc_data_excel_backup" } else { "fp_data_excel_backup" }

# Auth database connection (for exchange rates)
$AUTH_PG_DATABASE = if ($env:AUTH_DB_NAME) { $env:AUTH_DB_NAME } else { "auth_database" }
$AUTH_PG_USER = if ($env:AUTH_DB_USER) { $env:AUTH_DB_USER } else { $PG_USER }
$AUTH_PG_PASSWORD = if ($env:AUTH_DB_PASSWORD) { $env:AUTH_DB_PASSWORD } else { $PG_PASSWORD }

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    # Console output with colors
    switch ($Level) {
        "ERROR"   { Write-Host $logMessage -ForegroundColor Red }
        "WARNING" { Write-Host $logMessage -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logMessage -ForegroundColor Green }
        default   { Write-Host $logMessage }
    }
    
    # File output
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    Add-Content -Path $LogFile -Value $logMessage
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

function Test-Prerequisites {
    Write-Log "Checking prerequisites..."
    
    # Check Excel file exists
    if (-not (Test-Path $ExcelPath)) {
        throw "Excel file not found: $ExcelPath"
    }
    
    # Check psql.exe exists
    if (-not (Test-Path $PSQL_PATH)) {
        throw "PostgreSQL psql.exe not found at: $PSQL_PATH"
    }
    
    # Check ImportExcel module
    if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
        Write-Log "ImportExcel module not found. Installing..." -Level "WARNING"
        Install-Module -Name ImportExcel -Scope CurrentUser -Force
    }
    
    Write-Log "Prerequisites check passed" -Level "SUCCESS"
}

function Ensure-RequiredColumns {
    Write-Log "Checking required columns in $TABLE_NAME..."
    
    $env:PGPASSWORD = $PG_PASSWORD
    
    # All required columns for the INSERT statement
    $requiredColumns = @{
        'division' = "VARCHAR(10) NOT NULL DEFAULT '$($Division.ToUpper())'"
        'sourcesheet' = "VARCHAR(255)"
        'uploaded_by' = "VARCHAR(255)"
        'created_at' = "TIMESTAMP DEFAULT NOW()"
        'updated_at' = "TIMESTAMP DEFAULT NOW()"
        'currency_code' = "VARCHAR(3) DEFAULT 'AED'"
        'exchange_rate_to_base' = "DECIMAL(18,8) DEFAULT 1.0"
        'itemgroupdescription' = "VARCHAR(255)"
    }
    
    # Check existing columns
    $checkColumnQuery = @"
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = '$TABLE_NAME';
"@
    
    try {
        # Get existing columns - suppress NOTICE messages
        $columnResult = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -t -q -c $checkColumnQuery 2>&1
        # Filter out NOTICE messages and empty lines
        $existingColumns = ($columnResult -join '').Trim() -split "`n" | Where-Object { 
            $_ -ne '' -and $_ -notmatch '^NOTICE:' -and $_ -notmatch '^WARNING:'
        } | ForEach-Object { $_.Trim() }
        
        Write-Log "Found $($existingColumns.Count) existing columns in $TABLE_NAME" -Level "INFO"
        
        $columnsAdded = $false
        
        # Check and add each required column
        foreach ($colName in $requiredColumns.Keys) {
            if ($existingColumns -notcontains $colName) {
                Write-Log "Adding $colName column to $TABLE_NAME..." -Level "INFO"
                # Use ADD COLUMN IF NOT EXISTS - this is safe even if column exists
                $addColumnQuery = "ALTER TABLE public.$TABLE_NAME ADD COLUMN IF NOT EXISTS $colName $($requiredColumns[$colName]);"
                # Use -q (quiet) to suppress NOTICE messages, redirect stderr to null to ignore NOTICEs
                $addResult = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -q -c $addColumnQuery 2>$null
                
                # Check exit code - 0 means success (column added or already exists)
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "✅ Column $colName added or already exists" -Level "SUCCESS"
                    $columnsAdded = $true
                } else {
                    # Only treat as error if exit code is non-zero
                    Write-Log "⚠️  Failed to add $colName column (exit code: $LASTEXITCODE)" -Level "WARNING"
                    # Don't throw - continue with other columns
                }
            } else {
                Write-Log "✅ Column $colName already exists" -Level "INFO"
            }
        }
        
        # Only update NULL values if columns were JUST added (not on every upload!)
        # This prevents slow UPDATE on every upload when columns already exist
        if ($columnsAdded) {
            Write-Log "Columns were just added, updating existing NULL values..." -Level "INFO"
            $updateQuery = @"
UPDATE public.$TABLE_NAME 
SET currency_code = COALESCE(currency_code, 'AED'), 
    exchange_rate_to_base = COALESCE(exchange_rate_to_base, 1.0),
    division = COALESCE(division, '$($Division.ToUpper())')
WHERE currency_code IS NULL OR exchange_rate_to_base IS NULL OR division IS NULL;
"@
            & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -c $updateQuery 2>&1 | Out-Null
            Write-Log "✅ Updated existing records with defaults" -Level "SUCCESS"
        } else {
            Write-Log "All required columns already exist" -Level "INFO"
        }
        
        Write-Log "Required columns verified" -Level "SUCCESS"
    }
    catch {
        # Check if error is just a NOTICE about column already existing
        $errorMessage = $_.Exception.Message
        if ($errorMessage -match "already exists" -or $errorMessage -match "NOTICE") {
            Write-Log "Column check completed (NOTICE about existing column is normal)" -Level "INFO"
            Write-Log "Required columns verified" -Level "SUCCESS"
        } else {
            Write-Log "Error: Could not verify/add required columns: $_" -Level "ERROR"
            throw "Failed to ensure required columns exist: $_"
        }
    }
}

function Test-DatabaseConnection {
    Write-Log "Testing database connection..."
    
    $env:PGPASSWORD = $PG_PASSWORD
    $testQuery = "SELECT version();"
    
    try {
        $result = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -t -c $testQuery 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            throw "Database connection failed: $result"
        }
        
        Write-Log "Database connection successful" -Level "SUCCESS"
        Write-Log "PostgreSQL version: $($result.Trim())"
        return $true
    }
    catch {
        throw "Database connection error: $_"
    }
}

function Get-ExchangeRateToBase {
    param([string]$FromCurrency)
    
    if ([string]::IsNullOrWhiteSpace($FromCurrency)) {
        return 1.0
    }
    
    $FromCurrency = $FromCurrency.ToUpper()
    
    # Get base currency from company settings
    $env:PGPASSWORD = $AUTH_PG_PASSWORD
    $baseCurrencyQuery = @"
SELECT setting_value FROM company_settings WHERE setting_key = 'company_currency';
"@
    
    try {
        $baseResult = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $AUTH_PG_USER -d $AUTH_PG_DATABASE -t -c $baseCurrencyQuery 2>&1
        $baseCurrencyJson = ($baseResult -join '').Trim()
        
        if ($baseCurrencyJson -and $baseCurrencyJson -ne '') {
            # Parse JSON to get currency code
            $baseCurrencyObj = $baseCurrencyJson | ConvertFrom-Json -ErrorAction SilentlyContinue
            $baseCurrency = if ($baseCurrencyObj.code) { $baseCurrencyObj.code } else { 'AED' }
        } else {
            $baseCurrency = 'AED'
        }
        
        # If same currency, return 1.0
        if ($FromCurrency -eq $baseCurrency) {
            return 1.0
        }
        
        # Get exchange rate from exchange_rates table
        $rateQuery = @"
SELECT rate FROM exchange_rates 
WHERE from_currency = '$FromCurrency' AND to_currency = '$baseCurrency'
ORDER BY effective_date DESC LIMIT 1;
"@
        
        $rateResult = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $AUTH_PG_USER -d $AUTH_PG_DATABASE -t -c $rateQuery 2>&1
        $rate = ($rateResult -join '').Trim()
        
        if ($rate -and $rate -ne '' -and [double]::TryParse($rate, [ref]$null)) {
            return [double]$rate
        }
        
        # If no rate found, try reverse rate
        $reverseRateQuery = @"
SELECT rate FROM exchange_rates 
WHERE from_currency = '$baseCurrency' AND to_currency = '$FromCurrency'
ORDER BY effective_date DESC LIMIT 1;
"@
        
        $reverseRateResult = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $AUTH_PG_USER -d $AUTH_PG_DATABASE -t -c $reverseRateQuery 2>&1
        $reverseRate = ($reverseRateResult -join '').Trim()
        
        if ($reverseRate -and $reverseRate -ne '' -and [double]::TryParse($reverseRate, [ref]$null)) {
            return 1.0 / [double]$reverseRate
        }
        
        Write-Log "No exchange rate found for $FromCurrency to $baseCurrency, using 1.0" -Level "WARNING"
        return 1.0
    }
    catch {
        Write-Log "Error getting exchange rate: $_" -Level "WARNING"
        return 1.0
    }
}

function Test-ExcelStructure {
    param([array]$Data)
    
    Write-Log "Validating Excel structure..."
    
    $errors = @()
    
    # Required columns (as they appear in Excel)
    # NOTE: Material and Process are now optional - looked up from fp_material_percentages
    $requiredColumns = @(
        'year',
        'month',
        'salesrepname',
        'customername',
        'countryname',
        'productgroup',
        'itemgroupdescription',
        'values_type',
        'total'
    )
    
    # Check if data is empty
    if ($Data.Count -eq 0) {
        $errors += "Excel file is empty"
        return $errors
    }
    
    # Get first row to check columns
    $firstRow = $Data[0]
    $excelColumns = $firstRow.PSObject.Properties.Name
    
    # Check for columns that shouldn't be in Excel
    if ($excelColumns -contains 'type') {
        $errors += "Remove 'type' column from Excel - it will be set to 'Actual' automatically"
    }
    if ($excelColumns -contains 'division') {
        $errors += "Remove 'division' column from Excel - it's provided as parameter"
    }
    
    # Check for missing required columns
    foreach ($col in $requiredColumns) {
        if ($excelColumns -notcontains $col) {
            $errors += "Missing required column: $col"
        }
    }
    
    # Validate sample rows (first 10)
    $sampleRows = $Data | Select-Object -First 10
    for ($i = 0; $i -lt $sampleRows.Count; $i++) {
        $row = $sampleRows[$i]
        $rowNum = $i + 2  # Excel row number (1 = header)
        
        # Year validation
        if ($row.year -lt 2019 -or $row.year -gt 2050) {
            $errors += "Row ${rowNum}: Invalid year $($row.year) (must be 2019-2050)"
        }
        
        # Month validation (must be numeric 1-12)
        if ($row.month -isnot [int] -and $row.month -isnot [double]) {
            $errors += "Row ${rowNum}: Month must be numeric (1-12), found: $($row.month)"
        }
        elseif ($row.month -lt 1 -or $row.month -gt 12) {
            $errors += "Row ${rowNum}: Invalid month $($row.month) (must be 1-12)"
        }
        
        # Customer name validation
        if ([string]::IsNullOrWhiteSpace($row.customername)) {
            $errors += "Row ${rowNum}: Customer name is empty"
        }
        
        # Values type validation
        if ($row.values_type -notin @('AMOUNT', 'Amount', 'amount', 'KGS', 'kgs', 'MORM', 'MoRM', 'morm')) {
            $errors += "Row ${rowNum}: Invalid values_type '$($row.values_type)' (must be AMOUNT, KGS, or MORM)"
        }
        
        # Total/values validation
        if ($null -eq $row.Total) {
            $errors += "Row ${rowNum}: Total value is missing"
        }
        elseif ($row.Total -isnot [int] -and $row.Total -isnot [double]) {
            $errors += "Row ${rowNum}: Total must be numeric, found: $($row.Total)"
        }
    }
    
    if ($errors.Count -eq 0) {
        Write-Log "Excel structure validation passed" -Level "SUCCESS"
        Write-Log "Total rows: $($Data.Count)"
    }
    else {
        Write-Log "Excel structure validation failed with $($errors.Count) errors" -Level "ERROR"
    }
    
    return $errors
}

# ============================================================================
# DATA TRANSFORMATION FUNCTIONS
# ============================================================================

function Convert-ToProperCase {
    param([string]$Text)
    
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    
    # Trim and normalize spaces
    $Text = $Text.Trim() -replace '\s+', ' '
    
    # Convert to proper case (title case)
    $TextInfo = (Get-Culture).TextInfo
    return $TextInfo.ToTitleCase($Text.ToLower())
}

function Convert-ExcelToSqlData {
    param([array]$Data)
    
    Write-Log "Transforming Excel data to SQL format..."
    Write-Log "Applying data normalization: TRIM + Proper Case conversion"
    Write-Log "Currency: $Currency"
    
    # Get exchange rate to base currency
    $exchangeRateToBase = Get-ExchangeRateToBase -FromCurrency $Currency
    Write-Log "Exchange rate $Currency to base: $exchangeRateToBase"
    
    # Use ArrayList for better performance (avoid array += which is O(n^2))
    $transformedData = [System.Collections.ArrayList]::new()
    $sourceSheet = (Get-Item $ExcelPath).Name
    $rowCount = 0
    $totalRows = $Data.Count
    
    foreach ($row in $Data) {
        # Map Excel columns to database columns with normalization
        # Apply TRIM and Proper Case to all text fields for consistency
        # NOTE: material and process are now looked up from fp_material_percentages table
        $sqlRow = @{
            division = $Division.ToUpper()
            year = [int]$row.year
            month = [int]$row.month
            type = 'Actual'  # Always Actual for this upload
            salesrepname = Convert-ToProperCase -Text $row.salesrepname
            customername = Convert-ToProperCase -Text $row.customername
            countryname = Convert-ToProperCase -Text $row.countryname
            productgroup = Convert-ToProperCase -Text $row.productgroup
            itemgroupdescription = Convert-ToProperCase -Text $row.itemgroupdescription
            values_type = if ($row.values_type) { $row.values_type.ToString().Trim().ToUpper() } else { 'AMOUNT' }  # Normalize to uppercase, default to AMOUNT
            values = [decimal]$row.total
            sourcesheet = $sourceSheet
            uploaded_by = $UploadedBy
            currency_code = $Currency.ToUpper()
            exchange_rate_to_base = $exchangeRateToBase
        }
        
        [void]$transformedData.Add($sqlRow)
        $rowCount++
        
        # Log progress every 5000 rows
        if ($rowCount % 5000 -eq 0) {
            Write-Log "Transformed $rowCount / $totalRows rows..." -Level "INFO"
        }
    }
    
    Write-Log "Transformed $($transformedData.Count) rows with normalization applied" -Level "SUCCESS"
    return $transformedData
}

function Get-QCSummary {
    param([array]$Data)
    
    Write-Log "Generating QC summary..."
    
    # Extract unique values from hashtable array
    $years = ($Data | ForEach-Object { $_.year } | Select-Object -Unique | Sort-Object)
    $months = ($Data | ForEach-Object { $_.month } | Select-Object -Unique | Sort-Object)
    $valuesTypes = ($Data | ForEach-Object { $_.values_type } | Select-Object -Unique | Sort-Object)
    
    # Calculate totals by values_type
    $totalAmount = ($Data | Where-Object { $_.values_type -eq 'AMOUNT' } | ForEach-Object { $_.values } | Measure-Object -Sum).Sum
    $totalKGS = ($Data | Where-Object { $_.values_type -eq 'KGS' } | ForEach-Object { $_.values } | Measure-Object -Sum).Sum
    $totalMORM = ($Data | Where-Object { $_.values_type -eq 'MORM' } | ForEach-Object { $_.values } | Measure-Object -Sum).Sum
    
    $summary = @{
        TotalRecords = $Data.Count
        Years = $years
        Months = $months
        ValuesTypes = $valuesTypes
        TotalAmount = $totalAmount
        TotalKGS = $totalKGS
        TotalMORM = $totalMORM
    }
    
    Write-Log "QC Summary:"
    Write-Log "  Total Records: $($summary.TotalRecords)"
    Write-Log "  Years: $($summary.Years -join ', ')"
    Write-Log "  Months: $($summary.Months -join ', ')"
    Write-Log "  Values Types: $($summary.ValuesTypes -join ', ')"
    Write-Log "  Total AMOUNT: $($summary.TotalAmount)"
    Write-Log "  Total KGS: $($summary.TotalKGS)"
    Write-Log "  Total MORM: $($summary.TotalMORM)"
    
    return $summary
}

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

function Invoke-SqlCommand {
    param(
        [string]$Query,
        [switch]$ReturnOutput,
        [int]$TimeoutSeconds = 300  # 5 minute default timeout
    )
    
    $env:PGPASSWORD = $PG_PASSWORD
    
    try {
        # Always use temp file to avoid command line length limits
        $tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"
        try {
            $Query | Out-File -FilePath $tempSqlFile -Encoding UTF8
            
            # Add statement timeout to query
            $timeoutQuery = "SET statement_timeout = ${TimeoutSeconds}000;`n" + $Query
            $timeoutQuery | Out-File -FilePath $tempSqlFile -Encoding UTF8 -Force
            
            Write-Log "Executing SQL command (timeout: ${TimeoutSeconds}s)..." -Level "INFO"
            $startTime = Get-Date
            
            if ($ReturnOutput) {
                $result = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -t -f $tempSqlFile 2>&1
            }
            else {
                $output = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -f $tempSqlFile 2>&1
                if ($output) {
                    Write-Log "SQL output: $($output -join '`n')" -Level "INFO"
                }
            }
            
            $elapsed = (Get-Date) - $startTime
            Write-Log "SQL command completed in $($elapsed.TotalSeconds) seconds" -Level "SUCCESS"
        }
        finally {
            if (Test-Path $tempSqlFile) {
                Remove-Item $tempSqlFile -Force
            }
        }
        
        if ($LASTEXITCODE -ne 0) {
            throw "SQL command failed with exit code $LASTEXITCODE"
        }
        
        if ($ReturnOutput) {
            return $result
        }
    }
    catch {
        Write-Log "SQL execution error: $_" -Level "ERROR"
        throw "SQL execution error: $_"
    }
}

function Backup-ExistingData {
    param([array]$TransformedData)
    
    Write-Log "Creating backup before REPLACE operation..."
    Write-Log "REPLACE mode will delete ALL existing data for division $Division, type Actual"
    
    # Count existing records before backup
    $countBeforeQuery = "SELECT COUNT(*) FROM public.$TABLE_NAME WHERE division = '$($Division.ToUpper())' AND type = 'Actual';"
    $countBeforeRaw = Invoke-SqlCommand -Query $countBeforeQuery -ReturnOutput
    
    # Handle array or string result
    $countBeforeStr = if ($countBeforeRaw -is [array]) { ($countBeforeRaw -join '').Trim() } else { $countBeforeRaw.Trim() }
    $countBeforeNum = 0
    [int]::TryParse($countBeforeStr, [ref]$countBeforeNum) | Out-Null
    
    # Skip backup if table is empty
    if ($countBeforeNum -eq 0) {
        Write-Log "No existing data to backup (table is empty)" -Level "INFO"
        return
    }
    
    # Note: Explicitly list columns to avoid mismatch between main table and backup table
    # Main table has: currency_code, exchange_rate_to_base, created_at which backup table doesn't have
    $backupQuery = @"
BEGIN;

-- Clear previous backups for this division/type to avoid primary key conflicts
DELETE FROM public.$BACKUP_TABLE_NAME 
WHERE division = '$($Division.ToUpper())' AND type = 'Actual';

-- Backup ALL existing data for this division and type (not just uploaded months)
-- Explicitly list columns to match backup table structure
-- NOTE: material, process, updatedat columns removed from new table structure
INSERT INTO public.$BACKUP_TABLE_NAME 
(id, sourcesheet, year, month, type, salesrepname, customername, countryname, productgroup, itemgroupdescription, values_type, values, division, updated_at, uploaded_by, backup_timestamp, backup_reason)
SELECT id, sourcesheet, year, month, type, salesrepname, customername, countryname, productgroup, itemgroupdescription, values_type, values, division, updated_at, uploaded_by, NOW(), 'REPLACE mode - full backup before delete all'
FROM public.$TABLE_NAME
WHERE division = '$($Division.ToUpper())'
  AND type = 'Actual';

COMMIT;
"@
    
    Invoke-SqlCommand -Query $backupQuery
    
    Write-Log "Backup created: $countBeforeNum records backed up (ALL existing $Division Actual data)" -Level "SUCCESS"
}

function Remove-ExistingData {
    param([array]$TransformedData)
    
    Write-Log "Deleting ALL existing data for REPLACE mode..."
    Write-Log "WARNING: This will delete ALL FP Actual data, not just overlapping months"
    
    # Get count before deletion
    $beforeCount = Invoke-SqlCommand -Query "SELECT COUNT(*) FROM public.$TABLE_NAME WHERE division = '$($Division.ToUpper())' AND type = 'Actual';" -ReturnOutput
    Write-Log "Records before delete: $($beforeCount.Trim())"
    
    $deleteQuery = @"
BEGIN;

-- Delete ALL existing data for this division and type (complete replacement)
DELETE FROM public.$TABLE_NAME
WHERE division = '$($Division.ToUpper())'
  AND type = 'Actual';

COMMIT;
"@
    
    Invoke-SqlCommand -Query $deleteQuery
    
    # Get count after deletion
    $afterCount = Invoke-SqlCommand -Query "SELECT COUNT(*) FROM public.$TABLE_NAME WHERE division = '$($Division.ToUpper())' AND type = 'Actual';" -ReturnOutput
    Write-Log "Records deleted: $($beforeCount.Trim())" -Level "SUCCESS"
    Write-Log "Records remaining: $($afterCount.Trim())" -Level "SUCCESS"
}

function Invoke-UpsertData {
    param([array]$TransformedData)
    
    Write-Log "Uploading data in UPSERT mode (batch size: $BATCH_SIZE)..."
    Write-Log "UPSERT: Delete ALL matching year/months ONCE, then insert all data"
    
    $totalBatches = [Math]::Ceiling($TransformedData.Count / $BATCH_SIZE)
    
    # ========================================================================
    # STEP 1: Extract ALL unique year/month combinations from ENTIRE dataset
    # and delete them ONCE before any inserts (fixes the batch overlap bug)
    # ========================================================================
    $allYearMonths = $TransformedData | ForEach-Object { "$($_.year)-$($_.month)" } | Select-Object -Unique
    Write-Log "Found $($allYearMonths.Count) unique year/month combinations in Excel data" -Level "INFO"
    
    # Build DELETE conditions for all year/months
    $yearMonthConditions = $allYearMonths | ForEach-Object {
        $parts = $_ -split '-'
        "(year = $($parts[0]) AND month = $($parts[1]))"
    }
    
    if ($yearMonthConditions.Count -gt 0) {
        # Count records before deletion
        $countBeforeQuery = "SELECT COUNT(*) FROM public.$TABLE_NAME WHERE division = '$($Division.ToUpper())' AND type = 'Actual' AND ($($yearMonthConditions -join " OR "));"
        $countBefore = Invoke-SqlCommand -Query $countBeforeQuery -ReturnOutput
        Write-Log "Records to delete (matching year/months): $($countBefore.Trim())" -Level "INFO"
        
        # Delete ALL matching year/month records ONCE
        $deleteAllQuery = @"
BEGIN;
DELETE FROM public.$TABLE_NAME 
WHERE division = '$($Division.ToUpper())' 
  AND type = 'Actual'
  AND ($($yearMonthConditions -join " OR "));
COMMIT;
"@
        Write-Log "Deleting existing records for all $($allYearMonths.Count) year/month combinations..." -Level "INFO"
        Invoke-SqlCommand -Query $deleteAllQuery -TimeoutSeconds 600
        Write-Log "Pre-insert deletion completed" -Level "SUCCESS"
    }
    
    # ========================================================================
    # STEP 2: Insert all data in batches (no more per-batch deletes)
    # ========================================================================
    $batchNumber = 0
    
    for ($i = 0; $i -lt $TransformedData.Count; $i += $BATCH_SIZE) {
        $batchNumber++
        $batch = $TransformedData[$i..([Math]::Min($i + $BATCH_SIZE - 1, $TransformedData.Count - 1))]
        
        Write-Log "Inserting batch $batchNumber of $totalBatches ($($batch.Count) rows)..."
        
        # Build INSERT values
        $values = @()
        foreach ($row in $batch) {
            $salesrepname = if ($row.salesrepname) { "'$($row.salesrepname.Replace("'", "''"))'" } else { "NULL" }
            $customername = if ($row.customername) { "'$($row.customername.Replace("'", "''"))'" } else { "NULL" }
            $countryname = if ($row.countryname) { "'$($row.countryname.Replace("'", "''"))'" } else { "NULL" }
            $productgroup = if ($row.productgroup) { "'$($row.productgroup.Replace("'", "''"))'" } else { "NULL" }
            $itemgroupdescription = if ($row.itemgroupdescription) { "'$($row.itemgroupdescription.Replace("'", "''"))'" } else { "NULL" }
            $sourcesheet = if ($row.sourcesheet) { "'$($row.sourcesheet.Replace("'", "''"))'" } else { "NULL" }
            
            $valueRow = @"
('$($row.division)', $($row.year), $($row.month), '$($row.type)', $salesrepname, $customername, $countryname, $productgroup, $itemgroupdescription, '$($row.values_type)', $($row.values), $sourcesheet, '$($row.uploaded_by)', '$($row.currency_code)', $($row.exchange_rate_to_base))
"@
            $values += $valueRow
        }
        
        # INSERT only (no DELETE per batch)
        $insertQuery = @"
BEGIN;
INSERT INTO public.$TABLE_NAME 
(division, year, month, type, salesrepname, customername, countryname, productgroup, itemgroupdescription, values_type, values, sourcesheet, uploaded_by, currency_code, exchange_rate_to_base)
VALUES
$($values -join ",`n");
COMMIT;
"@
        
        try {
            $batchStartTime = Get-Date
            Invoke-SqlCommand -Query $insertQuery -TimeoutSeconds 600
            $batchElapsed = (Get-Date) - $batchStartTime
            Write-Log "Batch $batchNumber completed in $($batchElapsed.TotalSeconds) seconds" -Level "SUCCESS"
        }
        catch {
            $batchElapsed = if ($batchStartTime) { (Get-Date) - $batchStartTime } else { [TimeSpan]::Zero }
            Write-Log "Batch $batchNumber failed after $($batchElapsed.TotalSeconds) seconds: $_" -Level "ERROR"
            throw
        }
    }
    
    Write-Log "UPSERT completed: $($TransformedData.Count) rows processed" -Level "SUCCESS"
}

function Invoke-InsertData {
    param([array]$TransformedData)
    
    Write-Log "Uploading data in INSERT mode (batch size: $BATCH_SIZE)..."
    
    $totalBatches = [Math]::Ceiling($TransformedData.Count / $BATCH_SIZE)
    $batchNumber = 0
    
    for ($i = 0; $i -lt $TransformedData.Count; $i += $BATCH_SIZE) {
        $batchNumber++
        $batch = $TransformedData[$i..([Math]::Min($i + $BATCH_SIZE - 1, $TransformedData.Count - 1))]
        
        Write-Log "Processing batch $batchNumber of $totalBatches ($($batch.Count) rows)..."
        
        # Build INSERT
        $values = @()
        foreach ($row in $batch) {
            $salesrepname = if ($row.salesrepname) { "'$($row.salesrepname.Replace("'", "''"))'" } else { "NULL" }
            $customername = if ($row.customername) { "'$($row.customername.Replace("'", "''"))'" } else { "NULL" }
            $countryname = if ($row.countryname) { "'$($row.countryname.Replace("'", "''"))'" } else { "NULL" }
            $productgroup = if ($row.productgroup) { "'$($row.productgroup.Replace("'", "''"))'" } else { "NULL" }
            $itemgroupdescription = if ($row.itemgroupdescription) { "'$($row.itemgroupdescription.Replace("'", "''"))'" } else { "NULL" }
            $sourcesheet = if ($row.sourcesheet) { "'$($row.sourcesheet.Replace("'", "''"))'" } else { "NULL" }
            
            $valueRow = @"
('$($row.division)', $($row.year), $($row.month), '$($row.type)', $salesrepname, $customername, $countryname, $productgroup, $itemgroupdescription, '$($row.values_type)', $($row.values), $sourcesheet, '$($row.uploaded_by)', '$($row.currency_code)', $($row.exchange_rate_to_base))
"@
            $values += $valueRow
        }
        
        $insertQuery = @"
BEGIN;

INSERT INTO public.$TABLE_NAME 
(division, year, month, type, salesrepname, customername, countryname, productgroup, itemgroupdescription, values_type, values, sourcesheet, uploaded_by, currency_code, exchange_rate_to_base)
VALUES
$($values -join ",`n");

COMMIT;
"@
        
        try {
            Write-Log "Executing batch $batchNumber (INSERT)..." -Level "INFO"
            $batchStartTime = Get-Date
            Invoke-SqlCommand -Query $insertQuery -TimeoutSeconds 600  # 10 minute timeout per batch
            $batchElapsed = (Get-Date) - $batchStartTime
            Write-Log "Batch $batchNumber completed successfully in $($batchElapsed.TotalSeconds) seconds" -Level "SUCCESS"
        }
        catch {
            $batchElapsed = if ($batchStartTime) { (Get-Date) - $batchStartTime } else { [TimeSpan]::Zero }
            Write-Log "Batch $batchNumber failed after $($batchElapsed.TotalSeconds) seconds: $_" -Level "ERROR"
            throw
        }
    }
    
    Write-Log "INSERT completed: $($TransformedData.Count) rows processed" -Level "SUCCESS"
}

function Write-AuditLog {
    param(
        [string]$Operation,
        [int]$RecordsAffected,
        [hashtable]$QCSummary,
        [string]$Status,
        [string]$ErrorMessage = $null
    )
    
    Write-Log "Writing audit log..."
    
    $auditQuery = @"
INSERT INTO public.aebf_upload_audit 
(division, upload_mode, uploaded_by, records_processed, success, error_message)
VALUES 
('$($Division.ToUpper())', '$UploadMode', '$UploadedBy', $RecordsAffected, 
 $(if ($Status -eq 'success') { 'true' } else { 'false' }),
 $(if ($ErrorMessage) { "'$($ErrorMessage.Replace("'", "''"))'" } else { "NULL" }));
"@
    
    try {
        Invoke-SqlCommand -Query $auditQuery
        Write-Log "Audit log written successfully" -Level "SUCCESS"
    }
    catch {
        Write-Log "Failed to write audit log: $_" -Level "WARNING"
    }
}

function Get-PostUploadQC {
    param([hashtable]$PreQC)
    
    Write-Log "Running post-upload QC verification..."
    
    $years = $PreQC.Years -join ','
    $months = $PreQC.Months -join ','
    
    $qcQuery = @"
SELECT 
    values_type,
    COUNT(*) as record_count,
    SUM(values) as total_values
FROM public.$TABLE_NAME
WHERE division = '$($Division.ToUpper())'
  AND type = 'Actual'
  AND year IN ($years)
  AND month IN ($months)
GROUP BY values_type
ORDER BY values_type;
"@
    
    $result = Invoke-SqlCommand -Query $qcQuery -ReturnOutput
    
    Write-Log "Post-upload QC Results:"
    Write-Log $result
    
    return $result
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

try {
    Write-Log "========================================================================"
    Write-Log "AEBF Excel to SQL Transform & Upload Script"
    Write-Log "========================================================================"
    Write-Log "Excel File: $ExcelPath"
    Write-Log "Division: $Division"
    Write-Log "Upload Mode: $UploadMode"
    Write-Log "Uploaded By: $UploadedBy"
    Write-Log "Test Mode: $TestMode"
    Write-Log "========================================================================"
    
    # Step 1: Prerequisites
    Test-Prerequisites
    
    # Step 2: Test database connection
    Test-DatabaseConnection
    
    # Step 2.5: Ensure all required columns exist (adds them automatically if missing)
    Ensure-RequiredColumns
    
    # Step 3: Read Excel file (first sheet only - no sheet name required)
    Write-Log "Reading Excel file (first sheet)..."
    Import-Module ImportExcel
    $excelDataRaw = Import-Excel -Path $ExcelPath  # Reads first sheet automatically
    
    Write-Log "Excel has $($excelDataRaw.Count) total rows" -Level "INFO"
    
    # Filter out blank rows (where year is null/empty/0)
    $excelData = $excelDataRaw | Where-Object { 
        $_.year -and 
        $_.year -ne 0 -and 
        ![string]::IsNullOrWhiteSpace($_.customername)
    }
    
    Write-Log "Read $($excelDataRaw.Count) rows from Excel (filtered to $($excelData.Count) valid rows)" -Level "SUCCESS"
    
    if ($excelData.Count -eq 0) {
        throw "No valid data rows found in Excel file. Check that the file has data with year and customername columns filled."
    }
    
    # Apply selective year/month filter if provided
    if ($SelectiveYearMonths) {
        Write-Log "Selective mode enabled: $SelectiveYearMonths" -Level "INFO"
        $selectedPairs = $SelectiveYearMonths.Split(',') | ForEach-Object {
            $parts = $_.Trim().Split('-')
            [PSCustomObject]@{
                Year = [int]$parts[0]
                Month = [int]$parts[1]
            }
        }
        
        $beforeCount = $excelData.Count
        $excelData = $excelData | Where-Object {
            $row = $_
            $selectedPairs | Where-Object { $_.Year -eq $row.year -and $_.Month -eq $row.month } | Select-Object -First 1
        }
        
        Write-Log "Filtered to $($excelData.Count) rows (from $beforeCount) matching selected periods" -Level "INFO"
        
        if ($excelData.Count -eq 0) {
            throw "No data found for the selected year/month periods: $SelectiveYearMonths"
        }
    }
    
    Write-Log "Upload type: Actual (separate file upload, not combined with Budget)" -Level "INFO"
    
    # Step 4: Validate Excel structure
    $validationErrors = Test-ExcelStructure -Data $excelData
    if ($validationErrors.Count -gt 0) {
        Write-Log "Validation Errors:" -Level "ERROR"
        foreach ($error in $validationErrors) {
            Write-Log "  - $error" -Level "ERROR"
        }
        throw "Excel validation failed with $($validationErrors.Count) errors"
    }
    
    # Step 5: Transform data
    $transformedData = Convert-ExcelToSqlData -Data $excelData
    
    # Step 6: Generate QC summary
    $preQC = Get-QCSummary -Data $transformedData
    
    # Step 7: Test mode check
    if ($TestMode) {
        Write-Log "========================================================================"
        Write-Log "TEST MODE - No data will be uploaded to database"
        Write-Log "========================================================================"
        Write-Log "Validation completed successfully. Data is ready for upload." -Level "SUCCESS"
        exit 0
    }
    
    # Step 8: Upload based on mode
    if ($UploadMode -eq 'replace') {
        # REPLACE mode: Backup → Delete → Insert
        Backup-ExistingData -TransformedData $transformedData
        Remove-ExistingData -TransformedData $transformedData
        Invoke-InsertData -TransformedData $transformedData
    }
    else {
        # UPSERT mode: Insert with ON CONFLICT DO UPDATE
        Invoke-UpsertData -TransformedData $transformedData
    }
    
    # Step 9: Post-upload QC
    $postQC = Get-PostUploadQC -PreQC $preQC
    
    # Step 10: Write audit log
    Write-AuditLog -Operation $UploadMode -RecordsAffected $transformedData.Count -QCSummary $preQC -Status 'success'
    
    Write-Log "========================================================================"
    Write-Log "Upload completed successfully!" -Level "SUCCESS"
    Write-Log "Total records processed: $($transformedData.Count)"
    Write-Log "Mode: $UploadMode"
    Write-Log "Log file: $LogFile"
    Write-Log "========================================================================"
    
    exit 0
}
catch {
    Write-Log "========================================================================"
    Write-Log "Upload failed: $_" -Level "ERROR"
    Write-Log "========================================================================"
    
    # Write failure to audit log
    if ($preQC) {
        Write-AuditLog -Operation $UploadMode -RecordsAffected 0 -QCSummary $preQC -Status 'failed' -ErrorMessage $_.Exception.Message
    }
    
    exit 1
}
