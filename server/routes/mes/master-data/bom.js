/**
 * BOM Routes — CRUD for BOM versions, layers, accessories, pre-press
 * Mounted at /api/mes/master-data/bom/*
 *
 * A2: All calculations imported from calculation-engine.js — never inline.
 * A8: Clone deep copy in single transaction.
 * A9: Status transition rules + unique active constraint.
 * A14: Optimistic locking on status transitions.
 * B2: Layer role warnings on layer save.
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { calculateLayerGSM, calcMaterialCostPerSqm } = require('../../../utils/calculation-engine');
const { resolvePrice } = require('../../../utils/price-resolver');

function isAdminOrMgmt(user) {
  const mgmtRoles = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];
  return mgmtRoles.includes(user.role) && (user.designation_level || 0) >= 6;
}

module.exports = function (router) {

  // ════════════════════════════════════════════════
  //  BOM VERSIONS
  // ════════════════════════════════════════════════

  // GET /bom/versions?product_group_id=X
  router.get('/bom/versions', authenticate, async (req, res) => {
    try {
      const { product_group_id, status } = req.query;
      const conditions = [];
      const params = [];
      if (product_group_id) { params.push(product_group_id); conditions.push(`v.product_group_id = $${params.length}`); }
      if (status)           { params.push(status);           conditions.push(`v.status = $${params.length}`); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const { rows } = await pool.query(`
        SELECT v.*, pt.type_name AS product_type_name,
               (SELECT COUNT(*) FROM mes_bom_layers l WHERE l.bom_version_id = v.id AND l.is_active = true) AS layer_count
        FROM mes_bom_versions v
        LEFT JOIN mes_product_types pt ON pt.id = v.product_type_id
        ${where}
        ORDER BY v.product_group_id, v.version_number DESC
      `, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /bom/versions error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch BOM versions' });
    }
  });

  // GET /bom/versions/:id — full detail with layers, accessories, prepress
  router.get('/bom/versions/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const [verRes, layRes, accRes, ppRes] = await Promise.all([
        pool.query('SELECT v.*, pt.type_name AS product_type_name FROM mes_bom_versions v LEFT JOIN mes_product_types pt ON pt.id = v.product_type_id WHERE v.id = $1', [id]),
        pool.query('SELECT * FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true ORDER BY layer_order', [id]),
        pool.query('SELECT * FROM mes_bom_accessories WHERE bom_version_id = $1 AND is_active = true', [id]),
        pool.query('SELECT * FROM mes_bom_prepress WHERE bom_version_id = $1 AND is_active = true', [id]),
      ]);
      if (!verRes.rows.length) return res.status(404).json({ success: false, error: 'BOM version not found' });

      const version = verRes.rows[0];
      version.layers = layRes.rows;
      version.accessories = accRes.rows;
      version.prepress = ppRes.rows;
      res.json({ success: true, data: version });
    } catch (err) {
      logger.error('GET /bom/versions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch BOM version' });
    }
  });

  // POST /bom/versions — create
  router.post('/bom/versions', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const {
        product_group_id, product_type_id, version_name, num_colors,
        has_lamination, lamination_type, has_zipper, has_varnish,
        solvent_ratio, solvent_cost_per_kg, notes,
      } = req.body;

      if (!product_group_id) return res.status(400).json({ success: false, error: 'product_group_id required' });

      // Get next version number for this (PG, product_type)
      const maxRes = await pool.query(
        'SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM mes_bom_versions WHERE product_group_id = $1 AND product_type_id IS NOT DISTINCT FROM $2',
        [product_group_id, product_type_id || null]
      );
      const nextVer = maxRes.rows[0].max_ver + 1;

      const { rows } = await pool.query(`
        INSERT INTO mes_bom_versions (
          product_group_id, product_type_id, version_number, version_name,
          num_colors, has_lamination, lamination_type, has_zipper, has_varnish,
          solvent_ratio, solvent_cost_per_kg, notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
      `, [
        product_group_id, product_type_id || null, nextVer, version_name || `v${nextVer}`,
        num_colors || 0, has_lamination || false, lamination_type || null,
        has_zipper || false, has_varnish || false,
        solvent_ratio ?? 0.5, solvent_cost_per_kg ?? 1.50, notes || null,
        req.user.id,
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /bom/versions error:', err);
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Version already exists for this PG/type combination' });
      res.status(500).json({ success: false, error: 'Failed to create BOM version' });
    }
  });

  // PUT /bom/versions/:id — update metadata
  router.put('/bom/versions/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const {
        version_name, num_colors, has_lamination, lamination_type,
        has_zipper, has_varnish, solvent_ratio, solvent_cost_per_kg, notes,
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_bom_versions SET
          version_name = COALESCE($2, version_name),
          num_colors = COALESCE($3, num_colors),
          has_lamination = COALESCE($4, has_lamination),
          lamination_type = $5,
          has_zipper = COALESCE($6, has_zipper),
          has_varnish = COALESCE($7, has_varnish),
          solvent_ratio = COALESCE($8, solvent_ratio),
          solvent_cost_per_kg = COALESCE($9, solvent_cost_per_kg),
          notes = $10,
          updated_at = NOW()
        WHERE id = $1 RETURNING *
      `, [id, version_name, num_colors, has_lamination, lamination_type, has_zipper, has_varnish, solvent_ratio, solvent_cost_per_kg, notes]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'BOM version not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /bom/versions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update BOM version' });
    }
  });

  // POST /bom/versions/:id/clone — A8: deep copy
  router.post('/bom/versions/:id/clone', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      await client.query('BEGIN');

      // 1. Get source version
      const srcRes = await client.query('SELECT * FROM mes_bom_versions WHERE id = $1', [id]);
      if (!srcRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Source version not found' }); }
      const src = srcRes.rows[0];

      // Next version number
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM mes_bom_versions WHERE product_group_id = $1 AND product_type_id IS NOT DISTINCT FROM $2',
        [src.product_group_id, src.product_type_id]
      );
      const nextVer = maxRes.rows[0].max_ver + 1;

      // 2. Clone version row
      const cloneRes = await client.query(`
        INSERT INTO mes_bom_versions (
          product_group_id, product_type_id, version_number, version_name,
          total_thickness_micron, total_gsm, num_colors, has_lamination, lamination_type,
          has_zipper, has_varnish, solvent_ratio, solvent_cost_per_kg,
          status, is_default, created_by, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',false,$14,$15) RETURNING id
      `, [
        src.product_group_id, src.product_type_id, nextVer, `${src.version_name || 'v' + src.version_number} (copy)`,
        src.total_thickness_micron, src.total_gsm, src.num_colors, src.has_lamination, src.lamination_type,
        src.has_zipper, src.has_varnish, src.solvent_ratio, src.solvent_cost_per_kg,
        req.user.id, src.notes,
      ]);
      const newId = cloneRes.rows[0].id;

      // 3. Clone layers
      await client.query(`
        INSERT INTO mes_bom_layers (
          bom_version_id, layer_order, layer_type, layer_role, item_id,
          material_name, material_category, material_cat_desc, material_type,
          thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
          gsm, cost_per_kg, waste_pct, cost_per_sqm,
          color_name, color_hex, texture_pattern, is_active, notes
        )
        SELECT $2, layer_order, layer_type, layer_role, item_id,
          material_name, material_category, material_cat_desc, material_type,
          thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
          gsm, cost_per_kg, waste_pct, cost_per_sqm,
          color_name, color_hex, texture_pattern, true, notes
        FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true
      `, [id, newId]);

      // 4. Clone accessories
      await client.query(`
        INSERT INTO mes_bom_accessories (
          bom_version_id, accessory_type, item_id, material_name,
          weight_per_meter_g, cost_per_meter, cost_per_unit, unit_type,
          quantity_formula_key, waste_pct, is_active, notes
        )
        SELECT $2, accessory_type, item_id, material_name,
          weight_per_meter_g, cost_per_meter, cost_per_unit, unit_type,
          quantity_formula_key, waste_pct, true, notes
        FROM mes_bom_accessories WHERE bom_version_id = $1 AND is_active = true
      `, [id, newId]);

      // 5. Clone prepress
      await client.query(`
        INSERT INTO mes_bom_prepress (
          bom_version_id, prepress_type, num_items, cost_per_item,
          amortization_method, amortization_qty, repeat_distance_mm, life_runs,
          is_active, notes
        )
        SELECT $2, prepress_type, num_items, cost_per_item,
          amortization_method, amortization_qty, repeat_distance_mm, life_runs,
          true, notes
        FROM mes_bom_prepress WHERE bom_version_id = $1 AND is_active = true
      `, [id, newId]);

      // 6. Clone routing
      await client.query(`
        INSERT INTO mes_product_group_routing (
          product_group_id, bom_version_id, process_id, machine_id,
          sequence_order, estimated_speed, setup_time_min, waste_pct,
          hourly_rate_override, is_optional, notes
        )
        SELECT product_group_id, $2, process_id, machine_id,
          sequence_order, estimated_speed, setup_time_min, waste_pct,
          hourly_rate_override, is_optional, notes
        FROM mes_product_group_routing WHERE bom_version_id = $1
      `, [id, newId]);

      await client.query('COMMIT');

      // Fetch full clone
      const fullRes = await pool.query('SELECT * FROM mes_bom_versions WHERE id = $1', [newId]);
      res.status(201).json({ success: true, data: fullRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('POST /bom/versions/:id/clone error:', err);
      res.status(500).json({ success: false, error: 'Clone failed' });
    } finally {
      client.release();
    }
  });

  // PATCH /bom/versions/:id/status — A9 transition rules, A14 optimistic lock
  router.patch('/bom/versions/:id/status', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const { status: newStatus, updated_at } = req.body;

      if (!newStatus || !['draft', 'active', 'archived'].includes(newStatus)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      if (!updated_at) {
        return res.status(400).json({ success: false, error: 'updated_at required for optimistic locking' });
      }

      await client.query('BEGIN');

      // A14: optimistic lock
      const curRes = await client.query(
        'SELECT * FROM mes_bom_versions WHERE id = $1 AND updated_at = $2',
        [id, updated_at]
      );
      if (!curRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Version was modified by another user. Please refresh.' });
      }
      const cur = curRes.rows[0];

      // A9: Transition rules
      const allowed = {
        'draft→active': true,
        'draft→archived': true,
        'active→archived': true,
        'archived→active': req.user.role === 'admin', // admin only
      };
      const transition = `${cur.status}→${newStatus}`;
      if (!allowed[transition]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Transition ${cur.status} → ${newStatus} not allowed` });
      }

      // If activating: archive previous active version for same (PG, product_type)
      if (newStatus === 'active') {
        await client.query(`
          UPDATE mes_bom_versions
          SET status = 'archived', valid_to = CURRENT_DATE, updated_at = NOW()
          WHERE product_group_id = $1
            AND product_type_id IS NOT DISTINCT FROM $2
            AND status = 'active'
            AND id != $3
        `, [cur.product_group_id, cur.product_type_id, id]);
      }

      // Apply transition
      const updates = { status: newStatus };
      if (newStatus === 'active')   updates.valid_from = 'CURRENT_DATE';
      if (newStatus === 'archived') updates.valid_to = 'CURRENT_DATE';

      const { rows } = await client.query(`
        UPDATE mes_bom_versions
        SET status = $2,
            valid_from = CASE WHEN $2 = 'active' THEN CURRENT_DATE ELSE valid_from END,
            valid_to = CASE WHEN $2 = 'archived' THEN CURRENT_DATE ELSE valid_to END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, newStatus]);

      await client.query('COMMIT');
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('PATCH /bom/versions/:id/status error:', err);
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Another active version already exists for this product group/type' });
      res.status(500).json({ success: false, error: 'Status update failed' });
    } finally {
      client.release();
    }
  });

  // DELETE /bom/versions/:id — soft delete (draft only)
  router.delete('/bom/versions/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;

      const verRes = await pool.query('SELECT status FROM mes_bom_versions WHERE id = $1', [id]);
      if (!verRes.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      if (verRes.rows[0].status !== 'draft') return res.status(400).json({ success: false, error: 'Only draft versions can be deleted' });

      // Soft-delete children first
      await pool.query('UPDATE mes_bom_layers SET is_active = false WHERE bom_version_id = $1', [id]);
      await pool.query('UPDATE mes_bom_accessories SET is_active = false WHERE bom_version_id = $1', [id]);
      await pool.query('UPDATE mes_bom_prepress SET is_active = false WHERE bom_version_id = $1', [id]);
      await pool.query('DELETE FROM mes_product_group_routing WHERE bom_version_id = $1', [id]);
      await pool.query('DELETE FROM mes_bom_versions WHERE id = $1', [id]);

      res.json({ success: true, message: 'BOM version deleted' });
    } catch (err) {
      logger.error('DELETE /bom/versions/:id error:', err);
      res.status(500).json({ success: false, error: 'Delete failed' });
    }
  });

  // ════════════════════════════════════════════════
  //  BOM LAYERS
  // ════════════════════════════════════════════════

  // Helper: recalc BOM version totals after layer change
  async function recalcVersionTotals(bomVersionId, client) {
    const db = client || pool;
    const { rows } = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN layer_type = 'substrate' THEN thickness_micron ELSE 0 END), 0) AS total_thickness,
        COALESCE(SUM(gsm), 0) AS total_gsm
      FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true
    `, [bomVersionId]);
    await db.query(
      'UPDATE mes_bom_versions SET total_thickness_micron = $2, total_gsm = $3, updated_at = NOW() WHERE id = $1',
      [bomVersionId, rows[0].total_thickness, rows[0].total_gsm]
    );
  }

  // Helper: check B2 layer role warnings
  function checkLayerWarnings(version, layers) {
    const warnings = [];
    // Check if bag type (has_bottom_seal or non-roll/sleeve) has no seal layer
    const hasSealLayer = layers.some(l => l.layer_role === 'seal');
    const hasBarrierLayer = layers.some(l => l.layer_role === 'barrier');
    const hasPrintCarrier = layers.some(l => l.layer_role === 'print_carrier');

    if (!hasSealLayer && layers.some(l => l.layer_type === 'substrate')) {
      warnings.push('No layer with role "seal" — bag products require a sealant layer');
    }
    if (version.has_lamination && !hasBarrierLayer) {
      warnings.push('Laminated BOM has no "barrier" layer — consider adding a barrier substrate');
    }
    if ((version.num_colors || 0) > 0 && !hasPrintCarrier) {
      warnings.push('BOM has colors but no "print_carrier" layer');
    }
    return warnings;
  }

  // GET /bom/versions/:versionId/layers
  router.get('/bom/versions/:id/layers', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true ORDER BY layer_order',
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET layers error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch layers' });
    }
  });

  // POST /bom/versions/:versionId/layers — add layer, auto-calc GSM + cost
  router.post('/bom/versions/:id/layers', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const bomVersionId = req.params.id;
      const {
        layer_order, layer_type, layer_role, item_id,
        material_name, material_category, material_cat_desc, material_type,
        thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
        cost_per_kg, waste_pct, color_name, color_hex, texture_pattern, notes,
      } = req.body;

      if (!layer_type) return res.status(400).json({ success: false, error: 'layer_type required' });

      // A2: Calculate GSM from engine
      const gsm = calculateLayerGSM({
        layer_type, thickness_micron, density_g_cm3, solid_pct, application_rate_gsm,
      });

      // Resolve cost if item_id provided and no explicit cost_per_kg
      let resolvedCost = cost_per_kg;
      if (item_id && (resolvedCost === null || resolvedCost === undefined)) {
        const itemRes = await pool.query('SELECT * FROM mes_item_master WHERE id = $1', [item_id]);
        if (itemRes.rows.length) resolvedCost = resolvePrice(itemRes.rows[0], 'STANDARD');
      }

      // A2: Calculate cost per sqm from engine
      const costPerSqm = (gsm && resolvedCost) ? calcMaterialCostPerSqm(gsm, resolvedCost, waste_pct || 3.0) : 0;

      // Get max layer_order if not specified
      let order = layer_order;
      if (order === null || order === undefined) {
        const maxRes = await pool.query(
          'SELECT COALESCE(MAX(layer_order), 0) AS max_order FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true',
          [bomVersionId]
        );
        order = maxRes.rows[0].max_order + 1;
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_bom_layers (
          bom_version_id, layer_order, layer_type, layer_role, item_id,
          material_name, material_category, material_cat_desc, material_type,
          thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
          gsm, cost_per_kg, waste_pct, cost_per_sqm,
          color_name, color_hex, texture_pattern, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING *
      `, [
        bomVersionId, order, layer_type, layer_role || null, item_id || null,
        material_name || null, material_category || null, material_cat_desc || null, material_type || null,
        thickness_micron || null, solid_pct || null, density_g_cm3 || null, application_rate_gsm || null,
        gsm, resolvedCost || null, waste_pct || 3.0, costPerSqm,
        color_name || null, color_hex || null, texture_pattern || 'solid', notes || null,
      ]);

      // Recalc version totals
      await recalcVersionTotals(bomVersionId);

      // B2: Check warnings
      const verRes = await pool.query('SELECT * FROM mes_bom_versions WHERE id = $1', [bomVersionId]);
      const allLayers = await pool.query(
        'SELECT * FROM mes_bom_layers WHERE bom_version_id = $1 AND is_active = true',
        [bomVersionId]
      );
      const warnings = checkLayerWarnings(verRes.rows[0], allLayers.rows);

      res.status(201).json({ success: true, data: rows[0], warnings });
    } catch (err) {
      logger.error('POST layer error:', err);
      res.status(500).json({ success: false, error: 'Failed to add layer' });
    }
  });

  // PUT /bom/layers/:id — update layer, re-calc
  router.put('/bom/layers/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;

      // Get existing layer for bom_version_id
      const existing = await pool.query('SELECT * FROM mes_bom_layers WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Layer not found' });
      const bomVersionId = existing.rows[0].bom_version_id;

      const {
        layer_order, layer_type, layer_role, item_id,
        material_name, material_category, material_cat_desc, material_type,
        thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
        cost_per_kg, waste_pct, color_name, color_hex, texture_pattern, notes,
      } = req.body;

      const lt = layer_type || existing.rows[0].layer_type;
      const gsm = calculateLayerGSM({
        layer_type: lt,
        thickness_micron: thickness_micron ?? existing.rows[0].thickness_micron,
        density_g_cm3: density_g_cm3 ?? existing.rows[0].density_g_cm3,
        solid_pct: solid_pct ?? existing.rows[0].solid_pct,
        application_rate_gsm: application_rate_gsm ?? existing.rows[0].application_rate_gsm,
      });

      const wp = waste_pct ?? existing.rows[0].waste_pct ?? 3.0;
      const cpk = cost_per_kg ?? existing.rows[0].cost_per_kg;
      const costPerSqm = (gsm && cpk) ? calcMaterialCostPerSqm(gsm, cpk, wp) : 0;

      const { rows } = await pool.query(`
        UPDATE mes_bom_layers SET
          layer_order = COALESCE($2, layer_order),
          layer_type = COALESCE($3, layer_type),
          layer_role = $4,
          item_id = $5,
          material_name = COALESCE($6, material_name),
          material_category = $7,
          material_cat_desc = $8,
          material_type = $9,
          thickness_micron = $10,
          solid_pct = $11,
          density_g_cm3 = $12,
          application_rate_gsm = $13,
          gsm = $14,
          cost_per_kg = $15,
          waste_pct = $16,
          cost_per_sqm = $17,
          color_name = $18,
          color_hex = $19,
          texture_pattern = COALESCE($20, texture_pattern),
          notes = $21,
          updated_at = NOW()
        WHERE id = $1 RETURNING *
      `, [
        id, layer_order, layer_type, layer_role, item_id,
        material_name, material_category, material_cat_desc, material_type,
        thickness_micron, solid_pct, density_g_cm3, application_rate_gsm,
        gsm, cpk, wp, costPerSqm,
        color_name, color_hex, texture_pattern, notes,
      ]);

      await recalcVersionTotals(bomVersionId);

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT layer error:', err);
      res.status(500).json({ success: false, error: 'Failed to update layer' });
    }
  });

  // DELETE /bom/layers/:id — soft delete
  router.delete('/bom/layers/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const existing = await pool.query('SELECT bom_version_id FROM mes_bom_layers WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Layer not found' });

      await pool.query('UPDATE mes_bom_layers SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
      await recalcVersionTotals(existing.rows[0].bom_version_id);
      res.json({ success: true, message: 'Layer deactivated' });
    } catch (err) {
      logger.error('DELETE layer error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete layer' });
    }
  });

  // POST /bom/versions/:versionId/layers/reorder
  router.post('/bom/versions/:id/layers/reorder', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { order } = req.body; // [{ id: layerId, layer_order: newOrder }, ...]
      if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });

      await client.query('BEGIN');
      for (const item of order) {
        await client.query('UPDATE mes_bom_layers SET layer_order = $2, updated_at = NOW() WHERE id = $1 AND bom_version_id = $3', [item.id, item.layer_order, req.params.id]);
      }
      await client.query('COMMIT');
      res.json({ success: true, message: 'Layers reordered' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Reorder layers error:', err);
      res.status(500).json({ success: false, error: 'Reorder failed' });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════
  //  BOM ACCESSORIES
  // ════════════════════════════════════════════════

  router.get('/bom/versions/:id/accessories', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM mes_bom_accessories WHERE bom_version_id = $1 AND is_active = true',
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET accessories error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch accessories' });
    }
  });

  router.post('/bom/versions/:id/accessories', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const {
        accessory_type, item_id, material_name, weight_per_meter_g,
        cost_per_meter, cost_per_unit, unit_type, quantity_formula_key,
        waste_pct, notes,
      } = req.body;
      if (!accessory_type) return res.status(400).json({ success: false, error: 'accessory_type required' });

      const { rows } = await pool.query(`
        INSERT INTO mes_bom_accessories (
          bom_version_id, accessory_type, item_id, material_name,
          weight_per_meter_g, cost_per_meter, cost_per_unit, unit_type,
          quantity_formula_key, waste_pct, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
      `, [req.params.id, accessory_type, item_id || null, material_name || null,
          weight_per_meter_g || null, cost_per_meter || null, cost_per_unit || null,
          unit_type || null, quantity_formula_key || null, waste_pct || 2.0, notes || null]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST accessory error:', err);
      res.status(500).json({ success: false, error: 'Failed to add accessory' });
    }
  });

  router.put('/bom/accessories/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const {
        accessory_type, item_id, material_name, weight_per_meter_g,
        cost_per_meter, cost_per_unit, unit_type, quantity_formula_key,
        waste_pct, notes,
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_bom_accessories SET
          accessory_type = COALESCE($2, accessory_type),
          item_id = $3, material_name = $4,
          weight_per_meter_g = $5, cost_per_meter = $6,
          cost_per_unit = $7, unit_type = $8,
          quantity_formula_key = $9, waste_pct = COALESCE($10, waste_pct),
          notes = $11, updated_at = NOW()
        WHERE id = $1 AND is_active = true RETURNING *
      `, [id, accessory_type, item_id, material_name, weight_per_meter_g,
          cost_per_meter, cost_per_unit, unit_type, quantity_formula_key,
          waste_pct, notes]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Accessory not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT accessory error:', err);
      res.status(500).json({ success: false, error: 'Failed to update accessory' });
    }
  });

  router.delete('/bom/accessories/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { rows } = await pool.query(
        'UPDATE mes_bom_accessories SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, message: 'Accessory deactivated' });
    } catch (err) {
      logger.error('DELETE accessory error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete accessory' });
    }
  });

  // ════════════════════════════════════════════════
  //  BOM PRE-PRESS
  // ════════════════════════════════════════════════

  router.get('/bom/versions/:id/prepress', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM mes_bom_prepress WHERE bom_version_id = $1 AND is_active = true',
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET prepress error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch prepress' });
    }
  });

  router.post('/bom/versions/:id/prepress', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const {
        prepress_type, num_items, cost_per_item,
        amortization_method, amortization_qty, repeat_distance_mm, life_runs, notes,
      } = req.body;
      if (!prepress_type) return res.status(400).json({ success: false, error: 'prepress_type required' });

      const { rows } = await pool.query(`
        INSERT INTO mes_bom_prepress (
          bom_version_id, prepress_type, num_items, cost_per_item,
          amortization_method, amortization_qty, repeat_distance_mm, life_runs, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
      `, [req.params.id, prepress_type, num_items || 1, cost_per_item || 0,
          amortization_method || 'per_kg', amortization_qty || null,
          repeat_distance_mm || null, life_runs || null, notes || null]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST prepress error:', err);
      res.status(500).json({ success: false, error: 'Failed to add prepress' });
    }
  });

  router.put('/bom/prepress/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const {
        prepress_type, num_items, cost_per_item,
        amortization_method, amortization_qty, repeat_distance_mm, life_runs, notes,
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_bom_prepress SET
          prepress_type = COALESCE($2, prepress_type),
          num_items = COALESCE($3, num_items),
          cost_per_item = COALESCE($4, cost_per_item),
          amortization_method = COALESCE($5, amortization_method),
          amortization_qty = $6, repeat_distance_mm = $7,
          life_runs = $8, notes = $9, updated_at = NOW()
        WHERE id = $1 AND is_active = true RETURNING *
      `, [id, prepress_type, num_items, cost_per_item,
          amortization_method, amortization_qty, repeat_distance_mm, life_runs, notes]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Prepress item not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT prepress error:', err);
      res.status(500).json({ success: false, error: 'Failed to update prepress' });
    }
  });

  router.delete('/bom/prepress/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { rows } = await pool.query(
        'UPDATE mes_bom_prepress SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, message: 'Prepress item deactivated' });
    } catch (err) {
      logger.error('DELETE prepress error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete prepress' });
    }
  });
};
