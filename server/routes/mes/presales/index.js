/**
 * MES Pre-Sales API Routes — index orchestrator
 * Base path: /api/mes/presales
 *
 * Tenant: Interplast – Flexible Packaging (division = 'FP')
 *
 * This file creates the Express router, registers param validators,
 * then delegates to feature-specific sub-modules.
 */

const express = require('express');
const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// SEC-003: Validate all numeric route params as positive integers
// ─────────────────────────────────────────────────────────────────────────────
const _intParamValidator = (req, res, next, val, name) => {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0 || String(n) !== String(val)) {
    return res.status(400).json({ success: false, error: `Invalid ${name}: must be a positive integer` });
  }
  req.params[name] = n;
  next();
};
['id', 'sampleId', 'checkId', 'prospectId', 'attId', 'repGroupId', 'inquiryId'].forEach(p => {
  router.param(p, (req, res, next, val) => _intParamValidator(req, res, next, val, p));
});

// ─────────────────────────────────────────────────────────────────────────────
// Mount all route sub-modules
// Each sub-module exports: function(router) { router.get/post/... }
// ─────────────────────────────────────────────────────────────────────────────
require('./lookups')(router);
require('./inquiries')(router);
require('./inquiries-status')(router);
require('./inquiries-admin')(router);
require('./prospects')(router);
require('./attachments')(router);
require('./samples')(router);
require('./qc-inbox')(router);
require('./qc-analysis')(router);
require('./qc-cse')(router);
require('./cse')(router);
require('./checks')(router);
require('./equipment')(router);
require('./templates')(router);
require('./ncr')(router);
require('./pipeline')(router);
require('./quotations')(router);
require('./quotation-approval')(router);
require('./preprod')(router);
require('./proforma')(router);
require('./orders')(router);
require('./analytics')(router);
require('./activities')(router);
require('./customerPO')(router);
require('./jobCards')(router);
require('./estimation')(router);
require('./procurement')(router);

module.exports = router;
