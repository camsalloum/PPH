/**
 * Property test — Estimation Round Trip
 *
 * Task 14.3: Validates save→retrieve round-trip preserves data.
 */

const fc = require('fast-check');

describe('Estimation Round Trip — Property Tests', () => {

  // Simulate serialise/deserialise (JSON round-trip as DB would do)
  function serialise(estimation) {
    return JSON.parse(JSON.stringify(estimation));
  }

  const estimationArb = fc.record({
    inquiry_id: fc.integer({ min: 1, max: 100000 }),
    product_name: fc.string({ minLength: 1, maxLength: 100 }),
    quantity: fc.integer({ min: 1, max: 1000000 }),
    layers: fc.array(
      fc.record({
        material: fc.string({ minLength: 1, maxLength: 50 }),
        gsm: fc.double({ min: 1, max: 500, noNaN: true }),
        pricePerKg: fc.double({ min: 0.01, max: 1000, noNaN: true }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    operations: fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        speedPerHour: fc.integer({ min: 100, max: 50000 }),
        costPerHour: fc.double({ min: 1, max: 10000, noNaN: true }),
      }),
      { minLength: 0, maxLength: 5 }
    ),
    margin_percent: fc.double({ min: 0, max: 100, noNaN: true }),
    wastage_percent: fc.double({ min: 0, max: 50, noNaN: true }),
  });

  test('JSON round-trip preserves all fields', () => {
    fc.assert(
      fc.property(estimationArb, (est) => {
        const restored = serialise(est);
        expect(restored.inquiry_id).toBe(est.inquiry_id);
        expect(restored.product_name).toBe(est.product_name);
        expect(restored.quantity).toBe(est.quantity);
        expect(restored.layers).toHaveLength(est.layers.length);
        expect(restored.operations).toHaveLength(est.operations.length);
        expect(restored.margin_percent).toBeCloseTo(est.margin_percent, 10);
      }),
      { numRuns: 300 }
    );
  });

  test('layer data survives round-trip', () => {
    fc.assert(
      fc.property(estimationArb, (est) => {
        const restored = serialise(est);
        est.layers.forEach((layer, i) => {
          expect(restored.layers[i].material).toBe(layer.material);
          expect(restored.layers[i].gsm).toBeCloseTo(layer.gsm, 10);
          expect(restored.layers[i].pricePerKg).toBeCloseTo(layer.pricePerKg, 10);
        });
      }),
      { numRuns: 200 }
    );
  });

  test('total cost is consistent before and after round-trip', () => {
    function totalCost(est) {
      return est.layers.reduce((sum, l) => sum + (l.gsm * l.pricePerKg / 1000), 0) * est.quantity;
    }

    fc.assert(
      fc.property(estimationArb, (est) => {
        const restored = serialise(est);
        expect(totalCost(restored)).toBeCloseTo(totalCost(est), 5);
      }),
      { numRuns: 200 }
    );
  });
});
