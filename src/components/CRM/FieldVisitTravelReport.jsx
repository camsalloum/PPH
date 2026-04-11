import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, App, Button, Card, Checkbox, Col, Descriptions, Divider, Empty, Form, Input, InputNumber,
  Modal, Row, Select, Space, Spin, Statistic, Tag, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined,
  FileTextOutlined, SendOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';
import FieldVisitKPIPanel from './FieldVisitKPIPanel';
import { API_BASE, getAuthHeaders, TRAVEL_REPORT_STATUS_CFG as STATUS_CFG } from './fieldVisitUtils';

const { Title, Text, Paragraph } = Typography;

const parseAiAnalysis = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const FieldVisitTravelReport = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState(null);
  const [report, setReport] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  // Enhanced report data
  const [enhancedData, setEnhancedData] = useState(null);
  const [stopCommentModal, setStopCommentModal] = useState(null);
  const [stopComment, setStopComment] = useState('');

  // Manager review
  const [reviewForm] = Form.useForm();
  const [reviewing, setReviewing] = useState(false);
  const [reportAccessBlocked, setReportAccessBlocked] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [applyingAi, setApplyingAi] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [selectedReminderIds, setSelectedReminderIds] = useState([]);

  const getHeaders = () => getAuthHeaders();

  const { user } = useAuth();
  const userRole = user?.role || 'sales_rep';
  const isManager = userRole === 'admin' ||
    (['manager', 'sales_manager'].includes(userRole) && (user?.designation_level != null && user.designation_level >= 6));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const headers = getHeaders();
    try {
      const tripRes = await axios.get(`${API_BASE}/api/crm/field-trips/${id}`, { headers });
      const tripData = tripRes?.data?.data || null;
      setTrip(tripData);

      const canAccessReport = ['in_progress', 'completed'].includes(tripData?.status);
      setReportAccessBlocked(!canAccessReport);
      if (!canAccessReport) {
        setReport(null);
        setExpenses([]);
        setEnhancedData(null);
        form.resetFields();
        return;
      }

      const [reportRes, expRes, enhRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/travel-report`, { headers }),
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/expenses`, { headers }),
        axios.get(`${API_BASE}/api/crm/field-trips/${id}/travel-report/enhanced`, { headers }),
      ]);

      if (reportRes.status === 'fulfilled') {
        const r = reportRes.value?.data?.data || null;
        setReport(r);
        const persistedAnalysis = parseAiAnalysis(r?.ai_analysis);
        setAiAnalysis(persistedAnalysis);
        setSelectedTaskIds(Array.isArray(persistedAnalysis?.tasks) ? persistedAnalysis.tasks.map((t) => String(t.id)) : []);
        setSelectedReminderIds(Array.isArray(persistedAnalysis?.reminders) ? persistedAnalysis.reminders.map((rem) => String(rem.id)) : []);
        if (r) {
          form.setFieldsValue({
            summary: r.summary,
            key_outcomes: r.key_outcomes,
            challenges: r.challenges,
            recommendations: r.recommendations,
            next_steps: r.next_steps,
            total_expenses: r.total_expenses,
          });
        }
      }
      if (expRes.status === 'fulfilled') setExpenses(Array.isArray(expRes.value?.data?.data) ? expRes.value.data.data : []);
      if (enhRes.status === 'fulfilled') setEnhancedData(enhRes.value?.data?.data || null);
    } catch {
      setError('Failed to load travel report data.');
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (submit = false) => {
    const vals = await form.validateFields();
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/crm/field-trips/${id}/travel-report`, {
        summary: vals.summary || null,
        key_outcomes: vals.key_outcomes || null,
        challenges: vals.challenges || null,
        recommendations: vals.recommendations || null,
        next_steps: vals.next_steps || null,
        total_expenses: vals.total_expenses || null,
        submit,
      }, { headers: getHeaders() });
      message.success(submit ? 'Travel report submitted to manager!' : 'Draft saved.');
      loadData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (decision) => {
    const vals = reviewForm.getFieldsValue(true);
    setReviewing(true);
    try {
      await axios.patch(`${API_BASE}/api/crm/field-trips/${id}/travel-report/review`, {
        status: decision,
        manager_comments: vals.manager_comments || null,
      }, { headers: getHeaders() });
      message.success(`Report ${decision.replace('_', ' ')}.`);
      reviewForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to review report.');
    } finally {
      setReviewing(false);
    }
  };

  const handleGenerateAiPlan = async () => {
    const vals = form.getFieldsValue(true);
    setAnalyzingAi(true);
    try {
      const res = await axios.post(`${API_BASE}/api/crm/field-trips/${id}/travel-report/analyze`, {
        summary: vals.summary || null,
        key_outcomes: vals.key_outcomes || null,
        challenges: vals.challenges || null,
        recommendations: vals.recommendations || null,
        next_steps: vals.next_steps || null,
        save: true,
      }, { headers: getHeaders() });

      const analysis = res?.data?.data?.analysis || null;
      setAiAnalysis(analysis);
      setSelectedTaskIds(Array.isArray(analysis?.tasks) ? analysis.tasks.map((t) => String(t.id)) : []);
      setSelectedReminderIds(Array.isArray(analysis?.reminders) ? analysis.reminders.map((rem) => String(rem.id)) : []);
      message.success('AI plan generated');
      loadData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to generate AI plan');
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleApplyAiPlan = async () => {
    if (!aiAnalysis) return;
    setApplyingAi(true);
    try {
      const res = await axios.post(`${API_BASE}/api/crm/field-trips/${id}/travel-report/analyze/apply`, {
        analysis: aiAnalysis,
        selected_task_ids: selectedTaskIds,
        selected_reminder_ids: selectedReminderIds,
      }, { headers: getHeaders() });

      const createdTaskCount = Array.isArray(res?.data?.data?.created_tasks) ? res.data.data.created_tasks.length : 0;
      const createdReminderCount = Array.isArray(res?.data?.data?.created_reminders) ? res.data.data.created_reminders.length : 0;
      message.success(`Created ${createdTaskCount} task(s) and ${createdReminderCount} reminder(s)`);
      loadData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to apply AI plan');
    } finally {
      setApplyingAi(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin size="large" /></div>;

  if (reportAccessBlocked) {
    return (
      <div>
        <Alert
          type="info"
          showIcon
          message="Travel report is locked"
          description="Start the trip first, then fill visit remarks and submit the report after returning."
          style={{ marginBottom: 16 }}
        />
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/crm/visits/${id}`)}>
          Back to Trip
        </Button>
      </div>
    );
  }

  const totalExpenseAmount = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const sortedStops = trip?.stops ? [...trip.stops].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0)) : [];
  const visitedStops = sortedStops.filter(s => s.outcome_status === 'visited');
  const reportStatus = report?.status || 'draft';
  const rCfg = STATUS_CFG[reportStatus] || STATUS_CFG.draft;
  const isEditable = !report || ['draft', 'revision_requested'].includes(reportStatus);
  const isTripOwner = Number(user?.id) === Number(trip?.rep_id);

  const headerGradient = 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)';

  return (
    <div>
      {/* Header */}
      <div style={{ background: headerGradient, borderRadius: 12, padding: '20px 28px', marginBottom: 20, color: '#fff' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined style={{ color: '#fff' }} />} onClick={() => navigate(`/crm/visits/${id}`)} />
            <div>
              <Title level={4} style={{ margin: 0, color: '#fff' }}><FileTextOutlined /> Travel Report</Title>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{trip?.title || `Trip #${id}`}</Text>
            </div>
          </Space>
          <Tag style={{ background: rCfg.bg, color: rCfg.color, border: 'none', fontSize: 13, padding: '4px 12px' }}>{rCfg.label}</Tag>
        </Space>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {/* Quick Stats */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Total Stops" value={sortedStops.length} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Visited" value={visitedStops.length} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Total Expenses" value={totalExpenseAmount} precision={2} prefix="AED " valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Budget" value={trip?.budget_estimate || 0} precision={2} prefix="AED " /></Card>
        </Col>
      </Row>

      {/* Stop Outcomes Summary */}
      <Card title="Visit Outcomes Summary" size="small" style={{ marginBottom: 16 }}>
        {visitedStops.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No visited stops to summarize" />
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {visitedStops.map(stop => (
              <div key={stop.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Space>
                  <Tag color="green">#{stop.stop_order}</Tag>
                  <Text strong>{stop.customer_name || stop.prospect_name || stop.address_snapshot || `Stop ${stop.stop_order}`}</Text>
                  <Tag style={{ fontSize: 11 }}>{stop.stop_type}</Tag>
                </Space>
                {stop.outcome_notes && <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 12 }}>{stop.outcome_notes}</Paragraph>}
                {stop.products_discussed && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Products: {stop.products_discussed}</Text>}
                {stop.competitor_info && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Competitor: {stop.competitor_info}</Text>}
                {stop.next_action && <Text style={{ fontSize: 12, display: 'block', color: '#1677ff' }}>Next: {stop.next_action}</Text>}
                {isManager && (
                  <div style={{ marginTop: 4 }}>
                    {stop.manager_comment && <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Manager: {stop.manager_comment}</Text>}
                    <Button size="small" type="link" onClick={() => { setStopCommentModal(stop); setStopComment(stop.manager_comment || ''); }}>Comment</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Report Form */}
      <Card title="Report Details" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="summary" label="Trip Summary" rules={isEditable ? [{ required: true, message: 'Summary is required' }] : []}>
            <Input.TextArea rows={3} placeholder="Overall summary of the trip..." disabled={!isEditable} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="key_outcomes" label="Key Outcomes">
                <Input.TextArea rows={3} placeholder="Major achievements, deals progressed, orders taken..." disabled={!isEditable} />
              </Form.Item>
              {isEditable && enhancedData?.auto_key_outcomes && (
                <Button size="small" type="link" onClick={() => form.setFieldsValue({ key_outcomes: enhancedData.auto_key_outcomes })}>Auto-fill from stops</Button>
              )}
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="challenges" label="Challenges Faced">
                <Input.TextArea rows={3} placeholder="Issues encountered during the trip..." disabled={!isEditable} />
              </Form.Item>
              {isEditable && enhancedData?.auto_challenges && (
                <Button size="small" type="link" onClick={() => form.setFieldsValue({ challenges: enhancedData.auto_challenges })}>Auto-fill from stops</Button>
              )}
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="recommendations" label="Recommendations">
                <Input.TextArea rows={3} placeholder="Suggestions for future visits..." disabled={!isEditable} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="next_steps" label="Next Steps">
                <Input.TextArea rows={3} placeholder="Follow-up actions needed..." disabled={!isEditable} />
              </Form.Item>
              {isEditable && enhancedData?.auto_next_steps && (
                <Button size="small" type="link" onClick={() => form.setFieldsValue({ next_steps: enhancedData.auto_next_steps })}>Auto-fill from stops</Button>
              )}
            </Col>
          </Row>
          <Form.Item name="total_expenses" label="Total Expenses (AED)">
            <InputNumber style={{ width: 200 }} min={0} precision={2} disabled={!isEditable}
              placeholder={totalExpenseAmount > 0 ? String(totalExpenseAmount) : '0.00'} />
          </Form.Item>
        </Form>

        {isEditable && (
          <Space style={{ marginTop: 12 }}>
            <Button loading={saving} onClick={() => handleSave(false)}>Save Draft</Button>
            <Button type="primary" icon={<SendOutlined />} loading={saving}
              onClick={() => { handleSave(true); }}>
              Submit to Manager
            </Button>
          </Space>
        )}
      </Card>

      <Card
        title="AI Action Plan"
        style={{ marginBottom: 16 }}
        extra={isTripOwner ? (
          <Button loading={analyzingAi} onClick={handleGenerateAiPlan}>
            Generate AI Plan
          </Button>
        ) : null}
      >
        {!isTripOwner && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="AI follow-up actions are rep-owned"
            description="Only the sales rep who visited this customer can generate/apply AI tasks and reminders."
          />
        )}
        {!aiAnalysis ? (
          <Text type="secondary">Generate AI plan to get recommended actions, reminders, and follow-up tasks.</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {aiAnalysis.summary && (
              <Alert type="info" showIcon message="AI Summary" description={aiAnalysis.summary} />
            )}

            {Array.isArray(aiAnalysis.action_plan) && aiAnalysis.action_plan.length > 0 && (
              <div>
                <Text strong>Action Plan</Text>
                <ul style={{ marginTop: 8, marginBottom: 0 }}>
                  {aiAnalysis.action_plan.map((step, idx) => (
                    <li key={`plan-${idx}`}><Text>{step}</Text></li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(aiAnalysis.recommendations) && aiAnalysis.recommendations.length > 0 && (
              <div>
                <Text strong>Recommendations</Text>
                <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                  {aiAnalysis.recommendations.map((rec, idx) => (
                    <Card key={`rec-${idx}`} size="small" styles={{ body: { padding: 10 } }}>
                      <Space direction="vertical" size={2}>
                        <Space>
                          <Tag color={rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'orange' : 'blue'}>{rec.priority || 'info'}</Tag>
                          <Text strong>{rec.title}</Text>
                        </Space>
                        {rec.rationale && <Text type="secondary">{rec.rationale}</Text>}
                      </Space>
                    </Card>
                  ))}
                </Space>
              </div>
            )}

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Text strong>Suggested Tasks</Text>
                {Array.isArray(aiAnalysis.tasks) && aiAnalysis.tasks.length > 0 ? (
                  <Checkbox.Group style={{ width: '100%', marginTop: 8 }} value={selectedTaskIds} onChange={(vals) => setSelectedTaskIds(vals.map(String))}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {aiAnalysis.tasks.map((task) => (
                        <Checkbox key={String(task.id)} value={String(task.id)}>
                          <Text>{task.title}</Text>
                          {task.priority ? <Text type="secondary"> · {task.priority}</Text> : null}
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>No suggested tasks.</Text>
                )}
              </Col>

              <Col xs={24} md={12}>
                <Text strong>Suggested Reminders</Text>
                {Array.isArray(aiAnalysis.reminders) && aiAnalysis.reminders.length > 0 ? (
                  <Checkbox.Group style={{ width: '100%', marginTop: 8 }} value={selectedReminderIds} onChange={(vals) => setSelectedReminderIds(vals.map(String))}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {aiAnalysis.reminders.map((reminder) => (
                        <Checkbox key={String(reminder.id)} value={String(reminder.id)}>
                          <Text>{reminder.title}</Text>
                          {reminder.priority ? <Text type="secondary"> · {reminder.priority}</Text> : null}
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>No suggested reminders.</Text>
                )}
              </Col>
            </Row>

            <Space>
              {isTripOwner && (
                <Button
                  type="primary"
                  loading={applyingAi}
                  disabled={selectedTaskIds.length === 0 && selectedReminderIds.length === 0}
                  onClick={handleApplyAiPlan}
                >
                  Create Selected Tasks & Reminders
                </Button>
              )}
              {report?.ai_status && <Tag color="purple">AI Status: {report.ai_status}</Tag>}
            </Space>
          </Space>
        )}
      </Card>

      {/* Planned vs. Actual */}
      {enhancedData?.planned_vs_actual && enhancedData.planned_vs_actual.length > 0 && (
        <Card title="Planned vs. Actual" size="small" style={{ marginBottom: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>#</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>Stop</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>Planned Date</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>Outcome</th>
              </tr></thead>
              <tbody>
                {enhancedData.planned_vs_actual.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 8px' }}>{row.stop_order}</td>
                    <td style={{ padding: '6px 8px' }}>{row.name}</td>
                    <td style={{ padding: '6px 8px' }}>{row.visit_date ? dayjs(row.visit_date).format('DD MMM') : 'TBD'}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <Tag color={row.outcome_status === 'visited' ? 'green' : row.outcome_status === 'no_show' ? 'red' : row.outcome_status === 'postponed' ? 'orange' : 'default'}>
                        {row.outcome_status || 'planned'}
                      </Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Trip ROI & Performance */}
      {enhancedData?.roi_metrics && (
        <Card title="Trip ROI & Performance" size="small" style={{ marginBottom: 16 }}>
          <FieldVisitKPIPanel roi={enhancedData.roi_metrics} trip={trip || {}} />
        </Card>
      )}

      {/* Manager Review */}
      {report?.manager_comments && (
        <Card size="small" style={{ marginBottom: 16, borderLeft: '4px solid #fa8c16' }}>
          <Text strong>Manager Comments:</Text>
          <Paragraph style={{ marginTop: 4 }}>{report.manager_comments}</Paragraph>
          {report.reviewed_at && <Text type="secondary" style={{ fontSize: 11 }}>Reviewed: {dayjs(report.reviewed_at).format('DD MMM YYYY HH:mm')}</Text>}
        </Card>
      )}

      {isManager && report && ['submitted', 'revision_requested'].includes(reportStatus) && (
        <Card title="Manager Review" style={{ marginBottom: 16 }}>
          <Form form={reviewForm} layout="vertical">
            <Form.Item name="manager_comments" label="Comments">
              <Input.TextArea rows={3} placeholder="Feedback for the sales rep..." />
            </Form.Item>
          </Form>
          <Space>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={reviewing} onClick={() => handleReview('approved')}>
              Approve
            </Button>
            <Button danger icon={<WarningOutlined />} loading={reviewing} onClick={() => handleReview('rejected')}>
              Reject
            </Button>
            <Button icon={<ClockCircleOutlined />} loading={reviewing} onClick={() => handleReview('revision_requested')}>
              Request Revision
            </Button>
          </Space>
        </Card>
      )}

      {/* Expense Breakdown */}
      {expenses.length > 0 && (
        <Card title={<span><DollarOutlined /> Expense Breakdown</span>} size="small">
          {expenses.map(exp => (
            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
              <Space>
                <Tag>{exp.category}</Tag>
                <Text>{exp.description || '—'}</Text>
              </Space>
              <Text strong>{exp.currency || 'AED'} {Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            </div>
          ))}
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ textAlign: 'right' }}>
            <Text strong>Total: AED {totalExpenseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          </div>
        </Card>
      )}

      {/* Per-stop comment modal */}
      <Modal title={`Comment on Stop #${stopCommentModal?.stop_order || ''}`} open={Boolean(stopCommentModal)} onCancel={() => setStopCommentModal(null)}
        onOk={async () => {
          try {
            await axios.post(`${API_BASE}/api/crm/field-trips/${id}/travel-report/review-stop`, { stop_id: stopCommentModal.id, comment: stopComment }, { headers: getHeaders() });
            message.success('Comment saved');
            setStopCommentModal(null);
            loadData();
          } catch (err) { message.error(err?.response?.data?.error || 'Failed'); }
        }} okText="Save">
        <Input.TextArea rows={3} value={stopComment} onChange={e => setStopComment(e.target.value)} placeholder="Manager comment on this stop..." />
      </Modal>
    </div>
  );
};

export default FieldVisitTravelReport;
