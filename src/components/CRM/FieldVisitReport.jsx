import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Empty, Row, Space, Spin, Statistic, Typography } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const FieldVisitReport = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const loadReport = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/${id}/report`, { headers });
      setReport(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load trip report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleDownloadHtml = () => {
    const html = report?.html;
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-trip-${id}-report.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const iframe = document.querySelector('iframe[title="Field trip report preview"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    } else {
      message.info('Open the report in a new tab to print/save as PDF.');
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (!report) {
    return (
      <Alert
        type="error"
        showIcon
        message="Unable to load trip report"
        description={error || 'This report is not available yet.'}
      />
    );
  }

  const summary = report.summary || {};
  const trip = report.trip || {};

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/crm/visits/${id}`)}>
              Back to Trip
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadHtml}>
              Download HTML
            </Button>
            <Button icon={<FilePdfOutlined />} onClick={handleDownloadPdf}>
              Download PDF
            </Button>
          </Space>

          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <Title level={4} style={{ margin: 0 }}>Field Visit Report</Title>
          </Space>
          <Text type="secondary">{trip.title || `Trip #${id}`}</Text>
        </Space>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title="Total Stops" value={summary.totalStops || 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Visited" value={summary.visited || 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="No Show" value={summary.noShow || 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Postponed" value={summary.postponed || 0} /></Card></Col>
      </Row>

      <Card title="Rendered Report Preview">
        {report.html ? (
          <iframe
            title="Field trip report preview"
            srcDoc={report.html}
            style={{ width: '100%', minHeight: 560, border: '1px solid #e5e7eb', borderRadius: 8 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No report content available" />
        )}
      </Card>
    </div>
  );
};

export default FieldVisitReport;
