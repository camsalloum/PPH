/**
 * SamplesSection — Sample registration, list, file attachments, QR/SAR print,
 *                  submit-to-QC, recall, and per-sample CSE badges.
 */
import React, { useState, useRef } from 'react';
import {
  Card, Space, Badge, Button, Form, Input, Select, InputNumber, Row, Col,
  Radio, Tag, Tooltip, Upload, Popconfirm, Modal, Typography, Divider,
  Descriptions,
} from 'antd';
import {
  ExperimentOutlined, PlusOutlined, RollbackOutlined, SendOutlined,
  QrcodeOutlined, PrinterOutlined, DeleteOutlined, PaperClipOutlined,
  FileTextOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import axios from 'axios';
import dayjs from 'dayjs';
import { ATTACHMENT_TYPE_LABELS, SAMPLE_STATUS_CONFIG } from './constants';

const { Text, Title } = Typography;
const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function SamplesSection({
  inquiry, samples, attachments, cseReports,
  productGroups, user, message, onReload,
}) {
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [savingSample, setSavingSample] = useState(false);
  const [submittingToQC, setSubmittingToQC] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [sampleFiles, setSampleFiles] = useState([]);
  const [sampleUploadType, setSampleUploadType] = useState('tds');
  const [qrModalSample, setQrModalSample] = useState(null);
  const [sampleForm] = Form.useForm();
  const qrRef = useRef(null);

  const buildSampleFileEntry = (file, type) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    type,
  });

  const isBeforeSubmission = ['inquiry', 'sample_qc'].includes(inquiry.presales_phase);
  const registeredCount = samples.filter(s => s.status === 'registered').length;
  const allStillSentOrRegistered = samples.length > 0 && samples.every(s => ['registered', 'sent_to_qc'].includes(s.status));
  const canRecall = inquiry.presales_phase === 'sample_qc' && allStillSentOrRegistered;

  // ── Register sample ─────────────────────────────────────────────────────
  const handleRegisterSample = async (values) => {
    setSavingSample(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(
        `${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/samples`,
        values,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        const newSample = res.data.data;
        for (const sf of sampleFiles) {
          const fd = new FormData();
          fd.append('file', sf.file);
          fd.append('attachment_type', sf.type);
          fd.append('sample_id', newSample.id);
          await axios.post(
            `${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/attachments`,
            fd,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
          );
        }
        message.success(`Sample ${newSample.sample_number} registered${sampleFiles.length ? ` with ${sampleFiles.length} file(s)` : ''}`);
        setShowSampleForm(false);
        sampleForm.resetFields();
        setSampleFiles([]);
        onReload();
        setQrModalSample(newSample);
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to register sample');
    } finally {
      setSavingSample(false);
    }
  };

  // ── Submit ALL samples to QC ────────────────────────────────────────────
  const handleSubmitToQC = () => {
    Modal.confirm({
      title: 'Submit All Samples to QC?',
      icon: <SendOutlined style={{ color: '#1890ff' }} />,
      content: `This will send ${registeredCount} sample(s) to the QC Lab for analysis.`,
      okText: 'Submit to QC',
      onOk: async () => {
        setSubmittingToQC(true);
        try {
          const token = localStorage.getItem('auth_token');
          const res = await axios.post(
            `${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/submit-to-qc`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.data.success) {
            message.success(`${res.data.data.submitted_count} sample(s) submitted to QC Lab`);
            onReload();
          }
        } catch (err) {
          message.error(err.response?.data?.error || 'Failed to submit to QC');
        } finally {
          setSubmittingToQC(false);
        }
      },
    });
  };

  // ── Recall samples from QC ──────────────────────────────────────────────
  const handleRecallFromQC = () => {
    Modal.confirm({
      title: 'Recall Samples from QC?',
      icon: <RollbackOutlined style={{ color: '#fa8c16' }} />,
      content: 'This will pull back all submitted samples. Only possible if QC has not started processing.',
      okText: 'Recall',
      okButtonProps: { danger: true },
      onOk: async () => {
        setRecalling(true);
        try {
          const token = localStorage.getItem('auth_token');
          const res = await axios.post(
            `${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/recall`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.data.success) {
            message.success(`${res.data.data.recalled_count} sample(s) recalled`);
            onReload();
          }
        } catch (err) {
          message.error(err.response?.data?.error || 'Cannot recall samples');
        } finally {
          setRecalling(false);
        }
      },
    });
  };

  // ── Print QR label ──────────────────────────────────────────────────────
  const handlePrintQR = () => {
    if (!qrRef.current) return;
    const svgEl = qrRef.current.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const win = window.open('', '_blank', 'width=400,height=500');
    win.document.write(`
      <html><head><title>QR - ${qrModalSample?.sample_number}</title>
      <style>
        body { text-align:center; font-family:Arial,sans-serif; padding:20px; }
        .label { font-size:18px; font-weight:bold; margin:10px 0; }
        .sub { font-size:13px; color:#555; }
        @media print { body { padding:5mm; } }
      </style></head><body>
        ${svgData}
        <div class="label">${qrModalSample?.sample_number}</div>
        <div class="sub">${qrModalSample?.customer_name || ''}</div>
        <div class="sub">${qrModalSample?.product_group || ''}</div>
        <script>window.print(); window.onafterprint = () => window.close();<\/script>
      </body></html>
    `);
    win.document.close();
  };

  // ── Print SAR form ──────────────────────────────────────────────────────
  const handlePrintSAR = (samp) => {
    const qrUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/mes/qc/scan/${samp.sample_number}`;
    const printDate = dayjs().format('DD MMM YYYY HH:mm');
    const inquiryDate = inquiry?.inquiry_date ? dayjs(inquiry.inquiry_date).format('DD MMM YYYY') : '-';

    let companyName = 'Company';
    let logoSrc = '';
    try {
      const cached = JSON.parse(localStorage.getItem('company_settings_cache') || '{}');
      if (cached.companyName) companyName = cached.companyName;
      if (cached.logoUrl) logoSrc = `${API_BASE}${cached.logoUrl}`;
    } catch { /* fallback */ }

    let qrSvgHtml = '';
    try {
      qrSvgHtml = renderToStaticMarkup(
        React.createElement(QRCodeSVG, { value: qrUrl, size: 150, level: 'M', includeMargin: false })
      );
    } catch {
      qrSvgHtml = `<div style="width:150px;height:150px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;">QR</div>`;
    }

    const sampleTypeLabel = samp.sample_type === 'both' ? 'Physical + Digital' : samp.sample_type === 'digital' ? 'Digital Proof' : 'Physical';

    const win = window.open('', '_blank', 'width=800,height=1100');
    win.document.write(`
      <html><head><title>SAR - ${samp.sample_number}</title>
      <style>
        @page { size: A4; margin: 14mm 18mm 18mm 18mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #222; font-size: 12px; line-height: 1.5;
          max-width: 680px; margin: 0 auto;
        }
        .header {
          display: flex; justify-content: space-between; align-items: center;
          padding-bottom: 16px; margin-bottom: 20px;
          border-bottom: 2px solid #0050a0;
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header-left img { height: 48px; border-radius: 4px; }
        .company h1 { font-size: 17px; color: #0050a0; font-weight: 700; margin-bottom: 0; }
        .company .div-label { font-size: 9.5px; color: #777; text-transform: uppercase; letter-spacing: 1.8px; }
        .header-right { text-align: right; }
        .header-right .title { font-size: 14px; font-weight: 700; color: #0050a0; }
        .header-right .date { font-size: 10px; color: #999; margin-top: 3px; }
        .main { display: flex; gap: 28px; margin-bottom: 22px; }
        .main-left { flex: 1; }
        .main-right { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .qr-wrap {
          padding: 12px; background: #f7f8fa; border: 1px solid #e4e7ec;
          border-radius: 8px; text-align: center;
        }
        .qr-wrap svg { display: block; }
        .qr-text { font-size: 9px; color: #999; margin-top: 4px; }
        .sample-num-big {
          font-size: 16px; font-weight: 800; color: #cf1322; letter-spacing: 0.4px;
          text-align: center; margin-top: 2px;
        }
        .info-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        .info-table td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
        .info-table .lbl { width: 120px; font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
        .info-table .val { color: #1a1a1a; }
        .info-table .val.bold { font-weight: 600; }
        .info-table tr:last-child td { border-bottom: none; }
        .section {
          background: #f7f8fa; border: 1px solid #e4e7ec; border-radius: 8px;
          padding: 14px 16px; margin-bottom: 16px;
        }
        .section-title {
          font-size: 11px; font-weight: 700; color: #0050a0;
          text-transform: uppercase; letter-spacing: 0.8px;
          margin-bottom: 10px; padding-bottom: 6px;
          border-bottom: 1px solid #dde1e8;
        }
        .desc-box {
          background: #fff; border: 1px solid #e4e7ec; border-radius: 6px;
          padding: 10px 14px; min-height: 50px; font-size: 12px; color: #333;
        }
        .desc-box.empty { color: #bbb; font-style: italic; }
        .printed-by {
          margin-top: 24px; padding-top: 10px;
          border-top: 1.5px solid #0050a0;
          font-size: 11px; color: #444; text-align: right;
        }
        .printed-by strong { color: #222; }
        .footer {
          margin-top: 20px; padding-top: 8px; border-top: 1px solid #e8e8e8;
          display: flex; justify-content: space-between;
          font-size: 9px; color: #aaa;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      </style>
      </head><body>
        <div class="header">
          <div class="header-left">
            <img src="${logoSrc}" alt="${companyName}" />
            <div class="company">
              <h1>${companyName}</h1>
              <div class="div-label">Flexible Packaging Division</div>
            </div>
          </div>
          <div class="header-right">
            <div class="title">Sample Analysis Request</div>
            <div class="date">${printDate}</div>
          </div>
        </div>
        <div class="main">
          <div class="main-left">
            <table class="info-table">
              <tr><td class="lbl">Inquiry</td><td class="val bold">${inquiry?.inquiry_number || '-'}</td></tr>
              <tr><td class="lbl">Inquiry Date</td><td class="val">${inquiryDate}</td></tr>
              <tr><td class="lbl">Customer</td><td class="val bold">${inquiry?.customer_name || '-'}</td></tr>
              <tr><td class="lbl">Country</td><td class="val">${inquiry?.customer_country || '-'}</td></tr>
              <tr><td class="lbl">Sales Rep</td><td class="val">${inquiry?.rep_group_display || inquiry?.sales_rep_group_name || '-'}</td></tr>
              <tr><td class="lbl">Priority</td><td class="val" style="text-transform:uppercase;">${inquiry?.priority || '-'}</td></tr>
            </table>
          </div>
          <div class="main-right">
            <div class="qr-wrap">
              ${qrSvgHtml}
              <div class="qr-text">Scan to confirm receipt</div>
            </div>
            <div class="sample-num-big">${samp.sample_number}</div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Sample Details</div>
          <table class="info-table">
            <tr><td class="lbl">Product Group</td><td class="val bold">${samp.product_group || '-'}</td></tr>
            <tr><td class="lbl">Sample Type</td><td class="val">${sampleTypeLabel}</td></tr>
          </table>
        </div>
        <div class="section">
          <div class="section-title">Description / Notes</div>
          <div class="desc-box ${samp.description ? '' : 'empty'}">
            ${samp.description || 'No description provided.'}
          </div>
        </div>
        <div class="printed-by">
          Printed by: <strong>${user?.name || user?.email || '-'}</strong> on ${printDate}
        </div>
        <div class="footer">
          <span>${samp.sample_number} | ${inquiry?.inquiry_number || ''}</span>
          <span>ProPack Hub</span>
          <span>${printDate}</span>
        </div>
        <script>
          window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };
        <\/script>
      </body></html>
    `);
    win.document.close();
  };

  // ── Delete sample ───────────────────────────────────────────────────────
  const handleDeleteSample = async (samp) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(`${API_BASE}/api/mes/presales/samples/${samp.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('Sample deleted');
      onReload();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete sample');
    }
  };

  return (
    <>
      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={
          <Space>
            <ExperimentOutlined />
            Samples
            {samples.length > 0 && <Badge count={samples.length} style={{ backgroundColor: '#722ed1' }} />}
          </Space>
        }
        extra={
          <Space size="small">
            {isBeforeSubmission && !showSampleForm && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowSampleForm(true)}>
                Add New Sample
              </Button>
            )}
            {canRecall && (
              <Button size="small" icon={<RollbackOutlined />} loading={recalling} onClick={handleRecallFromQC}>
                Recall Samples
              </Button>
            )}
          </Space>
        }
      >
        {/* Registration form */}
        {showSampleForm && (
          <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
            <Form form={sampleForm} layout="vertical" onFinish={handleRegisterSample} size="small">
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="product_group" label="Product Group" rules={[{ required: true, message: 'Select a product group' }]}>
                    <Select placeholder="Select product group..." showSearch optionFilterProp="children">
                      {productGroups.map(pg => <Option key={pg.name} value={pg.name}>{pg.name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="sample_type" label="Sample Type" initialValue="physical">
                    <Radio.Group buttonStyle="solid" size="small">
                      <Radio.Button value="physical">Physical</Radio.Button>
                      <Radio.Button value="digital">Digital Proof</Radio.Button>
                      <Radio.Button value="both">Both</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </Col>

              </Row>
              <Form.Item name="description" label="Description / Notes">
                <Input.TextArea rows={2} placeholder="e.g. 250g pouch, matte finish, 24x24 pack..." />
              </Form.Item>

              {/* Attach files */}
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
                <Text strong style={{ fontSize: 12, color: '#595959' }}>
                  <PaperClipOutlined /> Attach Files (TDS, Artwork, Email correspondence, etc.)
                </Text>
                {sampleFiles.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {sampleFiles.map((sf) => (
                      <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '3px 8px', background: '#fafafa', borderRadius: 4 }}>
                        <Tag style={{ fontSize: 10, margin: 0 }}>{ATTACHMENT_TYPE_LABELS[sf.type] || sf.type}</Tag>
                        <Text ellipsis style={{ flex: 1, fontSize: 12 }}>{sf.file.name}</Text>
                        <Text type="secondary" style={{ fontSize: 10 }}>{(sf.file.size / 1024).toFixed(0)} KB</Text>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setSampleFiles(prev => prev.filter((entry) => entry.id !== sf.id))} />
                      </div>
                    ))}
                  </div>
                )}
                <Space style={{ marginTop: 8 }}>
                  <Select value={sampleUploadType} onChange={setSampleUploadType} size="small" style={{ width: 130 }}>
                    <Option value="tds">TDS</Option>
                    <Option value="artwork">Artwork</Option>
                    <Option value="email">Email</Option>
                    <Option value="specification">Specification</Option>
                    <Option value="sample_photo">Sample Photo</Option>
                    <Option value="other">Other</Option>
                  </Select>
                  <Upload
                    beforeUpload={(file) => { setSampleFiles(prev => [...prev, buildSampleFileEntry(file, sampleUploadType)]); return false; }}
                    showUploadList={false}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.svg,.webp,.zip,.rar"
                  >
                    <Button size="small" icon={<PaperClipOutlined />}>Add File</Button>
                  </Upload>
                </Space>
              </div>

              <Space>
                <Button type="primary" htmlType="submit" loading={savingSample}>Save Sample</Button>
                <Button onClick={() => { setShowSampleForm(false); sampleForm.resetFields(); setSampleFiles([]); }}>Cancel</Button>
              </Space>
            </Form>
          </Card>
        )}

        {/* Samples list */}
        {samples.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {samples.map(samp => {
              const sampleAttachments = attachments.filter(a => a.sample_id === samp.id);
              const statusCfg = SAMPLE_STATUS_CONFIG[samp.status] || {};
              return (
                <Card key={samp.id} size="small" style={{ border: '1px solid #e8e8e8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setQrModalSample(samp)}>
                        <QrcodeOutlined /> {samp.sample_number}
                      </Button>
                      <Tag color="geekblue" style={{ marginLeft: 8 }}>{samp.product_group}</Tag>
                      <Tag>{samp.sample_type}</Tag>
                      <Tag color={statusCfg.color}>{statusCfg.label || samp.status}</Tag>

                    </div>
                    <Space size="small">
                      {(samp.sample_type === 'physical' || samp.sample_type === 'both') && (
                        <Tooltip title="Print SAR form to include with physical samples">
                          <Button size="small" type="primary" ghost icon={<PrinterOutlined />} onClick={() => handlePrintSAR(samp)}>
                            Print SAR
                          </Button>
                        </Tooltip>
                      )}
                      <Button size="small" type="text" onClick={() => setQrModalSample(samp)}>
                        <QrcodeOutlined /> QR
                      </Button>
                      {isBeforeSubmission && samp.status === 'registered' && (
                        <Popconfirm
                          title="Delete this sample?"
                          description={`Remove ${samp.sample_number} and its attachments?`}
                          onConfirm={() => handleDeleteSample(samp)}
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  </div>
                  {samp.description && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{samp.description}</Text>
                  )}
                  {/* Per-sample attachments */}
                  {sampleAttachments.length > 0 && (
                    <div style={{ marginTop: 8, padding: '8px', background: '#fafafa', borderRadius: 6 }}>
                      <Text strong style={{ fontSize: 11, color: '#8c8c8c' }}>
                        <PaperClipOutlined /> {sampleAttachments.length} attached file{sampleAttachments.length !== 1 ? 's' : ''}
                      </Text>
                      {sampleAttachments.map(att => (
                        <div key={att.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                          padding: '4px 8px', background: '#fff', borderRadius: 4,
                          border: '1px solid #f0f0f0',
                        }}>
                          <FileTextOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                          <a
                            href={`${API_BASE}${att.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {att.file_name}
                          </a>
                          <Tag style={{ fontSize: 10 }}>{ATTACHMENT_TYPE_LABELS[att.attachment_type] || att.attachment_type}</Tag>
                          {att.file_size && <Text type="secondary" style={{ fontSize: 10 }}>{(att.file_size / 1024).toFixed(0)} KB</Text>}
                          <a href={`${API_BASE}${att.file_path}`} download={att.file_name} title="Download">
                            <DownloadOutlined style={{ fontSize: 12, color: '#1890ff' }} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* F-005: CSE report status */}
                  {(() => {
                    const cse = cseReports.find(c => c.sample_id === samp.id);
                    if (!cse) return null;
                    const resultColor = { pass: 'green', fail: 'red', conditional: 'orange' }[cse.overall_result] || 'default';
                    const statusLabel = {
                      pending_qc_manager: 'Pending QC Review',
                      pending_production: 'Pending Production',
                      approved: 'Approved',
                      rejected: 'Rejected',
                      revision_requested: 'Needs Revision',
                    }[cse.status] || cse.status;
                    return (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f9ff', borderRadius: 6, border: '1px solid #d6e4ff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <FileTextOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                          <Text strong style={{ fontSize: 12 }}>CSE: {cse.cse_number}</Text>
                          {cse.overall_result && (
                            <Tag color={resultColor} style={{ fontSize: 10 }}>{cse.overall_result.toUpperCase()}</Tag>
                          )}
                          <Tag color={cse.status === 'approved' ? 'green' : cse.status === 'rejected' ? 'red' : 'blue'} style={{ fontSize: 10 }}>
                            {statusLabel}
                          </Tag>
                          {cse.qc_manager_status && (
                            <Tooltip title={`QC Manager: ${cse.qc_manager_status}`}>
                              <Tag color={cse.qc_manager_status === 'approved' ? 'green' : cse.qc_manager_status === 'rejected' ? 'red' : 'gold'} style={{ fontSize: 10 }}>QC</Tag>
                            </Tooltip>
                          )}
                          {cse.prod_manager_status && (
                            <Tooltip title={`Production: ${cse.prod_manager_status}`}>
                              <Tag color={cse.prod_manager_status === 'approved' ? 'green' : cse.prod_manager_status === 'rejected' ? 'red' : 'gold'} style={{ fontSize: 10 }}>Prod</Tag>
                            </Tooltip>
                          )}
                          <a href={`/mes/qc/cse/${cse.id}`} style={{ marginLeft: 'auto', fontSize: 11 }}>View CSE →</a>
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              );
            })}

            {/* Submit All to QC */}
            {isBeforeSubmission && registeredCount > 0 && !showSampleForm && (
              <Button
                type="primary"
                size="large"
                block
                icon={<SendOutlined />}
                loading={submittingToQC}
                onClick={handleSubmitToQC}
                style={{ marginTop: 4, height: 48, fontWeight: 600, fontSize: 15 }}
              >
                Submit {registeredCount} Sample{registeredCount !== 1 ? 's' : ''} to QC Lab
              </Button>
            )}
          </div>
        ) : !showSampleForm && (
          <Text type="secondary">No samples registered yet. Click &quot;Register Sample&quot; to add one.</Text>
        )}
      </Card>

      {/* ══ QR Code Modal ══ */}
      <Modal
        open={!!qrModalSample}
        onCancel={() => setQrModalSample(null)}
        title={`QR Code — ${qrModalSample?.sample_number}`}
        footer={[
          <Button key="cancel" onClick={() => setQrModalSample(null)}>Close</Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrintQR}>
            Print QR Label
          </Button>,
        ]}
      >
        {qrModalSample && (
          <div style={{ textAlign: 'center', padding: 20 }} ref={qrRef}>
            <QRCodeSVG
              value={`${import.meta.env.VITE_APP_URL || window.location.origin}/mes/qc/scan/${qrModalSample.sample_number}`}
              size={200}
              level="H"
              includeMargin
            />
            <div style={{ marginTop: 12 }}>
              <Title level={4} style={{ margin: 0 }}>{qrModalSample.sample_number}</Title>
              <Text>{qrModalSample.customer_name}</Text>
              <br />
              <Tag color="geekblue">{qrModalSample.product_group}</Tag>
              <Tag>{qrModalSample.sample_type}</Tag>
            </div>
            <Divider />
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Tag color={SAMPLE_STATUS_CONFIG[qrModalSample.status]?.color}>
                  {SAMPLE_STATUS_CONFIG[qrModalSample.status]?.label || qrModalSample.status}
                </Tag>
              </Descriptions.Item>
              {qrModalSample.description && (
                <Descriptions.Item label="Description">{qrModalSample.description}</Descriptions.Item>
              )}
              <Descriptions.Item label="Created">
                {dayjs(qrModalSample.created_at).format('DD MMM YYYY HH:mm')}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </>
  );
}
