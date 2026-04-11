-- Rollback: remove seeded standard email templates

DELETE FROM crm_email_templates
WHERE name IN (
  'Initial Introduction',
  'Inquiry Acknowledgement',
  'Quotation / Proposal Cover',
  'Technical Spec Request',
  'Follow-up: No Reply (5 days)',
  'Reorder Reminder',
  'Meeting Confirmation',
  'Post-Visit Thank You'
)
AND owner_user_id IS NULL;
