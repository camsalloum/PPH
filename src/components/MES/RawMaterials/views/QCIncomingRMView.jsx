import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Input, InputNumber, Row, Select, Space, Table, Tag, Timeline, Typography, message } from 'antd';
import { ArrowLeftOutlined, EyeOutlined, MinusCircleOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import RawMaterials from '../../../dashboard/RawMaterials';
import { useRawMaterialsContext } from '../RawMaterialsContext';
import { useAuth } from '../../../../contexts/AuthContext';
import RegrindBatchModal from './RegrindBatchModal';
import QCSupplierQualityPanel from './QCSupplierQualityPanel';
import QCParameterAdminPanel from './QCParameterAdminPanel';
import QCCertificatePanel from './QCCertificatePanel';

const STATUS_COLORS = {
  pending: 'orange',
  assigned: 'gold',
  in_progress: 'blue',
  passed: 'green',
  failed: 'red',
  conditional: 'purple',
};

const PRIORITY_COLORS = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

const TIER_COLORS = {
  tier_1: 'green',
  tier_2: 'blue',
  tier_3: 'orange',
  suspended: 'red',
};

const getSamplingGuidance = (tier) => {
  if (tier === 'tier_1') return 'Reduced sampling';
  if (tier === 'tier_2') return 'Standard sampling';
  if (tier === 'tier_3') return '100% inspection';
  if (tier === 'suspended') return 'Hold material';
  return 'Standard sampling';
};

const RESULT_STATUS_OPTIONS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'pending', label: 'Pending' },
  { value: 'not_applicable', label: 'N/A' },
];

const VERDICT_OPTIONS = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'conditional', label: 'Conditional' },
];

