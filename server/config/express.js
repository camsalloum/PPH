/**
 * Express Application Configuration
 * Configures middleware, CORS, body parsers, and static files
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const logger = require('../utils/logger');
const requestLogger = require('../middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');
const { CORS_CONFIG, UPLOAD_CONFIG } = require('./environment');
const { applySecurityMiddleware, securityAuditMiddleware, rateLimitSecurityHeaders } = require('../middleware/security');
const { metricsMiddleware } = require('../middleware/monitoring');
const { errorTrackingMiddleware } = require('../services/errorTracking');
const { correlationMiddleware, requestSummaryMiddleware } = require('../middleware/correlation');

/**
 * Configure Express application with all middleware
 * @param {express.Application} app - Express app instance
 */
function configureExpress(app) {
  logger.info('Configuring Express middleware...');
  
  // Security middleware (Helmet.js) - must be first
  applySecurityMiddleware(app);
  
  // Correlation ID tracking (very early for request tracing)
  app.use(correlationMiddleware);
  
  // Metrics collection (very early to track all requests)
  app.use(metricsMiddleware);
  
  // Request logging (before other middleware)
  app.use(requestLogger);
  
  // Request summary logging (logs completed requests)
  app.use(requestSummaryMiddleware(logger));
  
  // Security audit logging
  app.use(securityAuditMiddleware);
  app.use(rateLimitSecurityHeaders);
  
  // Cookie parsing middleware (for refresh tokens)
  app.use(cookieParser());
  
  // Body parsing middleware - increased limit for large HTML budget imports
  const bodyLimit = UPLOAD_CONFIG.maxFileSize;
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: true }));
  
  // CORS configuration (must support credentials for cookies)
  app.use(cors({
    ...CORS_CONFIG,
    credentials: true // Enable cookies in CORS
  }));
  
  // Handle favicon requests (browsers request this automatically)
  app.get('/favicon.ico', (req, res) => res.status(204).end());
  
  // Static file serving with CORS headers for cross-origin image loading
  const uploadsDir = path.join(__dirname, '..', UPLOAD_CONFIG.uploadDir);
  app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, express.static(uploadsDir));
  
  logger.info('✅ Express middleware configured', {
    bodyLimit,
    corsOrigin: CORS_CONFIG.origin,
    uploadsDir
  });
}

/**
 * Mount all application routes
 * @param {express.Application} app - Express app instance
 */
