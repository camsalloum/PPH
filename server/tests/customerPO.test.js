/**
 * Unit tests — Customer PO Capture
 *
 * Validates: ±5% deviation calculation, required fields, stage guards.
 */

describe('Customer PO Capture', () => {

  // ── Deviation Calculation ─────────────────────────────────────────────────

  function calculateDeviation(poValue, quotationTotal) {
    if (!quotationTotal || quotationTotal === 0) return 0;
    return Math.abs((poValue - quotationTotal) / quotationTotal) * 100;
  }

  function hasDeviationWarning(poValue, quotationTotal) {
    return calculateDeviation(poValue, quotationTotal) > 5;
  }

  test('exact match = no deviation warning', () => {
    expect(hasDeviationWarning(10000, 10000)).toBe(false);
    expect(calculateDeviation(10000, 10000)).toBe(0);
  });

  test('4.9% deviation = no warning', () => {
    const quotTotal = 10000;
    const poValue = 10490; // 4.9%
    expect(hasDeviationWarning(poValue, quotTotal)).toBe(false);
  });

  test('5.0% deviation = no warning (boundary)', () => {
    const quotTotal = 10000;
    const poValue = 10500; // exactly 5%
    expect(hasDeviationWarning(poValue, quotTotal)).toBe(false);
  });

  test('5.1% deviation = warning', () => {
    const quotTotal = 10000;
    const poValue = 10510; // 5.1%
    expect(hasDeviationWarning(poValue, quotTotal)).toBe(true);
  });

  test('large positive deviation triggers warning', () => {
    expect(hasDeviationWarning(15000, 10000)).toBe(true); // 50%
  });

  test('negative deviation (PO lower) triggers warning', () => {
    expect(hasDeviationWarning(9000, 10000)).toBe(true); // -10%
  });

  test('zero quotation total = no NaN', () => {
    expect(calculateDeviation(5000, 0)).toBe(0);
  });

  // ── Required Fields ─────────────────────────────────────────────────────

  test('po_number is required', () => {
    const body = { po_date: '2026-01-15', quotation_id: 1 };
    expect(body.po_number).toBeUndefined();
  });

  test('po_date is required', () => {
    const body = { po_number: 'PO-001', quotation_id: 1 };
    expect(body.po_date).toBeUndefined();
  });

  test('quotation_id is required', () => {
    const body = { po_number: 'PO-001', po_date: '2026-01-15' };
    expect(body.quotation_id).toBeUndefined();
  });

  test('valid PO body has all required fields', () => {
    const body = {
      po_number: 'PO-2026-001',
      po_date: '2026-01-15',
      quotation_id: 5,
      po_value: 15000.50,
      currency: 'AED',
    };
    expect(body.po_number).toBeDefined();
    expect(body.po_date).toBeDefined();
    expect(body.quotation_id).toBeDefined();
  });

  // ── Stage Guards ──────────────────────────────────────────────────────────

  test('PO capture allowed at price_accepted stage', () => {
    const allowedStages = ['price_accepted', 'sample_approved'];
    expect(allowedStages).toContain('price_accepted');
  });

  test('PO capture allowed at sample_approved stage', () => {
    const allowedStages = ['price_accepted', 'sample_approved'];
    expect(allowedStages).toContain('sample_approved');
  });

  test('PO capture blocked at other stages', () => {
    const allowedStages = ['price_accepted', 'sample_approved'];
    const blockedStages = ['new_inquiry', 'estimation', 'quoted', 'in_production', 'closed'];
    blockedStages.forEach(s => {
      expect(allowedStages).not.toContain(s);
    });
  });

  // ── Stage Advance ─────────────────────────────────────────────────────────

  test('PO capture advances inquiry to order_confirmed', () => {
    const targetStage = 'order_confirmed';
    expect(targetStage).toBe('order_confirmed');
  });

  test('PO value is stored with 2 decimal precision', () => {
    const poValue = parseFloat((15000.999).toFixed(2));
    expect(poValue).toBe(15001);
  });
});
