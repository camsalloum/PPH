import React from 'react';
import { Form, Input, Modal, Radio } from 'antd';

export default function LostReasonModal({ open, onOk, onCancel, form, options }) {
  return (
    <Modal
      title="Why was this inquiry lost?"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="Mark as Lost"
      okButtonProps={{ danger: true }}
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="lost_reason_category"
          label="Reason Category"
          rules={[{ required: true, message: 'Please select a reason' }]}
        >
          <Radio.Group optionType="button" buttonStyle="solid">
            {options.map((option) => (
              <Radio.Button key={option.value} value={option.value} style={{ marginBottom: 4 }}>
                {option.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        <Form.Item name="lost_to_competitor" label="Lost to Competitor (if known)">
          <Input placeholder="e.g. Competitor X" />
        </Form.Item>
        <Form.Item name="lost_reason_notes" label="Additional Notes">
          <Input.TextArea rows={3} placeholder="Optional details..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
