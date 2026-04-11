import React from 'react';
import { DEPTS, PHASE_DETAILS, DEPT_PHASE_ACTIONS, v } from './constants';

export default function DetailPanel({ box, onClose, onNavigate, userDept }) {
  if (!box) return null;

  const detail = PHASE_DETAILS[box.phase];
  const deptConfig = DEPTS[box.depts[0]];

  const phaseActions = DEPT_PHASE_ACTIONS[box.phase] || {};
  const myActions = userDept === 'all'
    ? Object.values(phaseActions).flat()
    : (phaseActions[userDept] || []);

  return (
    <div className="detail-panel" style={{ '--dc': v(deptConfig?.colorVar), '--db': v(deptConfig?.bgVar) }}>
      <div className="detail-header">
        <div className="detail-header-left">
          <div>
            <div className="detail-phase-name">{box.label[0]} {box.label[1]}</div>
          </div>
        </div>
        <div className="detail-header-right">
          {box.depts.map((department) => (
            <span
              key={department}
              className="detail-chip"
              style={{
                background: v(DEPTS[department]?.bgVar),
                color: v(DEPTS[department]?.colorVar),
                border: `1px solid ${v(DEPTS[department]?.colorVar)}`,
              }}
            >
              {DEPTS[department]?.label}
            </span>
          ))}
          <button className="detail-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {myActions.length > 0 && onNavigate && (
        <div className="detail-presales-link">
          {myActions.map((action, index) => (
            <button
              key={`${action.route || action.label}`}
              className={`detail-module-link-btn${action.primary ? ' detail-module-link-btn--primary' : ''}`}
              style={index > 0 ? { marginLeft: 8 } : {}}
              onClick={() => {
                onClose();
                onNavigate(action.route);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="detail-body">
        <div className="detail-info-col">
          <div className="detail-col-title">Phase Info</div>
          <div className="detail-dept-list">
            {box.depts.map((department) => (
              <div key={department} className="detail-dept-row">
                <span className="detail-dept-dot" style={{ background: v(DEPTS[department]?.colorVar) }} />
                <span>{DEPTS[department]?.label}</span>
              </div>
            ))}
          </div>
          {box.gate && <div className="detail-gate-tag">Quality Gate</div>}
        </div>

        <div className="detail-steps-col">
          <div className="detail-col-title">Process Steps</div>
          {detail.steps.map((step, index) => (
            <div
              key={`${box.id}-step-${String(step)}`}
              className={`detail-step-row ${step.startsWith('⚑') ? 'detail-step-row--gate' : ''}`}
            >
              <span className="step-num-badge">{index + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        <div className="detail-forms-col">
          <div className="detail-col-title">Forms & Documents</div>
          {detail.forms.map((form) => {
            const isObjectForm = typeof form === 'object';
            const name = isObjectForm ? form.name : form;
            const route = isObjectForm ? form.route : null;
            const description = isObjectForm ? form.desc : null;

            return (
              <div
                key={`${box.id}-form-${route || name}`}
                className={`detail-form-pill${!route ? ' detail-form-pill--info' : ''}`}
                title={description || ''}
              >
                <span className="form-pill-name">{name}</span>
                {route && onNavigate ? (
                  <button
                    className="form-pill-open form-pill-open--active"
                    onClick={() => {
                      onClose();
                      onNavigate(route);
                    }}
                  >
                    OPEN
                  </button>
                ) : description ? (
                  <span className="form-pill-desc">{description}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
