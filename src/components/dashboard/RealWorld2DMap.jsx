import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import '../../styles/real-map.css';
import countryCoordinates from './countryCoordinates';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useFilter } from '../../contexts/FilterContext';

const earthImg = process.env.PUBLIC_URL + '/assets/8k_earth.jpg';

const IMAGE_WIDTH = 4096;
const IMAGE_HEIGHT = 2048;
const IMAGE_BOUNDS = [[-90, -180], [90, 180]];

// Removed unused MAJOR_COUNTRIES constant

const COUNTRY_ABBREVIATIONS = {
  'United States of America': 'US',
  'United Kingdom': 'UK',
  'United Arab Emirates': 'UAE',
  'Saudi Arabia': 'KSA',
  'South Korea': 'KOREA',
  'Russia': 'RUS',
  'Germany': 'GER',
  'France': 'FRA',
  'Japan': 'JPN',
  'China': 'CHN',
  'Canada': 'CAN',
  'Australia': 'AUS',
  'Brazil': 'BRA',
  'India': 'IND',
  'Turkey': 'TUR',
  'South Africa': 'RSA',
  'Mexico': 'MEX',
  'Spain': 'ESP',
  'Italy': 'ITA',
  'Egypt': 'EGY',
};

const LABEL_OFFSETS = {
  'UAE': 'right',
  'United Arab Emirates': 'right',
  'Qatar': 'below',
  'Bahrain': 'left',
  'Kuwait': 'above',
  'Oman': 'right',
  'Saudi Arabia': 'left',
  'KSA': 'left',
  'Egypt': 'below',
  'Iraq': 'above',
  'Jordan': 'right',
  'Syria': 'above',
  'Lebanon': 'left',
  'Israel': 'below',
  'Palestine': 'below',
  'Yemen': 'right',
  'Iran': 'left',
  'Turkey': 'above',
};

const COUNTRY_NAME_ALIASES = {
  'KSA': 'Saudi Arabia',
  'Kingdom of Saudi Arabia': 'Saudi Arabia',
  'Kingdom Of Saudi Arabia': 'Saudi Arabia',
  'KINGDOM OF SAUDI ARABIA': 'Saudi Arabia', // Add uppercase version
  'UNITED ARAB EMIRATES': 'United Arab Emirates', // Add uppercase version
  'UAE': 'United Arab Emirates',
  'Emirates': 'United Arab Emirates',
  'ALGERIA': 'Algeria', // Add uppercase version
  'IRAQ': 'Iraq', // Add uppercase version
  'KUWAIT': 'Kuwait', // Add uppercase version
  'UNITED STATES': 'United States of America', // Add uppercase version
  'UNITED STATES OF AMERICA': 'United States of America', // Add uppercase version
  'USA': 'United States of America',
  'US': 'United States of America',
  'BAHRAIN': 'Bahrain', // Add uppercase version
  'DJIBOUTI': 'Djibouti', // Add uppercase version
  'YEMEN': 'Yemen', // Add uppercase version
  'CONGO': 'Congo', // Add uppercase version
  'OMAN': 'Oman', // Add uppercase version
  'JORDAN': 'Jordan', // Add uppercase version
  'LEBANON': 'Lebanon', // Add uppercase version
  'MOROCCO': 'Morocco', // Add uppercase version
  'NIGER': 'Niger', // Add uppercase version
  'QATAR': 'Qatar', // Add uppercase version
  'SOMALIA': 'Somalia', // Add uppercase version
  'SUDAN': 'Sudan', // Add uppercase version
  'TUNISIA': 'Tunisia', // Add uppercase version
  'UGANDA': 'Uganda', // Add uppercase version
  'UNITED KINGDOM': 'United Kingdom', // Add uppercase version
  'UK': 'United Kingdom',
  'Britain': 'United Kingdom',
  'Great Britain': 'United Kingdom',
  'England': 'United Kingdom',
  'Korea': 'South Korea',
  'Republic of Korea': 'South Korea',
  'South Korea': 'South Korea',
  'North Korea': 'North Korea',
  'DRC': 'Democratic Republic of Congo',
  'Ivory Coast': 'Ivory Coast',
  'Cote D\'Ivoire': 'Ivory Coast',
  'Côte d\'Ivoire': 'Ivory Coast',
  'Czechia': 'Czech Republic',
  'Czech Republic': 'Czech Republic',
  'FYROM': 'North Macedonia',
  'Macedonia': 'North Macedonia',
  'North Macedonia': 'North Macedonia',
  'Burma': 'Myanmar',
  'Myanmar': 'Myanmar',
  'Cape Verde': 'Cabo Verde',
  'Cabo Verde': 'Cabo Verde',
  'Swaziland': 'Eswatini',
  'Eswatini': 'Eswatini',
  'Hong Kong': 'Hong Kong',
  'Macau': 'Macau',
  'Macao': 'Macau',
  'Taiwan': 'Taiwan',
  'Republic of China': 'Taiwan',
  'Palestine': 'Palestine',
  'Palestinian Territory': 'Palestine',
  'West Bank': 'Palestine',
  'Gaza': 'Palestine',
};

