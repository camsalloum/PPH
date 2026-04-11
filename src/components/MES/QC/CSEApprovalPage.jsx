import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, CommentOutlined, CopyOutlined, EditOutlined, FilePdfOutlined, HistoryOutlined, PaperClipOutlined, SendOutlined, ShareAltOutlined, UserOutlined } from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const statusColor = {
  pending_qc_manager: 'purple',
  pending_production: 'orange',
  revision_requested: 'volcano',
  approved: 'green',
  rejected: 'red',
};

// F-001 + ENH-04: generate PDF with company logo and digital approval stamps
async function downloadCSEPdf(cse, parameterRows) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const mx = 14;

  // ── ENH-04: Load company logo + name ───────────────────────────────────────
  let companyName = 'ProPackHub';
  let logoDataUrl = null;
  try {
    const apiBase = import.meta.env.VITE_API_URL ?? '';
    const token = localStorage.getItem('auth_token');
    const settRes = await fetch(`${apiBase}/api/settings/company`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (settRes.ok) {
      const settJson = await settRes.json();
      companyName = settJson.companyName || companyName;
      if (settJson.logoUrl) {
        // Fetch logo as data URL for embedding in PDF
        try {
          const imgRes = await fetch(`${apiBase}${settJson.logoUrl}`);
          const blob = await imgRes.blob();
          logoDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch { /* continue without logo */ }
      }
    }
  } catch { /* continue without company info */ }

  // Blue header bar
  doc.setFillColor(24, 144, 255);
  doc.rect(0, 0, W, 18, 'F');

  // Company logo (left side of header)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'AUTO', mx, 1.5, 15, 15);
    } catch { /* skip if image format unsupported */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER SAMPLE EVALUATION REPORT', W / 2, 8, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName, W / 2, 14, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  let y = 25;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${cse.cse_number}`, mx, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Status: ${(cse.status || '').replaceAll('_', ' ').toUpperCase()}`, W - mx, y, { align: 'right' });
  y += 6;

  // Report header info table
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [240, 246, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
    body: [
      ['Inquiry', cse.inquiry_number || '-', 'Sample', cse.sample_number || '-'],
      ['Customer', cse.customer_name || '-', 'Product Group', cse.product_group || '-'],
      ['Overall Result', (cse.overall_result || '-').toUpperCase(), 'Analyzed By', cse.analyzed_by_name || '-'],
      ['Submitted At', cse.analysis_submitted_at ? new Date(cse.analysis_submitted_at).toLocaleDateString() : '-', 'Created By', cse.created_by_name || '-'],
    ],
    columns: [
      { header: 'Field', dataKey: '0' }, { header: 'Value', dataKey: '1' },
      { header: 'Field', dataKey: '2' }, { header: 'Value', dataKey: '3' },
    ],
  });
  y = doc.lastAutoTable.finalY + 7;

  // Test parameters
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Test Parameters', mx, y); y += 3;
  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255] },
    head: [['Parameter', 'Specification', 'Result', 'Unit', 'Status']],
    body: parameterRows.length > 0
      ? parameterRows.map(r => [r.name || '-', r.spec || '-', r.result || '-', r.unit || '-', (r.status || 'na').toUpperCase()])
      : [['No test parameters recorded', '', '', '', '']],
  });
  y = doc.lastAutoTable.finalY + 7;

  // Observations
  doc.setFont('helvetica', 'bold');
  doc.text('Observations & Recommendation', mx, y); y += 3;
  autoTable(doc, {
    startY: y, theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    body: [
      ['Observations', cse.analysis_observations || cse.observations || '-'],
      ['Recommendation', cse.analysis_recommendation || cse.recommendation || '-'],
    ],
  });
  y = doc.lastAutoTable.finalY + 7;

  // ── ENH-04: Digital Approval Stamps (Industry 4.0) ────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('Digital Approval Chain', mx, y); y += 3;

  const stampStatusIcon = (status) => {
    if (status === 'approved') return '\u2713 APPROVED';
    if (status === 'rejected') return '\u2717 REJECTED';
    if (status === 'revision_requested') return '\u21BA REVISION REQUESTED';
    return '\u23F3 PENDING';
  };

  const stampColor = (status) => {
    if (status === 'approved') return [39, 174, 96];
    if (status === 'rejected') return [231, 76, 60];
    if (status === 'revision_requested') return [230, 126, 34];
    return [149, 165, 166];
  };

  const stamps = [
    {
      stage: 'QC Manager Review',
      status: cse.qc_manager_status || 'pending',
      name: cse.qc_manager_name || '-',
      date: cse.qc_manager_acted_at || cse.qc_manager_approved_at,
    },
    {
      stage: 'Production Manager Approval',
      status: cse.prod_manager_status || 'pending',
      name: cse.prod_manager_name || '-',
      date: cse.prod_manager_acted_at || cse.prod_manager_approved_at,
    },
  ];

  autoTable(doc, {
    startY: y, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [240, 246, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.2, lineColor: [200, 200, 200] },
    head: [['Stage', 'Decision', 'Approver', 'Date & Time']],
    body: stamps.map((s) => [
      s.stage,
      {
        content: stampStatusIcon(s.status),
        styles: { textColor: stampColor(s.status), fontStyle: 'bold' },
      },
      s.name,
      s.date ? new Date(s.date).toLocaleString() : '-',
    ]),
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 44 },
      2: { cellWidth: 45 },
      3: { cellWidth: 45 },
    },
    didDrawCell: (data) => {
      // Draw a coloured left-border accent on the decision column
      if (data.column.index === 1 && data.section === 'body') {
        const s = stamps[data.row.index];
        const clr = stampColor(s?.status);
        doc.setDrawColor(clr[0], clr[1], clr[2]);
        doc.setLineWidth(0.8);
        doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
      }
    },
  });

  // Footer on all pages
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${new Date().toLocaleString()} \u2014 ${companyName}`, mx, 290);
    doc.text(`Page ${i} of ${pages}`, W - mx, 290, { align: 'right' });
  }

  doc.save(`${cse.cse_number}.pdf`);
}

export default function CSEApprovalPage() {
  const { cseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [notes, setNotes] = useState('');
  const [cse, setCse] = useState(null);
  const [evidenceFiles, setEvidenceFiles] = useState([]); // F-003
  const [comments, setComments] = useState([]);           // G-005
  const [revisions, setRevisions] = useState([]);          // G-006
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // H-005: public share link
  const [shareLoading, setShareLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(cse?.public_token
    ? `${window.location.origin}/mes/public/cse/${cse.public_token}` : '');

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const canAct = useMemo(() => {
    if (!cse) return false;
    const role = user?.role;
    if (cse.status === 'pending_qc_manager') return ['admin', 'manager', 'quality_control'].includes(role);
    if (cse.status === 'pending_production') return ['admin', 'manager', 'production_manager'].includes(role);
    return false;
  }, [cse, user?.role]);

  const loadCse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/cse/${cseId}`, { headers });
      const data = res.data?.data || null;
      setCse(data);
      // F-003: load QC evidence attachments for this sample
      if (data?.inquiry_id) {
        try {
          const attRes = await axios.get(`${API_BASE}/api/mes/presales/inquiries/${data.inquiry_id}/attachments`, { headers });
          const all = attRes.data?.data || [];
          setEvidenceFiles(all.filter(a => a.attachment_type === 'qc_evidence' && a.sample_id === data.sample_id));
        } catch { /* non-critical */ }
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load CSE detail');
    } finally {
      setLoading(false);
    }
  }, [cseId, headers, message]);

  useEffect(() => {
    loadCse();
  }, [loadCse]);

  // G-005: load discussion comments
  const loadComments = useCallback(async () => {
    if (!cseId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/cse/${cseId}/comments`, { headers });
      setComments(res.data?.data || []);
    } catch { /* non-critical */ }
  }, [cseId, headers]);

  // G-006: load revision history
  const loadRevisions = useCallback(async () => {
    if (!cseId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/cse/${cseId}/revisions`, { headers });
      setRevisions(res.data?.data || []);
    } catch { /* non-critical */ }
  }, [cseId, headers]);

  useEffect(() => { loadComments(); }, [loadComments]);
  useEffect(() => { loadRevisions(); }, [loadRevisions]);

  // G-005: submit a new comment
  const submitComment = async () => {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      await axios.post(`${API_BASE}/api/mes/presales/cse/${cseId}/comments`, { comment: commentText.trim() }, { headers });
      setCommentText('');
      loadComments();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to post comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const doCallAction = async (action) => {
    setActing(true);
    try {
      const res = await axios.post(`${API_BASE}/api/mes/presales/cse/${cseId}/${action}`, { notes }, { headers });
      message.success(`CSE ${action.replace('-', ' ')} successful`);
      setCse(res.data?.data || cse);
      await loadCse();
    } catch (err) {
      message.error(err.response?.data?.error || `Failed to ${action}`);
    } finally {
      setActing(false);
    }
  };

  const openShareModal = () => {
    if (cse?.public_token) {
      setShareUrl(`${window.location.origin}/mes/public/cse/${cse.public_token}`);
    } else {
      setShareUrl('');
    }
    setShareModalOpen(true);
  };

  const generateShareLink = async () => {
    setShareLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/mes/presales/cse/${cseId}/share`,
        { expiry_days: 30 },
        { headers }
      );
      const url = `${window.location.origin}/mes/public/cse/${res.data.data.public_token}`;
      setShareUrl(url);
      setCse((prev) => ({ ...prev, public_token: res.data.data.public_token, public_token_exp: res.data.data.public_token_exp }));
      message.success('Share link generated (valid 30 days)');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to generate share link');
    } finally {
      setShareLoading(false);
    }
  };

  const revokeShareLink = async () => {
    setShareLoading(true);
    try {
      await axios.delete(`${API_BASE}/api/mes/presales/cse/${cseId}/share`, { headers });
      setShareUrl('');
      setCse((prev) => ({ ...prev, public_token: null, public_token_exp: null }));
      message.success('Share link revoked');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to revoke share link');
    } finally {
      setShareLoading(false);
    }
  };

  const callAction = (action) => {
    if ((action === 'reject' || action === 'request-revision') && !notes.trim()) {
      message.warning('Please add notes before rejecting or requesting a revision.');
      return;
    }
    const labels = { approve: 'Approve', reject: 'Reject', 'request-revision': 'Request Revision' };
    Modal.confirm({
      title: `${labels[action]} this CSE?`,
      content: notes.trim() ? `Notes: "${notes.trim()}"` : 'Are you sure you want to proceed?',
      okText: labels[action],
      okButtonProps: action !== 'approve' ? { danger: true } : {},
      onOk: () => doCallAction(action),
    });
  };

  const parameterRows = Array.isArray(cse?.test_parameters)
    ? cse.test_parameters
    : Array.isArray(cse?.test_summary?.test_parameters)
      ? cse.test_summary.test_parameters
      : [];

  const parameterColumns = [
    { title: 'Parameter', dataIndex: 'name' },
    { title: 'Spec', dataIndex: 'spec' },
    { title: 'Result', dataIndex: 'result' },
    { title: 'Unit', dataIndex: 'unit', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (value) => <Tag color={value === 'pass' ? 'green' : value === 'fail' ? 'red' : 'default'}>{(value || 'na').toUpperCase()}</Tag>,
    },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!cse) return <Card><Empty description="CSE not found" /></Card>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <Space style={{ marginBottom: 10 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mes/approvals')}>Back to Approval Queue</Button>
        <Button icon={<FilePdfOutlined />} onClick={() => { downloadCSEPdf(cse, parameterRows); }}>Download PDF</Button>
        <Button icon={<ShareAltOutlined />} onClick={openShareModal}>
          {cse?.public_token ? 'Share Link' : 'Create Share Link'}
        </Button>
      </Space>

      {/* H-005: Share Modal */}
      <Modal
        title={<Space><ShareAltOutlined />Public Share Link</Space>}
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={null}
        width={540}
      >
        {!shareUrl ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ marginBottom: 16, color: '#666' }}>Generate a public link that allows anyone to view this CSE report without logging in.</p>
            <Button type="primary" icon={<ShareAltOutlined />} loading={shareLoading} onClick={generateShareLink}>
              Generate Share Link (30 days)
            </Button>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: 8, color: '#666' }}>Anyone with this link can view the report:</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Input value={shareUrl} readOnly style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
              <Button
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  message.success('Link copied!');
                }}
              >
                Copy
              </Button>
            </div>
            {cse?.public_token_exp && (
              <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
                Expires: {new Date(cse.public_token_exp).toLocaleDateString()}
              </p>
            )}
            <Space>
              <Button loading={shareLoading} onClick={generateShareLink}>Refresh Link</Button>
              <Button danger loading={shareLoading} onClick={revokeShareLink}>Revoke Link</Button>
            </Space>
          </div>
        )}
      </Modal>

      <Card style={{ marginBottom: 14 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{cse.cse_number}</Title>
            <Text type="secondary">Customer Sample Evaluation</Text>
          </div>
          <Tag color={statusColor[cse.status] || 'default'}>{cse.status?.replaceAll('_', ' ')}</Tag>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="details"
        style={{ marginBottom: 14 }}
        items={[
          {
            key: 'details',
            label: 'Details',
            children: (
              <>
                <Card title="Report Header" style={{ marginBottom: 14 }}>
                  <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                    <Descriptions.Item label="Inquiry">{cse.inquiry_number}</Descriptions.Item>
                    <Descriptions.Item label="Sample">{cse.sample_number}</Descriptions.Item>
                    <Descriptions.Item label="Customer">{cse.customer_name}</Descriptions.Item>
                    <Descriptions.Item label="Product Group">{cse.product_group}</Descriptions.Item>
                    <Descriptions.Item label="Overall Result"><Tag>{(cse.overall_result || '-').toUpperCase()}</Tag></Descriptions.Item>
                    <Descriptions.Item label="Sample Status"><Tag>{(cse.sample_status || '-').replaceAll('_', ' ')}</Tag></Descriptions.Item>
                    <Descriptions.Item label="Analyzed By">{cse.analyzed_by_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Submitted At">{cse.analysis_submitted_at ? new Date(cse.analysis_submitted_at).toLocaleString() : '-'}</Descriptions.Item>
                    <Descriptions.Item label="Created By">{cse.created_by_name || '-'}</Descriptions.Item>
                  </Descriptions>
                </Card>

                <Card title="Test Parameters" style={{ marginBottom: 14 }}>
                  <Table
                    rowKey={(_, i) => `${i}`}
                    columns={parameterColumns}
                    dataSource={parameterRows}
                    pagination={false}
                    locale={{ emptyText: <Empty description="No test parameters" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  />
                </Card>

                <Card title="Observations & Recommendation" style={{ marginBottom: 14 }}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="Observations">{cse.analysis_observations || cse.observations || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Recommendation">{cse.analysis_recommendation || cse.recommendation || '-'}</Descriptions.Item>
                  </Descriptions>
                </Card>

                {/* F-003: QC Evidence viewer */}
                <Card
                  title={<Space><PaperClipOutlined />QC Evidence ({evidenceFiles.length})</Space>}
                  style={{ marginBottom: 14 }}
                >
                  {evidenceFiles.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No QC evidence uploaded" />
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {evidenceFiles.map((f) => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                          <PaperClipOutlined style={{ color: '#1890ff' }} />
                          <Text style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</Text>
                          {f.file_size && <Text type="secondary" style={{ fontSize: 11 }}>{(f.file_size / 1024).toFixed(0)} KB</Text>}
                          <a href={`${API_BASE}${f.file_path}`} target="_blank" rel="noopener noreferrer">Open</a>
                          <a href={`${API_BASE}${f.file_path}`} download={f.file_name}>Download</a>
                        </div>
                      ))}
                    </Space>
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'discussion',
            label: <span><CommentOutlined /> Discussion ({comments.length})</span>,
            children: (
              <Card>
                {/* Existing comments */}
                <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
                  {comments.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments yet" />
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      {comments.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: 'flex', gap: 10,
                            padding: '10px 12px',
                            background: c.is_internal ? '#fffbe6' : '#fafafa',
                            border: `1px solid ${c.is_internal ? '#ffe58f' : '#f0f0f0'}`,
                            borderRadius: 6,
                          }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#1677ff22', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0, fontSize: 14, fontWeight: 700, color: '#1677ff',
                          }}>
                            {(c.user_name || 'U')[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <Space size={6}>
                              <Text strong style={{ fontSize: 13 }}>{c.user_name}</Text>
                              {c.user_role && <Tag style={{ fontSize: 11 }}>{c.user_role}</Tag>}
                              {c.is_internal && <Tag color="gold">Internal</Tag>}
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(c.created_at).toLocaleString()}
                              </Text>
                            </Space>
                            <div style={{ marginTop: 4 }}>{c.comment}</div>
                          </div>
                        </div>
                      ))}
                    </Space>
                  )}
                </div>

                {/* Add comment input */}
                <Space.Compact style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={2}
                    placeholder="Add a comment…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onPressEnter={(e) => { if (e.ctrlKey) submitComment(); }}
                    style={{ flex: 1, resize: 'none' }}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={commentLoading}
                    disabled={!commentText.trim()}
                    onClick={submitComment}
                    style={{ height: 'auto' }}
                  >
                    Post
                  </Button>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: 11 }}>Tip: Ctrl+Enter to post</Text>
              </Card>
            ),
          },
          {
            key: 'history',
            label: <span><HistoryOutlined /> Revision History ({revisions.length})</span>,
            children: (
              <Card>
                {revisions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No revision history yet" />
                ) : (
                  <Timeline
                    mode="left"
                    items={revisions.map((r) => ({
                      color:
                        r.action === 'approved'           ? 'green'
                        : r.action === 'rejected'         ? 'red'
                        : r.action === 'revision_requested' ? 'orange'
                        : 'blue',
                      label: new Date(r.created_at).toLocaleString(),
                      children: (
                        <div>
                          <Text strong style={{ textTransform: 'capitalize' }}>
                            {r.action?.replaceAll('_', ' ')}
                          </Text>
                          {r.actor_name && <Text type="secondary"> — {r.actor_name}</Text>}
                          {r.notes && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{r.notes}</div>}
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      <Card title="Approval Action">
        <Input.TextArea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Approval / rejection / revision notes"
          style={{ marginBottom: 12 }}
        />

        <Space>
          <Button type="primary" icon={<CheckOutlined />} loading={acting} disabled={!canAct} onClick={() => callAction('approve')}>
            Approve
          </Button>
          <Button danger icon={<CloseOutlined />} loading={acting} disabled={!canAct} onClick={() => callAction('reject')}>
            Reject
          </Button>
          <Button icon={<EditOutlined />} loading={acting} disabled={!canAct} onClick={() => callAction('request-revision')}>
            Request Revision
          </Button>
        </Space>
      </Card>
    </div>
  );
}
