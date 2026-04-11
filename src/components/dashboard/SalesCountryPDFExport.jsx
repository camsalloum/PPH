import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDivisionNameSync } from '../../utils/useDivisionNames';
import './PDFExport.css';

// Enhanced color helper to convert RGB to HEX
const rgbToHex = (rgbString) => {
  if (!rgbString || rgbString === 'transparent' || rgbString.includes('rgba(0, 0, 0, 0)')) {
    return null;
  }
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#FFFFFF';
  const [, r, g, b] = match.map(Number);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

// Function to determine if a color is light or dark
const isLightColor = (hexColor) => {
  if (!hexColor || hexColor === '#FFFFFF') return true;
  
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance using the standard formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return true if light (luminance > 0.5), false if dark
  return luminance > 0.5;
};

// Extract styles from HTML element
const extractElementStyles = (element) => {
  const computedStyle = window.getComputedStyle(element);
  const backgroundColor = rgbToHex(computedStyle.backgroundColor);
  const textColor = rgbToHex(computedStyle.color);
  const fontWeight = computedStyle.fontWeight;
  const fontSize = parseInt(computedStyle.fontSize);
  
  return {
    backgroundColor,
    textColor,
    fontWeight,
    fontSize,
    isBold: fontWeight === 'bold' || parseInt(fontWeight) >= 600
  };
};

// Enhanced delta content processing with PDF-safe characters
const processDeltaContent = (element) => {
  if (!element) return '0%';
  
  const originalText = element.textContent.trim();
  
  // Handle completely empty cells
  if (!originalText || originalText === '') {
    return '0%';
  }
  
  // Check if this is a delta cell with div structure
  if (element.classList.contains('delta-cell')) {
    // Look for the flex div structure: <div><span>arrow</span><span>percentage</span></div>
    const flexDiv = element.querySelector('div[style*="display: flex"]');
    if (flexDiv) {
      const spans = flexDiv.querySelectorAll('span');
      if (spans.length >= 2) {
        const arrowSpan = spans[0];
        const percentageSpan = spans[1];
        
        const arrow = arrowSpan.textContent.trim();
        const percentage = percentageSpan.textContent.trim();
        
        // Handle empty percentage
        if (!percentage || percentage === '' || percentage === '0.0%' || percentage === '0%') {
          return '0%';
        }
        
        // Use ASCII characters that work reliably in PDF
        let indicator = '';
        if (arrow === '▲' || arrow === '\u2191' || arrow === '↑') {
          indicator = '+'; // ASCII plus for positive
        } else if (arrow === '▼' || arrow === '\u2193' || arrow === '↓') {
          indicator = '-'; // ASCII minus for negative  
        }
        
        // Clean percentage and extract numeric value
        let cleanPercentage = percentage.replace(/[%+\-]/g, '');
        
        // Format the result with clear indicators
        if (indicator === '+') {
          return `+${cleanPercentage}%`;
        } else if (indicator === '-') {
          return `-${cleanPercentage}%`;
        } else {
          return `${cleanPercentage}%`;
        }
      }
    }
    
    // Fallback: try to parse the text directly
    const text = originalText;
    
    // Handle patterns like "▲+13.2%" or "▼-28.0%"
    const match = text.match(/([▲▼↑↓])\s*([+-]?\d+\.?\d*)%?/);
    if (match) {
      const arrow = match[1];
      const value = match[2];
      
      if (arrow === '▲' || arrow === '↑') {
        return `+${value}%`;
      } else if (arrow === '▼' || arrow === '↓') {
        return `-${value}%`;
      }
      
      return `${value}%`;
    }
  }
  
  // Final cleanup - if we still have arrows, convert to +/-
  return originalText
    .replace(/▲/g, '+')
    .replace(/▼/g, '-')
    .replace(/↑/g, '+')
    .replace(/↓/g, '-')
    .replace(/\s+/g, '')
    .trim() || '0%';
};

const SalesCountryPDFExport = ({ tableRef, selectedDivision }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExportToPDF = () => {
    setIsExporting(true);
    setError(null);

    try {
      const financialTable = tableRef.current.querySelector('.financial-table');
      if (!financialTable) {
        throw new Error('Sales by Country table not found for export.');
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      
      const pageMargins = { top: 25, right: 10, bottom: 15, left: 10 };
      
      // Add Title - selectedDivision from ExcelData context is already just the division name
      const getDivisionDisplayName = () => {
        // Use dynamic division names from cache
        return getDivisionNameSync(selectedDivision);
      };
      
      const title = `Sales by Country - ${getDivisionDisplayName()}`;
      doc.setFontSize(18);
      doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
      
      const subtitle = '(%)';
      doc.setFontSize(12);
      doc.text(subtitle, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

      // Analyze table structure to identify delta columns
      const headerCells = financialTable.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
      const columnStyles = { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 } };
      
      // Identify delta columns and set narrower width
      headerCells.forEach((cell, index) => {
        if (cell.textContent.includes('Difference') || cell.classList.contains('delta-header')) {
          columnStyles[index] = { 
            halign: 'center', 
            cellWidth: 15, // Much narrower for delta columns
            fontSize: 7
          };
        }
      });

      // Export table using autoTable with HTML-matching colors and fonts
      autoTable(doc, {
        html: financialTable,
        startY: 30,
        margin: pageMargins,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 1.5,
          halign: 'center',
          valign: 'middle',
          lineColor: '#ddd',
          lineWidth: 0.5,
          minCellHeight: 6
        },
        headStyles: {
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          minCellHeight: 6
        },
        columnStyles: columnStyles,
                  didParseCell: function(data) {
            const element = data.cell.raw;
            if (!element) return;
            
            // Check if this is the star indicator row (first row should be white)
            if (element.textContent.includes('★')) {
              data.cell.text = ['*']; // Use ASCII asterisk instead of Unicode star
              data.cell.styles.fillColor = false; // No background color (white)
              data.cell.styles.textColor = '#FFD700';
              data.cell.styles.fontSize = 14;
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.lineWidth = 0; // No borders for star row
              data.cell.styles.halign = 'center';
              return;
            }
            
            // Handle empty cells in star row - keep them white
            if (data.row.index === 0 && (!element.textContent || element.textContent.trim() === '')) {
              data.cell.styles.fillColor = false;
              data.cell.styles.lineWidth = 0;
              return;
            }
            
            // Extract actual styles from HTML element
            const styles = extractElementStyles(element);
            
            // Special handling for delta cells
            if (element.classList && element.classList.contains('delta-cell')) {
              data.cell.text = [processDeltaContent(element)];
              data.cell.styles.fillColor = '#f8f9fa';
              data.cell.styles.fontSize = 7;
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = '#000000'; // Black text on light gray
              data.cell.styles.halign = 'center'; // Force center alignment
              data.cell.styles.valign = 'middle';
              return;
            }
            
            // Special handling for country names (first column)
            if (data.column.index === 0 && data.row.index > 0) {
              data.cell.styles.fillColor = '#f8f9fa';
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.halign = 'left';
              data.cell.styles.textColor = '#000000'; // Black text on light gray
              return;
            }
            
            // Apply background color from HTML
            if (styles.backgroundColor && styles.backgroundColor !== '#FFFFFF') {
              data.cell.styles.fillColor = styles.backgroundColor;
              
              // Apply proper text color based on background brightness
              if (isLightColor(styles.backgroundColor)) {
                data.cell.styles.textColor = '#000000'; // Black text on light backgrounds
              } else {
                data.cell.styles.textColor = '#FFFFFF'; // White text on dark backgrounds  
              }
            } else {
              // No background color, use black text
              data.cell.styles.textColor = '#000000';
            }
            
            // Apply bold font if present
            if (styles.isBold) {
              data.cell.styles.fontStyle = 'bold';
            }
            
            // For data cells (non-headers), apply exact HTML background colors
            if (element.tagName === 'TD' && styles.backgroundColor && styles.backgroundColor !== '#FFFFFF') {
              data.cell.styles.fillColor = styles.backgroundColor;
              
              // Set text color based on background
              if (isLightColor(styles.backgroundColor)) {
                data.cell.styles.textColor = '#000000';
              } else {
                data.cell.styles.textColor = '#FFFFFF';
              }
            }
          }
      });

      // Add explanation below the table
      const finalY = doc.lastAutoTable.finalY || 100;
      doc.setFontSize(9);
      doc.setTextColor('#666666');
      doc.text('★ = Sorting by Base Period highest to lowest | Δ% = (Actual − Reference) / Reference × 100 for Budget/Est/Fcst; YoY = (Current − Previous) / Previous × 100', 10, finalY + 10);

      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `Sales_by_Country_${selectedDivision}_${timestamp}.pdf`;
      
      doc.save(filename);

    } catch (err) {
      console.error('Sales by Country PDF Export failed:', err);
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
        title="Export Sales by Country table to PDF"
      >
        {isExporting ? 'Exporting PDF...' : 'Export to PDF'}
      </button>
      
      {error && (
        <div className="export-error">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default SalesCountryPDFExport; 