// Performance-optimized debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Collision detection utility
const detectCollisions = (labels) => {
  const collisions = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const label1 = labels[i];
      const label2 = labels[j];
      const distance = Math.sqrt(
        Math.pow(label1.x - label2.x, 2) + Math.pow(label1.y - label2.y, 2)
      );
      if (distance < 80) { // Minimum distance between labels
        collisions.push([i, j]);
      }
    }
  }
  return collisions;
};

function normalizeCountryName(name) {
  if (!name) return '';
  
  // First try exact match in aliases
  if (COUNTRY_NAME_ALIASES[name]) return COUNTRY_NAME_ALIASES[name];
  
  // Try case-insensitive match in aliases
  const lower = name.toLowerCase();
  for (const key in COUNTRY_NAME_ALIASES) {
    if (key.toLowerCase() === lower) return COUNTRY_NAME_ALIASES[key];
  }
  
  // Try partial match in aliases
  for (const key in COUNTRY_NAME_ALIASES) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return COUNTRY_NAME_ALIASES[key];
    }
  }
  
  // Try case-insensitive search in coordinates directly
  const found = Object.keys(countryCoordinates).find(key => 
    key.toLowerCase() === lower
  );
  if (found) return found;
  
  // Try partial match in coordinates
  const partialMatch = Object.keys(countryCoordinates).find(key => 
    key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return name;
}

// Removed unused getLabelTransform function

function getFlagEmoji(country) {
  const flags = {
    'United Arab Emirates': '🇦🇪', 'UAE': '🇦🇪',
    'Saudi Arabia': '🇸🇦', 'KSA': '🇸🇦',
    'Qatar': '🇶🇦', 'Kuwait': '🇰🇼', 'Bahrain': '🇧🇭', 'Oman': '🇴🇲',
    'Egypt': '🇪🇬', 'Jordan': '🇯🇴', 'Yemen': '🇾🇪', 'Sudan': '🇸🇩',
    'Ethiopia': '🇪🇹', 'Nigeria': '🇳🇬', 'Niger': '🇳🇪', 'Libya': '🇱🇾',
    'United States': '🇺🇸', 'USA': '🇺🇸', 'United States of America': '🇺🇸',
    'United Kingdom': '🇬🇧', 'UK': '🇬🇧',
    'France': '🇫🇷', 'Germany': '🇩🇪', 'Italy': '🇮🇹', 'Spain': '🇪🇸',
    'India': '🇮🇳', 'China': '🇨🇳', 'Russia': '🇷🇺', 'Turkey': '🇹🇷',
    'South Africa': '🇿🇦', 'Brazil': '🇧🇷', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
    'Japan': '🇯🇵', 'Singapore': '🇸🇬', 'Sri Lanka': '🇱🇰',
  };
  return flags[country] || '';
}

