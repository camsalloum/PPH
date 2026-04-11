import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilter } from '../../contexts/FilterContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePLData } from '../../contexts/PLDataContext';
import MultiChartHTMLExport from './MultiChartHTMLExport';
import './ColumnConfigGrid.css'; // Reuse styles

const ActivePeriodsDisplay = ({ productGroupTableRef }) => {
  const { 
    columnOrder, 
    generateData, 
    dataGenerated,
    selectedDivision
  } = useFilter();
  
  const { user } = useAuth();
  const { refreshPLData } = usePLData();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Check if user is a sales rep (has dashboard:sales:view but not dashboard:divisional:view)
  const { hasPermission } = useAuth();
  const isSalesRepOnly = hasPermission('dashboard:sales:view', selectedDivision) && 
                         !hasPermission('dashboard:divisional:view', selectedDivision) && 
                         !isAdmin;

  // Auto-generate report when columns are available and not yet generated
  useEffect(() => {
    if (columnOrder.length > 0 && !dataGenerated) {
      generateData();
    }
  }, [columnOrder, dataGenerated, generateData]);

  // Handle P&L data refresh - uses PLDataContext for consistency
  const handleRefreshPL = async () => {
    if (!selectedDivision) {
      setRefreshMessage({ type: 'error', text: 'No division selected' });
      return;
    }
    
    setRefreshing(true);
    setRefreshMessage(null);
    
    try {
      const result = await refreshPLData(selectedDivision);
      setRefreshMessage({ 
        type: 'success', 
        text: `P&L refreshed: ${result.recordsCount} records` 
      });
    } catch (err) {
      setRefreshMessage({ type: 'error', text: err.message });
    } finally {
      setRefreshing(false);
      // Clear message after 5 seconds
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  return (
    <>
      {/* Top Bar with Configure Button (Left) and Export Buttons (Right) */}
      <div className="dashboard-actions-bar">
        {/* Left side buttons */}
        <div className="dashboard-actions-left">
          {/* Configure Button - Hidden for sales reps */}
          {!isSalesRepOnly && (
            <button 
              onClick={() => navigate('/settings', { state: { activeTab: 'periods' } })} 
              className="export-btn html-export"
              title="Configure Periods"
            >
              <span className="btn-icon">⚙️</span>
              <span className="btn-label">Configure Periods</span>
            </button>
          )}
          
          {/* Refresh P&L Button - Admin Only */}
          {isAdmin && (
            <button 
              onClick={handleRefreshPL}
              disabled={refreshing}
              className="export-btn html-export"
              title="Refresh P&L data from Excel"
              style={{ 
                backgroundColor: refreshing ? '#6c757d' : '#28a745',
                opacity: refreshing ? 0.7 : 1
              }}
            >
              <span className="btn-icon">🔄</span>
              <span className="btn-label">{refreshing ? 'Refreshing...' : 'Refresh P&L'}</span>
            </button>
          )}
          
          {/* Refresh Status Message */}
          {refreshMessage && (
            <span className={`refresh-message ${refreshMessage.type}`}>
              {refreshMessage.text}
            </span>
          )}
        </div>
        
        {/* Export Buttons - Top Right - Hidden for sales reps */}
        {dataGenerated && !isSalesRepOnly && (
          <div className="dashboard-actions-right">
            <MultiChartHTMLExport />
          </div>
        )}
      </div>
    </>
  );
};

export default ActivePeriodsDisplay;
