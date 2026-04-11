import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Badge, Button, Card, Col, Empty, List, Row, Select, Space, Spin, Switch, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined, DownloadOutlined, EnvironmentOutlined, NodeIndexOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import FieldVisitMap from './FieldVisitMap';
import { API_BASE, getAuthHeaders, haversineKm, STOP_COLORS } from './fieldVisitUtils';

const { Title, Text } = Typography;

const FieldVisitRouteView = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [dayFilter, setDayFilter] = useState('all');
  const [routeLineVisible, setRouteLineVisible] = useState(true);

  const loadRoute = useCallback(async () => {
    const headers = getAuthHeaders();

    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/${id}/route-preview`, { headers });
      setTrip(res.data?.data?.trip || null);
      setStops(Array.isArray(res.data?.data?.stops) ? res.data.data.stops : []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load route preview');
      setTrip(null);
      setStops([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  const days = Array.from(new Set(stops.map((s) => s.visit_date).filter(Boolean)));

  const displayedStops = stops.filter((s) => dayFilter === 'all' || s.visit_date === dayFilter);

  const optimizeStops = async () => {
    const headers = getAuthHeaders();

    const sortByOrder = [...stops].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
    const optimizeScopedStops = (scopedStops) => {
      const withCoords = scopedStops
        .map((s) => ({ ...s, lat: Number(s.latitude), lng: Number(s.longitude) }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

      if (withCoords.length < 2) return scopedStops;

      const idToStop = new Map(scopedStops.map((s) => [s.id, s]));
      const unvisited = [...withCoords];
      const ordered = [unvisited.shift()];

      while (unvisited.length) {
        const current = ordered[ordered.length - 1];
        let nextIdx = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < unvisited.length; i += 1) {
          const d = haversineKm(current, unvisited[i]);
          if (d < best) {
            best = d;
            nextIdx = i;
          }
        }
        ordered.push(unvisited.splice(nextIdx, 1)[0]);
      }

      const withoutCoords = scopedStops.filter((s) => !ordered.find((o) => o.id === s.id));
      return [...ordered.map((s) => idToStop.get(s.id)), ...withoutCoords];
    };

    let finalOrder;

    if (dayFilter === 'all') {
      // Optimize each visit_date bucket independently to avoid cross-day mixing.
      const orderedDays = [...new Set(sortByOrder.map((s) => s.visit_date).filter(Boolean))];
      const optimizedByDay = orderedDays.flatMap((d) => {
        const dayStops = sortByOrder.filter((s) => s.visit_date === d);
        return optimizeScopedStops(dayStops);
      });
      const undatedStops = sortByOrder.filter((s) => !s.visit_date);
      finalOrder = [...optimizedByDay, ...undatedStops];
    } else {
      const scoped = sortByOrder.filter((s) => s.visit_date === dayFilter);
      const scopedIdToStop = new Map(scoped.map((s) => [s.id, s]));
      const optimizedScoped = optimizeScopedStops(scoped);

      if (optimizedScoped.length < 2 || optimizedScoped.every((s, i) => s.id === scoped[i]?.id)) {
        message.warning('Need at least two stops with coordinates to optimize this day.');
      }

      const optIds = optimizedScoped.map((s) => s.id);
      let ptr = 0;
      finalOrder = sortByOrder.map((s) => {
        if (s.visit_date === dayFilter) {
          const next = optIds[ptr];
          ptr += 1;
          return scopedIdToStop.get(next) || s;
        }
        return s;
      });
    }

    const payload = finalOrder.map((s, idx) => ({ id: s.id, stop_order: idx + 1 }));

    await axios.put(`${API_BASE}/api/crm/field-trips/${id}/stops/reorder`, payload, { headers });

    const updated = finalOrder.map((s, idx) => ({ ...s, stop_order: idx + 1 }));
    setStops(updated);
    message.success(dayFilter === 'all' ? 'Route optimized by day and saved.' : 'Route optimized and saved.');
  };

  const exportItinerary = () => {
    if (!displayedStops.length) {
      message.warning('No stops to export for current filter.');
      return;
    }

    const lines = [];
    lines.push(`Trip: ${trip?.title || 'Field Trip'}`);
    lines.push(`Country: ${trip?.country || '-'}`);
    lines.push(`Range: ${trip?.departure_date || '-'} to ${trip?.return_date || '-'}`);
    lines.push('');

    displayedStops.forEach((s) => {
      const name = s.customer_name || s.prospect_name || s.address_snapshot || `Stop ${s.stop_order}`;
      lines.push(`#${s.stop_order} ${name}`);
      lines.push(`  Type: ${s.stop_type || 'other'}`);
      lines.push(`  Visit: ${s.visit_date || 'TBD'} ${s.visit_time || ''}`.trim());
      lines.push(`  Duration: ${s.duration_mins || 60} mins`);
      if (s.latitude && s.longitude) lines.push(`  Coordinates: ${s.latitude}, ${s.longitude}`);
      if (s.objectives) lines.push(`  Objectives: ${s.objectives}`);
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-trip-${trip?.id || 'route'}-itinerary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/crm/visits/${id}`)} style={{ width: 'fit-content' }}>
            Back to Trip
          </Button>
          <Title level={4} style={{ margin: 0 }}>Route Preview</Title>
          <Text type="secondary">{trip?.title || 'Field Trip'} | {trip?.country || '-'}</Text>
        </Space>
      </Card>

      {error ? <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} /> : null}

      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Text strong>Day Filter</Text>
            <Select
              value={dayFilter}
              onChange={setDayFilter}
              style={{ minWidth: 180 }}
              options={[
                { value: 'all', label: 'All Days' },
                ...days.map((d) => ({ value: d, label: dayjs(d).isValid() ? dayjs(d).format('ddd, DD MMM') : d })),
              ]}
            />
            <Space>
              <Text>Route Line</Text>
              <Switch checked={routeLineVisible} onChange={setRouteLineVisible} />
            </Space>
          </Space>
          <Space>
            <Button icon={<NodeIndexOutlined />} onClick={optimizeStops}>Optimize Route</Button>
            <Button icon={<DownloadOutlined />} onClick={exportItinerary}>Export Itinerary</Button>
          </Space>
        </Space>
      </Card>

      <Card title="Map">
        {displayedStops.length === 0 ? (
          <Empty description="No stops in selected filter" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <FieldVisitMap
            stops={displayedStops}
            routeLineVisible={routeLineVisible}
            onOpenStop={(stop) => {
              if (stop.customer_id) navigate(`/crm/customers/${stop.customer_id}`);
              else if (stop.prospect_id) navigate(`/crm/prospects/${stop.prospect_id}`);
              else navigate(`/crm/visits/${id}`);
            }}
            height={500}
          />
        )}
      </Card>

      <Card title={<Space><EnvironmentOutlined />Itinerary — {displayedStops.length} Stop{displayedStops.length !== 1 ? 's' : ''}</Space>} style={{ marginBottom: 16 }}>
        {displayedStops.length === 0 ? (
          <Empty description="No stops found for this trip" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          // Group stops by visit date
          (() => {
            const grouped = {};
            const undated = [];
            displayedStops.forEach(s => {
              const d = s.visit_date ? dayjs(s.visit_date).format('YYYY-MM-DD') : null;
              if (d) { if (!grouped[d]) grouped[d] = []; grouped[d].push(s); }
              else undated.push(s);
            });
            const sortedDates = Object.keys(grouped).sort();
            if (undated.length) sortedDates.push('__undated__');

            return sortedDates.map(dateKey => {
              const dayStops = dateKey === '__undated__' ? undated : grouped[dateKey];
              const dateLabel = dateKey === '__undated__' ? 'Date TBD' : dayjs(dateKey).format('dddd, DD MMMM YYYY');
              return (
                <div key={dateKey} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <CalendarOutlined style={{ color: '#1677ff' }} />
                    <Typography.Text strong style={{ fontSize: 14, color: '#1677ff' }}>{dateLabel}</Typography.Text>
                    <div style={{ flex: 1, height: 1, background: '#e8f0fe', borderRadius: 1 }} />
                    <Tag color="blue">{dayStops.length} stop{dayStops.length !== 1 ? 's' : ''}</Tag>
                  </div>
                  {dayStops.map((stop, idx) => {
                    const name = stop.customer_name || stop.prospect_name || stop.address_snapshot || `Stop ${stop.stop_order}`;
                    const pinColor = STOP_COLORS[stop.stop_type] || STOP_COLORS.other;
                    const typeLabels = { customer: 'Customer', prospect: 'Prospect', supplier: 'Supplier', other: 'Other' };
                    const visitTime = stop.visit_time ? stop.visit_time.substring(0, 5) : null;
                    return (
                      <div key={stop.id || idx} style={{ display: 'flex', gap: 14, marginBottom: idx < dayStops.length - 1 ? 16 : 0 }}>
                        {/* Left: number + connector */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%', background: pinColor,
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', flexShrink: 0,
                          }}>
                            {stop.stop_order}
                          </div>
                          {idx < dayStops.length - 1 && (
                            <div style={{ width: 2, flex: 1, background: '#e8e8e8', margin: '4px 0', minHeight: 16 }} />
                          )}
                        </div>
                        {/* Right: content card */}
                        <div style={{
                          flex: 1, background: '#fafafa', borderRadius: 10,
                          border: '1px solid #f0f0f0', padding: '12px 16px', marginBottom: 2,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                            <div>
                              <Typography.Text strong style={{ fontSize: 15 }}>{name}</Typography.Text>
                              <Tag color={stop.stop_type === 'customer' ? 'blue' : stop.stop_type === 'prospect' ? 'orange' : 'default'}
                                style={{ marginLeft: 8, fontSize: 11 }}>
                                {typeLabels[stop.stop_type] || stop.stop_type}
                              </Tag>
                            </div>
                            <Space size={6}>
                              {visitTime && (
                                <Tag icon={<ClockCircleOutlined />} color="default" style={{ fontWeight: 600 }}>{visitTime}</Tag>
                              )}
                              <Tag style={{ color: '#595959' }}>{stop.duration_mins || 60} min</Tag>
                            </Space>
                          </div>
                          {stop.address_snapshot && (
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                              <EnvironmentOutlined style={{ marginRight: 4 }} />{stop.address_snapshot}
                            </Typography.Text>
                          )}
                          {stop.objectives && (
                            <Typography.Text style={{ fontSize: 12, display: 'block', marginTop: 6, color: '#1677ff' }}>
                              🎯 {stop.objectives}
                            </Typography.Text>
                          )}
                          {(stop.contact_person || stop.contact_phone) && (
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                              <UserOutlined style={{ marginRight: 4 }} />
                              {stop.contact_person}{stop.contact_phone ? ` · ${stop.contact_phone}` : ''}
                            </Typography.Text>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()
        )}
      </Card>
    </div>
  );
};

export default FieldVisitRouteView;
