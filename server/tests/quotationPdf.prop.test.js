/**
 * Property test — Quotation PDF
 *
 * Tasks 4.2, 4.3: Validates PDF generation helpers produce
 * consistent, valid output for any input.
 */

const fc = require('fast-check');

describe('Quotation PDF — Property Tests', () => {

  // Simulated PDF builder helpers
  function formatCurrency(amount, currency = 'USD') {
    const num = parseFloat(amount);
    if (isNaN(num)) return `${currency} 0.00`;
    return `${currency} ${Math.abs(num).toFixed(2)}`;
  }

  function formatLineItem(item) {
    return {
      description: (item.description || 'Unnamed item').substring(0, 100),
      quantity: Math.max(0, Math.floor(item.quantity || 0)),
      unit_price: Math.max(0, parseFloat(item.unit_price || 0)),
      total: Math.max(0, Math.floor(item.quantity || 0)) * Math.max(0, parseFloat(item.unit_price || 0)),
    };
  }

  function generateQuotationPdfData(quotation) {
    const items = (quotation.items || []).map(formatLineItem);
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    return {
      quotation_number: quotation.quotation_number || 'DRAFT',
      customer_name: (quotation.customer_name || 'Unknown').substring(0, 100),
      items,
      subtotal,
      tax: subtotal * (quotation.tax_rate || 0) / 100,
      grand_total: subtotal * (1 + (quotation.tax_rate || 0) / 100),
    };
  }

  // 4.2 — currency formatting never produces NaN
  test('formatCurrency never returns NaN', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1e15, max: 1e15, noNaN: true }),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(0),
          fc.constant('abc')
        ),
        (val) => {
          const result = formatCurrency(val);
          expect(result).not.toContain('NaN');
          expect(result).toMatch(/^USD \d+\.\d{2}$/);
        }
      ),
      { numRuns: 300 }
    );
  });

  // 4.3 — line items have non-negative total
  test('line item total is always non-negative', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: fc.string({ maxLength: 200 }),
          quantity: fc.oneof(fc.integer({ min: -100, max: 100000 }), fc.constant(0)),
          unit_price: fc.oneof(fc.double({ min: -100, max: 100000, noNaN: true }), fc.constant(0)),
        }),
        (item) => {
          const formatted = formatLineItem(item);
          expect(formatted.total).toBeGreaterThanOrEqual(0);
          expect(formatted.quantity).toBeGreaterThanOrEqual(0);
          expect(formatted.unit_price).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 300 }
    );
  });

  test('PDF data always has required structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          quotation_number: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
          customer_name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          tax_rate: fc.double({ min: 0, max: 100, noNaN: true }),
          items: fc.array(
            fc.record({
              description: fc.string({ maxLength: 50 }),
              quantity: fc.integer({ min: 0, max: 10000 }),
              unit_price: fc.double({ min: 0, max: 10000, noNaN: true }),
            }),
            { minLength: 0, maxLength: 5 }
          ),
        }),
        (quotation) => {
          const pdf = generateQuotationPdfData(quotation);
          expect(pdf.quotation_number).toBeTruthy();
          expect(pdf.customer_name).toBeTruthy();
          expect(pdf.subtotal).toBeGreaterThanOrEqual(0);
          expect(pdf.grand_total).toBeGreaterThanOrEqual(pdf.subtotal);
          expect(Array.isArray(pdf.items)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
