import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, message, Spin, InputNumber, Select } from 'antd';
import { DownloadOutlined, ReloadOutlined, SaveOutlined, EditOutlined } from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import { useFilter } from '../../../contexts/FilterContext';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import axios from 'axios';

/**
 * ForecastSalesTab Component  
 * Product Group Forecast Sales with user-selected base year
 * 
 * Data Sources (Dynamic based on year availability):
 * - Base Year (ACTUAL/ESTIMATE): fp_actualcommon (12 months = ACTUAL) or fp_product_group_estimates (< 12 months = ESTIMATE)
 * - Base +1 (Budget): fp_divisional_budget - read only  
 * - Base +2, +3 (Forecast): fp_forecast_sales - editable
 * 
 * @param {boolean} isActive - Whether this tab is currently active
 * @param {function} onSaveComplete - Callback to notify parent when save completes (for P&L auto-refresh)
 */
const ForecastSalesTab = ({ isActive, onSaveComplete }) => {
  const { selectedDivision } = useExcelData();
  const { basePeriodIndex, columnOrder } = useFilter();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false); // Shows "Saved ✓" briefly after save
  const [productGroups, setProductGroups] = useState([]);
  const [forecastPeriods, setForecastPeriods] = useState([]);
  const [forecastInputs, setForecastInputs] = useState({}); // { "ProductGroup|Year": { kgs, slsPerKg, rmPerKg } }
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [servicesChargesInputs, setServicesChargesInputs] = useState({}); // { "Year": { sales } } for Services Charges
  
  // Year selection state
  const [availableYears, setAvailableYears] = useState([]);
  const [yearMetadata, setYearMetadata] = useState({});  // { year: { monthCount, status: 'ACTUAL'|'ESTIMATE' } }
  const [selectedBaseYear, setSelectedBaseYear] = useState(null);

  // Define the metrics to display for each product group
  const metricsToShow = ['KGS', 'Sales', 'MoRM', 'Sls/Kg', 'RM/kg', 'MoRM/Kg', 'MoRM %'];
  // Input fields (editable) for Base +2 and +3
  const inputMetrics = ['KGS', 'Sls/Kg', 'RM/kg'];

  // Fetch available years and their metadata on mount
  useEffect(() => {
    if (selectedDivision) {
      fetchAvailableYears();
    }
  }, [selectedDivision]);

  // Fetch forecast data when base year changes
  useEffect(() => {
    if (selectedDivision && selectedBaseYear) {
      fetchForecastData();
    }
  }, [selectedDivision, selectedBaseYear]);

  // Re-fetch when tab becomes active
  useEffect(() => {
    if (isActive && selectedDivision && selectedBaseYear) {
      fetchForecastData();
    }
  }, [isActive]);

  /**
   * Fetch available years and their ACTUAL/ESTIMATE status
   */
  const fetchAvailableYears = async () => {
    try {
      const response = await axios.get('/api/aebf/filter-options', {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const years = response.data.data.filterOptions.year || [];
        setAvailableYears(years.sort((a, b) => b - a));
        
        // Capture year metadata (ACTUAL vs ESTIMATE)
        if (response.data.data.yearMetadata) {
          setYearMetadata(response.data.data.yearMetadata);
        }
        
        // Set default year (most recent with 12 months, or just most recent)
        if (years.length > 0 && !selectedBaseYear) {
          const metadata = response.data.data.yearMetadata || {};
          // Prefer the most recent ACTUAL year, or fall back to most recent
          const actualYears = years.filter(y => metadata[y]?.status === 'ACTUAL');
          setSelectedBaseYear(actualYears.length > 0 ? actualYears[0] : years[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
    }
  };

  /**
   * Calculate derived metrics from input values
   */
  const calculateMetrics = useCallback((kgs, slsPerKg, rmPerKg) => {
    const sales = kgs * slsPerKg;
    const mormPerKg = slsPerKg - rmPerKg;
    const morm = kgs * mormPerKg;
    const mormPercent = sales > 0 ? (morm / sales) * 100 : 0;
    
    return {
      kgs,
      sales,
      morm,
      slsPerKg,
      rmPerKg,
      mormPerKg,
      mormPercent
    };
  }, []);

  /**
   * Get metric key mapping
   */
  const getMetricKey = (metric) => {
    const mapping = {
      'KGS': 'kgs',
      'Sales': 'sales',
      'MoRM': 'morm',
      'Sls/Kg': 'slsPerKg',
      'RM/kg': 'rmPerKg',
      'MoRM/Kg': 'mormPerKg',
      'MoRM %': 'mormPercent'
    };
    return mapping[metric] || metric.toLowerCase();
  };

  /**
   * Fetch Budget totals from Divisional Budget API
   */
  const fetchBudgetTotals = async (year) => {
    try {
      const response = await axios.get(`/api/forecast-sales/divisional-budget-totals/${selectedDivision}/${year}`);
      
      if (!response.data.success) return {};
      return response.data.data;
    } catch (error) {
      console.error('Error fetching budget totals:', error);
      return {};
    }
  };

  /**
   * Fetch saved forecast data from unified projections table
   */
  const fetchSavedForecast = async (year) => {
    try {
      const response = await axios.get(`/api/aebf/projections/${selectedDivision}/${year}/totals`, {
        params: { type: 'FORECAST' }
      });
      
      if (!response.data.success) return {};
      return response.data.data;
    } catch (error) {
      console.error('Error fetching saved forecast:', error);
      return {};
    }
  };

  /**
   * Fetch ACTUAL data from fp_actualcommon (for years with 12 months of data)
   */
  const fetchActualData = async (year) => {
    try {
      const response = await axios.get(`/api/aebf/product-group-totals`, {
        params: { 
          division: selectedDivision,
          year: year
        }
      });
      
      if (!response.data.success) return {};

      // Response.data.data.productGroups is already an object keyed by pgcombine
      return response.data.data.productGroups || {};
    } catch (error) {
      console.error('Error fetching actual data:', error);
      return {};
    }
  };

  /**
   * Fetch ESTIMATE data from unified projections table
   */
  const fetchEstimateDataFromTable = async (year) => {
    try {
      const response = await axios.get(`/api/aebf/projections/${selectedDivision}/${year}/totals`, {
        params: { type: 'ESTIMATE' }
      });
      
      if (!response.data.success) return {};

      // Response.data.data is already an object keyed by product group
      return response.data.data || {};
    } catch (error) {
      console.error('Error fetching estimate data:', error);
      return {};
    }
  };

  /**
   * Fetch FORECAST data from unified projections table
   */
  const fetchForecastFromTable = async (year) => {
    try {
      const response = await axios.get(`/api/aebf/projections/${selectedDivision}/${year}/totals`, {
        params: { type: 'FORECAST' }
      });
      
      if (!response.data.success) return {};
      return response.data.data || {};
    } catch (error) {
      console.error('Error fetching forecast data:', error);
      return {};
    }
  };

  /**
   * Fetch base year data - ACTUAL or ESTIMATE based on year metadata
   */
  const fetchBaseYearData = async (year) => {
    const meta = yearMetadata[year];
    if (meta && meta.status === 'ACTUAL') {
      return await fetchActualData(year);
    } else {
      // Try estimate table first, fall back to actual if no data
      const estimateData = await fetchEstimateDataFromTable(year);
      if (Object.keys(estimateData).length > 0) {
        return estimateData;
      }
      // Fall back to actual data (partial year)
      return await fetchActualData(year);
    }
  };

  /**
   * Fetch all forecast data from APIs
   */
  const fetchForecastData = async () => {
    setLoading(true);
    try {
      if (!selectedBaseYear) {
        message.warning('Please select a base year');
        setLoading(false);
        return;
      }

      const baseYear = selectedBaseYear;
      const baseMeta = yearMetadata[baseYear];
      // Convert status to proper case (ACTUAL → Actual, ESTIMATE → Estimate)
      const rawStatus = baseMeta?.status || 'ESTIMATE';
      const baseStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
      
      // Define forecast periods
      const periods = [
        { year: baseYear, type: baseStatus, label: `FY ${baseYear} (${baseStatus})`, editable: false },
        { year: baseYear + 1, type: 'Budget', label: `FY ${baseYear + 1} (Budget)`, editable: false },
        { year: baseYear + 2, type: 'Forecast', label: `FY ${baseYear + 2} (Forecast)`, editable: true },
        { year: baseYear + 3, type: 'Forecast', label: `FY ${baseYear + 3} (Forecast)`, editable: true }
      ];
      
      setForecastPeriods(periods);

      // Fetch data from all sources in parallel
      const [baseData, budgetData, forecast2Data, forecast3Data] = await Promise.all([
        fetchBaseYearData(baseYear),
        fetchBudgetTotals(baseYear + 1),
        fetchSavedForecast(baseYear + 2),
        fetchSavedForecast(baseYear + 3)
      ]);

      // Get list of all product groups
      const allProductGroups = new Set([
        ...Object.keys(baseData),
        ...Object.keys(budgetData),
        ...Object.keys(forecast2Data),
        ...Object.keys(forecast3Data)
      ]);

      // Add standard product groups if none found
      if (allProductGroups.size === 0) {
        ['Commercial Items Plain', 'Commercial Items Printed', 'Industrial Items Plain', 
         'Industrial Items Printed', 'Shrink Film Printed', 'Laminates', 'Others'
        ].forEach(pg => allProductGroups.add(pg));
      }

      // Build product groups with metrics
      // Sort alphabetically with Others second-to-last and Services Charges last
      const productGroupsData = Array.from(allProductGroups).sort((a, b) => {
        const pgA = (a || '').toUpperCase().trim();
        const pgB = (b || '').toUpperCase().trim();
        
        // Services Charges always last
        if (pgA === 'SERVICES CHARGES') return 1;
        if (pgB === 'SERVICES CHARGES') return -1;
        
        // Others always second-to-last
        if (pgA === 'OTHERS') return 1;
        if (pgB === 'OTHERS') return -1;
        
        // Everything else alphabetical
        return a.localeCompare(b);
      }).map(pgName => {
        const base = baseData[pgName] || {};
        const budget = budgetData[pgName] || {};
        const forecast2 = forecast2Data[pgName] || {};
        const forecast3 = forecast3Data[pgName] || {};

        return {
          name: pgName,
          metrics: metricsToShow.map(metric => {
            const metricKey = getMetricKey(metric);
            return {
              type: metric,
              data: [
                base[metricKey] || 0,
                budget[metricKey] || 0,
                forecast2[metricKey] || 0,
                forecast3[metricKey] || 0
              ]
            };
          })
        };
      });

      setProductGroups(productGroupsData);

      // Initialize input state for editable periods
      const inputs = {};
      const scInputs = {}; // Services Charges inputs
      productGroupsData.forEach(pg => {
        [baseYear + 2, baseYear + 3].forEach((year, yearIdx) => {
          const key = `${pg.name}|${year}`;
          const forecastData = yearIdx === 0 ? forecast2Data[pg.name] : forecast3Data[pg.name];
          
          // For Services Charges, store sales separately (MoRM = Sales)
          if (pg.name === 'Services Charges') {
            scInputs[year] = {
              sales: forecastData?.sales || 0
            };
          } else {
            inputs[key] = {
              kgs: forecastData?.kgs || 0,
              slsPerKg: forecastData?.slsPerKg || 0,
              rmPerKg: forecastData?.rmPerKg || 0
            };
          }
        });
      });
      setForecastInputs(inputs);
      setServicesChargesInputs(scInputs);
      setHasChanges(false);

      message.success('Forecast data loaded');
    } catch (error) {
      console.error('Error loading forecast data:', error);
      message.error('Failed to load forecast data');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle input change for editable cells
   */
  const handleInputChange = (productGroup, year, field, value) => {
    const key = `${productGroup}|${year}`;
    
    const updatedInputs = {
      ...forecastInputs,
      [key]: {
        ...forecastInputs[key],
        [field]: value || 0
      }
    };
    setForecastInputs(updatedInputs);
    setHasChanges(true);

    // Update productGroups state with calculated values
    setProductGroups(prev => prev.map(pg => {
      if (pg.name !== productGroup) return pg;

      const periodIdx = forecastPeriods.findIndex(p => p.year === year);
      if (periodIdx === -1) return pg;

      const currentInput = updatedInputs[key];
      const calculated = calculateMetrics(
        currentInput.kgs,
        currentInput.slsPerKg,
        currentInput.rmPerKg
      );

      return {
        ...pg,
        metrics: pg.metrics.map(metric => {
          const metricKey = getMetricKey(metric.type);
          const newData = [...metric.data];
          newData[periodIdx] = calculated[metricKey] || 0;
          return { ...metric, data: newData };
        })
      };
    }));
  };

  /**
   * Handle Services Charges Sales input change
   * For Services Charges: MoRM = Sales (no material cost)
   */
  const handleServicesChargesSalesChange = (year, value) => {
    const salesValue = value || 0;
    
    setServicesChargesInputs(prev => ({
      ...prev,
      [year]: { sales: salesValue }
    }));
    setHasChanges(true);

    // Update productGroups state - MoRM = Sales for Services Charges
    setProductGroups(prev => prev.map(pg => {
      if (pg.name !== 'Services Charges') return pg;

      const periodIdx = forecastPeriods.findIndex(p => p.year === year);
      if (periodIdx === -1) return pg;

      return {
        ...pg,
        metrics: pg.metrics.map(metric => {
          const newData = [...metric.data];
          if (metric.type === 'Sales') {
            newData[periodIdx] = salesValue;
          } else if (metric.type === 'MoRM') {
            // MoRM = Sales for Services Charges
            newData[periodIdx] = salesValue;
          }
          return { ...metric, data: newData };
        })
      };
    }));
  };

  /**
   * Save forecast data to database
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      const forecastYears = [selectedBaseYear + 2, selectedBaseYear + 3];

      for (const year of forecastYears) {
        const forecasts = productGroups
          .filter(pg => pg.name !== 'Services Charges') // Handle Services Charges separately
          .map(pg => {
            const key = `${pg.name}|${year}`;
            const input = forecastInputs[key] || { kgs: 0, slsPerKg: 0, rmPerKg: 0 };
            return {
              productGroup: pg.name,
              kgs: input.kgs,
              slsPerKg: input.slsPerKg,
              rmPerKg: input.rmPerKg
            };
          });

        // Build projections object for unified API
        const projections = {};
        forecasts.forEach(f => {
          projections[f.productGroup] = {
            kgs: f.kgs,
            slsPerKg: f.slsPerKg,
            rmPerKg: f.rmPerKg
          };
        });

        // Add Services Charges with sales = morm (no material)
        const scData = servicesChargesInputs[year];
        if (scData) {
          projections['Services Charges'] = {
            kgs: 0,
            slsPerKg: 0,
            rmPerKg: 0,
            sales: scData.sales,
            morm: scData.sales // MoRM = Sales for Services Charges
          };
        }

        const response = await axios.post('/api/aebf/projections/save', {
          division: selectedDivision,
          year,
          type: 'FORECAST',
          projections
        });

        if (!response.data.success) {
          throw new Error(response.data.error || 'Save failed');
        }
      }

      message.success('Forecast data saved successfully');
      setHasChanges(false);
      setIsEditing(false);
      // Show "Saved ✓" indicator briefly
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      // Refresh data from server to ensure consistency
      fetchForecastData();
      // Notify parent that sales data was saved (triggers P&L tab refresh)
      if (onSaveComplete) {
        onSaveComplete();
      }
    } catch (error) {
      console.error('Error saving forecast:', error);
      message.error('Failed to save forecast data');
    } finally {
      setSaving(false);
    }
  };

  const formatNumber = (value, metricType) => {
    if (value === 0 || value === null || value === undefined || isNaN(value)) return '';
    
    if (metricType === 'MoRM %') {
      return `${value.toFixed(1)}%`;
    } else if (['Sls/Kg', 'RM/kg', 'MoRM/Kg'].includes(metricType)) {
      return value.toFixed(2);
    } else {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
  };

  const handleExport = async () => {
    if (!selectedDivision || !selectedBaseYear) {
      message.warning('Please select division and base year first');
      return;
    }
    
    try {
      setLoading(true);
      message.loading({ content: 'Generating Forecast export...', key: 'export' });
      
      // Build forecast projections from current state (includes unsaved edits)
      const buildProjections = (year) => {
        const projections = {};
        productGroups.forEach(pg => {
          if (pg.name === 'Services Charges') {
            const scData = servicesChargesInputs[year];
            if (scData) {
              projections[pg.name] = {
                kgs: 0,
                slsPerKg: 0,
                rmPerKg: 0,
                sales: scData.sales || 0,
                morm: scData.sales || 0
              };
            }
          } else {
            const key = `${pg.name}|${year}`;
            const input = forecastInputs[key];
            if (input) {
              const metrics = calculateMetrics(input.kgs || 0, input.slsPerKg || 0, input.rmPerKg || 0);
              projections[pg.name] = {
                kgs: metrics.kgs,
                slsPerKg: metrics.slsPerKg,
                rmPerKg: metrics.rmPerKg,
                sales: metrics.sales,
                morm: metrics.morm
              };
            }
          }
        });
        return projections;
      };
      
      const response = await axios.post(
        '/api/aebf/projections/export-forecast-excel',
        {
          division: selectedDivision,
          baseYear: selectedBaseYear,
          // ALWAYS send frontend values - ensures Excel matches screen exactly
          forecastProjections1: buildProjections(selectedBaseYear + 2),
          forecastProjections2: buildProjections(selectedBaseYear + 3),
          // Always true so server uses frontend values (Excel must match screen)
          hasEdits: true
        },
        { responseType: 'blob' }
      );
      
      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `FORECAST_Divisional_${selectedDivision}_${selectedBaseYear}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) {
          filename = match[1];
        }
      }
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success({ content: `Exported: ${filename}`, key: 'export', duration: 3 });
    } catch (error) {
      console.error('Export error:', error);
      message.error({ content: 'Export failed: ' + (error.response?.data?.error || error.message), key: 'export' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Render cell - either input or display value
   */
  const renderCell = (productGroup, metric, periodIdx, value) => {
    const period = forecastPeriods[periodIdx];
    if (!period) return null;

    // Special handling for Services Charges - Sales is editable in forecast columns
    const isServicesCharges = productGroup === 'Services Charges';
    if (isServicesCharges && metric === 'Sales' && period.editable && isEditing) {
      const salesValue = servicesChargesInputs[period.year]?.sales || 0;
      const inputId = `forecast-services-charges-${period.year}-sales`;
      
      return (
        <InputNumber
          id={inputId}
          name={inputId}
          size="small"
          value={salesValue || null}
          onChange={(val) => handleServicesChargesSalesChange(period.year, val)}
          style={{ 
            width: '100%', 
            minWidth: '80px',
            textAlign: 'center',
            fontSize: '16px'
          }}
          formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
          parser={(val) => val.replace(/,/g, '')}
          step={1000}
          precision={0}
          autoComplete="off"
        />
      );
    }
    
    // For Services Charges Sales in forecast (not editing), show the input value
    if (isServicesCharges && metric === 'Sales' && period.editable) {
      const salesValue = servicesChargesInputs[period.year]?.sales || 0;
      return formatNumber(salesValue, metric);
    }
    
    // For Services Charges MoRM in forecast, MoRM = Sales
    if (isServicesCharges && metric === 'MoRM' && period.editable) {
      const salesValue = servicesChargesInputs[period.year]?.sales || 0;
      return formatNumber(salesValue, metric);
    }

    const isEditable = period.editable && inputMetrics.includes(metric);
    
    // Show input fields only when editing mode is enabled
    if (isEditable && isEditing) {
      const key = `${productGroup}|${period.year}`;
      const inputData = forecastInputs[key] || {};
      const field = getMetricKey(metric);
      const inputValue = inputData[field] || 0;
      const inputId = `forecast-${productGroup.replace(/\s+/g, '-')}-${period.year}-${field}`;

      return (
        <InputNumber
          id={inputId}
          name={inputId}
          size="small"
          value={inputValue || null}
          onChange={(val) => handleInputChange(productGroup, period.year, field, val)}
          style={{ 
            width: '100%', 
            minWidth: '80px',
            textAlign: 'center',
            fontSize: '16px'
          }}
          formatter={(val) => val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
          parser={(val) => val.replace(/,/g, '')}
          step={metric === 'KGS' ? 1000 : 0.01}
          precision={metric === 'KGS' ? 0 : 2}
          autoComplete="off"
        />
      );
    }

    // For editable fields not in edit mode, show the current input value formatted
    if (isEditable) {
      const key = `${productGroup}|${period.year}`;
      const inputData = forecastInputs[key] || {};
      const field = getMetricKey(metric);
      const inputValue = inputData[field] || 0;
      return formatNumber(inputValue, metric);
    }

    return formatNumber(value, metric);
  };

  if (!selectedDivision) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Please select a division first</p>
      </div>
    );
  }

  const colors = ['#e8f8f5', '#e6f7ff', '#fff7e6', '#ede7f6'];

  return (
    <div className="forecast-tab" style={{ padding: 0, width: '100%' }}>
      <div className="tab-header" style={{ marginBottom: '16px', padding: 0 }}>
        <h3>Forecast Sales Data - {selectedDivision}</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Product Group forecast based on {yearMetadata[selectedBaseYear]?.status || 'Estimate'} data with multi-year budget projections. 
          Edit KGS, Sls/Kg, and RM/kg for forecast years.
        </p>
      </div>

      <Space style={{ marginBottom: '16px', padding: 0 }}>
        <Select
          style={{ width: 280 }}
          value={selectedBaseYear}
          onChange={(value) => setSelectedBaseYear(value)}
          placeholder="Select Base Year"
        >
          {availableYears.map(year => {
            const meta = yearMetadata[year];
            const status = meta?.status || 'ESTIMATE';
            const monthCount = meta?.monthCount || 0;
            return (
              <Select.Option key={year} value={year}>
                FY {year} ({status} - {monthCount}/12)
              </Select.Option>
            );
          })}
        </Select>

        {!isEditing ? (
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            onClick={() => setIsEditing(true)}
          >
            Edit Forecast
          </Button>
        ) : (
          <>
            <Button 
              type="primary" 
              icon={<SaveOutlined />} 
              onClick={handleSave}
              loading={saving}
              disabled={!hasChanges}
            >
              Save Forecast
            </Button>
            <Button 
              onClick={() => {
                setIsEditing(false);
                if (hasChanges) {
                  fetchForecastData(); // Reset changes
                  setHasChanges(false);
                }
              }}
            >
              Cancel
            </Button>
          </>
        )}
        
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          Export Excel
        </Button>
        
        <Button icon={<ReloadOutlined />} onClick={fetchForecastData}>
          Refresh
        </Button>
        
        {isEditing && hasChanges && (
          <span style={{ color: '#faad14', marginLeft: 8 }}>● Unsaved changes</span>
        )}
        
        {justSaved && (
          <span style={{ color: '#52c41a', marginLeft: 8, fontWeight: 'bold' }}>✓ Saved successfully</span>
        )}
      </Space>

      <Spin spinning={loading}>
        <div style={{ 
          width: '100%', 
          maxHeight: 'calc(100vh - 280px)', 
          overflowY: 'auto', 
          overflowX: 'auto',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <table className="forecast-matrix-table no-scroll" style={{ 
            width: '100%', 
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: '13px',
            tableLayout: 'fixed'
          }}>
            <thead>
              <tr>
                <th 
                  style={{ 
                    background: 'linear-gradient(45deg, #6c3483 0%, #9b59b6 50%, #d2b4de 100%)', 
                    color: '#FFFFFF', 
                    padding: '14px 16px', 
                    border: 'none',
                    fontWeight: '600',
                    textAlign: 'left',
                    width: '25%',
                    fontSize: '14px',
                    letterSpacing: '0.3px'
                  }}
                >
                  Product Group / Metric
                </th>
                {forecastPeriods.map((period, idx) => {
                  const headerColors = [
                    { bg: 'linear-gradient(45deg, #1e8449 0%, #27ae60 50%, #82e0aa 100%)' },
                    { bg: 'linear-gradient(45deg, #1a5276 0%, #2980b9 50%, #85c1e9 100%)' },
                    { bg: 'linear-gradient(45deg, #922b21 0%, #c0392b 50%, #f1948a 100%)' },
                    { bg: 'linear-gradient(45deg, #6c3483 0%, #8e44ad 50%, #d2b4de 100%)' }
                  ];
                  return (
                    <th 
                      key={idx}
                      style={{ 
                        background: headerColors[idx].bg,
                        color: '#FFFFFF', 
                        padding: '14px 16px', 
                        border: 'none',
                        fontWeight: '600',
                        textAlign: 'center',
                        minWidth: '140px',
                        fontSize: '14px',
                        letterSpacing: '0.3px'
                      }}
                    >
                      {period.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {productGroups.map((productGroup, pgIdx) => (
                <React.Fragment key={pgIdx}>
                  {/* Product Group Header Row */}
                  <tr>
                    <td 
                      colSpan={forecastPeriods.length + 1}
                      style={{ 
                        padding: '14px 20px', 
                        border: 'none',
                        borderBottom: '2px solid #1a1a3e',
                        borderLeft: '5px solid #ffd700',
                        fontWeight: '700',
                        fontSize: '16px',
                        color: '#ffffff',
                        letterSpacing: '0.8px',
                        background: 'linear-gradient(135deg, #c0c0c0 0%, #6a5acd 50%, #0000cd 100%)',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                      }}
                    >
                      📦 {productGroup.name}
                    </td>
                  </tr>
                  
                  {/* Metric Rows */}
                  {metricsToShow.map((metric, metricIdx) => {
                    // Services Charges only shows Sales and MoRM
                    const isServicesCharges = productGroup.name === 'Services Charges';
                    if (isServicesCharges && !['Sales', 'MoRM'].includes(metric)) {
                      return null;
                    }
                    
                    const metricData = productGroup.metrics.find(m => m.type === metric);
                    const isInput = inputMetrics.includes(metric);
                    
                    return (
                      <tr 
                        key={`${pgIdx}-${metricIdx}`} 
                        style={{ 
                          transition: 'background-color 0.2s',
                          backgroundColor: 'transparent'
                        }}
                      >
                        <td style={{ 
                          padding: '10px 16px', 
                          border: 'none',
                          borderBottom: '1px solid #f0f0f0',
                          fontWeight: 600,
                          color: '#6c757d',
                          fontSize: '16px',
                          backgroundColor: '#fff',
                          textAlign: 'center'
                        }}>
                          {metric === 'Sales' && <CurrencySymbol style={{ marginRight: 4 }} />}
                          {metric}
                        </td>
                        {forecastPeriods.map((period, periodIdx) => (
                          <td 
                            key={periodIdx}
                            style={{ 
                              padding: period.editable && isInput ? '4px 8px' : '10px 16px', 
                              border: 'none',
                              borderBottom: '1px solid #f0f0f0',
                              textAlign: 'center',
                              backgroundColor: colors[periodIdx],
                              fontWeight: '500',
                              color: '#212529',
                              fontSize: '16px'
                            }}
                          >
                            {renderCell(productGroup.name, metric, periodIdx, metricData?.data[periodIdx] || 0)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  
                  {/* Separator Row */}
                  {pgIdx < productGroups.length - 1 && (
                    <tr style={{ height: '12px', backgroundColor: 'transparent' }}>
                      <td colSpan={forecastPeriods.length + 1} style={{ border: 'none', padding: 0 }}></td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              
              {/* TOTAL SECTION */}
              <tr style={{ height: '16px', backgroundColor: 'transparent' }}>
                <td colSpan={forecastPeriods.length + 1} style={{ border: 'none', padding: 0 }}></td>
              </tr>
              
              {/* Total Header Row */}
              <tr>
                <td 
                  colSpan={forecastPeriods.length + 1}
                  style={{ 
                    padding: '12px 16px',
                    border: 'none',
                    borderBottom: '2px solid #495057',
                    borderLeft: '4px solid #ffd700',
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                    fontWeight: '700',
                    fontSize: '15px',
                    color: '#FFFFFF',
                    letterSpacing: '0.8px'
                  }}
                >
                  📊 TOTAL
                </td>
              </tr>
              
              {/* Total Metric Rows */}
              {metricsToShow.map((metric, metricIdx) => {
                return (
                  <tr 
                    key={`total-${metricIdx}`} 
                    style={{ 
                      backgroundColor: metricIdx % 2 === 0 ? '#f8f9fa' : '#ffffff',
                      fontWeight: 'bold'
                    }}
                  >
                    <td style={{ 
                      padding: '11px 16px', 
                      border: 'none',
                      borderBottom: '1px solid #dee2e6',
                      fontWeight: 700,
                      color: '#495057',
                      fontSize: '16px',
                      backgroundColor: '#e9ecef',
                      textAlign: 'center'
                    }}>
                      {metric === 'Sales' && <CurrencySymbol style={{ marginRight: 4 }} />}
                      {metric}
                    </td>
                    {forecastPeriods.map((period, periodIdx) => {
                      // Calculate totals for KGS, Sales, MoRM first
                      const totalKgs = productGroups.reduce((sum, pg) => {
                        const kgsData = pg.metrics.find(m => m.type === 'KGS');
                        return sum + (kgsData?.data[periodIdx] || 0);
                      }, 0);
                      
                      const totalSales = productGroups.reduce((sum, pg) => {
                        const salesData = pg.metrics.find(m => m.type === 'Sales');
                        return sum + (salesData?.data[periodIdx] || 0);
                      }, 0);
                      
                      const totalMorm = productGroups.reduce((sum, pg) => {
                        const mormData = pg.metrics.find(m => m.type === 'MoRM');
                        return sum + (mormData?.data[periodIdx] || 0);
                      }, 0);
                      
                      // Calculate the correct total based on metric type
                      let total;
                      if (metric === 'KGS') {
                        total = totalKgs;
                      } else if (metric === 'Sales') {
                        total = totalSales;
                      } else if (metric === 'MoRM') {
                        total = totalMorm;
                      } else if (metric === 'Sls/Kg') {
                        // Sls/Kg = Total Sales / Total KGS
                        total = totalKgs > 0 ? totalSales / totalKgs : 0;
                      } else if (metric === 'RM/kg') {
                        // RM/kg = (Total Sales - Total MoRM) / Total KGS
                        total = totalKgs > 0 ? (totalSales - totalMorm) / totalKgs : 0;
                      } else if (metric === 'MoRM/Kg') {
                        // MoRM/Kg = Total MoRM / Total KGS
                        total = totalKgs > 0 ? totalMorm / totalKgs : 0;
                      } else if (metric === 'MoRM %') {
                        // MoRM % = (Total MoRM / Total Sales) * 100
                        total = totalSales > 0 ? (totalMorm / totalSales) * 100 : 0;
                      } else {
                        // Fallback: sum
                        total = productGroups.reduce((sum, pg) => {
                          const metricData = pg.metrics.find(m => m.type === metric);
                          return sum + (metricData?.data[periodIdx] || 0);
                        }, 0);
                      }
                      
                      return (
                        <td 
                          key={periodIdx}
                          style={{ 
                            padding: '11px 16px', 
                            border: 'none',
                            borderBottom: '1px solid #dee2e6',
                            textAlign: 'center',
                            backgroundColor: colors[periodIdx],
                            fontWeight: '700',
                            color: '#212529',
                            fontSize: '16px'
                          }}
                        >
                          {formatNumber(total, metric)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Spin>
    </div>
  );
};

export default ForecastSalesTab;
