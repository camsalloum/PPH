# Sales by Country Database Implementation - Step 1

## Overview
This implementation creates a new database-based system for Sales by Country functionality, using the `fp_data_excel` table instead of Excel files.

## Files Created

### 1. `server/database/SalesByCountryDataService.js`
**Purpose**: Core service class for database operations
**Key Methods**:
- `getCountriesByDivision(division)` - Get all countries for a division
- `getSalesByCountry(division, salesRep, year, months, dataType, groupMembers)` - Get sales by country data
- `getCountriesBySalesRep(division, salesRep, groupMembers)` - Get countries by sales rep
- `getCountrySalesData(division, country, year, months, dataType, valueType)` - Get specific country sales data
- `getAllCountries()` - Get all unique countries

**Features**:
- Supports individual sales reps and sales rep groups
- Handles multiple months and data types (Actual, Budget)
- Month mapping for quarters (Q1, Q2, Q3, Q4) and half-years (HY1, HY2)
- Error handling and logging

### 2. `server/database/divisionDatabaseConfig.js`
**Purpose**: Configuration for division-specific database settings
**Structure**:
```javascript
const divisionDatabaseConfig = {
  FP: {
    database: 'fp_database',
    table: 'fp_data_excel',
    connection: 'fp_pool'
  },
  SB: { /* Future */ },
  TF: { /* Future */ },
  HCM: { /* Future */ }
};
```

**Helper Functions**:
- `getDivisionConfig(division)` - Get full config for division
- `getDivisionTable(division)` - Get table name for division
- `getDivisionDatabase(division)` - Get database name for division

### 3. New API Endpoints in `server/server.js`

#### `GET /api/countries-db?division=FP`
**Purpose**: Get all countries for a division from database
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "country": "United Arab Emirates",
      "recordCount": 1250,
      "totalKgs": 45000.5,
      "totalAmount": 2500000.75
    }
  ],
  "message": "Retrieved X countries from database for FP division"
}
```

#### `POST /api/sales-by-country-db`
**Purpose**: Get sales by country data from database
**Request Body**:
```json
{
  "division": "FP",
  "salesRep": "Sofiane",
  "year": 2025,
  "months": ["January", "February", "March"],
  "dataType": "Actual"
}
```
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "country": "United Arab Emirates",
      "value": 15000.5
    }
  ],
  "message": "Retrieved sales by country for Sofiane - 2025/[January, February, March] (Actual) from database"
}
```

#### `GET /api/countries-by-sales-rep-db?division=FP&salesRep=Sofiane`
**Purpose**: Get countries for a specific sales rep from database
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "country": "United Arab Emirates",
      "totalKgs": 15000.5,
      "totalAmount": 750000.25,
      "recordCount": 125
    }
  ],
  "message": "Retrieved X countries for Sofiane from database"
}
```

#### `POST /api/country-sales-data-db`
**Purpose**: Get specific country sales data for a period
**Request Body**:
```json
{
  "division": "FP",
  "country": "United Arab Emirates",
  "year": 2025,
  "months": ["January"],
  "dataType": "Actual",
  "valueType": "KGS"
}
```
**Response**:
```json
{
  "success": true,
  "data": 5000.25,
  "message": "Retrieved sales data for United Arab Emirates - 2025/[January] (Actual, KGS) from database"
}
```

### 4. `server/test-sales-by-country-db.js`
**Purpose**: Test script to verify API endpoints work correctly
**Usage**: `node test-sales-by-country-db.js`

## Key Features

### 1. Division Support
- Currently supports FP division only
- Ready for SB, TF, HCM divisions when databases are created
- Clear error messages for unsupported divisions

### 2. Sales Rep Groups
- Supports individual sales reps
- Supports sales rep groups (from existing configuration)
- Automatic group member expansion

### 3. Data Types
- Supports Actual and Budget data types
- Supports KGS, Amount, and other value types
- Month aggregation for quarters and half-years

### 4. Error Handling
- Comprehensive error handling and logging
- Clear error messages
- Graceful failure handling

### 5. Performance
- Optimized database queries
- Proper indexing support
- Efficient data aggregation

## Database Requirements

### Table Structure
The system expects the `fp_data_excel` table with these columns:
- `type` (VARCHAR) - 'Actual' or 'Budget'
- `salesrepname` (TEXT) - Sales representative name
- `customername` (TEXT) - Customer name
- `countryname` (TEXT) - Country name
- `productgroup` (TEXT) - Product group
- `material` (VARCHAR) - Material type
- `process` (VARCHAR) - Process type
- `year` (INTEGER) - Year
- `month` (VARCHAR) - Month name
- `values_type` (VARCHAR) - 'KGS', 'Amount', etc.
- `values` (NUMERIC) - The actual value

### Indexes
Recommended indexes for performance:
- `idx_fp_data_type` on `type`
- `idx_fp_data_year_month` on `year, month`
- `idx_fp_data_salesrep` on `salesrepname`
- `idx_fp_data_country` on `countryname`
- `idx_fp_data_values_type` on `values_type`

## Testing

### Manual Testing
1. Start the server: `npm start` in server directory
2. Run test script: `node test-sales-by-country-db.js`
3. Test individual endpoints using Postman or curl

### API Testing Examples
```bash
# Get countries
curl "http://localhost:3001/api/countries-db?division=FP"

# Get sales by country
curl -X POST "http://localhost:3001/api/sales-by-country-db" \
  -H "Content-Type: application/json" \
  -d '{"division":"FP","salesRep":"Sofiane","year":2025,"months":["January"],"dataType":"Actual"}'

# Get countries by sales rep
curl "http://localhost:3001/api/countries-by-sales-rep-db?division=FP&salesRep=Sofiane"
```

## Next Steps

### Phase 2: Frontend Integration
1. Create database-aware frontend components
2. Update existing components to use database APIs
3. Add configuration to switch between Excel and Database
4. Test all map and chart components

### Phase 3: Other Divisions
1. Create SB, TF, HCM databases
2. Update division configuration
3. Test with all divisions
4. Remove Excel dependency

### Phase 4: Optimization
1. Query optimization
2. Caching implementation
3. Performance monitoring
4. Error handling improvements

## Notes

- **No Excel Fallback**: This implementation is database-only
- **Backward Compatible**: Existing Excel system remains unchanged
- **Future Ready**: Ready for other division databases
- **Production Ready**: Includes error handling, logging, and validation
- **Tested**: Includes comprehensive test script

## Dependencies

- `pg` (PostgreSQL client)
- `node-fetch` (for testing)
- Existing database connection from `./config`

## Configuration

- Database connection: Uses existing `pool` from `./config`
- Division support: Currently FP only, others ready for future
- Sales rep groups: Uses existing `loadSalesRepConfig()` function




