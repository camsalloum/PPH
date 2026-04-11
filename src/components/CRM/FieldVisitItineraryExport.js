/**
 * FieldVisitItineraryExport — PDF export for a field trip itinerary.
 * Renders title, dates, objectives, stops table, legs table, and expenses summary.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

const W = 210; // A4 width in mm

function drawHeader(doc, title, subtitle) {
  doc.setFillColor(24, 144, 255);
  doc.rect(0, 0, W, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, W / 2, 9, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, W / 2, 16, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

function addSection(doc, y, label) {
  if (y > 270) { doc.addPage(); y = 15; }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(label, 14, y);
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

function fmtDate(d) { return d ? dayjs(d).format('DD MMM YYYY') : '—'; }
function fmtDateTime(d) { return d ? dayjs(d).format('DD MMM HH:mm') : '—'; }

export function exportItineraryPDF(trip, expenses = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const dateRange = `${fmtDate(trip.departure_date)} – ${fmtDate(trip.return_date)}`;
  drawHeader(doc, trip.title || 'Field Trip Itinerary', dateRange);

  let y = 28;

  // Trip info table
  const infoRows = [
    ['Country', trip.country || '—'],
    ['Status', (trip.status || '').replace(/_/g, ' ')],
    ['Transport', trip.transport_mode || '—'],
    ['Type', trip.trip_type === 'international' ? 'International' : 'Domestic'],
  ];
  if (trip.budget_estimate) {
    infoRows.push(['Budget', `AED ${Number(trip.budget_estimate).toLocaleString()}`]);
  }
  autoTable(doc, {
    startY: y,
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
    margin: { left: 14 },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Objectives
  if (trip.objectives) {
    y = addSection(doc, y, 'Objectives');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(trip.objectives, W - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 4;
  }

  // Stops table
  const stops = (trip.stops || []).sort((a, b) => a.stop_order - b.stop_order);
  if (stops.length > 0) {
    y = addSection(doc, y, `Stops (${stops.length})`);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Name', 'Type', 'Date', 'Time', 'Duration', 'Outcome']],
      body: stops.map((s, i) => [
        i + 1,
        s.customer_name || s.prospect_name || s.address_snapshot || '—',
        s.stop_type || '—',
        fmtDate(s.visit_date),
        s.visit_time || '—',
        s.duration_mins ? `${s.duration_mins}m` : '60m',
        (s.outcome_status || 'planned').replace(/_/g, ' '),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255], fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Legs table
  const legs = (trip.legs || []).sort((a, b) => a.leg_order - b.leg_order);
  if (legs.length > 0) {
    y = addSection(doc, y, `Travel Legs (${legs.length})`);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Mode', 'From', 'To', 'Departure', 'Arrival', 'Ref']],
      body: legs.map((l, i) => [
        i + 1,
        l.mode || '—',
        l.from_label || '—',
        l.to_label || '—',
        fmtDateTime(l.dep_datetime),
        fmtDateTime(l.arr_datetime),
        l.booking_ref || l.flight_number || '—',
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255], fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Expenses summary
  if (expenses.length > 0) {
    y = addSection(doc, y, `Expenses (${expenses.length})`);
    const totalAED = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Description', 'Date', 'Amount (AED)']],
      body: expenses.map(e => [
        e.category || '—',
        e.description || '—',
        fmtDate(e.expense_date),
        Number(e.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255], fontSize: 8 },
      margin: { left: 14, right: 14 },
      foot: [['', '', 'Total', totalAED.toLocaleString(undefined, { minimumFractionDigits: 2 })]],
      footStyles: { fontStyle: 'bold' },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Travel notes
  if (trip.travel_notes) {
    y = addSection(doc, y, 'Travel Notes');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(trip.travel_notes, W - 28);
    doc.text(lines, 14, y);
  }

  // Footer on each page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pages}`, W / 2, 292, { align: 'center' });
    doc.text(`Generated ${dayjs().format('DD MMM YYYY HH:mm')}`, W - 14, 292, { align: 'right' });
    doc.setTextColor(0);
  }

  const safeName = (trip.title || 'trip').replace(/[^a-zA-Z0-9-_ ]/g, '').substring(0, 40);
  doc.save(`itinerary-${safeName}.pdf`);
}
