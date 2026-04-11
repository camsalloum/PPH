const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { getValidAccessToken, createWebhookSubscription } = require('../services/outlookAuthService');

async function renewOutlookWebhookSubscriptions() {
  const notificationUrl = process.env.OUTLOOK_WEBHOOK_NOTIFICATION_URL;
  if (!notificationUrl) {
    logger.info('Outlook webhook renewal skipped: OUTLOOK_WEBHOOK_NOTIFICATION_URL not configured');
    return { checked: 0, renewed: 0, skipped: 0 };
  }

  const dueRes = await pool.query(
    `SELECT user_id, webhook_subscription_expiry
     FROM crm_outlook_connections
     WHERE connection_status = 'active'
       AND (
         webhook_subscription_expiry IS NULL
         OR webhook_subscription_expiry <= NOW() + INTERVAL '24 hours'
       )
     ORDER BY webhook_subscription_expiry ASC NULLS FIRST
     LIMIT 100`
  );

  let renewed = 0;
  let skipped = 0;

  for (const row of dueRes.rows) {
    try {
      const accessToken = await getValidAccessToken(row.user_id);
      const result = await createWebhookSubscription(row.user_id, accessToken);
      if (result?.created) renewed += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      logger.warn('Outlook webhook renewal failed for user', {
        userId: row.user_id,
        error: error.message,
      });
    }
  }

  logger.info('Outlook webhook renewal run complete', {
    checked: dueRes.rows.length,
    renewed,
    skipped,
  });

  return { checked: dueRes.rows.length, renewed, skipped };
}

module.exports = { renewOutlookWebhookSubscriptions };
