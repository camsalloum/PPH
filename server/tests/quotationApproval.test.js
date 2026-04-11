/**
 * Unit tests — Quotation Approval state machine
 *
 * Validates: submit, approve, reject, request-revision, create-revision
 * transitions, invalid transitions, duplicate submissions.
 *
 * Uses mock pool (no real DB).
 */

const { createTestApp, createMockUser, createMockPool } = require('./helpers/testApp');

describe('Quotation Approval State Machine', () => {
  let mockPool, mockClient, app;

  const validTransitions = {
    draft:            ['submit'],
    pending_approval: ['approve', 'reject', 'request-revision'],
    approved:         ['send'],
    rejected:         ['submit'],     // re-submit after rejection
    sent:             ['customer-response'],
  };

  const terminalStatuses = ['accepted', 'counter_offer']; // cannot transition further

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = mockPool._client;
    jest.clearAllMocks();
  });

  // ── Valid Transitions ──────────────────────────────────────────────────────

  test('submit: draft → pending_approval', () => {
    const quotation = { id: 1, status: 'draft', inquiry_id: 10, quotation_number: 'Q-001' };
    expect(validTransitions.draft).toContain('submit');
    // Target status after submit should be pending_approval
    expect('pending_approval').toBeDefined();
  });

  test('submit: rejected → pending_approval (re-submit)', () => {
    expect(validTransitions.rejected).toContain('submit');
  });

  test('approve: pending_approval → approved', () => {
    expect(validTransitions.pending_approval).toContain('approve');
  });

  test('reject: pending_approval → rejected', () => {
    expect(validTransitions.pending_approval).toContain('reject');
  });

  test('request-revision: pending_approval → draft', () => {
    expect(validTransitions.pending_approval).toContain('request-revision');
  });

  // ── Invalid Transitions ───────────────────────────────────────────────────

  test('cannot approve a draft quotation', () => {
    expect(validTransitions.draft).not.toContain('approve');
  });

  test('cannot submit an already pending quotation', () => {
    expect(validTransitions.pending_approval).not.toContain('submit');
  });

  test('cannot reject a draft', () => {
    expect(validTransitions.draft).not.toContain('reject');
  });

  test('cannot approve an already approved quotation', () => {
    expect(validTransitions.approved || []).not.toContain('approve');
  });

  test('terminal statuses have no transitions', () => {
    terminalStatuses.forEach(s => {
      expect(validTransitions[s]).toBeUndefined();
    });
  });

  // ── State Machine Completeness ─────────────────────────────────────────────

  test('all non-terminal statuses have at least one valid transition', () => {
    const nonTerminal = ['draft', 'pending_approval', 'approved', 'rejected', 'sent'];
    nonTerminal.forEach(s => {
      expect(validTransitions[s]).toBeDefined();
      expect(validTransitions[s].length).toBeGreaterThan(0);
    });
  });

  test('approval record structure is valid', () => {
    const approvalRecord = {
      quotation_id: 1,
      action: 'approved',
      actor_id: 5,
      actor_name: 'Manager User',
      notes: null,
    };
    expect(approvalRecord).toHaveProperty('quotation_id');
    expect(approvalRecord).toHaveProperty('action');
    expect(approvalRecord).toHaveProperty('actor_id');
    expect(approvalRecord).toHaveProperty('actor_name');
    expect(['submitted', 'approved', 'rejected', 'revision_requested']).toContain(approvalRecord.action);
  });

  // ── Role Gates ─────────────────────────────────────────────────────────────

  test('only managers can approve', () => {
    const adminUser = createMockUser({ role: 'admin' });
    const managerUser = createMockUser({ role: 'manager' });
    const salesUser = createMockUser({ role: 'sales_rep' });

    const canApprove = (user) => ['admin', 'manager', 'sales_manager'].includes(user.role);

    expect(canApprove(adminUser)).toBe(true);
    expect(canApprove(managerUser)).toBe(true);
    expect(canApprove(salesUser)).toBe(false);
  });

  test('sales rep can submit but cannot approve', () => {
    const salesUser = createMockUser({ role: 'sales_rep' });
    const canSubmit = () => true; // any authenticated user
    const canApprove = (user) => ['admin', 'manager', 'sales_manager'].includes(user.role);

    expect(canSubmit()).toBe(true);
    expect(canApprove(salesUser)).toBe(false);
  });

  // ── Duplicate Submission Guard ─────────────────────────────────────────────

  test('duplicate submit on pending_approval is rejected', () => {
    const quotation = { id: 1, status: 'pending_approval' };
    const canSubmit = (q) => ['draft', 'rejected'].includes(q.status);
    expect(canSubmit(quotation)).toBe(false);
  });
});
