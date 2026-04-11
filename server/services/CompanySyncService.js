/**
 * ============================================================================
 * COMPANY SYNC SERVICE
 * ============================================================================
 * 
 * Synchronizes company and division data FROM tenant AUTH databases TO platform.
 * 
 * PRINCIPLE: Tenant's company_settings (in auth_database) is the SOURCE OF TRUTH.
 * Platform database only caches this data for quick queries.
 * 
 * DATABASE ARCHITECTURE:
 * - auth_database_name: Database containing company_settings (key-value store)
 * - database_name: Database containing division data (sales, budget, etc.)
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Lazy load poolManager to avoid circular dependency
let _poolManager = null;
let _directPlatformPool = null;

function getPoolManager() {
  if (!_poolManager) {
    try {
      _poolManager = require('../database/multiTenantPool');
    } catch (e) {
      // May fail if running standalone
      return null;
    }
  }
  return _poolManager;
}

function getPlatformPool() {
  const poolManager = getPoolManager();
  if (poolManager && poolManager.platformPool) {
    return poolManager.platformPool;
  }
  // Fallback: create direct connection (for standalone scripts)
  if (!_directPlatformPool) {
    _directPlatformPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: 'propackhub_platform',
    });
  }
  return _directPlatformPool;
}

class CompanySyncService {
  constructor() {
    this.dbConfig = {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT) || 5432,
    };
  }

  /**
   * Sync a company's data from their AUTH database to the platform
   * @param {string} companyCode - The company code (e.g., 'interplast')
   * @param {string} authDatabaseName - The auth database name (e.g., 'ip_auth_database')
   */
  async syncCompanyFromTenant(companyCode, authDatabaseName) {
    logger.info(`[CompanySync] Syncing company ${companyCode} from ${authDatabaseName}`);

    // Connect to tenant's AUTH database (where company_settings lives)
    const tenantPool = new Pool({
      ...this.dbConfig,
      database: authDatabaseName,
    });

    const platformPool = getPlatformPool();

    try {
      // Read company settings from tenant's AUTH database (key-value store)
      const settingsResult = await tenantPool.query(`
        SELECT setting_key, setting_value 
        FROM company_settings 
        WHERE setting_key IN ('company_name', 'company_logo_url', 'divisions', 'company_currency')
      `);

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });

      logger.info(`[CompanySync] Found settings:`, Object.keys(settings));

      // Update company in platform database
      if (settings.company_name) {
        await platformPool.query(`
          UPDATE companies 
          SET company_name = $1,
              logo_url = $2,
              currency_code = $3,
              updated_at = NOW()
          WHERE company_code = $4
        `, [
          settings.company_name,
          settings.company_logo_url || null,
          settings.company_currency?.code || 'AED',
          companyCode
        ]);

        logger.info(`[CompanySync] Updated company name to: ${settings.company_name}`);
      }

      // Sync divisions
      if (settings.divisions && Array.isArray(settings.divisions)) {
        // Get company_id
        const companyResult = await platformPool.query(
          'SELECT company_id FROM companies WHERE company_code = $1',
          [companyCode]
        );
        
        if (companyResult.rows.length > 0) {
          const companyId = companyResult.rows[0].company_id;

          for (const div of settings.divisions) {
            // Upsert division
            await platformPool.query(`
              INSERT INTO company_divisions (company_id, division_code, division_name, updated_at)
              VALUES ($1, $2, $3, NOW())
              ON CONFLICT (company_id, division_code) 
              DO UPDATE SET division_name = $3, updated_at = NOW()
            `, [companyId, div.code.toLowerCase(), div.name]);

            logger.info(`[CompanySync] Synced division: ${div.code} - ${div.name}`);
          }

          // Remove divisions that no longer exist in tenant
          const divCodes = settings.divisions.map(d => d.code.toLowerCase());
          await platformPool.query(`
            DELETE FROM company_divisions 
            WHERE company_id = $1 AND division_code NOT IN (SELECT unnest($2::text[]))
          `, [companyId, divCodes]);
        }
      }

      logger.info(`[CompanySync] Completed sync for ${companyCode}`);
      return { 
        success: true, 
        companyCode, 
        company_name: settings.company_name,
        divisions: settings.divisions,
        synced: settings 
      };

    } catch (error) {
      logger.error(`[CompanySync] Error syncing ${companyCode}:`, error);
      throw error;
    } finally {
      await tenantPool.end();
    }
  }

  /**
   * Sync ALL companies from their AUTH databases
   * Uses auth_database_name column from companies table
   */
  async syncAllCompanies() {
    logger.info('[CompanySync] Starting full sync of all companies...');

    const platformPool = getPlatformPool();
    
    // Get all companies with their AUTH database references
    const companies = await platformPool.query(`
      SELECT company_code, auth_database_name 
      FROM companies 
      WHERE is_active = true AND auth_database_name IS NOT NULL
    `);

    const results = [];
    for (const company of companies.rows) {
      try {
        const result = await this.syncCompanyFromTenant(
          company.company_code, 
          company.auth_database_name
        );
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          companyCode: company.company_code,
          error: error.message
        });
      }
    }

    logger.info(`[CompanySync] Full sync complete. ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Register a NEW company by reading from their AUTH database
   * This is used when onboarding a new tenant
   * 
   * @param {string} authDatabaseName - The tenant's AUTH database name (contains company_settings)
   * @param {string} dataDatabaseName - The tenant's DATA database name (contains sales, etc.)
   * @param {string} companyCode - Unique code for the company
   * @param {number} planId - Subscription plan ID
   */
  async registerCompanyFromDatabase(authDatabaseName, dataDatabaseName, companyCode, planId = 1) {
    logger.info(`[CompanySync] Registering new company from ${authDatabaseName}`);

    // Connect to tenant's AUTH database to read their settings
    const tenantPool = new Pool({
      ...this.dbConfig,
      database: authDatabaseName,
    });

    const platformPool = getPlatformPool();

    try {
      // Read company settings from tenant (key-value store)
      const settingsResult = await tenantPool.query(`
        SELECT setting_key, setting_value 
        FROM company_settings 
        WHERE setting_key IN ('company_name', 'company_logo_url', 'divisions', 'company_currency')
      `);

      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });

      if (!settings.company_name) {
        throw new Error('Tenant database has no company_name in company_settings');
      }

      // Insert company into platform
      const companyResult = await platformPool.query(`
        INSERT INTO companies (
          company_code, company_name, database_name, auth_database_name,
          logo_url, currency_code, plan_id, 
          subscription_status, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true)
        RETURNING company_id
      `, [
        companyCode,
        settings.company_name,
        dataDatabaseName,
        authDatabaseName,
        settings.company_logo_url || null,
        settings.company_currency?.code || 'AED',
        planId
      ]);

      const companyId = companyResult.rows[0].company_id;

      // Insert divisions
      if (settings.divisions && Array.isArray(settings.divisions)) {
        for (const div of settings.divisions) {
          await platformPool.query(`
            INSERT INTO company_divisions (company_id, division_code, division_name)
            VALUES ($1, $2, $3)
          `, [companyId, div.code.toLowerCase(), div.name]);
        }
      }

      logger.info(`[CompanySync] Registered company: ${settings.company_name} (ID: ${companyId})`);

      return {
        success: true,
        companyId,
        companyCode,
        companyName: settings.company_name,
        divisions: settings.divisions
      };

    } catch (error) {
      logger.error('[CompanySync] Error registering company:', error);
      throw error;
    } finally {
      await tenantPool.end();
    }
  }
}

module.exports = new CompanySyncService();
