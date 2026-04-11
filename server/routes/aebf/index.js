/**
 * @fileoverview AEBF Routes - Modular Index
 * @module routes/aebf
 * @description Consolidates all AEBF (Actual/Estimate/Budget/Forecast) routes
 * Provides 37 endpoints for comprehensive data management across 7 specialized modules
 * 
 * @rateLimiting
 * - Upload endpoints: 10 requests/hour
 * - Query endpoints: 100 requests/15min
 * - Export endpoints: 30 requests/15min
 * - General endpoints: 500 requests/15min
 */

/**
 * @swagger
 * tags:
 *   - name: AEBF
 *     description: Actual, Estimate, Budget, Forecast data management
 *   - name: AEBF-Actual
 *     description: Actual sales data operations
 *   - name: AEBF-Budget
 *     description: Budget management and upload
 *   - name: AEBF-HTML-Budget
 *     description: HTML-based budget forms
 *   - name: AEBF-Divisional
 *     description: Divisional budget operations
 *   - name: AEBF-Reports
 *     description: Budget and sales reports
 *   - name: AEBF-Bulk
 *     description: Bulk import/export operations
 * 
 * @swagger
 * components:
 *   schemas:
 *     AEBFActualData:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         year:
 *           type: integer
 *         month:
 *           type: integer
 *         division:
 *           type: string
 *         salesrepname:
 *           type: string
 *         customername:
 *           type: string
 *         productgroup:
 *           type: string
 *         values_type:
 *           type: string
 *           enum: [AMOUNT, KGS, MORM]
 *         value:
 *           type: number
 *     AEBFBudget:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         year:
 *           type: integer
 *         month:
 *           type: integer
 *         division:
 *           type: string
 *         salesrepname:
 *           type: string
 *         customername:
 *           type: string
 *         productgroup:
 *           type: string
 *         budget_amount:
 *           type: number
 *         budget_kgs:
 *           type: number
 *     AEBFSummary:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *         totalRecords:
 *           type: integer
 *         totalValue:
 *           type: number
 *         yearBreakdown:
 *           type: object
 *     PaginatedResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: array
 *           items:
 *             type: object
 *         pagination:
 *           type: object
 *           properties:
 *             page:
 *               type: integer
 *             pageSize:
 *               type: integer
 *             totalRecords:
 *               type: integer
 *             totalPages:
 *               type: integer
 *         meta:
 *           type: object
 */

const express = require('express');
const router = express.Router();
const { uploadLimiter, queryLimiter, generalLimiter, exportLimiter } = require('../../middleware/rateLimiter');
const { authenticate } = require('../../middleware/auth');
const requireAnyRole = require('../../middleware/requireAnyRole');

const MIS_SENIOR_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];

router.use(
	authenticate,
	requireAnyRole(['admin'], { minLevel: 6, minLevelRoles: MIS_SENIOR_ROLES })
);

// Import all AEBF route modules
const healthRoutes = require('./health');
const actualRoutes = require('./actual');
const budgetRoutes = require('./budget');
const htmlBudgetRoutes = require('./html-budget');
const divisionalRoutes = require('./divisional');
const reportsRoutes = require('./reports');
const bulkRoutes = require('./bulk');
const budgetPLRoutes = require('./budget-pl');
const forecastPLRoutes = require('./forecast-pl');
const projectionsRoutes = require('./projections');  // Unified ESTIMATE + FORECAST
const liveBudgetRoutes = require('./live-budget');  // Live budget entry

// Mount all routes
router.use('/', healthRoutes);      // 1 route: GET /health
router.use('/', actualRoutes);      // 9 routes: Actual data operations
router.use('/', budgetRoutes);      // 6 routes: Budget operations
router.use('/', htmlBudgetRoutes);  // 6 routes: HTML budget forms
router.use('/', divisionalRoutes);  // 5 routes: Divisional budgets
router.use('/', reportsRoutes);     // 3 routes: Analytical reports
router.use('/', bulkRoutes);        // 6 routes: Bulk operations
router.use('/', budgetPLRoutes);    // 5 routes: Budget P&L simulation
router.use('/', forecastPLRoutes);  // 3 routes: Forecast P&L simulation
router.use('/projections', projectionsRoutes);  // Unified projections (ESTIMATE + FORECAST)
router.use('/live-budget', liveBudgetRoutes);  // Live budget entry routes

// Export the consolidated router
module.exports = router;
