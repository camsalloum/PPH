/**
 * Customer Management - Unified Module
 * 
 * Combines Customer Merging and Customer Master into one tab with internal navigation
 * - Source Data: Shows raw customer data from each source table
 * - AI Suggestions: AI-powered merge suggestions with threshold control
 * - Active Rules: Manage existing merge rules (view, edit, delete, add)
 * - Master: Centralized customer database
 */

import React, { useState } from 'react';
import { Tabs } from 'antd';
import { 
  MergeCellsOutlined, 
  TeamOutlined,
  DatabaseOutlined,
  RobotOutlined,
  FileExcelOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import CustomerMergingPageRedesigned from './CustomerMergingPageRedesigned';
import CustomerMergingAISuggestions from './CustomerMergingAISuggestions';
import CustomerMergingActiveRules from './CustomerMergingActiveRules';
import CustomerMasterPage from './CustomerMasterPage';
import './CustomerManagement.css';

const CustomerManagement = () => {
  const [activeKey, setActiveKey] = useState('source');

  const items = [
    {
      key: 'source',
      label: (
        <span>
          <FileExcelOutlined /> Source Data
        </span>
      ),
      children: <CustomerMergingPageRedesigned />
    },
    {
      key: 'ai-suggestions',
      label: (
        <span>
          <RobotOutlined /> AI Suggestions
        </span>
      ),
      children: <CustomerMergingAISuggestions />
    },
    {
      key: 'active-rules',
      label: (
        <span>
          <MergeCellsOutlined /> Active Rules
        </span>
      ),
      children: <CustomerMergingActiveRules />
    },
    {
      key: 'master',
      label: (
        <span>
          <DatabaseOutlined /> Customer Master
        </span>
      ),
      children: <CustomerMasterPage />
    }
  ];

  return (
    <div className="customer-management-container">
      <div className="customer-management-header">
        <TeamOutlined style={{ fontSize: '24px', marginRight: '12px', color: '#667eea' }} />
        <h2>Customer Management</h2>
      </div>
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={items}
        type="card"
        size="large"
        className="customer-management-tabs"
      />
    </div>
  );
};

export default CustomerManagement;
