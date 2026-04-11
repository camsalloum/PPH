/**
 * People & Access Module - Index
 * Export all components for the unified user management module
 * Part of: User Management Module Implementation
 * Date: December 25, 2025
 */

// Main Dashboard
export { default as PeopleAccessModule } from './PeopleAccessModule';

// Sub-components
export { default as UnifiedUserEmployee } from './UnifiedUserEmployee';
export { default as SalesTeamManager } from './SalesTeamManager';
export { default as EnhancedOrgChart } from './EnhancedOrgChart';
export { default as TerritoryManager } from './TerritoryManager';
export { default as RolesPermissions } from './RolesPermissions';
export { default as AuthorizationRulesManager } from './AuthorizationRulesManager';
export { default as AuditLog } from './AuditLog';
export { default as UserProfile } from './UserProfile';

// Styles
import './PeopleAccess.css';
