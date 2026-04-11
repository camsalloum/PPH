/**
 * Property test — Delivery Feedback
 *
 * Task 9.5: Validates delivery feedback rating and comment validation.
 */

const fc = require('fast-check');

describe('Delivery Feedback — Property Tests', () => {

  function validateFeedback(feedback) {
    const errors = [];
    if (typeof feedback.rating !== 'number' || feedback.rating < 1 || feedback.rating > 5) {
      errors.push('Rating must be 1-5');
    }
    if (!Number.isInteger(feedback.rating)) {
      errors.push('Rating must be integer');
    }
    if (feedback.comment && feedback.comment.length > 500) {
      errors.push('Comment too long');
    }
    if (!feedback.delivery_id || feedback.delivery_id <= 0) {
      errors.push('Invalid delivery_id');
    }
    return { valid: errors.length === 0, errors };
  }

  test('valid feedback always passes validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          delivery_id: fc.integer({ min: 1, max: 100000 }),
          rating: fc.integer({ min: 1, max: 5 }),
          comment: fc.string({ minLength: 0, maxLength: 500 }),
        }),
        (feedback) => {
          const result = validateFeedback(feedback);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('rating outside 1-5 always fails', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 100 }),
        (badRating) => {
          const result = validateFeedback({ delivery_id: 1, rating: badRating, comment: '' });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Rating must be 1-5');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('comment over 500 chars fails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 501, maxLength: 1000 }),
        (longComment) => {
          const result = validateFeedback({ delivery_id: 1, rating: 3, comment: longComment });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Comment too long');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('zero or negative delivery_id fails', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        (badId) => {
          const result = validateFeedback({ delivery_id: badId, rating: 3, comment: 'OK' });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
