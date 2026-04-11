/**
 * Customer Merging AI Suggestions Page
 * 
 * Step 2: Shows AI-generated merge suggestions with:
 * - Similarity threshold slider
 * - Confidence scores
 * - Approve/Reject functionality
 */

import React, { useState, useEffect } from 'react';
import {
  App,
  Card,
  Button,
  Table,
  Tag,
  Space,
  Statistic,
  Row,
  Col,
  Tooltip,
  Popconfirm,
  Alert,
  Slider,
  Progress,
  Divider,
  Badge,
  Empty,
  Spin,
  Input,
  Modal,
  Form,
  Select,
  List,
  Typography
} from 'antd';

const { Search } = Input;
import {
  ThunderboltOutlined,
  CheckOutlined,
  CloseOutlined,
  RobotOutlined,
  UserOutlined,
  PercentageOutlined,
  ReloadOutlined,
  BulbOutlined,
  MergeCellsOutlined,
  SearchOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import axios from 'axios';

const { Text } = Typography;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerMergingAISuggestions = () => {
  const { message } = App.useApp();
  const { selectedDivision } = useExcelData();
  const [form] = Form.useForm();

  // State
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  
  // Multi-select state
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [editedMergeName, setEditedMergeName] = useState('');
  const [additionalCustomers, setAdditionalCustomers] = useState([]);
  const [removedCustomers, setRemovedCustomers] = useState([]); // Track customers removed from suggestion
  const [allCustomers, setAllCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  
  // Threshold state
  const [minConfidence, setMinConfidence] = useState(0.10);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [searchText, setSearchText] = useState('');

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  // Load existing suggestions on mount
  useEffect(() => {
    if (selectedDivision) {
      loadSuggestions();
    }
  }, [selectedDivision]);

  // Tabs keep panes mounted; refresh when a global reset happens elsewhere
  useEffect(() => {
    const handler = (event) => {
      const division = event?.detail?.division;
      if (!selectedDivision) return;
      if (division && division !== selectedDivision) return;
      loadSuggestions();
      setSelectedRowKeys([]);
      setCurrentPage(1);
    };

    window.addEventListener('customer-management:reset', handler);
    return () => window.removeEventListener('customer-management:reset', handler);
  }, [selectedDivision]);

  // Filter suggestions by confidence threshold, status, and search text
  useEffect(() => {
    let filtered = suggestions;
    
    // Apply status filter first
    if (statusFilter === 'pending') {
      filtered = filtered.filter(s => !s.admin_action || s.admin_action === 'PENDING');
      // Only apply confidence threshold for pending suggestions
      filtered = filtered.filter(s => s.confidence >= minConfidence);
    } else if (statusFilter === 'approved') {
      filtered = filtered.filter(s => s.admin_action === 'APPROVED' || s.admin_action === 'MODIFIED');
    } else if (statusFilter === 'rejected') {
      filtered = filtered.filter(s => s.admin_action === 'REJECTED');
    } else {
      // 'all' - apply confidence threshold only to pending
      filtered = filtered.filter(s => 
        s.admin_action || s.confidence >= minConfidence
      );
    }
    
    // Apply search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(s =>
        s.original_customer?.toLowerCase().includes(search) ||
        s.suggested_target?.toLowerCase().includes(search) ||
        s.customer_group?.some(c => c && typeof c === 'string' && c.toLowerCase().includes(search))
      );
    }
    
    setFilteredSuggestions(filtered);
    // Reset pagination and selection when filters change
    setCurrentPage(1);
    setSelectedRowKeys([]);
  }, [suggestions, minConfidence, statusFilter, searchText]);

  // ========================================================================
  // API CALLS
  // ========================================================================

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/division-merge-rules/suggestions`,
        { params: { division: selectedDivision } }
      );

      if (response.data.success) {
        setSuggestions(response.data.data || []);
        calculateStats(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      message.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const runAIScan = async () => {
    setScanning(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/scan`,
        { 
          division: selectedDivision,
          minConfidence: minConfidence
        }
      );

      if (response.data.success) {
        message.success(`AI scan complete! Found ${response.data.count} suggestions`);
        loadSuggestions(); // Reload suggestions
      }
    } catch (error) {
      console.error('Error running AI scan:', error);
      message.error('Failed to run AI scan');
    } finally {
      setScanning(false);
    }
  };

  const approveSuggestion = async (suggestion) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/suggestions/${suggestion.id}/approve`,
        { division: selectedDivision }
      );

      if (response.data.success) {
        message.success('Suggestion approved and merge rule created');
        loadSuggestions();
      }
    } catch (error) {
      console.error('Error approving suggestion:', error);
      message.error('Failed to approve suggestion');
    }
  };

  // Bulk approve multiple suggestions
  const bulkApproveSuggestions = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select suggestions to approve');
      return;
    }

    setBulkApproving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedRowKeys) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/division-merge-rules/suggestions/${id}/approve`,
          { division: selectedDivision }
        );
        if (response.data.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error approving suggestion ${id}:`, error);
        errorCount++;
      }
    }

    setBulkApproving(false);
    setSelectedRowKeys([]);
    
    if (successCount > 0) {
      message.success(`Successfully approved ${successCount} suggestions`);
    }
    if (errorCount > 0) {
      message.error(`Failed to approve ${errorCount} suggestions`);
    }
    
    await loadSuggestions();
  };

  // Load all customers for the "Add More Customers" dropdown
  const loadAllCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/division-merge-rules/customers/list`,
        { params: { division: selectedDivision } }
      );
      if (response.data.success) {
        // Map the customer objects to the format expected by the component
        // API returns array of { name, country } objects
        const customers = (response.data.customers || []).map(customer => ({
          customer_name: typeof customer === 'string' ? customer : customer.name,
          customer_code: typeof customer === 'string' ? customer : customer.name,
          country: typeof customer === 'string' ? 'Unknown' : customer.country
        }));
        setAllCustomers(customers);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (suggestion) => {
    setEditingSuggestion(suggestion);
    
    // Default to the customer name from Actual Data (source of truth)
    // If multiple from Actual Data, use the first one
    // Otherwise fall back to the AI suggestion
    let defaultName = suggestion.suggested_target;
    if (suggestion.customerDetails && suggestion.customerDetails.length > 0) {
      const actualDataCustomer = suggestion.customerDetails.find(c => c.source === 'Actual Data');
      if (actualDataCustomer) {
        defaultName = actualDataCustomer.name;
      }
    }
    
    setEditedMergeName(defaultName);
    setAdditionalCustomers([]);
    setRemovedCustomers([]); // Reset removed customers when opening modal
    setEditModalVisible(true);
    loadAllCustomers();
  };

  // Save edited suggestion and approve
  const saveAndApprove = async () => {
    if (!editedMergeName.trim()) {
      message.error('Please enter a merge name');
      return;
    }

    // Calculate remaining customers after removals
    const originalCustomers = editingSuggestion.customerDetails || editingSuggestion.customer_group || [editingSuggestion.original_customer];
    const remainingCount = originalCustomers.length - removedCustomers.length + additionalCustomers.length;
    
    if (remainingCount < 2) {
      message.error('A merge rule requires at least 2 customers. Add more customers or cancel.');
      return;
    }

    try {
      // Send additional and removed customers
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/suggestions/${editingSuggestion.id}/approve`,
        { 
          division: selectedDivision,
          modifiedName: editedMergeName.trim(),
          additionalCustomers: additionalCustomers,  // New ones user added
          removedCustomers: removedCustomers  // Ones user removed from original suggestion
        }
      );

      if (response.data.success) {
        message.success('Merge rule created with your modifications');
        setEditModalVisible(false);
        setEditingSuggestion(null);
        await loadSuggestions();
      }
    } catch (error) {
      console.error('Error saving modified suggestion:', error);
      message.error(error.response?.data?.error || 'Failed to save changes');
    }
  };

  const rejectSuggestion = async (suggestion) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/suggestions/${suggestion.id}/reject`,
        { division: selectedDivision }
      );

      if (response.data.success) {
        message.success('Suggestion rejected');
        loadSuggestions();
      }
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
      message.error('Failed to reject suggestion');
    }
  };

  const calculateStats = (data) => {
    const pending = data.filter(s => !s.admin_action || s.admin_action === 'PENDING').length;
    // Count both APPROVED and MODIFIED as approved (both create rules)
    const approved = data.filter(s => s.admin_action === 'APPROVED' || s.admin_action === 'MODIFIED').length;
    const rejected = data.filter(s => s.admin_action === 'REJECTED').length;
    
    setStats({
      total: data.length,
      pending,
      approved,
      rejected
    });
  };

  // ========================================================================
  // TABLE COLUMNS
  // ========================================================================

  const columns = [
    {
      title: 'Original Customer',
      dataIndex: 'original_customer',
      key: 'original_customer',
      width: 250,
      ellipsis: true,
      render: (name) => (
        <Tooltip title={name}>
          <strong style={{ color: '#1890ff' }}>{name}</strong>
        </Tooltip>
      ),
      sorter: (a, b) => a.original_customer.localeCompare(b.original_customer)
    },
    {
      title: <><MergeCellsOutlined /> Suggested Merge To</>,
      dataIndex: 'suggested_target',
      key: 'suggested_target',
      width: 250,
      ellipsis: true,
      render: (name) => (
        <Tooltip title={name}>
          <strong style={{ color: '#52c41a' }}>{name}</strong>
        </Tooltip>
      ),
      sorter: (a, b) => a.suggested_target.localeCompare(b.suggested_target)
    },
    {
      title: <><PercentageOutlined /> Confidence</>,
      dataIndex: 'confidence',
      key: 'confidence',
      width: 150,
      align: 'center',
      render: (confidence) => {
        const percent = Math.round(confidence * 100);
        let color = 'red';
        if (percent >= 90) color = 'green';
        else if (percent >= 75) color = 'blue';
        else if (percent >= 60) color = 'orange';
        
        return (
          <Progress
            percent={percent}
            size="small"
            strokeColor={color}
            format={(p) => `${p}%`}
          />
        );
      },
      sorter: (a, b) => a.confidence - b.confidence,
      defaultSortOrder: 'descend'
    },
    {
      title: 'Match Reason',
      dataIndex: 'match_reason',
      key: 'match_reason',
      width: 200,
      ellipsis: true,
      render: (reason) => (
        <Tooltip title={reason}>
          <Tag color="purple">{reason || 'AI Similarity'}</Tag>
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'admin_action',
      key: 'admin_action',
      width: 100,
      align: 'center',
      render: (action) => {
        if (action === 'APPROVED' || action === 'MODIFIED') {
          return <Tag color="success">Approved</Tag>;
        } else if (action === 'REJECTED') {
          return <Tag color="error">Rejected</Tag>;
        }
        return <Tag color="warning">Pending</Tag>;
      },
      filters: [
        { text: 'Pending', value: 'PENDING' },
        { text: 'Approved', value: 'APPROVED' },
        { text: 'Rejected', value: 'REJECTED' }
      ],
      onFilter: (value, record) => {
        if (value === 'PENDING') return !record.admin_action || record.admin_action === 'PENDING';
        if (value === 'APPROVED') return record.admin_action === 'APPROVED' || record.admin_action === 'MODIFIED';
        return record.admin_action === value;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, record) => {
        // Show Approve/Edit/Reject buttons for pending
        if (!record.admin_action || record.admin_action === 'PENDING') {
          return (
            <Space size="small">
              <Tooltip title="Edit merge name or add customers">
                <Button 
                  size="small" 
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(record)}
                >
                  Edit
                </Button>
              </Tooltip>
              <Popconfirm
                title="Approve this merge suggestion?"
                description={`Merge "${record.original_customer}" into "${record.suggested_target}"`}
                onConfirm={() => approveSuggestion(record)}
                okText="Approve"
                cancelText="Cancel"
              >
                <Button type="primary" size="small" icon={<CheckOutlined />}>
                  Approve
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Reject this suggestion?"
                onConfirm={() => rejectSuggestion(record)}
                okText="Reject"
                cancelText="Cancel"
              >
                <Button danger size="small" icon={<CloseOutlined />}>
                  Reject
                </Button>
              </Popconfirm>
            </Space>
          );
        }
        
        // For REJECTED - show Edit and Re-Approve buttons
        if (record.admin_action === 'REJECTED') {
          return (
            <Space size="small">
              <Tooltip title="Edit and re-approve">
                <Button 
                  size="small" 
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(record)}
                >
                  Edit
                </Button>
              </Tooltip>
              <Popconfirm
                title="Re-approve this suggestion?"
                description={`This was previously rejected. Create merge rule now?`}
                onConfirm={() => approveSuggestion(record)}
                okText="Re-Approve"
                cancelText="Cancel"
              >
                <Button type="primary" size="small" icon={<CheckOutlined />}>
                  Re-Approve
                </Button>
              </Popconfirm>
            </Space>
          );
        }
        
        // For APPROVED/MODIFIED - show as processed
        return <Tag color="success">Rule Created</Tag>;
      }
    }
  ];

  // Only show pending suggestions
  const pendingSuggestions = filteredSuggestions.filter(s => !s.admin_action);

  // Get style for clickable stat cards
  const getStatStyle = (filter) => ({
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: 8,
    background: statusFilter === filter ? '#e6f7ff' : 'transparent',
    border: statusFilter === filter ? '1px solid #1890ff' : '1px solid transparent',
    transition: 'all 0.3s'
  });

  return (
    <div className="customer-merging-ai-suggestions">
      {/* Header with Stats - Clickable to filter */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col flex="auto">
            <Space size="large">
              <div style={getStatStyle('all')} onClick={() => setStatusFilter('all')}>
                <Statistic
                  title={<span>Total {statusFilter === 'all' && <Tag color="blue" style={{ marginLeft: 4 }}>Active</Tag>}</span>}
                  value={stats.total}
                  prefix={<RobotOutlined />}
                />
              </div>
              <Divider type="vertical" style={{ height: 40 }} />
              <div style={getStatStyle('pending')} onClick={() => setStatusFilter('pending')}>
                <Statistic
                  title={<span style={{ color: '#faad14' }}>Pending {statusFilter === 'pending' && <Tag color="blue" style={{ marginLeft: 4 }}>Active</Tag>}</span>}
                  value={stats.pending}
                  valueStyle={{ color: '#faad14' }}
                />
              </div>
              <div style={getStatStyle('approved')} onClick={() => setStatusFilter('approved')}>
                <Statistic
                  title={<span style={{ color: '#52c41a' }}>Approved {statusFilter === 'approved' && <Tag color="blue" style={{ marginLeft: 4 }}>Active</Tag>}</span>}
                  value={stats.approved}
                  valueStyle={{ color: '#52c41a' }}
                />
              </div>
              <div style={getStatStyle('rejected')} onClick={() => setStatusFilter('rejected')}>
                <Statistic
                  title={<span style={{ color: '#ff4d4f' }}>Rejected {statusFilter === 'rejected' && <Tag color="blue" style={{ marginLeft: 4 }}>Active</Tag>}</span>}
                  value={stats.rejected}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadSuggestions}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={runAIScan}
                loading={scanning}
              >
                Run AI Scan
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Threshold Controls */}
      <Card 
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <BulbOutlined />
            <span>AI Settings</span>
          </Space>
        }
      >
        <Row gutter={32}>
          <Col span={16}>
            <div style={{ marginBottom: 8 }}>
              <strong>Minimum Confidence Threshold: {Math.round(minConfidence * 100)}%</strong>
            </div>
            <Slider
              min={10}
              max={95}
              value={minConfidence * 100}
              onChange={(value) => setMinConfidence(value / 100)}
              marks={{
                10: '10%',
                30: '30%',
                50: '50%',
                75: '75%',
                90: '90%'
              }}
              tooltip={{ formatter: (value) => `${value}%` }}
            />
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              Lower threshold shows more suggestions (may include false positives)
            </div>
          </Col>
        </Row>
      </Card>

      {/* Search */}
      <Card style={{ marginBottom: 16 }}>
        <Search
          placeholder="Search by customer name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 400 }}
          prefix={<SearchOutlined />}
        />
      </Card>

      {/* Suggestions Table */}
      <Card
        title={
          <Space>
            <RobotOutlined />
            <span>AI Merge Suggestions</span>
            <Badge 
              count={pendingSuggestions.length} 
              style={{ backgroundColor: '#faad14' }}
              title="Pending review"
            />
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading suggestions...</div>
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <Empty
            description={
              <span>
                No suggestions found. Click "Run AI Scan" to find potential duplicates.
              </span>
            }
          >
            <Button type="primary" onClick={runAIScan} loading={scanning}>
              Run AI Scan Now
            </Button>
          </Empty>
        ) : (
          <>
            {/* Bulk Actions Bar */}
            {selectedRowKeys.length > 0 && (
              <div style={{ 
                marginBottom: 16, 
                padding: '12px 16px', 
                background: '#e6f7ff', 
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span>
                  <CheckOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                  <strong>{selectedRowKeys.length}</strong> suggestion(s) selected
                </span>
                <Space>
                  <Button 
                    onClick={() => setSelectedRowKeys([])}
                  >
                    Clear Selection
                  </Button>
                  <Popconfirm
                    title={`Approve ${selectedRowKeys.length} suggestions?`}
                    description="This will create merge rules for all selected suggestions."
                    onConfirm={bulkApproveSuggestions}
                    okText="Approve All"
                    cancelText="Cancel"
                  >
                    <Button 
                      type="primary" 
                      icon={<CheckOutlined />}
                      loading={bulkApproving}
                    >
                      Approve Selected ({selectedRowKeys.length})
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            )}
            <Table
              dataSource={filteredSuggestions}
              columns={columns}
              rowKey="id"
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
                getCheckboxProps: (record) => ({
                  // Only allow selection of pending suggestions
                  disabled: record.admin_action && record.admin_action !== 'PENDING'
                })
              }}
              pagination={{
                current: currentPage,
                pageSize: pageSize,
                total: filteredSuggestions.length,
                showSizeChanger: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} suggestions`,
                pageSizeOptions: ['10', '25', '50', '100'],
                onChange: (page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                },
                onShowSizeChange: (current, size) => {
                  setCurrentPage(1);
                  setPageSize(size);
                }
              }}
              scroll={{ x: 1200 }}
              size="small"
            />
          </>
        )}
      </Card>

      {/* Info Alert */}
      <Alert
        style={{ marginTop: 16 }}
        message="Step 2: Review AI Suggestions"
        description={
          <div>
            <p><strong>How it works:</strong> The AI analyzes customer names using multiple algorithms (Levenshtein, Jaro-Winkler, Phonetic matching) to find potential duplicates.</p>
            <p><strong>Confidence Score:</strong> Higher scores (90%+) indicate very likely duplicates. Lower scores (60-75%) may need manual review.</p>
            <p><strong>Actions:</strong> Edit to modify merge name or add customers, Approve to create a merge rule, Reject to dismiss.</p>
          </div>
        }
        type="info"
        showIcon
        icon={<RobotOutlined />}
      />

      {/* Edit Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Edit Merge Suggestion</span>
          </Space>
        }
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingSuggestion(null);
          setRemovedCustomers([]); // Reset removed customers
        }}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            Cancel
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            icon={<CheckOutlined />}
            onClick={saveAndApprove}
          >
            Save & Approve
          </Button>
        ]}
        width={700}
      >
        {editingSuggestion && (
          <div>
            {/* Customers from AI Suggestion (can be multiple) - WITH Country & Sales Rep */}
            <div style={{ marginBottom: 16 }}>
              <Text strong>Customers to be Merged (click to select as canonical name):</Text>
              <div style={{ 
                padding: '12px', 
                background: '#f5f5f5', 
                borderRadius: 4,
                marginTop: 4 
              }}>
                {/* Show all customers from the suggestion's customer_group with details */}
                {(editingSuggestion.customerDetails || editingSuggestion.customer_group || (editingSuggestion.original_customer ? [editingSuggestion.original_customer] : [])).map((item, idx) => {
                  // Handle both old format (string) and new format (object with name, country, salesRep, source)
                  const customerName = typeof item === 'string' ? item : item?.name;
                  const country = typeof item === 'object' ? item?.country : null;
                  const salesRep = typeof item === 'object' ? item?.salesRep : null;
                  const source = typeof item === 'object' ? item?.source : null;
                  const isRemoved = removedCustomers.includes(customerName);
                  const isSelected = editedMergeName === customerName;
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        flexWrap: 'wrap',
                        padding: '8px 6px',
                        borderBottom: idx < (editingSuggestion.customerDetails?.length || editingSuggestion.customer_group?.length || 1) - 1 ? '1px solid #e8e8e8' : 'none',
                        opacity: isRemoved ? 0.4 : 1,
                        textDecoration: isRemoved ? 'line-through' : 'none',
                        cursor: isRemoved ? 'default' : 'pointer',
                        transition: 'background 0.2s',
                        background: isSelected && !isRemoved ? '#e6f7ff' : 'transparent',
                        borderRadius: 4
                      }}
                      onClick={() => {
                        if (!isRemoved) {
                          setEditedMergeName(customerName);
                          message.success(`Selected "${customerName}" as canonical name`);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!isRemoved) e.currentTarget.style.background = isSelected ? '#e6f7ff' : '#f5f5f5';
                      }}
                      onMouseLeave={(e) => {
                        if (!isRemoved) e.currentTarget.style.background = isSelected ? '#e6f7ff' : 'transparent';
                      }}
                    >
                      <Tag 
                        color={isRemoved ? 'default' : (isSelected ? 'blue' : 'blue')} 
                        style={{ 
                          marginRight: 12, 
                          minWidth: 200,
                          fontWeight: isSelected ? 'bold' : 'normal',
                          border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9'
                        }}
                      >
                        {isSelected && '✓ '}{customerName}
                      </Tag>
                      {country && (
                        <Tag color="green" style={{ marginRight: 8 }}>
                          🌍 {country}
                        </Tag>
                      )}
                      {salesRep && (
                        <Tag color="purple" style={{ marginRight: 8 }}>
                          👤 {salesRep}
                        </Tag>
                      )}
                      {source && (
                        <Tag color="cyan" style={{ marginRight: 8 }}>
                          📊 {source}
                        </Tag>
                      )}
                      {/* Remove/Restore button */}
                      <Tooltip title={isRemoved ? 'Restore this customer' : 'Remove from merge'}>
                        <Button 
                          type={isRemoved ? 'primary' : 'text'}
                          size="small"
                          danger={!isRemoved}
                          icon={isRemoved ? <PlusOutlined /> : <CloseOutlined />}
                          style={{ marginLeft: 'auto' }}
                          onClick={() => {
                            if (isRemoved) {
                              // Restore customer
                              setRemovedCustomers(prev => prev.filter(c => c !== customerName));
                            } else {
                              // Remove customer
                              setRemovedCustomers(prev => [...prev, customerName]);
                            }
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {(editingSuggestion.customer_group?.length || 1) - removedCustomers.length} of {(editingSuggestion.customer_group?.length || 1)} customer(s) will be merged
              </Text>
              {/* Warning for mixed countries or sales reps */}
              {editingSuggestion.hasMixedCountries && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="warning">⚠️ Mixed Countries: {editingSuggestion.uniqueCountries?.join(', ')}</Tag>
                </div>
              )}
              {editingSuggestion.hasMixedSalesReps && (
                <div style={{ marginTop: 4 }}>
                  <Tag color="orange">⚠️ Mixed Sales Reps: {editingSuggestion.uniqueSalesReps?.join(', ')}</Tag>
                </div>
              )}
            </div>

            {/* Editable Merge Name */}
            <div style={{ marginBottom: 16 }}>
              <Text strong>Merge Into (Canonical Name):</Text>
              <div style={{ marginTop: 4, marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  💡 Tip: Click any customer name above to use it as the canonical name
                </Text>
              </div>
              <Input
                value={editedMergeName}
                onChange={(e) => setEditedMergeName(e.target.value)}
                placeholder="Enter the unified customer name"
                size="large"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                This will be the official name all duplicates merge into
              </Text>
            </div>

            {/* Add More Customers */}
            <div style={{ marginBottom: 16 }}>
              <Text strong>Add More Customers to This Merge:</Text>
              <Select
                mode="multiple"
                style={{ width: '100%', marginTop: 4 }}
                placeholder="Search and select additional customers to include..."
                value={additionalCustomers}
                onChange={setAdditionalCustomers}
                loading={loadingCustomers}
                showSearch
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
                options={allCustomers
                  .filter(c => {
                    // Exclude customers already in the suggestion's customer_group
                    const existingCustomers = editingSuggestion.customer_group || [editingSuggestion.original_customer];
                    return !existingCustomers.includes(c.customer_name) &&
                           c.customer_name !== editingSuggestion.suggested_target;
                  })
                  .map(c => ({
                    value: c.customer_name,
                    label: c.customer_name
                  }))
                }
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Select other customer names that should also merge into this canonical name
              </Text>
            </div>

            {/* Preview */}
            <div style={{ 
              background: '#e6f7ff', 
              padding: 16, 
              borderRadius: 8,
              border: '1px solid #91d5ff'
            }}>
              <Text strong style={{ color: '#1890ff' }}>
                <MergeCellsOutlined /> Merge Preview:
              </Text>
              <div style={{ marginTop: 8 }}>
                {(() => {
                  // Calculate remaining customers for preview (excluding removed)
                  const originalItems = (editingSuggestion.customerDetails || editingSuggestion.customer_group || [editingSuggestion.original_customer]).map(item => {
                    if (typeof item === 'string') return { name: item };
                    return item;
                  });
                  const remainingItems = originalItems.filter(item => !removedCustomers.includes(item.name));
                  const totalCount = remainingItems.length + additionalCustomers.length;
                  
                  return (
                    <>
                      <Text>The following {totalCount} customers will be merged:</Text>
                      {totalCount < 2 && (
                        <Alert
                          type="warning"
                          message="A merge rule requires at least 2 customers"
                          style={{ marginTop: 8, marginBottom: 8 }}
                          showIcon
                        />
                      )}
                      <List
                        size="small"
                        bordered
                        style={{ marginTop: 8, background: 'white' }}
                        dataSource={[
                          // Map existing customers with their details (excluding removed)
                          ...remainingItems,
                          // Add additional customers (no details yet)
                          ...additionalCustomers.map(name => ({ name, isNew: true }))
                        ]}
                        renderItem={(item) => (
                          <List.Item style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <Tag color={item.isNew ? 'cyan' : 'orange'}>{item.name}</Tag>
                            {item.country && <Tag color="green" style={{ fontSize: 11 }}>🌍 {item.country}</Tag>}
                            {item.salesRep && <Tag color="purple" style={{ fontSize: 11 }}>👤 {item.salesRep}</Tag>}
                            <span style={{ color: '#888', margin: '0 8px' }}>→</span>
                            <Tag color="green">{editedMergeName || '(enter name above)'}</Tag>
                          </List.Item>
                        )}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomerMergingAISuggestions;
