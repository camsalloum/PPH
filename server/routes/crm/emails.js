/**
 * CRM Emails Routes
 *
 * Endpoints:
 *   GET  /emails
 *   GET  /emails/:id
 *   GET  /emails/unread-count
 *   PATCH /emails/:id
 *   POST /emails/send
 *   POST /emails/:id/reply
 *   POST /emails/drafts/:id/send
 */

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { resolveRepGroup } = require('../../services/crmService');
const { getValidAccessToken } = require('../../services/outlookAuthService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRetryAfterMs(headerValue, fallbackMs) {
  if (!headerValue) return fallbackMs;
  const sec = Number(headerValue);
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
  const dt = Date.parse(headerValue);
  if (Number.isFinite(dt)) return Math.max(0, dt - Date.now());
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
      const retryAfterMs = resolveRetryAfterMs(res.headers.get('retry-after'), backoffMs);
      logger.warn('Graph request throttled/retriable in emails route', {
        status: res.status,
        attempt,
        retryAfterMs,
        op: meta.op,
      });
      await sleep(retryAfterMs);
      backoffMs = Math.min(backoffMs * 2, 10000);
      continue;
    }

    return res;
  }

  throw new Error('Graph retry loop exited unexpectedly');
}

async function tableExists(tableName) {
  const check = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS ok`,
    [tableName]
  );
  return !!check.rows[0]?.ok;
}

function normalizeEmailArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return { email: v.trim() };
        return { email: String(v.email || '').trim(), name: v.name || null };
      })
      .filter((v) => v.email);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
  }
  return [];
}

function toGraphRecipients(arr) {
  return arr.map((r) => ({
    emailAddress: {
      address: r.email,
      name: r.name || undefined,
    },
  }));
}

async function graphCreateMessage(accessToken, messagePayload) {
  const createRes = await graphFetchWithRetry('https://graph.microsoft.com/v1.0/me/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messagePayload),
  }, { op: 'create-message' });

  const createJson = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createJson.error?.message || 'Failed to create Graph message');
  }

  const messageId = createJson.id;

  const sendRes = await graphFetchWithRetry(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, { op: 'send-message' });

  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(text || 'Failed to send Graph message');
  }

  return createJson;
}

async function graphGetMessageDetails(accessToken, graphMessageId) {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${graphMessageId}?$select=id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,importance,hasAttachments`;
  const res = await graphFetchWithRetry(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, { op: 'get-message-details' });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to fetch Graph message details');
  }
  return json;
}

async function graphListAttachments(accessToken, graphMessageId) {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${graphMessageId}/attachments?$select=id,name,contentType,size,isInline`;
  const res = await graphFetchWithRetry(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, { op: 'list-attachments' });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to fetch Graph attachments');
  }
  return Array.isArray(json.value) ? json.value : [];
}

async function insertEmailActivity({ userId, customerId, prospectId, inquiryId, subject, sourceRefId }) {
  try {
    await pool.query(
      `INSERT INTO crm_activities (
         type, activity_type, customer_id, prospect_id, rep_id,
         activity_date, outcome_note, source, source_ref_id
       )
       VALUES ('email', 'email', $1, $2, $3, NOW(), $4, 'outlook', $5)
       ON CONFLICT (source, source_ref_id) DO NOTHING`,
      [customerId || null, prospectId || null, userId, subject || 'Email sent', sourceRefId]
    );
  } catch (error) {
    if (error.code === '42703' || error.code === '42P10') {
      await pool.query(
        `INSERT INTO crm_activities (
           type, activity_type, customer_id, prospect_id, rep_id,
           activity_date, outcome_note
         )
         VALUES ('email', 'email', $1, $2, $3, NOW(), $4)`,
        [customerId || null, prospectId || null, userId, subject || 'Email sent']
      );
      return;
    }
    throw error;
  }
}

// GET /api/crm/emails
router.get('/emails', authenticate, async (req, res) => {
  try {
    const rep = await resolveRepGroup(req.user.id);
    if (!rep) return res.status(403).json({ success: false, error: 'Not a sales rep' });

    const exists = await tableExists('crm_emails');
    if (!exists) return res.json({ success: true, data: [] });

    const {
      customer_id,
      prospect_id,
      inquiry_id,
      direction,
      is_read,
      limit = 50,
      offset = 0,
    } = req.query;

    const clauses = ['rep_user_id = $1'];
    const params = [req.user.id];
    let p = 2;

    if (customer_id) { clauses.push(`customer_id = $${p++}`); params.push(parseInt(customer_id, 10)); }
    if (prospect_id) { clauses.push(`prospect_id = $${p++}`); params.push(parseInt(prospect_id, 10)); }
    if (inquiry_id) { clauses.push(`inquiry_id = $${p++}`); params.push(parseInt(inquiry_id, 10)); }
    if (direction) { clauses.push(`direction = $${p++}`); params.push(direction); }
    if (is_read === 'true' || is_read === 'false') { clauses.push(`is_read = $${p++}`); params.push(is_read === 'true'); }

    params.push(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
    params.push(Math.max(parseInt(offset, 10) || 0, 0));

    const result = await pool.query(
      `SELECT *
       FROM crm_emails
       WHERE ${clauses.join(' AND ')}
       ORDER BY COALESCE(received_at, sent_at, created_at) DESC
       LIMIT $${p++} OFFSET $${p}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching CRM emails:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch emails' });
  }
});

