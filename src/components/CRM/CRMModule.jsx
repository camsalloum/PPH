/**
 * CRM Module - Main Container
 * Horizontal tab navigation (NO left sidebar)
 * Admin/Management: Global view with all customers
 * Sales Rep: Personal view with only their customers
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Badge, Segmented, Tabs, Typography, Button, Spin } from 'antd';
import {
  BarChartOutlined,
  FileTextOutlined,
  GlobalOutlined,
  TeamOutlined,
  AppstoreOutlined,
  UserAddOutlined,
  RadarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  PieChartOutlined,
  CalendarOutlined,
  LineChartOutlined,
  FunnelPlotOutlined,
  EnvironmentOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import AdminCRMDashboard from './AdminCRMDashboard';
import MyDayDashboard from './MyDayDashboard';
import CRMHomePage from './CRMHomePage';
import CRMWorklist from './CRMWorklist';
import CRMReports from './CRMReports';
import CustomerDetail from './CustomerDetail';
import CustomerMapView from './CustomerMapView';
import MyCustomers from './MyCustomers';
import MyProspects from './MyProspects';
import ProspectManagement from './ProspectManagement';
import CustomerList from './CustomerList';
import ProductGroupList from './ProductGroupList';
import CRMBudgetView from './CRMBudgetView';
import CRMSalesReport from './CRMSalesReport';
import PresalesInquiries from '../MES/PreSales';
import SalesRepList from './SalesRepList';
import CRMAnalytics from './CRMAnalytics';
import FullPipelineDashboard from './FullPipelineDashboard';
import SalesRepManagement from '../MasterData/SalesRep/SalesRepManagement';
import FieldVisitList from './FieldVisitList';
import FieldVisitPlanner from './FieldVisitPlanner';
import FieldVisitDetail from './FieldVisitDetail';
import FieldVisitRouteView from './FieldVisitRouteView';
import LostBusiness from './LostBusiness';
import CRMDashboard from './CRMDashboard';
import FieldVisitInTrip from './FieldVisitInTrip';
import FieldVisitReport from './FieldVisitReport';
import FieldVisitTravelReport from './FieldVisitTravelReport';
import FieldTripCalendar from './FieldTripCalendar';
import MESNotificationBell from '../common/MESNotificationBell';
import { CRM_FULL_ACCESS_ROLES, getRoleLabel } from '../../utils/roleConstants';
import './CRM.css';

const { Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * MyCustomersWithMap — wraps MyCustomers with a map toggle button.
 * When the toggle is active, CustomerMapView is shown instead of the customer list.
 */
const MyCustomersWithMap = ({ initialShowMap = false }) => {
  const [showMap, setShowMap] = useState(initialShowMap);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button
          type={showMap ? 'primary' : 'default'}
          icon={<GlobalOutlined />}
          onClick={() => setShowMap(prev => !prev)}
        >
          {showMap ? 'Show List' : 'Show Map'}
        </Button>
      </div>
      {showMap ? <CustomerMapView /> : <MyCustomers />}
    </div>
  );
};

/**
 * PerformanceView — combines My Report and Budget as sub-tabs under a single Performance tab.
 * Uses Ant Design Tabs component for the sub-tab navigation.
 */
const PerformanceView = ({ salesRepGroupName, isAdminOrManagement, defaultTab = 'report' }) => {
  const items = [
    {
      key: 'report',
      label: (
        <span>
          <FileTextOutlined style={{ marginRight: 6 }} />
          My Report
        </span>
      ),
      children: <CRMSalesReport groupName={salesRepGroupName} />,
    },
    {
      key: 'budget',
      label: (
        <span>
          <PieChartOutlined style={{ marginRight: 6 }} />
          Budget
        </span>
      ),
      children: <CRMBudgetView initialGroupName={isAdminOrManagement ? null : salesRepGroupName} />,
    },
  ];

  return (
    <Tabs defaultActiveKey={defaultTab} items={items} size="middle" />
  );
};

