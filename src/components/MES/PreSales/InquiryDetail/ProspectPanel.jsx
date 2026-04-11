/**
 * ProspectPanel — Company prospect registration form, summary, approve/reject.
 */
import React, { useState, useEffect } from 'react';
import {
  Card, Space, Badge, Button, Form, Input, Select, Row, Col, Empty,
  Descriptions, Modal, Typography,
} from 'antd';
import {
  UserAddOutlined, EditOutlined, SendOutlined,
  GlobalOutlined, PhoneOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { fetchCountries } from '../../../../services/countriesService';

const { Text } = Typography;
const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ProspectPanel({ inquiry, prospect, isStrictAdmin, user, message, onReload }) {
  const [showForm, setShowForm] = useState(false);
  const [savingProspect, setSavingProspect] = useState(false);
  const [approvingProspect, setApprovingProspect] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [countriesList, setCountriesList] = useState([]);
  const [prospectForm] = Form.useForm();

  // Load countries when form opens
  useEffect(() => {
    if (!showForm || countriesList.length > 0) return;
    fetchCountries()
      .then(countries => setCountriesList(countries || []))
      .catch(() => {});
  }, [showForm]);

  // Pre-fill form
  useEffect(() => {
    if (showForm && prospect) {
      prospectForm.setFieldsValue({
        company_name: prospect.customer_name,
        country: prospect.country,
        mobile_number: prospect.mobile_number,
        telephone_number: prospect.telephone_number,
      });
    } else if (showForm && inquiry) {
      prospectForm.setFieldsValue({
        company_name: inquiry.customer_name,
        country: inquiry.customer_country,
      });
    }
  }, [showForm, prospect, inquiry]);

  const handleProspectSubmit = async (values) => {
    setSavingProspect(true);
    try {
      const token = localStorage.getItem('auth_token');
      let res;
      if (prospect) {
        res = await axios.patch(
          `${API_BASE}/api/mes/presales/prospects/${prospect.id}`, values,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        res = await axios.post(
          `${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/prospect`, values,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      if (res.data.success) {
        message.success(prospect ? 'Prospect updated' : 'Prospect registered successfully.');
        setShowForm(false);
        onReload();
      } else {
        message.error(res.data.error);
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save prospect');
    } finally {
      setSavingProspect(false);
    }
  };

  const handleApprove = async () => {
    if (!prospect) return;
    setApprovingProspect(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/mes/presales/prospects/${prospect.id}/approve`, {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Prospect approved! Inquiry advanced to Qualified.');
      onReload();
    } catch (err) {
      message.error(err.response?.data?.error || 'Approval failed');
    } finally {
      setApprovingProspect(false);
    }
  };

  const handleReject = () => {
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const confirmReject = async () => {
    setRejectLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/mes/presales/prospects/${prospect.id}/reject`,
        { rejection_reason: rejectReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Prospect rejected');
      setRejectModalOpen(false);
      onReload();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to reject');
    } finally {
      setRejectLoading(false);
    }
  };

  if (inquiry.customer_type !== 'new') return null;

  return (
    <>
      <Card
        className="psi-detail-card"
        title={
          <Space>
            <UserAddOutlined />
            Company Prospect
            {prospect && (
              <Badge
                status={
                  prospect.approval_status === 'approved' ? 'success'
                  : prospect.approval_status === 'rejected' ? 'error'
                  : 'processing'
                }
                text={prospect.approval_status}
              />
            )}
          </Space>
        }
        extra={
          !prospect ? (
            <Button type="primary" icon={<SendOutlined />} size="small" onClick={() => setShowForm(true)} disabled={showForm}>
              Register Details
            </Button>
          ) : (
            <Button size="small" icon={<EditOutlined />} onClick={() => setShowForm(true)}>Edit</Button>
          )
        }
      >
        {!prospect && !showForm && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">This is a new company. Register the key contact details to proceed.</Text>}
          >
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setShowForm(true)}>
              Register Company Details
            </Button>
          </Empty>
        )}

        {/* Prospect summary */}
        {prospect && !showForm && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Company">{prospect.customer_name}</Descriptions.Item>
            {prospect.country && (
              <Descriptions.Item label="Country"><GlobalOutlined /> {prospect.country}</Descriptions.Item>
            )}
            {prospect.mobile_number && (
              <Descriptions.Item label="Mobile"><PhoneOutlined /> {prospect.mobile_number}</Descriptions.Item>
            )}
            {prospect.telephone_number && (
              <Descriptions.Item label="Telephone"><PhoneOutlined /> {prospect.telephone_number}</Descriptions.Item>
            )}
            {prospect.approval_status === 'rejected' && prospect.rejection_reason && (
              <Descriptions.Item label="Rejection Reason">
                <Text type="danger">{prospect.rejection_reason}</Text>
              </Descriptions.Item>
            )}
            {prospect.approved_by && (
              <Descriptions.Item label="Approved By">
                {prospect.approved_by} on {dayjs(prospect.approved_at).format('DD MMM YYYY')}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}

        {/* Prospect form */}
        {showForm && (
          <Form form={prospectForm} layout="vertical" onFinish={handleProspectSubmit} size="small">
            <Form.Item name="company_name" label="Company Name" rules={[{ required: true, message: 'Company name is required' }]}>
              <Input placeholder="Legal / trade name" />
            </Form.Item>
            <Form.Item name="country" label="Country">
              <Select showSearch optionFilterProp="children" placeholder="Select country..." allowClear>
                {countriesList.map(c => (
                  <Option key={c.country_name} value={c.country_name}>{c.country_name}</Option>
                ))}
              </Select>
            </Form.Item>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item name="mobile_number" label="Mobile" rules={[{ required: true, message: 'Mobile is required' }]}>
                  <Input placeholder="+971 50 123 4567" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="telephone_number" label="Telephone">
                  <Input placeholder="+971 4 123 4567" />
                </Form.Item>
              </Col>
            </Row>
            <Space>
              <Button type="primary" htmlType="submit" loading={savingProspect} icon={<SendOutlined />}>
                {prospect ? 'Update' : 'Register'}
              </Button>
              <Button onClick={() => { setShowForm(false); prospectForm.resetFields(); }}>Cancel</Button>
            </Space>
          </Form>
        )}
      </Card>

      {/* Reject Prospect Modal */}
      <Modal
        open={rejectModalOpen}
        title="Reject Prospect?"
        okText="Reject"
        okButtonProps={{ danger: true, loading: rejectLoading }}
        onOk={confirmReject}
        onCancel={() => setRejectModalOpen(false)}
        destroyOnClose
      >
        <Input.TextArea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection (optional)"
          rows={3}
          autoFocus
        />
      </Modal>
    </>
  );
}
