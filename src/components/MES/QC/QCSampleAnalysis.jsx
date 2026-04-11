import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import { ArrowLeftOutlined, BarChartOutlined, DownloadOutlined, ExperimentOutlined, MinusCircleOutlined, PlusCircleOutlined, PlusOutlined, SaveOutlined, SendOutlined, ToolOutlined, UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import SampleProgressSteps from './SampleProgressSteps';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// G-003: Compute stats from an array of numeric readings
function computeReadingStats(readings) {
  const nums = (readings || []).map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return { mean: null, min: null, max: null, std_dev: null, count: 0 };
  const count = nums.length;
  const mean = nums.reduce((a, b) => a + b, 0) / count;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = count > 1 ? nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1) : 0;
  const std_dev = Math.sqrt(variance);
  return {
    mean: Math.round(mean * 1000) / 1000,
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    std_dev: Math.round(std_dev * 1000) / 1000,
    count,
  };
}

const statusColor = {
  sent_to_qc: 'orange',
  received_by_qc: 'purple',
  testing: 'processing',
  tested: 'cyan',
  approved: 'green',
  rejected: 'red',
};

const categoryPresets = {
  physical: [
    { name: 'Thickness', spec: 'As per TDS', result: '', unit: 'μm', status: 'pass' },
    { name: 'Width', spec: 'As per drawing', result: '', unit: 'mm', status: 'pass' },
  ],
  print: [
    { name: 'Color Match', spec: 'Visual standard', result: '', unit: '', status: 'pass' },
    { name: 'Registration', spec: 'No visible shift', result: '', unit: '', status: 'pass' },
  ],
  seal: [
    { name: 'Seal Strength', spec: 'As per product standard', result: '', unit: 'N/15mm', status: 'pass' },
  ],
  optical: [
    { name: 'Haze', spec: 'As per spec', result: '', unit: '%', status: 'pass' },
  ],
  chemical: [
    { name: 'Odor', spec: 'No abnormal odor', result: '', unit: '', status: 'pass' },
  ],
};

// Phase 4.5: Product-group-specific presets removed — DB templates (G-001) are
// the sole source. See migration 020 for all 8 product groups.
// Generic categoryPresets above serve only as a last-resort skeleton when no
// DB template exists and no product group is set.

/**
 * Resolve fallback presets when no DB template is available.
 * DB templates (loaded in loadData → G-001 block) always take priority.
 */
function resolvePresets(_productGroup, category) {
  return categoryPresets[category] ? [...categoryPresets[category]] : [];
}

