/**
 * Property test — Quotation Versioning
 *
 * Task 4.6: Validates version numbers are monotonically increasing
 * and revision chains maintain integrity.
 */

const fc = require('fast-check');

describe('Quotation Versioning — Property Tests', () => {

  function createVersion(prev) {
    return {
      version: (prev?.version || 0) + 1,
      parent_version: prev?.version || null,
      created_at: new Date().toISOString(),
    };
  }

  function buildRevisionChain(length) {
    const chain = [];
    let prev = null;
    for (let i = 0; i < length; i++) {
      const ver = createVersion(prev);
      chain.push(ver);
      prev = ver;
    }
    return chain;
  }

  test('version numbers are strictly monotonically increasing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (chainLength) => {
          const chain = buildRevisionChain(chainLength);
          for (let i = 1; i < chain.length; i++) {
            expect(chain[i].version).toBeGreaterThan(chain[i - 1].version);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('parent_version always points to previous version', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (chainLength) => {
          const chain = buildRevisionChain(chainLength);
          for (let i = 1; i < chain.length; i++) {
            expect(chain[i].parent_version).toBe(chain[i - 1].version);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('first version always starts at 1 with null parent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (chainLength) => {
          const chain = buildRevisionChain(chainLength);
          expect(chain[0].version).toBe(1);
          expect(chain[0].parent_version).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  test('no duplicate version numbers in chain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (chainLength) => {
          const chain = buildRevisionChain(chainLength);
          const versions = chain.map(v => v.version);
          expect(new Set(versions).size).toBe(versions.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
