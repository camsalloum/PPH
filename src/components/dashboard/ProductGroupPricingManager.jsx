import React, { useEffect, useMemo, useState } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import CurrencySymbol from './CurrencySymbol';
import './MaterialPercentageManager.css';

// Supported divisions - dynamically fetched from backend if needed
// For now, keeping static list but can be made dynamic
const SUPPORTED_DIVISIONS = ['fp', 'sb', 'tf', 'hcm'];

// Validation constants
const MIN_ROUNDED_VALUE = 0;
const MAX_ROUNDED_VALUE = 1000;

const ProductGroupPricingManager = () => {
  const { selectedDivision } = useExcelData();
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [pricingData, setPricingData] = useState([]);
  const [pricingFields, setPricingFields] = useState([]); // Dynamically loaded
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [roundedValues, setRoundedValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [addFieldError, setAddFieldError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const divisionCode = useMemo(() => {
    if (!selectedDivision) return null;
    return selectedDivision.split('-')[0].toLowerCase();
  }, [selectedDivision]);

  useEffect(() => {
    setAvailableYears([]);
    setSelectedYear(null);
    setPricingData([]);
    setRoundedValues({});
    setPricingFields([]);
    setError('');
    setInfoMessage('');

    if (!divisionCode) {
      return;
    }

    if (!SUPPORTED_DIVISIONS.includes(divisionCode)) {
      setInfoMessage(`📝 Pricing view not yet supported for ${selectedDivision}.`);
      return;
    }

    // Load pricing fields first, then available years
    loadPricingFields(divisionCode);
    fetchAvailableYears(divisionCode);
  }, [divisionCode, selectedDivision]);

  useEffect(() => {
    if (!divisionCode || !selectedYear) return;
    
    // Create abort controller to cancel previous requests when year changes
    const abortController = new AbortController();
    
    // Load data first, then auto-refresh if needed
    loadPricingAndRoundedData(divisionCode, selectedYear, abortController.signal).then(() => {
      // After loading, check if we need to auto-refresh actuals for this year
      if (divisionCode === 'fp' && !abortController.signal.aborted) {
        autoRefreshActualsIfNeeded(selectedYear);
      }
    });
    
    // Cleanup: abort request if component unmounts or dependencies change
    return () => {
      abortController.abort();
    };
  }, [divisionCode, selectedYear]);

  const fetchAvailableYears = async (division) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/${division}/master-data/product-pricing-years`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to load years');
      }

      const years = (result.data || []).sort((a, b) => b - a);
      setAvailableYears(years);

      if (years.length > 0) {
        const currentYear = new Date().getFullYear();
        const defaultYear = years.includes(currentYear) ? currentYear : years[0];
        setSelectedYear(defaultYear);
      } else {
        setInfoMessage('No Actual data found for pricing view.');
      }
    } catch (err) {
      console.error('Error loading pricing years:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPricingFields = async (division) => {
    try {
      const response = await fetch(`/api/config/pricing-fields/${division}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to load pricing fields');
      }

      const fields = result.data || [];
      setPricingFields(fields);
    } catch (err) {
      console.error('Error loading pricing fields:', err);
      // Don't show error - pricing fields loading failure is not critical
      // Default to hardcoded fields if dynamic load fails
      setPricingFields([
        { code: 'asp_round', name: 'Selling Price' },
        { code: 'morm_round', name: 'Margin over RM' },
        { code: 'rm_round', name: 'RM Price' }
      ]);
    }
  };

  const handleAddPricingField = async () => {
    if (!newFieldName.trim()) {
      setAddFieldError('Please enter a field name');
      return;
    }

    setAddFieldError('');
    setSaving(true);

    try {
      const response = await fetch(`/api/config/pricing-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: newFieldName.trim().toLowerCase().replace(/\s+/g, '_'),
          name: newFieldName.trim(),
          division: divisionCode,
          min_value: 0,
          max_value: MAX_ROUNDED_VALUE
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to add pricing field');
      }

      // Reload pricing fields
      await loadPricingFields(divisionCode);

      setSaveMessage(`✅ Pricing field "${newFieldName}" added successfully`);
      setNewFieldName('');
      setShowAddField(false);
      setTimeout(() => setSaveMessage(''), 3000);

    } catch (error) {
      console.error('Error adding pricing field:', error);
      setAddFieldError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePricingField = async (field) => {
    if (!window.confirm(`Are you sure you want to remove "${field.name}"? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/config/pricing-fields`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: field.code
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to remove pricing field');
      }

      // Reload pricing fields
      await loadPricingFields(divisionCode);

      setSaveMessage(`✅ Pricing field "${field.name}" removed successfully`);
      setTimeout(() => setSaveMessage(''), 3000);

    } catch (error) {
      console.error('Error removing pricing field:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const autoRefreshActualsIfNeeded = async (year) => {
    // Check if any product group has data for this year
    const hasDataForYear = pricingData.some(row => row.monthsWithData > 0);
    
    if (!hasDataForYear && divisionCode === 'fp') {
      // No data for this year - silently trigger refresh
      try {
        const response = await fetch(`/api/${divisionCode}/master-data/refresh-actual-pricing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: divisionCode.toUpperCase(),
            year: year
          })
        });

        const result = await response.json();
        if (result.success) {
          // Reload data to show updated values
          const abortController = new AbortController();
          await loadPricingAndRoundedData(divisionCode, year, abortController.signal);
          setSaveMessage(`✅ Pricing data loaded for year ${year}`);
          setTimeout(() => setSaveMessage(''), 3000);
        }
      } catch (err) {
        console.error('Auto-refresh failed:', err);
        // Don't show error to user for auto-refresh failures
      }
    }
  };

  const loadPricingAndRoundedData = async (division, year, abortSignal) => {
    setLoading(true);
    setError('');
    setInfoMessage('');
    setSaveMessage('');

    try {
      let rows = [];
      let roundedMap = {};

      // Use year-aware endpoints for all divisions (including FP)
      // These endpoints query fp_actualcommon for actual pricing per year
      const [pricingResponse, roundedResponse] = await Promise.all([
        fetch(`/api/${division}/master-data/product-pricing?year=${year}`, {
          signal: abortSignal
        }),
        fetch(`/api/${division}/master-data/product-pricing-rounded?year=${year}`, {
          signal: abortSignal
        })
      ]);

      if (abortSignal?.aborted) return;

      const pricingResult = await pricingResponse.json();
      if (!pricingResult.success) {
        throw new Error(pricingResult.message || 'Failed to load pricing data');
      }

      const roundedResult = await roundedResponse.json();
      if (!roundedResult.success) {
        throw new Error(roundedResult.message || 'Failed to load rounded values');
      }

      if (abortSignal?.aborted) return;

      rows = pricingResult.data || [];
      setPricingData(rows);

      roundedMap = {};
      (roundedResult.data || []).forEach(row => {
        const pgName = row.product_group || row.productGroup;
        roundedMap[pgName] = {
          aspRound: formatStoredRoundedValue(row.asp_round ?? row.aspRound),
          mormRound: formatStoredRoundedValue(row.morm_round ?? row.mormRound),
          rmRound: formatStoredRoundedValue(row.rm_round ?? row.rmRound)
        };
      });
      setRoundedValues(roundedMap);

      if (rows.length === 0) {
        setInfoMessage('No pricing records found for the selected year.');
      }
    } catch (err) {
      // Don't show error if request was aborted (user switched years)
      if (err.name === 'AbortError' || abortSignal?.aborted) {
        return;
      }
      console.error('Error loading pricing data:', err);
      setError(err.message);
    } finally {
      // Only update loading state if not aborted
      if (!abortSignal?.aborted) {
        setLoading(false);
      }
    }
  };

  const handleYearChange = (event) => {
    const { value } = event.target;
    if (!value) {
      setSelectedYear(null);
      setPricingData([]);
      setInfoMessage('Select a year to view pricing averages.');
      return;
    }
    setSelectedYear(parseInt(value, 10));
  };

  const validateRoundedValue = (value) => {
    if (value === '' || value === null || value === undefined) {
      return { valid: true, value: null, error: null };
    }
    const num = parseFloat(value);
    if (!Number.isFinite(num)) {
      return { valid: false, value: null, error: 'Invalid number' };
    }
    if (num < MIN_ROUNDED_VALUE) {
      return { valid: false, value: null, error: `Value must be ≥ ${MIN_ROUNDED_VALUE}` };
    }
    if (num > MAX_ROUNDED_VALUE) {
      return { valid: false, value: null, error: `Value must be ≤ ${MAX_ROUNDED_VALUE}` };
    }
    return { valid: true, value: num, error: null };
  };

  const handleRoundedChange = (productGroup, field, value) => {
    const validation = validateRoundedValue(value);
    if (!validation.valid && validation.error) {
      // Show error but allow typing (will validate on blur)
      setError(validation.error);
      setTimeout(() => setError(''), 3000);
    }
    setRoundedValues(prev => ({
      ...prev,
      [productGroup]: {
        ...prev[productGroup],
        [field]: value
      }
    }));
  };

  const handleRoundedBlur = (productGroup, field) => {
    setRoundedValues(prev => {
      const currentValue = prev[productGroup]?.[field];
      const validation = validateRoundedValue(currentValue);
      if (!validation.valid) {
        // Clear invalid value
        return {
          ...prev,
          [productGroup]: {
            ...prev[productGroup],
            [field]: ''
          }
        };
      }
      if (validation.value === null) {
        return prev; // Keep empty
      }
      const formatted = validation.value.toFixed(2);
      return {
        ...prev,
        [productGroup]: {
          ...prev[productGroup],
          [field]: formatted
        }
      };
    });
  };

  const formatStoredRoundedValue = (value) => {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(2);
  };

  const parseNumericInput = (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };

  const handleClearAllRoundedValues = () => {
    if (window.confirm('Are you sure you want to clear all rounded values for this year? This action cannot be undone.')) {
      setRoundedValues({});
      setSaveMessage('Rounded values cleared. Click Save to persist changes.');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const hasUnsavedChanges = () => {
    return Object.keys(roundedValues).length > 0 && 
           Object.values(roundedValues).some(entry => 
             entry.aspRound || entry.mormRound
           );
  };

  const handleSaveRoundedValues = async () => {
    if (!divisionCode || !selectedYear) return;

    // Validate all values before saving
    const validationErrors = [];
    pricingData.forEach(row => {
      const entry = roundedValues[row.productGroup] || {};
      if (entry.aspRound) {
        const aspVal = validateRoundedValue(entry.aspRound);
        if (!aspVal.valid) {
          validationErrors.push(`${row.productGroup} - ASP: ${aspVal.error}`);
        }
      }
      if (entry.mormRound) {
        const mormVal = validateRoundedValue(entry.mormRound);
        if (!mormVal.valid) {
          validationErrors.push(`${row.productGroup} - MoRM: ${mormVal.error}`);
        }
      }
    });

    if (validationErrors.length > 0) {
      setError(`Validation errors:\n${validationErrors.join('\n')}`);
      setTimeout(() => setError(''), 5000);
      return;
    }

    setSaving(true);
    setSaveMessage('');
    setError('');

    try {
      const payload = pricingData.map(row => {
        const entry = roundedValues[row.productGroup] || {};
        const aspRounded = parseNumericInput(entry.aspRound);
        const mormRounded = parseNumericInput(entry.mormRound);
        const rmValue = aspRounded !== null && mormRounded !== null
          ? parseFloat((aspRounded - mormRounded).toFixed(2))
          : null;
        return {
          productGroup: row.productGroup,
          aspRound: aspRounded,
          mormRound: mormRounded,
          rmRound: rmValue
        };
      });

      // Save to unified fp_product_group_master table
      const response = await fetch(`/api/${divisionCode}/master-data/product-group-master-rounded`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: divisionCode.toUpperCase(),
          year: selectedYear,
          roundedData: payload
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save rounded values');
      }

      setSaveMessage('✅ Rounded values saved successfully');
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (err) {
      console.error('Error saving rounded values:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshActuals = async () => {
    if (!divisionCode || !selectedYear) return;

    // Only FP division supports refresh for now
    if (divisionCode !== 'fp') {
      setError('Refresh actuals is only available for FP division');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!window.confirm(`Refresh actual pricing from fp_actualcommon for year ${selectedYear}? This will recalculate ASP, MoRM, and RM values.`)) {
      return;
    }

    setRefreshing(true);
    setSaveMessage('');
    setError('');

    try {
      const response = await fetch(`/api/${divisionCode}/master-data/refresh-actual-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: divisionCode.toUpperCase(),
          year: selectedYear
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to refresh actual pricing');
      }

      setSaveMessage(`✅ Actual pricing refreshed successfully (${result.data?.updatedCount || 0} rows updated)`);
      setTimeout(() => setSaveMessage(''), 4000);

      // Reload data to show updated values
      loadPricingAndRoundedData(divisionCode, selectedYear);
    } catch (err) {
      console.error('Error refreshing actual pricing:', err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  if (!selectedDivision) {
    return (
      <div className="material-percentage-container">
        <div className="coming-soon-state">
          <p>⚠️ Please select a division to view product pricing.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="material-percentage-container">
        <div className="loading-state">
          <p>Loading pricing data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="material-percentage-container">
        <div className="error-state">
          <p>❌ {error}</p>
          <button onClick={() => fetchAvailableYears(divisionCode)} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (infoMessage && pricingData.length === 0) {
    return (
      <div className="material-percentage-container">
        <div className="coming-soon-state">
          <p>{infoMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="material-percentage-container">
      <div className="material-percentage-header">
        <h3>
          Product Group Pricing - {selectedDivision}{' '}
          <span className="currency-caption">
            (<CurrencySymbol /> / Kg)
          </span>
        </h3>
        <div className="header-actions" style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Year (Actual)
            </label>
            <select
              value={selectedYear || ''}
              onChange={handleYearChange}
              className="refresh-button"
              style={{ minWidth: 140 }}
            >
              {availableYears.length === 0 && <option value="">No years</option>}
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => setShowAddField(true)}
            disabled={saving}
            className="add-material-button"
            title="Add a new pricing field"
          >
            ➕ Add Pricing Field
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                if (divisionCode && selectedYear) {
                  const abortController = new AbortController();
                  loadPricingAndRoundedData(divisionCode, selectedYear, abortController.signal);
                }
              }}
              disabled={!selectedYear || loading}
              className="refresh-button"
            >
              Refresh
            </button>
            {divisionCode === 'fp' && (
              <button
                onClick={handleRefreshActuals}
                disabled={!selectedYear || refreshing}
                className="refresh-button"
                style={{ background: '#10b981' }}
                title="Recalculate actual pricing from fp_actualcommon"
              >
                {refreshing ? '⏳ Refreshing...' : '🔄 Refresh Actuals'}
              </button>
            )}
            {hasUnsavedChanges() && (
              <button
                onClick={handleClearAllRoundedValues}
                disabled={saving}
                className="refresh-button"
                style={{ background: '#6c757d' }}
              >
                Clear All
              </button>
            )}
            <button
              onClick={handleSaveRoundedValues}
              disabled={!selectedYear || saving || !hasUnsavedChanges()}
              className="initialize-button"
              title={!hasUnsavedChanges() ? 'No changes to save' : 'Save all rounded values'}
            >
              {saving ? 'Saving...' : 'Save Rounded Values'}
            </button>
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className="message-bar success">
          {saveMessage}
        </div>
      )}

      <div className="material-percentage-table-container">
        <table className="material-percentage-table">
          <thead>
            <tr>
              <th rowSpan={2} className="product-group-header">Product Group</th>
              <th colSpan={2} className="metric-group-header">
                Selling Price
              </th>
              <th colSpan={2} className="metric-group-header">
                Margin over RM
              </th>
              <th colSpan={2} className="metric-group-header">
                RM Price <span className="table-subtext-inline">(= ASP - AMGP)</span>
              </th>
            </tr>
            <tr>
              <th className="metric-sub-header">AVG</th>
              <th className="metric-sub-header">Round</th>
              <th className="metric-sub-header">AVG</th>
              <th className="metric-sub-header">Round</th>
              <th className="metric-sub-header">AVG</th>
              <th className="metric-sub-header">Round</th>
            </tr>
          </thead>
          <tbody>
            {pricingData.map((row, index) => {
              const avgRMPrice = (row.avgSellingPrice || 0) - (row.avgMarginOverRM || 0);
              const roundingEntry = roundedValues[row.productGroup] || {};
              return (
                <tr key={`${row.productGroup}-${index}`} className="product-row">
                  <td className="product-group-cell">
                    <div>{row.productGroup}</div>
                    {row.monthsWithData ? (
                      <div className="table-subtext">{row.monthsWithData} month(s) of Actual data</div>
                    ) : (
                      <div className="table-subtext">No Actual KGS recorded</div>
                    )}
                  </td>
                  <td className="material-cell pricing-cell avg-column">
                    {formatValue(row.avgSellingPrice)}
                  </td>
                  <td className="material-cell round-cell round-column">
                    <div className="round-input-wrapper">
                      <input
                        type="number"
                        step="0.01"
                        min={MIN_ROUNDED_VALUE}
                        max={MAX_ROUNDED_VALUE}
                        value={roundingEntry.aspRound ?? ''}
                        onChange={(e) => handleRoundedChange(row.productGroup, 'aspRound', e.target.value)}
                        onBlur={() => handleRoundedBlur(row.productGroup, 'aspRound')}
                        className="round-input"
                        disabled={row.monthsWithData === 0}
                        title={row.monthsWithData === 0 ? 'No Actual data available for this product group' : 'Enter rounded ASP value'}
                      />
                      {roundingEntry.aspRound && (
                        <span className="saved-indicator" title="Value will be saved">✓</span>
                      )}
                    </div>
                  </td>
                  <td className="material-cell pricing-cell avg-column">
                    {formatValue(row.avgMarginOverRM)}
                  </td>
                  <td className="material-cell round-cell round-column">
                    <div className="round-input-wrapper">
                      <input
                        type="number"
                        step="0.01"
                        min={MIN_ROUNDED_VALUE}
                        max={MAX_ROUNDED_VALUE}
                        value={roundingEntry.mormRound ?? ''}
                        onChange={(e) => handleRoundedChange(row.productGroup, 'mormRound', e.target.value)}
                        onBlur={() => handleRoundedBlur(row.productGroup, 'mormRound')}
                        className="round-input"
                        disabled={row.monthsWithData === 0}
                        title={row.monthsWithData === 0 ? 'No Actual data available for this product group' : 'Enter rounded MoRM value'}
                      />
                      {roundingEntry.mormRound && (
                        <span className="saved-indicator" title="Value will be saved">✓</span>
                      )}
                    </div>
                  </td>
                  <td className="material-cell pricing-cell avg-column">
                    {formatValue(avgRMPrice)}
                  </td>
                  <td className="material-cell pricing-cell round-column">
                    {(() => {
                      const aspRounded = parseNumericInput(roundingEntry.aspRound);
                      const mormRounded = parseNumericInput(roundingEntry.mormRound);
                      if (aspRounded === null || mormRounded === null) {
                        return <span className="pending-round-value">—</span>;
                      }
                      const rmRounded = (aspRounded - mormRounded).toFixed(2);
                      return <span className="calculated-round-value">{rmRounded}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>
        Averages consider only the months with Actual KGS data in the selected year. If a year has fewer than 12 months of Actual entries, the
        averages are based solely on the available months.
      </p>

      {showAddField && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h4>Add New Pricing Field</h4>
            <input
              type="text"
              placeholder="Enter field name (e.g., Additional Charge)"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              className="material-input"
              onKeyPress={(e) => e.key === 'Enter' && handleAddPricingField()}
            />
            {addFieldError && <p className="error-message">{addFieldError}</p>}
            <div className="modal-actions">
              <button
                onClick={handleAddPricingField}
                disabled={saving}
                className="confirm-button"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddField(false);
                  setNewFieldName('');
                  setAddFieldError('');
                }}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductGroupPricingManager;

