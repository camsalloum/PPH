/**
 * Property test — Material Availability
 *
 * Task 11.5: Validates material status determination logic.
 */

const fc = require('fast-check');

describe('Material Availability — Property Tests', () => {

  function determineMaterialStatus(bomLines) {
    if (!bomLines || bomLines.length === 0) return 'not_applicable';
    const allAvailable = bomLines.every(l => l.qty_available >= l.qty_required);
    const someOrdered = bomLines.some(l => l.qty_available > 0 && l.qty_available < l.qty_required);
    if (allAvailable) return 'available';
    if (someOrdered) return 'partially_ordered';
    return 'pending';
  }

  test('all-available BOM always returns available', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 10000 }).chain(req =>
            fc.record({
              qty_required: fc.constant(req),
              qty_available: fc.integer({ min: req, max: req + 1000 }),
            })
          ),
          { minLength: 1, maxLength: 10 }
        ),
        (bom) => {
          expect(determineMaterialStatus(bom)).toBe('available');
        }
      ),
      { numRuns: 300 }
    );
  });

  test('empty BOM returns not_applicable', () => {
    expect(determineMaterialStatus([])).toBe('not_applicable');
    expect(determineMaterialStatus(null)).toBe('not_applicable');
  });

  test('all-zero availability with non-zero requirement returns pending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            qty_required: fc.integer({ min: 1, max: 10000 }),
            qty_available: fc.constant(0),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (bom) => {
          expect(determineMaterialStatus(bom)).toBe('pending');
        }
      ),
      { numRuns: 200 }
    );
  });

  test('mixed availability returns partially_ordered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 10000 }),
        (req) => {
          const bom = [
            { qty_required: req, qty_available: req }, // fully available
            { qty_required: req, qty_available: Math.floor(req / 2) }, // partially available
          ];
          expect(determineMaterialStatus(bom)).toBe('partially_ordered');
        }
      ),
      { numRuns: 200 }
    );
  });

  test('result is always one of the valid statuses', () => {
    const VALID = ['available', 'partially_ordered', 'pending', 'not_applicable'];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            qty_required: fc.integer({ min: 0, max: 10000 }),
            qty_available: fc.integer({ min: 0, max: 10000 }),
          }),
          { minLength: 0, maxLength: 8 }
        ),
        (bom) => {
          expect(VALID).toContain(determineMaterialStatus(bom));
        }
      ),
      { numRuns: 300 }
    );
  });
});
