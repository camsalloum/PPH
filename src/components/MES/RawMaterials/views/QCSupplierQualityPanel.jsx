import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { EditOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

const TIER_OPTIONS = [
  { value: 'tier_1', label: 'Tier 1 (Preferred)' },
  { value: 'tier_2', label: 'Tier 2 (Approved)' },
  { value: 'tier_3', label: 'Tier 3 (Probationary)' },
  { value: 'suspended', label: 'Suspended' },
];

const TIER_COLORS = {
  tier_1: 'green',
  tier_2: 'blue',
  tier_3: 'orange',
  suspended: 'red',
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
};

const getRateColor = (rate) => {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 'default';
  if (n >= 95) return 'green';
  if (n >= 85) return 'blue';
  if (n >= 70) return 'orange';
  return 'red';
};

const getSamplingGuidance = (tier) => {
  if (tier === 'tier_1') return 'Reduced sampling';
  if (tier === 'tier_2') return 'Standard sampling';
  if (tier === 'tier_3') return '100% inspection';
  if (tier === 'suspended') return 'Hold material';
  return 'Standard sampling';
};

const QCSupplierQualityPanel = ({ canManageTier = false }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [tierRows, setTierRows] = useState([]);
  const [kfAlerts, setKfAlerts] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [tierFilter, setTierFilter] = useState(undefined);

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierSaving, setTierSaving] = useState(false);
  const [activeSupplier, setActiveSupplier] = useState(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [qualityRes, tiersRes] = await Promise.all([
        axios.get('/api/mes/qc/incoming-rm/supplier-quality'),
        axios.get('/api/mes/qc/supplier-tiers'),
      ]);

      const qualityRows = qualityRes.data?.success && Array.isArray(qualityRes.data?.data)
        ? qualityRes.data.data
        : [];

      const supplierTiers = tiersRes.data?.success && Array.isArray(tiersRes.data?.data)
        ? tiersRes.data.data
        : [];

      const trends = qualityRes.data?.success && Array.isArray(qualityRes.data?.kf_trend_alerts)
        ? qualityRes.data.kf_trend_alerts
        : [];

      setRows(qualityRows);
      setTierRows(supplierTiers);
      setKfAlerts(trends);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load supplier quality data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tierMap = useMemo(() => {
    const map = new Map();
    tierRows.forEach((row) => {
      const code = String(row.supplier_code || '').trim();
      if (!code) return;
      map.set(code, row);
    });
    return map;
  }, [tierRows]);

  const alertMap = useMemo(() => {
    const map = new Map();
    kfAlerts.forEach((row) => {
      const code = String(row.supplier_code || '').trim();
      if (!code) return;
      const current = map.get(code) || [];
      current.push(row);
      map.set(code, current);
    });
    return map;
  }, [kfAlerts]);

  const filteredRows = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();

    return rows.filter((row) => {
      const code = String(row.supplier_code || '').trim();
      const name = String(row.supplier_name || '').trim();
      const tier = tierMap.get(code)?.tier || 'tier_2';

      const bySearch = !q || code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
      const byTier = !tierFilter || tier === tierFilter;

      return bySearch && byTier;
    });
  }, [rows, supplierSearch, tierFilter, tierMap]);

  const openTierModal = (record) => {
    const code = String(record.supplier_code || '').trim();
    const existing = tierMap.get(code);

    setActiveSupplier({
      supplier_code: code,
      supplier_name: record.supplier_name || existing?.supplier_name || code,
    });

    form.setFieldsValue({
      tier: existing?.tier || 'tier_2',
      tier_reason: existing?.tier_reason || '',
      review_due_date: existing?.review_due_date ? String(existing.review_due_date).slice(0, 10) : '',
      notes: existing?.notes || '',
    });
    setTierModalOpen(true);
  };

  const saveTier = async () => {
    if (!activeSupplier?.supplier_code) return;

    try {
      const values = await form.validateFields();
      setTierSaving(true);

      const payload = {
        supplier_name: activeSupplier.supplier_name,
        tier: values.tier,
        tier_reason: values.tier_reason || null,
        review_due_date: values.review_due_date || null,
        notes: values.notes || null,
      };

      const response = await axios.put(
        `/api/mes/qc/supplier-tiers/${encodeURIComponent(activeSupplier.supplier_code)}`,
        payload
      );

      if (!response.data?.success) {
        message.error('Failed to update supplier tier');
        return;
      }

      message.success('Supplier tier updated');
      setTierModalOpen(false);
      setActiveSupplier(null);
      await fetchData();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to update supplier tier');
    } finally {
      setTierSaving(false);
    }
  };

  const columns = [
    {
      title: 'Supplier',
      key: 'supplier',
      width: 260,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.supplier_code || '-'}</div>
          <div style={{ color: '#595959' }}>{row.supplier_name || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Lots',
      key: 'lots',
      width: 170,
      render: (_, row) => {
        const total = toNumber(row.total_lots);
        const passed = toNumber(row.passed_lots);
        const failed = toNumber(row.failed_lots);
        const conditional = toNumber(row.conditional_lots);

        return (
          <Space direction="vertical" size={2}>
            <Typography.Text>All: {total}</Typography.Text>
            <Typography.Text type="success">Passed: {passed}</Typography.Text>
            <Typography.Text type="danger">Failed: {failed}</Typography.Text>
            <Typography.Text type="secondary">Conditional: {conditional}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: 'Pass Rate',
      key: 'pass_rate_percent',
      width: 120,
      render: (_, row) => {
        const rate = toNumber(row.pass_rate_percent);
        return <Tag color={getRateColor(rate)}>{formatPercent(rate)}</Tag>;
      },
    },
    {
      title: 'Tier',
      key: 'tier',
      width: 170,
      render: (_, row) => {
        const code = String(row.supplier_code || '').trim();
        const tierValue = tierMap.get(code)?.tier || 'tier_2';
        return <Tag color={TIER_COLORS[tierValue] || 'default'}>{toLabel(tierValue)}</Tag>;
      },
    },
    {
      title: 'Sampling Guidance',
      key: 'sampling_guidance',
      width: 180,
      render: (_, row) => {
        const code = String(row.supplier_code || '').trim();
        const tierValue = tierMap.get(code)?.tier || 'tier_2';
        return getSamplingGuidance(tierValue);
      },
    },
    {
      title: 'KF Trend',
      key: 'kf_trend',
      width: 220,
      render: (_, row) => {
        const code = String(row.supplier_code || '').trim();
        const supplierAlerts = alertMap.get(code) || [];
        if (supplierAlerts.length === 0) {
          return <Tag color="green">Stable</Tag>;
        }

        return (
          <Space direction="vertical" size={4}>
            {supplierAlerts.slice(0, 2).map((item, index) => (
              <Tag key={`${code}-${item.material_type}-${index}`} color="orange" icon={<WarningOutlined />}>
                {item.material_type || 'Material'}: {Array.isArray(item.last_3_values) ? item.last_3_values.join(' -> ') : 'Rising'}
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ];

  if (canManageTier) {
    columns.push({
      title: 'Action',
      key: 'action',
      width: 130,
      render: (_, row) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openTierModal(row)}>
          Update Tier
        </Button>
      ),
    });
  }

  return (
    <Card
      title="Supplier Quality Performance"
      size="small"
      style={{ marginBottom: 14 }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
        <Input.Search
          allowClear
          value={supplierSearch}
          onChange={(e) => setSupplierSearch(e.target.value)}
          placeholder="Search supplier code or name"
          style={{ minWidth: 280 }}
        />
        <Select
          allowClear
          value={tierFilter}
          onChange={setTierFilter}
          options={TIER_OPTIONS}
          placeholder="Filter by tier"
          style={{ minWidth: 220 }}
        />
      </Space>

      {kfAlerts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
          message={`KF trend alerts detected for ${new Set(kfAlerts.map((row) => row.supplier_code)).size} supplier(s)`}
          description="At least one supplier/material has rising KF_WATER values across the last three results."
        />
      )}

      <Table
        rowKey="supplier_code"
        dataSource={filteredRows}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 8 }}
        scroll={{ x: 1100 }}
      />

      <Modal
        open={tierModalOpen}
        title={`Update Supplier Tier${activeSupplier?.supplier_code ? ` - ${activeSupplier.supplier_code}` : ''}`}
        onCancel={() => {
          setTierModalOpen(false);
          setActiveSupplier(null);
        }}
        onOk={saveTier}
        okText="Save Tier"
        confirmLoading={tierSaving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="tier"
            label="Tier"
            rules={[{ required: true, message: 'Tier is required' }]}
          >
            <Select options={TIER_OPTIONS} />
          </Form.Item>

          <Form.Item name="tier_reason" label="Tier Reason">
            <Input placeholder="Reason for tier assignment" />
          </Form.Item>

          <Form.Item name="review_due_date" label="Review Due Date">
            <Input type="date" />
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Supplier quality notes" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default QCSupplierQualityPanel;
