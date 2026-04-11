/**
 * SupplierPurchaseOrderForm — Create a Supplier PO from an approved PR.
 *
 * Pre-fills line items from PR material_details.
 * User adds supplier info, unit prices, expected delivery.
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, DatePicker, Button, Table, Typography, message as antMsg } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function SupplierPurchaseOrderForm({ pr, user, onSuccess }) {
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState(null);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pr?.material_details) return;
    const items = (pr.material_details || []).map((m, i) => ({
      key: i,
      material: m.material || m.name || `Item ${i + 1}`,
      specification: m.specification || '',
      quantity: m.quantity || 0,
      unit: m.unit || 'kg',
      unit_price: 0,
    }));
    setLineItems(items);
  }, [pr]);

  const updateItem = (key, field, value) => {
    setLineItems(lineItems.map(li => li.key === key ? { ...li, [field]: value } : li));
  };

  const handleSubmit = async () => {
    if (!supplierName.trim()) { antMsg.warning('Supplier name is required'); return; }
    if (!lineItems.length) { antMsg.warning('No line items'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/mes/presales/supplier-purchase-orders`, {
        pr_id: pr.id,
        supplier_name: supplierName,
        supplier_contact: supplierContact || undefined,
        supplier_email: supplierEmail || undefined,
        line_items: lineItems.map(({ key, ...rest }) => rest),
        expected_delivery: expectedDelivery ? expectedDelivery.format('YYYY-MM-DD') : undefined,
        notes: notes || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      antMsg.success('Supplier PO created');
      if (onSuccess) onSuccess();
    } catch (err) {
      antMsg.error(err.response?.data?.error || 'Failed to create Supplier PO');
    } finally { setSubmitting(false); }
  };

  const columns = [
    { title: 'Material', dataIndex: 'material', width: 160 },
    { title: 'Spec', dataIndex: 'specification', width: 120, ellipsis: true },
    { title: 'Qty', dataIndex: 'quantity', width: 80, align: 'right' },
    { title: 'Unit', dataIndex: 'unit', width: 50 },
    { title: 'Unit Price', dataIndex: 'unit_price', width: 110, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={0.5} style={{ width: 100 }}
          onChange={val => updateItem(lineItems[idx].key, 'unit_price', val || 0)} />
      ),
    },
    { title: 'Line Total', width: 100, align: 'right',
      render: (_, r) => ((Number(r.quantity) || 0) * (Number(r.unit_price) || 0)).toFixed(2),
    },
  ];

  const grandTotal = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        PR: <strong>{pr?.pr_number || '—'}</strong>
      </Text>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Supplier Name *</Text>
          <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier company" size="small" />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Contact Person</Text>
          <Input value={supplierContact} onChange={e => setSupplierContact(e.target.value)} placeholder="Name" size="small" />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Supplier Email</Text>
          <Input value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="email@supplier.com" size="small" />
        </div>
        <div style={{ minWidth: 140 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Expected Delivery</Text>
          <DatePicker value={expectedDelivery} onChange={setExpectedDelivery} size="small" style={{ width: '100%' }} />
        </div>
      </div>

      <Table dataSource={lineItems} columns={columns} size="small" pagination={false} bordered rowKey="key"
        footer={() => (
          <div style={{ textAlign: 'right' }}>
            <Text strong>Grand Total: AED {grandTotal.toLocaleString('en', { minimumFractionDigits: 2 })}</Text>
          </div>
        )}
      />

      <TextArea rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
        style={{ marginTop: 12 }} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
          Create Supplier PO
        </Button>
      </div>
    </div>
  );
}
