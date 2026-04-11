-- DESCRIPTION: CRM email foundation tables for My Day email queue and future Outlook integration
-- ROLLBACK: SAFE
-- DATA LOSS: NO

CREATE TABLE IF NOT EXISTS crm_outlook_connections (
  id                          SERIAL PRIMARY KEY,
  user_id                     INTEGER UNIQUE NOT NULL,
  microsoft_account_id        VARCHAR(255),
  email_address               VARCHAR(255),
  access_token_enc            TEXT,
  refresh_token_enc           TEXT,
  token_expires_at            TIMESTAMPTZ,
  delta_link                  TEXT,
  last_synced_at              TIMESTAMPTZ,
  connection_status           VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (connection_status IN ('active', 'expired', 'revoked', 'error')),
  error_message               TEXT,
  webhook_subscription_id     VARCHAR(255),
  webhook_subscription_expiry TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_outlook_connections_status ON crm_outlook_connections(connection_status);

CREATE TABLE IF NOT EXISTS crm_email_templates (
  id            SERIAL PRIMARY KEY,
  owner_user_id INTEGER,
  name          VARCHAR(255) NOT NULL,
  category      VARCHAR(80),
  subject       VARCHAR(500) NOT NULL,
  body_html     TEXT NOT NULL,
  variables     JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_shared     BOOLEAN NOT NULL DEFAULT false,
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_email_templates_owner ON crm_email_templates(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_shared ON crm_email_templates(is_shared);

CREATE TABLE IF NOT EXISTS crm_email_drafts (
  id                SERIAL PRIMARY KEY,
  rep_id            INTEGER NOT NULL,
  to_customer_id    INTEGER,
  to_prospect_id    INTEGER,
  inquiry_id        INTEGER,
  to_emails         JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_emails         JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject           VARCHAR(500) NOT NULL,
  body_html         TEXT,
  body_notes        TEXT,
  template_id       INTEGER,
  due_by            DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'cancelled')),
  graph_draft_id    VARCHAR(255),
  sent_graph_msg_id VARCHAR(255),
  send_via          VARCHAR(20) NOT NULL DEFAULT 'outlook'
                      CHECK (send_via IN ('outlook', 'smtp')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_email_drafts_rep_due ON crm_email_drafts(rep_id, due_by);
CREATE INDEX IF NOT EXISTS idx_crm_email_drafts_status ON crm_email_drafts(status);

CREATE TABLE IF NOT EXISTS crm_emails (
  id                    SERIAL PRIMARY KEY,
  rep_user_id           INTEGER NOT NULL,
  graph_message_id      VARCHAR(255),
  graph_conversation_id VARCHAR(255),
  internet_message_id   VARCHAR(500),
  customer_id           INTEGER,
  prospect_id           INTEGER,
  inquiry_id            INTEGER,
  match_confidence      VARCHAR(20) DEFAULT 'none'
                          CHECK (match_confidence IN ('exact', 'domain', 'contact', 'manual', 'none')),
  direction             VARCHAR(20) NOT NULL
                          CHECK (direction IN ('inbound', 'outbound')),
  subject               VARCHAR(500),
  body_preview          TEXT,
  body_html             TEXT,
  from_email            VARCHAR(255),
  from_name             VARCHAR(255),
  to_emails             JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_emails             JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at           TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  is_read               BOOLEAN NOT NULL DEFAULT false,
  importance            VARCHAR(20),
  has_attachments       BOOLEAN NOT NULL DEFAULT false,
  crm_status            VARCHAR(30) NOT NULL DEFAULT 'captured'
                          CHECK (crm_status IN ('captured', 'pending_reply', 'replied', 'archived', 'ignored')),
  is_hidden             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_emails_rep_graph_message
  ON crm_emails(rep_user_id, graph_message_id)
  WHERE graph_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_emails_rep_direction_read
  ON crm_emails(rep_user_id, direction, is_read);

CREATE INDEX IF NOT EXISTS idx_crm_emails_rep_created
  ON crm_emails(rep_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_email_attachments (
  id              SERIAL PRIMARY KEY,
  email_id        INTEGER NOT NULL,
  graph_attach_id VARCHAR(255),
  filename        VARCHAR(255) NOT NULL,
  content_type    VARCHAR(120),
  size_bytes      INTEGER,
  is_inline       BOOLEAN NOT NULL DEFAULT false,
  content_base64  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_email_attachments_email_id ON crm_email_attachments(email_id);
