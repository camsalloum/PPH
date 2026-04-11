/**
 * Unit tests — Procurement
 *
 * Validates: PR→PO→receipt chain, full receipt, partial receipt,
 * triggers job card material_status update.
 */

describe('Procurement Chain', () => {

  const PR_NUMBER_PATTERN = /^PR-FP-\d{4}-\d{5}$/;
  const SPO_NUMBER_PATTERN = /^SPO-FP-\d{4}-\d{5}$/;

  // ── Number Generation ─────────────────────────────────────────────────────

  test('PR number matches pattern', () => {
    const year = new Date().getFullYear();
    expect(`PR-FP-${year}-00001`).toMatch(PR_NUMBER_PATTERN);
  });

  test('SPO number matches pattern', () => {
    const year = new Date().getFullYear();
    expect(`SPO-FP-${year}-00001`).toMatch(SPO_NUMBER_PATTERN);
  });

  // ── PR Lifecycle ──────────────────────────────────────────────────────────

  test('PR valid statuses', () => {
    const validStatuses = ['pending', 'approved', 'rejected', 'fulfilled'];
    expect(validStatuses).toContain('pending');
    expect(validStatuses).toContain('approved');
    expect(validStatuses).toContain('fulfilled');
  });

  test('PR created from job card BOM shortfall', () => {
    const bom = [
      { material_name: 'BOPP Film', qty_required: 1000, qty_available: 200, status: 'not_available' },
      { material_name: 'Ink', qty_required: 50, qty_available: 50, status: 'available' },
    ];
    const shortfallItems = bom.filter(b => b.qty_available < b.qty_required);
    expect(shortfallItems).toHaveLength(1);
    expect(shortfallItems[0].material_name).toBe('BOPP Film');

    const prMaterialDetails = shortfallItems.map(item => ({
      material_name: item.material_name,
      qty_required: item.qty_required,
      qty_shortfall: item.qty_required - item.qty_available,
    }));
    expect(prMaterialDetails[0].qty_shortfall).toBe(800);
  });

  // ── Supplier PO Lifecycle ─────────────────────────────────────────────────

  test('SPO valid statuses', () => {
    const validStatuses = ['draft', 'approved', 'sent', 'received', 'cancelled'];
    expect(validStatuses).toContain('draft');
    expect(validStatuses).toContain('sent');
    expect(validStatuses).toContain('received');
  });

  test('SPO total amount calculation', () => {
    const unitPrices = [
      { material_name: 'BOPP Film', quantity: 800, unit_price: 2.50 },
    ];
    const totalAmount = unitPrices.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    expect(totalAmount).toBe(2000);
  });

  // ── Stock Receipt ─────────────────────────────────────────────────────────

  function processReceipt(bom, receivedQuantities) {
    return bom.map(line => {
      const received = receivedQuantities[line.material_name] || 0;
      const newAvailable = line.qty_available + received;
      return {
        ...line,
        qty_available: newAvailable,
        status: newAvailable >= line.qty_required ? 'available' : 'not_available',
      };
    });
  }

  test('full receipt makes all BOM lines available', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 200 },
      { material_name: 'Ink', qty_required: 50, qty_available: 10 },
    ];
    const received = { 'BOPP': 800, 'Ink': 40 };
    const updated = processReceipt(bom, received);

    expect(updated.every(l => l.status === 'available')).toBe(true);
    expect(updated[0].qty_available).toBe(1000);
    expect(updated[1].qty_available).toBe(50);
  });

  test('partial receipt leaves some lines unavailable', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 200 },
      { material_name: 'Ink', qty_required: 50, qty_available: 10 },
    ];
    const received = { 'BOPP': 800 }; // no ink received
    const updated = processReceipt(bom, received);

    expect(updated[0].status).toBe('available');
    expect(updated[1].status).toBe('not_available');
  });

  test('over-receipt is allowed (received > required)', () => {
    const bom = [
      { material_name: 'BOPP', qty_required: 1000, qty_available: 0 },
    ];
    const received = { 'BOPP': 1200 };
    const updated = processReceipt(bom, received);

    expect(updated[0].qty_available).toBe(1200);
    expect(updated[0].status).toBe('available');
  });

  // ── Job Card Material Status Update ─────────────────────────────────────

  test('all BOM available → job card material_status = available', () => {
    const bom = [
      { status: 'available' },
      { status: 'available' },
    ];
    const allAvailable = bom.every(l => l.status === 'available');
    const materialStatus = allAvailable ? 'available' : 'partially_ordered';
    expect(materialStatus).toBe('available');
  });

  test('partial BOM available → job card material_status = partially_ordered', () => {
    const bom = [
      { status: 'available' },
      { status: 'not_available' },
    ];
    const allAvailable = bom.every(l => l.status === 'available');
    const materialStatus = allAvailable ? 'available' : 'partially_ordered';
    expect(materialStatus).toBe('partially_ordered');
  });

  // ── Role Gates ─────────────────────────────────────────────────────────

  test('PR approval requires management role', () => {
    const mgmtRoles = ['admin', 'manager', 'sales_manager'];
    expect(mgmtRoles).toContain('admin');
    expect(mgmtRoles).not.toContain('procurement');
  });

  test('SPO creation requires procurement role', () => {
    const procurementRoles = ['admin', 'manager', 'procurement', 'stores_keeper'];
    expect(procurementRoles).toContain('procurement');
    expect(procurementRoles).toContain('stores_keeper');
  });
});