export default function QCSampleAnalysis() {
  const { sampleId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evidenceUploading, setEvidenceUploading] = useState(false); // F-002
  const [sample, setSample] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [analysisId, setAnalysisId] = useState(null);
  const [equipmentList, setEquipmentList] = useState([]); // G-008
  const [formState, setFormState] = useState({
    test_category: 'physical',
    test_parameters: [],
    visual_inspection: 'pass',
    print_quality: 'na',
    seal_strength_value: null,
    seal_strength_unit: 'N/15mm',
    seal_strength_status: 'na',
    observations: '',
    overall_result: 'pass',
    recommendation: '',
    disposition: null,
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  // ENH-01: hydrateForm accepts optional productGroup so PG presets are used as fallback
  const hydrateForm = useCallback((analysis, productGroup) => {
    if (analysis) {
      setAnalysisId(analysis.id);
      setFormState({
        test_category: analysis.test_category || 'physical',
        test_parameters: Array.isArray(analysis.test_parameters) ? analysis.test_parameters : [],
        visual_inspection: analysis.visual_inspection || 'pass',
        print_quality: analysis.print_quality || 'na',
        seal_strength_value: analysis.seal_strength_value,
        seal_strength_unit: analysis.seal_strength_unit || 'N/15mm',
        seal_strength_status: analysis.seal_strength_status || 'na',
        observations: analysis.observations || '',
        overall_result: analysis.overall_result || 'pass',
        recommendation: analysis.recommendation || '',
        disposition: analysis.disposition || null,
      });
      return;
    }

    setAnalysisId(null);
    setFormState((prev) => ({
      ...prev,
      test_parameters: resolvePresets(productGroup, prev.test_category),
    }));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/qc/analyses/${sampleId}`, { headers });
      const data = res.data?.data;
      setSample(data?.sample || null);
      setAttachments(data?.attachments || []);
      hydrateForm(data?.analysis || null, data?.sample?.product_group);
      // P5-3d: hydrate disposition from sample
      if (data?.sample?.disposition) {
        setFormState((prev) => ({ ...prev, disposition: data.sample.disposition }));
      }

      // G-001: if no existing analysis, auto-load a template for this product group
      if (!data?.analysis && data?.sample?.product_group) {
        try {
          const tplRes = await axios.get(
            `${API_BASE}/api/mes/presales/qc/templates?product_group=${encodeURIComponent(data.sample.product_group)}`,
            { headers }
          );
          const templates = tplRes.data?.data || [];
          if (templates.length > 0) {
            const tpl = templates[0];
            const tplParams = tpl.test_parameters || tpl.parameters;
            setFormState((prev) => ({
              ...prev,
              test_category: tpl.test_category || prev.test_category,
              test_parameters:
                Array.isArray(tplParams) && tplParams.length > 0
                  ? tplParams.map((p) => ({
                      name:               p.name || '',
                      spec:               p.spec || '',
                      result:             '',
                      unit:               p.unit || '',
                      method:             p.method || '',
                      min_value:          p.min_value ?? null,
                      max_value:          p.max_value ?? null,
                      acceptance_formula: p.acceptance_formula || '',
                      status:             'pass',
                    }))
                  : prev.test_parameters,
            }));
          }
        } catch { /* non-critical — continue without template */ }
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load sample analysis');
    } finally {
      setLoading(false);
    }
  }, [headers, hydrateForm, message, sampleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // G-008: load equipment list for dropdown selectors
  useEffect(() => {
    axios.get(`${API_BASE}/api/mes/presales/qc/equipment`, { headers })
      .then((res) => setEquipmentList(res.data?.data || []))
      .catch(() => { /* non-critical */ });
  }, [headers]);

  const setField = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const setParamField = (index, key, value) => {
    setFormState((prev) => {
      const next = [...prev.test_parameters];
      const updated = { ...next[index], [key]: value };

      // G-002: auto-evaluate pass/fail when result is updated
      if (key === 'result') {
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) {
          const min = updated.min_value != null ? parseFloat(updated.min_value) : null;
          const max = updated.max_value != null ? parseFloat(updated.max_value) : null;
          if (min !== null && max !== null) {
            updated.status = numVal >= min && numVal <= max ? 'pass' : 'fail';
          } else if (min !== null) {
            updated.status = numVal >= min ? 'pass' : 'fail';
          } else if (max !== null) {
            updated.status = numVal <= max ? 'pass' : 'fail';
          }
        }
      }

      next[index] = updated;
      return { ...prev, test_parameters: next };
    });
  };

  // G-003: toggle multi-reading mode for a parameter
  const toggleMultiReading = (index) => {
    setFormState((prev) => {
      const next = [...prev.test_parameters];
      const p = { ...next[index] };
      if (p.multi_reading) {
        // Switch back to single: use mean as result
        const stats = computeReadingStats(p.readings);
        p.multi_reading = false;
        p.result = stats.mean != null ? String(stats.mean) : p.result;
        delete p.readings;
        delete p.reading_stats;
      } else {
        // Switch to multi: seed with current result if numeric
        p.multi_reading = true;
        const existing = parseFloat(p.result);
        p.readings = !isNaN(existing) ? [String(existing)] : [''];
        p.reading_stats = computeReadingStats(p.readings);
      }
      next[index] = p;
      return { ...prev, test_parameters: next };
    });
  };

  // G-003: update a specific reading value
  const setReading = (paramIdx, readingIdx, value) => {
    setFormState((prev) => {
      const next = [...prev.test_parameters];
      const p = { ...next[paramIdx], readings: [...(next[paramIdx].readings || [])] };
      p.readings[readingIdx] = value;
      const stats = computeReadingStats(p.readings);
      p.reading_stats = stats;
      p.result = stats.mean != null ? String(stats.mean) : '';
      // G-002 auto-evaluate on mean
      if (stats.mean != null) {
        const min = p.min_value != null ? parseFloat(p.min_value) : null;
        const max = p.max_value != null ? parseFloat(p.max_value) : null;
        if (min !== null && max !== null) p.status = stats.mean >= min && stats.mean <= max ? 'pass' : 'fail';
        else if (min !== null) p.status = stats.mean >= min ? 'pass' : 'fail';
        else if (max !== null) p.status = stats.mean <= max ? 'pass' : 'fail';
      }
      next[paramIdx] = p;
      return { ...prev, test_parameters: next };
    });
  };

  const addReading = (paramIdx) => {
    setFormState((prev) => {
      const next = [...prev.test_parameters];
      next[paramIdx] = { ...next[paramIdx], readings: [...(next[paramIdx].readings || []), ''] };
      return { ...prev, test_parameters: next };
    });
  };

  const removeReading = (paramIdx, readingIdx) => {
    setFormState((prev) => {
      const next = [...prev.test_parameters];
      const p = { ...next[paramIdx] };
      p.readings = (p.readings || []).filter((_, i) => i !== readingIdx);
      const stats = computeReadingStats(p.readings);
      p.reading_stats = stats;
      p.result = stats.mean != null ? String(stats.mean) : '';
      next[paramIdx] = p;
      return { ...prev, test_parameters: next };
    });
  };

  const addParam = () => {
    setFormState((prev) => ({
      ...prev,
      test_parameters: [
        ...prev.test_parameters,
        { name: '', spec: '', result: '', unit: '', status: 'pass' },
      ],
    }));
  };

  const removeParam = (index) => {
    setFormState((prev) => ({
      ...prev,
      test_parameters: prev.test_parameters.filter((_, i) => i !== index),
    }));
  };

  // ENH-01: use PG-aware presets when switching category on an empty form
  const onCategoryChange = (value) => {
    setFormState((prev) => ({
      ...prev,
      test_category: value,
      test_parameters: prev.test_parameters.length > 0
        ? prev.test_parameters
        : resolvePresets(sample?.product_group, value),
    }));
  };

  const payload = useMemo(() => ({
    sample_id: Number(sampleId),
    test_category: formState.test_category,
    test_parameters: formState.test_parameters,
    visual_inspection: formState.visual_inspection,
    print_quality: formState.print_quality,
    seal_strength_value: formState.seal_strength_value,
    seal_strength_unit: formState.seal_strength_unit,
    seal_strength_status: formState.seal_strength_status,
    observations: formState.observations,
    overall_result: formState.overall_result,
    recommendation: formState.recommendation,
  }), [formState, sampleId]);

  // G-008: log equipment usage for any parameter that has equipment_id set
  const logEquipmentUsage = async (aId) => {
    const paramsWithEquip = formState.test_parameters.filter((p) => p.equipment_id);
    if (!paramsWithEquip.length || !aId) return;
    for (const p of paramsWithEquip) {
      try {
        await axios.post(
          `${API_BASE}/api/mes/presales/qc/equipment-used`,
          { analysis_id: aId, equipment_id: p.equipment_id, parameter_name: p.name },
          { headers }
        );
      } catch { /* non-critical */ }
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      let savedId = analysisId;
      if (analysisId) {
        const res = await axios.patch(`${API_BASE}/api/mes/presales/qc/analyses/${analysisId}`, payload, { headers });
        savedId = res.data?.data?.id || analysisId;
        setAnalysisId(savedId);
      } else {
        const res = await axios.post(`${API_BASE}/api/mes/presales/qc/analyses`, payload, { headers });
        savedId = res.data?.data?.id || null;
        setAnalysisId(savedId);
      }
      await logEquipmentUsage(savedId); // G-008
      // P5-3d: Save disposition if changed
      if (formState.disposition && sample?.disposition !== formState.disposition) {
        try {
          await axios.patch(`${API_BASE}/api/mes/presales/samples/${sampleId}/disposition`,
            { disposition: formState.disposition }, { headers });
        } catch { /* non-critical */ }
      }
      message.success('Analysis draft saved');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save analysis draft');
    } finally {
      setSaving(false);
    }
  };

  const doSubmitAnalysis = async () => {
    setSubmitting(true);
    try {
      let currentAnalysisId = analysisId;
      if (!currentAnalysisId) {
        const draftRes = await axios.post(`${API_BASE}/api/mes/presales/qc/analyses`, payload, { headers });
        currentAnalysisId = draftRes.data?.data?.id;
        setAnalysisId(currentAnalysisId);
      }

      await logEquipmentUsage(currentAnalysisId); // G-008

      const submitRes = await axios.post(`${API_BASE}/api/mes/presales/qc/analyses/${currentAnalysisId}/submit`, payload, { headers });
      // P5-3d: Save disposition on submit
      if (formState.disposition) {
        try {
          await axios.patch(`${API_BASE}/api/mes/presales/samples/${sampleId}/disposition`,
            { disposition: formState.disposition }, { headers });
        } catch { /* non-critical */ }
      }
      const cseNo = submitRes.data?.data?.cse?.cse_number;
      message.success(cseNo
        ? `Analysis submitted and CSE generated: ${cseNo}`
        : 'Analysis submitted and sample marked as tested');
      await loadData();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to submit analysis');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnalysis = () => {
    Modal.confirm({
      title: 'Submit Analysis & Generate CSE?',
      content: 'This will finalize the analysis and generate a Customer Sample Evaluation for the approval workflow. This action cannot be undone.',
      okText: 'Submit',
      onOk: doSubmitAnalysis,
    });
  };

  const parameterColumns = [
    {
      title: 'Parameter',
      dataIndex: 'name',
      render: (_, row, index) => (
        <Input value={row.name} onChange={(e) => setParamField(index, 'name', e.target.value)} />
      ),
    },
    {
      title: 'Spec / Target',
      dataIndex: 'spec',
      render: (_, row, index) => (
        <Input value={row.spec} onChange={(e) => setParamField(index, 'spec', e.target.value)} />
      ),
    },
    {
      title: 'Result',
      dataIndex: 'result',
      width: 200,
      render: (_, row, index) => {
        if (row.multi_reading) {
          const stats = row.reading_stats || computeReadingStats(row.readings);
          return (
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {(row.readings || []).map((rd, ri) => (
                <Space key={ri} size={2}>
                  <Input
                    size="small"
                    value={rd}
                    onChange={(e) => setReading(index, ri, e.target.value)}
                    placeholder={`#${ri + 1}`}
                    style={{ width: 90 }}
                  />
                  {(row.readings || []).length > 1 && (
                    <MinusCircleOutlined
                      style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => removeReading(index, ri)}
                    />
                  )}
                </Space>
              ))}
              <Button size="small" type="dashed" icon={<PlusCircleOutlined />} onClick={() => addReading(index)} style={{ fontSize: 11 }}>
                Reading
              </Button>
              {stats.count >= 2 && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  μ={stats.mean}  σ={stats.std_dev}  [{stats.min}–{stats.max}]
                </Text>
              )}
            </Space>
          );
        }
        return <Input value={row.result} onChange={(e) => setParamField(index, 'result', e.target.value)} />;
      },
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      width: 110,
      render: (_, row, index) => (
        <Input value={row.unit} onChange={(e) => setParamField(index, 'unit', e.target.value)} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (_, row, index) => (
        <Select value={row.status || 'pass'} onChange={(value) => setParamField(index, 'status', value)} style={{ width: '100%' }}>
          <Select.Option value="pass">PASS</Select.Option>
          <Select.Option value="fail">FAIL</Select.Option>
          <Select.Option value="na">N/A</Select.Option>
        </Select>
      ),
    },
    {
      title: <Space><ToolOutlined />Equipment</Space>,
      dataIndex: 'equipment_id',
      width: 180,
      render: (_, row, index) => {
        const selectedEquip = row.equipment_id ? equipmentList.find((e) => e.id === row.equipment_id) : null;
        const isCalibExpired = selectedEquip?.calibration_due_date && new Date(selectedEquip.calibration_due_date) < new Date();
        return (
          <Tooltip title={isCalibExpired ? `Calibration expired: ${selectedEquip.calibration_due_date}` : undefined} color="orange">
            <Select
              allowClear
              placeholder="Select instrument"
              value={row.equipment_id || undefined}
              onChange={(v) => setParamField(index, 'equipment_id', v ?? null)}
              style={{ width: '100%' }}
              size="small"
              status={isCalibExpired ? 'warning' : undefined}
            >
              {equipmentList.map((e) => {
                const expired = e.calibration_due_date && new Date(e.calibration_due_date) < new Date();
                return (
                  <Select.Option key={e.id} value={e.id}>
                    {e.name}{e.equipment_code ? ` (${e.equipment_code})` : ''}{expired ? ' ⚠️' : ''}
                  </Select.Option>
                );
              })}
            </Select>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, row, index) => (
        <Space size={2}>
          <Tooltip title={row.multi_reading ? 'Single reading' : 'Multiple readings'}>
            <Button
              type={row.multi_reading ? 'primary' : 'text'}
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => toggleMultiReading(index)}
            />
          </Tooltip>
          <Button danger type="text" onClick={() => removeParam(index)}>×</Button>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (!sample) {
    return <Card><Empty description="Sample not found" /></Card>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <Space style={{ marginBottom: 10 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mes/qc')}>Back to QC Dashboard</Button>
      </Space>

      <Card style={{ marginBottom: 14 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>{sample.sample_number}</Title>
            <Tag color={statusColor[sample.status] || 'default'}>{sample.status?.replaceAll('_', ' ')}</Tag>
          </Space>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Inquiry">{sample.inquiry_number}</Descriptions.Item>
            <Descriptions.Item label="Customer">{sample.customer_name}</Descriptions.Item>
            <Descriptions.Item label="Product Group">{sample.product_group}</Descriptions.Item>
            <Descriptions.Item label="Sample Type">{sample.sample_type}</Descriptions.Item>
            <Descriptions.Item label="Priority">{sample.priority || 'normal'}</Descriptions.Item>
            <Descriptions.Item label="Description">{sample.description || '-'}</Descriptions.Item>
          </Descriptions>
          <SampleProgressSteps sample={sample} />
        </Space>
      </Card>

      <Card title="QC Analysis" extra={<Tag>{analysisId ? 'Draft Loaded' : 'New Draft'}</Tag>}>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}>
            <Text strong>Test Category</Text>
            <Select value={formState.test_category} onChange={onCategoryChange} style={{ width: '100%', marginTop: 6 }}>
              <Select.Option value="physical">Physical Properties</Select.Option>
              <Select.Option value="print">Print Quality</Select.Option>
              <Select.Option value="seal">Seal Integrity</Select.Option>
              <Select.Option value="optical">Optical Properties</Select.Option>
              <Select.Option value="chemical">Chemical / Migration</Select.Option>
              <Select.Option value="custom">Custom</Select.Option>
            </Select>
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Visual Inspection</Text>
            <Select value={formState.visual_inspection} onChange={(v) => setField('visual_inspection', v)} style={{ width: '100%', marginTop: 6 }}>
              <Select.Option value="pass">PASS</Select.Option>
              <Select.Option value="fail">FAIL</Select.Option>
              <Select.Option value="na">N/A</Select.Option>
            </Select>
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Print Quality</Text>
            <Select value={formState.print_quality} onChange={(v) => setField('print_quality', v)} style={{ width: '100%', marginTop: 6 }}>
              <Select.Option value="pass">PASS</Select.Option>
              <Select.Option value="fail">FAIL</Select.Option>
              <Select.Option value="na">N/A</Select.Option>
            </Select>
          </Col>
        </Row>

        <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
          <Text strong>Test Parameters</Text>
          <Button icon={<PlusOutlined />} onClick={addParam}>Add Parameter</Button>
        </Space>

        <Table
          size="small"
          rowKey={(_, i) => `${i}`}
          columns={parameterColumns}
          dataSource={formState.test_parameters}
          pagination={false}
          locale={{ emptyText: <Empty description="No parameters" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          style={{ marginBottom: 12 }}
        />

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}>
            <Text strong>Seal Strength</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 6 }}
              value={formState.seal_strength_value}
              onChange={(v) => setField('seal_strength_value', v)}
              min={0}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Seal Unit</Text>
            <Input style={{ marginTop: 6 }} value={formState.seal_strength_unit} onChange={(e) => setField('seal_strength_unit', e.target.value)} />
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Seal Status</Text>
            <Select value={formState.seal_strength_status} onChange={(v) => setField('seal_strength_status', v)} style={{ width: '100%', marginTop: 6 }}>
              <Select.Option value="pass">PASS</Select.Option>
              <Select.Option value="fail">FAIL</Select.Option>
              <Select.Option value="na">N/A</Select.Option>
            </Select>
          </Col>
        </Row>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} md={12}>
            <Text strong>Observations</Text>
            <Input.TextArea rows={4} style={{ marginTop: 6 }} value={formState.observations} onChange={(e) => setField('observations', e.target.value)} />
          </Col>
          <Col xs={24} md={12}>
            <Text strong>Recommendation</Text>
            <Input.TextArea rows={4} style={{ marginTop: 6 }} value={formState.recommendation} onChange={(e) => setField('recommendation', e.target.value)} />
          </Col>
        </Row>

        <Text strong>Overall Result</Text>
        <Radio.Group style={{ display: 'block', marginTop: 8, marginBottom: 16 }} value={formState.overall_result} onChange={(e) => setField('overall_result', e.target.value)}>
          <Space>
            <Radio value="pass">PASS</Radio>
            <Radio value="fail">FAIL</Radio>
            <Radio value="conditional">CONDITIONAL</Radio>
          </Space>
        </Radio.Group>

        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Text strong>Sample Disposition</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              placeholder="Select disposition"
              value={formState.disposition || undefined}
              onChange={(v) => setField('disposition', v)}
              allowClear
              options={[
                { value: 'retain', label: 'Retain' },
                { value: 'return', label: 'Return to Customer' },
                { value: 'dispose', label: 'Dispose' },
              ]}
            />
          </Col>
        </Row>

        <Space>
          <Button icon={<SaveOutlined />} loading={saving} onClick={saveDraft}>Save Draft</Button>
          <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={submitAnalysis}>Submit Analysis</Button>
        </Space>
      </Card>

      <Card title="Attached Files" size="small" style={{ marginTop: 14 }}>
        {attachments.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No files attached" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {attachments.map((file) => (
              <Space key={file.id} style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space>
                  <Tag>{file.attachment_type || 'file'}</Tag>
                  <Text>{file.file_name}</Text>
                </Space>
                <Space>
                  <a href={`${API_BASE}${file.file_path}`} target="_blank" rel="noreferrer">Open</a>
                  <a href={`${API_BASE}${file.file_path}`} download={file.file_name} title="Download"><DownloadOutlined /></a>
                </Space>
              </Space>
            ))}
          </Space>
        )}
      </Card>

      {/* F-002: QC Evidence Upload — only if we have an inquiry context */}
      {sample?.inquiry_id && (
        <Card title="Upload QC Evidence" size="small" style={{ marginTop: 14 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Attach photos, charts, or lab certificates as QC evidence for this sample.</Text>
          <Upload
            multiple
            showUploadList
            customRequest={async ({ file, onSuccess, onError, onProgress }) => {
              setEvidenceUploading(true);
              try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('attachment_type', 'qc_evidence');
                fd.append('sample_id', String(sampleId));
                if (analysisId) fd.append('analysis_id', String(analysisId));
                await axios.post(
                  `${API_BASE}/api/mes/presales/inquiries/${sample.inquiry_id}/attachments`,
                  fd,
                  {
                    headers: { ...headers, 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (e) => onProgress?.({ percent: Math.round((e.loaded * 100) / e.total) }),
                  }
                );
                onSuccess?.('ok');
                await loadData();
                message.success(`${file.name} uploaded`);
              } catch (err) {
                onError?.(err);
                message.error(err.response?.data?.error || `Failed to upload ${file.name}`);
              } finally {
                setEvidenceUploading(false);
              }
            }}
          >
            <Button icon={<UploadOutlined />} loading={evidenceUploading}>Click or drag files to upload</Button>
          </Upload>
        </Card>
      )}
    </div>
  );
}
