/**
 * Employees Management Component
 * Based on ERPNext Employee doctype - simplified for ProPackHub
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, DatePicker, Tag, Space,
    message, Popconfirm, Card, Row, Col, Avatar, Tooltip, Badge, Tabs, Upload, Radio
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
    SearchOutlined, TeamOutlined, MailOutlined, PhoneOutlined,
    BankOutlined, UploadOutlined, EyeOutlined, SyncOutlined, FileExcelOutlined, LinkOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { fetchAllLookups } from '../../services/employeeLookupService';
import { getCachedUsers, invalidateUsersCache } from '../../utils/deduplicatedFetch';
import EmployeeBulkImport from './EmployeeBulkImport';

const { Option } = Select;
const { TabPane } = Tabs;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const EmployeesManagement = () => {
    const { selectedDivision } = useExcelData(); // Get user's current division
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [designations, setDesignations] = useState([]);
    const [branches, setBranches] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [viewingEmployee, setViewingEmployee] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [filterDepartment, setFilterDepartment] = useState(null);
    const [filterStatus, setFilterStatus] = useState(null);
    const [form] = Form.useForm();
    
    // Sync state - simplified
    const [syncing, setSyncing] = useState(false);
    const [bulkImportVisible, setBulkImportVisible] = useState(false);

    // Fetch employees - filtered by user's current division
    const fetchEmployees = useCallback(async () => {
        if (!selectedDivision) return;
        
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('divisionCode', selectedDivision); // Filter by user's division
            if (searchText) params.append('search', searchText);
            if (filterDepartment) params.append('department_id', filterDepartment);
            if (filterStatus) params.append('status', filterStatus);

            const response = await axios.get(`${API_BASE_URL}/api/employees?${params}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (response.data.success) {
                setEmployees(response.data.employees);
            }
        } catch (error) {
            message.error('Failed to load employees');
        } finally {
            setLoading(false);
        }
    }, [searchText, filterDepartment, filterStatus, selectedDivision]);

    // Fetch departments, designations, branches, and users (cached)
    const fetchMasterData = async () => {
        try {
            const [lookups, users] = await Promise.all([
                fetchAllLookups(),
                getCachedUsers(),
            ]);
            setDepartments(lookups.departments);
            setDesignations(lookups.designations);
            setBranches(lookups.branches);
            setUsers(users);
        } catch (error) {
            console.error('Failed to load master data:', error);
        }
    };

    useEffect(() => {
        // Only fetch if we have an auth token and division
        const token = localStorage.getItem('auth_token');
        if (token && selectedDivision) {
            fetchEmployees();
            fetchMasterData();
        }
    }, [fetchEmployees, selectedDivision]);

    // Synchronize - Fetch groups + non-grouped individuals and add to employees table
    const handleSynchronize = async () => {
        if (!selectedDivision) {
            message.error('No division selected');
            return;
        }
        
        setSyncing(true);
        try {
            // 1. Get all groups from user's current division
            const groupsRes = await axios.get(`${API_BASE_URL}/api/sales-rep-groups-universal?division=${selectedDivision}`);
            const groups = groupsRes.data?.data || {};
            
            // 2. Get all individual sales reps from user's current division
            const repsRes = await axios.get(`${API_BASE_URL}/api/sales-reps-universal?division=${selectedDivision}`);
            const allReps = repsRes.data?.data || [];
            
            // 3. Find which reps are in groups
            const repsInGroups = new Set();
            Object.values(groups).forEach(members => {
                members.forEach(m => repsInGroups.add(m.toLowerCase().trim()));
            });
            
            // 4. Build list: groups + non-grouped individuals
            const toSync = [];
            
            // Add group names with their members
            Object.keys(groups).forEach(groupName => {
                toSync.push({ 
                    name: groupName, 
                    type: 'Group', 
                    memberCount: groups[groupName].length,
                    groupMembers: groups[groupName] // Store raw sales rep names
                });
            });
            
            // Add non-grouped individuals
            allReps.forEach(repName => {
                if (repName && !repsInGroups.has(repName.toLowerCase().trim())) {
                    toSync.push({ name: repName, type: 'Individual', groupMembers: null });
                }
            });
            
            // 5. Get existing employee names for duplicate check
            const existingNames = new Set(employees.map(e => e.employee_name?.toLowerCase().trim()));
            
            // 6. Create employee records for new entries
            let created = 0;
            let skipped = 0;
            
            for (const item of toSync) {
                const normalizedName = item.name.toLowerCase().trim();
                
                if (existingNames.has(normalizedName)) {
                    skipped++;
                    continue;
                }
                
                try {
                    await axios.post(`${API_BASE_URL}/api/employees`, {
                        first_name: item.name,
                        last_name: '',
                        status: 'Active',
                        date_of_joining: new Date().toISOString().split('T')[0],
                        gender: 'Male', // Default
                        branch: item.type === 'Group' ? `Sales Group (${item.memberCount} members)` : `${selectedDivision} Sales`,
                        group_members: item.groupMembers,
                        divisions: [selectedDivision] // Link employee to user's division
                    }, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                    });
                    created++;
                    existingNames.add(normalizedName); // Prevent duplicates in same batch
                } catch (err) {
                    console.error(`Failed to create employee ${item.name}:`, err);
                }
            }
            
            // 7. Refresh employees list
            await fetchEmployees();
            
            message.success(`${selectedDivision} Sync complete: ${created} new employees added, ${skipped} already exist`);
        } catch (error) {
            console.error('Sync error:', error);
            message.error('Failed to synchronize sales reps');
        } finally {
            setSyncing(false);
        }
    };

    // Handle form submit
    const handleSubmit = async (values) => {
        try {
            const payload = {
                ...values,
                date_of_birth: values.date_of_birth?.format('YYYY-MM-DD'),
                date_of_joining: values.date_of_joining?.format('YYYY-MM-DD')
            };

            if (editingEmployee) {
                await axios.put(`${API_BASE_URL}/api/employees/${editingEmployee.id}`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Employee updated successfully');
            } else {
                await axios.post(`${API_BASE_URL}/api/employees`, payload, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
                });
                message.success('Employee created successfully');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingEmployee(null);
            fetchEmployees();
        } catch (error) {
            message.error(error.response?.data?.error || 'Operation failed');
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/api/employees/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            message.success('Employee deleted successfully');
            fetchEmployees();
        } catch (error) {
            message.error(error.response?.data?.error || 'Delete failed');
        }
    };

    // Toggle employee status (Active/Inactive)
    const handleToggleStatus = async (employee) => {
        const newStatus = employee.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await axios.put(`${API_BASE_URL}/api/employees/${employee.id}`, {
                status: newStatus
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            });
            message.success(`Employee ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
            fetchEmployees();
        } catch (error) {
            message.error('Failed to update status');
        }
    };

    // Open edit modal
    const openEditModal = (employee) => {
        setEditingEmployee(employee);
        form.setFieldsValue({
            ...employee,
            date_of_birth: employee.date_of_birth ? dayjs(employee.date_of_birth) : null,
            date_of_joining: employee.date_of_joining ? dayjs(employee.date_of_joining) : null
        });
        setModalVisible(true);
    };

    // Open view modal
    const openViewModal = (employee) => {
        setViewingEmployee(employee);
        setViewModalVisible(true);
    };

    // Status colors
    const getStatusColor = (status) => {
        const colors = {
            'Active': 'green',
            'Left': 'red',
            'Inactive': 'default'
        };
        return colors[status] || 'default';
    };

    // Table columns
    const columns = [
        {
            title: 'Employee',
            key: 'employee',
            width: 300,
            render: (_, record) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar 
                        size={40} 
                        src={record.image} 
                        icon={record.group_members?.length > 0 ? <TeamOutlined /> : <UserOutlined />}
                        style={{ backgroundColor: record.group_members?.length > 0 ? '#722ed1' : '#1890ff' }}
                    />
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {record.employee_name}
                            {record.user_id && (
                                <Tooltip title="Has linked system user account">
                                    <Tag icon={<LinkOutlined />} color="blue" style={{ marginLeft: 8, fontSize: 11 }}>
                                        Linked
                                    </Tag>
                                </Tooltip>
                            )}
                            {record.group_members?.length > 0 && (
                                <Tag color="purple" style={{ marginLeft: 8, fontSize: 11 }}>
                                    Group ({record.group_members.length})
                                </Tag>
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: '#666' }}>{record.employee_code}</div>
                    </div>
                </div>
            )
        },
        {
            title: 'Department',
            dataIndex: 'department_name',
            key: 'department',
            render: (text) => text || '-'
        },
        {
            title: 'Designation',
            dataIndex: 'designation_name',
            key: 'designation',
            render: (text) => text || '-'
        },
        {
            title: 'Reports To',
            dataIndex: 'reports_to_name',
            key: 'reports_to',
            render: (text) => text || '-'
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => <Tag color={getStatusColor(status)}>{status}</Tag>
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (_, record) => (
                <Space>
                    <Tooltip title={record.status === 'Active' ? 'Deactivate' : 'Activate'}>
                        <Button 
                            type="text" 
                            icon={record.status === 'Active' ? 
                                <span style={{ color: '#52c41a' }}>✓</span> : 
                                <span style={{ color: '#ff4d4f' }}>✕</span>
                            }
                            onClick={() => handleToggleStatus(record)}
                        />
                    </Tooltip>
                    <Tooltip title="View">
                        <Button 
                            type="text" 
                            icon={<EyeOutlined />} 
                            onClick={() => openViewModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button 
                            type="text" 
                            icon={<EditOutlined />} 
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this employee?"
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

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>
                        <TeamOutlined style={{ marginRight: 8 }} />
                        {selectedDivision} Employees
                    </h2>
                    <p style={{ margin: 0, color: '#666' }}>Manage {selectedDivision} division employee records</p>
                </div>
                <Space>
                    <Tooltip title="Import/Export employees via Excel">
                        <Button 
                            icon={<FileExcelOutlined />}
                            onClick={() => setBulkImportVisible(true)}
                        >
                            Excel Import
                        </Button>
                    </Tooltip>
                    <Tooltip title={`Add NEW sales reps from ${selectedDivision} uploaded data (skips existing)`}>
                        <Button 
                            icon={<SyncOutlined spin={syncing} />}
                            onClick={handleSynchronize}
                            loading={syncing}
                            disabled={!selectedDivision}
                        >
                            Add from Data
                        </Button>
                    </Tooltip>
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingEmployee(null);
                            form.resetFields();
                            setModalVisible(true);
                        }}
                    >
                        Add Employee
                    </Button>
                </Space>
            </div>

            {/* Filters */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                    <Col span={8}>
                        <Input
                            placeholder="Search by name or ID..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col span={6}>
                        <Select
                            placeholder="Filter by Department"
                            style={{ width: '100%' }}
                            allowClear
                            value={filterDepartment}
                            onChange={setFilterDepartment}
                        >
                            {departments.filter(d => d.id != null).map(d => (
                                <Option key={d.id} value={d.id}>{d.name}</Option>
                            ))}
                        </Select>
                    </Col>
                    <Col span={4}>
                        <Select
                            placeholder="Status"
                            style={{ width: '100%' }}
                            allowClear
                            value={filterStatus}
                            onChange={setFilterStatus}
                        >
                            <Option value="Active">Active</Option>
                            <Option value="Left">Left</Option>
                            <Option value="Inactive">Inactive</Option>
                        </Select>
                    </Col>
                    <Col span={6} style={{ textAlign: 'right' }}>
                        <Badge count={employees.length} showZero>
                            <Tag icon={<TeamOutlined />}>Total Employees</Tag>
                        </Badge>
                    </Col>
                </Row>
            </Card>

            {/* Table */}
            <Table
                columns={columns}
                dataSource={employees}
                rowKey="id"
                loading={loading}
                pagination={{ 
                    defaultPageSize: 20,
                    showSizeChanger: true, 
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total) => `Total ${total} employees` 
                }}
            />

            {/* Add/Edit Modal */}
            <Modal
                title={editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); setEditingEmployee(null); }}
                footer={null}
                width={800}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Tabs defaultActiveKey="basic">
                        <TabPane tab="Basic Info" key="basic">
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="middle_name" label="Middle Name">
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="gender" label="Gender" rules={[{ required: true }]}>
                                        <Radio.Group>
                                            <Radio value="Male">Male</Radio>
                                            <Radio value="Female">Female</Radio>
                                        </Radio.Group>
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="date_of_birth" label="Date of Birth">
                                        <DatePicker style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="date_of_joining" label="Date of Joining">
                                        <DatePicker style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="status" label="Status" initialValue="Active">
                                        <Select>
                                            <Option value="Active">Active</Option>
                                            <Option value="Left">Left</Option>
                                            <Option value="Inactive">Inactive</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </TabPane>

                        <TabPane tab="Organization" key="organization">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="department_id" label="Department">
                                        <Select allowClear placeholder="Select Department">
                                            {departments.filter(d => d.id != null).map(d => (
                                                <Option key={d.id} value={d.id}>{d.name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="designation_id" label="Designation">
                                        <Select allowClear placeholder="Select Designation">
                                            {designations.filter(d => d.id != null).map(d => (
                                                <Option key={d.id} value={d.id}>{d.name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="reports_to" label="Reports To">
                                        <Select allowClear showSearch placeholder="Select Manager" optionFilterProp="children">
                                            {employees.filter(e => e.id != null && e.id !== editingEmployee?.id).map(e => (
                                                <Option key={e.id} value={e.id}>{e.employee_name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="branch_id" label="Branch">
                                        <Select allowClear placeholder="Select Branch">
                                            {branches.filter(b => b.id != null).map(b => (
                                                <Option key={b.id} value={b.id}>{b.name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </TabPane>

                        <TabPane tab="Contact" key="contact">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="company_email" label="Company Email" rules={[{ type: 'email' }]}>
                                        <Input prefix={<MailOutlined />} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="personal_email" label="Personal Email" rules={[{ type: 'email' }]}>
                                        <Input prefix={<MailOutlined />} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="cell_number" label="Mobile Number">
                                        <Input prefix={<PhoneOutlined />} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="emergency_contact" label="Emergency Contact">
                                        <Input />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="current_address" label="Current Address">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                        </TabPane>

                        <TabPane tab="User Account" key="user">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="user_id" label="Linked System User">
                                        <Select allowClear showSearch placeholder="Link to user account" optionFilterProp="children">
                                            {users.filter(u => u.id != null).map(u => (
                                                <Option key={u.id} value={u.id}>{u.name} ({u.email})</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <p style={{ color: '#666', fontSize: 12 }}>
                                Link this employee to a system user account to enable login and permissions.
                            </p>
                        </TabPane>

                        {/* Group Members Tab - only show if this employee has group_members */}
                        {editingEmployee?.group_members && editingEmployee.group_members.length > 0 && (
                            <TabPane tab={<><TeamOutlined /> Group Members ({editingEmployee.group_members.length})</>} key="members">
                                <p style={{ marginBottom: 12, color: '#666' }}>
                                    This is a <strong>Sales Group</strong>. The following raw sales rep names from uploaded data are grouped under this employee:
                                </p>
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    {editingEmployee.group_members.map((member, idx) => (
                                        <Tag 
                                            key={idx} 
                                            color="blue" 
                                            style={{ margin: '4px', padding: '4px 12px', fontSize: 13 }}
                                        >
                                            <UserOutlined style={{ marginRight: 6 }} />
                                            {member}
                                        </Tag>
                                    ))}
                                </div>
                                <p style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
                                    These names appear in budget/actual data uploads. When reports filter by this employee, all these sales rep names will be included.
                                </p>
                            </TabPane>
                        )}
                    </Tabs>

                    <div style={{ marginTop: 24, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setModalVisible(false); form.resetFields(); }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingEmployee ? 'Update' : 'Create'} Employee
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>

            {/* View Modal */}
            <Modal
                title="Employee Details"
                open={viewModalVisible}
                onCancel={() => setViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setViewModalVisible(false)}>Close</Button>,
                    <Button key="edit" type="primary" onClick={() => { setViewModalVisible(false); openEditModal(viewingEmployee); }}>
                        Edit
                    </Button>
                ]}
                width={600}
            >
                {viewingEmployee && (
                    <div>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <Avatar size={80} src={viewingEmployee.image} icon={<UserOutlined />} />
                            <h2 style={{ margin: '12px 0 4px' }}>{viewingEmployee.employee_name}</h2>
                            <Tag color={getStatusColor(viewingEmployee.status)}>{viewingEmployee.status}</Tag>
                        </div>
                        <Card size="small" title="Organization" style={{ marginBottom: 12 }}>
                            <p><BankOutlined /> <strong>Department:</strong> {viewingEmployee.department_name || '-'}</p>
                            <p><UserOutlined /> <strong>Designation:</strong> {viewingEmployee.designation_name || '-'}</p>
                            <p><TeamOutlined /> <strong>Reports To:</strong> {viewingEmployee.reports_to_name || '-'}</p>
                            <p><BankOutlined /> <strong>Branch:</strong> {viewingEmployee.branch_name || '-'}</p>
                        </Card>
                        <Card size="small" title="Contact">
                            <p><MailOutlined /> <strong>Email:</strong> {viewingEmployee.company_email || '-'}</p>
                            <p><PhoneOutlined /> <strong>Mobile:</strong> {viewingEmployee.cell_number || '-'}</p>
                        </Card>
                    </div>
                )}
            </Modal>

            {/* Bulk Import/Export Modal */}
            <EmployeeBulkImport
                visible={bulkImportVisible}
                onClose={() => setBulkImportVisible(false)}
                onSuccess={fetchEmployees}
                departments={departments}
                designations={designations}
                branches={branches}
                employees={employees}
                selectedDivision={selectedDivision}
            />
        </div>
    );
};

export default EmployeesManagement;
