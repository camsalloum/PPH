/**
 * EquipmentAdminModal — G-008 Admin UI
 *
 * Allows QC managers / admins to manage the lab equipment registry.
 * Add, edit, deactivate equipment; view calibration due dates.
 *
 * Props:
 *   open    — boolean
 *   onClose — () => void
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  Badge, Button, DatePicker, Form, Input, Modal,
  Popconfirm, Select, Space, Table, Tag, Typography, message as antdMsg,
} from 'antd';
import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const CATEGORIES = [
  { value: 'tensile',    label: 'Tensile' },
  { value: 'thickness',  label: 'Thickness' },
  { value: 'optical',    label: 'Optical' },
  { value: 'seal',       label: 'Seal' },
  { value: 'chemical',   label: 'Chemical' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'weight',     label: 'Weight' },
  { value: 'general',    label: 'General' },
];

const CAL_COLORS = {
  ok: 'green',
  warning: 'orange',
  overdue: 'red',
  none: 'default',
};

function calStatus(due) {
  if (!due) return 'none';
  const diff = dayjs(due).diff(dayjs(), 'day');
  if (diff < 0)   return 'overdue';
  if (diff <= 30) return 'warning';
  return 'ok';
}

export default function EquipmentAdminModal({ open, onClose }) {
  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/qc/equipment?all=true`, { headers });
      setEquipment(res.data?.data || []);
    } catch {
      antdMsg.error('Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const openNew = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ category: 'general', is_active: true });
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    form.setFieldsValue({
      ...row,
      calibration_due: row.calibration_due ? dayjs(row.calibration_due) : null,
      calibrated_at:   row.calibrated_at   ? dayjs(row.calibrated_at)   : null,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const payload = {
        ...values,
        calibration_due: values.calibration_due ? values.calibration_due.format('YYYY-MM-DD') : null,
        calibrated_at:   values.calibrated_at   ? values.calibrated_at.format('YYYY-MM-DD')   : null,
      };
      if (editingId) {
        await axios.patch(`${API_BASE}/api/mes/presales/qc/equipment/${editingId}`, payload, { headers });
        antdMsg.success('Equipment updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/presales/qc/equipment`, payload, { headers });
        antdMsg.success('Equipment added');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      antdMsg.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (row) => {
    try {
      await axios.patch(`${API_BASE}/api/mes/presales/qc/equipment/${row.id}`, { is_active: !row.is_active }, { headers });
      load();
    } catch {
      antdMsg.error('Failed to update equipment status');
    }
  };

  const columns = [
    { title: 'Code', dataIndex: 'equipment_code', width: 90,
      render: (v) => <Text code style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Name', dataIndex: 'name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', width: 110,
      render: (v) => <Tag>{v}</Tag> },
    { title: 'Calibration Due', dataIndex: 'calibration_due', width: 140,
      render: (v) => v ? (
        <Tag color={CAL_COLORS[calStatus(v)]}>
          {dayjs(v).format('DD MMM YYYY')}
          {calStatus(v) === 'overdue' ? ' ⚠' : ''}
        </Tag>
      ) : <Text type="secondary">—</Text>
    },
    { title: 'Status', dataIndex: 'is_active', width: 90,
      render: (v) => <Badge status={v ? 'success' : 'default'} text={v ? 'Active' : 'Inactive'} /> },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => openEdit(row)}>Edit</Button>
          <Popconfirm
            title={row.is_active ? 'Deactivate this equipment?' : 'Reactivate this equipment?'}
            onConfirm={() => handleToggle(row)}
            okText="Yes"
          >
            <Button size="small" danger={row.is_active}>{row.is_active ? 'Deactivate' : 'Activate'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={<Space><ToolOutlined />Lab Equipment Registry</Space>}
        open={open}
        onCancel={onClose}
        width={860}
        footer={[
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openNew}>Add Equipment</Button>,
          <Button key="close" onClick={onClose}>Close</Button>,
        ]}
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={equipment}
          columns={columns}
          pagination={{ pageSize: 15, showSizeChanger: false }}
        />
      </Modal>

      {/* Add / Edit form */}
      <Modal
        title={editingId ? 'Edit Equipment' : 'Add New Equipment'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Save"
        width={540}
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="Equipment Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Tensile Strength Tester" />
          </Form.Item>
          <Form.Item name="equipment_code" label="Equipment Code">
            <Input placeholder="e.g. EQ-TST-001" />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Select options={CATEGORIES} />
          </Form.Item>
          <Form.Item name="manufacturer" label="Manufacturer">
            <Input />
          </Form.Item>
          <Form.Item name="model_number" label="Model Number">
            <Input />
          </Form.Item>
          <Form.Item name="serial_number" label="Serial Number">
            <Input />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input placeholder="e.g. QC Lab Room 2" />
          </Form.Item>
          <Form.Item name="calibrated_at" label="Last Calibration Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="calibration_due" label="Next Calibration Due">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
