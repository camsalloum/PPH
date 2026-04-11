/**
 * Property test — Material Calculations
 *
 * Task 14.6: Validates material quantity calculations and waste factors.
 */

const fc = require('fast-check');

describe('Material Calculations — Property Tests', () => {

  function calculateMaterialNeeded(orderQty, wastagePercent) {
    return orderQty * (1 + wastagePercent / 100);
  }

  function roundUpToRoll(kgNeeded, kgPerRoll) {
    if (kgPerRoll <= 0) return 0;
    return Math.ceil(kgNeeded / kgPerRoll);
  }

  function materialCost(rolls, kgPerRoll, pricePerKg) {
    return rolls * kgPerRoll * pricePerKg;
  }

  test('material needed is always >= order quantity', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        (qty, waste) => {
          expect(calculateMaterialNeeded(qty, waste)).toBeGreaterThanOrEqual(qty);
        }
      ),
      { numRuns: 500 }
    );
  });

  test('zero wastage means material = order quantity', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        (qty) => {
          expect(calculateMaterialNeeded(qty, 0)).toBeCloseTo(qty, 10);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('rolls rounded up covers all material needed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 10000, noNaN: true }),
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        (kgNeeded, kgPerRoll) => {
          const rolls = roundUpToRoll(kgNeeded, kgPerRoll);
          expect(rolls * kgPerRoll).toBeGreaterThanOrEqual(kgNeeded);
        }
      ),
      { numRuns: 500 }
    );
  });

  test('material cost is non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (rolls, kgPerRoll, pricePerKg) => {
          expect(materialCost(rolls, kgPerRoll, pricePerKg)).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 300 }
    );
  });

  test('more wastage always means more material', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        fc.integer({ min: 0, max: 25 }),
        fc.integer({ min: 0, max: 25 }),
        (qty, w1, w2) => {
          const waste1 = Math.min(w1, w2);
          const waste2 = Math.max(w1, w2);
          if (waste1 < waste2) {
            expect(calculateMaterialNeeded(qty, waste2)).toBeGreaterThan(calculateMaterialNeeded(qty, waste1));
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
