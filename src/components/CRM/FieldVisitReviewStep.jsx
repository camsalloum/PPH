import React from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Row,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import FieldVisitMap from './FieldVisitMap';
import { hasValidCoordinates, sanitizeLocationLabel } from './fieldVisitUtils';

const { Title, Text, Paragraph } = Typography;

const FieldVisitReviewStep = ({
  form,
  countries,
  parseTransportMode,
  serializeTransportMode,
  transportOptions,
  routeGeoSummary,
  stops,
  reviewRouteFlow,
  reviewTripHealth,
  reviewMapStops,
  etaChain,
  reviewShowUnsavedOnly,
  setReviewShowUnsavedOnly,
  unresolvedGpsCount,
  routeLegs,
  customerMap,
  prospectMap,
  resolveCountryName,
  customStopLabels,
  stopColors,
  interStopTransport,
  hasResolvedStopCoordinates,
  saving,
  onSave,
  onBackToStops,
  isMobile,
  fmtDuration,
}) => {
  const vals = form.getFieldsValue(true);
  const countryRow = countries.find(c => c.country_code_2 === vals.country_code);

  return (
    <Card>
      <Title level={5}>Trip Summary</Title>
      <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          <Col xs={12} md={6}><Text type="secondary">Title</Text><br /><Text strong>{vals.title || '—'}</Text></Col>
          <Col xs={12} md={6}><Text type="secondary">Type</Text><br /><Tag color={vals.trip_type === 'international' ? 'blue' : 'green'}>{vals.trip_type || 'local'}</Tag></Col>
          <Col xs={12} md={6}><Text type="secondary">Country</Text><br /><Text strong>{countryRow?.country_name || vals.country_code || '—'}</Text></Col>
          <Col xs={12} md={6}><Text type="secondary">Dates</Text><br /><Text>{vals.departure_date ? dayjs(vals.departure_date).format('DD MMM') : '—'} → {vals.return_date ? dayjs(vals.return_date).format('DD MMM') : '—'}</Text></Col>
          <Col xs={12} md={6}><Text type="secondary">Transport</Text><br />{parseTransportMode(serializeTransportMode(vals.transport_mode)).map(m => <Tag key={m} style={{ marginBottom: 2 }}>{transportOptions.find(o => o.value === m)?.label || m}</Tag>)}</Col>
          <Col xs={12} md={6}><Text type="secondary">Budget</Text><br /><Text>{vals.budget_estimate ? `AED ${Number(vals.budget_estimate).toLocaleString()}` : '—'}</Text></Col>
          <Col xs={12} md={6}><Text type="secondary">Route Countries</Text><br />{routeGeoSummary.countries.length > 0 ? routeGeoSummary.countries.map((c, i) => <Tag key={`rc-${i}`} color="blue" style={{ marginBottom: 2 }}>{c}</Tag>) : <Text>—</Text>}</Col>
          <Col xs={12} md={6}><Text type="secondary">Stops</Text><br /><Text strong style={{ fontSize: 18 }}>{stops.length}</Text></Col>
        </Row>
        <Row gutter={[16, 8]} style={{ marginTop: 2 }}>
          <Col xs={24} md={12}>
            <Text type="secondary">Route Cities</Text>
            <br />
            {routeGeoSummary.cities.length > 0 ? routeGeoSummary.cities.map((c, i) => <Tag key={`city-${i}`} style={{ marginBottom: 2 }}>{c}</Tag>) : <Text>—</Text>}
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary">Country Flow</Text>
            <br />
            {reviewRouteFlow.countryHops.length > 0
              ? <Text>{reviewRouteFlow.countryHops.join(' → ')}</Text>
              : <Text>—</Text>}
          </Col>
        </Row>
        {vals.objectives && <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>Objectives: {vals.objectives}</Paragraph>}
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Text type="secondary">GPS Resolved</Text><br /><Text strong>{reviewTripHealth.resolvedGps}/{stops.length}</Text></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Text type="secondary">Schedule Conflicts</Text><br /><Text strong>{reviewTripHealth.lateCount}</Text></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Text type="secondary">Customer/Prospect</Text><br /><Text strong>{reviewTripHealth.customerStops}/{reviewTripHealth.prospectStops}</Text></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Text type="secondary">Location Stops</Text><br /><Text strong>{reviewTripHealth.locationStops}</Text></Card></Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />
      <Title level={5}>Final Route Preview</Title>
      <FieldVisitMap
        height={480}
        routeLineVisible
        stops={reviewMapStops}
      />

      <Divider style={{ margin: '12px 0' }} />
      <Title level={5}>Stops ({stops.length})</Title>

      {(() => {
        const lateCount = etaChain.filter(e => e?.isLate).length;
        return lateCount > 0 ? (
          <Alert type="warning" showIcon style={{ marginBottom: 10 }}
            message={`${lateCount} stop${lateCount > 1 ? 's have' : ' has'} schedule conflicts — consider adjusting times or reducing duration.`}
          />
        ) : null;
      })()}

      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {stops.filter(s => hasValidCoordinates(s.latitude, s.longitude) && s.coordinates_persist_status === 'failed').length} stop(s) need coordinate persistence fix.
        </Text>
        <Space size={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>Show GPS Not Saved only</Text>
          <Switch
            size="small"
            checked={reviewShowUnsavedOnly}
            onChange={setReviewShowUnsavedOnly}
            disabled={unresolvedGpsCount === 0}
          />
        </Space>
      </Space>

      {(reviewShowUnsavedOnly
        ? stops.filter(s => !hasResolvedStopCoordinates(s))
        : stops
      ).map((s) => {
        const actualIndex = stops.findIndex((orig) => {
          if (orig.local_id && s.local_id) return orig.local_id === s.local_id;
          if (orig.id != null && s.id != null) return Number(orig.id) === Number(s.id);
          return false;
        });
        const safeIndex = actualIndex >= 0 ? actualIndex : 0;
        const color = stopColors[s.stop_type] || stopColors.other;
        const name = s.customer_id && customerMap.has(s.customer_id) ? customerMap.get(s.customer_id).label
          : s.prospect_id && prospectMap.has(s.prospect_id) ? prospectMap.get(s.prospect_id).label
          : (sanitizeLocationLabel(s.address_snapshot) || `Stop ${safeIndex + 1}`);
        const city = (s.stop_city || '').trim();
        const country = (resolveCountryName(s.stop_country) || s.stop_country || '').trim();
        const locationMeta = [city, country].filter(Boolean).join(', ');
        const prevCountry = safeIndex > 0 ? (stops[safeIndex - 1].stop_country || '').trim().toLowerCase() : null;
        const curCountry = (s.stop_country || '').trim().toLowerCase();
        const showCountryHeader = curCountry && (safeIndex === 0 || curCountry !== prevCountry);
        const transportIcon = s.transport_to_next ? (interStopTransport.find(t => t.value === s.transport_to_next)?.icon || '') : '';
        const legInfo = routeLegs[safeIndex];
        return (
          <React.Fragment key={s.local_id || s.id || safeIndex}>
            {showCountryHeader && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', margin: safeIndex > 0 ? '10px 0 4px' : '0 0 4px', background: 'linear-gradient(90deg,#e6f4ff 0%,transparent 100%)', borderRadius: 6, borderLeft: '3px solid #1677ff' }}>
                <GlobalOutlined style={{ color: '#1677ff', fontSize: 13 }} />
                <Text strong style={{ fontSize: 13, color: '#0958d9' }}>{resolveCountryName(s.stop_country) || s.stop_country}</Text>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Badge count={safeIndex + 1} style={{ backgroundColor: color, marginRight: 12 }} />
              <div style={{ flex: 1 }}>
                <Text strong>{name}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.stop_type === 'location' ? (customStopLabels.find(l => l.value === s.custom_label)?.label || 'Location') : s.stop_type} · {s.visit_date || 'Date TBD'} {s.visit_time || ''}
                  {s.stop_type !== 'location' && <>{' '}· {s.duration_mins || 60} min</>}
                  {s.stop_type !== 'location' && s.contact_person ? ` · ${s.contact_person}` : ''}
                </Text>
                {locationMeta && (
                  <>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{locationMeta}</Text>
                  </>
                )}
              </div>
              {etaChain[actualIndex]?.isLate && (
                <Tooltip title={`Expected ${etaChain[actualIndex].arrivalTxt} — ${etaChain[actualIndex].lateMins}min late`}>
                  <Tag color="red" style={{ fontSize: 11, marginRight: 6 }}>⚠ {etaChain[actualIndex].lateMins}min late</Tag>
                </Tooltip>
              )}
              {hasValidCoordinates(s.latitude, s.longitude) && (
                <Tag color={s.coordinates_persist_status === 'failed' ? 'red' : s.coordinates_persist_status === 'auto_resolved' ? 'blue' : 'green'} style={{ fontSize: 11 }}>
                  {s.coordinates_persist_status === 'failed'
                    ? 'GPS Not Saved'
                    : s.coordinates_persist_status === 'auto_resolved'
                      ? 'GPS Auto-resolved'
                      : 'GPS Saved'}
                </Tag>
              )}
            </div>
            {actualIndex < stops.length - 1 && (
              <div style={{ padding: '2px 24px', fontSize: 11, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>▼</span>
                {transportIcon && <span>{transportIcon}</span>}
                {legInfo?.distanceTxt && <span>{legInfo.distanceTxt}</span>}
                {legInfo?.durationTxt && <span>· {legInfo.durationTxt}</span>}
                {legInfo?.transit && <span style={{ color: '#d48806' }}>✈ Transit</span>}
                {legInfo?.crossCountry && !legInfo?.transit && <span style={{ color: '#cf1322' }}>⚠ Transit not defined</span>}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {reviewShowUnsavedOnly && unresolvedGpsCount === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No GPS persistence issues found." />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <Button onClick={onBackToStops}><ArrowLeftOutlined /> Back to Stops</Button>
        <Space size={12} align="center">
          <Space direction="vertical" size={4} align="end">
            {unresolvedGpsCount > 0 && (
              <Text type="warning" style={{ fontSize: 12 }}>
                Resolve all GPS issues before saving.
              </Text>
            )}
            <Tooltip title={unresolvedGpsCount > 0 ? 'Resolve all unresolved GPS stops (Pin On Map or Google URL) before saving.' : ''}>
              <Button
                type="primary"
                size="large"
                loading={saving}
                disabled={unresolvedGpsCount > 0}
                onClick={onSave}
                icon={<CheckCircleOutlined />}
              >
                Save Trip
              </Button>
            </Tooltip>
          </Space>
        </Space>
      </div>
    </Card>
  );
};

export default FieldVisitReviewStep;
