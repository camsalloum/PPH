import React, { useState } from 'react';
import { Button, Space, Tooltip, Typography } from 'antd';
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function MiniCalendar({ meetings, calls, tasks }) {
  const [month, setMonth] = useState(dayjs());
  const startDay = month.startOf('month').day();
  const dim = month.daysInMonth();
  const today = dayjs();
  const isCur = month.isSame(today, 'month');

  const evMap = {};
  const add = (date, type, label) => {
    if (!date) return;
    const d = dayjs(date);
    if (!d.isSame(month, 'month')) return;
    const dn = d.date();
    if (!evMap[dn]) evMap[dn] = [];
    evMap[dn].push({ type, label, time: d.format('HH:mm') });
  };
  (meetings || []).forEach(m => add(m.date_start, 'meeting', m.name));
  (calls || []).forEach(c => add(c.date_start, 'call', c.name));
  (tasks || []).forEach(t => add(t.due_date, 'task', t.title));

  const weeks = [];
  let d = 1;
  for (let w = 0; w < 6; w++) {
    const wk = [];
    for (let i = 0; i < 7; i++) {
      if ((w === 0 && i < startDay) || d > dim) wk.push(null);
      else wk.push(d++);
    }
    weeks.push(wk);
    if (d > dim) break;
  }

  return (
    <div className="crm-home-calendar">
      <div className="crm-home-calendar-header">
        <Space size={4}>
          <CalendarOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 14 }}>Calendar</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>›</Text>
          <Text strong style={{ fontSize: 14 }}>{month.format('MMMM YYYY')}</Text>
        </Space>
        <Space size={4}>
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setMonth(m => m.subtract(1, 'month'))} />
          <Button type="text" size="small" onClick={() => setMonth(dayjs())}>Today</Button>
          <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setMonth(m => m.add(1, 'month'))} />
        </Space>
      </div>
      <table className="crm-home-calendar-table">
        <thead><tr>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x => <th key={x}>{x}</th>)}</tr></thead>
        <tbody>
          {weeks.map((wk, wi) => (
            <tr key={wi}>
              {wk.map((dn, di) => {
                const evs = dn ? (evMap[dn] || []) : [];
                const isToday = isCur && dn === today.date();
                return (
                  <td key={di} className={`crm-home-calendar-cell${isToday ? ' crm-home-calendar-today' : ''}${!dn ? ' crm-home-calendar-empty' : ''}`}>
                    {dn && (
                      <>
                        <span className="crm-home-calendar-day">{dn}</span>
                        {evs.length > 0 && (
                          <div className="crm-home-calendar-events">
                            {evs.slice(0, 2).map((ev, i) => (
                              <Tooltip key={i} title={`${ev.time} ${ev.label}`}>
                                <div className="crm-home-calendar-event-bar" style={{ background: ev.type === 'meeting' ? '#1677ff' : ev.type === 'call' ? '#52c41a' : '#fa8c16' }}>
                                  <span className="crm-home-cal-ev-text">{ev.time} {ev.label}</span>
                                </div>
                              </Tooltip>
                            ))}
                            {evs.length > 2 && <span style={{ fontSize: 9, color: '#8c8c8c' }}>+{evs.length - 2}</span>}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
