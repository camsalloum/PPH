/**
 * MES Pre-Sales — Estimation Routes
 *
 * Endpoints:
 *   GET  /materials                          — material master grouped by category
 *   GET  /estimation/defaults                — product group default layers + processes
 *   POST /estimations                        — save estimation data
 *   GET  /estimations                        — list estimations for an inquiry
 *   POST /estimations/:id/create-quotation   — create quotation from estimation
 *   PATCH /estimations/:id/actuals           — save actual consumption data
 *
 * Max ~200 lines. Uses parameterised queries, transactions where needed.
 */

const {
  pool, authenticate, logger,
  isManagement, getSalesRepGroup, checkInquiryOwnership,
  logActivity, actorName, generateQuotationNumber,
  notifyUsers, notifyRoleUsers,
} = require('./_helpers');

function generateDraftQuotationNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EST-DRAFT-${ts}-${rand}`;
}

function isDraftQuotationNumber(value) {
  return String(value || '').startsWith('EST-DRAFT-');
}

module.exports = function (router) {

  // ── GET /materials — material master grouped by category ──────────────────
  router.get('/materials', authenticate, async (req, res) => {
    try {
      const grouped = {
        substrate: [],
        ink: [],
        adhesive: [],
      };

      const seenByCategory = {
        substrate: new Set(),
        ink: new Set(),
        adhesive: new Set(),
      };

      const normalizeText = (value) => String(value || '').trim().toLowerCase();
      const toFiniteNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const normalizeLegacyCategory = (value) => {
        const key = normalizeText(value);
        if (key === 'ink') return 'ink';
        if (key === 'adhesive') return 'adhesive';
        if (key === 'substrate') return 'substrate';
        if (key.includes('ink')) return 'ink';
        if (key.includes('adhesive') || key.includes('coating') || key.includes('solvent')) return 'adhesive';
        return 'substrate';
      };

      const pushMaterial = (category, row) => {
        if (!grouped[category]) grouped[category] = [];
        if (!seenByCategory[category]) seenByCategory[category] = new Set();

        const nameKey = normalizeText(row?.name);
        if (!nameKey || seenByCategory[category].has(nameKey)) return;

        seenByCategory[category].add(nameKey);
        grouped[category].push(row);
      };

      // Primary source: live item master pricing with WA + market policy prices.
      try {
        const { rows: liveRows } = await pool.query(`
          WITH rm_prices AS (
            SELECT
              catlinedesc,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS stock_qty,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS order_qty,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS stock_val,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS order_val
            FROM fp_actualrmdata
            WHERE catlinedesc IS NOT NULL
            GROUP BY catlinedesc
          ),
          item_prices AS (
            SELECT
              i.id,
              CASE
                WHEN i.item_type = 'raw_ink' THEN 'ink'
                WHEN i.item_type IN ('raw_adhesive', 'raw_solvent', 'raw_coating') THEN 'adhesive'
                ELSE 'substrate'
              END AS category,
              COALESCE(NULLIF(TRIM(i.subcategory), ''), i.item_type) AS subcategory,
              COALESCE(NULLIF(TRIM(i.item_name), ''), NULLIF(TRIM(i.item_code), '')) AS name,
              i.solid_pct,
              NULLIF(i.density_g_cm3, 0) AS density,
              COALESCE(i.waste_pct, 0) AS waste_pct,
              i.market_ref_price,
              CASE
                WHEN COALESCE(rp.stock_qty, 0) > 0
                THEN ROUND((rp.stock_val / NULLIF(rp.stock_qty, 0))::numeric, 4)
                ELSE NULL
              END AS stock_price_wa,
              CASE
                WHEN COALESCE(rp.order_qty, 0) > 0
                THEN ROUND((rp.order_val / NULLIF(rp.order_qty, 0))::numeric, 4)
                ELSE NULL
              END AS on_order_price_wa,
              CASE
                WHEN (COALESCE(rp.stock_qty, 0) + COALESCE(rp.order_qty, 0)) > 0
                THEN ROUND(((rp.stock_val + rp.order_val) / NULLIF(rp.stock_qty + rp.order_qty, 0))::numeric, 4)
                ELSE NULL
              END AS combined_price_wa
            FROM mes_item_master i
            LEFT JOIN rm_prices rp ON rp.catlinedesc = i.oracle_cat_desc
            WHERE i.is_active = true
              AND i.item_type IN (
                'raw_resin',
                'raw_ink',
                'raw_adhesive',
                'raw_solvent',
                'raw_coating',
                'raw_packaging'
              )
          )
          SELECT
            id,
            category,
            subcategory,
            name,
            solid_pct,
            density,
            waste_pct,
            stock_price_wa,
            on_order_price_wa,
            combined_price_wa,
            COALESCE(market_ref_price, on_order_price_wa, stock_price_wa, combined_price_wa, 0)::numeric AS market_price,
            COALESCE(combined_price_wa, stock_price_wa, market_ref_price, on_order_price_wa, 0)::numeric AS cost_per_kg
          FROM item_prices
          WHERE name IS NOT NULL
          ORDER BY category, subcategory, name
        `);

        liveRows.forEach((row) => {
          const category = normalizeLegacyCategory(row.category);
          pushMaterial(category, {
            id: row.id,
            category,
            subcategory: row.subcategory || category,
            name: row.name,
            solid_pct: toFiniteNumber(row.solid_pct),
            density: toFiniteNumber(row.density),
            waste_pct: toFiniteNumber(row.waste_pct) ?? 0,
            stock_price_wa: toFiniteNumber(row.stock_price_wa),
            on_order_price_wa: toFiniteNumber(row.on_order_price_wa),
            combined_price_wa: toFiniteNumber(row.combined_price_wa),
            market_price: toFiniteNumber(row.market_price),
            cost_per_kg: toFiniteNumber(row.cost_per_kg) ?? 0,
          });
        });
      } catch (liveErr) {
        // Legacy DB snapshots may not have item master tables yet.
        if (liveErr.code !== '42P01') throw liveErr;
      }

      // Fallback source: legacy estimation material master.
      try {
        const { rows: legacyRows } = await pool.query(`
          SELECT id, category, subcategory, name, solid_pct, density, cost_per_kg, waste_pct
          FROM mes_material_master
          WHERE is_active = true
          ORDER BY category, subcategory, name
        `);

        legacyRows.forEach((row) => {
          const category = normalizeLegacyCategory(row.category);
          const baseCost = toFiniteNumber(row.cost_per_kg) ?? 0;
          pushMaterial(category, {
            id: row.id,
            category,
            subcategory: row.subcategory || category,
            name: row.name,
            solid_pct: toFiniteNumber(row.solid_pct),
            density: toFiniteNumber(row.density),
            waste_pct: toFiniteNumber(row.waste_pct) ?? 0,
            stock_price_wa: baseCost,
            on_order_price_wa: baseCost,
            combined_price_wa: baseCost,
            market_price: baseCost,
            cost_per_kg: baseCost,
          });
        });
      } catch (legacyErr) {
        // Keep live rows when legacy table is unavailable.
        if (legacyErr.code !== '42P01') throw legacyErr;
      }

      Object.keys(grouped).forEach((category) => {
        grouped[category].sort((a, b) => {
          const subA = String(a.subcategory || '');
          const subB = String(b.subcategory || '');
          if (subA !== subB) return subA.localeCompare(subB);
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
      });

      res.json({ success: true, data: grouped });
    } catch (err) {
      logger.error('GET /materials error:', err);
      res.status(500).json({ success: false, error: 'Failed to load materials' });
    }
  });

  // ── GET /estimation/defaults?product_group=X&product_group_id=N ─────────
  router.get('/estimation/defaults', authenticate, async (req, res) => {
    try {
      const { product_group, product_group_id } = req.query;
      if (!product_group) {
        return res.status(400).json({ success: false, error: 'product_group query parameter required' });
      }
      const { rows } = await pool.query(
        `SELECT * FROM mes_estimation_product_defaults WHERE product_group = $1`,
        [product_group]
      );
      const data = rows.length > 0 ? { ...rows[0] } : null;

      // If no explicit default_bom_version_id, auto-detect active BOM for this PG
      if (data && !data.default_bom_version_id && product_group_id) {
        const bomRes = await pool.query(
          `SELECT id FROM mes_bom_versions WHERE product_group_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`,
          [product_group_id]
        );
        if (bomRes.rows.length > 0) {
          data.default_bom_version_id = bomRes.rows[0].id;
        }
      }

      if (!data) {
        return res.json({ success: true, data: null, message: 'No defaults found for this product group' });
      }
      res.json({ success: true, data });
    } catch (err) {
      logger.error('GET /estimation/defaults error:', err);
      res.status(500).json({ success: false, error: 'Failed to load defaults' });
    }
  });

  // ── POST /estimations — save estimation data ─────────────────────────────
  router.post('/estimations', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const { inquiry_id, estimation_data, bom_version_id } = req.body;
      if (!inquiry_id || !estimation_data) {
        return res.status(400).json({ success: false, error: 'inquiry_id and estimation_data required' });
      }

      // Ownership check
      const canAccess = await checkInquiryOwnership(req.user, inquiry_id);
      if (!canAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Validate estimation_data has required keys
      const reqKeys = ['materials', 'operations', 'dimensions', 'summary'];
      const missing = reqKeys.filter(k => !(k in estimation_data));
      if (missing.length > 0) {
        return res.status(400).json({ success: false, error: `estimation_data missing keys: ${missing.join(', ')}` });
      }

      await client.query('BEGIN');

      // Check if estimation already exists for this inquiry
      const existing = await client.query(
        `SELECT id FROM mes_quotations WHERE inquiry_id = $1 AND estimation_data IS NOT NULL ORDER BY id DESC LIMIT 1`,
        [inquiry_id]
      );

      let estimationId;
      if (existing.rows.length > 0) {
        // Update existing
        estimationId = existing.rows[0].id;
        await client.query(
          `UPDATE mes_quotations SET estimation_data = $1, bom_version_id = $2, updated_at = NOW() WHERE id = $3`,
          [JSON.stringify(estimation_data), bom_version_id || null, estimationId]
        );
      } else {
        // Insert as standalone estimation record with draft placeholder number.
        // Real quotation number is assigned only when promoted via create-quotation.
        const draftQuotationNumber = generateDraftQuotationNumber();
        const inqData = await client.query(
          `SELECT customer_id, inquiry_number FROM mes_presales_inquiries WHERE id = $1`,
          [inquiry_id]
        );
        const inq = inqData.rows[0] || {};
        const insResult = await client.query(
          `INSERT INTO mes_quotations
             (quotation_number, inquiry_id, customer_id, status, estimation_data, bom_version_id, created_by, created_at)
           VALUES ($1, $2, $3, 'draft', $4, $5, $6, NOW())
           RETURNING id`,
          [draftQuotationNumber, inquiry_id, inq.customer_id || null, JSON.stringify(estimation_data), bom_version_id || null, req.user.id]
        );
        estimationId = insResult.rows[0].id;
      }

      // Advance inquiry to estimation stage if at cse_approved
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = 'estimation', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage = 'cse_approved'`,
        [inquiry_id]
      );

      await logActivity(inquiry_id, 'estimation_saved', { quotation_id: estimationId }, req.user, client);
      await client.query('COMMIT');

      res.json({ success: true, data: { id: estimationId } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('POST /estimations error:', err);
      res.status(500).json({ success: false, error: 'Failed to save estimation' });
    } finally {
      client.release();
    }
  });

  // ── GET /estimations?inquiry_id=N ─────────────────────────────────────────
  router.get('/estimations', authenticate, async (req, res) => {
    try {
      const { inquiry_id } = req.query;
      if (!inquiry_id) {
        return res.status(400).json({ success: false, error: 'inquiry_id required' });
      }
      const canAccess = await checkInquiryOwnership(req.user, parseInt(inquiry_id));
      if (!canAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { rows } = await pool.query(
        `SELECT id, quotation_number, estimation_data, status, created_at, updated_at
         FROM mes_quotations
         WHERE inquiry_id = $1 AND estimation_data IS NOT NULL
         ORDER BY id DESC`,
        [inquiry_id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /estimations error:', err);
      res.status(500).json({ success: false, error: 'Failed to load estimations' });
    }
  });

  // ── POST /estimations/:id/create-quotation — create quotation from estimation ─
  router.post('/estimations/:id/create-quotation', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      const estId = req.params.id;
      const est = await client.query(
        `SELECT q.*, i.inquiry_number, i.id AS inq_id, i.inquiry_stage
         FROM mes_quotations q
         JOIN mes_presales_inquiries i ON i.id = q.inquiry_id
         WHERE q.id = $1`,
        [estId]
      );
      if (est.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Estimation not found' });
      }
      const row = est.rows[0];
      if (!row.estimation_data) {
        return res.status(400).json({ success: false, error: 'No estimation data on this record' });
      }

      const canAccess = await checkInquiryOwnership(req.user, row.inq_id);
      if (!canAccess) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      await client.query('BEGIN');

      let quotationNumber = row.quotation_number;
      if (!quotationNumber || isDraftQuotationNumber(quotationNumber)) {
        quotationNumber = await generateQuotationNumber(client);
      }

      // Extract sale price from estimation data
      const totalCost = row.estimation_data?.totalCost || {};
      const unitPrice = totalCost.perKg?.salePrice || 0;
      const quantity = row.estimation_data?.header?.orderQty || 0;
      const totalPrice = unitPrice * quantity;

      // Update the quotation to have price info + pending_approval status
      await client.query(
        `UPDATE mes_quotations SET
           quotation_number = $1,
           unit_price  = $2, quantity = $3, total_price = $4,
           material_cost = $5, process_cost = $6, overhead_cost = $7, margin_percent = $8,
           status = 'draft', updated_at = NOW()
         WHERE id = $9`,
        [
          quotationNumber,
          unitPrice, quantity, totalPrice,
          totalCost.perKg?.rawMaterialCost || 0,
          totalCost.perKg?.operationCost || 0,
          totalCost.perKg?.deliveryCost || 0,
          totalCost.perKg?.markupPct || 0,
          estId,
        ]
      );

      // Advance inquiry to 'quoted'
      await client.query(
        `UPDATE mes_presales_inquiries
         SET inquiry_stage = 'quoted', stage_changed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND inquiry_stage IN ('estimation', 'cse_approved')`,
        [row.inq_id]
      );

      await logActivity(row.inq_id, 'quotation_created_from_estimation', {
        quotation_id: estId, unit_price: unitPrice, total_price: totalPrice,
      }, req.user, client);

      await client.query('COMMIT');

      res.json({ success: true, data: { quotation_id: estId, unit_price: unitPrice, total_price: totalPrice } });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('POST /estimations/create-quotation error:', err);
      res.status(500).json({ success: false, error: 'Failed to create quotation' });
    } finally {
      client.release();
    }
  });

  // ── PATCH /estimations/:id/actuals — save actual consumption data ─────────
  router.patch('/estimations/:id/actuals', authenticate, async (req, res) => {
    try {
      const estId = req.params.id;
      const { actuals_data } = req.body;
      if (!actuals_data) {
        return res.status(400).json({ success: false, error: 'actuals_data required' });
      }

      const est = await pool.query(
        `SELECT q.inquiry_id, q.estimation_data FROM mes_quotations q WHERE q.id = $1`,
        [estId]
      );
      if (est.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Estimation not found' });
      }

      const canAccess = await checkInquiryOwnership(req.user, est.rows[0].inquiry_id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });

      // Merge actuals into estimation_data
      const existing = est.rows[0].estimation_data || {};
      existing.actuals = actuals_data;

      await pool.query(
        `UPDATE mes_quotations SET estimation_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(existing), estId]
      );

      await logActivity(est.rows[0].inquiry_id, 'actuals_saved', { quotation_id: estId }, req.user);
      res.json({ success: true, message: 'Actuals saved' });
    } catch (err) {
      logger.error('PATCH /estimations/actuals error:', err);
      res.status(500).json({ success: false, error: 'Failed to save actuals' });
    }
  });

};
