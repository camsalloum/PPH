/**
 * PDF Export — Server-side Puppeteer approach
 * --------------------------------------------
 * Sends the full self-contained HTML to the server endpoint
 * POST /api/export-pdf, which renders it with headless Chromium
 * and returns a ready-to-download PDF file.
 *
 * No print dialog, no pop-up blockers, auto-downloads the PDF.
 * Each card on its own page, high-res charts, vector text.
 */

const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB

let activeController = null;

/**
 * Abort any in-progress PDF export.
 * Call this if the user cancels or navigates away.
 */
export const abortPDFExport = () => {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
};

/**
 * @param {Object} opts
 * @param {string} opts.fullHTML       - The complete self-contained HTML (same as HTML export)
 * @param {string} opts.divisionName   - Used for the file name
 * @param {Function} [opts.onProgress] - Optional callback for progress updates
 * @returns {Promise<void>}
 */
export const exportDashboardToPDF = async ({ fullHTML, divisionName, onProgress }) => {
  // Safe progress wrapper — never let a callback crash the export
  const safeProgress = (msg) => {
    try { onProgress?.(msg); }
    catch (e) { console.warn('Progress callback error:', e); }
  };

  if (!fullHTML || fullHTML.length < 500) {
    throw new Error('No HTML content available for PDF export');
  }

  if (fullHTML.length > MAX_HTML_SIZE) {
    throw new Error('HTML content too large for PDF export');
  }

  // Abort any previous in-flight export
  abortPDFExport();

  const controller = new AbortController();
  activeController = controller;

  // Normalize & limit filename
  let baseName = (divisionName || 'Report')
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .trim();
  if (!baseName) baseName = 'Report';
  baseName = baseName.slice(0, 100);
  const fileName = `${baseName} - Comprehensive Report - ${new Date().toISOString().slice(0, 10)}`;

  try {
    safeProgress('PDF rendering started on server…');

    const response = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHTML, fileName }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errMsg = `Server returned ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (e) { /* ignore parse error */ }
      throw new Error(errMsg);
    }

    // Validate MIME type — catch cases where server returns HTML error page
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      throw new Error('Invalid PDF response from server');
    }

    safeProgress('PDF ready, downloading…');

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('Server returned empty PDF');
    }

    // Download with Object URL leak protection
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.pdf`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    // Intentional cancellation — not an error
    if (err.name === 'AbortError') {
      safeProgress('PDF export cancelled');
      return;
    }
    throw err;
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
};
