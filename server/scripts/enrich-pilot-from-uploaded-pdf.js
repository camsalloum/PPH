/*
 * Enrich one TDS row from its latest uploaded PDF attachment.
 *
 * Default target: FB5600 pilot row id=4
 * Behavior:
 *   - Parse latest attached PDF for the row
 *   - Extract fields via tds-pdf-parser
 *   - Compare with DB row
 *   - Apply only empty (missing) fields
 *   - Lock newly filled fields
 *
 * Usage:
 *   node server/scripts/enrich-pilot-from-uploaded-pdf.js
 *   node server/scripts/enrich-pilot-from-uploaded-pdf.js --tds-id 4 --dry-run
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../database/config');
const { PDFParse } = require('pdf-parse');
const { extractFromText, diffWithRecord } = require('../utils/tds-pdf-parser');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { tdsId: 4, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--tds-id') out.tdsId = Number(args[i + 1]);
    if (args[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function parsePdfText(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
  await parser.load();
  const result = await parser.getText();
  return result.pages.map((p) => p.text).join('\n');
}

async function main() {
  const { tdsId, dryRun } = parseArgs();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rowRes = await client.query('SELECT * FROM mes_material_tds WHERE id = $1', [tdsId]);
    if (!rowRes.rows.length) throw new Error(`TDS row not found for id=${tdsId}`);
    const row = rowRes.rows[0];

    const fileRes = await client.query(
      `SELECT id, file_name, file_path, uploaded_at
       FROM mes_tds_attachments
       WHERE tds_id = $1 AND LOWER(file_type) = '.pdf'
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [tdsId]
    );
    if (!fileRes.rows.length) throw new Error(`No PDF attachment found for tds_id=${tdsId}`);

    const att = fileRes.rows[0];
    const rawText = await parsePdfText(att.file_path);
    const extracted = extractFromText(rawText);
    const diff = diffWithRecord(extracted, row, row.user_locked_fields || []);
    const fillable = diff.filter((d) => d.isEmpty && !d.isLocked);

    console.log('--- PDF ENRICH AUDIT ---');
    console.log(JSON.stringify({
      tdsId,
      attachment: { id: att.id, file_name: att.file_name, uploaded_at: att.uploaded_at },
      extractedKeys: Object.keys(extracted).length,
      diffCount: diff.length,
      fillableCount: fillable.length,
      fillableFields: fillable.map((f) => f.field),
    }, null, 2));

    if (dryRun || !fillable.length) {
      await client.query('ROLLBACK');
      return;
    }

    const updates = {};
    fillable.forEach((f) => {
      updates[f.field] = f.extractedValue;
    });

    const entries = Object.entries(updates);
    const sets = entries.map(([k], idx) => `${k} = $${idx + 1}`);
    const vals = entries.map(([, v]) => v);
    const fieldsToLock = Object.keys(updates);

    vals.push(fieldsToLock);
    vals.push(tdsId);

    const sql = `
      UPDATE mes_material_tds
      SET ${sets.join(', ')},
          user_locked_fields = (
            SELECT ARRAY(
              SELECT DISTINCT unnest(COALESCE(user_locked_fields, '{}'::TEXT[]) || $${entries.length + 1}::TEXT[])
            )
          ),
          updated_at = NOW()
      WHERE id = $${entries.length + 2}
      RETURNING id, brand_grade, user_locked_fields
    `;

    const updRes = await client.query(sql, vals);
    await client.query('COMMIT');

    console.log('--- PDF ENRICH APPLIED ---');
    console.log(JSON.stringify({
      id: updRes.rows[0].id,
      grade: updRes.rows[0].brand_grade,
      filledCount: entries.length,
      filledFields: fieldsToLock,
      lockedCount: (updRes.rows[0].user_locked_fields || []).length,
    }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('PDF enrichment failed:', err.message);
  process.exit(1);
});
