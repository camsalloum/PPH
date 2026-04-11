import React, { useState } from 'react';
import SalesCountryLeafletMap from './SalesCountryLeafletMap';
import RealWorld2DMap from './RealWorld2DMap';
import './MapSwitcher.css';

const MapSwitcher = () => {
  const [viewMode, setViewMode] = useState('2D');

  return (
    <div>
      <div className="map-toggle-buttons">
        <button onClick={() => setViewMode('2D')} className={viewMode === '2D' ? 'active' : ''}>2D Map</button>
        <button onClick={() => setViewMode('2DREAL')} className={viewMode === '2DREAL' ? 'active' : ''}>2D Real</button>
      </div>
      {viewMode === '2D' && <SalesCountryLeafletMap />}
      {viewMode === '2DREAL' && <RealWorld2DMap />}
    </div>
  );
};

export default MapSwitcher;
