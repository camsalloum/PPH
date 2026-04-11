/**
 * Presales Lookups — sales-reps, product-groups
 */
const { pool, authenticate, logger, DIVISION } = require('./_helpers');

module.exports = function (router) {

  // GET /sales-reps
  router.get('/sales-reps', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, group_name AS name
         FROM sales_rep_groups
         WHERE division = $1
         ORDER BY group_name`,
        [DIVISION]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching sales reps', err);
      res.status(500).json({ success: false, error: 'Failed to fetch sales reps' });
    }
  });

  // GET /product-groups — includes per-group config for inquiry form
  router.get('/product-groups', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT pg.id, pg.product_group AS name, pg.material, pg.process,
                c.available_dimensions, c.default_dimensions,
                c.available_units, c.default_unit
         FROM crm_product_groups pg
         LEFT JOIN crm_product_group_config c ON c.product_group_id = pg.id
         WHERE pg.is_active = true
         ORDER BY pg.display_order, pg.product_group`
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching product groups', err);
      res.status(500).json({ success: false, error: 'Failed to fetch product groups' });
    }
  });

};
