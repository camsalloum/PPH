import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import MultiChartHTMLExport from './MultiChartHTMLExport';
import './ColumnConfigGrid.css';
import { 
  getAvailableColorOptions, 
  getColumnColorPalette, 
  getReadableTextColor, 
  lightenColor 
} from './utils/colorUtils';

const PREDEFINED_COLOR_SCHEMES = getAvailableColorOptions();

const ColumnConfigGrid = ({ productGroupTableRef }) => {
  const { 
    columnOrder, 
    updateColumnOrder, 
    removeColumn, 
    clearAllColumns, 
    generateData, 
    dataGenerated,
    saveAsStandardSelection,
    clearStandardSelection,
    basePeriodIndex,
    setBasePeriod,
    clearBasePeriod,
    chartVisibleColumns,
    toggleChartColumnVisibility,
    isColumnVisibleInChart,
    selectedColumnIndex,
    setSelectedColumnIndex
  } = useFilter();
  
  const { selectedDivision } = useExcelData();
  
  const [standardSaved, setStandardSaved] = useState(false);
  const colorInputRef = useRef(null);
  
  // Handle Clear All with resetting selection
  const handleClearAll = () => {
    clearAllColumns();
    setSelectedColumnIndex(null); // Reset selected column when clearing all
    clearBasePeriod(); // Reset base period when clearing all
  };
  
  // Handle data generation
  const handleGenerate = () => {
    if (columnOrder.length > 0) {
      generateData();
    }
  };
  
  // Move a column left in the order
  const moveLeft = (index) => {
    if (index > 0) {
      const newOrder = [...columnOrder];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      updateColumnOrder(newOrder);
    }
  };
  
  // Move a column right in the order
  const moveRight = (index) => {
    if (index < columnOrder.length - 1) {
      const newOrder = [...columnOrder];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      updateColumnOrder(newOrder);
    }
  };
  
  const selectedColumn = useMemo(() => (
    selectedColumnIndex !== null ? columnOrder[selectedColumnIndex] : null
  ), [selectedColumnIndex, columnOrder]);

  // Get CSS class for column based on its config
  const getColumnClass = (column) => {
    const baseClass = 'config-column';
    if (column.customColorHex) {
      return `${baseClass} scheme-custom`;
    }
    if (column.customColor) {
      return `${baseClass} scheme-${column.customColor}`;
    }

    // Default to classic blue if no custom color
    return `${baseClass} scheme-classicBlue`;
  };
  
  // Get background color for column (for inline styling)
  const getColumnStyle = (column, isSelected = false) => {
    // Start with bold font style for all columns
    const baseStyle = { fontWeight: 'bold' };
    const palette = getColumnColorPalette(column);
    return {
      ...baseStyle,
      background: palette.gradient,
      color: palette.text,
      boxShadow: isSelected ? '0 0 5px 2px rgba(0,0,0,0.3)' : 'none'
    };
  };
  
  // Handle column click to select it
  const handleColumnClick = (index) => {
    setSelectedColumnIndex(index === selectedColumnIndex ? null : index);
  };
  
  // Handle remove column
  const handleRemoveColumn = () => {
    if (selectedColumnIndex !== null) {
      removeColumn(columnOrder[selectedColumnIndex].id);
      setSelectedColumnIndex(null);
    }
  };
  
  // Set custom color for the selected column
  const setColumnColor = (colorScheme) => {
    if (selectedColumnIndex !== null) {
      const newOrder = [...columnOrder];
      const updatedColumn = {
        ...newOrder[selectedColumnIndex]
      };

      if (colorScheme === 'custom') {
        // Trigger color picker UI
        if (colorInputRef.current) {
          colorInputRef.current.click();
        }
        return;
      }

      updatedColumn.customColor = colorScheme;
      delete updatedColumn.customColorHex;
      delete updatedColumn.customColorText;
      delete updatedColumn.customColorLight;
      delete updatedColumn.customColorSecondary;
      newOrder[selectedColumnIndex] = updatedColumn;
      updateColumnOrder(newOrder);
    }
  };

  const applyCustomColor = (hexValue) => {
    if (selectedColumnIndex === null || !hexValue) return;
    const colorHex = hexValue.startsWith('#') ? hexValue : `#${hexValue}`;
    const newOrder = [...columnOrder];
    const updatedColumn = {
      ...newOrder[selectedColumnIndex],
      customColor: 'custom',
      customColorHex: colorHex.toUpperCase(),
      customColorText: getReadableTextColor(colorHex),
      customColorLight: lightenColor(colorHex, 0.78),
      customColorSecondary: lightenColor(colorHex, 0.4)
    };
    newOrder[selectedColumnIndex] = updatedColumn;
    updateColumnOrder(newOrder);
  };

  const handleCustomColorInput = (event) => {
    const value = event?.target?.value;
    if (value) {
      applyCustomColor(value);
    }
  };

  const handleCustomColorButton = () => {
    if (colorInputRef.current) {
      colorInputRef.current.click();
    }
  };
  
  // Handle saving as standard selection
  const handleSaveAsStandard = async () => {
    try {
      const success = await saveAsStandardSelection();
      if (success) {
        setStandardSaved(true);
        // Reset the saved state after 2 seconds
        setTimeout(() => setStandardSaved(false), 2000);
      } else {
        alert('Failed to save standard configuration. Please check the backend connection.');
      }
    } catch (error) {
      console.error('Error saving standard configuration:', error);
      alert('Failed to save standard configuration. Please try again.');
    }
  };

  // Handle clearing standard selection
  const handleClearStandard = async () => {
    try {
      const success = await clearStandardSelection();
      if (success) {
        setStandardSaved(false);
      } else {
        alert('Failed to clear standard configuration. Please check the backend connection.');
      }
    } catch (error) {
      console.error('Error clearing standard configuration:', error);
      alert('Failed to clear standard configuration. Please try again.');
    }
  };
  


  return (
    <div className="column-config-container">
      <div className="column-config-header">
        <div className="header-title-actions">
          <h3>Period Configuration</h3>
          <div className="header-buttons-container">
            {columnOrder.length > 0 && (
              <>
                <div className="standard-buttons">
                  <button 
                    onClick={handleSaveAsStandard} 
                    className={`standard-btn ${standardSaved ? 'saved' : ''}`}
                    title="Save current selection as standard"
                  >
                    {standardSaved ? 'Saved as Standard!' : 'Save as Standard'}
                  </button>
                  <button 
                    onClick={handleClearStandard} 
                    className="clear-standard-btn"
                    title="Clear standard selection"
                  >
                    Clear Standard
                  </button>
                </div>
                <div className="action-buttons">
                <button onClick={handleGenerate} className="generate-btn" disabled={dataGenerated}>
                  {dataGenerated ? 'Generated' : 'Generate'}
                </button>
                <button onClick={handleClearAll} className="clear-all-btn">
                  Clear All
                </button>
                </div>
              </>
            )}
          </div>
        </div>
        {selectedColumnIndex !== null && (
          <div className="column-actions">
            <button onClick={() => moveLeft(selectedColumnIndex)} disabled={selectedColumnIndex === 0}>
              ← Move Left
            </button>
            <button onClick={() => moveRight(selectedColumnIndex)} disabled={selectedColumnIndex === columnOrder.length - 1}>
              Move Right →
            </button>
            <button onClick={handleRemoveColumn} className="remove-btn">
              Remove
            </button>
            <div className="color-selector">
              <span>Color Scheme:</span>
              <div className="color-options">
                {PREDEFINED_COLOR_SCHEMES.map((scheme) => {
                  const isSelected = !!selectedColumn && !selectedColumn.customColorHex && selectedColumn.customColor === scheme.name;
                  return (
                    <div 
                      key={scheme.name} 
                      className={`color-option${isSelected ? ' selected' : ''}`}
                      style={{ 
                        backgroundColor: scheme.primary,
                        borderColor: scheme.secondary || scheme.primary
                      }}
                      onClick={() => setColumnColor(scheme.name)}
                      title={scheme.label}
                    />
                  );
                })}
                <div
                  className={`color-option custom-option${selectedColumn?.customColorHex ? ' selected' : ''}`}
                  onClick={handleCustomColorButton}
                  title="Custom Color"
                  style={{
                    backgroundColor: selectedColumn?.customColorHex || 'transparent',
                    borderColor: selectedColumn?.customColorHex ? selectedColumn.customColorHex : '#ccc'
                  }}
                >
                  {!selectedColumn?.customColorHex && <span>+</span>}
                </div>
                <input
                  ref={colorInputRef}
                  type="color"
                  className="color-picker-input"
                  onChange={handleCustomColorInput}
                  value={selectedColumn?.customColorHex || '#288cfa'}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="config-grid">
        {columnOrder.length > 0 ? (
          <>
            {/* Base period selector row aligned with columns */}
            <div className="config-row base-period-row">
              {columnOrder.map((column, index) => (
                <div
                  key={`base-period-${index}`}
                  className={`base-period-selector${basePeriodIndex === index ? ' selected' : ''}${basePeriodIndex !== null && basePeriodIndex !== index ? ' faded' : ''}`}
                  onClick={() => setBasePeriod(index)}
                  title={basePeriodIndex === index ? 'Base Period' : 'Set as Base Period'}
                >
                  {basePeriodIndex === index ? '★' : '☆'}
                </div>
              ))}
              <div className="row-description">
                <strong><em>Select a column as the base period for comparisons</em></strong>
              </div>
            </div>
            {/* End base period selector row */}
            {/* Chart visibility row */}
            <div className="config-row chart-visibility-row">
              {columnOrder.map((column, index) => (
                <div
                  key={`chart-visibility-${index}`}
                  className={`chart-visibility-selector${isColumnVisibleInChart(column.id) ? ' visible' : ' hidden'}`}
                  onClick={() => toggleChartColumnVisibility(column.id)}
                  title={isColumnVisibleInChart(column.id) ? 'Visible in Chart (click to hide)' : 'Hidden from Chart (click to show)'}
                >
                  {isColumnVisibleInChart(column.id) ? '✓' : ''}
                </div>
              ))}
              <div className="row-description">
                <strong><em>Select which columns appear in charts</em></strong>
              </div>
            </div>
            {/* End chart visibility row */}
            <div className="config-row year-row">
              {columnOrder.map((column, index) => (
                <div 
                  key={`year-${index}`} 
                  className={`config-column ${selectedColumnIndex === index ? 'selected' : ''}`}
                  style={getColumnStyle(column, selectedColumnIndex === index)}
                  onClick={() => handleColumnClick(index)}
                >
                  {column.year}
                </div>
              ))}
            </div>
            <div className="config-row period-row">
              {columnOrder.map((column, index) => (
                <div 
                  key={`period-${index}`} 
                  className={`config-column ${selectedColumnIndex === index ? 'selected' : ''}`}
                  style={getColumnStyle(column, selectedColumnIndex === index)}
                  onClick={() => handleColumnClick(index)}
                >
                  {column.isCustomRange ? column.displayName : column.month}
                </div>
              ))}
            </div>
            <div className="config-row type-row">
              {columnOrder.map((column, index) => (
                <div 
                  key={`type-${index}`} 
                  className={`config-column ${selectedColumnIndex === index ? 'selected' : ''}`}
                  style={getColumnStyle(column, selectedColumnIndex === index)}
                  onClick={() => handleColumnClick(index)}
                >
                  {column.type}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="no-columns-message">
            No columns configured. Please select options from above and click "Add Column".
          </div>
        )}
      </div>
      {/* Add Generate Complete Report buttons at the bottom */}
      <div className="export-buttons-container">
        {dataGenerated && (
          <MultiChartHTMLExport />
        )}
      </div>
    </div>
  );
};

export default ColumnConfigGrid;
