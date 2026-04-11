import React, { useState, useCallback } from 'react';
import { Tabs } from 'antd';
import ForecastSalesTab from './ForecastSalesTab';
import ForecastPLTab from './ForecastPLTab';
import { useExcelData } from '../../../contexts/ExcelDataContext';

/**
 * ForecastTab Component - Wrapper with Sub-tabs
 * 
 * Contains two sub-tabs:
 * 1. Forecast Sales - Product group level forecast (original ForecastTab functionality)
 * 2. Forecast P&L - P&L simulation based on forecast sales data
 * 
 * Auto-sync: When ForecastSalesTab saves, ForecastPLTab auto-refreshes
 */
const ForecastTab = ({ isActive }) => {
  const [activeSubTab, setActiveSubTab] = useState('sales');
  const { selectedDivision } = useExcelData();
  
  // Track when sales data is saved - triggers P&L refresh
  const [salesDataVersion, setSalesDataVersion] = useState(0);
  
  // Callback for ForecastSalesTab to notify when data is saved
  const handleForecastSalesSaved = useCallback(() => {
    setSalesDataVersion(v => v + 1);
  }, []);

  const subTabItems = [
    {
      key: 'sales',
      label: 'Forecast Sales',
      children: <ForecastSalesTab 
        isActive={isActive && activeSubTab === 'sales'} 
        onSaveComplete={handleForecastSalesSaved}
      />
    },
    {
      key: 'pl',
      label: 'Forecast P&L',
      children: <ForecastPLTab 
        selectedDivision={selectedDivision} 
        isActive={isActive && activeSubTab === 'pl'}
        salesDataVersion={salesDataVersion}
      />
    }
  ];

  return (
    <div style={{ width: '100%' }}>
      <Tabs 
        activeKey={activeSubTab} 
        onChange={setActiveSubTab}
        type="line"
        size="small"
        items={subTabItems}
        style={{ marginBottom: 0 }}
        tabBarStyle={{ marginBottom: 0, paddingLeft: 16 }}
      />
    </div>
  );
};

export default ForecastTab;
