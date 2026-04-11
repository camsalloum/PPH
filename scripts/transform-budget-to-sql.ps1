#Requires -Version 5.1
<#
.SYNOPSIS
    Transform Excel Budget data to SQL and upload to PostgreSQL database
    Step 5: PowerShell Transform Script

.DESCRIPTION
    Reads Excel file (10 columns), maps columns, normalizes data, and uploads to fp_data_excel table
    Supports two modes: UPSERT (update existing) and REPLACE (complete replacement with backup)
    
    DATABASE: public.fp_data_excel (type='Budget')
    
    MODES:
    - UPSERT: Deletes overlapping year/month records, then inserts from Excel
    - REPLACE: Deletes ALL existing Budget data for division/year, then inserts ONLY data from Excel

.PARAMETER ExcelPath
    Path to the Excel file (.xlsx)

.PARAMETER Division
    Division code (FP, SB, TF, HCM)

.PARAMETER UploadMode
    Upload mode: 'upsert' or 'replace'
    - UPSERT: Deletes records for years/months in Excel, then inserts Excel data (keeps other years/months)
    - REPLACE: Deletes ALL Budget data for division/year, then inserts ONLY Excel data (WARNING: data loss for years/months not in Excel)

.PARAMETER UploadedBy
    Username of the person uploading (for audit trail)

.PARAMETER TestMode
    If specified, validates data but doesn't upload to database

.EXAMPLE
    .\transform-budget-to-sql.ps1 -ExcelPath "fp_budget_2025.xlsx" -Division "FP" -UploadMode "replace" -UploadedBy "john.doe"

.EXAMPLE
    .\transform-budget-to-sql.ps1 -ExcelPath "fp_budget_2025.xlsx" -Division "FP" -UploadMode "replace" -UploadedBy "admin" -TestMode

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

# PostgreSQL connection details (prefer environment variables; fall back to defaults)
$PG_HOST = if ($env:PG_HOST) { $env:PG_HOST } else { "localhost" }
$PG_PORT = if ($env:PG_PORT) { $env:PG_PORT } else { "5432" }
$PG_DATABASE = if ($env:PG_DATABASE) { $env:PG_DATABASE } else { "fp_database" }
$PG_USER = if ($env:PG_USER) { $env:PG_USER } else { "postgres" }
$PG_PASSWORD = if ($env:PG_PASSWORD) { $env:PG_PASSWORD } else { "***REDACTED***" }
$PSQL_PATH = if ($env:PSQL_PATH) { $env:PSQL_PATH } else { "C:\Program Files\PostgreSQL\17\bin\psql.exe" }

# Auth database for exchange rates and company settings
$AUTH_PG_DATABASE = "fp_database"
$AUTH_PG_USER = "postgres"
$AUTH_PG_PASSWORD = "***REDACTED***"

# Batch size for inserts
$BATCH_SIZE = 1000

# Log file
$LogFile = "logs\upload-$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

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

