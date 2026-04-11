/**
 * Unified User & Employee Management Component
 * Shows users and employees with linkage status
 * Part of: User Management Module Implementation - Phase 1
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Tabs, Badge, Tooltip, Avatar, Alert, Divider,
  Row, Col, Statistic, Typography
} from 'antd';
import {
  UserAddOutlined, LinkOutlined, DisconnectOutlined, UserOutlined,
  CheckCircleOutlined, WarningOutlined, MailOutlined, TeamOutlined,
  PlusOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TabPane } = Tabs;
const { Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const UnifiedUserEmployee = ({ onRefresh }) => {
  const [users, setUsers] = useState([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
  const [unlinkedEmployees, setUnlinkedEmployees] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [createEmployeeModalVisible, setCreateEmployeeModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form] = Form.useForm();

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, unlinkedUsersRes, unlinkedEmpsRes, designRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/unified-users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/unified-users/unlinked-users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/unified-users/unlinked-employees`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/employees/designations`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        })
      ]);

      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (unlinkedUsersRes.data.success) setUnlinkedUsers(unlinkedUsersRes.data.users);
      if (unlinkedEmpsRes.data.success) setUnlinkedEmployees(unlinkedEmpsRes.data.employees);
      if (designRes.data.success) setDesignations(designRes.data.designations);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Link user to employee
  const handleLink = async (values) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/unified-users/${selectedUser.user_id}/link-employee`,
        { employeeId: values.employeeId },
        { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
      );
      message.success('User linked to employee successfully');
      setLinkModalVisible(false);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to link');
    }
  };

  // Create employee from user
  const handleCreateEmployee = async (values) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/unified-users/${selectedUser.user_id}/create-employee`,
        values,
        { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
      );
      message.success('Employee profile created successfully');
      setCreateEmployeeModalVisible(false);
      form.resetFields();
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to create employee');
    }
  };

  // Unlink user
  const handleUnlink = async (userId) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/unified-users/${userId}/unlink`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
      );
      message.success('User unlinked from employee');
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to unlink');
    }
  };

  // Role badge color
  const getRoleColor = (role) => {
    const colors = {
      admin: 'red',
      sales_manager: 'blue',
      sales_rep: 'green',
      viewer: 'default'
    };
    return colors[role] || 'default';
  };

  // Main table columns
  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, record) => (
        <Space>
          <Avatar 
            src={record.photo_url} 
            icon={<UserOutlined />}
            style={{ backgroundColor: record.link_status === 'linked' ? '#52c41a' : '#faad14' }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{record.user_name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <MailOutlined /> {record.email}
            </Text>
          </div>
        </Space>
      ),
      sorter: (a, b) => (a.user_name || '').localeCompare(b.user_name || '')
    },
    {
      title: 'System Role',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role) => (
        <Tag color={getRoleColor(role)}>{role?.replace('_', ' ').toUpperCase()}</Tag>
      ),
      filters: [
        { text: 'Admin', value: 'admin' },
        { text: 'Regional Sales Manager', value: 'regional_sales_manager' },
        { text: 'Area Sales Manager', value: 'area_sales_manager' },
        { text: 'Sales Manager', value: 'sales_manager' },
        { text: 'Sales Coordinator', value: 'sales_coordinator' },
        { text: 'Sales Rep', value: 'sales_rep' },
        { text: 'Sales Executive', value: 'sales_executive' }
      ],
      onFilter: (value, record) => record.role === value
    },
    {
      title: 'Employee Profile',
      key: 'employee',
      render: (_, record) => (
        record.employee_id ? (
          <Space direction="vertical" size={0}>
            <Text strong>{record.employee_name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.designation_name || 'No designation'}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.department || ''}
            </Text>
          </Space>
        ) : (
          <Text type="secondary" italic>No employee profile</Text>
        )
      )
    },
    {
      title: 'Link Status',
      key: 'link_status',
      width: 120,
      render: (_, record) => (
        record.link_status === 'linked' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">Linked</Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">Unlinked</Tag>
        )
      ),
      filters: [
        { text: 'Linked', value: 'linked' },
        { text: 'Unlinked', value: 'unlinked' }
      ],
      onFilter: (value, record) => record.link_status === value
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
      width: 180,
      render: (_, record) => (
        <Space size="small">
          {record.link_status !== 'linked' ? (
            <>
              <Tooltip title="Link to existing employee">
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => {
                    setSelectedUser(record);
                    setLinkModalVisible(true);
                  }}
                  disabled={unlinkedEmployees.length === 0}
                />
              </Tooltip>
              <Tooltip title="Create new employee profile">
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSelectedUser(record);
                    form.setFieldsValue({
                      full_name: record.user_name,
                      department: ''
                    });
                    setCreateEmployeeModalVisible(true);
                  }}
                />
              </Tooltip>
            </>
          ) : (
            <Popconfirm
              title="Unlink this user from employee?"
              onConfirm={() => handleUnlink(record.user_id)}
            >
              <Button size="small" danger icon={<DisconnectOutlined />}>
                Unlink
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  // Unlinked employees columns
  const unlinkedEmpColumns = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#faad14' }} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.full_name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.employee_code}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Designation',
      dataIndex: 'designation_name',
      key: 'designation'
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department'
    },
    {
      title: 'Email',
      dataIndex: 'personal_email',
      key: 'email'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Active' ? 'green' : 'default'}>{status}</Tag>
      )
    }
  ];

  return (
    <div className="unified-user-employee">
      {/* Summary Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Users"
              value={users.length}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Linked"
              value={users.filter(u => u.link_status === 'linked').length}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Unlinked Users"
              value={unlinkedUsers.length}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Unlinked Employees"
              value={unlinkedEmployees.length}
              prefix={<TeamOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Warning Alert */}
      {(unlinkedUsers.length > 0 || unlinkedEmployees.length > 0) && (
        <Alert
          type="warning"
          message="Incomplete User-Employee Linkage"
          description={`There are ${unlinkedUsers.length} users without employee profiles and ${unlinkedEmployees.length} employees without user accounts. Link them for complete access control.`}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs defaultActiveKey="all">
        <TabPane
          tab={<span><UserOutlined /> All Users ({users.length})</span>}
          key="all"
        >
          <Table
            columns={columns}
            dataSource={users}
            rowKey="user_id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            size="middle"
          />
        </TabPane>

        <TabPane
          tab={
            <span>
              <WarningOutlined style={{ color: '#faad14' }} />
              Unlinked Users
              <Badge count={unlinkedUsers.length} style={{ marginLeft: 8 }} />
            </span>
          }
          key="unlinked-users"
        >
          <Table
            columns={columns.filter(c => c.key !== 'employee')}
            dataSource={unlinkedUsers.map(u => ({ ...u, user_id: u.id, link_status: 'unlinked' }))}
            rowKey="id"
            loading={loading}
            size="middle"
          />
        </TabPane>

        <TabPane
          tab={
            <span>
              <TeamOutlined style={{ color: '#faad14' }} />
              Unlinked Employees
              <Badge count={unlinkedEmployees.length} style={{ marginLeft: 8 }} />
            </span>
          }
          key="unlinked-employees"
        >
          <Table
            columns={unlinkedEmpColumns}
            dataSource={unlinkedEmployees}
            rowKey="id"
            loading={loading}
            size="middle"
          />
        </TabPane>
      </Tabs>

      {/* Link Modal */}
      <Modal
        title={<><LinkOutlined /> Link User to Employee</>}
        open={linkModalVisible}
        onCancel={() => setLinkModalVisible(false)}
        footer={null}
      >
        <Form onFinish={handleLink} layout="vertical">
          <Form.Item label="User">
            <Input value={selectedUser?.user_name} disabled prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item
            name="employeeId"
            label="Select Employee"
            rules={[{ required: true, message: 'Please select an employee' }]}
          >
            <Select
              placeholder="Choose an employee to link"
              showSearch
              optionFilterProp="children"
            >
              {unlinkedEmployees.map(emp => (
                <Option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code}) - {emp.designation_name || 'No designation'}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<LinkOutlined />}>
                Link
              </Button>
              <Button onClick={() => setLinkModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Employee Modal */}
      <Modal
        title={<><UserAddOutlined /> Create Employee Profile</>}
        open={createEmployeeModalVisible}
        onCancel={() => {
          setCreateEmployeeModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} onFinish={handleCreateEmployee} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="full_name"
                label="Full Name"
                rules={[{ required: true }]}
              >
                <Input prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="designation_id"
                label="Designation"
              >
                <Select placeholder="Select designation" allowClear>
                  {designations.map(d => (
                    <Option key={d.id} value={d.id}>{d.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="department" label="Department">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_of_joining" label="Date of Joining">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Divider />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<UserAddOutlined />}>
                Create Employee
              </Button>
              <Button onClick={() => setCreateEmployeeModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UnifiedUserEmployee;
