# ============================================================
# Full PostgreSQL Database Export (includes EVERYTHING)
# - Tables + Data
# - Sequences (auto-increment)
# - Views
# - Functions & Triggers
# - Indexes
# ============================================================

$EXPORT_DIR = "database-export-full"
$PG_USER = "postgres"
$PG_PASSWORD = "***REDACTED***"
$PG_HOST = "localhost"
$PG_DUMP = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Full Database Export" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check if pg_dump exists
if (-not (Test-Path $PG_DUMP)) {
    Write-Host "ERROR: pg_dump not found at $PG_DUMP" -ForegroundColor Red
    Write-Host "Please update the path in this script" -ForegroundColor Yellow
    exit 1
}

# Set password for pg_dump
$env:PGPASSWORD = $PG_PASSWORD

# Create export directory
if (-not (Test-Path $EXPORT_DIR)) {
    New-Item -ItemType Directory -Path $EXPORT_DIR -Force | Out-Null
}

# Export fp_database (complete)
Write-Host ""
Write-Host "Exporting fp_database..." -ForegroundColor Yellow
& $PG_DUMP -h $PG_HOST -U $PG_USER -d fp_database --no-owner --no-acl --clean --if-exists -f "$EXPORT_DIR\fp_database_full.sql" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0 -and (Test-Path "$EXPORT_DIR\fp_database_full.sql")) {
    $size = (Get-Item "$EXPORT_DIR\fp_database_full.sql").Length / 1MB
    Write-Host "  ✅ fp_database exported ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ❌ fp_database export failed" -ForegroundColor Red
}

# Export ip_auth_database (complete)
Write-Host ""
Write-Host "Exporting ip_auth_database..." -ForegroundColor Yellow
& $PG_DUMP -h $PG_HOST -U $PG_USER -d ip_auth_database --no-owner --no-acl --clean --if-exists -f "$EXPORT_DIR\ip_auth_database_full.sql" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0 -and (Test-Path "$EXPORT_DIR\ip_auth_database_full.sql")) {
    $size = (Get-Item "$EXPORT_DIR\ip_auth_database_full.sql").Length / 1MB
    Write-Host "  ✅ ip_auth_database exported ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ❌ ip_auth_database export failed" -ForegroundColor Red
}

# Export propackhub_platform (if exists)
Write-Host ""
Write-Host "Exporting propackhub_platform..." -ForegroundColor Yellow
& $PG_DUMP -h $PG_HOST -U $PG_USER -d propackhub_platform --no-owner --no-acl --clean --if-exists -f "$EXPORT_DIR\propackhub_platform_full.sql" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0 -and (Test-Path "$EXPORT_DIR\propackhub_platform_full.sql")) {
    $size = (Get-Item "$EXPORT_DIR\propackhub_platform_full.sql").Length / 1MB
    Write-Host "  ✅ propackhub_platform exported ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  propackhub_platform not found or empty" -ForegroundColor Gray
}

# Clear password
$env:PGPASSWORD = ""

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Export Complete!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Files created in: $PWD\$EXPORT_DIR" -ForegroundColor White
Write-Host ""
Write-Host "These SQL files contain EVERYTHING:" -ForegroundColor Yellow
Write-Host "  - All tables with data"
Write-Host "  - All sequences (auto-increment)"
Write-Host "  - All views"
Write-Host "  - All functions and triggers"
Write-Host "  - All indexes"
Write-Host ""
Write-Host "To import on VPS:" -ForegroundColor Yellow
Write-Host "  PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -f fp_database_full.sql"
Write-Host "  PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -f ip_auth_database_full.sql"
Write-Host ""

