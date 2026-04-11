/**
 * Sales Rep List - Team Directory
 * Shows all active sales representatives
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, Row, Col, Typography, Space, Tag, Avatar, Spin, Empty,
  Badge, Tooltip, Button
} from 'antd';
import {
  TeamOutlined,
  UserOutlined,
  MailOutlined,
  UsergroupAddOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import axios from 'axios';
import './CRM.css';

const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Color palette for avatars
const avatarColors = [
  '#1890ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', 
  '#eb2f96', '#fa541c', '#2f54eb'
];

const getAvatarColor = (name) => {
  if (!name) return avatarColors[0];
  const charCode = name.charCodeAt(0);
  return avatarColors[charCode % avatarColors.length];
};

const SalesRepList = () => {
  const [loading, setLoading] = useState(true);
  const [salesReps, setSalesReps] = useState([]);

  const loadSalesReps = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/crm/sales-reps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setSalesReps(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading sales reps:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSalesReps();
  }, []);

  if (loading) {
    return (
      <div className="crm-loading">
        <Spin size="large" />
        <Text type="secondary">Loading sales team...</Text>
      </div>
    );
  }

  // Separate groups and individuals
  const groups = salesReps.filter(r => r.type === 'GROUP');
  const individuals = salesReps.filter(r => r.type !== 'GROUP');

  return (
    <div className="crm-sales-rep-list crm-animate-in">
      {/* Page Header */}
      <Space className="crm-header-space">
        <div className="crm-page-title crm-mb-0">
          <TeamOutlined />
          <Title level={2}>Sales Team</Title>
          <Tag color="purple">{salesReps.length} members</Tag>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={loadSalesReps}
          loading={loading}
        >
          Refresh
        </Button>
      </Space>

      {salesReps.length === 0 ? (
        <Card>
          <Empty description="No sales representatives found" />
        </Card>
      ) : (
        <>
          {/* Groups Section */}
          {groups.length > 0 && (
            <>
              <Title level={4} className="crm-salesrep-group-title">
                <UsergroupAddOutlined className="crm-salesrep-group-icon" />
                Sales Groups
              </Title>
              <Row gutter={[20, 20]} className="crm-row-mb-32">
                {groups.map((rep) => (
                  <Col xs={24} sm={12} lg={8} key={rep.user_id}>
                    <Card className="crm-sales-rep-card" hoverable>
                      <div className="crm-sales-rep-avatar">
                        <Badge 
                          count={rep.group_members?.length || 0} 
                          className="crm-salesrep-badge"
                          title="Team members"
                        >
                          <Avatar 
                            size={72} 
                            className="crm-avatar-dynamic"
                            style={{ backgroundColor: getAvatarColor(rep.full_name) }}
                          >
                            {rep.full_name?.charAt(0)?.toUpperCase()}
                          </Avatar>
                        </Badge>
                      </div>
                      <Title level={4} className="crm-salesrep-name">
                        {rep.full_name}
                      </Title>
                      <Tag color="purple" className="crm-salesrep-tag">
                        <UsergroupAddOutlined /> Group Leader
                      </Tag>
                      
                      {rep.group_members && rep.group_members.length > 0 && (
                        <div className="crm-salesrep-members">
                          <Text type="secondary" className="crm-salesrep-members-label">
                            Team Members:
                          </Text>
                          <div className="crm-salesrep-members-tags">
                            {rep.group_members.map((member, idx) => (
                              <Tag key={idx} className="crm-salesrep-member-tag">
                                {member}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}

                      {rep.email && (
                        <div className="crm-salesrep-email">
                          <Tooltip title={rep.email}>
                            <Text type="secondary" className="crm-salesrep-email-text">
                              <MailOutlined className="crm-salesrep-email-icon" />
                              {rep.email}
                            </Text>
                          </Tooltip>
                        </div>
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}

          {/* Individuals Section */}
          {individuals.length > 0 && (
            <>
              <Title level={4} className="crm-salesrep-group-title">
                <UserOutlined className="crm-salesrep-group-icon" />
                Individual Sales Reps
              </Title>
              <Row gutter={[20, 20]}>
                {individuals.map((rep) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={rep.user_id}>
                    <Card className="crm-sales-rep-card" hoverable>
                      <div className="crm-sales-rep-avatar">
                        <Avatar 
                          size={64} 
                          className="crm-avatar-dynamic"
                          style={{ backgroundColor: getAvatarColor(rep.full_name) }}
                        >
                          {rep.full_name?.charAt(0)?.toUpperCase()}
                        </Avatar>
                      </div>
                      <Title level={5} className="crm-salesrep-name">
                        {rep.full_name}
                      </Title>
                      <Tag color="blue">
                        <UserOutlined /> Individual
                      </Tag>

                      {rep.email && (
                        <div className="crm-salesrep-email">
                          <Tooltip title={rep.email}>
                            <Text type="secondary" className="crm-salesrep-email-text" ellipsis>
                              <MailOutlined className="crm-salesrep-email-icon" />
                              {rep.email}
                            </Text>
                          </Tooltip>
                        </div>
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default SalesRepList;
