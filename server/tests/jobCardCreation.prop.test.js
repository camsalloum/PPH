/**
 * Property test — Job Card Creation
 *
 * Task 11.4: Validates job card number generation and BOM structure.
 */

const fc = require('fast-check');

describe('Job Card Creation — Property Tests', () => {

  const JOB_NUMBER_PATTERN = /^JC-FP-\d{4}-\d{5}$/;

  function generateJobNumber(year, seq) {
    return `JC-FP-${year}-${String(seq).padStart(5, '0')}`;
  }

  function createJobCard(inquiry, seq) {
    const year = new Date().getFullYear();
    return {
      job_number: generateJobNumber(year, seq),
      inquiry_id: inquiry.id,
      product_name: inquiry.product_name || 'Unknown',
      bom: inquiry.bom || [],
      status: 'pending',
      material_status: inquiry.bom?.length ? 'pending' : 'not_applicable',
    };
  }

  test('job number always matches pattern', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2099 }),
        fc.integer({ min: 1, max: 99999 }),
        (year, seq) => {
          const jn = generateJobNumber(year, seq);
          expect(jn).toMatch(JOB_NUMBER_PATTERN);
        }
      ),
      { numRuns: 300 }
    );
  });

  test('sequential job numbers are unique', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2099 }),
        fc.array(fc.integer({ min: 1, max: 99999 }), { minLength: 2, maxLength: 50 }),
        (year, seqs) => {
          const uniqueSeqs = [...new Set(seqs)];
          const numbers = uniqueSeqs.map(s => generateJobNumber(year, s));
          expect(new Set(numbers).size).toBe(uniqueSeqs.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('job card inherits product name from inquiry', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1 }),
          product_name: fc.string({ minLength: 1, maxLength: 100 }),
          bom: fc.array(fc.record({
            material: fc.string({ minLength: 1, maxLength: 50 }),
            qty_required: fc.integer({ min: 1, max: 10000 }),
          }), { maxLength: 5 }),
        }),
        fc.integer({ min: 1, max: 99999 }),
        (inquiry, seq) => {
          const jc = createJobCard(inquiry, seq);
          expect(jc.product_name).toBe(inquiry.product_name);
          expect(jc.inquiry_id).toBe(inquiry.id);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('empty BOM sets material_status to not_applicable', () => {
    const jc = createJobCard({ id: 1, product_name: 'Test', bom: [] }, 1);
    expect(jc.material_status).toBe('not_applicable');
  });

  test('non-empty BOM sets material_status to pending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            material: fc.string({ minLength: 1, maxLength: 30 }),
            qty_required: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (bom) => {
          const jc = createJobCard({ id: 1, product_name: 'Test', bom }, 1);
          expect(jc.material_status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });
});