function mountRoutes(app) {
  logger.info('Mounting API routes...');

  const profileStartup = process.env.STARTUP_PROFILE === '1' || process.env.STARTUP_PROFILE === 'true';
  const startNs = profileStartup ? process.hrtime.bigint() : null;
  const timedRequire = (label, modulePath) => {
    if (!profileStartup) return require(modulePath);
    const t0 = process.hrtime.bigint();
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(modulePath);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    logger.info(`[STARTUP_PROFILE] require ${label}`, { ms: Math.round(ms * 100) / 100 });
    return mod;
  };
  
  // Import route modules
  const authRoutes = timedRequire('auth', '../routes/auth');
  const settingsRoutes = timedRequire('settings', '../routes/settings');
  const aebfRoutes = timedRequire('aebf', '../routes/aebf');
  const budgetDraftRoutes = timedRequire('budget-draft', '../routes/budget-draft');
  const salesRepGroupAllocationRoutes = timedRequire('sales-rep-group-allocation', '../routes/sales-rep-group-allocation');
  const salesRepAllocationRoutes = timedRequire('sales-rep-allocation', '../routes/sales-rep-allocation');
  const divisionMergeRulesRoutes = timedRequire('divisionMergeRules', '../routes/divisionMergeRules');
  const globalConfigRoutes = timedRequire('globalConfig', '../routes/globalConfig');
  const fpRoutes = timedRequire('fp', '../routes/fp');
  const universalRoutes = timedRequire('universal', '../routes/universal');
  const excelRoutes = timedRequire('excel', '../routes/excel');
  const salesRepsRoutes = timedRequire('salesReps', '../routes/salesReps');
  const databaseRoutes = timedRequire('database', '../routes/database');
  const adminRoutes = timedRequire('admin', '../routes/admin');
  const masterDataRoutes = timedRequire('masterData', '../routes/masterData');
  const productGroupsRoutes = timedRequire('productGroups', '../routes/productGroups');
  const confirmedMergesRoutes = timedRequire('confirmedMerges', '../routes/confirmedMerges');
  const dashboardRoutes = timedRequire('dashboards', '../routes/dashboards');
  const salesDataRoutes = timedRequire('salesData', '../routes/salesData');
  const fpPerformanceRoutes = timedRequire('fpPerformance', '../routes/fpPerformance');
  const analyticsRoutes = timedRequire('analytics', '../routes/analytics');
  const monitoringRoutes = timedRequire('monitoring', '../routes/monitoring');
  const metricsRoutes = timedRequire('metrics', '../routes/metrics');
  const currencyRoutes = timedRequire('currency', '../routes/currency');
  const countriesRoutes = timedRequire('countries', '../routes/countries');
  const forecastSalesRoutes = timedRequire('forecastSales', '../routes/forecastSales');
  const plRoutes = timedRequire('pl', '../routes/pl');
  const permissionsRoutes = timedRequire('permissions', '../routes/permissions');
  const employeesRoutes = timedRequire('employees', '../routes/employees');
  const territoriesRoutes = timedRequire('territories', '../routes/territories');
  const authorizationRoutes = timedRequire('authorization', '../routes/authorization');
  const setupRoutes = timedRequire('setup', '../routes/setup');
  const customerMasterRoutes = timedRequire('customerMaster', '../routes/customerMaster');
  const unifiedUsersRoutes = timedRequire('unifiedUsers', '../routes/unifiedUsers');
  const backupRoutes = timedRequire('backup', '../routes/backup');
  const reportAIRoutes = timedRequire('reportAI', '../routes/report-ai');
  const aiLearningRoutes = timedRequire('aiLearning', '../routes/ai-learning');
  const platformRoutes = timedRequire('platform', '../routes/platform');
  const crmRoutes = timedRequire('crm', '../routes/crm');
  const crmAnalyticsRoutes = timedRequire('crmAnalytics', '../routes/crm/analytics');
  const crmBulkRoutes = timedRequire('crmBulk', '../routes/crm/bulk');
  const notificationsRoutes = timedRequire('notifications', '../routes/notifications');
  const mesPreSalesRoutes = timedRequire('mesPreSales', '../routes/mes/presales');
  const mesFlowRoutes = timedRequire('mesFlow', '../routes/mes/flow');
  const mesQcIncomingRoutes = timedRequire('mesQcIncoming', '../routes/mes/qc-incoming-rm');
  const mesQcCertificateRoutes = timedRequire('mesQcCertificates', '../routes/mes/qc-certificates');
  const mesMasterDataRoutes = timedRequire('mesMasterData', '../routes/mes/master-data');
  const unifiedRoutes = timedRequire('unified', '../routes/unified');
  const pendingCountriesRoutes = timedRequire('pendingCountries', '../routes/pendingCountries');
  const erpPeriodsRoutes = timedRequire('erpPeriods', '../routes/erp-periods');
  const divisionsRoutes = timedRequire('divisions', '../routes/divisions');
  const budgetAchievementRoutes = timedRequire('budgetAchievement', '../routes/budget-achievement');
  const configRoutes = timedRequire('config', '../routes/config');
  const oracleDirectSyncRoutes = timedRequire('oracleDirectSync', '../routes/oracleDirectSync');
  const rmSyncRoutes = timedRequire('rmSync', '../routes/rmSync');
  const documentationRoutes = timedRequire('documentation', '../routes/documentation');
  const deploymentRoutes = timedRequire('deployment', '../routes/deployment');
  const exportPdfRoutes = timedRequire('exportPdf', '../routes/exportPdf');
  const webhookRoutes = timedRequire('webhooks', '../routes/webhooks');
  
  // Mount setup routes FIRST (no auth required, needed for initial setup)
  app.use('/api/setup', setupRoutes);
  
  // Mount monitoring routes (public - no auth required)
  app.use('/api', monitoringRoutes);
  app.use('/api/metrics', metricsRoutes);
  
  // Mount existing routes
  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/aebf', aebfRoutes);
  app.use('/api/budget-draft', budgetDraftRoutes);
  app.use('/api/sales-rep-group-allocation', salesRepGroupAllocationRoutes);
  app.use('/api/sales-rep-allocation', salesRepAllocationRoutes);
  app.use('/api/division-merge-rules', divisionMergeRulesRoutes);
  app.use('/api/currency', currencyRoutes);
  app.use('/api/countries', countriesRoutes);
  
  // Mount new modular routes (Phase 2)
  app.use('/api/standard-config', globalConfigRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/fp', fpRoutes);
  app.use('/api', universalRoutes);
  app.use('/api', excelRoutes);
  app.use('/api/sales-reps', salesRepsRoutes);
  app.use('/api', databaseRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/master-data', masterDataRoutes);
  app.use('/api/product-groups', productGroupsRoutes);
  app.use('/api/confirmed-merges', confirmedMergesRoutes);
  app.use('/api/customer-dashboard', dashboardRoutes);
  app.use('/api', salesDataRoutes);
  app.use('/api/fp', fpPerformanceRoutes);
  app.use('/api', analyticsRoutes);
  app.use('/api/forecast-sales', forecastSalesRoutes);
  app.use('/api/pl', plRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/employees', employeesRoutes);
  app.use('/api/territories', territoriesRoutes);
  app.use('/api/authorization', authorizationRoutes);
  app.use('/api/customer-master', customerMasterRoutes);
  app.use('/api/unified-users', unifiedUsersRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/report-ai', reportAIRoutes);
  app.use('/api/ai-learning', aiLearningRoutes);
  app.use('/api/periods', erpPeriodsRoutes);
  
  // Platform administration routes (SaaS multi-tenant)
  app.use('/api/platform', platformRoutes);
  
  // Budget achievement report (Actual vs Budget by product group & customer)
  app.use('/api', budgetAchievementRoutes);

  // CRM module routes
  app.use('/api/crm', crmRoutes);
  app.use('/api/crm/analytics', crmAnalyticsRoutes);
  app.use('/api/crm/bulk', crmBulkRoutes);

  // In-app notifications routes
  app.use('/api/notifications', notificationsRoutes);

  // MES module routes
  app.use('/api/mes/presales', mesPreSalesRoutes);
  app.use('/api/mes/flow', mesFlowRoutes);
  app.use('/api/mes/qc', mesQcIncomingRoutes);
  app.use('/api/mes/qc', mesQcCertificateRoutes);
  app.use('/api/mes/master-data', mesMasterDataRoutes);
  
  // Unified data source routes (single source of truth)
  app.use('/api/unified', unifiedRoutes);
  
  // Pending countries routes (admin notification for unknown countries)
  app.use('/api/pending-countries', pendingCountriesRoutes);
  
  // Oracle Direct Sync routes (bypass Excel, connect directly to Oracle ERP)
  app.use('/api/oracle-direct', oracleDirectSyncRoutes);
  
  // Raw Material Sync routes (Oracle HAP111.XL_FPRMAVERAGES_PMD_111 → fp_actualrmdata)
  app.use('/api/rm-sync', rmSyncRoutes);
  
  // Division management routes (for Company Settings)
  app.use('/api/divisions', divisionsRoutes);
  
  // Documentation routes (auto-generated system documentation for ProjectWorkflow)
  app.use('/api/documentation', documentationRoutes);
  
  // Deployment routes (admin only - for deploying to VPS)
  app.use('/api/deployment', deploymentRoutes);

  // Webhook routes (Outlook notifications)
  app.use('/api/webhooks', webhookRoutes);
  
  // PDF export route (server-side Puppeteer rendering)
  app.use('/api/export-pdf', exportPdfRoutes);
  
  logger.info('✅ API routes mounted', {
    routes: [
      '/api/setup', '/api/auth', '/api/settings', '/api/aebf', '/api/budget-draft', 
      '/api/division-merge-rules', '/api/currency', '/api/countries', '/api/standard-config', '/api/fp', 
      '/api/universal', '/api/excel', '/api/sales-reps',
      '/api/database', '/api/admin', '/api/master-data', '/api/product-groups',
      '/api/confirmed-merges', '/api/customer-dashboard', '/api/sales-data', '/api/pl', '/api/permissions',
      '/api/employees', '/api/territories', '/api/authorization', '/api/customer-master', '/api/unified-users',
      '/api/backup', '/api/report-ai', '/api/ai-learning', '/api/platform', '/api/crm', '/api/unified',
      '/api/pending-countries', '/api/oracle-direct', '/api/rm-sync', '/api/mes/qc', '/api/divisions', '/api/documentation', '/api/deployment', '/api/webhooks'
    ]
  });

  if (profileStartup && startNs) {
    const totalMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    logger.info('[STARTUP_PROFILE] mountRoutes total', { ms: Math.round(totalMs * 100) / 100 });
  }
}

/**
 * Mount error handling middleware (must be last)
 * @param {express.Application} app - Express app instance
 */
function mountErrorHandlers(app) {
  // 404 handler (for undefined routes)
  app.use(notFoundHandler);
  
  // Global error handler (must be last)
  app.use(errorHandler);
  
  logger.debug('✅ Error handlers mounted');
}

/**
 * Initialize complete Express application
 * @returns {express.Application} Configured Express app
 */
function initializeApp() {
  const app = express();
  
  // Configure middleware
  configureExpress(app);
  
  // Mount routes
  mountRoutes(app);
  
  // Setup Swagger API documentation (before error handlers)
  try {
    const { setupSwagger } = require('./swagger');
    setupSwagger(app);
    logger.info('📚 API documentation available at /api-docs');
  } catch (swaggerError) {
    logger.warn('Swagger documentation not available', { error: swaggerError.message });
  }
  
  // Mount error handlers (must be last)
  mountErrorHandlers(app);
  
  return app;
}

module.exports = {
  configureExpress,
  mountRoutes,
  mountErrorHandlers,
  initializeApp
};
