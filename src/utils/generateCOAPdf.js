import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const toLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const parseSummary = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toResultRows = (summary) => summary.map((row, idx) => {
  const specParts = [];
  if (row.spec_min !== null && row.spec_min !== undefined) specParts.push(`Min ${row.spec_min}`);
  if (row.spec_target !== null && row.spec_target !== undefined) specParts.push(`Target ${row.spec_target}`);
  if (row.spec_max !== null && row.spec_max !== undefined) specParts.push(`Max ${row.spec_max}`);

  const ctqMarker = row.is_ctq ? ' [CTQ]' : '';

  return [
    idx + 1,
    (row.parameter_name || row.parameter_code || '-') + ctqMarker,
    row.unit || '-',
    specParts.join(' / ') || '-',
    row.result_value ?? row.result_text ?? '-',
    toLabel(row.result_status || 'pending'),
  ];
});

export function generateCOAPdf(detail, options = {}) {
  const cert = detail?.certificate;
  if (!cert) {
    throw new Error('Certificate payload is missing');
  }

  const verifyBaseUrl = options.verifyBaseUrl
    || `${window.location.origin}/api/mes/qc/certificates/verify`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CERTIFICATE OF ANALYSIS', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 6;
  doc.text(`Certificate #: ${cert.certificate_number || '-'}`, margin, y);
  y += 5;
  doc.text(`Revision: ${cert.revision_number || 1}`, margin, y);
  y += 5;
  doc.text(`Issued Date: ${formatDate(cert.issued_date)}`, margin, y);

  y += 8;
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [32, 85, 163] },
    head: [['Material', 'Code', 'Batch', 'QC Lot', 'Supplier', 'Division']],
    body: [[
      cert.material_name || '-',
      cert.material_code || '-',
      cert.batch_number || '-',
      cert.qc_lot_id || '-',
      cert.supplier_name || cert.supplier_code || '-',
      cert.division || '-',
    ]],
  });

  y = (doc.lastAutoTable?.finalY || y) + 7;

  const summary = parseSummary(cert.test_summary);
  const resultRows = toResultRows(summary);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [17, 98, 78] },
    head: [['#', 'Parameter', 'Unit', 'Specification', 'Result', 'Status']],
    body: resultRows.length > 0 ? resultRows : [[1, 'No test summary snapshot available', '-', '-', '-', '-']],
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' },
      1: { cellWidth: 50 },
      2: { cellWidth: 18 },
      3: { cellWidth: 48 },
      4: { cellWidth: 28 },
      5: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || !summary[data.row.index]) return;
      const row = summary[data.row.index];
      if (row.is_ctq) {
        const failed = ['fail', 'conditional'].includes(String(row.result_status || '').toLowerCase());
        if (failed) {
          data.cell.styles.fillColor = [255, 230, 230];
          data.cell.styles.textColor = [168, 7, 26];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  y = (doc.lastAutoTable?.finalY || y) + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Result Summary', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 5;
  doc.text(`Overall Result: ${toLabel(cert.overall_result)}`, margin, y);
  y += 4.5;
  doc.text(`Parameters Passed: ${cert.parameters_passed || 0} / ${cert.parameters_tested || 0}`, margin, y);
  y += 4.5;
  doc.text(`Tested By: ${cert.tested_by_name || '-'}`, margin, y);
  y += 4.5;
  doc.text(`Approved By: ${cert.approved_by_name || '-'}`, margin, y);

  if (cert.conditions) {
    y += 4.5;
    doc.text(`Conditions: ${cert.conditions}`, margin, y, { maxWidth: 180 });
  }

  y += 9;
  const verifyToken = cert.verification_token || '';
  const verifyUrl = verifyToken ? `${verifyBaseUrl}/${verifyToken}` : 'Verification token unavailable';

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(`Verify: ${verifyUrl}`, margin, y, { maxWidth: 185 });

  const safeNumber = String(cert.certificate_number || `COA-${cert.id || 'draft'}`)
    .replace(/[^A-Za-z0-9_-]/g, '_');

  doc.save(`${safeNumber}.pdf`);
}

export default generateCOAPdf;
