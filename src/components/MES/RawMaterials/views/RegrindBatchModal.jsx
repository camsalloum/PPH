import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import axios from 'axios';

const VALID_DIVISIONS = ['FP', 'HC'];

const resolveDivisions = (user) => {
  const values = Array.isArray(user?.divisions)
    ? user.divisions.map((d) => String(d || '').trim().toUpperCase()).filter(Boolean)
    : [];

  const filtered = values.filter((d) => VALID_DIVISIONS.includes(d));
  if (filtered.length > 0) return filtered;
  return ['FP'];
};

const generateMaterialCode = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const tail = String(now.getTime()).slice(-4);
  return `RGR-${yy}${mm}${dd}-${tail}`;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const RegrindBatchModal = ({
  open,
  onClose,
  onCreated,
  user,
  title = 'Log Regrind Batch',
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const divisionOptions = useMemo(() => {
    return resolveDivisions(user).map((value) => ({ value, label: value }));
  }, [user]);

  useEffect(() => {
    if (!open) return;

    const defaultDivision = divisionOptions[0]?.value || 'FP';
    form.setFieldsValue({
      division: defaultDivision,
      material_code: generateMaterialCode(),
      material_name: 'Regrind Batch',
      material_subtype: '',
      batch_number: '',
      quantity: undefined,
      unit: 'KG',
      priority: 'normal',
      received_date: todayIso(),
      supplier_code: 'INTERNAL-RGR',
      supplier_name: 'Internal Regrind',
      notes: '',
    });
  }, [divisionOptions, form, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        source: 'regrind',
        division: values.division,
        material_code: String(values.material_code || '').trim(),
        material_name: String(values.material_name || '').trim(),
        material_type: 'Regrind / PIR',
        material_subtype: values.material_subtype || null,
        batch_number: values.batch_number || null,
        quantity: Number(values.quantity),
        unit: values.unit || 'KG',
        priority: values.priority || 'normal',
        received_date: values.received_date || null,
        supplier_code: values.supplier_code || 'INTERNAL-RGR',
        supplier_name: values.supplier_name || 'Internal Regrind',
        notes: values.notes || null,
      };

      const response = await axios.post('/api/mes/qc/incoming-rm', payload);
      if (!response.data?.success) {
        message.error('Failed to create regrind batch');
        return;
      }

      const created = response.data.data || null;
      message.success(`Regrind batch logged${created?.qc_lot_id ? ` (${created.qc_lot_id})` : ''}`);
      if (onCreated) {
        await onCreated(created);
      }
      if (onClose) onClose();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to log regrind batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Create Regrind Entry"
      confirmLoading={submitting}
      width={760}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="division" label="Division" rules={[{ required: true, message: 'Division is required' }]}>
          <Select options={divisionOptions} />
        </Form.Item>

        <Form.Item name="material_code" label="Material Code" rules={[{ required: true, message: 'Material code is required' }]}>
          <Input placeholder="RGR-..." />
        </Form.Item>

        <Form.Item name="material_name" label="Material Name" rules={[{ required: true, message: 'Material name is required' }]}>
          <Input placeholder="Regrind Batch" />
        </Form.Item>

        <Form.Item name="material_subtype" label="Sub-Type (optional)">
          <Input placeholder="Example: Printed Film Regrind" />
        </Form.Item>

        <Form.Item name="batch_number" label="Batch Number (optional)">
          <Input placeholder="Supplier or internal batch id" />
        </Form.Item>

        <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Quantity is required' }]}>
          <InputNumber min={0.001} step={0.001} style={{ width: '100%' }} placeholder="Enter quantity" />
        </Form.Item>

        <Form.Item name="unit" label="Unit" rules={[{ required: true, message: 'Unit is required' }]}>
          <Select
            options={[
              { value: 'KG', label: 'KG' },
              { value: 'TON', label: 'TON' },
              { value: 'ROLL', label: 'ROLL' },
            ]}
          />
        </Form.Item>

        <Form.Item name="priority" label="Priority" rules={[{ required: true, message: 'Priority is required' }]}>
          <Select
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </Form.Item>

        <Form.Item name="received_date" label="Received Date" rules={[{ required: true, message: 'Received date is required' }]}>
          <Input type="date" />
        </Form.Item>

        <Form.Item name="supplier_code" label="Supplier Code">
          <Input placeholder="INTERNAL-RGR" />
        </Form.Item>

        <Form.Item name="supplier_name" label="Supplier Name">
          <Input placeholder="Internal Regrind" />
        </Form.Item>

        <Form.Item name="notes" label="Notes (optional)">
          <Input.TextArea rows={3} placeholder="Any handling, contamination, or origin notes" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RegrindBatchModal;
