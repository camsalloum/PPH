# Field Visit Trip Planner — Complete Implementation Prompt
## Agent Instructions: Read every section. Implement in the order specified. Do not skip steps.

---

# PART 1 — DATABASE MIGRATIONS

Run all migrations in sequence. Each is idempotent (uses IF NOT EXISTS / DO $$ guards).

---

## Migration 01 — Add `pending_approval` status + approval columns to `crm_field_trips`

```sql
-- Migration: 001_field_trips_approval.sql
DO $$
BEGIN
  -- Extend status enum if it exists as a type; otherwise alter check constraint
  -- Assumes status is a VARCHAR with a CHECK constraint
  ALTER TABLE crm_field_trips
    ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_decision         VARCHAR(32),   -- 'approved' | 'rejected' | 'changes_requested'
    ADD COLUMN IF NOT EXISTS approval_comments         TEXT,
    ADD COLUMN IF NOT EXISTS approved_by               INTEGER REFERENCES crm_sales_reps(id),
    ADD COLUMN IF NOT EXISTS approved_at               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS co_travellers             INTEGER[],     -- array of sales_rep IDs
    ADD COLUMN IF NOT EXISTS predeparture_checklist    JSONB          DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS visa_details              JSONB          DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS template_name             VARCHAR(200),  -- if saved as template
    ADD COLUMN IF NOT EXISTS is_template               BOOLEAN        DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cloned_from_trip_id       INTEGER;

  -- Add 'pending_approval' to status if not present
  -- If status uses CHECK constraint, update it:
  ALTER TABLE crm_field_trips DROP CONSTRAINT IF EXISTS crm_field_trips_status_check;
  ALTER TABLE crm_field_trips ADD CONSTRAINT crm_field_trips_status_check
    CHECK (status IN ('planning','pending_approval','confirmed','in_progress','completed','cancelled'));
END
$$;
```

---

## Migration 02 — Multi-modal transport legs table

```sql
-- Migration: 002_field_trip_legs.sql
CREATE TABLE IF NOT EXISTS crm_field_trip_legs (
  id               SERIAL PRIMARY KEY,
  trip_id          INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  leg_order        INTEGER NOT NULL DEFAULT 1,
  mode             VARCHAR(30) NOT NULL DEFAULT 'car',  -- car|flight|train|bus|ferry|other
  from_stop_order  INTEGER,      -- null = hotel/airport not linked to a stop
  to_stop_order    INTEGER,
  from_label       VARCHAR(200), -- human-readable e.g. "Dubai Airport T3"
  to_label         VARCHAR(200),
  dep_datetime     TIMESTAMPTZ,
  arr_datetime     TIMESTAMPTZ,
  -- Flight-specific
  airline          VARCHAR(100),
  flight_number    VARCHAR(30),
  dep_airport      VARCHAR(10),  -- IATA code
  arr_airport      VARCHAR(10),
  seat_class       VARCHAR(30),  -- economy|business|first
  booking_ref      VARCHAR(60),
  -- Road-specific
  rental_company   VARCHAR(100),
  rental_ref       VARCHAR(60),
  est_km           NUMERIC(8,1),
  -- Train-specific
  train_operator   VARCHAR(100),
  train_number     VARCHAR(30),
  train_class      VARCHAR(30),
  -- Shared
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ftlegs_trip ON crm_field_trip_legs(trip_id);
```

---

## Migration 03 — Stop-level enhancements (GPS, products, attachments)

```sql
-- Migration: 003_field_trip_stops_enrich.sql
ALTER TABLE crm_field_trip_stops
  ADD COLUMN IF NOT EXISTS check_in_lat          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_lng          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m   INTEGER,
  ADD COLUMN IF NOT EXISTS check_in_timestamp    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_distance_m   INTEGER,  -- distance from planned coords
  ADD COLUMN IF NOT EXISTS products_discussed    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS samples_provided      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS samples_qty           INTEGER,
  ADD COLUMN IF NOT EXISTS competitor_info       TEXT,
  ADD COLUMN IF NOT EXISTS estimated_potential   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geocoded_by           VARCHAR(20) DEFAULT 'manual',  -- manual|search|customer_record
  ADD COLUMN IF NOT EXISTS stop_type_sub         VARCHAR(30),  -- airport|hotel|conference (for logistical stops)
  ADD COLUMN IF NOT EXISTS supplier_id           INTEGER,
  ADD COLUMN IF NOT EXISTS contact_email         VARCHAR(200);

-- Extend stop_type to include logistical values
ALTER TABLE crm_field_trip_stops DROP CONSTRAINT IF EXISTS crm_field_trip_stops_stop_type_check;
ALTER TABLE crm_field_trip_stops ADD CONSTRAINT crm_field_trip_stops_stop_type_check
  CHECK (stop_type IN ('customer','prospect','supplier','airport','hotel','conference','other'));
```

---

## Migration 04 — Expense multi-currency + receipt upload

```sql
-- Migration: 004_expenses_multicurrency.sql
ALTER TABLE crm_field_trip_expenses
  ADD COLUMN IF NOT EXISTS original_amount   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS original_currency CHAR(3) DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS fx_rate           NUMERIC(12,6) DEFAULT 1.000000,
  ADD COLUMN IF NOT EXISTS aed_equivalent    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS receipt_url       TEXT,        -- S3/storage URL
  ADD COLUMN IF NOT EXISTS receipt_filename  VARCHAR(300),
  ADD COLUMN IF NOT EXISTS receipt_mime      VARCHAR(80),
  ADD COLUMN IF NOT EXISTS approved          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by       INTEGER REFERENCES crm_sales_reps(id),
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

-- Rename the old `amount` to keep backward compat; aed_equivalent is the canonical AED value
-- If `amount` already exists and aed_equivalent is new, backfill:
UPDATE crm_field_trip_expenses
SET original_amount = amount,
    original_currency = COALESCE(currency, 'AED'),
    fx_rate = 1.000000,
    aed_equivalent = amount
WHERE aed_equivalent IS NULL;
```

---

## Migration 05 — Travel report per-stop manager comments + planned-vs-actual

```sql
-- Migration: 005_travel_report_enrich.sql
ALTER TABLE crm_field_trip_travel_reports
  ADD COLUMN IF NOT EXISTS manager_stop_comments JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planned_vs_actual     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roi_metrics           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_url               TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at      TIMESTAMPTZ;
```

---

## Migration 06 — Stop attachments table

```sql
-- Migration: 006_stop_attachments.sql
CREATE TABLE IF NOT EXISTS crm_field_trip_stop_attachments (
  id           SERIAL PRIMARY KEY,
  trip_id      INTEGER NOT NULL REFERENCES crm_field_trips(id) ON DELETE CASCADE,
  stop_id      INTEGER NOT NULL REFERENCES crm_field_trip_stops(id) ON DELETE CASCADE,
  filename     VARCHAR(300) NOT NULL,
  mime_type    VARCHAR(80),
  file_url     TEXT NOT NULL,
  file_size_kb INTEGER,
  uploaded_by  INTEGER REFERENCES crm_sales_reps(id),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  caption      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ftstop_attach_stop ON crm_field_trip_stop_attachments(stop_id);
CREATE INDEX IF NOT EXISTS idx_ftstop_attach_trip ON crm_field_trip_stop_attachments(trip_id);
```

---

## Migration 07 — FX rates reference table

```sql
-- Migration: 007_fx_rates.sql
CREATE TABLE IF NOT EXISTS crm_fx_rates (
  id            SERIAL PRIMARY KEY,
  from_currency CHAR(3) NOT NULL,
  to_currency   CHAR(3) NOT NULL DEFAULT 'AED',
  rate          NUMERIC(12,6) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source        VARCHAR(50) DEFAULT 'manual',
  UNIQUE (from_currency, to_currency, effective_date)
);
-- Seed common rates (update weekly via cron or admin panel)
INSERT INTO crm_fx_rates (from_currency, to_currency, rate, source) VALUES
  ('USD','AED', 3.6725, 'seed'),
  ('EUR','AED', 3.9800, 'seed'),
  ('GBP','AED', 4.6500, 'seed'),
  ('SAR','AED', 0.9793, 'seed'),
  ('KWD','AED', 11.940, 'seed'),
  ('BHD','AED', 9.7500, 'seed'),
  ('QAR','AED', 1.0090, 'seed'),
  ('OMR','AED', 9.5400, 'seed'),
  ('INR','AED', 0.0441, 'seed'),
  ('CNY','AED', 0.5060, 'seed')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;
```

---

## Migration 08 — Trip templates table

```sql
-- Migration: 008_trip_templates.sql
CREATE TABLE IF NOT EXISTS crm_field_trip_templates (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  trip_type    VARCHAR(20) DEFAULT 'local',
  country_code VARCHAR(3),
  transport_mode VARCHAR(30),
  stops_json   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- serialised stop list without dates
  created_by   INTEGER REFERENCES crm_sales_reps(id),
  is_shared    BOOLEAN DEFAULT FALSE,  -- shared = all reps can use it
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fttpl_rep ON crm_field_trip_templates(created_by);
```

---

# PART 2 — BACKEND ROUTES

All routes live in `server/routes/crm/fieldTrips.js` (or wherever the existing field-trip router is mounted). Use the existing auth middleware, `pool` for main DB, and `_helpers.js` patterns already in the project.

---

## 2.1 GET /api/crm/field-trips (Dual-tier scoping)

**REPLACE** the existing handler with this version that supports manager scope:

