/**
 * JobCardForm — Create/edit job card with BOM table
 */
import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Button, Table, Space, App } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function JobCardForm({ inquiry, jobCard, onSuccess }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const rowIdRef = React.useRef(0);

  const withRowIds = (rows = []) => rows.map((row) => {
    if (row?._rowId) return row;
    rowIdRef.current += 1;
    return { ...row, _rowId: `bom-${rowIdRef.current}` };
  });

  const [bomRows, setBomRows] = useState(() => withRowIds(jobCard?.material_requirements || []));

  useEffect(() => {
    if (jobCard) {
      form.setFieldsValue({
        quantity: jobCard.quantity,
        quantity_unit: jobCard.quantity_unit || 'kg',
        required_delivery_date: jobCard.required_delivery_date ? dayjs(jobCard.required_delivery_date) : null,
      });
      setBomRows(withRowIds(jobCard.material_requirements || []));
    }
  }, [jobCard]);

  const addBomRow = () => {
    rowIdRef.current += 1;
    setBomRows(prev => [...prev, { _rowId: `bom-${rowIdRef.current}`, material_name: '', qty_required: 0, qty_available: 0, status: 'pending' }]);
  };

  const removeBomRow = (rowId) => setBomRows(prev => prev.filter((r) => r._rowId !== rowId));

  const updateBomRow = (rowId, field, value) => {
    setBomRows(prev => prev.map((r) => r._rowId === rowId ? { ...r, [field]: value } : r));
  };

  const bomColumns = [
    { title: 'Material', dataIndex: 'material_name', render: (_, r) => (
      <Input value={r.material_name} onChange={e => updateBomRow(r._rowId, 'material_name', e.target.value)} placeholder="Material name" />
    )},
    { title: 'Qty Required', dataIndex: 'qty_required', width: 120, render: (_, r) => (
      <InputNumber value={r.qty_required} onChange={v => updateBomRow(r._rowId, 'qty_required', v)} min={0} style={{ width: '100%' }} />
    )},
    { title: 'Qty Available', dataIndex: 'qty_available', width: 120, render: (_, r) => (
      <InputNumber value={r.qty_available} onChange={v => updateBomRow(r._rowId, 'qty_available', v)} min={0} style={{ width: '100%' }} />
    )},
    { title: 'Status', dataIndex: 'status', width: 100, render: (_, r) => (
      r.qty_available >= r.qty_required ? 'Available' : 'Not Available'
    )},
    { title: '', width: 50, render: (_, r) => (
      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeBomRow(r._rowId)} />
    )},
  ];

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const payload = {
        inquiry_id: inquiry.id,
        product_specs: jobCard?.product_specs || null,
        quantity: values.quantity,
        quantity_unit: values.quantity_unit,
        required_delivery_date: values.required_delivery_date?.format('YYYY-MM-DD'),
        material_requirements: bomRows.map(({ _rowId, ...rest }) => rest),
      };

      if (jobCard?.id) {
        await axios.patch(`${API_BASE}/api/mes/presales/job-cards/${jobCard.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        message.success('Job card updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/presales/job-cards`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        message.success('Job card created');
      }
      onSuccess?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save job card');
    } finally { setLoading(false); }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item label="Customer">{inquiry?.customer_name || '—'}</Form.Item>
      <Form.Item label="Inquiry">{inquiry?.inquiry_number || '—'}</Form.Item>
      {jobCard?.job_number && <Form.Item label="Job Number">{jobCard.job_number}</Form.Item>}
      <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="quantity_unit" label="Unit" initialValue="kg">
        <Select options={[{ value: 'kg' }, { value: 'pcs' }, { value: 'rolls' }, { value: 'sqm' }]} />
      </Form.Item>
      <Form.Item name="required_delivery_date" label="Required Delivery Date">
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      <div style={{ marginBottom: 8, fontWeight: 600 }}>Bill of Materials</div>
      <Table dataSource={bomRows} columns={bomColumns} pagination={false} size="small"
        rowKey={(r) => r._rowId} style={{ marginBottom: 16 }} />
      <Button type="dashed" icon={<PlusOutlined />} onClick={addBomRow} block style={{ marginBottom: 16 }}>
        Add Material Row
      </Button>

      <Button type="primary" htmlType="submit" loading={loading}>
        {jobCard?.id ? 'Update Job Card' : 'Create Job Card'}
      </Button>
    </Form>
  );
}
