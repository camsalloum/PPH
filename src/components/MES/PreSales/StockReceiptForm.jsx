/**
 * StockReceiptForm — Storekeeper records goods received against a Supplier PO.
 *
 * Lists PO line items with ordered quantities.
 * User enters received quantities + optional quality notes.
 */

import React, { useState, useEffect } from 'react';
import { Input, InputNumber, Button, Table, Typography, message as antMsg } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;
const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function StockReceiptForm({ spo, user, onSuccess }) {
  const [lines, setLines] = useState([]);
  const [qualityNotes, setQualityNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!spo?.line_items) return;
    setLines((spo.line_items || []).map((li, i) => ({
      key: i,
      material: li.material || li.name || `Item ${i + 1}`,
      specification: li.specification || '',
      ordered_qty: li.quantity || 0,
      unit: li.unit || 'kg',
      received_qty: li.quantity || 0, // default to full receipt
    })));
  }, [spo]);

  const updateLine = (key, value) => {
    setLines(lines.map(l => l.key === key ? { ...l, received_qty: value } : l));
  };

  const handleSubmit = async () => {
    const received = lines.filter(l => l.received_qty > 0);
    if (!received.length) { antMsg.warning('Enter at least one received quantity'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/mes/presales/stock-receipts`, {
        spo_id: spo.id,
        received_quantities: received.map(l => ({
          material: l.material,
          name: l.material,
          quantity: l.received_qty,
          unit: l.unit,
        })),
        quality_notes: qualityNotes || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      antMsg.success('Stock receipt recorded');
      if (onSuccess) onSuccess();
    } catch (err) {
      antMsg.error(err.response?.data?.error || 'Failed to record receipt');
    } finally { setSubmitting(false); }
  };

  const columns = [
    { title: 'Material', dataIndex: 'material', width: 160 },
    { title: 'Spec', dataIndex: 'specification', width: 120, ellipsis: true },
    { title: 'Ordered', dataIndex: 'ordered_qty', width: 90, align: 'right',
      render: (v, r) => `${v} ${r.unit}` },
    { title: 'Received', dataIndex: 'received_qty', width: 120, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={1} style={{ width: 100 }}
          onChange={val => updateLine(lines[idx].key, val || 0)} />
      ),
    },
    { title: 'Status', width: 90, align: 'center',
      render: (_, r) => {
        if (r.received_qty >= r.ordered_qty) return <Text type="success">Full</Text>;
        if (r.received_qty > 0) return <Text type="warning">Partial</Text>;
        return <Text type="secondary">None</Text>;
      },
    },
  ];

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Supplier PO: <strong>{spo?.po_number || '—'}</strong> | Supplier: {spo?.supplier_name || '—'}
      </Text>

      <Table dataSource={lines} columns={columns} size="small" pagination={false} bordered rowKey="key" />

      <TextArea rows={2} placeholder="Quality notes (optional)" value={qualityNotes}
        onChange={e => setQualityNotes(e.target.value)} style={{ marginTop: 12 }} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={handleSubmit}>
          Confirm Receipt
        </Button>
      </div>
    </div>
  );
}
