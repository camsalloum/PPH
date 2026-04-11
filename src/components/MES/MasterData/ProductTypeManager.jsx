/**
 * ProductTypeManager — CRUD table for mes_product_types
 * Features: category filter, dimension field config, calculation_basis (B6).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space,
  Popconfirm, message, Tooltip, Row, Col, Switch, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';
const { Text } = Typography;

const CATEGORIES = [
  { value: 'bag',    label: 'Bag' },
  { value: 'roll',   label: 'Roll' },
  { value: 'sleeve', label: 'Sleeve' },
];

const CALC_BASIS = [
  { value: 'KG',  label: 'KG — Mass-based' },
  { value: 'M2',  label: 'M² — Area-based' },
  { value: 'PCS', label: 'PCS — Piece-based' },
];

export default function ProductTypeManager() {
  const { user } = useAuth();
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [filters, setFilters] = useState({ category: null });
  const [form] = Form.useForm();

  const token = user?.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      const res = await axios.get(`${API_BASE}/api/mes/master-data/product-types?${params}`, authHeaders);
      setProductTypes(res.data.data || []);
    } catch {
      message.error('Failed to load product types');
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingType) {
        await axios.put(`${API_BASE}/api/mes/master-data/product-types/${editingType.id}`, values, authHeaders);
        message.success('Product type updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/master-data/product-types`, values, authHeaders);
        message.success('Product type created');
      }
      setModalOpen(false);
      setEditingType(null);
      form.resetFields();
      fetchTypes();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/mes/master-data/product-types/${id}`, authHeaders);
      message.success('Product type deactivated');
      fetchTypes();
    } catch {
      message.error('Delete failed');
    }
  };

  const openEdit = (record) => {
    setEditingType(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingType(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    { title: 'Code', dataIndex: 'type_code', key: 'code', width: 140 },
    { title: 'Name', dataIndex: 'type_name', key: 'name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'cat', width: 100, render: v => <Tag>{v}</Tag> },
    { title: 'Waste %', dataIndex: 'waste_factor_pct', key: 'waste', width: 90, render: v => `${v}%` },
    {
      title: 'Basis', dataIndex: 'calculation_basis', key: 'basis', width: 80,
      render: v => <Tag color={v === 'PCS' ? 'blue' : v === 'KG' ? 'green' : 'purple'}>{v}</Tag>,
    },
    { title: 'Gusset', dataIndex: 'has_gusset', key: 'gusset', width: 80, render: v => v ? '✓' : '—' },
    { title: 'Handle', dataIndex: 'has_handle', key: 'handle', width: 80, render: v => v ? '✓' : '—' },
    { title: 'Bottom Seal', dataIndex: 'has_bottom_seal', key: 'bseal', width: 100, render: v => v ? '✓' : '—' },
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

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Category"
          allowClear
          style={{ width: 160 }}
          options={CATEGORIES}
          value={filters.category}
          onChange={v => setFilters(f => ({ ...f, category: v }))}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchTypes}>Refresh</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Product Type</Button>
      </Space>

      <Table
        dataSource={productTypes}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 900 }}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editingType ? `Edit ${editingType.type_code}` : 'Add Product Type'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingType(null); form.resetFields(); }}
        width={660}
        okText={editingType ? 'Update' : 'Create'}
          destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="type_code" label="Type Code" rules={[{ required: true }]}>
                <Input disabled={!!editingType} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="type_name" label="Type Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select options={CATEGORIES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="calculation_basis" label="Calculation Basis" initialValue="KG">
                <Select options={CALC_BASIS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="waste_factor_pct" label="Waste Factor %" initialValue={3}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="calc_formula_key" label="Calc Formula Key" rules={[{ required: true }]}>
                <Input placeholder="e.g. flat, side_gusset" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="layflat_formula_key" label="Layflat Formula Key" rules={[{ required: true }]}>
                <Input placeholder="e.g. flat, roll" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="handle_allowance_factor" label="Handle Factor">
                <InputNumber min={1} max={2} step={0.01} style={{ width: '100%' }} placeholder="e.g. 1.12" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="has_gusset" label="Has Gusset" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="has_handle" label="Has Handle" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="has_bottom_seal" label="Has Bottom Seal" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