// GET /api/crm/emails/:id
router.get('/emails/:id', authenticate, async (req, res) => {
  try {
    const [exists, attachmentsExists] = await Promise.all([
      tableExists('crm_emails'),
      tableExists('crm_email_attachments'),
    ]);
    if (!exists) return res.status(404).json({ success: false, error: 'Email not found' });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid email id' });
    }

    const result = await pool.query(
      `SELECT * FROM crm_emails WHERE id = $1 AND rep_user_id = $2`,
      [id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    let emailRow = result.rows[0];

    // Lazy hydrate body/metadata from Graph when body_html is missing but graph_message_id exists.
    if (!emailRow.body_html && emailRow.graph_message_id) {
      try {
        const accessToken = await getValidAccessToken(req.user.id);
        const detail = await graphGetMessageDetails(accessToken, emailRow.graph_message_id);

        const fromObj = detail.from?.emailAddress || null;
        const toArr = normalizeEmailArray((detail.toRecipients || []).map((r) => ({
          email: r?.emailAddress?.address,
          name: r?.emailAddress?.name || null,
        })));
        const ccArr = normalizeEmailArray((detail.ccRecipients || []).map((r) => ({
          email: r?.emailAddress?.address,
          name: r?.emailAddress?.name || null,
        })));

        const updatedRes = await pool.query(
          `UPDATE crm_emails
           SET body_html = COALESCE($3, body_html),
               body_preview = COALESCE($4, body_preview),
               subject = COALESCE($5, subject),
               from_email = COALESCE($6, from_email),
               from_name = COALESCE($7, from_name),
               to_emails = CASE WHEN $8::jsonb = '[]'::jsonb THEN to_emails ELSE $8::jsonb END,
               cc_emails = CASE WHEN $9::jsonb = '[]'::jsonb THEN cc_emails ELSE $9::jsonb END,
               received_at = COALESCE($10, received_at),
               sent_at = COALESCE($11, sent_at),
               is_read = COALESCE($12, is_read),
               importance = COALESCE($13, importance),
               has_attachments = COALESCE($14, has_attachments)
           WHERE id = $1 AND rep_user_id = $2
           RETURNING *`,
          [
            id,
            req.user.id,
            detail.body?.content || null,
            detail.bodyPreview || null,
            detail.subject || null,
            fromObj?.address || null,
            fromObj?.name || null,
            JSON.stringify(toArr),
            JSON.stringify(ccArr),
            detail.receivedDateTime || null,
            detail.sentDateTime || null,
            detail.isRead,
            detail.importance || null,
            detail.hasAttachments,
          ]
        );

        if (updatedRes.rows.length) {
          emailRow = updatedRes.rows[0];
        }

        if (attachmentsExists && detail.hasAttachments) {
          const attachments = await graphListAttachments(accessToken, emailRow.graph_message_id);
          for (const att of attachments) {
            await pool.query(
              `INSERT INTO crm_email_attachments (
                 email_id, graph_attach_id, filename, content_type, size_bytes, is_inline
               )
               SELECT $1,$2,$3,$4,$5,$6
               WHERE NOT EXISTS (
                 SELECT 1
                 FROM crm_email_attachments
                 WHERE email_id = $1
                   AND graph_attach_id = $2
               )`,
              [
                emailRow.id,
                att.id || null,
                att.name || 'attachment',
                att.contentType || null,
                att.size || null,
                !!att.isInline,
              ]
            );
          }
        }
      } catch (hydrateError) {
        logger.warn('Email lazy hydrate skipped', {
          emailId: id,
          graphMessageId: emailRow.graph_message_id,
          error: hydrateError.message,
        });
      }
    }

    let attachments = [];
    if (attachmentsExists) {
      const attRes = await pool.query(
        `SELECT id, graph_attach_id, filename, content_type, size_bytes, is_inline
         FROM crm_email_attachments
         WHERE email_id = $1
         ORDER BY id ASC`,
        [emailRow.id]
      );
      attachments = attRes.rows;
    }

    res.json({ success: true, data: { ...emailRow, attachments } });
  } catch (error) {
    logger.error('Error fetching CRM email by id:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email' });
  }
});

