# FP Data Database Setup Guide

## Prerequisites

1. **PostgreSQL Installation**: Ensure PostgreSQL is installed and running on your system
2. **pgAdmin 4**: Install pgAdmin 4 for database management (optional but recommended)
3. **Node.js**: Ensure Node.js is installed for running the application

## Setup Instructions

### Step 1: Configure Database Connection

1. Open the `.env` file in the server directory
2. Update the database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_actual_password_here

# Server Configuration
PORT=3001
```

**Important**: Replace `your_actual_password_here` with your actual PostgreSQL password.

### Step 2: Import FP Data

Import the `fp_data.xlsx` file into your PostgreSQL database as the `fp_data` table using DBeaver or pgAdmin.

### Step 3: Verify Setup

1. **Check Database**: Open pgAdmin 4 and verify:
   - `postgres` database exists
   - `fp_data` table exists with data

2. **Test API Connection**: Start the server and test the database connection:

```bash
node server.js
```

Then visit: `http://localhost:3001/api/db/test`

## Database Schema

The `fp_data` table includes:

- **Basic Info**: `salesrepname`, `customername`, `countryname`, `productgroup`, `values_type`
- **Data Columns**: `type`, `year`, `month`, `value`
- **Metadata**: `id` (auto-increment), `created_at` (timestamp)

## API Endpoints

Once setup is complete, the following endpoints will be available:

### Database Test
- `GET /api/db/test` - Test database connection

### FP Data Endpoints
- `GET /api/fp/sales-reps-from-db` - Get sales reps directly from database
- `GET /api/fp/product-groups` - Get all product groups (optionally filtered by sales rep)
- `GET /api/fp/sales-data` - Get sales data with filters

### Query Parameters

The product groups endpoint supports filtering:
- `salesRep` - Filter product groups by sales representative

## Troubleshooting

### Common Issues

1. **Connection Failed**:
   - Verify PostgreSQL is running
   - Check credentials in `.env` file
   - Ensure database user has necessary permissions

2. **Import Failed**:
   - Verify `fp_data.xlsx` exists
   - Check file permissions
   - Ensure Excel format is correct

3. **Permission Errors**:
   - Ensure PostgreSQL user has necessary permissions
   - Check file system permissions

### Manual Database Creation

If automatic setup fails, you can manually create the database:

1. Open pgAdmin 4
2. Right-click on "Databases"
3. Select "Create" > "Database"
4. Name it "postgres"
5. Run the setup script again

## Next Steps

After successful setup:
1. The database is ready for FP division data
2. Sales representative data can be managed through the Master Data interface
3. Product groups and sales data will be dynamically loaded
4. Excel dependencies remain for other dashboard features

## Development Notes

- The database uses a long format with normalized data structure
- Data is filtered by sales representative, product group, and time period
- The system supports both individual sales reps and sales rep groups
- **Backup Strategy**: Implement regular database backups
- **Performance**: Consider indexing on frequently queried columns (`salesrepname`, `productgroup`, `countryname`)