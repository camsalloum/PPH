/**
 * MES — Unmapped Oracle Category Detection
 * Phase 9 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md
 *
 * After every Oracle RM sync we scan fp_actualrmdata for catlinedesc values
 * that don't yet exist in mes_category_mapping and insert them as inactive
 * "unmapped" rows so an admin can map them via the UI.
 */

const { pool } = require('../database/config');
const logger = require('./logger');

/**
 * Scan fp_actualrmdata for unmapped categories and insert them into
 * mes_category_mapping as inactive rows (material_class='unmapped').
 *
 * Returns { inserted: number, totalUnmapped: number }.
 */
async function detectUnmappedCategories() {
  try {
    const insertRes = await pool.query(`
      INSERT INTO mes_category_mapping
        (oracle_category, material_class, display_label, has_parameters, is_active, sort_order)
      SELECT
        TRIM(catlinedesc)         AS oracle_category,
        'unmapped'                AS material_class,
        TRIM(catlinedesc)         AS display_label,
        false                     AS has_parameters,
        false                     AS is_active,
        999                       AS sort_order
      FROM fp_actualrmdata
      WHERE TRIM(COALESCE(catlinedesc, '')) <> ''
        AND TRIM(catlinedesc) NOT IN (SELECT oracle_category FROM mes_category_mapping)
      GROUP BY TRIM(catlinedesc)
      ON CONFLICT (oracle_category) DO NOTHING
      RETURNING oracle_category
    `);

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM mes_category_mapping WHERE material_class = 'unmapped' AND is_active = false`
    );

    const inserted = insertRes.rowCount || 0;
    const totalUnmapped = totalRes.rows[0]?.cnt || 0;

    if (inserted > 0) {
      logger.warn(`[mes-unmapped] Detected ${inserted} new unmapped Oracle category(ies) — admin action required`, {
        new: insertRes.rows.map((r) => r.oracle_category),
        totalUnmapped,
      });
    } else {
      logger.info(`[mes-unmapped] No new unmapped categories (total still pending: ${totalUnmapped})`);
    }

    return { inserted, totalUnmapped, newCategories: insertRes.rows.map((r) => r.oracle_category) };
  } catch (err) {
    logger.error('[mes-unmapped] Detection failed', { error: err.message });
    return { inserted: 0, totalUnmapped: 0, newCategories: [], error: err.message };
  }
}

/**
 * Return all unmapped category rows so the admin UI can render them
 * with a red badge for manual classification.
 */
async function listUnmappedCategories() {
  const { rows } = await pool.query(`
    SELECT id, oracle_category, display_label, sort_order, created_at
    FROM mes_category_mapping
    WHERE material_class = 'unmapped' AND is_active = false
    ORDER BY oracle_category ASC
  `);
  return rows;
}

module.exports = {
  detectUnmappedCategories,
  listUnmappedCategories,
};
