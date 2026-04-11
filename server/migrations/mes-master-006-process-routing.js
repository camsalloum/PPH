/**
 * Migration mes-master-006 — Process Routing
 * Creates: mes_product_group_routing
 * Seeds: default process chains per product group (from factory xlsx)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Master Data migration #006 — Process Routing...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_product_group_routing (
        id                    SERIAL PRIMARY KEY,
        product_group_id      INT NOT NULL,
        bom_version_id        INT REFERENCES mes_bom_versions(id) ON DELETE SET NULL,
        process_id            INT NOT NULL REFERENCES mes_processes(id),
        machine_id            INT REFERENCES mes_machines(id),
        sequence_order        INT NOT NULL,

        estimated_speed       DECIMAL(10,2),
        setup_time_min        DECIMAL(8,2),
        waste_pct             DECIMAL(5,2),
        hourly_rate_override  DECIMAL(10,2),

        is_optional           BOOLEAN DEFAULT false,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_product_group_routing — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_routing_pg ON mes_product_group_routing(product_group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_routing_bom ON mes_product_group_routing(bom_version_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_routing_process ON mes_product_group_routing(process_id);`);
    console.log('  ✅ Indexes — created');

    // ── Seed default routing per PG ──
    // Process chains from factory xlsx / Product groups.docx:
    //   Commercial Items Plain:     EXT → SLT → BAG
    //   Commercial Items Printed:   EXT → PRT → REW → SLT → BAG
    //   Industrial Items Plain:     EXT → LAM → SLT → BAG
    //   Industrial Items Printed:   EXT → PRT → LAM → SLT → SEA → DOC → BAG
    //   Laminates:                  EXT → PRT → LAM → SLT → BAG
    //   Mono Layer Printed:         EXT → PRT → SLT → BAG
    //   Shrink Film Plain:          EXT → SLT
    //   Shrink Film Printed:        EXT → PRT → SLT
    //   Shrink Sleeves:             PRT → SLT → SEA → DOC
    //   Wide Film:                  EXT → SLT
    //   Labels:                     PRT → LAM → SLT

    const pgRoutes = {
      1:  ['EXTRUSION', 'SLITTING', 'POUCH_MAKING'],                                                // Commercial Items Plain
      2:  ['EXTRUSION', 'PRINTING', 'REWINDING', 'SLITTING', 'POUCH_MAKING'],                       // Commercial Items Printed
      3:  ['EXTRUSION', 'LAMINATION', 'SLITTING', 'POUCH_MAKING'],                                  // Industrial Items Plain
      4:  ['EXTRUSION', 'PRINTING', 'LAMINATION', 'SLITTING', 'SEAMING', 'DOCTORING', 'POUCH_MAKING'], // Industrial Items Printed
      5:  ['EXTRUSION', 'PRINTING', 'LAMINATION', 'SLITTING', 'POUCH_MAKING'],                      // Laminates
      6:  ['EXTRUSION', 'PRINTING', 'SLITTING', 'POUCH_MAKING'],                                    // Mono Layer Printed
      8:  ['EXTRUSION', 'SLITTING'],                                                                  // Shrink Film Plain
      9:  ['EXTRUSION', 'PRINTING', 'SLITTING'],                                                      // Shrink Film Printed
      10: ['PRINTING', 'SLITTING', 'SEAMING', 'DOCTORING'],                                          // Shrink Sleeves
      11: ['EXTRUSION', 'SLITTING'],                                                                  // Wide Film
      28: ['PRINTING', 'LAMINATION', 'SLITTING'],                                                     // Labels
    };

    // Get process ids by code
    const procRes = await client.query('SELECT id, process_code FROM mes_processes');
    const procMap = {};
    for (const row of procRes.rows) procMap[row.process_code] = row.id;

    let insertCount = 0;
    for (const [pgId, processCodes] of Object.entries(pgRoutes)) {
      for (let i = 0; i < processCodes.length; i++) {
        const processId = procMap[processCodes[i]];
        if (!processId) {
          console.warn(`  ⚠️  Process ${processCodes[i]} not found, skipping for PG ${pgId}`);
          continue;
        }
        await client.query(
          `INSERT INTO mes_product_group_routing (product_group_id, process_id, sequence_order)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [parseInt(pgId), processId, (i + 1) * 10]
        );
        insertCount++;
      }
    }
    console.log(`  ✅ Seed data — ${insertCount} routing steps inserted`);

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-006 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-006 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
