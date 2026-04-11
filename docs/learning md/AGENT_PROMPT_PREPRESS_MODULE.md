# AGENT PROMPT — MES Prepress Module Implementation
## Flexible Packaging Plant — Dubai
## Stack: React + Node.js + PostgreSQL

---

## PROJECT CONTEXT

You are building a **Prepress / Flexo Plate Production module** for an existing MES (Manufacturing Execution System) web application used by a flexible packaging plant in Dubai. The existing MES already has a working backend API and database in Node.js + PostgreSQL.

This module must be integrated as a new route group and React section within the existing app. Do not rebuild what already exists — extend it.

---

## WHAT HAS ALREADY BEEN DONE (DO NOT REDO)

1. **Full implementation plan** is defined — database schema, API routes, React screens, Esko integration, migration plan.
2. **Knowledge base** has been built from the FFTA *Flexography: Principles & Practices* 5th Edition (940 pages) — processed into **77 structured JSON chunks** across 6 volumes stored in `KB_FLEXO/` folder:
   - `KB_VOL1_PROCESS.json` — Flexographic process fundamentals (20 chunks)
   - `KB_VOL2_PREPRESS.json` — Design, Prepress, Color management (15 chunks)
   - `KB_VOL3_ENV_SAFETY.json` — Environment, Safety, Quality Control (7 chunks)
   - `KB_VOL4_PLATES.json` — Printing Plates, CTP, Mounting (13 chunks)
   - `KB_VOL5_INKS_SUBSTRATES.json` — Inks, Substrates, Laminates (12 chunks)
   - `KB_VOL6_PRESSES.json` — Presses, Pressroom Practices, Defects (10 chunks)

Each JSON chunk has this structure:
```json
{
  "id": "V1-001",
  "source": "Flexography: Principles & Practices, 5th Edition — FFTA",
  "volume": 1,
  "chapter": "Introduction",
  "topic": "...",
  "subtopic": "...",
  "tags": ["tag1", "tag2"],
  "app_modules": ["estimation", "job_entry"],
  "trigger_actions": ["user selects substrate in estimation", "..."],
  "ai_use": "Instructions to the AI on HOW to use this chunk",
  "text": "Full knowledge content...",
  "cross_references": ["V1-002", "V4-003"]
}
```

---

## PLANT OPERATIONAL DATA

**Machines (CI presses unless noted):**
- BOBST, M6, FT (stack/inline), CARINT, UTECO, KYMC, HONG YANG

**Plate types and suppliers:**
| Plate | Thickness | Width | Supplier |
|-------|-----------|-------|----------|
| ACE 1.14mm | 1.14mm | 76cm, 92cm, 106.7cm | ANOOP PLASTIC |
| ACE 1.14mm | 1.14mm | 106.7×152.4cm | ANOOP PLASTIC |
| ESX 1.14mm | 1.14mm | 106.7×152.4cm | DYNAGRAPH / CRYSTAL |
| ESE 1.14mm | 1.14mm | 90cm, 106.7cm | DYNAGRAPH |
| FTV 1.14mm | 1.14mm | 106.7cm | DYNAGRAPH |
| FTF 1.14mm | 1.14mm | 106.7cm | DYNAGRAPH |
| ASAHI 2.84mm | 2.84mm | 90×120cm, 106.68×152.4cm | CRYSTAL |
| ASAHI ESX 1.14mm | 1.14mm | 90×120cm | CRYSTAL |
| ASAHI 1.70mm | 1.70mm | 90×106cm | CRYSTAL |

**2025 Plate pricing (AED per sheet):**
ACE 120×92=280, ACE 120×76=235, ACE 106.7×152.4=400, ESX 152.4×106.7=410, ESE 152.4×106.7=360, ESE 120×90=285, ASAHI 106.68×152.4 2.84mm=415, ASAHI 120×90 2.84mm=270, ASAHI ESX 90×120 1.14mm=275

**Production log fields tracked:** DATE, SHIFT (D/S or N/S), ART REF NO, CUSTOMER, JOB NAME, TYPE (F/B, F/P, S/B, T/F), MACHINE, SIZE (cylinder), PRINT (SURFACE/REVERSE), NO. OF COLS, COMPLETED, BALANCE, CYL (circumference mm), plate area columns per type (cm²), TOTAL cm², REMARKS (NEW PRINT/DAMAGE/CHANGES), FAP.NO, PLATE COST, REASON (damage reason text)

