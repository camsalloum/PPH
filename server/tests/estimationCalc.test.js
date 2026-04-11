/**
 * Unit tests — Estimation Calculations
 *
 * Validates: GSM formulas, Cost/M² formulas, operation hours,
 * unit conversions with known values.
 */

describe('Estimation Calculations', () => {

  // ── Helper: GSM / weight formulas ─────────────────────────────────────────

  /**
   * Calculate film weight in kg
   * Weight (kg) = Length (m) × Width (m) × GSM (g/m²) / 1000
   */
  function filmWeight(lengthM, widthM, gsm) {
    return (lengthM * widthM * gsm) / 1000;
  }

  /**
   * Calculate cost per square meter
   * Cost/m² = Price per kg × GSM / 1000
   */
  function costPerSqm(pricePerKg, gsm) {
    return (pricePerKg * gsm) / 1000;
  }

  /**
   * Pouch area in m²
   */
  function pouchArea(lengthMm, widthMm) {
    return (lengthMm / 1000) * (widthMm / 1000);
  }

  /**
   * Number of pouches from a roll
   * Assumes width = pouch width, length along roll
   */
  function pouchesPerRoll(rollLengthM, pouchLengthMm) {
    const pouchLengthM = pouchLengthMm / 1000;
    return Math.floor(rollLengthM / pouchLengthM);
  }

  /**
   * Operation hours for given quantity + speed
   */
  function operationHours(quantity, speedPerHour) {
    if (speedPerHour <= 0) return Infinity;
    return quantity / speedPerHour;
  }

  // ── GSM / Weight Tests ────────────────────────────────────────────────────

  test('film weight 100m × 0.5m × 50 GSM = 2.5 kg', () => {
    expect(filmWeight(100, 0.5, 50)).toBeCloseTo(2.5, 4);
  });

  test('film weight 1m × 1m × 1000 GSM = 1 kg', () => {
    expect(filmWeight(1, 1, 1000)).toBeCloseTo(1.0, 4);
  });

  test('film weight zero length = 0 kg', () => {
    expect(filmWeight(0, 0.5, 50)).toBe(0);
  });

  // ── Cost per m² ───────────────────────────────────────────────────────────

  test('cost/m² at $2/kg × 50 GSM = $0.10', () => {
    expect(costPerSqm(2, 50)).toBeCloseTo(0.10, 4);
  });

  test('cost/m² at $3.5/kg × 100 GSM = $0.35', () => {
    expect(costPerSqm(3.5, 100)).toBeCloseTo(0.35, 4);
  });

  test('cost/m² at $0/kg = $0', () => {
    expect(costPerSqm(0, 100)).toBe(0);
  });

  // ── Pouch Area ────────────────────────────────────────────────────────────

  test('pouch 200mm × 300mm = 0.06 m²', () => {
    expect(pouchArea(200, 300)).toBeCloseTo(0.06, 6);
  });

  test('pouch 100mm × 100mm = 0.01 m²', () => {
    expect(pouchArea(100, 100)).toBeCloseTo(0.01, 6);
  });

  // ── Pouches per Roll ──────────────────────────────────────────────────────

  test('1000m roll / 200mm pouch = 5000 pouches', () => {
    expect(pouchesPerRoll(1000, 200)).toBe(5000);
  });

  test('1000m roll / 300mm pouch = 3333 pouches (floor)', () => {
    expect(pouchesPerRoll(1000, 300)).toBe(3333);
  });

  // ── Operation Hours ───────────────────────────────────────────────────────

  test('10000 units at 2000/hr = 5 hours', () => {
    expect(operationHours(10000, 2000)).toBeCloseTo(5.0, 4);
  });

  test('50000 units at 8000/hr = 6.25 hours', () => {
    expect(operationHours(50000, 8000)).toBeCloseTo(6.25, 4);
  });

  test('zero speed returns Infinity', () => {
    expect(operationHours(100, 0)).toBe(Infinity);
  });

  // ── Unit Conversions ──────────────────────────────────────────────────────

  test('mm → m conversion', () => {
    expect(250 / 1000).toBe(0.25);
  });

  test('g/m² → kg/m² conversion', () => {
    expect(50 / 1000).toBe(0.05);
  });

  test('micron → mm conversion', () => {
    expect(25 / 1000).toBe(0.025);
  });

  // ── Multi-Layer Laminate ──────────────────────────────────────────────────

  test('total laminate GSM = sum of layers', () => {
    const layers = [
      { material: 'PET', gsm: 12 },
      { material: 'ALU', gsm: 7 },
      { material: 'PE', gsm: 50 },
    ];
    const totalGsm = layers.reduce((s, l) => s + l.gsm, 0);
    expect(totalGsm).toBe(69);
  });

  test('total laminate cost = sum of layer costs', () => {
    const layers = [
      { material: 'PET', gsm: 12, pricePerKg: 3.00 },
      { material: 'ALU', gsm: 7, pricePerKg: 5.00 },
      { material: 'PE', gsm: 50, pricePerKg: 1.50 },
    ];
    const totalCostPerSqm = layers.reduce(
      (sum, l) => sum + costPerSqm(l.pricePerKg, l.gsm), 0
    );
    // PET: 0.036, ALU: 0.035, PE: 0.075 → total 0.146
    expect(totalCostPerSqm).toBeCloseTo(0.146, 3);
  });

  // ── Wastage ───────────────────────────────────────────────────────────────

  test('adding 5% wastage to quantity', () => {
    const qty = 100000;
    const wastagePercent = 5;
    const withWastage = qty * (1 + wastagePercent / 100);
    expect(withWastage).toBe(105000);
  });

  test('production quantity rounds up to nearest 1000', () => {
    const rawQty = 104500;
    const rounded = Math.ceil(rawQty / 1000) * 1000;
    expect(rounded).toBe(105000);
  });
});
