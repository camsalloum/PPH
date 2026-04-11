/**
 * Authorization Rules Manager Component
 * Manage document-level authorization rules and approval workflows
 * Part of: User Management Module Implementation - Phase 5
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Row, Col, Tooltip, Typography, InputNumber,
  Descriptions, Divider, Switch, Badge, Tabs, Timeline, Alert
} from 'antd';
import {
  SafetyCertificateOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  SaveOutlined, FileProtectOutlined, AuditOutlined, UserOutlined,
  DollarOutlined, TeamOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Text, Title } = Typography;
const { TabPane } = Tabs;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Document types that can have authorization rules
const DOCUMENT_TYPES = [
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'budget', label: 'Budget' },
  { value: 'discount', label: 'Discount Request' },
  { value: 'credit_note', label: 'Credit Note' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'expense', label: 'Expense Claim' }
];

// Conditions for rules
const CONDITION_FIELDS = {
  sales_order: ['total_amount', 'discount_percent', 'customer_type'],
  budget: ['amount', 'variance_percent', 'category'],
  discount: ['discount_percent', 'total_value'],
  credit_note: ['amount'],
  quotation: ['total_amount', 'margin_percent'],
  expense: ['amount', 'category']
};

const AuthorizationRulesManager = ({ onRefresh }) => {
  const [rules, setRules] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ruleModalVisible, setRuleModalVisible] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('sales_order');
  const [form] = Form.useForm();

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rulesRes, pendingRes, usersRes, rolesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/authorization/rules`, { headers }),
        axios.get(`${API_BASE_URL}/api/authorization/approvals/pending`, { headers }),
        axios.get(`${API_BASE_URL}/api/users`, { headers }),
        axios.get(`${API_BASE_URL}/api/roles`, { headers })
      ]);

      if (rulesRes.data.success) setRules(rulesRes.data.rules);
      if (pendingRes.data.success) setPendingApprovals(pendingRes.data.approvals);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (rolesRes.data.success) setRoles(rolesRes.data.roles);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load authorization rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle create/update rule
  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const payload = {
        ...values,
        condition_value: parseFloat(values.condition_value)
      };

      if (editRule) {
        await axios.put(
          `${API_BASE_URL}/api/authorization/rules/${editRule.id}`,
          payload,
          { headers }
        );
        message.success('Rule updated successfully');
      } else {
        await axios.post(
          `${API_BASE_URL}/api/authorization/rules`,
          payload,
          { headers }
        );
        message.success('Rule created successfully');
      }

      setRuleModalVisible(false);
      form.resetFields();
      setEditRule(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Operation failed');
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(
        `${API_BASE_URL}/api/authorization/rules/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Rule deleted');
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to delete');
    }
  };

  // Handle approval action
  const handleApproval = async (approvalId, action, comments = '') => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/authorization/approvals/${approvalId}/${action}`,
        { comments },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success(`Request ${action}d successfully`);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.error || 'Action failed');
    }
  };

  // Open edit modal
  const handleEdit = (record) => {
    setEditRule(record);
    setSelectedDocType(record.document_type);
    form.setFieldsValue({
      document_type: record.document_type,
      condition_field: record.condition_field,
      condition_operator: record.condition_operator,
      condition_value: record.condition_value,
      approver_role: record.approver_role,
      approver_user_id: record.approver_user_id,
      priority: record.priority,
      is_active: record.is_active
    });
    setRuleModalVisible(true);
  };

  // Rules table columns
  const ruleColumns = [
    {
      title: 'Document Type',
      dataIndex: 'document_type',
      key: 'document_type',
      render: (type) => (
        <Tag color="blue">
          <FileProtectOutlined /> {type.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
      filters: DOCUMENT_TYPES.map(d => ({ text: d.label, value: d.value })),
      onFilter: (value, record) => record.document_type === value
    },
    {
      title: 'Condition',
      key: 'condition',
      render: (_, record) => (
        <Space>
          <Text code>{record.condition_field}</Text>
          <Tag>{record.condition_operator}</Tag>
          <Text strong>{record.condition_value?.toLocaleString()}</Text>
        </Space>
      )
    },
    {
      title: 'Approver',
      key: 'approver',
      render: (_, record) => (
        record.approver_user_id ? (
          <Space>
            <UserOutlined />
            {users.find(u => u.id === record.approver_user_id)?.username || 'Unknown'}
          </Space>
        ) : (
          <Space>
            <TeamOutlined />
            <Tag color="purple">{record.approver_role}</Tag>
          </Space>
        )
      )
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => (a.priority || 0) - (b.priority || 0)
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Tag color={record.is_active ? 'green' : 'default'}>
          {record.is_active ? 'Active' : 'Inactive'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this rule?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Pending approvals columns
  const approvalColumns = [
    {
      title: 'Request',
      key: 'request',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.document_type?.replace('_', ' ')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            #{record.document_id}
          </Text>
        </Space>
      )
    },
    {
      title: 'Requested By',
      dataIndex: 'requester_name',
      key: 'requester'
    },
    {
      title: 'Value',
      key: 'value',
      render: (_, record) => (
        <Text strong>
          <DollarOutlined /> {record.value?.toLocaleString()}
        </Text>
      )
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const colors = {
          pending: 'orange',
          approved: 'green',
          rejected: 'red'
        };
        const icons = {
          pending: <ClockCircleOutlined />,
          approved: <CheckCircleOutlined />,
          rejected: <CloseCircleOutlined />
        };
        return (
          <Tag color={colors[record.status]} icon={icons[record.status]}>
            {record.status?.toUpperCase()}
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        record.status === 'pending' ? (
          <Space size="small">
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleApproval(record.id, 'approve')}
            >
              Approve
            </Button>
            <Popconfirm
              title="Reject this request?"
              onConfirm={() => handleApproval(record.id, 'reject')}
            >
              <Button size="small" danger icon={<CloseCircleOutlined />}>
                Reject
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary">
            {record.status === 'approved' ? 'Approved' : 'Rejected'} by {record.approver_name}
          </Text>
        )
      )
    }
  ];

  return (
    <div className="authorization-rules-manager">
      <Tabs defaultActiveKey="rules">
        <TabPane
          tab={
            <span>
              <SafetyCertificateOutlined /> Authorization Rules
              <Badge count={rules.filter(r => r.is_active).length} style={{ marginLeft: 8 }} />
            </span>
          }
          key="rules"
        >
          <Card
            size="small"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditRule(null);
                  form.resetFields();
                  setRuleModalVisible(true);
                }}
              >
                Add Rule
              </Button>
            }
          >
            <Alert
              type="info"
              message="Authorization Rules"
              description="Rules define when documents require approval. When a condition is met, the document is routed to the specified approver."
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              columns={ruleColumns}
              dataSource={rules}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <ClockCircleOutlined /> Pending Approvals
              <Badge
                count={pendingApprovals.filter(a => a.status === 'pending').length}
                style={{ marginLeft: 8, backgroundColor: '#faad14' }}
              />
            </span>
          }
          key="pending"
        >
          <Card size="small">
            <Table
              columns={approvalColumns}
              dataSource={pendingApprovals}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <AuditOutlined /> Approval History
            </span>
          }
          key="history"
        >
          <Card size="small">
            <Timeline>
              {pendingApprovals
                .filter(a => a.status !== 'pending')
                .slice(0, 10)
                .map(a => (
                  <Timeline.Item
                    key={a.id}
                    color={a.status === 'approved' ? 'green' : 'red'}
                  >
                    <p>
                      <Tag color={a.status === 'approved' ? 'green' : 'red'}>
                        {a.status?.toUpperCase()}
                      </Tag>
                      <Text strong>{a.document_type?.replace('_', ' ')}</Text>
                      {' - '}#{a.document_id}
                    </p>
                    <p>
                      <Text type="secondary">
                        {a.status === 'approved' ? 'Approved' : 'Rejected'} by {a.approver_name}
                        {' on '}{new Date(a.updated_at).toLocaleDateString()}
                      </Text>
                    </p>
                  </Timeline.Item>
                ))}
            </Timeline>
          </Card>
        </TabPane>
      </Tabs>

      {/* Create/Edit Rule Modal */}
      <Modal
        title={
          editRule ?
            <><EditOutlined /> Edit Authorization Rule</> :
            <><PlusOutlined /> Add Authorization Rule</>
        }
        open={ruleModalVisible}
        onCancel={() => {
          setRuleModalVisible(false);
          form.resetFields();
          setEditRule(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="document_type"
                label="Document Type"
                rules={[{ required: true }]}
              >
                <Select
                  placeholder="Select document type"
                  onChange={(val) => setSelectedDocType(val)}
                >
                  {DOCUMENT_TYPES.map(d => (
                    <Option key={d.value} value={d.value}>{d.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="Priority"
                initialValue={10}
              >
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Condition</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="condition_field"
                label="Field"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select field">
                  {(CONDITION_FIELDS[selectedDocType] || []).map(f => (
                    <Option key={f} value={f}>{f.replace('_', ' ')}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="condition_operator"
                label="Operator"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select operator">
                  <Option value=">">Greater than (&gt;)</Option>
                  <Option value=">=">Greater or equal (≥)</Option>
                  <Option value="<">Less than (&lt;)</Option>
                  <Option value="<=">Less or equal (≤)</Option>
                  <Option value="=">Equals (=)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="condition_value"
                label="Value"
                rules={[{ required: true }]}
              >
                <InputNumber style={{ width: '100%' }} placeholder="e.g., 10000" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Approver</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="approver_role"
                label="Approver Role"
              >
                <Select placeholder="Select role" allowClear>
                  {roles.map(r => (
                    <Option key={r.id} value={r.name}>{r.name.replace('_', ' ')}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="approver_user_id"
                label="Or Specific User"
              >
                <Select
                  placeholder="Select user (optional)"
                  showSearch
                  optionFilterProp="children"
                  allowClear
                >
                  {users.map(u => (
                    <Option key={u.id} value={u.id}>{u.username}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_active"
            label="Active"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="Yes" unCheckedChildren="No" />
          </Form.Item>

          <Divider />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                {editRule ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setRuleModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AuthorizationRulesManager;
