/**
 * Property test — Material Master
 *
 * Task 12.5: Validates material master data integrity.
 */

const fc = require('fast-check');

describe('Material Master — Property Tests', () => {

  const MATERIAL_TYPES = ['raw', 'semi_finished', 'finished', 'consumable', 'packaging'];
  const UOM = ['kg', 'g', 'm', 'mm', 'pcs', 'roll', 'sheet', 'litre', 'ml'];

  function validateMaterial(material) {
    const errors = [];
    if (!material.name || material.name.trim().length === 0) errors.push('Name required');
    if (!MATERIAL_TYPES.includes(material.type)) errors.push('Invalid type');
    if (!UOM.includes(material.uom)) errors.push('Invalid UOM');
    if (typeof material.unit_price !== 'number' || material.unit_price < 0) errors.push('Invalid price');
    if (typeof material.min_stock !== 'number' || material.min_stock < 0) errors.push('Invalid min_stock');
    return { valid: errors.length === 0, errors };
  }

  test('valid materials always pass validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          type: fc.constantFrom(...MATERIAL_TYPES),
          uom: fc.constantFrom(...UOM),
          unit_price: fc.double({ min: 0, max: 100000, noNaN: true }),
          min_stock: fc.integer({ min: 0, max: 100000 }),
        }),
        (material) => {
          const result = validateMaterial(material);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  test('blank name always fails', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', null, undefined),
        (badName) => {
          const result = validateMaterial({
            name: badName, type: 'raw', uom: 'kg', unit_price: 10, min_stock: 100,
          });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('negative price always fails', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100000, max: -0.01, noNaN: true }),
        (badPrice) => {
          const result = validateMaterial({
            name: 'Test', type: 'raw', uom: 'kg', unit_price: badPrice, min_stock: 0,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Invalid price');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unknown type always fails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !MATERIAL_TYPES.includes(s)),
        (badType) => {
          const result = validateMaterial({
            name: 'Test', type: badType, uom: 'kg', unit_price: 10, min_stock: 0,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Invalid type');
        }
      ),
      { numRuns: 100 }
    );
  });
});
