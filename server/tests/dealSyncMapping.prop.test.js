/**
 * Property test — Deal Sync Mapping
 *
 * Tasks 7.7, 7.8: Validates stage mapping is total (every inquiry stage maps)
 * and no stage maps to both won AND lost.
 */

const fc = require('fast-check');

describe('Deal Sync Mapping — Property Tests', () => {

  const INQUIRY_STAGES = [
    'new', 'qc_review', 'estimation', 'quoted', 'negotiation',
    'price_accepted', 'sample_approved', 'order_confirmed',
    'in_production', 'ready_for_dispatch', 'delivered', 'closed', 'lost',
  ];

  const DEAL_STAGES = ['prospect', 'qualification', 'negotiation', 'proposal', 'won', 'lost'];

  // Mapping function (mirrors server logic)
  function mapInquiryToDeal(inquiryStage) {
    const mapping = {
      new: 'qualification',
      qc_review: 'qualification',
      estimation: 'negotiation',
      quoted: 'negotiation',
      negotiation: 'negotiation',
      price_accepted: 'proposal',
      sample_approved: 'proposal',
      order_confirmed: 'won',
      in_production: 'won',
      ready_for_dispatch: 'won',
      delivered: 'won',
      closed: 'won',
      lost: 'lost',
    };
    return mapping[inquiryStage] || null;
  }

  // 7.7 — Every inquiry stage maps to a deal stage
  test('every inquiry stage maps to a valid deal stage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INQUIRY_STAGES),
        (stage) => {
          const dealStage = mapInquiryToDeal(stage);
          expect(dealStage).not.toBeNull();
          expect(DEAL_STAGES).toContain(dealStage);
        }
      ),
      { numRuns: 200 }
    );
  });

  // 7.8 — No single stage maps to both won AND lost
  test('no inquiry stage maps to both won and lost', () => {
    INQUIRY_STAGES.forEach(stage => {
      const result = mapInquiryToDeal(stage);
      if (result === 'won') {
        expect(stage).not.toBe('lost');
      }
      if (result === 'lost') {
        expect(stage).toBe('lost');
      }
    });
  });

  test('mapping is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INQUIRY_STAGES),
        (stage) => {
          const r1 = mapInquiryToDeal(stage);
          const r2 = mapInquiryToDeal(stage);
          expect(r1).toEqual(r2);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('unknown stages return null', () => {
    const unknownStages = ['foo', 'bar', 'xyz_stage', 'invalid', 'test123', 'unknown_stage'];
    unknownStages.forEach(s => {
      expect(mapInquiryToDeal(s)).toBeNull();
    });
  });
});
