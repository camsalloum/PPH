/**
 * PDF Export Route
 * ----------------
 * Receives the full self-contained HTML from the client,
 * writes it to a temp file, loads it in headless Chromium via file:// URL,
 * and returns a high-quality PDF (A4 landscape, one card per page).
 *
 * POST /api/export-pdf
 * Body: { html: string, fileName: string }
 * Response: application/pdf binary
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  logger.warn('Puppeteer not installed — PDF export will not be available. Run: npm install puppeteer');
}

router.post('/', async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({
      success: false,
      error: 'PDF export is not available. Puppeteer is not installed on the server.',
    });
  }

  const { html, fileName } = req.body;

  if (!html || typeof html !== 'string' || html.length < 500) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid HTML content.',
    });
  }

  // Write HTML to a temp file — setContent chokes on large HTML strings
  const tmpFile = path.join(os.tmpdir(), `pdf-export-${Date.now()}.html`);
  let browser;

  try {
    logger.info('PDF export: writing temp file...', { htmlLength: html.length });
    fs.writeFileSync(tmpFile, html, 'utf8');

    logger.info('PDF export: launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Navigate to the temp file — much faster than setContent for large HTML
    const fileUrl = 'file:///' + tmpFile.replace(/\\/g, '/');
    await page.goto(fileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    // Let inline scripts and styles settle
    await new Promise((r) => setTimeout(r, 3000));

    // Show all cards, hide navigation
    await page.evaluate(() => {
      var home = document.getElementById('export-dashboard-home');
      if (home) home.style.display = 'none';

      document.querySelectorAll('.full-screen-chart').forEach(function(el) {
        el.style.display = 'block';
      });

      var backBtn = document.getElementById('back-to-dashboard-btn');
      if (backBtn) backBtn.style.display = 'none';
      document.querySelectorAll('.overlay-close-btn').forEach(function(btn) {
        btn.style.display = 'none';
      });
    });

    // Try to initialize ECharts if the page has them
    await page.evaluate(() => {
      if (typeof initializeFullScreenChart === 'function') {
        ['sales-volume', 'manufacturing-cost', 'margin-analysis',
         'combined-trends', 'budget-actual-waterfall', 'below-gp-expenses'
        ].forEach(function(id) {
          try { initializeFullScreenChart(id); } catch (e) { /* skip */ }
        });
      }
    });

    // Wait for charts to render
    await new Promise((r) => setTimeout(r, 3000));

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '8mm', right: '6mm', bottom: '10mm', left: '6mm' },
    });

    logger.info('PDF export: success', { pdfSize: pdfBuffer.length });

    const safeName = (fileName || 'Comprehensive-Report').replace(/[^a-zA-Z0-9\-_ .]/g, '');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('PDF export failed:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: `PDF generation failed: ${error.message}`,
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
  }
});

module.exports = router;
