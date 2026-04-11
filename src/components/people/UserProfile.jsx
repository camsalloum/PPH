/**
 * User Profile Component
 * Self-service profile management for users
 * Part of: User Management Module Implementation - Phase 8
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Form, Input, Button, Avatar, Upload, message, Tabs, Row, Col,
  Typography, Divider, Tag, Space, Descriptions, List, Switch, Modal,
  Alert, Statistic
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, LockOutlined,
  CameraOutlined, SaveOutlined, SafetyCertificateOutlined,
  TeamOutlined, GlobalOutlined, HistoryOutlined, BellOutlined,
  EditOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const UserProfile = () => {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [notifications, setNotifications] = useState({
    email_approvals: true,
    email_mentions: true,
    browser_notifications: false
  });
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // Fetch current user profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.get(
        `${API_BASE_URL}/api/unified-users/me`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setUser(response.data.user);
        setEmployee(response.data.employee);
        form.setFieldsValue({
          full_name: response.data.employee?.full_name || response.data.user.username,
          personal_email: response.data.employee?.personal_email || response.data.user.email,
          mobile: response.data.employee?.mobile,
          department: response.data.employee?.department
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      message.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Update profile
  const handleUpdateProfile = async (values) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.put(
        `${API_BASE_URL}/api/unified-users/me`,
        values,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Profile updated successfully');
      fetchProfile();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async (values) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/auth/change-password`,
        {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Password changed successfully');
      setPasswordModalVisible(false);
      passwordForm.resetFields();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to change password');
    }
  };

  // Update notification settings
  const handleNotificationChange = (key, value) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
    // Would save to backend in real implementation
  };

  // Photo upload handler
  const handlePhotoUpload = async (info) => {
    if (info.file.status === 'done') {
      message.success('Photo uploaded successfully');
      fetchProfile();
    } else if (info.file.status === 'error') {
      message.error('Photo upload failed');
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'red',
      sales_manager: 'blue',
      sales_rep: 'green',
      viewer: 'default'
    };
    return colors[role] || 'default';
  };

  return (
    <div className="user-profile" style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card loading={loading}>
        <Row gutter={24}>
          {/* Left: Avatar and basic info */}
          <Col span={8} style={{ textAlign: 'center' }}>
            <Upload
              name="photo"
              showUploadList={false}
              action={`${API_BASE_URL}/api/unified-users/me/photo`}
              headers={{ Authorization: `Bearer ${localStorage.getItem('auth_token')}` }}
              onChange={handlePhotoUpload}
            >
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Avatar
                  src={employee?.photo_url}
                  icon={<UserOutlined />}
                  size={120}
                  style={{ backgroundColor: '#1890ff' }}
                />
                <Button
                  shape="circle"
                  icon={<CameraOutlined />}
                  size="small"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0
                  }}
                />
              </div>
            </Upload>
            <Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
              {employee?.full_name || user?.username}
            </Title>
            <Text type="secondary">
              {employee?.designation_name || 'No designation'}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Tag color={getRoleColor(user?.role)}>
                {user?.role?.replace('_', ' ').toUpperCase()}
              </Tag>
            </div>

            <Divider />

            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {user?.email && (
                <Text>
                  <MailOutlined /> {user.email}
                </Text>
              )}
              {employee?.mobile && (
                <Text>
                  <PhoneOutlined /> {employee.mobile}
                </Text>
              )}
              {employee?.department && (
                <Text>
                  <TeamOutlined /> {employee.department}
                </Text>
              )}
            </Space>

            <Divider />

            <Button
              icon={<LockOutlined />}
              onClick={() => setPasswordModalVisible(true)}
              style={{ width: '100%' }}
            >
              Change Password
            </Button>
          </Col>

          {/* Right: Tabs with details */}
          <Col span={16}>
            <Tabs defaultActiveKey="profile">
              <TabPane tab={<><EditOutlined /> Edit Profile</>} key="profile">
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleUpdateProfile}
                >
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
                        name="personal_email"
                        label="Personal Email"
                        rules={[{ type: 'email' }]}
                      >
                        <Input prefix={<MailOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="mobile" label="Mobile Number">
                        <Input prefix={<PhoneOutlined />} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="department" label="Department">
                        <Input prefix={<TeamOutlined />} disabled />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={saving}
                    >
                      Save Changes
                    </Button>
                  </Form.Item>
                </Form>
              </TabPane>

              <TabPane tab={<><SafetyCertificateOutlined /> Permissions</>} key="permissions">
                <Alert
                  type="info"
                  message="Your Access Permissions"
                  description="These are the permissions assigned to your role. Contact an administrator to request changes."
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="System Role">
                    <Tag color={getRoleColor(user?.role)}>
                      {user?.role?.replace('_', ' ').toUpperCase()}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Territory Access">
                    {employee?.territory_name || 'All territories'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Can Approve">
                    {user?.role === 'admin' || user?.role === 'sales_manager' ? (
                      <Tag color="green">Yes</Tag>
                    ) : (
                      <Tag>No</Tag>
                    )}
                  </Descriptions.Item>
                </Descriptions>

                <Divider orientation="left">Module Access</Divider>
                <List
                  size="small"
                  dataSource={[
                    { module: 'Dashboard', access: true },
                    { module: 'Sales Data', access: true },
                    { module: 'Budget', access: user?.role !== 'viewer' },
                    { module: 'Reports', access: true },
                    { module: 'User Management', access: user?.role === 'admin' },
                    { module: 'Settings', access: user?.role === 'admin' }
                  ]}
                  renderItem={item => (
                    <List.Item>
                      <Space>
                        {item.access ? (
                          <Tag color="green">✓</Tag>
                        ) : (
                          <Tag color="default">✗</Tag>
                        )}
                        {item.module}
                      </Space>
                    </List.Item>
                  )}
                />
              </TabPane>

              <TabPane tab={<><BellOutlined /> Notifications</>} key="notifications">
                <List
                  itemLayout="horizontal"
                  dataSource={[
                    {
                      key: 'email_approvals',
                      title: 'Approval Requests',
                      description: 'Receive email when you have pending approvals'
                    },
                    {
                      key: 'email_mentions',
                      title: 'Mentions',
                      description: 'Receive email when someone mentions you'
                    },
                    {
                      key: 'browser_notifications',
                      title: 'Browser Notifications',
                      description: 'Show browser notifications for important updates'
                    }
                  ]}
                  renderItem={item => (
                    <List.Item
                      actions={[
                        <Switch
                          checked={notifications[item.key]}
                          onChange={(val) => handleNotificationChange(item.key, val)}
                        />
                      ]}
                    >
                      <List.Item.Meta
                        title={item.title}
                        description={item.description}
                      />
                    </List.Item>
                  )}
                />
              </TabPane>

              <TabPane tab={<><HistoryOutlined /> Activity</>} key="activity">
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="Last Login"
                        value={user?.last_login ? new Date(user.last_login).toLocaleDateString() : 'N/A'}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="Sessions This Month"
                        value={12}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="Approvals Pending"
                        value={3}
                      />
                    </Card>
                  </Col>
                </Row>
                <Text type="secondary">
                  Recent activity log would appear here...
                </Text>
              </TabPane>
            </Tabs>
          </Col>
        </Row>
      </Card>

      {/* Change Password Modal */}
      <Modal
        title={<><LockOutlined /> Change Password</>}
        open={passwordModalVisible}
        onCancel={() => {
          setPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
        footer={null}
      >
        <Form form={passwordForm} onFinish={handleChangePassword} layout="vertical">
          <Form.Item
            name="currentPassword"
            label="Current Password"
            rules={[{ required: true, message: 'Enter current password' }]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'Enter new password' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm New Password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Confirm new password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
                }
              })
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                Change Password
              </Button>
              <Button onClick={() => setPasswordModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserProfile;
