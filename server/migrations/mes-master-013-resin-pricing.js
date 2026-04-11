/**
 * Migration mes-master-013 — Add stock_price and on_order_price columns
 *
 * stock_price    — weighted average price of current stock (from Oracle sync)
 * on_order_price — weighted average price of pending purchase orders (from Oracle sync)
 *
 * Default Price rule: on_order_price if available, else stock_price.
 * Market Price (market_ref_price) is user-entered and remains separate.
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
    console.log('🔧 Starting MES migration #013 — stock_price + on_order_price columns...\n');

    await client.query(`ALTER TABLE mes_item_master ADD COLUMN IF NOT EXISTS stock_price    DECIMAL(12,4)`);
    console.log('  ✅ stock_price column — added');

    await client.query(`ALTER TABLE mes_item_master ADD COLUMN IF NOT EXISTS on_order_price DECIMAL(12,4)`);
    console.log('  ✅ on_order_price column — added');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-013 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-013 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
