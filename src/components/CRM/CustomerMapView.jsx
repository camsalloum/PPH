/**
 * CustomerMapView - Global Map of All Customers
 * Features:
 * - All customers plotted on interactive map
 * - Marker clustering for dense areas
 * - Color-coded by status/type/revenue
 * - Click to view customer details
 * - Filters by country, status, type
 * - Google Maps (EN/AR bilingual)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleMap, MarkerF, InfoWindowF, useJsApiLoader, MarkerClustererF,
} from '@react-google-maps/api';
import { 
  Card, Row, Col, Select, Typography, Space, Tag, Spin, Empty, 
  Button, Statistic, Tooltip, App 
} from 'antd';
import {
  EnvironmentOutlined,
  GlobalOutlined,
  TeamOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  FilterOutlined,
  HeatMapOutlined,
  CarOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './CRM.css';

const { Title, Text } = Typography;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const CMV_LIBRARIES = [];

// Color schemes for different customer attributes
const STATUS_COLORS = {
  active: '#52c41a',
  inactive: '#d9d9d9'
};

const TYPE_COLORS = {
  'Company': '#1890ff',
  'Individual': '#13c2c2'
};

// SVG icon for customer marker
const makeCustomerMarkerIcon = (color, large = false) => {
  const size = large ? 38 : 30;
  const r = large ? 17 : 13;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${color}" stroke="white" stroke-width="2.5"/>
      </svg>`
    )}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size / 2),
  };
};

// SVG label icon for country coverage marker
const makeCountryLabelIcon = (bgColor, label) => ({
  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="32">
      <rect rx="16" ry="16" width="130" height="32" fill="${bgColor}" stroke="white" stroke-width="2"/>
      <text x="65" y="22" text-anchor="middle" fill="white" font-size="11" font-weight="600" font-family="Arial,sans-serif">${label}</text>
    </svg>`
  )}`,
  scaledSize: new window.google.maps.Size(130, 32),
  anchor: new window.google.maps.Point(65, 16),
});

const CustomerMapView = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const googleMapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: CMV_LIBRARIES,
    language: 'en',
  });
  
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [salesRepInfo, setSalesRepInfo] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCountryInfo, setSelectedCountryInfo] = useState(null); // { country, data }
  
  // Filters
  const [countryFilter, setCountryFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [salesRepGroupFilter, setSalesRepGroupFilter] = useState(null);
  const [colorBy, setColorBy] = useState('status');
  
  // Route planning state
  const [routeMode, setRouteMode] = useState(false);
  const [selectedStops, setSelectedStops] = useState([]);
  
  // Sales rep groups for filter dropdown
  const [salesRepGroups, setSalesRepGroups] = useState([]);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    confirmedPins: 0,
    unconfirmedPins: 0,
    noPins: 0,
    activeCount: 0,
    countryCount: 0
  });
  const [countryCoverage, setCountryCoverage] = useState({});
  
  // Fetch MY customers with coordinates (only sales rep's customers)
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      
      const params = new URLSearchParams();
      if (countryFilter) params.append('country', countryFilter);
      // Note: removed statusFilter since API now always filters to active only
      if (typeFilter) params.append('customer_type', typeFilter);
      if (salesRepGroupFilter) params.append('sales_rep_group', salesRepGroupFilter);
      
      // Use my-customers/map endpoint to only get sales rep's customers
      const res = await axios.get(`${API_BASE_URL}/api/crm/my-customers/map?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setCustomers(res.data.data || []); // Only customers WITH confirmed pins
        setSalesRepInfo(res.data.salesRep || null);
        setCountryCoverage(res.data.countryCoverage || {});
        if (res.data.salesRepGroups) setSalesRepGroups(res.data.salesRepGroups);
        setStats({
          total: res.data.totalCustomers || res.data.pagination?.total || 0,
          confirmedPins: res.data.pagination?.confirmedPins || res.data.data?.length || 0,
          unconfirmedPins: res.data.pagination?.unconfirmedPins || 0,
          noPins: res.data.pagination?.noPins || 0,
          activeCount: res.data.data?.length || 0,
          countryCount: new Set(res.data.data?.map(c => c.country).filter(Boolean)).size || 0
        });
      }
    } catch (error) {
      console.error('Error loading customers for map:', error);
      if (error.response?.status === 403) {
        message.error('You are not registered as a sales rep');
      } else {
        message.error('Failed to load customer locations');
      }
    } finally {
      setLoading(false);
    }
  }, [countryFilter, typeFilter, salesRepGroupFilter]);
  
  // Fetch countries for filter - use countries from countryCoverage after data loads
  // If countryCoverage is available, use those countries (sales rep's countries)
  // Otherwise fall back to all countries
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE_URL}/api/crm/customers/countries`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          setCountries(res.data.data || []);
        }
      } catch (error) {
        console.error('Error loading countries:', error);
      }
    };
    loadCountries();
  }, []);
  
  // Update countries list from countryCoverage when it changes (use sales rep's countries)
  useEffect(() => {
    if (Object.keys(countryCoverage).length > 0) {
      const salesRepCountries = Object.keys(countryCoverage).sort();
      setCountries(salesRepCountries);
    }
  }, [countryCoverage]);
  
  // Load customers when filters change
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);
  
  
  // Country centroids for markers (approximate centers)
  const COUNTRY_COORDS = {
    'United Arab Emirates': { lat: 24.4539, lng: 54.3773, zoom: 7 },
    'Kingdom Of Saudi Arabia': { lat: 23.8859, lng: 45.0792, zoom: 5 },
    'Saudi Arabia': { lat: 23.8859, lng: 45.0792, zoom: 5 },
    'Iraq': { lat: 33.2232, lng: 43.6793, zoom: 6 },
    'Sudan': { lat: 12.8628, lng: 30.2176, zoom: 5 },
    'Jordan': { lat: 30.5852, lng: 36.2384, zoom: 7 },
    'Yemen': { lat: 15.5527, lng: 48.5164, zoom: 6 },
    'Syrian Arab Republic': { lat: 34.8021, lng: 38.9968, zoom: 7 },
    'Syria': { lat: 34.8021, lng: 38.9968, zoom: 7 },
    'Egypt': { lat: 26.8206, lng: 30.8025, zoom: 6 },
    'Kuwait': { lat: 29.3117, lng: 47.4818, zoom: 8 },
    'Bahrain': { lat: 26.0667, lng: 50.5577, zoom: 10 },
    'Qatar': { lat: 25.3548, lng: 51.1839, zoom: 9 },
    'Oman': { lat: 21.4735, lng: 55.9754, zoom: 6 },
    'Lebanon': { lat: 33.8547, lng: 35.8623, zoom: 8 },
    'Palestine': { lat: 31.9522, lng: 35.2332, zoom: 8 },
    'Libya': { lat: 26.3351, lng: 17.2283, zoom: 5 },
    'Tunisia': { lat: 33.8869, lng: 9.5375, zoom: 6 },
    'Algeria': { lat: 28.0339, lng: 1.6596, zoom: 5 },
    'Morocco': { lat: 31.7917, lng: -7.0926, zoom: 5 }
  };
  
  // Country marker layer ref — kept so COUNTRY_COORDS reference below still works
  // (no Leaflet ref needed; markers are React children of <GoogleMap>)

  // Fit map bounds to country coverage when data loads and no customer markers yet
  useEffect(() => {
    if (!googleMapRef.current || !isLoaded) return;
    if (customers.length === 0 && Object.keys(countryCoverage).length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      let extended = false;
      Object.keys(countryCoverage).forEach((c) => {
        const coords = COUNTRY_COORDS[c];
        if (coords) { bounds.extend({ lat: coords.lat, lng: coords.lng }); extended = true; }
      });
      if (extended) googleMapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [countryCoverage, customers.length, isLoaded]);

  // Route planning: toggle a customer as a stop
  const toggleRouteStop = useCallback((customer) => {
    setSelectedStops(prev => {
      const exists = prev.find(s => s.id === customer.id);
      if (exists) return prev.filter(s => s.id !== customer.id);
      if (prev.length >= 5) {
        message.warning('Maximum 5 stops allowed');
        return prev;
      }
      return [...prev, { id: customer.id, name: customer.customer_name, lat: customer.latitude, lng: customer.longitude }];
    });
  }, [message]);

  
  // Toggle fullscreen
  const toggleFullscreen = () => setIsFullscreen(f => !f);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);
  
  // Reset view to global Middle East view
  const resetView = () => {
    if (googleMapRef.current) {
      googleMapRef.current.setCenter({ lat: 25, lng: 45 });
      googleMapRef.current.setZoom(4);
    }
  };
  
  // Clear filters
  const clearFilters = () => {
    setCountryFilter(null);
    setTypeFilter(null);
    setSalesRepGroupFilter(null);
  };

  // Open Google Maps with multi-stop directions
  const openGoogleMapsRoute = () => {
    if (selectedStops.length < 2) {
      message.warning('Select at least 2 customers to plan a route');
      return;
    }
    const url = `https://www.google.com/maps/dir/${selectedStops.map(s => `${s.lat},${s.lng}`).join('/')}`;
    window.open(url, '_blank');
  };

  return (
    <div className={`crm-customer-map ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header - hide in fullscreen */}
      {!isFullscreen && (
        <div className="crm-page-title crm-row-mb-16">
          <GlobalOutlined />
          <Title level={2}>My Customer Map</Title>
          <Tag color="green">{stats.confirmedPins} confirmed pins</Tag>
          {salesRepInfo && (
            <Tag color={salesRepInfo.type === 'GROUP' ? 'purple' : 'green'}>
              {salesRepInfo.name}
              {salesRepInfo.type === 'GROUP' && ` (${salesRepInfo.groupMembers?.length || 0} members)`}
            </Tag>
          )}
        </div>
      )}
      
      {/* Filters and Stats - hide in fullscreen */}
      {!isFullscreen && (
      <Card className="crm-table-card crm-row-mb-16">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="Filter by Country"
              value={countryFilter}
              onChange={setCountryFilter}
              allowClear
              showSearch
              className="crm-select-full-width"
              suffixIcon={<GlobalOutlined />}
            >
              {countries.map(country => (
                <Option key={country} value={country}>{country}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Sales Rep Group"
              value={salesRepGroupFilter}
              onChange={setSalesRepGroupFilter}
              allowClear
              showSearch
              className="crm-select-full-width"
              suffixIcon={<TeamOutlined />}
            >
              {salesRepGroups.map(g => (
                <Option key={g} value={g}>{g}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Type"
              value={typeFilter}
              onChange={setTypeFilter}
              allowClear
              className="crm-select-full-width"
            >
              <Option value="Company">Company</Option>
              <Option value="Individual">Individual</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              value={colorBy}
              onChange={setColorBy}
              className="crm-select-full-width"
              suffixIcon={<HeatMapOutlined />}
            >
              <Option value="status">Color by Status</Option>
              <Option value="type">Color by Type</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Space>
              <Tooltip title="Plan Visit Route">
                <Button 
                  icon={<CarOutlined />} 
                  onClick={() => { setRouteMode(!routeMode); setSelectedStops([]); }}
                  type={routeMode ? 'primary' : 'default'}
                  style={routeMode ? { background: '#fa8c16', borderColor: '#fa8c16' } : {}}
                >
                  {routeMode ? 'Exit Route' : 'Plan Visit'}
                </Button>
              </Tooltip>
              <Tooltip title="Reset View">
                <Button icon={<ReloadOutlined />} onClick={resetView} />
              </Tooltip>
              <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                <Button 
                  icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} 
                  onClick={toggleFullscreen}
                />
              </Tooltip>
              {(countryFilter || typeFilter || salesRepGroupFilter) && (
                <Button onClick={clearFilters} danger>Clear Filters</Button>
              )}
            </Space>
          </Col>
        </Row>
        
        {/* Info banner about active-only filter */}
        <div className="crm-map-info-box">
          <Text className="crm-map-info-text">
            <TeamOutlined /> Only <b>active customers</b> (transaction in last 12 months) with <b>confirmed pin locations</b> are shown on the map.
          </Text>
        </div>
        
        {/* Stats */}
        <Row gutter={16} className="crm-map-stats-row">
          <Col xs={4}>
            <Statistic 
              title="Active Customers" 
              value={stats.total} 
              prefix={<TeamOutlined />}
              className="crm-stat-value-sm"
            />
          </Col>
          <Col xs={4}>
            <Tooltip title="Countries with active customers">
              <Statistic 
                title="🌍 Countries" 
                value={Object.keys(countryCoverage).length}
                prefix={<GlobalOutlined />}
                className="crm-stat-value-blue"
              />
            </Tooltip>
          </Col>
          <Col xs={4}>
            <Tooltip title="Customers with user-confirmed pin locations shown on map">
              <Statistic 
                title="📍 On Map" 
                value={stats.confirmedPins}
                prefix={<EnvironmentOutlined />}
                className="crm-stat-value-green"
              />
            </Tooltip>
          </Col>
          <Col xs={4}>
            <Tooltip title="AI-generated pins need confirmation to appear on map">
              <Statistic 
                title="⚠️ Needs Confirm" 
                value={stats.unconfirmedPins}
                className="crm-stat-value-orange"
              />
            </Tooltip>
          </Col>
          <Col xs={4}>
            <Tooltip title="Customers without any pin location">
              <Statistic 
                title="No Pin" 
                value={stats.noPins}
                className="crm-stat-value-muted"
              />
            </Tooltip>
          </Col>
        </Row>
      </Card>
      )}
      
      {/* Map */}
      <Card 
        className={`crm-table-card crm-card-no-padding ${isFullscreen ? 'crm-card-fullscreen' : ''}`}
      >
        {/* Fullscreen exit button */}
        {isFullscreen && (
          <div className="crm-fullscreen-controls">
            <Tooltip title="Reset View">
              <Button icon={<ReloadOutlined />} onClick={resetView} />
            </Tooltip>
            <Tooltip title="Exit Fullscreen (Esc)">
              <Button 
                icon={<FullscreenExitOutlined />} 
                onClick={toggleFullscreen}
                type="primary"
              />
            </Tooltip>
          </div>
        )}
        {loading && (
          <div className="crm-map-loading">
            <Spin size="large" />
            <div className="crm-map-loading-text">Loading customers...</div>
          </div>
        )}
        
        {/* Google Map */}
        {isLoaded ? (
          <div style={{ position: 'relative' }}>
            <GoogleMap
              mapContainerClassName={isFullscreen ? 'crm-map-container-fullscreen' : 'crm-map-container'}
              center={{ lat: 25, lng: 45 }}
              zoom={4}
              options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: 'greedy' }}
              onLoad={(m) => { googleMapRef.current = m; }}
            >
              {/* Customer markers with clustering */}
              <MarkerClustererF>
                {(clusterer) =>
                  customers
                    .filter(c => c.latitude && c.longitude)
                    .map((customer) => {
                      const isRouteStop = routeMode && selectedStops.some(s => s.id === customer.id);
                      let color = '#1890ff';
                      if (colorBy === 'status') color = customer.is_active ? STATUS_COLORS.active : STATUS_COLORS.inactive;
                      else if (colorBy === 'type') color = TYPE_COLORS[customer.customer_type] || '#1890ff';
                      if (isRouteStop) color = '#fa8c16';
                      return (
                        <MarkerF
                          key={customer.id}
                          position={{ lat: Number(customer.latitude), lng: Number(customer.longitude) }}
                          clusterer={clusterer}
                          icon={makeCustomerMarkerIcon(color, isRouteStop)}
                          title={customer.customer_name}
                          onClick={() => setSelectedCustomer(customer)}
                        />
                      );
                    })
                }
              </MarkerClustererF>

              {/* Country coverage label markers */}
              {Object.entries(countryCoverage).map(([country, data]) => {
                const coords = COUNTRY_COORDS[country];
                if (!coords) return null;
                const bgColor = data.hasConfirmedPins ? '#52c41a' : '#1a3a6e';
                const shortName = country
                  .replace('Kingdom Of ', '').replace('United Arab Emirates', 'UAE')
                  .replace('Syrian Arab Republic', 'Syria').replace('Saudi Arabia', 'Saudi');
                return (
                  <MarkerF
                    key={`country-${country}`}
                    position={{ lat: coords.lat, lng: coords.lng }}
                    icon={makeCountryLabelIcon(bgColor, `${shortName} (${data.count})`)}
                    onClick={() => setSelectedCountryInfo({ country, data })}
                    zIndex={1}
                  />
                );
              })}

              {/* Customer info popup */}
              {selectedCustomer && (
                <InfoWindowF
                  position={{ lat: Number(selectedCustomer.latitude), lng: Number(selectedCustomer.longitude) }}
                  onCloseClick={() => setSelectedCustomer(null)}
                >
                  <div style={{ minWidth: 220, padding: 8 }}>
                    <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 8, color: '#1890ff' }}>
                      {selectedCustomer.customer_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}><strong>Code:</strong> {selectedCustomer.customer_code}</div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}><strong>Country:</strong> {selectedCustomer.country || '-'}</div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}><strong>Type:</strong> {selectedCustomer.customer_type || 'Company'}</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <strong>Status:</strong>{' '}
                      <span style={{ color: selectedCustomer.is_active ? '#52c41a' : '#999' }}>
                        {selectedCustomer.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                      <button
                        onClick={() => navigate(`/crm/customers/${selectedCustomer.id}`)}
                        style={{ background: '#1890ff', color: 'white', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 6 }}
                      >
                        View Details
                      </button>
                      {routeMode && (
                        <button
                          onClick={() => { toggleRouteStop(selectedCustomer); setSelectedCustomer(null); }}
                          style={{ background: selectedStops.some(s => s.id === selectedCustomer.id) ? '#ff4d4f' : '#fa8c16', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          {selectedStops.some(s => s.id === selectedCustomer.id) ? 'Remove' : 'Add to Route'}
                        </button>
                      )}
                    </div>
                  </div>
                </InfoWindowF>
              )}

              {/* Country coverage info popup */}
              {selectedCountryInfo && (() => {
                const { country, data } = selectedCountryInfo;
                const coords = COUNTRY_COORDS[country];
                if (!coords) return null;
                const moreCount = (data.customers?.length || 0) - 10;
                return (
                  <InfoWindowF
                    position={{ lat: coords.lat, lng: coords.lng }}
                    onCloseClick={() => setSelectedCountryInfo(null)}
                  >
                    <div style={{ minWidth: 220, padding: 8 }}>
                      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 8, color: data.hasConfirmedPins ? '#52c41a' : '#1a3a6e' }}>
                        🌍 {country}
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><strong>{data.count}</strong> active customer{data.count > 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                        {data.hasConfirmedPins ? '✅ Has confirmed pins' : '⚠️ Pins need confirmation'}
                      </div>
                      {data.customers?.slice(0, 10).map((c) => {
                        const custName = typeof c === 'object' ? c.name : c;
                        const custId = typeof c === 'object' ? c.id : null;
                        return (
                          <div key={custId || custName} style={{ fontSize: 11, margin: '3px 0' }}>
                            {custId
                              ? <span style={{ color: '#1890ff', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/crm/customers/${custId}`)}>• {custName}</span>
                              : `• ${custName}`
                            }
                          </div>
                        );
                      })}
                      {moreCount > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#1890ff', cursor: 'pointer' }} onClick={() => navigate(`/crm/customers?country=${encodeURIComponent(country)}`)}>
                          ...and {moreCount} more →
                        </div>
                      )}
                    </div>
                  </InfoWindowF>
                );
              })()}
            </GoogleMap>
          </div>
        ) : (
          <div className={isFullscreen ? 'crm-map-container-fullscreen' : 'crm-map-container'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" tip="Loading Google Maps..." />
          </div>
        )}
        
        {/* Route Planning Panel */}
        {routeMode && (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 1000,
            background: 'white', borderRadius: 8, padding: 16, minWidth: 240,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxHeight: 300, overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong><CarOutlined style={{ marginRight: 6, color: '#fa8c16' }} />Plan Visit Route</Text>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => { setRouteMode(false); setSelectedStops([]); }} />
            </div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Click markers to add stops (2-5)
            </Text>
            {selectedStops.length === 0 ? (
              <Empty description="No stops selected" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
            ) : (
              selectedStops.map((stop, idx) => (
                <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Tag color="orange" style={{ margin: 0 }}>{idx + 1}</Tag>
                  <Text style={{ fontSize: 12, flex: 1 }} ellipsis>{stop.name}</Text>
                  <Button size="small" type="text" danger icon={<CloseOutlined />}
                    onClick={() => setSelectedStops(prev => prev.filter(s => s.id !== stop.id))} />
                </div>
              ))
            )}
            <Button
              type="primary"
              icon={<CarOutlined />}
              block
              disabled={selectedStops.length < 2}
              onClick={openGoogleMapsRoute}
              style={{ marginTop: 8, background: '#fa8c16', borderColor: '#fa8c16' }}
            >
              Open Route in Google Maps
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="crm-map-legend">
          <Text strong className="crm-legend-title">Legend</Text>
          {colorBy === 'status' && (
            <>
              <div className="crm-legend-row">
                <div className="crm-legend-dot" style={{ background: STATUS_COLORS.active }} />
                <Text className="crm-legend-label">Active</Text>
              </div>
              <div className="crm-legend-row">
                <div className="crm-legend-dot" style={{ background: STATUS_COLORS.inactive }} />
                <Text className="crm-legend-label">Inactive</Text>
              </div>
            </>
          )}
          {colorBy === 'type' && (
            <>
              <div className="crm-legend-row">
                <div className="crm-legend-dot" style={{ background: TYPE_COLORS.Company }} />
                <Text className="crm-legend-label">Company</Text>
              </div>
              <div className="crm-legend-row">
                <div className="crm-legend-dot" style={{ background: TYPE_COLORS.Individual }} />
                <Text className="crm-legend-label">Individual</Text>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default CustomerMapView;
