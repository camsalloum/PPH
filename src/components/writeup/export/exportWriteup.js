// export/exportWriteup.js (FULL FILE)
// html2pdf.js is a CJS/UMD module — loaded dynamically to avoid ESM default-export crash

/**
 * Export the given element to a branded PDF.
 * Usage: await exportWriteup(ref.current, { filename: 'WriteUp_Aug_2025.pdf', footerText: 'Interplast • Confidential' })
 */
export async function exportWriteup(element, { filename, footerText = 'Confidential' } = {}) {
  if (!element) throw new Error('exportWriteup: element is required');

  const opt = {
    margin:       [10, 10, 15, 10],
    filename:     filename || `Financial_Analysis_${new Date().toISOString().slice(0,10)}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const html2pdfMod = await import('html2pdf.js');
  const html2pdf = html2pdfMod.default ?? html2pdfMod;
  await html2pdf().from(element).set(opt).save();
}

