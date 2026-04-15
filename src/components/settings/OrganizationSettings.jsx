/**
 * Organization Settings Component
 * Manage Departments, Designations, and Branches
 * Admin can create/edit/delete these lookup lists
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Tabs, Table, Button, Modal, Form, Input, Select, Switch, Space,
    message, Popconfirm, Tag, Tooltip, Empty
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined,
    TeamOutlined, IdcardOutlined, EnvironmentOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { fetchAllLookups, invalidateLookupCache } from '../../services/employeeLookupService';

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const OrganizationSettings = () => {
    const [activeTab, setActiveTab] = useState('departments');
    const [departments, setDepartments] = useState([]);
    const [designations, setDesignations] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();

    const getAuthHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    });

    // Fetch all data (cached via employeeLookupService)
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const lookups = await fetchAllLookups();
            setDepartments(lookups.departments);
            setDesignations(lookups.designations);
            setBranches(lookups.branches);
        } catch (error) {
            console.error('Failed to load organization data:', error);
            message.error('Failed to load organization data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle form submission
    const handleSubmit = async (values) => {
        try {
            const endpoint = activeTab === 'departments' ? 'departments' :
                           activeTab === 'designations' ? 'designations' : 'branches';
            
            if (editingItem) {
                await axios.put(
                    `${API_BASE_URL}/api/employees/${endpoint}/${editingItem.id}`,
                    values,
                    getAuthHeaders()
                );
                message.success(`${activeTab.slice(0, -1)} updated successfully`);
            } else {
                await axios.post(
                    `${API_BASE_URL}/api/employees/${endpoint}`,
                    values,
                    getAuthHeaders()
                );
                message.success(`${activeTab.slice(0, -1)} created successfully`);
            }
            setModalVisible(false);
            form.resetFields();
            setEditingItem(null);
            invalidateLookupCache();
            fetchData();
        } catch (error) {
            message.error(error.response?.data?.error || 'Operation failed');
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            const endpoint = activeTab === 'departments' ? 'departments' :
                           activeTab === 'designations' ? 'designations' : 'branches';
            await axios.delete(`${API_BASE_URL}/api/employees/${endpoint}/${id}`, getAuthHeaders());
            message.success(`${activeTab.slice(0, -1)} deleted successfully`);
            invalidateLookupCache();
            fetchData();
        } catch (error) {
            message.error('Failed to delete. It may be in use.');
        }
    };

    // Open modal for editing
    const handleEdit = (record) => {
        setEditingItem(record);
        form.setFieldsValue(record);
        setModalVisible(true);
    };

    // Open modal for new item
    const handleAdd = () => {
        setEditingItem(null);
        form.resetFields();
        setModalVisible(true);
    };

    // Department columns
    const departmentColumns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (text) => text || '-'
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active) => (
                <Tag color={active ? 'green' : 'red'}>
                    {active ? 'Active' : 'Inactive'}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button 
                            icon={<EditOutlined />} 
                            size="small"
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this department?"
                        description="This will affect employees assigned to this department."
                        onConfirm={() => handleDelete(record.id)}
                        okText="Delete"
                        cancelText="Cancel"
                    >
                        <Tooltip title="Delete">
                            <Button icon={<DeleteOutlined />} size="small" danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Designation columns
    const designationColumns = [
        {
            title: 'Title',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: 'Department',
            dataIndex: 'department',
            key: 'department',
            render: (text) => text || '-'
        },
        {
            title: 'Level',
            dataIndex: 'level',
            key: 'level',
            width: 80,
            render: (level) => level || '-'
        },
        {
            title: 'Access Level',
            dataIndex: 'access_level',
            key: 'access_level',
            width: 120,
            render: (val) => {
                const colors = { admin: 'red', sales_manager: 'orange', manager: 'blue', user: 'default' };
                return <Tag color={colors[val] || 'default'}>{val || 'user'}</Tag>;
            }
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active) => (
                <Tag color={active ? 'green' : 'red'}>
                    {active ? 'Active' : 'Inactive'}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button 
                            icon={<EditOutlined />} 
                            size="small"
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this designation?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Delete"
                        cancelText="Cancel"
                    >
                        <Tooltip title="Delete">
                            <Button icon={<DeleteOutlined />} size="small" danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Branch columns
    const branchColumns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (text) => text || '-'
        },
        {
            title: 'Address',
            dataIndex: 'address',
            key: 'address',
            render: (text) => text || '-'
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active) => (
                <Tag color={active ? 'green' : 'red'}>
                    {active ? 'Active' : 'Inactive'}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button 
                            icon={<EditOutlined />} 
                            size="small"
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this branch?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Delete"
                        cancelText="Cancel"
                    >
                        <Tooltip title="Delete">
                            <Button icon={<DeleteOutlined />} size="small" danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Render form fields based on active tab
    const renderFormFields = () => {
        switch (activeTab) {
            case 'departments':
                return (
                    <>
                        <Form.Item
                            name="name"
                            label="Department Name"
                            rules={[{ required: true, message: 'Please enter department name' }]}
                        >
                            <Input placeholder="e.g., Sales, Operations, Finance" />
                        </Form.Item>
                        <Form.Item name="description" label="Description">
                            <TextArea rows={2} placeholder="Brief description of the department" />
                        </Form.Item>
                        <Form.Item name="parent_id" label="Parent Department">
                            <Select allowClear placeholder="Select parent (for sub-departments)">
                                {departments.filter(d => d.id !== editingItem?.id).map(d => (
                                    <Option key={d.id} value={d.id}>{d.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                        {editingItem && (
                            <Form.Item name="is_active" label="Active" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        )}
                    </>
                );
            case 'designations':
                return (
                    <>
                        <Form.Item
                            name="name"
                            label="Designation Title"
                            rules={[{ required: true, message: 'Please enter designation title' }]}
                        >
                            <Input placeholder="e.g., Sales Manager, Account Executive" />
                        </Form.Item>
                        <Form.Item name="description" label="Description">
                            <TextArea rows={2} placeholder="Job description or responsibilities" />
                        </Form.Item>
                        <Form.Item name="department" label="Department">
                            <Select allowClear placeholder="Select department">
                                {departments.map(d => (
                                    <Option key={d.id} value={d.name}>{d.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item name="level" label="Level (8=C-Level/Top, 1=Entry)">
                            <Select placeholder="Select level">
                                <Option value={8}>8 - C-Level / CEO</Option>
                                <Option value={7}>7 - Executive / GM</Option>
                                <Option value={6}>6 - Senior Management</Option>
                                <Option value={5}>5 - Middle Management</Option>
                                <Option value={4}>4 - Junior Management</Option>
                                <Option value={3}>3 - Senior Professional</Option>
                                <Option value={2}>2 - Professional</Option>
                                <Option value={1}>1 - Entry Level</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="access_level" label="Access Level (User Role)" tooltip="Role assigned to linked users with this designation">
                            <Select placeholder="Select access level">
                                <Option value="admin">Admin</Option>
                                <Option value="sales_manager">Sales Manager</Option>
                                <Option value="sales_coordinator">Sales Coordinator</Option>
                                <Option value="manager">Manager</Option>
                                <Option value="user">User</Option>
                            </Select>
                        </Form.Item>
                        {editingItem && (
                            <Form.Item name="is_active" label="Active" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        )}
                    </>
                );
            case 'branches':
                return (
                    <>
                        <Form.Item
                            name="name"
                            label="Branch Name"
                            rules={[{ required: true, message: 'Please enter branch name' }]}
                        >
                            <Input placeholder="e.g., Head Office, Dubai Branch" />
                        </Form.Item>
                        <Form.Item name="description" label="Description">
                            <TextArea rows={2} placeholder="Brief description of the branch" />
                        </Form.Item>
                        <Form.Item name="address" label="Address">
                            <TextArea rows={2} placeholder="Full address of the branch" />
                        </Form.Item>
                        {editingItem && (
                            <Form.Item name="is_active" label="Active" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        )}
                    </>
                );
            default:
                return null;
        }
    };

    const getModalTitle = () => {
        const type = activeTab.slice(0, -1);
        return editingItem ? `Edit ${type}` : `Add New ${type}`;
    };

    return (
        <Card 
            title={
                <Space>
                    <BankOutlined />
                    <span>Organization Settings</span>
                </Space>
            }
            extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    Add {activeTab.slice(0, -1)}
                </Button>
            }
        >
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <TabPane 
                    tab={<span><TeamOutlined /> Departments ({departments.length})</span>} 
                    key="departments"
                >
                    <Table
                        columns={departmentColumns}
                        dataSource={departments}
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: <Empty description="No departments. Click 'Add department' to create one." /> }}
                    />
                </TabPane>
                <TabPane 
                    tab={<span><IdcardOutlined /> Designations ({designations.length})</span>} 
                    key="designations"
                >
                    <Table
                        columns={designationColumns}
                        dataSource={designations}
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: <Empty description="No designations. Click 'Add designation' to create one." /> }}
                    />
                </TabPane>
                <TabPane 
                    tab={<span><EnvironmentOutlined /> Branches ({branches.length})</span>} 
                    key="branches"
                >
                    <Table
                        columns={branchColumns}
                        dataSource={branches}
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: <Empty description="No branches. Click 'Add branch' to create one." /> }}
                    />
                </TabPane>
            </Tabs>

            {/* Add/Edit Modal */}
            <Modal
                title={getModalTitle()}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); setEditingItem(null); }}
                footer={null}
                destroyOnHidden
            >
                <Form 
                    form={form} 
                    layout="vertical" 
                    onFinish={handleSubmit}
                    initialValues={{ is_active: true }}
                >
                    {renderFormFields()}
                    <Form.Item style={{ marginBottom: 0, marginTop: 24, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setModalVisible(false); form.resetFields(); setEditingItem(null); }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingItem ? 'Update' : 'Create'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default OrganizationSettings;
