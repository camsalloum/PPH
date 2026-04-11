/**
 * ARCH-003: Shared role-check utilities
 *
 * Client-side mirrors of the backend role checks in presales.js.
 * Import from here instead of inline role checks in components.
 *
 * Keep in sync with: server/routes/mes/presales.js (canApproveQCStage, etc.)
 * and with: src/utils/roleConstants.js (role arrays)
 */
import { QC_ROLES, PRODUCTION_ROLES } from './roleConstants';

const ADMIN_ROLES     = ['admin'];
const MGMT_ROLES      = ['admin', 'manager', 'sales_manager'];
const QC_ACCESS_ROLES = [...QC_ROLES, 'quality_control', 'qc_manager', 'qc_lab'];

/** True if the user is an admin or management */
export function isAdminOrMgmt(user) {
  if (!user) return false;
  return MGMT_ROLES.includes(user.role?.toLowerCase());
}

/** True if this user can access the QC Dashboard as a lab worker */
export function canAccessQCDashboard(user) {
  if (!user) return false;
  const role = (user.role ?? '').toLowerCase();
  if ([...QC_ACCESS_ROLES, ...ADMIN_ROLES, 'manager'].includes(role)) return true;
  if (/\bqc\b/i.test(user.department ?? '') || /\bquality\b/i.test(user.department ?? '')) return true;
  return false;
}

/** True if user can participate in CSE approval workflow */
export function canAccessCSEWorkflow(user) {
  if (!user) return false;
  const role = (user.role ?? '').toLowerCase();
  if (['admin', 'manager', ...QC_ACCESS_ROLES, ...PRODUCTION_ROLES].includes(role)) return true;
  if (/\bqc\b/i.test(user.department ?? '')) return true;
  return false;
}

/** True if user can approve a CSE at QC Manager stage */
export function canApproveQCStage(user) {
  if (!user) return false;
  const role = (user.role ?? '').toLowerCase();
  return ['admin', 'manager', 'quality_control', 'qc_manager'].includes(role);
}

/** True if user can approve a CSE at Production Manager stage */
export function canApproveProductionStage(user) {
  if (!user) return false;
  const role = (user.role ?? '').toLowerCase();
  return ['admin', 'manager', 'production_manager'].includes(role);
}

/** True if user can view pre-sales inquiries (sales + admin) */
export function canAccessPreSales(user) {
  if (!user) return false;
  const role = (user.role ?? '').toLowerCase();
  return !['quality_control', 'qc_manager', 'qc_lab'].includes(role);
}

/** True if user is strictly an admin */
export function isAdmin(user) {
  return user?.role?.toLowerCase() === 'admin';
}

/**
 * Returns display-friendly actor name from user object.
 * Mirrors actorName() helper in presales.js.
 */
export function actorName(user) {
  return user?.name || user?.full_name || user?.username || user?.email || 'System User';
}
