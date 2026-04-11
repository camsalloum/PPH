import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Table, Button, Space, message, Upload, Select, Radio, Modal, Spin, Tag, Statistic, Row, Col, Card, Tabs, Input, Progress } from 'antd';
import { UploadOutlined, DownloadOutlined, ReloadOutlined, FileExcelOutlined, WarningOutlined, CheckCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import { useFilter } from '../../../contexts/FilterContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import axios from 'axios';
import { ResizableTitle, useResizableColumns } from '../../shared/ResizableTable';
import { formatCompanyTime } from '../../../utils/companyTime';

const { Option } = Select;
const { Search } = Input;

/**
 * ActualTab Component - Enhanced Version
 * Manages actual financial performance data with Excel upload
 * Features:
 * - Year tabs with base period pre-selection
 * - Year-specific summaries (AMOUNT, KGS, MORM)
 * - Global search across all fields
 * - Auto-width columns (no horizontal scroll)
 */
const ActualTab = ({ isActive }) => {
  const { selectedDivision } = useExcelData();
  const { basePeriodIndex, columnOrder } = useFilter();
  const { companyCurrency } = useCurrency();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  
  // All unique values for filters (from entire database, not just current page)
  const [filterOptions, setFilterOptions] = useState({});
  
  // Year tabs and summary
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [yearSummary, setYearSummary] = useState(null);
  
  // Global search
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Upload modal state
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadMode, setUploadMode] = useState('upsert');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState(null);
  const progressIntervalRef = useRef(null);
  // Currency defaults to company currency - no need for selection
  const selectedCurrency = companyCurrency?.code || 'AED';
  
  // File preview and selection state
  const [uploadStep, setUploadStep] = useState(1); // 1: basic info, 2: year/month selection
  const [fileYearMonths, setFileYearMonths] = useState([]); // [{year, month, count}]
  const [selectedYearMonths, setSelectedYearMonths] = useState([]); // ['2025-1', '2025-2']
  const [selectiveMode, setSelectiveMode] = useState('all'); // 'all' or 'selective'
  const [analyzingFile, setAnalyzingFile] = useState(false);
  
  // Result modal state
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Oracle Direct Sync state
  const [oracleDirectSyncing, setOracleDirectSyncing] = useState(false);
  const [oracleDirectSyncId, setOracleDirectSyncId] = useState(null);
  const [oracleDirectSyncStatus, setOracleDirectSyncStatus] = useState(null);
  const [oracleDirectSyncProgress, setOracleDirectSyncProgress] = useState({ rows: 0, phase: '' });
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [companyTimezone, setCompanyTimezone] = useState(null);
  const [oracleStats, setOracleStats] = useState(null);

  // Fetch Oracle stats (row count, years, divisions)
  useEffect(() => {
    const fetchOracleStats = async () => {
      try {
        const response = await axios.get('/api/oracle-direct/stats');
        if (response.data.success) {
          setOracleStats(response.data.stats);
        }
      } catch (error) {
        console.error('Error fetching Oracle stats:', error);
      }
    };
    fetchOracleStats();
  }, []);

  // Fetch last sync time from database
  useEffect(() => {
    const fetchLastSyncTime = async () => {
      try {
        const response = await axios.get('/api/oracle-direct/last-sync');
        if (response.data.success && response.data.lastSync) {
          setLastSyncTime({
            time: response.data.lastSync.completedAt,
            rows: response.data.lastSync.rowsInserted,
            mode: response.data.lastSync.mode
          });
        }
      } catch (error) {
        console.error('Error fetching last sync time:', error);
      }
    };
    fetchLastSyncTime();
  }, []);

  useEffect(() => {
    const fetchCompanyTimezone = async () => {
      try {
        const response = await axios.get('/api/settings/company');
        if (response.data?.success) {
          setCompanyTimezone(response.data.settings?.companyTimezone || null);
        }
      } catch {
        setCompanyTimezone(null);
      }
    };

    fetchCompanyTimezone();
  }, []);


  // Fetch available years
  const fetchAvailableYears = async () => {
    if (!selectedDivision) return;
    
    try {
      const response = await axios.get('/api/fp/raw-data/years', {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const years = response.data.data.years || [];
        const sortedYears = years.sort((a, b) => b - a); // Descending
        setAvailableYears(sortedYears);
        
        // Set default year - either if no year selected or current year is no longer available
        if (sortedYears.length > 0) {
          const currentYearStillExists = selectedYear && sortedYears.includes(selectedYear);
          
          if (!selectedYear || !currentYearStillExists) {
            const currentSystemYear = new Date().getFullYear(); // 2026
            let defaultYear = sortedYears[0]; // Latest year by default
            
            // Prefer current system year if it exists in data
            if (sortedYears.includes(currentSystemYear)) {
              defaultYear = currentSystemYear;
            }
            // Otherwise try to get year from base period
            else if (basePeriodIndex !== null && basePeriodIndex >= 0 && columnOrder.length > basePeriodIndex) {
              const basePeriod = columnOrder[basePeriodIndex];
              if (basePeriod && basePeriod.year && sortedYears.includes(basePeriod.year)) {
                defaultYear = basePeriod.year;
              }
            }
            
            setSelectedYear(defaultYear);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching years:', error);
    }
  };

  // Fetch year-specific summary (with optional search filter)
  const fetchYearSummary = async (year, searchFilter = '') => {
    if (!selectedDivision) return;
    
    try {
      const params = { 
        division: selectedDivision
      };
      
      // Only filter by year when provided
      if (year) {
        params.year = year;
      }
      
      const response = await axios.get('/api/fp/raw-data/year-summary', { params });
      
      if (response.data.success) {
        setYearSummary(response.data.data.summary);
      }
    } catch (error) {
      console.error('Error fetching year summary:', error);
    }
  };

  // Data table removed - only showing summary cards
  // Keeping function stub to avoid breaking references
  const fetchData = async (page = 1, pageSize = 50, searchFilter = null) => {
    // Data table removed - no longer fetching detailed records
    return;
  };

  // Handle year tab change
  const handleYearChange = (year) => {
    setSelectedYear(parseInt(year));
    setGlobalSearch(''); // Clear search when changing year
  };

  // Handle global search
  const handleSearch = (value) => {
    setGlobalSearch(value);
    setPagination({ ...pagination, current: 1 }); // Reset to first page
    
    // Update summary with search filter
    if (selectedYear) {
      fetchYearSummary(selectedYear, value);
    }
    
    // Fetch data with search filter (pass value directly)
    fetchData(1, pagination.pageSize, value);
  };
  
  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setGlobalSearch(value);
    
    // If user clears the search box, trigger search immediately
    if (value === '') {
      if (selectedYear) {
        fetchYearSummary(selectedYear, '');
      }
      fetchData(1, pagination.pageSize, '');
    }
  };

  // Helper to parse sync phase from output
  const parseSyncPhase = (output) => {
    if (!output || output.length === 0) return 'Starting...';
    const lastOutput = output.join(' ');
    if (lastOutput.includes('Initializing Oracle Client')) return 'Initializing Oracle...';
    if (lastOutput.includes('Connecting to Oracle')) return 'Connecting to Oracle...';
    if (lastOutput.includes('Starting data stream')) return 'Querying Oracle...';
    if (lastOutput.includes('Fetching data')) return 'Fetching data...';
    if (lastOutput.includes('rows inserted')) return 'Inserting rows...';
    if (lastOutput.includes('Sync completed')) return 'Completed!';
    return 'Processing...';
  };
  
  // Format elapsed time as MM:SS
  const formatElapsedTime = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const refreshAfterOracleSync = async () => {
    try {
      const [statsResponse, lastSyncResponse] = await Promise.all([
        axios.get('/api/oracle-direct/stats'),
        axios.get('/api/oracle-direct/last-sync')
      ]);

      if (statsResponse.data.success) {
        setOracleStats(statsResponse.data.stats);
      }

      if (lastSyncResponse.data.success && lastSyncResponse.data.lastSync) {
        setLastSyncTime({
          time: lastSyncResponse.data.lastSync.completedAt,
          rows: lastSyncResponse.data.lastSync.rowsInserted,
          mode: lastSyncResponse.data.lastSync.mode
        });
      }

      await fetchAvailableYears();
      if (selectedYear) {
        await fetchYearSummary(selectedYear, globalSearch);
      }
      await fetchData();
    } catch (error) {
      console.error('Error refreshing Oracle sync view:', error);
    }
  };
  
  // Oracle Direct Sync - All Years
  const handleOracleDirectSyncAll = async () => {
    try {
      setOracleDirectSyncing(true);
      setOracleDirectSyncProgress({ rows: 0, phase: 'Starting...', elapsed: 0 });
      
      const response = await axios.post('/api/oracle-direct/sync', {
        mode: 'all'
      });
      
      if (response.data.success) {
        const syncId = response.data.syncId;
        setOracleDirectSyncId(syncId);
        
        // Track consecutive errors
        let consecutiveErrors = 0;
        
        // Poll for progress from file (more real-time)
        const pollProgress = setInterval(async () => {
          try {
            const progressResponse = await axios.get('/api/oracle-direct/progress');
            const progress = progressResponse.data.progress;
            
            if (progress) {
              setOracleDirectSyncProgress({ 
                rows: progress.rows || 0, 
                phase: progress.phase || 'Processing...', 
                elapsed: progress.elapsedSeconds || 0 
              });
              
              if (progress.status === 'completed') {
                clearInterval(pollProgress);
                setOracleDirectSyncing(false);
                
                // Save last sync time to database
                const syncTime = { 
                  time: progress.completedAt || new Date().toISOString(), 
                  rows: progress.rows || 0, 
                  mode: 'all',
                  totalMinutes: progress.totalMinutes
                };
                setLastSyncTime(syncTime);
                try {
                  await axios.post('/api/oracle-direct/last-sync', {
                    mode: 'all',
                    year: null,
                    rowsInserted: progress.rows || 0,
                    completedAt: syncTime.time
                  });
                } catch (saveError) {
                  console.error('Error saving last sync time:', saveError);
                }
                
                message.success({ 
                  content: `✅ Sync completed! ${progress.rows?.toLocaleString() || 0} rows in ${progress.totalMinutes || 0} min.`, 
                  key: 'oracle-sync', 
                  duration: 3 
                });
                setOracleDirectSyncId(null);

                await refreshAfterOracleSync();
              } else if (progress.status === 'failed') {
                clearInterval(pollProgress);
                setOracleDirectSyncing(false);
                setOracleDirectSyncProgress({ rows: 0, phase: progress.phase || 'Failed' });
                message.error({ content: `❌ Sync failed: ${progress.error || 'Unknown error'}`, key: 'oracle-sync' });
                setOracleDirectSyncId(null);
              }
            }
            consecutiveErrors = 0;
          } catch (pollError) {
            console.error('Poll error:', pollError);
            consecutiveErrors++;
            
            if (consecutiveErrors >= 10) {
              clearInterval(pollProgress);
              setOracleDirectSyncing(false);
              setOracleDirectSyncProgress({ rows: 0, phase: 'Connection lost' });
              setOracleDirectSyncId(null);
              message.error({ content: '❌ Sync connection lost.', key: 'oracle-sync' });
            }
          }
        }, 2000); // Poll every 2 seconds
        
      } else {
        throw new Error(response.data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Oracle Direct Sync error:', error);
      setOracleDirectSyncing(false);
      setOracleDirectSyncProgress({ rows: 0, phase: '' });
      message.error({ content: error.response?.data?.error || 'Failed to start sync', key: 'oracle-sync' });
    }
  };
  
  // Oracle Direct Sync - Current Year Only
  const handleOracleDirectSyncCurrentYear = async () => {
    const currentYear = new Date().getFullYear();
    try {
      setOracleDirectSyncing(true);
      setOracleDirectSyncProgress({ rows: 0, phase: 'Starting...', elapsed: 0 });
      
      const response = await axios.post('/api/oracle-direct/sync', {
        mode: 'current-year',
        year: currentYear
      });
      
      if (response.data.success) {
        const syncId = response.data.syncId;
        setOracleDirectSyncId(syncId);
        
        // Track consecutive errors
        let consecutiveErrors = 0;
        
        // Poll for progress from file
        const pollProgress = setInterval(async () => {
          try {
            const progressResponse = await axios.get('/api/oracle-direct/progress');
            const progress = progressResponse.data.progress;
            
            if (progress) {
              setOracleDirectSyncProgress({ 
                rows: progress.rows || 0, 
                phase: progress.phase || 'Processing...', 
                elapsed: progress.elapsedSeconds || 0 
              });
              
              if (progress.status === 'completed') {
                clearInterval(pollProgress);
                setOracleDirectSyncing(false);
                
                // Save last sync time to database
                const syncTime = { 
                  time: progress.completedAt || new Date().toISOString(), 
                  rows: progress.rows || 0, 
                  mode: currentYear.toString(),
                  totalMinutes: progress.totalMinutes
                };
                setLastSyncTime(syncTime);
                try {
                  await axios.post('/api/oracle-direct/last-sync', {
                    mode: 'current-year',
                    year: currentYear,
                    rowsInserted: progress.rows || 0,
                    completedAt: syncTime.time
                  });
                } catch (saveError) {
                  console.error('Error saving last sync time:', saveError);
                }
                
                message.success({ 
                  content: `✅ Sync completed! ${progress.rows?.toLocaleString() || 0} rows in ${progress.totalMinutes || 0} min.`, 
                  key: 'oracle-sync', 
                  duration: 3 
                });
                setOracleDirectSyncId(null);

                await refreshAfterOracleSync();
              } else if (progress.status === 'failed') {
                clearInterval(pollProgress);
                setOracleDirectSyncing(false);
                setOracleDirectSyncProgress({ rows: 0, phase: progress.phase || 'Failed' });
                message.error({ content: `❌ Sync failed: ${progress.error || 'Unknown error'}`, key: 'oracle-sync' });
                setOracleDirectSyncId(null);
              }
            }
            consecutiveErrors = 0;
          } catch (pollError) {
            console.error('Poll error:', pollError);
            consecutiveErrors++;
            
            if (consecutiveErrors >= 10) {
              clearInterval(pollProgress);
              setOracleDirectSyncing(false);
              setOracleDirectSyncProgress({ rows: 0, phase: 'Connection lost' });
              setOracleDirectSyncId(null);
              message.error({ content: '❌ Sync connection lost.', key: 'oracle-sync' });
            }
          }
        }, 2000); // Poll every 2 seconds
        
      } else {
        throw new Error(response.data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Oracle Direct Sync error:', error);
      setOracleDirectSyncing(false);
      setOracleDirectSyncProgress({ rows: 0, phase: '' });
      message.error({ content: error.response?.data?.error || 'Failed to start sync', key: 'oracle-sync' });
    }
  };


  
  // Handle file selection (kept for old functionality if needed)
  const handleFileSelect = (file) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isExcel) {
      message.error('Please upload an Excel file (.xlsx or .xls)');
      return false;
    }
    
    setSelectedFile(file);
    setUploadStep(1);
    setFileYearMonths([]);
    setSelectedYearMonths([]);
    setSelectiveMode('all');
    setUploadModalVisible(true);
    return false; // Prevent auto upload
  };
  
  // Analyze file to get year/month combinations
  const analyzeFile = async () => {
    if (!selectedFile) return;
    
    setAnalyzingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await axios.post('/api/aebf/analyze-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      
      if (response.data.success) {
        // Data is wrapped inside response.data.data by successResponse helper
        const yearMonths = response.data.data?.yearMonths || response.data.yearMonths || [];
        setFileYearMonths(yearMonths);
        // Pre-select all by default
        const allKeys = yearMonths.map(ym => `${ym.year}-${ym.month}`);
        setSelectedYearMonths(allKeys);
        setUploadStep(2);
      } else {
        message.error('Failed to analyze file');
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
      message.error('Failed to analyze file structure');
    } finally {
      setAnalyzingFile(false);
    }
  };
  
  // Handle year/month selection
  const handleYearMonthToggle = (yearMonth) => {
    if (selectedYearMonths.includes(yearMonth)) {
      setSelectedYearMonths(selectedYearMonths.filter(ym => ym !== yearMonth));
    } else {
      setSelectedYearMonths([...selectedYearMonths, yearMonth]);
    }
  };
  
  // Select/Deselect all year/months
  const handleSelectAll = () => {
    const allKeys = fileYearMonths.map(ym => `${ym.year}-${ym.month}`);
    setSelectedYearMonths(allKeys);
  };
  
  const handleDeselectAll = () => {
    setSelectedYearMonths([]);
  };
  
  // Go to next step (analyze file)
  const handleNextStep = () => {
    if (selectiveMode === 'selective') {
      analyzeFile();
    } else {
      // All mode, go straight to upload
      handleTransformLoad();
    }
  };
  
  // Handle Transform & Load
  const handleTransformLoad = async () => {
    if (!selectedFile || !uploadedBy.trim() || !selectedDivision) {
      message.error('Please fill all required fields');
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    const startTime = Date.now();
    setUploadStartTime(startTime);
    
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Simulate progress (0-90% over 5 minutes, then wait for completion)
    progressIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const estimatedTotal = 300; // 5 minutes
      const progress = Math.min(90, (elapsed / estimatedTotal) * 90);
      setUploadProgress(progress);
    }, 1000); // Update every second
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('division', selectedDivision);
      formData.append('uploadMode', uploadMode);
      formData.append('uploadedBy', uploadedBy);
      formData.append('currency', selectedCurrency); // Uses company currency from settings
      
      // Add selective year/month filter if in selective mode
      if (selectiveMode === 'selective' && selectedYearMonths.length > 0) {
        formData.append('selectiveMode', 'true');
        formData.append('selectedYearMonths', JSON.stringify(selectedYearMonths));
      }
      
      // Debug: Log FormData contents
      
      // Note: Do NOT set Content-Type header manually - axios will set it automatically
      // with the correct boundary parameter that multer needs to parse the form data
      const response = await axios.post('/api/aebf/upload-actual', formData, {
        timeout: 300000, // 5 minutes
      });
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(100);
      
      // Small delay to show 100% before closing
      setTimeout(async () => {
        if (response.data.success) {
          setUploadResult(response.data);
          setUploadModalVisible(false);
          setResultModalVisible(true);
          
          // After upload, refresh available years and reset selection
          // This handles REPLACE mode where years may have changed
          try {
            const yearsResponse = await axios.get('/api/aebf/filter-options', {
              params: { division: selectedDivision, type: 'Actual' }
            });
            if (yearsResponse.data.success) {
              const years = yearsResponse.data.data.filterOptions.year || [];
              const sortedYears = years.sort((a, b) => b - a);
              setAvailableYears(sortedYears);
              setFilterOptions(yearsResponse.data.data.filterOptions);
              
              // Select the latest year (or first available)
              if (sortedYears.length > 0) {
                const newYear = sortedYears[0];
                setSelectedYear(newYear);
                fetchYearSummary(newYear);
                fetchData(1, pagination.pageSize);
              }
            }
          } catch (err) {
            console.error('Error refreshing years after upload:', err);
            fetchAvailableYears();
            fetchData();
          }
        } else {
          message.error(response.data.error || 'Upload failed');
        }
      }, 500);
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      console.error('Upload error:', error);
      
      // Handle timeout specifically
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        setUploadProgress(0);
        message.error('Upload timeout: The process is taking longer than expected. The file may be very large. Please check the server logs or try with a smaller file.', 10);
      } else if (error.response?.status === 504) {
        // Backend timeout
        setUploadProgress(0);
        message.error(error.response?.data?.error || 'Upload timeout: The process exceeded the time limit. Please try with a smaller file or check database performance.', 10);
      } else if (error.response?.status === 400) {
        // Validation error - show detailed message
        const errorData = error.response?.data;
        let errorMsg = 'Validation failed: ';
        if (errorData?.message) {
          errorMsg += errorData.message;
        } else if (errorData?.details && Array.isArray(errorData.details)) {
          errorMsg += errorData.details.map(d => `${d.param}: ${d.msg}`).join('; ');
        } else if (errorData?.error) {
          errorMsg += errorData.error;
        } else {
          errorMsg += error.message || 'Please check all required fields are filled.';
        }
        setUploadProgress(0);
        message.error(errorMsg, 10);
      } else {
        setUploadProgress(0);
        message.error(error.response?.data?.error || error.response?.data?.message || error.message || 'Upload failed. Please check the logs.', 8);
      }
    } finally {
      // Always clear interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadStartTime(null);
    }
  };

  // Handle Excel export
  const handleExport = async () => {
    if (!selectedDivision) {
      message.warning('Please select a division first');
      return;
    }
    
    try {
      const params = {
        division: selectedDivision
      };
      
      const queryString = new URLSearchParams(params).toString();
      window.open(`/api/fp/raw-data/export?${queryString}`, '_blank');
      
      message.success('Exporting complete database table. File will download shortly.');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Export failed');
    }
  };

  // Get unique values for column filters (from filterOptions state)
  const getUniqueValues = (dataIndex) => {
    return filterOptions[dataIndex] || [];
  };

  // Base columns definition (widths managed by useResizableColumns)
  const baseColumns = useMemo(() => [
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 65,
      sorter: (a, b) => a.year - b.year,
    },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 65,
      sorter: (a, b) => a.month - b.month,
    },
    {
      title: 'Sales Rep',
      dataIndex: 'salesrepname',
      key: 'salesrepname',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Customer',
      dataIndex: 'customername',
      key: 'customername',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Country',
      dataIndex: 'countryname',
      key: 'countryname',
      width: 100,
      ellipsis: true,
    },
    {
      title: 'Product Group',
      dataIndex: 'productgroup',
      key: 'productgroup',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Material',
      dataIndex: 'material',
      key: 'material',
      width: 85,
      ellipsis: true,
    },
    {
      title: 'Process',
      dataIndex: 'process',
      key: 'process',
      width: 85,
      ellipsis: true,
    },
    {
      title: 'Values Type',
      dataIndex: 'values_type',
      key: 'values_type',
      width: 100,
      render: (text) => {
        const color = text === 'AMOUNT' ? 'green' : text === 'KGS' ? 'blue' : 'orange';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Value',
      dataIndex: 'values',
      key: 'values',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.values - b.values,
      render: (value) => value ? value.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }) : '-',
    },
  ], []);

  // Use resizable columns hook
  const [columns] = useResizableColumns(baseColumns, 'actual-table');

  // Effects
  useEffect(() => {
    if (selectedDivision) {
      fetchAvailableYears();
    }
  }, [selectedDivision]);

  useEffect(() => {
    if (selectedYear) {
      fetchYearSummary(selectedYear, globalSearch);
      fetchData();
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedDivision && !selectedYear) {
      // Initial load when no year is selected yet
      fetchData(pagination.current, pagination.pageSize);
    }
  }, [selectedDivision]);

  // Re-fetch when tab becomes active (to get fresh data after changes in other tabs)
  useEffect(() => {
    if (isActive && selectedDivision && selectedYear) {
      fetchYearSummary(selectedYear, globalSearch);
      fetchData();
    }
  }, [isActive]);

  const handleTableChange = (paginationConfig) => {
    fetchData(paginationConfig.current, paginationConfig.pageSize);
  };

  return (
    <div className="actual-tab" style={{ padding: '0', width: '100%' }}>
      {/* Header */}
      <div className="tab-header" style={{ marginBottom: '16px', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Actual Sales Data - {selectedDivision || 'No Division Selected'}</h3>
            <p style={{ color: '#888', fontSize: '13px', margin: '2px 0 0 0' }}>
              Oracle view: HAP111.XL_FPSALESVSCOST_FULL
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {oracleStats && (
              <>
                <Tag color="blue">{parseInt(oracleStats.total_rows || 0).toLocaleString()} rows</Tag>
                <Tag color="green">{oracleStats.divisions || 0} divisions</Tag>
                <Tag color="purple">{oracleStats.years || 0} years ({oracleStats.min_year}–{oracleStats.max_year})</Tag>
              </>
            )}
            {lastSyncTime && (
              <Tag color="success" style={{ whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: '100%', lineHeight: 1.5, height: 'auto' }}>
                ✓ Last sync: {formatCompanyTime(lastSyncTime.time, companyTimezone, true)} ({lastSyncTime.rows?.toLocaleString()} rows)
              </Tag>
            )}
          </div>
        </div>
      </div>

      {/* Year Tabs */}
      {availableYears.length > 0 && (
        <Tabs
          activeKey={selectedYear?.toString()}
          onChange={handleYearChange}
          style={{ marginBottom: '16px', padding: 0 }}
          items={availableYears.map(year => ({
            key: year.toString(),
            label: year.toString(),
          }))}
        />
      )}

      {/* Year Summary Cards */}
      {yearSummary && yearSummary.length > 0 && (
        <Row gutter={16} style={{ marginBottom: '16px', padding: 0 }}>
          {yearSummary.map((item) => {
            const isCurrencyValue = item.values_type === 'AMOUNT' || item.values_type === 'Amount' || 
                                    item.values_type === 'MORM' || item.values_type === 'MoRM';
            return (
              <Col span={8} key={item.values_type}>
                <Card size="small">
                  <Statistic
                    title={item.values_type}
                    value={item.total_values}
                    precision={0}
                    prefix={isCurrencyValue ? <span style={{ color: '#3f8600', fontSize: '20px' }}><CurrencySymbol /></span> : null}
                    valueStyle={{ color: '#3f8600', fontSize: '20px' }}
                    suffix={<span style={{ fontSize: '12px', color: '#666' }}>({item.record_count} records)</span>}
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Action Bar */}
      <Space style={{ marginBottom: '16px', padding: 0, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          {/* Oracle Direct Sync Buttons */}
          <Button 
            icon={oracleDirectSyncing ? null : <ReloadOutlined />} 
            onClick={handleOracleDirectSyncCurrentYear}
            disabled={oracleDirectSyncing}
            style={{ 
              backgroundColor: oracleDirectSyncing ? '#f0f0f0' : '#52c41a', 
              borderColor: oracleDirectSyncing ? '#d9d9d9' : '#52c41a', 
              color: oracleDirectSyncing ? '#666' : '#fff',
              minWidth: 160
            }}
          >
            {oracleDirectSyncing ? oracleDirectSyncProgress.phase : `Sync ${new Date().getFullYear()} (Direct)`}
          </Button>
          
          <Button 
            icon={oracleDirectSyncing ? null : <ReloadOutlined />} 
            onClick={handleOracleDirectSyncAll}
            disabled={oracleDirectSyncing}
            style={{ 
              backgroundColor: oracleDirectSyncing ? '#f0f0f0' : '#722ed1', 
              borderColor: oracleDirectSyncing ? '#d9d9d9' : '#722ed1', 
              color: oracleDirectSyncing ? '#666' : '#fff',
              minWidth: 140
            }}
          >
            {oracleDirectSyncing ? `${oracleDirectSyncProgress.rows.toLocaleString()} rows` : 'Sync All (Direct)'}
          </Button>
          
          {/* Inline Sync Progress with Timer */}
          {oracleDirectSyncing && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              padding: '4px 12px',
              backgroundColor: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 6
            }}>
              <Spin size="small" />
              <span style={{ color: '#52c41a', fontWeight: 500 }}>
                {oracleDirectSyncProgress.rows > 0 
                  ? `${oracleDirectSyncProgress.rows.toLocaleString()} rows` 
                  : oracleDirectSyncProgress.phase}
              </span>
              {oracleDirectSyncProgress.elapsed > 0 && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  ({formatElapsedTime(oracleDirectSyncProgress.elapsed)})
                </span>
              )}
            </div>
          )}
          
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export Excel
          </Button>
        </Space>

        {/* Global Search */}
        <Search
          placeholder="Search anything (customer, country, product, sales rep...)"
          allowClear
          enterButton="Search"
          style={{ width: 400 }}
          onSearch={handleSearch}
          onChange={handleSearchChange}
          value={globalSearch}
        />
      </Space>

      {/* Upload Modal - Two Steps */}
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#1890ff' }} />
            <span>{uploadStep === 1 ? 'Upload Configuration' : 'Select Years & Months'}</span>
          </Space>
        }
        open={uploadModalVisible}
        width={uploadStep === 1 ? 600 : 700}
        onOk={uploadStep === 1 ? handleNextStep : handleTransformLoad}
        onCancel={() => {
          setUploadModalVisible(false);
          setSelectedFile(null);
          setUploadedBy('');
          setUploadStep(1);
          setFileYearMonths([]);
          setSelectedYearMonths([]);
          setSelectiveMode('all');
        }}
        okText={uploadStep === 1 ? (selectiveMode === 'all' ? 'Upload Now' : 'Next') : 'Transform & Load'}
        cancelText={uploadStep === 1 ? 'Cancel' : 'Back'}
        onBack={uploadStep === 2 ? () => setUploadStep(1) : null}
        confirmLoading={uploading || analyzingFile}
        maskClosable={false}
        footer={uploadStep === 1 ? undefined : [
          <Button key="back" onClick={() => setUploadStep(1)}>
            Back
          </Button>,
          <Button key="cancel" onClick={() => {
            setUploadModalVisible(false);
            setSelectedFile(null);
            setUploadedBy('');
            setUploadStep(1);
          }}>
            Cancel
          </Button>,
          <Button 
            key="upload" 
            type="primary" 
            loading={uploading}
            onClick={handleTransformLoad}
            disabled={(selectiveMode === 'selective' && selectedYearMonths.length === 0) || uploading}
          >
            Transform & Load ({selectedYearMonths.length} periods)
          </Button>
        ]}
      >
        {uploadStep === 1 ? (
          // Step 1: Basic Configuration
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {uploading && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#e6f7ff', borderRadius: '8px', border: '1px solid #91d5ff' }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>
                    <FileExcelOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    Uploading and processing data...
                  </span>
                  <span style={{ color: '#1890ff', fontWeight: '600', fontSize: '16px' }}>
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <Progress 
                  percent={uploadProgress} 
                  status={uploadProgress >= 90 && uploadProgress < 100 ? 'active' : 'normal'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  showInfo={false}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  {uploadProgress < 90 
                    ? 'Processing file and uploading to database...' 
                    : uploadProgress < 100
                    ? 'Finalizing upload...'
                    : 'Upload complete!'}
                </div>
              </div>
            )}
            <Spin spinning={analyzingFile} tip="Analyzing file...">
              <Space direction="vertical" style={{ width: '100%', opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }} size="large">
              <div>
                <p><strong>Selected File:</strong> {selectedFile?.name}</p>
                <p><strong>Division:</strong> {selectedDivision}</p>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Data Selection:</strong>
                </label>
                <Radio.Group value={selectiveMode} onChange={(e) => setSelectiveMode(e.target.value)}>
                  <Space direction="vertical">
                    <Radio value="all">
                      <strong>Upload All Data</strong> - Upload all years and months from the file
                    </Radio>
                    <Radio value="selective">
                      <strong>Select Specific Periods</strong> - Choose which years/months to upload
                      <Tag color="blue" style={{ marginLeft: '8px' }}>Recommended</Tag>
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Upload Mode:</strong>
                </label>
                <Radio.Group value={uploadMode} onChange={(e) => setUploadMode(e.target.value)}>
                  <Space direction="vertical">
                    <Radio value="upsert">
                      <strong>UPSERT</strong> - Update overlapping periods, keep non-overlapping data
                    </Radio>
                    <Radio value="replace">
                      <strong>REPLACE</strong> - Delete ALL existing data and replace with new data
                      <Tag color="red" style={{ marginLeft: '8px' }}>Destructive</Tag>
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Currency:</strong>
                </label>
                <div style={{ 
                  padding: '10px 12px', 
                  background: '#f5f5f5', 
                  border: '1px solid #d9d9d9', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <CurrencySymbol code={selectedCurrency} style={{ fontSize: '18px' }} />
                  <span style={{ fontWeight: '500' }}>
                    {selectedCurrency} - {companyCurrency?.name || (selectedCurrency === 'AED' ? 'UAE Dirham' : 'Company Currency')}
                  </span>
                </div>
                <p style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  Using company default currency. All data will be stored in {selectedCurrency}.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Uploaded By:</strong> <span style={{ color: 'red' }}>*</span>
                </label>
                <Input
                  placeholder="Enter your name"
                  value={uploadedBy}
                  onChange={(e) => setUploadedBy(e.target.value)}
                  maxLength={100}
                />
              </div>

              {uploadMode === 'replace' && (
                <div style={{ padding: '12px', backgroundColor: '#fff2e8', borderLeft: '3px solid #fa8c16' }}>
                  <Space>
                    <WarningOutlined style={{ color: '#fa8c16' }} />
                    <div>
                      <strong>Warning:</strong> REPLACE mode will delete ALL existing {selectedDivision} Actual data 
                      before uploading. A backup will be created automatically.
                    </div>
                  </Space>
                </div>
              )}
              </Space>
            </Spin>
          </Space>
        ) : (
          // Step 2: Year/Month Selection
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {uploading && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#e6f7ff', borderRadius: '8px', border: '1px solid #91d5ff' }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>
                    <FileExcelOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    Uploading and processing data...
                  </span>
                  <span style={{ color: '#1890ff', fontWeight: '600', fontSize: '16px' }}>
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <Progress 
                  percent={uploadProgress} 
                  status={uploadProgress >= 90 && uploadProgress < 100 ? 'active' : 'normal'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  showInfo={false}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  {uploadProgress < 90 
                    ? 'Processing file and uploading to database...' 
                    : uploadProgress < 100
                    ? 'Finalizing upload...'
                    : 'Upload complete!'}
                </div>
              </div>
            )}
              <Space direction="vertical" style={{ width: '100%', opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }} size="middle">
                <div style={{ marginBottom: '16px' }}>
                <p><strong>File contains the following periods:</strong></p>
                <p style={{ color: '#666', fontSize: '12px' }}>
                  Select which year/month combinations you want to upload
                </p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <Space>
                  <Button size="small" onClick={handleSelectAll}>Select All</Button>
                  <Button size="small" onClick={handleDeselectAll}>Deselect All</Button>
                  <span style={{ marginLeft: '16px', color: '#666' }}>
                    {selectedYearMonths.length} of {fileYearMonths.length} periods selected
                  </span>
                </Space>
              </div>

              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '4px', padding: '12px' }}>
                <Row gutter={[8, 8]}>
                  {fileYearMonths.map((ym) => {
                    const key = `${ym.year}-${ym.month}`;
                    const isSelected = selectedYearMonths.includes(key);
                    return (
                      <Col span={8} key={key}>
                        <div
                          onClick={() => handleYearMonthToggle(key)}
                          style={{
                            padding: '8px 12px',
                            border: `2px solid ${isSelected ? '#1890ff' : '#d9d9d9'}`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#e6f7ff' : '#fff',
                            transition: 'all 0.3s'
                          }}
                        >
                          <Space>
                            {isSelected ? <CheckCircleOutlined style={{ color: '#1890ff' }} /> : <div style={{ width: '14px' }} />}
                            <div>
                              <div style={{ fontWeight: 'bold' }}>
                                {new Date(ym.year, ym.month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {ym.count} records
                              </div>
                            </div>
                          </Space>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </div>
              </Space>
          </Space>
        )}
      </Modal>

      {/* Result Modal */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /> Upload Successful</Space>}
        open={resultModalVisible}
        onOk={() => setResultModalVisible(false)}
        onCancel={() => setResultModalVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setResultModalVisible(false)}>
            OK
          </Button>
        ]}
      >
        {uploadResult && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <p><strong>Records Processed:</strong> {uploadResult.recordsProcessed}</p>
            <p><strong>Mode:</strong> {uploadResult.mode?.toUpperCase()}</p>
            <p><strong>Log File:</strong> {uploadResult.logFile}</p>
            {uploadResult.message && <p style={{ color: '#52c41a' }}>{uploadResult.message}</p>}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default ActualTab;
