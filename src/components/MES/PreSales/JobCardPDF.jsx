/**
 * JobCardPDF — A4 printable job card using jsPDF
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

export function generateJobCardPDF(jobCard) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('INTERPLAST — Flexible Packaging', pw / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.text('JOB CARD', pw / 2, y, { align: 'center' });
  y += 10;

  // Job info
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const info = [
    ['Job Number', jobCard.job_number || '—'],
    ['Customer', jobCard.customer_name || '—'],
    ['Inquiry', jobCard.inquiry_number || '—'],
    ['Quantity', `${jobCard.quantity || '—'} ${jobCard.quantity_unit || ''}`],
    ['Delivery Date', jobCard.required_delivery_date ? dayjs(jobCard.required_delivery_date).format('DD MMM YYYY') : '—'],
    ['Status', (jobCard.status || '').toUpperCase()],
    ['Material Status', (jobCard.material_status || '').toUpperCase()],
  ];
  autoTable(doc, {
    startY: y, body: info, theme: 'grid',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    styles: { fontSize: 9 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Product specs
  if (jobCard.product_specs && typeof jobCard.product_specs === 'object') {
    doc.setFont(undefined, 'bold');
    doc.text('Product Specifications', 14, y);
    y += 4;
    const specRows = Object.entries(jobCard.product_specs).map(([k, v]) => [k, String(v ?? '—')]);
    if (specRows.length) {
      autoTable(doc, {
        startY: y, body: specRows, theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
        styles: { fontSize: 8 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // BOM table
  const bom = Array.isArray(jobCard.material_requirements) ? jobCard.material_requirements : [];
  if (bom.length) {
    doc.setFont(undefined, 'bold');
    doc.text('Bill of Materials', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Material', 'Qty Required', 'Qty Available', 'Status']],
      body: bom.map(r => [
        r.material_name || '—',
        r.qty_required ?? '—',
        r.qty_available ?? '—',
        r.qty_available >= r.qty_required ? 'Available' : 'Short',
      ]),
      theme: 'grid', styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // Signature blocks
  if (y > 250) { doc.addPage(); y = 20; }
  const sigY = Math.max(y, 240);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.line(14, sigY, 80, sigY);
  doc.text('Production Manager', 14, sigY + 5);
  doc.line(pw - 80, sigY, pw - 14, sigY);
  doc.text('QC Manager', pw - 80, sigY + 5);

  return doc;
}

export default function JobCardPDFButton({ jobCard }) {
  const handlePrint = () => {
    const doc = generateJobCardPDF(jobCard);
    doc.save(`${jobCard.job_number || 'job-card'}.pdf`);
  };

  return (
    <button onClick={handlePrint} style={{ cursor: 'pointer', background: 'none', border: '1px solid #d9d9d9', borderRadius: 4, padding: '4px 12px' }}>
      Print Job Card PDF
    </button>
  );
}
