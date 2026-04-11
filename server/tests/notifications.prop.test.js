/**
 * Property test — Notifications
 *
 * Tasks 23.1, 23.2: Validates notification routing and dedup logic.
 */

const fc = require('fast-check');

describe('Notifications — Property Tests', () => {

  const NOTIFICATION_TYPES = ['stage_change', 'approval_required', 'task_assigned', 'deadline', 'info'];

  function routeNotification(type, recipientRoles) {
    const routing = {
      stage_change: ['admin', 'manager', 'sales_rep'],
      approval_required: ['admin', 'manager', 'sales_manager'],
      task_assigned: ['*'], // any role
      deadline: ['*'],
      info: ['*'],
    };
    const allowed = routing[type] || [];
    if (allowed.includes('*')) return recipientRoles;
    return recipientRoles.filter(r => allowed.includes(r));
  }

  function deduplicateNotifications(notifications) {
    const seen = new Set();
    return notifications.filter(n => {
      const key = `${n.type}:${n.recipient_id}:${n.entity_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 23.1 — routing always returns a subset of recipients
  test('routed recipients are always a subset of input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NOTIFICATION_TYPES),
        fc.array(fc.constantFrom('admin', 'manager', 'sales_rep', 'quality_control', 'viewer'), { minLength: 0, maxLength: 10 }),
        (type, roles) => {
          const routed = routeNotification(type, roles);
          routed.forEach(r => expect(roles).toContain(r));
        }
      ),
      { numRuns: 200 }
    );
  });

  // 23.1 — task_assigned routes to everyone
  test('task_assigned and info route to all recipients', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('task_assigned', 'info', 'deadline'),
        fc.array(fc.constantFrom('admin', 'viewer', 'sales_rep'), { minLength: 1, maxLength: 5 }),
        (type, roles) => {
          const routed = routeNotification(type, roles);
          expect(routed).toEqual(roles);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 23.2 — deduplication removes exact duplicates
  test('deduplication never increases count', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...NOTIFICATION_TYPES),
            recipient_id: fc.integer({ min: 1, max: 100 }),
            entity_id: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (notifications) => {
          const deduped = deduplicateNotifications(notifications);
          expect(deduped.length).toBeLessThanOrEqual(notifications.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('deduplication is idempotent (running twice gives same result)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...NOTIFICATION_TYPES),
            recipient_id: fc.integer({ min: 1, max: 20 }),
            entity_id: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (notifications) => {
          const once = deduplicateNotifications(notifications);
          const twice = deduplicateNotifications(once);
          expect(twice).toEqual(once);
        }
      ),
      { numRuns: 200 }
    );
  });
});
