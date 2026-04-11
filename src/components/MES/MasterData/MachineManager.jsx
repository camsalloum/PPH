/**
 * MachineManager — CRUD table for mes_machines
 * Features: department/status filters, expandable technical_specs,
 * edit modal with tabs (General, Capacity, Costing, Performance, Technical).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tabs, Tag, Space,
  Popconfirm, message, Tooltip, Row, Col, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';
const { Text } = Typography;

const DEPARTMENTS = [
  { value: 'extrusion',  label: 'Extrusion' },
  { value: 'printing',   label: 'Printing' },
  { value: 'lamination', label: 'Lamination' },
  { value: 'slitting',   label: 'Slitting' },
  { value: 'seaming',    label: 'Seaming' },
  { value: 'doctoring',  label: 'Doctoring' },
  { value: 'bag_making', label: 'Bag Making' },
  { value: 'coating',    label: 'Coating' },
];

const SPEED_UNITS = [
  { value: 'm_min',   label: 'Mtr/Min' },
  { value: 'pcs_min', label: 'Pcs/Min' },
  { value: 'kg_hr',   label: 'Kgs/Hr' },
];

const MACHINE_TYPES = [
  { value: 'BLOWN_FILM',      label: 'Blown Film' },
  { value: 'CAST_FILM',       label: 'Cast Film' },
  { value: 'FLEXO',           label: 'Flexo' },
  { value: 'GRAVURE',         label: 'Gravure' },
  { value: 'SOLVENTLESS_LAM', label: 'Solventless Lam' },
  { value: 'DRY_LAM',         label: 'Dry Lam' },
  { value: 'SLITTER',         label: 'Slitter' },
  { value: 'SEALER',          label: 'Sealer' },
  { value: 'DOCTOR',          label: 'Doctor' },
  { value: 'BAG_MAKER_SIDE',  label: 'Bag Maker Side' },
  { value: 'BAG_MAKER_BOTTOM',label: 'Bag Maker Bottom' },
];

const STATUS_OPTIONS = [
  { value: 'operational',    label: 'Operational', color: 'green' },
  { value: 'maintenance',    label: 'Maintenance', color: 'orange' },
  { value: 'decommissioned', label: 'Decommissioned', color: 'red' },
];

export default function MachineManager() {
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [filters, setFilters] = useState({ department: null, status: null, search: '' });
  const [form] = Form.useForm();

  const token = user?.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.department) params.append('department', filters.department);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      const res = await axios.get(`${API_BASE}/api/mes/master-data/machines?${params}`, authHeaders);
      setMachines(res.data.data || []);
    } catch {
      message.error('Failed to load machines');
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingMachine) {
        await axios.put(`${API_BASE}/api/mes/master-data/machines/${editingMachine.id}`, values, authHeaders);
        message.success('Machine updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/master-data/machines`, values, authHeaders);
        message.success('Machine created');
      }
      setModalOpen(false);
      setEditingMachine(null);
      form.resetFields();
        destroyOnHidden
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/mes/master-data/machines/${id}`, authHeaders);
      message.success('Machine deactivated');
      fetchMachines();
    } catch {
      message.error('Delete failed');
    }
  };

  const openEdit = (record) => {
    setEditingMachine(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingMachine(null);
    form.resetFields();
    setModalOpen(true);
  };

  // Compute effective speed for Performance tab display
  const effPct = Form.useWatch('efficiency_pct', form);
  const avPct = Form.useWatch('availability_pct', form);
  const qPct = Form.useWatch('quality_pct', form);
  const stdSpeed = Form.useWatch('standard_speed', form);
  const effectiveSpeed = stdSpeed && effPct && avPct && qPct
    ? (stdSpeed * (effPct / 100) * (avPct / 100) * (qPct / 100)).toFixed(2)
    : '—';

  const columns = [
    { title: 'Code', dataIndex: 'machine_code', key: 'code', width: 110, sorter: (a, b) => a.machine_code.localeCompare(b.machine_code) },
    { title: 'Name', dataIndex: 'machine_name', key: 'name', ellipsis: true },
    {
      title: 'Department', dataIndex: 'department', key: 'dept', width: 120,
      render: v => <Tag>{v}</Tag>,
    },
    { title: 'Type', dataIndex: 'machine_type', key: 'type', width: 140 },
    { title: 'Speed', key: 'speed', width: 120, render: (_, r) => `${r.standard_speed ?? 0} ${r.speed_unit}` },
    { title: 'Rate/hr', dataIndex: 'hourly_rate', key: 'rate', width: 90, render: v => `$${Number(v).toFixed(0)}` },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: v => {
        const opt = STATUS_OPTIONS.find(o => o.value === v);
        return <Tag color={opt?.color}>{opt?.label || v}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 100, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit"><Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} /></Tooltip>
          <Popconfirm title="Deactivate?" onConfirm={() => handleDelete(record.id)} okText="Yes">
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record) => {
    const specs = record.technical_specs || {};
    const specEntries = Object.entries(specs);
    return (
      <Row gutter={16} style={{ padding: '8px 0' }}>
        <Col span={4}><Text type="secondary">Manufacturer:</Text> {record.manufacturer || '—'}</Col>
        <Col span={4}><Text type="secondary">Model:</Text> {record.model || '—'}</Col>
        <Col span={4}><Text type="secondary">Year:</Text> {record.year_installed || '—'}</Col>
        <Col span={4}><Text type="secondary">OEE:</Text> {Number(record.efficiency_pct || 80)}×{Number(record.availability_pct || 90)}×{Number(record.quality_pct || 98)}%</Col>
        {specEntries.length > 0 && (
          <Col span={8}><Text type="secondary">Specs:</Text> {specEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}</Col>
        )}
      </Row>
    );
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Department"
          allowClear
          style={{ width: 160 }}
          options={DEPARTMENTS}
          value={filters.department}
          onChange={v => setFilters(f => ({ ...f, department: v }))}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 160 }}
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={v => setFilters(f => ({ ...f, status: v }))}
        />
        <Input.Search
          placeholder="Search..."
          style={{ width: 200 }}
          allowClear
          onSearch={v => setFilters(f => ({ ...f, search: v }))}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchMachines}>Refresh</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Machine</Button>
      </Space>

      <Table
        dataSource={machines}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1000 }}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (t) => `${t} machines` }}
      />

      <Modal
        title={editingMachine ? `Edit ${editingMachine.machine_code}` : 'Add Machine'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingMachine(null); form.resetFields(); }}
        width={720}
        okText={editingMachine ? 'Update' : 'Create'}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Tabs items={[
            {
              key: 'general',
              label: 'General',
              children: (
                <>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="machine_code" label="Machine Code" rules={[{ required: true }]}>
                        <Input disabled={!!editingMachine} />
                      </Form.Item>
                    </Col>
                    <Col span={16}>
                      <Form.Item name="machine_name" label="Machine Name" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="department" label="Department" rules={[{ required: true }]}>
                        <Select options={DEPARTMENTS} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="machine_type" label="Machine Type">
                        <Select options={MACHINE_TYPES} allowClear />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="status" label="Status" initialValue="operational">
                        <Select options={STATUS_OPTIONS} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="manufacturer" label="Manufacturer">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="model" label="Model">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="year_installed" label="Year Installed">
                        <InputNumber min={1950} max={2030} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'capacity',
              label: 'Capacity',
              children: (
                <>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="speed_unit" label="Speed Unit" rules={[{ required: true }]}>
                        <Select options={SPEED_UNITS} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="standard_speed" label="Standard Speed">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="max_speed" label="Max Speed">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item name="max_web_width_mm" label="Max Width (mm)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="min_web_width_mm" label="Min Width (mm)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="number_of_colors" label="# Colors">
                        <InputNumber min={0} max={12} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="number_of_layers" label="# Layers">
                        <InputNumber min={0} max={9} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item name="shifts_per_day" label="Shifts/Day" initialValue={3}>
                        <InputNumber min={1} max={4} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="hours_per_shift" label="Hours/Shift" initialValue={8}>
                        <InputNumber min={1} max={12} step={0.5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="sealing_type" label="Sealing Type">
                        <Select allowClear options={[{ value: 'side' }, { value: 'bottom' }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'costing',
              label: 'Costing',
              children: (
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item name="hourly_rate" label="Hourly Rate ($)" initialValue={100}>
                      <InputNumber min={0} step={5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="setup_cost" label="Setup Cost ($)" initialValue={0}>
                      <InputNumber min={0} step={5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="setup_waste_pct" label="Setup Waste %" initialValue={3}>
                      <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="running_waste_pct" label="Running Waste %" initialValue={2}>
                      <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'performance',
              label: 'Performance',
              children: (
                <>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="efficiency_pct" label="Efficiency %" initialValue={80}>
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="availability_pct" label="Availability %" initialValue={90}>
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="quality_pct" label="Quality %" initialValue={98}>
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row>
                    <Col span={12}>
                      <Text type="secondary">Effective Speed: </Text>
                      <Text strong>{effectiveSpeed} {form.getFieldValue('speed_unit') || ''}</Text>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'specs',
              label: 'Technical Specs',
              children: (
                <Form.Item name="cost_centre_code" label="Cost Centre Code">
                  <Input placeholder="e.g. CC-EXT-001" />
                </Form.Item>
              ),
            },
          ]} />
        </Form>
      </Modal>
    </div>
  );
}
