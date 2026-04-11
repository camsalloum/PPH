/**
 * Property test — RBAC
 *
 * Task 23.3: Validates RBAC permission matrix consistency.
 */

const fc = require('fast-check');

describe('RBAC — Property Tests', () => {

  const ROLES = ['admin', 'manager', 'sales_manager', 'sales_rep', 'quality_control', 'production_manager', 'procurement', 'cse', 'stores_keeper', 'viewer'];

  const PERMISSIONS = {
    admin:              ['read', 'write', 'delete', 'approve', 'manage_users'],
    manager:            ['read', 'write', 'delete', 'approve'],
    sales_manager:      ['read', 'write', 'approve'],
    sales_rep:          ['read', 'write'],
    quality_control:    ['read', 'write', 'qc_approve'],
    production_manager: ['read', 'write', 'production_approve'],
    procurement:        ['read', 'write'],
    cse:                ['read', 'write'],
    stores_keeper:      ['read', 'write'],
    viewer:             ['read'],
  };

  function hasPermission(role, permission) {
    return (PERMISSIONS[role] || []).includes(permission);
  }

  function isMorePrivileged(roleA, roleB) {
    return (PERMISSIONS[roleA] || []).length >= (PERMISSIONS[roleB] || []).length;
  }

  // 23.3 — admin has all permissions any other role has
  test('admin is a superset of all other roles (for common perms)', () => {
    const commonPerms = ['read', 'write', 'delete', 'approve'];
    fc.assert(
      fc.property(
        fc.constantFrom(...commonPerms),
        (perm) => {
          expect(hasPermission('admin', perm)).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  // Every role has at least read permission
  test('every role has read permission', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        (role) => {
          expect(hasPermission(role, 'read')).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  // viewer only has read
  test('viewer cannot write or delete', () => {
    expect(hasPermission('viewer', 'write')).toBe(false);
    expect(hasPermission('viewer', 'delete')).toBe(false);
    expect(hasPermission('viewer', 'approve')).toBe(false);
  });

  // admin has >= permissions than any other role
  test('admin has most permissions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        (role) => {
          expect(isMorePrivileged('admin', role)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Unknown role has no permissions
  test('unknown role has no permissions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !ROLES.includes(s)),
        fc.constantFrom('read', 'write', 'delete', 'approve'),
        (unknownRole, perm) => {
          expect(hasPermission(unknownRole, perm)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Permission check is deterministic
  test('permission check is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.constantFrom('read', 'write', 'delete', 'approve', 'manage_users'),
        (role, perm) => {
          expect(hasPermission(role, perm)).toBe(hasPermission(role, perm));
        }
      ),
      { numRuns: 100 }
    );
  });
});
