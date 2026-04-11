/**
 * Shared role constants used across the application.
 *
 * IMPORTANT: Keep these in sync with server/middleware/auth.js and
 * server/routes/mes/presales.js role checks.
 *
 * Single source of truth — never define these arrays inline in components.
 * Import from here instead.
 */

/** Roles that have access to the CRM / Sales module */
export const SALES_ROLES = [
  'admin',
  'manager',
  'sales_manager',
  'sales_coordinator',
  'sales_rep',
  'sales_executive',
];

/** Roles whose primary home is MES (no CRM, no MIS) */
export const MES_ONLY_ROLES = [
  'quality_control',
  'qc_manager',
  'qc_lab',
  'rd_engineer',
  'lab_technician',
  'production_manager',
  'production_planner',
  'production_operator',
  'operator',
  'logistics_manager',
  'warehouse_manager',
  'stores_keeper',
  'accounts_manager',
  'accountant',
];

/** Roles that see the AdminCRMDashboard (full access tabs) */
export const CRM_FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

/** Roles that can access the MIS / Dashboard (high-level analytics) */
export const MIS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

/** Minimum designation level required for MIS access (6 = Senior Management) */
export const MIS_MIN_LEVEL = 6;

/** QC-specific roles */
export const QC_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician'];

/** Production roles */
export const PRODUCTION_ROLES = ['production_manager', 'production_planner', 'production_operator', 'production_op', 'operator'];

/** Accounts roles */
export const ACCOUNTS_ROLES = ['accounts_manager', 'accountant'];

/** Logistics roles */
export const LOGISTICS_ROLES = ['logistics_manager', 'stores_keeper', 'store_keeper', 'warehouse_manager', 'logistics'];

/** Consolidated department role groups */
export const WAREHOUSE_LOGISTICS_ROLES = ['logistics_manager', 'stores_keeper', 'store_keeper', 'warehouse_manager', 'logistics'];
export const QC_LAB_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician'];
export const PLANNING_ROLES = ['production_planner', 'production_manager'];

/** Operator dock-level roles (visual and dimensional checks) */
export const OPERATOR_DOCK_ROLES = ['operator', 'production_operator', 'stores_keeper', 'store_keeper'];

/** Expanded Raw Materials access roles */
export const RAW_MATERIALS_VIEW_ROLES = [
  'admin', 'manager', 'production_manager', 'production_planner',
  'quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician',
  'procurement', 'logistics_manager', 'stores_keeper', 'store_keeper', 'warehouse_manager',
  'operator', 'production_operator'
];

/** Raw Materials configuration roles */
export const RAW_MATERIALS_ADMIN_ROLES = ['admin'];

/** QC testing and verdict role groups */
export const QC_TESTING_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'lab_technician'];
export const QC_VERDICT_ROLES = ['qc_manager', 'admin'];

/**
 * Roles allowed to access the Raw Materials dashboard.
 * Level-based access is checked separately: designation_level >= RAW_MATERIALS_MIN_LEVEL
 * also grants access regardless of role.
 */
export const RAW_MATERIALS_ROLES = RAW_MATERIALS_VIEW_ROLES;

/** Minimum designation level required for Raw Materials dashboard access */
export const RAW_MATERIALS_MIN_LEVEL = 6;

/** Human-friendly labels for user roles */

export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Manager',
  sales_manager: 'Sales Manager',
  sales_coordinator: 'Sales Coordinator',
  sales_rep: 'Sales Representative',
  sales_executive: 'Sales Executive',
  quality_control: 'Quality Control',
  qc_manager: 'QC Manager',
  qc_lab: 'QC Lab',
  rd_engineer: 'R&D Engineer',
  lab_technician: 'Lab Technician',
  production_manager: 'Production Manager',
  production_planner: 'Production Planner',
  production_operator: 'Production Operator',
  operator: 'Operator',
  logistics_manager: 'Logistics Manager',
  stores_keeper: 'Stores Keeper',
  store_keeper: 'Store Keeper',
  warehouse_manager: 'Warehouse Manager',
  logistics: 'Logistics',
  accounts_manager: 'Accounts Manager',
  accountant: 'Accountant',
};

/** Returns a human-friendly label for the user's role. Prefers user.designation if set. */
export function getRoleLabel(user) {
  if (user?.designation) return user.designation;
  return ROLE_LABELS[user?.role] || 'User';
}

/**
 * Returns true if the given user object represents a QC user.
 * Checks role, designation, and department — mirrors the backend canAccessQCDashboard check.
 */
export function isQCUser(user) {
  if (!user) return false;
  const role = (user.role || '').toString().toLowerCase();
  const designation = (user.designation || '').toString();
  const department = (user.department || user.employee_department || '').toString();
  return (
    QC_ROLES.includes(role) ||
    /\b(qc|quality)\b/i.test(designation) ||
    /\b(qc|quality)\b/i.test(department)
  );
}
