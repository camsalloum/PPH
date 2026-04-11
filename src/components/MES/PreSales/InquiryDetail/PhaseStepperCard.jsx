/**
 * PhaseStepperCard — Pre-Sales workflow phase stepper with admin override buttons
 * + full lifecycle stepper for inquiries beyond clearance phase.
 */
import React from 'react';
import { Card, Steps, Button, Typography } from 'antd';
import axios from 'axios';
import { PRESALES_PHASES, LIFECYCLE_PHASES, STAGE_TO_PHASE } from './constants';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function PhaseStepperCard({ inquiry, isStrictAdmin, message, onReload }) {
  const currentPhaseIdx = PRESALES_PHASES.findIndex(p => p.key === (inquiry?.presales_phase || 'inquiry'));

  /* Full lifecycle stepper — determine which lifecycle phase the inquiry is in */
  const stage = inquiry?.inquiry_stage || 'sar_pending';
  const lifecycleKey = STAGE_TO_PHASE[stage] || 'inquiry';
  const lifecycleIdx = LIFECYCLE_PHASES.findIndex(p => p.key === lifecycleKey);
  const showLifecycle = lifecycleIdx > 2; /* show when beyond clearance (quotation+) */

  const handlePhaseChange = async (phase) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/presales-phase`, { phase }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success(`Phase → ${phase}`);
      onReload();
    } catch { message.error('Failed to change phase'); }
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
      {/* Pre-sales phases stepper */}
      <Steps
        current={currentPhaseIdx >= 0 ? currentPhaseIdx : 0}
        size="small"
        style={{ maxWidth: 900 }}
        items={PRESALES_PHASES.map((p, i) => ({
          title: p.label,
          icon: p.icon,
          status: currentPhaseIdx > i ? 'finish'
            : currentPhaseIdx === i
              ? (p.key === 'cleared' ? 'finish' : 'process')
              : 'wait',
        }))}
      />

      {/* Full lifecycle stepper — visible once past clearance */}
      {showLifecycle && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            Order Lifecycle
          </Text>
          <Steps
            current={lifecycleIdx}
            size="small"
            style={{ maxWidth: 900 }}
            items={LIFECYCLE_PHASES.map((p, i) => ({
              title: p.label,
              icon: p.icon,
              status: stage === 'lost' && i === lifecycleIdx ? 'error'
                : lifecycleIdx > i ? 'finish'
                : lifecycleIdx === i ? 'process'
                : 'wait',
            }))}
          />
        </div>
      )}

      {isStrictAdmin && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: '24px' }}>Phase:</Text>
          {PRESALES_PHASES.filter(p => p.key !== 'cleared').map(p => (
            <Button
              key={p.key}
              size="small"
              type={(inquiry?.presales_phase || 'inquiry') === p.key ? 'primary' : 'default'}
              style={{ fontSize: 11 }}
              onClick={() => handlePhaseChange(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
