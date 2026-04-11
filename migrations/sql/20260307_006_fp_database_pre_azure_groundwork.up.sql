-- DESCRIPTION: Pre-Azure groundwork hardening for CRM email/outlook foundation
-- ROLLBACK: SCHEMA ONLY
-- DATA LOSS: POSSIBLE

-- ------------------------------------------------------------
-- crm_outlook_connections: add pre-Azure readiness fields
-- ------------------------------------------------------------
ALTER TABLE crm_outlook_connections
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT true;

-- Allow disconnected state for pre-registration lifecycle.
ALTER TABLE crm_outlook_connections
  DROP CONSTRAINT IF EXISTS crm_outlook_connections_connection_status_check;

ALTER TABLE crm_outlook_connections
  ADD CONSTRAINT crm_outlook_connections_connection_status_check
  CHECK (connection_status IN ('disconnected', 'active', 'expired', 'revoked', 'error'));

ALTER TABLE crm_outlook_connections
  ALTER COLUMN connection_status SET DEFAULT 'disconnected';

CREATE INDEX IF NOT EXISTS idx_crm_outlook_connections_user
  ON crm_outlook_connections(user_id);

-- ------------------------------------------------------------
-- crm_emails: add compatibility columns for richer linking
-- ------------------------------------------------------------
ALTER TABLE crm_emails
  ADD COLUMN IF NOT EXISTS contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_crm_emails_customer
  ON crm_emails(customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_emails_prospect
  ON crm_emails(prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_emails_conversation
  ON crm_emails(graph_conversation_id)
  WHERE graph_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_emails_received
  ON crm_emails(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_emails_unread
  ON crm_emails(rep_user_id, is_read)
  WHERE is_read = false;

-- ------------------------------------------------------------
-- crm_email_attachments: add fetched_at metadata
-- ------------------------------------------------------------
ALTER TABLE crm_email_attachments
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- crm_email_templates: add created_by compatibility column
-- ------------------------------------------------------------
ALTER TABLE crm_email_templates
  ADD COLUMN IF NOT EXISTS created_by INTEGER;

UPDATE crm_email_templates
SET created_by = owner_user_id
WHERE created_by IS NULL
  AND owner_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- crm_email_drafts: add alias column used by pre-Azure plan
-- ------------------------------------------------------------
ALTER TABLE crm_email_drafts
  ADD COLUMN IF NOT EXISTS sent_graph_message_id VARCHAR(255);

UPDATE crm_email_drafts
SET sent_graph_message_id = sent_graph_msg_id
WHERE sent_graph_message_id IS NULL
  AND sent_graph_msg_id IS NOT NULL;
