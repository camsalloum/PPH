/**
 * PackagingProfile — Display and edit customer packaging profile
 * within CustomerDetail Profile tab.
 *
 * Props:
 *   customerId — FK to fp_customer_unified
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Space, Spin, Empty, App } from 'antd';
import { SaveOutlined, EditOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const FIELDS = [
  { name: 'current_suppliers', label: 'Current Packaging Suppliers', placeholder: 'e.g. ABC Packaging, XYZ Films' },
  { name: 'packaging_categories', label: 'Packaging Categories Purchased', placeholder: 'e.g. Laminated Pouches, Shrink Sleeves, Labels' },
  { name: 'converting_equipment', label: 'Converting Equipment On-Site', placeholder: 'e.g. VFFS machines, Horizontal FFS' },
  { name: 'food_safety_certs', label: 'Food Safety Certifications', placeholder: 'e.g. FSSC 22000, BRC, HACCP' },
  { name: 'annual_volume_est', label: 'Annual Packaging Volume Estimate', placeholder: 'e.g. 500,000 KG', isShort: true },
  { name: 'sustainability_reqs', label: 'Sustainability Requirements', placeholder: 'e.g. Recyclable mono-material, PCR content' },
];

const PackagingProfile = ({ customerId }) => {
  const { message } = App.useApp();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/customers/${customerId}/packaging-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data?.data;
      setProfile(data);
      if (data) form.setFieldsValue(data);
    } catch { setProfile(null); }
    finally { setLoading(false); }
  }, [customerId, form]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.put(`${API_BASE}/api/crm/customers/${customerId}/packaging-profile`, values, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('Packaging profile saved');
      setEditMode(false);
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save profile');
    } finally { setSaving(false); }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '16px auto' }} />;

  if (!profile && !editMode) {
    return (
      <Empty description="No packaging profile yet" image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <Button type="primary" icon={<EditOutlined />} onClick={() => setEditMode(true)}
          style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
          Add Profile
        </Button>
      </Empty>
    );
  }

  if (!editMode) {
    return (
      <div>
        <div style={{ textAlign: 'right', marginBottom: 8 }}>
          <Button size="small" icon={<EditOutlined />} onClick={() => { form.setFieldsValue(profile); setEditMode(true); }}>
            Edit
          </Button>
        </div>
        {FIELDS.map(f => {
          const val = profile?.[f.name];
          return (
            <div key={f.name} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 13 }}>{val || <span style={{ color: '#d9d9d9' }}>—</span>}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleSave}>
      {FIELDS.map(f => (
        <Form.Item key={f.name} name={f.name} label={f.label}>
          {f.isShort
            ? <Input placeholder={f.placeholder} />
            : <TextArea rows={2} placeholder={f.placeholder} />}
        </Form.Item>
      ))}
      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Space>
          <Button icon={<CloseOutlined />} onClick={() => { setEditMode(false); if (profile) form.setFieldsValue(profile); }}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}
            style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
            Save Profile
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default PackagingProfile;
