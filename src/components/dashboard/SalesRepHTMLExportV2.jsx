/**
 * SalesRepHTMLExportV2 - TRUE WYSIWYG Export
 * 
 * This captures the ENTIRE live DOM exactly as rendered, converts canvas to images,
 * and wraps it with the SAME CSS/JS infrastructure as V1.
 * 
 * The output is IDENTICAL to V1 visually, but with actual rendered content.
 */

import React, { useState } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { KPI_CSS_CONTENT } from '../../utils/sharedStyles';
import ipTransparentLogo from '../../assets/IP transparent-.jpg';

// Import the V1 export to get access to its CSS generation
// We'll extract its complete CSS section to ensure pixel-perfect matching
import SalesRepHTMLExportOriginal from './SalesRepHTMLExport';

const SalesRepHTMLExportV2 = ({
  rep,
  reportData,
  reportContainerRef,
  selectedDivision,
  yearlyBudgetTotal = 0,
  yearlySalesBudgetTotal = 0,
  yearlyBudgetAchievement = 0,
  yearlySalesBudgetAchievement = 0
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const { columnOrder, basePeriodIndex, dataGenerated } = useFilter();
  const { companyCurrency } = useCurrency();

  const toProperCase = (str) => {
    if (!str) return '';
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const formatPeriodLabel = (period) => {
    if (!period) return 'Current Period';
    if (typeof period === 'string') return period;
    const month = period.month || '';
    const year = period.year || '';
    const type = period.type || '';
    return `${month} ${year} ${type}`.trim();
  };

  // Get logo as base64 - SAME as V1
  const getBase64Logo = async () => {
    try {
      const response = await fetch(ipTransparentLogo);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Could not load logo:', error);
      return null;
    }
  };

  // Fetch chart libraries - SAME as V1
  const getChartLibraries = async () => {
    try {
      const [chartJs, chartDataLabels, echartsLib] = await Promise.all([
        fetch('/libs/chart.umd.min.js').then(r => r.text()).catch(() => ''),
        fetch('/libs/chartjs-plugin-datalabels.min.js').then(r => r.text()).catch(() => ''),
        fetch('/libs/echarts.min.js').then(r => r.text()).catch(() => '')
      ]);
      return { chartJs, chartDataLabels, echartsLib };
    } catch (error) {
      console.warn('Could not load chart libraries:', error);
      return { chartJs: '', chartDataLabels: '', echartsLib: '' };
    }
  };

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Main export function
  const handleExportV2 = async () => {
    if (!reportContainerRef?.current) {
      alert('Report container not found. Please try again.');
      return;
    }

    setIsExporting(true);
    console.log('📸 V2 Export: Starting TRUE WYSIWYG capture...');

    try {
      // Step 1: Get logo and chart libraries
      const [logoBase64, chartLibraries] = await Promise.all([
        getBase64Logo(),
        getChartLibraries()
      ]);
      console.log('✅ V2: Logo and chart libraries loaded');

      // Step 2: Get the container and identify tabs
      const container = reportContainerRef.current;
      const tabButtons = container.querySelectorAll('.tab-button');
      const tabContents = container.querySelectorAll('.tab-content');
      const originalActiveIndex = Array.from(tabButtons).findIndex(btn => btn.classList.contains('active'));

      console.log(`📸 V2: Found ${tabButtons.length} tabs and ${tabContents.length} tab contents`);
      
      // Step 3: Capture each tab's content separately with proper canvas conversion
      const tabCaptures = [];
      
      for (let i = 0; i < tabButtons.length; i++) {
        // Click this tab to render it
        tabButtons[i].click();
        // Wait 1200ms for tab content to fully render including Chart.js datalabels
        await wait(1200);
        
        // Find the active tab content
        const activeContent = container.querySelector('.tab-content.active') || 
                             container.querySelector('.tab-content[style*="display: block"]') ||
                             tabContents[i];
        
        if (activeContent) {
          console.log(`📸 V2: Tab ${i+1} active content found, inner HTML length: ${activeContent.innerHTML.length}`);
          
          // Clone this tab's content
          const tabClone = activeContent.cloneNode(true);
          
          // Convert canvases in this tab to images BEFORE the tab switches
          const originalCanvases = activeContent.querySelectorAll('canvas');
          const clonedCanvases = tabClone.querySelectorAll('canvas');
          
          console.log(`📸 V2: Tab ${i+1} has ${originalCanvases.length} canvases`);
          
          originalCanvases.forEach((originalCanvas, canvasIndex) => {
            try {
              // Get actual dimensions from the canvas
              const rect = originalCanvas.getBoundingClientRect();
              const width = rect.width || originalCanvas.offsetWidth || originalCanvas.width;
              const height = rect.height || originalCanvas.offsetHeight || originalCanvas.height;
              
              if (width > 0 && height > 0) {
                const dataUrl = originalCanvas.toDataURL('image/png');
                const img = document.createElement('img');
                img.src = dataUrl;
                img.style.width = width + 'px';
                img.style.height = height + 'px';
                img.style.maxWidth = '100%';
                img.style.display = 'block';
                img.className = originalCanvas.className;
                
                if (clonedCanvases[canvasIndex] && clonedCanvases[canvasIndex].parentNode) {
                  clonedCanvases[canvasIndex].parentNode.replaceChild(img, clonedCanvases[canvasIndex]);
                  console.log(`✅ V2: Tab ${i+1} canvas ${canvasIndex + 1} converted (${width}x${height})`);
                }
              } else {
                console.warn(`⚠️ V2: Tab ${i+1} canvas ${canvasIndex + 1} has zero dimensions`);
              }
            } catch (e) {
              console.warn(`⚠️ V2: Tab ${i+1} canvas ${canvasIndex + 1} error:`, e.message);
            }
          });
          
          // Get the button text for tab label
          const buttonText = tabButtons[i].innerHTML;
          
          tabCaptures.push({
            index: i,
            buttonHTML: buttonText,
            contentHTML: tabClone.innerHTML,
            isOriginallyActive: i === originalActiveIndex
          });
        }
      }
      
      // Restore original tab
      if (tabButtons[originalActiveIndex]) {
        tabButtons[originalActiveIndex].click();
      }
      
      console.log(`📸 V2: Captured ${tabCaptures.length} tabs`);

      // Step 4: Clone the full container for non-tab content
      const clone = container.cloneNode(true);
      
      // Step 5: Remove export buttons from clone
      const exportButtons = clone.querySelectorAll('.export-btn, .html-export, .html-export-v2, [class*="export"]');
      exportButtons.forEach(btn => btn.remove());
      console.log(`✅ V2: Removed ${exportButtons.length} export buttons from clone`);
      
      // Also remove the export button container if it exists
      const exportContainer = clone.querySelector('[style*="justify-content: flex-end"][style*="background-color"]');
      if (exportContainer && exportContainer.querySelector('button')) {
        exportContainer.remove();
        console.log('✅ V2: Removed export button container');
      }
      
      // Step 6: Replace tab contents in clone with our captured content
      const clonedTabContents = clone.querySelectorAll('.tab-content');
      const clonedTabButtons = clone.querySelectorAll('.tab-button');
      
      tabCaptures.forEach((capture, idx) => {
        if (clonedTabContents[capture.index]) {
          clonedTabContents[capture.index].innerHTML = capture.contentHTML;
          // Only the first tab should be active/visible by default
          if (idx === 0) {
            clonedTabContents[capture.index].style.display = 'block';
            clonedTabContents[capture.index].classList.add('active');
          } else {
            clonedTabContents[capture.index].style.display = 'none';
            clonedTabContents[capture.index].classList.remove('active');
          }
        }
        // Update button classes - first button active
        if (clonedTabButtons[capture.index]) {
          if (idx === 0) {
            clonedTabButtons[capture.index].classList.add('active');
          } else {
            clonedTabButtons[capture.index].classList.remove('active');
          }
        }
      });
      
      // Step 7: Convert any remaining canvases to images
      const remainingCanvases = clone.querySelectorAll('canvas');
      const originalRemainingCanvases = container.querySelectorAll('canvas');
      console.log(`📸 V2: Converting ${remainingCanvases.length} remaining canvases...`);
      
      remainingCanvases.forEach((clonedCanvas, index) => {
        const originalCanvas = originalRemainingCanvases[index];
        if (originalCanvas) {
          try {
            const rect = originalCanvas.getBoundingClientRect();
            const width = rect.width || originalCanvas.offsetWidth || originalCanvas.width;
            const height = rect.height || originalCanvas.offsetHeight || originalCanvas.height;
            
            if (width > 0 && height > 0) {
              const dataUrl = originalCanvas.toDataURL('image/png');
              const img = document.createElement('img');
              img.src = dataUrl;
              img.style.width = width + 'px';
              img.style.height = height + 'px';
              img.style.maxWidth = '100%';
              img.style.display = 'block';
              img.className = clonedCanvas.className;
              
              if (clonedCanvas.parentNode) {
                clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
              }
            }
          } catch (e) {
            console.warn(`⚠️ V2: Remaining canvas ${index + 1} error:`, e.message);
          }
        }
      });

      // Step 8: Get the captured HTML
      const capturedContent = clone.innerHTML;

      // Step 9: Generate the complete HTML with V1's infrastructure
      const repName = toProperCase(rep);
      const currentPeriod = formatPeriodLabel(reportData?.basePeriod);
      const filename = `${repName.replace(/\s+/g, '_')}_Sales_Report_${currentPeriod.replace(/\s+/g, '_')}_V2.html`;

      const html = generateCompleteHTML(logoBase64, chartLibraries, capturedContent, repName, currentPeriod);

      // Step 10: Download
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✅ V2 Export: Complete!');

    } catch (error) {
      console.error('❌ V2 Export failed:', error);
      alert('Export failed: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Generate complete HTML - uses V1's EXACT CSS and structure
  const generateCompleteHTML = (logoBase64, chartLibraries, capturedContent, repName, periodLabel) => {
    const divisionName = selectedDivision || 'FP';

    // This CSS is copied EXACTLY from V1's SalesRepHTMLExport.jsx
    // to ensure pixel-perfect matching
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${repName} Sales Report</title>
    <!-- Chart.js embedded for offline use -->
    <script>
${chartLibraries.chartJs}
    </script>
    <script>
${chartLibraries.chartDataLabels}
    </script>
    <!-- ECharts embedded for offline use -->
    <script>
${chartLibraries.echartsLib}
    </script>
    <style>
        ${KPI_CSS_CONTENT}
        
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #e3f2fd;
            min-height: 100vh;
        }
        
        /* ======= EDIT MODE STYLES ======= */
        #edit-toolbar {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            gap: 10px;
            align-items: center;
            background: linear-gradient(135deg, #1e3a8a, #3b82f6);
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(30, 58, 138, 0.4);
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .toolbar-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .toolbar-btn.edit-btn {
            background: rgba(255, 255, 255, 0.15);
            color: white;
        }
        
        .toolbar-btn.edit-btn:hover {
            background: rgba(255, 255, 255, 0.25);
        }
        
        .toolbar-btn.edit-btn.active {
            background: #fbbf24;
            color: #1e3a8a;
            box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.3);
        }
        
        .toolbar-btn.save-btn {
            background: #10b981;
            color: white;
        }
        
        .toolbar-btn.save-btn:hover {
            background: #059669;
        }
        
        .toolbar-btn.print-btn {
            background: rgba(255, 255, 255, 0.15);
            color: white;
        }
        
        .toolbar-btn.print-btn:hover {
            background: rgba(255, 255, 255, 0.25);
        }
        
        .edit-status {
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 4px;
            z-index: 10;
        }
        /* ======= END EDIT MODE STYLES ======= */
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        /* UAE Dirham Symbol */
        .uae-dirham-symbol {
          display: inline-block;
          vertical-align: -0.1em;
          width: 1em;
          height: 1em;
          margin-right: 0.2em;
          fill: currentColor;
        }
        
        /* Sales Rep Report Styles */
        .sales-rep-report-content {
            padding: 20px;
            background-color: #f8f9fa;
            min-height: 100vh;
        }

        .report-container {
            max-width: 98%;
            width: 100%;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            overflow: visible;
        }

        /* Report Header */
        .report-header {
            background: linear-gradient(135deg, #4a90e2, #87ceeb);
            color: white;
            padding: 30px 20px 40px 20px;
            text-align: center;
        }

        .header-logo {
            max-height: 100px;
            max-width: 220px;
            margin-bottom: 25px;
            filter: drop-shadow(2px 2px 1px rgba(0,0,0,0.4));
        }

        .header-content h1 {
            font-size: 2.5em;
            margin: 0 0 10px 0;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            color: white !important;
        }

        .header-content h2 {
            font-size: 1.8em;
            margin: 0 0 15px 0;
            font-weight: 500;
            opacity: 0.9;
            color: white !important;
        }

        .report-period {
            font-size: 1.3em;
            opacity: 0.9;
            font-weight: 500;
            color: white !important;
        }

        .period-year {
            font-size: 1.4em;
            font-weight: 600;
            margin-bottom: 5px;
            color: white !important;
        }

        .period-type {
            font-size: 1.1em;
            font-weight: 400;
            color: white !important;
        }

        /* Report Sections */
        .report-section {
            padding: 30px;
            border-bottom: 1px solid #eee;
        }

        .report-section h2 {
            color: #667eea;
            font-size: 1.4em;
            margin-bottom: 25px;
            padding-bottom: 12px;
            border-bottom: 2px solid #667eea;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: center;
        }

        /* Metric Row */
        .metric-row {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 30px;
        }

        .metric-card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            min-width: 250px;
            max-width: 320px;
            flex: 1;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            border: 1px solid #e9ecef;
            text-align: center;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa);
            border-radius: 12px 12px 0 0;
        }

        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .metric-label {
            font-size: 0.9em;
            color: #666;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }

        .metric-value {
            font-size: 2.5em;
            font-weight: 700;
            color: #003366;
            margin-bottom: 5px;
            line-height: 1.1;
        }

        .metric-value.positive { color: #007bff; }
        .metric-value.negative { color: #dc3545; }

        .metric-previous {
            font-size: 0.9em;
            color: #666;
            font-weight: 500;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #eee;
        }

        /* Tab Styles - SAME AS V1 */
        .tab-container {
            margin-top: 20px;
        }
        
        .tab-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 20px;
            justify-content: center;
        }
        
        .tab-button {
            padding: 12px 20px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            font-size: 13px;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            text-align: center;
            line-height: 1.4;
        }
        
        .tab-button:hover {
            background: #f0f0ff;
        }
        
        .tab-button.active {
            background: #667eea;
            color: white;
        }
        
        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        
        .tab-content.active {
            display: block;
        }
        
        /* Performance Dashboard Tab styles */
        .perf-tab-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        .perf-tab-btn {
            padding: 12px 20px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            cursor: pointer;
            border-radius: 8px;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.3s;
            line-height: 1.4;
            text-align: center;
            min-width: 140px;
        }
        
        .perf-tab-btn:hover {
            background: #f0f0ff;
        }
        
        .perf-tab-btn.active {
            background: #667eea;
            color: white;
        }
        
        .perf-tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        
        .perf-tab-content.active {
            display: block;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Table Styles */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 0.9em;
        }
        
        th, td {
            padding: 10px 12px;
            text-align: center;
            border-bottom: 1px solid #e0e0e0;
        }
        
        th {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.8em;
        }
        
        /* Table row hover - must use !important to override inline styles */
        tbody tr:hover {
            background: #f0f7ff !important;
        }
        
        tbody tr:hover td {
            background: #f0f7ff !important;
        }
        
        /* Exclude total row from regular hover */
        tbody tr.total-row:hover,
        tbody tr.total-row:hover td {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
        }
        
        td:first-child, th:first-child {
            text-align: left;
        }

        /* Total row - EXACT MATCH TO LIVE CSS */
        .total-row, tr.total-row, tr[class*="total"] {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: bold;
        }
        
        .total-row td, tr.total-row td, tr[class*="total"] td {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            border: 1px solid #1e40af !important;
        }
        
        /* Delta colors */
        .positive { color: #10b981 !important; }
        .negative { color: #ef4444 !important; }
        .delta-up { color: #059669 !important; }
        .delta-down { color: #dc2626 !important; }
        
        /* ====== COMPREHENSIVE TABLE STYLES - EXACT MATCH TO LIVE ProductGroupsKgsTable.css ====== */
        /* Product Groups Container */
        .product-groups-amount-table,
        .product-groups-kgs-table {
            margin: 15px 0;
            padding: 0;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .product-groups-amount-table h3,
        .product-groups-kgs-table h3 {
            margin: 0 0 15px 0;
            font-size: 20px;
            font-weight: 600;
            color: #333;
            text-align: center;
            padding: 15px;
            background: white;
        }

        .amount-comparison-table,
        .kgs-comparison-table {
            width: 100%;
            max-width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            border-spacing: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px !important;
            background: white;
            border: 1px solid #e5e7eb;
        }

        .amount-comparison-table thead th,
        .kgs-comparison-table thead th {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: 600 !important;
            text-align: center;
            padding: 5px 4px !important;
            border: 1px solid #1e40af;
            font-size: 14px !important;
            vertical-align: middle;
            letter-spacing: 0.3px;
        }

        .amount-comparison-table .period-header,
        .kgs-comparison-table .period-header {
            background: white;
            font-size: 14px !important;
            font-weight: 600;
            text-align: center;
            vertical-align: middle;
            width: 6%;
            min-width: 50px;
            padding: 4px 3px !important;
            line-height: 1.1;
            color: #1f2937;
        }

        /* Year headers (first row) should match blue gradient */
        .amount-comparison-table thead tr:first-child .period-header,
        .kgs-comparison-table thead tr:first-child .period-header {
            font-size: 14px !important;
            font-weight: bold !important;
            padding: 5px 4px !important;
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
        }

        .amount-comparison-table .delta-header,
        .kgs-comparison-table .delta-header {
            background: linear-gradient(135deg, #1e40af, #1e3a8a) !important;
            color: #fbbf24 !important;
            font-weight: 700;
            text-align: center;
            vertical-align: middle;
            width: 4%;
            min-width: 40px;
            font-size: 14px !important;
        }

        .amount-comparison-table .product-header,
        .kgs-comparison-table .product-header {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: 600 !important;
            text-align: center;
            vertical-align: middle;
            width: 10%;
            min-width: 80px;
            font-size: 14px !important;
            padding: 5px 6px !important;
        }

        .amount-comparison-table tbody td,
        .kgs-comparison-table tbody td {
            border: 1px solid #e5e7eb !important;
            padding: 3px 5px !important;
            text-align: center;
            vertical-align: middle;
            font-size: 14px !important;
            background: white;
            color: #1f2937;
            line-height: 1.1 !important;
        }

        .amount-comparison-table tbody td:first-child,
        .kgs-comparison-table tbody td:first-child,
        .product-name,
        .row-label {
            text-align: left !important;
            font-weight: 600;
            color: #1f2937;
            background: white !important;
            padding: 3px 5px 3px 8px !important;
            font-size: 14px !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .amount-comparison-table tbody tr:hover td,
        .kgs-comparison-table tbody tr:hover td {
            background-color: #f5f5f5 !important;
        }

        /* Total row styling - EXACT MATCH */
        .amount-comparison-table .total-row,
        .kgs-comparison-table .total-row,
        .amount-comparison-table tr.total-row,
        .kgs-comparison-table tr.total-row {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
        }

        .amount-comparison-table .total-row td,
        .kgs-comparison-table .total-row td,
        .amount-comparison-table tr.total-row td,
        .kgs-comparison-table tr.total-row td,
        .total-label,
        .total-value {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: bold !important;
            font-size: 14px !important;
            padding: 4px 6px !important;
            border: 1px solid #1e40af !important;
            text-align: center;
        }

        .amount-comparison-table .total-row .total-label,
        .kgs-comparison-table .total-row .total-label {
            text-align: left !important;
            padding-left: 8px;
        }

        .amount-comparison-table .total-row:hover td,
        .kgs-comparison-table .total-row:hover td {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
        }

        /* Metric cells */
        .metric-cell {
            text-align: center;
            font-weight: 500;
            color: #374151;
            background: white;
            width: auto;
            min-width: 65px;
            padding: 3px 5px !important;
            font-size: 14px !important;
            font-variant-numeric: tabular-nums;
            line-height: 1.1 !important;
        }

        /* Delta cells */
        .delta-cell {
            background: white;
            font-weight: 600;
            text-align: center;
            width: auto;
            min-width: 55px;
            padding: 3px 4px !important;
            font-size: 14px !important;
            line-height: 1.1 !important;
        }

        .delta-arrow {
            margin-right: 3px;
            font-size: 13px;
            font-weight: bold;
        }

        .delta-value {
            font-size: 13px;
            font-weight: 600;
        }

        /* Delta cells in total row */
        .amount-comparison-table .total-row .delta-cell,
        .kgs-comparison-table .total-row .delta-cell {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            border: 1px solid #1e40af !important;
            font-size: 14px !important;
            font-weight: bold !important;
        }

        /* UNIVERSAL TABLE HOVER STYLES - Override inline styles */
        table tbody tr:not(.total-row):hover {
            background-color: #f0f7ff !important;
        }
        
        table tbody tr:not(.total-row):hover td {
            background-color: #f0f7ff !important;
        }

        .delta-cell.positive,
        .metric-cell.positive,
        td.positive {
            color: #10b981 !important;
        }

        .delta-cell.negative,
        .metric-cell.negative,
        td.negative {
            color: #ef4444 !important;
        }

        /* NEW badge for new items */
        .new-badge {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
        }

        /* Customers KGS Table specific styles */
        .customers-kgs-table {
            margin: 20px 0;
            padding: 0;
            width: 100%;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .customers-kgs-table h3 {
            margin: 0 0 20px 0;
            font-size: 22px;
            font-weight: 600;
            color: #333;
            text-align: center;
            padding: 20px;
        }

        /* Star rating cells */
        .star-cell {
            background: white !important;
            padding: 4px !important;
            text-align: center;
        }

        /* HTML Chart containers from live view */
        .html-chart-container {
            background: transparent;
            padding: 0;
            margin: 0 0 16px;
            width: 100%;
            overflow: visible;
        }
        
        /* KPI Cards from live view */
        .kpi-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .kpi-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            text-align: center;
        }
        
        /* Section styling */
        .section {
            margin-bottom: 30px;
            padding: 25px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        
        .section h2 {
            color: #667eea;
            font-size: 1.4em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        /* Chart container */
        .chart-container {
            margin: 20px 0;
            padding: 20px;
            background: white;
            border-radius: 12px;
        }
        
        .chart-container img {
            max-width: 100%;
            height: auto;
        }
        
        /* Customer insights grid */
        .customer-insights-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            grid-template-rows: auto auto;
            gap: 20px;
            margin-top: 20px;
        }

        /* ====== TOP 3 PRODUCT GROUPS STYLES ====== */
        .top-products-horizontal {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            width: 100%;
        }

        .top-product-card {
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border: 1px solid #dee2e6;
            border-left: 4px solid #667eea;
            border-radius: 12px;
            padding: 20px;
            min-width: 280px;
            max-width: 320px;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .top-product-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
        }

        .product-rank {
            display: flex;
            justify-content: center;
            margin-bottom: 8px;
        }

        .rank-icon {
            font-size: 2em;
            min-width: 40px;
            text-align: center;
        }

        .product-info {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
        }

        .top-product-card .product-info .product-name,
        .product-name {
            font-weight: bold !important;
            color: #333;
            font-size: 1.1em;
            margin-bottom: 4px;
            line-height: 1.3;
            text-align: center !important;
            width: 100%;
            display: block;
        }

        .product-percentage {
            font-size: 0.9em;
            color: #666;
            font-weight: 500;
            text-align: center;
            width: 100%;
        }

        .product-performance {
            text-align: center;
            font-weight: 600;
            font-size: 0.9em;
            padding: 6px 12px;
            border-radius: 6px;
            margin-top: auto;
        }

        .product-performance.positive {
            color: #007bff !important;
            background-color: rgba(0, 123, 255, 0.1);
        }

        .product-performance.negative {
            color: #dc3545 !important;
            background-color: rgba(220, 53, 69, 0.1);
        }

        /* ====== CUSTOMER INSIGHTS STYLES ====== */
        .customer-insights-section {
            margin-top: 40px;
            padding: 30px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border-radius: 15px;
            border: 1px solid #dee2e6;
        }

        /* Generic customer insight card with hover */
        .customer-insight-card {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border-radius: 12px;
            padding: 20px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
            border: 1px solid #dee2e6;
            position: relative;
            overflow: hidden;
        }

        .customer-insight-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa);
            border-radius: 12px 12px 0 0;
        }

        .customer-insight-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
        }

        .customer-insights-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 2px solid #667eea;
        }

        .insights-icon {
            font-size: 1.5em;
        }

        .customer-insights-header h3 {
            color: #667eea;
            font-size: 1.4em;
            font-weight: 700;
            letter-spacing: 1px;
            margin: 0;
        }

        .customer-insight-card-tall {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            grid-row: span 2;
            grid-column: 1;
            border-top: 6px solid #667eea;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
        }

        .customer-insight-card-tall:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);
        }

        .top5-list {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }

        .top5-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: #f8f9fa;
            border-radius: 8px;
            transition: all 0.2s ease;
        }

        .top5-item:hover {
            background: #e2e8f0;
            transform: translateX(5px);
        }

        .top5-item .customer-name {
            font-size: 0.95em;
            font-weight: 600;
            color: #333;
            text-align: left;
        }

        .top5-item .customer-percentage {
            font-size: 1.1em;
            font-weight: 700;
            color: #667eea;
        }

        .customer-insight-card-small {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            position: relative;
            overflow: hidden;
            border-top: 6px solid #667eea;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
        }

        .customer-insight-card-small:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);
        }

        .customer-insight-card-small:nth-child(2) {
            grid-column: 3;
            grid-row: 1;
        }

        .customer-insight-card-small:nth-child(4) {
            grid-column: 3;
            grid-row: 2;
        }

        .customer-insight-card-center {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
            overflow: hidden;
            grid-column: 2;
            grid-row: span 2;
            border-top: 6px solid #667eea;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: pointer;
        }

        .customer-insight-card-center:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);
        }

        .insight-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 15px;
        }

        .insight-icon {
            font-size: 2em;
            margin-bottom: 8px;
        }

        .insight-title {
            font-size: 0.9em;
            font-weight: 700;
            color: #667eea;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .insight-value {
            font-size: 2.5em;
            font-weight: 800;
            color: #333;
            margin: 10px 0;
        }

        .insight-subtitle {
            font-size: 0.9em;
            color: #666;
            margin: 8px 0;
        }

        .insight-footer {
            font-size: 0.85em;
            color: #888;
            margin-top: auto;
            padding-top: 10px;
        }

        .growth-positive {
            color: #10b981;
            font-weight: 600;
        }

        .growth-negative {
            color: #ef4444;
            font-weight: 600;
        }

        /* ====== GEOGRAPHIC DISTRIBUTION STYLES ====== */
        .executive-summary-section {
            margin-top: 30px;
            padding: 25px;
        }

        .kpi-section-title {
            text-align: center;
            color: #667eea;
            font-size: 1.3em;
            font-weight: 700;
            margin-bottom: 20px;
        }

        .kpi-cards.export-regions {
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
        }

        .kpi-card.large {
            min-width: 200px;
            padding: 25px;
        }

        .kpi-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 8px;
        }

        .kpi-value {
            font-size: 2em;
            font-weight: 800;
            color: #333;
        }

        .kpi-trend {
            font-size: 0.85em;
            color: #888;
            margin-top: 8px;
        }

        .uae-icon-container,
        .rotating-emoji-container,
        .region-globe-container {
            margin-bottom: 10px;
        }

        .uae-icon {
            width: 40px;
            height: 27px;
        }

        .rotating-emoji,
        .region-globe {
            font-size: 2em;
        }

        .export-connector {
            display: flex;
            justify-content: center;
            margin: 15px 0;
        }

        .export-connector__arrow,
        .export-connector__bracket {
            width: 50px;
            height: 20px;
            border: 2px solid #667eea;
            border-top: none;
        }
        
        /* Print Styles */
        @media print {
            #edit-toolbar { display: none !important; }
            body { background: white; }
            .tab-content, .perf-tab-content { display: block !important; }
            .tab-buttons, .perf-tab-buttons { display: none !important; }
        }
        
        /* Center all section titles */
        .report-section h2,
        .report-section h3,
        .section h2,
        .section h3 {
            text-align: center !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sales-rep-report-content">
            <div class="report-container" style="padding: 20px;">
                <!-- Captured Content from Live DOM -->
                ${capturedContent}
            </div>
        </div>
    </div>
    
    <script>
    // Tab Switching and Edit Mode - SAME AS V1
    (function() {
        function initTabSwitching() {
            // Handle .tab-button tabs (from live view)
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabButtons.forEach((btn, index) => {
                btn.addEventListener('click', function() {
                    tabButtons.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => {
                        c.classList.remove('active');
                        c.style.display = 'none';
                    });
                    
                    this.classList.add('active');
                    if (tabContents[index]) {
                        tabContents[index].classList.add('active');
                        tabContents[index].style.display = 'block';
                    }
                });
            });
            
            // Handle .perf-tab-btn tabs (from V1 structure)
            const perfTabButtons = document.querySelectorAll('.perf-tab-btn');
            const perfTabContents = document.querySelectorAll('.perf-tab-content');
            
            perfTabButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const targetTab = this.getAttribute('data-tab');
                    
                    perfTabButtons.forEach(btn => {
                        btn.classList.remove('active');
                        btn.style.background = 'white';
                        btn.style.color = '#667eea';
                    });
                    perfTabContents.forEach(content => {
                        content.classList.remove('active');
                        content.style.display = 'none';
                    });
                    
                    this.classList.add('active');
                    this.style.background = '#667eea';
                    this.style.color = 'white';
                    
                    const targetContent = document.getElementById(targetTab + '-tab');
                    if (targetContent) {
                        targetContent.classList.add('active');
                        targetContent.style.display = 'block';
                    }
                });
            });
        }
        
        // Initialize edit mode
        function initEditMode() {
            const toolbar = document.createElement('div');
            toolbar.id = 'edit-toolbar';
            toolbar.innerHTML = \`
                <button id="edit-toggle-btn" class="toolbar-btn edit-btn" title="Enable Edit Mode">
                    ✏️ Edit Mode
                </button>
                <button id="save-btn" class="toolbar-btn save-btn" title="Save Changes" style="display: none;">
                    💾 Save HTML
                </button>
                <button id="print-btn" class="toolbar-btn print-btn" title="Print Report">
                    🖨️ Print
                </button>
                <span id="edit-status" class="edit-status"></span>
            \`;
            document.body.appendChild(toolbar);
            
            let isEditMode = false;
            
            document.getElementById('edit-toggle-btn').addEventListener('click', function() {
                isEditMode = !isEditMode;
                const editBtn = this;
                const saveBtn = document.getElementById('save-btn');
                const status = document.getElementById('edit-status');
                
                if (isEditMode) {
                    editBtn.innerHTML = '🔒 Exit Edit Mode';
                    editBtn.classList.add('active');
                    saveBtn.style.display = 'inline-flex';
                    status.innerHTML = '📝 Click any text to edit';
                    status.style.color = '#059669';
                    document.body.classList.add('edit-mode-active');
                    
                    document.querySelectorAll('.metric-value, .kpi-value, td, .insight-value, p, span').forEach(el => {
                        el.contentEditable = 'true';
                        el.style.outline = '2px dashed transparent';
                        el.style.outlineOffset = '2px';
                    });
                } else {
                    editBtn.innerHTML = '✏️ Edit Mode';
                    editBtn.classList.remove('active');
                    saveBtn.style.display = 'none';
                    status.innerHTML = '';
                    document.body.classList.remove('edit-mode-active');
                    
                    document.querySelectorAll('[contenteditable]').forEach(el => {
                        el.contentEditable = 'false';
                        el.style.outline = '';
                    });
                }
            });
            
            document.getElementById('save-btn').addEventListener('click', function() {
                const html = document.documentElement.outerHTML;
                const blob = new Blob(['<!DOCTYPE html>' + html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = document.title.replace(/\\s+/g, '_') + '_edited.html';
                link.click();
                URL.revokeObjectURL(url);
            });
            
            document.getElementById('print-btn').addEventListener('click', () => window.print());
        }
        
        function initializeAll() {
            // Set first tab as active
            const firstTabBtn = document.querySelector('.tab-button');
            const firstTabContent = document.querySelector('.tab-content');
            if (firstTabBtn && firstTabContent) {
                firstTabBtn.classList.add('active');
                firstTabContent.classList.add('active');
                firstTabContent.style.display = 'block';
            }
            
            initTabSwitching();
            initEditMode();
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initializeAll, 300));
        } else {
            setTimeout(initializeAll, 300);
        }
    })();
    </script>
</body>
</html>`;
  };

  return (
    <button 
      onClick={handleExportV2}
      disabled={isExporting || !dataGenerated}
      className="export-btn html-export-v2"
      style={{ 
        padding: '10px 20px',
        background: isExporting ? '#6c757d' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: isExporting || !dataGenerated ? 'not-allowed' : 'pointer',
        opacity: isExporting || !dataGenerated ? 0.6 : 1,
        fontSize: '14px',
        fontWeight: '600',
        transition: 'all 0.3s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
      }}
      title={!dataGenerated ? "Please generate data first" : "V2 Export - Captures actual live view (WYSIWYG)"}
    >
      {isExporting ? '⏳ Capturing...' : '📸 Export V2'}
    </button>
  );
};

export default SalesRepHTMLExportV2;
