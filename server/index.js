/**
 * IPDashboard Server - Main Entry Point
 * Modular Express Server with Winston Logging
 * 
 * All routes and middleware are organized in separate modules:
 * - config/express.js: Express configuration and route mounting
 * - config/environment.js: Environment validation
 * - routes/*: All API endpoints organized by functionality
 */

// Load environment variables ONCE at the very top
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { initializeApp } = require('./config/express');
const { validateEnvironment } = require('./config/environment');
const logger = require('./utils/logger');
const GlobalConfigService = require('./database/GlobalConfigService');
const { testConnection, pool } = require('./database/config');
const { syncAllTablesToAllDivisions } = require('./utils/divisionDatabaseManager');
const { initRedis } = require('./middleware/cache');
const { migrateUserSessions } = require('./migrations/add-last-activity-to-sessions');
const { migrateCountryTimezone } = require('./migrations/add-country-timezone-to-master-countries');
const { migrateAuthorizationTables } = require('./migrations/auth-001-authorization-tables');
const { loadAliasCache } = require('./services/salesRepResolver');
const multiTenantPool = require('./database/multiTenantPool');
const cron = require('node-cron');
const { refreshProductGroupPricing } = require('./tasks/refreshProductGroupPricing');

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ALWAYS log to console so errors are visible in pm2 logs and terminal
console.log(`[startup] NODE_ENV=${NODE_ENV}, PORT=${PORT}`);

/**
 * Start the server
 */
