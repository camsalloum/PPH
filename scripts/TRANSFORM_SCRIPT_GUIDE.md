# AEBF Transform Script - Quick Reference Guide

## Overview
The `transform-actual-to-sql.ps1` script transforms Excel AEBF data and uploads it to the PostgreSQL database.

## Prerequisites
- PowerShell 5.1 or higher
- PostgreSQL 17 installed at `C:\Program Files\PostgreSQL\17\bin\psql.exe`
- ImportExcel PowerShell module (auto-installed if missing)
- Database connection to `fp_database`

## Excel File Requirements

### Required Columns (10 total)
1. **year** - Numeric (2019-2050)
2. **month** - Numeric (1-12, NOT text like "Jan", "Feb")
3. **salesrepname** - Text (optional, can be blank)
4. **customername** - Text (required)
5. **COUNTRYNAME** - Text (note: UPPERCASE in Excel)
6. **PGCombine** - Text (maps to productgroup in DB)
7. **Material** - Text (optional)
8. **Process** - Text (optional)
9. **values_type** - Text (AMOUNT, KGS, or MORM - case insensitive)
10. **Total** - Numeric (maps to values in DB, can be negative for returns)

### Columns NOT Needed
- ❌ **type** - Automatically set to "Actual"
- ❌ **division** - Provided as parameter

## Usage

### Basic Usage (UPSERT mode)
```powershell
.\scripts\transform-actual-to-sql.ps1 `
    -ExcelPath "fp_data_actual.xlsx" `
    -Division "FP" `
    -UploadMode "upsert" `
    -UploadedBy "john.doe"
```

### REPLACE Mode (Delete & Re-insert)
```powershell
.\scripts\transform-actual-to-sql.ps1 `
    -ExcelPath "fp_data_actual.xlsx" `
    -Division "FP" `
    -UploadMode "replace" `
    -UploadedBy "john.doe"
```

### Test Mode (Validation Only)
```powershell
.\scripts\transform-actual-to-sql.ps1 `
    -ExcelPath "fp_data_actual.xlsx" `
    -Division "FP" `
    -UploadMode "upsert" `
    -UploadedBy "test.user" `
    -TestMode
```

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| `ExcelPath` | Yes | File path | Path to Excel file (.xlsx) |
| `Division` | Yes | FP, SB, TF, HCM | Division code |
| `UploadMode` | No | upsert, replace | Upload mode (default: upsert) |
| `UploadedBy` | Yes | Text | Username for audit trail |
| `TestMode` | No | Switch | Validate only, don't upload |

## Upload Modes

### UPSERT Mode (Recommended)
- **What it does**: Updates existing records, inserts new ones
- **Conflict resolution**: Matches on (year, month, salesrepname, customername, countryname, productgroup, material, process, values_type, division, type)
- **When to use**: Regular uploads, updating data
- **Duplicate handling**: Automatic - keeps latest upload

### REPLACE Mode (Use with Caution)
- **What it does**: Backs up existing data, deletes it, then inserts fresh data
- **Backup location**: `fp_data_excel_backup` table
- **When to use**: Complete refresh of data for specific periods
- **Warning**: Deletes ALL Actual data for the division + years/months in Excel file

## Output

### Console Output
- Color-coded log messages (Green=Success, Yellow=Warning, Red=Error)
- Progress indicators for batch processing
- QC summary before and after upload

### Log Files
- Location: `logs/upload-YYYYMMDD_HHMMSS.txt`
- Contains: Full execution log with timestamps
- Retention: Manual cleanup required

### Audit Trail
- Table: `aebf_upload_audit`
- Records: Upload metadata, status, errors
- Query: `SELECT * FROM aebf_upload_audit ORDER BY uploaded_at DESC LIMIT 10;`

## QC Checks

### Pre-Upload Validation
✅ Excel file exists
✅ Database connection working
✅ Required columns present
✅ Year range (2019-2050)
✅ Month numeric (1-12)
✅ Customer name not empty
✅ Values type valid (AMOUNT/KGS/MORM)
✅ Total is numeric

### Post-Upload QC
- Record counts by values_type
- Sum totals by values_type
- Comparison with pre-upload summary

## Troubleshooting

### Common Errors

**"ImportExcel module not found"**
- Solution: Script auto-installs, or run: `Install-Module -Name ImportExcel -Scope CurrentUser -Force`

**"Month must be numeric (1-12)"**
- Problem: Excel has "Jan", "Feb" text instead of numbers
- Solution: Convert month column to numbers (1=Jan, 2=Feb, etc.)

**"Missing required column: COUNTRYNAME"**
- Problem: Column name is lowercase or different
- Solution: Ensure column is named exactly "COUNTRYNAME" (uppercase)

**"Invalid values_type"**
- Problem: Value is not AMOUNT, KGS, or MORM
- Solution: Fix Excel data, case-insensitive but must be one of these three

**"Database connection failed"**
- Check: PostgreSQL is running
- Check: Password is correct (654883)
- Check: Database name is correct (fp_database)

**"Duplicate key violation" (REPLACE mode)**
- Problem: Trying to insert duplicate records
- Solution: Shouldn't happen in REPLACE mode, check script logic

### View Upload History
```sql
SELECT 
    uploaded_at,
    division,
    upload_mode,
    uploaded_by,
    records_affected,
    years_affected,
    months_affected,
    status,
    error_message
