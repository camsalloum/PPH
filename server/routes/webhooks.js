const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { pool } = require('../database/config');
const { syncOutlookMailbox } = require('../services/outlookSyncService');

/**
 * Outlook Webhook Receiver (Phase 3b)
 *
 * GET /api/webhooks/outlook
 *   - Microsoft Graph validation handshake (echo validationToken)
 *
 * POST /api/webhooks/outlook
 *   - Return 202 immediately and process notifications asynchronously
 */
router.get('/outlook', (req, res) => {
  const validationToken = req.query.validationToken;
  if (!validationToken) {
    return res.status(400).json({ success: false, error: 'Missing validationToken' });
  }

  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send(String(validationToken));
});

router.post('/outlook', (req, res) => {
  const notifications = Array.isArray(req.body?.value) ? req.body.value : [];

  // Graph webhook reliability: acknowledge quickly and process async.
  res.status(202).json({ success: true, accepted: notifications.length });

  setImmediate(async () => {
    try {
      const expectedClientState = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE || '';
      const validNotifications = notifications.filter((n) => {
        const okClientState = !expectedClientState || n?.clientState === expectedClientState;
        if (!okClientState) {
          logger.warn('Outlook webhook ignored: invalid clientState', {
            subscriptionId: n?.subscriptionId,
          });
          return false;
        }
        return true;
      });

      if (!validNotifications.length) return;

      const subscriptionIds = Array.from(
        new Set(validNotifications.map((n) => n?.subscriptionId).filter(Boolean))
      );
      if (!subscriptionIds.length) {
        logger.warn('Outlook webhook notifications contained no subscription IDs');
        return;
      }

      const mappingRes = await pool.query(
        `SELECT user_id, webhook_subscription_id
         FROM crm_outlook_connections
         WHERE webhook_subscription_id = ANY($1::text[])
           AND connection_status = 'active'`,
        [subscriptionIds]
      );

      const userIds = Array.from(
        new Set(mappingRes.rows.map((r) => Number(r.user_id)).filter(Number.isFinite))
      );
      if (!userIds.length) {
        logger.warn('Outlook webhook had unknown subscriptions', { subscriptionIds });
        return;
      }

      validNotifications.forEach((n) => {
        logger.info('Outlook webhook notification received', {
          subscriptionId: n?.subscriptionId,
          resource: n?.resource,
          changeType: n?.changeType,
          tenantId: n?.tenantId,
        });
      });

      for (const userId of userIds) {
        try {
          await syncOutlookMailbox(userId, { maxPages: 2 });
        } catch (syncError) {
          logger.warn('Outlook webhook-triggered sync failed', {
            userId,
            error: syncError.message,
          });
        }
      }
    } catch (error) {
      logger.error('Outlook webhook async processing failed', { error: error.message });
    }
  });
});

module.exports = router;
