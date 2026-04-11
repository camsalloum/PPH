/**
 * BatchAnalysisModal — G-010
 *
 * Allows QC staff to create analysis drafts for multiple samples at once.
 * Uses a shared parameter template but provides per-sample result columns.
 *
 * Props:
 *   open        — boolean
 *   samples     — [{ id, sample_number, product_group, status }] (2+ selected)
 *   onClose     — () => void
 *   onSuccess   — (createdAnalyses) => void
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Button, Divider, Empty, Input, Modal, Select, Space,
  Table, Tag, Typography, message as antdMessage,
} from 'antd';
import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const DEFAULT_PARAMS = [
  { name: 'Thickness', spec: 'As per TDS', unit: 'μm', method: '' },
  { name: 'Width', spec: 'As per drawing', unit: 'mm', method: '' },
  { name: 'Seal Strength', spec: 'As per standard', unit: 'N/15mm', method: '' },
];

export default function BatchAnalysisModal({ open, samples = [], onClose, onSuccess }) {
  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const [testCategory, setTestCategory] = useState('physical');
  const [parameters, setParameters] = useState(DEFAULT_PARAMS.map((p) => ({ ...p })));
  // perSampleResults: { [paramIdx]: { [sampleId]: resultString } }
  const [results, setResults] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setTestCategory('physical');
      setParameters(DEFAULT_PARAMS.map((p) => ({ ...p })));
      setResults({});
    }
  }, [open]);

  const setParamField = (idx, key, value) => {
    setParameters((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const setResult = (paramIdx, sampleId, value) => {
    setResults((prev) => ({
      ...prev,
      [paramIdx]: { ...(prev[paramIdx] || {}), [sampleId]: value },
    }));
  };

  const addParameter = () => {
    setParameters((prev) => [...prev, { name: '', spec: '', unit: '', method: '' }]);
  };

  const removeParam = (idx) => {
    setParameters((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (parameters.length === 0) {
      antdMessage.warning('Add at least one test parameter');
      return;
    }
    if (samples.length < 2) {
      antdMessage.warning('Select at least 2 samples for batch analysis');
      return;
    }

    // Build test_parameters with per-sample results embedded
    const testParameters = parameters.map((p, idx) => ({
      ...p,
      results: Object.fromEntries(
        samples.map((s) => [s.id, results[idx]?.[s.id] || ''])
      ),
    }));

    setSubmitting(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/mes/presales/qc/batch-analyses`,
        {
          sample_ids: samples.map((s) => s.id),
          test_category: testCategory,
          test_parameters: testParameters,
        },
        { headers }
      );
      antdMessage.success(`Batch analysis created for ${res.data.data.created_count} samples`);
      onSuccess?.(res.data.data.analyses);
      onClose?.();
    } catch (err) {
      antdMessage.error(err.response?.data?.error || 'Failed to create batch analysis');
    } finally {
      setSubmitting(false);
    }
  };

  // Dynamic columns: parameter fields + one result column per sample
  const columns = [
    {
      title: 'Parameter',
      dataIndex: 'name',
      width: 160,
      render: (_, row, idx) => (
        <Input
          size="small"
          value={row.name}
          placeholder="Parameter name"
          onChange={(e) => setParamField(idx, 'name', e.target.value)}
        />
      ),
    },
    {
      title: 'Spec / Target',
      dataIndex: 'spec',
      width: 160,
      render: (_, row, idx) => (
        <Input
          size="small"
          value={row.spec}
          placeholder="Specification"
          onChange={(e) => setParamField(idx, 'spec', e.target.value)}
        />
      ),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      width: 80,
      render: (_, row, idx) => (
        <Input
          size="small"
          value={row.unit}
          onChange={(e) => setParamField(idx, 'unit', e.target.value)}
        />
      ),
    },
    // One result column per selected sample
    ...samples.map((s) => ({
      title: (
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 12 }}>{s.sample_number}</Text>
          <br />
          <Tag style={{ fontSize: 10 }}>{s.product_group || '-'}</Tag>
        </div>
      ),
      key: `result_${s.id}`,
      width: 110,
      render: (_, __, idx) => (
        <Input
          size="small"
          placeholder="Result"
          value={results[idx]?.[s.id] || ''}
          onChange={(e) => setResult(idx, s.id, e.target.value)}
          style={{ textAlign: 'center' }}
        />
      ),
    })),
    {
      title: '',
      key: 'del',
      width: 36,
      render: (_, __, idx) => (
        <Button danger type="text" size="small" onClick={() => removeParam(idx)}>×</Button>
      ),
    },
  ];

  return (
    <Modal
      title={<Space><ExperimentOutlined />Batch Analysis — {samples.length} Samples</Space>}
      open={open}
      onCancel={onClose}
      width={Math.min(900, 400 + samples.length * 120)}
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>
          Create {samples.length} Analysis Drafts
        </Button>,
      ]}
    >
      {samples.length < 2 ? (
        <Empty description="Select at least 2 samples to use batch analysis" />
      ) : (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Text strong>Test Category:</Text>
            <Select
              value={testCategory}
              onChange={setTestCategory}
              style={{ width: 200 }}
              options={[
                { value: 'physical', label: 'Physical Properties' },
                { value: 'print', label: 'Print Quality' },
                { value: 'seal', label: 'Seal Integrity' },
                { value: 'optical', label: 'Optical Properties' },
                { value: 'chemical', label: 'Chemical / Migration' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>Test Parameters & Results</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addParameter}>Add Parameter</Button>
          </div>

          <Table
            size="small"
            rowKey={(_, i) => `${i}`}
            columns={columns}
            dataSource={parameters}
            pagination={false}
            scroll={{ x: true }}
            locale={{ emptyText: <Empty description="No parameters" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />

          <Divider style={{ margin: '12px 0 4px' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Results can be filled now or later in each sample's individual analysis page.
            Drafts will be created and can be submitted individually.
          </Text>
        </>
      )}
    </Modal>
  );
}
