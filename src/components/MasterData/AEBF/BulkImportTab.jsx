import React, { useState, useCallback, useMemo } from 'react';
import { 
  Upload, Button, Table, Tabs, Card, Space, Tag, Modal, 
  Progress, Typography, Alert, Input, Statistic, Row, Col, Empty,
  Tooltip, Popconfirm
} from 'antd';
import { 
  InboxOutlined, UploadOutlined, DeleteOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
  FileTextOutlined, DownloadOutlined, SaveOutlined,
  SearchOutlined, TeamOutlined, UserOutlined
} from '@ant-design/icons';
import axios from 'axios';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import { ResizableTitle, useResizableColumns } from '../../shared/ResizableTable';

const { Dragger } = Upload;
const { Title, Text } = Typography;
const { Search } = Input;

/**
 * BulkImportTab Component
 * Handles bulk import of multiple sales rep budget files
 * Features:
 * - Multi-file upload with validation
 * - Preview of files before import
 * - Save to Draft or Final
 * - View merged data with sales rep tabs
 * - Export merged HTML
 */
const BulkImportTab = ({ selectedDivision, budgetYear, message, modal, isActive }) => {
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [validatedFiles, setValidatedFiles] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  // Batch viewer state
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchData, setBatchData] = useState([]);
  const [activeSalesRepTab, setActiveSalesRepTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingBatchData, setIsLoadingBatchData] = useState(false);
  
  // Pagination state - controlled to prevent reset on re-render
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);
  
  // Finalized budgets management state
  const [finalizedBudgets, setFinalizedBudgets] = useState([]);
  const [isLoadingFinalizedBudgets, setIsLoadingFinalizedBudgets] = useState(false);
  const [isDeletingBudget, setIsDeletingBudget] = useState(false);
  
  // Memoize table components to prevent re-renders
  const tableComponents = useMemo(() => ({
    header: { cell: ResizableTitle },
  }), []);

  // Validate uploaded files
  const validateFiles = useCallback(async (files) => {
    setIsValidating(true);
    const validated = [];
    
    for (const file of files) {
      try {
        const content = await readFileContent(file);
        
        // Check for IPD Budget System signature
        const signaturePattern = /<!--\s*IPD_BUDGET_SYSTEM_v[\d.]+\s*::\s*TYPE=(SALES_REP_BUDGET|DIVISIONAL_BUDGET)\s*::/;
        const signatureMatch = content.match(signaturePattern);
        
        // Extract metadata
        const metadataMatch = content.match(/const budgetMetadata = (\{[\s\S]*?\});/);
        
        let status = 'valid';
        let error = null;
        let metadata = null;
        let recordCount = 0;
        
        if (!signatureMatch) {
          status = 'warning';
          error = 'Missing IPD signature (legacy file)';
        } else if (signatureMatch[1] === 'DIVISIONAL_BUDGET') {
          status = 'error';
          error = 'Divisional budget file - not allowed';
        }
        
        // Check for draft
        const draftCheck = content.match(/const draftMetadata = ({[^;]+});/);
        if (draftCheck) {
          try {
            const draftMeta = JSON.parse(draftCheck[1]);
            if (draftMeta.isDraft === true) {
              status = 'error';
              error = 'Draft file - please save as Final first';
            }
          } catch (e) {}
        }
        
        if (metadataMatch) {
          try {
            metadata = JSON.parse(metadataMatch[1]);
            
            // Check division match
            if (metadata.division && selectedDivision && 
                metadata.division.toUpperCase() !== selectedDivision.toUpperCase()) {
              status = 'error';
              error = `Wrong division: ${metadata.division} (expected ${selectedDivision})`;
            }
            
            // Count records
            const budgetDataMatch = content.match(/const savedBudget = (\[[\s\S]*?\]);/);
            if (budgetDataMatch) {
              try {
                const budgetData = JSON.parse(budgetDataMatch[1]);
                recordCount = Array.isArray(budgetData) ? budgetData.length : 0;
              } catch (e) {}
            }
          } catch (e) {
            status = 'error';
            error = 'Failed to parse metadata';
          }
        } else {
          status = 'error';
          error = 'Invalid file format - no metadata found';
        }
        
        validated.push({
          file,
          name: file.name,
          size: file.size,
          status,
          error,
          metadata,
          recordCount,
          content: status !== 'error' ? content : null // Only keep content for valid files
        });
      } catch (e) {
        validated.push({
          file,
          name: file.name,
          size: file.size,
          status: 'error',
          error: 'Failed to read file',
          metadata: null,
          recordCount: 0,
          content: null
        });
      }
    }
    
    setValidatedFiles(validated);
    setIsValidating(false);
    return validated;
  }, [selectedDivision]);

  // Read file content as text
  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  // Handle file selection
  const handleFileSelect = async (info) => {
    const { fileList, file } = info;
    
    // Handle both click and drag scenarios
    let files;
    if (fileList && fileList.length > 0) {
      // Extract originFileObj or use file directly if it's already a File object
      files = fileList.map(f => {
        if (f.originFileObj) return f.originFileObj;
        if (f instanceof File) return f;
        return null;
      }).filter(Boolean);
    } else if (file) {
      // Fallback for single file
      files = [file.originFileObj || file].filter(Boolean);
    } else {
      files = [];
    }
    
    setSelectedFiles(files);
    
    if (files.length > 0) {
      await validateFiles(files);
    } else {
      setValidatedFiles([]);
    }
  };

  // Custom upload request (prevent actual upload)
  const customRequest = ({ onSuccess }) => {
    setTimeout(() => onSuccess("ok"), 0);
  };

  // Import files to database
  const handleImport = async (saveToFinal) => {
    const validFiles = validatedFiles.filter(f => f.status !== 'error' && f.content);
    
    if (validFiles.length === 0) {
      message.error('No valid files to import');
      return;
    }
    
    setIsImporting(true);
    setUploadProgress(0);
    
    try {
      const response = await axios.post('/api/aebf/bulk-import', {
        files: validFiles.map(f => ({
          filename: f.name,
          htmlContent: f.content,
          salesRep: f.metadata?.salesRep,
          division: f.metadata?.division,
          budgetYear: f.metadata?.budgetYear
        })),
        saveToFinal,
        division: selectedDivision
      }, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });
      
      if (response.data.success) {
        setImportResult(response.data);
        message.success(`Successfully imported ${response.data.importedCount} records from ${response.data.salesReps?.length || 0} sales reps!`);
        
        // Clear selected files
        setSelectedFiles([]);
        setValidatedFiles([]);
        
        // Refresh batches list
        fetchBatches();
      } else {
        message.error(response.data.error || 'Import failed');
      }
    } catch (error) {
      console.error('Bulk import error:', error);
      message.error(error.response?.data?.error || 'Failed to import files');
    } finally {
      setIsImporting(false);
      setUploadProgress(0);
    }
  };

  // Fetch batches list
  const fetchBatches = useCallback(async () => {
    if (!selectedDivision) return;
    
    setIsLoadingBatches(true);
    try {
      const response = await axios.get('/api/aebf/bulk-batches', {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        setBatches(response.data.batches || []);
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
    } finally {
      setIsLoadingBatches(false);
    }
  }, [selectedDivision]);

  // Fetch batch data
  const fetchBatchData = useCallback(async (batchId) => {
    setIsLoadingBatchData(true);
    setCurrentPage(1); // Reset pagination when loading new batch
    setActiveSalesRepTab('all'); // Reset sales rep filter
    setSearchText(''); // Reset search
    try {
      const response = await axios.get(`/api/aebf/bulk-batch/${batchId}`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        setBatchData(response.data.data || []);
        setSelectedBatch(response.data.batch);
      }
    } catch (error) {
      console.error('Error fetching batch data:', error);
      message.error('Failed to load batch data');
    } finally {
      setIsLoadingBatchData(false);
    }
  }, [selectedDivision, message]);

  // Export merged HTML
  const handleExportMerged = async () => {
    if (!selectedBatch) return;
    
    setIsExporting(true);
    try {
      const response = await axios.get(`/api/aebf/bulk-export/${selectedBatch.batch_id}`, {
        params: { division: selectedDivision },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MERGED_BUDGET_${selectedDivision}_${selectedBatch.budget_year}_${selectedBatch.batch_id}.html`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('Merged HTML exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export merged HTML');
    } finally {
      setIsExporting(false);
    }
  };

  // Delete batch
  const handleDeleteBatch = async (batchId) => {
    try {
      const response = await axios.delete(`/api/aebf/bulk-batch/${batchId}`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        message.success('Batch deleted successfully');
        setBatches(prev => prev.filter(b => b.batch_id !== batchId));
        if (selectedBatch?.batch_id === batchId) {
          setSelectedBatch(null);
          setBatchData([]);
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
      message.error('Failed to delete batch');
    }
  };

  // Fetch finalized budgets from fp_budget_unified (ALL years)
  const fetchFinalizedBudgets = useCallback(async () => {
    if (!selectedDivision) return;
    
    setIsLoadingFinalizedBudgets(true);
    try {
      const response = await axios.get('/api/aebf/finalized-budgets', {
        params: { 
          division: selectedDivision
          // No budgetYear filter - show ALL submitted budgets
        }
      });
      
      if (response.data.success) {
        setFinalizedBudgets(response.data.data?.budgets || []);
      }
    } catch (error) {
      console.error('Error fetching finalized budgets:', error);
    } finally {
      setIsLoadingFinalizedBudgets(false);
    }
  }, [selectedDivision]);

  // Delete finalized budget for a specific sales rep
  const handleDeleteFinalizedBudget = async (budget) => {
    modal.confirm({
      title: '🗑️ Delete Finalized Budget?',
      content: (
        <div>
          <p>This will permanently delete <strong>{budget.recordCount}</strong> budget records for:</p>
          <ul style={{ marginTop: 8 }}>
            <li><strong>Sales Rep:</strong> {budget.salesRepGroupName}</li>
            <li><strong>Year:</strong> {budget.budgetYear}</li>
            <li><strong>Source:</strong> {budget.dataSource}</li>
            <li><strong>Volume:</strong> {budget.totalMT?.toFixed(2)} MT</li>
          </ul>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}><strong>This action cannot be undone!</strong></p>
        </div>
      ),
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setIsDeletingBudget(true);
        try {
          const response = await axios.delete('/api/aebf/finalized-budget', {
            params: {
              division: selectedDivision,
              salesRepGroupName: budget.salesRepGroupName,
              budgetYear: budget.budgetYear,
              dataSource: budget.dataSource
            }
          });
          
          if (response.data.success) {
            message.success(`Deleted ${response.data.data?.deletedCount || 0} budget records for ${budget.salesRepGroupName}`);
            fetchFinalizedBudgets(); // Refresh the list
          }
        } catch (error) {
          console.error('Delete error:', error);
          message.error(error.response?.data?.error || 'Failed to delete budget');
        } finally {
          setIsDeletingBudget(false);
        }
      }
    });
  };

  // Finalize batch (move to final table)
  const handleFinalizeBatch = async () => {
    if (!selectedBatch) return;
    
    modal.confirm({
      title: '📋 Finalize Bulk Import?',
      content: (
        <div>
          <p>This will move all {batchData.length} records from draft to the final budget table.</p>
          <p><strong>This action cannot be undone.</strong></p>
        </div>
      ),
      okText: 'Yes, Finalize',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await axios.post(`/api/aebf/bulk-finalize/${selectedBatch.batch_id}`, {
            division: selectedDivision  // Pass division in request body as required by backend
          });
          
          if (response.data.success) {
            message.success(`Finalized ${response.data.recordCount} records!`);
            fetchBatches();
            setSelectedBatch(null);
            setBatchData([]);
          }
        } catch (error) {
          console.error('Finalize error:', error);
          message.error(error.response?.data?.error || 'Failed to finalize batch');
        }
      }
    });
  };

  // Get unique sales reps from batch data - MEMOIZED to prevent re-computation
  const salesRepsInBatch = useMemo(() => {
    return [...new Set(batchData.map(r => r.sales_rep))].sort();
  }, [batchData]);

  // Filter batch data by search and selected sales rep - MEMOIZED to prevent pagination reset
  const filteredBatchData = useMemo(() => {
    return batchData.filter(row => {
      // Filter by sales rep tab
      if (activeSalesRepTab !== 'all' && row.sales_rep !== activeSalesRepTab) {
        return false;
      }
      
      // Filter by search text
      if (searchText) {
        const search = searchText.toLowerCase();
        return (
          row.customer?.toLowerCase().includes(search) ||
          row.country?.toLowerCase().includes(search) ||
          row.product_group?.toLowerCase().includes(search) ||
          row.sales_rep?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [batchData, activeSalesRepTab, searchText]);

  // Calculate totals - MEMOIZED
  const totals = useMemo(() => {
    return filteredBatchData.reduce((acc, row) => {
      acc.totalKG += parseFloat(row.total_kg) || 0;
      acc.totalAmount += parseFloat(row.total_amount) || 0;
      acc.totalMoRM += parseFloat(row.total_morm) || 0;
      return acc;
    }, { totalKG: 0, totalAmount: 0, totalMoRM: 0 });
  }, [filteredBatchData]);

  // Format number with thousands separator
  const formatNumber = (value) => {
    if (!value || value === 0) return '0';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  // Table columns for validated files
  const fileColumns = [
    {
      title: 'File Name',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <FileTextOutlined />
          <Text>{name}</Text>
        </Space>
      )
    },
    {
      title: 'Sales Rep',
      dataIndex: ['metadata', 'salesRep'],
      key: 'salesRep',
      render: (salesRep) => salesRep || '-'
    },
    {
      title: 'Year',
      dataIndex: ['metadata', 'budgetYear'],
      key: 'budgetYear',
      width: 80,
      render: (year) => year || '-'
    },
    {
      title: 'Records',
      dataIndex: 'recordCount',
      key: 'recordCount',
      width: 80,
      align: 'center'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status, record) => {
        if (status === 'valid') {
          return <Tag icon={<CheckCircleOutlined />} color="success">Valid</Tag>;
        } else if (status === 'warning') {
          return <Tooltip title={record.error}><Tag icon={<WarningOutlined />} color="warning">Warning</Tag></Tooltip>;
        } else {
          return <Tooltip title={record.error}><Tag icon={<CloseCircleOutlined />} color="error">Error</Tag></Tooltip>;
        }
      }
    }
  ];

  // Table columns for batch data (base definition)
  const baseBatchDataColumns = useMemo(() => [
    { title: 'Sales Rep', dataIndex: 'sales_rep', key: 'sales_rep', width: 150, fixed: 'left' },
    { 
      title: 'Customer', 
      dataIndex: 'customer', 
      key: 'customer', 
      width: 220,
      render: (text, record) => (
        <Space>
          {text}
          {record.is_prospect && (
            <Tag color="orange" style={{ marginLeft: 4 }}>Prospect</Tag>
          )}
        </Space>
      )
    },
    { title: 'Country', dataIndex: 'country', key: 'country', width: 100 },
    { title: 'Product Group', dataIndex: 'product_group', key: 'product_group', width: 100 },
    ...Array.from({ length: 12 }, (_, i) => ({
      title: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      dataIndex: `month_${i + 1}`,
      key: `month_${i + 1}`,
      width: 70,
      align: 'right',
      render: (val) => val ? parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'
    })),
    { 
      title: 'Total KG', 
      dataIndex: 'total_kg', 
      key: 'total_kg', 
      width: 100, 
      align: 'right',
      render: (val) => val ? parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'
    }
  ], []);

  // Use resizable columns hook for batch data table
  const [batchDataColumns] = useResizableColumns(baseBatchDataColumns, 'bulk-import-batch-data');

  // Batches table columns
  const batchColumns = [
    { title: 'Batch ID', dataIndex: 'batch_id', key: 'batch_id', width: 120 },
    { title: 'Year', dataIndex: 'budget_year', key: 'budget_year', width: 80 },
    { 
      title: 'Sales Reps', 
      dataIndex: 'sales_reps', 
      key: 'sales_reps', 
      width: 200,
      render: (salesReps) => {
        if (!salesReps || salesReps.length === 0) return '-';
        // Show names as tags
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {salesReps.map((name, idx) => (
              <Tag key={idx} icon={<TeamOutlined />} color="blue">{name}</Tag>
            ))}
          </div>
        );
      }
    },
    { title: 'Records', dataIndex: 'record_count', key: 'record_count', width: 80 },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status', 
      width: 100,
      render: (status) => (
        <Tag color={status === 'final' ? 'green' : 'blue'}>
          {status === 'final' ? 'Final' : 'Draft'}
        </Tag>
      )
    },
    { 
      title: 'Imported', 
      dataIndex: 'imported_at', 
      key: 'imported_at',
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button 
            size="small" 
            onClick={() => fetchBatchData(record.batch_id)}
          >
            View
          </Button>
          <Popconfirm
            title="Delete this batch?"
            onConfirm={() => handleDeleteBatch(record.batch_id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Load batches on mount
  React.useEffect(() => {
    fetchBatches();
    fetchFinalizedBudgets();
  }, [fetchBatches, fetchFinalizedBudgets]);

  // Re-fetch when tab becomes active (to get fresh data)
  React.useEffect(() => {
    if (isActive) {
      fetchBatches();
      fetchFinalizedBudgets();
    }
  }, [isActive, fetchFinalizedBudgets]);

  // Valid and error counts
  const validCount = validatedFiles.filter(f => f.status !== 'error').length;
  const errorCount = validatedFiles.filter(f => f.status === 'error').length;
  const totalRecords = validatedFiles.filter(f => f.status !== 'error').reduce((sum, f) => sum + f.recordCount, 0);

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Upload Section */}
      <Card 
        title={
          <Space>
            <UploadOutlined />
            <span>Bulk Import Sales Rep Budget Files</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Dragger
          multiple
          accept=".html"
          fileList={selectedFiles.map((f, i) => ({ 
            uid: i, 
            name: f.name, 
            status: 'done',
            originFileObj: f 
          }))}
          onChange={handleFileSelect}
          customRequest={customRequest}
          showUploadList={false}
          disabled={isImporting}
          beforeUpload={() => false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">Click or drag HTML budget files here</p>
          <p className="ant-upload-hint">
            Select multiple FINAL sales rep budget files for bulk import.
            Only files for division <strong>{selectedDivision || '(select division)'}</strong> will be accepted.
          </p>
        </Dragger>

        {/* Validated Files Table */}
        {validatedFiles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Tag color="green">{validCount} Valid</Tag>
                {errorCount > 0 && <Tag color="red">{errorCount} Errors</Tag>}
                <Text type="secondary">Total: {totalRecords} records</Text>
              </Space>
              <Button 
                type="link" 
                danger 
                onClick={() => { setSelectedFiles([]); setValidatedFiles([]); }}
              >
                Clear All
              </Button>
            </div>
            
            <Table
              dataSource={validatedFiles}
              columns={fileColumns}
              rowKey="name"
              size="small"
              pagination={false}
              rowClassName={(record) => record.status === 'error' ? 'bulk-error-row' : ''}
              style={{ marginBottom: 8 }}
            />
            <style>{`
              .bulk-error-row { background-color: #fff2f0 !important; }
              .bulk-error-row:hover td { background-color: #ffebe8 !important; }
            `}</style>
            
            {isImporting && (
              <Progress percent={uploadProgress} status="active" style={{ marginTop: 12 }} />
            )}
            
            <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button
                type="default"
                icon={<SaveOutlined />}
                onClick={() => handleImport(false)}
                disabled={validCount === 0 || isImporting}
                loading={isImporting}
              >
                Import to Draft
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleImport(true)}
                disabled={validCount === 0 || isImporting}
                loading={isImporting}
              >
                Import to Final
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Existing Batches */}
      <Card 
        title={
          <Space>
            <TeamOutlined />
            <span>Import History</span>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchBatches} loading={isLoadingBatches}>
            Refresh
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Table
          dataSource={batches}
          columns={batchColumns}
          rowKey="batch_id"
          size="small"
          loading={isLoadingBatches}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: <Empty description="No bulk imports yet" /> }}
        />
      </Card>

      {/* Batch Data Viewer */}
      {selectedBatch && (
        <Card 
          title={
            <Space>
              <FileTextOutlined />
              <span>Batch: {selectedBatch.batch_id}</span>
              <Tag color={selectedBatch.status === 'final' ? 'green' : 'blue'}>
                {selectedBatch.status === 'final' ? 'Final' : 'Draft'}
              </Tag>
            </Space>
          }
          extra={
            <Space>
              <Search
                placeholder="Search customer, country, product..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setCurrentPage(1); // Reset to page 1 when search changes
                }}
                style={{ width: 250 }}
                allowClear
              />
              <Button 
                icon={<DownloadOutlined />} 
                onClick={handleExportMerged}
                loading={isExporting}
              >
                Export Merged HTML
              </Button>
              {selectedBatch.status !== 'final' && (
                <Button 
                  type="primary" 
                  icon={<CheckCircleOutlined />}
                  onClick={handleFinalizeBatch}
                >
                  Submit to Final
                </Button>
              )}
              <Button onClick={() => { setSelectedBatch(null); setBatchData([]); }}>
                Close
              </Button>
            </Space>
          }
        >
          {/* Summary Stats */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic 
                  title="Sales Reps" 
                  value={salesRepsInBatch.length} 
                  prefix={<TeamOutlined />} 
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic 
                  title="Total MT" 
                  value={formatNumber(totals.totalKG / 1000)} 
                  suffix="MT"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic 
                  title="Total Amount" 
                  value={formatNumber(totals.totalAmount)} 
                  prefix={<CurrencySymbol />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic 
                  title="Total MoRM" 
                  value={formatNumber(totals.totalMoRM)} 
                  prefix={<CurrencySymbol />}
                />
              </Card>
            </Col>
          </Row>

          {/* Sales Rep Tabs */}
          <Tabs
            activeKey={activeSalesRepTab}
            onChange={(key) => {
              setActiveSalesRepTab(key);
              setCurrentPage(1); // Reset to page 1 when switching tabs
            }}
            size="small"
            items={[
              { key: 'all', label: `📊 All (${batchData.length})` },
              ...salesRepsInBatch.map(rep => ({
                key: rep,
                label: (
                  <Space>
                    <UserOutlined />
                    {rep} ({batchData.filter(r => r.sales_rep === rep).length})
                  </Space>
                )
              }))
            ]}
          />

          {/* Data Table */}
          <Table
            components={tableComponents}
            dataSource={filteredBatchData}
            columns={batchDataColumns}
            rowKey={(r, index) => r.id || `${r.sales_rep}-${r.customer}-${r.product_group}-${index}`}
            size="small"
            loading={isLoadingBatchData}
            scroll={{ x: 1800 }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `${total} records`,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
            }}
          />
        </Card>
      )}

      {/* Finalized Budgets Management Section */}
      <Card
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Submitted Budgets</span>
            <Tooltip title="All sales rep budgets that have been finalized and saved to the database. Select and delete to re-import with corrections.">
              <WarningOutlined style={{ color: '#faad14', fontSize: 14 }} />
            </Tooltip>
          </Space>
        }
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            size="small"
            onClick={fetchFinalizedBudgets}
            loading={isLoadingFinalizedBudgets}
          >
            Refresh
          </Button>
        }
        style={{ marginTop: 16 }}
      >
        {finalizedBudgets.length === 0 ? (
          <Empty 
            description="No finalized sales rep budgets found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            dataSource={finalizedBudgets}
            rowKey={(r) => `${r.salesRepGroupName}-${r.budgetYear}-${r.dataSource}`}
            size="small"
            loading={isLoadingFinalizedBudgets || isDeletingBudget}
            pagination={false}
            columns={[
              {
                title: 'Sales Rep',
                dataIndex: 'salesRepGroupName',
                key: 'salesRepGroupName',
                render: (text) => (
                  <Space>
                    <TeamOutlined />
                    <strong>{text}</strong>
                  </Space>
                )
              },
              {
                title: 'Year',
                dataIndex: 'budgetYear',
                key: 'budgetYear',
                width: 80,
                align: 'center',
                render: (year) => <Tag color="blue">{year}</Tag>
              },
              {
                title: 'Source',
                dataIndex: 'dataSource',
                key: 'dataSource',
                width: 140,
                render: (source) => (
                  <Tag color={source === 'BULK_IMPORT' ? 'purple' : 'green'}>
                    {source === 'BULK_IMPORT' ? 'Bulk Import' : 'Sales Rep Import'}
                  </Tag>
                )
              },
              {
                title: 'Records',
                dataIndex: 'recordCount',
                key: 'recordCount',
                width: 80,
                align: 'right',
                render: (count) => count?.toLocaleString()
              },
              {
                title: 'Volume (MT)',
                dataIndex: 'totalMT',
                key: 'totalMT',
                width: 120,
                align: 'right',
                render: (mt) => <strong>{mt?.toFixed(2)}</strong>
              },
              {
                title: 'Amount',
                dataIndex: 'totalAmount',
                key: 'totalAmount',
                width: 140,
                align: 'right',
                render: (amt) => (
                  <span>
                    <CurrencySymbol />
                    {amt?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )
              },
              {
                title: 'Last Updated',
                dataIndex: 'lastUpdated',
                key: 'lastUpdated',
                width: 160,
                render: (date) => date ? new Date(date).toLocaleString() : '-'
              },
              {
                title: 'Actions',
                key: 'actions',
                width: 100,
                align: 'center',
                render: (_, record) => (
                  <Popconfirm
                    title="Delete this budget?"
                    description={`This will delete all ${record.recordCount} records for ${record.salesRepGroupName}`}
                    onConfirm={() => handleDeleteFinalizedBudget(record)}
                    okText="Delete"
                    okType="danger"
                    cancelText="Cancel"
                  >
                    <Button 
                      size="small" 
                      danger 
                      icon={<DeleteOutlined />}
                      loading={isDeletingBudget}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                )
              }
            ]}
          />
        )}
      </Card>
    </div>
  );
};

export default BulkImportTab;
