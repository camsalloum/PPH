# MES Prepress Module — Complete Detailed Implementation Plan
**Project:** Flexo Plate Production & Prepress Management Module
**Plant:** Flexible Packaging — Dubai
**Stack:** React + Node.js + PostgreSQL (extension of existing MES)
**Reference:** Flexography: Principles & Practices, 5th Edition (FFTA)
**Prepared:** April 2026

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│               EXISTING MES WEBAPP                   │
│  ┌──────────────────────────────────────────────┐   │
│  │           PREPRESS MODULE (NEW)              │   │
│  │  Estimation → Job → Prepress → Production    │   │
│  │  Inventory → Warehouse → Analytics           │   │
│  └──────────────────────────────────────────────┘   │
│               Node.js API  /api/prepress/            │
│               PostgreSQL   (extended schema)         │
└─────────────────────────────────────────────────────┘
         ↕ Esko CDI Export   ↕ PDF Generator
```

---

## PHASE 1 — DATABASE SCHEMA (PostgreSQL)

### 1.1 Master Data Tables

#### `machines`
```sql
CREATE TABLE machines (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20) UNIQUE NOT NULL,       -- 'BOBST', 'M6', 'FT', 'CARINT', 'UTECO', 'KYMC', 'HONG_YANG'
  name            VARCHAR(100) NOT NULL,
  press_type      VARCHAR(20),                        -- 'CI', 'STACK', 'INLINE'
  max_web_width_mm NUMERIC(8,2) NOT NULL,             -- usable print width
  gear_pitch_mm   NUMERIC(6,4) NOT NULL,              -- determines available repeats
  min_repeat_mm   NUMERIC(8,2),
  max_repeat_mm   NUMERIC(8,2),
  max_colors      INTEGER DEFAULT 8,
  undercut_mm     NUMERIC(6,3),                       -- bearer-to-face depth
  active          BOOLEAN DEFAULT TRUE,
  notes           TEXT
);
```

#### `cylinder_repeats`
```sql
CREATE TABLE cylinder_repeats (
  id              SERIAL PRIMARY KEY,
  machine_id      INTEGER REFERENCES machines(id),
  repeat_mm       NUMERIC(8,2) NOT NULL,              -- circumference = gear_pitch × tooth_count
  tooth_count     INTEGER,
  available       BOOLEAN DEFAULT TRUE,
  UNIQUE (machine_id, repeat_mm)
);
```

#### `plate_types`
```sql
CREATE TABLE plate_types (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30) UNIQUE NOT NULL,        -- 'ACE_1.14_76', 'ESX_1.14_106', 'ASAHI_2.84_106'
  brand           VARCHAR(50),                         -- 'DuPont Cyrel', 'ASAHI'
  series          VARCHAR(20),                         -- 'ACE', 'ESX', 'ESE', 'FTV', 'FTF', 'ASAHI'
  thickness_mm    NUMERIC(4,2) NOT NULL,               -- 1.14 / 1.70 / 2.84
  width_cm        NUMERIC(6,2),                        -- sheet width: 76, 90, 92, 106, 120, 152.4
  height_cm       NUMERIC(6,2),                        -- sheet height
  area_cm2        NUMERIC(10,2) GENERATED ALWAYS AS (width_cm * height_cm) STORED,
  unit_price_aed  NUMERIC(10,2),                       -- price per full sheet
  price_per_cm2   NUMERIC(8,6) GENERATED ALWAYS AS (unit_price_aed / (width_cm * height_cm)) STORED,
  supplier_id     INTEGER REFERENCES suppliers(id),
  dot_type        VARCHAR(20),                         -- 'ROUND_TOP', 'FLAT_TOP'
  washout_type    VARCHAR(20),                         -- 'SOLVENT', 'WATER', 'THERMAL'
  active          BOOLEAN DEFAULT TRUE
);
```

#### `suppliers`
```sql
CREATE TABLE suppliers (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20) UNIQUE NOT NULL,         -- 'DYNAGRAPH', 'ANOOP', 'CRYSTAL'
  name            VARCHAR(150) NOT NULL,
  contact_name    VARCHAR(100),
  phone           VARCHAR(30),
  email           VARCHAR(100),
  payment_terms   VARCHAR(50),
  lead_time_days  INTEGER,
  active          BOOLEAN DEFAULT TRUE
);
```

#### `customers`
```sql
CREATE TABLE customers (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30) UNIQUE,
  name            VARCHAR(200) NOT NULL,
  country         VARCHAR(50),
  contact_name    VARCHAR(100),
  email           VARCHAR(100),
  phone           VARCHAR(30),
  active          BOOLEAN DEFAULT TRUE
);
```

#### `press_characterization`
-- Dot gain / TVI curves and ICC profile references per machine/substrate
```sql
CREATE TABLE press_characterization (
  id              SERIAL PRIMARY KEY,
  machine_id      INTEGER REFERENCES machines(id),
  substrate_type  VARCHAR(50),                         -- 'BOPP', 'PET', 'PE', 'FOIL', 'PAPER'
  ink_type        VARCHAR(30),                         -- 'SOLVENT', 'WATER', 'UV'
  anilox_bcm      NUMERIC(6,2),
  tvi_25          NUMERIC(5,2),                        -- dot gain at 25% tone
  tvi_50          NUMERIC(5,2),                        -- dot gain at 50% tone
  tvi_75          NUMERIC(5,2),                        -- dot gain at 75% tone
  cutback_curve   JSONB,                               -- full curve as array of {input, output} pairs
  icc_profile     VARCHAR(200),
  notes           TEXT,
  characterized_date DATE,
  active          BOOLEAN DEFAULT TRUE
);
```

---

### 1.2 Inventory Tables

#### `purchase_orders`
```sql
CREATE TABLE purchase_orders (
  id              SERIAL PRIMARY KEY,
  po_number       VARCHAR(50) UNIQUE NOT NULL,
  supplier_id     INTEGER REFERENCES suppliers(id),
  po_date         DATE NOT NULL,
  delivery_date   DATE,
  status          VARCHAR(20) DEFAULT 'OPEN',           -- OPEN, RECEIVED, PARTIAL, CANCELLED
  total_amount_aed NUMERIC(12,2),
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `purchase_order_lines`
```sql
CREATE TABLE purchase_order_lines (
  id              SERIAL PRIMARY KEY,
  po_id           INTEGER REFERENCES purchase_orders(id),
  plate_type_id   INTEGER REFERENCES plate_types(id),
  item_code       VARCHAR(50),
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER DEFAULT 0,
  unit_price_aed  NUMERIC(10,2),
  total_price_aed NUMERIC(12,2) GENERATED ALWAYS AS (quantity_ordered * unit_price_aed) STORED
);
```

#### `plate_stock`
```sql
CREATE TABLE plate_stock (
  id              SERIAL PRIMARY KEY,
  plate_type_id   INTEGER REFERENCES plate_types(id) UNIQUE,
  qty_in_hand     INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER DEFAULT 12,
  reorder_qty     INTEGER DEFAULT 24,
  last_updated    TIMESTAMPTZ DEFAULT NOW()
);
```

#### `stock_movements`
```sql
CREATE TABLE stock_movements (
  id              SERIAL PRIMARY KEY,
  plate_type_id   INTEGER REFERENCES plate_types(id),
  movement_type   VARCHAR(20) NOT NULL,                 -- 'IN', 'OUT', 'ADJUSTMENT'
  quantity        INTEGER NOT NULL,
  reference_type  VARCHAR(30),                          -- 'PO', 'JOB', 'DAMAGE', 'ADJUSTMENT'
  reference_id    INTEGER,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.3 Estimation Tables

#### `estimations`
```sql
CREATE TABLE estimations (
  id                  SERIAL PRIMARY KEY,
  estimate_ref        VARCHAR(30) UNIQUE NOT NULL,       -- auto-generated EST-2026-0001
  customer_id         INTEGER REFERENCES customers(id),
  art_ref             VARCHAR(50),
  job_description     TEXT,
  -- Design dimensions
  design_width_mm     NUMERIC(8,2) NOT NULL,             -- label/pouch width
  design_height_mm    NUMERIC(8,2) NOT NULL,             -- label/pouch height (cutoff direction)
  -- Machine & substrate
  machine_id          INTEGER REFERENCES machines(id),
  substrate_type      VARCHAR(50),
  job_type            VARCHAR(10),                        -- F/B, F/P, S/B, T/F
  print_direction     VARCHAR(10),                        -- SURFACE, REVERSE
  -- Imposition results
  reel_width_mm       NUMERIC(8,2),
  usable_width_mm     NUMERIC(8,2),
  ups_across          INTEGER,
  cylinder_repeat_id  INTEGER REFERENCES cylinder_repeats(id),
  chosen_repeat_mm    NUMERIC(8,2),
  ups_around          INTEGER,
  total_ups           INTEGER GENERATED ALWAYS AS (ups_across * ups_around) STORED,
  waste_pct           NUMERIC(5,2),
  -- Distortion compensation
  distortion_factor   NUMERIC(8,6),
  compensated_repeat_mm NUMERIC(8,2),
  -- Plate specification
  plate_type_id       INTEGER REFERENCES plate_types(id),
  num_colors          INTEGER NOT NULL,
  plate_area_cm2      NUMERIC(10,2),                     -- per color
  total_plate_area_cm2 NUMERIC(10,2) GENERATED ALWAYS AS (plate_area_cm2 * num_colors) STORED,
  -- Cost
  cost_per_color_aed  NUMERIC(10,2),
  total_cost_aed      NUMERIC(12,2) GENERATED ALWAYS AS (cost_per_color_aed * num_colors) STORED,
  -- Status
  status              VARCHAR(20) DEFAULT 'DRAFT',        -- DRAFT, SENT, APPROVED, REJECTED, CONVERTED
  approved_by_customer BOOLEAN DEFAULT FALSE,
  approval_date       DATE,
  converted_to_job_id INTEGER,
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

#### `estimation_colors`
```sql
CREATE TABLE estimation_colors (
  id                  SERIAL PRIMARY KEY,
  estimation_id       INTEGER REFERENCES estimations(id),
  color_number        INTEGER NOT NULL,                   -- 1,2,3...N
  color_name          VARCHAR(50),                        -- 'CYAN', 'MAGENTA', 'PAN 485', 'WHITE'
  color_type          VARCHAR(20),                        -- 'PROCESS', 'SPOT', 'WHITE', 'VARNISH'
  plate_type_id       INTEGER REFERENCES plate_types(id), -- may differ per color
  plate_area_cm2      NUMERIC(10,2),
  unit_cost_aed       NUMERIC(10,2),
  is_common           BOOLEAN DEFAULT FALSE,              -- common plate shared from another job
  common_from_art_ref VARCHAR(50)
);
```

---

### 1.4 Job Tables

#### `jobs`
```sql
CREATE TABLE jobs (
  id                  SERIAL PRIMARY KEY,
  fap_no              VARCHAR(20) UNIQUE NOT NULL,        -- FAP013213 — sequential, auto-generated
  art_ref             VARCHAR(50) NOT NULL,
  estimation_id       INTEGER REFERENCES estimations(id),
  customer_id         INTEGER REFERENCES customers(id),
  job_name            TEXT NOT NULL,
  job_type            VARCHAR(10),                        -- F/B, F/P, S/B, T/F
  machine_id          INTEGER REFERENCES machines(id),
  cylinder_repeat_id  INTEGER REFERENCES cylinder_repeats(id),
  print_direction     VARCHAR(10),                        -- SURFACE, REVERSE
  num_colors          INTEGER,
  shift               VARCHAR(5),                         -- D/S, N/S
  job_date            DATE,
  -- Artwork status
  artwork_status      VARCHAR(30) DEFAULT 'AWAITING',     -- AWAITING, RECEIVED, PREFLIGHT_OK, PREFLIGHT_FAIL, APPROVED
  artwork_received_at TIMESTAMPTZ,
  artwork_approved_at TIMESTAMPTZ,
  customer_approved   BOOLEAN DEFAULT FALSE,
  -- Esko status
  esko_status         VARCHAR(20) DEFAULT 'PENDING',      -- PENDING, SENT, ENGRAVING, DONE
  esko_sent_at        TIMESTAMPTZ,
  esko_done_at        TIMESTAMPTZ,
  -- Job status
  status              VARCHAR(20) DEFAULT 'NEW',          -- NEW, IN_PREPRESS, PLATES_READY, IN_PRODUCTION, COMPLETED, DAMAGED, ARCHIVED
  remarks             VARCHAR(30),                        -- NEW PRINT, DAMAGE, CHANGES
  completed_colors    INTEGER DEFAULT 0,
  balance_colors      INTEGER,
  -- Cost
  plate_cost_aed      NUMERIC(12,2),
  cost_note           VARCHAR(50),                        -- 'AED 4000', 'NO', 'SAMPLE', 'FOC'
  -- Misc
  infor_user          VARCHAR(10),                        -- M or S (Infor ERP user type)
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

#### `job_colors`
-- Each color separation per job (one plate per color)
```sql
CREATE TABLE job_colors (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER REFERENCES jobs(id),
  color_number        INTEGER NOT NULL,
  color_name          VARCHAR(50),
  color_type          VARCHAR(20),                        -- PROCESS, SPOT, WHITE, VARNISH
  plate_type_id       INTEGER REFERENCES plate_types(id),
  plate_area_cm2      NUMERIC(10,2),
  is_common           BOOLEAN DEFAULT FALSE,
  common_from_art_ref VARCHAR(50),
  esko_file_ref       VARCHAR(100),                       -- 1-bit TIFF filename sent to Esko
  plate_status        VARCHAR(20) DEFAULT 'PENDING',      -- PENDING, ENGRAVING, READY, MOUNTED, IN_PRESS, STORED, DAMAGED
  damage_reason       TEXT
);
```

#### `job_esko_params`
-- Technical parameters sent to Esko for each job
```sql
CREATE TABLE job_esko_params (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER REFERENCES jobs(id) UNIQUE,
  machine_code        VARCHAR(20),
  repeat_mm           NUMERIC(8,2),
  reel_width_mm       NUMERIC(8,2),
  ups_across          INTEGER,
  ups_around          INTEGER,
  distortion_factor   NUMERIC(8,6),
  compensated_repeat_mm NUMERIC(8,2),
  screen_ruling_lpi   INTEGER,
  dot_shape           VARCHAR(20),
  plate_thickness_mm  NUMERIC(4,2),
  stickyback_mm       NUMERIC(4,2),
  characterization_id INTEGER REFERENCES press_characterization(id),
  pin_register        BOOLEAN DEFAULT TRUE,
  export_format       VARCHAR(20) DEFAULT '1BIT_TIFF',
  exported_at         TIMESTAMPTZ,
  exported_by         INTEGER REFERENCES users(id)
);
```

---

### 1.5 Production Log Tables

#### `production_logs`
-- One entry per plate event (mirrors existing monthly sheets exactly)
```sql
CREATE TABLE production_logs (
  id                  SERIAL PRIMARY KEY,
  log_date            DATE NOT NULL,
  shift               VARCHAR(5) NOT NULL,               -- D/S, N/S
  job_id              INTEGER REFERENCES jobs(id),
  fap_no              VARCHAR(20),
  art_ref             VARCHAR(50),
  customer_id         INTEGER REFERENCES customers(id),
  machine_id          INTEGER REFERENCES machines(id),
  cylinder_mm         NUMERIC(8,2),                      -- cylinder circumference used
  num_colors          INTEGER,
  completed_colors    INTEGER,
  balance_colors      INTEGER,
  total_area_cm2      NUMERIC(12,2),
  plate_cost_aed      NUMERIC(12,2),
  remarks             VARCHAR(30),                        -- NEW PRINT, DAMAGE, CHANGES
  reason              TEXT,                               -- damage/change reason
  logged_by           INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

#### `production_log_plates`
-- Plate area consumed per plate type per log entry
```sql
CREATE TABLE production_log_plates (
  id                  SERIAL PRIMARY KEY,
  log_id              INTEGER REFERENCES production_logs(id),
  plate_type_id       INTEGER REFERENCES plate_types(id),
  area_cm2            NUMERIC(10,2)
);
```

#### `damage_log`
```sql
CREATE TABLE damage_log (
  id                  SERIAL PRIMARY KEY,
  log_id              INTEGER REFERENCES production_logs(id),
  job_id              INTEGER REFERENCES jobs(id),
  machine_id          INTEGER REFERENCES machines(id),
  log_date            DATE NOT NULL,
  num_plates_damaged  INTEGER DEFAULT 1,
  plate_type_id       INTEGER REFERENCES plate_types(id),
  area_cm2            NUMERIC(10,2),
  damage_category     VARCHAR(50),                        -- 'DOT_GAIN', 'CRACKED', 'FOLDED', 'PATCH', 'OLD_PLATE', 'MECHANICAL'
  damage_reason       TEXT,
  color_name          VARCHAR(50),
  replacement_cost_aed NUMERIC(10,2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.6 Warehouse Tables

#### `plate_warehouse`
```sql
CREATE TABLE plate_warehouse (
  id                  SERIAL PRIMARY KEY,
  fap_no              VARCHAR(20) REFERENCES jobs(fap_no),
  art_ref             VARCHAR(50),
  customer_id         INTEGER REFERENCES customers(id),
  machine_id          INTEGER REFERENCES machines(id),
  num_plates          INTEGER,
  location_bin        VARCHAR(30),                        -- physical shelf/bin reference
  status              VARCHAR(20) DEFAULT 'STORED',       -- ACTIVE, STORED, UNDER_REVIEW, ARCHIVED, DISPOSED
  last_used_date      DATE,
  stored_date         DATE,
  review_due_date     DATE,                               -- stored_date + 6 months
  disposed_date       DATE,
  disposal_reason     TEXT,
  notes               TEXT,
  updated_by          INTEGER REFERENCES users(id),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## PHASE 2 — BACKEND API (Node.js)

### Route Structure
All routes under: `/api/prepress/`

---

### 2.1 Master Data Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/machines` | List all machines with repeats |
| GET | `/machines/:id/repeats` | Get all cylinder repeats for a machine |
| POST | `/machines` | Add a machine |
| PUT | `/machines/:id` | Update machine config |
| GET | `/plate-types` | List all plate types with current price |
| POST | `/plate-types` | Add plate type |
| GET | `/suppliers` | List suppliers |
| GET | `/customers` | List customers (shared with existing MES) |
| GET | `/press-characterization/:machineId` | Get TVI curves for a machine |

---

### 2.2 Inventory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inventory/stock` | Current stock levels per plate type with status (OK/LOW/CRITICAL) |
| GET | `/inventory/stock/:plateTypeId` | Stock detail for one plate type |
| GET | `/inventory/po` | All purchase orders |
| POST | `/inventory/po` | Create new PO |
| PUT | `/inventory/po/:id/receive` | Mark PO as received, update stock_movements and plate_stock |
| GET | `/inventory/movements` | Stock movement history with filters |
| GET | `/inventory/alerts` | Plates below reorder level |

**Business Logic — Stock update on PO receive:**
```javascript
// When PO line is received:
await db.query(`
  UPDATE plate_stock
  SET qty_in_hand = qty_in_hand + $1, last_updated = NOW()
  WHERE plate_type_id = $2
`, [qty_received, plate_type_id]);

await db.query(`
  INSERT INTO stock_movements (plate_type_id, movement_type, quantity, reference_type, reference_id, created_by)
  VALUES ($1, 'IN', $2, 'PO', $3, $4)
`, [plate_type_id, qty_received, po_id, user_id]);
```

---

### 2.3 Estimation Engine Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/estimations/calculate` | Core calculation engine (no DB write — returns result) |
| POST | `/estimations` | Save a new estimation |
| GET | `/estimations` | List all estimations with filters |
| GET | `/estimations/:id` | Get full estimation detail |
| PUT | `/estimations/:id` | Update estimation |
| PUT | `/estimations/:id/send` | Mark as sent to customer |
| PUT | `/estimations/:id/approve` | Mark as customer approved |
| PUT | `/estimations/:id/reject` | Mark as rejected |
| POST | `/estimations/:id/convert` | Convert approved estimate → job |
| GET | `/estimations/:id/pdf` | Generate PDF quotation |

**Core Estimation Calculation Logic:**
```javascript
// POST /estimations/calculate
function calculateEstimation({
  machineId, designWidthMm, designHeightMm, reelWidthMm, numColors, plateTypeId
}) {
  const machine = getMachine(machineId);
  const plateType = getPlateType(plateTypeId);

  // 1. Usable print width (web width minus edge trim)
  const usableWidth = reelWidthMm - machine.edgeTrimMm;

  // 2. Ups across the web
  const upsAcross = Math.floor(usableWidth / designWidthMm);

  // 3. Find best cylinder repeat
  const repeats = getCylinderRepeats(machineId); // sorted ascending
  const candidates = repeats.filter(r => r.repeat_mm >= designHeightMm);
  const bestRepeat = selectBestRepeat(candidates, designHeightMm, upsAcross);

  // 4. Ups around the cylinder
  const upsAround = Math.floor(bestRepeat.repeat_mm / designHeightMm);

  // 5. Waste percentage
  const wastePct = ((bestRepeat.repeat_mm - (upsAround * designHeightMm)) / bestRepeat.repeat_mm) * 100;

  // 6. Distortion compensation
  const distortionFactor = (Math.PI * 2 * plateType.thickness_mm) / bestRepeat.repeat_mm;
  const compensatedRepeat = designHeightMm / (1 + distortionFactor);

  // 7. Plate area = plate sheet area needed per color
  // Plate must cover: upsAcross × design_width across, bestRepeat around
  const plateAreaCm2 = (upsAcross * (designWidthMm / 10)) * (bestRepeat.repeat_mm / 10);

  // 8. Cost per color
  const costPerColor = plateAreaCm2 * plateType.price_per_cm2;

  return {
    upsAcross, upsAround, totalUps: upsAcross * upsAround,
    chosenRepeatMm: bestRepeat.repeat_mm, wastePct,
    distortionFactor, compensatedRepeatMm: compensatedRepeat,
    plateAreaCm2, costPerColor, totalCostAed: costPerColor * numColors
  };
}
```

---

### 2.4 Job Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | List jobs with filters (date, machine, status, customer) |
| POST | `/jobs` | Create job (manual or converted from estimation) |
| GET | `/jobs/:id` | Full job detail |
| PUT | `/jobs/:id` | Update job |
| PUT | `/jobs/:id/artwork-status` | Update artwork preflight status |
| PUT | `/jobs/:id/customer-approve` | Record customer approval |
| POST | `/jobs/:id/esko-export` | Generate and send Esko parameter file |
| PUT | `/jobs/:id/esko-done` | Mark Esko engraving complete |
| PUT | `/jobs/:id/plates-ready` | Mark plates processed and ready for mounting |
| GET | `/jobs/fap-next` | Get next FAP number in sequence |

**FAP Number Auto-Generation:**
```javascript
// Format: FAP + 6-digit zero-padded sequential number
// Starting from last used: FAP014787 (from Dec 2025 log)
async function getNextFapNo(db) {
  const result = await db.query(
    `SELECT fap_no FROM jobs ORDER BY id DESC LIMIT 1`
  );
  const last = parseInt(result.rows[0]?.fap_no?.replace('FAP', '') || '14787');
  return `FAP${String(last + 1).padStart(6, '0')}`;
}
```

---

### 2.5 Production Log Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/production-logs` | List logs with date/month/machine/shift filters |
| POST | `/production-logs` | Create new production log entry |
| PUT | `/production-logs/:id` | Update log entry |
| DELETE | `/production-logs/:id` | Delete log entry (supervisor only) |
| GET | `/production-logs/monthly-summary` | Monthly totals per machine (replaces Excel Plate Damage tab) |
| GET | `/production-logs/export` | Export to Excel format (legacy compatibility) |

---

### 2.6 Damage Log Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/damage-log` | List damage records with filters |
| POST | `/damage-log` | Log a new damage event |
| GET | `/damage-log/by-machine` | Damage count per machine per month |
| GET | `/damage-log/categories` | Damage breakdown by category |

**Damage Categories (predefined):**
- `DOT_GAIN` — Screen dot gain more (excessive)
- `CRACKED` — Plate cracked (old plate)
- `FOLDED` — Plate folded during mounting/demounting
- `PATCH_SHOWING` — Background patches visible
- `LESS_COVERING` — Old plate, ink not covering (worn)
- `MECHANICAL` — Machine auto-stop / anilox damage
- `REGISTER` — Registration issue cut the plate
- `STICKY` — Very sticky surface
- `SIZE_CHANGE` — Cylinder size change (CHANGES category)
- `ARTWORK_CHANGE` — Artwork revision (CHANGES category)

---

### 2.7 Warehouse Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/warehouse` | List all stored plates with filters |
| POST | `/warehouse` | Add plates to warehouse after job completion |
| PUT | `/warehouse/:id/status` | Update plate lifecycle status |
| GET | `/warehouse/review-due` | Plates overdue for 6-month review |
| PUT | `/warehouse/:id/dispose` | Mark plates as disposed |
| GET | `/warehouse/search` | Search by FAP.NO or ART REF |

---

### 2.8 Analytics / Reporting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports/damage-by-machine` | Monthly damage matrix (all machines × all months) |
| GET | `/reports/consumption-by-plate-type` | cm² consumed per plate type per period |
| GET | `/reports/cost-by-customer` | Total plate cost per customer |
| GET | `/reports/cost-by-machine` | Total plate cost per machine |
| GET | `/reports/stock-burn-rate` | Plates consumed per month + reorder forecast |
| GET | `/reports/new-vs-damage-ratio` | NEW PRINT vs DAMAGE vs CHANGES split |
| GET | `/reports/kpis` | All KPI summary for dashboard |
| GET | `/reports/estimation-conversion` | Estimate-to-order conversion rate |

---

### 2.9 Esko Integration Export

```javascript
// POST /jobs/:id/esko-export
// Generates a structured JSON/XML parameter file for the Esko CDI operator
function generateEskoExport(job, eskoParams) {
  return {
    jobRef: job.fap_no,
    artRef: job.art_ref,
    customer: job.customer_name,
    machine: job.machine_code,
    press: {
      repeat_mm: eskoParams.repeat_mm,
      compensated_repeat_mm: eskoParams.compensated_repeat_mm,
      distortion_factor: eskoParams.distortion_factor,
      web_width_mm: eskoParams.reel_width_mm,
      ups_across: eskoParams.ups_across,
      ups_around: eskoParams.ups_around
    },
    plate: {
      type: eskoParams.plate_type,
      thickness_mm: eskoParams.plate_thickness_mm,
      screen_ruling_lpi: eskoParams.screen_ruling_lpi,
      dot_shape: eskoParams.dot_shape
    },
    colors: job.colors.map(c => ({
      number: c.color_number,
      name: c.color_name,
      type: c.color_type,
      file: c.esko_file_ref
    })),
    characterization: eskoParams.icc_profile,
    exportedAt: new Date().toISOString()
  };
}
```

---

### 2.10 PDF Generation

Using **PDFKit** or **Puppeteer**:

**Estimation Quotation PDF** includes:
- Company header, estimate reference, date
- Customer details
- Design specifications (dimensions, machine, substrate)
- Imposition summary (ups, repeat, waste %)
- Color breakdown table (color name, plate type, area, unit cost)
- Total plate cost (per color + grand total)
- Validity period
- Terms

**Job Sheet PDF** includes:
- FAP.NO, ART REF, customer, job name
- Machine, cylinder repeat, print direction, shift
- Color list with plate specifications
- Esko parameters summary
- Prepress checklist (preflight, customer approval, Esko status)

---

### 2.11 Auth & Role Middleware

```javascript
// Extend existing MES auth with Prepress roles
const PREPRESS_ROLES = {
  ESTIMATOR: ['read:estimation', 'write:estimation', 'read:jobs'],
  PREPRESS_OPERATOR: ['read:jobs', 'write:jobs', 'write:production_logs', 'read:inventory'],
  SHIFT_SUPERVISOR: ['read:jobs', 'write:jobs', 'write:production_logs', 'write:damage_log', 'delete:production_logs'],
  WAREHOUSE: ['read:warehouse', 'write:warehouse'],
  MANAGER: ['*']  // all permissions
};
```

---

## PHASE 3 — FRONTEND (React)

### 3.1 Module Navigation Structure
```
/prepress
  /dashboard          ← KPI overview
  /estimation
    /new              ← New estimate
    /:id              ← View/edit estimate
    /list             ← All estimates
  /jobs
    /new              ← Manual job entry
    /:id              ← Job detail + status tracker
    /list             ← Job board
  /inventory
    /stock            ← Current stock levels
    /purchase-orders  ← PO management
    /movements        ← Stock history
  /production
    /log              ← Daily shift log entry
    /history          ← Log search + history
  /damage
    /log              ← Damage entry
    /report           ← Monthly damage summary
  /warehouse
    /shelf            ← Plate location grid
    /review           ← 6-month review queue
  /analytics
    /dashboard        ← Charts & KPIs
    /reports          ← Exportable reports
  /settings
    /machines         ← Machine + repeat configuration
    /plate-types      ← Plate catalogue + pricing
    /suppliers        ← Supplier management
    /characterization ← Press TVI curves
```

---

### 3.2 Estimation Screen

**Form fields:**
- Customer (searchable dropdown, linked to customers table)
- Art Reference
- Job description
- Design width (mm) + height (mm)
- Machine selector
- Reel width (mm) — auto-suggests machine max, editable
- Substrate type (BOPP / PET / PE / FOIL / PAPER / OTHER)
- Job type (F/B / F/P / S/B / T/F)
- Print direction (SURFACE / REVERSE)
- Number of colors (spinner)
- Plate type selector (filters by supplier and thickness)
- Per-color detail: color name, type, special (white/metallic flag), common from (optional)

**Live calculation panel (right side, updates on every field change):**
- Ups across: X
- Ups around: Y
- Total ups: X×Y
- Best cylinder repeat: NNN mm
- Waste percentage: N.N%
- Distortion factor: N.NNNNNN
- Compensated repeat: NNN.N mm
- Plate area per color: NNNNN cm²
- Cost per color: AED NNNN
- **TOTAL PLATE COST: AED NNNNN** ← highlighted

**Actions:**
- Save as Draft
- Send to Customer (updates status + optional email trigger)
- Generate PDF Quotation
- Mark as Approved (customer approved)
- Convert to Job (once approved)

---

### 3.3 Job Order Screen

**Job status tracker bar (horizontal stepper):**
```
[ESTIMATION] → [ARTWORK RECEIVED] → [PREFLIGHT OK] → [CUSTOMER APPROVED]
→ [ESKO SENT] → [PLATES READY] → [MOUNTED] → [IN PRODUCTION] → [COMPLETED]
```
Each step is clickable by the appropriate role to advance status with timestamp.

**Job card fields:**
- FAP.NO (auto-generated, displayed prominently)
- Art Ref, Customer, Job Name
- Machine, Repeat, Print Direction, Job Type, Shift
- Colors table: number, name, type, plate type, area, common flag
- Esko parameters panel (collapsed by default, expandable)
- Notes / Remarks

**Actions:**
- Export to Esko (generates parameter file)
- Print Job Sheet (PDF)
- Log Production Entry (quick-link to production log)
- Send to Warehouse (after job completes)

---

### 3.4 Plate Inventory Screen

**Stock overview table:**
| Plate Type | In Hand | Reorder Level | Status | Supplier | Last PO |
Each row color-coded: green (OK), amber (≤ reorder level), red (critical/zero).

**PO Management tab:**
- List of all POs by supplier
- Create new PO form: supplier, date, line items (plate type + qty + unit price)
- Receive PO: enter qty received per line → auto-updates stock

**Stock Movement History:**
- Filterable log of all IN/OUT movements with job/PO reference

---

### 3.5 Production Log Screen (Shift Entry)

Designed for fast, daily use by the prepress operator at end of shift.

**Entry form mirrors current Excel structure:**
- Date, Shift (D/S / N/S)
- Job lookup: search by FAP.NO or ART REF (auto-fills customer, machine, job name)
- Cylinder size (editable)
- No. of colors, Completed, Balance
- Plate area inputs: one input per plate type (only relevant types shown based on job's plate spec)
- Total cm² (auto-calculated)
- Remarks: NEW PRINT / DAMAGE / CHANGES (radio buttons)
- Damage reason (text, shown only if DAMAGE or CHANGES selected)
- Plate cost (AED input)

**Bulk shift view:** show all entries for current date/shift in a scrollable table with inline edit.

---

### 3.6 Damage Log Screen

**Entry form:**
- Link to production log entry (auto-fills machine, job, plate type)
- Number of plates damaged
- Damage category (dropdown: DOT_GAIN, CRACKED, FOLDED, PATCH_SHOWING, etc.)
- Damage detail / reason (free text with color name)
- Replacement cost (auto-calculated from plate type rate × area)

**Monthly Summary Table:**
Replicates the existing "Plate Damage" Excel tab:

|  | JAN | FEB | MAR | ... | DEC | TOTAL |
|--|-----|-----|-----|-----|-----|-------|
| BOBST | 30 | 16 | 22 | ... | | |
| M6 | 14 | 18 | 14 | ... | | |
| FT | 18 | 20 | 16 | ... | | |
| CARINT | 2 | 3 | 6 | ... | | |
| UTECO | 0 | 5 | 2 | ... | | |
| **TOTAL** | **64** | **62** | **60** | ... | | **846** |

---

### 3.7 Warehouse Screen

**Plate shelf grid:**
- Filterable list: status, customer, machine, last-used date range
- Columns: FAP.NO, Art Ref, Customer, Machine, No. Plates, Location, Status, Last Used, Review Due
- Status badges: STORED (blue), ACTIVE (green), UNDER REVIEW (amber), ARCHIVED (grey), DISPOSED (red)

**6-Month Review Queue:**
- Filtered view of all plates where `review_due_date <= TODAY`
- Actions per row: Extend (reset review date), Archive, Dispose
- Disposal records damage count / cost

---

### 3.8 Analytics Dashboard

**KPI Cards (top row):**
- Total plates produced this month (NEW PRINT count)
- Total damage this month (DAMAGE count)
- Damage rate % = DAMAGE / (NEW PRINT + DAMAGE) × 100
- Total plate cost this month (AED)
- Plates in warehouse
- Stock alerts count

**Charts:**
1. **Damage by Machine** — bar chart, monthly, all machines stacked
2. **Plate Consumption by Type** — pie/donut of cm² by plate type YTD
3. **Monthly Cost Trend** — line chart, plate cost AED per month
4. **Cost by Customer** — horizontal bar, top 10 customers by plate cost
5. **New Print vs Damage vs Changes** — stacked bar per month
6. **Stock Level** — current qty vs reorder level per plate type (bullet chart)
7. **Estimation Conversion** — funnel: SENT → APPROVED → CONVERTED to job

**Reports (exportable to Excel/PDF):**
- Monthly plate log (per machine, per month — matches current Excel format)
- Annual damage summary
- Customer plate cost statement
- Inventory status report
- Warehouse inventory

---

## PHASE 4 — INTEGRATIONS

### 4.1 Esko CDI Integration
- Generate structured JSON export file per job (includes all parameters above)
- Place file in shared network folder (or POST to Esko API if CDI version supports it)
- Esko operator imports file directly into CDI job queue
- On completion, Esko operator updates job status to PLATES_READY via MES UI

### 4.2 Existing MES Integration Points
- **Customer master:** sync with existing MES customers table (no duplication)
- **Machine master:** extend existing MES machines table with prepress columns
- **User/Auth:** extend existing role system with PREPRESS roles
- **Infor ERP link:** FAP.NO maps to production order reference; INFOR USER field (M/S) preserved

### 4.3 PDF Generator (Node.js)
- Library: **Puppeteer** (renders HTML templates to PDF) or **PDFKit** (programmatic)
- Templates: Estimation Quotation, Job Sheet, Monthly Damage Report
- Stored in `/outputs/pdfs/` on server, linked from job record

---

## PHASE 5 — PREFLIGHT QUALITY CONTROL CHECKLIST
*(New module feature — derived from FFTA knowledge)*

A structured digital checklist attached to each job at the artwork stage:

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | File format correct (PDF/AI/EPS) | ☐ | |
| 2 | Resolution ≥ 300 DPI | ☐ | |
| 3 | Fonts embedded / outlined | ☐ | |
| 4 | Dimensions match specification | ☐ | |
| 5 | Color count matches order | ☐ | |
| 6 | Spot colors correctly named (Pantone) | ☐ | |
| 7 | White separation present (reverse print) | ☐ | |
| 8 | Barcode / UPC positioned per spec | ☐ | |
| 9 | Minimum dot ≥ 3% | ☐ | |
| 10 | TAC ≤ 280% | ☐ | |
| 11 | Trapping values applied | ☐ | |
| 12 | Ink rotation defined | ☐ | |
| 13 | Distortion compensation applied | ☐ | |
| 14 | Customer proof approved | ☐ | |

Checklist is completed by the Prepress Operator. Job cannot advance to ESKO_SENT status until all items are checked.

---

## PHASE 6 — MIGRATION

### Data Sources
- **FLEXO_PLATE_LOG_2025.xlsx** — 12 monthly sheets (JAN–DEC), ~1,600 production log entries
- **Flexo_Plates_Order_2025.xlsx** — 3 supplier sheets (DYNAGRAPH, ANOOP, CRYSTAL), ~80 PO records

### Migration Steps
1. Write Python migration scripts to parse and clean both Excel files
2. Resolve data issues: date anomalies (e.g., FEB entries dated 2005), missing FAP.NOs, merged PO lines
3. Seed master data: machines, plate types, suppliers from existing records
4. Import production logs → `production_logs` + `production_log_plates`
5. Import damage tab → `damage_log`
6. Import PO records → `purchase_orders` + `purchase_order_lines`
7. Derive initial `plate_stock` from PO history minus consumption
8. Validate totals against original Excel totals

### Parallel Run
- Duration: 3–4 weeks
- Both Excel and MES module used simultaneously
- Weekly reconciliation meeting to compare totals
- Cutover when zero discrepancies for 2 consecutive weeks

---

## PHASE 7 — BUILD SEQUENCE & TIMELINE

| Sprint | Duration | Deliverable |
|--------|----------|-------------|
| Sprint 1 | 2 weeks | DB schema, master data seeding, basic CRUD APIs |
| Sprint 2 | 2 weeks | Estimation engine (calculator + API + UI screen) |
| Sprint 3 | 2 weeks | Job management (API + UI + Esko export) |
| Sprint 4 | 1 week | Preflight checklist + artwork status workflow |
| Sprint 5 | 2 weeks | Production log screen (daily shift entry) |
| Sprint 6 | 1 week | Damage log + monthly summary |
| Sprint 7 | 1 week | Inventory + PO management |
| Sprint 8 | 1 week | Warehouse management |
| Sprint 9 | 2 weeks | Analytics dashboard + reports |
| Sprint 10 | 2 weeks | Data migration (Excel import) + parallel run |
| Sprint 11 | 1 week | UAT, bug fixes, go-live |
| **TOTAL** | **~17 weeks** | |

---

## APPENDIX A — Damage Category Definitions

| Code | Label | Description |
|------|-------|-------------|
| DOT_GAIN | Screen Dot Gain More | Dot spread beyond acceptable tolerance |
| CRACKED | Plate Cracked | Physical cracking of old/brittle plate |
| FOLDED | Plate Folded | Plate folded during mounting or demounting |
| PATCH | Patches Showing | Background area showing uneven ink patches |
| LESS_COVERING | Less Covering | Old plate, worn surface, insufficient ink transfer |
| MECHANICAL | Machine Mechanical | Plate damaged by machine auto-stop or anilox contact |
| REGISTER | Register Issue | Plate cut or torn due to register misalignment |
| STICKY | Sticky Surface | Plate surface deteriorated to tacky |
| SIZE_CHANGE | Cylinder Size Change | Repeat/cylinder changed — full new set needed |
| ARTWORK | Artwork Change | Design/specification revision required new plates |
| SHIFT | Machine Shift | Job moved to different machine — plates remade |

---

## APPENDIX B — Plate Type Pricing Reference (from 2025 PO Data)

| Plate Type | Sheet Size | Unit Price (AED) |
|------------|------------|-----------------|
| ACE 120×92 cm | 120×92 cm | 280 |
| ACE 120×76 cm | 120×76 cm | 235 |
| ACE 106.7×152.4 cm | 106.7×152.4 cm | 400 |
| ESX 1524×1067 (1.14mm) | 152.4×106.7 cm | 410 |
| ESE 1524×1067 (1.14mm) | 152.4×106.7 cm | 360 |
| ESE 120×90 cm | 120×90 cm | 285 |
| ASAHI 106.68×152.4 (2.84mm) | 106.68×152.4 cm | 415 |
| ASAHI DSF 120×90 (2.84mm) | 120×90 cm | 270 |
| ASAHI ESX 90×120 (1.14mm) | 90×120 cm | 275 |

*Prices as of 2025 POs — update in Settings → Plate Types when renegotiated.*

---

*End of Implementation Plan — Version 2.0 — April 2026*
*Ready for agent execution. Begin with Phase 1 (DB Schema) and Phase 2.1 (Master Data APIs).*
