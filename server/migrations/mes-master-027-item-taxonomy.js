/**
 * Migration: mes-master-027-item-taxonomy
 *
 * Creates user-governed taxonomy tables for Item Master domains,
 * categories, subcategories, and DB item mappings.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const DOMAIN_SEEDS = [
  { domain_key: 'resin', display_name: 'Resins', sort_order: 10 },
  { domain_key: 'substrate', display_name: 'Substrates', sort_order: 20 },
];

const CATEGORY_SEEDS = [
  { domain_key: 'resin', internal_key: 'random_pp', display_name: 'Random PP', sort_order: 10 },
  { domain_key: 'resin', internal_key: 'hdpe', display_name: 'HDPE', sort_order: 20 },
  { domain_key: 'resin', internal_key: 'ldpe', display_name: 'LDPE', sort_order: 30 },
  { domain_key: 'resin', internal_key: 'lldpe', display_name: 'LLDPE', sort_order: 40 },
  { domain_key: 'resin', internal_key: 'mlldpe', display_name: 'mLLDPE', sort_order: 50 },
  { domain_key: 'resin', internal_key: 'film_scrap_regrind_clear', display_name: 'Film Scrap / Regrind Clear', sort_order: 60 },
  { domain_key: 'resin', internal_key: 'film_scrap_regrind_printed', display_name: 'Film Scrap / Regrind Printed', sort_order: 70 },

  { domain_key: 'substrate', internal_key: 'aluminium_foil', display_name: 'Aluminium Foil', sort_order: 10 },
  { domain_key: 'substrate', internal_key: 'bopp', display_name: 'BOPP', sort_order: 20 },
  { domain_key: 'substrate', internal_key: 'cpp', display_name: 'CPP', sort_order: 30 },
  { domain_key: 'substrate', internal_key: 'pa', display_name: 'PA', sort_order: 40 },
  { domain_key: 'substrate', internal_key: 'alu_pap', display_name: 'Alu/Pap', sort_order: 50 },
  { domain_key: 'substrate', internal_key: 'pap', display_name: 'PAP', sort_order: 60 },
  { domain_key: 'substrate', internal_key: 'pe', display_name: 'PE', sort_order: 70 },
  { domain_key: 'substrate', internal_key: 'pet', display_name: 'PET', sort_order: 80 },
  { domain_key: 'substrate', internal_key: 'petc', display_name: 'PETC', sort_order: 90 },
  { domain_key: 'substrate', internal_key: 'petg', display_name: 'PETG', sort_order: 100 },
  { domain_key: 'substrate', internal_key: 'pvc', display_name: 'PVC', sort_order: 110 },
];

const SUBCATEGORY_SEEDS = [
  { domain_key: 'substrate', category_key: 'aluminium_foil', internal_key: 'plain_aluminium_foil', display_name: 'Plain Aluminium Foil', sort_order: 10 },

  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_hs_regular', display_name: 'BOPP Transparent HS Regular', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_nhs_regular', display_name: 'BOPP Transparent NHS Regular', sort_order: 20 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_hs_low_sit', display_name: 'BOPP Transparent HS Low SIT', sort_order: 30 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_white_label_grade', display_name: 'BOPP White Label Grade', sort_order: 40 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_label_grade', display_name: 'BOPP Transparent Label Grade', sort_order: 50 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_matt_hs', display_name: 'BOPP Transparent Matt HS', sort_order: 60 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_metalized_hs_regular', display_name: 'BOPP Metalized HS Regular', sort_order: 70 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_metalized_hs_high_barrier', display_name: 'BOPP Metalized HS High Barrier', sort_order: 80 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_white_pearlised', display_name: 'BOPP White Pearlised', sort_order: 90 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_white_iml_speciality', display_name: 'BOPP White IML/Speciality', sort_order: 100 },
  { domain_key: 'substrate', category_key: 'bopp', internal_key: 'bopp_transparent_iml_speciality', display_name: 'BOPP Transparent IML/Speciality', sort_order: 110 },

  { domain_key: 'substrate', category_key: 'cpp', internal_key: 'cpp_transparent_hs', display_name: 'CPP Transparent HS', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'cpp', internal_key: 'cpp_metalized_hs', display_name: 'CPP Metalized HS', sort_order: 20 },

  { domain_key: 'substrate', category_key: 'pa', internal_key: 'polyamide', display_name: 'Polyamide', sort_order: 10 },

  { domain_key: 'substrate', category_key: 'alu_pap', internal_key: 'butter_foil', display_name: 'Butter Foil', sort_order: 10 },

  { domain_key: 'substrate', category_key: 'pap', internal_key: 'greaseproof_paper', display_name: 'Greaseproof Paper', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'pap', internal_key: 'kraft_paper', display_name: 'Kraft Paper', sort_order: 20 },
  { domain_key: 'substrate', category_key: 'pap', internal_key: 'coated_paper', display_name: 'Coated Paper', sort_order: 30 },
  { domain_key: 'substrate', category_key: 'pap', internal_key: 'coated_paper_pe', display_name: 'Coated Paper-PE', sort_order: 40 },
  { domain_key: 'substrate', category_key: 'pap', internal_key: 'twist_wrap_paper', display_name: 'Twist Wrap Paper', sort_order: 50 },

  { domain_key: 'substrate', category_key: 'pe', internal_key: 'pe_lamination', display_name: 'PE Lamination', sort_order: 10 },

  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_matt_nf_chemtr', display_name: 'PET Matt NF ChemTr.', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_metalized_nf_hb', display_name: 'PET Metalized NF HB', sort_order: 20 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_metalized_nf_nb', display_name: 'PET Metalized NF NB', sort_order: 30 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_metalized_hf_nb', display_name: 'PET Metalized HF NB', sort_order: 40 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_transparent_nf_nb_chemtr', display_name: 'PET Transparent NF NB ChemTr.', sort_order: 50 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_transparent_twist', display_name: 'PET Transparent Twist', sort_order: 60 },
  { domain_key: 'substrate', category_key: 'pet', internal_key: 'pet_adhesive_film', display_name: 'PET Adhesive Film', sort_order: 70 },

  { domain_key: 'substrate', category_key: 'petc', internal_key: 'pet_c_shrink', display_name: 'PET-C Shrink', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'petg', internal_key: 'pet_g_shrink', display_name: 'PET-G Shrink', sort_order: 10 },
  { domain_key: 'substrate', category_key: 'pvc', internal_key: 'pvc_blow_shrink', display_name: 'PVC Blow Shrink', sort_order: 10 },
];

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_taxonomy_domains (
        id            SERIAL PRIMARY KEY,
        domain_key    VARCHAR(60) NOT NULL UNIQUE,
        display_name  VARCHAR(120) NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 100,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_by    INTEGER,
        updated_by    INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_taxonomy_categories (
        id            SERIAL PRIMARY KEY,
        domain_id     INTEGER NOT NULL REFERENCES mes_item_taxonomy_domains(id) ON DELETE CASCADE,
        internal_key  VARCHAR(120) NOT NULL,
        display_name  VARCHAR(180) NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 100,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_by    INTEGER,
        updated_by    INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_mes_item_taxonomy_categories_key UNIQUE (domain_id, internal_key)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_taxonomy_subcategories (
        id            SERIAL PRIMARY KEY,
        category_id   INTEGER NOT NULL REFERENCES mes_item_taxonomy_categories(id) ON DELETE CASCADE,
        internal_key  VARCHAR(140) NOT NULL,
        display_name  VARCHAR(220) NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 100,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_by    INTEGER,
        updated_by    INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_mes_item_taxonomy_subcategories_key UNIQUE (category_id, internal_key)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_taxonomy_mappings (
        id                       SERIAL PRIMARY KEY,
        domain_id                INTEGER NOT NULL REFERENCES mes_item_taxonomy_domains(id) ON DELETE CASCADE,
        category_id              INTEGER NOT NULL REFERENCES mes_item_taxonomy_categories(id) ON DELETE CASCADE,
        subcategory_id           INTEGER REFERENCES mes_item_taxonomy_subcategories(id) ON DELETE CASCADE,
        source_system            VARCHAR(40) NOT NULL DEFAULT 'rm_sync',
        source_item_key          TEXT NOT NULL,
        source_item_label        TEXT,
        is_active                BOOLEAN NOT NULL DEFAULT true,
        created_by               INTEGER,
        updated_by               INTEGER,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_item_taxonomy_domains_active_name
      ON mes_item_taxonomy_domains (is_active, LOWER(display_name))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_item_taxonomy_categories_domain_active_name
      ON mes_item_taxonomy_categories (domain_id, is_active, LOWER(display_name))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_item_taxonomy_subcategories_category_active_name
      ON mes_item_taxonomy_subcategories (category_id, is_active, LOWER(display_name))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_item_taxonomy_mappings_lookup
      ON mes_item_taxonomy_mappings (category_id, subcategory_id, source_system, is_active)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mes_item_taxonomy_mappings_active
      ON mes_item_taxonomy_mappings (
        category_id,
        COALESCE(subcategory_id, 0),
        source_system,
        LOWER(TRIM(source_item_key))
      )
      WHERE is_active = true
    `);

    for (const seed of DOMAIN_SEEDS) {
      await client.query(
        `INSERT INTO mes_item_taxonomy_domains (domain_key, display_name, sort_order, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (domain_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_at = NOW()`,
        [seed.domain_key, seed.display_name, seed.sort_order]
      );
    }

    for (const seed of CATEGORY_SEEDS) {
      const domainRes = await client.query(
        `SELECT id FROM mes_item_taxonomy_domains WHERE domain_key = $1 LIMIT 1`,
        [seed.domain_key]
      );
      if (!domainRes.rows.length) continue;

      await client.query(
        `INSERT INTO mes_item_taxonomy_categories (domain_id, internal_key, display_name, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (domain_id, internal_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_at = NOW()`,
        [domainRes.rows[0].id, seed.internal_key, seed.display_name, seed.sort_order]
      );
    }

    for (const seed of SUBCATEGORY_SEEDS) {
      const catRes = await client.query(
        `SELECT c.id
         FROM mes_item_taxonomy_categories c
         JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
         WHERE d.domain_key = $1 AND c.internal_key = $2
         LIMIT 1`,
        [seed.domain_key, seed.category_key]
      );
      if (!catRes.rows.length) continue;

      await client.query(
        `INSERT INTO mes_item_taxonomy_subcategories (category_id, internal_key, display_name, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (category_id, internal_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_at = NOW()`,
        [catRes.rows[0].id, seed.internal_key, seed.display_name, seed.sort_order]
      );
    }

    await client.query('COMMIT');
    console.log('Migration mes-master-027 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { up };
