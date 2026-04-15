/**
 * CreateJobModal — Creates a new job in the flow engine.
 * Calls POST /api/mes/flow/jobs
 */

import React, { useState } from 'react';
import { App, Modal, Form, Input, Select, Divider, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const DIVISIONS = [
  { value: 'FP', label: 'Flexible Packaging (FP)' },
  { value: 'LB', label: 'Labels (LB)' },
  { value: 'GN', label: 'General (GN)' },
];

export default function CreateJobModal({ open, onClose, onCreated, inquiryData }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Pre-fill from inquiry if available
  React.useEffect(() => {
    if (inquiryData && open) {
      form.setFieldsValue({
        customer_name: inquiryData.customer_name || inquiryData.company_name || '',
        customer_country: inquiryData.customer_country || inquiryData.country || '',
        division: inquiryData.division || 'FP',
        inquiry_ref: inquiryData.inquiry_id ? `INQ-${inquiryData.inquiry_id}` : '',
      });
    }
  }, [inquiryData, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(`${API_BASE}/api/mes/flow/jobs`, values, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        message.success(`Job ${res.data.data.job_number} created!`);
        form.resetFields();
        onCreated?.(res.data.data);
        onClose();
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<><PlusOutlined /> Create New Job</>}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="Create Job"
      destroyOnHidden
      width={500}
    >
      <Form form={form} layout="vertical" initialValues={{ division: 'FP', priority: 'normal' }}>
        <Form.Item name="customer_name" label="Customer Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Customer / Company name" />
        </Form.Item>

        <Form.Item name="customer_country" label="Country">
          <Input placeholder="e.g. UAE, Saudi, India" />
        </Form.Item>

        <Form.Item name="division" label="Division" rules={[{ required: true }]}>
          <Select>
            {DIVISIONS.map(d => <Option key={d.value} value={d.value}>{d.label}</Option>)}
          </Select>
        </Form.Item>

        <Form.Item name="priority" label="Priority">
          <Select>
            <Option value="low">Low</Option>
            <Option value="normal">Normal</Option>
            <Option value="high">High</Option>
          </Select>
        </Form.Item>

        <Divider />

        <Form.Item name="inquiry_ref" label="Inquiry Reference">
          <Input placeholder="INQ-123 (optional link to inquiry)" />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <TextArea rows={3} placeholder="Initial notes or description" />
        </Form.Item>
      </Form>

      <Text type="secondary" style={{ fontSize: 12 }}>
        A job number will be generated automatically (e.g. JOB-FP-2026-00001).
        The job starts at Phase 1 (Customer Inquiry) assigned to Sales.
      </Text>
    </Modal>
  );
}
