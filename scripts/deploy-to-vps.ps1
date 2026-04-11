# ============================================================
# ProPackHub One-Click Deployment Script
# Run from: D:\PPH 26.01\
# ============================================================

param(
    [switch]$FullDatabaseSync,  # Include full database dump
    [switch]$FrontendOnly,      # Only deploy frontend build
    [switch]$BackendOnly,       # Only deploy backend files
    [switch]$SkipBuild          # Skip npm run build
)

$VPS_HOST = "propackhub.com"
$VPS_USER = "propackhub"
$VPS_PATH = "/home/propackhub"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ProPackHub Deployment Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build frontend (unless skipped)
if (-not $SkipBuild -and -not $BackendOnly) {
    Write-Host "[1/4] Building frontend..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build complete" -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping build" -ForegroundColor Gray
}

# Step 2: Create deployment package
Write-Host ""
Write-Host "[2/4] Creating deployment package..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$deployDir = "deploy_$timestamp"

New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

if (-not $BackendOnly) {
    # Copy frontend build
    Copy-Item -Path "build\*" -Destination "$deployDir\public_html\" -Recurse -Force
    Write-Host "  ✅ Frontend files copied" -ForegroundColor Green
}

if (-not $FrontendOnly) {
    # Copy backend (excluding node_modules and .env)
    $backendExcludes = @("node_modules", ".env", "*.log", "uploads")
    Copy-Item -Path "server\*" -Destination "$deployDir\server\" -Recurse -Force -Exclude $backendExcludes
    
    # Copy package files for npm install on VPS
    Copy-Item -Path "server\package.json" -Destination "$deployDir\server\" -Force
    Copy-Item -Path "server\package-lock.json" -Destination "$deployDir\server\" -Force -ErrorAction SilentlyContinue
    Write-Host "  ✅ Backend files copied" -ForegroundColor Green
}

# Step 3: Database dump (if requested)
if ($FullDatabaseSync) {
    Write-Host ""
    Write-Host "[3/4] Creating database dumps..." -ForegroundColor Yellow
    
    New-Item -ItemType Directory -Path "$deployDir\database" -Force | Out-Null
    
    # Dump fp_database
    & pg_dump -h localhost -U postgres -d fp_database --no-owner --no-acl -f "$deployDir\database\fp_database_full.sql"
    Write-Host "  ✅ fp_database dumped" -ForegroundColor Green
    
    # Dump ip_auth_database  
    & pg_dump -h localhost -U postgres -d ip_auth_database --no-owner --no-acl -f "$deployDir\database\ip_auth_database_full.sql"
    Write-Host "  ✅ ip_auth_database dumped" -ForegroundColor Green
} else {
    Write-Host "[3/4] Skipping database dump (use -FullDatabaseSync to include)" -ForegroundColor Gray
}

# Step 4: Create upload instructions
Write-Host ""
Write-Host "[4/4] Deployment package ready!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  UPLOAD INSTRUCTIONS" -ForegroundColor Cyan  
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Package location: $PWD\$deployDir" -ForegroundColor White
Write-Host ""
Write-Host "Upload to VPS using WHM File Manager:" -ForegroundColor Yellow
Write-Host "  1. Upload $deployDir\public_html\* to /home/propackhub/public_html/"
Write-Host "  2. Upload $deployDir\server\* to /home/propackhub/server/"
if ($FullDatabaseSync) {
    Write-Host "  3. Upload $deployDir\database\*.sql to /home/propackhub/database/"
    Write-Host ""
    Write-Host "Then run on VPS:" -ForegroundColor Yellow
    Write-Host "  cd /home/propackhub/server && npm install"
    Write-Host "  PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -f /home/propackhub/database/fp_database_full.sql"
    Write-Host "  PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -f /home/propackhub/database/ip_auth_database_full.sql"
}
Write-Host "  pm2 restart propackhub-backend"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

