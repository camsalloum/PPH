# Email Integration — Pre-Azure Groundwork
## Everything to build BEFORE Azure App Registration

> When you hand the agent the Client ID, Client Secret, and Tenant ID,
> the only work left should be: paste 3 env vars → deploy → it works.

---

## 1. Database Tables (No Azure needed)

All 4 tables can be created now. They have no dependency on Azure.

```sql
-- ── 1. Outlook connection store ───────────────────────────────────────────
CREATE TABLE crm_outlook_connections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  microsoft_account_id        VARCHAR(255),
  email_address               VARCHAR(255),
  display_name                VARCHAR(255),
  access_token_enc            TEXT,                   -- AES-256-GCM encrypted
  refresh_token_enc           TEXT,                   -- AES-256-GCM encrypted
  token_expires_at            TIMESTAMPTZ,
  scope                       TEXT,
  delta_link                  TEXT,                   -- Graph incremental sync cursor
  last_synced_at              TIMESTAMPTZ,
  sync_enabled                BOOLEAN DEFAULT true,
  connection_status           VARCHAR(50) DEFAULT 'disconnected',
                                                      -- disconnected / active / expired / revoked / error
  error_message               TEXT,
  webhook_subscription_id     VARCHAR(255),
  webhook_subscription_expiry TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);
CREATE INDEX idx_outlook_conn_user   ON crm_outlook_connections(user_id);
CREATE INDEX idx_outlook_conn_status ON crm_outlook_connections(connection_status);

-- ── 2. Email records ─────────────────────────────────────────────────────
CREATE TABLE crm_emails (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_user_id           UUID NOT NULL REFERENCES users(id),
  graph_message_id      VARCHAR(500) NOT NULL,
  graph_conversation_id VARCHAR(500),
  internet_message_id   VARCHAR(500),
  customer_id           UUID REFERENCES fp_customer_unified(id),
  prospect_id           UUID REFERENCES prospects(id),
  inquiry_id            UUID,
  contact_id            UUID,
  match_confidence      VARCHAR(20),
  direction             VARCHAR(10) NOT NULL,         -- inbound / outbound
  subject               VARCHAR(500),
  body_preview          TEXT,
  body_html             TEXT,
  from_email            VARCHAR(255),
  from_name             VARCHAR(255),
  to_emails             JSONB,
  cc_emails             JSONB,
  received_at           TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  is_read               BOOLEAN DEFAULT false,
  importance            VARCHAR(10),
  has_attachments       BOOLEAN DEFAULT false,
  crm_status            VARCHAR(30) DEFAULT 'captured',
  is_hidden             BOOLEAN DEFAULT false,
  hidden_reason         TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rep_user_id, graph_message_id)
);
CREATE INDEX idx_emails_customer    ON crm_emails(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_emails_prospect    ON crm_emails(prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX idx_emails_rep         ON crm_emails(rep_user_id);
CREATE INDEX idx_emails_received    ON crm_emails(received_at DESC);
CREATE INDEX idx_emails_unread      ON crm_emails(rep_user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_emails_conversation ON crm_emails(graph_conversation_id)
  WHERE graph_conversation_id IS NOT NULL;

-- ── 3. Email attachments ─────────────────────────────────────────────────
CREATE TABLE crm_email_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID NOT NULL REFERENCES crm_emails(id) ON DELETE CASCADE,
  graph_attach_id VARCHAR(500),
  filename        VARCHAR(255) NOT NULL,
  content_type    VARCHAR(100),
  size_bytes      INTEGER,
  is_inline       BOOLEAN DEFAULT false,
  content_base64  TEXT,
  fetched_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_attachments_email ON crm_email_attachments(email_id);

-- ── 4. Email templates ────────────────────────────────────────────────────
CREATE TABLE crm_email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  UUID REFERENCES users(id),
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(50),
  subject     VARCHAR(255),
  body_html   TEXT,
  variables   JSONB,
  is_shared   BOOLEAN DEFAULT true,
  use_count   INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Add deduplication columns to crm_activities ───────────────────────
ALTER TABLE crm_activities
  ADD COLUMN IF NOT EXISTS source        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_ref_id VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_source_dedup
  ON crm_activities(source, source_ref_id)
  WHERE source IS NOT NULL;

-- ── 6. Extend crm_email_drafts (already exists) ──────────────────────────
ALTER TABLE crm_email_drafts
  ADD COLUMN IF NOT EXISTS graph_draft_id        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS sent_graph_message_id VARCHAR(500),
  ADD COLUMN IF NOT EXISTS to_emails             JSONB,
  ADD COLUMN IF NOT EXISTS cc_emails             JSONB,
  ADD COLUMN IF NOT EXISTS body_html             TEXT,
  ADD COLUMN IF NOT EXISTS template_id           UUID REFERENCES crm_email_templates(id),
  ADD COLUMN IF NOT EXISTS send_via              VARCHAR(20) DEFAULT 'outlook';
```

