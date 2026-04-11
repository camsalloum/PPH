import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Timeline, Typography, message } from 'antd';
import { DownloadOutlined, EditOutlined, FileTextOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import generateCOAPdf from '../../../../utils/generateCOAPdf';

const STATUS_COLORS = {
  active: 'green',
  superseded: 'gold',
  revoked: 'red',
  expired: 'default',
};

const RESULT_COLORS = {
  passed: 'green',
  conditional: 'orange',
};

const TYPE_OPTIONS = [
  { value: 'COA', label: 'COA' },
  { value: 'COC', label: 'COC' },
  { value: 'COT', label: 'COT' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'expired', label: 'Expired' },
];

const OVERALL_RESULT_OPTIONS = [
  { value: 'passed', label: 'Passed' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'failed', label: 'Failed' },
];

const toLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const QCCertificatePanel = ({ canManage = false }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    status: undefined,
    type: undefined,
    material: '',
    supplier: '',
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueSaving, setIssueSaving] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseSaving, setReviseSaving] = useState(false);
  const [reviseTarget, setReviseTarget] = useState(null);
  const [revokeBusyId, setRevokeBusyId] = useState(null);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [issueForm] = Form.useForm();
  const [reviseForm] = Form.useForm();

  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/mes/qc/certificates', {
        params: {
          status: filters.status,
          type: filters.type,
          material: filters.material || undefined,
          supplier: filters.supplier || undefined,
          limit: 200,
          offset: 0,
        },
      });

      if (!response.data?.success) {
        message.error('Failed to load certificates');
        return;
      }

      setRows(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [filters.material, filters.status, filters.supplier, filters.type]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const openDetail = async (certificateId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const response = await axios.get(`/api/mes/qc/certificates/${certificateId}`);
      if (!response.data?.success) {
        message.error('Failed to load certificate detail');
        return;
      }
      setDetail(response.data.data || null);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load certificate detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const issueCertificate = async () => {
    try {
      const values = await issueForm.validateFields();
      setIssueSaving(true);

      const response = await axios.post('/api/mes/qc/certificates', {
        incoming_id: Number(values.incoming_id),
        reason: values.reason || 'Manual issue from certificate panel',
      });

      if (!response.data?.success) {
        message.error('Failed to issue certificate');
        return;
      }

      message.success(response.data?.existing ? 'Existing certificate returned' : 'Certificate issued');
      setIssueOpen(false);
      issueForm.resetFields();
      await fetchCertificates();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to issue certificate');
    } finally {
      setIssueSaving(false);
    }
  };

  const revokeCertificate = async (certificateId) => {
    setRevokeBusyId(certificateId);
    try {
      const response = await axios.post(`/api/mes/qc/certificates/${certificateId}/revoke`, {
        reason: 'Revoked from certificate panel',
      });
      if (!response.data?.success) {
        message.error('Failed to revoke certificate');
        return;
      }
      message.success('Certificate revoked');
      await fetchCertificates();
      if (detail?.certificate?.id === certificateId) {
        await openDetail(certificateId);
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to revoke certificate');
    } finally {
      setRevokeBusyId(null);
    }
  };

  const openReviseModal = (row) => {
    setReviseTarget(row);
    reviseForm.setFieldsValue({
      overall_result: row?.overall_result || undefined,
      conditions: row?.conditions || '',
      valid_until: row?.valid_until ? String(row.valid_until).slice(0, 10) : '',
      reason: '',
    });
    setReviseOpen(true);
  };

  const reviseCertificate = async () => {
    if (!reviseTarget?.id) return;

    try {
      const values = await reviseForm.validateFields();
      setReviseSaving(true);

      const payload = {
        overall_result: values.overall_result || undefined,
        conditions: values.conditions || undefined,
        valid_until: values.valid_until || undefined,
        reason: values.reason || 'Revised from certificate panel',
      };

      const response = await axios.post(`/api/mes/qc/certificates/${reviseTarget.id}/revise`, payload);
      if (!response.data?.success) {
        message.error('Failed to revise certificate');
        return;
      }

      message.success('Certificate revised');
      setReviseOpen(false);
      setReviseTarget(null);
      reviseForm.resetFields();
      await fetchCertificates();
      if (detail?.certificate?.id === reviseTarget.id) {
        await openDetail(reviseTarget.id);
      }
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to revise certificate');
    } finally {
      setReviseSaving(false);
    }
  };

  const downloadCertificatePdf = async (certificateId) => {
    setPdfBusyId(certificateId);
    try {
      let payload = detail?.certificate?.id === certificateId ? detail : null;

      if (!payload) {
        const response = await axios.get(`/api/mes/qc/certificates/${certificateId}`);
        if (!response.data?.success || !response.data?.data) {
          message.error('Failed to load certificate data for PDF export');
          return;
        }
        payload = response.data.data;
      }

      generateCOAPdf(payload);
      message.success('Certificate PDF downloaded');
    } catch (err) {
      message.error(err.response?.data?.error || err.message || 'Failed to export certificate PDF');
    } finally {
      setPdfBusyId(null);
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Certificate',
      key: 'certificate_number',
      width: 210,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.certificate_number || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>Rev: {row.revision_number || 1}</div>
        </div>
      ),
    },
    {
      title: 'Material',
      key: 'material',
      width: 250,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.material_code || '-'}</div>
          <div style={{ color: '#595959' }}>{row.material_name || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{row.material_type || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Batch / Lot',
      key: 'batch',
      width: 160,
      render: (_, row) => (
        <div>
          <div>{row.batch_number || '-'}</div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{row.qc_lot_id || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Result',
      key: 'overall_result',
      width: 120,
      render: (_, row) => (
        <Tag color={RESULT_COLORS[row.overall_result] || 'default'}>{toLabel(row.overall_result)}</Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <Tag color={STATUS_COLORS[row.status] || 'default'}>{toLabel(row.status)}</Tag>
      ),
    },
    {
      title: 'Issued',
      dataIndex: 'issued_date',
      key: 'issued_date',
      width: 160,
      render: (v) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 370,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => openDetail(row.id)}>
            Detail
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={pdfBusyId === row.id}
            onClick={() => downloadCertificatePdf(row.id)}
          >
            PDF
          </Button>
          {canManage && row.status !== 'revoked' && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openReviseModal(row)}
            >
              Revise
            </Button>
          )}
          {canManage && row.status !== 'revoked' && (
            <Popconfirm
              title="Revoke this certificate?"
              description="Revoked certificates remain visible in history."
              onConfirm={() => revokeCertificate(row.id)}
              okText="Revoke"
            >
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={revokeBusyId === row.id}
              >
                Revoke
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [canManage, detail?.certificate?.id, pdfBusyId, revokeBusyId]);

  return (
    <Card
      id="certificates"
      title="Incoming RM Certificates"
      size="small"
      style={{ marginBottom: 14 }}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchCertificates} loading={loading}>Refresh</Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIssueOpen(true)}>
              Issue Certificate
            </Button>
          )}
        </Space>
      }
    >
      <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
        <Select
          allowClear
          value={filters.status}
          placeholder="Filter status"
          options={STATUS_OPTIONS}
          style={{ minWidth: 180 }}
          onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
        />
        <Select
          allowClear
          value={filters.type}
          placeholder="Filter type"
          options={TYPE_OPTIONS}
          style={{ minWidth: 160 }}
          onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
        />
        <Input.Search
          allowClear
          placeholder="Search material"
          value={filters.material}
          onChange={(e) => setFilters((prev) => ({ ...prev, material: e.target.value }))}
          style={{ minWidth: 220 }}
        />
        <Input.Search
          allowClear
          placeholder="Search supplier"
          value={filters.supplier}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
          style={{ minWidth: 220 }}
        />
      </Space>

      <Table
        rowKey="id"
        dataSource={rows}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 8 }}
        scroll={{ x: 1250 }}
      />

      <Modal
        open={issueOpen}
        title="Issue Certificate from Incoming RM"
        onCancel={() => setIssueOpen(false)}
        onOk={issueCertificate}
        okText="Issue"
        confirmLoading={issueSaving}
        destroyOnHidden
      >
        <Form form={issueForm} layout="vertical">
          <Form.Item
            name="incoming_id"
            label="Incoming RM ID"
            rules={[{ required: true, message: 'Incoming RM id is required' }]}
          >
            <Input type="number" placeholder="Enter incoming RM id" />
          </Form.Item>

          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} placeholder="Optional issuance reason" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={reviseOpen}
        title={reviseTarget ? `Revise ${reviseTarget.certificate_number}` : 'Revise Certificate'}
        onCancel={() => {
          setReviseOpen(false);
          setReviseTarget(null);
        }}
        onOk={reviseCertificate}
        okText="Save Revision"
        confirmLoading={reviseSaving}
        destroyOnHidden
      >
        <Form form={reviseForm} layout="vertical">
          <Form.Item name="overall_result" label="Overall Result">
            <Select allowClear options={OVERALL_RESULT_OPTIONS} placeholder="Keep existing" />
          </Form.Item>

          <Form.Item name="conditions" label="Conditions">
            <Input.TextArea rows={3} placeholder="Optional conditional text" />
          </Form.Item>

          <Form.Item name="valid_until" label="Valid Until">
            <Input type="date" />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Revision Reason"
            rules={[{ required: true, message: 'Revision reason is required' }]}
          >
            <Input.TextArea rows={3} placeholder="Why this certificate revision is required" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        width={900}
        title="Certificate Detail"
      >
        {!detail || detailLoading ? (
          <Typography.Text type="secondary">Loading certificate details...</Typography.Text>
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Certificate #">{detail.certificate?.certificate_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Type">{detail.certificate?.certificate_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="Material">{detail.certificate?.material_code} - {detail.certificate?.material_name}</Descriptions.Item>
              <Descriptions.Item label="Type / Group">{detail.certificate?.material_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="Batch">{detail.certificate?.batch_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="QC Lot">{detail.certificate?.qc_lot_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="Supplier">{detail.certificate?.supplier_name || detail.certificate?.supplier_code || '-'}</Descriptions.Item>
              <Descriptions.Item label="Division">{detail.certificate?.division || '-'}</Descriptions.Item>
              <Descriptions.Item label="Overall Result">
                <Tag color={RESULT_COLORS[detail.certificate?.overall_result] || 'default'}>
                  {toLabel(detail.certificate?.overall_result)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[detail.certificate?.status] || 'default'}>
                  {toLabel(detail.certificate?.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Parameters Tested">{detail.certificate?.parameters_tested ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Parameters Passed">{detail.certificate?.parameters_passed ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Tested By">{detail.certificate?.tested_by_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Approved By">{detail.certificate?.approved_by_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Issued At">{formatDate(detail.certificate?.issued_date)}</Descriptions.Item>
              <Descriptions.Item label="Approved At">{formatDate(detail.certificate?.approved_at)}</Descriptions.Item>
              {detail.certificate?.conditions && (
                <Descriptions.Item label="Conditions" span={2}>{detail.certificate.conditions}</Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="Revision Timeline">
              <Timeline
                items={(detail.revisions || []).map((row) => ({
                  color: row.action === 'revoked' ? 'red' : row.action === 'revised' ? 'gold' : 'blue',
                  children: (
                    <div>
                      <div style={{ fontWeight: 600 }}>{toLabel(row.action)} (rev {row.revision_number})</div>
                      <div style={{ color: '#595959' }}>{row.reason || '-'}</div>
                      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                        {row.actor_name || '-'} | {formatDate(row.created_at)}
                      </div>
                    </div>
                  ),
                }))}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </Card>
  );
};

export default QCCertificatePanel;
