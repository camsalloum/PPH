/**
 * PipelineSummaryCard — CRM Deal pipeline health at a glance.
 *
 * Fetches from /api/crm/deals and displays:
 *   - Total open deals (Qualified + Proposal + Negotiation)
 *   - Total pipeline value
 *   - Count per active stage with colour-coded tags
 *   - Won/Lost counts
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Typography, Space, Skeleton, Tooltip, Button } from 'antd';
import { FunnelPlotOutlined, ReloadOutlined, ArrowRightOutlined, TrophyOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, fmt, DEAL_STAGES, DEAL_OPEN_STAGES } from './CRMDashboardUtils.jsx';
import CurrencySymbol from '../common/CurrencySymbol';
import { useCurrency } from '../../contexts/CurrencyContext';
import './CRM.css';

const { Text } = Typography;

// NEW-02/03 fix: Use shared stage constants from CRMDashboardUtils
const OPEN_STAGES_SET = new Set(DEAL_OPEN_STAGES);

export default function PipelineSummaryCard() {
  const navigate = useNavigate();
  const { companyCurrency } = useCurrency();
  const currencyCode = companyCurrency?.code || 'AED';
  const [deals, setDeals]     = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res   = await axios.get(`${API_BASE_URL}/api/crm/deals`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      if (res.data?.success) setDeals(res.data.data || []);
    } catch {
      // Non-blocking — silently leave deals as empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  if (loading) {
    return (
      <Card variant="borderless" className="crm-pipeline-card">
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Compute stats from deals array
  const stageCounts = {};
  let openValue = 0;
  for (const deal of deals) {
    stageCounts[deal.stage] = (stageCounts[deal.stage] || 0) + 1;
    if (OPEN_STAGES_SET.has(deal.stage)) {
      openValue += parseFloat(deal.estimated_value || 0);
    }
  }
  // Use shared constant for open count calculation
  const openCount = DEAL_OPEN_STAGES.reduce((sum, stage) => sum + (stageCounts[stage] || 0), 0);

  return (
    <Card variant="borderless" className="crm-pipeline-card">
      <div className="crm-pipeline-header">
        <Space size={6}>
          <FunnelPlotOutlined style={{ color: '#1677ff', fontSize: 15 }} />
          <Text strong>Deal Pipeline</Text>
        </Space>
        <Space size={8}>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={loadDeals} />
          <Button type="link" size="small" icon={<ArrowRightOutlined />} onClick={() => navigate('/crm/customers')}>
            View deals
          </Button>
        </Space>
      </div>

      {openCount === 0 ? (
        <Text type="secondary">No open deals — ready to create one?</Text>
      ) : (
        <>
          <div className="crm-pipeline-stats">
            <div className="crm-pipeline-stat">
              <span className="crm-pipeline-stat-value">{openCount}</span>
              <Text className="crm-pipeline-stat-label">Open deals</Text>
            </div>
            <div className="crm-pipeline-stat">
              <span className="crm-pipeline-stat-value">
                <CurrencySymbol code={currencyCode} />{fmt(openValue)}
              </span>
              <Text className="crm-pipeline-stat-label">Pipeline value</Text>
            </div>
            {stageCounts.won > 0 && (
              <Tooltip title="Deals closed as Won">
                <div className="crm-pipeline-stat">
                  <span className="crm-pipeline-stat-value" style={{ color: '#52c41a' }}>
                    <TrophyOutlined style={{ marginRight: 4 }} />{stageCounts.won}
                  </span>
                  <Text className="crm-pipeline-stat-label" style={{ color: '#52c41a' }}>Won</Text>
                </div>
              </Tooltip>
            )}
          </div>

          <div className="crm-pipeline-stages">
            {DEAL_STAGES.map(({ value, label, color }) => {
              const cnt = stageCounts[value] || 0;
              if (!cnt) return null;
              return (
                <Tag key={value} color={color} style={{ fontSize: 12 }}>
                  {label}: {cnt}
                </Tag>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
