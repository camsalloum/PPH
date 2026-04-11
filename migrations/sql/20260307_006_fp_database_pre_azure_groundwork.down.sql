-- DESCRIPTION: Rollback pre-Azure groundwork hardening for CRM email/outlook foundation
-- ROLLBACK: SCHEMA ONLY
-- DATA LOSS: POSSIBLE

DROP INDEX IF EXISTS idx_crm_outlook_connections_user;

ALTER TABLE crm_outlook_connections
  ALTER COLUMN connection_status SET DEFAULT 'active';

ALTER TABLE crm_outlook_connections
  DROP CONSTRAINT IF EXISTS crm_outlook_connections_connection_status_check;

ALTER TABLE crm_outlook_connections
  ADD CONSTRAINT crm_outlook_connections_connection_status_check
  CHECK (connection_status IN ('active', 'expired', 'revoked', 'error'));

ALTER TABLE crm_outlook_connections
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS sync_enabled;

DROP INDEX IF EXISTS idx_crm_emails_customer;
DROP INDEX IF EXISTS idx_crm_emails_prospect;
DROP INDEX IF EXISTS idx_crm_emails_conversation;
DROP INDEX IF EXISTS idx_crm_emails_received;
DROP INDEX IF EXISTS idx_crm_emails_unread;

ALTER TABLE crm_emails
  DROP COLUMN IF EXISTS contact_id,
  DROP COLUMN IF EXISTS hidden_reason,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE crm_email_attachments
  DROP COLUMN IF EXISTS fetched_at;

ALTER TABLE crm_email_templates
  DROP COLUMN IF EXISTS created_by;

ALTER TABLE crm_email_drafts
  DROP COLUMN IF EXISTS sent_graph_message_id;
