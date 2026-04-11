import React from 'react';

const ExportActions = ({ rep, toProperCase }) => {
  const handlePrint = () => {
    window.print();
  };

  const handleExportHTML = () => {
    const reportHtml = document.querySelector('.report-container').outerHTML;
    const blob = new Blob([`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${toProperCase(rep)}</title>
        <style>
          ${document.querySelector('style')?.textContent || ''}
        </style>
      </head>
      <body>${reportHtml}</body>
      </html>
    `], { type: 'text/html' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sales_Report_${rep}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-section">
      <div className="export-actions">
        <button 
          className="export-btn"
          onClick={handlePrint}
        >
          📄 Print Report
        </button>
        <button 
          className="export-btn"
          onClick={handleExportHTML}
        >
          💾 Export HTML
        </button>
      </div>
    </div>
  );
};

export default ExportActions;
