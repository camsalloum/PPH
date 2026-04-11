/**
 * AEBF (Actual/Estimate/Budget/Forecast) API Routes
 * 
 * This is the main entry point - currently using the legacy monolithic file.
 * Refactoring is planned to split into modular files.
 * 
 * REFACTORING STATUS:
 * ==================
 * Phase 1 - Backend (Planned):
 *   [ ] helpers.js - Shared utility functions
 *   [ ] health.js - Health check endpoint
 *   [ ] actual.js - Actual data endpoints
 *   [ ] budget-excel.js - Excel budget endpoints
 *   [ ] summary.js - Summary/filter endpoints
 *   [ ] estimate.js - Estimate endpoints
 *   [ ] html-budget-salesrep.js - Sales Rep HTML budget
 *   [ ] html-budget-divisional.js - Divisional HTML budget
 *   [ ] bulk-import.js - Bulk import endpoints
 *   [ ] recap.js - Budget recap endpoints
 * 
 * BACKUP LOCATION: D:\Projects\IPD26.10\backups\refactor_20251201_164954\
 */

// For now, export the existing monolithic router
// This maintains full backward compatibility
module.exports = require('./aebf-legacy');
