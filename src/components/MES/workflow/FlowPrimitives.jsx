import React from 'react';
import { DEPTS, isActive, v } from './constants';

export const Arrow = ({ faded }) => (
  <div className={`qb-arrow${faded ? ' qb-arrow--faded' : ''}`}>
    <div className="qb-arrow-line" />
    <div className="qb-arrow-head" />
  </div>
);

export const FlowBox = ({ box, activeDept, onSelect, isSelected }) => {
  const active = isActive(box, activeDept);
  const deptConfig = DEPTS[box.depts[0]];

  return (
    <button
      className={[
        'qb-box',
        active ? 'qb-box--on' : 'qb-box--off',
        box.gate ? 'qb-box--gate' : '',
        isSelected ? 'qb-box--selected' : '',
      ].join(' ')}
      style={active ? { '--dc': v(deptConfig?.colorVar), '--db': v(deptConfig?.bgVar) } : {}}
      onClick={() => active && onSelect(box)}
      disabled={!active}
    >
      <span className="box-accent-bar" />
      {box.gate && <span className="box-gate-pip" />}
      <span className="box-text">
        <span>{box.label[0]}</span>
        {box.label[1] && <span>{box.label[1]}</span>}
      </span>
      <span className="box-dept-dots">
        {box.depts.slice(0, 3).map((dept) => (
          <span key={dept} style={{ background: v(DEPTS[dept]?.colorVar) }} />
        ))}
      </span>
    </button>
  );
};

export const FlowRow = ({ boxes, activeDept, selectedBox, onSelect }) => (
  <div className="qb-row">
    {boxes.map((box, index) => {
      const nextBox = boxes[index + 1];
      const faded = !isActive(box, activeDept) || (nextBox && !isActive(nextBox, activeDept));

      return (
        <React.Fragment key={box.id}>
          <FlowBox
            box={box}
            activeDept={activeDept}
            onSelect={onSelect}
            isSelected={selectedBox?.id === box.id}
          />
          {nextBox && <Arrow faded={faded} />}
        </React.Fragment>
      );
    })}
  </div>
);

export const VConnector = () => (
  <div className="qb-v-connector">
    <div className="qb-v-line" />
    <div className="qb-v-dot" />
    <div className="qb-v-line" />
    <div className="qb-v-head" />
  </div>
);
