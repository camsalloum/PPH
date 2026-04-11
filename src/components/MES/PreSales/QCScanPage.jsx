/**
 * QCScanPage — Landing page after scanning a sample QR code.
 * Route: /mes/qc/scan/:sampleNumber
 *
 * Shows sample details, linked TDS files, and lets QC:
 *  - Mark as received
 *  - Start testing
 *  - Navigate to the full analysis form for result submission
 */

import React, { useState, useEffect } from 'react';
import {
  App, Card, Descriptions, Tag, Space, Button, Typography, Spin, Badge,
  Divider, Alert, Result
} from 'antd';
import {
  ExperimentOutlined, FileTextOutlined, CheckCircleOutlined,
  CloseCircleOutlined, QrcodeOutlined, ArrowLeftOutlined,
  DownloadOutlined, PlayCircleOutlined, InboxOutlined
} from '@ant-design/icons';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { QC_ROLES } from '../../../utils/roleConstants';
import SampleProgressSteps from '../shared/SampleProgressSteps';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const SAMPLE_STATUS_CONFIG = {
  registered:      { color: 'blue',       label: 'Registered' },
  sent_to_qc:      { color: 'orange',     label: 'Sent to QC' },
  received_by_qc:  { color: 'purple',     label: 'Received by QC' },
  testing:         { color: 'processing',  label: 'Testing' },
  tested:          { color: 'cyan',        label: 'Tested' },
  approved:        { color: 'green',       label: 'Approved' },
  rejected:        { color: 'red',         label: 'Rejected' },
};

