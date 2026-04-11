# AEBF Module - Master Data Management

**AEBF** = **A**ctual, **E**stimate, **B**udget, **F**orecast

## Overview

This module manages financial data transformation and display for the four primary data types used in the IPDash system.

## Structure

### Components
- **AEBFTab.js** - Main container component with 4 subtabs
- **ActualTab.js** - Manages Actual financial data
- **EstimateTab.js** - Manages Estimate/Projection data
- **BudgetTab.js** - Manages Budget planning data
- **ForecastTab.js** - Manages Forecast data

### Scripts
- **transform-fp-excel-to-sql.ps1** - PowerShell script that transforms Excel data to PostgreSQL
  - Reads from `fp_data main.xlsx` (Actual + Budget sheets)
  - Normalizes and cleanses data (text, dates, numbers)
  - Loads into PostgreSQL table: `public.fp_data_excel`
  - Performs QC checks to ensure data integrity (row count, sum validation)
  - No data loss - preserves every Excel row

## Features

### Data Flow
1. **Excel Source** → PowerShell Script → **PostgreSQL Database**
2. **PostgreSQL** → Backend API (`/api/fp-data`) → **React Frontend**
3. **React UI** → Display/Edit → **Save to Database**

### Planned Features
- [ ] View/Edit Actual data
- [ ] View/Edit Estimate data
- [ ] View/Edit Budget data
- [ ] View/Edit Forecast data
- [ ] Excel import/export functionality
- [ ] Data validation and QC reports
- [ ] Comparison views (Actual vs Budget, etc.)
- [ ] Time period filtering (year, month)
- [ ] Customer/Product group filtering

## Database Schema

### Table: `public.fp_data_excel`

| Column        | Type          | Description                          |
|---------------|---------------|--------------------------------------|
| id            | bigserial     | Primary key (auto-increment)         |
| sourcesheet   | text          | Source Excel sheet name              |
| year          | integer       | Year (2000-2100)                     |
| month         | integer       | Month (1-12)                         |
| type          | text          | Data type: Actual, Budget, etc.      |
| salesrepname  | text          | Sales representative name            |
| customername  | text          | Customer name                        |
| countryname   | text          | Country name                         |
| productgroup  | text          | Product group category               |
| material      | text          | Material type                        |
| process       | text          | Manufacturing process                |
| values_type   | text          | Value category (sales, cost, etc.)   |
| values        | numeric(18,4) | Numerical value                      |
| updatedat     | timestamptz   | Last update timestamp                |

### Indexes
- `ix_fp_data_excel_period` - (year, month) for time-based queries
- `ix_fp_data_excel_customer` - (customername) for customer filtering

## API Endpoints

### Planned Endpoints
- `GET /api/aebf/actual` - Fetch Actual data
- `GET /api/aebf/estimate` - Fetch Estimate data
- `GET /api/aebf/budget` - Fetch Budget data
- `GET /api/aebf/forecast` - Fetch Forecast data
- `POST /api/aebf/import` - Import from Excel
- `PUT /api/aebf/update` - Update records
- `GET /api/aebf/qc-report` - Quality control report

## Development Notes

### Current Status
- ✅ Folder structure created
- ✅ Transform script documented and moved
- ⏳ UI components to be developed
- ⏳ Backend API endpoints to be created
- ⏳ Integration with Master Data page

### Next Steps
1. Create main AEBF tab component
2. Implement 4 subtab components (Actual, Estimate, Budget, Forecast)
3. Create backend API endpoints
4. Add Excel import/export UI
5. Implement data editing functionality
6. Add validation and QC features

## Related Files
- Transform Script: `./transform-fp-excel-to-sql.ps1`
- Backend API: `server/routes/aebf.js` (to be created)
- Database config: `server/database/config.js`

---

**Created**: November 13, 2025  
**Last Updated**: November 13, 2025  
**Module**: Master Data > AEBF
