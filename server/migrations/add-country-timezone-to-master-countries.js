/**
 * Database Migration: Add timezone support to master_countries
 * Stores primary IANA timezone for each country.
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

async function migrateCountryTimezone() {
  const client = await authPool.connect();

  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'master_countries'
      LIMIT 1
    `);

    if (tableCheck.rows.length === 0) {
      logger.warn('master_countries table not found - skipping timezone migration');
      await client.query('COMMIT');
      return;
    }

    const columnCheck = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'master_countries'
        AND column_name = 'timezone'
      LIMIT 1
    `);

    if (columnCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE master_countries
        ADD COLUMN timezone VARCHAR(64)
      `);
      logger.info('Added timezone column to master_countries');
    } else {
      logger.info('timezone column already exists in master_countries');
    }

    await client.query(`
      UPDATE master_countries
      SET timezone = CASE country_code_2
        WHEN 'AE' THEN 'Asia/Dubai'
        WHEN 'SA' THEN 'Asia/Riyadh'
        WHEN 'QA' THEN 'Asia/Qatar'
        WHEN 'KW' THEN 'Asia/Kuwait'
        WHEN 'OM' THEN 'Asia/Muscat'
        WHEN 'BH' THEN 'Asia/Bahrain'
        WHEN 'JO' THEN 'Asia/Amman'
        WHEN 'LB' THEN 'Asia/Beirut'
        WHEN 'EG' THEN 'Africa/Cairo'
        WHEN 'IQ' THEN 'Asia/Baghdad'
        WHEN 'TR' THEN 'Europe/Istanbul'
        WHEN 'GB' THEN 'Europe/London'
        WHEN 'IE' THEN 'Europe/Dublin'
        WHEN 'FR' THEN 'Europe/Paris'
        WHEN 'DE' THEN 'Europe/Berlin'
        WHEN 'IT' THEN 'Europe/Rome'
        WHEN 'ES' THEN 'Europe/Madrid'
        WHEN 'NL' THEN 'Europe/Amsterdam'
        WHEN 'BE' THEN 'Europe/Brussels'
        WHEN 'CH' THEN 'Europe/Zurich'
        WHEN 'AT' THEN 'Europe/Vienna'
        WHEN 'SE' THEN 'Europe/Stockholm'
        WHEN 'NO' THEN 'Europe/Oslo'
        WHEN 'DK' THEN 'Europe/Copenhagen'
        WHEN 'FI' THEN 'Europe/Helsinki'
        WHEN 'PL' THEN 'Europe/Warsaw'
        WHEN 'CZ' THEN 'Europe/Prague'
        WHEN 'HU' THEN 'Europe/Budapest'
        WHEN 'RO' THEN 'Europe/Bucharest'
        WHEN 'GR' THEN 'Europe/Athens'
        WHEN 'PT' THEN 'Europe/Lisbon'
        WHEN 'RU' THEN 'Europe/Moscow'
        WHEN 'US' THEN 'America/New_York'
        WHEN 'CA' THEN 'America/Toronto'
        WHEN 'MX' THEN 'America/Mexico_City'
        WHEN 'BR' THEN 'America/Sao_Paulo'
        WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
        WHEN 'CL' THEN 'America/Santiago'
        WHEN 'CO' THEN 'America/Bogota'
        WHEN 'PE' THEN 'America/Lima'
        WHEN 'ZA' THEN 'Africa/Johannesburg'
        WHEN 'NG' THEN 'Africa/Lagos'
        WHEN 'KE' THEN 'Africa/Nairobi'
        WHEN 'MA' THEN 'Africa/Casablanca'
        WHEN 'IN' THEN 'Asia/Kolkata'
        WHEN 'PK' THEN 'Asia/Karachi'
        WHEN 'BD' THEN 'Asia/Dhaka'
        WHEN 'LK' THEN 'Asia/Colombo'
        WHEN 'NP' THEN 'Asia/Kathmandu'
        WHEN 'CN' THEN 'Asia/Shanghai'
        WHEN 'HK' THEN 'Asia/Hong_Kong'
        WHEN 'TW' THEN 'Asia/Taipei'
        WHEN 'JP' THEN 'Asia/Tokyo'
        WHEN 'KR' THEN 'Asia/Seoul'
        WHEN 'SG' THEN 'Asia/Singapore'
        WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
        WHEN 'TH' THEN 'Asia/Bangkok'
        WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
        WHEN 'ID' THEN 'Asia/Jakarta'
        WHEN 'PH' THEN 'Asia/Manila'
        WHEN 'AU' THEN 'Australia/Sydney'
        WHEN 'NZ' THEN 'Pacific/Auckland'
        ELSE timezone
      END
      WHERE timezone IS NULL OR timezone = ''
    `);

    await client.query(`
      UPDATE master_countries
      SET timezone = 'UTC'
      WHERE timezone IS NULL OR timezone = ''
    `);

    await client.query('COMMIT');
    logger.info('✅ Country timezone migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Country timezone migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateCountryTimezone()
    .then(() => {
      logger.info('Country timezone migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Country timezone migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateCountryTimezone };
