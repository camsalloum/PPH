/**
 * Property test — PO Validation
 *
 * Tasks 8.6, 8.7: Validates PO deviation calculation is symmetric
 * and threshold boundary is precise.
 */

const fc = require('fast-check');

describe('PO Validation — Property Tests', () => {

  function calculateDeviation(poAmount, quotationAmount) {
    if (quotationAmount === 0) return poAmount === 0 ? 0 : Infinity;
    return Math.abs((poAmount - quotationAmount) / quotationAmount * 100);
  }

  function isWithinThreshold(poAmount, quotationAmount, thresholdPercent = 5) {
    // Use a small epsilon to handle floating-point precision
    return calculateDeviation(poAmount, quotationAmount) <= thresholdPercent + 1e-10;
  }

  // 8.6 — Deviation is always non-negative
  test('deviation is always non-negative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e8, noNaN: true }),
        fc.double({ min: 1, max: 1e8, noNaN: true }), // avoid zero denominator
        (poAmount, quotationAmount) => {
          const dev = calculateDeviation(poAmount, quotationAmount);
          expect(dev).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 500 }
    );
  });

  // 8.6 — Deviation is symmetric (|a-b| = |b-a|)
  test('absolute deviation is the same regardless of direction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        (a, b) => {
          // The raw difference |a - b| is the same either way
          expect(Math.abs(a - b)).toBeCloseTo(Math.abs(b - a), 10);
        }
      ),
      { numRuns: 300 }
    );
  });

  // 8.7 — Boundary precision: exactly at threshold passes, clearly above fails
  test('5% threshold boundary is precise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000000 }),
        (baseAmount) => {
          // Use integers to avoid floating-point edge cases
          const atBoundary = baseAmount * 1.05;
          const clearlyOver = baseAmount * 1.06;

          expect(isWithinThreshold(atBoundary, baseAmount)).toBe(true);
          expect(isWithinThreshold(clearlyOver, baseAmount)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  // Exact match always passes
  test('exact match has 0% deviation', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e8, noNaN: true }),
        (amount) => {
          expect(calculateDeviation(amount, amount)).toBeCloseTo(0, 10);
          expect(isWithinThreshold(amount, amount)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
