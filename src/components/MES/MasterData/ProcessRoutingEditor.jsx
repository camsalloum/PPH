/**
 * ProcessRoutingEditor — Drag-to-reorder process chain per product group
 * Sub-tab 2 of BOMConfigurator
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Select, InputNumber, Switch, Input, Space,
  Tag, Popconfirm, message, Row, Col, Typography, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';
const { Text } = Typography;

export default function ProcessRoutingEditor({
  productGroupId, bomVersionId, routing, setRouting, onRefresh,
}) {
  const { user } = useAuth();
  const token = user?.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const [processes, setProcesses] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineMap, setMachineMap] = useState({}); // processId → machine[]
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [form] = Form.useForm();

  // Load processes + machines
  useEffect(() => {
    (async () => {
      try {
        const [procRes, machRes] = await Promise.all([
          axios.get(`${API_BASE}/api/mes/master-data/processes`, authHeaders),
          axios.get(`${API_BASE}/api/mes/master-data/machines`, authHeaders),
        ]);
        setProcesses(procRes.data.data || []);
        setMachines(machRes.data.data || []);

        // Build process→machine[] map from machine assignments
        const map = {};
        for (const proc of (procRes.data.data || [])) {
          if (proc.assigned_machines) {
            map[proc.id] = proc.assigned_machines;
          }
        }
        setMachineMap(map);
      } catch { /* ignore */ }
    })();
  }, [token]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingStep) {
        await axios.put(`${API_BASE}/api/mes/master-data/routing/${editingStep.id}`, values, authHeaders);
        message.success('Step updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/master-data/routing`, {
          ...values,
          product_group_id: productGroupId,
          bom_version_id: bomVersionId || null,
        }, authHeaders);
        message.success('Step added');
      }
      setModalOpen(false);
      setEditingStep(null);
      form.resetFields();
      onRefresh();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/mes/master-data/routing/${id}`, authHeaders);
      message.success('Step removed');
      onRefresh();
    } catch {
      message.error('Delete failed');
    }
  };

  const moveStep = async (index, direction) => {
    const sorted = [...routing].sort((a, b) => a.sequence_order - b.sequence_order);
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap sequence orders
    const a = sorted[index];
    const b = sorted[targetIdx];
    try {
      await Promise.all([
        axios.put(`${API_BASE}/api/mes/master-data/routing/${a.id}`, { sequence_order: b.sequence_order }, authHeaders),
        axios.put(`${API_BASE}/api/mes/master-data/routing/${b.id}`, { sequence_order: a.sequence_order }, authHeaders),
      ]);
      onRefresh();
    } catch {
      message.error('Reorder failed');
    }
  };

  const openEdit = (record) => {
    setEditingStep(record);
    form.setFieldsValue({
      process_id: record.process_id,
      machine_id: record.machine_id,
      sequence_order: record.sequence_order,
      estimated_speed: record.estimated_speed,
      setup_time_min: record.setup_time_min,
      waste_pct: record.waste_pct,
      hourly_rate_override: record.hourly_rate_override,
      is_optional: record.is_optional,
      notes: record.notes,
    });
    setModalOpen(true);
  };

  const sortedRouting = [...routing].sort((a, b) => a.sequence_order - b.sequence_order);

  const columns = [
    { title: 'Seq', dataIndex: 'sequence_order', key: 'seq', width: 60 },
    { title: 'Process', key: 'proc', render: (_, r) => <Tag color="blue">{r.process_name || r.process_code}</Tag> },
    { title: 'Machine', key: 'mach', render: (_, r) => r.machine_name || <Text type="secondary">Any</Text> },
    { title: 'Speed', key: 'speed', width: 100, render: (_, r) => r.estimated_speed ? `${r.estimated_speed} ${r.speed_unit || ''}` : <Text type="secondary">{r.default_speed} (default)</Text> },
    { title: 'Setup (min)', key: 'setup', width: 90, render: (_, r) => r.setup_time_min || r.process_setup_min || '—' },
    { title: 'Rate', key: 'rate', width: 90, render: (_, r) => r.hourly_rate_override ? `$${r.hourly_rate_override}/hr` : <Text type="secondary">${r.hourly_rate}/hr</Text> },
    { title: 'Optional', dataIndex: 'is_optional', key: 'opt', width: 70, render: v => v ? <Tag color="gold">Opt</Tag> : null },
    {
      title: '', key: 'actions', width: 120,
      render: (_, record, index) => (
        <Space size={2}>
          <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveStep(index, -1)} />
          <Button size="small" icon={<ArrowDownOutlined />} disabled={index === sortedRouting.length - 1} onClick={() => moveStep(index, 1)} />
          <Button size="small" onClick={() => openEdit(record)}>Edit</Button>
          <Popconfirm title="Remove step?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const watchProcessId = Form.useWatch('process_id', form);

  // Get available machines for selected process
  const availableMachines = (() => {
    if (!watchProcessId) return machines;
    const mapEntry = machineMap[watchProcessId];
    if (mapEntry && mapEntry.length) return machines.filter(m => mapEntry.includes(m.id));
    // Fallback: filter by process department
    const proc = processes.find(p => p.id === watchProcessId);
    if (proc) return machines.filter(m => m.department === proc.department);
    return machines;
  })();

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Process Routing ({routing.length} steps)</Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
          setEditingStep(null);
          form.resetFields();
          form.setFieldsValue({ sequence_order: (sortedRouting.length + 1) * 10 });
          setModalOpen(true);
        }}>Add Step</Button>
      </div>

      {routing.length === 0 ? (
        <Empty description="No routing steps defined" />
      ) : (
        <Table
          dataSource={sortedRouting}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )}

      <Modal
        title={editingStep ? 'Edit Routing Step' : 'Add Routing Step'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingStep(null); form.resetFields(); }}
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="process_id" label="Process" rules={[{ required: true }]}>
                <Select
                  showSearch optionFilterProp="label"
                  options={processes.map(p => ({ value: p.id, label: `${p.process_code} — ${p.process_name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="machine_id" label="Machine (optional)">
                <Select
                  showSearch allowClear optionFilterProp="label"
                  placeholder="Any available"
                  options={availableMachines.map(m => ({ value: m.id, label: `${m.machine_code} — ${m.machine_name}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="sequence_order" label="Sequence" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="estimated_speed" label="Speed Override">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="setup_time_min" label="Setup (min)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="hourly_rate_override" label="Rate $/hr">
                <InputNumber min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="waste_pct" label="Waste %">
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_optional" label="Optional" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notes" label="Notes">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
