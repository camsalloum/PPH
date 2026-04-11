/**
 * MES Master Data — TDS Film Parameters Routes
 * Mounted at /api/mes/master-data/tds/:id/film-parameters
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const TDS_WRITE_ROLES = ['admin', 'production_manager', 'quality_control'];
const FILM_FIELDS = [
  'haze', 'gloss', 'dart_drop',
  'tear_md', 'tear_td',
  'tensile_yield_md', 'tensile_yield_td',
  'tensile_break_md', 'tensile_break_td',
  'elongation_md', 'elongation_td',
  'secant_modulus', 'secant_modulus_td',
  'puncture_force', 'puncture_energy',
  'seal_init_temp', 'seal_peak_strength',
  'hot_tack_temp', 'hot_tack_strength',
  'cof_static', 'cof_kinetic', 'cof_config',
];

function isTdsWriter(user) {
  return TDS_WRITE_ROLES.includes(user?.role);
}

function deriveProcessType(productionProcess) {
  const v = String(productionProcess || '').toLowerCase();
  if (v.includes('blown')) return 'blown_film';
  if (v.includes('cast')) return 'cast_film';
  if (v.includes('injection')) return 'injection_molded';
  return null;
}

function filterFilmLocks(locks) {
  const arr = Array.isArray(locks) ? locks : [];
  return arr.filter((f) => FILM_FIELDS.includes(f));
}

module.exports = function (router) {
  // GET /tds/:id/film-parameters — Read film parameters for one TDS
  router.get('/tds/:id/film-parameters', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           t.id AS tds_id,
           t.production_process,
           t.user_locked_fields AS legacy_locked_fields,
           t.haze AS legacy_haze,
           t.gloss AS legacy_gloss,
           t.dart_drop AS legacy_dart_drop,
           t.tear_md AS legacy_tear_md,
           t.tear_td AS legacy_tear_td,
           t.tensile_yield_md AS legacy_tensile_yield_md,
           t.tensile_yield_td AS legacy_tensile_yield_td,
           t.tensile_break_md AS legacy_tensile_break_md,
           t.tensile_break_td AS legacy_tensile_break_td,
           t.elongation_md AS legacy_elongation_md,
           t.elongation_td AS legacy_elongation_td,
           t.secant_modulus AS legacy_secant_modulus,
           t.secant_modulus_td AS legacy_secant_modulus_td,
           t.puncture_force AS legacy_puncture_force,
           t.puncture_energy AS legacy_puncture_energy,
           t.seal_init_temp AS legacy_seal_init_temp,
           t.seal_peak_strength AS legacy_seal_peak_strength,
           t.hot_tack_temp AS legacy_hot_tack_temp,
           t.hot_tack_strength AS legacy_hot_tack_strength,
           t.cof_static AS legacy_cof_static,
           t.cof_kinetic AS legacy_cof_kinetic,
           t.cof_config AS legacy_cof_config,
           f.*
         FROM mes_material_tds t
         LEFT JOIN mes_tds_film_parameters f ON f.tds_id = t.id
         WHERE t.id = $1`,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'TDS not found' });
      }

      const r = rows[0];

      // Transitional fallback: if dedicated row does not exist yet, surface legacy film columns.
      if (!r.id) {
        const fallback = {
          tds_id: r.tds_id,
          process_type: deriveProcessType(r.production_process),
          haze: r.legacy_haze,
          gloss: r.legacy_gloss,
          dart_drop: r.legacy_dart_drop,
          tear_md: r.legacy_tear_md,
          tear_td: r.legacy_tear_td,
          tensile_yield_md: r.legacy_tensile_yield_md,
          tensile_yield_td: r.legacy_tensile_yield_td,
          tensile_break_md: r.legacy_tensile_break_md,
          tensile_break_td: r.legacy_tensile_break_td,
          elongation_md: r.legacy_elongation_md,
          elongation_td: r.legacy_elongation_td,
          secant_modulus: r.legacy_secant_modulus,
          secant_modulus_td: r.legacy_secant_modulus_td,
          puncture_force: r.legacy_puncture_force,
          puncture_energy: r.legacy_puncture_energy,
          seal_init_temp: r.legacy_seal_init_temp,
          seal_peak_strength: r.legacy_seal_peak_strength,
          hot_tack_temp: r.legacy_hot_tack_temp,
          hot_tack_strength: r.legacy_hot_tack_strength,
          cof_static: r.legacy_cof_static,
          cof_kinetic: r.legacy_cof_kinetic,
          cof_config: r.legacy_cof_config,
          user_locked_fields: filterFilmLocks(r.legacy_locked_fields),
          source: 'legacy',
        };

        return res.json({ success: true, data: fallback });
      }

      const data = {
        tds_id: r.tds_id,
        process_type: r.process_type,
        haze: r.haze,
        gloss: r.gloss,
        dart_drop: r.dart_drop,
        tear_md: r.tear_md,
        tear_td: r.tear_td,
        tensile_yield_md: r.tensile_yield_md,
        tensile_yield_td: r.tensile_yield_td,
        tensile_break_md: r.tensile_break_md,
        tensile_break_td: r.tensile_break_td,
        elongation_md: r.elongation_md,
        elongation_td: r.elongation_td,
        secant_modulus: r.secant_modulus,
        secant_modulus_td: r.secant_modulus_td,
        puncture_force: r.puncture_force,
        puncture_energy: r.puncture_energy,
        seal_init_temp: r.seal_init_temp,
        seal_peak_strength: r.seal_peak_strength,
        hot_tack_temp: r.hot_tack_temp,
        hot_tack_strength: r.hot_tack_strength,
        cof_static: r.cof_static,
        cof_kinetic: r.cof_kinetic,
        cof_config: r.cof_config,
        user_locked_fields: r.user_locked_fields || [],
        source: 'film_table',
        updated_at: r.updated_at,
      };

      return res.json({ success: true, data });
    } catch (err) {
      logger.error('GET /tds/:id/film-parameters error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch film parameters' });
    }
  });

  // PUT /tds/:id/film-parameters — Upsert film parameters
  router.put('/tds/:id/film-parameters', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const b = req.body || {};
      const lockFields = b.lockFields === true;
      const isAutoSync = !lockFields;

      await client.query('BEGIN');

      const tdsRes = await client.query(
        'SELECT id, production_process, user_locked_fields FROM mes_material_tds WHERE id = $1',
        [req.params.id]
      );
      if (!tdsRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'TDS not found' });
      }

      const tds = tdsRes.rows[0];

      await client.query(
        `INSERT INTO mes_tds_film_parameters (tds_id, process_type, created_by, updated_by)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (tds_id) DO NOTHING`,
        [req.params.id, deriveProcessType(tds.production_process), req.user.id]
      );

      const lockRes = await client.query(
        'SELECT user_locked_fields FROM mes_tds_film_parameters WHERE tds_id = $1',
        [req.params.id]
      );
      let currentLocked = lockRes.rows[0]?.user_locked_fields || [];
      if (!currentLocked.length) {
        currentLocked = filterFilmLocks(tds.user_locked_fields);
      }

      const sets = [];
      const vals = [];
      const updatedFields = [];
      let p = 1;

      if (b.process_type !== undefined) {
        sets.push(`process_type = $${p++}`);
        vals.push(b.process_type || null);
      }

      for (const f of FILM_FIELDS) {
        if (b[f] !== undefined) {
          if (isAutoSync && currentLocked.includes(f)) continue;
          sets.push(`${f} = $${p++}`);
          vals.push(b[f]);
          updatedFields.push(f);
        }
      }

      if (!sets.length) {
        const current = await client.query('SELECT * FROM mes_tds_film_parameters WHERE tds_id = $1', [req.params.id]);
        await client.query('COMMIT');
        return res.json({
          success: true,
          data: current.rows[0],
          lockedFields: current.rows[0]?.user_locked_fields || [],
          skipped: true,
          message: isAutoSync ? 'All requested fields are locked; no update applied' : 'No fields to update',
        });
      }

      if (lockFields && updatedFields.length) {
        sets.push(`user_locked_fields = (
          SELECT ARRAY(
            SELECT DISTINCT unnest(COALESCE(user_locked_fields, '{}'::TEXT[]) || $${p}::TEXT[])
          )
        )`);
        vals.push(updatedFields);
        p += 1;
      }

      sets.push(`updated_by = $${p++}`);
      vals.push(req.user.id);
      sets.push('updated_at = NOW()');
      vals.push(req.params.id);

      const sql = `
        UPDATE mes_tds_film_parameters
        SET ${sets.join(', ')}
        WHERE tds_id = $${p}
        RETURNING *
      `;

      const updated = await client.query(sql, vals);
      await client.query('COMMIT');

      return res.json({
        success: true,
        data: updated.rows[0],
        lockedFields: updated.rows[0].user_locked_fields || [],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('PUT /tds/:id/film-parameters error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update film parameters' });
    } finally {
      client.release();
    }
  });

  // PATCH /tds/:id/film-parameters/unlock-fields — Unlock selected fields
  router.patch('/tds/:id/film-parameters/unlock-fields', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
      const invalid = fields.filter((f) => !FILM_FIELDS.includes(f));
      if (!fields.length || invalid.length) {
        return res.status(400).json({ success: false, error: 'Valid film fields array required' });
      }

      const { rows } = await pool.query(
        `UPDATE mes_tds_film_parameters
         SET user_locked_fields = ARRAY(
           SELECT unnest(COALESCE(user_locked_fields, '{}'::TEXT[]))
           EXCEPT SELECT unnest($1::TEXT[])
         ),
         updated_at = NOW(),
         updated_by = $3
         WHERE tds_id = $2
         RETURNING user_locked_fields`,
        [fields, req.params.id, req.user.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Film parameters not found' });
      }

      return res.json({
        success: true,
        unlockedFields: fields,
        remaining: rows[0].user_locked_fields || [],
      });
    } catch (err) {
      logger.error('PATCH /tds/:id/film-parameters/unlock-fields error:', err);
      return res.status(500).json({ success: false, error: 'Failed to unlock film fields' });
    }
  });
};
