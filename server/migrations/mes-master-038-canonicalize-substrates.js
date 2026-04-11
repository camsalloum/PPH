/**
 * Migration mes-master-038 - Canonicalize substrates key
 *
 * Goal:
 * - Remove legacy "films" material_class usage and standardize on "substrates"
 * - Rename mes_spec_films table to mes_spec_substrates
 * - Rename films_* parameter profiles to substrates_*
 * - Update check constraints that still whitelist "films"
 */

const { pool } = require('../database/config');

async function renameIfExists(client, fromName, toName, kind) {
  const q = "SELECT to_regclass($1) AS from_obj, to_regclass($2) AS to_obj";
  const { rows } = await client.query(q, [`public.${fromName}`, `public.${toName}`]);

  if (kind === 'table') {
    if (rows[0].from_obj && !rows[0].to_obj) {
      await client.query(`ALTER TABLE ${fromName} RENAME TO ${toName}`);
      console.log(`  + Renamed table ${fromName} -> ${toName}`);
    }
    return;
  }

  if (rows[0].from_obj && !rows[0].to_obj) {
    await client.query(`ALTER INDEX ${fromName} RENAME TO ${toName}`);
    console.log(`  + Renamed index ${fromName} -> ${toName}`);
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #038 - Canonicalize substrates key...');
    await client.query('BEGIN');

    // 1) Rename spec table and indexes from films -> substrates.
    await renameIfExists(client, 'mes_spec_films', 'mes_spec_substrates', 'table');
    await renameIfExists(client, 'idx_spec_films_profile', 'idx_spec_substrates_profile', 'index');
    await renameIfExists(client, 'idx_spec_films_catline', 'idx_spec_substrates_catline', 'index');
    await renameIfExists(client, 'idx_spec_films_params', 'idx_spec_substrates_params', 'index');

    // Constraint names are table-scoped; rename if legacy name exists.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_spec_films'
            AND conrelid = 'mes_spec_substrates'::regclass
        ) THEN
          ALTER TABLE mes_spec_substrates RENAME CONSTRAINT uq_spec_films TO uq_spec_substrates;
        END IF;
      END
      $$;
    `);

    // 2) If both FILMS and SUBSTRATES rows exist, keep one canonical row.
    await client.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE WHEN oracle_category = 'SUBSTRATES' THEN 0 ELSE 1 END,
              CASE WHEN is_active THEN 0 ELSE 1 END,
              id ASC
          ) AS rn
        FROM mes_category_mapping
        WHERE oracle_category IN ('FILMS', 'SUBSTRATES')
      )
      DELETE FROM mes_category_mapping m
      USING ranked r
      WHERE m.id = r.id
        AND r.rn > 1;
    `);

    // 3) Canonicalize mapping row and spec table value.
    await client.query(`
      UPDATE mes_category_mapping
      SET
        oracle_category = 'SUBSTRATES',
        material_class = 'substrates',
        display_label = 'Substrates',
        spec_table = CASE WHEN spec_table = 'mes_spec_films' THEN 'mes_spec_substrates' ELSE spec_table END,
        updated_at = NOW()
      WHERE material_class = 'films'
         OR material_class = 'substrates'
         OR oracle_category IN ('FILMS', 'SUBSTRATES');
    `);

    // 4) Canonicalize material_class and profile keys in parameter definitions.
    await client.query(`
      UPDATE mes_parameter_definitions
      SET material_class = 'substrates'
      WHERE material_class = 'films';
    `);

    await client.query(`
      UPDATE mes_parameter_definitions
      SET profile = regexp_replace(profile, '^films_', 'substrates_')
      WHERE profile LIKE 'films_%';
    `);

    // 4b) Temporarily widen check constraints so data can transition to substrates.
    await client.query('ALTER TABLE mes_non_resin_material_specs DROP CONSTRAINT IF EXISTS chk_non_resin_material_class');
    await client.query(`
      ALTER TABLE mes_non_resin_material_specs
      ADD CONSTRAINT chk_non_resin_material_class
      CHECK (material_class IN ('films','substrates','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes'));
    `);

    await client.query('ALTER TABLE mes_substrate_profile_configs DROP CONSTRAINT IF EXISTS chk_substrate_cfg_material_class');
    await client.query(`
      ALTER TABLE mes_substrate_profile_configs
      ADD CONSTRAINT chk_substrate_cfg_material_class
      CHECK (material_class IN ('films','substrates','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes'));
    `);

    // 5) Canonicalize non-resin specs and substrate profile configs.
    await client.query(`
      UPDATE mes_non_resin_material_specs
      SET material_class = 'substrates'
      WHERE material_class = 'films';
    `);

    await client.query(`
      UPDATE mes_substrate_profile_configs
      SET material_class = 'substrates'
      WHERE material_class = 'films';
    `);

    // 6) Canonicalize custom categories and item-master categorical fields.
    await client.query(`
      UPDATE mes_item_categories
      SET material_class = 'substrates'
      WHERE material_class = 'films';
    `);

    await client.query(`
      UPDATE mes_item_master
      SET oracle_category = 'SUBSTRATES'
      WHERE UPPER(TRIM(COALESCE(oracle_category, ''))) = 'FILMS';
    `);

    await client.query(`
      UPDATE mes_item_master
      SET item_type = 'substrates'
      WHERE LOWER(TRIM(COALESCE(item_type, ''))) = 'films';
    `);

    // 7) Update check constraints that still whitelist films.
    await client.query('ALTER TABLE mes_non_resin_material_specs DROP CONSTRAINT IF EXISTS chk_non_resin_material_class');
    await client.query(`
      ALTER TABLE mes_non_resin_material_specs
      ADD CONSTRAINT chk_non_resin_material_class
      CHECK (material_class IN ('substrates','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes'));
    `);

    await client.query('ALTER TABLE mes_substrate_profile_configs DROP CONSTRAINT IF EXISTS chk_substrate_cfg_material_class');
    await client.query(`
      ALTER TABLE mes_substrate_profile_configs
      ADD CONSTRAINT chk_substrate_cfg_material_class
      CHECK (material_class IN ('substrates','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes'));
    `);

    await client.query('COMMIT');
    console.log('Migration #038 completed. Canonical key is now "substrates".');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration #038 failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