// GET /api/crm/emails/unread-count
router.get('/emails/unread-count', authenticate, async (req, res) => {
  try {
    const exists = await tableExists('crm_emails');
    if (!exists) return res.json({ success: true, count: 0 });

    const result = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM crm_emails
       WHERE rep_user_id = $1
         AND direction = 'inbound'
         AND is_read = false
         AND is_hidden = false`,
      [req.user.id]
    );

    res.json({ success: true, count: parseInt(result.rows[0]?.cnt || 0, 10) });
  } catch (error) {
    logger.error('Error fetching unread email count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
});

// PATCH /api/crm/emails/:id
router.patch('/emails/:id', authenticate, async (req, res) => {
  try {
    const exists = await tableExists('crm_emails');
    if (!exists) return res.status(404).json({ success: false, error: 'Email not found' });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid email id' });
    }

    const {
      is_read,
      crm_status,
      is_hidden,
      customer_id,
      prospect_id,
      inquiry_id,
    } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (is_read !== undefined) { sets.push(`is_read = $${p++}`); params.push(!!is_read); }
    if (crm_status !== undefined) { sets.push(`crm_status = $${p++}`); params.push(crm_status); }
    if (is_hidden !== undefined) { sets.push(`is_hidden = $${p++}`); params.push(!!is_hidden); }
    if (customer_id !== undefined) { sets.push(`customer_id = $${p++}`); params.push(customer_id); }
    if (prospect_id !== undefined) { sets.push(`prospect_id = $${p++}`); params.push(prospect_id); }
    if (inquiry_id !== undefined) { sets.push(`inquiry_id = $${p++}`); params.push(inquiry_id); }

    if (!sets.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id, req.user.id);
    const result = await pool.query(
      `UPDATE crm_emails
       SET ${sets.join(', ')}
       WHERE id = $${p++} AND rep_user_id = $${p}
       RETURNING *`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating email:', error);
    res.status(500).json({ success: false, error: 'Failed to update email' });
  }
});

// POST /api/crm/emails/send
router.post('/emails/send', authenticate, async (req, res) => {
  try {
    const emailsExists = await tableExists('crm_emails');
    if (!emailsExists) {
      return res.status(503).json({ success: false, error: 'crm_emails table not migrated yet' });
    }

    const {
      to_emails,
      cc_emails,
      subject,
      body_html,
      customer_id,
      prospect_id,
      inquiry_id,
    } = req.body;

    const toList = normalizeEmailArray(to_emails);
    const ccList = normalizeEmailArray(cc_emails);

    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ success: false, error: 'subject is required' });
    }
    if (!toList.length) {
      return res.status(400).json({ success: false, error: 'to_emails is required' });
    }

    const accessToken = await getValidAccessToken(req.user.id);

    const graphMessage = await graphCreateMessage(accessToken, {
      subject: String(subject).trim(),
      body: {
        contentType: 'HTML',
        content: body_html || '',
      },
      toRecipients: toGraphRecipients(toList),
      ccRecipients: toGraphRecipients(ccList),
    });

    const inserted = await pool.query(
      `INSERT INTO crm_emails (
         rep_user_id, graph_message_id, graph_conversation_id,
         internet_message_id, customer_id, prospect_id, inquiry_id,
         match_confidence, direction, subject, body_preview, body_html,
         from_email, from_name, to_emails, cc_emails,
         sent_at, is_read, has_attachments, crm_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual','outbound',$8,$9,$10,$11,$12,$13,$14,NOW(),true,false,'captured')
       RETURNING *`,
      [
        req.user.id,
        graphMessage.id || null,
        graphMessage.conversationId || null,
        graphMessage.internetMessageId || null,
        customer_id || null,
        prospect_id || null,
        inquiry_id || null,
        String(subject).trim(),
        (body_html || '').replace(/<[^>]+>/g, '').slice(0, 500),
        body_html || null,
        graphMessage.from?.emailAddress?.address || null,
        graphMessage.from?.emailAddress?.name || null,
        JSON.stringify(toList),
        JSON.stringify(ccList),
      ]
    );

    await insertEmailActivity({
      userId: req.user.id,
      customerId: customer_id,
      prospectId: prospect_id,
      inquiryId: inquiry_id,
      subject: String(subject).trim(),
      sourceRefId: graphMessage.id || `local-${inserted.rows[0].id}`,
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    logger.error('Error sending CRM email:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send email' });
  }
});

// POST /api/crm/emails/:id/reply
router.post('/emails/:id/reply', authenticate, async (req, res) => {
  try {
    const emailsExists = await tableExists('crm_emails');
    if (!emailsExists) {
      return res.status(503).json({ success: false, error: 'crm_emails table not migrated yet' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid email id' });
    }

    const { body_html } = req.body;

    const originalRes = await pool.query(
      `SELECT * FROM crm_emails WHERE id = $1 AND rep_user_id = $2`,
      [id, req.user.id]
    );
    if (!originalRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Original email not found' });
    }

    const original = originalRes.rows[0];
    const toList = normalizeEmailArray(original.from_email ? [{ email: original.from_email, name: original.from_name }] : []);
    if (!toList.length) {
      return res.status(400).json({ success: false, error: 'Cannot determine recipient for reply' });
    }

    const accessToken = await getValidAccessToken(req.user.id);
    const replySubject = original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || ''}`;

    const graphMessage = await graphCreateMessage(accessToken, {
      subject: replySubject,
      body: {
        contentType: 'HTML',
        content: body_html || '',
      },
      toRecipients: toGraphRecipients(toList),
    });

    const inserted = await pool.query(
      `INSERT INTO crm_emails (
         rep_user_id, graph_message_id, graph_conversation_id,
         internet_message_id, customer_id, prospect_id, inquiry_id,
         match_confidence, direction, subject, body_preview, body_html,
         from_email, from_name, to_emails, cc_emails,
         sent_at, is_read, has_attachments, crm_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual','outbound',$8,$9,$10,$11,$12,$13,'[]'::jsonb,NOW(),true,false,'replied')
       RETURNING *`,
      [
        req.user.id,
        graphMessage.id || null,
        graphMessage.conversationId || original.graph_conversation_id || null,
        graphMessage.internetMessageId || null,
        original.customer_id || null,
        original.prospect_id || null,
        original.inquiry_id || null,
        replySubject,
        (body_html || '').replace(/<[^>]+>/g, '').slice(0, 500),
        body_html || null,
        graphMessage.from?.emailAddress?.address || null,
        graphMessage.from?.emailAddress?.name || null,
        JSON.stringify(toList),
      ]
    );

    await insertEmailActivity({
      userId: req.user.id,
      customerId: original.customer_id,
      prospectId: original.prospect_id,
      inquiryId: original.inquiry_id,
      subject: replySubject,
      sourceRefId: graphMessage.id || `local-reply-${inserted.rows[0].id}`,
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    logger.error('Error replying to CRM email:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to reply to email' });
  }
});

// POST /api/crm/emails/drafts/:id/send
router.post('/emails/drafts/:id/send', authenticate, async (req, res) => {
  try {
    const [emailsExists, draftsExists] = await Promise.all([
      tableExists('crm_emails'),
      tableExists('crm_email_drafts'),
    ]);

    if (!emailsExists) {
      return res.status(503).json({ success: false, error: 'crm_emails table not migrated yet' });
    }
    if (!draftsExists) {
      return res.status(503).json({ success: false, error: 'crm_email_drafts table not migrated yet' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid draft id' });
    }

    const draftRes = await pool.query(
      `SELECT *
       FROM crm_email_drafts
       WHERE id = $1 AND rep_id = $2
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!draftRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const draft = draftRes.rows[0];
    const toList = normalizeEmailArray(draft.to_emails);
    const ccList = normalizeEmailArray(draft.cc_emails);
    const subject = String(draft.subject || '').trim();
    const bodyHtml = draft.body_html || draft.body_notes || '';

    if (!subject) {
      return res.status(400).json({ success: false, error: 'Draft subject is required' });
    }
    if (!toList.length) {
      return res.status(400).json({ success: false, error: 'Draft must include at least one recipient' });
    }

    const accessToken = await getValidAccessToken(req.user.id);
    const graphMessage = await graphCreateMessage(accessToken, {
      subject,
      body: {
        contentType: 'HTML',
        content: bodyHtml,
      },
      toRecipients: toGraphRecipients(toList),
      ccRecipients: toGraphRecipients(ccList),
    });

    const insertedEmailRes = await pool.query(
      `INSERT INTO crm_emails (
         rep_user_id, graph_message_id, graph_conversation_id,
         internet_message_id, customer_id, prospect_id, inquiry_id,
         match_confidence, direction, subject, body_preview, body_html,
         from_email, from_name, to_emails, cc_emails,
         sent_at, is_read, has_attachments, crm_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual','outbound',$8,$9,$10,$11,$12,$13,$14,NOW(),true,false,'captured')
       RETURNING *`,
      [
        req.user.id,
        graphMessage.id || null,
        graphMessage.conversationId || null,
        graphMessage.internetMessageId || null,
        draft.to_customer_id || null,
        draft.to_prospect_id || null,
        draft.inquiry_id || null,
        subject,
        String(bodyHtml).replace(/<[^>]+>/g, '').slice(0, 500),
        bodyHtml || null,
        graphMessage.from?.emailAddress?.address || null,
        graphMessage.from?.emailAddress?.name || null,
        JSON.stringify(toList),
        JSON.stringify(ccList),
      ]
    );

    const emailRow = insertedEmailRes.rows[0];

    await pool.query(
      `UPDATE crm_email_drafts
       SET status = 'sent',
           sent_at = NOW(),
           sent_graph_msg_id = $1
       WHERE id = $2 AND rep_id = $3`,
      [graphMessage.id || null, id, req.user.id]
    );

    await insertEmailActivity({
      userId: req.user.id,
      customerId: draft.to_customer_id,
      prospectId: draft.to_prospect_id,
      inquiryId: draft.inquiry_id,
      subject,
      sourceRefId: graphMessage.id || `local-draft-${emailRow.id}`,
    });

    res.status(201).json({
      success: true,
      data: {
        email: emailRow,
        draft_id: id,
        sent_graph_msg_id: graphMessage.id || null,
      },
    });
  } catch (error) {
    logger.error('Error sending CRM email draft:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send email draft' });
  }
});

module.exports = router;
