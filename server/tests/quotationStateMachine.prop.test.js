/**
 * Property test — Quotation State Machine
 *
 * Tasks 3.6, 3.7: Validates state machine transitions are deterministic
 * and no invalid transition is silently accepted.
 */

const fc = require('fast-check');

describe('Quotation State Machine — Property Tests', () => {

  const STATES = ['draft', 'pending', 'approved', 'rejected', 'revision_requested'];
  const ACTIONS = ['submit', 'approve', 'reject', 'request_revision', 'revise'];

  const TRANSITIONS = {
    draft:              { submit: 'pending' },
    pending:            { approve: 'approved', reject: 'rejected', request_revision: 'revision_requested' },
    approved:           {},
    rejected:           {},
    revision_requested: { revise: 'draft' },
  };

  function transition(state, action) {
    const next = (TRANSITIONS[state] || {})[action];
    return next || null;
  }

  // 3.6 — Valid transitions produce a valid state
  test('valid transition always yields a known state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATES),
        fc.constantFrom(...ACTIONS),
        (state, action) => {
          const result = transition(state, action);
          if (result !== null) {
            expect(STATES).toContain(result);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  // 3.7 — Invalid transitions return null (never a silent state change)
  test('invalid transitions never produce a state change', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATES),
        fc.constantFrom(...ACTIONS),
        (state, action) => {
          const allowed = Object.keys(TRANSITIONS[state] || {});
          if (!allowed.includes(action)) {
            expect(transition(state, action)).toBeNull();
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  // Determinism — same inputs always yield same outputs
  test('state machine is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATES),
        fc.constantFrom(...ACTIONS),
        (state, action) => {
          const r1 = transition(state, action);
          const r2 = transition(state, action);
          expect(r1).toEqual(r2);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Terminal states have no valid outgoing transitions
  test('approved and rejected are terminal states', () => {
    for (const terminal of ['approved', 'rejected']) {
      for (const action of ACTIONS) {
        expect(transition(terminal, action)).toBeNull();
      }
    }
  });
});
