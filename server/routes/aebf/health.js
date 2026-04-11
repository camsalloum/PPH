/**
 * AEBF Health Check Route
 * Provides system health status and database connectivity verification
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { getPoolForDivision, getTableNames } = require('./shared');
const { asyncHandler, successResponse } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');

/**
 * @swagger
 * /api/aebf/health:
 *   get:
 *     summary: AEBF system health check
 *     description: Verify AEBF API and database connectivity for a specific division
 *     tags: [AEBF]
 *     parameters:
 *       - in: query
 *         name: division
 *         schema:
 *           type: string
 *           enum: [FP]
 *           default: FP
 *         description: Division to check connectivity for
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     database:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         version:
 *                           type: string
 *                         division:
 *                           type: string
 *                         totalRecords:
 *                           type: integer
 *       500:
 *         description: Database connection error
 */
router.get('/health', validationRules.health, asyncHandler(async (req, res) => {
  const division = req.query.division || 'FP';
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Test database connection
  const result = await divisionPool.query('SELECT NOW() as current_time, version() as pg_version');
  
  // Check if data_excel table exists and get statistics
  const tableCheck = await divisionPool.query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT division) as divisions,
      MIN(year) as min_year,
      MAX(year) as max_year
    FROM public.${tables.actualData}
  `);
  
  successResponse(res, {
    status: 'healthy',
    timestamp: result.rows[0].current_time,
    database: {
      connected: true,
      version: result.rows[0].pg_version,
      division: division,
      table: tables.actualData,
      totalRecords: parseInt(tableCheck.rows[0].total_records),
      divisions: parseInt(tableCheck.rows[0].divisions),
      yearRange: `${tableCheck.rows[0].min_year}-${tableCheck.rows[0].max_year}`
    }
  }, 'System healthy');
}));

module.exports = router;
