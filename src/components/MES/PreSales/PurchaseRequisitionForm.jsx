/**
 * PurchaseRequisitionForm — Create/edit a Purchase Requisition from Job Card BOM.
 *
 * Auto-populates material lines from job card BOM `not_available` items.
 * User can add/remove lines, set estimated costs, then submit.
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Table, Space, Typography, message as antMsg } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;
const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function PurchaseRequisitionForm({ jobCard, inquiry, user, onSuccess }) {
  const [materials, setMaterials] = useState([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-populate from BOM not_available lines
  useEffect(() => {
    if (!jobCard?.material_requirements) return;
    const bom = Array.isArray(jobCard.material_requirements) ? jobCard.material_requirements : [];
    const items = bom
      .filter(m => m.status === 'not_available' || !m.status)
      .map((m, i) => ({
        key: i,
        material: m.material || m.name || `Material ${i + 1}`,
        specification: m.specification || m.spec || '',
        quantity: m.qty_required || m.quantity || 0,
        unit: m.unit || 'kg',
        estimated_cost: m.estimated_cost || 0,
      }));
    setMaterials(items.length ? items : [{ key: 0, material: '', specification: '', quantity: 0, unit: 'kg', estimated_cost: 0 }]);
  }, [jobCard]);

  const addRow = () => {
    const key = materials.length ? Math.max(...materials.map(m => m.key)) + 1 : 0;
    setMaterials([...materials, { key, material: '', specification: '', quantity: 0, unit: 'kg', estimated_cost: 0 }]);
  };

  const removeRow = (key) => {
    setMaterials(materials.filter(m => m.key !== key));
  };

  const updateRow = (key, field, value) => {
    setMaterials(materials.map(m => m.key === key ? { ...m, [field]: value } : m));
  };

  const handleSubmit = async () => {
    const validMaterials = materials.filter(m => m.material?.trim());
    if (!validMaterials.length) { antMsg.warning('Add at least one material'); return; }
    if (!jobCard?.id) { antMsg.warning('No job card linked'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/mes/presales/purchase-requisitions`, {
        job_card_id: jobCard.id,
        inquiry_id: inquiry?.id,
        material_details: validMaterials.map(({ key, ...rest }) => rest),
        notes: notes || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      antMsg.success('Purchase Requisition created');
      if (onSuccess) onSuccess();
    } catch (err) {
      antMsg.error(err.response?.data?.error || 'Failed to create PR');
    } finally { setSubmitting(false); }
  };

  const columns = [
    { title: 'Material', dataIndex: 'material', width: 160,
      render: (v, _, idx) => (
        <Input value={v} size="small" placeholder="Material name"
          onChange={e => updateRow(materials[idx].key, 'material', e.target.value)} />
      ),
    },
    { title: 'Specification', dataIndex: 'specification', width: 140,
      render: (v, _, idx) => (
        <Input value={v} size="small" placeholder="Spec / grade"
          onChange={e => updateRow(materials[idx].key, 'specification', e.target.value)} />
      ),
    },
    { title: 'Qty', dataIndex: 'quantity', width: 90, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={10} style={{ width: 80 }}
          onChange={val => updateRow(materials[idx].key, 'quantity', val || 0)} />
      ),
    },
    { title: 'Unit', dataIndex: 'unit', width: 60,
      render: (v, _, idx) => (
        <Input value={v} size="small" style={{ width: 50 }}
          onChange={e => updateRow(materials[idx].key, 'unit', e.target.value)} />
      ),
    },
    { title: 'Est. Cost', dataIndex: 'estimated_cost', width: 100, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={100} style={{ width: 90 }}
          onChange={val => updateRow(materials[idx].key, 'estimated_cost', val || 0)} />
      ),
    },
    { title: '', width: 40,
      render: (_, r) => materials.length > 1 ? (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeRow(r.key)} />
      ) : null,
    },
  ];

  const totalCost = materials.reduce((s, m) => s + (Number(m.estimated_cost) || 0), 0);

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Job Card: <strong>{jobCard?.job_number || '—'}</strong> | Customer: {jobCard?.customer_name || inquiry?.customer_name || '—'}
      </Text>

      <Table dataSource={materials} columns={columns} size="small" pagination={false} bordered rowKey="key"
        footer={() => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Add Material</Button>
            <Text strong>Total: AED {totalCost.toLocaleString('en', { minimumFractionDigits: 2 })}</Text>
          </div>
        )}
      />

      <TextArea rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
        style={{ marginTop: 12 }} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
          Submit PR
        </Button>
      </div>
    </div>
  );
}
