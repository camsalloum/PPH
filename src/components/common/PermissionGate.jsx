/**
 * PermissionGate Component
 * Conditionally renders children based on user permissions
 * Part of: User Management Module Implementation - Phase 4
 * Date: December 25, 2025
 * 
 * Usage:
 * <PermissionGate permission="budget:edit" fallback={<AccessDenied />}>
 *   <BudgetEditor />
 * </PermissionGate>
 */

import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Result, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';

/**
 * Check if user has a specific permission
 */
const hasPermission = (userPermissions, requiredPermission, divisionCode = null) => {
  if (!userPermissions) return false;
  
  const { global = [], byDivision = {} } = userPermissions;
  
  // Check global permissions
  if (global.includes(requiredPermission)) {
    return true;
  }
  
  // Check wildcard permissions
  const [group] = requiredPermission.split(':');
  const wildcardKey = `${group}:*`;
  if (global.includes(wildcardKey)) {
    return true;
  }
  
  // If division-specific, check division permissions
  if (divisionCode && byDivision[divisionCode]) {
    if (byDivision[divisionCode].includes(requiredPermission)) {
      return true;
    }
    if (byDivision[divisionCode].includes(wildcardKey)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Default Access Denied component
 */
const DefaultAccessDenied = ({ permission }) => (
  <Result
    status="403"
    icon={<LockOutlined style={{ color: '#ff4d4f' }} />}
    title="Access Denied"
    subTitle={`You don't have permission to access this resource.${permission ? ` Required: ${permission}` : ''}`}
    extra={
      <Button type="primary" onClick={() => window.history.back()}>
        Go Back
      </Button>
    }
    style={{ marginTop: 48 }}
  />
);

/**
 * PermissionGate Component
 * 
 * @param {Object} props
 * @param {string|string[]} props.permission - Required permission(s)
 * @param {string} props.divisionCode - Division code for division-specific permissions
 * @param {string} props.mode - 'any' (default) or 'all' for multiple permissions
 * @param {React.ReactNode} props.fallback - What to render when permission denied
 * @param {boolean} props.showFallback - Whether to show fallback or nothing (default: true)
 * @param {React.ReactNode} props.children - Content to render if permission granted
 */
const PermissionGate = ({
  permission,
  divisionCode = null,
  mode = 'any',
  fallback = null,
  showFallback = true,
  children
}) => {
  const { user, hasRole, userPermissions } = useAuth();
  
  const isAuthorized = useMemo(() => {
    // Admin bypasses all permission checks
    if (user?.role === 'admin' || hasRole('admin')) {
      return true;
    }
    
    // No permission required
    if (!permission) {
      return true;
    }
    
    // Normalize to array
    const permissions = Array.isArray(permission) ? permission : [permission];
    
    if (mode === 'all') {
      // Must have ALL permissions
      return permissions.every(p => hasPermission(userPermissions, p, divisionCode));
    } else {
      // Must have ANY permission
      return permissions.some(p => hasPermission(userPermissions, p, divisionCode));
    }
  }, [user, hasRole, userPermissions, permission, divisionCode, mode]);
  
  if (isAuthorized) {
    return <>{children}</>;
  }
  
  if (!showFallback) {
    return null;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  // Default fallback
  return <DefaultAccessDenied permission={Array.isArray(permission) ? permission.join(', ') : permission} />;
};

/**
 * Higher-order component for permission-gated routes
 */
export const withPermission = (WrappedComponent, requiredPermission, options = {}) => {
  return function PermissionWrappedComponent(props) {
    return (
      <PermissionGate 
        permission={requiredPermission} 
        divisionCode={options.divisionCode}
        mode={options.mode}
        fallback={options.fallback}
        showFallback={options.showFallback}
      >
        <WrappedComponent {...props} />
      </PermissionGate>
    );
  };
};

/**
 * Hook to check permission programmatically
 */
export const usePermission = (permission, divisionCode = null) => {
  const { user, hasRole, userPermissions } = useAuth();
  
  return useMemo(() => {
    if (user?.role === 'admin' || hasRole('admin')) {
      return true;
    }
    
    if (!permission) {
      return true;
    }
    
    return hasPermission(userPermissions, permission, divisionCode);
  }, [user, hasRole, userPermissions, permission, divisionCode]);
};

/**
 * Hook to check multiple permissions
 */
export const usePermissions = (permissions, mode = 'any', divisionCode = null) => {
  const { user, hasRole, userPermissions } = useAuth();
  
  return useMemo(() => {
    if (user?.role === 'admin' || hasRole('admin')) {
      return { hasAll: true, hasAny: true, granted: permissions };
    }
    
    if (!permissions || permissions.length === 0) {
      return { hasAll: true, hasAny: true, granted: [] };
    }
    
    const granted = permissions.filter(p => hasPermission(userPermissions, p, divisionCode));
    
    return {
      hasAll: granted.length === permissions.length,
      hasAny: granted.length > 0,
      granted
    };
  }, [user, hasRole, userPermissions, permissions, divisionCode]);
};

export default PermissionGate;
