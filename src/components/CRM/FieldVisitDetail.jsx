import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, DatePicker, Descriptions, Divider, Empty, Form,
  Input, InputNumber, List, Modal, Popconfirm, Progress, Row, Select, Space, Spin,
  Steps, Tabs, Tag, Timeline, Tooltip, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, CalendarOutlined, CarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CompassOutlined, CopyOutlined, DollarOutlined, EditOutlined, EnvironmentOutlined, FilePdfOutlined, FileTextOutlined,
  GlobalOutlined, HistoryOutlined, NodeIndexOutlined, PlayCircleOutlined, PlusOutlined,
  SwapOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import FieldVisitMap from './FieldVisitMap';
import FieldVisitExpenseModal from './FieldVisitExpenseModal';
import FieldVisitApprovalCard from './FieldVisitApprovalCard';
import { API_BASE, getAuthHeaders, TRIP_STATUS_CFG, STOP_STATUS_CFG, STOP_COLORS } from './fieldVisitUtils';

const { Text, Title, Paragraph } = Typography;

// Enrich shared trip-status dict with JSX icons for this view
const STATUS_CFG = Object.fromEntries(
  Object.entries(TRIP_STATUS_CFG).map(([k, v]) => [k, {
    ...v,
    icon: { draft: <EditOutlined />, planning: <EditOutlined />, confirmed: <CheckCircleOutlined />,
      pending_approval: <ClockCircleOutlined />, in_progress: <PlayCircleOutlined />,
      completed: <CheckCircleOutlined />, cancelled: <WarningOutlined /> }[k],
  }]),
);

const EXPENSE_CATEGORIES = [
  { value: 'flight', label: 'Flight' }, { value: 'hotel', label: 'Hotel' },
  { value: 'transport', label: 'Transport' }, { value: 'meals', label: 'Meals' },
  { value: 'visa', label: 'Visa' }, { value: 'parking', label: 'Parking' },
  { value: 'gift', label: 'Gift' }, { value: 'communication', label: 'Communication' },
  { value: 'other', label: 'Other' },
];

const FieldVisitDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState(null);
  const [completingStop, setCompletingStop] = useState(null);
  const [form] = Form.useForm();

  // Expenses
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm] = Form.useForm();
  const [savingExpense, setSavingExpense] = useState(false);

  // Adjustments
  const [adjustments, setAdjustments] = useState([]);
  const [travelReport, setTravelReport] = useState(null);
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [settlement, setSettlement] = useState(null);
  const [showSubmitApprovalModal, setShowSubmitApprovalModal] = useState(false);
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [savingDisbursement, setSavingDisbursement] = useState(false);
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [reviewingSettlement, setReviewingSettlement] = useState(false);
  const [advanceForm] = Form.useForm();
  const [disburseForm] = Form.useForm();
  const [settlementForm] = Form.useForm();
  const [settlementReviewForm] = Form.useForm();

  // Multi-currency expense modal
  const [showMultiExpenseModal, setShowMultiExpenseModal] = useState(false);

  // Role detection
  const { user } = useAuth();
  const userRole = user?.role || 'sales_rep';
  const isManager = userRole === 'admin' ||
    (['manager','sales_manager','sales_coordinator'].includes(userRole) && (user?.designation_level != null && user.designation_level >= 6));

  const getHeaders = () => getAuthHeaders();

  const loadDetail = useCallback(async () => {
    const headers = getHeaders();
    setLoading(true);
    setError('');
    try {
      const tripRes = await axios.get(`${API_BASE}/api/crm/field-trips/${id}`, { headers });
      const tripData = tripRes?.data?.data || null;
      setTrip(tripData);

      const [expRes, adjRes, settlementRes, fxRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/expenses`, { headers }),
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/adjustments`, { headers }),
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/settlement`, { headers }),
        axios.get(`${API_BASE}/api/crm/field-trips/fx-rates`, { headers }),
      ]);

      if (expRes.status === 'fulfilled') setExpenses(Array.isArray(expRes.value?.data?.data) ? expRes.value.data.data : []);
      if (adjRes.status === 'fulfilled') setAdjustments(Array.isArray(adjRes.value?.data?.data) ? adjRes.value.data.data : []);
      if (settlementRes.status === 'fulfilled') setSettlement(settlementRes.value?.data?.data || null);
      if (fxRes.status === 'fulfilled') {
        const nextBase = String(fxRes.value?.data?.base_currency || 'AED').toUpperCase();
        setBaseCurrency(nextBase);
      }

      const canLoadTravelReport = ['in_progress', 'completed'].includes(tripData?.status);
      if (!canLoadTravelReport) {
        setTravelReport(null);
      } else {
        const travelRes = await axios.get(`${API_BASE}/api/crm/field-trips/${id}/travel-report`, { headers });
        setTravelReport(travelRes?.data?.data?.report || null);
      }

      const defaultAdvanceAmount = Number(tripData?.advance_request_amount || tripData?.budget_estimate || 0) || 0;
      advanceForm.setFieldsValue({
        advance_amount: defaultAdvanceAmount,
        advance_currency: tripData?.advance_request_currency || baseCurrency,
        advance_notes: tripData?.advance_request_notes || null,
      });

      disburseForm.setFieldsValue({
        disbursed_amount: Number(tripData?.advance_approved_amount || 0) || 0,
        disbursed_currency: tripData?.advance_approved_currency || baseCurrency,
        payment_reference: tripData?.advance_disbursed_reference || null,
        notes: tripData?.advance_disbursed_notes || null,
      });

      settlementForm.setFieldsValue({
        returned_amount: Number(settlementRes.status === 'fulfilled' ? (settlementRes.value?.data?.data?.returned_amount || 0) : 0),
        returned_currency: settlementRes.status === 'fulfilled'
          ? (settlementRes.value?.data?.data?.returned_currency || baseCurrency)
          : baseCurrency,
        rep_notes: settlementRes.status === 'fulfilled'
          ? (settlementRes.value?.data?.data?.rep_notes || null)
          : null,
      });
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load trip.');
      setTrip(null);
      setTravelReport(null);
      setSettlement(null);
    } finally {
      setLoading(false);
    }
  }, [advanceForm, baseCurrency, disburseForm, id, settlementForm]);

  const handleTripStatus = async (newStatus) => {
    try {
      await axios.patch(`${API_BASE}/api/crm/field-trips/${id}`, { status: newStatus }, { headers: getHeaders() });
      message.success(`Trip status → ${newStatus.replace('_', ' ')}`);
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const handleSubmitForApproval = useCallback(async () => {
    if (!trip) return;
    setShowSubmitApprovalModal(true);
  }, [trip]);

  const confirmSubmitForApproval = async () => {
    try {
      const values = await advanceForm.validateFields();
      setSubmittingApproval(true);
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/submit-approval`,
        {
          advance_amount: values.advance_amount,
          advance_currency: values.advance_currency,
          advance_notes: values.advance_notes || null,
        },
        { headers: getHeaders() }
      );
      message.success('Trip and advance request submitted for manager approval');
      setShowSubmitApprovalModal(false);
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to submit for approval');
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleDisburseAdvance = async () => {
    try {
      const values = await disburseForm.validateFields();
      setSavingDisbursement(true);
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/advance-disburse`,
        {
          disbursed_amount: values.disbursed_amount,
          disbursed_currency: values.disbursed_currency,
          payment_reference: values.payment_reference || null,
          notes: values.notes || null,
        },
        { headers: getHeaders() }
      );
      message.success('Advance marked as disbursed');
      setShowDisburseModal(false);
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to disburse advance');
    } finally {
      setSavingDisbursement(false);
    }
  };

  const handleSaveSettlement = async (submit = false) => {
    try {
      const values = await settlementForm.validateFields();
      setSavingSettlement(true);
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/settlement`,
        {
          returned_amount: values.returned_amount || 0,
          returned_currency: values.returned_currency || baseCurrency,
          rep_notes: values.rep_notes || null,
          submit,
        },
        { headers: getHeaders() }
      );
      message.success(submit ? 'Settlement submitted to manager' : 'Settlement draft saved');
      setShowSettlementModal(false);
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save settlement');
    } finally {
      setSavingSettlement(false);
    }
  };

  const handleReviewSettlement = async (status) => {
    try {
      setReviewingSettlement(true);
      const values = settlementReviewForm.getFieldsValue(true);
      await axios.patch(
        `${API_BASE}/api/crm/field-trips/${id}/settlement/review`,
        {
          status,
          manager_comments: values.manager_comments || null,
        },
        { headers: getHeaders() }
      );
      message.success(`Settlement ${status.replace('_', ' ')}.`);
      settlementReviewForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to review settlement');
    } finally {
      setReviewingSettlement(false);
    }
  };

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleComplete = async () => {
    if (!completingStop) return;
    const values = await form.validateFields();
    try {
      await axios.post(`${API_BASE}/api/crm/field-trips/${id}/stops/${completingStop.id}/complete`, {
        outcome_status: values.outcome_status,
        outcome_notes: values.outcome_notes,
        follow_up_task: values.followUp ? {
          title: values.followup_title,
          due_date: values.followup_due ? dayjs(values.followup_due).format('YYYY-MM-DD') : null,
          priority: values.followup_priority || 'medium',
          description: values.followup_description || null,
        } : null,
      }, { headers: getHeaders() });
      message.success('Stop outcome saved');
      setCompletingStop(null);
      form.resetFields();
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to complete stop');
    }
  };

  const handleAddExpense = async () => {
    const vals = await expenseForm.validateFields();
    setSavingExpense(true);
    try {
      await axios.post(`${API_BASE}/api/crm/field-trips/${id}/expenses`, {
        category: vals.category,
        description: vals.description || null,
        amount: vals.amount,
        currency: vals.currency || 'AED',
        expense_date: vals.expense_date ? dayjs(vals.expense_date).format('YYYY-MM-DD') : null,
      }, { headers: getHeaders() });
      message.success('Expense added');
      setShowExpenseModal(false);
      expenseForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to add expense');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expId) => {
    try {
      await axios.delete(`${API_BASE}/api/crm/field-trips/${id}/expenses/${expId}`, { headers: getHeaders() });
      message.success('Expense removed');
      loadDetail();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to delete expense');
    }
  };

  const [cloning, setCloning] = useState(false);
  const handleClone = async () => {
    setCloning(true);
    try {
      const res = await axios.post(`${API_BASE}/api/crm/field-trips/${id}/clone`, {}, { headers: getHeaders() });
      if (res.data?.success) {
        message.success('Trip cloned successfully');
        navigate(`/crm/visits/${res.data.data.id}/edit`);
      }
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to clone trip');
    } finally {
      setCloning(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin size="large" /></div>;
  if (!trip) return <Alert type="error" showIcon message="Unable to open field trip" description={error || 'Trip not found or no access.'} />;

  const cfg = STATUS_CFG[trip.status] || STATUS_CFG.planning;
  const sortedStops = [...(trip.stops || [])].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
  const totalStops = sortedStops.length;
  const visitedStops = sortedStops.filter(s => s.outcome_status === 'visited').length;
  const pct = totalStops > 0 ? Math.round((visitedStops / totalStops) * 100) : 0;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const isIntl = trip.trip_type === 'international';
  const headerGradient = 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)';
  const statusStep = {
    draft: 0,
    planning: 0,
    pending_approval: 1,
    confirmed: 2,
    in_progress: travelReport?.status === 'approved' ? 5 : (travelReport?.status ? 4 : 3),
    completed: 5,
    cancelled: 5,
  }[trip.status] ?? 0;
  const settlementStatus = String(settlement?.status || 'draft');
  const financialStep = (() => {
    if (settlementStatus === 'approved') return 4;
    if (['submitted', 'revision_requested', 'rejected'].includes(settlementStatus)) return 3;
    if (trip.advance_status === 'disbursed') return 2;
    if (trip.advance_status === 'approved') return 1;
    if (trip.advance_status === 'requested') return 0;
    return 0;
  })();
  const financialStepStatus = settlementStatus === 'rejected' ? 'error' : 'process';
  const settlementStepTitle = settlementStatus === 'rejected'
    ? <span style={{ color: '#ff4d4f' }}>Settlement Rejected</span>
    : settlementStatus === 'revision_requested'
      ? <span style={{ color: '#fa8c16' }}>Settlement Revision Requested</span>
      : 'Settlement Submitted';

  return (
    <div>
      {/* Header */}
      <div style={{ background: headerGradient, borderRadius: 12, padding: '20px 28px', marginBottom: 20, color: '#fff' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined style={{ color: '#fff' }} />} onClick={() => navigate('/crm/visits')} />
            <div>
              <Title level={4} style={{ margin: 0, color: '#fff' }}>{trip.title}</Title>
              <Space size={8} style={{ marginTop: 4 }}>
                <Tag style={{ background: cfg.bg, color: cfg.color, border: 'none' }}>{cfg.icon} {cfg.label}</Tag>
                {isIntl && <Tag color="blue"><GlobalOutlined /> International</Tag>}
                {trip.country && <Tag><EnvironmentOutlined /> {trip.country}</Tag>}
              </Space>
            </div>
          </Space>
          <Space wrap>
            {['draft', 'planning'].includes(trip.status) && (
              <Button icon={<EditOutlined />} type="primary" onClick={() => navigate(`/crm/visits/${id}/edit`)}>
                Edit Trip
              </Button>
            )}
            {trip.status === 'draft' && (
              <Button onClick={() => handleTripStatus('planning')}>Finalize Draft</Button>
            )}
            {trip.status === 'planning' && !isManager && (
              <Button type="primary" style={{ background: '#722ed1' }} onClick={handleSubmitForApproval}>
                Submit for Manager Approval
              </Button>
            )}
            {trip.status === 'confirmed' && trip.advance_status === 'approved' && isManager && (
              <Button type="primary" icon={<DollarOutlined />} onClick={() => setShowDisburseModal(true)}>
                Mark Advance Disbursed
              </Button>
            )}
            {trip.status === 'confirmed' && trip.approval_decision === 'approved' && (
              <Button type="primary" onClick={() => handleTripStatus('in_progress')}>Start Trip</Button>
            )}
            {trip.status === 'in_progress' && (
              <>
                {!travelReport?.status && (
                  <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>
                    Submit Travel Report
                  </Button>
                )}
                {travelReport?.status === 'draft' && (
                  <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>
                    Submit Travel Report
                  </Button>
                )}
                {travelReport?.status === 'submitted' && <Tag color="processing">Travel Report Under Review</Tag>}
                {travelReport?.status === 'revision_requested' && (
                  <Button icon={<EditOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>
                    Revise Travel Report
                  </Button>
                )}
                {travelReport?.status === 'rejected' && (
                  <Button danger icon={<EditOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>
                    Update & Resubmit Report
                  </Button>
                )}
              </>
            )}
            {!['completed', 'cancelled'].includes(trip.status) && (
              <Popconfirm title="Cancel this trip?" onConfirm={() => handleTripStatus('cancelled')}><Button danger>Cancel</Button></Popconfirm>
            )}
          </Space>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps
          current={statusStep}
          size="small"
          items={[
            { title: 'Planning' },
            { title: 'Approval' },
            { title: 'Confirmed' },
            { title: 'In Progress' },
            { title: 'Report' },
            { title: 'Completed' },
          ]}
        />
      </Card>

      {/* Approval Card (managers, pending_approval) */}
      {trip.status === 'pending_approval' && isManager && trip.can_review_approval === false && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Approval is assigned to another manager"
          description="You can view this trip, but only the assigned manager can approve or reject it."
        />
      )}
      {trip.status === 'pending_approval' && isManager && trip.can_review_approval !== false && (
        <div style={{ marginBottom: 16 }}>
          <FieldVisitApprovalCard trip={trip} onDecision={() => loadDetail()} />
        </div>
      )}

      {/* Quick Info + Map */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card size="small">
            <Row gutter={[16, 8]}>
              <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 11 }}>Departure</Text><br /><Text strong>{trip.departure_date ? dayjs(trip.departure_date).format('DD MMM YYYY') : '—'}</Text></Col>
              <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 11 }}>Return</Text><br /><Text strong>{trip.return_date ? dayjs(trip.return_date).format('DD MMM YYYY') : '—'}</Text></Col>
              <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 11 }}>Transport</Text><br />{(() => { try { const v = trip.transport_mode ? JSON.parse(trip.transport_mode) : null; const modes = Array.isArray(v) ? v : (trip.transport_mode ? [trip.transport_mode] : []); return modes.length ? modes.map(m => <Tag key={m} style={{ marginBottom: 2, fontSize: 11 }}>{m}</Tag>) : <Text>—</Text>; } catch { return <Text>{trip.transport_mode}</Text>; }})()}</Col>
              <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 11 }}>Budget</Text><br /><Text>{trip.budget_estimate ? `${baseCurrency} ${Number(trip.budget_estimate).toLocaleString()}` : '—'}</Text></Col>
            </Row>
            {trip.objectives && <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>Objectives: {trip.objectives}</Paragraph>}
            {trip.travel_notes && <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>Travel: {trip.travel_notes}</Paragraph>}

            <Divider style={{ margin: '12px 0' }} />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Progress</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Progress percent={pct} size="small" style={{ width: 120 }} strokeColor={cfg.color} />
                  <Text style={{ fontSize: 12 }}>{visitedStops}/{totalStops} stops</Text>
                </div>
                {trip.budget_estimate > 0 && (() => {
                  const budget = Number(trip.budget_estimate);
                  const ratio = Math.min(Math.round((totalExpenses / budget) * 100), 100);
                  const color = ratio <= 75 ? '#52c41a' : ratio <= 100 ? '#faad14' : '#ff4d4f';
                  return (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Budget</Text>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Progress percent={ratio} size="small" style={{ width: 120 }} strokeColor={color} />
                        <Text style={{ fontSize: 12 }}>{baseCurrency} {totalExpenses.toLocaleString()} / {budget.toLocaleString()}</Text>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <Space>
                <Button size="small" icon={<CopyOutlined />} loading={cloning} onClick={handleClone}>Clone</Button>
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => { import('./FieldVisitItineraryExport').then(m => m.exportItineraryPDF(trip, expenses)); }}>PDF</Button>
                <Button size="small" icon={<NodeIndexOutlined />} onClick={() => navigate(`/crm/visits/${id}/route`)}>Route</Button>
                {['in_progress', 'completed'].includes(trip.status) && (
                  <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/crm/visits/${id}/report`)}>Report</Button>
                )}
                {['in_progress', 'completed'].includes(trip.status) && (
                  <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>Travel Report</Button>
                )}
                {trip.status === 'in_progress' && (
                  <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate(`/crm/visits/${id}/in-trip`)}>In-Trip</Button>
                )}
              </Space>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" styles={{ body: { padding: 0 } }}>
            {sortedStops.length > 0 ? (
              <FieldVisitMap stops={sortedStops} height={240} onOpenStop={(s) => {
                if (s.customer_id) navigate(`/crm/customers/${s.customer_id}`);
                else if (s.prospect_id) navigate(`/crm/prospects/${s.prospect_id}`);
              }} />
            ) : (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="secondary">No stops with coordinates</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Advance & Settlement" size="small" style={{ marginBottom: 16 }}>
        <Steps
          current={financialStep}
          status={financialStepStatus}
          size="small"
          style={{ marginBottom: 14 }}
          items={[
            { title: 'Requested' },
            { title: 'Approved' },
            { title: 'Disbursed' },
            { title: settlementStepTitle },
            { title: 'Settlement Approved' },
          ]}
        />

        {settlementStatus === 'rejected' && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="Settlement rejected"
            description="Manager rejected the settlement. Update details and resubmit."
          />
        )}
        {settlementStatus === 'revision_requested' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Settlement revision requested"
            description="Manager requested changes. Edit settlement and submit again."
          />
        )}

        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>Advance Status</Text><br />
            <Tag color={trip.advance_status === 'disbursed' ? 'green' : trip.advance_status === 'approved' ? 'blue' : trip.advance_status === 'requested' ? 'gold' : trip.advance_status === 'rejected' ? 'red' : 'default'}>
              {String(trip.advance_status || 'not_requested').replace('_', ' ')}
            </Tag>
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>Advance (Disbursed)</Text><br />
            <Text strong>
              {trip.advance_disbursed_amount
                ? `${trip.advance_disbursed_currency || baseCurrency} ${Number(trip.advance_disbursed_amount).toFixed(2)}`
                : '—'}
            </Text>
            {trip.advance_disbursed_base_amount != null && (
              <div><Text type="secondary" style={{ fontSize: 11 }}>Base: {baseCurrency} {Number(trip.advance_disbursed_base_amount || 0).toFixed(2)}</Text></div>
            )}
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>Settlement Status</Text><br />
            <Tag color={settlement?.status === 'approved' ? 'green' : settlement?.status === 'submitted' ? 'blue' : settlement?.status === 'revision_requested' ? 'orange' : settlement?.status === 'rejected' ? 'red' : 'default'}>
              {String(settlement?.status || 'draft').replace('_', ' ')}
            </Tag>
          </Col>
        </Row>

        {settlement && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Opening advance: {baseCurrency} {Number(settlement.opening_advance_amount || 0).toFixed(2)} ·
              Expenses: {baseCurrency} {Number(settlement.total_expenses_amount || 0).toFixed(2)} ·
              Returned: {baseCurrency} {Number(settlement.returned_base_amount || 0).toFixed(2)} ·
              Net: {baseCurrency} {Number(settlement.net_amount || 0).toFixed(2)}
            </Text>
          </div>
        )}

        <Space style={{ marginTop: 12 }} wrap>
          {trip.status === 'in_progress' && !isManager && (
            <Button type="primary" onClick={() => setShowSettlementModal(true)}>
              {settlement?.status === 'submitted' ? 'View Settlement' : 'Submit Settlement'}
            </Button>
          )}

          {isManager && settlement?.status && ['submitted', 'revision_requested'].includes(settlement.status) && (
            <Space wrap>
              <Form form={settlementReviewForm} layout="inline">
                <Form.Item name="manager_comments" style={{ marginBottom: 0 }}>
                  <Input placeholder="Manager comments" style={{ minWidth: 240 }} />
                </Form.Item>
              </Form>
              <Button type="primary" loading={reviewingSettlement} onClick={() => handleReviewSettlement('approved')}>Approve Settlement</Button>
              <Button danger loading={reviewingSettlement} onClick={() => handleReviewSettlement('rejected')}>Reject</Button>
              <Button loading={reviewingSettlement} onClick={() => handleReviewSettlement('revision_requested')}>Request Revision</Button>
            </Space>
          )}
        </Space>
      </Card>

      {/* Tabs: Stops / Expenses / Adjustments */}
      <Card>
        <Tabs defaultActiveKey="stops" items={[
          {
            key: 'stops',
            label: <span><EnvironmentOutlined /> Stops ({totalStops})</span>,
            children: (
              <>
                {sortedStops.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No stops" />
                ) : (
                  <Timeline
                    items={sortedStops.map((stop) => {
                      const name = stop.customer_name || stop.prospect_name || stop.address_snapshot || `Stop ${stop.stop_order}`;
                      const sCfg = STOP_STATUS_CFG[stop.outcome_status] || STOP_STATUS_CFG.planned;
                      const typeColor = STOP_COLORS[stop.stop_type] || STOP_COLORS.other;
                      return {
                        color: sCfg.color,
                        dot: <Badge count={stop.stop_order} style={{ backgroundColor: typeColor }} />,
                        children: (
                          <div style={{ paddingBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Space size={8}>
                                <Text strong>{name}</Text>
                                <Tag style={{ fontSize: 11 }}>{stop.stop_type}</Tag>
                                <Tag style={{ background: sCfg.color === '#8c8c8c' ? '#f5f5f5' : undefined, color: sCfg.color, border: 'none', fontSize: 11 }}>{sCfg.label}</Tag>
                              </Space>
                              {trip.status === 'in_progress' && stop.outcome_status !== 'visited' && (
                                <Button
                                  size="small"
                                  type="link"
                                  icon={<CheckCircleOutlined />}
                                  onClick={() => { setCompletingStop(stop); form.setFieldsValue({ outcome_status: 'visited', followUp: false }); }}
                                >
                                  Mark Visited
                                </Button>
                              )}
                            </div>
                            <Space size={12} wrap style={{ marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}><CalendarOutlined /> {stop.visit_date ? dayjs(stop.visit_date).format('DD MMM') : 'TBD'}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {stop.visit_time || 'TBD'}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>{stop.duration_mins || 60} min</Text>
                              {stop.contact_person && <Text type="secondary" style={{ fontSize: 12 }}>Contact: {stop.contact_person}</Text>}
                            </Space>
                            {stop.check_in_timestamp && (
                              <Tag color={Number(stop.check_in_distance_m) <= 2000 ? 'green' : 'orange'} style={{ fontSize: 10, marginTop: 4 }}>
                                GPS: {Number(stop.check_in_distance_m || 0).toFixed(0)}m away · {dayjs(stop.check_in_timestamp).format('HH:mm')}
                              </Tag>
                            )}
                            {stop.objectives && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{stop.objectives}</Text>}
                            {stop.outcome_notes && <Text style={{ display: 'block', fontSize: 12, marginTop: 2, color: '#389e0d' }}>Notes: {stop.outcome_notes}</Text>}
                            {stop.visit_notes && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>Visit Notes: {stop.visit_notes}</Text>}
                            {stop.competitor_info && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>Competitor: {stop.competitor_info}</Text>}
                            {stop.products_discussed && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>Products: {stop.products_discussed}</Text>}
                          </div>
                        ),
                      };
                    })}
                  />
                )}
              </>
            ),
          },
          {
            key: 'expenses',
            label: <span><DollarOutlined /> Expenses ({expenses.length})</span>,
            children: (
              <>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <Text strong>Total: {baseCurrency} {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                    {trip.budget_estimate && (
                      <Text type="secondary" style={{ marginLeft: 12 }}>
                        Budget: {baseCurrency} {Number(trip.budget_estimate).toLocaleString()} ({totalExpenses <= Number(trip.budget_estimate) ? 'within budget' : 'over budget'})
                      </Text>
                    )}
                  </div>
                  <Space>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => setShowExpenseModal(true)}>Quick Add</Button>
                    <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => setShowMultiExpenseModal(true)}>Multi-Currency</Button>
                  </Space>
                </Space>
                {expenses.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No expenses recorded" />
                ) : (
                  <List
                    size="small"
                    dataSource={expenses}
                    renderItem={exp => (
                      <List.Item actions={[
                        <Popconfirm key="del" title="Delete?" onConfirm={() => handleDeleteExpense(exp.id)}>
                          <Button size="small" danger type="text">Delete</Button>
                        </Popconfirm>
                      ]}>
                        <List.Item.Meta
                          title={<Space><Tag>{exp.category}</Tag><Text>{exp.description || '—'}</Text></Space>}
                          description={
                            <Space direction="vertical" size={0}>
                              <Text type="secondary">{exp.expense_date ? dayjs(exp.expense_date).format('DD MMM YYYY') : '—'} · {exp.currency || baseCurrency} {Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                              {exp.original_currency && exp.original_currency !== (exp.currency || baseCurrency) && (
                                <Text type="secondary" style={{ fontSize: 11 }}>Original: {exp.original_currency} {Number(exp.original_amount || 0).toFixed(2)} @ {Number(exp.fx_rate || 1).toFixed(4)}</Text>
                              )}
                              {exp.receipt_filename && <a href={`/uploads/trip-attachments/${exp.receipt_filename}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>View Receipt</a>}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </>
            ),
          },
          {
            key: 'adjustments',
            label: <span><HistoryOutlined /> Adjustments ({adjustments.length})</span>,
            children: adjustments.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No adjustments logged" />
            ) : (
              <Timeline
                items={adjustments.map(a => ({
                  color: 'blue',
                  children: (
                    <div>
                      <Tag>{a.adjustment_type?.replace(/_/g, ' ')}</Tag>
                      <Text>{a.description || '—'}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>{a.created_at ? dayjs(a.created_at).format('DD MMM YYYY HH:mm') : ''}</Text>
                    </div>
                  ),
                }))}
              />
            ),
          },
        ]} />
      </Card>

      {/* Complete Stop Modal */}
      <Modal
        title={completingStop ? `Complete Stop #${completingStop.stop_order}` : 'Complete Stop'}
        open={Boolean(completingStop)}
        onCancel={() => { setCompletingStop(null); form.resetFields(); }}
        onOk={handleComplete}
        okText="Save Outcome"
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="outcome_status" label="Outcome" rules={[{ required: true }]}>
            <Select options={[
              { value: 'visited', label: 'Visited' },
              { value: 'no_show', label: 'No Show' },
              { value: 'postponed', label: 'Postponed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]} />
          </Form.Item>
          <Form.Item name="outcome_notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="followUp" label="Follow-up Task?" initialValue={false}>
            <Select options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, n) => p.followUp !== n.followUp}>
            {({ getFieldValue }) => getFieldValue('followUp') ? (
              <>
                <Form.Item name="followup_title" label="Task Title" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="followup_due" label="Due Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="followup_priority" label="Priority" initialValue="medium">
                  <Select options={[{ value: 'low' }, { value: 'medium' }, { value: 'high' }]} />
                </Form.Item>
                <Form.Item name="followup_description" label="Notes"><Input.TextArea rows={2} /></Form.Item>
              </>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Expense Modal */}
      <Modal
        title="Add Expense"
        open={showExpenseModal}
        onCancel={() => { setShowExpenseModal(false); expenseForm.resetFields(); }}
        onOk={handleAddExpense}
        confirmLoading={savingExpense}
        okText="Save"
      >
        <Form form={expenseForm} layout="vertical">
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select options={EXPENSE_CATEGORIES} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Currency" initialValue="AED">
                <Select options={[{ value: 'AED' }, { value: 'USD' }, { value: 'EUR' }, { value: 'SAR' }, { value: 'KWD' }, { value: 'BHD' }, { value: 'QAR' }, { value: 'OMR' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="expense_date" label="Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="Description"><Input placeholder="e.g. Taxi to factory" /></Form.Item>
        </Form>
      </Modal>
      {/* Multi-Currency Expense Modal */}
      <FieldVisitExpenseModal tripId={trip.id} open={showMultiExpenseModal} onClose={() => setShowMultiExpenseModal(false)} onSaved={() => { setShowMultiExpenseModal(false); loadDetail(); }} />

      <Modal
        title="Submit Trip + Advance Request"
        open={showSubmitApprovalModal}
        onCancel={() => setShowSubmitApprovalModal(false)}
        onOk={confirmSubmitForApproval}
        confirmLoading={submittingApproval}
        okText="Submit to Manager"
      >
        <Form form={advanceForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Trip and requested advance will be sent together for manager approval."
          />
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="advance_amount" label="Requested Advance Amount" rules={[{ required: true, message: 'Enter requested amount' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="advance_currency" label="Currency" rules={[{ required: true, message: 'Select currency' }]}>
                <Select options={[{ value: baseCurrency, label: baseCurrency }, { value: 'USD' }, { value: 'EUR' }, { value: 'SAR' }, { value: 'KWD' }, { value: 'BHD' }, { value: 'QAR' }, { value: 'OMR' }, { value: 'INR' }, { value: 'GBP' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="advance_notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Optional note for manager/accounts" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Disburse Advance (Accounts)"
        open={showDisburseModal}
        onCancel={() => setShowDisburseModal(false)}
        onOk={handleDisburseAdvance}
        confirmLoading={savingDisbursement}
        okText="Confirm Disbursement"
      >
        <Form form={disburseForm} layout="vertical">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="disbursed_amount" label="Disbursed Amount" rules={[{ required: true, message: 'Enter disbursed amount' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="disbursed_currency" label="Currency" rules={[{ required: true, message: 'Select currency' }]}>
                <Select options={[{ value: baseCurrency, label: baseCurrency }, { value: 'USD' }, { value: 'EUR' }, { value: 'SAR' }, { value: 'KWD' }, { value: 'BHD' }, { value: 'QAR' }, { value: 'OMR' }, { value: 'INR' }, { value: 'GBP' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="payment_reference" label="Payment Reference">
            <Input placeholder="Voucher/transaction reference" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional disbursement note" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Trip Settlement"
        open={showSettlementModal}
        onCancel={() => setShowSettlementModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowSettlementModal(false)}>Cancel</Button>,
          <Button key="draft" loading={savingSettlement} onClick={() => handleSaveSettlement(false)}>Save Draft</Button>,
          <Button key="submit" type="primary" loading={savingSettlement} onClick={() => handleSaveSettlement(true)}>Submit to Manager</Button>,
        ]}
      >
        <Form form={settlementForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`Base currency: ${baseCurrency}`}
            description={`Opening advance ${baseCurrency} ${Number(settlement?.opening_advance_amount || trip?.advance_disbursed_base_amount || 0).toFixed(2)} · Total expenses ${baseCurrency} ${Number(settlement?.total_expenses_amount || totalExpenses || 0).toFixed(2)}`}
          />
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="returned_amount" label="Amount Returned to Company" rules={[{ required: true, message: 'Enter returned amount (0 if none)' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="returned_currency" label="Return Currency" rules={[{ required: true, message: 'Select return currency' }]}>
                <Select options={[{ value: baseCurrency, label: baseCurrency }, { value: 'USD' }, { value: 'EUR' }, { value: 'SAR' }, { value: 'KWD' }, { value: 'BHD' }, { value: 'QAR' }, { value: 'OMR' }, { value: 'INR' }, { value: 'GBP' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="rep_notes" label="Settlement Notes">
            <Input.TextArea rows={3} placeholder="Describe return/reimbursement context" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FieldVisitDetail;
