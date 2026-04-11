import React from 'react';
import { Alert, Button, Card, Col, Input, Space, Tooltip, Typography } from 'antd';
import { CloseOutlined, CompassOutlined, CompressOutlined, ExpandOutlined } from '@ant-design/icons';

const { Text: TypographyText } = Typography;

const FieldVisitPlannerMapPanel = ({
  isMobile,
  isMapFullscreen,
  mapCardWrapRef,
  mapSearchScopeCountry,
  mapSearchQuery,
  setMapSearchQuery,
  mapSearching,
  searchMapPlaces,
  toggleMapFullscreen,
  mapSearchResults,
  setMapSearchResults,
  centerMapOnSearchResult,
  pinTargetIdx,
  applyCoordinatesToStop,
  addSearchResultAsStop,
  setPinTargetIdx,
  mapContainerRef,
  mapReady,
}) => {
  return (
    <Col xs={24} lg={10}>
      <div
        ref={mapCardWrapRef}
        style={isMapFullscreen ? { background: '#fff', padding: 12, height: '100%' } : undefined}
      >
        <Card
          title={<Space><CompassOutlined /> Map</Space>}
          styles={{ body: { padding: 0, position: 'relative' } }}
          extra={
            <Space size={6} wrap>
              <Space.Compact>
                <Input
                  size="small"
                  allowClear
                  placeholder={mapSearchScopeCountry ? `Search in ${mapSearchScopeCountry}…` : 'Search place…'}
                  value={mapSearchQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMapSearchQuery(v);
                    if (!v.trim()) setMapSearchResults([]);
                  }}
                  onPressEnter={searchMapPlaces}
                  style={{ width: isMobile ? 160 : 260 }}
                />
                <Button size="small" loading={mapSearching} onClick={searchMapPlaces}>Search</Button>
              </Space.Compact>
              <Tooltip title={isMapFullscreen ? 'Exit fullscreen' : 'Expand map'}>
                <Button size="small" icon={isMapFullscreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={toggleMapFullscreen} />
              </Tooltip>
            </Space>
          }
        >
          {mapSearchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 700, maxHeight: 170, overflowY: 'auto', background: 'rgba(255,255,255,0.96)', borderRadius: 8, border: '1px solid #d9d9d9', padding: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setMapSearchResults([])} style={{ fontSize: 11 }} />
              </div>
              {mapSearchResults.slice(0, 6).map((r, i) => (
                <div key={`${r.lat}-${r.lng}-${i}`} style={{ padding: '6px 8px', borderBottom: i < Math.min(mapSearchResults.length, 6) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <TypographyText style={{ display: 'block', fontSize: 12 }} ellipsis>{r.display_name}</TypographyText>
                  <Space size={6} style={{ marginTop: 4 }}>
                    <Button size="small" onClick={() => centerMapOnSearchResult(r)}>Center</Button>
                    {pinTargetIdx !== null ? (
                      <Button size="small" type="primary" onClick={() => {
                        const lat = Number(r.lat);
                        const lng = Number(r.lng);
                        if (Number.isFinite(lat) && Number.isFinite(lng)) {
                          applyCoordinatesToStop(pinTargetIdx, lat, lng, r.display_name);
                          centerMapOnSearchResult(r);
                          setMapSearchResults([]);
                          setPinTargetIdx(null);
                        }
                      }}>
                        Apply to Stop #{pinTargetIdx + 1}
                      </Button>
                    ) : (
                      <Button size="small" type="primary" onClick={() => addSearchResultAsStop(r)}>Add Stop</Button>
                    )}
                  </Space>
                </div>
              ))}
            </div>
          )}
          <div
            ref={mapContainerRef}
            style={{ width: '100%', height: isMapFullscreen ? 'calc(100vh - 130px)' : (isMobile ? 320 : 620), borderRadius: '0 0 8px 8px' }}
          />
          {!mapReady && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 500 }}>
              <TypographyText type="secondary">Loading map...</TypographyText>
            </div>
          )}
        </Card>
      </div>
      <TypographyText type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
        Map auto-centers by selected country. Route appears when at least 2 stops have distinct valid coordinates.
      </TypographyText>
      {pinTargetIdx !== null && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8 }}
          message={`Pin Mode: click on the map to set coordinates for Stop #${pinTargetIdx + 1}.`}
        />
      )}
    </Col>
  );
};

export default FieldVisitPlannerMapPanel;
