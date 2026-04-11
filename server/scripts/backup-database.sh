#!/bin/bash
# ============================================================
# PostgreSQL Database Backup Script (Linux/Mac)
# Creates a complete backup of the fp_database
# ============================================================

# Default values
FORMAT="custom"
BACKUP_DIR="backups/database"
COMPRESS=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--format)
            FORMAT="$2"
            shift 2
            ;;
        -d|--directory)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --no-compress)
            COMPRESS=false
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -f, --format FORMAT      Backup format: plain, custom, tar (default: custom)"
            echo "  -d, --directory DIR      Backup directory (default: backups/database)"
            echo "  --no-compress           Disable compression"
            echo "  -h, --help              Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}PostgreSQL Database Backup Script${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}❌ pg_dump not found!${NC}"
    echo -e "${RED}Please ensure PostgreSQL is installed and pg_dump is in your PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found pg_dump: $(which pg_dump)${NC}"
echo ""

# Load environment variables from .env file
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE="$SCRIPT_DIR/server/.env"
fi

DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASSWORD=""
DB_NAME="fp_database"

# Read .env file if it exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${CYAN}📄 Reading configuration from: $ENV_FILE${NC}"
    while IFS= read -r line; do
        if [[ $line =~ ^DB_USER=(.+)$ ]]; then
            DB_USER="${BASH_REMATCH[1]}"
        elif [[ $line =~ ^DB_HOST=(.+)$ ]]; then
            DB_HOST="${BASH_REMATCH[1]}"
        elif [[ $line =~ ^DB_PORT=(.+)$ ]]; then
            DB_PORT="${BASH_REMATCH[1]}"
        elif [[ $line =~ ^DB_PASSWORD=(.+)$ ]]; then
            DB_PASSWORD="${BASH_REMATCH[1]}"
        elif [[ $line =~ ^DB_NAME=(.+)$ ]]; then
            DB_NAME="${BASH_REMATCH[1]}"
        fi
    done < "$ENV_FILE"
    echo -e "${GREEN}✅ Configuration loaded from .env${NC}"
else
    echo -e "${YELLOW}⚠️ .env file not found, using default values${NC}"
    echo -e "${YELLOW}   Create a .env file in the project root with:${NC}"
    echo -e "${YELLOW}   DB_HOST=localhost${NC}"
    echo -e "${YELLOW}   DB_PORT=5432${NC}"
    echo -e "${YELLOW}   DB_USER=postgres${NC}"
    echo -e "${YELLOW}   DB_PASSWORD=your_password${NC}"
    echo -e "${YELLOW}   DB_NAME=fp_database${NC}"
fi

echo ""
echo -e "${CYAN}Database Configuration:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
if [ -n "$DB_PASSWORD" ]; then
    echo "  Password: ***"
else
    echo "  Password: Not set - you may be prompted"
fi
echo ""

# Create backup directory if it doesn't exist
BACKUP_PATH="$SCRIPT_DIR/$BACKUP_DIR"
mkdir -p "$BACKUP_PATH"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup directory ready: $BACKUP_PATH${NC}"
fi

# Generate timestamp for backup file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_STR=$(date +"%Y-%m-%d %H:%M:%S")

# Determine backup file extension based on format
case "$FORMAT" in
    "plain")
        EXTENSION=".sql"
        ;;
    "custom")
        EXTENSION=".backup"
        ;;
    "tar")
        EXTENSION=".tar"
        ;;
    *)
        EXTENSION=".backup"
        ;;
esac

BACKUP_FILENAME="fp_database_backup_${TIMESTAMP}${EXTENSION}"
BACKUP_FILEPATH="$BACKUP_PATH/$BACKUP_FILENAME"

echo ""
echo -e "${CYAN}Starting backup...${NC}"
echo "  Format: $FORMAT"
echo "  Output: $BACKUP_FILEPATH"
echo ""

# Set PGPASSWORD environment variable if password is provided
if [ -n "$DB_PASSWORD" ]; then
    export PGPASSWORD="$DB_PASSWORD"
fi

# Build pg_dump command
DUMP_CMD="pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

# Add format option
case "$FORMAT" in
    "plain")
        DUMP_CMD="$DUMP_CMD -F p --clean --if-exists --create"
        ;;
    "custom")
        DUMP_CMD="$DUMP_CMD -F c"
        if [ "$COMPRESS" = true ]; then
            DUMP_CMD="$DUMP_CMD -Z 9"
        fi
        ;;
    "tar")
        DUMP_CMD="$DUMP_CMD -F t"
        ;;
esac

DUMP_CMD="$DUMP_CMD -v -f $BACKUP_FILEPATH"

# Execute pg_dump
echo -e "${CYAN}Executing: $DUMP_CMD${NC}"
echo ""

LOG_FILE="$BACKUP_PATH/backup_${TIMESTAMP}.log"
if $DUMP_CMD > "$LOG_FILE" 2>&1; then
    # Get backup file size
    if [ -f "$BACKUP_FILEPATH" ]; then
        FILE_SIZE=$(stat -f%z "$BACKUP_FILEPATH" 2>/dev/null || stat -c%s "$BACKUP_FILEPATH" 2>/dev/null)
        FILE_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $FILE_SIZE/1024/1024}")
        
        echo ""
        echo -e "${GREEN}✅ Backup completed successfully!${NC}"
        echo -e "${GREEN}   File: $BACKUP_FILENAME${NC}"
        echo -e "${GREEN}   Size: $FILE_SIZE_MB MB${NC}"
        echo -e "${GREEN}   Location: $BACKUP_FILEPATH${NC}"
        echo -e "${GREEN}   Timestamp: $DATE_STR${NC}"
        
        # Create a metadata file
        METADATA_FILE="$BACKUP_PATH/backup_${TIMESTAMP}.info"
        cat > "$METADATA_FILE" <<EOF
Backup Information
==================
Database: $DB_NAME
Host: $DB_HOST
Port: $DB_PORT
User: $DB_USER
Backup Date: $DATE_STR
Format: $FORMAT
File: $BACKUP_FILENAME
Size: $FILE_SIZE_MB MB
Location: $BACKUP_FILEPATH
EOF
        
        echo ""
        echo -e "${CYAN}📋 Metadata saved to: backup_${TIMESTAMP}.info${NC}"
        
        # List recent backups
        echo ""
        echo -e "${CYAN}Recent backups:${NC}"
        ls -lth "$BACKUP_PATH"/fp_database_backup_*"$EXTENSION" 2>/dev/null | head -5 | awk '{print "  " $9 " - " $5 " - " $6 " " $7 " " $8}'
    else
        echo -e "${RED}❌ Backup file was not created!${NC}"
        exit 1
    fi
else
    EXIT_CODE=$?
    echo -e "${RED}❌ Backup failed with exit code: $EXIT_CODE${NC}"
    if [ -f "$LOG_FILE" ]; then
        echo -e "${RED}Error log:${NC}"
        cat "$LOG_FILE" | sed 's/^/  /'
    fi
    exit 1
fi

# Clear password from environment
unset PGPASSWORD

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}Backup process completed!${NC}"
echo -e "${CYAN}============================================${NC}"

















