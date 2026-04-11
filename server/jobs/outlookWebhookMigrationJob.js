const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { getValidAccessToken, createWebhookSubscription } = require('../services/outlookAuthService');

async function migrateOutlookConnectionsToWebhooks({ limit = 100 } = {}) {
  const notificationUrl = process.env.OUTLOOK_WEBHOOK_NOTIFICATION_URL;
  if (!notificationUrl) {
    logger.info('Outlook webhook migration skipped: OUTLOOK_WEBHOOK_NOTIFICATION_URL not configured');
    return { checked: 0, migrated: 0, failed: 0, skipped: 0 };
  }

  const rowsRes = await pool.query(
    `SELECT user_id
     FROM crm_outlook_connections
     WHERE connection_status = 'active'
       AND webhook_subscription_id IS NULL
     ORDER BY updated_at ASC NULLS FIRST
     LIMIT $1`,
    [Math.max(1, Math.min(Number(limit || 100), 500))]
  );

  let migrated = 0;
  let failed = 0;

  for (const row of rowsRes.rows) {
    try {
      const accessToken = await getValidAccessToken(row.user_id);
      const out = await createWebhookSubscription(row.user_id, accessToken);
      if (out?.created) migrated += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logger.warn('Outlook webhook migration failed for user', {
        userId: row.user_id,
        error: error.message,
      });
    }
  }

  logger.info('Outlook webhook migration run complete', {
    checked: rowsRes.rows.length,
    migrated,
    failed,
  });

  return {
    checked: rowsRes.rows.length,
    migrated,
    failed,
    skipped: 0,
  };
}

module.exports = { migrateOutlookConnectionsToWebhooks };
