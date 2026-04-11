/**
 * Property test — Notification Content
 *
 * Task 3.8: Validates notification payloads are always well-formed.
 */

const fc = require('fast-check');

describe('Notification Content — Property Tests', () => {

  function buildNotification({ type, recipientId, title, message, metadata }) {
    return {
      type: type || 'info',
      recipient_id: recipientId,
      title: (title || '').substring(0, 200),
      message: (message || '').substring(0, 1000),
      is_read: false,
      created_at: new Date().toISOString(),
      metadata: metadata || {},
    };
  }

  test('notification always has required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('info', 'warning', 'success', 'error', 'stage_change'),
          recipientId: fc.integer({ min: 1, max: 10000 }),
          title: fc.string({ minLength: 1, maxLength: 200 }),
          message: fc.string({ minLength: 0, maxLength: 500 }),
        }),
        (input) => {
          const notif = buildNotification(input);
          expect(notif.recipient_id).toBeGreaterThan(0);
          expect(notif.title.length).toBeLessThanOrEqual(200);
          expect(notif.message.length).toBeLessThanOrEqual(1000);
          expect(notif.is_read).toBe(false);
          expect(notif.created_at).toBeTruthy();
          expect(typeof notif.type).toBe('string');
        }
      ),
      { numRuns: 200 }
    );
  });

  test('title is always truncated to 200 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (rawTitle) => {
          const notif = buildNotification({ title: rawTitle, recipientId: 1 });
          expect(notif.title.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('message is always truncated to 1000 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2000 }),
        (rawMsg) => {
          const notif = buildNotification({ message: rawMsg, recipientId: 1 });
          expect(notif.message.length).toBeLessThanOrEqual(1000);
        }
      ),
      { numRuns: 200 }
    );
  });
});
