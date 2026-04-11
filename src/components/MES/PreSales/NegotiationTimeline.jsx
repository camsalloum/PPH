/**
 * NegotiationTimeline — Vertical timeline showing quotation versions and approval history.
 * Displays version chain, pricing, manager decisions, and counter-offers.
 */
import React, { useState, useEffect } from 'react';
import { Timeline, Tag, Card, Typography, Spin, Empty } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined,
  EditOutlined, SendOutlined, DollarOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ACTION_CONFIG = {
  submitted:          { color: 'blue',   icon: <SendOutlined />,        label: 'Submitted' },
  approved:           { color: 'green',  icon: <CheckCircleOutlined />, label: 'Approved' },
  rejected:           { color: 'red',    icon: <CloseCircleOutlined />, label: 'Rejected' },
  revision_requested: { color: 'orange', icon: <EditOutlined />,        label: 'Revision Requested' },
};

function formatCurrency(val, currency = 'AED') {
  const num = parseFloat(val);
  if (!num && num !== 0) return '—';
  return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NegotiationTimeline({ inquiry }) {
  const [quotations, setQuotations] = useState([]);
  const [approvalHistory, setApprovalHistory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inquiry?.id) return;
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    setLoading(true);
    axios.get(`${API_BASE}/api/mes/presales/quotations?inquiry_id=${inquiry.id}`, { headers })
      .then(async (res) => {
        const quots = res.data?.data || [];
        setQuotations(quots);
        // Load approval history for each quotation
        const historyMap = {};
        await Promise.all(quots.map(async (q) => {
          try {
            const hRes = await axios.get(`${API_BASE}/api/mes/presales/quotations/${q.id}/approval-history`, { headers });
            historyMap[q.id] = hRes.data?.data || [];
          } catch { historyMap[q.id] = []; }
        }));
        setApprovalHistory(historyMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [inquiry?.id]);

  if (loading) return <Card title="Negotiation History" size="small"><Spin /></Card>;
  if (!quotations.length) return null;

  // Only show if there are multiple versions or approval records
  const hasNegotiation = quotations.length > 1 || Object.values(approvalHistory).some(h => h.length > 0);
  if (!hasNegotiation) return null;

  // Build timeline items: interleave quotation versions with approval actions
  const items = [];
  const sorted = [...quotations].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const q of sorted) {
    // Quotation version entry
    items.push({
      key: `q-${q.id}`,
      color: 'blue',
      dot: <DollarOutlined />,
      time: new Date(q.created_at),
      children: (
        <div>
          <Text strong>{q.quotation_number}</Text>
          {q.version_number > 1 && <Tag color="purple" style={{ marginLeft: 8 }}>v{q.version_number}</Tag>}
          <Tag color={q.status === 'approved' ? 'green' : q.status === 'rejected' ? 'red' : 'default'} style={{ marginLeft: 4 }}>
            {(q.status || 'draft').toUpperCase()}
          </Tag>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            Price: {formatCurrency(q.total_price, q.currency)} · Qty: {q.quantity} {q.quantity_unit}
          </Text>
          {q.counter_offer_amount && (
            <div style={{ fontSize: 11, color: '#fa8c16' }}>
              Counter-offer: {formatCurrency(q.counter_offer_amount, q.currency)}
              {q.total_price && q.counter_offer_amount ? ` (margin: ${(((parseFloat(q.counter_offer_amount) - (parseFloat(q.estimation_data?.material_cost) || 0)) / parseFloat(q.counter_offer_amount)) * 100).toFixed(1)}%)` : ''}
            </div>
          )}
          <Text type="secondary" style={{ fontSize: 10 }}>{formatDate(q.created_at)}</Text>
        </div>
      ),
    });

    // Approval history entries for this quotation
    const history = approvalHistory[q.id] || [];
    const sortedHistory = [...history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (const h of sortedHistory) {
      const cfg = ACTION_CONFIG[h.action] || { color: 'gray', icon: null, label: h.action };
      items.push({
        key: `a-${h.id}`,
        color: cfg.color,
        dot: cfg.icon,
        time: new Date(h.created_at),
        children: (
          <div>
            <Tag color={cfg.color}>{cfg.label}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}> by {h.actor_name || 'System'}</Text>
            {h.notes && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{h.notes}</div>}
            <div><Text type="secondary" style={{ fontSize: 10 }}>{formatDate(h.created_at)}</Text></div>
          </div>
        ),
      });
    }
  }

  // Sort all items by time
  items.sort((a, b) => a.time - b.time);

  return (
    <Card title="Negotiation History" size="small" style={{ marginBottom: 16 }}>
      <Timeline items={items.map(({ key, color, dot, children }) => ({ key, color, dot, children }))} />
    </Card>
  );
}