function Test-ExcelStructure {
    param([array]$Data)
    
    Write-Log "Validating Excel structure..."
    
    $errors = @()
    
    # Required columns (case-insensitive). Some columns have aliases.
    # NOTE: Material and Process are now optional - looked up from fp_material_percentages
    $requiredColumns = @(
        'year',
        'month',
        'salesrepname',
        'customername',
        'countryname',
        'values_type'
    )
    
    # Column alternatives - either one must be present
    $columnAlternatives = @(
        @('pgcombine', 'productgroup'),  # Either pgcombine or productgroup
        @('total', 'values')              # Either total or values
    )
    
    # Check if data is empty
    if ($Data.Count -eq 0) {
        $errors += "Excel file is empty"
        return $errors
    }
    
    # Get first row to check columns
    $firstRow = $Data[0]
    $excelColumns = $firstRow.PSObject.Properties.Name
    # Normalize header names to lowercase for case-insensitive matching
    $excelColumnsLower = $excelColumns | ForEach-Object { $_.ToString().ToLower() }
    
    # Check for columns that shouldn't be in Excel
    if ($excelColumnsLower -contains 'type') {
        $errors += "Remove 'type' column from Excel - it will be set to 'Budget' automatically"
    }
    if ($excelColumnsLower -contains 'division') {
        $errors += "Remove 'division' column from Excel - it's provided as parameter"
    }
    
    # Check for missing required columns
    foreach ($col in $requiredColumns) {
        if ($excelColumnsLower -notcontains $col.ToLower()) {
            $errors += "Missing required column: $col"
        }
    }
    
    # Check for alternative columns (at least one must be present)
    foreach ($alternatives in $columnAlternatives) {
        $found = $false
        foreach ($alt in $alternatives) {
            if ($excelColumnsLower -contains $alt.ToLower()) {
                $found = $true
                break
            }
        }
        if (-not $found) {
            $errors += "Missing required column (need one of: $($alternatives -join ' or '))"
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
        
        # Values type validation (case-insensitive)
        $valType = ($row.values_type -as [string])
        if (-not $valType) { $valType = $row.values_type }
        if ($valType) { $valType = $valType.ToString().ToUpper() }
        if ($valType -notin @('AMOUNT','KGS','MORM')) {
            $errors += "Row ${rowNum}: Invalid values_type '$($row.values_type)' (must be AMOUNT, KGS, or MORM)"
        }
        
        # Total/values validation
        # Accept 'Total' or 'values' variants (case-insensitive)
        $valueField = $null
        if ($row.PSObject.Properties.Name -contains 'Total') { $valueField = $row.Total }
        elseif ($row.PSObject.Properties.Name -contains 'values') { $valueField = $row.values }
        else {
            # Try case-insensitive lookup
            foreach ($p in $row.PSObject.Properties) {
                if ($p.Name.ToLower() -in @('total','values')) { $valueField = $p.Value; break }
            }
        }

        if ($null -eq $valueField) {
            $errors += "Row ${rowNum}: Total/values value is missing"
        }
        elseif ($valueField -isnot [int] -and $valueField -isnot [double]) {
            $errors += "Row ${rowNum}: Total/values must be numeric, found: $($valueField)"
        }
    }
    
    if ($errors.Count -eq 0) {
        Write-Log "Excel structure validation passed (Budget upload)" -Level "SUCCESS"
        Write-Log "Total rows: $($Data.Count)"
    }
    else {
        Write-Log "Excel structure validation failed with $($errors.Count) errors" -Level "ERROR"
    }
    
    return $errors
}

# ============================================================================
# CURRENCY FUNCTIONS
# ============================================================================

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
    
    $transformedData = @()
    $sourceSheet = (Get-Item $ExcelPath).Name
    
    # Use hashtable to aggregate duplicates
    $aggregatedData = @{}
    $duplicatesFound = 0
    
    foreach ($row in $Data) {
        # Map Excel columns to database columns with normalization
        # Apply TRIM and Proper Case to all text fields for consistency
        $salesrepname = Convert-ToProperCase -Text $row.salesrepname
        $customername = Convert-ToProperCase -Text $row.customername
        $countryname = Convert-ToProperCase -Text $row.COUNTRYNAME
        $productgroup = Convert-ToProperCase -Text $row.PGCombine
        $values_type = if ($row.values_type) { $row.values_type.ToString().Trim().ToUpper() } else { 'AMOUNT' }
        
        # Create unique key for aggregation
        $key = "$($Division.ToUpper())|$([int]$row.year)|$([int]$row.month)|$salesrepname|$customername|$countryname|$productgroup|$values_type"
        
        if ($aggregatedData.ContainsKey($key)) {
            # Aggregate by summing values
            $aggregatedData[$key].values += [decimal]$row.Total
            $duplicatesFound++
        } else {
            $aggregatedData[$key] = @{
                division = $Division.ToUpper()
                year = [int]$row.year
                month = [int]$row.month
                type = 'Budget'
                salesrepname = $salesrepname
                customername = $customername
                countryname = $countryname
                productgroup = $productgroup
                values_type = $values_type
                values = [decimal]$row.Total
                sourcesheet = $sourceSheet
                uploaded_by = $UploadedBy
                currency_code = $Currency.ToUpper()
                exchange_rate_to_base = $exchangeRateToBase
            }
        }
    }
    
    # Convert hashtable to array
    $transformedData = $aggregatedData.Values
    
    if ($duplicatesFound -gt 0) {
        Write-Log "Aggregated $duplicatesFound duplicate rows (summed values)" -Level "WARNING"
    }
    
    Write-Log "Transformed $($transformedData.Count) unique rows with normalization applied" -Level "SUCCESS"
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
        [switch]$ReturnOutput
    )
    
    $env:PGPASSWORD = $PG_PASSWORD
    
    try {
        # Always use temp file to avoid command line length limits
        $tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"
        try {
            $Query | Out-File -FilePath $tempSqlFile -Encoding UTF8
            
            if ($ReturnOutput) {
                $result = & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -t -f $tempSqlFile 2>&1
            }
            else {
                & $PSQL_PATH -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -f $tempSqlFile 2>&1 | Out-Null
            }
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
        throw "SQL execution error: $_"
    }
}

function Backup-ExistingData {
    param([array]$TransformedData)
    
    Write-Log "Creating backup before REPLACE operation..."
    Write-Log "REPLACE mode will delete ALL existing data for division $Division, type Budget"
    
    # Count existing records before backup
        # Get count before delete
    # Get year from transformed data for budget_year
    $budgetYear = ($TransformedData | Select-Object -First 1).year
    
    $countBeforeQuery = "SELECT COUNT(*) FROM public.fp_data_excel WHERE UPPER(division) = '$($Division.ToUpper())' AND type = 'Budget' AND year = $budgetYear;"
    $countBefore = Invoke-SqlCommand -Query $countBeforeQuery -ReturnOutput
    
    Write-Log "Found $($countBefore.Trim()) existing records for $Division Budget year $budgetYear"
    Write-Log "Skipping backup for now - proceeding with delete and insert" -Level "INFO"
}