export default function QCScanPage() {
  const { sampleNumber } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { message } = App.useApp();
  const isQC = QC_ROLES.includes((user?.role ?? '').toLowerCase())
    || /\b(qc|quality)\b/i.test(user?.designation ?? '')
    || /\b(qc|quality)\b/i.test(user?.department ?? user?.employee_department ?? '');

  const [loading, setLoading] = useState(true);
  const [sample, setSample] = useState(null);
  const [tdsAttachments, setTdsAttachments] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const loadSample = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/api/mes/presales/samples/by-number/${sampleNumber}`,
        { headers }
      );
      if (res.data.success) {
        setSample(res.data.data.sample);
        setTdsAttachments(res.data.data.tds_attachments || []);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        message.error('Failed to load sample');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSample(); }, [sampleNumber]);

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true);
    try {
      await axios.patch(
        `${API_BASE}/api/mes/presales/samples/${sample.id}/status`,
        { status: newStatus },
        { headers }
      );
      message.success(`Sample → ${newStatus.replace(/_/g, ' ')}`);
      loadSample();
    } catch (err) {
      message.error(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };



  if (user && !isQC) return <Navigate to="/mes" replace />;

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  if (notFound) {
    return (
      <Result
        status="404"
        title="Sample Not Found"
        subTitle={`No sample found with number: ${sampleNumber}`}
        extra={<Button onClick={() => navigate('/mes')}>Back to MES</Button>}
      />
    );
  }

  const isFinal = ['approved', 'rejected', 'tested'].includes(sample.status);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={() => navigate('/mes/qc')}
        style={{ marginBottom: 16 }}
      >
        Back to QC Dashboard
      </Button>

      <Card>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <QrcodeOutlined style={{ fontSize: 36, color: '#722ed1' }} />
          <Title level={3} style={{ margin: '8px 0 4px' }}>{sample.sample_number}</Title>
          <Tag color={SAMPLE_STATUS_CONFIG[sample.status]?.color} style={{ fontSize: 14, padding: '4px 12px' }}>
            {SAMPLE_STATUS_CONFIG[sample.status]?.label || sample.status}
          </Tag>
        </div>

        {/* G-007: shared 7-step progress tracker */}
        <SampleProgressSteps sample={sample} size="small" style={{ marginBottom: 24 }} />

        {/* Final result badge */}
        {sample.qc_result && (
          <Alert
            type={sample.qc_result === 'pass' ? 'success' : sample.qc_result === 'fail' ? 'error' : 'warning'}
            showIcon
            icon={sample.qc_result === 'pass' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={`QC Result: ${sample.qc_result.toUpperCase()}`}
            description={sample.qc_notes || undefined}
            style={{ marginBottom: 16 }}
          />
        )}

        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
          <Descriptions.Item label="Inquiry">{sample.inquiry_number}</Descriptions.Item>
          <Descriptions.Item label="Customer">{sample.customer_name}</Descriptions.Item>
          <Descriptions.Item label="Product Group">
            <Tag color="geekblue">{sample.product_group}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Sample Type">
            <Tag>{sample.sample_type}</Tag>
          </Descriptions.Item>
          {sample.description && (
            <Descriptions.Item label="Description" span={2}>
              {sample.description}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Registered">
            {sample.created_by_name} · {dayjs(sample.created_at).format('DD MMM YYYY HH:mm')}
          </Descriptions.Item>
          {sample.received_at && (
            <Descriptions.Item label="Received by QC">
              {sample.received_by_qc_name} · {dayjs(sample.received_at).format('DD MMM YYYY HH:mm')}
            </Descriptions.Item>
          )}
          {sample.qc_started_at && (
            <Descriptions.Item label="Testing Started">
              {dayjs(sample.qc_started_at).format('DD MMM YYYY HH:mm')}
            </Descriptions.Item>
          )}
          {sample.qc_completed_at && (
            <Descriptions.Item label="Testing Completed">
              {dayjs(sample.qc_completed_at).format('DD MMM YYYY HH:mm')}
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* TDS / Specification attachments */}
        {tdsAttachments.length > 0 && (
          <>
            <Divider orientation="left">
              <FileTextOutlined /> TDS & Specifications
            </Divider>
            <Space direction="vertical" style={{ width: '100%' }}>
              {tdsAttachments.map(a => (
                <Card key={a.id} size="small" hoverable
                  onClick={() => window.open(`${API_BASE}${a.file_path}`, '_blank')}
                  style={{ cursor: 'pointer' }}
                >
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                      <FileTextOutlined style={{ color: '#1890ff' }} />
                      <Text>{a.file_name}</Text>
                      <Tag>{a.attachment_type?.toUpperCase()}</Tag>
                      {a.file_size && <Text type="secondary">{(a.file_size / 1024).toFixed(1)} KB</Text>}
                    </Space>
                    <a
                      href={`${API_BASE}${a.file_path}`}
                      download={a.file_name}
                      onClick={e => e.stopPropagation()}
                      title="Download"
                    >
                      <DownloadOutlined style={{ color: '#1890ff' }} />
                    </a>
                  </Space>
                </Card>
              ))}
            </Space>
          </>
        )}

        {/* ── Action buttons ── */}
        <Divider />

        {sample.status === 'sent_to_qc' && (
          <div style={{ textAlign: 'center' }}>
            <Button
              type="primary"
              size="large"
              icon={<InboxOutlined />}
              loading={actionLoading}
              onClick={() => handleStatusChange('received_by_qc')}
            >
              Mark as Received
            </Button>
          </div>
        )}

        {sample.status === 'received_by_qc' && (
          <div style={{ textAlign: 'center' }}>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              loading={actionLoading}
              onClick={() => handleStatusChange('testing')}
            >
              Start Testing
            </Button>
          </div>
        )}

        {sample.status === 'testing' && (
          <div style={{ textAlign: 'center' }}>
            <Alert
              type="info"
              message="Sample is in testing"
              description="Complete the full analysis form to submit results and generate a CSE report."
              style={{ marginBottom: 16 }}
            />
            <Button
              type="primary"
              size="large"
              icon={<ExperimentOutlined />}
              onClick={() => navigate(`/mes/qc/samples/${sample.id}`)}
            >
              Open Analysis Form →
            </Button>
          </div>
        )}

        {isFinal && !sample.qc_result && (
          <Alert message="This sample has completed its workflow." type="info" showIcon />
        )}
      </Card>
    </div>
  );
}
