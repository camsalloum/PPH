/**
 * MES Master Data — Taxonomy Routes
 * Mounted at /api/mes/master-data
 *
 * Provides domain/category/subcategory management and item mapping APIs.
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const TAXONOMY_WRITE_ROLES = ['admin', 'sales_manager', 'production_manager'];

function canWrite(user) {
  return TAXONOMY_WRITE_ROLES.includes(user?.role);
}

function cleanText(value, maxLen = null) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLen && text.length > maxLen ? text.slice(0, maxLen) : text;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

async function resolveDomainId(client, domainKey, domainId) {
  if (domainId != null) return domainId;
  if (!domainKey) return null;

  const { rows } = await client.query(
    `SELECT id FROM mes_item_taxonomy_domains WHERE domain_key = $1 LIMIT 1`,
    [domainKey]
  );
  return rows[0]?.id || null;
}

module.exports = function (router) {

  // GET /taxonomy/domains
  router.get('/taxonomy/domains', authenticate, async (req, res) => {
    try {
      const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
      const { rows } = await pool.query(
        `SELECT id, domain_key, display_name, sort_order, is_active, created_at, updated_at
         FROM mes_item_taxonomy_domains
         WHERE ($1::boolean OR is_active = true)
         ORDER BY LOWER(display_name), id`,
        [includeInactive]
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /taxonomy/domains error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch taxonomy domains' });
    }
  });

  // POST /taxonomy/domains
  router.post('/taxonomy/domains', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const displayName = cleanText(req.body?.display_name, 120);
      const keyInput = cleanText(req.body?.domain_key, 60) || displayName;
      const domainKey = normalizeKey(keyInput);
      const sortOrder = parseInteger(req.body?.sort_order) ?? 100;

      if (!displayName) {
        return res.status(400).json({ success: false, error: 'display_name is required' });
      }
      if (!domainKey) {
        return res.status(400).json({ success: false, error: 'domain_key is required' });
      }

      const { rows } = await pool.query(
        `INSERT INTO mes_item_taxonomy_domains (
           domain_key, display_name, sort_order, is_active, created_by, updated_by
         ) VALUES ($1, $2, $3, true, $4, $4)
         ON CONFLICT (domain_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
         RETURNING id, domain_key, display_name, sort_order, is_active, created_at, updated_at`,
        [domainKey, displayName, sortOrder, req.user.id]
      );

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /taxonomy/domains error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save taxonomy domain' });
    }
  });

  // PUT /taxonomy/domains/:id
  router.put('/taxonomy/domains/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const displayName = cleanText(req.body?.display_name, 120);
      const sortOrder = req.body?.sort_order === undefined ? undefined : parseInteger(req.body?.sort_order);
      const isActive = parseOptionalBoolean(req.body?.is_active);

      if (req.body?.sort_order !== undefined && sortOrder == null) {
        return res.status(400).json({ success: false, error: 'sort_order must be an integer' });
      }
      if (req.body?.is_active !== undefined && isActive === undefined) {
        return res.status(400).json({ success: false, error: 'is_active must be true or false' });
      }

      const { rows } = await pool.query(
        `UPDATE mes_item_taxonomy_domains
         SET display_name = COALESCE($1, display_name),
             sort_order = COALESCE($2, sort_order),
             is_active = COALESCE($3, is_active),
             updated_by = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, domain_key, display_name, sort_order, is_active, created_at, updated_at`,
        [displayName, sortOrder, isActive, req.user.id, req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Taxonomy domain not found' });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /taxonomy/domains/:id error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update taxonomy domain' });
    }
  });

  // GET /taxonomy/categories
  router.get('/taxonomy/categories', authenticate, async (req, res) => {
    try {
      const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
      const domainId = parseInteger(req.query.domain_id);
      const domainKey = cleanText(req.query.domain_key, 60);

      const params = [includeInactive];
      const where = ['($1::boolean OR c.is_active = true)'];

      if (domainId != null) {
        params.push(domainId);
        where.push(`d.id = $${params.length}`);
      }
      if (domainKey) {
        params.push(domainKey.toLowerCase());
        where.push(`d.domain_key = $${params.length}`);
      }

      const { rows } = await pool.query(
        `SELECT
           c.id,
           c.domain_id,
           d.domain_key,
           d.display_name AS domain_name,
           c.internal_key,
           c.display_name,
           c.sort_order,
           c.is_active,
           c.created_at,
           c.updated_at
         FROM mes_item_taxonomy_categories c
         JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
         WHERE ${where.join(' AND ')}
         ORDER BY LOWER(c.display_name), c.id`,
        params
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /taxonomy/categories error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch taxonomy categories' });
    }
  });

  // POST /taxonomy/categories
  router.post('/taxonomy/categories', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      const displayName = cleanText(req.body?.display_name, 180);
      const internalKey = normalizeKey(cleanText(req.body?.internal_key, 120) || displayName);
      const sortOrder = parseInteger(req.body?.sort_order) ?? 100;
      const bodyDomainId = parseInteger(req.body?.domain_id);
      const bodyDomainKey = cleanText(req.body?.domain_key, 60);

      if (!displayName) {
        return res.status(400).json({ success: false, error: 'display_name is required' });
      }
      if (!internalKey) {
        return res.status(400).json({ success: false, error: 'internal_key could not be derived' });
      }

      const resolvedDomainId = await resolveDomainId(client, bodyDomainKey?.toLowerCase(), bodyDomainId);
      if (!resolvedDomainId) {
        return res.status(400).json({ success: false, error: 'domain_id or domain_key is required' });
      }

      const { rows } = await client.query(
        `INSERT INTO mes_item_taxonomy_categories (
           domain_id, internal_key, display_name, sort_order, is_active, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, true, $5, $5)
         ON CONFLICT (domain_id, internal_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
         RETURNING id, domain_id, internal_key, display_name, sort_order, is_active, created_at, updated_at`,
        [resolvedDomainId, internalKey, displayName, sortOrder, req.user.id]
      );

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /taxonomy/categories error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save taxonomy category' });
    } finally {
      client.release();
    }
  });

  // PUT /taxonomy/categories/:id
  router.put('/taxonomy/categories/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const displayName = cleanText(req.body?.display_name, 180);
      const sortOrder = req.body?.sort_order === undefined ? undefined : parseInteger(req.body?.sort_order);
      const isActive = parseOptionalBoolean(req.body?.is_active);

      if (req.body?.sort_order !== undefined && sortOrder == null) {
        return res.status(400).json({ success: false, error: 'sort_order must be an integer' });
      }
      if (req.body?.is_active !== undefined && isActive === undefined) {
        return res.status(400).json({ success: false, error: 'is_active must be true or false' });
      }

      const { rows } = await pool.query(
        `UPDATE mes_item_taxonomy_categories
         SET display_name = COALESCE($1, display_name),
             sort_order = COALESCE($2, sort_order),
             is_active = COALESCE($3, is_active),
             updated_by = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, domain_id, internal_key, display_name, sort_order, is_active, created_at, updated_at`,
        [displayName, sortOrder, isActive, req.user.id, req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Taxonomy category not found' });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /taxonomy/categories/:id error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update taxonomy category' });
    }
  });

  // GET /taxonomy/subcategories
  router.get('/taxonomy/subcategories', authenticate, async (req, res) => {
    try {
      const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
      const categoryId = parseInteger(req.query.category_id);
      const categoryKey = cleanText(req.query.category_key, 120);
      const domainKey = cleanText(req.query.domain_key, 60);

      const params = [includeInactive];
      const where = ['($1::boolean OR sc.is_active = true)'];

      if (categoryId != null) {
        params.push(categoryId);
        where.push(`c.id = $${params.length}`);
      }
      if (categoryKey) {
        params.push(categoryKey.toLowerCase());
        where.push(`c.internal_key = $${params.length}`);
      }
      if (domainKey) {
        params.push(domainKey.toLowerCase());
        where.push(`d.domain_key = $${params.length}`);
      }

      const { rows } = await pool.query(
        `SELECT
           sc.id,
           sc.category_id,
           c.internal_key AS category_key,
           c.display_name AS category_name,
           d.domain_key,
           d.display_name AS domain_name,
           sc.internal_key,
           sc.display_name,
           sc.sort_order,
           sc.is_active,
           sc.created_at,
           sc.updated_at
         FROM mes_item_taxonomy_subcategories sc
         JOIN mes_item_taxonomy_categories c ON c.id = sc.category_id
         JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
         WHERE ${where.join(' AND ')}
         ORDER BY LOWER(sc.display_name), sc.id`,
        params
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /taxonomy/subcategories error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch taxonomy subcategories' });
    }
  });

  // POST /taxonomy/subcategories
  router.post('/taxonomy/subcategories', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      const displayName = cleanText(req.body?.display_name, 220);
      const internalKey = normalizeKey(cleanText(req.body?.internal_key, 140) || displayName);
      const sortOrder = parseInteger(req.body?.sort_order) ?? 100;
      const categoryId = parseInteger(req.body?.category_id);
      const categoryKey = cleanText(req.body?.category_key, 120);
      const domainKey = cleanText(req.body?.domain_key, 60);

      if (!displayName) {
        return res.status(400).json({ success: false, error: 'display_name is required' });
      }
      if (!internalKey) {
        return res.status(400).json({ success: false, error: 'internal_key could not be derived' });
      }

      let resolvedCategoryId = categoryId;

      if (resolvedCategoryId == null && categoryKey) {
        const params = [categoryKey.toLowerCase()];
        let where = 'c.internal_key = $1';

        if (domainKey) {
          params.push(domainKey.toLowerCase());
          where += ` AND d.domain_key = $2`;
        }

        const categoryRes = await client.query(
          `SELECT c.id
           FROM mes_item_taxonomy_categories c
           JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
           WHERE ${where}
           LIMIT 1`,
          params
        );

        resolvedCategoryId = categoryRes.rows[0]?.id || null;
      }

      if (!resolvedCategoryId) {
        return res.status(400).json({ success: false, error: 'category_id or valid category_key is required' });
      }

      const { rows } = await client.query(
        `INSERT INTO mes_item_taxonomy_subcategories (
           category_id, internal_key, display_name, sort_order, is_active, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, true, $5, $5)
         ON CONFLICT (category_id, internal_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
         RETURNING id, category_id, internal_key, display_name, sort_order, is_active, created_at, updated_at`,
        [resolvedCategoryId, internalKey, displayName, sortOrder, req.user.id]
      );

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /taxonomy/subcategories error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save taxonomy subcategory' });
    } finally {
      client.release();
    }
  });

  // PUT /taxonomy/subcategories/:id
  router.put('/taxonomy/subcategories/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const displayName = cleanText(req.body?.display_name, 220);
      const sortOrder = req.body?.sort_order === undefined ? undefined : parseInteger(req.body?.sort_order);
      const isActive = parseOptionalBoolean(req.body?.is_active);

      if (req.body?.sort_order !== undefined && sortOrder == null) {
        return res.status(400).json({ success: false, error: 'sort_order must be an integer' });
      }
      if (req.body?.is_active !== undefined && isActive === undefined) {
        return res.status(400).json({ success: false, error: 'is_active must be true or false' });
      }

      const { rows } = await pool.query(
        `UPDATE mes_item_taxonomy_subcategories
         SET display_name = COALESCE($1, display_name),
             sort_order = COALESCE($2, sort_order),
             is_active = COALESCE($3, is_active),
             updated_by = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, category_id, internal_key, display_name, sort_order, is_active, created_at, updated_at`,
        [displayName, sortOrder, isActive, req.user.id, req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Taxonomy subcategory not found' });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /taxonomy/subcategories/:id error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update taxonomy subcategory' });
    }
  });

  // GET /taxonomy/mappings
  router.get('/taxonomy/mappings', authenticate, async (req, res) => {
    try {
      const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
      const categoryId = parseInteger(req.query.category_id);
      const subcategoryId = parseInteger(req.query.subcategory_id);
      const sourceSystem = cleanText(req.query.source_system, 40);
      const domainKey = cleanText(req.query.domain_key, 60);

      const params = [includeInactive];
      const where = ['($1::boolean OR m.is_active = true)'];

      if (categoryId != null) {
        params.push(categoryId);
        where.push(`m.category_id = $${params.length}`);
      }
      if (subcategoryId != null) {
        params.push(subcategoryId);
        where.push(`m.subcategory_id = $${params.length}`);
      }
      if (sourceSystem) {
        params.push(sourceSystem.toLowerCase());
        where.push(`LOWER(m.source_system) = $${params.length}`);
      }
      if (domainKey) {
        params.push(domainKey.toLowerCase());
        where.push(`d.domain_key = $${params.length}`);
      }

      const { rows } = await pool.query(
        `SELECT
           m.id,
           m.domain_id,
           d.domain_key,
           d.display_name AS domain_name,
           m.category_id,
           c.display_name AS category_name,
           c.internal_key AS category_key,
           m.subcategory_id,
           sc.display_name AS subcategory_name,
           sc.internal_key AS subcategory_key,
           m.source_system,
           m.source_item_key,
           m.source_item_label,
           m.is_active,
           m.created_at,
           m.updated_at
         FROM mes_item_taxonomy_mappings m
         JOIN mes_item_taxonomy_domains d ON d.id = m.domain_id
         JOIN mes_item_taxonomy_categories c ON c.id = m.category_id
         LEFT JOIN mes_item_taxonomy_subcategories sc ON sc.id = m.subcategory_id
         WHERE ${where.join(' AND ')}
         ORDER BY LOWER(COALESCE(m.source_item_label, m.source_item_key)), m.id`,
        params
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /taxonomy/mappings error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch taxonomy mappings' });
    }
  });

  // POST /taxonomy/mappings
  router.post('/taxonomy/mappings', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      const categoryId = parseInteger(req.body?.category_id);
      const subcategoryId = parseInteger(req.body?.subcategory_id);
      const sourceSystem = cleanText(req.body?.source_system, 40) || 'rm_sync';
      const sourceItemKey = cleanText(req.body?.source_item_key, 400);
      const sourceItemLabel = cleanText(req.body?.source_item_label, 500);

      if (!categoryId) {
        return res.status(400).json({ success: false, error: 'category_id is required' });
      }
      if (!sourceItemKey) {
        return res.status(400).json({ success: false, error: 'source_item_key is required' });
      }

      const categoryRes = await client.query(
        `SELECT c.id, c.domain_id
         FROM mes_item_taxonomy_categories c
         WHERE c.id = $1
         LIMIT 1`,
        [categoryId]
      );
      if (!categoryRes.rows.length) {
        return res.status(400).json({ success: false, error: 'Invalid category_id' });
      }
      const domainId = categoryRes.rows[0].domain_id;

      if (subcategoryId != null) {
        const subcategoryRes = await client.query(
          `SELECT id
           FROM mes_item_taxonomy_subcategories
           WHERE id = $1 AND category_id = $2
           LIMIT 1`,
          [subcategoryId, categoryId]
        );
        if (!subcategoryRes.rows.length) {
          return res.status(400).json({ success: false, error: 'subcategory_id does not belong to category_id' });
        }
      }

      const existingRes = await client.query(
        `SELECT id
         FROM mes_item_taxonomy_mappings
         WHERE category_id = $1
           AND COALESCE(subcategory_id, 0) = COALESCE($2, 0)
           AND LOWER(source_system) = LOWER($3)
           AND LOWER(TRIM(source_item_key)) = LOWER(TRIM($4))
           AND is_active = true
         LIMIT 1`,
        [categoryId, subcategoryId || null, sourceSystem, sourceItemKey]
      );

      if (existingRes.rows.length) {
        const { rows } = await client.query(
          `UPDATE mes_item_taxonomy_mappings
           SET source_item_label = COALESCE($2, source_item_label),
               updated_by = $3,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [existingRes.rows[0].id, sourceItemLabel, req.user.id]
        );
        return res.json({ success: true, data: rows[0] });
      }

      const { rows } = await client.query(
        `INSERT INTO mes_item_taxonomy_mappings (
           domain_id, category_id, subcategory_id,
           source_system, source_item_key, source_item_label,
           is_active, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
         RETURNING *`,
        [domainId, categoryId, subcategoryId || null, sourceSystem, sourceItemKey, sourceItemLabel, req.user.id]
      );

      return res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /taxonomy/mappings error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save taxonomy mapping' });
    } finally {
      client.release();
    }
  });

  // PUT /taxonomy/mappings/bulk-replace
  router.put('/taxonomy/mappings/bulk-replace', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    const client = await pool.connect();
    try {
      const categoryId = parseInteger(req.body?.category_id);
      const subcategoryId = parseInteger(req.body?.subcategory_id);
      const sourceSystem = cleanText(req.body?.source_system, 40) || 'rm_sync';
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!categoryId) {
        return res.status(400).json({ success: false, error: 'category_id is required' });
      }

      const categoryRes = await client.query(
        `SELECT c.id, c.domain_id
         FROM mes_item_taxonomy_categories c
         WHERE c.id = $1
         LIMIT 1`,
        [categoryId]
      );
      if (!categoryRes.rows.length) {
        return res.status(400).json({ success: false, error: 'Invalid category_id' });
      }
      const domainId = categoryRes.rows[0].domain_id;

      if (subcategoryId != null) {
        const subcategoryRes = await client.query(
          `SELECT id
           FROM mes_item_taxonomy_subcategories
           WHERE id = $1 AND category_id = $2
           LIMIT 1`,
          [subcategoryId, categoryId]
        );
        if (!subcategoryRes.rows.length) {
          return res.status(400).json({ success: false, error: 'subcategory_id does not belong to category_id' });
        }
      }

      const normalizedItems = Array.from(new Map(
        items
          .map((item) => ({
            source_item_key: cleanText(item?.source_item_key, 400),
            source_item_label: cleanText(item?.source_item_label, 500),
          }))
          .filter((item) => item.source_item_key)
          .map((item) => [item.source_item_key.trim().toLowerCase(), item])
      ).values());

      await client.query('BEGIN');

      await client.query(
        `UPDATE mes_item_taxonomy_mappings
         SET is_active = false,
             updated_by = $1,
             updated_at = NOW()
         WHERE category_id = $2
           AND COALESCE(subcategory_id, 0) = COALESCE($3, 0)
           AND LOWER(source_system) = LOWER($4)
           AND is_active = true`,
        [req.user.id, categoryId, subcategoryId || null, sourceSystem]
      );

      const insertedRows = [];

      for (const item of normalizedItems) {
        const { rows } = await client.query(
          `INSERT INTO mes_item_taxonomy_mappings (
             domain_id, category_id, subcategory_id,
             source_system, source_item_key, source_item_label,
             is_active, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
           RETURNING *`,
          [
            domainId,
            categoryId,
            subcategoryId || null,
            sourceSystem,
            item.source_item_key,
            item.source_item_label,
            req.user.id,
          ]
        );
        insertedRows.push(rows[0]);
      }

      await client.query('COMMIT');

      return res.json({
        success: true,
        data: {
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          source_system: sourceSystem,
          mapped_count: insertedRows.length,
          mappings: insertedRows,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('PUT /taxonomy/mappings/bulk-replace error:', err);
      return res.status(500).json({ success: false, error: 'Failed to replace taxonomy mappings' });
    } finally {
      client.release();
    }
  });

  // DELETE /taxonomy/mappings/:id
  router.delete('/taxonomy/mappings/:id', authenticate, async (req, res) => {
    if (!canWrite(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const { rows } = await pool.query(
        `UPDATE mes_item_taxonomy_mappings
         SET is_active = false,
             updated_by = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [req.user.id, req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Taxonomy mapping not found' });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('DELETE /taxonomy/mappings/:id error:', err);
      return res.status(500).json({ success: false, error: 'Failed to deactivate taxonomy mapping' });
    }
  });
};
