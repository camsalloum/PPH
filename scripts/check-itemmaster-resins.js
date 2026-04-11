const { Client } = require('./server/node_modules/pg');

const c = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Pph654883!',
  database: 'fp_database'
});

(async () => {
  await c.connect();

  const resinItems = await c.query(`
    SELECT
      oracle_cat_desc,
      COUNT(*)::int AS rows_count,
      SUM(CASE WHEN stock_price IS NOT NULL THEN 1 ELSE 0 END)::int AS with_stock,
      SUM(CASE WHEN on_order_price IS NOT NULL THEN 1 ELSE 0 END)::int AS with_on_order,
      SUM(CASE WHEN market_ref_price IS NOT NULL THEN 1 ELSE 0 END)::int AS with_market
    FROM mes_item_master
    WHERE is_active = true
      AND category = 'Resins'
    GROUP BY oracle_cat_desc
    ORDER BY oracle_cat_desc NULLS FIRST
  `);

  const resinRm = await c.query(`
    SELECT catlinedesc, COUNT(*)::int AS rm_rows
    FROM fp_actualrmdata
    WHERE category = 'Resins'
      AND catlinedesc IN (
        'HDPE',
        'LDPE',
        'LLDPE',
        'mLLDPE',
        'Random PP',
        'Film Scrap / Regrind Clear',
        'Film Scrap / Regrind Printed'
      )
    GROUP BY catlinedesc
    ORDER BY catlinedesc
  `);

  const resolvedView = await c.query(`
    WITH rm_prices AS (
      SELECT
        catlinedesc,
        CASE
          WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
          THEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
               / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
          ELSE NULL
        END AS stock_price_wa,
        CASE
          WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
          THEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
               / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
          ELSE NULL
        END AS on_order_price_wa
      FROM fp_actualrmdata
      WHERE catlinedesc IS NOT NULL
      GROUP BY catlinedesc
    )
    SELECT
      i.item_code,
      i.item_name,
      i.oracle_cat_desc,
      COALESCE(rp.stock_price_wa, i.stock_price) AS stock_price_view,
      COALESCE(rp.on_order_price_wa, i.on_order_price) AS on_order_price_view,
      i.market_ref_price
    FROM mes_item_master i
    LEFT JOIN rm_prices rp ON rp.catlinedesc = i.oracle_cat_desc
    WHERE i.is_active = true
      AND i.category = 'Resins'
    ORDER BY i.oracle_cat_desc NULLS FIRST, i.item_code
    LIMIT 25
  `);

  console.log('=== mes_item_master (active Resins) grouped by oracle_cat_desc ===');
  console.log(JSON.stringify(resinItems.rows, null, 2));
  console.log('=== fp_actualrmdata (Resins) supported catlinedesc ===');
  console.log(JSON.stringify(resinRm.rows, null, 2));
  console.log('=== API-resolved ItemMaster preview (Resins) ===');
  console.log(JSON.stringify(resolvedView.rows, null, 2));

  await c.end();
})().catch(async (e) => {
  console.error('CHECK_FAILED:', e.message);
  try { await c.end(); } catch {}
  process.exit(1);
});
