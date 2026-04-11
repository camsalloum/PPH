-- DESCRIPTION: Seed standard CRM email templates for Outlook compose flow
-- ROLLBACK: SAFE
-- DATA LOSS: NO

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Initial Introduction', 'intro',
       'Introduction from {{company_name}}',
       '<p>Dear {{customer_name}},</p><p>This is {{rep_name}} from {{company_name}}. I would like to introduce our packaging solutions and discuss how we can support your requirements.</p><p>Best regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"rep_name","label":"Rep Name"},{"key":"company_name","label":"Company Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Initial Introduction');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Inquiry Acknowledgement', 'follow_up',
       'Re: Inquiry {{inquiry_number}}',
       '<p>Dear {{customer_name}},</p><p>Thank you for your inquiry {{inquiry_number}} regarding {{product_type}}. We are reviewing your request and will revert with details shortly.</p><p>Regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"product_type","label":"Product Type"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Inquiry Acknowledgement');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Quotation / Proposal Cover', 'proposal',
       'Proposal for {{inquiry_number}}',
       '<p>Dear {{customer_name}},</p><p>Please find our proposal for inquiry {{inquiry_number}}. Validity: {{validity_days}} days. Total value: {{total_value}} {{currency}}.</p><p>Best regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"validity_days","label":"Validity Days"},{"key":"total_value","label":"Total Value"},{"key":"currency","label":"Currency"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Quotation / Proposal Cover');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Technical Spec Request', 'proposal',
       'Technical details required for {{product_description}}',
       '<p>Dear {{customer_name}},</p><p>To proceed efficiently, please share the technical details for {{product_description}}.</p><p>Regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"product_description","label":"Product Description"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Technical Spec Request');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Follow-up: No Reply (5 days)', 'follow_up',
       'Follow-up on {{inquiry_number}}',
       '<p>Dear {{customer_name}},</p><p>I wanted to follow up on inquiry {{inquiry_number}}. Please let me know if any clarification is required.</p><p>Best regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"inquiry_number","label":"Inquiry Number"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Follow-up: No Reply (5 days)');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Reorder Reminder', 'reorder_reminder',
       'Reorder reminder for {{product_type}}',
       '<p>Dear {{customer_name}},</p><p>This is a reminder regarding your regular order cycle. Your last order date was {{last_order_date}} for {{product_type}}.</p><p>Regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"last_order_date","label":"Last Order Date"},{"key":"product_type","label":"Product Type"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Reorder Reminder');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Meeting Confirmation', 'intro',
       'Meeting confirmation: {{meeting_date}} {{meeting_time}}',
       '<p>Dear {{customer_name}},</p><p>This is to confirm our meeting on {{meeting_date}} at {{meeting_time}} at {{location}}.</p><p>Regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"meeting_date","label":"Meeting Date"},{"key":"meeting_time","label":"Meeting Time"},{"key":"location","label":"Location"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Meeting Confirmation');

INSERT INTO crm_email_templates (owner_user_id, name, category, subject, body_html, variables, is_shared, use_count)
SELECT NULL, 'Post-Visit Thank You', 'follow_up',
       'Thank you for your time on {{visit_date}}',
       '<p>Dear {{customer_name}},</p><p>Thank you for your time during our visit on {{visit_date}}. Next steps: {{next_steps}}.</p><p>Best regards,<br/>{{rep_name}}</p>',
       '[{"key":"customer_name","label":"Customer Name"},{"key":"visit_date","label":"Visit Date"},{"key":"next_steps","label":"Next Steps"},{"key":"rep_name","label":"Rep Name"}]'::jsonb,
       true,
       0
WHERE NOT EXISTS (SELECT 1 FROM crm_email_templates WHERE name = 'Post-Visit Thank You');
