import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const normalizeTemplateVariables = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseEmailList = (value) => String(value || '')
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v && EMAIL_RE.test(v));

const EmailComposeModal = ({ open, onClose, onSent, onDraftSaved, defaultCustomerId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const selectedTemplateId = Form.useWatch('template_id', form);
  const templateVariables = Form.useWatch('template_vars', form) || {};

  const selectedTemplate = useMemo(
    () => templates.find((t) => Number(t.id) === Number(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  const selectedTemplateVariableDefs = useMemo(
    () => normalizeTemplateVariables(selectedTemplate?.variables),
    [selectedTemplate]
  );

  useEffect(() => {
    if (!open) return;

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    setLoadingTemplates(true);
    axios.get(`${API_BASE}/api/crm/email-templates`, { headers })
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setTemplates(rows);
      })
      .catch(() => {
        setTemplates([]);
      })
      .finally(() => setLoadingTemplates(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      template_id: undefined,
      to_input: '',
      cc_input: '',
      subject: '',
      body_html: '',
      due_by: null,
      template_vars: {},
    });
  }, [open, form]);

  const applyTemplate = async () => {
    if (!selectedTemplateId) return;

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const previewRes = await axios.post(
        `${API_BASE}/api/crm/email-templates/${selectedTemplateId}/preview`,
        { variables: templateVariables || {} },
        { headers }
      );

      const preview = previewRes.data?.data || {};
      form.setFieldsValue({
        subject: preview.subject || '',
        body_html: preview.body_html || '',
      });
      message.success('Template applied');
    } catch (_error) {
      message.error('Failed to apply template');
    }
  };

  const handleSend = async () => {
    try {
      const values = await form.validateFields(['to_input', 'subject', 'body_html']);
      const rawTo = String(values.to_input || '').split(',').map(v => v.trim()).filter(Boolean);
      const toEmails = parseEmailList(values.to_input).map((email) => ({ email }));
      const ccEmails = parseEmailList(values.cc_input).map((email) => ({ email }));

      if (!toEmails.length) {
        message.warning(rawTo.length ? 'No valid email addresses found. Check format (e.g. name@example.com).' : 'At least one recipient is required');
        return;
      }

      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      setSending(true);
      await axios.post(
        `${API_BASE}/api/crm/emails/send`,
        {
          to_emails: toEmails,
          cc_emails: ccEmails,
          subject: values.subject,
          body_html: values.body_html,
          customer_id: defaultCustomerId || null,
        },
        { headers }
      );

      message.success('Email sent via Outlook');
      onSent?.();
      onClose?.();
    } catch (_error) {
      message.error('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const values = await form.validateFields(['subject']);
      const toEmails = parseEmailList(form.getFieldValue('to_input')).map((email) => ({ email }));
      const ccEmails = parseEmailList(form.getFieldValue('cc_input')).map((email) => ({ email }));

      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      setSavingDraft(true);
      await axios.post(
        `${API_BASE}/api/crm/email-drafts`,
        {
          to_customer_id: defaultCustomerId || null,
          to_emails: toEmails,
          cc_emails: ccEmails,
          subject: values.subject,
          body_html: form.getFieldValue('body_html') || '',
          template_id: form.getFieldValue('template_id') || null,
          due_by: form.getFieldValue('due_by') ? dayjs(form.getFieldValue('due_by')).format('YYYY-MM-DD') : null,
          status: 'pending',
          send_via: 'outlook',
        },
        { headers }
      );

      message.success('Draft saved');
      onDraftSaved?.();
      onClose?.();
    } catch (_error) {
      message.error('Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <Modal
      title="Compose Email"
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="draft" onClick={handleSaveDraft} loading={savingDraft}>Save Draft</Button>,
        <Button key="send" type="primary" onClick={handleSend} loading={sending}>Send</Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Form.Item name="template_id" style={{ flex: 1, marginBottom: 0 }}>
            <Select
              placeholder="Choose template"
              loading={loadingTemplates}
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              allowClear
            />
          </Form.Item>
          <Button onClick={applyTemplate} disabled={!selectedTemplateId}>Apply Template</Button>
        </Space.Compact>

        {selectedTemplateVariableDefs.length > 0 ? (
          <Space wrap style={{ marginBottom: 12 }}>
            {selectedTemplateVariableDefs.map((v) => (
              <Form.Item
                key={v.key}
                name={['template_vars', v.key]}
                label={v.label || v.key}
                style={{ minWidth: 180, marginBottom: 0 }}
              >
                <Input size="small" placeholder={v.default || ''} />
              </Form.Item>
            ))}
          </Space>
        ) : null}

        <Form.Item
          name="to_input"
          label="To (comma separated)"
          rules={[{ required: true, message: 'At least one recipient is required' }]}
        >
          <Input placeholder="customer@example.com, second@example.com" />
        </Form.Item>

        <Form.Item name="cc_input" label="CC (comma separated)">
          <Input placeholder="optional@example.com" />
        </Form.Item>

        <Form.Item name="due_by" label="Draft Due Date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="subject"
          label="Subject"
          rules={[{ required: true, message: 'Subject is required' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="body_html"
          label="Body (HTML allowed)"
          rules={[{ required: true, message: 'Body is required' }]}
        >
          <Input.TextArea rows={10} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EmailComposeModal;
