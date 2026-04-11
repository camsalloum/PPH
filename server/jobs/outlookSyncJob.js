const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { syncOutlookMailbox } = require('../services/outlookSyncService');

const MAX_SYNC_CONCURRENCY = 3;
const BATCH_GAP_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOutlookPollingJob({ includeWebhook = false, limit = 50 } = {}) {
  const whereClause = includeWebhook
    ? 'webhook_subscription_id IS NOT NULL'
    : 'webhook_subscription_id IS NULL';

  const result = await pool.query(
    `SELECT user_id
     FROM crm_outlook_connections
     WHERE connection_status = 'active'
       AND ${whereClause}
     ORDER BY last_synced_at ASC NULLS FIRST
     LIMIT $1`,
    [Math.max(1, Math.min(Number(limit || 50), 200))]
  );

  let syncedUsers = 0;
  let failedUsers = 0;
  let totalMessages = 0;

  for (let i = 0; i < result.rows.length; i += MAX_SYNC_CONCURRENCY) {
    const batch = result.rows.slice(i, i + MAX_SYNC_CONCURRENCY);

    await Promise.all(batch.map(async (row) => {
      try {
        const out = await syncOutlookMailbox(row.user_id, { maxPages: 3 });
        syncedUsers += 1;
        totalMessages += Number(out.synced || 0);
      } catch (error) {
        failedUsers += 1;
        logger.warn('Outlook polling sync failed', {
          userId: row.user_id,
          error: error.message,
          includeWebhook,
        });
        await pool.query(
          `UPDATE crm_outlook_connections
           SET error_message = $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [row.user_id, error.message]
        ).catch(() => null);
      }
    }));

    const isLastBatch = i + MAX_SYNC_CONCURRENCY >= result.rows.length;
    if (!isLastBatch) {
      await sleep(BATCH_GAP_MS);
    }
  }

  logger.info('Outlook polling job complete', {
    includeWebhook,
    checkedUsers: result.rows.length,
    syncedUsers,
    failedUsers,
    totalMessages,
  });

  return {
    includeWebhook,
    checkedUsers: result.rows.length,
    syncedUsers,
    failedUsers,
    totalMessages,
  };
}

async function runOutlookPrimaryPollingJob() {
  // Primary polling supports users that do not yet have webhook subscriptions.
  return runOutlookPollingJob({ includeWebhook: false, limit: 50 });
}

async function runOutlookSafetyNetPollingJob() {
  // Safety net polling runs less frequently for webhook-enabled users.
  return runOutlookPollingJob({ includeWebhook: true, limit: 50 });
}

module.exports = {
  runOutlookPollingJob,
  runOutlookPrimaryPollingJob,
  runOutlookSafetyNetPollingJob,
};