---

## 2. Seed the 8 Standard Email Templates (No Azure needed)

These live in the DB and are usable in `EmailComposeModal.jsx` immediately — even before any email is sent or received.

```sql
INSERT INTO crm_email_templates (name, category, subject, body_html, variables, is_shared) VALUES

('Initial Introduction', 'intro',
 'Introduction — {{rep_name}} from {{company_name}}',
 '<p>Dear {{customer_name}},</p><p>My name is {{rep_name}} from {{company_name}}. We specialise in flexible packaging solutions for the GCC and MENA region.</p><p>I would love to connect and understand your packaging requirements. Would you have 15 minutes this week for a brief call?</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"rep_name","label":"Rep Name"},{"key":"company_name","label":"Company Name","default":"ProPack"}]'',
 true),

('Inquiry Acknowledgement', 'follow_up',
 'RE: Your Inquiry — {{inquiry_number}}',
 '<p>Dear {{customer_name}},</p><p>Thank you for reaching out regarding {{product_type}}. We have received your inquiry ({{inquiry_number}}) and our team is reviewing your requirements.</p><p>We will revert with a detailed proposal within 2–3 business days.</p><p>Please do not hesitate to contact us if you need anything in the meantime.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"product_type","label":"Product Type"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Quotation / Proposal Cover', 'proposal',
 'Quotation — {{inquiry_number}} | {{customer_name}}',
 '<p>Dear {{customer_name}},</p><p>Please find attached our quotation for {{inquiry_number}}.</p><p><strong>Validity:</strong> {{validity_days}} days<br><strong>Total Value:</strong> {{currency}} {{total_value}}</p><p>We are confident this proposal meets your requirements. Please review and revert with any questions or approval to proceed.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"validity_days","label":"Validity Days","default":"30"},{"key":"total_value","label":"Total Value"},{"key":"currency","label":"Currency","default":"AED"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Technical Spec Request', 'proposal',
 'Technical Specifications Required — {{product_description}}',
 '<p>Dear {{customer_name}},</p><p>To prepare an accurate quotation for {{product_description}}, we require the following technical specifications:</p><ul><li>Dimensions (width, length, gusset if applicable)</li><li>Structure / material requirements</li><li>Print: number of colours, artwork format</li><li>Quantity (monthly / annual)</li><li>Any food safety or certification requirements</li></ul><p>Kindly share the above at your earliest convenience so we can proceed.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"product_description","label":"Product Description"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Follow-up: No Reply (5 Days)', 'follow_up',
 'Following Up — {{inquiry_number}}',
 '<p>Dear {{customer_name}},</p><p>I wanted to follow up on our proposal for {{inquiry_number}} sent 5 days ago. I hope you have had the chance to review it.</p><p>Please let me know if you have any questions or if you would like to discuss the details further. I am happy to arrange a call at your convenience.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Reorder Reminder', 'reorder_reminder',
 'Time to Reorder — {{product_type}}',
 '<p>Dear {{customer_name}},</p><p>Based on your previous order history, your stock of {{product_type}} ordered on {{last_order_date}} may be running low.</p><p>We would like to ensure there is no disruption to your operations. Shall we initiate the reorder process?</p><p>Please confirm your requirements and we will prepare a revised quotation promptly.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"product_type","label":"Product Type"},{"key":"last_order_date","label":"Last Order Date"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Meeting Confirmation', 'intro',
 'Meeting Confirmed — {{meeting_date}}',
 '<p>Dear {{customer_name}},</p><p>This is to confirm our meeting scheduled for:</p><p><strong>Date:</strong> {{meeting_date}}<br><strong>Time:</strong> {{meeting_time}}<br><strong>Location:</strong> {{location}}</p><p>Please feel free to reach out if you need to reschedule.</p><p>Looking forward to our discussion.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"meeting_date","label":"Meeting Date"},{"key":"meeting_time","label":"Meeting Time"},{"key":"location","label":"Location"},{"key":"rep_name","label":"Rep Name"}]'',
 true),

('Post-Visit Thank You', 'follow_up',
 'Thank You for Your Time — {{visit_date}}',
 '<p>Dear {{customer_name}},</p><p>Thank you for taking the time to meet with us on {{visit_date}}. It was a pleasure visiting your facility and understanding your packaging needs.</p><p>As discussed, the next steps are:</p><p>{{next_steps}}</p><p>We will follow up accordingly. Please do not hesitate to reach out if you need anything.</p><p>Best regards,<br>{{rep_name}}</p>',
 ''[{"key":"customer_name","label":"Customer Name"},{"key":"visit_date","label":"Visit Date"},{"key":"next_steps","label":"Next Steps"},{"key":"rep_name","label":"Rep Name"}]'',
 true);
```

