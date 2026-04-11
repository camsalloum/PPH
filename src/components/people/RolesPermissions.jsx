/**
 * Roles & Permissions Management Component
 * Manage system roles and their permissions
 * Part of: User Management Module Implementation - Phase 4
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Checkbox, Row, Col, Tooltip, Typography,
  Descriptions, Divider, Collapse, Badge, Switch, Tree
} from 'antd';
import {
  SafetyCertificateOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  LockOutlined, UnlockOutlined, SaveOutlined, TeamOutlined, KeyOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Text, Title } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Define permission categories and actions
const PERMISSION_MODULES = {
  dashboard: {
    label: 'Dashboard',
    permissions: ['view', 'export']
  },
  sales: {
    label: 'Sales Data',
    permissions: ['view', 'create', 'edit', 'delete', 'export', 'approve']
  },
  budget: {
    label: 'Budget',
    permissions: ['view', 'create', 'edit', 'delete', 'approve']
  },
  reports: {
    label: 'Reports',
    permissions: ['view', 'create', 'export']
  },
  employees: {
    label: 'Employees',
    permissions: ['view', 'create', 'edit', 'delete']
  },
  territories: {
    label: 'Territories',
    permissions: ['view', 'create', 'edit', 'delete', 'assign']
  },
  users: {
    label: 'User Management',
    permissions: ['view', 'create', 'edit', 'delete', 'assign_roles']
  },
  authorization: {
    label: 'Authorization Rules',
    permissions: ['view', 'create', 'edit', 'delete', 'approve']
  },
  settings: {
    label: 'System Settings',
    permissions: ['view', 'edit']
  }
};

const RolesPermissions = ({ onRefresh }) => {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [permModalVisible, setPermModalVisible] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [form] = Form.useForm();

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rolesRes, permsRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/auth/roles`, { headers }),
        axios.get(`${API_BASE_URL}/api/permissions/catalog`, { headers }),
        axios.get(`${API_BASE_URL}/api/auth/users`, { headers })
      ]);

      if (rolesRes.data.success) setRoles(rolesRes.data.roles);
      if (permsRes.data.success) setPermissions(permsRes.data.catalog || permsRes.data.permissions || []);
      if (usersRes.data.success) setUsers(usersRes.data.users);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load roles and permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle role create/update
  const handleRoleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      if (editRole) {
        await axios.put(
          `${API_BASE_URL}/api/auth/roles/${editRole.id}`,
          values,
          { headers }
        );
        message.success('Role updated successfully');
      } else {
        await axios.post(
          `${API_BASE_URL}/api/auth/roles`,
          values,
          { headers }
        );
        message.success('Role created successfully');
      }

      setRoleModalVisible(false);
      form.resetFields();
      setEditRole(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.error || 'Operation failed');
    }
  };

  // Handle delete role
  const handleDeleteRole = async (id) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(
        `${API_BASE_URL}/api/auth/roles/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Role deleted');
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to delete');
    }
  };

  // Open edit role modal
  const handleEditRole = (record) => {
    setEditRole(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      is_system: record.is_system
    });
    setRoleModalVisible(true);
  };

  // Open permissions modal for a role
  const handleManagePermissions = (role) => {
    setSelectedRole(role);
    // Get current permissions for this role
    const currentPerms = permissions
      .filter(p => p.role_id === role.id)
      .map(p => `${p.module}:${p.action}`);
    setSelectedPermissions(currentPerms);
    setPermModalVisible(true);
  };

  // Save permissions for role
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    try {
      const token = localStorage.getItem('auth_token');
      await axios.put(
        `${API_BASE_URL}/api/auth/roles/${selectedRole.id}/permissions`,
        { permissions: selectedPermissions },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Permissions updated');
      setPermModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('Failed to update permissions');
    }
  };

  // Toggle permission
  const togglePermission = (key) => {
    setSelectedPermissions(prev => 
      prev.includes(key) 
        ? prev.filter(p => p !== key)
        : [...prev, key]
    );
  };

  // Check if permission is selected
  const isPermissionSelected = (module, action) => {
    return selectedPermissions.includes(`${module}:${action}`);
  };

  // Role color
  const getRoleColor = (name) => {
    const colors = {
      admin: 'red',
      sales_manager: 'blue',
      sales_rep: 'green',
      viewer: 'default'
    };
    return colors[name] || 'purple';
  };

  // Table columns
  const columns = [
    {
      title: 'Role',
      key: 'name',
      render: (_, record) => (
        <Space>
          <SafetyCertificateOutlined style={{ color: getRoleColor(record.name) === 'default' ? '#666' : getRoleColor(record.name) }} />
          <div>
            <Tag color={getRoleColor(record.name)}>
              {record.name.replace('_', ' ').toUpperCase()}
            </Tag>
            {record.is_system && (
              <Tag size="small" color="gold">System</Tag>
            )}
          </div>
        </Space>
      )
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc) => desc || <Text type="secondary">No description</Text>
    },
    {
      title: 'Users',
      key: 'users',
      width: 100,
      render: (_, record) => {
        const count = users.filter(u => u.role === record.name).length;
        return (
          <Badge count={count} showZero style={{ backgroundColor: count > 0 ? '#1890ff' : '#d9d9d9' }}>
            <TeamOutlined style={{ fontSize: 16, marginRight: 8 }} />
          </Badge>
        );
      }
    },
    {
      title: 'Permissions',
      key: 'permissions',
      render: (_, record) => {
        const count = permissions.filter(p => p.role_id === record.id).length;
        return (
          <Button
            type="link"
            size="small"
            onClick={() => handleManagePermissions(record)}
          >
            <KeyOutlined /> {count} permissions
          </Button>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Manage Permissions">
            <Button
              size="small"
              icon={<KeyOutlined />}
              onClick={() => handleManagePermissions(record)}
            />
          </Tooltip>
          {!record.is_system && (
            <>
              <Tooltip title="Edit">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEditRole(record)}
                />
              </Tooltip>
              <Popconfirm
                title="Delete this role?"
                onConfirm={() => handleDeleteRole(record.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="roles-permissions">
      <Row gutter={16}>
        {/* Roles Table */}
        <Col span={24}>
          <Card
            title={<><SafetyCertificateOutlined /> System Roles</>}
            size="small"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditRole(null);
                  form.resetFields();
                  setRoleModalVisible(true);
                }}
              >
                Add Role
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={roles}
              rowKey="id"
              loading={loading}
              pagination={false}
              size="middle"
            />
          </Card>
        </Col>
      </Row>

      {/* Permission Matrix */}
      <Card
        title={<><KeyOutlined /> Permission Matrix</>}
        size="small"
        style={{ marginTop: 16 }}
      >
        <Table
          dataSource={Object.entries(PERMISSION_MODULES).map(([key, val]) => ({
            key,
            module: val.label,
            permissions: val.permissions
          }))}
          rowKey="key"
          pagination={false}
          size="small"
        >
          <Table.Column title="Module" dataIndex="module" width={150} />
          {roles.map(role => (
            <Table.Column
              key={role.id}
              title={
                <Tag color={getRoleColor(role.name)} size="small">
                  {role.name.replace('_', ' ')}
                </Tag>
              }
              width={120}
              render={(_, record) => {
                const rolePerms = permissions.filter(p => 
                  p.role_id === role.id && p.module === record.key
                );
                return (
                  <Space wrap size={2}>
                    {record.permissions.map(action => {
                      const hasPerm = rolePerms.some(p => p.action === action);
                      return (
                        <Tooltip key={action} title={action}>
                          <Tag 
                            size="small" 
                            color={hasPerm ? 'green' : 'default'}
                            style={{ fontSize: 10 }}
                          >
                            {hasPerm ? <CheckCircleOutlined /> : null} {action.slice(0, 3)}
                          </Tag>
                        </Tooltip>
                      );
                    })}
                  </Space>
                );
              }}
            />
          ))}
        </Table>
      </Card>

      {/* Create/Edit Role Modal */}
      <Modal
        title={
          editRole ?
            <><EditOutlined /> Edit Role</> :
            <><PlusOutlined /> Add Role</>
        }
        open={roleModalVisible}
        onCancel={() => {
          setRoleModalVisible(false);
          form.resetFields();
          setEditRole(null);
        }}
        footer={null}
        width={500}
      >
        <Form form={form} onFinish={handleRoleSubmit} layout="vertical">
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: 'Role name is required' }]}
          >
            <Input
              prefix={<SafetyCertificateOutlined />}
              placeholder="e.g., regional_manager"
              disabled={editRole?.is_system}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea rows={3} placeholder="Describe this role's purpose" />
          </Form.Item>

          <Divider />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                {editRole ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setRoleModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Manage Permissions Modal */}
      <Modal
        title={
          <Space>
            <KeyOutlined />
            Manage Permissions for 
            <Tag color={getRoleColor(selectedRole?.name)}>
              {selectedRole?.name?.replace('_', ' ').toUpperCase()}
            </Tag>
          </Space>
        }
        open={permModalVisible}
        onCancel={() => setPermModalVisible(false)}
        onOk={handleSavePermissions}
        okText="Save Permissions"
        width={700}
      >
        <Collapse defaultActiveKey={Object.keys(PERMISSION_MODULES)}>
          {Object.entries(PERMISSION_MODULES).map(([module, config]) => (
            <Panel
              key={module}
              header={
                <Space>
                  <LockOutlined />
                  {config.label}
                  <Badge
                    count={config.permissions.filter(a => 
                      isPermissionSelected(module, a)
                    ).length}
                    style={{ backgroundColor: '#52c41a' }}
                  />
                </Space>
              }
            >
              <Checkbox.Group
                value={config.permissions.filter(a => isPermissionSelected(module, a))}
                onChange={(checked) => {
                  // Update selected permissions
                  const newPerms = selectedPermissions.filter(p => 
                    !p.startsWith(`${module}:`)
                  );
                  checked.forEach(action => {
                    newPerms.push(`${module}:${action}`);
                  });
                  setSelectedPermissions(newPerms);
                }}
              >
                <Row>
                  {config.permissions.map(action => (
                    <Col span={8} key={action}>
                      <Checkbox value={action}>
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </Checkbox>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Panel>
          ))}
        </Collapse>
      </Modal>
    </div>
  );
};

export default RolesPermissions;
