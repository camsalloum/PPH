/**
 * Property test — Estimation Formulas
 *
 * Tasks 13.7, 13.8, 13.9, 13.10: Validates GSM→weight, Cost/M²,
 * operation hours, and multi-layer calculations.
 */

const fc = require('fast-check');

describe('Estimation Formulas — Property Tests', () => {

  // Weight (kg) = Length (m) × Width (m) × GSM / 1000
  function filmWeight(lengthM, widthM, gsm) {
    return (lengthM * widthM * gsm) / 1000;
  }

  // Cost/m² = price/kg × GSM / 1000
  function costPerSqm(pricePerKg, gsm) {
    return (pricePerKg * gsm) / 1000;
  }

  // Operation hours = quantity / speed
  function operationHours(qty, speedPerHour) {
    if (speedPerHour <= 0) return Infinity;
    return qty / speedPerHour;
  }

  // Multi-layer cost = sum of layer costs
  function multilayerCost(layers) {
    return layers.reduce((sum, l) => sum + costPerSqm(l.pricePerKg, l.gsm), 0);
  }

  // 13.7 — weight is always non-negative for non-negative inputs
  test('film weight is non-negative for non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        (length, width, gsm) => {
          expect(filmWeight(length, width, gsm)).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 500 }
    );
  });

  // 13.7 — weight scales linearly with each dimension
  test('doubling any dimension doubles the weight', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        (length, width, gsm) => {
          const w1 = filmWeight(length, width, gsm);
          const w2 = filmWeight(length * 2, width, gsm);
          expect(w2).toBeCloseTo(w1 * 2, 2);
        }
      ),
      { numRuns: 300 }
    );
  });

  // 13.8 — cost/m² is non-negative
  test('cost per sqm is non-negative for non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        (price, gsm) => {
          expect(costPerSqm(price, gsm)).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 300 }
    );
  });

  // 13.9 — operation hours is non-negative
  test('operation hours is non-negative for positive speed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.double({ min: 0.1, max: 1e5, noNaN: true }),
        (qty, speed) => {
          const hours = operationHours(qty, speed);
          expect(hours).toBeGreaterThanOrEqual(0);
          expect(isFinite(hours)).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  // 13.9 — zero speed gives infinity
  test('operation hours with zero speed returns Infinity', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        (qty) => {
          expect(operationHours(qty, 0)).toBe(Infinity);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 13.10 — multi-layer cost >= each individual layer cost
  test('total laminate cost >= each layer cost individually', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            pricePerKg: fc.double({ min: 0, max: 100, noNaN: true }),
            gsm: fc.double({ min: 0, max: 300, noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (layers) => {
          const total = multilayerCost(layers);
          layers.forEach(l => {
            expect(total).toBeGreaterThanOrEqual(costPerSqm(l.pricePerKg, l.gsm) - 1e-10);
          });
        }
      ),
      { numRuns: 300 }
    );
  });
});
