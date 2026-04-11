/**
 * Migration: mes-master-028-taxonomy-fk-linkage
 *
 * Adds taxonomy FK linkage columns for TDS and non-resin specs,
 * with safe backfill from existing display-name fields.
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

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function constraintExists(client, constraintName) {
  const { rows } = await client.query(
    `SELECT 1
     FROM pg_constraint
     WHERE conname = $1
     LIMIT 1`,
    [constraintName]
  );
  return rows.length > 0;
}

async function ensureColumn(client, tableName, columnName, ddl) {
  if (await columnExists(client, tableName, columnName)) {
    console.log(`  ⊘ ${tableName}.${columnName} already exists`);
    return;
  }
  await client.query(ddl);
  console.log(`  ✔ Added ${tableName}.${columnName}`);
}

async function ensureConstraint(client, constraintName, ddl) {
  if (await constraintExists(client, constraintName)) {
    console.log(`  ⊘ ${constraintName} already exists`);
    return;
  }
  await client.query(ddl);
  console.log(`  ✔ Added ${constraintName}`);
}

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasTds = await tableExists(client, 'mes_material_tds');
    const hasNonResin = await tableExists(client, 'mes_non_resin_material_specs');
    const hasTaxonomyDomains = await tableExists(client, 'mes_item_taxonomy_domains');
    const hasTaxonomyCategories = await tableExists(client, 'mes_item_taxonomy_categories');
    const hasTaxonomySubcategories = await tableExists(client, 'mes_item_taxonomy_subcategories');

    if (hasTds) {
      await ensureColumn(
        client,
        'mes_material_tds',
        'taxonomy_category_id',
        'ALTER TABLE mes_material_tds ADD COLUMN taxonomy_category_id INTEGER'
      );

      await ensureConstraint(
        client,
        'fk_mes_material_tds_taxonomy_category',
        `ALTER TABLE mes_material_tds
         ADD CONSTRAINT fk_mes_material_tds_taxonomy_category
         FOREIGN KEY (taxonomy_category_id)
         REFERENCES mes_item_taxonomy_categories(id)
         ON DELETE SET NULL`
      );

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_mes_material_tds_taxonomy_category
        ON mes_material_tds (taxonomy_category_id)
      `);
      console.log('  ✔ Created idx_mes_material_tds_taxonomy_category');
    } else {
      console.log('  ⊘ mes_material_tds not found, skipping TDS FK linkage');
    }

    if (hasNonResin) {
      await ensureColumn(
        client,
        'mes_non_resin_material_specs',
        'taxonomy_category_id',
        'ALTER TABLE mes_non_resin_material_specs ADD COLUMN taxonomy_category_id INTEGER'
      );
      await ensureColumn(
        client,
        'mes_non_resin_material_specs',
        'taxonomy_subcategory_id',
        'ALTER TABLE mes_non_resin_material_specs ADD COLUMN taxonomy_subcategory_id INTEGER'
      );

      await ensureConstraint(
        client,
        'fk_non_resin_specs_taxonomy_category',
        `ALTER TABLE mes_non_resin_material_specs
         ADD CONSTRAINT fk_non_resin_specs_taxonomy_category
         FOREIGN KEY (taxonomy_category_id)
         REFERENCES mes_item_taxonomy_categories(id)
         ON DELETE SET NULL`
      );

      await ensureConstraint(
        client,
        'fk_non_resin_specs_taxonomy_subcategory',
        `ALTER TABLE mes_non_resin_material_specs
         ADD CONSTRAINT fk_non_resin_specs_taxonomy_subcategory
         FOREIGN KEY (taxonomy_subcategory_id)
         REFERENCES mes_item_taxonomy_subcategories(id)
         ON DELETE SET NULL`
      );

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_non_resin_specs_taxonomy_category
        ON mes_non_resin_material_specs (taxonomy_category_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_non_resin_specs_taxonomy_subcategory
        ON mes_non_resin_material_specs (taxonomy_subcategory_id)
      `);
      console.log('  ✔ Created non-resin taxonomy indexes');
    } else {
      console.log('  ⊘ mes_non_resin_material_specs not found, skipping non-resin FK linkage');
    }

    if (hasTds && hasTaxonomyDomains && hasTaxonomyCategories) {
      await client.query(`
        UPDATE mes_material_tds t
        SET taxonomy_category_id = c.id
        FROM mes_item_taxonomy_categories c
        JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
        WHERE d.domain_key = 'resin'
          AND t.taxonomy_category_id IS NULL
          AND TRIM(COALESCE(t.cat_desc, '')) <> ''
          AND LOWER(TRIM(c.display_name)) = LOWER(TRIM(t.cat_desc))
      `);

      await client.query(`
        WITH film_scrap_category AS (
          SELECT c.id
          FROM mes_item_taxonomy_categories c
          JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
          WHERE d.domain_key = 'resin'
            AND c.internal_key LIKE 'film_scrap%'
          ORDER BY c.sort_order, c.id
          LIMIT 1
        )
        UPDATE mes_material_tds t
        SET taxonomy_category_id = f.id
        FROM film_scrap_category f
        WHERE t.taxonomy_category_id IS NULL
          AND LOWER(TRIM(COALESCE(t.cat_desc, ''))) = 'film scrap'
      `);

      console.log('  ✔ Backfilled mes_material_tds taxonomy_category_id');
    } else {
      console.log('  ⊘ Skipped TDS taxonomy backfill (required tables missing)');
    }

    if (hasNonResin && hasTaxonomyDomains && hasTaxonomyCategories && hasTaxonomySubcategories) {
      await client.query(`
        WITH matched AS (
          SELECT
            s.id AS spec_id,
            MIN(sc.id) AS subcategory_id
          FROM mes_non_resin_material_specs s
          JOIN mes_item_taxonomy_subcategories sc
            ON LOWER(TRIM(sc.display_name)) = LOWER(TRIM(COALESCE(s.catlinedesc, '')))
          JOIN mes_item_taxonomy_categories c ON c.id = sc.category_id
          JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
          WHERE s.material_class = 'films'
            AND d.domain_key = 'substrate'
            AND s.taxonomy_subcategory_id IS NULL
            AND TRIM(COALESCE(s.catlinedesc, '')) <> ''
          GROUP BY s.id
        )
        UPDATE mes_non_resin_material_specs s
        SET taxonomy_subcategory_id = m.subcategory_id,
            taxonomy_category_id = sc.category_id
        FROM matched m
        JOIN mes_item_taxonomy_subcategories sc ON sc.id = m.subcategory_id
        WHERE s.id = m.spec_id
      `);

      console.log('  ✔ Backfilled non-resin taxonomy category/subcategory IDs for films');
    } else {
      console.log('  ⊘ Skipped non-resin taxonomy backfill (required tables missing)');
    }

    await client.query('COMMIT');
    console.log('Migration mes-master-028 complete.');
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
