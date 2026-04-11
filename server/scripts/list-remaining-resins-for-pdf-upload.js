/*
 * List remaining resin grades from fp_actualrmdata for PDF upload workflow.
 *
 * Output file:
 *   exports/remaining-resins-for-pdf-upload.json
 *
 * Usage:
 *   node server/scripts/list-remaining-resins-for-pdf-upload.js
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../database/config');

const RESIN_CAT_DESC = [
  'HDPE',
  'LDPE',
  'LLDPE',
  'mLLDPE',
  'Random PP',
  'Film Scrap / Regrind Clear',
  'Film Scrap / Regrind Printed',
];

async function main() {
  const sql = `
    WITH fp_resins AS (
      SELECT DISTINCT ON (
        COALESCE(TRIM(mainitem), ''),
        COALESCE(TRIM(maindescription), '')
      )
        TRIM(mainitem) AS oracle_item_code,
        TRIM(maindescription) AS brand_grade,
        itemgroup AS material_code,
        catlinedesc AS cat_desc,
        category,
        division,
        synced_at
      FROM fp_actualrmdata
      WHERE COALESCE(TRIM(maindescription), '') <> ''
        AND (
          catlinedesc = ANY($1::text[])
          OR itemgroup ~* '^(HDPE|LDPE|LLDPE|mLLDPE|PP-R|SCRAP|rLDPE)'
        )
      ORDER BY
        COALESCE(TRIM(mainitem), ''),
        COALESCE(TRIM(maindescription), ''),
        synced_at DESC
    ),
    mapped AS (
      SELECT
        f.*,
        t.id AS tds_id,
        t.source_name,
        t.status,
        COALESCE(a.pdf_count, 0) AS pdf_count
      FROM fp_resins f
      LEFT JOIN LATERAL (
        SELECT
          t1.id,
          t1.source_name,
          t1.status,
          t1.updated_at
        FROM mes_material_tds t1
        WHERE
          (
            COALESCE(TRIM(t1.oracle_item_code), '') <> ''
            AND LOWER(TRIM(t1.oracle_item_code)) = LOWER(f.oracle_item_code)
          )
          OR LOWER(REGEXP_REPLACE(COALESCE(t1.brand_grade, ''), '\\s+', '', 'g'))
             = LOWER(REGEXP_REPLACE(f.brand_grade, '\\s+', '', 'g'))
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE(t1.oracle_item_code, ''))) = LOWER(f.oracle_item_code)
              THEN 1
            ELSE 2
          END,
          t1.updated_at DESC NULLS LAST,
          t1.id DESC
        LIMIT 1
      ) t ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE LOWER(file_type) = '.pdf')::int AS pdf_count
        FROM mes_tds_attachments a1
        WHERE a1.tds_id = t.id
      ) a ON TRUE
    )
    SELECT *
    FROM mapped
    ORDER BY
      COALESCE(cat_desc, ''),
      COALESCE(brand_grade, '');
  `;

  const res = await pool.query(sql, [RESIN_CAT_DESC]);
  const rows = res.rows;

  const remainingForUpload = rows.filter((r) => Number(r.pdf_count || 0) === 0);
  const alreadyHasPdf = rows.filter((r) => Number(r.pdf_count || 0) > 0);
  const unmappedToTds = rows.filter((r) => !r.tds_id);

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFpResinCandidates: rows.length,
      remainingForPdfUpload: remainingForUpload.length,
      alreadyHasPdf: alreadyHasPdf.length,
      unmappedToTds: unmappedToTds.length,
    },
    remainingForUpload,
    alreadyHasPdf,
    unmappedToTds,
  };

  const outDir = path.join(__dirname, '..', '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'remaining-resins-for-pdf-upload.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify(payload.summary, null, 2));
  console.log(`Saved: ${outPath}`);
}

main()
  .catch((err) => {
    console.error('Failed to list remaining resins:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // no-op
    }
  });
