const fetch = require('node-fetch');
const { pool } = require('../database/config');
const logger = require('../utils/logger');
const { getValidAccessToken } = require('./outlookAuthService');
const { matchEmailToCrm } = require('./emailMatchingService');

const INBOX_DELTA_SELECT = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'bodyPreview',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'isRead',
  'importance',
  'hasAttachments',
].join(',');

const INITIAL_SYNC_LOOKBACK_DAYS = 30;
const SENT_ITEMS_LOOKBACK_DAYS = 30;
const SENT_ITEMS_PAGE_SIZE = 50;

function getInitialSyncStartIso() {
  const dt = new Date(Date.now() - (INITIAL_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  return dt.toISOString();
}

function buildInboxDeltaUrl({ withStartDateFilter = false } = {}) {
  const base = `https://graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages/delta?$select=${encodeURIComponent(INBOX_DELTA_SELECT)}&$top=50`;
  if (!withStartDateFilter) return base;
  const filter = encodeURIComponent(`receivedDateTime ge ${getInitialSyncStartIso()}`);
  return `${base}&$filter=${filter}`;
}

function getSentItemsStartIso() {
  const dt = new Date(Date.now() - (SENT_ITEMS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  return dt.toISOString();
}

function buildSentItemsUrl({ withStartDateFilter = true } = {}) {
  const base = `https://graph.microsoft.com/v1.0/me/mailFolders('SentItems')/messages?$select=${encodeURIComponent(INBOX_DELTA_SELECT)}&$top=${SENT_ITEMS_PAGE_SIZE}&$orderby=sentDateTime desc`;
  if (!withStartDateFilter) return base;
  const filter = encodeURIComponent(`sentDateTime ge ${getSentItemsStartIso()}`);
  return `${base}&$filter=${filter}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRetryAfterMs(headerValue, fallbackMs) {
  if (!headerValue) return fallbackMs;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000;
  }
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return fallbackMs;
}

async function graphFetchWithRetry(url, options = {}, meta = {}) {
  const maxAttempts = 4;
  let attempt = 0;
  let backoffMs = 1000;

  while (attempt < maxAttempts) {
    attempt += 1;
    const res = await fetch(url, options);

    if (res.ok) return res;

    if (attempt >= maxAttempts) return res;

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = resolveRetryAfterMs(res.headers.get('retry-after'), backoffMs);
      logger.warn('Graph request throttled/retriable, backing off', {
        status: res.status,
        attempt,
        retryAfterMs: retryAfter,
        userId: meta.userId,
      });
      await sleep(retryAfter);
      backoffMs = Math.min(backoffMs * 2, 10000);
      continue;
    }

    return res;
  }

  throw new Error('Graph retry loop exited unexpectedly');
}

function normalizeRecipients(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const emailAddress = item?.emailAddress || {};
      return {
        email: emailAddress.address || null,
        name: emailAddress.name || null,
      };
    })
    .filter((r) => r.email);
}

async function findRecipientMatch(recipients, userId) {
  for (const recipient of recipients) {
    const match = await matchEmailToCrm(recipient?.email, { userId });
    if (match.customerId || match.prospectId) {
      return match;
    }
  }
  return { customerId: null, prospectId: null, matchConfidence: 'none' };
}

async function syncRecentSentItems(userId, accessToken) {
  let sentItemsUrl = buildSentItemsUrl({ withStartDateFilter: true });
  let didFallbackToUnfilteredSentItems = false;
  let synced = 0;

  const res = await graphFetchWithRetry(sentItemsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, { userId });

  const json = await res.json();
  if (!res.ok) {
    if (!didFallbackToUnfilteredSentItems) {
      didFallbackToUnfilteredSentItems = true;
      sentItemsUrl = buildSentItemsUrl({ withStartDateFilter: false });

      const fallbackRes = await graphFetchWithRetry(sentItemsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }, { userId });

      const fallbackJson = await fallbackRes.json();
      if (!fallbackRes.ok) {
        throw new Error(fallbackJson.error?.message || 'Failed to read Outlook sent items');
      }

      const rows = Array.isArray(fallbackJson.value) ? fallbackJson.value : [];
      for (const message of rows) {
        if (!message?.id) continue;

        const fromAddress = message.from?.emailAddress || {};
        const toRecipients = normalizeRecipients(message.toRecipients);
        const ccRecipients = normalizeRecipients(message.ccRecipients);
        const emailMatch = await findRecipientMatch(toRecipients, userId);

        await pool.query(
          `INSERT INTO crm_emails (
             rep_user_id,
             graph_message_id,
             graph_conversation_id,
             internet_message_id,
             customer_id,
             prospect_id,
             match_confidence,
             direction,
             subject,
             body_preview,
             from_email,
             from_name,
             to_emails,
             cc_emails,
             received_at,
             sent_at,
             is_read,
             importance,
             has_attachments,
             crm_status,
             is_hidden,
             created_at
           )
           VALUES (
             $1,$2,$3,$4,$5,$6,$7,'outbound',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'captured',false,NOW()
           )
           ON CONFLICT (rep_user_id, graph_message_id)
           DO UPDATE SET
             is_read = EXCLUDED.is_read,
             importance = EXCLUDED.importance,
             has_attachments = EXCLUDED.has_attachments,
             sent_at = COALESCE(EXCLUDED.sent_at, crm_emails.sent_at)`,
          [
            userId,
            message.id,
            message.conversationId || null,
            message.internetMessageId || null,
            emailMatch.customerId,
            emailMatch.prospectId,
            emailMatch.matchConfidence,
            message.subject || null,
            message.bodyPreview || null,
            fromAddress.address || null,
            fromAddress.name || null,
            JSON.stringify(toRecipients),
            JSON.stringify(ccRecipients),
            message.receivedDateTime || null,
            message.sentDateTime || null,
            !!message.isRead,
            message.importance || null,
            !!message.hasAttachments,
          ]
        );

        synced += 1;
      }

      return synced;
    }

    throw new Error(json.error?.message || 'Failed to read Outlook sent items');
  }

  const rows = Array.isArray(json.value) ? json.value : [];
  for (const message of rows) {
    if (!message?.id) continue;

    const fromAddress = message.from?.emailAddress || {};
    const toRecipients = normalizeRecipients(message.toRecipients);
    const ccRecipients = normalizeRecipients(message.ccRecipients);
    const emailMatch = await findRecipientMatch(toRecipients, userId);

    await pool.query(
      `INSERT INTO crm_emails (
         rep_user_id,
         graph_message_id,
         graph_conversation_id,
         internet_message_id,
         customer_id,
         prospect_id,
         match_confidence,
         direction,
         subject,
         body_preview,
         from_email,
         from_name,
         to_emails,
         cc_emails,
         received_at,
         sent_at,
         is_read,
         importance,
         has_attachments,
         crm_status,
         is_hidden,
         created_at
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,'outbound',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'captured',false,NOW()
       )
       ON CONFLICT (rep_user_id, graph_message_id)
       DO UPDATE SET
         is_read = EXCLUDED.is_read,
         importance = EXCLUDED.importance,
         has_attachments = EXCLUDED.has_attachments,
         sent_at = COALESCE(EXCLUDED.sent_at, crm_emails.sent_at)`,
      [
        userId,
        message.id,
        message.conversationId || null,
        message.internetMessageId || null,
        emailMatch.customerId,
        emailMatch.prospectId,
        emailMatch.matchConfidence,
        message.subject || null,
        message.bodyPreview || null,
        fromAddress.address || null,
        fromAddress.name || null,
        JSON.stringify(toRecipients),
        JSON.stringify(ccRecipients),
        message.receivedDateTime || null,
        message.sentDateTime || null,
        !!message.isRead,
        message.importance || null,
        !!message.hasAttachments,
      ]
    );

    synced += 1;
  }

  return synced;
}

async function syncOutlookMailbox(userId, options = {}) {
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 4), 10));

  const connRes = await pool.query(
    `SELECT user_id, delta_link
     FROM crm_outlook_connections
     WHERE user_id = $1 AND connection_status = 'active'
     LIMIT 1`,
    [userId]
  );

  if (!connRes.rows.length) {
    return { userId, synced: 0, skipped: true, reason: 'not_connected' };
  }

  const connection = connRes.rows[0];
  const accessToken = await getValidAccessToken(userId);
  const isInitialSync = !connection.delta_link;

  let nextUrl = connection.delta_link
    || buildInboxDeltaUrl({ withStartDateFilter: true });
  let deltaLink = connection.delta_link || null;
  let pageCount = 0;
  let synced = 0;
  let didFallbackToUnfilteredInitialDelta = false;

  while (nextUrl && pageCount < maxPages) {
    pageCount += 1;

    const res = await graphFetchWithRetry(nextUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, { userId });

    const json = await res.json();
    if (!res.ok) {
      if (isInitialSync && !didFallbackToUnfilteredInitialDelta) {
        didFallbackToUnfilteredInitialDelta = true;
        nextUrl = buildInboxDeltaUrl({ withStartDateFilter: false });
        pageCount -= 1;
        logger.warn('Initial Outlook delta filter failed, retrying without filter', {
          userId,
          error: json.error?.message,
        });
        continue;
      }
      throw new Error(json.error?.message || 'Failed to read Outlook delta messages');
    }

    const rows = Array.isArray(json.value) ? json.value : [];

    for (const message of rows) {
      if (!message?.id) continue;
      if (message['@removed']) continue;

      const fromAddress = message.from?.emailAddress || {};
      const toRecipients = normalizeRecipients(message.toRecipients);
      const ccRecipients = normalizeRecipients(message.ccRecipients);
       const emailMatch = await matchEmailToCrm(fromAddress.address, { userId });

      await pool.query(
        `INSERT INTO crm_emails (
           rep_user_id,
           graph_message_id,
           graph_conversation_id,
           internet_message_id,
         customer_id,
         prospect_id,
           match_confidence,
           direction,
           subject,
           body_preview,
           from_email,
           from_name,
           to_emails,
           cc_emails,
           received_at,
           is_read,
           importance,
           has_attachments,
           crm_status,
           is_hidden,
           created_at
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,'inbound',$8,$9,$10,$11,$12,$13,$14,$15,$16,'captured',false,NOW()
         )
         ON CONFLICT (rep_user_id, graph_message_id)
         DO UPDATE SET
           is_read = EXCLUDED.is_read,
           importance = EXCLUDED.importance,
           has_attachments = EXCLUDED.has_attachments`,
        [
          userId,
          message.id,
          message.conversationId || null,
          message.internetMessageId || null,
          emailMatch.customerId,
          emailMatch.prospectId,
          emailMatch.matchConfidence,
          message.subject || null,
          message.bodyPreview || null,
          fromAddress.address || null,
          fromAddress.name || null,
          JSON.stringify(toRecipients),
          JSON.stringify(ccRecipients),
          message.receivedDateTime || null,
          !!message.isRead,
          message.importance || null,
          !!message.hasAttachments,
        ]
      );

      synced += 1;
    }

    deltaLink = json['@odata.deltaLink'] || deltaLink;
    nextUrl = json['@odata.nextLink'] || null;
  }

  const sentSynced = await syncRecentSentItems(userId, accessToken);

  await pool.query(
    `UPDATE crm_outlook_connections
     SET delta_link = $2,
         last_synced_at = NOW(),
         connection_status = 'active',
         error_message = NULL,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, deltaLink]
  );

  return { userId, synced: synced + sentSynced, inboxSynced: synced, sentSynced, pages: pageCount, skipped: false };
}

module.exports = {
  syncOutlookMailbox,
};
