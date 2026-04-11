# Universal Sales by Country Database Implementation - Step 1

## Overview
This implementation creates a universal database-based system for Sales by Country functionality, supporting all divisions (FP, SB, TF, HCM) with their respective `xx_data_excel` tables.

## Files Created

### 1. `server/database/UniversalSalesByCountryService.js`
**Purpose**: Universal service class for database operations across all divisions
**Key Methods**:
- `getCountriesByDivision(division)` - Get all countries for a division
- `getSalesByCountry(division, salesRep, year, months, dataType, groupMembers)` - Get sales by country data
- `getCountriesBySalesRep(division, salesRep, groupMembers)` - Get countries by sales rep
- `getCountrySalesData(division, country, year, months, dataType, valueType)` - Get specific country sales data
- `getAllCountries(division)` - Get all unique countries
- `getSalesRepsByDivision(division)` - Get sales reps for a division
- `getDivisionSummary(division)` - Get summary statistics

**Features**:
- Supports all divisions: FP, SB, TF, HCM
- Uses appropriate table names: `fp_data_excel`, `sb_data_excel`, `tf_data_excel`, `hcm_data_excel`
- Handles sales rep groups and individual reps
- Month aggregation for quarters and half-years
- Error handling and validation

### 2. `server/database/divisionDatabaseConfig.js`
**Purpose**: Configuration management for each division's database
**Key Functions**:
- `getDivisionConfig(division)` - Get database configuration
- `getTableName(division)` - Get table name for division
- `getDatabaseName(division)` - Get database name for division
- `isDivisionActive(division)` - Check if division is active
- `validateDivision(division)` - Validate division parameter
- `getDivisionInfo(division)` - Get division info for frontend

**Configuration**:
- **FP**: Active, uses `fp_data_excel` table
- **SB**: Planned, will use `sb_data_excel` table
- **TF**: Planned, will use `tf_data_excel` table
- **HCM**: Planned, will use `hcm_data_excel` table

### 3. New API Endpoints (added to `server/server.js`)

#### **GET /api/division-info**
- **Purpose**: Get division information and status
- **Parameters**: `division` (query)
- **Response**: Division info including database, table, status
- **Example**: `GET /api/division-info?division=FP`

#### **GET /api/countries-db**
- **Purpose**: Get countries from database for any division
- **Parameters**: `division` (query)
- **Response**: Array of countries
- **Example**: `GET /api/countries-db?division=FP`

#### **POST /api/sales-by-country-db**
- **Purpose**: Get sales by country data from database
- **Parameters**: `division`, `salesRep`, `year`, `months`, `dataType` (body)
- **Response**: Array of country sales data
- **Example**: `POST /api/sales-by-country-db` with body

#### **GET /api/countries-by-sales-rep-db**
- **Purpose**: Get countries for a specific sales rep
- **Parameters**: `division`, `salesRep` (query)
- **Response**: Array of countries
- **Example**: `GET /api/countries-by-sales-rep-db?division=FP&salesRep=Sofiane`

#### **POST /api/country-sales-data-db**
- **Purpose**: Get detailed sales data for a specific country
- **Parameters**: `division`, `country`, `year`, `months`, `dataType`, `valueType` (body)
- **Response**: Array of detailed sales records
- **Example**: `POST /api/country-sales-data-db` with body

### 4. `server/test-universal-sales-by-country.js`
**Purpose**: Test script to verify all new endpoints work correctly
**Tests**:
- Division info endpoint
- Countries endpoint
- Sales by country endpoint
- Countries by sales rep endpoint
- Country sales data endpoint
- Error handling for invalid divisions

## Database Structure

Each division will have its own table with identical structure:
```sql
CREATE TABLE xx_data_excel (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50),           -- 'Actual', 'Budget', 'Forecast'
  salesrepname VARCHAR(255),
  customername VARCHAR(255),
  countryname VARCHAR(255),
  productgroup VARCHAR(255),
  material VARCHAR(255),
  process VARCHAR(255),
  year INTEGER,
  month INTEGER,
  values_type VARCHAR(50),    -- 'KGS', 'Amount'
  values DECIMAL(15,2)
);
```

## Current Status

### ✅ **Implemented (FP Division)**
- Universal service class
- Division configuration
- All API endpoints
- Error handling and validation
- Test script

### 🔄 **Ready for Implementation (SB, TF, HCM Divisions)**
- Service supports all divisions
- Configuration ready
- API endpoints ready
- Need database tables: `sb_data_excel`, `tf_data_excel`, `hcm_data_excel`

## Migration Benefits

1. **Consistency**: All divisions use same database structure
2. **Performance**: Database queries faster than Excel parsing
3. **Scalability**: Easy to add new divisions
4. **Maintenance**: Single codebase for all divisions
5. **Real-time**: No need to upload Excel files
6. **Validation**: Proper error handling and division validation

## Next Steps

### **Step 2: Frontend Integration**
- Update `SalesDataContext.js` to use database endpoints
- Update `CountryReference.js` to use database for all divisions
- Update `SalesByCountryTable.js` to use database data
- Remove Excel dependencies

### **Step 3: Database Creation**
- Create `sb_data_excel` table for SB division
- Create `tf_data_excel` table for TF division
- Create `hcm_data_excel` table for HCM division
- Import data from Excel files

### **Step 4: Testing & Validation**
- Test all divisions with real data
- Validate data consistency
- Performance testing
- User acceptance testing

## Usage Examples

### **Get Division Info**
```javascript
const response = await fetch('/api/division-info?division=FP');
const data = await response.json();
// Returns: { division: 'FP', status: 'active', database: 'fp_database', table: 'fp_data_excel' }
```

### **Get Countries**
```javascript
const response = await fetch('/api/countries-db?division=FP');
const data = await response.json();
// Returns: [{ country: 'UAE' }, { country: 'Saudi Arabia' }, ...]
```

### **Get Sales by Country**
```javascript
const response = await fetch('/api/sales-by-country-db', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    division: 'FP',
    salesRep: 'Sofiane',
    year: 2024,
    months: [1, 2, 3],
    dataType: 'Actual'
  })
});
const data = await response.json();
// Returns: [{ country: 'UAE', value: 1500.50 }, { country: 'Saudi Arabia', value: 1200.75 }, ...]
```

## Error Handling

The system provides comprehensive error handling:
- Invalid division validation
- Missing parameter validation
- Database connection errors
- SQL query errors
- Proper HTTP status codes and error messages

## Testing

Run the test script to verify all endpoints:
```bash
cd server
node test-universal-sales-by-country.js
```

This will test all endpoints and provide a comprehensive report of the system's functionality.