**FAP.NO sequence:** Currently at FAP014787 (December 2025). Next = FAP014788.

**Damage categories (standardized):**
DOT_GAIN, CRACKED, FOLDED, PATCH_SHOWING, LESS_COVERING, MECHANICAL, REGISTER, STICKY, SIZE_CHANGE, ARTWORK_CHANGE, SHIFT_MACHINE

---

## REMAINING TASKS TO BUILD

### TASK 1 — pgvector Knowledge Ingestion Pipeline

**File:** `server/services/knowledge/ingestKnowledge.js`

Build a Node.js script that:
1. Reads all 6 JSON files from `KB_FLEXO/` directory
2. For each chunk, generates a text embedding using **OpenAI `text-embedding-3-small`** model (or the embedding model configured in the project)
3. Stores each chunk in a PostgreSQL table using the `pgvector` extension

**Database table to create:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id              SERIAL PRIMARY KEY,
  chunk_id        VARCHAR(20) UNIQUE NOT NULL,
  source          TEXT,
  volume          INTEGER,
  chapter         TEXT,
  topic           TEXT,
  subtopic        TEXT,
  tags            TEXT[],
  app_modules     TEXT[],
  trigger_actions TEXT[],
  ai_use          TEXT,
  text_content    TEXT NOT NULL,
  cross_references TEXT[],
  embedding       vector(1536),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
```

**Ingestion script logic:**
```javascript
// For each chunk:
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: chunk.text  // embed the knowledge text
});
// Store chunk + embedding in knowledge_chunks table
// Use ON CONFLICT (chunk_id) DO UPDATE to allow re-runs
```

Run with: `node server/services/knowledge/ingestKnowledge.js`

---

### TASK 2 — RAG Query Engine Middleware

**File:** `server/services/knowledge/ragEngine.js`

Build the function called before every AI response in the app:

```javascript
async function retrieveRelevantKnowledge(userContext) {
  // userContext = { module, userInput, currentData, triggerAction }
  
  // 1. Create embedding of the user's current context
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: buildContextString(userContext)
  });

  // 2. Semantic search against pgvector — retrieve top 5 chunks
  const results = await db.query(`
    SELECT chunk_id, topic, ai_use, text_content,
           1 - (embedding <=> $1) AS similarity
    FROM knowledge_chunks
    WHERE app_modules @> $2::text[]  -- filter by relevant module
    ORDER BY embedding <=> $1
    LIMIT 5
  `, [pgvector.toSql(queryEmbedding), [userContext.module]]);

  return results.rows;
}

async function buildAIPrompt(userContext, retrievedChunks, systemPrompt) {
  const knowledgeContext = retrievedChunks
    .map(c => `[${c.topic}]\n${c.ai_use}\n\n${c.text_content}`)
    .join('\n\n---\n\n');

  return {
    system: systemPrompt,
    knowledge: knowledgeContext,
    user: userContext.userInput
  };
}
```

**Export:** `{ retrieveRelevantKnowledge, buildAIPrompt }`

---

### TASK 3 — Database Schema

**File:** `server/db/migrations/prepress_schema.sql`

Execute the following schema additions to the existing PostgreSQL database. All tables are prefixed with `pp_` to avoid conflicts with existing tables.

```sql
-- Master data
CREATE TABLE pp_machines (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20) UNIQUE NOT NULL,
  name            VARCHAR(100) NOT NULL,
  press_type      VARCHAR(20), -- CI, STACK, INLINE, SPECIALTY
  max_web_width_mm NUMERIC(8,2),
  gear_pitch_mm   NUMERIC(6,4),
  min_repeat_mm   NUMERIC(8,2),
  max_repeat_mm   NUMERIC(8,2),
  max_colors      INTEGER DEFAULT 8,
  undercut_mm     NUMERIC(6,3),
  active          BOOLEAN DEFAULT TRUE,
  notes           TEXT
);

CREATE TABLE pp_cylinder_repeats (
  id              SERIAL PRIMARY KEY,
  machine_id      INTEGER REFERENCES pp_machines(id),
  repeat_mm       NUMERIC(8,2) NOT NULL,
  tooth_count     INTEGER,
  available       BOOLEAN DEFAULT TRUE,
  UNIQUE (machine_id, repeat_mm)
);

