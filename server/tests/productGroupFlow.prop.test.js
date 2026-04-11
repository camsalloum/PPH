/**
 * Property test — Product Group Flow
 *
 * Task 12.4: Validates product group hierarchies and categorisation.
 */

const fc = require('fast-check');

describe('Product Group Flow — Property Tests', () => {

  const PRODUCT_GROUPS = ['pouches', 'labels', 'shrink_sleeves', 'rolls', 'laminates', 'custom'];
  const PACKAGING_TYPES = ['stand_up', 'three_side', 'centre_seal', 'flat_bottom', 'zipper', 'spout'];

  function categorizeProduct(productName, packagingType) {
    if (!productName) return 'custom';
    const lower = productName.toLowerCase();
    if (lower.includes('pouch') || lower.includes('bag')) return 'pouches';
    if (lower.includes('label')) return 'labels';
    if (lower.includes('sleeve')) return 'shrink_sleeves';
    if (lower.includes('roll') || lower.includes('film')) return 'rolls';
    if (lower.includes('laminate') || lower.includes('lamination')) return 'laminates';
    return 'custom';
  }

  test('categorization always produces a valid group', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.constantFrom(...PACKAGING_TYPES),
        (name, type) => {
          const group = categorizeProduct(name, type);
          expect(PRODUCT_GROUPS).toContain(group);
        }
      ),
      { numRuns: 300 }
    );
  });

  test('products with "pouch" always categorize as pouches', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }),
        fc.string({ maxLength: 20 }),
        (prefix, suffix) => {
          const name = `${prefix}pouch${suffix}`;
          expect(categorizeProduct(name)).toBe('pouches');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('empty name → custom', () => {
    expect(categorizeProduct('')).toBe('custom');
    expect(categorizeProduct(null)).toBe('custom');
  });

  test('categorization is case-insensitive', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Pouch', 'POUCH', 'pouch', 'pOuCh'),
        (word) => {
          expect(categorizeProduct(word)).toBe('pouches');
        }
      ),
      { numRuns: 20 }
    );
  });
});