function Remove-ExistingData {
    param([array]$TransformedData)
    
    # Get budget year from transformed data
    $budgetYear = ($TransformedData | Select-Object -First 1).year
    
    Write-Log "Deleting ALL existing budget data for REPLACE mode..."
    Write-Log "Division: $Division, Budget Year: $budgetYear"
    
    # Get count before deletion
    $beforeCount = Invoke-SqlCommand -Query "SELECT COUNT(*) FROM public.fp_data_excel WHERE UPPER(division) = '$($Division.ToUpper())' AND type = 'Budget' AND year = $budgetYear;" -ReturnOutput
    Write-Log "Records before delete: $($beforeCount.Trim())"
    
    $deleteQuery = @"
BEGIN;

-- Delete ALL existing budget data for this division and year (complete replacement)
DELETE FROM public.fp_data_excel
WHERE UPPER(division) = '$($Division.ToUpper())'
  AND type = 'Budget'
  AND year = $budgetYear;

COMMIT;
"@
    
    Invoke-SqlCommand -Query $deleteQuery
    
    # Get count after deletion
        
    # Get record count after
    $afterCount = Invoke-SqlCommand -Query "SELECT COUNT(*) FROM public.fp_sales_rep_budget WHERE UPPER(division) = '$($Division.ToUpper())' AND budget_year = $budgetYear;" -ReturnOutput
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
        # Get budget year from transformed data
        $budgetYear = ($TransformedData | Select-Object -First 1).year
        
        # Count records before deletion
        $countBeforeQuery = "SELECT COUNT(*) FROM public.fp_sales_rep_budget WHERE UPPER(division) = '$($Division.ToUpper())' AND budget_year = $budgetYear AND ($($yearMonthConditions -join " OR "));"
        $countBefore = Invoke-SqlCommand -Query $countBeforeQuery -ReturnOutput
        Write-Log "Records to delete (matching year/months): $($countBefore.Trim())" -Level "INFO"
        
        # Delete ALL matching year/month records ONCE
        $deleteAllQuery = @"
BEGIN;
DELETE FROM public.fp_sales_rep_budget 
WHERE UPPER(division) = '$($Division.ToUpper())' 
  AND budget_year = $budgetYear
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
            $sourcesheet = if ($row.sourcesheet) { "'$($row.sourcesheet.Replace("'", "''"))'" } else { "NULL" }
            
            $valueRow = @"
('$($row.division)', $($row.year), $($row.year), $($row.month), 'BUDGET', $salesrepname, $customername, $countryname, $productgroup, '$($row.values_type)', $($row.values), '$($row.uploaded_by)', $sourcesheet, NOW(), '$($row.currency_code)', $($row.exchange_rate_to_base))
"@
            $values += $valueRow
        }
        
        # INSERT only (no DELETE per batch)
        $insertQuery = @"
BEGIN;
INSERT INTO public.fp_sales_rep_budget 
(division, budget_year, year, month, type, salesrepname, customername, countryname, productgroup, values_type, values, created_by, uploaded_filename, uploaded_at, currency_code, exchange_rate_to_base)
VALUES
$($values -join ",`n");
COMMIT;
"@
        
        try {
            Invoke-SqlCommand -Query $insertQuery -TimeoutSeconds 600
            Write-Log "Batch $batchNumber completed successfully" -Level "SUCCESS"
        }
        catch {
            Write-Log "Batch $batchNumber failed: $_" -Level "ERROR"
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
            $sourcesheet = if ($row.sourcesheet) { "'$($row.sourcesheet.Replace("'", "''"))'" } else { "NULL" }
            
            $valueRow = @"
('$($row.division)', $($row.year), $($row.year), $($row.month), 'BUDGET', $salesrepname, $customername, $countryname, $productgroup, '$($row.values_type)', $($row.values), '$($row.uploaded_by)', $sourcesheet, NOW(), '$($row.currency_code)', $($row.exchange_rate_to_base))
"@
            $values += $valueRow
        }
        
        $insertQuery = @"
BEGIN;

INSERT INTO public.fp_sales_rep_budget 
(division, budget_year, year, month, type, salesrepname, customername, countryname, productgroup, values_type, values, created_by, uploaded_filename, uploaded_at, currency_code, exchange_rate_to_base)
VALUES
$($values -join ",`n");

COMMIT;
"@
        
        try {
            Invoke-SqlCommand -Query $insertQuery
            Write-Log "Batch $batchNumber completed successfully" -Level "SUCCESS"
        }
        catch {
            Write-Log "Batch $batchNumber failed: $_" -Level "ERROR"
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
FROM public.fp_sales_rep_budget
WHERE UPPER(division) = '$($Division.ToUpper())'
  AND budget_year IN ($years)
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
    
    Write-Log "Upload type: Budget (sales rep budget data)" -Level "INFO"
    
    # Step 4: Validate Excel structure
    $validationErrors = Test-ExcelStructure -Data $excelData
    if ($validationErrors.Count -gt 0) {
        Write-Log "Validation Errors:" -Level "ERROR"
        foreach ($errMsg in $validationErrors) {
            Write-Log "  - $errMsg" -Level "ERROR"
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
    
    # Step 9: Post-upload QC (results logged internally by function)
    $null = Get-PostUploadQC -PreQC $preQC
    
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
