import React, { useState } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import './FilterPanel.css';

// Maximum number of columns allowed - must match with the value in FilterContext
const MAX_COLUMNS = 5;

const FilterPanel = () => {
  const { 
    availableFilters, 
    addColumn,
    columnOrder,
    fullYear,
    areMonthsSequential,
    formatMonthRange,
    addYear
  } = useFilter();
  
  // Local state for the current selections
  const [currentSelection, setCurrentSelection] = useState({
    year: '',
    month: '',
    type: ''
  });

  // Multi-month selection state
  const [isMultiMonth, setIsMultiMonth] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState([]);
  
  const [errorMessage, setErrorMessage] = useState('');

  // Get individual months from available filters (excluding FY, Q1, Q2, Q3, Q4)
  const individualMonths = availableFilters.months.filter(month => 
    !['FY', 'Q1', 'Q2', 'Q3', 'Q4'].includes(month)
  );
  
  const handleSelectionChange = (filterType, e) => {
    const value = e.target.value;
    
    if (filterType === 'year' && value === 'ADD_NEW_YEAR') {
      const newYear = prompt("Enter new year (YYYY):");
      if (newYear) {
        if (/^\d{4}$/.test(newYear)) {
          const yearNum = parseInt(newYear, 10);
          if (yearNum >= 2000 && yearNum <= 2100) {
            const success = addYear(yearNum);
            if (success) {
              setCurrentSelection({
                ...currentSelection,
                year: yearNum
              });
            } else {
              alert("Year already exists or is invalid.");
            }
          } else {
            alert("Please enter a valid year between 2000 and 2100.");
          }
        } else {
          alert("Please enter a valid 4-digit year.");
        }
      }
      return;
    }

    setCurrentSelection({
      ...currentSelection,
      [filterType]: value
    });
  };

  const handleMultiMonthToggle = () => {
    setIsMultiMonth(!isMultiMonth);
    setSelectedMonths([]);
    setCurrentSelection(prev => ({ ...prev, month: '' }));
    setErrorMessage('');
  };

  const handleMonthSelection = (month) => {
    setSelectedMonths(prev => {
      const newSelection = prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month];
      
      // Sort by month order and check if sequential
      const sortedMonths = newSelection.sort((a, b) => 
        fullYear.indexOf(a) - fullYear.indexOf(b)
      );

      // Validate sequential requirement if more than one month
      if (sortedMonths.length > 1 && !areMonthsSequential(sortedMonths)) {
        setErrorMessage('Selected months must be consecutive (sequential).');
      } else {
        setErrorMessage('');
      }

      return newSelection;
    });
  };

  const handleAddColumn = () => {
    // Clear any previous error message
    setErrorMessage('');
    
    if (isMultiMonth) {
      // Multi-month mode
      if (currentSelection.year && selectedMonths.length > 0 && currentSelection.type) {
        // Check if we've already reached the limit
        if (columnOrder.length >= MAX_COLUMNS) {
          setErrorMessage(`Maximum limit of ${MAX_COLUMNS} columns reached. Please remove a column before adding more.`);
          return;
        }
        
        // Try to add the custom range column
        const result = addColumn(currentSelection.year, null, currentSelection.type, selectedMonths);
        
        if (!result.success) {
          setErrorMessage(result.error);
        } else {
          // Clear selections after successfully adding
          setCurrentSelection({ year: '', month: '', type: '' });
          setSelectedMonths([]);
        }
      } else {
        setErrorMessage('Please select year, months, and type.');
      }
    } else {
      // Single month mode (existing logic)
      if (currentSelection.year && currentSelection.month && currentSelection.type) {
        // Check if we've already reached the limit
        if (columnOrder.length >= MAX_COLUMNS) {
          setErrorMessage(`Maximum limit of ${MAX_COLUMNS} columns reached. Please remove a column before adding more.`);
          return;
        }
        
        // Try to add the column
        const result = addColumn(currentSelection.year, currentSelection.month, currentSelection.type);
        
        if (!result.success) {
          setErrorMessage(result.error);
        } else {
          // Clear selections after successfully adding
          setCurrentSelection({ year: '', month: '', type: '' });
        }
      } else {
        setErrorMessage('Please select year, period, and type.');
      }
    }
  };

  const isAddButtonDisabled = isMultiMonth 
    ? !currentSelection.year || selectedMonths.length === 0 || !currentSelection.type
    : !currentSelection.year || !currentSelection.month || !currentSelection.type;
  
  return (
    <div className="filter-panel">
      <div className="filter-section">
        <h3>Year</h3>
        <select
          value={currentSelection.year}
          onChange={(e) => handleSelectionChange('year', e)}
          className="filter-select single"
        >
          <option value="">Select Year</option>
          {availableFilters.years
            .slice()
            .sort((a, b) => b - a)
            .map(year => (
              <option key={year} value={year}>
                {year}
              </option>
          ))}
          <option value="ADD_NEW_YEAR" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Year...</option>
        </select>
      </div>

      <div className="filter-section">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '15px', marginBottom: '8px' }}>
          <h3 style={{ margin: '0' }}>Period</h3>
          <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={isMultiMonth}
              onChange={handleMultiMonthToggle}
            />
            Multi-Month Range
          </label>
        </div>
        
        {!isMultiMonth ? (
          // Single period selection (existing)
          <select
            value={currentSelection.month}
            onChange={(e) => handleSelectionChange('month', e)}
            className="filter-select single"
          >
            <option value="">Select Period</option>
            {availableFilters.months.map(month => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        ) : (
          // Multi-month selection
          <div className="multi-month-selector">
            <div className="month-grid">
              {individualMonths.map(month => {
                const isSelected = selectedMonths.includes(month);
                const sortedSelected = [...selectedMonths].sort((a, b) => 
                  fullYear.indexOf(a) - fullYear.indexOf(b)
                );
                const isSequential = sortedSelected.length <= 1 || areMonthsSequential(sortedSelected);
                
                return (
                  <button
                    key={month}
                    type="button"
                    className={`month-button ${isSelected ? 'selected' : ''} ${!isSequential ? 'invalid' : ''}`}
                    onClick={() => handleMonthSelection(month)}
                  >
                    {month.substring(0, 3)}
                  </button>
                );
              })}
            </div>
            {selectedMonths.length > 0 && (
              <div className="selected-range">
                Selected: {formatMonthRange(
                  [...selectedMonths].sort((a, b) => fullYear.indexOf(a) - fullYear.indexOf(b))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="filter-section">
        <h3>Type</h3>
        <select
          value={currentSelection.type}
          onChange={(e) => handleSelectionChange('type', e)}
          className="filter-select single"
        >
          <option value="">Select Type</option>
          {availableFilters.types.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      
      <div className="filter-actions">
        <h3>Actions</h3>
        <div className="action-buttons">
          <button 
            className="add-column-btn" 
            onClick={handleAddColumn}
            disabled={isAddButtonDisabled || columnOrder.length >= MAX_COLUMNS}
          >
            Add Column
          </button>
          {columnOrder.length > 0 && (
            <div className="column-count">
              Periods: {columnOrder.length}/{MAX_COLUMNS}
            </div>
          )}
        </div>
        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>
    </div>
  );
};

export default FilterPanel;