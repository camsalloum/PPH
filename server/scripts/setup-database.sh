#!/bin/bash

# IPDash Database Setup Script
# This script helps set up the PostgreSQL database for IPDash

echo "=== IPDash Database Setup ==="
echo "This script will help you set up the PostgreSQL database for IPDash."
echo ""

# Load environment variables from .env file
if [ -f "server/.env" ]; then
    source <(grep -v '^#' server/.env | sed -E 's/(.*)=(.*)/export \1="\2"/')
    echo "✅ Loaded database configuration from server/.env"
else
    echo "❌ server/.env file not found. Please run setup.sh first."
    exit 1
fi

# Set default values if not in .env
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-postgres}
DB_USER=${DB_USER:-postgres}

# Prompt for password if not set
if [ -z "$DB_PASSWORD" ]; then
    echo "Enter your PostgreSQL password for user $DB_USER:"
    read -s DB_PASSWORD
    echo ""
fi

# Test database connection
echo "🔌 Testing database connection..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\q" 2>/dev/null; then
    echo "✅ Successfully connected to PostgreSQL database."
else
    echo "❌ Failed to connect to PostgreSQL database."
    echo "Please check your database credentials in server/.env"
    exit 1
fi

# Check if fp_data table exists
TABLE_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fp_data');")

if [[ $TABLE_EXISTS == *"t"* ]]; then
    echo "✅ fp_data table already exists."
    
    # Ask if user wants to recreate the table
    echo "Do you want to recreate the fp_data table? This will delete all existing data. (y/n)"
    read RECREATE
    
    if [[ $RECREATE == "y" || $RECREATE == "Y" ]]; then
        echo "Dropping existing fp_data table..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DROP TABLE IF EXISTS fp_data;"
        echo "✅ Dropped existing fp_data table."
    else
        echo "Keeping existing fp_data table."
        echo "Database setup complete."
        exit 0
    fi
fi

# Create fp_data table
echo "Creating fp_data table..."
if [ -f "setup_fp_data_long_format.sql" ]; then
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f setup_fp_data_long_format.sql
    echo "✅ Created fp_data table."
else
    echo "❌ setup_fp_data_long_format.sql not found."
    echo "Creating basic fp_data table structure..."
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    CREATE TABLE IF NOT EXISTS fp_data (
        id SERIAL PRIMARY KEY,
        year INTEGER,
        month VARCHAR(20),
        type VARCHAR(20),
        salesrepname VARCHAR(100),
        customername VARCHAR(100),
        countryname VARCHAR(50),
        productgroup VARCHAR(100),
        material VARCHAR(100),
        process VARCHAR(100),
        values_type VARCHAR(50),
        values NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_fp_data_salesrep ON fp_data(salesrepname);
    CREATE INDEX IF NOT EXISTS idx_fp_data_productgroup ON fp_data(productgroup);
    CREATE INDEX IF NOT EXISTS idx_fp_data_year_month ON fp_data(year, month);
    "
    
    echo "✅ Created basic fp_data table structure."
fi

# Import data from Excel file
echo "Do you want to import data from fp_data.xlsx? (y/n)"
read IMPORT_DATA

if [[ $IMPORT_DATA == "y" || $IMPORT_DATA == "Y" ]]; then
    if [ -f "server/data/fp_data.xlsx" ]; then
        echo "Importing data from fp_data.xlsx..."
        echo "This feature requires manual import using DBeaver or pgAdmin."
        echo "Please follow the instructions in DBeaver_Setup_Guide.md"
    else
        echo "❌ server/data/fp_data.xlsx not found."
        echo "Please add the file and then import manually using DBeaver or pgAdmin."
    fi
fi

# Run data cleanup script if available
if [ -f "data_cleanup_script.sql" ]; then
    echo "Do you want to run the data cleanup script? (y/n)"
    read RUN_CLEANUP
    
    if [[ $RUN_CLEANUP == "y" || $RUN_CLEANUP == "Y" ]]; then
        echo "Running data cleanup script..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f data_cleanup_script.sql
        echo "✅ Data cleanup complete."
    fi
fi

echo ""
echo "=== Database Setup Complete ==="
echo "You can now start the application using ./start-servers.sh"