const RealWorld2DMap = () => {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [error, setError] = useState(null);
  const [countryData, setCountryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const { selectedDivision } = useExcelData();
  const { columnOrder, basePeriodIndex } = useFilter();
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);


  // Fetch countries from database
  const fetchCountries = useCallback(async () => {
    if (!selectedDivision) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/countries-db?division=${selectedDivision}`);
      const result = await response.json();
      
      if (result.success) {
        const countryNames = [...new Set(result.data.map(item => item.country))];
        setCountries(countryNames);
      } else {
        console.error(`❌ Failed to load countries for ${selectedDivision}:`, result.message);
        setCountries([]);
      }
    } catch (error) {
      console.error('Error loading countries:', error);
      setCountries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDivision]);

  // Fetch sales data from database for selected period
  const fetchSalesData = useCallback(async (periodColumn) => {
    if (!selectedDivision || !periodColumn) {
      return;
    }
    
    
    try {
      const response = await fetch('/api/sales-by-country-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          division: selectedDivision,
          year: periodColumn.year,
          months: [periodColumn.month],
          dataType: periodColumn.type
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Transform data to match expected format - use correct API field names
        const transformedData = result.data.map(item => ({
          country: item.country, // Corrected field name
          values: parseFloat(item.value || 0) // Corrected field name
        }));
        setCountryData(transformedData);
      } else {
        console.error('❌ Failed to load sales data:', result.message);
        setCountryData([]);
      }
    } catch (error) {
      console.error('❌ Error loading sales data:', error);
      setCountryData([]);
    }
  }, [selectedDivision]);

  // Load data when division changes
  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  // Set default selected period to base period when data loads
  useEffect(() => {
    if (columnOrder.length > 0 && basePeriodIndex !== null) {
      setSelectedPeriodIndex(basePeriodIndex);
    } else if (columnOrder.length > 0) {
      setSelectedPeriodIndex(0);
    }
  }, [columnOrder, basePeriodIndex]);

  // Fallback: Create default period if columnOrder is empty
  const defaultPeriods = [
    { year: 2024, month: 1, type: 'Actual', id: '2024-1-Actual' },
    { year: 2024, month: 2, type: 'Actual', id: '2024-2-Actual' },
    { year: 2024, month: 3, type: 'Actual', id: '2024-3-Actual' },
    { year: 2024, month: 4, type: 'Actual', id: '2024-4-Actual' },
    { year: 2024, month: 5, type: 'Actual', id: '2024-5-Actual' },
    { year: 2024, month: 6, type: 'Actual', id: '2024-6-Actual' }
  ];

  const periods = columnOrder.length > 0 ? columnOrder : defaultPeriods;

  // Fetch data for selected period only
  useEffect(() => {
    if (periods.length > 0 && selectedPeriodIndex < periods.length) {
      const selectedPeriod = periods[selectedPeriodIndex];
      fetchSalesData(selectedPeriod);
    } else {
    }
  }, [selectedPeriodIndex, periods, fetchSalesData]);

  // Memoized sales countries calculation
  const salesCountries = useMemo(() => {
    
    if (!countryData.length) {
      return [];
    }
    
    // Calculate total sales from database data
    const totalSales = countryData.reduce((sum, item) => sum + (item.values || 0), 0);
    
    // Calculate percentages and filter countries with >= 0.1%
    const result = countryData
      .map(item => {
        const percentage = totalSales > 0 ? (item.values / totalSales) * 100 : 0;
        return {
          name: item.country,
          percentage: percentage
        };
      })
      .filter(item => item.percentage >= 0.1);
    
    
    const sum = result.reduce((s, item) => s + item.percentage, 0);
    if (sum < 99.95) {
      result.push({ name: 'Other', percentage: 100 - sum, coords: [0, 0] });
    }
    // --- Export for HTML export ---
    try {
      window.__IPDASH_2D_COUNTRY_DATA__ = result
        .map(c => {
          if (!c.name || typeof c.name !== 'string') {
            console.warn('Skipping entry with invalid name:', c);
            return null;
          }
          const normName = normalizeCountryName(c.name);
          const coords = countryCoordinates[normName] || countryCoordinates[c.name] || null;
          if (!coords) {
            console.warn('No coordinates found for country:', c.name, '(normalized:', normName, ')');
            return null;
          }
          return { name: c.name, percentage: +c.percentage.toFixed(2), coords };
        })
        .filter(Boolean);
    } catch (e) { /* ignore */ }
    return result.sort((a, b) => b.percentage - a.percentage);
  }, [countryData, selectedDivision]);

  // Removed unused salesCountryNames

  // Removed unused getPinColor and getPinSize functions

  // Removed unused debouncedZoomHandler

  // Removed unused handlePinClick function

  // Initialize map only once when component mounts
  useEffect(() => {
    if (mapInstance) {
      return; // Map already initialized
    }

    let map;
    let isInitialized = false;
    
    const initializeMap = () => {
      if (isInitialized) return;
      isInitialized = true;
      
      try {
        const mapContainer = mapContainerRef.current;
        if (!mapContainer) {
          console.warn('Map container not available');
          setError('Map container not found. Please refresh the page.');
          return;
        }
        
        
        // Clean up existing map more thoroughly
        if (mapContainer._leaflet_id) {
          try {
            const existingMap = mapContainer._leaflet_id;
            if (existingMap && typeof existingMap.remove === 'function') {
              existingMap.remove();
            }
          } catch (e) {
            console.warn('Error removing existing map:', e);
          }
          mapContainer._leaflet_id = null;
        }
        
        // Clear container completely and reset Leaflet state
        mapContainer.innerHTML = '';
        
        // Remove any Leaflet-specific properties
        delete mapContainer._leaflet_id;
        delete mapContainer._leaflet_pos;
        delete mapContainer._leaflet;
        
        // Wait for DOM to be ready
        setTimeout(() => {
          try {
            
            // Check if Leaflet is available
            if (typeof L === 'undefined') {
              throw new Error('Leaflet library not loaded');
            }
            
            // Double-check container is clean
            if (mapContainer._leaflet_id) {
              console.warn('Container still has Leaflet ID, aborting initialization');
              return;
            }
            
            // Initialize map with enhanced options
            map = L.map(mapContainer, {
              crs: L.CRS.EPSG4326,
              minZoom: 0,
              maxZoom: 6,
              zoomSnap: 0.1,
              scrollWheelZoom: {
                debounceTime: 300,
                wheelPxPerZoomLevel: 1200,
                wheelDebounceTime: 150
              },
              maxBounds: IMAGE_BOUNDS,
              maxBoundsViscosity: 1.0,
              worldCopyJump: false,
              attributionControl: false,
              zoomControl: true,
              dragging: true,
              doubleClickZoom: true,
              boxZoom: true,
              keyboard: true,
              inertia: true,
              inertiaDeceleration: 3000,
              inertiaMaxSpeed: 3000,
              easeLinearity: 0.25,
              zoomAnimation: true,
              fadeAnimation: true,
              markerZoomAnimation: true,
              transform3DLimit: 8388608,
              tap: true,
              tapTolerance: 15,
              trackResize: true,
              preferCanvas: false
            });

            mapRef.current = map;
            setMapInstance(map);
            
            // Zoom to UAE (Local Market) instead of fitting all bounds
            const uaeCoordinates = [23.86863, 54.20671]; // [lat, lng] for UAE
            map.setView(uaeCoordinates, 4); // Zoom level 4 to focus on UAE region
            
            // Wait for map to be ready before invalidating size
            setTimeout(() => {
              try {
                map.invalidateSize();
              } catch (e) {
                console.warn('Error invalidating map size:', e);
              }
            }, 100);

            // Enhanced tile layer with fallback
            let deepZoomLayer;
            if (L.tileLayer.deepZoom) {
              try {
                deepZoomLayer = L.tileLayer.deepZoom('/earth_tiles/{z}/{x}_{y}.jpg', {
                  width: IMAGE_WIDTH,
                  height: IMAGE_HEIGHT,
                  maxZoom: 6,
                  noWrap: true,
                  bounds: IMAGE_BOUNDS,
                }).addTo(map);
              } catch (e) {
                console.warn('Deep zoom not available, using image overlay:', e);
              }
            }
            if (!deepZoomLayer) {
              try {
                const imageOverlay = L.imageOverlay(earthImg, IMAGE_BOUNDS, { 
                  interactive: false,
                  opacity: 0.95
                }).addTo(map);
                
                // Add error handling for image loading
                imageOverlay.on('error', (e) => {
                  console.error('❌ Error loading earth image:', e);
                  // Fallback to a simple tile layer
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 6
                  }).addTo(map);
                });
              } catch (e) {
                console.error('❌ Error creating image overlay:', e);
                // Fallback to a simple tile layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '© OpenStreetMap contributors',
                  maxZoom: 6
                }).addTo(map);
              }
            }
            
          } catch (err) {
            console.error('❌ Error initializing Leaflet map:', err);
            setError(`Map initialization failed: ${err.message}. Please check console for details.`);
            isInitialized = false; // Reset flag on error
          }
        }, 100);
      } catch (err) {
        console.error('❌ Error in map initialization:', err);
        setError(`Map error: ${err.message}. Please try refreshing the page.`);
        isInitialized = false; // Reset flag on error
      }
    };
    
    // Initialize map
    initializeMap();

    // Cleanup function to remove map when component unmounts
    return () => {
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.warn('Error removing map:', e);
        }
        setMapInstance(null);
        mapRef.current = null;
      }
    };
  }, []); // Empty dependency array - run only once on mount

  // Update markers when salesCountries data changes (preserves zoom/position)
  useEffect(() => {
    if (!mapInstance || !salesCountries.length) return;

    try {
      // Clear existing markers (but keep tile layers)
      mapInstance.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          mapInstance.removeLayer(layer);
        }
      });

      // Create sales country pins with enhanced features
      salesCountries.forEach(({ name, percentage, coords }) => {
        if (percentage < 0.05) return; // Skip countries with <0.05% sales
        const normName = normalizeCountryName(name);
        const c = coords || countryCoordinates[normName] || countryCoordinates[name] || null;
        if (!c) {
          return;
        }
        const value = percentage < 0.1 ? percentage.toFixed(2) : percentage.toFixed(1);

        // --- REMOVED: Do not render pin SVG or pinMarker ---
        // --- ONLY render the label above the location ---
        const labelText = `${normName}\n${value}%`;
        const labelMarker = L.marker([c[1], c[0]], {
          icon: L.divIcon({
            className: 'real-map-country-label real-map-sales-label globe-style-label',
            html: `<span class="globe-label-text">${labelText.replace(/\n/g, '<br/>')}</span>`
          }),
          interactive: false,
          zIndexOffset: 1000
        }).setLatLng([c[1], c[0]]);
        
        labelMarker.on('add', function() {
          const el = labelMarker.getElement();
          if (el) {
            el.style.transform += ' translateY(-60px)';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
              el.style.transition = 'opacity 0.5s ease-in-out';
              el.style.opacity = '1';
            });
          }
        });
        
        try {
          labelMarker.addTo(mapInstance);
        } catch (e) {
          console.warn('Error adding marker:', e);
        }
      });
    } catch (error) {
      console.error('Error updating markers:', error);
    }
  }, [salesCountries, mapInstance]);

  if (error) {
    return (
      <div className="real-map-error">
        <h3>Map Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="real-map-container">
      <div ref={mapContainerRef} className="real-map-viewport" />
      
      {/* All panels removed - clean map only */}
      
      {/* Period Selection - Floating over map */}
      {periods.length > 0 && (
        <div className="period-selector" style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(0,0,0,0.1)',
          zIndex: 1000
        }}>
          {periods.map((column, index) => (
            <button
              key={index}
              onClick={() => setSelectedPeriodIndex(index)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                background: selectedPeriodIndex === index ? '#1976d2' : '#fff',
                color: selectedPeriodIndex === index ? 'white' : '#333',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                minWidth: '80px'
              }}
              onMouseEnter={(e) => {
                if (selectedPeriodIndex !== index) {
                  e.target.style.background = '#f5f5f5';
                  e.target.style.borderColor = '#bbb';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPeriodIndex !== index) {
                  e.target.style.background = '#fff';
                  e.target.style.borderColor = '#ddd';
                }
              }}
            >
              {column.year} {column.month === 1 ? 'Jan' : 
                column.month === 2 ? 'Feb' :
                column.month === 3 ? 'Mar' :
                column.month === 4 ? 'Apr' :
                column.month === 5 ? 'May' :
                column.month === 6 ? 'Jun' :
                column.month === 7 ? 'Jul' :
                column.month === 8 ? 'Aug' :
                column.month === 9 ? 'Sep' :
                column.month === 10 ? 'Oct' :
                column.month === 11 ? 'Nov' : 'Dec'} {column.type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RealWorld2DMap; 