---

## 3. Token Encryption Utility (No Azure needed)

Build this now. It will be imported by the auth service the moment Azure creds are available.

**File: `server/utils/tokenEncryption.js`**

```js
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

function encryptToken(plaintext) {
  if (!plaintext) return null;
  const KEY = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decryptToken(stored) {
  if (!stored) return null;
  const KEY = getKey();
  const { iv, tag, data } = JSON.parse(stored);
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encryptToken, decryptToken };
```

**Generate the key now and add to `.env`:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output → OUTLOOK_TOKEN_ENCRYPTION_KEY=<output>
```

Add to `.env` and `.env.example`:
```
OUTLOOK_TOKEN_ENCRYPTION_KEY=    # 64-char hex — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OUTLOOK_CLIENT_ID=               # Fill after Azure App Registration
OUTLOOK_CLIENT_SECRET=           # Fill after Azure App Registration
OUTLOOK_TENANT_ID=common         # Leave as 'common' unless single-tenant
OUTLOOK_REDIRECT_URI=https://your-crm.com/api/auth/outlook/callback
```

---

## 4. Email Matching Service (No Azure needed)

This is pure DB logic — no Azure dependency at all.

**File: `server/services/emailMatchingService.js`**

```js
// Generic email providers — never match customers by these domains
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'msn.com', 'protonmail.com',
]);

/**
 * Match a set of email addresses to a CRM entity.
 * Returns { customerId, prospectId, confidence } or nulls.
 */
