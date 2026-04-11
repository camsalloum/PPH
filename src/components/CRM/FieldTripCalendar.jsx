/**
 * FieldTripCalendar — Manager-only calendar view of all reps' trips
 * Uses Ant Design Calendar with colored trip blocks per day.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Calendar, Card, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = {
  planning: '#1677ff',
  confirmed: '#52c41a',
  in_progress: '#fa8c16',
  completed: '#8c8c8c',
  pending_approval: '#722ed1',
  cancelled: '#ff4d4f',
};

const REP_COLORS = [
  '#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2',
  '#eb2f96', '#faad14', '#2f54eb', '#a0d911', '#fa541c',
];

export default function FieldTripCalendar() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());

  const load = useCallback(async (date) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const from = date.startOf('month').subtract(7, 'day').format('YYYY-MM-DD');
      const to = date.endOf('month').add(7, 'day').format('YYYY-MM-DD');
      const res = await axios.get(`${API_BASE}/api/crm/field-trips`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fromDate: from, toDate: to, limit: 200 },
      });
      setTrips(res.data?.data || []);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  // Map rep names to consistent colors
  const repColorMap = useMemo(() => {
    const map = new Map();
    const uniqueReps = [...new Set(trips.map(t => t.rep_name || `Rep #${t.rep_id}`))];
    uniqueReps.forEach((name, i) => map.set(name, REP_COLORS[i % REP_COLORS.length]));
    return map;
  }, [trips]);

  // Build a date → trips lookup
  const tripsByDate = useMemo(() => {
    const map = {};
    for (const trip of trips) {
      if (!trip.departure_date) continue;
      const start = dayjs(trip.departure_date);
      const end = trip.return_date ? dayjs(trip.return_date) : start;
      let d = start;
      while (d.isBefore(end, 'day') || d.isSame(end, 'day')) {
        const key = d.format('YYYY-MM-DD');
        if (!map[key]) map[key] = [];
        map[key].push(trip);
        d = d.add(1, 'day');
      }
    }
    return map;
  }, [trips]);

  const dateCellRender = (date) => {
    const key = date.format('YYYY-MM-DD');
    const dayTrips = tripsByDate[key];
    if (!dayTrips?.length) return null;
    return (
      <div style={{ overflow: 'hidden', maxHeight: 60 }}>
        {dayTrips.slice(0, 3).map(t => {
          const repName = t.rep_name || `Rep #${t.rep_id}`;
          const color = repColorMap.get(repName) || '#999';
          return (
            <Tooltip key={t.id} title={`${repName}: ${t.title}`}>
              <div
                style={{
                  background: color, color: '#fff', borderRadius: 4, padding: '1px 6px',
                  fontSize: 11, marginBottom: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${t.id}`); }}
              >
                {repName.split(' ')[0]}: {t.title}
              </div>
            </Tooltip>
          );
        })}
        {dayTrips.length > 3 && (
          <Text type="secondary" style={{ fontSize: 10 }}>+{dayTrips.length - 3} more</Text>
        )}
      </div>
    );
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Trip Calendar</Title>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button icon={<LeftOutlined />} size="small" onClick={() => setMonth(m => m.subtract(1, 'month'))} />
          <Text strong>{month.format('MMMM YYYY')}</Text>
          <Button icon={<RightOutlined />} size="small" onClick={() => setMonth(m => m.add(1, 'month'))} />
          <Button icon={<ReloadOutlined />} size="small" onClick={() => load(month)} loading={loading} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[...repColorMap.entries()].map(([name, color]) => (
          <Tag key={name} color={color} style={{ fontSize: 11 }}>{name}</Tag>
        ))}
      </div>

      <Spin spinning={loading}>
        <Calendar
          value={month}
          onPanelChange={(date) => setMonth(date)}
          cellRender={(date, info) => info.type === 'date' ? dateCellRender(date) : null}
        />
      </Spin>
    </Card>
  );
}
