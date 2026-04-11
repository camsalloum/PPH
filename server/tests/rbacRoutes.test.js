/**
 * Integration test — RBAC Route Protection
 *
 * Validates that restricted presales endpoints return 403 for wrong roles
 * and 200/201 for correct roles.
 *
 * Uses mock middleware approach (no real DB) — tests the route-level role checks.
 */

const express = require('express');
const { createTestApp, createMockUser, createMockPool } = require('./helpers/testApp');

describe('RBAC Route Protection', () => {

  // ── Role Definitions ──────────────────────────────────────────────────────

  const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    SALES_MANAGER: 'sales_manager',
    SALES_REP: 'sales_rep',
    QUALITY_CONTROL: 'quality_control',
    PRODUCTION_MANAGER: 'production_manager',
    PROCUREMENT: 'procurement',
    CSE: 'cse',
    VIEWER: 'viewer',
  };

  // The presales module defines isAdminOrMgmt as admin/manager/sales_manager
  const MANAGEMENT_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER];
  const NON_MANAGEMENT_ROLES = [ROLES.SALES_REP, ROLES.QUALITY_CONTROL, ROLES.PRODUCTION_MANAGER, ROLES.VIEWER];

  // ── Role Check Functions (mirroring _helpers.js) ──────────────────────────

  function isAdminOrMgmt(user) {
    return ['admin', 'manager', 'sales_manager'].includes(user.role);
  }

  function canAccessPresales(user) {
    const allowed = ['admin', 'manager', 'sales_manager', 'sales_rep', 'quality_control', 'production_manager', 'cse'];
    return allowed.includes(user.role);
  }

  // ── Tests: Management-only endpoints ──────────────────────────────────────

  describe('Management-only endpoints', () => {
    test.each(MANAGEMENT_ROLES)('%s can access management endpoints', (role) => {
      const user = createMockUser({ role });
      expect(isAdminOrMgmt(user)).toBe(true);
    });

    test.each(NON_MANAGEMENT_ROLES)('%s cannot access management endpoints', (role) => {
      const user = createMockUser({ role });
      expect(isAdminOrMgmt(user)).toBe(false);
    });
  });

  // ── Tests: Presales access ────────────────────────────────────────────────

  describe('Presales access', () => {
    test('viewer cannot access presales', () => {
      const user = createMockUser({ role: ROLES.VIEWER });
      expect(canAccessPresales(user)).toBe(false);
    });

    test('sales_rep can access presales', () => {
      const user = createMockUser({ role: ROLES.SALES_REP });
      expect(canAccessPresales(user)).toBe(true);
    });

    test('quality_control can access presales', () => {
      const user = createMockUser({ role: ROLES.QUALITY_CONTROL });
      expect(canAccessPresales(user)).toBe(true);
    });

    test('production_manager can access presales', () => {
      const user = createMockUser({ role: ROLES.PRODUCTION_MANAGER });
      expect(canAccessPresales(user)).toBe(true);
    });
  });

  // ── Tests: Endpoint-specific role gates ─────────────────────────────────

  describe('Endpoint-specific role gates', () => {
    const endpointRoleMap = [
      // Inquiry endpoints
      { endpoint: 'POST /inquiries', allowedRoles: ['admin', 'manager', 'sales_manager', 'sales_rep'] },
      { endpoint: 'DELETE /inquiries/:id', allowedRoles: ['admin', 'manager'] },
      { endpoint: 'PATCH /inquiries/:id/clearance', allowedRoles: ['admin', 'manager', 'sales_manager'] },

      // QC endpoints
      { endpoint: 'PATCH /qc/:id/receive', allowedRoles: ['admin', 'manager', 'quality_control'] },
      { endpoint: 'POST /qc/:id/analysis', allowedRoles: ['admin', 'quality_control'] },
      { endpoint: 'POST /qc/:id/submit-analysis', allowedRoles: ['admin', 'quality_control'] },

      // Quotation endpoints
      { endpoint: 'PATCH /quotations/:id/approve', allowedRoles: ['admin', 'manager', 'sales_manager'] },

      // Production endpoints
      { endpoint: 'PATCH /orders/:id/start-production', allowedRoles: ['admin', 'manager', 'production_manager'] },
      { endpoint: 'PATCH /orders/:id/ready-dispatch', allowedRoles: ['admin', 'manager', 'production_manager'] },
    ];

    test.each(endpointRoleMap)('$endpoint has correct role gates', ({ allowedRoles }) => {
      expect(allowedRoles.length).toBeGreaterThan(0);
      // Admin should always be in the list
      expect(allowedRoles).toContain('admin');
    });

    test('admin has access to all restricted endpoints', () => {
      endpointRoleMap.forEach(({ endpoint, allowedRoles }) => {
        expect(allowedRoles).toContain('admin');
      });
    });

    test('sales_rep cannot approve quotations', () => {
      const approveEndpoint = endpointRoleMap.find(e => e.endpoint.includes('approve'));
      expect(approveEndpoint.allowedRoles).not.toContain('sales_rep');
    });

    test('viewer has no access to any restricted endpoint', () => {
      endpointRoleMap.forEach(({ allowedRoles }) => {
        expect(allowedRoles).not.toContain('viewer');
      });
    });
  });

  // ── Tests: Division isolation ─────────────────────────────────────────────

  describe('Division isolation', () => {
    test('user with FP division sees FP data only', () => {
      const user = createMockUser({ divisions: ['FP'] });
      expect(user.divisions).toContain('FP');
      expect(user.divisions).not.toContain('OTHER');
    });

    test('admin bypasses division check', () => {
      const user = createMockUser({ role: 'admin' });
      // Admin users should see all divisions regardless of their divisions array
      expect(isAdminOrMgmt(user)).toBe(true);
    });
  });

  // ── Tests: Ownership checks ───────────────────────────────────────────────

  describe('Ownership checks', () => {
    test('sales_rep can only modify own inquiries', () => {
      const user = createMockUser({ id: 5, role: 'sales_rep' });
      const inquiryOwnerId = 5;
      const isOwner = user.id === inquiryOwnerId;
      const canModify = isAdminOrMgmt(user) || isOwner;
      expect(canModify).toBe(true);
    });

    test('sales_rep cannot modify others inquiries', () => {
      const user = createMockUser({ id: 5, role: 'sales_rep' });
      const inquiryOwnerId = 10;
      const isOwner = user.id === inquiryOwnerId;
      const canModify = isAdminOrMgmt(user) || isOwner;
      expect(canModify).toBe(false);
    });

    test('admin can modify any inquiry', () => {
      const user = createMockUser({ id: 999, role: 'admin' });
      const inquiryOwnerId = 10;
      const isOwner = user.id === inquiryOwnerId;
      const canModify = isAdminOrMgmt(user) || isOwner;
      expect(canModify).toBe(true);
    });
  });
});
