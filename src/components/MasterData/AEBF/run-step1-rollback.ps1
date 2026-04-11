# ============================================================================
# AEBF STEP 1 - ROLLBACK Script Executor
# ============================================================================
# Safely executes rollback-step1.sql to revert Step 1 changes
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
Write-Host "AEBF STEP 1 - ROLLBACK" -ForegroundColor Yellow
Write-Host "======================================================================`n"

Write-Host "⚠️  WARNING: This will remove all Step 1 changes:" -ForegroundColor Yellow
Write-Host "  - Drop 4 columns: division, updated_at, uploaded_by, sourcesheet"
Write-Host "  - Drop 3 tables: backup, archive, audit"
Write-Host "  - Drop unique constraint and indexes"
Write-Host ""

$confirm = Read-Host "Are you sure you want to rollback Step 1? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "❌ Rollback cancelled" -ForegroundColor Green
    exit 0
}

$sqlFile = Join-Path $PSScriptRoot "rollback-step1.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ ERROR: Rollback SQL file not found: $sqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "`n🔄 Executing rollback...`n"

try {
    $env:PGPASSWORD = $PgPassword
    
    # Find psql
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
        Write-Host "❌ ERROR: psql.exe not found" -ForegroundColor Red
        exit 1
    }
    
    $arguments = @(
        "-h", $PgHost,
        "-p", $PgPort,
        "-U", $PgUser,
        "-d", $PgDatabase,
        "-f", $sqlFile
    )
    
    & $psqlPath $arguments
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ ROLLBACK COMPLETED SUCCESSFULLY" -ForegroundColor Green
        Write-Host "Table fp_data_excel restored to original structure`n"
    } else {
        Write-Host "`n❌ ROLLBACK FAILED" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "`n❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    $env:PGPASSWORD = $null
}
