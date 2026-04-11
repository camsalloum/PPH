/**
 * NewCustomerModal — Collect new company details.
 *
 * When deferSave=true (default in wizard), the modal only validates and returns
 * the form data via onCreated(data) WITHOUT calling the API — the parent is
 * responsible for saving at the right time (e.g. inside the inquiry transaction).
 *
 * When deferSave=false, the modal calls POST /register-prospect immediately and
 * returns the saved fp_prospects row via onCreated(prospect).
 *
 * Props:
 *   open            {boolean}   — controls visibility
 *   onCancel        {function}  — called when user cancels
 *   onCreated       {function}  — called with form data (deferred) or saved row (immediate)
 *   deferSave       {boolean}   — if true, skip API call and just return collected data
 *   repGroupName    {string}    — rep group to assign (admin passes selected group; reps auto-assign)
 *   initialValues   {object}   — pre-fill fields when re-opening for editing display
 */

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, App, Alert } from 'antd';
import axios from 'axios';
import { fetchCountries } from '../../../services/countriesService';

const PROSPECT_SOURCES = [
  { value: 'customer_visit', label: 'Customer Visit' },
  { value: 'phone_call',     label: 'Phone Call' },
  { value: 'whatsapp',       label: 'WhatsApp' },
  { value: 'email',          label: 'Email' },
  { value: 'exhibition',     label: 'Exhibition / Event' },
  { value: 'referral',       label: 'Referral' },
  { value: 'manager_tip',    label: 'Manager Tip' },
  { value: 'online',         label: 'Online / Website' },
  { value: 'other',          label: 'Other' },
];

const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function NewCustomerModal({ open, onCancel, onCreated, repGroupName, initialValues, source: sourceProp, deferSave = false }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [countries, setCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupError, setDupError] = useState(null);

  // Load countries list and pre-fill form whenever modal opens
  useEffect(() => {
    if (!open) return;
    setDupError(null);
    setLoadingCountries(true);
    fetchCountries()
      .then(countries => setCountries(countries || []))
      .catch(() => { /* countries optional */ })
      .finally(() => setLoadingCountries(false));

    if (initialValues) {
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
    }
  }, [open, initialValues, form]);

  const handleOk = () => {
    form.validateFields().then(async (values) => {
      // Deferred mode: just return collected data without hitting the API.
      // The parent (InquiryCapture) will send this as new_prospect in the inquiry submission.
      if (deferSave) {
        const collectedData = {
          company_name:     values.company_name,
          country:          values.country || null,
          mobile_number:    values.mobile_number || null,
          telephone_number: values.telephone_number || null,
          contact_name:     values.contact_name || null,
          contact_email:    values.contact_email || null,
          source:           sourceProp || values.source || 'other',
        };
        form.resetFields();
        onCreated(collectedData);
        return;
      }

      // Immediate mode: save to DB right away
      setSaving(true);
      setDupError(null);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.post(
          `${API_BASE}/api/mes/presales/register-prospect`,
          {
            company_name:     values.company_name,
            country:          values.country || null,
            mobile_number:    values.mobile_number || null,
            telephone_number: values.telephone_number || null,
            source:           sourceProp || values.source || 'other',
            // Admin: pass the currently-selected rep group so prospect is pre-assigned
            sales_rep_group_name: repGroupName || null,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.data.success) {
          message.success(`"${res.data.data.customer_name}" added to your prospect list`);
          form.resetFields();
          onCreated(res.data.data);           // return the full fp_prospects row
        } else {
          message.error(res.data.error || 'Failed to register company');
        }
      } catch (err) {
        if (err.response?.status === 409) {
          // Duplicate — show inline warning, let user continue (same company, different inquiry)
          setDupError(err.response.data.error);
        } else {
          message.error(err.response?.data?.error || 'Failed to register company');
        }
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <Modal
      title="Register New Company"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Save Company"
      confirmLoading={saving}
      width={480}
      destroyOnHidden
    >
      {dupError && (
        <Alert
          type="warning"
          message={dupError}
          description="This company already exists in the prospect list. You can still create the inquiry by selecting it from 'From Prospect List'."
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setDupError(null)}
        />
      )}
      <Form form={form} layout="vertical" size="middle" style={{ paddingTop: 8 }}>
        <Form.Item
          name="company_name"
          label="Company Name"
          rules={[{ required: true, message: 'Company name is required' }]}
        >
          <Input
            placeholder="Enter the company's legal or trade name"
            autoFocus
          />
        </Form.Item>

        <Form.Item name="country" label="Country">
          <Select
            showSearch
            optionFilterProp="children"
            placeholder="Select country..."
            loading={loadingCountries}
            allowClear
          >
            {countries.map(c => (
              <Option key={c.country_name} value={c.country_name}>
                {c.country_name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="mobile_number"
          label="Mobile Number"
          rules={[{ required: true, message: 'Mobile number is required' }]}
        >
          <Input placeholder="+971 50 123 4567" />
        </Form.Item>

        <Form.Item name="telephone_number" label="Telephone Number">
          <Input placeholder="+971 4 123 4567 (optional)" />
        </Form.Item>

        <Form.Item name="contact_name" label="Contact Person">
          <Input placeholder="John Smith (optional)" />
        </Form.Item>

        <Form.Item
          name="contact_email"
          label="Contact Email"
          rules={[{ type: 'email', message: 'Please enter a valid email address' }]}
        >
          <Input placeholder="john@company.com (optional)" />
        </Form.Item>

        {/* Only show source picker when not coming from the inquiry wizard (which already captured source in Step 1) */}
        {!sourceProp && (
          <Form.Item
            name="source"
            label="How did you find this company?"
            rules={[{ required: true, message: 'Please select a source' }]}
          >
            <Select placeholder="Select source...">
              {PROSPECT_SOURCES.map(s => (
                <Option key={s.value} value={s.value}>{s.label}</Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {repGroupName && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Will be added to: <strong>{repGroupName}</strong>
          </div>
        )}
      </Form>
    </Modal>
  );
}

