/**
 * Authorization Rules Component
 * Based on ERPNext Authorization Rule doctype
 * Defines approval workflows based on transaction value, role, etc.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, InputNumber, Tag, Space,
    message, Popconfirm, Card, Row, Col, Tooltip, Switch, Alert
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
    UserOutlined, TeamOutlined, DollarOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { getCachedUsers } from '../../utils/deduplicatedFetch';

const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Transaction types that can have authorization rules
const TRANSACTION_TYPES = [
    { value: 'Sales Order', label: 'Sales Order' },
    { value: 'Purchase Order', label: 'Purchase Order' },
    { value: 'Quotation', label: 'Quotation' },
    { value: 'Delivery Note', label: 'Delivery Note' },
    { value: 'Sales Invoice', label: 'Sales Invoice' },
    { value: 'Purchase Invoice', label: 'Purchase Invoice' },
    { value: 'Budget Override', label: 'Budget Override' }
];

// What the rule is based on
const BASED_ON_OPTIONS = [
    { value: 'Grand Total', label: 'Grand Total (Amount)' },
    { value: 'Not Applicable', label: 'Not Applicable (Always Apply)' }
];

const AuthorizationRules = () => {
    const [rules, setRules] = useState([]);
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form] = Form.useForm();

    // Fetch rules
    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/authorization/rules`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (response.data.success) {
                setRules(response.data.rules);
            }
        } catch (error) {
            // If API doesn't exist yet, show empty
            console.warn('Authorization API not available:', error.message);
            setRules([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch users and roles (users from cache)
    const fetchUsersAndRoles = async () => {
        try {
            const [users, rolesRes] = await Promise.all([
                getCachedUsers(),
                axios.get(`${API_BASE_URL}/api/auth/roles`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                })
            ]);
            setUsers(users);
            if (rolesRes.data.success) setRoles(rolesRes.data.roles);
        } catch (error) {
            console.warn('Failed to load users/roles');
        }
    };

    useEffect(() => {
        fetchRules();
        fetchUsersAndRoles();
    }, [fetchRules]);

    // Handle form submit
    const handleSubmit = async (values) => {
        try {
            const payload = {
                name: values.name || `${values.transactionType} Rule`,
                transactionType: values.transactionType,
                basedOn: values.basedOn,
                conditionOperator: '>=',
                conditionValue: values.conditionValue || 0,
                approvingRoleId: values.approvingRoleId || null,
                approvingEmployeeId: values.approvingEmployeeId || null,
                appliesToRoleId: values.appliesToRoleId || null,
                isActive: values.isActive !== false,
                priority: values.priority || 100
            };

            if (editingRule) {
                await axios.put(`${API_BASE_URL}/api/authorization/rules/${editingRule.id}`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Authorization rule updated');
            } else {
                await axios.post(`${API_BASE_URL}/api/authorization/rules`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Authorization rule created');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingRule(null);
            fetchRules();
        } catch (error) {
            message.error(error.response?.data?.error || 'Operation failed');
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/authorization/rules/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            message.success('Rule deleted');
            fetchRules();
        } catch (error) {
            message.error(error.response?.data?.error || 'Delete failed');
        }
    };

    // Open edit modal
    const openEditModal = (rule) => {
        setEditingRule(rule);
        form.setFieldsValue({
            name: rule.name,
            transactionType: rule.transaction_type,
            basedOn: rule.based_on,
            conditionValue: rule.condition_value,
            approvingRoleId: rule.approving_role_id,
            approvingEmployeeId: rule.approving_employee_id,
            appliesToRoleId: rule.applies_to_role_id,
            isActive: rule.is_active,
            priority: rule.priority
        });
        setModalVisible(true);
    };

    // Get transaction color
    const getTransactionColor = (type) => {
        const colors = {
            'Sales Order': 'blue',
            'Purchase Order': 'purple',
            'Quotation': 'cyan',
            'Delivery Note': 'green',
            'Sales Invoice': 'orange',
            'Purchase Invoice': 'magenta',
            'Budget Override': 'red'
        };
        return colors[type] || 'default';
    };

    // Table columns
    const columns = [
        {
            title: 'Transaction',
            dataIndex: 'transaction_type',
            key: 'transaction_type',
            width: 150,
            render: (text) => <Tag color={getTransactionColor(text)}>{text}</Tag>
        },
        {
            title: 'Based On',
            dataIndex: 'based_on',
            key: 'based_on',
            width: 150
        },
        {
            title: 'Above Value',
            dataIndex: 'condition_value',
            key: 'condition_value',
            width: 120,
            render: (value, record) => {
                if (record.based_on === 'Not Applicable') return '—';
                return `$${value?.toLocaleString() || 0}`;
            }
        },
        {
            title: 'Applicable To',
            key: 'applicable_to',
            render: (_, record) => (
                record.applies_to_role_name ? (
                    <Tag icon={<TeamOutlined />}>{record.applies_to_role_name}</Tag>
                ) : <span style={{ color: '#999' }}>All Roles</span>
            )
        },
        {
            title: 'Approving Authority',
            key: 'approver',
            render: (_, record) => (
                <div>
                    {record.approving_role_name && (
                        <Tag icon={<TeamOutlined />} color="blue">{record.approving_role_name}</Tag>
                    )}
                    {record.approving_employee_name && (
                        <Tag icon={<UserOutlined />} color="green">{record.approving_employee_name}</Tag>
                    )}
                    {!record.approving_role_name && !record.approving_employee_name && (
                        <span style={{ color: '#999' }}>Not Set</span>
                    )}
                </div>
            )
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'status',
            width: 80,
            render: (active) => (
                <Tag color={active ? 'green' : 'default'}>
                    {active ? 'Active' : 'Inactive'}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button 
                            type="text" 
                            icon={<EditOutlined />} 
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this rule?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Tooltip title="Delete">
                            <Button type="text" icon={<DeleteOutlined />} danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Watch based_on field
    const basedOn = Form.useWatch('basedOn', form);

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>
                        <SafetyCertificateOutlined style={{ marginRight: 8 }} />
                        Authorization Rules
                    </h2>
                    <p style={{ margin: 0, color: '#666' }}>Define approval workflows for transactions</p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setEditingRule(null);
                        form.resetFields();
                        form.setFieldsValue({ isActive: true, basedOn: 'Grand Total', priority: 100 });
                        setModalVisible(true);
                    }}
                >
                    Add Rule
                </Button>
            </div>

            {/* Info Alert */}
            <Alert
                message="How Authorization Rules Work"
                description={
                    <div>
                        <p style={{ margin: '8px 0' }}>
                            When a user creates a transaction that exceeds the defined threshold, 
                            the system will require approval from the designated authority.
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>Example:</strong> "Sales Order above $10,000 requires approval from Sales Manager"
                        </p>
                    </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            {/* Stats */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                    <Card size="small" styles={{ body: { textAlign: 'center', padding: 12 } }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>{rules.length}</div>
                        <div style={{ fontSize: 11, color: '#666' }}>Total Rules</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" styles={{ body: { textAlign: 'center', padding: 12 } }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: '#52c41a' }}>
                            {rules.filter(r => r.is_active).length}
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>Active</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" styles={{ body: { textAlign: 'center', padding: 12 } }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: '#722ed1' }}>
                            {[...new Set(rules.map(r => r.transaction_type))].length}
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>Transaction Types</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" styles={{ body: { textAlign: 'center', padding: 12 } }}>
                        <div style={{ fontSize: 20, fontWeight: 600, color: '#fa8c16' }}>
                            {rules.filter(r => r.based_on === 'Grand Total').length}
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>Value-based</div>
                    </Card>
                </Col>
            </Row>

            {/* Table */}
            <Table
                columns={columns}
                dataSource={rules}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No authorization rules defined. Add rules to require approvals for transactions.' }}
            />

            {/* Add/Edit Modal */}
            <Modal
                title={editingRule ? 'Edit Authorization Rule' : 'Add Authorization Rule'}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); setEditingRule(null); }}
                footer={null}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item 
                        name="name" 
                        label="Rule Name"
                        tooltip="A descriptive name for this rule (auto-generated if left empty)"
                    >
                        <Input placeholder="e.g., Sales Order above $10k" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item 
                                name="transactionType" 
                                label="Transaction Type" 
                                rules={[{ required: true }]}
                            >
                                <Select placeholder="Select transaction">
                                    {TRANSACTION_TYPES.map(t => (
                                        <Option key={t.value} value={t.value}>{t.label}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item 
                                name="basedOn" 
                                label="Based On" 
                                rules={[{ required: true }]}
                            >
                                <Select placeholder="Select criteria">
                                    {BASED_ON_OPTIONS.map(o => (
                                        <Option key={o.value} value={o.value}>{o.label}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {basedOn && basedOn !== 'Not Applicable' && (
                        <Form.Item 
                            name="conditionValue" 
                            label="Above Value ($)"
                            rules={[{ required: true, message: 'Please enter threshold value' }]}
                        >
                            <InputNumber 
                                style={{ width: '100%' }}
                                min={0}
                                max={undefined}
                                prefix="$"
                                placeholder="e.g., 10000"
                            />
                        </Form.Item>
                    )}

                    <Form.Item 
                        name="appliesToRoleId" 
                        label="Applicable To (Role)"
                        tooltip="Which role does this rule apply to? Leave empty for all roles."
                    >
                        <Select allowClear placeholder="All Roles">
                            {roles.map(r => (
                                <Option key={r.id} value={r.id}>{r.display_name || r.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Card size="small" title="Approving Authority" style={{ marginBottom: 16 }}>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item 
                                    name="approvingRoleId" 
                                    label="By Role"
                                    tooltip="Any user with this role can approve"
                                >
                                    <Select allowClear placeholder="Select role">
                                        {roles.map(r => (
                                            <Option key={r.id} value={r.id}>{r.display_name || r.name}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item 
                                    name="approvingEmployeeId" 
                                    label="Or Specific User"
                                    tooltip="Only this specific user can approve"
                                >
                                    <Select allowClear showSearch optionFilterProp="children" placeholder="Select user">
                                        {users.map(u => (
                                            <Option key={u.id} value={u.id}>{u.name}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item 
                                name="priority" 
                                label="Priority"
                                tooltip="Lower number = higher priority (default 100)"
                            >
                                <InputNumber style={{ width: '100%' }} min={1} max={999} placeholder="100" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item 
                                name="isActive" 
                                label="Status"
                                valuePropName="checked"
                            >
                                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <div style={{ marginTop: 24, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setModalVisible(false); form.resetFields(); }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />}>
                                {editingRule ? 'Update' : 'Create'} Rule
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default AuthorizationRules;
