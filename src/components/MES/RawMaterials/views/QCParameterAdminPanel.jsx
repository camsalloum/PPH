import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const INSPECTION_LEVEL_OPTIONS = [
  { value: 'l1', label: 'L1' },
  { value: 'l2', label: 'L2' },
  { value: 'conditional', label: 'Conditional' },
];

const TESTED_BY_ROLE_OPTIONS = [
  { value: 'operator', label: 'Operator (Dock)' },
  { value: 'qc_technician', label: 'QC Technician' },
  { value: 'qc_lab', label: 'QC Lab' },
];

const FREQUENCY_OPTIONS = [
  { value: 'every_lot', label: 'Every Lot' },
  { value: 'every_n_lot', label: 'Every N Lots' },
  { value: 'supplier_tier_based', label: 'Supplier Tier Based' },
  { value: 'conditional', label: 'Conditional' },
];

const toLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const QCParameterAdminPanel = ({ canManage = false, canDeactivate = false }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState(undefined);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [form] = Form.useForm();

  const fetchParameters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/mes/qc/rm-parameters', {
        params: {
          include_inactive: includeInactive ? 1 : undefined,
        },
      });

      if (response.data?.success) {
        setRows(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load test parameters');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    fetchParameters();
  }, [fetchParameters]);

  const materialTypeOptions = useMemo(() => {
    const values = [...new Set(rows.map((row) => String(row.material_type || '').trim()).filter(Boolean))];
    return values.sort().map((value) => ({ value, label: value }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      const byType = !materialTypeFilter || row.material_type === materialTypeFilter;

      const bySearch = !q || [
        row.material_type,
        row.material_subtype,
        row.parameter_name,
        row.parameter_code,
        row.tested_by_role,
        row.frequency_rule,
      ].some((value) => String(value || '').toLowerCase().includes(q));

      return byType && bySearch;
    });
  }, [rows, searchText, materialTypeFilter]);

  const openCreate = () => {
    setActiveRecord(null);
    form.setFieldsValue({
      material_type: '',
      material_subtype: '',
      parameter_name: '',
      parameter_code: '',
      unit: '',
      test_method: '',
      spec_min: null,
      spec_target: null,
      spec_max: null,
      conditional_min: null,
      conditional_max: null,
      conditional_action: '',
      inspection_level: 'l1',
      tested_by_role: 'qc_lab',
      frequency_rule: 'every_lot',
      applies_to_subtype: '',
      process_impact: '',
      equipment_category: '',
      is_ctq: false,
      is_required: true,
      display_order: 100,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setActiveRecord(row);
    form.setFieldsValue({
      material_type: row.material_type || '',
      material_subtype: row.material_subtype || '',
      parameter_name: row.parameter_name || '',
      parameter_code: row.parameter_code || '',
      unit: row.unit || '',
      test_method: row.test_method || '',
      spec_min: row.spec_min,
      spec_target: row.spec_target,
      spec_max: row.spec_max,
      conditional_min: row.conditional_min,
      conditional_max: row.conditional_max,
      conditional_action: row.conditional_action || '',
      inspection_level: row.inspection_level || 'l1',
      tested_by_role: row.tested_by_role || 'qc_lab',
      frequency_rule: row.frequency_rule || 'every_lot',
      applies_to_subtype: row.applies_to_subtype || '',
      process_impact: row.process_impact || '',
      equipment_category: row.equipment_category || '',
      is_ctq: Boolean(row.is_ctq),
      is_required: row.is_required !== false,
      display_order: row.display_order ?? 100,
      is_active: row.is_active !== false,
    });
    setModalOpen(true);
  };

  const saveParameter = async () => {
    if (!canManage) return;

    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        material_type: String(values.material_type || '').trim(),
        material_subtype: values.material_subtype || null,
        parameter_name: String(values.parameter_name || '').trim(),
        parameter_code: String(values.parameter_code || '').trim().toUpperCase(),
        unit: values.unit || null,
        test_method: values.test_method || null,
        spec_min: numberOrNull(values.spec_min),
        spec_target: numberOrNull(values.spec_target),
        spec_max: numberOrNull(values.spec_max),
        conditional_min: numberOrNull(values.conditional_min),
        conditional_max: numberOrNull(values.conditional_max),
        conditional_action: values.conditional_action || null,
        inspection_level: values.inspection_level || 'l1',
        tested_by_role: values.tested_by_role || 'qc_lab',
        frequency_rule: values.frequency_rule || 'every_lot',
        applies_to_subtype: values.applies_to_subtype || null,
        process_impact: values.process_impact || null,
        equipment_category: values.equipment_category || null,
        is_ctq: Boolean(values.is_ctq),
        is_required: values.is_required !== false,
        display_order: values.display_order ?? 100,
      };

      if (activeRecord?.id) {
        payload.is_active = values.is_active !== false;
      }

      const response = activeRecord?.id
        ? await axios.put(`/api/mes/qc/rm-parameters/${activeRecord.id}`, payload)
        : await axios.post('/api/mes/qc/rm-parameters', payload);

      if (!response.data?.success) {
        message.error('Failed to save parameter');
        return;
      }

      message.success(activeRecord?.id ? 'Parameter updated' : 'Parameter created');
      setModalOpen(false);
      setActiveRecord(null);
      await fetchParameters();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to save parameter');
    } finally {
      setSaving(false);
    }
  };

  const deactivateParameter = async (row) => {
    if (!canDeactivate || !row?.id) return;

    setDeletingId(row.id);
    try {
      const response = await axios.delete(`/api/mes/qc/rm-parameters/${row.id}`);
      if (!response.data?.success) {
        message.error('Failed to deactivate parameter');
        return;
      }
      message.success('Parameter deactivated');
      await fetchParameters();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to deactivate parameter');
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    {
      title: 'Material',
      key: 'material',
      width: 200,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.material_type || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{row.material_subtype || 'All subtypes'}</div>
        </div>
      ),
    },
    {
      title: 'Parameter',
      key: 'parameter',
      width: 230,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.parameter_name || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{row.parameter_code || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Spec Limits',
      key: 'spec',
      width: 250,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text style={{ fontSize: 12 }}>
            Min: {row.spec_min ?? '-'} | Target: {row.spec_target ?? '-'} | Max: {row.spec_max ?? '-'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Conditional: {row.conditional_min ?? '-'} to {row.conditional_max ?? '-'}
            {row.conditional_action ? ` (${row.conditional_action})` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Execution',
      key: 'execution',
      width: 200,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Tag color="geekblue">{toLabel(row.tested_by_role)}</Tag>
          <Typography.Text style={{ fontSize: 12 }}>{toLabel(row.frequency_rule || 'every_lot')}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'State',
      key: 'state',
      width: 150,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Tag color={row.is_active ? 'green' : 'default'}>{row.is_active ? 'Active' : 'Inactive'}</Tag>
          <Tag color={row.is_required ? 'blue' : 'default'}>{row.is_required ? 'Required' : 'Optional'}</Tag>
        </Space>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      title: 'Action',
      key: 'action',
      width: 170,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            Edit
          </Button>
          {canDeactivate && row.is_active && (
            <Popconfirm
              title="Deactivate parameter"
              description="This will soft-delete the parameter from active use."
              okText="Deactivate"
              onConfirm={() => deactivateParameter(row)}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === row.id}
              >
                Deactivate
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    });
  }

  return (
    <Card
      title="Incoming RM Test Parameter Setup"
      size="small"
      style={{ marginBottom: 14 }}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchParameters} loading={loading}>
            Refresh
          </Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Parameter
            </Button>
          )}
        </Space>
      }
    >
      {!canManage && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 10 }}
          message="Read-only parameter view"
          description="Only Admin and QC Manager can create or edit RM test parameters."
        />
      )}

      <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
        <Input.Search
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search parameter, code, role"
          style={{ minWidth: 280 }}
        />
        <Select
          allowClear
          value={materialTypeFilter}
          onChange={setMaterialTypeFilter}
          placeholder="Filter by material type"
          options={materialTypeOptions}
          style={{ minWidth: 220 }}
        />
        <Space>
          <Typography.Text>Include inactive</Typography.Text>
          <Switch checked={includeInactive} onChange={setIncludeInactive} />
        </Space>
      </Space>

      <Table
        rowKey="id"
        dataSource={filteredRows}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 8 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        open={modalOpen}
        title={activeRecord?.id ? `Edit Test Parameter #${activeRecord.id}` : 'Create Test Parameter'}
        onCancel={() => {
          setModalOpen(false);
          setActiveRecord(null);
        }}
        onOk={saveParameter}
        okText={activeRecord?.id ? 'Save Changes' : 'Create Parameter'}
        confirmLoading={saving}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={10}>
            <Col span={12}>
              <Form.Item
                name="material_type"
                label="Material Type"
                rules={[{ required: true, message: 'Material type is required' }]}
              >
                <Input placeholder="Example: Regrind / PIR" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="material_subtype" label="Material Subtype">
                <Input placeholder="Optional subtype" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={14}>
              <Form.Item
                name="parameter_name"
                label="Parameter Name"
                rules={[{ required: true, message: 'Parameter name is required' }]}
              >
                <Input placeholder="Example: Melt Flow Index" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="parameter_code"
                label="Parameter Code"
                rules={[{ required: true, message: 'Parameter code is required' }]}
              >
                <Input placeholder="Example: MFI" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="unit" label="Unit">
                <Input placeholder="g/10min" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="test_method" label="Test Method">
                <Input placeholder="ASTM / ISO method" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="spec_min" label="Spec Min">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="spec_target" label="Spec Target">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="spec_max" label="Spec Max">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="conditional_min" label="Conditional Min">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="conditional_max" label="Conditional Max">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="conditional_action" label="Conditional Action">
                <Input placeholder="Hold / review action" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="inspection_level" label="Inspection Level">
                <Select options={INSPECTION_LEVEL_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tested_by_role" label="Tested By Role">
                <Select options={TESTED_BY_ROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="frequency_rule" label="Frequency Rule">
                <Select options={FREQUENCY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="applies_to_subtype" label="Applies To Subtype">
                <Input placeholder="Optional subtype selector" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="process_impact" label="Process Impact">
                <Input placeholder="Optional process impact" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="equipment_category" label="Equipment Category">
                <Input placeholder="Optional equipment category" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={8}>
              <Form.Item name="display_order" label="Display Order">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_ctq" label="CTQ" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_required" label="Required" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          {activeRecord?.id && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default QCParameterAdminPanel;