const startServer = async () => {
  try {
    console.log('[startup] Starting server...');
    logger.info('🚀 Starting IPDashboard Backend Server...');
    logger.info('Environment:', { NODE_ENV, PORT });
    
    // Validate environment variables
    logger.info('Validating environment configuration...');
    validateEnvironment();
    logger.info('✅ Environment configuration valid');
    
    // Initialize multi-tenant pool manager (SaaS platform)
    logger.info('Initializing multi-tenant pool manager...');
    try {
      await multiTenantPool.initialize();
      logger.info('✅ Multi-tenant pool manager initialized');
    } catch (poolError) {
      logger.warn('⚠️  Multi-tenant pool not available (platform database may not exist)', { error: poolError.message });
    }
    
    // Initialize Express app with all middleware and routes
    const app = initializeApp();
    
    // Initialize Redis cache (optional - will continue if unavailable)
    logger.info('Initializing cache system...');
    try {
      const redisConnected = await initRedis();
      if (redisConnected) {
        logger.info('✅ Redis cache connected');
      } else {
        logger.warn('⚠️  Redis cache not available - caching disabled');
      }
    } catch (cacheError) {
      logger.warn('Cache initialization warning', { error: cacheError.message });
    }
    
    // Initialize global configuration
    logger.info('Loading global configuration...');
    try {
      const globalConfigService = new GlobalConfigService();
      const standardConfig = await globalConfigService.getAllConfigs();
      logger.info('✅ Global configuration loaded', { 
        configKeys: Object.keys(standardConfig).length 
      });
    } catch (configError) {
      logger.warn('Could not load global configuration', { error: configError.message });
    }
    
    // Test database connection
    logger.database('Testing database connection...');
    const dbConnected = await testConnection();
    
    if (dbConnected) {
      logger.database('✅ Database connection successful');
      
      // Run auth database migrations
      logger.info('Running auth database migrations...');
      try {
        await migrateUserSessions();
        await migrateCountryTimezone();
        await migrateAuthorizationTables();
        logger.info('✅ Auth database migrations complete');
      } catch (migrationError) {
        logger.warn('Auth migration warning', { error: migrationError.message });
      }

      // Run CRM database migrations
      logger.info('Running CRM database migrations...');
      try {
        const { up: crmContacts }       = require('./migrations/mes-presales-011-customer-contacts');
        const { up: crmActivities }       = require('./migrations/crm-001-activities');
        const { up: crmTasks }            = require('./migrations/crm-002-tasks');
        const { up: crmNotes }            = require('./migrations/crm-003-notes');
        const { up: crmDeals }            = require('./migrations/crm-004-deals');
        const { up: crmActivitiesV2 }     = require('./migrations/crm-005-activities-unify');
        const { up: crmDealInquiry }      = require('./migrations/crm-006-deal-inquiry-link');
        const { up: crmRepGroupId }       = require('./migrations/crm-007-rep-group-id');
        const { up: crmActivityCanon }    = require('./migrations/crm-008-activity-type-canonical');
        const { up: crmTechnicalBriefs }  = require('./migrations/crm-009-technical-briefs');
        const { up: crmPackagingProfile } = require('./migrations/crm-010-packaging-profile');
        const { up: crmCompetitorNotes }  = require('./migrations/crm-011-competitor-notes');
        const { up: crmMeetings }         = require('./migrations/crm-012-meetings');
        const { up: crmCalls }            = require('./migrations/crm-013-calls');
        const { up: crmWorklistPrefs }       = require('./migrations/crm-014-worklist-preferences');
        const { up: crmTemplateFullFields }  = require('./migrations/crm-018-template-full-fields');
        const { up: crmStopRouteIntel }      = require('./migrations/crm-019-stop-route-intel');
        const { up: crmTripDrafts }          = require('./migrations/crm-020-trip-drafts');
        await crmContacts();
        await crmActivities();
        await crmTasks();
        await crmNotes();
        await crmDeals();
        await crmActivitiesV2();
        await crmDealInquiry();
        await crmRepGroupId();
        await crmActivityCanon();
        await crmTechnicalBriefs();
        await crmPackagingProfile();
        await crmCompetitorNotes();
        await crmMeetings();
        await crmCalls();
        await crmWorklistPrefs();
        await crmTemplateFullFields();
        await crmStopRouteIntel();
        await crmTripDrafts();
        logger.info('✅ CRM migrations complete (crm-001 through crm-020)');
      } catch (migrationError) {
        logger.warn('CRM migration warning', { error: migrationError.message });
      }
      
      // Load sales rep alias cache for name resolution
      logger.info('Loading sales rep alias cache...');
      try {
        await loadAliasCache(pool);
      } catch (cacheError) {
        logger.warn('Sales rep alias cache warning', { error: cacheError.message });
      }
      
      // Preload sales rep groups from database (eliminates JSON file dependency)
      logger.info('Loading sales rep groups from database...');
      try {
        const { preloadCache: preloadSalesRepGroups } = require('./services/salesRepGroupsService');
        await preloadSalesRepGroups();
        logger.info('✅ Sales rep groups loaded from database');
      } catch (cacheError) {
        logger.warn('Sales rep groups cache warning', { error: cacheError.message });
      }
      
      // Sync tables across all divisions IN THE BACKGROUND (don't block startup)
      // This ensures HC has same tables as FP without delaying server start
      setImmediate(async () => {
        logger.database('Synchronizing division tables (background)...');
        try {
          const syncResult = await syncAllTablesToAllDivisions();
          if (syncResult.synced > 0) {
            logger.database(`✅ Division sync: ${syncResult.synced} tables created`);
          } else {
            logger.database('✅ All divisions are in sync');
          }
        } catch (syncError) {
          logger.warn('Division sync warning', { error: syncError.message });
        }
      });
    } else {
      logger.error('❌ Database connection failed - server will start but database features may not work');
      logger.warn('Please check your .env file and ensure PostgreSQL is running');
    }
    
    // Start listening
    const server = app.listen(PORT, () => {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`✅ Backend server running on http://localhost:${PORT}`);
      logger.info(`${'='.repeat(60)}\n`);
      logger.info('📊 Available API endpoints:');
      logger.info('   - Authentication: /api/auth/*');
      logger.info('   - Settings: /api/settings/*');
      logger.info('   - AEBF (Advanced Excel Budget & Forecast): /api/aebf/*');
      logger.info('   - Budget Draft: /api/budget-draft/*');
      logger.info('   - Division Merge Rules: /api/division-merge-rules/*');
      logger.info('   - Global Config: /api/standard-config/*');
      logger.info('   - FP Division: /api/fp/*');
      // Division routes are dynamically configured based on company_divisions table
      logger.info('   - Universal (Division-agnostic): /api/*');
      logger.info('   - Excel Downloads: /api/financials/*.xlsx, /api/sales.xlsx');
      logger.info('   - Sales Representatives: /api/sales-reps/*');
      logger.info('   - Database Operations: /api/countries-db, /api/customers-db, etc.');
      logger.info('   - Admin: /api/admin/*');
      logger.info('   - Master Data: /api/master-data/*');
      logger.info('   - Configuration: /api/config/* (dynamic materials & pricing)');
      logger.info('   - Product Groups: /api/product-groups/*');
      logger.info('   - Confirmed Merges: /api/confirmed-merges/*');
      logger.info('   - Dashboards: /api/customer-dashboard/*, /api/sales-data/*');
      logger.info('   - Analytics: /api/geographic-distribution, /api/customer-insights-db');
      logger.info('   - AI Learning: /api/ai-learning/*');
      logger.info('   - Platform Admin: /api/platform/*');
      logger.info('\n🔧 Development Mode Features:');
      logger.info('   - Winston logging with file rotation');
      logger.info('   - Detailed error messages and stack traces');
      logger.info('   - CORS enabled for frontend development');
      
      // Start AI Learning Scheduler (runs in background)
      (async () => {
        try {
          const learningScheduler = require('./services/LearningScheduler');
          await learningScheduler.start();
          logger.info('   - AI Learning Scheduler: Active');
        } catch (schedError) {
          logger.warn('AI Learning Scheduler failed to start', { error: schedError.message });
        }
      })();
      
      // Schedule nightly refresh of Product Groups pricing materialized view
      // Runs at 2:00 AM daily (server local time)
      cron.schedule('0 2 * * *', async () => {
        logger.info('🕒 Starting scheduled materialized view refresh (2:00 AM)');
        try {
          const result = await refreshProductGroupPricing();
          logger.info(`✅ Materialized view refreshed successfully in ${result.duration}ms`);
        } catch (error) {
          logger.error('❌ Failed to refresh materialized view', { error: error.message });
        }
      });
      logger.info('   - Product Groups MV Refresh: Scheduled (2:00 AM daily)');

      // CRM Daily Digest — 7:00 AM daily
      cron.schedule('0 7 * * *', async () => {
        try {
          const { runDailyDigest } = require('./jobs/crmDailyDigest');
          await runDailyDigest();
        } catch (err) {
          logger.error('CRM Daily Digest cron failed', { error: err.message });
        }
      });
      logger.info('   - CRM Daily Digest: Scheduled (7:00 AM daily)');

      // SLA Breach Checker — every 30 minutes
      cron.schedule('*/30 * * * *', async () => {
        try {
          const { checkSlaBreaches } = require('./jobs/slaBreachChecker');
          await checkSlaBreaches();
        } catch (err) {
          logger.error('SLA Breach Checker cron failed', { error: err.message });
        }
      });
      logger.info('   - SLA Breach Checker: Scheduled (every 30 min)');

      // Outlook Webhook Renewal — every 12 hours (Phase 3b optional)
      cron.schedule('0 */12 * * *', async () => {
        try {
          const { renewOutlookWebhookSubscriptions } = require('./jobs/outlookWebhookRenewalJob');
          await renewOutlookWebhookSubscriptions();
        } catch (err) {
          logger.error('Outlook webhook renewal cron failed', { error: err.message });
        }
      });
      logger.info('   - Outlook Webhook Renewal: Scheduled (every 12 hours)');

      // Outlook Webhook Migration — every 6 hours (upgrade active polling connections)
      cron.schedule('0 */6 * * *', async () => {
        try {
          const { migrateOutlookConnectionsToWebhooks } = require('./jobs/outlookWebhookMigrationJob');
          await migrateOutlookConnectionsToWebhooks({ limit: 100 });
        } catch (err) {
          logger.error('Outlook webhook migration cron failed', { error: err.message });
        }
      });
      logger.info('   - Outlook Webhook Migration: Scheduled (every 6 hours)');

      // Outlook Primary Polling — every 10 minutes (non-webhook connections)
      cron.schedule('*/10 * * * *', async () => {
        try {
          const { runOutlookPrimaryPollingJob } = require('./jobs/outlookSyncJob');
          await runOutlookPrimaryPollingJob();
        } catch (err) {
          logger.error('Outlook primary polling cron failed', { error: err.message });
        }
      });
      logger.info('   - Outlook Primary Polling: Scheduled (every 10 min, non-webhook)');

      // Outlook Safety-Net Polling — hourly (webhook-enabled connections)
      cron.schedule('0 * * * *', async () => {
        try {
          const { runOutlookSafetyNetPollingJob } = require('./jobs/outlookSyncJob');
          await runOutlookSafetyNetPollingJob();
        } catch (err) {
          logger.error('Outlook safety-net polling cron failed', { error: err.message });
        }
      });
      logger.info('   - Outlook Safety-Net Polling: Scheduled (hourly, webhook-enabled)');
      
      logger.info(`\n${'='.repeat(60)}\n`);

      // Kick off one migration pass after startup (non-blocking).
      setImmediate(async () => {
        try {
          const { migrateOutlookConnectionsToWebhooks } = require('./jobs/outlookWebhookMigrationJob');
          await migrateOutlookConnectionsToWebhooks({ limit: 100 });
        } catch (err) {
          logger.warn('Outlook webhook migration startup pass skipped', { error: err.message });
        }
      });
      
      // Warm-up database cache in background (pre-load heavy queries)
      // This runs AFTER server is ready to accept requests
      setImmediate(async () => {
        logger.info('🔥 Starting database warm-up (background)...');
        const warmupStart = Date.now();
        try {
          // Warm-up actualcommon with a simple count query
          await pool.query(`
            SELECT COUNT(*) 
            FROM fp_actualcommon 
            WHERE year = 2025 AND UPPER(TRIM(admin_division_code)) = 'FP'
          `);
          
          // Pre-cache geographic distribution query pattern
          await pool.query(`
            SELECT country, COUNT(*) 
            FROM fp_actualcommon 
            WHERE year = 2025 AND UPPER(TRIM(admin_division_code)) = 'FP'
            GROUP BY country 
            LIMIT 1
          `);
          
          // Pre-cache sales rep query pattern
          await pool.query(`
            SELECT DISTINCT sales_rep_name 
            FROM fp_actualcommon 
            WHERE year = 2025 AND UPPER(TRIM(admin_division_code)) = 'FP'
            LIMIT 1
          `);
          
          // Pre-cache customer query pattern
          await pool.query(`
            SELECT DISTINCT customer_name 
            FROM fp_actualcommon 
            WHERE year = 2025 AND UPPER(TRIM(admin_division_code)) = 'FP'
            LIMIT 1
          `);
          
          const warmupTime = Date.now() - warmupStart;
          logger.info(`✅ Database warm-up complete (${warmupTime}ms) - first requests will be faster`);
        } catch (warmupError) {
          logger.warn('Database warm-up warning (non-critical)', { error: warmupError.message });
        }
      });
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      try {
        const learningScheduler = require('./services/LearningScheduler');
        learningScheduler.stop();
      } catch (e) {}
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
    
    // SIGINT: Only handle in development (Ctrl+C in terminal).
    // In production, PM2 manages lifecycle via SIGTERM.
    // PM2 sends SIGINT during its own lifecycle events (restart/reload/save),
    // which would cause our app to exit and PM2 to think it crashed.
    if (NODE_ENV !== 'production') {
      process.on('SIGINT', () => {
        logger.info('\nSIGINT signal received: closing HTTP server');
        try {
          const learningScheduler = require('./services/LearningScheduler');
          learningScheduler.stop();
        } catch (e) {}
        server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });
      });
    }
    
    // Handle uncaught exceptions to prevent crashes
    process.on('uncaughtException', (error) => {
      console.error('[UNCAUGHT]', error.message, error.stack);
      logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
      // Give time to log the error before exiting
      setTimeout(() => process.exit(1), 1000);
    });
    
    // Handle unhandled promise rejections to prevent crashes
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', { promise, reason: reason?.message || reason });
    });
    
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error.message);
    console.error(error.stack);
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Start the server
startServer();

// Export for testing
module.exports = { startServer };
