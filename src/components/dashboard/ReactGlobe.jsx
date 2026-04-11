import React, { useRef, useEffect, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';
import countryCoordinates from './countryCoordinates';
import { getRegionForCountry } from '../../services/regionService';

const ReactGlobe = () => {
  const globeRef = useRef();
  const [countriesData, setCountriesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Test data for now - replace with real API call later
  const testCountries = [
    { name: 'United Arab Emirates', percentage: 55.84, sales: 29047664.6 },
    { name: 'Algeria', percentage: 20.10, sales: 10455584.76 },
    { name: 'Iraq', percentage: 5.93, sales: 3085382.07 },
    { name: 'Morocco', percentage: 4.29, sales: 2231286.02 },
    { name: 'Kingdom of Saudi Arabia', percentage: 4.10, sales: 2130728.87 },
    { name: 'Kuwait', percentage: 2.08, sales: 1081280.02 },
    { name: 'Oman', percentage: 3.49, sales: 1813691.1 },
    { name: 'Somalia', percentage: 1.16, sales: 605497.55 },
    { name: 'Lebanon', percentage: 0.66, sales: 342060.94 },
    { name: 'Yemen', percentage: 0.63, sales: 325904.67 },
    { name: 'Bahrain', percentage: 0.91, sales: 474452.06 },
    { name: 'Jordan', percentage: 0.21, sales: 111072.12 },
    { name: 'Qatar', percentage: 0.18, sales: 94640 },
    { name: 'United States', percentage: 0.25, sales: 131310.72 },
    { name: 'United Kingdom', percentage: 0.07, sales: 34570.22 },
    { name: 'Uganda', percentage: 0.02, sales: 12356.28 },
    { name: 'Niger', percentage: 0.08, sales: 41121.5 }
  ];

  // Helper to determine if a country is the local market (UAE)
  const isLocalMarket = useCallback((countryName) => {
    if (!countryName) return false;
    const region = getRegionForCountry(countryName);
    return region === 'UAE';
  }, []);

  // Enhanced country coordinate lookup
  const getCountryCoordinates = useCallback((name) => {
    if (!name) return null;
    const key = String(name).trim().toLowerCase();
    const entry = countryCoordinates[key];
    if (entry) {
      return entry;
    }

    // Try common variations
    const nameMap = {
      'uae': 'United Arab Emirates',
      'ksa': 'Saudi Arabia',
      'kingdom of saudi arabia': 'Saudi Arabia',
      'usa': 'United States of America',
      'uk': 'United Kingdom'
    };
    const mappedName = nameMap[key];
    if (mappedName && countryCoordinates[mappedName.toLowerCase()]) {
      return countryCoordinates[mappedName.toLowerCase()];
    }

    // Try case-insensitive search
    const found = Object.keys(countryCoordinates).find(c => c.toLowerCase() === key);
    if (found) return countryCoordinates[found];

    // Try partial match
    const partialMatch = Object.keys(countryCoordinates).find(c =>
      c.toLowerCase().includes(key) || key.includes(c.toLowerCase())
    );
    if (partialMatch) return countryCoordinates[partialMatch];

    console.warn(`Coordinates not found for country: ${name}`);
    return null;
  }, []);

  // Determine marker color based on percentage and local market status
  const getMarkerColor = useCallback((percentage, countryName) => {
    if (isLocalMarket(countryName)) {
      return '#00ff00'; // Lime for local market
    } else if (percentage >= 10) {
      return '#ff0000'; // Red for high export
    } else if (percentage >= 5) {
      return '#ffa500'; // Orange for medium export
    } else if (percentage >= 2) {
      return '#ffff00'; // Yellow for low-medium export
    } else {
      return '#00ffff'; // Cyan for very low export
    }
  }, [isLocalMarket]);

  // Process countries data for the globe
  useEffect(() => {
    
    const processedData = testCountries.map(country => {
      const coordinates = getCountryCoordinates(country.name);
      if (!coordinates) {
        console.warn(`Skipping ${country.name}: no coordinates found`);
        return null;
      }

      const [longitude, latitude] = coordinates;
      const color = getMarkerColor(country.percentage, country.name);

      return {
        lat: latitude,
        lng: longitude,
        size: Math.max(0.5, Math.min(2.0, country.percentage / 20)), // Scale marker size
        color: color,
        country: country.name,
        percentage: country.percentage,
        sales: country.sales,
        isLocal: isLocalMarket(country.name)
      };
    }).filter(Boolean);

    setCountriesData(processedData);
    setIsLoading(false);
  }, [getCountryCoordinates, getMarkerColor, isLocalMarket]);

  // Handle globe click
  const handleGlobeClick = useCallback((event) => {
  }, []);

  // Handle marker click
  const handleMarkerClick = useCallback((marker) => {
    alert(`${marker.country}\nSales: $${marker.sales.toLocaleString()}\nPercentage: ${marker.percentage.toFixed(2)}%\nType: ${marker.isLocal ? 'Local Market' : 'Export Market'}`);
  }, []);

  if (isLoading) {
    return (
      <div className="sales-country-map">
        <div className="map-loading">
          <p>Loading React Globe...</p>
        </div>
      </div>
    );
  }

  // Fallback if no data
  if (!countriesData || countriesData.length === 0) {
    return (
      <div className="sales-country-map">
        <div className="map-loading">
          <p>No data available for the globe</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-country-map">
      <div className="map-header">
        <h3>Sales by Country - 3D Globe View (React Globe)</h3>
        <div className="legend">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#00ff00' }}></span>
            <span>UAE (Local)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ff0000' }}></span>
            <span>High Export (≥10%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ffa500' }}></span>
            <span>Medium Export (5-10%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ffff00' }}></span>
            <span>Low-Medium Export (2-5%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#00ffff' }}></span>
            <span>Low Export (&lt;2%)</span>
          </div>
        </div>
      </div>
      
      <div style={{ width: '100%', height: '80vh', minHeight: '600px', backgroundColor: '#000' }}>
        <Globe
          ref={globeRef}
          width={800}
          height={600}
          backgroundColor="rgba(0,0,0,1)"
          globeImageUrl="/assets/8k_earth.jpg"
          backgroundImageUrl="/assets/starfield_4k.jpg"
          pointsData={countriesData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="size"
          pointResolution={8}
          pointAltitude={0.01}
          onPointClick={handleMarkerClick}
          onClick={handleGlobeClick}
          enablePointerInteraction={true}
          animateIn={true}
          showAtmosphere={true}
          atmosphereColor="#4a90e2"
          atmosphereAltitude={0.15}
          onGlobeReady={() => {}}
          onGlobeError={(error) => console.error('Globe error:', error)}
        />
      </div>
    </div>
  );
};

export default ReactGlobe;
