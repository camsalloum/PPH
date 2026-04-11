const { pool } = require('./config');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "FP" -> "fp"
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get division-specific table names
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    pricingRounding: `${code}_product_group_pricing_rounding`
  };
}

let tableEnsuredForDivisions = new Set();

async function ensureTable(division) {
  const divisionCode = extractDivisionCode(division);
  if (tableEnsuredForDivisions.has(divisionCode)) return;
  
  const divisionPool = getDivisionPool(divisionCode.toUpperCase());
  const tables = getTableNames(division);
  
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${tables.pricingRounding} (
      id SERIAL PRIMARY KEY,
      division VARCHAR(10) NOT NULL,
      year INTEGER NOT NULL,
      product_group VARCHAR(255) NOT NULL,
      asp_round NUMERIC(18,4) CHECK (asp_round IS NULL OR (asp_round >= 0 AND asp_round <= 1000)),
      morm_round NUMERIC(18,4) CHECK (morm_round IS NULL OR (morm_round >= 0 AND morm_round <= 1000)),
      rm_round NUMERIC(18,4) CHECK (rm_round IS NULL OR (rm_round >= 0 AND rm_round <= 1000)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ${divisionCode}_uniq_division_year_product_group UNIQUE (division, year, product_group)
    );

    CREATE OR REPLACE FUNCTION update_${tables.pricingRounding}_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_${tables.pricingRounding}_updated_at'
      ) THEN
        CREATE TRIGGER trg_update_${tables.pricingRounding}_updated_at
        BEFORE UPDATE ON ${tables.pricingRounding}
        FOR EACH ROW
        EXECUTE FUNCTION update_${tables.pricingRounding}_updated_at();
      END IF;
    END$$;
  `;

  await divisionPool.query(createSql);
  tableEnsuredForDivisions.add(divisionCode);
}

async function getRoundedPrices(division, year) {
  await ensureTable(division);
  const divisionCode = extractDivisionCode(division);
  const divisionPool = getDivisionPool(divisionCode.toUpperCase());
  const tables = getTableNames(division);
  
  const result = await divisionPool.query(
    `SELECT product_group, asp_round, morm_round, rm_round
     FROM ${tables.pricingRounding}
     WHERE division = $1 AND year = $2`,
    [division.toUpperCase(), year]
  );
  return result.rows;
}

async function saveRoundedPrices(division, year, entries) {
  await ensureTable(division);
  const divisionCode = extractDivisionCode(division);
  const divisionPool = getDivisionPool(divisionCode.toUpperCase());
  const tables = getTableNames(division);
  const client = await divisionPool.connect();

  try {
    await client.query('BEGIN');

    for (const entry of entries) {
      // Validate rounded values
      const MIN_VALUE = 0;
      const MAX_VALUE = 1000;

      if (entry.aspRound !== null && (entry.aspRound < MIN_VALUE || entry.aspRound > MAX_VALUE)) {
        throw new Error(`Invalid ASP value for ${entry.productGroup}: must be between ${MIN_VALUE} and ${MAX_VALUE}`);
      }
      if (entry.mormRound !== null && (entry.mormRound < MIN_VALUE || entry.mormRound > MAX_VALUE)) {
        throw new Error(`Invalid MoRM value for ${entry.productGroup}: must be between ${MIN_VALUE} and ${MAX_VALUE}`);
      }

      // Ensure RM is calculated if both ASP and MoRM are provided
      // If either is NULL, RM should be NULL (can't calculate)
      let rmRound = entry.rmRound;
      if (entry.aspRound !== null && entry.mormRound !== null) {
        // Recalculate RM to ensure consistency: RM = ASP - MoRM
        rmRound = parseFloat((entry.aspRound - entry.mormRound).toFixed(2));
        // Validate calculated RM
        if (rmRound < MIN_VALUE || rmRound > MAX_VALUE) {
          throw new Error(`Calculated RM value for ${entry.productGroup} is out of range: ${rmRound}`);
        }
      } else {
        // If either ASP or MoRM is NULL, RM must be NULL
        rmRound = null;
      }

      await client.query(
        `
        INSERT INTO ${tables.pricingRounding}
        (division, year, product_group, asp_round, morm_round, rm_round)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (division, year, product_group)
        DO UPDATE SET
          asp_round = EXCLUDED.asp_round,
          morm_round = EXCLUDED.morm_round,
          rm_round = EXCLUDED.rm_round,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          division.toUpperCase(),
          year,
          entry.productGroup,
          entry.aspRound,
          entry.mormRound,
          rmRound
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getRoundedPrices,
  saveRoundedPrices
};

