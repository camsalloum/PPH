/**
 * Deal Sync Service — keeps CRM deal stages aligned with MES inquiry stages.
 *
 * Called from pipeline.js on every inquiry stage advance, within the same
 * transaction (the `client` parameter is the active pg transaction client).
 *
 * Stage mapping:
 *   estimation | quoted       → deal 'negotiation' (if deal at qualified or proposal)
 *   order_confirmed           → deal 'won'  (close_reason: "PO confirmed via [inquiry_number]")
 *   lost                      → deal 'lost' (close_reason from inquiry loss reason)
 *   closed                    → deal 'won'  (if not already won)
 */

const logger = require('../utils/logger');

/* Terminal deal stages — never overwrite these */
const TERMINAL_STAGES = new Set(['won', 'lost']);

/**
 * Map an MES inquiry stage to the target CRM deal stage + optional close reason.
 * Returns null when no mapping applies.
 */
function resolveTargetStage(newInquiryStage, currentDealStage, inquiryNumber, opts) {
  switch (newInquiryStage) {
    case 'estimation':
    case 'quoted': {
      if (currentDealStage === 'qualified' || currentDealStage === 'proposal') {
        return { stage: 'negotiation', closeReason: null };
      }
      return null;
    }

    case 'order_confirmed':
      return {
        stage: 'won',
        closeReason: `PO confirmed via ${inquiryNumber}`,
      };

    case 'lost':
      return {
        stage: 'lost',
        closeReason: opts.lossReason || opts.notes || null,
      };

    case 'closed':
      if (currentDealStage !== 'won') {
        return { stage: 'won', closeReason: null };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Sync a CRM deal's stage based on an MES inquiry stage change.
 *
 * @param {number}  inquiryId  - mes_presales_inquiries.id
 * @param {string}  newStage   - the new inquiry stage
 * @param {object}  client     - pg transaction client (caller owns the transaction)
 * @param {object}  [opts={}]  - optional: { lossReason, notes }
 */
async function syncDealFromInquiry(inquiryId, newStage, client, opts = {}) {
  /* 1. Find linked deal */
  const { rows: deals } = await client.query(
    `SELECT id, stage FROM crm_deals WHERE inquiry_id = $1`,
    [inquiryId]
  );

  if (deals.length === 0) return; // no linked deal — no-op

  const deal = deals[0];

  /* 2. If deal already at a terminal stage, skip */
  if (TERMINAL_STAGES.has(deal.stage)) {
    // Exception: allow lost → lost (update reason) or won → won (no-op)
    // but never overwrite a terminal stage with a different terminal stage
    // unless the mapping explicitly targets it (e.g. lost inquiry → lost deal)
    if (newStage !== 'lost' && newStage !== 'order_confirmed') return;
  }

  /* 3. Fetch inquiry number for close reason */
  const { rows: inquiries } = await client.query(
    `SELECT inquiry_number FROM mes_presales_inquiries WHERE id = $1`,
    [inquiryId]
  );
  const inquiryNumber = inquiries[0]?.inquiry_number || `INQ-${inquiryId}`;

  /* 4. Resolve target stage */
  const target = resolveTargetStage(newStage, deal.stage, inquiryNumber, opts);
  if (!target) return; // no mapping for this stage transition

  /* 5. Skip if deal already at target stage */
  if (deal.stage === target.stage) return;

  /* 6. Update deal */
  const updateFields = ['stage = $1', 'updated_at = NOW()'];
  const updateValues = [target.stage];
  let paramIdx = 2;

  if (target.closeReason) {
    updateFields.push(`close_reason = $${paramIdx}`);
    updateValues.push(target.closeReason);
    paramIdx++;
  }

  updateValues.push(deal.id);
  await client.query(
    `UPDATE crm_deals SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`,
    updateValues
  );

  /* 7. Insert stage history */
  await client.query(
    `INSERT INTO crm_deal_stage_history
       (deal_id, from_stage, to_stage, changed_by, note, source)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      deal.id,
      deal.stage,
      target.stage,
      0, // system user
      opts.notes || `Auto-sync from inquiry stage: ${newStage}`,
      'mes_sync',
    ]
  );

  logger.info(`Deal ${deal.id} synced: ${deal.stage} → ${target.stage} (inquiry ${inquiryId} → ${newStage})`);
}

module.exports = { syncDealFromInquiry };
