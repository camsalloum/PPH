/**
 * CRM Module Routes Index
 * Mount-point router that imports and re-exports all domain-specific sub-routers.
 *
 * Route files:
 *   dashboard.js  — /dashboard/stats, /my-stats, /sales-reps, /sales-rep-groups,
 *                    /alerts/*, /stats/conversion-rate, /my-day/summary
 *   customers.js  — /customers, /customers/:id, /customers/map, /my-customers,
 *                    /my-customers/map, /lookups, /resolve-google-maps-url
 *   prospects.js  — /prospects CRUD, /my-prospects, /prospects-count, /admin/prospects
 *   activities.js — /activities, /recent-activities
 *   tasks.js      — /tasks, /notes
 *   deals.js      — /deals
 *   contacts.js   — /customers/:customerId/contacts, /contacts
 *   products.js   — /products
 *   analytics.js  — /analytics/* (already existed)
 *   bulk.js       — /bulk/* (already existed, mounted separately in express.js)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { refreshLastTxnView } = require('../../services/crmCacheService');
const { refreshSalesCube } = require('../../jobs/refreshSalesCube');

// ─── Materialized view refresh on server start + interval ────────────────────
refreshLastTxnView();
refreshSalesCube();
const crmRefreshInterval = setInterval(() => { refreshLastTxnView(); refreshSalesCube(); }, 5 * 60 * 1000);
if (typeof crmRefreshInterval.unref === 'function') crmRefreshInterval.unref();

// ─── Health check ────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    module: 'CRM',
    status: 'active',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─── Mount domain-specific sub-routers ───────────────────────────────────────
router.use('/', require('./dashboard'));
router.use('/', require('./customers'));
router.use('/', require('./prospects'));
router.use('/', require('./activities'));
router.use('/', require('./tasks'));
router.use('/', require('./deals'));
router.use('/', require('./contacts'));
router.use('/', require('./products'));
router.use('/', require('./technical-briefs'));
router.use('/', require('./meetings'));
router.use('/', require('./calls'));
router.use('/', require('./worklist-preferences'));
router.use('/', require('./email-drafts'));
router.use('/', require('./email-templates'));
router.use('/', require('./emails'));
router.use('/', require('./field-trips'));
router.use('/', require('./lost-business'));

module.exports = router;
