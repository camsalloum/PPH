/**
 * CustomerLocationPicker - Interactive Map for Customer Location
 * Features:
 * - Display current customer location on map
 * - Click to set/update coordinates
 * - Search for address via Google Places Autocomplete
 * - Reverse geocode to get address details from coordinates
 * - Google Maps (EN/AR bilingual) - no language toggle needed
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, MarkerF, StandaloneSearchBox, useJsApiLoader } from '@react-google-maps/api';
import { Input, Button, Space, Typography, App, Tooltip, Spin } from 'antd';
import {
  EnvironmentOutlined,
  AimOutlined,
  SearchOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import './CRM.css';

const { Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const CLPICKER_LIBRARIES = ['places'];

const CustomerLocationPicker = ({ 
  latitude, 
  longitude, 
  onLocationChange, 
  onAddressChange,
  editMode = false,
  customerName = '',
  country = '',
  height = 400 
}) => {
  const { message } = App.useApp();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: CLPICKER_LIBRARIES,
    language: 'en',
  });

  const googleMapRef = useRef(null);
  const searchBoxRef = useRef(null);
  const [localCoords, setLocalCoords] = useState({ lat: latitude, lng: longitude });
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [addressDetails, setAddressDetails] = useState(null);

  // Default center (UAE)
  const defaultCenter = { lat: 24.453884, lng: 54.377344 };
  
  // Lookup region from database API
  const lookupRegionFromDB = async (countryName) => {
    if (!countryName) {
      return null;
    }
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/countries/lookup/${encodeURIComponent(countryName)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success && res.data.country) {
        return res.data.country.region;
      } else {
      }
    } catch (error) {
      console.error('🔴 Error looking up region:', error);
    }
    return null;
  };
  
  // Reverse geocode to get address from coordinates - ALWAYS ENGLISH
  const reverseGeocode = async (lat, lng) => {
    setReverseGeocoding(true);
    try {
      // Force English language in Nominatim request
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en&extratags=1`
      );
      const data = await response.json();
      
      
      if (data && data.address) {
        const addr = data.address;
        
        // Get country name from response
        const detectedCountry = addr.country || '';
        
        // Lookup region from our database FIRST, then build details
        let region = null;
        if (detectedCountry) {
          try {
            region = await lookupRegionFromDB(detectedCountry);
          } catch (lookupErr) {
            console.error('🔴 Region lookup failed:', lookupErr);
          }
        }
        
        const details = {
          city: addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state_district || '',
          state: addr.state || addr.region || addr.province || '',
          country: detectedCountry,
          postal_code: addr.postcode || '',
          address_line1: [addr.road, addr.house_number].filter(Boolean).join(' ') || 
                        [addr.neighbourhood, addr.suburb].filter(Boolean).join(', ') ||
                        addr.amenity || addr.building || '',
          region: region || null, // From database lookup
          display_name: data.display_name || ''
        };
        
        
        setAddressDetails(details);
        
        // Notify parent component of address data
        if (onAddressChange) {
          onAddressChange(details);
        }
        
        return details;
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      message.error('Failed to detect address');
    } finally {
      setReverseGeocoding(false);
    }
    return null;
  };
  
  // Handle location selection (click or drag)
  const handleLocationSelect = useCallback(async (lat, lng) => {
    setLocalCoords({ lat, lng });
    if (onLocationChange) onLocationChange(lat, lng);
    await reverseGeocode(lat, lng);
  }, [onLocationChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map click in edit mode
  const handleMapClick = useCallback((e) => {
    if (!editMode) return;
    handleLocationSelect(e.latLng.lat(), e.latLng.lng());
  }, [editMode, handleLocationSelect]);

  // Marker drag end
  const handleDragEnd = useCallback((e) => {
    handleLocationSelect(e.latLng.lat(), e.latLng.lng());
  }, [handleLocationSelect]);

  // Google Places search
  const handlePlacesChanged = useCallback(async () => {
    const places = searchBoxRef.current?.getPlaces?.();
    if (!places?.length) return;
    const place = places[0];
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();
    if (!lat || !lng) return;
    googleMapRef.current?.panTo({ lat, lng });
    googleMapRef.current?.setZoom(16);
    await handleLocationSelect(lat, lng);
  }, [handleLocationSelect]);

  // Sync external coordinate changes
  useEffect(() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!latitude || !longitude) return;
    setLocalCoords({ lat, lng });
  }, [latitude, longitude]);

  // Auto reverse geocode initial position in edit mode
  useEffect(() => {
    if (editMode && latitude && longitude) {
      reverseGeocode(Number(latitude), Number(longitude));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Center map on current marker
  const handleCenterMap = () => {
    if (!localCoords.lat || !localCoords.lng || !googleMapRef.current) return;
    googleMapRef.current.panTo({ lat: Number(localCoords.lat), lng: Number(localCoords.lng) });
    googleMapRef.current.setZoom(14);
  };

  if (loadError) return <Text type="danger">Failed to load Google Maps.</Text>;
  if (!isLoaded) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="Loading map..." />
      </div>
    );
  }

  const markerPos = localCoords.lat && localCoords.lng
    ? { lat: Number(localCoords.lat), lng: Number(localCoords.lng) }
    : null;
  const mapCenter = markerPos ?? defaultCenter;
  const mapZoom = markerPos ? 14 : 6;

  return (
    <div className="customer-location-picker">
      {/* Search bar (only in edit mode) — Google Places Autocomplete */}
      {editMode && (
        <div className="crm-location-search-box">
          <StandaloneSearchBox
            onLoad={(ref) => { searchBoxRef.current = ref; }}
            onPlacesChanged={handlePlacesChanged}
          >
            <input
              type="text"
              placeholder="Search address, city, or place name..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </StandaloneSearchBox>
          <Text type="secondary" className="crm-location-search-hint">
            Click on the map or drag the marker to set location. Address details will auto-fill.
          </Text>
        </div>
      )}
      
      {/* Google Map */}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height, borderRadius: 8, border: '1px solid #d9d9d9' }}
        center={mapCenter}
        zoom={mapZoom}
        onClick={handleMapClick}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: editMode ? 'greedy' : 'cooperative',
        }}
        onLoad={(m) => { googleMapRef.current = m; }}
      >
        {markerPos && (
          <MarkerF
            position={markerPos}
            draggable={editMode}
            onDragEnd={handleDragEnd}
            title={customerName || 'Customer Location'}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="${editMode ? '#ff4d4f' : '#1890ff'}" stroke="white" stroke-width="2.5"/>
                  <path d="M18 8 C13.6 8 10 11.6 10 16 C10 22 18 28 18 28 C18 28 26 22 26 16 C26 11.6 22.4 8 18 8Z" fill="white" opacity="0.9"/>
                </svg>`
              )}`,
              scaledSize: new window.google.maps.Size(36, 36),
              anchor: new window.google.maps.Point(18, 36),
            }}
          />
        )}
      </GoogleMap>
      
      {/* Coordinates and Address display */}
      <div className="crm-location-coords-box">
        <div className={`crm-location-coords-row ${addressDetails ? 'crm-row-mb-8' : ''}`}>
          <Space size={4}>
            <EnvironmentOutlined className="crm-text-primary" />
            <Text type="secondary" className="crm-location-coords">
              {localCoords.lat && localCoords.lng ? (
                <>
                  <Text code className="crm-location-coords">
                    {parseFloat(localCoords.lat).toFixed(6)}
                  </Text>
                  {', '}
                  <Text code className="crm-location-coords">
                    {parseFloat(localCoords.lng).toFixed(6)}
                  </Text>
                </>
              ) : (
                'Click on map to set location'
              )}
            </Text>
            {reverseGeocoding && <LoadingOutlined className="crm-ml-8" />}
          </Space>
          
          {localCoords.lat && localCoords.lng && (
            <Tooltip title="Center on location">
              <Button 
                type="text" 
                size="small" 
                icon={<AimOutlined />} 
                onClick={handleCenterMap}
              />
            </Tooltip>
          )}
        </div>
        
        {/* Show detected address */}
        {addressDetails && editMode && (
          <div className="crm-location-address-section">
            <Text strong className="crm-location-address-title">
              ✅ Detected Address (will auto-fill on save):
            </Text>
            <div className="crm-location-address-text">
              {addressDetails.address_line1 && (
                <div>📍 <strong>Address:</strong> {addressDetails.address_line1}</div>
              )}
              {addressDetails.city && (
                <div>🏙️ <strong>City:</strong> {addressDetails.city}</div>
              )}
              {addressDetails.state && (
                <div>🗺️ <strong>State/Province:</strong> {addressDetails.state}</div>
              )}
              {addressDetails.country && (
                <div>🌍 <strong>Country:</strong> {addressDetails.country}</div>
              )}
              {addressDetails.postal_code && (
                <div>📮 <strong>Postal Code:</strong> {addressDetails.postal_code}</div>
              )}
              {addressDetails.territory && (
                <div>🎯 <strong>Territory:</strong> <span className="crm-location-territory">{addressDetails.territory}</span></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLocationPicker;
