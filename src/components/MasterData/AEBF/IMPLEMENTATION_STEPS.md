# AEBF Implementation - Step-by-Step Plan

**Last Updated**: November 13, 2025  
**Approach**: Incremental implementation with testing after each step  
**Status**: Ready for execution

---

## Implementation Strategy

Each step is **independent and testable**. You will approve each step after testing before proceeding to the next.

### Priority Order:
1. **Database Foundation** (Steps 1-2) - Must be done first
2. **Backend API** (Steps 3-4) - Enables data flow
3. **PowerShell Script** (Step 5) - Data transformation
4. **Frontend Updates** (Steps 6-7) - User interface
5. **Security & Monitoring** (Steps 8-10) - Production readiness

---

## STEP 1: Database Schema Updates
**Duration**: 15-20 minutes  
**Risk**: Low (only adds columns and constraints, doesn't delete data)  
**Rollback**: SQL script provided

### What This Does:
- Adds `division` column to `fp_data_excel` table
- Adds `updated_at` column with timestamp
- Creates unique constraint (prevents duplicate records)
- Creates performance indexes
- Creates backup and archive tables

### Tasks:
1. Create SQL script: `database-updates-step1.sql`
2. Run SQL script on `fp_database`
3. Verify new columns exist
4. Test query performance with new indexes

### Testing Checklist:
- [ ] Run: `\d public.fp_data_excel` - verify `division` and `updated_at` columns exist
- [ ] Run: `SELECT * FROM fp_data_excel LIMIT 5` - should still work
- [ ] Check constraints: `\d+ public.fp_data_excel` - verify unique constraint
- [ ] Verify tables created: `\dt public.fp_data_excel*` - should show backup and archive tables

### Deliverables:
```sql
-- File: database-updates-step1.sql
-- Adds division, updated_at, constraints, indexes, and support tables
```

### Rollback Plan:
```sql
-- File: rollback-step1.sql
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS division;
ALTER TABLE public.fp_data_excel DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS public.fp_data_excel_backup;
DROP TABLE IF EXISTS public.fp_data_excel_archive;
```

**👉 WAIT FOR APPROVAL BEFORE STEP 2**

---

## STEP 2: Database Constraints & Validation
**Duration**: 10 minutes  
**Risk**: Low (only adds data validation)  
**Depends On**: Step 1

### What This Does:
- Adds CHECK constraints for data quality
- Enforces year range (2020-2030)
- Enforces month range (1-12)
- Enforces positive values for Amount/KGS
- Validates values_type enum

### Tasks:
1. Create SQL script: `database-constraints-step2.sql`
2. Run SQL script
3. Test constraint violations

### Testing Checklist:
- [ ] Try inserting invalid year (1999) - should fail
- [ ] Try inserting invalid month (13) - should fail
- [ ] Try inserting negative Amount - should fail
- [ ] Try inserting negative MoRM - should succeed (allowed)
- [ ] Try inserting invalid values_type ('INVALID') - should fail

### Deliverables:
```sql
-- File: database-constraints-step2.sql
-- Adds CHECK constraints for data validation
```

### Test Queries:
```sql
-- Should FAIL (year too old)
INSERT INTO fp_data_excel (year, month, type, values_type, values) 
VALUES (1999, 1, 'Actual', 'Amount', 100);

-- Should FAIL (month out of range)
INSERT INTO fp_data_excel (year, month, type, values_type, values) 
VALUES (2024, 13, 'Actual', 'Amount', 100);

-- Should FAIL (negative Amount)
INSERT INTO fp_data_excel (year, month, type, values_type, values) 
VALUES (2024, 1, 'Actual', 'Amount', -100);

-- Should SUCCEED (negative MoRM is allowed)
INSERT INTO fp_data_excel (year, month, type, values_type, values) 
VALUES (2024, 1, 'Actual', 'MoRM', -50);
```

**👉 WAIT FOR APPROVAL BEFORE STEP 3**

---

## STEP 3: Backend API - Basic Structure
**Duration**: 30 minutes  
**Risk**: Low (only adds new routes, doesn't modify existing)  
**Depends On**: Steps 1-2

### What This Does:
- Creates `server/routes/aebf.js` with basic endpoints
- Adds health check endpoint
- Adds GET endpoint to fetch Actual data
- NO authentication yet (added in Step 8)
- NO file upload yet (added in Step 5)

### Tasks:
1. Create `server/routes/aebf.js`
2. Add route to `server/index.js`
3. Test endpoints with Postman/curl

### Testing Checklist:
- [ ] Health check works: `GET http://localhost:3001/api/aebf/health`
- [ ] Get Actual data: `GET http://localhost:3001/api/aebf/actual?division=FP&page=1&pageSize=10`
- [ ] Pagination works: page=2 returns different records
- [ ] Division filter works: division=FP only returns FP records
- [ ] Returns proper JSON format

### Deliverables:
```javascript
// File: server/routes/aebf.js
// Basic API endpoints for AEBF module
```

### Test Commands:
```powershell
# Test health endpoint
curl http://localhost:3001/api/aebf/health

# Test get Actual data
curl "http://localhost:3001/api/aebf/actual?division=FP&page=1&pageSize=10"

# Test pagination
curl "http://localhost:3001/api/aebf/actual?division=FP&page=2&pageSize=10"
```

**👉 WAIT FOR APPROVAL BEFORE STEP 4**

---

## STEP 4: Backend API - Data Query Enhancements
**Duration**: 20 minutes  
**Risk**: Low  
**Depends On**: Step 3

### What This Does:
- Adds filtering by year, month, values_type
- Adds sorting capabilities
- Adds total count for pagination
- Optimizes queries with indexes

### Tasks:
1. Update `server/routes/aebf.js` GET endpoint
2. Add query parameter validation
3. Test complex queries

### Testing Checklist:
- [ ] Filter by year: `year=2024`
- [ ] Filter by month: `month=1,2,3`
- [ ] Filter by values_type: `values_type=Amount`
- [ ] Sort by column: `sortBy=year&sortOrder=DESC`
- [ ] Combined filters work together
- [ ] Returns totalCount in response

### Test Commands:
```powershell
# Filter by year and values_type
curl "http://localhost:3001/api/aebf/actual?division=FP&year=2024&values_type=Amount&page=1&pageSize=10"

# Filter by multiple months
curl "http://localhost:3001/api/aebf/actual?division=FP&year=2024&month=1,2,3&page=1&pageSize=10"

# Sort by customer name
curl "http://localhost:3001/api/aebf/actual?division=FP&sortBy=customername&sortOrder=ASC&page=1&pageSize=10"
```

**👉 WAIT FOR APPROVAL BEFORE STEP 5**

---

## STEP 5: PowerShell Transform Script
**Duration**: 45-60 minutes  
**Risk**: Medium (handles data transformation)  
**Depends On**: Steps 1-4

### What This Does:
- Creates `transform-actual-to-sql.ps1`
- Reads Excel file (10 columns)
- Maps Excel columns to database columns
- Implements UPSERT mode (ON CONFLICT UPDATE)
- Implements REPLACE mode (DELETE + INSERT with backup)
- Batch processing (1000 rows at a time)
- Transaction safety (rollback on error)
- Structured logging

### Tasks:
1. Create `src/components/MasterData/AEBF/transform-actual-to-sql.ps1`
2. Test with small Excel file (10 rows)
3. Test with full Excel file (28,000+ rows)
4. Test UPSERT mode
5. Test REPLACE mode

### Testing Checklist:
**Preparation:**
- [ ] Copy `fp_data_actual.xlsx` to test location
- [ ] Create test Excel with 10 rows only

**UPSERT Mode Tests:**
- [ ] Upload 10 rows - all inserted
- [ ] Upload same 10 rows again - all updated (no duplicates)
- [ ] Verify `updated_at` timestamp changed
- [ ] Check QC summary report

**REPLACE Mode Tests:**
- [ ] Upload 10 rows for Jan 2024
- [ ] Upload different 10 rows for Jan 2024 with REPLACE
- [ ] Verify old records deleted
- [ ] Verify backup table has old records
- [ ] Verify new records inserted

**Error Handling:**
- [ ] Upload Excel with missing column - should fail gracefully
- [ ] Upload Excel with invalid month (13) - should fail with error message
- [ ] Simulate database connection failure - should rollback transaction

### Test Commands:
```powershell
# Test UPSERT mode
.\transform-actual-to-sql.ps1 `
  -ExcelPath "D:\Projects\IPD26.10\server\data\fp_data_actual.xlsx" `
  -Division "FP" `
  -UploadMode "upsert" `
  -UploadedBy "testuser"

# Test REPLACE mode
.\transform-actual-to-sql.ps1 `
  -ExcelPath "D:\Projects\IPD26.10\server\data\fp_data_actual.xlsx" `
  -Division "FP" `
  -UploadMode "replace" `
  -UploadedBy "testuser"

# Verify results
psql -h localhost -U postgres -d fp_database -c "SELECT COUNT(*), MAX(updated_at) FROM fp_data_excel WHERE division='FP' AND type='Actual';"
```

**👉 WAIT FOR APPROVAL BEFORE STEP 6**

---

## STEP 6: Frontend - ActualTab Component Updates
**Duration**: 45 minutes  
**Risk**: Low (only updates UI, doesn't affect existing functionality)  
**Depends On**: Steps 1-5

### What This Does:
- Updates `ActualTab.js` to use real API endpoints
- Adds division context integration
- Adds missing columns (Sales Rep, Process)
- Adds upload mode selection (UPSERT/REPLACE radio buttons)
- Adds Transform & Load button
- Adds upload report modal

### Tasks:
1. Update `src/components/MasterData/AEBF/ActualTab.js`
2. Add division context hook
3. Update table columns
4. Add upload UI components
5. Connect to backend API

### Testing Checklist:
**Display Tests:**
- [ ] Tab loads without errors
- [ ] Shows warning if no division selected
- [ ] Table displays real data from database
- [ ] Pagination works (next/previous)
- [ ] All columns visible: Year, Month, Sales Rep, Customer, Country, Product Group, Material, Process, Values Type, Values

**Upload UI Tests:**
- [ ] UPSERT/REPLACE radio buttons visible
- [ ] File upload button works
- [ ] Shows warning when REPLACE mode selected
- [ ] Transform & Load button enabled after file selected

**API Integration Tests:**
- [ ] Refresh button fetches latest data
- [ ] Export button downloads CSV
- [ ] Filter/search works (if implemented)

### Before/After Screenshots:
Take screenshots to verify:
1. Table with all columns visible
2. Upload mode selection UI
3. Division context warning (when no division selected)
4. Upload report modal (after successful upload)

**👉 WAIT FOR APPROVAL BEFORE STEP 7**

---

## STEP 7: Frontend - Upload Integration & Validation
**Duration**: 30 minutes  
**Risk**: Medium (integrates file upload with backend)  
**Depends On**: Steps 1-6

### What This Does:
- Implements file upload to backend API
- Calls PowerShell script via backend
- Shows progress indicator
- Displays upload report modal with results
- Client-side Excel validation

### Tasks:
1. Create upload API endpoint in `server/routes/aebf.js`
2. Add multer file upload handling
3. Call PowerShell script from Node.js
4. Return structured results to frontend
5. Update ActualTab to handle upload response

### Testing Checklist:
**Pre-Upload Validation:**
- [ ] Rejects files larger than 50MB
- [ ] Rejects non-Excel files (.txt, .pdf)
- [ ] Validates Excel has 10 required columns
- [ ] Detects if `type` or `division` columns exist (should reject)

**Upload Process:**
- [ ] Shows loading spinner during upload
- [ ] Upload completes successfully
- [ ] Modal shows results: Records inserted, updated, deleted
- [ ] Shows QC summary report
- [ ] Table refreshes automatically after upload

**Error Handling:**
- [ ] Shows error modal if upload fails
- [ ] Displays specific error message (missing column, invalid data, etc.)
- [ ] Logs errors to backend

### Test Cases:
1. **Valid Upload (UPSERT)**: Upload 100 rows, verify all inserted
2. **Valid Upload (REPLACE)**: Upload 100 rows, replace existing data
3. **Invalid Excel**: Upload file with 9 columns - should reject
4. **Invalid Data**: Upload Excel with month=13 - should show error
5. **Large File**: Upload 28,000 rows - should complete in <30 seconds

**👉 WAIT FOR APPROVAL BEFORE STEP 8**

---

## STEP 8: Security Implementation
**Duration**: 40 minutes  
**Risk**: Low (adds security, doesn't break existing functionality)  
**Depends On**: Steps 1-7

### What This Does:
- Adds authentication middleware
- Adds division authorization (verify user has access to selected division)
- Adds rate limiting (5 uploads per 15 minutes)
- Adds file validation (MIME type check)
- Adds request logging

### Tasks:
1. Create `server/middleware/auth.js`
2. Create `server/middleware/rateLimiter.js`
3. Update `server/routes/aebf.js` to use middleware
4. Test authentication flow

### Testing Checklist:
**Authentication Tests:**
- [ ] Unauthenticated request returns 401 error
- [ ] Authenticated request succeeds
- [ ] Token validation works

**Authorization Tests:**
- [ ] User with FP access can upload to FP division
- [ ] User without SB access gets 403 when trying SB division
- [ ] Admin user can access all divisions

**Rate Limiting Tests:**
- [ ] First 5 uploads succeed
- [ ] 6th upload within 15 minutes returns 429 error
- [ ] After 15 minutes, uploads work again

**File Validation Tests:**
- [ ] Excel with correct MIME type succeeds
- [ ] Renamed .txt file with .xlsx extension fails
- [ ] File over 50MB fails

### Test Commands:
```powershell
# Test without auth token (should fail)
curl "http://localhost:3001/api/aebf/actual?division=FP"

# Test with auth token (should succeed)
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3001/api/aebf/actual?division=FP"

# Test rate limiting (run 6 times quickly)
for ($i=1; $i -le 6; $i++) {
  curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3001/api/aebf/upload-actual" -F "file=@test.xlsx"
}
```

**👉 WAIT FOR APPROVAL BEFORE STEP 9**

---

## STEP 9: Monitoring & Health Checks
**Duration**: 30 minutes  
**Risk**: Low (only adds observability)  
**Depends On**: Steps 1-8

### What This Does:
- Implements structured logging (JSON format)
- Creates health check dashboard endpoint
- Adds database connection pooling with health checks
- Creates audit log for all uploads
- Implements performance metrics

### Tasks:
1. Create `server/utils/logger.js` (structured logging)
2. Update health endpoint with detailed checks
3. Create `public.aebf_upload_audit` table
4. Add logging to all operations
5. Create monitoring dashboard endpoint

### Testing Checklist:
**Logging Tests:**
- [ ] Check log file exists: `logs/aebf-YYYYMMDD.log`
- [ ] Logs are in JSON format
- [ ] Each log entry has timestamp, level, operation, message
- [ ] Errors include stack traces

**Health Check Tests:**
- [ ] GET `/api/aebf/health` returns status
- [ ] Shows database connectivity status
- [ ] Shows last upload timestamp
- [ ] Shows disk space available
- [ ] Returns 200 if healthy, 503 if unhealthy

**Audit Trail Tests:**
- [ ] After upload, audit record created in `aebf_upload_audit` table
- [ ] Audit includes: division, user, filename, mode, record counts, timestamp
- [ ] Query audit history: `SELECT * FROM aebf_upload_audit ORDER BY uploaded_at DESC LIMIT 10;`

### Test Commands:
```powershell
# Check health endpoint
curl http://localhost:3001/api/aebf/health | ConvertFrom-Json | Format-List

# View logs
Get-Content "logs/aebf-$(Get-Date -Format 'yyyyMMdd').log" -Tail 20

# Check audit trail
psql -h localhost -U postgres -d fp_database -c "SELECT * FROM public.aebf_upload_audit ORDER BY uploaded_at DESC LIMIT 5;"
```

**👉 WAIT FOR APPROVAL BEFORE STEP 10**

---

## STEP 10: Documentation & Final Testing
**Duration**: 30 minutes  
**Risk**: None (documentation only)  
**Depends On**: Steps 1-9

### What This Does:
- Updates README.md with usage instructions
- Creates user guide for uploading Actual data
- Creates troubleshooting guide
- Performs end-to-end testing
- Creates rollback procedures

### Tasks:
1. Update `src/components/MasterData/AEBF/README.md`
2. Create Excel template for users
3. Create troubleshooting guide
4. Perform full end-to-end test
5. Document rollback procedures

### Testing Checklist - End-to-End:
- [ ] User selects FP division
- [ ] User navigates to Master Data > AEBF > Actual tab
- [ ] User uploads Excel file in UPSERT mode
- [ ] Upload completes, modal shows results
- [ ] Table refreshes with new data
- [ ] User uploads same file in REPLACE mode
- [ ] Old data backed up, new data inserted
- [ ] Export works - downloads CSV with all records
- [ ] User logs out, cannot access without authentication

### Deliverables:
1. **User Guide**: Step-by-step instructions with screenshots
2. **Excel Template**: Sample file with correct column names
3. **Troubleshooting Guide**: Common errors and solutions
4. **Admin Guide**: Monitoring, backup, recovery procedures

### Final Verification:
- [ ] All 12 critical items from ENHANCEMENTS_CONSOLIDATED.md implemented
- [ ] All tests passing
- [ ] No errors in console or logs
- [ ] Performance acceptable (<30s for 28K rows)
- [ ] Documentation complete

**✅ IMPLEMENTATION COMPLETE**

---

## Summary of Steps

| Step | Name | Duration | Risk | Depends On | Deliverables |
|------|------|----------|------|------------|--------------|
| 1 | Database Schema Updates | 20 min | Low | None | SQL script |
| 2 | Database Constraints | 10 min | Low | 1 | SQL script |
| 3 | Backend API Basic | 30 min | Low | 1-2 | aebf.js routes |
| 4 | Backend API Enhanced | 20 min | Low | 3 | Updated routes |
| 5 | PowerShell Script | 60 min | Medium | 1-4 | transform-actual-to-sql.ps1 |
| 6 | Frontend ActualTab | 45 min | Low | 1-5 | Updated ActualTab.js |
| 7 | Upload Integration | 30 min | Medium | 1-6 | Upload API + UI |
| 8 | Security | 40 min | Low | 1-7 | Auth middleware |
| 9 | Monitoring | 30 min | Low | 1-8 | Logger + health checks |
| 10 | Documentation | 30 min | None | 1-9 | Docs + testing |

**Total Estimated Time**: 5-6 hours
**Recommended Schedule**: 2-3 days (2 hours per day with testing)

---

## Next Action

**Ready to start Step 1?** 
I will create the database schema update SQL script. After you test and approve Step 1, we'll proceed to Step 2.

Reply "Start Step 1" to begin, or let me know if you want to adjust the plan.