FROM aebf_upload_audit
ORDER BY uploaded_at DESC
LIMIT 20;
```

### View Recent Uploads
```sql
SELECT 
    division,
    year,
    month,
    COUNT(*) as record_count,
    MAX(updated_at) as last_updated,
    uploaded_by
FROM fp_data_excel
WHERE type = 'Actual'
GROUP BY division, year, month, uploaded_by
ORDER BY last_updated DESC
LIMIT 20;
```

### Restore from Backup (REPLACE mode)
```sql
-- View available backups
SELECT 
    backup_timestamp,
    backup_reason,
    COUNT(*) as record_count
FROM fp_data_excel_backup
GROUP BY backup_timestamp, backup_reason
ORDER BY backup_timestamp DESC;

-- Restore specific backup (example)
BEGIN;

-- Delete current data for that period
DELETE FROM fp_data_excel
WHERE division = 'FP' AND type = 'Actual' AND year = 2024 AND month = 1;

-- Restore from backup
INSERT INTO fp_data_excel
SELECT id, sourcesheet, year, month, type, productgroup, customername, 
       salesrepname, countryname, material, process, values_type, 
       values, created_at, division, updated_at, uploaded_by
FROM fp_data_excel_backup
WHERE backup_timestamp = '2025-11-13 15:30:00'  -- Replace with actual timestamp
  AND division = 'FP' AND type = 'Actual' AND year = 2024 AND month = 1;

COMMIT;
```

## Testing

### Run Test Suite
```powershell
.\test-transform-script.ps1
```

This creates a test Excel file and validates the script without uploading.

### Manual Test Steps
1. Create test Excel with 5-10 rows
2. Run with `-TestMode` flag
3. Check validation messages
4. Fix any errors
5. Run without `-TestMode` to upload

## Performance

- **Batch Size**: 1000 records per batch
- **Typical Speed**: ~5000 records/minute
- **Large Files**: 50,000+ records = ~10 minutes
- **Network**: Local database is fastest

## Security

- **Password**: Stored in script (environment variable recommended for production)
- **Audit Trail**: All uploads logged with username
- **Backup**: Automatic in REPLACE mode
- **Rollback**: Manual restore from backup table

## Next Steps

After successful upload:
1. Check audit log: `SELECT * FROM aebf_upload_audit ORDER BY uploaded_at DESC LIMIT 1;`
2. Verify data: `SELECT COUNT(*) FROM fp_data_excel WHERE division='FP' AND type='Actual';`
3. Test frontend: Navigate to AEBF → Actual tab
4. Check API: `curl "http://localhost:3001/api/aebf/actual?division=FP&page=1&pageSize=10"`

## Support

For issues or questions:
1. Check log file in `logs/` folder
2. Review error messages in console
3. Query audit table for upload status
4. Check database constraints in Step 2 documentation