async function matchEmailToEntity(db, { fromEmail, toEmails = [], ccEmails = [] }, repUserId) {
  const candidates = [fromEmail, ...toEmails, ...ccEmails].filter(Boolean);

  for (const email of candidates) {
    const lower = email.toLowerCase().trim();

    // 1. Exact match in customer email field
    const exactCustomer = await db.query(
      `SELECT id FROM fp_customer_unified
       WHERE LOWER(email) = $1 AND rep_user_id = $2 LIMIT 1`,
      [lower, repUserId]
    );
    if (exactCustomer.rows[0]) {
      return { customerId: exactCustomer.rows[0].id, prospectId: null, confidence: 'exact' };
    }

    // 2. Contact match
    const contactMatch = await db.query(
      `SELECT c.id
       FROM crm_contacts ct
       JOIN fp_customer_unified c ON c.id = ct.customer_id
       WHERE LOWER(ct.email) = $1 AND c.rep_user_id = $2 LIMIT 1`,
      [lower, repUserId]
    );
    if (contactMatch.rows[0]) {
      return { customerId: contactMatch.rows[0].id, prospectId: null, confidence: 'contact' };
    }

    // 3. Domain match (skip generic providers)
    const domain = lower.split('@')[1];
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      const domainMatch = await db.query(
        `SELECT id FROM fp_customer_unified
         WHERE LOWER(website) LIKE $1 AND rep_user_id = $2 LIMIT 1`,
        [`%${domain}%`, repUserId]
      );
      if (domainMatch.rows[0]) {
        return { customerId: domainMatch.rows[0].id, prospectId: null, confidence: 'domain' };
      }
    }

    // 4. Prospect match
    const prospectMatch = await db.query(
      `SELECT id FROM prospects
       WHERE LOWER(email) = $1 AND rep_user_id = $2 LIMIT 1`,
      [lower, repUserId]
    );
    if (prospectMatch.rows[0]) {
      return { customerId: null, prospectId: prospectMatch.rows[0].id, confidence: 'exact' };
    }
  }

  return { customerId: null, prospectId: null, confidence: 'none' };
}