CREATE TABLE pp_suppliers (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20) UNIQUE NOT NULL,
  name            VARCHAR(150) NOT NULL,
  contact_name    VARCHAR(100),
  phone           VARCHAR(30),
  email           VARCHAR(100),
  payment_terms   VARCHAR(50),
  lead_time_days  INTEGER,
  active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE pp_plate_types (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30) UNIQUE NOT NULL,
  brand           VARCHAR(50),
  series          VARCHAR(20),
  thickness_mm    NUMERIC(4,2) NOT NULL,
  width_cm        NUMERIC(6,2),
  height_cm       NUMERIC(6,2),
  unit_price_aed  NUMERIC(10,2),
  supplier_id     INTEGER REFERENCES pp_suppliers(id),
  dot_type        VARCHAR(20), -- ROUND_TOP, FLAT_TOP
  washout_type    VARCHAR(20), -- SOLVENT, WATER, THERMAL
  active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE pp_customers (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(30) UNIQUE,
  name            VARCHAR(200) NOT NULL,
  country         VARCHAR(50),
  contact_name    VARCHAR(100),
  email           VARCHAR(100),
  phone           VARCHAR(30),
  active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE pp_press_characterization (
  id              SERIAL PRIMARY KEY,
  machine_id      INTEGER REFERENCES pp_machines(id),
  substrate_type  VARCHAR(50),
  ink_type        VARCHAR(30),
  anilox_bcm      NUMERIC(6,2),
  tvi_25          NUMERIC(5,2),
  tvi_50          NUMERIC(5,2),
  tvi_75          NUMERIC(5,2),
  cutback_curve   JSONB,
  icc_profile     VARCHAR(200),
  notes           TEXT,
  characterized_date DATE,
  active          BOOLEAN DEFAULT TRUE
);

-- Inventory
CREATE TABLE pp_plate_stock (
  id              SERIAL PRIMARY KEY,
  plate_type_id   INTEGER REFERENCES pp_plate_types(id) UNIQUE,
  qty_in_hand     INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER DEFAULT 12,
  reorder_qty     INTEGER DEFAULT 24,
  last_updated    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pp_purchase_orders (
  id              SERIAL PRIMARY KEY,
  po_number       VARCHAR(50) UNIQUE NOT NULL,
  supplier_id     INTEGER REFERENCES pp_suppliers(id),
  po_date         DATE NOT NULL,
  delivery_date   DATE,
  status          VARCHAR(20) DEFAULT 'OPEN',
  total_amount_aed NUMERIC(12,2),
  notes           TEXT,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pp_purchase_order_lines (
  id              SERIAL PRIMARY KEY,
  po_id           INTEGER REFERENCES pp_purchase_orders(id),
  plate_type_id   INTEGER REFERENCES pp_plate_types(id),
  item_code       VARCHAR(50),
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER DEFAULT 0,
  unit_price_aed  NUMERIC(10,2)
);

CREATE TABLE pp_stock_movements (
  id              SERIAL PRIMARY KEY,
  plate_type_id   INTEGER REFERENCES pp_plate_types(id),
  movement_type   VARCHAR(20) NOT NULL, -- IN, OUT, ADJUSTMENT
  quantity        INTEGER NOT NULL,
  reference_type  VARCHAR(30),
  reference_id    INTEGER,
  notes           TEXT,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Estimation
CREATE TABLE pp_estimations (
  id                  SERIAL PRIMARY KEY,
  estimate_ref        VARCHAR(30) UNIQUE NOT NULL,
  customer_id         INTEGER REFERENCES pp_customers(id),
  art_ref             VARCHAR(50),
  job_description     TEXT,
  design_width_mm     NUMERIC(8,2),
  design_height_mm    NUMERIC(8,2),
  machine_id          INTEGER REFERENCES pp_machines(id),
  substrate_type      VARCHAR(50),
  job_type            VARCHAR(10),
  print_direction     VARCHAR(10),
  reel_width_mm       NUMERIC(8,2),
  usable_width_mm     NUMERIC(8,2),
  ups_across          INTEGER,
  cylinder_repeat_id  INTEGER REFERENCES pp_cylinder_repeats(id),
  chosen_repeat_mm    NUMERIC(8,2),
  ups_around          INTEGER,
  total_ups           INTEGER,
  waste_pct           NUMERIC(5,2),
  distortion_factor   NUMERIC(8,6),
  compensated_repeat_mm NUMERIC(8,2),
  plate_type_id       INTEGER REFERENCES pp_plate_types(id),
  num_colors          INTEGER,
  plate_area_cm2      NUMERIC(10,2),
  cost_per_color_aed  NUMERIC(10,2),
  total_cost_aed      NUMERIC(12,2),
  status              VARCHAR(20) DEFAULT 'DRAFT',
  notes               TEXT,
  created_by          INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pp_estimation_colors (
  id                  SERIAL PRIMARY KEY,
  estimation_id       INTEGER REFERENCES pp_estimations(id),
  color_number        INTEGER NOT NULL,
  color_name          VARCHAR(50),
  color_type          VARCHAR(20),
  plate_type_id       INTEGER REFERENCES pp_plate_types(id),
  plate_area_cm2      NUMERIC(10,2),
  unit_cost_aed       NUMERIC(10,2),
  is_common           BOOLEAN DEFAULT FALSE,
  common_from_art_ref VARCHAR(50)
);

-- Jobs
CREATE TABLE pp_jobs (
  id                  SERIAL PRIMARY KEY,
  fap_no              VARCHAR(20) UNIQUE NOT NULL,
  art_ref             VARCHAR(50) NOT NULL,
  estimation_id       INTEGER REFERENCES pp_estimations(id),
  customer_id         INTEGER REFERENCES pp_customers(id),
  job_name            TEXT NOT NULL,
  job_type            VARCHAR(10),
  machine_id          INTEGER REFERENCES pp_machines(id),
  cylinder_repeat_id  INTEGER REFERENCES pp_cylinder_repeats(id),
  print_direction     VARCHAR(10),
  num_colors          INTEGER,
  shift               VARCHAR(5),
  job_date            DATE,
  artwork_status      VARCHAR(30) DEFAULT 'AWAITING',
  customer_approved   BOOLEAN DEFAULT FALSE,
  esko_status         VARCHAR(20) DEFAULT 'PENDING',
  esko_sent_at        TIMESTAMPTZ,
  esko_done_at        TIMESTAMPTZ,
  status              VARCHAR(20) DEFAULT 'NEW',
  remarks             VARCHAR(30),
  completed_colors    INTEGER DEFAULT 0,
  balance_colors      INTEGER,
  plate_cost_aed      NUMERIC(12,2),
  cost_note           VARCHAR(50),
  infor_user          VARCHAR(10),
  notes               TEXT,
  created_by          INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pp_job_colors (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER REFERENCES pp_jobs(id),
  color_number        INTEGER NOT NULL,
  color_name          VARCHAR(50),
  color_type          VARCHAR(20),
  plate_type_id       INTEGER REFERENCES pp_plate_types(id),
  plate_area_cm2      NUMERIC(10,2),
  is_common           BOOLEAN DEFAULT FALSE,
  common_from_art_ref VARCHAR(50),
  esko_file_ref       VARCHAR(100),
  plate_status        VARCHAR(20) DEFAULT 'PENDING'
);

CREATE TABLE pp_job_esko_params (
  id                  SERIAL PRIMARY KEY,
  job_id              INTEGER REFERENCES pp_jobs(id) UNIQUE,
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
  pin_register        BOOLEAN DEFAULT TRUE,
  exported_at         TIMESTAMPTZ
);

-- Production
CREATE TABLE pp_production_logs (
  id                  SERIAL PRIMARY KEY,
  log_date            DATE NOT NULL,
  shift               VARCHAR(5) NOT NULL,
  job_id              INTEGER REFERENCES pp_jobs(id),
  fap_no              VARCHAR(20),
  art_ref             VARCHAR(50),
  customer_id         INTEGER REFERENCES pp_customers(id),
  machine_id          INTEGER REFERENCES pp_machines(id),
  cylinder_mm         NUMERIC(8,2),
  num_colors          INTEGER,
  completed_colors    INTEGER,
  balance_colors      INTEGER,
  total_area_cm2      NUMERIC(12,2),
  plate_cost_aed      NUMERIC(12,2),
  remarks             VARCHAR(30),
  reason              TEXT,
  logged_by           INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pp_production_log_plates (
  id                  SERIAL PRIMARY KEY,
  log_id              INTEGER REFERENCES pp_production_logs(id),
  plate_type_id       INTEGER REFERENCES pp_plate_types(id),
  area_cm2            NUMERIC(10,2)
);

CREATE TABLE pp_damage_log (
  id                  SERIAL PRIMARY KEY,
  log_id              INTEGER REFERENCES pp_production_logs(id),
  job_id              INTEGER REFERENCES pp_jobs(id),
  machine_id          INTEGER REFERENCES pp_machines(id),
  log_date            DATE NOT NULL,
  num_plates_damaged  INTEGER DEFAULT 1,
  plate_type_id       INTEGER REFERENCES pp_plate_types(id),
  area_cm2            NUMERIC(10,2),
  damage_category     VARCHAR(50),
  damage_reason       TEXT,
  color_name          VARCHAR(50),
  replacement_cost_aed NUMERIC(10,2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Warehouse
CREATE TABLE pp_plate_warehouse (
  id                  SERIAL PRIMARY KEY,
  fap_no              VARCHAR(20),
  art_ref             VARCHAR(50),
  customer_id         INTEGER REFERENCES pp_customers(id),
  machine_id          INTEGER REFERENCES pp_machines(id),
  num_plates          INTEGER,
  location_bin        VARCHAR(30),
  status              VARCHAR(20) DEFAULT 'STORED',
  last_used_date      DATE,
  stored_date         DATE,
  review_due_date     DATE,
  disposed_date       DATE,
  disposal_reason     TEXT,
  notes               TEXT,
  updated_by          INTEGER,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

### TASK 4 — Master Data Seeding

**File:** `server/db/seeds/prepress_seed.js`

Seed the database with your actual operational data:

**Machines:**
```javascript
const machines = [
  { code: 'BOBST', name: 'BOBST CI Press', press_type: 'CI', max_web_width_mm: 1100, gear_pitch_mm: 6.35, active: true },
  { code: 'M6', name: 'M6 CI Press', press_type: 'CI', max_web_width_mm: 800, gear_pitch_mm: 6.35, active: true },
  { code: 'FT', name: 'FT/Ftech Press', press_type: 'STACK', max_web_width_mm: 800, gear_pitch_mm: 6.35, active: true },
  { code: 'CARINT', name: 'CARINT CI Press', press_type: 'CI', max_web_width_mm: 1200, gear_pitch_mm: 6.35, active: true },
  { code: 'UTECO', name: 'UTECO CI Press', press_type: 'CI', max_web_width_mm: 1000, gear_pitch_mm: 6.35, active: true },
  { code: 'KYMC', name: 'KYMC CI Press', press_type: 'CI', max_web_width_mm: 900, gear_pitch_mm: 6.35, active: true },
  { code: 'HONG_YANG', name: 'HONG YANG Specialty', press_type: 'SPECIALTY', max_web_width_mm: 600, gear_pitch_mm: 6.35, active: true },
];
```

**Suppliers:**
```javascript
const suppliers = [
  { code: 'DYNAGRAPH', name: 'DYNAGRAPH FOR PRINTING INDUSTRY LLC', lead_time_days: 7 },
  { code: 'ANOOP', name: 'ANOOP PLASTIC PRODUCTS TRD. EST', lead_time_days: 7 },
  { code: 'CRYSTAL', name: 'CRYSTAL TRADING EST.', lead_time_days: 7 },
];
```

**Plate types** — use pricing table from context above.

---

### TASK 5 — Backend API Routes

**Base path:** `/api/prepress/`

**Files to create:**
```
server/routes/prepress/
  inventory.js      → GET/POST stock, POs, movements, alerts
  estimation.js     → POST calculate, CRUD estimates, convert to job
  jobs.js           → CRUD jobs, artwork status, Esko export, FAP sequence
  production.js     → CRUD production logs, shift entry, monthly summary
  damage.js         → CRUD damage log, by-machine report
  warehouse.js      → CRUD warehouse, review queue
  reports.js        → All analytics and reporting endpoints
  machines.js       → Machine and cylinder repeat configuration
```

**Register in main app:**
```javascript
app.use('/api/prepress/inventory', require('./routes/prepress/inventory'));
app.use('/api/prepress/estimations', require('./routes/prepress/estimation'));
// ... etc
```

**FAP number generation:**
```javascript
async function getNextFapNo(db) {
  const result = await db.query(
    `SELECT fap_no FROM pp_jobs ORDER BY id DESC LIMIT 1`
  );
  const last = parseInt(result.rows[0]?.fap_no?.replace('FAP', '') || '14787');
  return `FAP${String(last + 1).padStart(6, '0')}`;
}
```

---

### TASK 6 — Estimation Engine

**File:** `server/services/prepress/estimationEngine.js`

This is the most critical business logic in the module. Implement exactly as follows:

```javascript
function calculateEstimation({ machineId, designWidthMm, designHeightMm,
  reelWidthMm, numColors, plateTypeId, db }) {

  // Step 1: Fetch machine and plate data
  // Step 2: Calculate usable web width (reel width minus 20mm edge trim)
  const usableWidth = reelWidthMm - 20;

  // Step 3: Ups across
  const upsAcross = Math.floor(usableWidth / designWidthMm);

  // Step 4: Get available cylinder repeats for machine, sorted ascending
  // Filter to repeats >= designHeightMm

  // Step 5: For each candidate repeat, calculate:
  //   upsAround = Math.floor(repeat / designHeightMm)
  //   wastePct = ((repeat - upsAround * designHeightMm) / repeat) * 100
  //   totalUps = upsAcross * upsAround
  // Select best repeat = highest totalUps; if tie, lowest waste

  // Step 6: Distortion compensation
  //   DCF = 1 - (2 * Math.PI * plateThicknessMm / chosenRepeatMm)
  //   compensatedRepeat = designHeightMm * DCF (pre-shrunk height for Esko)

  // Step 7: Plate area per color
  //   plateAreaCm2 = (upsAcross * designWidthMm / 10) * (chosenRepeatMm / 10)

  // Step 8: Cost per color
  //   costPerColor = plateAreaCm2 * plateType.price_per_cm2

  return {
    upsAcross, upsAround, totalUps,
    chosenRepeatMm, wastePct,
    distortionFactor: (2 * Math.PI * plateThicknessMm / chosenRepeatMm),
    compensatedRepeatMm,
    plateAreaCm2,
    costPerColor,
    totalCostAed: costPerColor * numColors,
    alternativeRepeats // top 3 options for user to choose from
  };
}
```

---

### TASK 7 — AI Service Layer

**File:** `server/services/ai/prepressAI.js`

This service connects the RAG engine to specific AI touch points in the module:

```javascript
const { retrieveRelevantKnowledge, buildAIPrompt } = require('../knowledge/ragEngine');

// Touch point 1: Estimation validation
async function validateEstimation(estimationData) {
  const context = {
    module: 'estimation',
    userInput: JSON.stringify(estimationData),
    triggerAction: 'user completes estimation form'
  };
  const chunks = await retrieveRelevantKnowledge(context);
  // Call Claude API with knowledge context
  // Return: { warnings: [], suggestions: [], missingCosts: [] }
}

// Touch point 2: Job preflight check
async function runPreflightCheck(jobData) {
  const context = {
    module: 'prepress_checklist',
    userInput: JSON.stringify(jobData),
    triggerAction: 'user submits job for preflight'
  };
  const chunks = await retrieveRelevantKnowledge(context);
  // Return structured checklist results: { passed: [], failed: [], warnings: [] }
}

// Touch point 3: Damage diagnosis
async function diagnoseDamage(damageEntry) {
  const context = {
    module: 'damage_log',
    userInput: `Machine: ${damageEntry.machine}, Reason: ${damageEntry.reason}, Plate: ${damageEntry.plateType}`,
    triggerAction: 'user logs plate damage'
  };
  const chunks = await retrieveRelevantKnowledge(context);
  // Return: { rootCause: string, category: string, preventionAdvice: string }
}

// Touch point 4: Knowledge chat
async function answerKnowledgeQuery(userQuestion, currentModule) {
  const context = {
    module: currentModule,
    userInput: userQuestion,
    triggerAction: 'user asks knowledge question'
  };
  const chunks = await retrieveRelevantKnowledge(context);
  // Return: { answer: string, sources: string[] }
}

module.exports = { validateEstimation, runPreflightCheck, diagnoseDamage, answerKnowledgeQuery };
```

**Claude API call pattern:**
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

async function callClaude(systemPrompt, knowledgeContext, userMessage) {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: `${systemPrompt}\n\n## DOMAIN KNOWLEDGE\n${knowledgeContext}`,
    messages: [{ role: 'user', content: userMessage }]
  });
  return response.content[0].text;
}
```

---

### TASK 8 — Data Migration

**File:** `server/db/migrations/importExcelData.js`

Import 2025 historical data from:
- `FLEXO_PLATE_LOG_2025.xlsx` — 12 monthly sheets (1,600+ production log entries)
- `Flexo_Plates_Order_2025.xlsx` — 3 supplier sheets (PO records)

```javascript
const xlsx = require('xlsx');

async function importProductionLog(filePath) {
  const workbook = xlsx.readFile(filePath);
  const months = ['JAN', 'FEB', 'MARCH', 'APRIL', 'MAY', 'JUN',
                  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  for (const month of months) {
    const sheet = workbook.Sheets[month];
    if (!sheet) continue;
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (const row of rows) {
      // Map Excel columns to pp_production_logs table
      // Handle: DATE, SHIFT, ART REF NO, CUSTOMER, JOB NAME, TYPE,
      //         MACHINE, SIZE, PRINT, NO. OF COLS, COMPLETED, BALANCE,
      //         CYL, plate area columns, TOTAL cm², REMARKS, FAP.NO,
      //         PLATE COST, REASON
      // Skip empty rows (check for null FAP.NO)
      // Resolve customer_id from pp_customers by name
      // Resolve machine_id from pp_machines by code
    }
  }
}

async function importPurchaseOrders(filePath) {
  const workbook = xlsx.readFile(filePath);
  const supplierSheets = ['DYNAGRAPH', 'ANOOP PLASTIC', 'CRYSTAL'];
  // Map PO records to pp_purchase_orders + pp_purchase_order_lines
  // Map supplier sheet name to supplier code
}
```

---

### TASK 9 — React Frontend

**Base path:** `client/src/modules/prepress/`

**Route structure:**
```
/prepress                     → Dashboard (KPI cards + charts)
/prepress/estimation/new      → New estimation form
/prepress/estimation/:id      → View/edit estimation
/prepress/estimation          → Estimation list
/prepress/jobs                → Job board
/prepress/jobs/:id            → Job detail + status tracker
/prepress/inventory           → Stock levels + PO management
/prepress/production          → Shift log entry
/prepress/damage              → Damage log + monthly summary table
/prepress/warehouse           → Plate shelf + review queue
/prepress/settings            → Machines, plate types, suppliers
```

**Key UI components to build:**

1. **EstimationCalculator** — real-time imposition calculator panel that updates as user types design dimensions, showing: ups across, ups around, total ups, chosen repeat, waste %, distortion factor, plate area, cost per color, TOTAL COST.

2. **JobStatusTracker** — horizontal stepper:
`ESTIMATION → ARTWORK → PREFLIGHT → APPROVED → ESKO SENT → PLATES READY → MOUNTED → IN PRODUCTION → COMPLETED`

3. **ProductionLogEntry** — shift-based entry form mirroring the Excel structure, with: job lookup by FAP.NO, auto-fill of plate type fields based on job, REMARKS radio buttons (NEW PRINT / DAMAGE / CHANGES), conditional REASON field.

4. **DamageMonthlyMatrix** — replicates the Excel "Plate Damage" tab:
```
         JAN  FEB  MAR ... DEC  TOTAL
BOBST     30   16   22       X    XXX
M6        14   18   14       X    XXX
FT        18   20   16       X    XXX
CARINT     2    3    6       X    XXX
UTECO      0    5    2       X    XXX
TOTAL     64   62   60       X    846
```

5. **AIAssistantPanel** — floating chat widget available on every screen. Accepts natural language questions, calls `/api/prepress/ai/chat`, streams response with knowledge source attribution.

6. **EstimationWarningsPanel** — shown after estimation is calculated, displays AI-generated warnings: missing cost items, plate type mismatches, ink system flags, substrate-specific requirements.

---

### TASK 10 — API Endpoints for AI Touch Points

**File:** `server/routes/prepress/ai.js`

```javascript
router.post('/validate-estimation', async (req, res) => {
  const result = await prepressAI.validateEstimation(req.body);
  res.json(result);
});

router.post('/preflight', async (req, res) => {
  const result = await prepressAI.runPreflightCheck(req.body);
  res.json(result);
});

router.post('/diagnose-damage', async (req, res) => {
  const result = await prepressAI.diagnoseDamage(req.body);
  res.json(result);
});

router.post('/chat', async (req, res) => {
  const { question, module } = req.body;
  // Stream response using Claude streaming API
  const result = await prepressAI.answerKnowledgeQuery(question, module);
  res.json(result);
});

router.post('/analyze-damage-patterns', async (req, res) => {
  // Pull last 3 months damage data from DB
  // Pass to AI with knowledge context for pattern analysis
  // Return: patterns identified, root causes, recommendations
});
```

---

## IMPORTANT RULES FOR THE AGENT

1. **All new tables are prefixed `pp_`** to avoid conflicts with existing MES tables.

2. **All new API routes are under `/api/prepress/`** — do not modify existing routes.

3. **The knowledge base is read-only** — the JSON files and pgvector table are never modified by the app. They are only read during RAG retrieval.

4. **The distortion formula is:**
   `DCF = 1 - (2π × plateThicknessMm / cylinderCircumferenceMm)`
   The Esko compensated repeat = `designHeightMm × DCF` (pre-shrunk value sent to Esko CDI).

5. **FAP.NO format:** always `FAP` + 6-digit zero-padded integer. Current last = FAP014787. Next = FAP014788.

6. **Damage categories** must use the standardized enum:
   `DOT_GAIN | CRACKED | FOLDED | PATCH_SHOWING | LESS_COVERING | MECHANICAL | REGISTER | STICKY | SIZE_CHANGE | ARTWORK_CHANGE | SHIFT_MACHINE`

7. **Claude API model:** use `claude-opus-4-5` for the AI service layer.

8. **Embedding model:** use `text-embedding-3-small` (1536 dimensions) for pgvector.

9. **The estimation engine must return alternative repeat options** (top 3 by efficiency) so the user can choose, not just the single best option.

10. **Every AI response must include source attribution** — which knowledge chunk IDs were used so the user can trace the reasoning.

---

## FILE STRUCTURE EXPECTED

```
project/
├── KB_FLEXO/
│   ├── KB_VOL1_PROCESS.json
│   ├── KB_VOL2_PREPRESS.json
│   ├── KB_VOL3_ENV_SAFETY.json
│   ├── KB_VOL4_PLATES.json
│   ├── KB_VOL5_INKS_SUBSTRATES.json
│   └── KB_VOL6_PRESSES.json
├── server/
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── prepress_schema.sql
│   │   │   └── importExcelData.js
│   │   └── seeds/
│   │       └── prepress_seed.js
│   ├── routes/
│   │   └── prepress/
│   │       ├── inventory.js
│   │       ├── estimation.js
│   │       ├── jobs.js
│   │       ├── production.js
│   │       ├── damage.js
│   │       ├── warehouse.js
│   │       ├── reports.js
│   │       ├── machines.js
│   │       └── ai.js
│   └── services/
│       ├── knowledge/
│       │   ├── ingestKnowledge.js
│       │   └── ragEngine.js
│       └── prepress/
│           ├── estimationEngine.js
│           └── prepressAI.js
└── client/
    └── src/
        └── modules/
            └── prepress/
                ├── Dashboard.jsx
                ├── estimation/
                ├── jobs/
                ├── production/
                ├── damage/
                ├── inventory/
                ├── warehouse/
                ├── settings/
                └── components/
                    ├── EstimationCalculator.jsx
                    ├── JobStatusTracker.jsx
                    ├── ProductionLogEntry.jsx
                    ├── DamageMonthlyMatrix.jsx
                    ├── AIAssistantPanel.jsx
                    └── EstimationWarningsPanel.jsx
```

---

## BUILD ORDER

Build in this exact sequence to avoid dependency issues:

1. `prepress_schema.sql` — create all tables
2. `prepress_seed.js` — seed master data (machines, suppliers, plate types)
3. `ingestKnowledge.js` — ingest KB JSON files into pgvector
4. `ragEngine.js` — RAG query middleware
5. `estimationEngine.js` — core business logic
6. `prepressAI.js` — AI touch point service
7. All API route files under `server/routes/prepress/`
8. `importExcelData.js` — migrate historical data
9. React frontend module
10. Integration testing

---

*End of Agent Prompt — Version 1.0 — April 2026*
