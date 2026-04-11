#!/bin/bash
# ============================================================
# VPS Database Import Script
# Run on VPS: bash /home/propackhub/scripts/vps-import-database.sh
# ============================================================

DB_USER="propackhub_user"
DB_PASSWORD="***REDACTED***"
IMPORT_DIR="/home/propackhub/database-export-full"

echo "============================================================"
echo "  ProPackHub Database Import"
echo "============================================================"
echo ""

# Check if import directory exists
if [ ! -d "$IMPORT_DIR" ]; then
    echo "❌ Import directory not found: $IMPORT_DIR"
    echo "   Upload the database-export-full folder first!"
    exit 1
fi

# Import fp_database
if [ -f "$IMPORT_DIR/fp_database_full.sql" ]; then
    echo "Importing fp_database..."
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d fp_database -f "$IMPORT_DIR/fp_database_full.sql" 2>&1 | tail -5
    echo "✅ fp_database imported"
    echo ""
fi

# Import ip_auth_database
if [ -f "$IMPORT_DIR/ip_auth_database_full.sql" ]; then
    echo "Importing ip_auth_database..."
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d ip_auth_database -f "$IMPORT_DIR/ip_auth_database_full.sql" 2>&1 | tail -5
    echo "✅ ip_auth_database imported"
    echo ""
fi

# Import propackhub_platform (if exists)
if [ -f "$IMPORT_DIR/propackhub_platform_full.sql" ]; then
    echo "Importing propackhub_platform..."
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d propackhub_platform -f "$IMPORT_DIR/propackhub_platform_full.sql" 2>&1 | tail -5
    echo "✅ propackhub_platform imported"
    echo ""
fi

# Restart backend
echo "Restarting backend..."
pm2 restart propackhub-backend

echo ""
echo "============================================================"
echo "  Import Complete!"
echo "============================================================"
echo ""
echo "Test the site at: https://propackhub.com"
echo ""

