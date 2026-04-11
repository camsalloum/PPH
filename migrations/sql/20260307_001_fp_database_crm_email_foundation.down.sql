-- Rollback: CRM email foundation tables

DROP INDEX IF EXISTS idx_crm_email_attachments_email_id;
DROP TABLE IF EXISTS crm_email_attachments;

DROP INDEX IF EXISTS idx_crm_emails_rep_created;
DROP INDEX IF EXISTS idx_crm_emails_rep_direction_read;
DROP INDEX IF EXISTS idx_crm_emails_rep_graph_message;
DROP TABLE IF EXISTS crm_emails;

DROP INDEX IF EXISTS idx_crm_email_drafts_status;
DROP INDEX IF EXISTS idx_crm_email_drafts_rep_due;
DROP TABLE IF EXISTS crm_email_drafts;

DROP INDEX IF EXISTS idx_crm_email_templates_shared;
DROP INDEX IF EXISTS idx_crm_email_templates_owner;
DROP TABLE IF EXISTS crm_email_templates;

DROP INDEX IF EXISTS idx_crm_outlook_connections_status;
DROP TABLE IF EXISTS crm_outlook_connections;
