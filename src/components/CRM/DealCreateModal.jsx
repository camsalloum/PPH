/**
 * DealCreateModal — create a new opportunity
 * 
 * Supports three account sources:
 *  1. Existing Customer — searchable dropdown
 *  2. Prospect — from prospect pipeline
 *  3. New — quick inline entry (creates prospect first)
 *
 * Stage labels match packaging business flow:
 * Interest → Sample Analysis → Quotation → Sample Approval → Confirmed
 */
import { useState, useMemo } from 'react';
import { Modal, Form, Input, DatePicker, Select, InputNumber, App, Radio, Space, Divider, Row, Col } from 'antd';
import { UserOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import useCrmOptions from './useCrmOptions';
import { DEAL_STAGES } from './CRMDashboardUtils';
import { useCurrency } from '../../contexts/CurrencyContext';

const { TextArea } = Input;
const API = import.meta.env.VITE_API_URL ?? '';

// Use shared stage config
const STAGES = DEAL_STAGES;

export default function DealCreateModal({ open, defaultCustomerId, defaultProspectId, defaultInquiryId, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [accountSource, setAccountSource] = useState('customer'); // 'customer' | 'prospect' | 'new'
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { customers, prospects, loading: optionsLoading } = useCrmOptions(open);
  
  // Use app currency system
  const { companyCurrency, currencyMapping } = useCurrency();
  
  // Derive unique currencies from the system's currency mapping
  const currencyOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    Object.values(currencyMapping).forEach(info => {
      if (info.code && !seen.has(info.code)) {
        seen.add(info.code);
        options.push({ value: info.code, label: `${info.code} - ${info.name}` });
      }
    });
    // Sort with company currency first, then alphabetically
    options.sort((a, b) => {
      if (a.value === companyCurrency.code) return -1;
      if (b.value === companyCurrency.code) return 1;
      return a.value.localeCompare(b.value);
    });
    return options;
  }, [currencyMapping, companyCurrency.code]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      let customerId = defaultCustomerId;
      let prospectId = defaultProspectId;

      // Handle account source
      if (!defaultCustomerId && !defaultProspectId) {
        if (accountSource === 'customer') {
          customerId = values.customer_id;
        } else if (accountSource === 'prospect') {
          prospectId = values.prospect_id;
        } else if (accountSource === 'new') {
          // Create prospect first
          const prospectRes = await axios.post(`${API}/api/crm/prospects`, {
            customer_name: values.new_customer_name,
            country: values.new_country || null,
            source: 'opportunity',
          }, { headers });
          prospectId = prospectRes.data?.data?.id || prospectRes.data?.id;
        }
      }

      await axios.post(`${API}/api/crm/deals`, {
        title: values.title,
        customer_id: customerId || null,
        prospect_id: prospectId || null,
        stage: values.stage || 'interest',
        estimated_value: values.estimated_value || null,
        currency: values.currency || 'AED',
        expected_close_date: values.expected_close_date ? values.expected_close_date.format('YYYY-MM-DD') : null,
        description: values.description || null,
        inquiry_id: defaultInquiryId || null,
      }, { headers });

      message.success('Opportunity created');
      form.resetFields();
      setAccountSource('customer');
      if (onCreated) onCreated();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to create opportunity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New Opportunity"
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); setAccountSource('customer'); onClose?.(); }}
      okText="Create Opportunity"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}
        initialValues={{ stage: 'interest', currency: companyCurrency.code }}>

        <Form.Item name="title" label="Opportunity Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="e.g. Snack packaging — 3-layer barrier film" />
        </Form.Item>

        {/* Account Source Selection */}
        {!defaultCustomerId && !defaultProspectId && (
          <>
            <Form.Item label="Account Source">
              <Radio.Group value={accountSource} onChange={e => setAccountSource(e.target.value)}>
                <Space direction="vertical" size={4}>
                  <Radio value="customer"><UserOutlined /> Existing Customer</Radio>
                  <Radio value="prospect"><TeamOutlined /> From Prospect Pipeline</Radio>
                  <Radio value="new"><PlusOutlined /> New Company</Radio>
                </Space>
              </Radio.Group>
            </Form.Item>

            {accountSource === 'customer' && (
              <Form.Item name="customer_id" label="Customer" rules={[{ required: true, message: 'Select a customer' }]}>
                <Select
                  showSearch allowClear placeholder="Search customer..."
                  loading={optionsLoading}
                  options={customers}
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            )}

            {accountSource === 'prospect' && (
              <Form.Item name="prospect_id" label="Prospect" rules={[{ required: true, message: 'Select a prospect' }]}>
                <Select
                  showSearch allowClear placeholder="Search prospect..."
                  loading={optionsLoading}
                  options={prospects}
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            )}

            {accountSource === 'new' && (
              <>
                <Form.Item name="new_customer_name" label="Company Name" rules={[{ required: true, message: 'Company name is required' }]}>
                  <Input placeholder="e.g. ABC Foods LLC" />
                </Form.Item>
                <Form.Item name="new_country" label="Country">
                  <Input placeholder="e.g. UAE" />
                </Form.Item>
              </>
            )}
            <Divider style={{ margin: '12px 0' }} />
          </>
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="stage" label="Stage">
              <Select options={STAGES} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="expected_close_date" label="Expected Close" rules={[{ required: true, message: 'Required' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* Value + Currency on one row */}
        <Form.Item label="Value" style={{ marginBottom: 0 }}>
          <Form.Item name="estimated_value" style={{ display: 'inline-block', width: 'calc(65% - 8px)' }}>
            <InputNumber
              placeholder="0.00" style={{ width: '100%' }} min={0} precision={2}
              formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={v => v.replace(/,/g, '')}
            />
          </Form.Item>
          <Form.Item name="currency" style={{ display: 'inline-block', width: '35%', marginLeft: 8 }}>
            <Select
              options={currencyOptions} showSearch
              filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
        </Form.Item>

        <Form.Item name="description" label="Notes">
          <TextArea rows={2} placeholder="Additional context..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
