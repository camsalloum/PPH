import React, { useState } from 'react';
import { Checkbox, Input, Button, Row, Col, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

const DEFAULT_LOCAL_ITEMS = [
  { id: 'id_card',        label: 'Emirates ID / National ID' },
  { id: 'car_keys',       label: 'Car keys / vehicle ready' },
  { id: 'sample_kit',     label: 'Sample kit packed' },
  { id: 'brochures',      label: 'Product brochures / catalogs' },
  { id: 'business_cards', label: 'Business cards' },
  { id: 'charger',        label: 'Phone / laptop charger' },
];

const DEFAULT_INTL_ITEMS = [
  { id: 'passport',          label: 'Passport (6+ months validity)' },
  { id: 'visa',              label: 'Visa obtained & printed' },
  { id: 'insurance',         label: 'Travel insurance arranged' },
  { id: 'forex',             label: 'Foreign currency / card ready' },
  { id: 'accommodation',     label: 'Hotel confirmed' },
  { id: 'transport_booked',  label: 'Flight / train tickets printed' },
  { id: 'sim_card',          label: 'International SIM / roaming enabled' },
  { id: 'sample_kit',        label: 'Sample kit packed & customs-ready' },
  { id: 'brochures',         label: 'Product brochures / catalogs' },
  { id: 'business_cards',    label: 'Business cards' },
  { id: 'emergency_contacts',label: 'Emergency contact list saved offline' },
  { id: 'vaccinations',      label: 'Required vaccinations up to date' },
];

const CheckItem = ({ item, onToggle, onRemove }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5, minWidth: 0 }}>
    <Checkbox checked={item.checked} onChange={() => onToggle(item.id)} style={{ flex: 1, minWidth: 0 }}>
      <Text style={{
        fontSize: 12.5,
        textDecoration: item.checked ? 'line-through' : 'none',
        color: item.checked ? '#aaa' : 'inherit',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      }}>
        {item.label}
      </Text>
    </Checkbox>
    {item.custom && (
      <DeleteOutlined
        onClick={() => onRemove(item.id)}
        style={{ flexShrink: 0, marginLeft: 4, color: '#d9d9d9', fontSize: 11, cursor: 'pointer' }}
      />
    )}
  </div>
);

const FieldVisitChecklistPanel = ({ tripType = 'local', checklist = [], onChange }) => {
  const [input, setInput] = useState('');

  const defaults = tripType === 'international' ? DEFAULT_INTL_ITEMS : DEFAULT_LOCAL_ITEMS;

  // Merge default items with saved state, then append any custom items
  const defaultMerged = defaults.map(def => {
    const saved = checklist.find(c => c.id === def.id);
    return { ...def, checked: saved ? saved.checked : false };
  });
  const customItems = checklist.filter(c => c.custom === true);
  const items = [...defaultMerged, ...customItems];

  const completedCount = items.filter(i => i.checked).length;
  const allDone = items.length > 0 && completedCount === items.length;

  const toggle = (id) => onChange(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  const remove = (id) => onChange(items.filter(i => i.id !== id));

  const addCustom = () => {
    const label = input.trim();
    if (!label) return;
    onChange([...items, { id: `custom_${Date.now()}`, label, checked: false, custom: true }]);
    setInput('');
  };

  // Split into two roughly equal columns
  const mid = Math.ceil(items.length / 2);
  const col1 = items.slice(0, mid);
  const col2 = items.slice(mid);

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 13 }}>Pre-Departure Checklist</Text>
        <Tag
          color={allDone ? 'success' : completedCount > 0 ? 'warning' : 'default'}
          icon={allDone ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
        >
          {completedCount}/{items.length}
        </Tag>
      </div>

      {/* Two-column checklist */}
      <Row gutter={0}>
        <Col xs={24} sm={12} style={{ paddingRight: 10 }}>
          {col1.map(item => (
            <CheckItem key={item.id} item={item} onToggle={toggle} onRemove={remove} />
          ))}
        </Col>
        <Col xs={24} sm={12} style={{ paddingLeft: 10, borderLeft: '1px dashed #e8e8e8' }}>
          {col2.map(item => (
            <CheckItem key={item.id} item={item} onToggle={toggle} onRemove={remove} />
          ))}
        </Col>
      </Row>

      {/* Add custom item */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px dashed #e8e8e8', paddingTop: 10 }}>
        <Input
          size="small"
          placeholder="Add custom item…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={addCustom}
          style={{ flex: 1 }}
        />
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addCustom}
          disabled={!input.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
};

export default FieldVisitChecklistPanel;
