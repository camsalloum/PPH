/**
 * G-007: Shared sample progress steps component.
 * Shows the full workflow timeline for a sample, reusable across
 * QCScanPage, QCSampleAnalysis, InquiryDetail per-sample cards.
 */
import React from 'react';
import { Steps, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const WORKFLOW_STEPS = [
  { key: 'registered',      label: 'Registered',   icon: <InboxOutlined />,         statuses: ['registered'] },
  { key: 'sent_to_qc',      label: 'Sent to QC',   icon: <SendOutlined />,          statuses: ['sent_to_qc'] },
  { key: 'received_by_qc',  label: 'QC Received',  icon: <InboxOutlined />,         statuses: ['received_by_qc'] },
  { key: 'testing',          label: 'Testing',      icon: <ExperimentOutlined />,    statuses: ['testing'] },
  { key: 'tested',           label: 'Evaluated',    icon: <FileProtectOutlined />,   statuses: ['tested'] },
  { key: 'approved',         label: 'Approved',     icon: <CheckCircleOutlined />,   statuses: ['approved'] },
];

/* Map a sample status to the step index it represents */
function getActiveStepIndex(status) {
  if (!status) return 0;
  if (status === 'rejected') return 5; // terminal
  const idx = WORKFLOW_STEPS.findIndex((s) => s.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

function stepStatus(stepIdx, activeIdx, sampleStatus) {
  if (sampleStatus === 'rejected' && stepIdx === WORKFLOW_STEPS.length - 1) return 'error';
  if (stepIdx < activeIdx) return 'finish';
  if (stepIdx === activeIdx) return 'process';
  return 'wait';
}

/**
 * @param {{ sample: object, size?: 'small'|'default', direction?: 'horizontal'|'vertical' }} props
 * sample should have: status, created_at, sent_to_qc_at, received_at, tested_at, approved_at, rejected_at
 */
export default function SampleProgressSteps({ sample, size = 'small', direction = 'horizontal' }) {
  if (!sample) return null;

  const activeIdx = getActiveStepIndex(sample.status);
  const isRejected = sample.status === 'rejected';

  const timestampFields = {
    registered:     sample.created_at,
    sent_to_qc:     sample.sent_to_qc_at || sample.submitted_at,
    received_by_qc: sample.received_at    || sample.received_by_qc_at,
    testing:        sample.testing_at      || sample.analysis_started_at,
    tested:         sample.tested_at       || sample.evaluated_at,
    approved:       isRejected ? sample.rejected_at : sample.approved_at,
  };

  const steps = WORKFLOW_STEPS.map((step, idx) => {
    const ts = timestampFields[step.key];
    const label = isRejected && idx === WORKFLOW_STEPS.length - 1 ? 'Rejected' : step.label;
    const icon = isRejected && idx === WORKFLOW_STEPS.length - 1 ? <CloseCircleOutlined /> : step.icon;

    return {
      title: label,
      status: stepStatus(idx, activeIdx, sample.status),
      icon,
      description: ts ? (
        <Tooltip title={dayjs(ts).format('DD MMM YYYY HH:mm')}>
          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(ts).format('DD MMM, HH:mm')}</Text>
        </Tooltip>
      ) : null,
    };
  });

  return (
    <Steps
      size={size}
      direction={direction}
      current={activeIdx}
      items={steps}
      style={{ margin: '8px 0' }}
    />
  );
}
