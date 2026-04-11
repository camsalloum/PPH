import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Table2, BarChart3, Map, ArrowLeft } from 'lucide-react';
import SalesByCountryTable from './SalesByCountryTable';
import SalesCountryChart from './SalesCountryChart';
import SalesCountryLeafletMap from './SalesCountryLeafletMap';
import { useFilter } from '../../contexts/FilterContext';
import { getColumnColorPalette } from './utils/colorUtils';
import './TableDetailStyles.css';

/**
 * SalesCountryDetail Component
 * ----------------------------
 * Displays 3 sub-cards for Sales by Countries:
 * 1. Table - Detailed data table
 * 2. Chart - Bar chart visualization
 * 3. Map 2D - Geographic map view
 */

const SUB_CARDS = [
  {
    id: 'table',
    icon: Table2,
    title: 'Table',
    description: 'Detailed country sales data in tabular format',
    color: '#1976d2'
  },
  {
    id: 'chart',
    icon: BarChart3,
    title: 'Chart',
    description: 'Visual bar chart of sales by country',
    color: '#388e3c'
  },
  {
    id: 'map',
    icon: Map,
    title: 'Map 2D',
    description: 'Geographic map showing sales distribution',
    color: '#7b1fa2'
  }
];

const SalesCountryDetail = () => {
  const [activeView, setActiveView] = useState(null);
  const [mapPeriodIndex, setMapPeriodIndex] = useState(0);
  const { columnOrder, basePeriodIndex } = useFilter();

  // Initialize map period to base period
  React.useEffect(() => {
    if (basePeriodIndex !== null && basePeriodIndex !== undefined) {
      setMapPeriodIndex(basePeriodIndex);
    }
  }, [basePeriodIndex]);
  
  // Expose setActiveView globally for HTML export to programmatically switch views
  React.useEffect(() => {
    window.__salesCountrySetActiveView = setActiveView;
    return () => {
      delete window.__salesCountrySetActiveView;
    };
  }, []);

  const handleCardClick = (cardId) => {
    setActiveView(cardId);
  };

  const handleBackClick = () => {
    setActiveView(null);
  };

  // Render the selected view
  const renderActiveView = () => {
    switch (activeView) {
      case 'table':
        return <SalesByCountryTable hideHeader={true} />;
      case 'chart':
        return <SalesCountryChart hideHeader={true} />;
      case 'map':
        return (
          <div key="map-wrapper" style={{ width: '100%', minHeight: '600px' }}>
            <SalesCountryLeafletMap 
              externalPeriodIndex={mapPeriodIndex}
              onPeriodChange={setMapPeriodIndex}
              hidePeriodSelector={true}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // Get period color using the same logic as charts
  const getPeriodColor = (column) => {
    const palette = getColumnColorPalette(column);
    return palette.primary;
  };

  // Render period selector for map view
  const renderMapPeriodSelector = () => {
    if (activeView !== 'map' || columnOrder.length === 0) return null;
    
    return (
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {columnOrder.map((column, index) => {
          const palette = getColumnColorPalette(column);
          const isSelected = mapPeriodIndex === index;
          
          return (
            <button
              key={index}
              onClick={() => setMapPeriodIndex(index)}
              style={{
                padding: '8px 12px',
                border: isSelected ? `2px solid ${palette.gradientTo}` : '1px solid #ddd',
                background: isSelected ? palette.gradient : '#fff',
                color: isSelected ? palette.text : '#333',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? `0 2px 8px ${palette.gradientTo}40` : 'none'
              }}
            >
              {column.year} {column.month} {column.type}
            </button>
          );
        })}
      </div>
    );
  };

  // Check if current view needs scrolling (only table needs it)
  const needsScroll = activeView === 'table';

  return (
    <div className="table-detail table-detail--subcards">
      <AnimatePresence mode="wait">
        {activeView ? (
          // Active view with back button
          <motion.div
            key="active-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="sales-country-active-view"
          >
            <div className="sales-country-header-row">
              <button 
                className="sales-country-back-btn"
                onClick={handleBackClick}
              >
                <ArrowLeft size={18} />
                <span>Back to Main View</span>
              </button>
              {renderMapPeriodSelector()}
            </div>
            <div className={needsScroll ? "table-detail__wrapper" : "table-detail__wrapper table-detail__wrapper--no-scroll"}>
              {renderActiveView()}
            </div>
          </motion.div>
        ) : (
          // Sub-cards selection
          <motion.div
            key="card-selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="sales-country-subcards"
          >
            <p className="sales-country-subcards-intro">
              Choose how you want to view the Sales by Countries data:
            </p>
            <div className="sales-country-subcards-grid">
              {SUB_CARDS.map((card, index) => {
                const IconComponent = card.icon;
                return (
                  <motion.div
                    key={card.id}
                    className="sales-country-subcard"
                    onClick={() => handleCardClick(card.id)}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                    whileHover={{ 
                      scale: 1.03, 
                      boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                      y: -5
                    }}
                    whileTap={{ scale: 0.98 }}
                    style={{ '--card-accent': card.color }}
                  >
                    <div 
                      className="sales-country-subcard-icon"
                      style={{ backgroundColor: card.color }}
                    >
                      <IconComponent size={32} color="#ffffff" />
                    </div>
                    <h3 className="sales-country-subcard-title">{card.title}</h3>
                    <p className="sales-country-subcard-description">{card.description}</p>
                    <div 
                      className="sales-country-subcard-accent"
                      style={{ backgroundColor: card.color }}
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .table-detail--subcards {
          min-height: 500px;
          display: flex;
          flex-direction: column;
        }

        .sales-country-subcards {
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .sales-country-subcards-intro {
          font-size: 18px;
          color: #555;
          margin-bottom: 40px;
          text-align: center;
        }

        .sales-country-subcards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 30px;
          max-width: 900px;
          width: 100%;
        }

        .sales-country-subcard {
          background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
          border-radius: 16px;
          padding: 30px 24px;
          text-align: center;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          border: 1px solid #e0e0e0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          transition: all 0.3s ease;
        }

        .sales-country-subcard:hover {
          border-color: var(--card-accent, #1976d2);
        }

        .sales-country-subcard-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        .sales-country-subcard-title {
          font-size: 20px;
          font-weight: 700;
          color: #2c3e50;
          margin: 0 0 12px 0;
        }

        .sales-country-subcard-description {
          font-size: 14px;
          color: #7f8c8d;
          line-height: 1.5;
          margin: 0;
        }

        .sales-country-subcard-accent {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 4px;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .sales-country-subcard:hover .sales-country-subcard-accent {
          opacity: 1;
        }

        .sales-country-active-view {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .sales-country-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 20px;
          flex-wrap: wrap;
        }

        .sales-country-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin: 0;
          width: fit-content;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          flex-shrink: 0;
        }

        .sales-country-back-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
        }

        .sales-country-back-btn:active {
          transform: translateY(0);
        }

        .table-detail__wrapper--no-scroll {
          overflow: visible !important;
          max-height: none !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        @media (max-width: 768px) {
          .sales-country-subcards-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .sales-country-subcard {
            padding: 24px 20px;
          }

          .sales-country-subcard-icon {
            width: 60px;
            height: 60px;
          }
        }
      `}</style>
    </div>
  );
};

export default SalesCountryDetail;
