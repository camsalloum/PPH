/**
 * presalesPdfService.js — Generate PDF for Quotations and Proforma Invoices
 *
 * Uses Puppeteer (same as exportPdf.js) to render HTML → PDF.
 * Falls back gracefully if Puppeteer is not installed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { /* optional */ }

function formatCurrency(val, currency = 'AED') {
  const num = parseFloat(val) || 0;
  return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function baseStyles() {
  return `
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 30px 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1890ff; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left h1 { margin: 0; font-size: 22px; color: #1890ff; }
    .header-left p { margin: 2px 0; color: #666; font-size: 11px; }
    .header-right { text-align: right; }
    .header-right .doc-number { font-size: 16px; font-weight: bold; color: #333; }
    .header-right .doc-date { font-size: 11px; color: #666; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; font-weight: bold; color: #1890ff; border-bottom: 1px solid #e8e8e8; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    table.info td { padding: 4px 8px; font-size: 11px; }
    table.info td:first-child { font-weight: bold; color: #555; width: 140px; }
    table.items th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 11px; border-bottom: 2px solid #ddd; }
    table.items td { padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    table.items td.right { text-align: right; }
    .totals { text-align: right; margin-top: 12px; }
    .totals .total-line { font-size: 13px; margin: 4px 0; }
    .totals .grand-total { font-size: 16px; font-weight: bold; color: #1890ff; border-top: 2px solid #1890ff; padding-top: 6px; }
    .terms { background: #fafafa; padding: 12px; border-radius: 6px; margin-top: 16px; }
    .terms h3 { margin: 0 0 6px; font-size: 12px; color: #555; }
    .terms p { margin: 2px 0; font-size: 11px; color: #666; }
    .footer { margin-top: 30px; border-top: 1px solid #e8e8e8; padding-top: 10px; text-align: center; font-size: 10px; color: #999; }
    .watermark { position: fixed; top: 35%; left: 10%; font-size: 80px; color: rgba(255,0,0,0.12); transform: rotate(-35deg); z-index: -1; font-weight: bold; white-space: nowrap; pointer-events: none; }
    .approver-info { background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 11px; }
    .approver-info strong { color: #1890ff; }
  `;
}

/**
 * Generate Quotation PDF
 */
function buildQuotationHtml(quot) {
  const est = quot.estimation_data || {};
  return `<!DOCTYPE html><html><head><style>${baseStyles()}</style></head><body>
    ${quot.status !== 'approved' && quot.status !== 'sent' && quot.status !== 'accepted' ? '<div class="watermark">DRAFT — NOT FOR CUSTOMER</div>' : ''}
    <div class="header">
      <div class="header-left">
        <h1>QUOTATION</h1>
        <p>Interplast — Flexible Packaging Division</p>
      </div>
      <div class="header-right">
        <div class="doc-number">${quot.quotation_number}</div>
        <div class="doc-date">Date: ${formatDate(quot.created_at)}</div>
        <div class="doc-date">Status: ${(quot.status || 'draft').toUpperCase()}</div>
      </div>
    </div>

    ${quot.status === 'approved' || quot.status === 'sent' || quot.status === 'accepted' ? `
    <div class="approver-info">
      <strong>Approved by:</strong> ${quot.approved_by_name || '—'} on ${formatDate(quot.approved_at)}
    </div>` : ''}

    <div class="section">
      <div class="section-title">Customer Details</div>
      <table class="info">
        <tr><td>Customer</td><td>${quot.customer_name || '—'}</td></tr>
        <tr><td>Country</td><td>${quot.customer_country || '—'}</td></tr>
        <tr><td>Inquiry Ref</td><td>${quot.inquiry_number || '—'}</td></tr>
        <tr><td>Valid Until</td><td>${formatDate(quot.valid_until)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Pricing</div>
      <table class="items">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          <tr>
            <td>As per inquiry ${quot.inquiry_number || ''}</td>
            <td>${quot.quantity || '—'}</td>
            <td>${quot.quantity_unit || 'KGS'}</td>
            <td class="right">${formatCurrency(quot.unit_price, quot.currency)}</td>
            <td class="right">${formatCurrency(quot.total_price, quot.currency)}</td>
          </tr>
        </tbody>
      </table>
      <div class="totals">
        <div class="total-line">Material: ${formatCurrency(est.material_cost, quot.currency)}</div>
        <div class="total-line">Processing: ${formatCurrency(est.process_cost, quot.currency)}</div>
        <div class="total-line">Overhead: ${formatCurrency(est.overhead_cost, quot.currency)}</div>
        <div class="total-line">Margin: ${est.margin_percent || 0}%</div>
        <div class="grand-total">Total: ${formatCurrency(quot.total_price, quot.currency)}</div>
      </div>
    </div>

    ${quot.payment_terms || quot.delivery_terms || quot.notes ? `
    <div class="terms">
      <h3>Terms & Conditions</h3>
      ${quot.payment_terms ? `<p><strong>Payment:</strong> ${quot.payment_terms}</p>` : ''}
      ${quot.delivery_terms ? `<p><strong>Delivery:</strong> ${quot.delivery_terms}</p>` : ''}
      ${quot.notes ? `<p><strong>Notes:</strong> ${quot.notes}</p>` : ''}
    </div>` : ''}

    <div class="footer">
      <p>This is a computer-generated document. Created by ${quot.created_by_name || 'System'} on ${formatDate(quot.created_at)}.</p>
      <p>ProPack Hub — Flexible Packaging Division</p>
    </div>
  </body></html>`;
}

/**
 * Generate Proforma Invoice PDF
 */
function buildPIHtml(pi) {
  return `<!DOCTYPE html><html><head><style>${baseStyles()}</style></head><body>
    <div class="header">
      <div class="header-left">
        <h1>PROFORMA INVOICE</h1>
        <p>Interplast — Flexible Packaging Division</p>
      </div>
      <div class="header-right">
        <div class="doc-number">${pi.pi_number}</div>
        <div class="doc-date">Date: ${formatDate(pi.created_at)}</div>
        <div class="doc-date">Status: ${(pi.status || 'draft').toUpperCase()}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Customer Details</div>
      <table class="info">
        <tr><td>Customer</td><td>${pi.customer_name || '—'}</td></tr>
        <tr><td>Country</td><td>${pi.customer_country || '—'}</td></tr>
        <tr><td>Inquiry Ref</td><td>${pi.inquiry_number || '—'}</td></tr>
        <tr><td>Quotation Ref</td><td>${pi.quotation_number || '—'}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Invoice Details</div>
      <table class="items">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          <tr>
            <td>As per quotation ${pi.quotation_number || ''}</td>
            <td>${pi.quantity || '—'}</td>
            <td>${pi.quantity_unit || 'KGS'}</td>
            <td class="right">${formatCurrency(pi.unit_price, pi.currency)}</td>
            <td class="right">${formatCurrency(pi.total_price, pi.currency)}</td>
          </tr>
        </tbody>
      </table>
      <div class="totals">
        <div class="grand-total">Total: ${formatCurrency(pi.total_price, pi.currency)}</div>
      </div>
    </div>

    ${pi.payment_terms || pi.delivery_terms || pi.notes ? `
    <div class="terms">
      <h3>Terms & Conditions</h3>
      ${pi.payment_terms ? `<p><strong>Payment:</strong> ${pi.payment_terms}</p>` : ''}
      ${pi.delivery_terms ? `<p><strong>Delivery:</strong> ${pi.delivery_terms}</p>` : ''}
      ${pi.notes ? `<p><strong>Notes:</strong> ${pi.notes}</p>` : ''}
    </div>` : ''}

    <div class="footer">
      <p>This is a computer-generated document. Created by ${pi.created_by_name || 'System'} on ${formatDate(pi.created_at)}.</p>
      <p>ProPack Hub — Flexible Packaging Division</p>
    </div>
  </body></html>`;
}

/**
 * Generate CSE (Customer Sample Evaluation) Report PDF
 * Includes company logo header, test summary table, safety warnings, and signature blocks
 */
function buildCseHtml(cse) {
  const testSummary = cse.test_summary || {};
  const testParams = testSummary.test_parameters || [];

  // Build test parameters table rows
  let paramRows = '';
  if (Array.isArray(testParams) && testParams.length > 0) {
    paramRows = testParams.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.name || '—'}</td>
        <td>${p.spec || p.target || '—'}</td>
        <td>${p.value || p.result || '—'}</td>
        <td>${p.unit || ''}</td>
        <td>${p.method || '—'}</td>
        <td class="${(p.status || '').toLowerCase() === 'fail' ? 'fail' : ''}">${p.status || '—'}</td>
      </tr>`).join('');
  }

  return `<!DOCTYPE html><html><head><style>
    ${baseStyles()}
    .logo-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2c3e50; padding-bottom: 16px; margin-bottom: 20px; }
    .logo-header .company { font-size: 22px; font-weight: bold; color: #2c3e50; }
    .logo-header .company-sub { font-size: 11px; color: #666; margin-top: 2px; }
    .logo-header .doc-info { text-align: right; }
    .logo-header .cse-number { font-size: 16px; font-weight: bold; color: #2c3e50; }
    .logo-header .cse-date { font-size: 11px; color: #666; }
    .result-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 13px; text-transform: uppercase; }
    .result-badge.pass { background: #d4edda; color: #155724; }
    .result-badge.fail { background: #f8d7da; color: #721c24; }
    .result-badge.conditional { background: #fff3cd; color: #856404; }
    td.fail { color: #dc3545; font-weight: bold; }
    .safety-warning { background: #fff3cd; border: 2px solid #ffc107; border-radius: 6px; padding: 12px; margin: 16px 0; }
    .safety-warning h3 { color: #856404; margin: 0 0 6px; }
    .signature-block { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e8e8e8; }
    .signature-box { width: 45%; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 11px; color: #555; }
    .signature-name { font-weight: bold; font-size: 12px; margin-top: 4px; }
  </style></head><body>

    <div class="logo-header">
      <div>
        <div class="company">INTERPLAST</div>
        <div class="company-sub">Flexible Packaging Division</div>
        <div class="company-sub">P.O. Box 8822, Sharjah, UAE</div>
      </div>
      <div class="doc-info">
        <div class="cse-number">${cse.cse_number || 'CSE-DRAFT'}</div>
        <div class="cse-date">Date: ${formatDate(cse.created_at)}</div>
        <div class="cse-date">Status: ${(cse.status || 'pending').toUpperCase()}</div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 16px;">
      <h2 style="margin: 0; color: #2c3e50;">CUSTOMER SAMPLE EVALUATION REPORT</h2>
    </div>

    <div class="section">
      <div class="section-title">Sample Information</div>
      <table class="info">
        <tr><td>Customer</td><td>${cse.customer_name || '—'}</td></tr>
        <tr><td>Inquiry Ref</td><td>${cse.inquiry_number || '—'}</td></tr>
        <tr><td>Sample No.</td><td>${cse.sample_number || '—'}</td></tr>
        <tr><td>Product Group</td><td>${cse.product_group || '—'}</td></tr>
        <tr><td>Overall Result</td><td><span class="result-badge ${(cse.overall_result || '').toLowerCase()}">${(cse.overall_result || '—').toUpperCase()}</span></td></tr>
      </table>
    </div>

    ${cse.has_safety_warning ? `
    <div class="safety-warning">
      <h3>⚠ SAFETY WARNING</h3>
      <p>This sample has been flagged with a safety warning. Please review solvent retention levels and food-contact compliance before proceeding.</p>
    </div>` : ''}

    ${paramRows ? `
    <div class="section">
      <div class="section-title">Test Results</div>
      <table class="items">
        <thead><tr><th>#</th><th>Parameter</th><th>Specification</th><th>Result</th><th>Unit</th><th>Method</th><th>Status</th></tr></thead>
        <tbody>${paramRows}</tbody>
      </table>
    </div>` : ''}

    ${testSummary.visual_inspection ? `
    <div class="section">
      <div class="section-title">Visual Inspection</div>
      <p style="font-size: 11px;">${testSummary.visual_inspection}</p>
    </div>` : ''}

    ${testSummary.print_quality ? `
    <div class="section">
      <div class="section-title">Print Quality</div>
      <p style="font-size: 11px;">${testSummary.print_quality}</p>
    </div>` : ''}

    ${testSummary.seal_strength_value ? `
    <div class="section">
      <div class="section-title">Seal Strength</div>
      <table class="info">
        <tr><td>Value</td><td>${testSummary.seal_strength_value} ${testSummary.seal_strength_unit || ''}</td></tr>
        <tr><td>Status</td><td>${testSummary.seal_strength_status || '—'}</td></tr>
      </table>
    </div>` : ''}

    ${cse.observations ? `
    <div class="section">
      <div class="section-title">Observations</div>
      <p style="font-size: 11px; white-space: pre-wrap;">${cse.observations}</p>
    </div>` : ''}

    ${cse.recommendation ? `
    <div class="section">
      <div class="section-title">Recommendation</div>
      <p style="font-size: 11px;">${cse.recommendation}</p>
    </div>` : ''}

    <div class="signature-block">
      <div class="signature-box">
        <div class="signature-line">QC Manager</div>
        <div class="signature-name">${cse.qc_manager_name || '____________________'}</div>
        <div style="font-size: 10px; color: #888;">${cse.qc_approved_at ? formatDate(cse.qc_approved_at) : 'Date: ____________________'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">Production Manager</div>
        <div class="signature-name">${cse.production_manager_name || '____________________'}</div>
        <div style="font-size: 10px; color: #888;">${cse.approved_at ? formatDate(cse.approved_at) : 'Date: ____________________'}</div>
      </div>
    </div>

    <div class="footer">
      <p>This is a computer-generated document. Created by ${cse.created_by_name || 'System'} on ${formatDate(cse.created_at)}.</p>
      <p>ProPack Hub — Flexible Packaging Division — Interplast</p>
    </div>
  </body></html>`;
}

/**
 * Render HTML to PDF buffer using Puppeteer
 */
async function renderPdf(html) {
  if (!puppeteer) throw new Error('Puppeteer not installed — PDF generation unavailable');
  const tmpFile = path.join(os.tmpdir(), `presales-pdf-${Date.now()}.html`);
  let browser;
  try {
    fs.writeFileSync(tmpFile, html, 'utf8');
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${tmpFile}`, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    return pdfBuffer;
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

module.exports = {
  buildQuotationHtml,
  buildPIHtml,
  buildCseHtml,
  renderPdf,
};
