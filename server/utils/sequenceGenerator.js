/**
 * Unified sequence number generator for MES presales
 *
 * Consolidates all inline sequence generators into a single, race-safe utility
 * using PostgreSQL sequences with auto-sync on first call.
 *
 * Usage:
 *   const { generateSequenceNumber } = require('../../utils/sequenceGenerator');
 *   const piNumber = await generateSequenceNumber(client, 'PI-FP', 'pi_fp_seq', 'mes_proforma_invoices', 'pi_number');
 */

const DIVISION = 'FP';

/**
 * Generate a sequential number using a PostgreSQL sequence.
 *
 * Pattern: `{prefix}-{year}-{padded_seq}`
 *
 * On first invocation per sequence, syncs the PG sequence with the highest
 * existing value in the table so that numbering never collides.
 *
 * @param {object}  client          – PG client (inside a transaction)
 * @param {string}  prefix          – e.g. 'PI-FP', 'QUOT-FP', 'JC-FP', 'PR-FP', 'SPO-FP'
 * @param {string}  seqName         – PG sequence name, e.g. 'pi_fp_seq'
 * @param {string}  tableName       – table to sync from, e.g. 'mes_proforma_invoices'
 * @param {string}  columnName      – column holding the formatted number, e.g. 'pi_number'
 * @param {number}  [padWidth=5]    – zero-padding width
 * @returns {Promise<string>}       – e.g. 'PI-FP-2026-00042'
 */
async function generateSequenceNumber(client, prefix, seqName, tableName, columnName, padWidth = 5) {
  // Ensure sequence exists
  await client.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1`);

  const year = new Date().getFullYear();
  const fullPrefix = `${prefix}-${year}-`;

  // Sync sequence on first call (is_called = false)
  const seqVal = await client.query(`SELECT last_value, is_called FROM ${seqName}`);
  if (!seqVal.rows[0].is_called) {
    const maxRes = await client.query(
      `SELECT ${columnName} FROM ${tableName} WHERE ${columnName} LIKE $1 ORDER BY id DESC LIMIT 1`,
      [`${fullPrefix}%`]
    );
    if (maxRes.rows.length > 0) {
      const num = parseInt(maxRes.rows[0][columnName].replace(fullPrefix, ''), 10);
      if (!isNaN(num) && num > 0) {
        await client.query(`SELECT setval('${seqName}', $1)`, [num]);
      }
    }
  }

  const nextRes = await client.query(`SELECT nextval('${seqName}') AS seq`);
  return `${fullPrefix}${String(nextRes.rows[0].seq).padStart(padWidth, '0')}`;
}

/**
 * Generate a per-inquiry sample number.
 *
 * Pattern: `PPS-{inquiryId}-{seq}` (2-digit pad)
 * Uses COUNT(*) scoped to the inquiry — safe because samples are created
 * one at a time within a transaction and always scoped to a single inquiry.
 *
 * @param {object} client     – PG client
 * @param {number} inquiryId  – parent inquiry ID
 * @returns {Promise<string>} – e.g. 'PPS-42-03'
 */
async function generateSampleNumber(client, inquiryId) {
  const res = await client.query(
    `SELECT COUNT(*) AS cnt FROM mes_preprod_samples WHERE inquiry_id = $1`,
    [inquiryId]
  );
  const seq = parseInt(res.rows[0].cnt, 10) + 1;
  return `PPS-${inquiryId}-${String(seq).padStart(2, '0')}`;
}

// ── Convenience wrappers ─────────────────────────────────────────────────────

/** @param {object} client */
const generatePINumber = (client) =>
  generateSequenceNumber(client, 'PI-FP', 'pi_fp_seq', 'mes_proforma_invoices', 'pi_number');

/** @param {object} client */
const generateQuotationNumber = (client) =>
  generateSequenceNumber(client, 'QUOT-FP', 'quot_fp_seq', 'mes_quotations', 'quotation_number');

/** @param {object} client */
const generatePRNumber = (client) =>
  generateSequenceNumber(client, 'PR-FP', 'pr_fp_seq', 'mes_purchase_requisitions', 'pr_number');

/** @param {object} client */
const generateSPONumber = (client) =>
  generateSequenceNumber(client, 'SPO-FP', 'spo_fp_seq', 'mes_supplier_purchase_orders', 'po_number');

/** @param {object} client */
const generateJobNumber = (client) =>
  generateSequenceNumber(client, 'JC-FP', 'jc_fp_seq', 'mes_job_cards', 'job_number');

module.exports = {
  generateSequenceNumber,
  generateSampleNumber,
  generatePINumber,
  generateQuotationNumber,
  generatePRNumber,
  generateSPONumber,
  generateJobNumber,
};
