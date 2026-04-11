import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useSalesData } from '../../contexts/SalesDataContext';
import { useFilter } from '../../contexts/FilterContext';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../common/Header';
import ActivePeriodsDisplay from './ActivePeriodsDisplay';
import WriteUpViewV2 from '../writeup/WriteUpViewV2';
import ComprehensiveReportView from '../writeup/ComprehensiveReportView';
import SalesBySaleRepTable from './SalesBySaleRepTable';
import DivisionalDashboardLanding from './DivisionalDashboardLanding';
import AILearningDashboard from './AILearningDashboard';
import AEBFTab from '../MasterData/AEBF/AEBFTab';
import './Dashboard.css';

// Home dashboard cards configuration with required permissions
const HOME_CARDS = [
  {
    id: 'divisional',
    icon: '📊',
    title: 'Divisional Dashboard',
    description: 'Key performance indicators, charts, and detailed analysis by division',
    requiredPermission: 'dashboard:divisional:view'
  },
  {
    id: 'sales',
    icon: '👥',
    title: 'Sales Dashboard',
    description: 'KPIs & Performance Metrics',
    requiredPermission: 'dashboard:sales:view'
  },

  {
    id: 'ai',
    icon: '🤖',
    title: 'AI',
    description: 'AI Intelligence Report, AI Learning Dashboard, and Write-Up in one place',
    requiredPermissionsAny: ['dashboard:divisional:view', 'dashboard:writeup:view']
  },
  {
    id: 'aebf',
    icon: '🧾',
    title: 'AEBF Management',
    description: 'Actual, estimate, budget, and forecast data management',
    requiredPermission: 'dashboard:divisional:view'
  }
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { selectedDivision } = useExcelData();
  const { loadSalesData, loading: salesLoading, error: salesError } = useSalesData();
  const { dataGenerated } = useFilter();
  const { hasPermission, user } = useAuth();
  const productGroupTableRef = useRef(null);
  const [activeView, setActiveView] = useState(null);
  const [aiSubView, setAiSubView] = useState(null);
  const [divisionalCardActive, setDivisionalCardActive] = useState(false);

  const canViewAiReport = hasPermission('dashboard:divisional:view', selectedDivision);
  const canViewAiLearning = hasPermission('dashboard:divisional:view', selectedDivision);
  const canViewWriteup = hasPermission('dashboard:writeup:view', selectedDivision);

  const defaultAiSubView = useMemo(() => {
    if (canViewAiReport) return 'ai-report';
    if (canViewAiLearning) return 'ai-learning';
    if (canViewWriteup) return 'writeup';
    return null;
  }, [canViewAiReport, canViewAiLearning, canViewWriteup]);
  
  // Filter cards based on user permissions
  const visibleCards = useMemo(() => {
    return HOME_CARDS.filter(card => {
      if (Array.isArray(card.requiredPermissionsAny) && card.requiredPermissionsAny.length > 0) {
        return card.requiredPermissionsAny.some(permission => hasPermission(permission, selectedDivision));
      }
      return hasPermission(card.requiredPermission, selectedDivision);
    });
  }, [hasPermission, selectedDivision]);
  
  // Handle divisional dashboard card selection
  const handleDivisionalCardSelect = useCallback((cardId) => {
    setDivisionalCardActive(cardId !== null);
  }, []);
  
  // Handle home card click
  const handleCardClick = (cardId) => {
    const card = HOME_CARDS.find(c => c.id === cardId);
    // If card has external route, navigate to it
    if (card?.route) {
      navigate(card.route);
      return;
    }
    if (cardId === 'ai') {
      setAiSubView(defaultAiSubView);
    }
    setActiveView(cardId);
  };
  
  // Handle back to home
  const handleBackToHome = () => {
    setActiveView(null);
    setAiSubView(null);
    setDivisionalCardActive(false);
  };

  useEffect(() => {
    if (activeView !== 'ai') return;
    if (!aiSubView && defaultAiSubView) {
      setAiSubView(defaultAiSubView);
    }
  }, [activeView, aiSubView, defaultAiSubView]);
  
  // Use useCallback to memoize the function to prevent it from changing on every render
  const loadData = useCallback(() => {
    // Excel data is now auto-loaded by ExcelDataContext when division changes
    // Just load Sales data here
    loadSalesData()
      .catch(err => {
        console.error('Error loading sales data:', err);
      });
  }, [loadSalesData]);
  
  // Only run this effect once when the component mounts
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  if (salesLoading) {
    return <div className="loading">Loading data...</div>;
  }
  
  if (salesError) {
    return <div className="error">Error: {salesError}</div>;
  }
  
  // Render the active view content
  const renderActiveView = () => {
    switch (activeView) {
      case 'divisional':
        return dataGenerated ? (
          <DivisionalDashboardLanding onCardSelect={handleDivisionalCardSelect} />
        ) : (
          <div className="empty-charts-container">
            <p>Please select columns and click the Generate button to view the divisional dashboard.</p>
          </div>
        );
      case 'sales':
        return <SalesBySaleRepTable />;
      case 'ai': {
        const aiTabs = [
          { id: 'ai-report', label: 'AI Intelligence Report', enabled: canViewAiReport },
          { id: 'ai-learning', label: 'AI Learning Dashboard', enabled: canViewAiLearning },
          { id: 'writeup', label: 'Write-Up', enabled: canViewWriteup }
        ].filter(tab => tab.enabled);

        if (!aiTabs.length) {
          return (
            <div className="empty-writeup-container">
              <p>You do not have permission to access AI views.</p>
            </div>
          );
        }

        return (
          <div className="dashboard-ai-view">
            <div className="dashboard-ai-switcher">
              {aiTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`dashboard-ai-switcher-btn${aiSubView === tab.id ? ' active' : ''}`}
                  onClick={() => setAiSubView(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="dashboard-ai-content">
              {aiSubView === 'ai-report' && <ComprehensiveReportView />}
              {aiSubView === 'ai-learning' && <AILearningDashboard />}
              {aiSubView === 'writeup' && (
                dataGenerated ? (
                  <WriteUpViewV2 />
                ) : (
                  <div className="empty-writeup-container">
                    <p>Please select columns and click the Generate button to access the AI writeup assistant.</p>
                  </div>
                )
              )}
            </div>
          </div>
        );
      }
      case 'aebf':
        return <AEBFTab />;
      default:
        return null;
    }
  };
  
  // Get current view title
  const getActiveViewTitle = () => {
    const card = HOME_CARDS.find(c => c.id === activeView);
    return card ? card.title : '';
  };
  
  return (
    <div className="dashboard-container">
      <Header />
      
      <div className="dashboard-main-content">
        {selectedDivision && (
          <div className="dashboard-content">
          
          {/* Active Periods Display (Configuration moved to Settings) */}
          <ActivePeriodsDisplay productGroupTableRef={productGroupTableRef} />
          
          {activeView ? (
            // Active view with floating back button
            <div className="dashboard-active-view">
              {/* Floating Back Button */}
              <button 
                className="dashboard-floating-back-btn"
                onClick={handleBackToHome}
              >
                ← Back to Home Dashboard
              </button>
              
              {/* View Content */}
              <div className="dashboard-view-content">
                {renderActiveView()}
              </div>
            </div>
          ) : (
            // Home view with cards
            <div className="dashboard-home">
              <button 
                className="dashboard-back-to-modules"
                onClick={() => navigate('/modules')}
              >
                ← Back to Modules
              </button>
              <h2 className="dashboard-home-title">Welcome, {user?.first_name || user?.name?.split(' ')[0] || 'User'}</h2>
              
              <div className="dashboard-home-cards">
                {visibleCards.map((card) => (
                  <div
                    key={card.id}
                    className="dashboard-home-card"
                    onClick={() => handleCardClick(card.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(card.id);
                      }
                    }}
                  >
                    <span className="dashboard-home-card-icon">{card.icon}</span>
                    <h3 className="dashboard-home-card-title">{card.title}</h3>
                    <p className="dashboard-home-card-description">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
        </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;