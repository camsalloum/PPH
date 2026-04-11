import React, { Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import Login from './components/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ModuleSelector from './components/modules/ModuleSelector';
import RotateHint from './components/common/RotateHint';

// Shared providers — imported directly (no lazy) so they mount ONCE and
// stay alive across all route navigation. Never re-mount = no re-fetch.
import { ExcelDataProvider } from './contexts/ExcelDataContext';
import { SalesDataProvider } from './contexts/SalesDataContext';
import { SalesRepReportsProvider } from './contexts/SalesRepReportsContext';
import { FilterProvider } from './contexts/FilterContext';
import ReportPreloader from './components/common/ReportPreloader';
import lazyRetry from './utils/lazyRetry';
import { SALES_ROLES } from './utils/roleConstants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

// --- Lazy-loaded route components (code-split) ---
// Wrapped with lazyRetry so ERR_CACHE_READ_FAILURE / stale chunk 404s
// are retried automatically instead of crashing the app.
const Dashboard = React.lazy(() => lazyRetry(() => import('./components/dashboard/Dashboard')));
const Settings = React.lazy(() => lazyRetry(() => import('./components/settings/Settings')));
const SetupWizard = React.lazy(() => lazyRetry(() => import('./components/setup/SetupWizard')));
const PlatformDashboard = React.lazy(() => lazyRetry(() => import('./components/platform/PlatformDashboard')));
const PeopleAccessModule = React.lazy(() => lazyRetry(() => import('./components/people').then(m => ({ default: m.PeopleAccessModule }))));
const UserProfile = React.lazy(() => lazyRetry(() => import('./components/people').then(m => ({ default: m.UserProfile }))));
const CRMModule = React.lazy(() => lazyRetry(() => import('./components/CRM').then(m => ({ default: m.CRMModule }))));
const MESModule = React.lazy(() => lazyRetry(() => import('./components/MES')));
const PublicCSEView = React.lazy(() => lazyRetry(() => import('./components/MES/QC/PublicCSEView')));

// PLDataProvider stays lazy+per-route — only /dashboard & /settings need it
const PLDataProvider = React.lazy(() => lazyRetry(() => import('./contexts/PLDataContext').then(m => ({ default: m.PLDataProvider }))));

// Platform guard — redirect non-platform-admin users to /modules
function PlatformGuard({ children }) {
  const { user } = useAuth();
  if (!user?.isPlatformAdmin) return <Navigate to="/modules" replace />;
  return children;
}

// Lightweight loading fallback for lazy routes
const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem' }}>Loading…</div>
  </div>
);

import './styles/themes.css';
import './App.css';

// Inner App component that uses theme context AND is wrapped by AntdApp
function AppRoutes() {
  const { message } = AntdApp.useApp();

  // Show a user-facing message when the backend session expires (refresh token missing/invalid)
  React.useEffect(() => {
    const handler = (event) => {
      const reason = event?.detail?.reason;
      if (reason === 'refresh_failed') {
        message.error('Session expired. Please log in again.');
      }
    };

    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [message]);

  return (
    <div className="App">
      <CurrencyProvider>
        <AuthProvider>
          <Router>
          <RotateHint />
          {/* Shared providers wrap ALL routes — mount once, never remount on navigation.
              Auth-token guards in each provider prevent wasted API calls on login/MES pages. */}
          <ExcelDataProvider>
            <SalesDataProvider>
              <SalesRepReportsProvider>
                <FilterProvider>
                  {/* Silently pre-loads the sales rep's report data in the
                      background right after login so /crm/report opens instantly */}
                  <ReportPreloader />
                  <Suspense fallback={<LazyFallback />}>
                  <Routes>
                    {/* Setup Wizard (first-time setup) */}
                    <Route path="/setup" element={<SetupWizard />} />

                    {/* Public Routes */}
                    <Route path="/login" element={<Login />} />

                    {/* Dashboard — requires role in MIS_ROLES AND designation level >= 6.
                        PLDataProvider is lazy here (heavy P&L data, only needed on this route). */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute requiredRole={['admin', 'manager', 'sales_manager', 'sales_coordinator']} minLevel={6} roleRedirectTo="/crm">
                          <Suspense fallback={<LazyFallback />}>
                            <PLDataProvider>
                              <Dashboard />
                            </PLDataProvider>
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* Settings — no PLDataProvider needed (no P&L tab uses it) */}
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<LazyFallback />}>
                            <Settings />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* CRM Module — shared providers already cover all CRM needs */}
                    <Route
                      path="/crm/*"
                      element={
                        <ProtectedRoute requiredRole={SALES_ROLES} roleRedirectTo="/mes">
                          <Suspense fallback={<LazyFallback />}>
                            <CRMModule />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* People & Access Module (Admin only) */}
                    <Route
                      path="/people-access/*"
                      element={
                        <ProtectedRoute requiredRole="admin">
                          <PeopleAccessModule />
                        </ProtectedRoute>
                      }
                    />

                    {/* User Profile (All authenticated users) */}
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <UserProfile />
                        </ProtectedRoute>
                      }
                    />

                    {/* Platform Admin Dashboard */}
                    <Route
                      path="/platform/*"
                      element={
                        <ProtectedRoute>
                          <PlatformGuard>
                            <PlatformDashboard />
                          </PlatformGuard>
                        </ProtectedRoute>
                      }
                    />

                    {/* Public MES routes — no authentication required */}
                    <Route
                      path="/mes/public/cse/:token"
                      element={
                        <Suspense fallback={<LazyFallback />}>
                          <PublicCSEView />
                        </Suspense>
                      }
                    />

                    {/* MES Module — workflow, flow tracker, presales */}
                    <Route
                      path="/mes/*"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<LazyFallback />}>
                            <MESModule />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* Module Selector (landing page after login) */}
                    <Route
                      path="/modules"
                      element={
                        <ProtectedRoute>
                          <ModuleSelector />
                        </ProtectedRoute>
                      }
                    />

                    {/* Redirect root to module selector */}
                    <Route path="/" element={<Navigate to="/modules" replace />} />

                    {/* 404 — catch all unmatched paths */}
                    <Route path="*" element={<Navigate to="/modules" replace />} />
                  </Routes>
                  </Suspense>
                </FilterProvider>
              </SalesRepReportsProvider>
            </SalesDataProvider>
          </ExcelDataProvider>
        </Router>
      </AuthProvider>
    </CurrencyProvider>
    </div>
  );
}

function AppContent() {
  const { currentTheme } = useTheme();

  // Map our themes to Ant Design algorithms
  const getAntdAlgorithm = () => {
    switch (currentTheme) {
      case 'dark':
        return antdTheme.darkAlgorithm;
      case 'colorful':
        return antdTheme.defaultAlgorithm;
      case 'classic':
        return antdTheme.compactAlgorithm;
      default:
        return antdTheme.defaultAlgorithm;
    }
  };

  // Get primary color based on theme
  const getPrimaryColor = () => {
    switch (currentTheme) {
      case 'dark':
        return '#3b82f6';
      case 'colorful':
        return '#8b5cf6';
      case 'classic':
        return '#6b7280';
      default:
        return '#1677ff';
    }
  };

  return (
    <StyleProvider hashPriority="low">
    <ConfigProvider
      theme={{
        algorithm: getAntdAlgorithm(),
        token: {
          colorPrimary: getPrimaryColor(),
          borderRadius: currentTheme === 'classic' ? 4 : 8,
        },
        cssVar: true,
      }}
      hashPriority="low"
    >
      <AntdApp>
        <AppRoutes />
      </AntdApp>
    </ConfigProvider>
    </StyleProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
