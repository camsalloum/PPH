/**
 * CRMSalesReport
 * ──────────────
 * Renders the full MIS Sales Rep Report inside the CRM shell,
 * pre-filtered to the logged-in sales rep's group.
 *
 * All required providers (ExcelData, SalesData, SalesRepReports, Filter)
 * are now supplied by the /crm/* route wrapper in App.jsx — exactly the
 * same stack as /dashboard. This component just renders the report.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Tag, Button, Space, Tooltip } from 'antd';
import { SettingOutlined, CalendarOutlined, StarFilled } from '@ant-design/icons';
import { useFilter } from '../../contexts/FilterContext';
import { SalesRepReportContent } from '../dashboard/SalesBySaleRepTable';

// ── Period bar ───────────────────────────────────────────────────────────────
const CRMPeriodBar = () => {
  const navigate = useNavigate();
  const { columnOrder, basePeriodIndex } = useFilter();

  const typeColor = { ACTUAL: 'blue', BUDGET: 'orange', ESTIMATE: 'purple', FORECAST: 'cyan' };
  const typeLabel = { ACTUAL: 'Act', BUDGET: 'Bud', ESTIMATE: 'Est', FORECAST: 'Fct' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 20px',
      background: '#f8faff',
      borderBottom: '1px solid #e8ecf4',
      flexWrap: 'wrap',
      gap: 8,
    }}>
      <Space size={6} wrap>
        <CalendarOutlined style={{ color: '#6366f1', fontSize: 14 }} />
        <span style={{ fontSize: 12, color: '#888', marginRight: 4 }}>Active Periods:</span>
        {columnOrder.length === 0 ? (
          <Tag color="default">No periods configured — go to Settings to add periods</Tag>
        ) : columnOrder.map((col, i) => {
          const type = String(col.type || 'Actual').toUpperCase();
          const label = `${col.year} ${col.month} ${typeLabel[type] || col.type}`;
          const isBase = i === basePeriodIndex;
          return (
            <Tooltip key={col.id || i} title={isBase ? 'Base Period (comparison reference)' : ''}>
              <Tag
                color={typeColor[type] || 'default'}
                icon={isBase ? <StarFilled style={{ fontSize: 10 }} /> : null}
                style={{ fontWeight: isBase ? 700 : 400, cursor: 'default' }}
              >
                {label}
              </Tag>
            </Tooltip>
          );
        })}
      </Space>
      <Tooltip title="Change the periods shown in this report. Changes saved in Settings apply here immediately on next visit.">
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => navigate('/settings', { state: { activeTab: 'periods' } })}
          style={{ fontSize: 12 }}
        >
          Configure Periods
        </Button>
      </Tooltip>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
const CRMSalesReport = ({ groupName }) => {
  if (!groupName) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CRMPeriodBar />
      <SalesRepReportContent rep={groupName} />
    </div>
  );
};

export default CRMSalesReport;
