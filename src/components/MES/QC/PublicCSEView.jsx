/**
 * H-005: Public CSE View
 *
 * Accessed via: /mes/public/cse/:token
 * No authentication required.
 * Renders a clean, read-only CSE report using the public_token.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Card, Col, Descriptions, Empty, Result, Row,
  Spin, Table, Tag, Typography, Space,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const resultColor = { pass: 'green', fail: 'red', conditional: 'orange' };
const resultIcon  = {
  pass:        <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  fail:        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  conditional: <WarningOutlined    style={{ color: '#faad14' }} />,
};

const paramCols = [
  { title: 'Parameter', dataIndex: 'name',   width: '28%' },
  { title: 'Spec',      dataIndex: 'spec',   width: '22%' },
  { title: 'Result',    dataIndex: 'result', width: '15%' },
  { title: 'Unit',      dataIndex: 'unit',   width: '12%' },
  {
    title: 'Status',
    dataIndex: 'status',
    width: '12%',
    render: (v) => (
      <Tag color={v === 'pass' ? 'green' : v === 'fail' ? 'red' : 'default'}>
        {(v || 'N/A').toUpperCase()}
      </Tag>
    ),
  },
];

export default function PublicCSEView() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [cse, setCse] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) { setError('Invalid share link.'); setLoading(false); return; }
    axios.get(`${API_BASE}/api/mes/presales/public/cse/${token}`)
      .then((res) => {
        if (res.data.success) setCse(res.data.data);
        else setError(res.data.error || 'Report not found');
      })
      .catch((err) => {
        if (err.response?.status === 404) setError('This share link has expired or does not exist.');
        else setError('Failed to load the report. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Spin size="large" tip="Loading report…" />
      </div>
    );
  }

  if (error || !cse) {
    return (
      <Result
        status="404"
        title="Report Not Available"
        subTitle={error || 'No data found for this link.'}
      />
    );
  }

  const parameterRows = Array.isArray(cse.test_parameters)
    ? cse.test_parameters
    : Array.isArray(cse.test_summary?.test_parameters)
      ? cse.test_summary.test_parameters
      : [];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1677ff 0%, #0050b3 100%)',
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 20,
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ExperimentOutlined style={{ fontSize: 28 }} />
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              Customer Sample Evaluation Report
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
              {cse.cse_number}
            </Text>
          </div>
        </div>
        <Space size={8} wrap>
          <Tag color={resultColor[cse.overall_result] || 'default'} style={{ fontSize: 14, padding: '2px 10px' }}>
            {resultIcon[cse.overall_result]}
            {' '}{(cse.overall_result || 'N/A').toUpperCase()}
          </Tag>
          <Tag color={cse.status === 'approved' ? 'green' : 'orange'} style={{ fontSize: 14, padding: '2px 10px' }}>
            {(cse.status || '').replaceAll('_', ' ').toUpperCase()}
          </Tag>
        </Space>
      </div>

      {cse.status !== 'approved' && (
        <Alert
          type="warning"
          showIcon
          message="This report has not yet received final approval."
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Report metadata */}
      <Card title="Report Details" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Inquiry No.">{cse.inquiry_number || '-'}</Descriptions.Item>
          <Descriptions.Item label="Sample No.">{cse.sample_number || '-'}</Descriptions.Item>
          <Descriptions.Item label="Customer">{cse.customer_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Product Group">{cse.product_group || '-'}</Descriptions.Item>
          <Descriptions.Item label="Analyzed By">{cse.analyzed_by_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Submitted">
            {cse.analysis_submitted_at ? new Date(cse.analysis_submitted_at).toLocaleDateString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Test parameters */}
      <Card title="Test Parameters" style={{ marginBottom: 16 }}>
        <Table
          rowKey={(r) => `${r.name || 'param'}-${r.spec || ''}-${r.result || ''}-${r.unit || ''}`}
          columns={paramCols}
          dataSource={parameterRows}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description="No test parameters" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      {/* Observations */}
      {(cse.analysis_observations || cse.analysis_recommendation) && (
        <Card title="Observations & Recommendation" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={1}>
            {cse.analysis_observations && (
              <Descriptions.Item label="Observations">{cse.analysis_observations}</Descriptions.Item>
            )}
            {cse.analysis_recommendation && (
              <Descriptions.Item label="Recommendation">{cse.analysis_recommendation}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}

      {/* Approval chain */}
      <Card title="Approval Status" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={12}>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Text type="secondary">QC Manager</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color={cse.qc_manager_status === 'approved' ? 'green' : 'default'} style={{ fontSize: 13 }}>
                  {(cse.qc_manager_status || 'Pending').toUpperCase()}
                </Tag>
              </div>
              {cse.qc_manager_name && <Text type="secondary" style={{ fontSize: 11 }}>{cse.qc_manager_name}</Text>}
            </div>
          </Col>
          <Col xs={12}>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Text type="secondary">Production Manager</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color={cse.prod_manager_status === 'approved' ? 'green' : 'default'} style={{ fontSize: 13 }}>
                  {(cse.prod_manager_status || 'Pending').toUpperCase()}
                </Tag>
              </div>
              {cse.prod_manager_name && <Text type="secondary" style={{ fontSize: 11 }}>{cse.prod_manager_name}</Text>}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Footer */}
      <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 24 }}>
        <p>This report was shared via ProPackHub · {new Date().getFullYear()}</p>
        <p>View expires {cse.public_token_exp ? new Date(cse.public_token_exp).toLocaleDateString() : 'when revoked by the issuer'}</p>
      </div>
    </div>
  );
}
