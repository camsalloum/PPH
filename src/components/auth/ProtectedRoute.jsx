import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * ProtectedRoute component - wraps routes that require authentication
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @param {string|string[]} props.requiredRole - Optional role(s) required to access
 * @param {string} props.requiredDivision - Optional division required to access
 * @param {string} props.redirectTo - Where to redirect if not authenticated (default: /login)
 */
const ProtectedRoute = ({ 
  children, 
  requiredRole = null, 
  requiredDivision = null,
  minLevel = null,
  redirectTo = '/login',
  roleRedirectTo = null
}) => {
  const { isAuthenticated, user, loading, hasRole, hasAccessToDivision } = useAuth();

  // Debug logging

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f7fafc'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e2e8f0',
            borderTopColor: '#667eea',
            borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ margin: 0, color: '#718096', fontSize: '14px' }}>
            Verifying authentication...
          </p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check role requirements
  if (requiredRole && !hasRole(requiredRole)) {
    // If roleRedirectTo is set, silently redirect instead of showing Access Denied
    if (roleRedirectTo) {
      return <Navigate to={roleRedirectTo} replace />;
    }
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f7fafc',
        padding: '20px'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '500px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#fed7d7',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '32px'
          }}>
            🔒
          </div>
          <h2 style={{ margin: '0 0 8px 0', color: '#1a202c', fontSize: '24px' }}>
            Access Denied
          </h2>
          <p style={{ margin: '0 0 24px 0', color: '#718096', fontSize: '14px' }}>
            You don't have permission to access this page.
          </p>
          <p style={{ 
            margin: 0, 
            padding: '12px 20px',
            background: '#f7fafc',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#4a5568'
          }}>
            Your role: <strong>{user?.role}</strong><br />
            Required: <strong>{Array.isArray(requiredRole) ? requiredRole.join(' or ') : requiredRole}</strong>
          </p>
        </div>
      </div>
    );
  }

  // Check designation level requirement (e.g. MIS requires level >= 5)
  if (minLevel != null && (Number(user?.designation_level) || 0) < minLevel) {
    if (roleRedirectTo) {
      return <Navigate to={roleRedirectTo} replace />;
    }
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f7fafc',
        padding: '20px'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '500px'
        }}>
          <div style={{ width: '64px', height: '64px', background: '#fed7d7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '32px' }}>🔒</div>
          <h2 style={{ margin: '0 0 8px 0', color: '#1a202c', fontSize: '24px' }}>Access Denied</h2>
          <p style={{ margin: '0 0 24px 0', color: '#718096', fontSize: '14px' }}>Your designation level does not have access to this module.</p>
          <p style={{ margin: 0, padding: '12px 20px', background: '#f7fafc', borderRadius: '8px', fontSize: '13px', color: '#4a5568' }}>
            Your level: <strong>{user?.designation_level || 'N/A'}</strong> · Required: <strong>{minLevel}+</strong>
          </p>
        </div>
      </div>
    );
  }

  // Check division requirements
  if (requiredDivision && !hasAccessToDivision(requiredDivision)) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f7fafc',
        padding: '20px'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '500px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#feebc8',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '32px'
          }}>
            ⚠️
          </div>
          <h2 style={{ margin: '0 0 8px 0', color: '#1a202c', fontSize: '24px' }}>
            Division Access Required
          </h2>
          <p style={{ margin: '0 0 24px 0', color: '#718096', fontSize: '14px' }}>
            You don't have access to the <strong>{requiredDivision}</strong> division.
          </p>
          <p style={{ 
            margin: 0, 
            padding: '12px 20px',
            background: '#f7fafc',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#4a5568'
          }}>
            Your divisions: <strong>{user?.divisions?.join(', ') || 'None'}</strong>
          </p>
        </div>
      </div>
    );
  }

  // All checks passed, render children
  return children;
};

export default ProtectedRoute;
