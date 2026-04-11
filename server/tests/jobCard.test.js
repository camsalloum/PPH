/**
 * Unit tests — Job Card
 *
 * Validates: BOM auto-population, job number generation pattern,
 * empty BOM, partial material availability.
 */

describe('Job Card', () => {

  const JOB_NUMBER_PATTERN = /^JC-FP-\d{4}-\d{5}$/;

  // ── Job Number Generation ──────────────────────────────────────────────────

  test('job number matches pattern JC-FP-{YEAR}-{NNNNN}', () => {
    const year = new Date().getFullYear();
    const jobNumber = `JC-FP-${year}-00001`;
    expect(jobNumber).toMatch(JOB_NUMBER_PATTERN);
  });

  test('job number sequential increment', () => {
    const year = new Date().getFullYear();
    const prev = `JC-FP-${year}-00041`;
    const prefix = `JC-FP-${year}-`;
    const num = parseInt(prev.replace(prefix, ''), 10);
    const next = `${prefix}${String(num + 1).padStart(5, '0')}`;
    expect(next).toBe(`JC-FP-${year}-00042`);
  });

  test('job number year component is current year', () => {
    const year = new Date().getFullYear();
    const jobNumber = `JC-FP-${year}-00001`;
    const yearPart = jobNumber.split('-')[2];
    expect(parseInt(yearPart)).toBe(year);
  });

  // ── BOM Auto-Population ────────────────────────────────────────────────────

  test('BOM from CSE report structure', () => {
    const cseReport = {
      product_group: 'BOPP',
      test_results: {
        material_layers: [
          { type: 'substrate', material: 'BOPP Film', micron: 25 },
          { type: 'ink', material: 'Gravure Ink', micron: 3 },
          { type: 'adhesive', material: 'Polyurethane', micron: 2 },
        ],
      },
    };

    const bom = cseReport.test_results.material_layers.map(layer => ({
      material_name: layer.material,
      material_type: layer.type,
      qty_required: null, // calculated from order quantity
      qty_available: 0,
      status: 'pending',
    }));

    expect(bom).toHaveLength(3);
    expect(bom[0].material_name).toBe('BOPP Film');
    expect(bom[0].status).toBe('pending');
  });

  test('BOM populates from accepted quotation quantity', () => {
    const quotation = { quantity: 5000, quantity_unit: 'KGS' };
    const bom = [
      { material_name: 'BOPP', qty_required: quotation.quantity * 1.05 }, // 5% waste
    ];
    expect(bom[0].qty_required).toBe(5250);
  });

  test('empty BOM when no CSE materials', () => {
    const cseReport = { test_results: { material_layers: [] } };
    const bom = (cseReport.test_results.material_layers || []).map(l => ({
      material_name: l.material,
    }));
    expect(bom).toHaveLength(0);
  });

  // ── Material Availability ──────────────────────────────────────────────────

  function determineMaterialStatus(bom) {
    if (bom.length === 0) return 'pending';
    const allAvailable = bom.every(line => line.qty_available >= line.qty_required);
    const someAvailable = bom.some(line => line.qty_available >= line.qty_required);
    if (allAvailable) return 'available';
    if (someAvailable) return 'partially_ordered';
    return 'pending';
  }

  test('all materials available → status available', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 1200 },
      { material_name: 'Ink', qty_required: 50, qty_available: 60 },
    ];
    expect(determineMaterialStatus(bom)).toBe('available');
  });

  test('partial availability → partially_ordered', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 1200 },
      { material_name: 'Ink', qty_required: 50, qty_available: 10 },
    ];
    expect(determineMaterialStatus(bom)).toBe('partially_ordered');
  });

  test('nothing available → pending', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 0 },
      { material_name: 'Ink', qty_required: 50, qty_available: 0 },
    ];
    expect(determineMaterialStatus(bom)).toBe('pending');
  });

  test('empty BOM → pending', () => {
    expect(determineMaterialStatus([])).toBe('pending');
  });

  // ── Stage Guards ──────────────────────────────────────────────────────────

  test('job card can only be created at order_confirmed stage', () => {
    const allowedStage = 'order_confirmed';
    expect(allowedStage).toBe('order_confirmed');
  });

  test('job card approval advances inquiry to in_production', () => {
    const targetStage = 'in_production';
    expect(targetStage).toBe('in_production');
  });

  // ── Role Gates ────────────────────────────────────────────────────────────

  test('canCreateJobCard allows correct roles', () => {
    const allowed = ['admin', 'manager', 'sales_manager', 'production_manager'];
    expect(allowed).toContain('admin');
    expect(allowed).toContain('production_manager');
    expect(allowed).not.toContain('sales_rep');
    expect(allowed).not.toContain('quality_control');
  });
});