const CRMManagementView = () => {
  const items = [
    {
      key: 'customers',
      label: (
        <span>
          <TeamOutlined style={{ marginRight: 6 }} />
          Customer Management
        </span>
      ),
      children: <CustomerList />,
    },
    {
      key: 'sales-reps',
      label: (
        <span>
          <AppstoreOutlined style={{ marginRight: 6 }} />
          Sales Rep Management
        </span>
      ),
      children: <SalesRepManagement />,
    },
  ];

  return <Tabs defaultActiveKey="customers" items={items} size="middle" />;
};

const CRMModule = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [salesRepGroupName, setSalesRepGroupName] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const userMenuRef = useRef(null);

  const userLevel = Number(user?.designation_level) || 0;
  const isAdminOrManagement = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;
  // Must match backend hasFullAccess: admin always, others need designation_level >= 6
  const canReviewApprovals = user?.role === 'admin' ||
    (['manager', 'sales_manager', 'sales_coordinator'].includes(user?.role) && userLevel >= 6);

  // Stable active-tab derivation — only recomputes when URL or role changes
  const activeTab = useMemo(() => {
    const path = location.pathname;
    if (isAdminOrManagement) {
      if (path.includes('/crm/reports')) return 'reports';
      if (path.includes('/crm/pipeline')) return 'pipeline';
      if (path.includes('/crm/analytics')) return 'analytics';
      if (path.includes('/crm/management')) return 'management';
      if (path.includes('/crm/budget')) return 'budget';
      if (path.includes('/crm/customers/map')) return 'map';
      if (path.includes('/crm/customers/')) return 'customers';
      if (path.includes('/crm/customers')) return 'customers';
      if (path.includes('/crm/products')) return 'products';
      if (path.includes('/crm/inquiries')) return 'inquiries';
      if (path.includes('/crm/team')) return 'team';
      if (path.includes('/crm/prospects')) return 'prospects';
      return 'overview';
    }
    if (path.includes('/crm/overview')) return 'overview';
    if (path.includes('/crm/my-day')) return 'my-day';
    if (path.includes('/crm/worklist')) return 'home';
    if (path.includes('/crm/visits')) return 'visits';
    if (path.includes('/crm/customers')) return 'customers';
    if (path.includes('/crm/prospects')) return 'prospects';
    if (path.includes('/crm/lost-business')) return 'lost-business';
    if (path.includes('/crm/report') || path.includes('/crm/budget')) return 'performance';
    return 'home';
  }, [location.pathname, isAdminOrManagement]);

  // Lightweight bootstrap: loads sales rep group name when performance tab is visited.
  // Deferred to avoid duplicate /api/crm/my-customers call on CRM mount.
  const groupNameLoadedRef = useRef(false);
  const loadStats = useCallback(async () => {
    if (isAdminOrManagement || groupNameLoadedRef.current) return;
    groupNameLoadedRef.current = true;
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const myCustomersRes = await axios.get(`${API_BASE_URL}/api/crm/my-customers`, {
        headers,
        timeout: 3000
      }).catch(() => ({ data: { data: { customers: [], salesRep: null } } }));

      const repInfo = myCustomersRes.data?.data?.salesRep || null;
      if (repInfo?.groupName) setSalesRepGroupName(repInfo.groupName);
    } catch (error) {
      console.error('Error loading CRM bootstrap context:', error);
    } finally {
      setBootstrapReady(true);
    }
  }, [isAdminOrManagement]);

  // Only load stats when user navigates to performance-related tabs
  useEffect(() => {
    if (activeTab === 'performance' || activeTab === 'report' || activeTab === 'budget') {
      loadStats();
    }
  }, [activeTab, loadStats]);

  useEffect(() => {
    if (!canReviewApprovals) {
      setPendingApprovalCount(0);
      return;
    }

    let mounted = true;
    const fetchPendingApprovals = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`${API_BASE_URL}/api/crm/field-trips/pending-my-approval`, { headers, timeout: 5000 });
        if (!mounted) return;
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setPendingApprovalCount(rows.length);
      } catch {
        if (mounted) setPendingApprovalCount(0);
      }
    };

    fetchPendingApprovals();
    const timer = setInterval(fetchPendingApprovals, 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [canReviewApprovals, location.pathname]);

  const renderVisitsLabel = () => (
    <span className="crm-tab-label">
      <EnvironmentOutlined />
      <span>Field Visits</span>
      {canReviewApprovals && pendingApprovalCount > 0 && (
        <Badge count={pendingApprovalCount} size="small" overflowCount={99} style={{ marginInlineStart: 6 }} />
      )}
    </span>
  );

  // Tab options - different for admin vs sales rep
  const tabOptions = isAdminOrManagement ? [
    {
      value: 'overview',
      label: (
        <span className="crm-tab-label">
          <BarChartOutlined />
          <span>Overview</span>
        </span>
      )
    },
    {
      value: 'reports',
      label: (
        <span className="crm-tab-label">
          <FileTextOutlined />
          <span>Reports</span>
        </span>
      )
    },
    {
      value: 'budget',
      label: (
        <span className="crm-tab-label">
          <PieChartOutlined />
          <span>Budget</span>
        </span>
      )
    },
    {
      value: 'customers',
      label: (
        <span className="crm-tab-label">
          <TeamOutlined />
          <span>Customers</span>
        </span>
      )
    },
    {
      value: 'inquiries',
      label: (
        <span className="crm-tab-label">
          <RadarChartOutlined />
          <span>Pre-Sales</span>
        </span>
      )
    },
    {
      value: 'visits',
      label: renderVisitsLabel()
    },
    {
      value: 'prospects',
      label: (
        <span className="crm-tab-label">
          <UserAddOutlined />
          <span>Prospects</span>
        </span>
      )
    },
    {
      value: 'map',
      label: (
        <span className="crm-tab-label">
          <GlobalOutlined />
          <span>Map</span>
        </span>
      )
    },
    {
      value: 'products',
      label: (
        <span className="crm-tab-label">
          <AppstoreOutlined />
          <span>Products</span>
        </span>
      )
    },
    {
      value: 'team',
      label: (
        <span className="crm-tab-label">
          <TeamOutlined />
          <span>Sales Team</span>
        </span>
      )
    },
    {
      value: 'management',
      label: (
        <span className="crm-tab-label">
          <SettingOutlined />
          <span>Management</span>
        </span>
      )
    },
    {
      value: 'analytics',
      label: (
        <span className="crm-tab-label">
          <BarChartOutlined />
          <span>Analytics</span>
        </span>
      )
    },
    {
      value: 'pipeline',
      label: (
        <span className="crm-tab-label">
          <FunnelPlotOutlined />
          <span>Pipeline</span>
        </span>
      )
    }
  ] : [
    {
      value: 'home',
      label: (
        <span className="crm-tab-label">
          <BarChartOutlined />
          <span>Home</span>
        </span>
      )
    },
    {
      value: 'my-day',
      label: (
        <span className="crm-tab-label">
          <CalendarOutlined />
          <span>My Day</span>
        </span>
      )
    },
    {
      value: 'overview',
      label: (
        <span className="crm-tab-label">
          <PieChartOutlined />
          <span>Overview</span>
        </span>
      )
    },
    {
      value: 'visits',
      label: renderVisitsLabel()
    },
    {
      value: 'customers',
      label: (
        <span className="crm-tab-label">
          <TeamOutlined />
          <span>My Customers</span>
        </span>
      )
    },
    {
      value: 'prospects',
      label: (
        <span className="crm-tab-label">
          <UserAddOutlined />
          <span>My Prospects</span>
        </span>
      )
    },
    {
      value: 'lost-business',
      label: (
        <span className="crm-tab-label">
          <StopOutlined />
          <span>Lost Business</span>
        </span>
      )
    },
    {
      value: 'performance',
      label: (
        <span className="crm-tab-label">
          <LineChartOutlined />
          <span>Performance</span>
        </span>
      )
    }
  ];

  const TAB_ROUTES = {
    home: '/crm', overview: '/crm/overview',
    'my-day': '/crm/my-day', reports: '/crm/reports', report: '/crm/report',
    budget: '/crm/budget', map: '/crm/customers/map', customers: '/crm/customers',
    products: '/crm/products', inquiries: '/crm/inquiries', team: '/crm/team',
    management: '/crm/management', analytics: '/crm/analytics', prospects: '/crm/prospects', pipeline: '/crm/pipeline',
    visits: '/crm/visits',
    'lost-business': '/crm/lost-business',
    performance: '/crm/report',
  };
  const handleTabChange = (value) => navigate(TAB_ROUTES[value] ?? '/crm');

  const isDetailPage = /\/crm\/(customers|inquiries|prospects)\/\d+/.test(location.pathname);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const userInitials = useMemo(() => {
    if (!user?.name) return 'U';
    const names = user.name.split(' ');
    if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase();
    return user.name[0].toUpperCase();
  }, [user?.name]);

  const designationLabel = useMemo(() => getRoleLabel(user), [user?.role, user?.designation]);

  return (
    <div className="crm-module">
      {/* Top bar: Sales reps see name + settings, Admin sees back button */}
      {!isAdminOrManagement ? (
        <div className="crm-user-header">
          <div className="crm-user-header-left">
            <button
              className="crm-back-button"
              onClick={() => navigate('/modules')}
              title="Back to Home"
            >
              <span className="crm-back-icon">←</span>
            </button>
            <div className="crm-user-header-avatar">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt={user?.name} className="crm-user-header-photo" />
              ) : (
                <span>{userInitials}</span>
              )}
            </div>
            <div className="crm-user-header-info">
              <span className="crm-user-header-name">{user?.displayName || user?.name || 'User'}</span>
              <span className="crm-user-header-role">{designationLabel}</span>
            </div>
          </div>
          <div className="crm-user-header-right" ref={userMenuRef}>
            <MESNotificationBell highlightTripApprovals unreadOnly />
            <button
              className="crm-user-header-settings-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title="Settings"
            >
              <SettingOutlined />
            </button>
            {userMenuOpen && (
              <div className="crm-user-header-dropdown">
                <button className="crm-user-header-dropdown-item" onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}>
                  <SettingOutlined />
                  <span>Settings</span>
                </button>
                <button className="crm-user-header-dropdown-item" onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}>
                  <TeamOutlined />
                  <span>My Profile</span>
                </button>
                <div className="crm-user-header-dropdown-divider" />
                <button className="crm-user-header-dropdown-item crm-user-header-logout" onClick={handleLogout}>
                  <LogoutOutlined />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Admin/Management: keep the back to modules button */
        <div className="crm-back-button-container">
          <button
            className="crm-back-button"
            onClick={() => navigate('/modules')}
            title="Back to Module Selector"
          >
            <span className="crm-back-icon">←</span>
            <span className="crm-back-text">Modules</span>
          </button>
          <div className="crm-back-button-right">
            <MESNotificationBell highlightTripApprovals unreadOnly />
          </div>
        </div>
      )}

      {/* Horizontal Tab Navigation - hide on detail pages */}
      {!isDetailPage && (
        <div className="crm-tab-nav">
          <Segmented
            value={activeTab}
            onChange={handleTabChange}
            options={tabOptions}
            size="large"
            className="crm-segmented-nav"
          />
        </div>
      )}

      {/* Content Area */}
      <div className="crm-content-area">
          <Routes>
            {/* Dashboard/Overview - different for admin vs sales rep */}
            <Route index element={
              isAdminOrManagement 
                ? <AdminCRMDashboard onRefresh={loadStats} />
                : <CRMHomePage />
            } />
            {/* Overview — Sales Rep only (SalesCockpit) */}
            {!isAdminOrManagement && <Route path="overview" element={<CRMDashboard />} />}
            {/* My Day — Sales Rep only */}
            {!isAdminOrManagement && <Route path="my-day" element={<MyDayDashboard />} />}
            {/* Worklist — accessible from Home + My Day */}
            {!isAdminOrManagement && <Route path="worklist" element={<CRMWorklist />} />}
            {/* Field Visits — shared between admin and sales rep */}
            <Route path="calendar" element={<FieldTripCalendar />} />
            <Route path="visits" element={<FieldVisitList />} />
            <Route path="visits/new" element={<FieldVisitPlanner />} />
            <Route path="visits/:id/edit" element={<FieldVisitPlanner />} />
            <Route path="visits/:id" element={<FieldVisitDetail />} />
            <Route path="visits/:id/route" element={<FieldVisitRouteView />} />
            <Route path="visits/:id/in-trip" element={<FieldVisitInTrip />} />
            <Route path="visits/:id/report" element={<FieldVisitReport />} />
            <Route path="visits/:id/travel-report" element={<FieldVisitTravelReport />} />
            {/* Reports - Admin only */}
            {isAdminOrManagement && <Route path="reports" element={<CRMReports />} />}
            {/* Performance - Sales Rep only: Report + Budget as sub-tabs */}
            {!isAdminOrManagement && (
              <Route path="report" element={
                bootstrapReady
                  ? <PerformanceView salesRepGroupName={salesRepGroupName} isAdminOrManagement={isAdminOrManagement} />
                  : <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
              } />
            )}
            {!isAdminOrManagement && (
              <Route path="budget" element={
                bootstrapReady
                  ? <PerformanceView salesRepGroupName={salesRepGroupName} isAdminOrManagement={isAdminOrManagement} defaultTab="budget" />
                  : <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
              } />
            )}
            {/* Budget Achievement View - Admin only (reps access via Performance tab) */}
            {isAdminOrManagement && (
              <Route path="budget" element={
                <CRMBudgetView initialGroupName={null} />
              } />
            )}
            {/* Lost Business — Sales Rep only */}
            {!isAdminOrManagement && <Route path="lost-business" element={<LostBusiness />} />}
            {/* Prospects - Sales Rep sees their prospects, Admin sees all with management tools */}
            <Route path="prospects" element={
              isAdminOrManagement ? <ProspectManagement /> : <MyProspects />
            } />
            {/* Customers - Admin sees all, Sales rep sees MyCustomers with map toggle */}
            <Route path="customers" element={
              isAdminOrManagement ? <CustomerList /> : <MyCustomersWithMap />
            } />
            <Route path="customers/map" element={
              isAdminOrManagement ? <CustomerMapView /> : <MyCustomersWithMap initialShowMap />
            } />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="products" element={<ProductGroupList />} />
            {/* Pre-Sales Inquiries (MES Stage 1) */}
            <Route path="inquiries/*" element={<PresalesInquiries />} />
            {/* Sales Team - Admin only */}
            {isAdminOrManagement && <Route path="team" element={<SalesRepList />} />}
            {/* Management - Admin/management only */}
            {isAdminOrManagement && <Route path="management" element={<CRMManagementView />} />}
            {/* Analytics - Admin only */}
            {isAdminOrManagement && <Route path="analytics" element={<CRMAnalytics />} />}
            {/* Pipeline Dashboard - Admin only */}
            {isAdminOrManagement && <Route path="pipeline" element={<FullPipelineDashboard />} />}
          </Routes>
      </div>
    </div>
  );
};

export default CRMModule;