const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const parseNumberish = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const parsePositiveInt = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const isFilled = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const toLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const StatCard = ({ label, value, tone }) => {
  const palette = {
    pending: { bg: '#fff7e6', border: '#ffd591', text: '#ad6800' },
    inprogress: { bg: '#e6f4ff', border: '#91caff', text: '#0958d9' },
    passed: { bg: '#f6ffed', border: '#b7eb8f', text: '#237804' },
    failed: { bg: '#fff1f0', border: '#ffccc7', text: '#a8071a' },
  };
  const p = palette[tone] || { bg: '#fafafa', border: '#d9d9d9', text: '#1f1f1f' };

  return (
    <Card styles={{ body: { padding: 14 } }} style={{ borderColor: p.border, background: p.bg }}>
      <div style={{ color: '#8c8c8c', fontSize: 12 }}>{label}</div>
      <div style={{ color: p.text, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value ?? 0}</div>
    </Card>
  );
};

const QCIncomingRMView = () => {
  const sharedData = useRawMaterialsContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userRole = normalizeRole(user?.role);

  const [stats, setStats] = useState(null);
  const [queueData, setQueueData] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [searchText, setSearchText] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [supplierTierInfo, setSupplierTierInfo] = useState(null);
  const [parameterRows, setParameterRows] = useState([]);
  const [resultDrafts, setResultDrafts] = useState({});
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [submittingDock, setSubmittingDock] = useState(false);
  const [submittingLab, setSubmittingLab] = useState(false);
  const [submittingVerdict, setSubmittingVerdict] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [regrindOpen, setRegrindOpen] = useState(false);
  const [verdictDraft, setVerdictDraft] = useState({
    verdict: undefined,
    notes: '',
    conditional_restriction: '',
  });
  const [actionBusyId, setActionBusyId] = useState(null);

  const canSubmitDock = ['operator', 'production_operator', 'stores_keeper', 'store_keeper', 'quality_control', 'qc_manager', 'qc_lab', 'lab_technician', 'rd_engineer'].includes(userRole);
  const canSubmitLab = ['quality_control', 'qc_manager', 'qc_lab', 'lab_technician', 'rd_engineer'].includes(userRole);
  const canVerdict = ['admin', 'qc_manager'].includes(userRole);
  const canManageParameters = ['admin', 'qc_manager'].includes(userRole);
  const canDeactivateParameters = userRole === 'admin';
  const canManageCertificates = ['admin', 'qc_manager'].includes(userRole);
  const canCreateRegrind = ['admin', 'quality_control', 'qc_manager', 'qc_lab', 'lab_technician', 'rd_engineer', 'production_manager', 'production_planner', 'production_operator', 'production_op', 'operator'].includes(userRole);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/mes/qc/incoming-rm/stats');
      if (response.data?.success) {
        setStats(response.data.data || null);
      }
    } catch (err) {
      setStats(null);
      message.error(err.response?.data?.error || 'Failed to load QC incoming stats');
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const response = await axios.get('/api/mes/qc/incoming-rm', {
        params: {
          status: statusFilter,
          search: searchText || undefined,
          limit: 200,
          offset: 0,
        },
      });
      if (response.data?.success) {
        setQueueData(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load QC incoming queue');
    } finally {
      setLoadingQueue(false);
    }
  }, [searchText, statusFilter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchQueue()]);
  }, [fetchQueue, fetchStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const rawHash = (window.location.hash || '').trim();
    if (!rawHash) return;

    const targetId = rawHash.replace(/^#/, '');
    if (!targetId) return;

    const timer = setTimeout(() => {
      const node = document.getElementById(targetId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [queueData.length, parameterRows.length]);

  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const response = await axios.get(`/api/mes/qc/incoming-rm/${id}`);
      if (!response.data?.success) {
        message.error('Failed to load incoming RM detail');
        return;
      }

      const detail = response.data.data || null;
      setDetailRecord(detail);

      const materialType = detail?.incoming?.material_type || undefined;
      const supplierCode = detail?.incoming?.supplier_code || undefined;
      const [paramsRes, equipmentRes, tiersRes] = await Promise.allSettled([
        axios.get('/api/mes/qc/rm-parameters', {
          params: {
            material_type: materialType,
          },
        }),
        axios.get('/api/mes/presales/qc/equipment'),
        supplierCode
          ? axios.get('/api/mes/qc/supplier-tiers', { params: { supplier: supplierCode } })
          : Promise.resolve({ data: { success: true, data: [] } }),
      ]);

      const paramsData =
        paramsRes.status === 'fulfilled' && paramsRes.value.data?.success
          ? (Array.isArray(paramsRes.value.data.data) ? paramsRes.value.data.data : [])
          : [];

      const equipmentData =
        equipmentRes.status === 'fulfilled' && equipmentRes.value.data?.success
          ? (Array.isArray(equipmentRes.value.data.data) ? equipmentRes.value.data.data : [])
          : [];

      const supplierTierRows =
        tiersRes.status === 'fulfilled' && tiersRes.value.data?.success
          ? (Array.isArray(tiersRes.value.data.data) ? tiersRes.value.data.data : [])
          : [];

      const matchedTier = supplierTierRows.find((row) =>
        String(row.supplier_code || '').trim().toLowerCase() === String(supplierCode || '').trim().toLowerCase()
      ) || null;

      const latestResultsByParameter = {};
      (detail?.test_results || []).forEach((row) => {
        const key = row.parameter_id;
        if (!key) return;

        const prev = latestResultsByParameter[key];
        if (!prev) {
          latestResultsByParameter[key] = row;
          return;
        }

        const prevTime = new Date(prev.tested_at || prev.created_at || 0).getTime();
        const rowTime = new Date(row.tested_at || row.created_at || 0).getTime();
        if (rowTime >= prevTime) {
          latestResultsByParameter[key] = row;
        }
      });

      const initialDrafts = {};
      paramsData.forEach((param) => {
        const latest = latestResultsByParameter[param.id];
        initialDrafts[param.id] = [{
          result_value: latest?.result_value ?? null,
          result_text: latest?.result_text || '',
          result_status: latest?.result_status || undefined,
          measurement_point: latest?.measurement_point || '',
          replicate_number: latest?.replicate_number || 1,
          test_conditions: latest?.metadata?.test_conditions || '',
          notes: '',
          equipment_id: latest?.equipment_id || undefined,
        }];
      });

      setParameterRows(paramsData);
      setResultDrafts(initialDrafts);
      setEquipmentOptions(equipmentData);
      setSupplierTierInfo(matchedTier);
      setVerdictDraft({
        verdict: ['passed', 'failed', 'conditional'].includes(detail?.incoming?.qc_status)
          ? detail?.incoming?.qc_status
          : undefined,
        notes: detail?.incoming?.verdict_notes || '',
        conditional_restriction: detail?.incoming?.conditional_restriction || '',
      });
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load incoming RM detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const latestResultsMap = useMemo(() => {
    const map = {};
    (detailRecord?.test_results || []).forEach((row) => {
      const key = row.parameter_id;
      if (!key) return;
      const prev = map[key];
      if (!prev) {
        map[key] = row;
        return;
      }
      const prevTime = new Date(prev.tested_at || prev.created_at || 0).getTime();
      const rowTime = new Date(row.tested_at || row.created_at || 0).getTime();
      if (rowTime >= prevTime) map[key] = row;
    });
    return map;
  }, [detailRecord]);

  const dockParameters = useMemo(
    () => parameterRows.filter((row) => row.tested_by_role === 'operator'),
    [parameterRows]
  );

  const labParameters = useMemo(
    () => parameterRows.filter((row) => ['qc_technician', 'qc_lab'].includes(row.tested_by_role)),
    [parameterRows]
  );

  const updateDraft = (parameterId, replicateIndex, patch) => {
    setResultDrafts((prev) => {
      const arr = [...(prev[parameterId] || [])];
      arr[replicateIndex] = { ...(arr[replicateIndex] || {}), ...patch };
      return { ...prev, [parameterId]: arr };
    });
  };

  const addReplicate = (parameterId) => {
    setResultDrafts((prev) => {
      const arr = [...(prev[parameterId] || [])];
      const nextNum = arr.length + 1;
      arr.push({
        result_value: null,
        result_text: '',
        result_status: undefined,
        measurement_point: '',
        replicate_number: nextNum,
        test_conditions: '',
        notes: '',
        equipment_id: undefined,
      });
      return { ...prev, [parameterId]: arr };
    });
  };

  const removeReplicate = (parameterId, replicateIndex) => {
    setResultDrafts((prev) => {
      const arr = [...(prev[parameterId] || [])];
      if (arr.length <= 1) return prev;
      arr.splice(replicateIndex, 1);
      // Re-number replicates
      arr.forEach((r, i) => { r.replicate_number = i + 1; });
      return { ...prev, [parameterId]: arr };
    });
  };

  const getSpecText = (parameter) => {
    const min = parameter?.spec_min;
    const target = parameter?.spec_target;
    const max = parameter?.spec_max;
    const hasMain = min !== null || target !== null || max !== null;

    const condMin = parameter?.conditional_min;
    const condMax = parameter?.conditional_max;
    const condAction = parameter?.conditional_action;
    const hasConditional = condMin !== null || condMax !== null || isFilled(condAction);

    if (!hasMain && !hasConditional) return 'No formal limits';

    const main = hasMain
      ? `Min: ${min ?? '-'} | Target: ${target ?? '-'} | Max: ${max ?? '-'}`
      : '';

    const conditional = hasConditional
      ? `Conditional: ${condMin ?? '-'} to ${condMax ?? '-'}${isFilled(condAction) ? ` (${condAction})` : ''}`
      : '';

    return [main, conditional].filter(Boolean).join(' | ');
  };

  const collectSubmissionRows = (mode) => {
    const allowedRoles = mode === 'dock' ? ['operator'] : ['qc_technician', 'qc_lab'];

    const rows = [];
    parameterRows
      .filter((param) => allowedRoles.includes(param.tested_by_role))
      .forEach((param) => {
        const drafts = resultDrafts[param.id] || [];
        drafts.forEach((draft) => {
          const hasPayload = [
            draft.result_value,
            draft.result_text,
            draft.result_status,
            draft.notes,
            draft.equipment_id,
          ].some((value) => isFilled(value));

          if (!hasPayload) return;

          rows.push({
            parameter_id: param.id,
            result_value: parseNumberish(draft.result_value),
            result_text: isFilled(draft.result_text) ? draft.result_text.trim() : undefined,
            result_status: isFilled(draft.result_status) ? draft.result_status : undefined,
            notes: isFilled(draft.notes) ? draft.notes.trim() : undefined,
            equipment_id: parseNumberish(draft.equipment_id),
            replicate_number: parsePositiveInt(draft.replicate_number, 1),
            measurement_point: isFilled(draft.measurement_point) ? draft.measurement_point.trim() : undefined,
            test_conditions: isFilled(draft.test_conditions) ? draft.test_conditions.trim() : undefined,
          });
        });
      });

    return rows;
  };

  const submitResults = async (mode) => {
    const incomingId = detailRecord?.incoming?.id;
    if (!incomingId) return;

    if (mode === 'dock' && !canSubmitDock) {
      message.error('Your role is not allowed to submit dock-level results.');
      return;
    }

    if (mode === 'lab' && !canSubmitLab) {
      message.error('Your role is not allowed to submit lab results.');
      return;
    }

    const results = collectSubmissionRows(mode);
    if (results.length === 0) {
      message.warning(`Enter at least one ${mode === 'dock' ? 'dock' : 'lab'} result before submitting.`);
      return;
    }

    if (mode === 'dock') setSubmittingDock(true);
    else setSubmittingLab(true);

    try {
      const response = await axios.post(`/api/mes/qc/incoming-rm/${incomingId}/results/${mode}`, { results });
      if (!response.data?.success) {
        message.error('Result submission failed');
        return;
      }

      const warningCount = response.data?.data?.warnings?.length || 0;
      message.success(`${results.length} result(s) submitted.`);
      if (warningCount > 0) {
        message.warning(`${warningCount} result(s) were flagged for calibration warnings.`);
      }

      await refreshAll();
      await openDetail(incomingId);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to submit results');
    } finally {
      if (mode === 'dock') setSubmittingDock(false);
      else setSubmittingLab(false);
    }
  };

  const submitVerdict = async () => {
    const incomingId = detailRecord?.incoming?.id;
    if (!incomingId) return;

    if (!canVerdict) {
      message.error('Only QC Manager or Admin can submit verdicts.');
      return;
    }

    if (!isFilled(verdictDraft.verdict)) {
      message.warning('Select a verdict first.');
      return;
    }

    if (verdictDraft.verdict === 'conditional' && !isFilled(verdictDraft.conditional_restriction)) {
      message.warning('Conditional restriction is required for conditional verdict.');
      return;
    }

    setSubmittingVerdict(true);
    try {
      const payload = {
        verdict: verdictDraft.verdict,
        notes: isFilled(verdictDraft.notes) ? verdictDraft.notes.trim() : undefined,
        conditional_restriction:
          verdictDraft.verdict === 'conditional' && isFilled(verdictDraft.conditional_restriction)
            ? verdictDraft.conditional_restriction.trim()
            : undefined,
      };

      const response = await axios.post(`/api/mes/qc/incoming-rm/${incomingId}/verdict`, payload);
      if (!response.data?.success) {
        message.error('Failed to save verdict');
        return;
      }

      message.success(`Verdict saved: ${toLabel(verdictDraft.verdict)}`);
      await refreshAll();
      await openDetail(incomingId);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save verdict');
    } finally {
      setSubmittingVerdict(false);
    }
  };

  const reopenRecord = async () => {
    const incomingId = detailRecord?.incoming?.id;
    if (!incomingId) return;

    if (!canVerdict) {
      message.error('Only QC Manager or Admin can reopen records.');
      return;
    }

    setReopening(true);
    try {
      const response = await axios.post(`/api/mes/qc/incoming-rm/${incomingId}/reopen`, {
        notes: isFilled(verdictDraft.notes) ? verdictDraft.notes.trim() : 'Reopened from QC panel',
      });

      if (!response.data?.success) {
        message.error('Failed to reopen record');
        return;
      }

      message.success('Record reopened for re-testing');
      await refreshAll();
      await openDetail(incomingId);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to reopen record');
    } finally {
      setReopening(false);
    }
  };

  const assignToMe = async (record) => {
    setActionBusyId(record.id);
    try {
      await axios.post(`/api/mes/qc/incoming-rm/${record.id}/assign`, {
        assigned_to: user?.id,
        assigned_to_name: user?.name || user?.username || user?.email || 'Current User',
        notes: 'Self-assigned from QC queue',
      });
      message.success('Assigned');
      await refreshAll();
    } catch (err) {
      message.error(err.response?.data?.error || 'Assignment failed');
    } finally {
      setActionBusyId(null);
    }
  };

  const startTesting = async (record) => {
    setActionBusyId(record.id);
    try {
      await axios.post(`/api/mes/qc/incoming-rm/${record.id}/start`, {});
      message.success('Testing started');
      await refreshAll();
    } catch (err) {
      message.error(err.response?.data?.error || 'Could not start testing');
    } finally {
      setActionBusyId(null);
    }
  };

  const filteredRows = useMemo(() => {
    if (!searchText) return queueData;
    const q = searchText.toLowerCase();
    return queueData.filter((row) =>
      [
        row.material_code,
        row.material_name,
        row.qc_lot_id,
        row.batch_number,
        row.supplier_code,
        row.supplier_name,
      ].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [queueData, searchText]);

  const columns = [
    {
      title: 'Material',
      key: 'material',
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.material_code || '-'}</div>
          <div style={{ color: '#595959' }}>{record.material_name || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{record.material_type || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Lot / Batch',
      key: 'lot',
      width: 170,
      render: (_, record) => (
        <div>
          <div>{record.qc_lot_id || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>Batch: {record.batch_number || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Supplier',
      key: 'supplier',
      width: 180,
      render: (_, record) => (
        <div>
          <div>{record.supplier_code || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{record.supplier_name || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Received',
      dataIndex: 'received_date',
      width: 130,
      render: (value) => formatDate(value),
    },
    {
      title: 'Status',
      key: 'status',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={STATUS_COLORS[record.qc_status] || 'default'}>{toLabel(record.qc_status)}</Tag>
          <Tag color={PRIORITY_COLORS[record.priority] || 'default'}>{toLabel(record.priority || 'normal')}</Tag>
        </Space>
      ),
    },
    {
      title: 'Assigned To',
      dataIndex: 'assigned_to_name',
      width: 150,
      render: (value) => value || '-',
    },
    {
      title: 'Results',
      dataIndex: 'test_result_count',
      width: 90,
      align: 'center',
      render: (value) => value || 0,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => {
        const completed = ['passed', 'failed', 'conditional'].includes(record.qc_status);
        const inProgress = record.qc_status === 'in_progress';
        const busy = actionBusyId === record.id;

        return (
          <Space wrap>
            <Button
              size="small"
              icon={<UserAddOutlined />}
              disabled={completed || inProgress || busy}
              loading={busy}
              onClick={() => assignToMe(record)}
            >
              Assign
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={completed || inProgress || busy}
              loading={busy}
              onClick={() => startTesting(record)}
            >
              Start
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
              Detail
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Alert
        showIcon
        type="info"
        message="Quality & Lab Incoming RM Queue"
        description="Use this queue to assign, start, and track incoming raw material QC records."
        style={{ marginBottom: 12 }}
      />

      {userRole === 'admin' && (
        <div style={{ marginBottom: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mes/raw-materials')}>
            Back to Admin RM Dashboard
          </Button>
        </div>
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}><StatCard label="Pending" value={stats?.pending || 0} tone="pending" /></Col>
        <Col xs={12} sm={6}><StatCard label="In Progress" value={stats?.in_progress || 0} tone="inprogress" /></Col>
        <Col xs={12} sm={6}><StatCard label="Passed Today" value={stats?.passed_today || 0} tone="passed" /></Col>
        <Col xs={12} sm={6}><StatCard label="Failed Today" value={stats?.failed_today || 0} tone="failed" /></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Select
              allowClear
              placeholder="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ minWidth: 190 }}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'assigned', label: 'Assigned' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'passed', label: 'Passed' },
                { value: 'failed', label: 'Failed' },
                { value: 'conditional', label: 'Conditional' },
              ]}
            />
            <Input.Search
              allowClear
              placeholder="Search code, lot, batch, supplier"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={fetchQueue}
              style={{ minWidth: 320 }}
            />
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setRegrindOpen(true)}
              disabled={!canCreateRegrind}
            >
              Log Regrind Batch
            </Button>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loadingQueue}>Refresh</Button>
          </Space>
        </Space>
      </Card>

      <Card title="Incoming RM QC Queue" styles={{ body: { padding: 0 } }} style={{ marginBottom: 14 }}>
        <Table
          rowKey="id"
          dataSource={filteredRows}
          columns={columns}
          loading={loadingQueue}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <div id="supplier-quality">
        <QCSupplierQualityPanel canManageTier={canVerdict} />
      </div>

      <div id="test-parameters">
        <QCParameterAdminPanel
          canManage={canManageParameters}
          canDeactivate={canDeactivateParameters}
        />
      </div>

      <QCCertificatePanel canManage={canManageCertificates} />

      <RawMaterials
        allowSync={false}
        hidePrices={true}
        title="Raw Materials Dashboard (Quality & Lab View)"
        sharedData={sharedData}
      />

      <Drawer
        open={detailOpen}
        width={980}
        onClose={() => {
          setDetailOpen(false);
          setDetailRecord(null);
          setSupplierTierInfo(null);
          setParameterRows([]);
          setResultDrafts({});
          setEquipmentOptions([]);
        }}
        title="Incoming RM QC Detail"
      >
        {!detailRecord || detailLoading ? (
          <Typography.Text type="secondary">Loading details...</Typography.Text>
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Material">{detailRecord.incoming?.material_code} - {detailRecord.incoming?.material_name}</Descriptions.Item>
              <Descriptions.Item label="Type">{detailRecord.incoming?.material_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="QC Lot">{detailRecord.incoming?.qc_lot_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="Batch">{detailRecord.incoming?.batch_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Quantity">{detailRecord.incoming?.quantity || '-'} {detailRecord.incoming?.unit || ''}</Descriptions.Item>
              <Descriptions.Item label="Source">{toLabel(detailRecord.incoming?.source || '-')}</Descriptions.Item>
              <Descriptions.Item label="Supplier">{detailRecord.incoming?.supplier_name || detailRecord.incoming?.supplier_code || '-'}</Descriptions.Item>
              <Descriptions.Item label="Supplier Tier">
                {supplierTierInfo ? (
                  <Space direction="vertical" size={2}>
                    <Tag color={TIER_COLORS[supplierTierInfo.tier] || 'default'}>{toLabel(supplierTierInfo.tier)}</Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {getSamplingGuidance(supplierTierInfo.tier)}
                    </Typography.Text>
                  </Space>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[detailRecord.incoming?.qc_status] || 'default'}>
                  {toLabel(detailRecord.incoming?.qc_status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Assigned To">{detailRecord.incoming?.assigned_to_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Received">{formatDate(detailRecord.incoming?.received_date)}</Descriptions.Item>
              <Descriptions.Item label="GRN Ref">{detailRecord.incoming?.grn_reference || '-'}</Descriptions.Item>
              <Descriptions.Item label="PO Ref">{detailRecord.incoming?.po_reference || '-'}</Descriptions.Item>
              {isFilled(detailRecord.incoming?.conditional_restriction) && (
                <Descriptions.Item label="Conditional Restriction" span={2}>
                  {detailRecord.incoming?.conditional_restriction}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="Record Test Results">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  showIcon
                  type="info"
                  message="Enter only the rows you want to submit"
                  description="Blank rows are ignored. Dock endpoint accepts operator-tagged parameters; Lab endpoint accepts qc_technician and qc_lab parameters."
                />

                <Card
                  size="small"
                  title="Dock Checks (Operator)"
                  extra={
                    <Button
                      type="primary"
                      onClick={() => submitResults('dock')}
                      loading={submittingDock}
                      disabled={!canSubmitDock || dockParameters.length === 0}
                    >
                      Submit Dock Results
                    </Button>
                  }
                >
                  {dockParameters.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No dock-level parameters configured" />
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {dockParameters.map((param) => {
                        const drafts = resultDrafts[param.id] || [{}];
                        const latest = latestResultsMap[param.id];

                        return (
                          <div key={param.id} style={{ border: param.is_ctq ? '2px solid #ff4d4f' : '1px solid #f0f0f0', borderRadius: 8, padding: 10, background: param.is_ctq ? '#fff1f0' : undefined }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{param.parameter_name} ({param.parameter_code}){param.is_ctq && <Tag color="red" style={{ marginLeft: 6, fontWeight: 700 }}>CTQ</Tag>}</div>
                                <div style={{ color: '#8c8c8c', fontSize: 12 }}>{getSpecText(param)}</div>
                              </div>
                              <Space>
                                <Tag color="gold">Operator</Tag>
                                <Button size="small" icon={<PlusOutlined />} onClick={() => addReplicate(param.id)}>
                                  Replicate
                                </Button>
                              </Space>
                            </div>

                            {latest && (
                              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
                                Last: {latest.result_value ?? latest.result_text ?? '-'} ({toLabel(latest.result_status || 'pending')})
                              </div>
                            )}

                            {drafts.map((draft, rIdx) => (
                              <div key={rIdx} style={{ marginBottom: rIdx < drafts.length - 1 ? 8 : 0, paddingBottom: rIdx < drafts.length - 1 ? 8 : 0, borderBottom: rIdx < drafts.length - 1 ? '1px dashed #d9d9d9' : 'none' }}>
                                {drafts.length > 1 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Replicate {rIdx + 1}</Typography.Text>
                                    <Button type="text" danger size="small" icon={<MinusCircleOutlined />} onClick={() => removeReplicate(param.id, rIdx)} />
                                  </div>
                                )}
                                <Row gutter={[8, 8]}>
                                  <Col xs={24} md={6}>
                                    <InputNumber
                                      style={{ width: '100%' }}
                                      placeholder="Numeric value"
                                      value={draft.result_value}
                                      onChange={(value) => updateDraft(param.id, rIdx, { result_value: value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <Select
                                      allowClear
                                      style={{ width: '100%' }}
                                      placeholder="Status"
                                      value={draft.result_status}
                                      onChange={(value) => updateDraft(param.id, rIdx, { result_status: value })}
                                      options={RESULT_STATUS_OPTIONS}
                                    />
                                  </Col>
                                  <Col xs={24} md={12}>
                                    <Input
                                      placeholder="Result text / observation"
                                      value={draft.result_text || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { result_text: e.target.value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <InputNumber
                                      min={1}
                                      style={{ width: '100%' }}
                                      placeholder="Replicate #"
                                      value={draft.replicate_number}
                                      onChange={(value) => updateDraft(param.id, rIdx, { replicate_number: value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={18}>
                                    <Input
                                      placeholder="Measurement point (e.g., Left edge, Center, Roll 5)"
                                      value={draft.measurement_point || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { measurement_point: e.target.value })}
                                    />
                                  </Col>
                                  <Col span={24}>
                                    <Input
                                      placeholder="Notes (optional)"
                                      value={draft.notes || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { notes: e.target.value })}
                                    />
                                  </Col>
                                  <Col span={24}>
                                    <Input
                                      placeholder="Test conditions (optional, e.g., 23°C, 50% RH)"
                                      value={draft.test_conditions || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { test_conditions: e.target.value })}
                                    />
                                  </Col>
                                </Row>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </Space>
                  )}
                </Card>

                <Card
                  size="small"
                  title="Lab Checks (QC Technician / QC Lab)"
                  extra={
                    <Button
                      type="primary"
                      onClick={() => submitResults('lab')}
                      loading={submittingLab}
                      disabled={!canSubmitLab || labParameters.length === 0}
                    >
                      Submit Lab Results
                    </Button>
                  }
                >
                  {labParameters.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lab-level parameters configured" />
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {labParameters.map((param) => {
                        const drafts = resultDrafts[param.id] || [{}];
                        const latest = latestResultsMap[param.id];

                        return (
                          <div key={param.id} style={{ border: param.is_ctq ? '2px solid #ff4d4f' : '1px solid #f0f0f0', borderRadius: 8, padding: 10, background: param.is_ctq ? '#fff1f0' : undefined }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{param.parameter_name} ({param.parameter_code}){param.is_ctq && <Tag color="red" style={{ marginLeft: 6, fontWeight: 700 }}>CTQ</Tag>}</div>
                                <div style={{ color: '#8c8c8c', fontSize: 12 }}>{getSpecText(param)}</div>
                              </div>
                              <Space>
                                <Tag color="purple">{toLabel(param.tested_by_role)}</Tag>
                                <Button size="small" icon={<PlusOutlined />} onClick={() => addReplicate(param.id)}>
                                  Replicate
                                </Button>
                              </Space>
                            </div>

                            {latest && (
                              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
                                Last: {latest.result_value ?? latest.result_text ?? '-'} ({toLabel(latest.result_status || 'pending')})
                              </div>
                            )}

                            {drafts.map((draft, rIdx) => (
                              <div key={rIdx} style={{ marginBottom: rIdx < drafts.length - 1 ? 8 : 0, paddingBottom: rIdx < drafts.length - 1 ? 8 : 0, borderBottom: rIdx < drafts.length - 1 ? '1px dashed #d9d9d9' : 'none' }}>
                                {drafts.length > 1 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Replicate {rIdx + 1}</Typography.Text>
                                    <Button type="text" danger size="small" icon={<MinusCircleOutlined />} onClick={() => removeReplicate(param.id, rIdx)} />
                                  </div>
                                )}
                                <Row gutter={[8, 8]}>
                                  <Col xs={24} md={5}>
                                    <InputNumber
                                      style={{ width: '100%' }}
                                      placeholder="Numeric value"
                                      value={draft.result_value}
                                      onChange={(value) => updateDraft(param.id, rIdx, { result_value: value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={5}>
                                    <Select
                                      allowClear
                                      style={{ width: '100%' }}
                                      placeholder="Status"
                                      value={draft.result_status}
                                      onChange={(value) => updateDraft(param.id, rIdx, { result_status: value })}
                                      options={RESULT_STATUS_OPTIONS}
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <Select
                                      allowClear
                                      showSearch
                                      optionFilterProp="label"
                                      style={{ width: '100%' }}
                                      placeholder="Equipment (required for lab)"
                                      value={draft.equipment_id}
                                      onChange={(value) => updateDraft(param.id, rIdx, { equipment_id: value })}
                                      options={equipmentOptions.map((item) => ({
                                        value: item.id,
                                        label: `${item.name}${item.model ? ` (${item.model})` : ''}`,
                                      }))}
                                    />
                                  </Col>
                                  <Col xs={24} md={8}>
                                    <Input
                                      placeholder="Result text / observation"
                                      value={draft.result_text || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { result_text: e.target.value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <InputNumber
                                      min={1}
                                      style={{ width: '100%' }}
                                      placeholder="Replicate #"
                                      value={draft.replicate_number}
                                      onChange={(value) => updateDraft(param.id, rIdx, { replicate_number: value })}
                                    />
                                  </Col>
                                  <Col xs={24} md={18}>
                                    <Input
                                      placeholder="Measurement point (e.g., Left edge, Center, Roll 5)"
                                      value={draft.measurement_point || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { measurement_point: e.target.value })}
                                    />
                                  </Col>
                                  <Col span={24}>
                                    <Input
                                      placeholder="Notes (optional)"
                                      value={draft.notes || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { notes: e.target.value })}
                                    />
                                  </Col>
                                  <Col span={24}>
                                    <Input
                                      placeholder="Test conditions (optional, e.g., 23°C, 50% RH)"
                                      value={draft.test_conditions || ''}
                                      onChange={(e) => updateDraft(param.id, rIdx, { test_conditions: e.target.value })}
                                    />
                                  </Col>
                                </Row>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </Space>
                  )}
                </Card>
              </Space>
            </Card>

            <Card
              size="small"
              title="QC Verdict"
              extra={
                <Space>
                  <Button
                    type="primary"
                    onClick={submitVerdict}
                    loading={submittingVerdict}
                    disabled={!canVerdict}
                  >
                    Save Verdict
                  </Button>
                  <Button
                    onClick={reopenRecord}
                    loading={reopening}
                    disabled={!canVerdict || !['passed', 'failed', 'conditional'].includes(detailRecord.incoming?.qc_status)}
                  >
                    Reopen
                  </Button>
                </Space>
              }
            >
              {!canVerdict && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 10 }}
                  message="Only QC Manager or Admin can finalize verdicts."
                />
              )}

              <Row gutter={[8, 8]}>
                <Col xs={24} md={8}>
                  <Select
                    allowClear
                    style={{ width: '100%' }}
                    placeholder="Verdict"
                    value={verdictDraft.verdict}
                    onChange={(value) => setVerdictDraft((prev) => ({ ...prev, verdict: value }))}
                    options={VERDICT_OPTIONS}
                    disabled={!canVerdict}
                  />
                </Col>
                <Col xs={24} md={16}>
                  <Input
                    placeholder="Verdict notes"
                    value={verdictDraft.notes}
                    onChange={(e) => setVerdictDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    disabled={!canVerdict}
                  />
                </Col>
                {verdictDraft.verdict === 'conditional' && (
                  <Col span={24}>
                    <Input
                      placeholder="Conditional restriction (required for conditional verdict)"
                      value={verdictDraft.conditional_restriction}
                      onChange={(e) => setVerdictDraft((prev) => ({ ...prev, conditional_restriction: e.target.value }))}
                      disabled={!canVerdict}
                    />
                  </Col>
                )}
              </Row>
            </Card>

            <Card size="small" title="Test Results">
              <Table
                rowKey="id"
                size="small"
                dataSource={detailRecord.test_results || []}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: 'Parameter', dataIndex: 'parameter_name', key: 'parameter_name', width: 200 },
                  { title: 'Code', dataIndex: 'parameter_code', key: 'parameter_code', width: 110 },
                  {
                    title: 'CTQ',
                    key: 'is_ctq',
                    width: 60,
                    align: 'center',
                    render: (_, row) => {
                      const param = parameterRows.find((p) => p.id === row.parameter_id);
                      return param?.is_ctq ? <Tag color="red" style={{ fontWeight: 700 }}>CTQ</Tag> : null;
                    },
                  },
                  {
                    title: 'Result',
                    key: 'result',
                    width: 170,
                    render: (_, row) => row.result_value ?? row.result_text ?? '-',
                  },
                  {
                    title: 'Replicate',
                    dataIndex: 'replicate_number',
                    key: 'replicate_number',
                    width: 100,
                    render: (v) => v || 1,
                  },
                  {
                    title: 'Point',
                    dataIndex: 'measurement_point',
                    key: 'measurement_point',
                    width: 170,
                    render: (v) => v || '-',
                  },
                  {
                    title: 'Equipment',
                    key: 'equipment_name',
                    width: 180,
                    render: (_, row) => row.equipment_name || '-',
                  },
                  {
                    title: 'Conditions',
                    key: 'test_conditions',
                    width: 170,
                    render: (_, row) => row?.metadata?.test_conditions || '-',
                  },
                  {
                    title: 'Status',
                    dataIndex: 'result_status',
                    key: 'result_status',
                    width: 120,
                    render: (v) => <Tag color={STATUS_COLORS[v] || 'default'}>{toLabel(v)}</Tag>,
                  },
                  { title: 'Tested By', dataIndex: 'tested_by_name', key: 'tested_by_name', width: 180 },
                  {
                    title: 'Time',
                    dataIndex: 'tested_at',
                    key: 'tested_at',
                    width: 170,
                    render: (v) => formatDate(v),
                  },
                ]}
              />
            </Card>

            <Card size="small" title="Activity Timeline">
              <Timeline
                items={(detailRecord.activity_log || []).map((row) => ({
                  color: STATUS_COLORS[row.to_status] || 'blue',
                  children: (
                    <div>
                      <div style={{ fontWeight: 600 }}>{toLabel(row.action)}</div>
                      <div style={{ color: '#595959' }}>{row.details || '-'}</div>
                      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                        {row.performed_by_name || '-'} | {formatDate(row.created_at)}
                      </div>
                    </div>
                  ),
                }))}
              />
            </Card>
          </Space>
        )}
      </Drawer>

      <RegrindBatchModal
        open={regrindOpen}
        user={user}
        onClose={() => setRegrindOpen(false)}
        onCreated={async (created) => {
          await refreshAll();
          if (created?.id) {
            await openDetail(created.id);
          }
        }}
      />
    </div>
  );
};

export default QCIncomingRMView;
