/**
 * MES Master Data — Formulations Routes (Multi-Level BOM System)
 * Mounted at /api/mes/master-data
 *
 * Endpoints:
 *   GET  /formulations/by-group          — list formulations for a category+group
 *   GET  /formulations/:id               — full detail with resolved BOM
 *   POST /formulations                   — create new formulation (draft)
 *   PUT  /formulations/:id               — update metadata / status
 *   PUT  /formulations/:id/components    — save BOM components (draft only)
 *   POST /formulations/:id/duplicate     — duplicate as new version or name
 *   DEL  /formulations/:id               — soft-delete
 *   GET  /formulations/:id/candidates    — item picker (cascading)
 *   GET  /formulations/:id/sub-candidates — sub-formulation picker
 *
 * References: ADHESIVE_FORMULATION_PLAN.md §3 Backend API
 */

'use strict';

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const {
  resolveFormulationById,
  wouldCreateCircle,
  getBomDepth,
  MAX_BOM_DEPTH,
} = require('../../../utils/formulation-resolver');

const WRITE_ROLES = ['admin', 'sales_manager', 'mes_manager'];
function canWrite(user) {
  return WRITE_ROLES.includes(user?.role);
}

const VALID_STATUSES = ['draft', 'active', 'archived'];
const VALID_TRANSITIONS = {
  draft:    ['active', 'archived'],
  active:   ['archived'],
  archived: ['draft'],
};

/** Normalize item_key: lowercase + trim */
function normalizeItemKey(str) {
  return String(str || '').toLowerCase().trim();
}

module.exports = function (router) {

  // ══════════════════════════════════════════════════════════════════════════
  // GET /formulations/by-group?category_id=&catlinedesc=
  // List all formulations for an Oracle group, grouped by name+version
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/formulations/by-group', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.query.category_id, 10);
      const catlinedesc = String(req.query.catlinedesc || '').trim();

      if (!catId || !catlinedesc) {
        return res.status(400).json({ success: false, error: 'category_id and catlinedesc are required' });
      }

      const { rows } = await pool.query(`
        SELECT
          f.id,
          f.name,
          f.version,
          f.status,
          f.is_default,
          f.notes,
          f.created_at,
          f.updated_at,
          (SELECT COUNT(*) FROM mes_formulation_components fc WHERE fc.formulation_id = f.id)::INT AS component_count
        FROM mes_formulations f
        WHERE f.category_id = $1
          AND LOWER(TRIM(f.catlinedesc)) = LOWER(TRIM($2))
          AND f.status <> 'deleted'
        ORDER BY LOWER(f.name), f.version
      `, [catId, catlinedesc]);

      // Resolve cost/solids summaries for each formulation
      const enriched = await Promise.all(rows.map(async (f) => {
        try {
          const resolved = await resolveFormulationById(pool, f.id);
          return {
            ...f,
            price_per_kg_wet: resolved.price_per_kg_wet,
            solids_share_pct: resolved.solids_share_pct,
          };
        } catch (_) {
          return { ...f, price_per_kg_wet: null, solids_share_pct: null };
        }
      }));

      res.json({ success: true, data: enriched });
    } catch (err) {
      logger.error('GET /formulations/by-group error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch formulations' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /formulations/:id
  // Full formulation detail with resolved BOM costs
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/formulations/:id', authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);

      const { rows: fRows } = await pool.query(`
        SELECT f.*, cat.name AS category_name, cat.material_class
        FROM mes_formulations f
        JOIN mes_item_categories cat ON cat.id = f.category_id
        WHERE f.id = $1 AND f.status <> 'deleted'
      `, [id]);
      if (!fRows.length) return res.status(404).json({ success: false, error: 'Formulation not found' });
      const formulation = fRows[0];

      // Resolve BOM with memoized recursive engine
      const resolved = await resolveFormulationById(pool, id);

      // Enrich components with Oracle display data
      const enrichedComponents = await Promise.all(resolved.components.map(async comp => {
        if (comp.component_type === 'item') {
          const { rows: itemRows } = await pool.query(`
            SELECT DISTINCT ON (LOWER(TRIM(mainitem)))
              mainitem, maindescription, catlinedesc, itemgroup,
              maincost AS stock_cost_wa,
              purchaseprice AS purchase_cost_wa
            FROM fp_actualrmdata
            WHERE LOWER(TRIM(mainitem)) = $1
            LIMIT 1
          `, [comp.item_key]);
          const item = itemRows[0] || {};
          return { ...comp, mainitem: item.mainitem, maindescription: item.maindescription, source_catlinedesc: item.catlinedesc };
        } else {
          const { rows: subRows } = await pool.query(
            'SELECT id, name, version, status, category_id FROM mes_formulations WHERE id = $1',
            [comp.sub_formulation_id]
          );
          const sub = subRows[0] || {};
          return { ...comp, sub_formulation_name: sub.name, sub_formulation_version: sub.version, sub_formulation_status: sub.status };
        }
      }));

      res.json({
        success: true,
        data: {
          ...formulation,
          components: enrichedComponents,
          totals: {
            total_parts:         resolved.total_parts,
            total_solids:        resolved.total_solids,
            total_cost:          resolved.total_cost,
            price_per_kg_wet:    resolved.price_per_kg_wet,
            price_per_kg_solids: resolved.price_per_kg_solids,
            solids_share_pct:    resolved.solids_share_pct,
          },
        },
      });
    } catch (err) {
      logger.error('GET /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch formulation' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /formulations — Create new formulation (always draft)
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/formulations', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    try {
      const { category_id, catlinedesc, name, notes } = req.body;
      if (!category_id || !catlinedesc || !name) {
        return res.status(400).json({ success: false, error: 'category_id, catlinedesc, and name are required' });
      }

      const catCheck = await pool.query('SELECT id FROM mes_item_categories WHERE id=$1 AND is_active=true', [parseInt(category_id, 10)]);
      if (!catCheck.rows.length) return res.status(400).json({ success: false, error: 'Invalid category_id' });

      // Auto-increment version for same (category, group, name)
      const { rows: vRows } = await pool.query(`
        SELECT COALESCE(MAX(version), 0) AS max_version
        FROM mes_formulations
        WHERE category_id = $1
          AND LOWER(TRIM(catlinedesc)) = LOWER(TRIM($2))
          AND LOWER(TRIM(name)) = LOWER(TRIM($3))
          AND status <> 'deleted'
      `, [category_id, catlinedesc, name]);
      const newVersion = Number(vRows[0].max_version) + 1;

      const { rows } = await pool.query(`
        INSERT INTO mes_formulations (category_id, catlinedesc, name, version, status, notes, created_by)
        VALUES ($1, $2, $3, $4, 'draft', $5, $6)
        RETURNING *
      `, [category_id, catlinedesc.trim(), name.trim(), newVersion, notes || null, req.user.id]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /formulations error:', err);
      res.status(500).json({ success: false, error: 'Failed to create formulation' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PUT /formulations/:id — Update metadata / status
  // Active formulations: only status and is_default can change
  // ══════════════════════════════════════════════════════════════════════════
  router.put('/formulations/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    try {
      const id = parseInt(req.params.id, 10);
      const { rows: fRows } = await pool.query(
        `SELECT * FROM mes_formulations WHERE id=$1 AND status <> 'deleted'`, [id]
      );
      const existing = fRows[0];
      if (!existing) return res.status(404).json({ success: false, error: 'Formulation not found' });

      const { name, notes, status, is_default } = req.body;
      const isActive = existing.status === 'active';

      // Validate status value
      if (status !== undefined && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      // Validate status transition
      if (status !== undefined && status !== existing.status) {
        const allowed = VALID_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(status)) {
          return res.status(409).json({ success: false, error: `Cannot transition from '${existing.status}' to '${status}'` });
        }
      }

      // Active formulations are read-only except for status + is_default (A13)
      if (isActive && (name !== undefined || notes !== undefined)) {
        return res.status(409).json({ success: false, error: 'Active formulations are read-only. Duplicate to create a new draft version.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Handle status transition → active: archive all other versions with same name
        if (status === 'active' && existing.status !== 'active') {
          await client.query(`
            UPDATE mes_formulations
               SET status = 'archived', is_default = false, updated_at = NOW()
             WHERE category_id = $1
               AND LOWER(TRIM(catlinedesc)) = LOWER(TRIM($2))
               AND LOWER(TRIM(name)) = LOWER(TRIM($3))
               AND id <> $4
               AND status = 'active'
          `, [existing.category_id, existing.catlinedesc, existing.name, id]);
        }

        // Handle is_default: clear other defaults in the same group (only active can be default)
        if (is_default === true) {
          const effectiveStatus = status || existing.status;
          if (effectiveStatus !== 'active') {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, error: 'Only active formulations can be set as default' });
          }
          await client.query(`
            UPDATE mes_formulations
               SET is_default = false, updated_at = NOW()
             WHERE category_id = $1
               AND LOWER(TRIM(catlinedesc)) = LOWER(TRIM($2))
               AND id <> $3
               AND is_default = true
          `, [existing.category_id, existing.catlinedesc, id]);
        }

        const updates = [];
        const params = [];
        let idx = 1;

        if (!isActive) {
          if (name      !== undefined) { updates.push(`name = $${idx++}`);  params.push(name.trim()); }
          if (notes     !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes || null); }
        }
        if (status     !== undefined) { updates.push(`status = $${idx++}`);     params.push(status); }
        if (is_default !== undefined) { updates.push(`is_default = $${idx++}`); params.push(!!is_default); }
        updates.push(`updated_at = NOW()`);

        params.push(id);
        const { rows: updRows } = await client.query(
          `UPDATE mes_formulations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
          params
        );

        await client.query('COMMIT');
        res.json({ success: true, data: updRows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PUT /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update formulation' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PUT /formulations/:id/components — Save BOM (full replace, draft only)
  // ══════════════════════════════════════════════════════════════════════════
  router.put('/formulations/:id/components', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    try {
      const id = parseInt(req.params.id, 10);
      const { rows: fRows } = await pool.query(
        `SELECT * FROM mes_formulations WHERE id=$1 AND status <> 'deleted'`, [id]
      );
      const existing = fRows[0];
      if (!existing) return res.status(404).json({ success: false, error: 'Formulation not found' });

      // Guard: active = read-only (A13)
      if (existing.status === 'active') {
        return res.status(409).json({ success: false, error: 'Active formulations are read-only. Duplicate to create a new draft.' });
      }

      const { components } = req.body;
      if (!Array.isArray(components)) {
        return res.status(400).json({ success: false, error: 'components must be an array' });
      }

      // ── Validation ──
      for (let i = 0; i < components.length; i++) {
        const c = components[i];
        if (!c.component_type || !['item', 'formulation'].includes(c.component_type)) {
          return res.status(400).json({ success: false, error: `components[${i}]: component_type must be 'item' or 'formulation'` });
        }
        if (c.parts == null || isNaN(Number(c.parts)) || Number(c.parts) <= 0) {
          return res.status(400).json({ success: false, error: `components[${i}]: parts must be a number > 0` });
        }
        if (c.component_type === 'item') {
          if (!c.item_key) return res.status(400).json({ success: false, error: `components[${i}]: item_key is required` });
          const key = normalizeItemKey(c.item_key);
          const { rows: itemCheck } = await pool.query(
            `SELECT 1 FROM fp_actualrmdata WHERE LOWER(TRIM(mainitem)) = $1 LIMIT 1`, [key]
          );
          if (!itemCheck.length) {
            return res.status(400).json({ success: false, error: `components[${i}]: item '${c.item_key}' not found in Oracle data` });
          }
        } else {
          if (!c.sub_formulation_id) return res.status(400).json({ success: false, error: `components[${i}]: sub_formulation_id is required` });
          const subId = parseInt(c.sub_formulation_id, 10);

          const { rows: subCheck } = await pool.query(
            `SELECT id FROM mes_formulations WHERE id=$1 AND status <> 'deleted'`, [subId]
          );
          if (!subCheck.length) {
            return res.status(400).json({ success: false, error: `components[${i}]: sub_formulation #${subId} not found` });
          }

          // Circular reference check (A4)
          const circular = await wouldCreateCircle(pool, id, subId);
          if (circular) {
            return res.status(409).json({ success: false, error: `Adding formulation #${subId} would create a circular reference` });
          }

          // Depth check (A16)
          const subDepth = await getBomDepth(pool, subId, 1);
          if (subDepth >= MAX_BOM_DEPTH) {
            return res.status(422).json({ success: false, error: `Adding formulation #${subId} would exceed maximum BOM depth of ${MAX_BOM_DEPTH}` });
          }
        }
      }

      // ── Full replacement in a transaction ──
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM mes_formulation_components WHERE formulation_id = $1', [id]);

        for (let i = 0; i < components.length; i++) {
          const c = components[i];
          const itemKey = c.component_type === 'item' ? normalizeItemKey(c.item_key) : null;
          const subId   = c.component_type === 'formulation' ? parseInt(c.sub_formulation_id, 10) : null;

          await client.query(`
            INSERT INTO mes_formulation_components
              (formulation_id, component_type, item_key, sub_formulation_id,
               component_role, parts, solids_pct, unit_price_override, sort_order, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [
            id,
            c.component_type,
            itemKey,
            subId,
            c.component_role || 'other',
            Number(c.parts),
            c.solids_pct != null ? Number(c.solids_pct) : null,
            c.unit_price_override != null ? Number(c.unit_price_override) : null,
            Number(c.sort_order ?? i),
            c.notes || null,
          ]);
        }

        await client.query(`UPDATE mes_formulations SET updated_at=NOW() WHERE id=$1`, [id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Return full formulation with resolved BOM (merge metadata + resolver output)
      const { rows: updatedRows } = await pool.query(`
        SELECT f.*, cat.name AS category_name, cat.material_class
        FROM mes_formulations f
        JOIN mes_item_categories cat ON cat.id = f.category_id
        WHERE f.id = $1
      `, [id]);
      const resolved = await resolveFormulationById(pool, id);
      res.json({
        success: true,
        data: {
          ...updatedRows[0],
          components: resolved.components,
          totals: {
            total_parts:         resolved.total_parts,
            total_solids:        resolved.total_solids,
            total_cost:          resolved.total_cost,
            price_per_kg_wet:    resolved.price_per_kg_wet,
            price_per_kg_solids: resolved.price_per_kg_solids,
            solids_share_pct:    resolved.solids_share_pct,
          },
        },
      });
    } catch (err) {
      logger.error('PUT /formulations/:id/components error:', err);
      res.status(500).json({ success: false, error: 'Failed to save components' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /formulations/:id/duplicate
  // Duplicate as new version (same name) or new name (version resets to 1)
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/formulations/:id/duplicate', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    try {
      const id = parseInt(req.params.id, 10);
      const { rows: fRows } = await pool.query(
        `SELECT * FROM mes_formulations WHERE id=$1 AND status <> 'deleted'`, [id]
      );
      const source = fRows[0];
      if (!source) return res.status(404).json({ success: false, error: 'Formulation not found' });

      const { new_name, as_new_version: rawAsNewVersion = true } = req.body;
      const asNewVersion = rawAsNewVersion !== false && rawAsNewVersion !== 'false';
      const targetName = asNewVersion ? source.name : String(new_name || '').trim();
      if (!targetName) return res.status(400).json({ success: false, error: 'new_name is required when as_new_version is false' });

      // Determine version
      const { rows: vRows } = await pool.query(`
        SELECT COALESCE(MAX(version), 0) AS max_version
        FROM mes_formulations
        WHERE category_id=$1 AND LOWER(TRIM(catlinedesc))=LOWER(TRIM($2)) AND LOWER(TRIM(name))=LOWER(TRIM($3)) AND status <> 'deleted'
      `, [source.category_id, source.catlinedesc, targetName]);
      const newVersion = Number(vRows[0].max_version) + 1;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: newRows } = await client.query(`
          INSERT INTO mes_formulations (category_id, catlinedesc, name, version, status, notes, created_by)
          VALUES ($1,$2,$3,$4,'draft',$5,$6)
          RETURNING *
        `, [source.category_id, source.catlinedesc, targetName, newVersion, source.notes, req.user.id]);
        const newFormulation = newRows[0];

        // Copy components
        await client.query(`
          INSERT INTO mes_formulation_components
            (formulation_id, component_type, item_key, sub_formulation_id,
             component_role, parts, solids_pct, unit_price_override, sort_order, notes)
          SELECT $2, component_type, item_key, sub_formulation_id,
                 component_role, parts, solids_pct, unit_price_override, sort_order, notes
          FROM mes_formulation_components
          WHERE formulation_id = $1
        `, [id, newFormulation.id]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, data: newFormulation });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('POST /formulations/:id/duplicate error:', err);
      res.status(500).json({ success: false, error: 'Failed to duplicate formulation' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /formulations/:id — Soft-delete
  // ══════════════════════════════════════════════════════════════════════════
  router.delete('/formulations/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });

    try {
      const id = parseInt(req.params.id, 10);
      const { rows: fRows } = await pool.query(
        `SELECT * FROM mes_formulations WHERE id=$1 AND status <> 'deleted'`, [id]
      );
      if (!fRows[0]) return res.status(404).json({ success: false, error: 'Formulation not found' });

      // Block if referenced as sub-formulation by another formulation
      const { rows: refs } = await pool.query(`
        SELECT f.id, f.name, f.version
        FROM mes_formulation_components fc
        JOIN mes_formulations f ON f.id = fc.formulation_id
        WHERE fc.sub_formulation_id = $1 AND f.status <> 'deleted'
      `, [id]);
      if (refs.length) {
        return res.status(409).json({
          success: false,
          error: 'Cannot delete: this formulation is used as a sub-BOM in others',
          references: refs.map(r => `${r.name} v${r.version} (#${r.id})`),
        });
      }

      await pool.query(
        `UPDATE mes_formulations SET status='deleted', is_default=false, updated_at=NOW() WHERE id=$1`, [id]
      );
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete formulation' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /formulations/:id/candidates?category_id=&search=
  // Item picker — 2-step: category → items sourced from spec tables
  // (same source as Material Specs page; Oracle fp_actualrmdata joined for pricing only)
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/formulations/:id/candidates', authenticate, async (req, res) => {
    // Whitelisted spec table names — never interpolated without this check
    const SPEC_TABLE_WHITELIST = new Set([
      'mes_spec_substrates', 'mes_spec_adhesives', 'mes_spec_chemicals',
      'mes_spec_additives', 'mes_spec_coating', 'mes_spec_packing_materials',
      'mes_spec_mounting_tapes',
    ]);
    // Tables with a dedicated direct solids_pct column (not JSONB only)
    const DIRECT_SOLIDS_TABLES = new Set(['mes_spec_adhesives', 'mes_spec_coating']);
    // Categories with no spec data — excluded from picker
    const INVENTORY_ONLY_CLASSES = new Set(['trading', 'consumables']);

    try {
      const catId  = parseInt(req.query.category_id, 10) || null;
      const search = String(req.query.search || '').trim();
      const formId = parseInt(req.params.id, 10);

      // Already-used item_keys in this formulation (to gray out in picker)
      const { rows: usedRows } = await pool.query(
        `SELECT item_key FROM mes_formulation_components WHERE formulation_id=$1 AND component_type='item'`,
        [formId]
      );
      const usedKeys = new Set(usedRows.map(r => r.item_key));

      // ── Step 1: no category yet → return category list (excluding inventory-only) ──
      if (!catId) {
        const { rows: cats } = await pool.query(`
          SELECT c.id, c.name, c.material_class
          FROM mes_item_categories c
          WHERE c.is_active = true
            AND LOWER(TRIM(c.material_class)) NOT IN (${
              Array.from(INVENTORY_ONLY_CLASSES).map((_, i) => `$${i + 1}`).join(', ')
            })
          ORDER BY c.sort_order, c.name
        `, Array.from(INVENTORY_ONLY_CLASSES));
        return res.json({ success: true, step: 'category', data: cats });
      }

      // ── Step 2: resolve category → material_class + spec_table ──────────────
      const { rows: catRows } = await pool.query(`
        SELECT c.material_class, m.spec_table
        FROM mes_item_categories c
        LEFT JOIN mes_category_mapping m
          ON LOWER(TRIM(m.material_class)) = LOWER(TRIM(c.material_class))
         AND m.is_active = true
        WHERE c.id = $1
        LIMIT 1
      `, [catId]);

      if (!catRows.length) return res.json({ success: true, step: 'items', data: [] });

      const { material_class, spec_table } = catRows[0];
      const safeTable = SPEC_TABLE_WHITELIST.has(spec_table) ? spec_table : null;
      const matClass  = String(material_class || '').toLowerCase();

      // ── Resins: sourced from mes_material_tds ───────────────────────────────
      if (matClass === 'resins') {
        const params = [];
        let whereClause = 'WHERE 1=1';
        if (search) {
          params.push(`%${search}%`);
          whereClause += ` AND (
            t.oracle_item_code ILIKE $${params.length}
            OR t.brand_grade    ILIKE $${params.length}
          )`;
        }

        const { rows: items } = await pool.query(`
          SELECT
            LOWER(TRIM(t.oracle_item_code))        AS item_key,
            TRIM(t.oracle_item_code)               AS mainitem,
            TRIM(t.brand_grade)                    AS maindescription,
            TRIM(t.cat_desc)                       AS catlinedesc,
            t.status,
            t.density                              AS tds_density,
            NULL::numeric                          AS tds_solids_pct,
            COALESCE(
              SUM(r.mainitemstock * r.maincost)
                / NULLIF(SUM(r.mainitemstock), 0),
              0
            )                                      AS stock_cost_wa,
            COALESCE(
              SUM(r.purchaseprice * r.pendingorderqty)
                / NULLIF(SUM(r.pendingorderqty), 0),
              0
            )                                      AS purchase_cost_wa
          FROM mes_material_tds t
          LEFT JOIN fp_actualrmdata r
            ON LOWER(TRIM(r.mainitem)) = LOWER(TRIM(t.oracle_item_code))
          ${whereClause}
          GROUP BY
            LOWER(TRIM(t.oracle_item_code)), TRIM(t.oracle_item_code),
            TRIM(t.brand_grade), TRIM(t.cat_desc),
            t.status, t.density
          ORDER BY TRIM(t.oracle_item_code)
        `, params);

        const enriched = items.map(row => ({
          ...row,
          already_in_formulation: usedKeys.has(row.item_key),
        }));
        return res.json({ success: true, step: 'items', data: enriched });
      }

      // ── Inventory-only: return empty list ──────────────────────────────────
      if (INVENTORY_ONLY_CLASSES.has(matClass)) {
        return res.json({ success: true, step: 'items', data: [] });
      }

      // ── Spec-table path (adhesives, coating, chemicals, additives, etc.) ───
      if (safeTable) {
        const hasDirect = DIRECT_SOLIDS_TABLES.has(safeTable);
        const solidsExpr = hasDirect
          ? `COALESCE(s.solids_pct,
               (s.parameters_json->>'solids_pct')::numeric,
               (s.parameters_json->>'solid_pct')::numeric)`
          : `COALESCE(
               (s.parameters_json->>'solids_pct')::numeric,
               (s.parameters_json->>'solid_pct')::numeric)`;

        const params = [];
        let whereClause = 'WHERE 1=1';
        if (search) {
          params.push(`%${search}%`);
          whereClause += ` AND (
            s.mainitem      ILIKE $${params.length}
            OR s.maindescription ILIKE $${params.length}
            OR s.material_key   ILIKE $${params.length}
          )`;
        }

        const { rows: items } = await pool.query(`
          SELECT
            COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key))) AS item_key,
            COALESCE(NULLIF(TRIM(s.mainitem), ''),        TRIM(s.material_key))         AS mainitem,
            TRIM(s.maindescription)  AS maindescription,
            TRIM(s.catlinedesc)      AS catlinedesc,
            s.status,
            ${solidsExpr}            AS tds_solids_pct,
            COALESCE(
              SUM(r.mainitemstock * r.maincost)
                / NULLIF(SUM(r.mainitemstock), 0),
              0
            )                        AS stock_cost_wa,
            COALESCE(
              SUM(r.purchaseprice * r.pendingorderqty)
                / NULLIF(SUM(r.pendingorderqty), 0),
              0
            )                        AS purchase_cost_wa
          FROM ${safeTable} s
          LEFT JOIN fp_actualrmdata r
            ON LOWER(TRIM(r.mainitem)) =
               COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key)))
          ${whereClause}
          GROUP BY
            COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key))),
            COALESCE(NULLIF(TRIM(s.mainitem), ''), TRIM(s.material_key)),
            TRIM(s.maindescription), TRIM(s.catlinedesc),
            s.status, ${solidsExpr}
          ORDER BY mainitem
        `, params);

        const enriched = items.map(row => ({
          ...row,
          already_in_formulation: usedKeys.has(row.item_key),
        }));
        return res.json({ success: true, step: 'items', data: enriched });
      }

      // ── Fallback: mes_non_resin_material_specs filtered by material_class ──
      const params = [matClass];
      let whereClause = `WHERE LOWER(TRIM(s.material_class)) = $1`;
      if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (
          s.mainitem      ILIKE $${params.length}
          OR s.maindescription ILIKE $${params.length}
          OR s.material_key   ILIKE $${params.length}
        )`;
      }

      const { rows: items } = await pool.query(`
        SELECT
          COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key))) AS item_key,
          COALESCE(NULLIF(TRIM(s.mainitem), ''),        TRIM(s.material_key))         AS mainitem,
          TRIM(s.maindescription)  AS maindescription,
          TRIM(s.catlinedesc)      AS catlinedesc,
          s.status,
          COALESCE(
            (s.parameters_json->>'solids_pct')::numeric,
            (s.parameters_json->>'solid_pct')::numeric
          )                        AS tds_solids_pct,
          COALESCE(
            SUM(r.mainitemstock * r.maincost) / NULLIF(SUM(r.mainitemstock), 0),
            0
          )                        AS stock_cost_wa,
          COALESCE(
            SUM(r.purchaseprice * r.pendingorderqty) / NULLIF(SUM(r.pendingorderqty), 0),
            0
          )                        AS purchase_cost_wa
        FROM mes_non_resin_material_specs s
        LEFT JOIN fp_actualrmdata r
          ON LOWER(TRIM(r.mainitem)) =
             COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key)))
        ${whereClause}
        GROUP BY
          COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key))),
          COALESCE(NULLIF(TRIM(s.mainitem), ''), TRIM(s.material_key)),
          TRIM(s.maindescription), TRIM(s.catlinedesc),
          s.status,
          COALESCE(
            (s.parameters_json->>'solids_pct')::numeric,
            (s.parameters_json->>'solid_pct')::numeric
          )
        ORDER BY mainitem
      `, params);

      const enriched = items.map(row => ({
        ...row,
        already_in_formulation: usedKeys.has(row.item_key),
      }));
      res.json({ success: true, step: 'items', data: enriched });
    } catch (err) {
      logger.error('GET /formulations/:id/candidates error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch candidates' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /formulations/:id/sub-candidates?search=
  // Sub-formulation picker (excludes circular candidates)
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/formulations/:id/sub-candidates', authenticate, async (req, res) => {
    try {
      const formId = parseInt(req.params.id, 10);
      const search = String(req.query.search || '').trim();

      // Get ALL non-deleted formulations except self
      let sql = `
        SELECT f.id, f.name, f.version, f.status, f.is_default,
               f.catlinedesc, cat.name AS category_name,
               (SELECT COUNT(*) FROM mes_formulation_components fc WHERE fc.formulation_id = f.id)::INT AS component_count
        FROM mes_formulations f
        JOIN mes_item_categories cat ON cat.id = f.category_id
        WHERE f.id <> $1 AND f.status <> 'deleted'
      `;
      const params = [formId];
      if (search) {
        params.push(`%${search}%`);
        sql += ` AND (f.name ILIKE $${params.length} OR f.catlinedesc ILIKE $${params.length} OR cat.name ILIKE $${params.length})`;
      }
      sql += ' ORDER BY cat.name, f.catlinedesc, LOWER(f.name), f.version';

      const { rows } = await pool.query(sql, params);

      // Filter out any that would create a circular reference
      const safe = [];
      for (const row of rows) {
        const circular = await wouldCreateCircle(pool, formId, row.id);
        if (!circular) safe.push({ ...row, would_create_circle: false });
      }

      res.json({ success: true, data: safe });
    } catch (err) {
      logger.error('GET /formulations/:id/sub-candidates error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch sub-formulation candidates' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Legacy route safety net — old resin-formulation GET, now returns 410 Gone
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/formulations', authenticate, async (req, res) => {
    // If by-group handler above didn't match (missing params), redirect to by-group docs
    return res.status(400).json({
      success: false,
      error: 'Use /formulations/by-group?category_id=&catlinedesc= to list formulations',
    });
  });

};

// ─── LEGACY NOTE ────────────────────────────────────────────────────────────
// Old resin formulation routes (product_group_id / formulation_name / is_active)
// have been removed. The tables were renamed to *_legacy in migration #050.
// ────────────────────────────────────────────────────────────────────────────
