/**
 * MaterialSpecsAdmin — Admin UI for managing category mappings and parameter definitions.
 * Accessible from Material Specs page for admin/production_manager roles.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, Tag, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const ADMIN_ROLES = ['admin', 'production_manager'];

export default function MaterialSpecsAdmin({ visible, onClose }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('mapping');
  const [mappings, setMappings] = useState([]);
  const [paramDefs, setParamDefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form] = Form.useForm();

  const headers = { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, 'Content-Type': 'application/json' };
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/category-mapping'), { headers });
      const json = await res.json();
      if (json.success) setMappings(json.data || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  const fetchParamDefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions'), { headers });
      const json = await res.json();
      if (json.success) setParamDefs(json.data || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      fetchMappings();
      fetchParamDefs();
    }
  }, [visible, fetchMappings, fetchParamDefs]);

  const mappingColumns = [
    { title: 'Oracle Category', dataIndex: 'oracle_category', key: 'oracle_category', width: 180 },
    { title: 'Material Class', dataIndex: 'material_class', key: 'material_class', width: 150 },
    { title: 'Display Label', dataIndex: 'display_label', key: 'display_label', width: 150 },
    { title: 'Has Params', dataIndex: 'has_parameters', key: 'has_parameters', width: 100,
      render: (v) => v ? <Tag color="green">Yes</Tag> : <Tag color="default">No</Tag> },
    { title: 'Items', dataIndex: 'item_count', key: 'item_count', width: 80, align: 'right' },
    { title: 'Sort', dataIndex: 'sort_order', key: 'sort_order', width: 60, align: 'right' },
    { title: 'Active', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v) => v ? <Tag color="blue">Active</Tag> : <Tag color="red">Inactive</Tag> },
  ];

  const paramColumns = [
    { title: 'Class', dataIndex: 'material_class', key: 'material_class', width: 120 },
    { title: 'Profile', dataIndex: 'profile', key: 'profile', width: 120, render: (v) => v || '(base)' },
    { title: 'Field Key', dataIndex: 'field_key', key: 'field_key', width: 180 },
    { title: 'Label', dataIndex: 'label', key: 'label', width: 160 },
    { title: 'Type', dataIndex: 'field_type', key: 'field_type', width: 80 },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
    { title: 'Min', dataIndex: 'min_value', key: 'min_value', width: 70, align: 'right' },
    { title: 'Max', dataIndex: 'max_value', key: 'max_value', width: 70, align: 'right' },
    { title: 'Required', dataIndex: 'is_required', key: 'is_required', width: 80,
      render: (v) => v ? <Tag color="orange">Yes</Tag> : '-' },
    { title: 'Order', dataIndex: 'sort_order', key: 'sort_order', width: 60, align: 'right' },
  ];

  const uniqueClasses = [...new Set(paramDefs.map((d) => d.material_class))].sort();
  const [filterClass, setFilterClass] = useState('');
  const filteredParams = filterClass
    ? paramDefs.filter((d) => d.material_class === filterClass)
    : paramDefs;

  if (!isAdmin) return null;

  return (
    <Modal
      title={<span><SettingOutlined /> Material Specs Admin</span>}
      open={visible}
      onCancel={onClose}
      width={1100}
      footer={null}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type={activeTab === 'mapping' ? 'primary' : 'default'} onClick={() => setActiveTab('mapping')}>
            Category Mapping ({mappings.length})
          </Button>
          <Button type={activeTab === 'params' ? 'primary' : 'default'} onClick={() => setActiveTab('params')}>
            Parameter Definitions ({paramDefs.length})
          </Button>
        </Space>
      </div>

      {activeTab === 'mapping' && (
        <Table
          dataSource={mappings}
          columns={mappingColumns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 500 }}
        />
      )}

      {activeTab === 'params' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Select
              placeholder="Filter by class"
              allowClear
              style={{ width: 200 }}
              value={filterClass || undefined}
              onChange={(v) => setFilterClass(v || '')}
              options={uniqueClasses.map((c) => ({ label: c, value: c }))}
            />
            <span style={{ marginLeft: 12, color: '#888', fontSize: 12 }}>
              {filteredParams.length} definitions
            </span>
          </div>
          <Table
            dataSource={filteredParams}
            columns={paramColumns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: false }}
            scroll={{ y: 500 }}
          />
        </>
      )}
    </Modal>
  );
}
