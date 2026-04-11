/**
 * G-007: SampleProgressSteps — shared step tracker for sample workflow
 *
 * Shows where a sample is in the lifecycle:
 *   Registered → Sent to QC → Received → Testing → Tested → CSE → Done
 *
 * Props:
 *   sample   — sample object with { status, updated_at, ... }
 *   cse      — optional CSE report object { status, overall_result }
 *   size     — 'small' | 'default' (default 'small')
 *   style    — extra container style
 */
import React from 'react';
import { Steps, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  InboxOutlined,
  SendOutlined,
  TrophyOutlined,
} from '@ant-design/icons';

const STEP_CONFIG = [
  { key: 'registered',     title: 'Registered',  icon: <InboxOutlined /> },
  { key: 'sent_to_qc',    title: 'Sent to QC',  icon: <SendOutlined /> },
  { key: 'received_by_qc', title: 'Received',    icon: <InboxOutlined /> },
  { key: 'testing',        title: 'Testing',     icon: <ExperimentOutlined /> },
  { key: 'tested',         title: 'Tested',      icon: <FileTextOutlined /> },
  { key: 'cse_review',     title: 'CSE Review',  icon: <FileTextOutlined /> },  // virtual — pending CSE approval
  { key: 'done',           title: 'Done',        icon: <TrophyOutlined /> },    // virtual — CSE approved
];

// Map sample status + CSE status to a current step index
function resolveCurrentStep(sample, cse) {
  const s = sample?.status;
  if (!s) return 0;

  if (s === 'approved' || s === 'rejected') {
    // Check CSE stage
    if (!cse) return 5; // step 5 = CSE Review (in progress)
    if (cse.status === 'approved') return 6;          // step 6 = Done
    if (cse.status === 'rejected') return 6;           // also done (but failed)
    return 5;                                           // pending CSE
  }

  const map = { registered: 0, sent_to_qc: 1, received_by_qc: 2, testing: 3, tested: 4 };
  return map[s] ?? 0;
}

function resolveStepStatus(sample, cse, idx) {
  const current = resolveCurrentStep(sample, cse);
  const sampleStatus = sample?.status;

  if (idx < current) return 'finish';
  if (idx === current) {
    if (sampleStatus === 'rejected') return 'error';
    if (cse?.status === 'rejected') return 'error';
    return 'process';
  }
  return 'wait';
}

export default function SampleProgressSteps({ sample, cse = null, size = 'small', style = {} }) {
  const current = resolveCurrentStep(sample, cse);

  const items = STEP_CONFIG.map((step, idx) => {
    const stepStatus = resolveStepStatus(sample, cse, idx);
    let description = null;

    // Extra info for the 'done' or 'cse_review' virtual steps
    if (idx === 5 && cse) {
      description = (
        <Tag
          color={cse.status === 'approved' ? 'green' : cse.status === 'rejected' ? 'red' : cse.status === 'revision_requested' ? 'orange' : 'blue'}
          style={{ fontSize: 10 }}
        >
          {(cse.status || '').replaceAll('_', ' ')}
        </Tag>
      );
    }
    if (idx === 6 && cse?.overall_result) {
      description = (
        <Tag
          color={cse.overall_result === 'pass' ? 'green' : cse.overall_result === 'fail' ? 'red' : 'orange'}
          style={{ fontSize: 10 }}
        >
          {cse.overall_result.toUpperCase()}
        </Tag>
      );
    }

    return {
      title: step.title,
      status: stepStatus,
      description,
      icon: stepStatus === 'finish'
        ? <CheckCircleOutlined />
        : stepStatus === 'error'
          ? <CloseCircleOutlined />
          : step.icon,
    };
  });

  return (
    <div style={style}>
      <Steps
        size={size}
        current={current}
        items={items}
        style={{ overflowX: 'auto' }}
      />
    </div>
  );
}
