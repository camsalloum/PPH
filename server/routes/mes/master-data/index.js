/**
 * MES Master Data API Routes — index orchestrator
 * Base path: /api/mes/master-data
 *
 * Provides CRUD for Item Master, Machines, Processes, and Product Types.
 * All routes require authentication. Write operations require admin/management role.
 */

const express = require('express');
const router = express.Router();

// SEC-003: Validate numeric route params as positive integers
const _intParamValidator = (req, res, next, val, name) => {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0 || String(n) !== String(val)) {
    return res.status(400).json({ success: false, error: `Invalid ${name}: must be a positive integer` });
  }
  req.params[name] = n;
  next();
};
router.param('id', (req, res, next, val) => _intParamValidator(req, res, next, val, 'id'));

// Mount route sub-modules
require('./taxonomy')(router);
require('./items')(router);
require('./machines')(router);
require('./processes')(router);
require('./product-types')(router);
require('./bom')(router);
require('./routing')(router);
require('./scheduling')(router);
require('./formulations')(router);
require('./tds')(router);

module.exports = router;
