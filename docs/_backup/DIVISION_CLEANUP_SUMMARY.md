# Division Cleanup Summary

## Date: Division Cleanup Completed

## Overview
Removed dead divisions (SB, TF, HCM) that had no databases, renamed HCM → HC to match actual hc_database, and updated all references.

## Active Divisions Now
- **FP** (Flexible Packaging) - fp_database with fp_* tables
- **HC** (Harwal Container) - hc_database with hc_* tables

## Files Deleted
1. `server/database/SBDataService.js`
2. `server/database/TFDataService.js`
3. `server/database/HCMDataService.js`

## Files Created
1. `server/database/HCDataService.js` - New HC division data service using hc_database

## Files Modified

### server/server.js
- Removed imports for sbDataService, tfDataService, hcmDataService
- Added import for hcDataService
- Removed ~500 lines of SB/TF/HCM Master Data API endpoints
- Added HC Master Data API endpoints
- Updated division switches in dashboard data endpoints (FP/HC only)
- Updated getDefaultMasterData() to only include FP and HC
- Updated division list from ['FP', 'SB', 'TF', 'HCM'] to ['FP', 'HC']
- Updated table mappings

### server/routes/aebf-legacy.js
- Added VALID_DIVISIONS constant: ['FP', 'HC']
- Updated all validDivisions references to use VALID_DIVISIONS

### server/routes/aebf/helpers.js
- Updated validDivisions to ['FP', 'HC']

### server/database/divisionDatabaseConfig.js
- Removed SB, TF, HCM configurations
- Updated HCM → HC with active status

### server/database/UniversalSalesByCountryService.js
- Updated table mapping to only include FP and HC

### server/data/sales-reps-config.json
- Removed SB, TF, HCM sections
- Added HC section with empty groups

### server/verify-excel-removal.js
- Updated division testing logic

## Not Modified (Legacy Scripts)
These files in `server/scripts/` contain dead references but are not used at runtime:
- `create-missing-tables.js` - Legacy table creation script

## API Endpoints

### Removed (SB/TF/HCM)
All `/api/sb/*`, `/api/tf/*`, `/api/hcm/*` endpoints removed

### Added (HC)
- GET `/api/hc/master-data/product-groups`
- GET `/api/hc/master-data/product-pricing-years`
- GET `/api/hc/master-data/product-pricing`
- GET `/api/hc/master-data/product-pricing-rounded`
- POST `/api/hc/master-data/product-pricing-rounded`
- GET `/api/hc/master-data/material-percentages`
- POST `/api/hc/master-data/material-percentages`
- POST `/api/hc/master-data/initialize`

## Database Status
- **fp_database**: 21 tables, actively used
- **hc_database**: 17 tables, now properly connected via HCDataService
- **sb_database**: DOES NOT EXIST (removed from code)
- **tf_database**: DOES NOT EXIST (removed from code)
- **hcm_database**: DOES NOT EXIST (was misnamed HCM in code, actual is hc_database)

## Testing Required
1. Verify FP division still works correctly
2. Test HC division data loading
3. Verify HC Master Data endpoints work
4. Check division selector in UI only shows FP and HC
