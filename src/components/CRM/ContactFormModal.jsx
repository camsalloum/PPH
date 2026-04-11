/**
 * ContactFormModal — add or edit a customer contact
 * Props:
 *   open       — boolean
 *   customerId — integer
 *   contact    — existing contact object (null = create mode)
 *   onClose    — cancel callback
 *   onSaved    — success callback
 */
import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Switch, App } from 'antd';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ContactFormModal({ open, customerId, contact, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const isEdit = !!contact;

  useEffect(() => {
    if (open) {
      if (contact) {
        form.setFieldsValue(contact);
      } else {
        form.resetFields();
      }
    }
  }, [open, contact, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');

      if (isEdit) {
        await axios.patch(
          `${API_BASE}/api/crm/customers/${customerId}/contacts/${contact.id}`,
          values,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_BASE}/api/crm/customers/${customerId}/contacts`,
          values,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      message.success(isEdit ? 'Contact updated' : 'Contact added');
      if (onSaved) onSaved();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Contact' : 'Add Contact'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={isEdit ? 'Save Changes' : 'Add Contact'}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item name="contact_name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="Full name" />
        </Form.Item>
        <Form.Item name="designation" label="Job Title">
          <Input placeholder="e.g. Procurement Manager" />
        </Form.Item>
        <Form.Item name="phone" label="Phone" rules={[{ required: true, message: 'Phone is required' }]}>
          <Input placeholder="+971 ..." />
        </Form.Item>
        <Form.Item name="email" label="Email">
          <Input placeholder="name@company.com" />
        </Form.Item>
        <Form.Item name="whatsapp" label="WhatsApp">
          <Input placeholder="+971 ..." />
        </Form.Item>
        <Form.Item name="is_primary" label="Primary Contact" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Any notes about this contact..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
