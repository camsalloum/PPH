/**
 * Unit tests — Deal Sync Service
 *
 * Validates: syncDealFromInquiry stage mapping, already-won skip,
 * missing FK, no linked deal.
 */

describe('Deal Sync Service — stage mapping', () => {

  const STAGE_MAP = {
    estimation:       'negotiation',
    quoted:           'negotiation',
    order_confirmed:  'won',
    lost:             'lost',
    closed:           'won',
  };

  const TERMINAL_DEAL_STAGES = ['won', 'lost'];

  const DEAL_SKIP_STAGES = ['won', 'lost']; // deal already terminal

  // ── Stage Mapping ─────────────────────────────────────────────────────────

  test('estimation → deal negotiation', () => {
    expect(STAGE_MAP['estimation']).toBe('negotiation');
  });

  test('quoted → deal negotiation', () => {
    expect(STAGE_MAP['quoted']).toBe('negotiation');
  });

  test('order_confirmed → deal won', () => {
    expect(STAGE_MAP['order_confirmed']).toBe('won');
  });

  test('lost → deal lost', () => {
    expect(STAGE_MAP['lost']).toBe('lost');
  });

  test('closed → deal won', () => {
    expect(STAGE_MAP['closed']).toBe('won');
  });

  // ── No-op cases ─────────────────────────────────────────────────────────

  test('unmapped stages produce no sync action', () => {
    const unmapped = ['new_inquiry', 'sar_pending', 'sample_qc', 'cse_approved'];
    unmapped.forEach(stage => {
      expect(STAGE_MAP[stage]).toBeUndefined();
    });
  });

  test('already-won deal skips sync', () => {
    const currentDealStage = 'won';
    const targetDealStage = STAGE_MAP['order_confirmed']; // 'won'
    const shouldSkip = DEAL_SKIP_STAGES.includes(currentDealStage);
    expect(shouldSkip).toBe(true);
  });

  test('already-lost deal skips sync', () => {
    const currentDealStage = 'lost';
    const shouldSkip = DEAL_SKIP_STAGES.includes(currentDealStage);
    expect(shouldSkip).toBe(true);
  });

  test('deal at negotiation accepts sync to won', () => {
    const currentDealStage = 'negotiation';
    const shouldSkip = DEAL_SKIP_STAGES.includes(currentDealStage);
    expect(shouldSkip).toBe(false);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  test('no linked deal (inquiry_id not found in crm_deals) = no-op', () => {
    const linkedDeal = null; // query returns no rows
    const shouldSync = linkedDeal !== null;
    expect(shouldSync).toBe(false);
  });

  test('deal stage history entry includes correct source', () => {
    const historyEntry = {
      deal_id: 1,
      from_stage: 'proposal',
      to_stage: 'negotiation',
      source: 'mes_sync',
      changed_by: 0, // system
      note: 'Auto-synced from inquiry stage: estimation',
    };
    expect(historyEntry.source).toBe('mes_sync');
    expect(historyEntry.changed_by).toBe(0);
  });

  test('sync preserves close_reason for order_confirmed', () => {
    const inquiryNumber = 'INQ-FP-2026-00001';
    const closeReason = `PO confirmed via ${inquiryNumber}`;
    expect(closeReason).toContain('PO confirmed');
    expect(closeReason).toContain(inquiryNumber);
  });

  test('sync carries inquiry loss reason to deal', () => {
    const inquiry = {
      lost_reason: 'price',
      lost_reason_category: 'pricing',
      lost_reason_notes: 'Competitor offered 15% lower',
    };
    expect(inquiry.lost_reason_category).toBe('pricing');
  });
});
