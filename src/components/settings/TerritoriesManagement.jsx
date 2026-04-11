/**
 * Territories Management Component
 * Based on ERPNext Territory doctype - hierarchical sales territories
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, Tree, Tag, Space,
    message, Popconfirm, Card, Row, Col, Tooltip, Switch, Tabs, Empty
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined,
    SearchOutlined, ApartmentOutlined, UserOutlined, EnvironmentOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TabPane } = Tabs;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const TerritoriesManagement = () => {
    const [territories, setTerritories] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTerritory, setEditingTerritory] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'tree'
    const [treeData, setTreeData] = useState([]);
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [form] = Form.useForm();

    // Fetch territories
    const fetchTerritories = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/territories`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (response.data.success) {
                setTerritories(response.data.territories);
            }
        } catch (error) {
            message.error('Failed to load territories');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch employees for manager assignment
    const fetchEmployees = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/employees`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (response.data.success) {
                setEmployees(response.data.employees);
            }
        } catch (error) {
            console.error('Failed to load employees');
        }
    };

    useEffect(() => {
        fetchTerritories();
        fetchEmployees();
    }, [fetchTerritories]);

    // Build tree data
    useEffect(() => {
        const buildTree = () => {
            const map = {};
            const roots = [];

            territories.forEach(t => {
                map[t.id] = {
                    key: t.id.toString(),
                    title: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <EnvironmentOutlined style={{ color: t.is_group ? '#1890ff' : '#52c41a' }} />
                            <span style={{ fontWeight: t.is_group ? 500 : 400 }}>{t.name}</span>
                            {t.is_group && <Tag color="blue" style={{ fontSize: 10 }}>Group</Tag>}
                            {t.manager_name && (
                                <span style={{ color: '#666', fontSize: 11 }}>
                                    <UserOutlined style={{ marginRight: 4 }} />
                                    {t.manager_name}
                                </span>
                            )}
                        </div>
                    ),
                    children: []
                };
            });

            territories.forEach(t => {
                if (t.parent_id && map[t.parent_id]) {
                    map[t.parent_id].children.push(map[t.id]);
                } else {
                    roots.push(map[t.id]);
                }
            });

            setExpandedKeys(Object.keys(map));
            return roots;
        };

        setTreeData(buildTree());
    }, [territories]);

    // Handle form submit
    const handleSubmit = async (values) => {
        try {
            const payload = {
                name: values.name,
                parent_id: values.parent_id || null,
                territory_manager: values.territory_manager || null,
                is_group: values.is_group || false
            };

            if (editingTerritory) {
                await axios.put(`${API_BASE_URL}/api/territories/${editingTerritory.id}`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Territory updated successfully');
            } else {
                await axios.post(`${API_BASE_URL}/api/territories`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Territory created successfully');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingTerritory(null);
            fetchTerritories();
        } catch (error) {
            message.error(error.response?.data?.error || 'Operation failed');
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/territories/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            message.success('Territory deleted successfully');
            fetchTerritories();
        } catch (error) {
            message.error(error.response?.data?.error || 'Delete failed');
        }
    };

    // Open edit modal
    const openEditModal = (territory) => {
        setEditingTerritory(territory);
        form.setFieldsValue({
            name: territory.name,
            parent_id: territory.parent_id,
            territory_manager: territory.territory_manager,
            is_group: territory.is_group
        });
        setModalVisible(true);
    };

    // Get parent territory options (exclude self and children)
    const getParentOptions = () => {
        if (!editingTerritory) return territories.filter(t => t.is_group);
        
        // Exclude self and all descendants
        const getDescendants = (id) => {
            const children = territories.filter(t => t.parent_id === id);
            return [id, ...children.flatMap(c => getDescendants(c.id))];
        };
        const excludeIds = getDescendants(editingTerritory.id);
        
        return territories.filter(t => t.is_group && !excludeIds.includes(t.id));
    };

    // Table columns
    const columns = [
        {
            title: 'Territory',
            key: 'name',
            render: (_, record) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EnvironmentOutlined style={{ color: record.is_group ? '#1890ff' : '#52c41a' }} />
                    <span>{record.name}</span>
                    {record.is_group && <Tag color="blue">Group</Tag>}
                </div>
            )
        },
        {
            title: 'Parent Territory',
            dataIndex: 'parent_name',
            key: 'parent',
            render: (text) => text || <span style={{ color: '#999' }}>—</span>
        },
        {
            title: 'Territory Manager',
            dataIndex: 'manager_name',
            key: 'manager',
            render: (text) => text ? (
                <div>
                    <UserOutlined style={{ marginRight: 4 }} />
                    {text}
                </div>
            ) : <span style={{ color: '#999' }}>Not Assigned</span>
        },
        {
            title: 'Type',
            key: 'type',
            width: 100,
            render: (_, record) => (
                <Tag color={record.is_group ? 'blue' : 'green'}>
                    {record.is_group ? 'Group' : 'Leaf'}
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
                        title="Delete this territory?"
                        description={record.is_group ? "All child territories will become root level." : undefined}
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

    // Stats
    const stats = {
        total: territories.length,
        groups: territories.filter(t => t.is_group).length,
        leaves: territories.filter(t => !t.is_group).length,
        withManager: territories.filter(t => t.territory_manager).length
    };

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>
                        <GlobalOutlined style={{ marginRight: 8 }} />
                        Territories
                    </h2>
                    <p style={{ margin: 0, color: '#666' }}>Manage sales territories and regional hierarchy</p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setEditingTerritory(null);
                        form.resetFields();
                        form.setFieldsValue({ is_group: false });
                        setModalVisible(true);
                    }}
                >
                    Add Territory
                </Button>
            </div>

            {/* Stats */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
                {[
                    { label: 'Total', value: stats.total, color: '#1890ff' },
                    { label: 'Groups', value: stats.groups, color: '#722ed1' },
                    { label: 'Leaf Nodes', value: stats.leaves, color: '#52c41a' },
                    { label: 'With Manager', value: stats.withManager, color: '#fa8c16' }
                ].map(stat => (
                    <Col span={6} key={stat.label}>
                        <Card size="small" styles={{ body: { textAlign: 'center', padding: '12px 8px' } }}>
                            <div style={{ fontSize: 20, fontWeight: 600, color: stat.color }}>{stat.value}</div>
                            <div style={{ fontSize: 11, color: '#666' }}>{stat.label}</div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* View Toggle */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Tabs 
                    activeKey={viewMode} 
                    onChange={setViewMode}
                    tabBarStyle={{ marginBottom: 0 }}
                >
                    <TabPane tab={<><ApartmentOutlined /> Table View</>} key="table" />
                    <TabPane tab={<><GlobalOutlined /> Tree View</>} key="tree" />
                </Tabs>
            </Card>

            {/* Content */}
            {viewMode === 'table' ? (
                <Table
                    columns={columns}
                    dataSource={territories}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15, showTotal: (total) => `Total ${total} territories` }}
                />
            ) : (
                <Card styles={{ body: { minHeight: 300 } }}>
                    {treeData.length === 0 ? (
                        <Empty description="No territories defined">
                            <Button 
                                type="primary" 
                                onClick={() => {
                                    form.resetFields();
                                    form.setFieldsValue({ is_group: true });
                                    setModalVisible(true);
                                }}
                            >
                                Add Root Territory
                            </Button>
                        </Empty>
                    ) : (
                        <Tree
                            showLine={{ showLeafIcon: false }}
                            treeData={treeData}
                            expandedKeys={expandedKeys}
                            onExpand={setExpandedKeys}
                            style={{ fontSize: 14 }}
                        />
                    )}
                </Card>
            )}

            {/* Add/Edit Modal */}
            <Modal
                title={editingTerritory ? 'Edit Territory' : 'Add New Territory'}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); setEditingTerritory(null); }}
                footer={null}
                width={500}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item 
                        name="name" 
                        label="Territory Name" 
                        rules={[{ required: true, message: 'Territory name is required' }]}
                    >
                        <Input prefix={<EnvironmentOutlined />} placeholder="e.g., Middle East, UAE, Dubai" />
                    </Form.Item>

                    <Form.Item 
                        name="parent_id" 
                        label="Parent Territory"
                        tooltip="Leave empty for root-level territory"
                    >
                        <Select 
                            allowClear 
                            placeholder="Select parent (optional)"
                            showSearch
                            optionFilterProp="children"
                        >
                            {getParentOptions().map(t => (
                                <Option key={t.id} value={t.id}>{t.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item 
                        name="territory_manager" 
                        label="Territory Manager"
                    >
                        <Select 
                            allowClear 
                            placeholder="Assign a manager (optional)"
                            showSearch
                            optionFilterProp="children"
                        >
                            {employees.filter(e => e.status === 'Active').map(e => (
                                <Option key={e.id} value={e.id}>{e.employee_name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item 
                        name="is_group" 
                        label="Is Group?"
                        valuePropName="checked"
                        tooltip="Group territories can contain child territories. Only leaf territories can be used in transactions."
                    >
                        <Switch checkedChildren="Group" unCheckedChildren="Leaf" />
                    </Form.Item>

                    <div style={{ marginTop: 24, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setModalVisible(false); form.resetFields(); }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingTerritory ? 'Update' : 'Create'} Territory
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default TerritoriesManagement;
