import React, { useState } from 'react';
import { Tabs, Tooltip } from 'antd';
import ActualTab from './ActualTab';
import EstimateTab from './EstimateTab';
import BudgetTab from './BudgetTab';
import ForecastTab from './ForecastTab';

/**
 * AEBF Component - Financial Planning Data Management
 * 
 * AEBF = Actual, Estimate, Budget, Forecast
 * Main container with 4 subtabs for managing different financial data types
 * 
 * Note: Project-wide system workflow is now available in Master Data Management > System Workflow
 */
const AEBFTab = () => {
  const [activeKey, setActiveKey] = useState('actual');

  const handleTabChange = (key) => {
    setActiveKey(key);
  };

  const tabItems = [
    {
      key: 'actual',
      label: (
        <Tooltip title="Historical sales data from database">
          <span>
            <span style={{ fontWeight: 'bold', color: '#1890ff' }}>A</span>ctual
          </span>
        </Tooltip>
      ),
      children: <ActualTab isActive={activeKey === 'actual'} />
    },
    {
      key: 'estimate',
      label: (
        <Tooltip title="Projections combining actual + estimated future months">
          <span>
            <span style={{ fontWeight: 'bold', color: '#52c41a' }}>E</span>stimate
          </span>
        </Tooltip>
      ),
      children: <EstimateTab isActive={activeKey === 'estimate'} />
    },
    {
      key: 'budget',
      label: (
        <Tooltip title="Sales rep budgets for next year planning">
          <span>
            <span style={{ fontWeight: 'bold', color: '#faad14' }}>B</span>udget
          </span>
        </Tooltip>
      ),
      children: <BudgetTab isActive={activeKey === 'budget'} />
    },
    {
      key: 'forecast',
      label: (
        <Tooltip title="Combined view: Actual + Estimate + Budget trends">
          <span>
            <span style={{ fontWeight: 'bold', color: '#722ed1' }}>F</span>orecast
          </span>
        </Tooltip>
      ),
      children: <ForecastTab isActive={activeKey === 'forecast'} />
    }
  ];

  return (
    <div className="aebf-container" style={{ padding: 0 }}>
      <Tabs 
        activeKey={activeKey} 
        onChange={handleTabChange}
        type="card"
        size="middle"
        items={tabItems}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
};

export default AEBFTab;
