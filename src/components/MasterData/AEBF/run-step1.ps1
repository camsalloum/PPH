# ============================================================================
# AEBF STEP 1 - Database Schema Updates Executor
# ============================================================================
# Safely executes database-updates-step1.sql with error handling
# ============================================================================

param(
    [string]$PgHost = "localhost",
    [string]$PgUser = "postgres",
    [string]$PgPassword = "***REDACTED***",
    [string]$PgDatabase = "fp_database",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Stop"

Write-Host "`n======================================================================"
Write-Host "AEBF IMPLEMENTATION - STEP 1: Database Schema Updates"
Write-Host "======================================================================`n"

# Check if SQL file exists
$sqlFile = Join-Path $PSScriptRoot "database-updates-step1.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ ERROR: SQL file not found: $sqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "📁 SQL Script: $sqlFile"
Write-Host "🗄️  Database: $PgDatabase@$PgHost"
Write-Host ""

# Confirm execution
$confirm = Read-Host "Ready to execute? This will add columns and tables. (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "❌ Cancelled by user" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n🚀 Executing Step 1 SQL script...`n"

try {
    # Set password environment variable
    $env:PGPASSWORD = $PgPassword
    
    # Find PostgreSQL bin directory
    $possiblePaths = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin",
        "C:\PostgreSQL\bin"
    )
    
    $psqlPath = $null
    foreach ($path in $possiblePaths) {
        if (Test-Path (Join-Path $path "psql.exe")) {
            $psqlPath = Join-Path $path "psql.exe"
            break
        }
    }
    
    if (-not $psqlPath) {
        Write-Host "❌ ERROR: psql.exe not found. Please ensure PostgreSQL is installed." -ForegroundColor Red
        Write-Host "Searched paths:" -ForegroundColor Yellow
        $possiblePaths | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        exit 1
    }
    
    Write-Host "✅ Found psql: $psqlPath`n"
    
    # Execute SQL file
    $arguments = @(
        "-h", $PgHost,
        "-p", $PgPort,
        "-U", $PgUser,
        "-d", $PgDatabase,
        "-f", $sqlFile
    )
    
    & $psqlPath $arguments
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n======================================================================"
        Write-Host "✅ STEP 1 COMPLETED SUCCESSFULLY" -ForegroundColor Green
        Write-Host "======================================================================`n"
        
        Write-Host "Tables Updated/Created:"
        Write-Host "  ✅ fp_data_excel (4 new columns added)" -ForegroundColor Green
        Write-Host "  ✅ fp_data_excel_backup (backup table created)" -ForegroundColor Green
        Write-Host "  ✅ fp_data_excel_archive (archive table created)" -ForegroundColor Green
        Write-Host "  ✅ aebf_upload_audit (audit table created)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Indexes Created: 13 performance indexes"
        Write-Host "Constraint Added: unique_actual_record"
        Write-Host ""
        Write-Host "📋 TESTING CHECKLIST - Run these commands to verify:"
        Write-Host ""
        Write-Host "1. Check table structure:"
        Write-Host "   psql -h $PgHost -U $PgUser -d $PgDatabase -c ""\d+ fp_data_excel""" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "2. Check sample data with new columns:"
        Write-Host "   psql -h $PgHost -U $PgUser -d $PgDatabase -c ""SELECT division, updated_at, uploaded_by FROM fp_data_excel LIMIT 5;""" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "3. Verify all tables created:"
        Write-Host "   psql -h $PgHost -U $PgUser -d $PgDatabase -c ""\dt+ fp_data_excel*""" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "4. Check audit table:"
        Write-Host "   psql -h $PgHost -U $PgUser -d $PgDatabase -c ""\d+ aebf_upload_audit""" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "If all tests pass, reply 'Approve Step 1' to proceed to Step 2"
        Write-Host "If issues occur, run rollback: .\run-step1-rollback.ps1"
        Write-Host "======================================================================`n"
    } else {
        Write-Host "`n❌ STEP 1 FAILED - Exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Check error messages above for details" -ForegroundColor Yellow
        Write-Host "To rollback changes, run: .\run-step1-rollback.ps1" -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host "`n❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "To rollback changes, run: .\run-step1-rollback.ps1" -ForegroundColor Yellow
    exit 1
} finally {
    # Clear password from environment
    $env:PGPASSWORD = $null
}