```js
// GET /api/crm/field-trips
router.get('/', requireAuth, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const isManager = ['admin','manager','sales_manager'].includes(role);
    const { status, rep_id, date_from, date_to, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    // Dual-tier scope
    if (isManager && rep_id && rep_id !== 'all') {
      params.push(parseInt(rep_id));
      where.push(`ft.created_by = $${params.length}`);
    } else if (!isManager) {
      params.push(userId);
      where.push(`ft.created_by = $${params.length}`);
    }

    if (status && status !== 'all') {
      params.push(status);
      where.push(`ft.status = $${params.length}`);
    }
    if (date_from) { params.push(date_from); where.push(`ft.departure_date >= $${params.length}`); }
    if (date_to)   { params.push(date_to);   where.push(`ft.return_date   <= $${params.length}`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    params.push(parseInt(limit), offset);

    const rows = await pool.query(`
      SELECT
        ft.*,
        sr.display_name AS rep_name,
        COUNT(DISTINCT fts.id) AS total_stops,
        COUNT(DISTINCT fts.id) FILTER (WHERE fts.outcome_status = 'visited') AS visited_stops,
        COALESCE(SUM(fse.aed_equivalent), 0) AS total_expenses_aed
      FROM crm_field_trips ft
      LEFT JOIN crm_sales_reps sr ON ft.created_by = sr.id
      LEFT JOIN crm_field_trip_stops fts ON fts.trip_id = ft.id
      LEFT JOIN crm_field_trip_expenses fse ON fse.trip_id = ft.id
      ${whereClause}
      GROUP BY ft.id, sr.display_name
      ORDER BY ft.departure_date DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countRow = await pool.query(`
      SELECT COUNT(*) FROM crm_field_trips ft ${whereClause}
    `, params.slice(0, params.length - 2));

    res.json({ data: rows.rows, total: parseInt(countRow.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('GET /field-trips', err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});
```

---

## 2.2 POST /api/crm/field-trips/:id/submit-approval

```js
// POST /api/crm/field-trips/:id/submit-approval
router.post('/:id/submit-approval', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  try {
    // Ownership check
    const check = await pool.query('SELECT id, status, created_by FROM crm_field_trips WHERE id=$1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Trip not found' });
    if (check.rows[0].created_by !== userId) return res.status(403).json({ error: 'Not your trip' });
    if (!['planning','confirmed'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: `Cannot submit from status: ${check.rows[0].status}` });
    }

    await pool.query(
      `UPDATE crm_field_trips
       SET status='pending_approval', submitted_for_approval_at=NOW()
       WHERE id=$1`,
      [id]
    );

    // Find group manager and emit SSE notification
    const tripRow = await pool.query('SELECT title, country FROM crm_field_trips WHERE id=$1', [id]);
    const repRow  = await pool.query('SELECT group_id, display_name FROM crm_sales_reps WHERE id=$1', [userId]);
    if (repRow.rows[0]?.group_id) {
      const mgr = await pool.query(
        'SELECT manager_id FROM sales_rep_groups WHERE id=$1', [repRow.rows[0].group_id]
      );
      if (mgr.rows[0]?.manager_id) {
        // Use existing SSE emit helper if available
        const notifPayload = {
          type: 'trip_approval_requested',
          trip_id: parseInt(id),
          trip_title: tripRow.rows[0].title,
          rep_name: repRow.rows[0].display_name,
          message: `${repRow.rows[0].display_name} submitted trip "${tripRow.rows[0].title}" for approval`,
        };
        // Assuming global sseClients map exists:
        if (typeof sseClients !== 'undefined' && sseClients.has(mgr.rows[0].manager_id)) {
          sseClients.get(mgr.rows[0].manager_id).write(`data: ${JSON.stringify(notifPayload)}\n\n`);
        }
      }
    }

    res.json({ data: { status: 'pending_approval' } });
  } catch (err) {
    console.error('submit-approval', err);
    res.status(500).json({ error: 'Failed to submit for approval' });
  }
});
```

---

## 2.3 PATCH /api/crm/field-trips/:id/review-approval

```js
// PATCH /api/crm/field-trips/:id/review-approval
router.patch('/:id/review-approval', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { role, id: managerId } = req.user;
  const { decision, comments } = req.body; // decision: 'approved'|'rejected'|'changes_requested'
  if (!['admin','manager','sales_manager'].includes(role)) {
    return res.status(403).json({ error: 'Managers only' });
  }
  if (!['approved','rejected','changes_requested'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision' });
  }
  try {
    const newStatus = decision === 'approved' ? 'confirmed' : 'planning';
    await pool.query(
      `UPDATE crm_field_trips
       SET status=$1, approval_decision=$2, approval_comments=$3,
           approved_by=$4, approved_at=NOW()
       WHERE id=$5`,
      [newStatus, decision, comments || null, managerId, id]
    );
    res.json({ data: { status: newStatus, decision } });
  } catch (err) {
    console.error('review-approval', err);
    res.status(500).json({ error: 'Failed to review trip' });
  }
});
```

---

## 2.4 POST /api/crm/field-trips/:id/stops/:stopId/check-in

```js
// POST /api/crm/field-trips/:id/stops/:stopId/check-in
router.post('/:id/stops/:stopId/check-in', requireAuth, async (req, res) => {
  const { id, stopId } = req.params;
  const { lat, lng, accuracy_m } = req.body;
  try {
    // Compute distance from planned coords
    const stop = await pool.query(
      'SELECT latitude, longitude FROM crm_field_trip_stops WHERE id=$1 AND trip_id=$2',
      [stopId, id]
    );
    if (!stop.rows.length) return res.status(404).json({ error: 'Stop not found' });

    let distanceM = null;
    const { latitude: pLat, longitude: pLng } = stop.rows[0];
    if (pLat && pLng && lat && lng) {
      // Haversine
      const R = 6371000;
      const dLat = (lat - pLat) * Math.PI / 180;
      const dLng = (lng - pLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(pLat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
      distanceM = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    await pool.query(
      `UPDATE crm_field_trip_stops
       SET check_in_lat=$1, check_in_lng=$2, check_in_accuracy_m=$3,
           check_in_timestamp=NOW(), check_in_distance_m=$4
       WHERE id=$5`,
      [lat, lng, accuracy_m || null, distanceM, stopId]
    );

    res.json({ data: { check_in_distance_m: distanceM } });
  } catch (err) {
    console.error('check-in', err);
    res.status(500).json({ error: 'Check-in failed' });
  }
});
```

---

## 2.5 POST /api/crm/field-trips/:id/stops/:stopId/attachments (Receipt/Photo Upload)

```js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Storage: local disk (replace with S3 in production)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../../uploads/trip-attachments');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// POST /api/crm/field-trips/:id/stops/:stopId/attachments
router.post('/:id/stops/:stopId/attachments',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    const { id, stopId } = req.params;
    const { caption } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const fileUrl = `/uploads/trip-attachments/${req.file.filename}`;
      const result = await pool.query(
        `INSERT INTO crm_field_trip_stop_attachments
           (trip_id, stop_id, filename, mime_type, file_url, file_size_kb, uploaded_by, caption)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, stopId, req.file.originalname, req.file.mimetype,
         fileUrl, Math.ceil(req.file.size/1024), req.user.id, caption || null]
      );
      res.json({ data: result.rows[0] });
    } catch (err) {
      console.error('attachment upload', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// GET /api/crm/field-trips/:id/stops/:stopId/attachments
router.get('/:id/stops/:stopId/attachments', requireAuth, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM crm_field_trip_stop_attachments WHERE stop_id=$1 AND trip_id=$2 ORDER BY uploaded_at`,
      [req.params.stopId, req.params.id]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// DELETE /api/crm/field-trips/:id/stops/:stopId/attachments/:attId
router.delete('/:id/stops/:stopId/attachments/:attId', requireAuth, async (req, res) => {
  try {
    const row = await pool.query('SELECT * FROM crm_field_trip_stop_attachments WHERE id=$1', [req.params.attId]);
    if (!row.rows.length) return res.status(404).json({ error: 'Not found' });
    // Delete file from disk
    const filePath = path.join(__dirname, '../../../', row.rows[0].file_url);
    fs.unlink(filePath, () => {});
    await pool.query('DELETE FROM crm_field_trip_stop_attachments WHERE id=$1', [req.params.attId]);
    res.json({ data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});
```

---

## 2.6 Expense endpoints — add receipt upload + AED conversion

**REPLACE** the existing POST /expenses handler:

```js
// POST /api/crm/field-trips/:id/expenses  (with receipt upload)
router.post('/:id/expenses',
  requireAuth,
  upload.single('receipt'),
  async (req, res) => {
    const { id } = req.params;
    const { category, description, amount, currency = 'AED', expense_date, notes } = req.body;
    if (!category || !amount) return res.status(400).json({ error: 'category and amount required' });
    try {
      // Get FX rate
      let fxRate = 1.0;
      let aedEquivalent = parseFloat(amount);
      if (currency !== 'AED') {
        const fxRow = await pool.query(
          `SELECT rate FROM crm_fx_rates
           WHERE from_currency=$1 AND to_currency='AED'
           ORDER BY effective_date DESC LIMIT 1`,
          [currency]
        );
        if (fxRow.rows.length) {
          fxRate = parseFloat(fxRow.rows[0].rate);
          aedEquivalent = parseFloat(amount) * fxRate;
        }
      }

      let receiptUrl = null, receiptFilename = null, receiptMime = null;
      if (req.file) {
        receiptUrl      = `/uploads/trip-attachments/${req.file.filename}`;
        receiptFilename = req.file.originalname;
        receiptMime     = req.file.mimetype;
      }

      const result = await pool.query(
        `INSERT INTO crm_field_trip_expenses
           (trip_id, category, description, amount, currency,
            original_amount, original_currency, fx_rate, aed_equivalent,
            expense_date, receipt_url, receipt_filename, receipt_mime, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [id, category, description || null, aedEquivalent, 'AED',
         parseFloat(amount), currency, fxRate, aedEquivalent,
         expense_date || null, receiptUrl, receiptFilename, receiptMime, notes || null, req.user.id]
      );
      res.json({ data: result.rows[0] });
    } catch (err) {
      console.error('add expense', err);
      res.status(500).json({ error: 'Failed to add expense' });
    }
  }
);
```

---

## 2.7 GET /api/crm/field-trips/:id/travel-report — auto-populate from stop outcomes

**REPLACE** the existing travel report GET handler to inject auto-populated fields:

```js
// GET /api/crm/field-trips/:id/travel-report
router.get('/:id/travel-report', requireAuth, async (req, res) => {
  try {
    const [tripRow, reportRow, stopsRow, expRow] = await Promise.all([
      pool.query('SELECT * FROM crm_field_trips WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM crm_field_trip_travel_reports WHERE trip_id=$1', [req.params.id]),
      pool.query(`
        SELECT fts.*, c.customer_name AS customer_name_ref, p.customer_name AS prospect_name_ref
        FROM crm_field_trip_stops fts
        LEFT JOIN fp_customer_unified c ON fts.customer_id = c.customer_id
        LEFT JOIN crm_prospects p ON fts.prospect_id = p.id
        WHERE fts.trip_id=$1 ORDER BY fts.stop_order`, [req.params.id]),
      pool.query('SELECT * FROM crm_field_trip_expenses WHERE trip_id=$1', [req.params.id]),
    ]);

    if (!tripRow.rows.length) return res.status(404).json({ error: 'Trip not found' });

    const stops = stopsRow.rows;
    const visited = stops.filter(s => s.outcome_status === 'visited');
    const totalExpAED = expRow.rows.reduce((s, e) => s + parseFloat(e.aed_equivalent || e.amount || 0), 0);

    // Auto-populate suggestions (only if report is draft/new)
    const autoKeyOutcomes = visited.map(s => {
      const name = s.customer_name_ref || s.prospect_name_ref || s.address_snapshot || `Stop ${s.stop_order}`;
      return `• ${name}: ${s.outcome_notes || 'Visited'}`;
    }).join('\n');

    const autoNextSteps = visited
      .filter(s => s.next_action)
      .map(s => {
        const name = s.customer_name_ref || s.prospect_name_ref || `Stop ${s.stop_order}`;
        return `• ${name}: ${s.next_action}`;
      }).join('\n');

    const autoChallenges = stops
      .filter(s => ['no_show','postponed'].includes(s.outcome_status))
      .map(s => {
        const name = s.customer_name_ref || s.prospect_name_ref || `Stop ${s.stop_order}`;
        const reason = s.no_show_reason || s.postpone_reason || s.outcome_status;
        return `• ${name}: ${reason.replace(/_/g,' ')}`;
      }).join('\n');

    // Planned-vs-actual
    const plannedVsActual = stops.map(s => ({
      stop_order: s.stop_order,
      name: s.customer_name_ref || s.prospect_name_ref || s.address_snapshot || `Stop ${s.stop_order}`,
      planned_date: s.visit_date,
      planned_time: s.visit_time,
      planned_duration: s.duration_mins,
      actual_checkin: s.check_in_timestamp,
      outcome_status: s.outcome_status || 'planned',
      products_discussed: s.products_discussed,
    }));

    // ROI metrics
    const costPerVisit = visited.length > 0 ? (totalExpAED / visited.length).toFixed(2) : null;
    const positiveVisits = visited.filter(s => s.visit_result === 'positive').length;
    const costPerQualified = positiveVisits > 0 ? (totalExpAED / positiveVisits).toFixed(2) : null;

    const report = reportRow.rows[0] || {};
    res.json({
      data: {
        ...report,
        // Auto-suggestions (frontend shows these as pre-fills)
        auto_key_outcomes: autoKeyOutcomes,
        auto_next_steps:   autoNextSteps,
        auto_challenges:   autoChallenges,
        planned_vs_actual: plannedVsActual,
        roi_metrics: {
          total_stops:       stops.length,
          visited_stops:     visited.length,
          no_show_stops:     stops.filter(s => s.outcome_status === 'no_show').length,
          postponed_stops:   stops.filter(s => s.outcome_status === 'postponed').length,
          total_expenses_aed: totalExpAED.toFixed(2),
          cost_per_visit:    costPerVisit,
          cost_per_qualified_outcome: costPerQualified,
          samples_provided:  stops.filter(s => s.samples_provided).length,
        },
        trip: tripRow.rows[0],
        stops,
      }
    });
  } catch (err) {
    console.error('travel-report GET', err);
    res.status(500).json({ error: 'Failed to load travel report' });
  }
});
```

---

## 2.8 GET /api/geocode — Address search proxy

Add to main CRM router or a utilities router:

```js
// GET /api/geocode?address=...
router.get('/geocode', requireAuth, async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address param required' });
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PPH-26.2-CRM/1.0 (internal)' }
    });
    const data = await response.json();
    const results = data.map(r => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      city: r.address?.city || r.address?.town || r.address?.village || '',
      country: r.address?.country || '',
    }));
    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: 'Geocoding failed' });
  }
});
```

---

## 2.9 GET /api/crm/fx-rates

```js
// GET /api/crm/fx-rates  — returns latest rate per currency pair
router.get('/fx-rates', requireAuth, async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT DISTINCT ON (from_currency) from_currency, to_currency, rate, effective_date
      FROM crm_fx_rates WHERE to_currency='AED'
      ORDER BY from_currency, effective_date DESC
    `);
    // Build a map: { USD: 3.6725, EUR: 3.98, ... }
    const map = {};
    rows.rows.forEach(r => { map[r.from_currency] = parseFloat(r.rate); });
    map['AED'] = 1;
    res.json({ data: map });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch FX rates' });
  }
});
```

---

## 2.10 POST + GET for trip templates

```js
// GET /api/crm/field-trip-templates
router.get('/field-trip-templates', requireAuth, async (req, res) => {
  const { id: userId } = req.user;
  try {
    const rows = await pool.query(
      `SELECT t.*, sr.display_name AS creator_name
       FROM crm_field_trip_templates t
       LEFT JOIN crm_sales_reps sr ON t.created_by = sr.id
       WHERE t.created_by=$1 OR t.is_shared=TRUE
       ORDER BY t.name`,
      [userId]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/crm/field-trip-templates
router.post('/field-trip-templates', requireAuth, async (req, res) => {
  const { name, description, trip_type, country_code, transport_mode, stops_json, is_shared } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await pool.query(
      `INSERT INTO crm_field_trip_templates (name, description, trip_type, country_code, transport_mode, stops_json, created_by, is_shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, description||null, trip_type||'local', country_code||null, transport_mode||null,
       JSON.stringify(stops_json || []), req.user.id, is_shared||false]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save template' });
  }
});
```

---

## 2.11 POST /api/crm/field-trips/:id/travel-report/review-stop (per-stop manager comment)

```js
router.post('/:id/travel-report/review-stop', requireAuth, async (req, res) => {
  const { role } = req.user;
  if (!['admin','manager','sales_manager'].includes(role)) return res.status(403).json({ error: 'Managers only' });
  const { stop_id, comment } = req.body;
  try {
    const existing = await pool.query(
      'SELECT manager_stop_comments FROM crm_field_trip_travel_reports WHERE trip_id=$1', [req.params.id]
    );
    const comments = existing.rows[0]?.manager_stop_comments || {};
    comments[stop_id] = { comment, commented_at: new Date().toISOString(), commented_by: req.user.id };
    await pool.query(
      `INSERT INTO crm_field_trip_travel_reports (trip_id, manager_stop_comments, status)
       VALUES ($1,$2,'submitted')
       ON CONFLICT (trip_id) DO UPDATE SET manager_stop_comments=$2`,
      [req.params.id, JSON.stringify(comments)]
    );
    res.json({ data: comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save comment' });
  }
});
```
# PART 3 — NEW FRONTEND FILES TO CREATE

---

## NEW FILE: `src/modules/crm/FieldVisitLegForm.jsx`
### Purpose: Sub-form for entering multi-modal transport legs between stops

```jsx
import React from 'react';
import {
  Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Tag, Typography,
} from 'antd';
import {
  DeleteOutlined, PlusOutlined, CarOutlined, RocketOutlined, TrainOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const MODE_OPTIONS = [
  { value: 'flight',  label: '✈ Flight' },
  { value: 'car',     label: '🚗 Car / Rental' },
  { value: 'train',   label: '🚄 Train' },
  { value: 'bus',     label: '🚌 Bus' },
  { value: 'ferry',   label: '⛴ Ferry' },
  { value: 'taxi',    label: '🚕 Taxi / Ride-share' },
  { value: 'other',   label: 'Other' },
];

const SEAT_CLASS_OPTIONS = [
  { value: 'economy',  label: 'Economy' },
  { value: 'business', label: 'Business' },
  { value: 'first',    label: 'First Class' },
];

const createLeg = () => ({
  local_id: `leg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  mode: 'flight',
  from_label: '',
  to_label: '',
  dep_datetime: null,
  arr_datetime: null,
  // flight
  airline: '',
  flight_number: '',
  dep_airport: '',
  arr_airport: '',
  seat_class: 'economy',
  booking_ref: '',
  // car
  rental_company: '',
  rental_ref: '',
  est_km: null,
  // train
  train_operator: '',
  train_number: '',
  train_class: '',
  notes: '',
});

const FieldVisitLegForm = ({ legs = [], onChange }) => {
  const addLeg = () => onChange([...legs, createLeg()]);

  const updateLeg = (idx, patch) =>
    onChange(legs.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const removeLeg = (idx) => onChange(legs.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 14 }}>Transport Legs</Text>
        <Button size="small" icon={<PlusOutlined />} onClick={addLeg} type="dashed">
          Add Leg
        </Button>
      </div>

      {legs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#8c8c8c', fontSize: 13 }}>
          No legs added. Click "Add Leg" to define transport segments for this trip.
        </div>
      )}

      {legs.map((leg, idx) => (
        <Card
          key={leg.local_id || idx}
          size="small"
          style={{ marginBottom: 10, borderLeft: '4px solid #1677ff' }}
          extra={
            <Button
              type="text" danger size="small" icon={<DeleteOutlined />}
              onClick={() => removeLeg(idx)}
            />
          }
          title={<Space size={6}><Tag color="blue">{idx + 1}</Tag><Text style={{ fontSize: 13 }}>Leg {idx + 1}</Text></Space>}
        >
          <Row gutter={[10, 6]}>
            <Col xs={24} md={6}>
              <Form.Item label="Mode" style={{ marginBottom: 6 }}>
                <Select
                  size="small"
                  value={leg.mode}
                  options={MODE_OPTIONS}
                  onChange={v => updateLeg(idx, { mode: v })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={9}>
              <Form.Item label="From" style={{ marginBottom: 6 }}>
                <Input
                  size="small"
                  placeholder="e.g. Dubai Airport T3"
                  value={leg.from_label}
                  onChange={e => updateLeg(idx, { from_label: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={9}>
              <Form.Item label="To" style={{ marginBottom: 6 }}>
                <Input
                  size="small"
                  placeholder="e.g. King Khalid Airport Riyadh"
                  value={leg.to_label}
                  onChange={e => updateLeg(idx, { to_label: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Departure" style={{ marginBottom: 6 }}>
                <DatePicker
                  showTime
                  size="small"
                  style={{ width: '100%' }}
                  value={leg.dep_datetime ? dayjs(leg.dep_datetime) : null}
                  format="DD MMM YYYY HH:mm"
                  onChange={d => updateLeg(idx, { dep_datetime: d ? d.toISOString() : null })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Arrival" style={{ marginBottom: 6 }}>
                <DatePicker
                  showTime
                  size="small"
                  style={{ width: '100%' }}
                  value={leg.arr_datetime ? dayjs(leg.arr_datetime) : null}
                  format="DD MMM YYYY HH:mm"
                  onChange={d => updateLeg(idx, { arr_datetime: d ? d.toISOString() : null })}
                />
              </Form.Item>
            </Col>

            {/* FLIGHT-SPECIFIC */}
            {leg.mode === 'flight' && (
              <>
                <Col xs={12} md={6}>
                  <Form.Item label="Airline" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Emirates" value={leg.airline}
                      onChange={e => updateLeg(idx, { airline: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Flight No." style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="EK 803" value={leg.flight_number}
                      onChange={e => updateLeg(idx, { flight_number: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="From (IATA)" style={{ marginBottom: 6 }}>
                    <Input size="small" maxLength={4} placeholder="DXB" value={leg.dep_airport}
                      onChange={e => updateLeg(idx, { dep_airport: e.target.value.toUpperCase() })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="To (IATA)" style={{ marginBottom: 6 }}>
                    <Input size="small" maxLength={4} placeholder="RUH" value={leg.arr_airport}
                      onChange={e => updateLeg(idx, { arr_airport: e.target.value.toUpperCase() })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="Class" style={{ marginBottom: 6 }}>
                    <Select size="small" value={leg.seat_class} options={SEAT_CLASS_OPTIONS}
                      onChange={v => updateLeg(idx, { seat_class: v })} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="XYZ123" value={leg.booking_ref}
                      onChange={e => updateLeg(idx, { booking_ref: e.target.value })} />
                  </Form.Item>
                </Col>
              </>
            )}

            {/* CAR-SPECIFIC */}
            {['car','taxi'].includes(leg.mode) && (
              <>
                <Col xs={12} md={8}>
                  <Form.Item label="Rental Company" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Hertz / Careem" value={leg.rental_company}
                      onChange={e => updateLeg(idx, { rental_company: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="ABC-999" value={leg.rental_ref}
                      onChange={e => updateLeg(idx, { rental_ref: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Est. KM" style={{ marginBottom: 6 }}>
                    <InputNumber size="small" style={{ width: '100%' }} min={0} value={leg.est_km}
                      onChange={v => updateLeg(idx, { est_km: v })} />
                  </Form.Item>
                </Col>
              </>
            )}

            {/* TRAIN-SPECIFIC */}
            {leg.mode === 'train' && (
              <>
                <Col xs={12} md={8}>
                  <Form.Item label="Operator" style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="Etihad Rail" value={leg.train_operator}
                      onChange={e => updateLeg(idx, { train_operator: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Train No." style={{ marginBottom: 6 }}>
                    <Input size="small" placeholder="ER 01" value={leg.train_number}
                      onChange={e => updateLeg(idx, { train_number: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Booking Ref" style={{ marginBottom: 6 }}>
                    <Input size="small" value={leg.booking_ref}
                      onChange={e => updateLeg(idx, { booking_ref: e.target.value })} />
                  </Form.Item>
                </Col>
              </>
            )}

            <Col xs={24}>
              <Form.Item label="Notes" style={{ marginBottom: 6 }}>
                <Input size="small" placeholder="Any extra info for this leg" value={leg.notes}
                  onChange={e => updateLeg(idx, { notes: e.target.value })} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      ))}
    </div>
  );
};

export default FieldVisitLegForm;
```

---

## NEW FILE: `src/modules/crm/FieldVisitChecklistPanel.jsx`
### Purpose: Pre-departure checklist (visa, documents, samples kit, SIM, insurance)

```jsx
import React from 'react';
import { Checkbox, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const DEFAULT_LOCAL_ITEMS = [
  { id: 'id_card',        label: 'Emirates ID / National ID' },
  { id: 'car_keys',       label: 'Car keys / vehicle ready' },
  { id: 'sample_kit',     label: 'Sample kit packed' },
  { id: 'brochures',      label: 'Product brochures / catalogs' },
  { id: 'business_cards', label: 'Business cards' },
  { id: 'charger',        label: 'Phone / laptop charger' },
];

const DEFAULT_INTL_ITEMS = [
  { id: 'passport',       label: 'Passport (6+ months validity)' },
  { id: 'visa',           label: 'Visa obtained & printed' },
  { id: 'insurance',      label: 'Travel insurance arranged' },
  { id: 'forex',          label: 'Foreign currency / card ready' },
  { id: 'accommodation',  label: 'Hotel confirmed' },
  { id: 'transport_booked', label: 'Flight / train tickets printed' },
  { id: 'sim_card',       label: 'International SIM / roaming enabled' },
  { id: 'sample_kit',     label: 'Sample kit packed & customs-ready' },
  { id: 'brochures',      label: 'Product brochures / catalogs' },
  { id: 'business_cards', label: 'Business cards' },
  { id: 'emergency_contacts', label: 'Emergency contact list saved offline' },
  { id: 'vaccinations',   label: 'Required vaccinations up to date' },
];

const FieldVisitChecklistPanel = ({ tripType = 'local', checklist = [], onChange }) => {
  const defaultItems = tripType === 'international' ? DEFAULT_INTL_ITEMS : DEFAULT_LOCAL_ITEMS;

  // Merge defaults with saved state
  const items = defaultItems.map(def => {
    const saved = checklist.find(c => c.id === def.id);
    return { ...def, checked: saved ? saved.checked : false };
  });

  const completedCount = items.filter(i => i.checked).length;
  const allDone = completedCount === items.length;

  const toggle = (id) => {
    const updated = items.map(i => (i.id === id ? { ...i, checked: !i.checked } : i));
    onChange(updated);
  };

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text strong style={{ fontSize: 13 }}>Pre-Departure Checklist</Text>
        <Tag
          color={allDone ? 'success' : completedCount > 0 ? 'warning' : 'default'}
          icon={allDone ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
        >
          {completedCount}/{items.length}
        </Tag>
      </div>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Checkbox
              checked={item.checked}
              onChange={() => toggle(item.id)}
            >
              <Text
                style={{
                  fontSize: 13,
                  textDecoration: item.checked ? 'line-through' : 'none',
                  color: item.checked ? '#8c8c8c' : 'inherit',
                }}
              >
                {item.label}
              </Text>
            </Checkbox>
          </div>
        ))}
      </Space>
    </div>
  );
};

export default FieldVisitChecklistPanel;
```

---

## NEW FILE: `src/modules/crm/FieldVisitKPIPanel.jsx`
### Purpose: ROI metrics panel for the travel report

```jsx
import React from 'react';
import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import {
  DollarOutlined, EnvironmentOutlined, RiseOutlined, TrophyOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const FieldVisitKPIPanel = ({ roi = {}, trip = {} }) => {
  const {
    total_stops = 0, visited_stops = 0, no_show_stops = 0, postponed_stops = 0,
    total_expenses_aed = 0, cost_per_visit, cost_per_qualified_outcome, samples_provided = 0,
  } = roi;

  const visitRate = total_stops > 0 ? ((visited_stops / total_stops) * 100).toFixed(0) : 0;

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #1677ff' }}>
            <Statistic
              title="Visit Rate"
              value={visitRate}
              suffix="%"
              valueStyle={{ color: visitRate >= 80 ? '#52c41a' : visitRate >= 60 ? '#fa8c16' : '#cf1322' }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>{visited_stops}/{total_stops} stops visited</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic
              title="Total Trip Cost"
              value={parseFloat(total_expenses_aed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              prefix="AED"
              valueStyle={{ fontSize: 18 }}
            />
            {trip.budget_estimate && (
              <Text
                type={parseFloat(total_expenses_aed) <= parseFloat(trip.budget_estimate) ? 'success' : 'danger'}
                style={{ fontSize: 11 }}
              >
                Budget: AED {parseFloat(trip.budget_estimate).toLocaleString()}
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic
              title="Cost per Visit"
              value={cost_per_visit ? parseFloat(cost_per_visit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
              prefix={cost_per_visit ? 'AED' : ''}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>Based on visited stops only</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic
              title="Cost per Qualified Lead"
              value={cost_per_qualified_outcome ? parseFloat(cost_per_qualified_outcome).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
              prefix={cost_per_qualified_outcome ? 'AED' : ''}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>Positive outcome visits only</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#f6ffed', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{visited_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Visited</Text>
          </div>
        </Col>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#fff7e6', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fa8c16' }}>{postponed_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Postponed</Text>
          </div>
        </Col>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#fff2f0', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#cf1322' }}>{no_show_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>No Show</Text>
          </div>
        </Col>
      </Row>

      {samples_provided > 0 && (
        <div style={{ marginTop: 10, background: '#f0f4ff', borderRadius: 8, padding: '8px 12px' }}>
          <Text style={{ fontSize: 13 }}>
            🧪 Samples provided at <strong>{samples_provided}</strong> stops during this trip
          </Text>
        </div>
      )}
    </div>
  );
};

export default FieldVisitKPIPanel;
```

---

## NEW FILE: `src/modules/crm/FieldVisitApprovalCard.jsx`
### Purpose: Manager approval card — used in CRMWorklist and FieldVisitDetail

```jsx
import React, { useState } from 'react';
import { Button, Card, Input, Space, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const FieldVisitApprovalCard = ({ trip, onDecision }) => {
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDecision = async (decision) => {
    setLoading(true);
    try {
      await axios.patch(
        `${API_BASE}/api/crm/field-trips/${trip.id}/review-approval`,
        { decision, comments },
        { headers: getAuthHeaders() }
      );
      message.success(
        decision === 'approved' ? 'Trip approved — rep will be notified' :
        decision === 'rejected' ? 'Trip rejected' :
        'Changes requested'
      );
      if (onDecision) onDecision(decision);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to submit decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <ClockCircleOutlined style={{ color: '#fa8c16' }} />
          <Text strong>Approval Required</Text>
          <Tag color="orange">pending_approval</Tag>
        </Space>
      }
      style={{ borderLeft: '4px solid #fa8c16', marginBottom: 16 }}
    >
      <Paragraph style={{ marginBottom: 8 }}>
        <Text type="secondary">Rep: </Text><Text strong>{trip.rep_name}</Text>
        {'  ·  '}
        <Text type="secondary">Trip: </Text><Text strong>{trip.title}</Text>
        {'  ·  '}
        <Text type="secondary">
          {trip.departure_date} → {trip.return_date || 'TBD'}
        </Text>
      </Paragraph>

      <Input.TextArea
        rows={2}
        placeholder="Manager comments (optional)"
        value={comments}
        onChange={e => setComments(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <Space>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={loading}
          onClick={() => handleDecision('approved')}
        >
          Approve
        </Button>
        <Button
          danger
          icon={<StopOutlined />}
          loading={loading}
          onClick={() => handleDecision('rejected')}
        >
          Reject
        </Button>
        <Button
          icon={<EditOutlined />}
          loading={loading}
          onClick={() => handleDecision('changes_requested')}
        >
          Request Changes
        </Button>
      </Space>
    </Card>
  );
};

export default FieldVisitApprovalCard;
```

---

## NEW FILE: `src/modules/crm/FieldVisitExpenseModal.jsx`
### Purpose: Full-featured expense entry modal with multi-currency, receipt upload, and live AED conversion

```jsx
import React, { useEffect, useState } from 'react';
import {
  Button, Col, Form, Input, InputNumber, Modal, Row, Select, Upload, message,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const EXPENSE_CATEGORIES = [
  { value: 'flight',         label: '✈ Flight' },
  { value: 'hotel',          label: '🏨 Hotel' },
  { value: 'transport',      label: '🚗 Ground Transport' },
  { value: 'meals',          label: '🍽 Meals & Entertainment' },
  { value: 'visa',           label: '🪪 Visa / Entry Fees' },
  { value: 'parking',        label: '🅿 Parking / Tolls' },
  { value: 'gift',           label: '🎁 Customer Gift' },
  { value: 'communication',  label: '📱 Communication / SIM' },
  { value: 'fuel',           label: '⛽ Fuel' },
  { value: 'conference',     label: '🏛 Conference / Exhibition' },
  { value: 'other',          label: 'Other' },
];

const CURRENCIES = ['AED','USD','EUR','GBP','SAR','KWD','BHD','QAR','OMR','INR','CNY'];

const FieldVisitExpenseModal = ({ open, tripId, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fxRates, setFxRates] = useState({ AED: 1 });
  const [fileList, setFileList] = useState([]);
  const [aedPreview, setAedPreview] = useState(null);

  // Load FX rates on open
  useEffect(() => {
    if (!open) return;
    axios.get(`${API_BASE}/api/crm/fx-rates`, { headers: getAuthHeaders() })
      .then(res => { if (res.data?.data) setFxRates(res.data.data); })
      .catch(() => {});
  }, [open]);

  const handleValuesChange = (_, all) => {
    const { amount, currency = 'AED' } = all;
    if (amount && fxRates[currency]) {
      setAedPreview((parseFloat(amount) * (fxRates[currency] || 1)).toFixed(2));
    } else {
      setAedPreview(null);
    }
  };

  const handleSave = async () => {
    let vals;
    try { vals = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('category',     vals.category);
      formData.append('amount',       String(vals.amount));
      formData.append('currency',     vals.currency || 'AED');
      formData.append('expense_date', vals.expense_date ? dayjs(vals.expense_date).format('YYYY-MM-DD') : '');
      formData.append('description',  vals.description || '');
      formData.append('notes',        vals.notes || '');
      if (fileList[0]?.originFileObj) {
        formData.append('receipt', fileList[0].originFileObj);
      }
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${tripId}/expenses`,
        formData,
        { headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' } }
      );
      message.success('Expense saved');
      form.resetFields();
      setFileList([]);
      setAedPreview(null);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Expense"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="Save Expense"
      width={520}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ currency: 'AED' }}
        onValuesChange={handleValuesChange}
      >
        <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Select a category' }]}>
          <Select options={EXPENSE_CATEGORIES} placeholder="Select category" />
        </Form.Item>

        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter amount' }]}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                placeholder="0.00"
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="currency" label="Currency">
              <Select options={CURRENCIES.map(c => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
        </Row>

        {aedPreview && (
          <div style={{ marginTop: -8, marginBottom: 12, color: '#1677ff', fontSize: 13 }}>
            ≈ AED {aedPreview} (rate: {fxRates[form.getFieldValue('currency')] || 1})
          </div>
        )}

        <Form.Item name="expense_date" label="Date">
          <Input type="date" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input placeholder="e.g. Riyadh Airport taxi to hotel" />
        </Form.Item>

        <Form.Item name="notes" label="Notes (optional)">
          <Input.TextArea rows={2} placeholder="Any additional context" />
        </Form.Item>

        <Form.Item label="Receipt / Bill Upload">
          <Upload.Dragger
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
            accept="image/*,application/pdf"
            maxCount={1}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p style={{ fontSize: 13 }}>Click or drag receipt here (jpg, png, pdf — max 10MB)</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default FieldVisitExpenseModal;
```
# PART 4 — EXISTING FILES: EXACT CHANGES

---

## 4.1 `FieldVisitPlanner.jsx` — All Changes

### Change A: Add new imports at top (after existing imports)

```jsx
// ADD these imports after the existing import block:
import FieldVisitLegForm from './FieldVisitLegForm';
import FieldVisitChecklistPanel from './FieldVisitChecklistPanel';
```

### Change B: Add legs and checklist state (after existing useState declarations)

```jsx
// ADD after: const [briefByStop, setBriefByStop] = useState({});
const [legs, setLegs] = useState([]);
const [checklist, setChecklist] = useState([]);
const [templates, setTemplates] = useState([]);
const [showTemplateModal, setShowTemplateModal] = useState(false);
const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
const [templateName, setTemplateName] = useState('');
const [geocodingIdx, setGeocodingIdx] = useState(null);
const [geocodeQuery, setGeocodeQuery] = useState('');
const [geocodeResults, setGeocodeResults] = useState([]);
const [showGeocodeModal, setShowGeocodeModal] = useState(false);
```

### Change C: Load templates in the existing useEffect (add to Promise.allSettled)

```jsx
// REPLACE the load() function inside the useEffect to add template loading:
const load = async () => {
  setLoadingLookups(true);
  const [countryRes, custRes, prospRes, tplRes] = await Promise.allSettled([
    axios.get(`${API_BASE}/api/countries/list?active=true`, { headers: getAuthHeaders() }),
    axios.get(`${API_BASE}/api/crm/my-customers`, { headers: getAuthHeaders() }),
    axios.get(`${API_BASE}/api/crm/my-prospects`, { headers: getAuthHeaders() }),
    axios.get(`${API_BASE}/api/crm/field-trip-templates`, { headers: getAuthHeaders() }),
  ]);
  if (countryRes.status === 'fulfilled') {
    const rows = countryRes.value?.data?.countries || countryRes.value?.data?.data || countryRes.value?.data || [];
    setCountries(Array.isArray(rows) ? rows : []);
  }
  if (custRes.status === 'fulfilled') {
    const rows = custRes.value?.data?.data?.customers || [];
    setCustomers(Array.isArray(rows) ? rows : []);
  }
  if (prospRes.status === 'fulfilled') {
    const rows = prospRes.value?.data?.data?.prospects || [];
    setProspects(Array.isArray(rows) ? rows : []);
  }
  if (tplRes.status === 'fulfilled') {
    setTemplates(tplRes.value?.data?.data || []);
  }
  setLoadingLookups(false);
};
```

### Change D: Add geocoding helper function (add before onSave)

```jsx
// ADD this function before onSave:
const geocodeAddress = async () => {
  if (!geocodeQuery.trim()) return;
  try {
    const res = await axios.get(`${API_BASE}/api/geocode`, {
      headers: getAuthHeaders(),
      params: { address: geocodeQuery },
    });
    setGeocodeResults(res.data?.data || []);
  } catch {
    message.error('Geocoding failed');
  }
};

const applyGeocode = (result) => {
  if (geocodingIdx === null) return;
  updateStop(geocodingIdx, {
    latitude: result.lat,
    longitude: result.lng,
    address_snapshot: result.display_name.split(',').slice(0,3).join(', '),
    geocoded_by: 'search',
  });
  setShowGeocodeModal(false);
  setGeocodeResults([]);
  setGeocodeQuery('');
  setGeocodingIdx(null);
};

const saveAsTemplate = async () => {
  if (!templateName.trim()) { message.warning('Enter a template name'); return; }
  const vals = form.getFieldsValue(true);
  try {
    await axios.post(`${API_BASE}/api/crm/field-trip-templates`, {
      name: templateName,
      trip_type: vals.trip_type,
      country_code: vals.country_code,
      transport_mode: vals.transport_mode,
      stops_json: stops.map(({ local_id, visit_date, visit_time, ...rest }) => rest),
    }, { headers: getAuthHeaders() });
    message.success('Template saved');
    setShowSaveTemplateModal(false);
    setTemplateName('');
  } catch {
    message.error('Failed to save template');
  }
};

const loadTemplate = (tpl) => {
  form.setFieldsValue({
    trip_type: tpl.trip_type,
    country_code: tpl.country_code,
    transport_mode: tpl.transport_mode,
  });
  const newStops = (tpl.stops_json || []).map(s => ({
    ...createStop(),
    ...s,
    local_id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    visit_date: null,
    visit_time: null,
  }));
  setStops(newStops.length ? newStops : [createStop()]);
  setShowTemplateModal(false);
  message.success(`Template "${tpl.name}" loaded — update dates before saving`);
};
```

### Change E: Update the onSave payload to include legs

```jsx
// INSIDE the existing onSave function, REPLACE the payload object:
const payload = {
  title: vals.title,
  country: countryRow?.country_name || vals.country_code || null,
  country_code: vals.country_code || null,
  trip_type: vals.trip_type || 'local',
  transport_mode: vals.transport_mode || null,
  budget_estimate: vals.budget_estimate || null,
  accommodation: vals.accommodation || null,
  visa_details: vals.visa_required ? {
    required: true,
    type: vals.visa_type || null,
    status: 'not_started',
  } : { required: false },
  predeparture_checklist: checklist,
  cities: vals.cities ? vals.cities.split(',').map(v => v.trim()).filter(Boolean) : [],
  departure_date: vals.departure_date ? dayjs(vals.departure_date).format('YYYY-MM-DD') : null,
  return_date: vals.return_date ? dayjs(vals.return_date).format('YYYY-MM-DD') : null,
  travel_notes: vals.travel_notes || null,
  objectives: vals.objectives || null,
  legs: legs,
  stops: stops.map((s, idx) => {
    const { local_id, ...rest } = s;
    return { ...rest, stop_order: idx + 1, visit_date: s.visit_date ? dayjs(s.visit_date).format('YYYY-MM-DD') : null };
  }),
};
```

### Change F: Add template + save-template buttons to header (REPLACE the header Space component)

```jsx
// REPLACE the header Space that contains just the back button and title:
<Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
  <Space>
    <Button type="text" icon={<ArrowLeftOutlined style={{ color: '#fff' }} />} onClick={() => navigate('/crm/visits')} />
    <div>
      <Title level={4} style={{ margin: 0, color: '#fff' }}><CompassOutlined /> Plan Field Visit Trip</Title>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Create your itinerary, arrange stops, and prepare briefs before departure.</Text>
    </div>
  </Space>
  <Space>
    <Tag color={tripType === 'international' ? 'blue' : 'green'} style={{ fontSize: 13, padding: '4px 12px' }}>
      {tripType === 'international' ? <><GlobalOutlined /> International</> : <><CarOutlined /> Local</>}
    </Tag>
    {templates.length > 0 && (
      <Button size="small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
        onClick={() => setShowTemplateModal(true)}>
        📋 Use Template
      </Button>
    )}
    <Button size="small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
      onClick={() => setShowSaveTemplateModal(true)}>
      💾 Save as Template
    </Button>
  </Space>
</Space>
```

### Change G: Add visa type + checklist to Step 0 (add AFTER the visa_required Switch row)

```jsx
{/* ADD after the visa_required row in Step 0 Form: */}

{tripType === 'international' && form.getFieldValue('visa_required') && (
  <Row gutter={16}>
    <Col xs={24} md={8}>
      <Form.Item label="Visa Type" name="visa_type">
        <Select allowClear placeholder="Visa type" options={[
          { value: 'tourist', label: 'Tourist' },
          { value: 'business', label: 'Business' },
          { value: 'transit', label: 'Transit' },
          { value: 'work', label: 'Work / Employment' },
        ]} />
      </Form.Item>
    </Col>
  </Row>
)}

<Form.Item label="Pre-Departure Checklist">
  <FieldVisitChecklistPanel
    tripType={tripType}
    checklist={checklist}
    onChange={setChecklist}
  />
</Form.Item>
```

### Change H: Add transport legs section to Step 0 (add after Travel Notes field)

```jsx
{/* ADD after the travel_notes Form.Item in Step 0: */}
{(tripType === 'international' || ['flight','train','bus','mixed'].includes(form.getFieldValue('transport_mode'))) && (
  <Form.Item label=" ">
    <FieldVisitLegForm legs={legs} onChange={setLegs} />
  </Form.Item>
)}
```

### Change I: Add geocode button to each stop card (add after the lat/lng Text in each stop)

```jsx
{/* REPLACE the lat/lng display in the stop card with this: */}
<Space size={8}>
  <Button type="link" size="small" icon={<ClockCircleOutlined />} loading={briefLoading}
    disabled={!stop.customer_id && !stop.prospect_id}
    onClick={() => loadPreVisitBrief(stop, idx)}>
    Pre-Visit Brief
  </Button>
  <Button type="link" size="small" icon={<EnvironmentOutlined />}
    onClick={() => {
      setGeocodingIdx(idx);
      setGeocodeQuery(stop.address_snapshot || '');
      setGeocodeResults([]);
      setShowGeocodeModal(true);
    }}>
    📍 Find Address
  </Button>
  {stop.latitude && stop.longitude && (
    <Text type="secondary" style={{ fontSize: 11 }}>{Number(stop.latitude).toFixed(3)}, {Number(stop.longitude).toFixed(3)}</Text>
  )}
</Space>
```

### Change J: Add contact_email field to stop card (add after contact_phone Input)

```jsx
{/* ADD after the contact_phone Input in stop card: */}
<Input size="small" placeholder="Contact email" type="email"
  value={stop.contact_email || ''}
  onChange={e => updateStop(idx, { contact_email: e.target.value })}
  style={{ width: 180 }} />
```

### Change K: Add supplier stop type selector (add after the prospect selector block)

```jsx
{/* ADD after the prospect selector block: */}
{stop.stop_type === 'supplier' && (
  <Input size="small" placeholder="Supplier / vendor name" value={stop.address_snapshot || ''}
    onChange={e => updateStop(idx, { address_snapshot: e.target.value })}
    style={{ width: '100%', marginBottom: 8 }} />
)}
```

### Change L: Add geocode modal, template modals BEFORE closing </div>

```jsx
{/* ADD these modals before the final closing </div> of the component: */}

{/* Geocode Modal */}
<Modal
  title="🔍 Find Address"
  open={showGeocodeModal}
  onCancel={() => { setShowGeocodeModal(false); setGeocodeResults([]); }}
  footer={null}
  width={600}
>
  <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
    <Input
      placeholder="Enter address to search..."
      value={geocodeQuery}
      onChange={e => setGeocodeQuery(e.target.value)}
      onPressEnter={geocodeAddress}
    />
    <Button type="primary" onClick={geocodeAddress}>Search</Button>
  </Space.Compact>
  {geocodeResults.map((r, i) => (
    <div key={i}
      style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #f0f0f0', marginBottom: 6 }}
      onClick={() => applyGeocode(r)}
    >
      <Text style={{ fontSize: 13 }}>{r.display_name}</Text>
      <br />
      <Text type="secondary" style={{ fontSize: 11 }}>{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</Text>
    </div>
  ))}
</Modal>

{/* Use Template Modal */}
<Modal
  title="📋 Use a Trip Template"
  open={showTemplateModal}
  onCancel={() => setShowTemplateModal(false)}
  footer={null}
  width={480}
>
  {templates.map(tpl => (
    <div key={tpl.id}
      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e8e8e8', marginBottom: 8, cursor: 'pointer' }}
      onClick={() => loadTemplate(tpl)}
    >
      <Text strong>{tpl.name}</Text>
      {tpl.description && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{tpl.description}</Text></>}
      <br />
      <Text type="secondary" style={{ fontSize: 11 }}>
        {tpl.trip_type} · {tpl.stops_json?.length || 0} stops · by {tpl.creator_name || 'me'}
        {tpl.is_shared && <Tag style={{ marginLeft: 6 }} color="blue">shared</Tag>}
      </Text>
    </div>
  ))}
</Modal>

{/* Save as Template Modal */}
<Modal
  title="💾 Save as Template"
  open={showSaveTemplateModal}
  onCancel={() => setShowSaveTemplateModal(false)}
  onOk={saveAsTemplate}
  okText="Save Template"
>
  <Input
    placeholder="Template name, e.g. Monthly Riyadh Run"
    value={templateName}
    onChange={e => setTemplateName(e.target.value)}
  />
</Modal>
```

---

## 4.2 `FieldVisitList.jsx` — All Changes

### Change A: Add new imports

```jsx
// ADD to imports:
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
```

### Change B: Add manager-scope state

```jsx
// ADD after existing useState declarations:
const [searchText, setSearchText] = useState('');
const [repFilter, setRepFilter] = useState('all');
const [salesReps, setSalesReps] = useState([]);
const [page, setPage] = useState(1);
const [total, setTotal] = useState(0);
const PAGE_SIZE = 20;

const userRole = (() => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return 'sales_rep';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'sales_rep';
  } catch { return 'sales_rep'; }
})();
const isManager = ['admin','manager','sales_manager'].includes(userRole);
```

### Change C: Replace loadTrips to support dual-tier + search + pagination

```jsx
// REPLACE the existing loadTrips function:
const loadTrips = useCallback(async () => {
  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };
  setLoading(true);
  setError('');
  try {
    const params = {
      page,
      limit: PAGE_SIZE,
      ...(statusFilter !== 'all' && { status: statusFilter }),
      ...(isManager && repFilter !== 'all' && { rep_id: repFilter }),
    };
    const res = await axios.get(`${API_BASE}/api/crm/field-trips`, { headers, params });
    const raw = Array.isArray(res.data?.data) ? res.data.data : [];
    setItems(raw);
    setTotal(res.data?.total || raw.length);
  } catch (err) {
    setError(err?.response?.data?.error || 'Failed to load field trips.');
    setItems([]);
  } finally {
    setLoading(false);
  }
}, [statusFilter, page, isManager, repFilter]);

// Also add this useEffect to load sales reps for manager filter:
useEffect(() => {
  if (!isManager) return;
  const token = localStorage.getItem('auth_token');
  axios.get(`${API_BASE}/api/crm/sales-reps`, { headers: { Authorization: `Bearer ${token}` } })
    .then(res => setSalesReps(res.data?.data || []))
    .catch(() => {});
}, [isManager]);
```

### Change D: Apply client-side text search filter

```jsx
// REPLACE the filteredItems definition:
const filteredItems = items.filter((trip) => {
  if (statusFilter !== 'all' && trip.status !== statusFilter) return false;
  if (searchText) {
    const q = searchText.toLowerCase();
    const match = (
      (trip.title || '').toLowerCase().includes(q) ||
      (trip.country || '').toLowerCase().includes(q) ||
      (trip.rep_name || '').toLowerCase().includes(q)
    );
    if (!match) return false;
  }
  if (dateFilter !== 'all') {
    const today = dayjs().startOf('day');
    const dep = trip.departure_date ? dayjs(trip.departure_date) : null;
    const ret = trip.return_date ? dayjs(trip.return_date) : dep;
    if (dateFilter === 'upcoming' && dep && dep.isBefore(today)) return false;
    if (dateFilter === 'past_30') {
      const thirtyAgo = today.subtract(30, 'day');
      if (!ret || ret.isBefore(thirtyAgo) || dep?.isAfter(today)) return false;
    }
    if (dateFilter === 'this_month') {
      const monthStart = today.startOf('month');
      const monthEnd = today.endOf('month');
      if (!dep || dep.isAfter(monthEnd) || (ret && ret.isBefore(monthStart))) return false;
    }
  }
  return true;
});
```

### Change E: Add search + rep filter row (add to existing filter row in render)

```jsx
{/* ADD inside the filter bar, after the existing Select filters: */}
<Input
  prefix={<SearchOutlined />}
  placeholder="Search trips..."
  value={searchText}
  onChange={e => setSearchText(e.target.value)}
  allowClear
  style={{ width: 200 }}
/>
{isManager && (
  <Select
    style={{ width: 180 }}
    value={repFilter}
    onChange={v => { setRepFilter(v); setPage(1); }}
    options={[
      { value: 'all', label: 'All Reps' },
      ...salesReps.map(r => ({ value: String(r.id), label: r.display_name })),
    ]}
  />
)}
```

### Change F: Show rep name badge on each trip card when manager is viewing

```jsx
{/* ADD inside the trip card, after the trip title: */}
{isManager && trip.rep_name && (
  <Tag style={{ fontSize: 11, marginLeft: 4 }}>{trip.rep_name}</Tag>
)}
```

### Change G: Add Pagination component at bottom of list

```jsx
{/* ADD after the trip cards list: */}
{total > PAGE_SIZE && (
  <div style={{ textAlign: 'right', marginTop: 16 }}>
    <Pagination
      current={page}
      total={total}
      pageSize={PAGE_SIZE}
      onChange={p => setPage(p)}
      showSizeChanger={false}
      showTotal={(t) => `${t} trips`}
    />
  </div>
)}
```

### Change H: Add Pagination import

```jsx
// ADD Pagination to the antd imports at the top of FieldVisitList.jsx
import { ..., Pagination } from 'antd';
```

---

## 4.3 `FieldVisitDetail.jsx` — All Changes

### Change A: Add FieldVisitExpenseModal + FieldVisitApprovalCard imports

```jsx
import FieldVisitExpenseModal from './FieldVisitExpenseModal';
import FieldVisitApprovalCard from './FieldVisitApprovalCard';
```

### Change B: Add state for the new expense modal + approval

```jsx
// ADD after existing state declarations:
const [showNewExpenseModal, setShowNewExpenseModal] = useState(false);

const userRole = (() => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return 'sales_rep';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'sales_rep';
  } catch { return 'sales_rep'; }
})();
const isManager = ['admin','manager','sales_manager'].includes(userRole);
```

### Change C: Replace old expense Add button with new modal trigger

```jsx
{/* REPLACE: <Button size="small" icon={<PlusOutlined />} onClick={() => setShowExpenseModal(true)}>Add Expense</Button> */}
{/* WITH: */}
<Button size="small" icon={<PlusOutlined />} onClick={() => setShowNewExpenseModal(true)}>
  Add Expense
</Button>
```

### Change D: Show approval card when trip is pending_approval (add in render, before the tab card)

```jsx
{/* ADD before the Tabs card: */}
{isManager && trip?.status === 'pending_approval' && (
  <FieldVisitApprovalCard
    trip={{ ...trip, rep_name: trip.rep_name }}
    onDecision={() => loadDetail()}
  />
)}
```

### Change E: Show GPS badge in stop timeline

```jsx
{/* In the stops timeline, ADD after the competitor_info text: */}
{stop.check_in_timestamp && (
  <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
    📍 GPS check-in {stop.check_in_distance_m != null
      ? `(${stop.check_in_distance_m}m from planned)`
      : '(location captured)'}
    {' · '}{dayjs(stop.check_in_timestamp).format('HH:mm')}
  </Text>
)}
```

### Change F: Show receipt thumbnail in expense list

```jsx
{/* In the expenses List, REPLACE the List.Item.Meta description: */}
<List.Item.Meta
  title={<Space><Tag>{exp.category}</Tag><Text>{exp.description || '—'}</Text></Space>}
  description={
    <Space size={16}>
      <Text type="secondary">
        {exp.expense_date ? dayjs(exp.expense_date).format('DD MMM YYYY') : '—'}
        {' · '}
        {exp.original_currency && exp.original_currency !== 'AED'
          ? `${exp.original_currency} ${Number(exp.original_amount || 0).toFixed(2)} → `
          : ''}
        AED {Number(exp.aed_equivalent || exp.amount || 0).toFixed(2)}
      </Text>
      {exp.receipt_url && (
        <a href={exp.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
          📎 Receipt
        </a>
      )}
    </Space>
  }
/>
```

### Change G: Add the new expense modal near the end of component (before final </div>)

```jsx
{/* ADD before closing </div>: */}
<FieldVisitExpenseModal
  open={showNewExpenseModal}
  tripId={id}
  onClose={() => setShowNewExpenseModal(false)}
  onSaved={loadDetail}
/>
```

### Change H: Show submit-for-approval button when trip is in planning state

```jsx
{/* ADD to the trip status action buttons (wherever handleTripStatus buttons are rendered): */}
{trip?.status === 'planning' && !isManager && (
  <Button
    type="primary"
    icon={<SendOutlined />}
    onClick={async () => {
      try {
        await axios.post(`${API_BASE}/api/crm/field-trips/${id}/submit-approval`, {},
          { headers: getHeaders() });
        message.success('Submitted for manager approval');
        loadDetail();
      } catch (err) {
        message.error(err?.response?.data?.error || 'Failed to submit');
      }
    }}
  >
    Submit for Approval
  </Button>
)}
```

---

## 4.4 `FieldVisitInTrip.jsx` — All Changes

### Change A: Add GPS check-in to the markArrived function

```jsx
// REPLACE the existing markArrived function:
const markArrived = async (stop) => {
  setSavingArrival(true);
  try {
    // 1. GPS capture
    let gpsPayload = {};
    if (navigator.geolocation) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsPayload = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: Math.round(pos.coords.accuracy),
            };
            resolve();
          },
          () => resolve(), // silently skip if denied
          { timeout: 8000, maximumAge: 60000 }
        );
      });
    }

    // 2. Check-in endpoint
    if (gpsPayload.lat) {
      const ciRes = await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/stops/${stop.id}/check-in`,
        gpsPayload,
        { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
      );
      const dist = ciRes.data?.data?.check_in_distance_m;
      if (dist != null && dist > 2000) {
        message.warning(`You appear to be ${(dist/1000).toFixed(1)} km from the planned location — proceed anyway?`);
      }
    }

    // 3. Original arrival record
    await axios.post(
      `${API_BASE}/api/crm/field-trips/${id}/stops/${stop.id}/arrive`,
      { arrival_time: new Date().toISOString() },
      { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
    );
    message.success('Arrival recorded');
    loadTrip();
  } catch (err) {
    message.error(err?.response?.data?.error || 'Failed to record arrival');
  } finally {
    setSavingArrival(false);
  }
};
```

### Change B: Make contact_phone a tel: link + WhatsApp link

```jsx
{/* REPLACE the contact info display in each stop card: */}
{stop.contact_person && (
  <Space size={8} style={{ marginTop: 2 }}>
    <Text type="secondary" style={{ fontSize: 12 }}>
      {stop.contact_person}
    </Text>
    {stop.contact_phone && (
      <>
        <a href={`tel:${stop.contact_phone}`} style={{ fontSize: 12 }}>
          📞 Call
        </a>
        <a
          href={`https://wa.me/${stop.contact_phone.replace(/\D/g,'')}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12 }}
        >
          💬 WhatsApp
        </a>
      </>
    )}
  </Space>
)}
```

### Change C: Add photo upload to outcome modal (add after next_action Form.Item)

```jsx
{/* ADD after the next_action Form.Item in the outcome modal: */}
<Divider style={{ margin: '12px 0', fontSize: 13 }}>Photos / Documents</Divider>

<Form.Item name="attachments" label="Attach Photos or Files">
  <Upload
    beforeUpload={() => false}
    multiple
    accept="image/*,application/pdf"
    listType="picture"
    maxCount={5}
  >
    <Button icon={<PlusOutlined />} size="small">
      📷 Add Photos / Receipt
    </Button>
  </Upload>
</Form.Item>
```

### Change D: Upload attachments in submitOutcome (modify existing function)

```jsx
// INSIDE the existing submitOutcome function, ADD attachment upload after the outcome POST:
const fileList = values.attachments?.fileList || [];
for (const f of fileList) {
  if (!f.originFileObj) continue;
  const fd = new FormData();
  fd.append('file', f.originFileObj);
  fd.append('caption', `Stop ${activeStop.stop_order} — ${values.outcome_status}`);
  await axios.post(
    `${API_BASE}/api/crm/field-trips/${id}/stops/${activeStop.id}/attachments`,
    fd,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  ).catch(() => {}); // non-blocking
}
```

### Change E: Add Upload to imports

```jsx
// ADD Upload to the antd imports:
import { ..., Upload } from 'antd';
```

---

## 4.5 `FieldVisitTravelReport.jsx` — All Changes

### Change A: Add FieldVisitKPIPanel import

```jsx
import FieldVisitKPIPanel from './FieldVisitKPIPanel';
```

### Change B: Add state for auto-populate data

```jsx
// ADD after existing state declarations:
const [autoData, setAutoData] = useState(null);
const [stopCommentForm] = Form.useForm();
const [commentingStop, setCommentingStop] = useState(null);
const [savingStopComment, setSavingStopComment] = useState(false);
```

### Change C: Update loadData to capture auto-populate fields

```jsx
// INSIDE loadData, AFTER setting report state, ADD:
if (reportRes.status === 'fulfilled') {
  const r = reportRes.value?.data?.data || null;
  setReport(r);
  setAutoData({
    auto_key_outcomes: r?.auto_key_outcomes,
    auto_next_steps:   r?.auto_next_steps,
    auto_challenges:   r?.auto_challenges,
    planned_vs_actual: r?.planned_vs_actual || [],
    roi_metrics:       r?.roi_metrics || {},
    stops:             r?.stops || [],
  });
  if (r) {
    form.setFieldsValue({
      summary:         r.summary,
      key_outcomes:    r.key_outcomes || (isEditable ? r.auto_key_outcomes : ''),
      challenges:      r.challenges   || (isEditable ? r.auto_challenges   : ''),
      recommendations: r.recommendations,
      next_steps:      r.next_steps   || (isEditable ? r.auto_next_steps   : ''),
      total_expenses:  r.total_expenses,
    });
  }
}
```

### Change D: Add KPI panel to render (add after Quick Stats row)

```jsx
{/* ADD after the quick stats Row: */}
{autoData?.roi_metrics && Object.keys(autoData.roi_metrics).length > 0 && (
  <Card title="Trip ROI & Performance" size="small" style={{ marginBottom: 16 }}>
    <FieldVisitKPIPanel roi={autoData.roi_metrics} trip={trip || {}} />
  </Card>
)}
```

### Change E: Add "Auto-fill from field data" buttons on key_outcomes, challenges, next_steps fields

```jsx
{/* REPLACE the key_outcomes Form.Item: */}
<Form.Item
  name="key_outcomes"
  label={
    <Space>
      Key Outcomes
      {autoData?.auto_key_outcomes && isEditable && (
        <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
          onClick={() => form.setFieldValue('key_outcomes', autoData.auto_key_outcomes)}>
          ↙ Auto-fill from stops
        </Button>
      )}
    </Space>
  }
>
  <Input.TextArea rows={3} placeholder="Major achievements, deals progressed, orders taken..." disabled={!isEditable} />
</Form.Item>

{/* REPLACE the challenges Form.Item: */}
<Form.Item
  name="challenges"
  label={
    <Space>
      Challenges Faced
      {autoData?.auto_challenges && isEditable && (
        <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
          onClick={() => form.setFieldValue('challenges', autoData.auto_challenges)}>
          ↙ Auto-fill from stops
        </Button>
      )}
    </Space>
  }
>
  <Input.TextArea rows={3} placeholder="Issues encountered during the trip..." disabled={!isEditable} />
</Form.Item>

{/* REPLACE the next_steps Form.Item: */}
<Form.Item
  name="next_steps"
  label={
    <Space>
      Next Steps
      {autoData?.auto_next_steps && isEditable && (
        <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
          onClick={() => form.setFieldValue('next_steps', autoData.auto_next_steps)}>
          ↙ Auto-fill from stops
        </Button>
      )}
    </Space>
  }
>
  <Input.TextArea rows={3} placeholder="Follow-up actions needed..." disabled={!isEditable} />
</Form.Item>
```

### Change F: Add Planned vs. Actual table after Report Form card

```jsx
{/* ADD after the Report Details Card: */}
{autoData?.planned_vs_actual?.length > 0 && (
  <Card title="Planned vs. Actual" size="small" style={{ marginBottom: 16 }}>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f4f8' }}>
            {['#','Stop','Planned Date','Check-in','Outcome','Products','Next Action'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {autoData.planned_vs_actual.map((row, i) => (
            <tr key={i} style={{
              background: row.outcome_status === 'visited' ? '#f6ffed' :
                          row.outcome_status === 'no_show' ? '#fff2f0' : '#fff7e6',
              borderBottom: '1px solid #f0f0f0',
            }}>
              <td style={{ padding: '6px 8px' }}>{row.stop_order}</td>
              <td style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</td>
              <td style={{ padding: '6px 8px' }}>{row.planned_date || '—'}</td>
              <td style={{ padding: '6px 8px' }}>{row.actual_checkin ? dayjs(row.actual_checkin).format('DD MMM HH:mm') : '—'}</td>
              <td style={{ padding: '6px 8px' }}>
                <Tag color={row.outcome_status === 'visited' ? 'success' : row.outcome_status === 'no_show' ? 'error' : 'warning'}>
                  {row.outcome_status || 'planned'}
                </Tag>
              </td>
              <td style={{ padding: '6px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {Array.isArray(row.products_discussed) ? row.products_discussed.join(', ') : (row.products_discussed || '—')}
              </td>
              <td style={{ padding: '6px 8px' }}>—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
)}
```

### Change G: Add per-stop manager comment thread in Visit Outcomes Summary

```jsx
{/* In the visitedStops.map(), ADD after the next_action Text: */}
{isManager && (
  <div style={{ marginTop: 4 }}>
    <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }}
      onClick={() => { setCommentingStop(stop.id); stopCommentForm.resetFields(); }}>
      + Add manager comment
    </Button>
    {report?.manager_stop_comments?.[stop.id] && (
      <div style={{ background: '#fffbe6', borderRadius: 4, padding: '4px 8px', marginTop: 4, fontSize: 12 }}>
        <Text strong>Manager: </Text>
        <Text>{report.manager_stop_comments[stop.id].comment}</Text>
      </div>
    )}
  </div>
)}

{/* ADD manager comment modal before closing </div>: */}
<Modal
  title="Add Manager Comment"
  open={commentingStop !== null}
  onCancel={() => setCommentingStop(null)}
  confirmLoading={savingStopComment}
  onOk={async () => {
    const vals = stopCommentForm.getFieldsValue(true);
    if (!vals.comment?.trim()) return;
    setSavingStopComment(true);
    try {
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/travel-report/review-stop`,
        { stop_id: commentingStop, comment: vals.comment },
        { headers: getHeaders() }
      );
      message.success('Comment saved');
      setCommentingStop(null);
      loadData();
    } catch {
      message.error('Failed to save comment');
    } finally {
      setSavingStopComment(false);
    }
  }}
  okText="Save Comment"
>
  <Form form={stopCommentForm} layout="vertical">
    <Form.Item name="comment" label="Comment">
      <Input.TextArea rows={3} placeholder="Your feedback on this stop..." />
    </Form.Item>
  </Form>
</Modal>
```

---

## 4.6 `FieldVisitReport.jsx` — All Changes

### Change A: Add PDF download button

```jsx
// ADD handleDownloadPdf function after handleDownloadHtml:
const handleDownloadPdf = async () => {
  const token = localStorage.getItem('auth_token');
  try {
    const res = await axios.get(`${API_BASE}/api/crm/field-trips/${id}/report/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-trip-${id}-report.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    message.error('PDF generation failed — try again');
  }
};
```

### Change B: Add Download PDF button in the Card toolbar

```jsx
{/* ADD next to the existing Download HTML button: */}
<Button icon={<DownloadOutlined />} onClick={handleDownloadPdf} type="primary">
  Download PDF
</Button>
```

### Change C: Add message import

```jsx
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Statistic, Typography, message } from 'antd';
```
# PART 5 — WORKLIST INTEGRATION + INDEX + FINAL CHECKLIST

---

## 5.1 `CRMWorklist.jsx` — Add Trip Approval Items

### Find the worklist item renderer and add a new case for `trip_approval`:

```jsx
// In CRMWorklist.jsx, find the section that maps/renders worklist items.
// ADD this case for trip approval items:

// In your worklist data fetch, add this query to your backend worklist endpoint:
// SELECT 'trip_approval' as item_type, ft.id as ref_id, ft.title, ft.departure_date,
//        sr.display_name as rep_name, ft.submitted_for_approval_at as created_at
// FROM crm_field_trips ft
// LEFT JOIN crm_sales_reps sr ON ft.created_by = sr.id
// WHERE ft.status = 'pending_approval'
// AND (group logic for manager scope)

// In the render, add this card variant:
{item.item_type === 'trip_approval' && (
  <Card
    key={`trip-${item.ref_id}`}
    size="small"
    style={{ marginBottom: 8, borderLeft: '4px solid #fa8c16', cursor: 'pointer' }}
    onClick={() => navigate(`/crm/visits/${item.ref_id}`)}
  >
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space>
        <Tag color="orange">Trip Approval</Tag>
        <Text strong>{item.title}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{item.rep_name}</Text>
      </Space>
      <Space>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {item.departure_date ? dayjs(item.departure_date).format('DD MMM') : 'TBD'}
        </Text>
        <Button
          size="small"
          type="primary"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/crm/visits/${item.ref_id}`);
          }}
        >
          Review
        </Button>
      </Space>
    </Space>
  </Card>
)}
```

---

## 5.2 `index.js` — Export new files

Add the new components to the CRM module exports:

```js
// ADD to src/modules/crm/index.js:
export { default as FieldVisitLegForm }       from './FieldVisitLegForm';
export { default as FieldVisitChecklistPanel } from './FieldVisitChecklistPanel';
export { default as FieldVisitKPIPanel }       from './FieldVisitKPIPanel';
export { default as FieldVisitApprovalCard }   from './FieldVisitApprovalCard';
export { default as FieldVisitExpenseModal }   from './FieldVisitExpenseModal';
```

---

## 5.3 `CRMModule.jsx` or router file — No route changes needed

The new components are sub-components used inside existing pages. No new routes required.
Only exception: if you add a template management page later, add:
```
/crm/visit-templates  →  FieldVisitTemplateList (future)
```

---

# PART 6 — IMPLEMENTATION SEQUENCE (Follow This Order)

```
Step 1:  Run all 8 SQL migrations (Part 1) in numeric order
Step 2:  Add multer to server package.json (npm install multer)
Step 3:  Create the 10 backend route handlers (Part 2) in fieldTrips.js
Step 4:  Create 5 new frontend files (Part 3):
           - FieldVisitLegForm.jsx
           - FieldVisitChecklistPanel.jsx
           - FieldVisitKPIPanel.jsx
           - FieldVisitApprovalCard.jsx
           - FieldVisitExpenseModal.jsx
Step 5:  Apply all FieldVisitPlanner.jsx changes (Part 4, section 4.1) A→L
Step 6:  Apply all FieldVisitList.jsx changes (Part 4, section 4.2) A→H
Step 7:  Apply all FieldVisitDetail.jsx changes (Part 4, section 4.3) A→H
Step 8:  Apply all FieldVisitInTrip.jsx changes (Part 4, section 4.4) A→E
Step 9:  Apply all FieldVisitTravelReport.jsx changes (Part 4, section 4.5) A→G
Step 10: Apply all FieldVisitReport.jsx changes (Part 4, section 4.6) A→C
Step 11: Add trip_approval worklist integration (Part 5, section 5.1)
Step 12: Update index.js exports (Part 5, section 5.2)
Step 13: Test end-to-end flow (Part 6 checklist below)
```

---

# PART 7 — END-TO-END TEST CHECKLIST

After implementation, verify each scenario:

## Planning Flow
- [ ] Create a LOCAL trip: fill title, dates, select transport car — checklist shows 6 local items
- [ ] Create an INTERNATIONAL trip: select flight transport — legs panel appears, checklist shows 12 intl items
- [ ] Add a FLIGHT leg: fill airline, flight number, IATA codes, booking ref — saves to crm_field_trip_legs
- [ ] Add a CAR leg: fill rental company, ref, est_km — saves correctly
- [ ] Add a stop of type CUSTOMER — customer selector appears, select one
- [ ] Add a stop of type SUPPLIER — free text company name field appears
- [ ] Click "Find Address" on an "other" stop — geocode modal opens, search resolves, coordinates populate
- [ ] Enable visa_required + select visa type — visa_details JSON saved correctly
- [ ] Click "Save as Template" — template appears in templates list
- [ ] Click "Use Template" — stops populate without dates
- [ ] Step 3 Review shows legs count and checklist completion %

## Approval Flow
- [ ] Sales rep submits trip for approval — status changes to pending_approval
- [ ] Manager sees trip in CRMWorklist with "Trip Approval" tag
- [ ] Manager opens trip detail — FieldVisitApprovalCard appears
- [ ] Manager approves — status changes to confirmed
- [ ] Manager rejects with comment — status returns to planning with approval_comments visible

## In-Trip Flow
- [ ] Start trip (status → in_progress)
- [ ] Click "Mark Arrived" — browser prompts for geolocation permission
- [ ] GPS coordinates captured in check_in_lat/lng columns
- [ ] Distance badge shows "X m from planned location" in trip detail stops timeline
- [ ] Click "I'm Here" — outcome modal opens
- [ ] Fill outcome_status=visited, products_discussed, competitor_info, next_action
- [ ] Upload a photo in the attachments section — file appears in stop detail
- [ ] Contact phone shows 📞 Call and 💬 WhatsApp links

## Expense Flow
- [ ] Click "Add Expense" in trip detail — FieldVisitExpenseModal opens
- [ ] Select USD currency, enter 100 — AED preview shows ≈ 367.25 AED
- [ ] Upload a receipt image — receipt saved, thumbnail appears in expense list
- [ ] Receipt URL stored in crm_field_trip_expenses.receipt_url
- [ ] Expense list shows "USD 100.00 → AED 367.25"

## Travel Report Flow
- [ ] Open travel report after completing stops
- [ ] "Auto-fill from stops" buttons appear on key_outcomes, challenges, next_steps
- [ ] Click auto-fill — fields populate from aggregated stop data
- [ ] ROI panel shows: visit rate %, cost per visit AED, total expenses
- [ ] Planned vs. Actual table shows all stops with green/amber/red rows
- [ ] Manager opens report — per-stop comment button appears
- [ ] Manager adds comment on a stop — comment saved to manager_stop_comments JSONB
- [ ] Submit report to manager — status → submitted
- [ ] Manager approves report

## Manager List View
- [ ] Manager opens /crm/visits — "All Reps" selector appears
- [ ] Select a specific rep — only their trips show
- [ ] Search box filters by title
- [ ] Pagination shows page 1 of N with correct totals

---

# PART 8 — IMPORTANT NOTES FOR THE AGENT

1. **Do not break existing working code.** All changes are additive or targeted replacements.
   When replacing a function, keep the same function name and export.

2. **Backend pool usage:** Use the project's existing `pool` import from `_helpers.js` or the
   pool configuration file. Do not create a new pool instance.

3. **Auth middleware:** Use the project's existing `requireAuth` middleware. Do not write a new one.

4. **File uploads path:** The `uploads/trip-attachments/` directory will be created automatically
   by `fs.mkdirSync`. In production, replace multer disk storage with S3/MinIO using the project's
   existing storage client if one exists.

5. **SSE notifications:** The submit-approval endpoint uses `sseClients` — use whatever global
   SSE client map/emit function the project already has. If it's named differently, update the
   variable reference.

6. **Geocoding rate limit:** Nominatim requires max 1 request/second and a User-Agent. The proxy
   endpoint already sets this. Do not call Nominatim directly from the frontend.

7. **FX rates:** The seed data in Migration 07 has approximate rates. Update these weekly.
   Consider adding an admin screen at `/admin/fx-rates` to manage them.

8. **PDF generation (FieldVisitReport):** The `/report/pdf` endpoint is referenced in the frontend
   but not implemented in Part 2 (it requires Puppeteer or wkhtmltopdf). If those are not available,
   show a "PDF generation not available" message and hide the button. The HTML download still works.

9. **visa_required field:** Migration 01 keeps backward compatibility by not dropping the old column.
   If the old `visa_required` boolean column still exists after migration, the frontend should read
   `visa_details.required` but fall back to `visa_required` for existing records.

10. **Drag-and-drop in Planner:** The existing `react-beautiful-dnd` dependency is already installed.
    All Draggable/Droppable code remains unchanged.
