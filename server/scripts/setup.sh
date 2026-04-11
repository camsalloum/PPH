#!/bin/bash

# IPDash Setup Script
# This script automates the installation and setup process for the IPDash application
# Modified to focus on dependency installation without requiring PostgreSQL

echo "=== IPDash Setup Script ==="
echo "This script will install all dependencies and set up the application."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v14 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js v14 or higher."
    exit 1
fi

echo "✅ Node.js $(node -v) is installed."

# Skip PostgreSQL check as we're focusing on dependencies only
echo "ℹ️ PostgreSQL will be installed later. Proceeding with dependency installation only."
POSTGRES_MISSING=true

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install --legacy-peer-deps

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd server
npm install --legacy-peer-deps
cd ..

# Check if .env files exist, if not create them from examples
echo "🔧 Setting up environment files..."

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️ Please update the .env file with your actual configuration."
fi

if [ ! -f "server/.env" ] && [ -f "server/.env.example" ]; then
    cp server/.env.example server/.env
    echo "✅ Created server/.env file from server/.env.example"
    echo "⚠️ Please update the server/.env file with your actual database credentials."
fi

# Check if data files exist
echo "🔍 Checking data files..."
if [ ! -d "server/data" ]; then
    mkdir -p server/data
    echo "✅ Created server/data directory"
fi

DATA_FILES=("fp_data.xlsx" "Sales.xlsx" "financials.xlsx")
MISSING_FILES=false

for file in "${DATA_FILES[@]}"; do
    if [ ! -f "server/data/$file" ]; then
        echo "❌ Missing data file: server/data/$file"
        MISSING_FILES=true
    else
        echo "✅ Found data file: server/data/$file"
    fi
done

if [ "$MISSING_FILES" = true ]; then
    echo "⚠️ Some data files are missing. Please add them to the server/data directory."
fi

# Skip database connection test
echo "⚠️ Skipping database connection test since PostgreSQL will be installed later."


echo ""
echo "=== Dependencies Installation Complete ==="
echo "⚠️ IMPORTANT: PostgreSQL still needs to be installed for full functionality."
echo ""
echo "Next steps:"
echo "1. Install PostgreSQL from https://www.postgresql.org/download/"
echo "2. Update the server/.env file with your database credentials"
echo "3. Run ./setup-database.sh to set up the database"
echo ""
echo "Until PostgreSQL is installed:"
echo "- You can run ./start-frontend-only.sh to start just the frontend"
echo "- For full functionality, install PostgreSQL and run ./start-servers.sh"
echo ""
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3001 (requires PostgreSQL)"
echo ""
echo "⚠️ Make sure to update the .env files with your actual configuration."
echo "⚠️ Make sure to import the data into PostgreSQL if not already done."