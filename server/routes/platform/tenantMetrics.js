/**
 * ============================================================================
 * TENANT METRICS REPORTING API
 * ============================================================================
 * 
 * This route allows TENANTS to PUSH their metrics to the platform.
 * Platform NEVER queries tenant databases - tenants report their own metrics.
 * 
 * Authentication: API Key + Secret in headers
 * 
 * Security: 
 * - Only authenticated tenants can report metrics
 * - Tenants can only update their own metrics
 * - Rate limiting prevents abuse
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const poolManager = require('../../database/multiTenantPool');
const logger = require('../../utils/logger');

/**
 * Middleware: Authenticate tenant API key
 */
const authenticateTenantApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    if (!apiKey || !apiSecret) {
      return res.status(401).json({
        success: false,
        error: 'Missing API credentials',
        code: 'AUTH_REQUIRED',
      });
    }
    
    // Hash the secret for comparison
    const secretHash = crypto
      .createHash('sha256')
      .update(apiSecret)
      .digest('hex');
    
    // Look up the API key
    const result = await poolManager.platformQuery(`
      SELECT 
        k.*,
        c.company_id,
        c.company_code,
        c.company_name,
        c.is_active as company_active
      FROM tenant_api_keys k
      JOIN companies c ON k.company_id = c.company_id
      WHERE k.api_key = $1 
        AND k.api_secret_hash = $2
        AND k.is_active = TRUE
    `, [apiKey, secretHash]);
    
    if (result.rows.length === 0) {
      logger.warn(`[MetricsAPI] Invalid API key attempt: ${apiKey.substring(0, 20)}...`);
      return res.status(401).json({
        success: false,
        error: 'Invalid API credentials',
        code: 'AUTH_INVALID',
      });
    }
    
    const keyInfo = result.rows[0];
    
    // Check if company is still active
    if (!keyInfo.company_active) {
      return res.status(403).json({
        success: false,
        error: 'Company subscription is inactive',
        code: 'COMPANY_INACTIVE',
      });
    }
    
    // Check expiration
    if (keyInfo.expires_at && new Date(keyInfo.expires_at) < new Date()) {
      return res.status(403).json({
        success: false,
        error: 'API key has expired',
        code: 'KEY_EXPIRED',
      });
    }
    
    // Update last used
    await poolManager.platformQuery(`
      UPDATE tenant_api_keys 
      SET last_used_at = CURRENT_TIMESTAMP, 
          use_count = use_count + 1 
      WHERE key_id = $1
    `, [keyInfo.key_id]);
    
    // Attach tenant info to request
    req.tenant = {
      keyId: keyInfo.key_id,
      companyId: keyInfo.company_id,
      companyCode: keyInfo.company_code,
      companyName: keyInfo.company_name,
      canReportMetrics: keyInfo.can_report_metrics,
      canReportHealth: keyInfo.can_report_health,
    };
    
    next();
  } catch (error) {
    logger.error('[MetricsAPI] Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
    });
  }
};

// ============================================================================
// METRICS REPORTING ENDPOINTS
// ============================================================================

/**
 * POST /api/tenant-metrics/report
 * Report tenant metrics to the platform
 * 
 * Request body:
 * {
 *   active_user_count: 5,
 *   total_user_count: 10,
 *   division_count: 2,
 *   storage_used_mb: 500,
 *   monthly_active_users: 4,
 *   data_records_count: 15000,
 *   last_activity_at: "2025-12-28T10:30:00Z"
 * }
 */
router.post('/report', authenticateTenantApiKey, async (req, res) => {
  try {
    if (!req.tenant.canReportMetrics) {
      return res.status(403).json({
        success: false,
        error: 'API key not authorized for metrics reporting',
        code: 'NOT_AUTHORIZED',
      });
    }
    
    const {
      active_user_count,
      total_user_count,
      division_count,
      storage_used_mb,
      monthly_active_users,
      data_records_count,
      last_activity_at,
    } = req.body;
    
    // Insert metrics record for history
    await poolManager.platformQuery(`
      INSERT INTO tenant_reported_metrics (
        company_id,
        active_user_count,
        total_user_count,
        division_count,
        storage_used_mb,
        monthly_active_users,
        data_records_count,
        last_activity_at,
        reported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      req.tenant.companyId,
      active_user_count || 0,
      total_user_count || 0,
      division_count || 0,
      storage_used_mb || 0,
      monthly_active_users || 0,
      data_records_count || 0,
      last_activity_at || null,
    ]);
    
    // Update companies table with latest metrics for quick access
    await poolManager.platformQuery(`
      UPDATE companies 
      SET 
        reported_user_count = $1,
        reported_division_count = $2,
        reported_storage_mb = $3,
        metrics_last_reported_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = $4
    `, [
      active_user_count || 0,
      division_count || 0,
      storage_used_mb || 0,
      req.tenant.companyId,
    ]);
    
    logger.info(`[MetricsAPI] ${req.tenant.companyName} reported metrics: users=${active_user_count}, divisions=${division_count}`);
    
    res.json({
      success: true,
      message: 'Metrics reported successfully',
      data: {
        company_id: req.tenant.companyId,
        reported_at: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    logger.error('[MetricsAPI] Error reporting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report metrics',
      code: 'REPORT_ERROR',
    });
  }
});

/**
 * POST /api/tenant-metrics/health
 * Report tenant health/status to the platform
 */
router.post('/health', authenticateTenantApiKey, async (req, res) => {
  try {
    if (!req.tenant.canReportHealth) {
      return res.status(403).json({
        success: false,
        error: 'API key not authorized for health reporting',
        code: 'NOT_AUTHORIZED',
      });
    }
    
    const { status, version, message } = req.body;
    
    // Log health check (could store in a table if needed)
    logger.info(`[MetricsAPI] Health from ${req.tenant.companyName}: status=${status}, version=${version}`);
    
    res.json({
      success: true,
      message: 'Health reported successfully',
      platform_time: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.error('[MetricsAPI] Error reporting health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report health',
      code: 'HEALTH_ERROR',
    });
  }
});

/**
 * GET /api/tenant-metrics/my-status
 * Get tenant's own status/subscription info from platform
 */
router.get('/my-status', authenticateTenantApiKey, async (req, res) => {
  try {
    const result = await poolManager.platformQuery(`
      SELECT 
        c.company_code,
        c.company_name,
        c.subscription_status,
        c.trial_ends_at,
        c.subscription_ends_at,
        c.max_users,
        c.max_divisions,
        c.max_storage_gb,
        c.reported_user_count,
        c.reported_division_count,
        c.reported_storage_mb,
        sp.plan_name,
        sp.plan_code
      FROM companies c
      LEFT JOIN subscription_plans sp ON c.plan_id = sp.plan_id
      WHERE c.company_id = $1
    `, [req.tenant.companyId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Company not found',
      });
    }
    
    const company = result.rows[0];
    
    res.json({
      success: true,
      data: {
        company_code: company.company_code,
        company_name: company.company_name,
        subscription: {
          status: company.subscription_status,
          plan: company.plan_name || 'Free',
          plan_code: company.plan_code || 'free',
          trial_ends_at: company.trial_ends_at,
          subscription_ends_at: company.subscription_ends_at,
        },
        limits: {
          max_users: company.max_users,
          max_divisions: company.max_divisions,
          max_storage_gb: company.max_storage_gb,
        },
        current_usage: {
          users: company.reported_user_count,
          divisions: company.reported_division_count,
          storage_mb: company.reported_storage_mb,
        },
      },
    });
    
  } catch (error) {
    logger.error('[MetricsAPI] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
    });
  }
});

module.exports = router;
