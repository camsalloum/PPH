/**
 * People & Access Module
 * Unified admin dashboard for user management
 * Part of: User Management Module Implementation - Phase 6
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Menu, Card, Tabs, Badge, Space, Typography, Spin, message, Button, Alert
} from 'antd';
import {
  UserOutlined, TeamOutlined, ApartmentOutlined, GlobalOutlined,
  SafetyCertificateOutlined, KeyOutlined, HistoryOutlined, SettingOutlined,
  SyncOutlined, WarningOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import UnifiedUserEmployee from './UnifiedUserEmployee';
import SalesTeamManager from './SalesTeamManager';
import EnhancedOrgChart from './EnhancedOrgChart';
import TerritoryManager from './TerritoryManager';
import RolesPermissions from './RolesPermissions';
import AuthorizationRulesManager from './AuthorizationRulesManager';
import AuditLog from './AuditLog';
import './PeopleAccess.css';

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const PeopleAccessModule = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [linkSummary, setLinkSummary] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);

  // Load summary data
  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const [linkRes, approvalsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/unified-users/link-summary`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/authorization/approvals/my-pending`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        })
      ]);

      if (linkRes.data.success) {
        setLinkSummary(linkRes.data.summary);
      }
      if (approvalsRes.data.success) {
        setPendingApprovals(approvalsRes.data.approvals || []);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadSummary();
    }
  }, [user, loadSummary]);

  // Menu items with badges
  const menuItems = [
    {
      key: 'users',
      icon: <UserOutlined />,
      label: (
        <Space>
          <span>Users & Employees</span>
          {linkSummary?.unlinked_users > 0 && (
            <Badge count={linkSummary.unlinked_users} size="small" style={{ backgroundColor: '#faad14' }} />
          )}
        </Space>
      )
    },
    {
      key: 'sales',
      icon: <TeamOutlined />,
      label: 'Sales Teams'
    },
    {
      key: 'orgchart',
      icon: <ApartmentOutlined />,
      label: 'Organization Chart'
    },
    {
      key: 'territories',
      icon: <GlobalOutlined />,
      label: 'Territories'
    },
    {
      key: 'divider1',
      type: 'divider'
    },
    {
      key: 'permissions',
      icon: <KeyOutlined />,
      label: 'Roles & Permissions'
    },
    {
      key: 'authorization',
      icon: <SafetyCertificateOutlined />,
      label: (
        <Space>
          <span>Authorization Rules</span>
          {pendingApprovals.length > 0 && (
            <Badge count={pendingApprovals.length} size="small" />
          )}
        </Space>
      )
    },
    {
      key: 'audit',
      icon: <HistoryOutlined />,
      label: 'Audit Log'
    }
  ];

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <UnifiedUserEmployee onRefresh={loadSummary} />;
      case 'sales':
        return <SalesTeamManager />;
      case 'orgchart':
        return <EnhancedOrgChart />;
      case 'territories':
        return <TerritoryManager />;
      case 'permissions':
        return <RolesPermissions />;
      case 'authorization':
        return <AuthorizationRulesManager pendingApprovals={pendingApprovals} onRefresh={loadSummary} />;
      case 'audit':
        return <AuditLog />;
      default:
        return <UnifiedUserEmployee onRefresh={loadSummary} />;
    }
  };

  if (user?.role !== 'admin') {
    return (
      <Card>
        <Alert
          type="error"
          message="Access Denied"
          description="You need administrator privileges to access this module."
          showIcon
        />
      </Card>
    );
  }

  return (
    <Layout className="people-access-layout">
      <Sider 
        width={240} 
        theme="light" 
        className="people-access-sider"
      >
        <div className="people-access-header">
          <Title level={4} style={{ margin: 0 }}>
            <SettingOutlined /> People & Access
          </Title>
          <Text type="secondary">Administration</Text>
        </div>

        {/* Summary Cards */}
        {linkSummary && (
          <div className="people-access-summary">
            <div className="summary-stat">
              <Text type="secondary">Total Users</Text>
              <Title level={3} style={{ margin: 0 }}>{linkSummary.total_users}</Title>
            </div>
            <div className="summary-stat">
              <Text type="secondary">Employees</Text>
              <Title level={3} style={{ margin: 0 }}>{linkSummary.total_employees}</Title>
            </div>
            {linkSummary.unlinked_users > 0 && (
              <Alert
                type="warning"
                message={`${linkSummary.unlinked_users} unlinked users`}
                icon={<WarningOutlined />}
                showIcon
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}

        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => setActiveTab(key)}
          style={{ borderRight: 0 }}
        />

        <div className="people-access-actions">
          <Button 
            icon={<SyncOutlined spin={loading} />} 
            onClick={loadSummary}
            block
          >
            Refresh Data
          </Button>
        </div>
      </Sider>

      <Content className="people-access-content">
        <Spin spinning={loading}>
          {renderContent()}
        </Spin>
      </Content>
    </Layout>
  );
};

export default PeopleAccessModule;
