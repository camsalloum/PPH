import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCurrency } from '../../contexts/CurrencyContext';
import './PDFExport.css';

// Refined helper to handle colors, ensuring transparent is handled correctly.
const rgbToHex = (rgbString) => {
  if (!rgbString || rgbString === 'transparent' || rgbString.includes('rgba(0, 0, 0, 0)')) {
    return null; // Return null for autotable to use default (which we'll set to white)
  }
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#FFFFFF';
  const [, r, g, b] = match.map(Number);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const PDFExport = ({ tableRef, selectedDivision }) => {
  const { companyCurrency } = useCurrency();
  const currencyCode = companyCurrency?.code || 'AED';
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExportToPDF = () => {
    setIsExporting(true);
    setError(null);

    try {
      const financialTable = tableRef.current.querySelector('.financial-table');
      if (!financialTable) {
        throw new Error('Financial table not found for export.');
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3',
      });
      
      const pageMargins = { top: 25, right: 10, bottom: 15, left: 10 };
      const availableWidth = doc.internal.pageSize.getWidth() - pageMargins.left - pageMargins.right;
      
      // --- Precision Scaling Calculation ---
      const tableWidthInPx = financialTable.offsetWidth;
      const pxToMmScale = 25.4 / 96; // 1 inch = 25.4 mm, 1 inch = 96 dpi (standard screen)
      const tableWidthInMm = tableWidthInPx * pxToMmScale;
      
      let scaleFactor = 1;
      if (tableWidthInMm > availableWidth) {
        scaleFactor = availableWidth / tableWidthInMm;
      }
      

      // Add Title
      const title = `Financials - ${selectedDivision}`;
      doc.setFontSize(18);
      doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
      
      const subtitle = `(${currencyCode})`;
      doc.setFontSize(12);
      doc.text(subtitle, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

      autoTable(doc, {
        html: financialTable,
        startY: pageMargins.top,
        margin: pageMargins,
        theme: 'grid',
        tableWidth: 'auto', // Let the library calculate widths based on our scaled content
        // Set a white background as the default for all cells.
        styles: {
          fillColor: '#FFFFFF', 
          lineWidth: 0.1, 
          lineColor: '#DDDDDD',
          overflow: 'linebreak', // Aggressively wrap text
          cellPadding: 0.5, // Reduce padding globally
        },
        pageBreak: 'avoid', // Instruct library to avoid splitting table across pages
        columnStyles: {
          0: { cellWidth: 50 }, // Force the first column to be 50mm wide.
        },
        didParseCell: function (data) {
          const cell = data.cell.raw;
          if (!cell) return;

          // --- CORRECTED FIX ---
          // Specifically target the top-left empty header cell.
          if (data.row.section === 'head' && data.row.index === 0 && data.column.index === 0) {
            // Remove only top and left borders to maintain grid alignment.
            data.cell.styles.lineWidth = { top: 0, left: 0, right: 0.1, bottom: 0.1 };
            data.cell.styles.lineColor = '#DDDDDD'; // Match the rest of the grid
            data.cell.styles.fillColor = '#FFFFFF'; // Ensure background is white
            return; // Skip all other style processing for this specific cell.
          }

          const styles = window.getComputedStyle(cell);

          // --- Border Customization based on Cell Content ---
          // REMOVED 'Sales' from this list to prevent its border from being altered.
          const sectionHeaderTexts = [
            'Cost of Sales', 'Gross profit (after Depn.)', 'Gross profit (before Depn.)', 
            'Selling expenses', 'Total Below GP Expenses', 'Total Expenses', 'Net Profit', 'EBIT', 'EBITDA'
          ];
          
          const cellText = data.cell.text[0] ? data.cell.text[0].trim() : '';

          // Check if the cell is a section header in the first column
          if (data.column.index === 0 && sectionHeaderTexts.includes(cellText)) {
            // Remove top and left borders specifically for these section headers
            data.cell.styles.lineWidth = { top: 0, right: 0.1, bottom: 0.1, left: 0 };
          } else {
            // For all other cells, apply default grid lines
            data.cell.styles.lineWidth = 0.1;
            data.cell.styles.lineColor = '#DDDDDD';
          }
          
          // Override default white background ONLY if cell has a specific color
          const fillColor = rgbToHex(styles.backgroundColor);
          if (fillColor) {
            data.cell.styles.fillColor = fillColor;
          }
          
          data.cell.styles.textColor = rgbToHex(styles.color) || '#000000';
          data.cell.styles.halign = styles.textAlign;
          data.cell.styles.valign = styles.verticalAlign;

          // Apply a much more aggressive, calculated scale factor to the font size
          const baseFontSize = parseFloat(styles.fontSize) * (72 / 96);
          data.cell.styles.fontSize = baseFontSize * scaleFactor * 0.85; // Drastic scaling

          // Font style
          const fontWeight = styles.fontWeight;
          const fontStyle = styles.fontStyle;
          let finalFontStyle = 'normal';
          if (fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700) finalFontStyle = 'bold';
          if (fontStyle === 'italic') finalFontStyle = finalFontStyle === 'bold' ? 'bolditalic' : 'italic';
          data.cell.styles.fontStyle = finalFontStyle;
        },
      });

      // Add explanation below the table
      const finalY = doc.lastAutoTable.finalY || 100;
      doc.setFontSize(9);
      doc.setTextColor('#666666');
      doc.text('★ = Sorting by Base Period highest to lowest | Δ% = (Actual − Reference) / Reference × 100 for Budget/Est/Fcst; YoY = (Current − Previous) / Previous × 100', 10, finalY + 10);

      doc.save(`Financial_Table_${selectedDivision}_${new Date().toISOString().slice(0, 10)}.pdf`);

    } catch (err) {
      console.error('PDF Export failed:', err);
      setError(err.message || 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="pdf-export-controls">
      <button 
        onClick={handleExportToPDF}
        disabled={isExporting}
        className="export-pdf-btn"
      >
        {isExporting ? 'Exporting PDF...' : 'Export to PDF'}
      </button>
      
      {error && (
        <div className="export-error">
          {error}
        </div>
      )}
    </div>
  );
};

export default PDFExport;