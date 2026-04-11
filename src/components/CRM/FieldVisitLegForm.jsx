import React from 'react';
import {
  Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Tag, Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const MODE_OPTIONS = [
  { value: 'flight', label: 'Flight' },
  { value: 'car', label: 'Car / Rental' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'taxi', label: 'Taxi / Ride-share' },
  { value: 'other', label: 'Other' },
];

const SEAT_CLASS_OPTIONS = [
  { value: 'economy', label: 'Economy' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First Class' },
];

const createLeg = () => ({
  local_id: `leg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  mode: 'flight',
  from_label: '',
  to_label: '',
  dep_datetime: null,
  arr_datetime: null,
  airline: '',
  flight_number: '',
  dep_airport: '',
  arr_airport: '',
  seat_class: 'economy',
  booking_ref: '',
  rental_company: '',
  rental_ref: '',
  est_km: null,
  train_operator: '',
  train_number: '',
  train_class: '',
  notes: '',
});

const FieldVisitLegForm = ({ legs = [], onChange }) => {
  const addLeg = () => onChange([...legs, createLeg()]);
  const updateLeg = (idx, patch) =>
    onChange(legs.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLeg = (idx) => onChange(legs.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 14 }}>Transport Legs</Text>
        <Button size="small" icon={<PlusOutlined />} onClick={addLeg} type="dashed">Add Leg</Button>
      </div>

      {legs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#8c8c8c', fontSize: 13 }}>
          No legs added. Click "Add Leg" to define transport segments for this trip.
        </div>
      )}

      {legs.map((leg, idx) => (
        <Card
          key={leg.local_id || idx}
          size="small"
          style={{ marginBottom: 10, borderLeft: '4px solid #1677ff' }}
          extra={<Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeLeg(idx)} />}
          title={<Space size={6}><Tag color="blue">{idx + 1}</Tag><Text style={{ fontSize: 13 }}>Leg {idx + 1}</Text></Space>}
        >
          <Row gutter={[10, 6]}>
            <Col xs={24} md={6}>
              <Form.Item label="Mode" style={{ marginBottom: 6 }}>
                <Select size="small" value={leg.mode} options={MODE_OPTIONS} onChange={v => updateLeg(idx, { mode: v })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={9}>
              <Form.Item label="From" style={{ marginBottom: 6 }}>
                <Input size="small" placeholder="e.g. Dubai Airport T3" value={leg.from_label} onChange={e => updateLeg(idx, { from_label: e.target.value })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={9}>
              <Form.Item label="To" style={{ marginBottom: 6 }}>
                <Input size="small" placeholder="e.g. King Khalid Airport Riyadh" value={leg.to_label} onChange={e => updateLeg(idx, { to_label: e.target.value })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Departure" style={{ marginBottom: 6 }}>
                <DatePicker showTime size="small" style={{ width: '100%' }} value={leg.dep_datetime ? dayjs(leg.dep_datetime) : null} format="DD MMM YYYY HH:mm" onChange={d => updateLeg(idx, { dep_datetime: d ? d.toISOString() : null })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Arrival" style={{ marginBottom: 6 }}
                validateStatus={leg.arr_datetime && leg.dep_datetime && dayjs(leg.arr_datetime).isBefore(dayjs(leg.dep_datetime)) ? 'error' : ''}
                help={leg.arr_datetime && leg.dep_datetime && dayjs(leg.arr_datetime).isBefore(dayjs(leg.dep_datetime)) ? 'Arrival must be after departure' : undefined}
              >
                <DatePicker showTime size="small" style={{ width: '100%' }} value={leg.arr_datetime ? dayjs(leg.arr_datetime) : null} format="DD MMM YYYY HH:mm" onChange={d => updateLeg(idx, { arr_datetime: d ? d.toISOString() : null })} />
              </Form.Item>
            </Col>

            {leg.mode === 'flight' && (
              <>
                <Col xs={12} md={6}>
                  <Form.Item label="Airline" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Emirates" value={leg.airline} onChange={e => updateLeg(idx, { airline: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Flight No." style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="EK 803" value={leg.flight_number} onChange={e => updateLeg(idx, { flight_number: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="From (IATA)" style={{ marginBottom: 6 }}>
                    <Input size="small" maxLength={4} placeholder="DXB" value={leg.dep_airport} onChange={e => updateLeg(idx, { dep_airport: e.target.value.toUpperCase() })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="To (IATA)" style={{ marginBottom: 6 }}>
                    <Input size="small" maxLength={4} placeholder="RUH" value={leg.arr_airport} onChange={e => updateLeg(idx, { arr_airport: e.target.value.toUpperCase() })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="Class" style={{ marginBottom: 6 }}>
                    <Select size="small" value={leg.seat_class} options={SEAT_CLASS_OPTIONS} onChange={v => updateLeg(idx, { seat_class: v })} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="XYZ123" value={leg.booking_ref} onChange={e => updateLeg(idx, { booking_ref: e.target.value })} />
                  </Form.Item>
                </Col>
              </>
            )}

            {['car', 'taxi'].includes(leg.mode) && (
              <>
                <Col xs={12} md={8}>
                  <Form.Item label="Rental Company" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Hertz / Careem" value={leg.rental_company} onChange={e => updateLeg(idx, { rental_company: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="ABC-999" value={leg.rental_ref} onChange={e => updateLeg(idx, { rental_ref: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Est. KM" style={{ marginBottom: 6 }}>
                    <InputNumber size="small" style={{ width: '100%' }} min={0} value={leg.est_km} onChange={v => updateLeg(idx, { est_km: v })} />
                  </Form.Item>
                </Col>
              </>
            )}

            {leg.mode === 'train' && (
              <>
                <Col xs={12} md={8}>
                  <Form.Item label="Operator" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Etihad Rail" value={leg.train_operator} onChange={e => updateLeg(idx, { train_operator: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Train No." style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="ER 01" value={leg.train_number} onChange={e => updateLeg(idx, { train_number: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" value={leg.booking_ref} onChange={e => updateLeg(idx, { booking_ref: e.target.value })} />
                  </Form.Item>
                </Col>
              </>
            )}

            <Col xs={24}>
              <Form.Item label="Notes" style={{ marginBottom: 6 }}>
                <Input size="small" placeholder="Any extra info for this leg" value={leg.notes} onChange={e => updateLeg(idx, { notes: e.target.value })} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      ))}
    </div>
  );
};

export default FieldVisitLegForm;