module.exports = { matchEmailToEntity };
```

---

## 5. API Route Stubs (No Azure needed)

Create the route files now with proper structure. The handlers return `503 Service Unavailable` until Azure is registered. This means the frontend can be fully wired to real endpoints immediately — no mock data, no feature flags.

**File: `server/routes/outlookAuth.js`**

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const AZURE_READY = () =>
  !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);

// GET /api/auth/outlook/status
// Returns connection status for the logged-in rep.
// Works immediately — reads from crm_outlook_connections.
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT email_address, connection_status, last_synced_at, display_name
       FROM crm_outlook_connections WHERE user_id = $1`,
      [req.user.id]
    );
    const conn = result.rows[0];
    return res.json({
      data: {
        connected: !!(conn && conn.connection_status === 'active'),
        email: conn?.email_address || null,
        display_name: conn?.display_name || null,
        status: conn?.connection_status || 'disconnected',
        last_synced_at: conn?.last_synced_at || null,
        azure_configured: AZURE_READY(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch Outlook status' });
  }
});

// GET /api/auth/outlook/connect
// Returns 503 until Azure is registered. Frontend shows graceful message.
router.get('/connect', authenticate, async (req, res) => {
  if (!AZURE_READY()) {
    return res.status(503).json({
      error: 'Outlook integration is not yet configured. Azure App Registration pending.',
      azure_configured: false,
    });
  }
  // TODO: implement after Azure registration
  // const { getAuthUrl } = require('../services/outlookAuthService');
  // const url = await getAuthUrl(req.user.id);
  // return res.json({ data: { url } });
  return res.status(503).json({ error: 'Not implemented yet' });
});

// GET /api/auth/outlook/callback
// Only reachable after Azure registration
router.get('/callback', async (req, res) => {
  if (!AZURE_READY()) {
    return res.redirect('/crm?outlook_error=not_configured');
  }
  // TODO: implement after Azure registration
  return res.redirect('/crm?outlook_error=not_implemented');
});

// DELETE /api/auth/outlook/disconnect
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    await req.db.query(
      `DELETE FROM crm_outlook_connections WHERE user_id = $1`,
      [req.user.id]
    );
    return res.json({ data: { disconnected: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
```

**File: `server/routes/emails.js`**

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// GET /api/crm/emails
router.get('/', authenticate, async (req, res) => {
  try {
    const { customer_id, prospect_id, inquiry_id, direction, is_read, limit = 50, offset = 0 } = req.query;
    const conditions = ['e.rep_user_id = $1', 'e.is_hidden = false'];
    const params = [req.user.id];
    let i = 2;

    if (customer_id)  { conditions.push(`e.customer_id = $${i++}`);  params.push(customer_id); }
    if (prospect_id)  { conditions.push(`e.prospect_id = $${i++}`);  params.push(prospect_id); }
    if (inquiry_id)   { conditions.push(`e.inquiry_id = $${i++}`);   params.push(inquiry_id); }
    if (direction)    { conditions.push(`e.direction = $${i++}`);     params.push(direction); }
    if (is_read !== undefined) { conditions.push(`e.is_read = $${i++}`); params.push(is_read === 'true'); }

    const result = await req.db.query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM crm_email_attachments a WHERE a.email_id = e.id) as attachment_count
       FROM crm_emails e
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(e.received_at, e.sent_at) DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, Number(limit), Number(offset)]
    );
    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// GET /api/crm/emails/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT COUNT(*) as count FROM crm_emails
       WHERE rep_user_id = $1 AND is_read = false AND is_hidden = false AND direction = 'inbound'`,
      [req.user.id]
    );
    return res.json({ data: { count: parseInt(result.rows[0].count, 10) } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// GET /api/crm/emails/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const emailRes = await req.db.query(
      `SELECT * FROM crm_emails WHERE id = $1 AND rep_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!emailRes.rows[0]) return res.status(404).json({ error: 'Email not found' });

    const attachRes = await req.db.query(
      `SELECT id, filename, content_type, size_bytes, is_inline, graph_attach_id
       FROM crm_email_attachments WHERE email_id = $1`,
      [req.params.id]
    );
    return res.json({ data: { ...emailRes.rows[0], attachments: attachRes.rows } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// PATCH /api/crm/emails/:id
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const allowed = ['is_read', 'crm_status', 'is_hidden', 'customer_id', 'prospect_id', 'inquiry_id'];
    const updates = Object.entries(req.body)
      .filter(([k]) => allowed.includes(k))
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [req.params.id, ...Object.values(updates)];

    await req.db.query(
      `UPDATE crm_emails SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND rep_user_id = $${values.length + 1}`,
      [...values, req.user.id]
    );
    return res.json({ data: { updated: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update email' });
  }
});

// POST /api/crm/emails/send — returns 503 until Azure registered
router.post('/send', authenticate, async (req, res) => {
  const conn = await req.db.query(
    `SELECT connection_status FROM crm_outlook_connections WHERE user_id = $1`,
    [req.user.id]
  );
  if (!conn.rows[0] || conn.rows[0].connection_status !== 'active') {
    return res.status(503).json({ error: 'Outlook not connected. Connect your account in Settings first.' });
  }
  // TODO: implement after Azure registration
  return res.status(503).json({ error: 'Email sending not yet available. Azure registration pending.' });
});

// POST /api/crm/emails/:id/reply — returns 503 until Azure registered
router.post('/:id/reply', authenticate, async (req, res) => {
  return res.status(503).json({ error: 'Email reply not yet available. Azure registration pending.' });
});

module.exports = router;
```

**File: `server/routes/emailTemplates.js`**

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// GET /api/crm/email-templates
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM crm_email_templates
       WHERE is_shared = true OR created_by = $1
       ORDER BY use_count DESC, name ASC`,
      [req.user.id]
    );
    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/crm/email-templates/:id/preview
// Substitutes {{variables}} and returns rendered subject + body.
// Works without Azure — pure string substitution.
router.get('/:id/preview', authenticate, async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM crm_email_templates WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });

    const template = result.rows[0];
    const vars = req.query || {};

    const render = (str) => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
    };

    return res.json({
      data: {
        subject: render(template.subject),
        body_html: render(template.body_html),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to preview template' });
  }
});

// POST /api/crm/email-templates
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, category, subject, body_html, variables, is_shared } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await req.db.query(
      `INSERT INTO crm_email_templates (created_by, name, category, subject, body_html, variables, is_shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, name, category || null, subject || null, body_html || null,
       JSON.stringify(variables || []), is_shared !== false]
    );
    return res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/crm/email-templates/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, category, subject, body_html, variables, is_shared } = req.body;
    await req.db.query(
      `UPDATE crm_email_templates
       SET name=$2, category=$3, subject=$4, body_html=$5, variables=$6, is_shared=$7, updated_at=NOW()
       WHERE id=$1 AND created_by=$8`,
      [req.params.id, name, category || null, subject || null, body_html || null,
       JSON.stringify(variables || []), is_shared !== false, req.user.id]
    );
    return res.json({ data: { updated: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/crm/email-templates/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await req.db.query(
      `DELETE FROM crm_email_templates WHERE id=$1 AND created_by=$2`,
      [req.params.id, req.user.id]
    );
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
```

---

## 6. My Day Email Summary Endpoint (No Azure needed)

Add to your existing My Day route file. Returns real data from the DB — zero emails captured yet (so all zeros), but the endpoint exists and the frontend wires to it correctly.

```js
// GET /api/crm/my-day/email-summary
router.get('/email-summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [unreadRes, awaitingRes, todayRes, topUnreadRes, connectionRes] = await Promise.all([
      // Unread inbound from customers
      req.db.query(
        `SELECT COUNT(*) as count FROM crm_emails
         WHERE rep_user_id=$1 AND direction='inbound' AND is_read=false AND is_hidden=false`,
        [userId]
      ),
      // Outbound with no reply in 48h
      req.db.query(
        `SELECT COUNT(*) as count FROM crm_emails e
         WHERE e.rep_user_id=$1 AND e.direction='outbound' AND e.crm_status='captured'
           AND e.sent_at < NOW() - INTERVAL '48 hours'
           AND NOT EXISTS (
             SELECT 1 FROM crm_emails r
             WHERE r.graph_conversation_id = e.graph_conversation_id
               AND r.direction='inbound' AND r.received_at > e.sent_at
           )`,
        [userId]
      ),
      // Total emails today
      req.db.query(
        `SELECT COUNT(*) as count FROM crm_emails
         WHERE rep_user_id=$1 AND DATE(COALESCE(received_at, sent_at)) = CURRENT_DATE`,
        [userId]
      ),
      // Top 3 unread previews
      req.db.query(
        `SELECT id, subject, from_name, from_email,
                EXTRACT(EPOCH FROM (NOW() - received_at))/3600 AS age_hours
         FROM crm_emails
         WHERE rep_user_id=$1 AND direction='inbound' AND is_read=false AND is_hidden=false
         ORDER BY received_at DESC LIMIT 3`,
        [userId]
      ),
      // Outlook connection status
      req.db.query(
        `SELECT connection_status FROM crm_outlook_connections WHERE user_id=$1`,
        [userId]
      ),
    ]);

    const conn = connectionRes.rows[0];
    return res.json({
      data: {
        unreadFromCustomers: parseInt(unreadRes.rows[0].count, 10),
        awaitingReply: parseInt(awaitingRes.rows[0].count, 10),
        emailsToday: parseInt(todayRes.rows[0].count, 10),
        topUnread: topUnreadRes.rows.map(r => ({
          ...r,
          age_hours: Math.round(Number(r.age_hours)),
        })),
        outlookConnected: !!(conn && conn.connection_status === 'active'),
        draftsDueToday: 0, // populated from /api/crm/email-drafts?due_today=true
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch email summary' });
  }
});
```

---

## 7. OutlookConnectSettings.jsx (No Azure needed)

This component already works for the `disconnected` and `not_configured` states — it just renders a connect button that the user can't press yet. When Azure is registered, the same component starts working with zero changes.

**File: `src/components/CRM/OutlookConnectSettings.jsx`**

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, DisconnectOutlined, MailOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_CONFIG = {
  active:       { color: 'success', icon: <CheckCircleOutlined />, label: 'Connected' },
  expired:      { color: 'warning', icon: <WarningOutlined />,     label: 'Expired — Reconnect' },
  error:        { color: 'error',   icon: <WarningOutlined />,     label: 'Error' },
  revoked:      { color: 'error',   icon: <DisconnectOutlined />,  label: 'Revoked' },
  disconnected: { color: 'default', icon: <DisconnectOutlined />,  label: 'Not Connected' },
};

const OutlookConnectSettings = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState(null);

  const loadStatus = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/auth/outlook/status`, { headers });
      setStatus(res.data?.data || null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleConnect = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setConnecting(true);
    try {
      const res = await axios.get(`${API_BASE}/api/auth/outlook/connect`, { headers });
      const url = res.data?.data?.url;
      if (!url) {
        message.warning('Outlook integration is not yet configured. Please check back after Azure registration is complete.');
        return;
      }
      const popup = window.open(url, 'outlook-connect', 'width=560,height=720');
      if (!popup) {
        message.error('Popup blocked. Please allow popups for this site.');
        return;
      }
      const listener = (event) => {
        if (event?.data?.source === 'outlook-oauth') {
          window.removeEventListener('message', listener);
          loadStatus();
        }
      };
      window.addEventListener('message', listener);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to initiate connection';
      message.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setDisconnecting(true);
    try {
      await axios.delete(`${API_BASE}/api/auth/outlook/disconnect`, { headers });
      message.success('Outlook disconnected');
      loadStatus();
    } catch {
      message.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <Spin />;

  const cfg = STATUS_CONFIG[status?.status || 'disconnected'];
  const isActive = status?.status === 'active';
  const azureReady = status?.azure_configured !== false;

  return (
    <Card
      title={<Space><MailOutlined /><span>Outlook / Microsoft 365</span></Space>}
      style={{ maxWidth: 560 }}
    >
      {!azureReady && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="Azure registration pending"
          description="The Outlook integration is being configured. Once the Azure App Registration is complete, you will be able to connect your mailbox here."
        />
      )}

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space>
          <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
          {isActive && status?.email && <Text strong>{status.email}</Text>}
        </Space>

        {isActive && status?.last_synced_at && (
          <Text type="secondary">
            Last synced {dayjs(status.last_synced_at).fromNow()}
          </Text>
        )}

        {status?.status === 'expired' && (
          <Alert type="warning" showIcon message="Your Outlook session has expired. Reconnect to resume email sync." />
        )}

        {status?.status === 'error' && (
          <Alert type="error" showIcon message="Sync error. Try reconnecting." />
        )}

        <Space wrap>
          {!isActive && (
            <Button
              type="primary"
              icon={<MailOutlined />}
              loading={connecting}
              disabled={!azureReady}
              onClick={handleConnect}
            >
              {azureReady ? 'Connect Outlook' : 'Coming Soon'}
            </Button>
          )}

          {isActive && (
            <>
              <Button icon={<SyncOutlined />} onClick={loadStatus}>
                Refresh Status
              </Button>
              <Button
                danger
                icon={<DisconnectOutlined />}
                loading={disconnecting}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </>
          )}

          {(status?.status === 'expired' || status?.status === 'error') && azureReady && (
            <Button type="primary" loading={connecting} onClick={handleConnect}>
              Reconnect
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );
};

export default OutlookConnectSettings;
```

---

## 8. npm Packages to Install Now

```bash
npm install @azure/msal-node @microsoft/microsoft-graph-client node-cron
```

These can sit unused until the auth service is wired. Installing now means no surprises on deploy day.

---

## Summary: What This Gives You

| Item | State after this work |
|---|---|
| All 4 email DB tables | ✅ Ready |
| 8 standard templates | ✅ Seeded and usable in EmailComposeModal |
| Token encryption utility | ✅ Ready to import |
| Email matching service | ✅ Ready to import |
| All API route stubs | ✅ Return real data or graceful 503 |
| `/status` endpoint | ✅ Fully working (reads DB) |
| `/disconnect` endpoint | ✅ Fully working |
| Template CRUD + preview endpoints | ✅ Fully working |
| Email read endpoints (GET, PATCH) | ✅ Fully working |
| My Day email-summary endpoint | ✅ Fully working (returns zeros until sync runs) |
| OutlookConnectSettings.jsx | ✅ Shows "Coming Soon" gracefully, auto-activates when Azure ready |
| npm packages installed | ✅ Ready |
| **What changes when Azure is registered** | Paste 3 env vars. Implement `outlookAuthService.js`. Remove the `503` stubs from `/connect`, `/callback`, `/send`. Everything else is already done. |
