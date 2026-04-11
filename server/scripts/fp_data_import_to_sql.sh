#!/bin/bash

# Set variables
PGPASSWORD="***REDACTED***"
PSQL_BIN="/Library/PostgreSQL/17/bin/psql"
CSV_PATH="/Users/mac/Library/CloudStorage/OneDrive-Personal/Website/IPDash 22.7/IPDash/fp_data.csv"
BACKUP_PATH="/Users/mac/Library/CloudStorage/OneDrive-Personal/Website/IPDash 22.7/IPDash/fp_data_backup.csv"
DB_NAME="postgres"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

# Export password for psql
export PGPASSWORD

# Backup current table
$PSQL_BIN -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "COPY fp_data TO '$BACKUP_PATH' CSV HEADER;"

# Truncate the table
$PSQL_BIN -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "TRUNCATE TABLE fp_data;"

# Import the CSV into the table
$PSQL_BIN -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\\COPY fp_data FROM '$CSV_PATH' CSV HEADER;"

echo "Imported fp_data from $CSV_PATH" 