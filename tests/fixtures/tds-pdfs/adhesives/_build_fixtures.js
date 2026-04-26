/**
 * Convert source adhesive PDFs into deterministic .txt fixtures for non-resin parser tests.
 * Run from workspace root:  node PPH/tests/fixtures/tds-pdfs/adhesives/_build_fixtures.js
 */
const fs = require('fs');
const path = require('path');

let pdf;
try { pdf = require('pdf-parse'); }
catch { console.error('pdf-parse not installed at workspace root; trying PPH/node_modules…'); pdf = require(path.join('..', '..', '..', '..', 'node_modules', 'pdf-parse')); }

const SRC_ROOT = path.join(__dirname, '..', '..', '..', '..', 'Product Groups data', 'Adhesives');
const OUT_DIR = __dirname;

const FIXTURES = [
  { src: path.join(SRC_ROOT, 'Henken Adhesives', 'Loctite Liofol  LA 7796 LA6154-EN.pdf'),
    out: 'henkel-loctite-LA7796-LA6154.txt' },
  { src: path.join(SRC_ROOT, 'BRILLIANT', 'TDS Brilliant H214-A75.pdf'),
    out: 'brilliant-H214-A75.txt' },
  { src: path.join(SRC_ROOT, 'SP Adhesives', 'TDS MB655 + CT85.pdf'),
    out: 'sp-MB655-CT85.txt' },
  { src: path.join(SRC_ROOT, 'Ecolad -BCI', 'ECOLAD SB940-SB527 - TDS.pdf'),
    out: 'ecolad-SB940-SB527.txt' },
];

async function extract(filePath) {
  const buf = fs.readFileSync(filePath);
  // pdf.js (used by pdf-parse) requires Uint8Array, not Buffer, on newer versions.
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  // Newer pdf-parse exports a default function; older versions exposed PDFParse class.
  if (typeof pdf === 'function') {
    const out = await pdf(data);
    return out.text;
  }
  if (pdf && typeof pdf.default === 'function') {
    const out = await pdf.default(data);
    return out.text;
  }
  if (pdf && pdf.PDFParse) {
    const parser = new pdf.PDFParse(data);
    if (typeof parser.parse === 'function') {
      const out = await parser.parse();
      return out.text;
    }
    if (typeof parser.getText === 'function') {
      const out = await parser.getText();
      return out.text || out;
    }
  }
  throw new Error('Unsupported pdf-parse version: ' + Object.keys(pdf || {}).join(','));
}

(async () => {
  for (const fx of FIXTURES) {
    if (!fs.existsSync(fx.src)) {
      console.warn('SKIP (missing source):', fx.src);
      continue;
    }
    try {
      const text = await extract(fx.src);
      fs.writeFileSync(path.join(OUT_DIR, fx.out), text, 'utf8');
      console.log('✓', fx.out, '(' + text.length + ' chars)');
    } catch (err) {
      console.error('✗', fx.out, err.message);
    }
  }
})();
