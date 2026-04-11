/**
 * ProcessManager — CRUD table for mes_processes
 * Features: expandable machine assignment grid, waste sub-section,
 * effective total waste derived field (B5).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space,
  Popconfirm, message, Tooltip, Row, Col, Typography, Checkbox, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
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

function calcEffectiveWaste(startupPct, edgeTrimPct, conversionPct, defaultPct) {
  const s = 1 - (startupPct || 0) / 100;
  const e = 1 - (edgeTrimPct || 0) / 100;
  const c = 1 - (conversionPct || 0) / 100;
  const d = 1 - (defaultPct || 0) / 100;
  return ((1 - s * e * c * d) * 100).toFixed(2);
}

export default function ProcessManager() {
  const { user } = useAuth();
  const [processes, setProcesses] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const [machineProcessId, setMachineProcessId] = useState(null);
  const [machineAssignments, setMachineAssignments] = useState([]);
  const [filters, setFilters] = useState({ department: null, search: '' });
  const [form] = Form.useForm();

  const token = user?.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchProcesses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.department) params.append('department', filters.department);
      if (filters.search) params.append('search', filters.search);
      const res = await axios.get(`${API_BASE}/api/mes/master-data/processes?${params}`, authHeaders);
      setProcesses(res.data.data || []);
    } catch {
      message.error('Failed to load processes');
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  const fetchMachines = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/mes/master-data/machines`, authHeaders);
      setAllMachines(res.data.data || []);
    } catch {
      // Machines may not be loaded yet
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingProcess) {
        await axios.put(`${API_BASE}/api/mes/master-data/processes/${editingProcess.id}`, values, authHeaders);
        message.success('Process updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/master-data/processes`, values, authHeaders);
        message.success('Process created');
      }
      setModalOpen(false);
      setEditingProcess(null);
      form.resetFields();
      fetchProcesses();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/mes/master-data/processes/${id}`, authHeaders);
      message.success('Process deactivated');
      fetchProcesses();
    } catch {
      message.error('Delete failed');
    }
  };

  const openEdit = (record) => {
    setEditingProcess(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingProcess(null);
    form.resetFields();
    setModalOpen(true);
  };

  // Machine assignment modal
  const openMachineAssign = async (process) => {
    setMachineProcessId(process.id);
    await fetchMachines();
    try {
      const res = await axios.get(`${API_BASE}/api/mes/master-data/processes/${process.id}`, authHeaders);
      const existing = (res.data.data.machines || []).map(m => ({
        machine_id: m.machine_id,
        is_default: m.is_default,
        effective_speed: m.effective_speed,
      }));
      setMachineAssignments(existing);
    } catch {
      setMachineAssignments([]);
    }
    setMachineModalOpen(true);
  };

  const saveMachineAssignments = async () => {
    try {
      await axios.put(
        `${API_BASE}/api/mes/master-data/processes/${machineProcessId}/machines`,
        { machines: machineAssignments },
        authHeaders
      );
      message.success('Machine assignments saved');
      setMachineModalOpen(false);
      fetchProcesses();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const toggleMachine = (machineId, checked) => {
    if (checked) {
      const machine = allMachines.find(m => m.id === machineId);
      setMachineAssignments(prev => [...prev, {
        machine_id: machineId,
        is_default: false,
        effective_speed: machine?.standard_speed || null,
      }]);
    } else {
      setMachineAssignments(prev => prev.filter(a => a.machine_id !== machineId));
    }
  };

  const setDefault = (machineId) => {
    setMachineAssignments(prev => prev.map(a => ({ ...a, is_default: a.machine_id === machineId })));
  };

  // Waste calculation for display
  const startupW = Form.useWatch('startup_waste_pct', form);
  const edgeW = Form.useWatch('edge_trim_pct', form);
  const convW = Form.useWatch('conversion_waste_pct', form);
  const defW = Form.useWatch('default_waste_pct', form);
  const effectiveWaste = calcEffectiveWaste(startupW, edgeW, convW, defW);

  const columns = [
    { title: 'Seq', dataIndex: 'sequence_order', key: 'seq', width: 60 },
    { title: 'Code', dataIndex: 'process_code', key: 'code', width: 130 },
    { title: 'Name', dataIndex: 'process_name', key: 'name', ellipsis: true },
    { title: 'Department', dataIndex: 'department', key: 'dept', width: 120, render: v => <Tag>{v}</Tag> },
    { title: 'Speed Unit', dataIndex: 'speed_unit', key: 'su', width: 100 },
    { title: 'Default Speed', dataIndex: 'default_speed', key: 'speed', width: 110 },
    { title: 'Rate/hr', dataIndex: 'hourly_rate', key: 'rate', width: 90, render: v => `$${Number(v).toFixed(0)}` },
    { title: 'Machines', dataIndex: 'machine_count', key: 'mc', width: 90, render: v => <Tag color="blue">{v}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit"><Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} /></Tooltip>
          <Tooltip title="Machines"><Button size="small" onClick={() => openMachineAssign(record)}>🔧</Button></Tooltip>
          <Popconfirm title="Deactivate?" onConfirm={() => handleDelete(record.id)} okText="Yes">
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
        <Input.Search
          placeholder="Search..."
          style={{ width: 200 }}
          allowClear
          onSearch={v => setFilters(f => ({ ...f, search: v }))}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchProcesses}>Refresh</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Process</Button>
      </Space>

      <Table
        dataSource={processes}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 15 }}
      />

      {/* Create / Edit Modal */}
      <Modal
        title={editingProcess ? `Edit ${editingProcess.process_code}` : 'Add Process'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingProcess(null); form.resetFields(); }}
        width={660}
        okText={editingProcess ? 'Update' : 'Create'}
         destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="process_code" label="Process Code" rules={[{ required: true }]}>
                <Input disabled={!!editingProcess} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="process_name" label="Process Name" rules={[{ required: true }]}>
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
              <Form.Item name="speed_unit" label="Speed Unit" rules={[{ required: true }]}>
                <Select options={SPEED_UNITS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sequence_order" label="Sequence" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="default_speed" label="Default Speed">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hourly_rate" label="Hourly Rate ($)" initialValue={100}>
                <InputNumber min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="default_setup_time_min" label="Setup Time (min)" initialValue={30}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>Waste Model (B5)</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="default_waste_pct" label="Base Waste %" initialValue={3}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="startup_waste_pct" label="Startup %" initialValue={0}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="edge_trim_pct" label="Edge Trim %" initialValue={0}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="conversion_waste_pct" label="Conversion %" initialValue={0}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row>
            <Col>
              <Text type="secondary">Effective Total Waste: </Text>
              <Text strong>{effectiveWaste}%</Text>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Machine Assignment Modal */}
      <Modal
        title="Machine Assignments"
        open={machineModalOpen}
        onOk={saveMachineAssignments}
        onCancel={() => setMachineModalOpen(false)}
        width={600}
        okText="Save"
      >
        <Table
          dataSource={allMachines}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          columns={[
            { title: 'Code', dataIndex: 'machine_code', width: 100 },
            { title: 'Name', dataIndex: 'machine_name' },
            { title: 'Dept', dataIndex: 'department', width: 100 },
            {
              title: 'Assigned', key: 'assigned', width: 80,
              render: (_, m) => (
                <Checkbox
                  checked={machineAssignments.some(a => a.machine_id === m.id)}
                  onChange={e => toggleMachine(m.id, e.target.checked)}
                />
              ),
            },
            {
              title: 'Default', key: 'default', width: 80,
              render: (_, m) => {
                const assigned = machineAssignments.find(a => a.machine_id === m.id);
                if (!assigned) return null;
                return (
                  <Checkbox
                    checked={assigned.is_default}
                    onChange={() => setDefault(m.id)}
                  />
                );
              },
            },
          ]}
        />
      </Modal>
    </div>
  );
}
