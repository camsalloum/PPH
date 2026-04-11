/**
 * Customer Merging Active Rules Page
 * 
 * Shows all active merge rules with ability to:
 * - View all active rules
 * - Edit rules (change target)
 * - Delete rules
 * - Add new rules manually from source data
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
  Input,
  Modal,
  Select,
  Divider,
  Empty,
  Spin,
  AutoComplete
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  MergeCellsOutlined,
  UserOutlined,
  SearchOutlined,
  CheckOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import axios from 'axios';

const { Search } = Input;
const { Option } = Select;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerMergingActiveRules = () => {
  const { message } = App.useApp();
  const { selectedDivision } = useExcelData();

  // State
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [filteredRules, setFilteredRules] = useState([]);
  const [searchText, setSearchText] = useState('');

  // Modal state for adding new rule
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [sourceCustomers, setSourceCustomers] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]); // Multiple sources
  const [unifiedName, setUnifiedName] = useState(''); // Custom unified name
  const [addingRule, setAddingRule] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [newTarget, setNewTarget] = useState('');
  const [customersToAdd, setCustomersToAdd] = useState([]); // New customers to add to group
  const [customersToRemove, setCustomersToRemove] = useState([]); // Customers to remove from group
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [allCustomersWithDetails, setAllCustomersWithDetails] = useState([]); // All customers with sales rep/country

  // Load rules on mount
  useEffect(() => {
    if (selectedDivision) {
      loadRules();
      loadSourceCustomers();
    }
  }, [selectedDivision]);

  // Tabs keep panes mounted; refresh when a global reset happens elsewhere
  useEffect(() => {
    const handler = (event) => {
      const division = event?.detail?.division;
      if (!selectedDivision) return;
      if (division && division !== selectedDivision) return;
      loadRules();
      loadSourceCustomers();
    };

    window.addEventListener('customer-management:reset', handler);
    return () => window.removeEventListener('customer-management:reset', handler);
  }, [selectedDivision]);

  // Filter rules by search
  useEffect(() => {
    if (!searchText) {
      setFilteredRules(rules);
    } else {
      const search = searchText.toLowerCase();
      setFilteredRules(rules.filter(r => 
        r.merged_customer_name?.toLowerCase().includes(search) ||
        r.original_customers?.some(c => c.toLowerCase().includes(search))
      ));
    }
  }, [rules, searchText]);

  // ========================================================================
  // API CALLS
  // ========================================================================

  const loadRules = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/division-merge-rules/rules`,
        { params: { division: selectedDivision } }
      );

      if (response.data.success) {
        setRules(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading rules:', error);
      message.error('Failed to load merge rules');
    } finally {
      setLoading(false);
    }
  };

  const loadSourceCustomers = async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/scan-with-source`,
        { division: selectedDivision }
      );

      if (response.data.success) {
        // Get unique customer names for autocomplete
        const customers = response.data.data.customers.map(c => c.customer_name);
        setSourceCustomers(customers);
        
        // Store full customer details with sales reps and countries
        const customersWithDetails = response.data.data.customers.map(c => ({
          customer_name: c.customer_name,
          sales_reps: c.raw_sales_reps || [],
          countries: c.countries || []
        }));
        setAllCustomersWithDetails(customersWithDetails);
      }
    } catch (error) {
      console.error('Error loading source customers:', error);
    }
  };

  const deleteRule = async (rule) => {
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/division-merge-rules/rules/${rule.id}`,
        { params: { division: selectedDivision } }
      );

      if (response.data.success) {
        message.success('Rule deleted successfully');
        loadRules();
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      message.error('Failed to delete rule');
    }
  };

  const addManualRule = async () => {
    if (selectedSources.length < 2) {
      message.error('Please select at least 2 customers to merge');
      return;
    }

    if (!unifiedName.trim()) {
      message.error('Please enter a unified customer name');
      return;
    }

    setAddingRule(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/rules/manual-multi`,
        {
          division: selectedDivision,
          originalCustomers: selectedSources,
          mergedCustomerName: unifiedName.trim(),
          reason: 'Manual merge by admin'
        }
      );

      if (response.data.success) {
        message.success('Merge rule created successfully');
        setAddModalVisible(false);
        setSelectedSources([]);
        setUnifiedName('');
        loadRules();
      }
    } catch (error) {
      console.error('Error adding rule:', error);
      message.error(error.response?.data?.error || 'Failed to create rule');
    } finally {
      setAddingRule(false);
    }
  };

  const updateRule = async () => {
    if (!newTarget) {
      message.error('Please enter a new target customer');
      return;
    }

    try {
      // Combine original customers with newly added ones, excluding removed ones
      const removedSet = new Set(customersToRemove.map(c => c.toLowerCase()));
      const allOriginalCustomers = [
        ...(editingRule.original_customers || []).filter(c => !removedSet.has(c.toLowerCase())),
        ...customersToAdd.map(c => c.customer_name)
      ];
      
      // Validate minimum 2 customers
      if (allOriginalCustomers.length < 2) {
        message.error('A merge rule requires at least 2 customers');
        return;
      }

      const response = await axios.put(
        `${API_BASE_URL}/api/division-merge-rules/rules/${editingRule.id}`,
        {
          division: selectedDivision,
          mergedInto: newTarget,
          originalCustomers: allOriginalCustomers
        }
      );

      if (response.data.success) {
        message.success('Rule updated successfully');
        setEditModalVisible(false);
        setEditingRule(null);
        setNewTarget('');
        setCustomersToAdd([]);
        setCustomersToRemove([]);
        setCustomerSearchText('');
        loadRules();
      }
    } catch (error) {
      console.error('Error updating rule:', error);
      message.error('Failed to update rule');
    }
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setNewTarget(rule.merged_customer_name);
    setCustomersToAdd([]);
    setCustomersToRemove([]);
    setCustomerSearchText('');
    setEditModalVisible(true);
  };

  // Remove customer from the existing group
  const removeCustomerFromGroup = (customerName) => {
    setCustomersToRemove([...customersToRemove, customerName]);
  };

  // Restore a customer that was marked for removal
  const restoreCustomerToGroup = (customerName) => {
    setCustomersToRemove(customersToRemove.filter(c => c !== customerName));
  };

  // Get customer details by name
  const getCustomerDetails = (customerName) => {
    return allCustomersWithDetails.find(c => 
      c.customer_name.toLowerCase() === customerName.toLowerCase()
    ) || { customer_name: customerName, sales_reps: [], countries: [] };
  };

  // Filter available customers (not already in the rule or added)
  const getAvailableCustomers = () => {
    if (!editingRule) return [];
    
    const existingNames = new Set([
      ...(editingRule.original_customers || []).map(n => n.toLowerCase()),
      ...customersToAdd.map(c => c.customer_name.toLowerCase())
    ]);
    
    return allCustomersWithDetails.filter(c => 
      !existingNames.has(c.customer_name.toLowerCase()) &&
      c.customer_name.toLowerCase().includes(customerSearchText.toLowerCase())
    );
  };

  // Add customer to the group
  const addCustomerToGroup = (customer) => {
    setCustomersToAdd([...customersToAdd, customer]);
    setCustomerSearchText('');
  };

  // Remove customer from pending additions
  const removeCustomerFromPending = (customerName) => {
    setCustomersToAdd(customersToAdd.filter(c => c.customer_name !== customerName));
  };

  // ========================================================================
  // TABLE COLUMNS
  // ========================================================================

  const columns = [
    {
      title: 'Original Customers (Merged)',
      dataIndex: 'customer_details',
      key: 'original_customers',
      width: 250,
      render: (details) => (
        <Space direction="vertical" size={2}>
          {details?.map((c, i) => (
            <Tag key={i} color="red" style={{ margin: 0 }}>
              {c.name}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'Sales Rep(s)',
      dataIndex: 'customer_details',
      key: 'sales_reps',
      width: 200,
      render: (details) => {
        const allReps = [...new Set(details?.flatMap(c => c.sales_reps) || [])];
        return (
          <Space wrap size={2}>
            {allReps.map((rep, i) => (
              <Tag key={i} color="purple" style={{ fontSize: 10, margin: 1 }}>
                {rep}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: 'Country(s)',
      dataIndex: 'customer_details',
      key: 'countries',
      width: 180,
      render: (details) => {
        const allCountries = [...new Set(details?.flatMap(c => c.countries) || [])];
        return (
          <Space wrap size={2}>
            {allCountries.map((country, i) => (
              <Tag key={i} color="orange" style={{ fontSize: 10, margin: 1 }}>
                {country}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: '',
      key: 'arrow',
      width: 50,
      align: 'center',
      render: () => <ArrowRightOutlined style={{ color: '#1890ff' }} />
    },
    {
      title: 'Merged Into (Target)',
      dataIndex: 'merged_customer_name',
      key: 'merged_customer_name',
      width: 280,
      ellipsis: true,
      render: (name) => (
        <Tooltip title={name}>
          <strong style={{ color: '#52c41a' }}>{name}</strong>
        </Tooltip>
      ),
      sorter: (a, b) => a.merged_customer_name?.localeCompare(b.merged_customer_name)
    },
    {
      title: 'Source',
      dataIndex: 'rule_source',
      key: 'rule_source',
      width: 120,
      render: (source) => {
        if (source === 'AI_SUGGESTED') {
          return <Tag color="purple">AI</Tag>;
        } else if (source === 'MANUAL') {
          return <Tag color="blue">Manual</Tag>;
        }
        return <Tag>{source || '-'}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit target">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this merge rule?"
            description={`"${record.original_customers?.join(', ')}" will be un-merged`}
            onConfirm={() => deleteRule(record)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Autocomplete options
  const customerOptions = sourceCustomers.map(c => ({ value: c }));

  return (
    <div className="customer-merging-active-rules">
      {/* Header with Stats */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col flex="auto">
            <Space size="large">
              <Statistic
                title="Active Merge Rules"
                value={rules.length}
                prefix={<MergeCellsOutlined />}
              />
              <Divider type="vertical" style={{ height: 40 }} />
              <Statistic
                title="Filtered"
                value={filteredRules.length}
                prefix={<SearchOutlined />}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadRules}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddModalVisible(true)}
              >
                Add Manual Rule
              </Button>
            </Space>
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
        />
      </Card>

      {/* Rules Table */}
      <Card
        title={
          <Space>
            <MergeCellsOutlined />
            <span>Active Merge Rules</span>
            <Tag color="blue">{filteredRules.length} rules</Tag>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading rules...</div>
          </div>
        ) : filteredRules.length === 0 ? (
          <Empty description="No merge rules found">
            <Button type="primary" onClick={() => setAddModalVisible(true)}>
              Create First Rule
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={filteredRules}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 25,
              showSizeChanger: true,
              showTotal: (total) => `${total} rules`,
              pageSizeOptions: [10, 25, 50, 100]
            }}
            scroll={{ x: 1000 }}
            size="small"
          />
        )}
      </Card>

      {/* Add Manual Rule Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>Create Manual Merge Rule</span>
          </Space>
        }
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setSelectedSources([]);
          setUnifiedName('');
        }}
        footer={[
          <Button key="cancel" onClick={() => setAddModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<CheckOutlined />}
            onClick={addManualRule}
            loading={addingRule}
            disabled={selectedSources.length < 2 || !unifiedName.trim()}
          >
            Create Rule
          </Button>
        ]}
        width={700}
      >
        <div style={{ marginBottom: 24 }}>
          <Alert
            message="Create Merge Rule"
            description="Select multiple customers that are duplicates/variations of the same customer, then enter a unified name that will represent them all in reports."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          {/* Select Multiple Source Customers */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              <span style={{ color: '#ff4d4f' }}>Select Customers to Merge</span> (select at least 2)
            </label>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="Search and select customers to merge..."
              value={selectedSources}
              onChange={setSelectedSources}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
              maxTagCount={5}
              maxTagPlaceholder={(omittedValues) => `+${omittedValues.length} more`}
            >
              {sourceCustomers
                .filter(c => !rules.some(r => r.original_customers?.includes(c)))
                .map(customer => (
                  <Option key={customer} value={customer}>
                    {customer}
                  </Option>
                ))}
            </Select>
            {selectedSources.length > 0 && (
              <div style={{ marginTop: 8, color: '#666' }}>
                Selected: {selectedSources.length} customer{selectedSources.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <ArrowRightOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          </div>

          {/* Unified Name Input */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              <span style={{ color: '#52c41a' }}>Unified Customer Name</span>
            </label>
            <Input
              placeholder="Enter the unified customer name..."
              value={unifiedName}
              onChange={(e) => setUnifiedName(e.target.value)}
              style={{ width: '100%' }}
            />
            {selectedSources.length > 0 && !unifiedName && (
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#666', marginRight: 8 }}>Suggestion:</span>
                {selectedSources.slice(0, 3).map((name, i) => (
                  <Button 
                    key={i} 
                    size="small" 
                    style={{ marginRight: 4, marginBottom: 4 }}
                    onClick={() => setUnifiedName(name)}
                  >
                    {name.length > 30 ? name.substring(0, 30) + '...' : name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {selectedSources.length >= 2 && unifiedName && (
            <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
              <strong style={{ color: '#52c41a' }}>Preview:</strong>
              <div style={{ marginTop: 8 }}>
                {selectedSources.map((name, i) => (
                  <Tag key={i} color="red" style={{ marginBottom: 4 }}>{name}</Tag>
                ))}
                <ArrowRightOutlined style={{ margin: '0 8px', color: '#1890ff' }} />
                <Tag color="green">{unifiedName}</Tag>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Rule Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Edit Merge Rule</span>
          </Space>
        }
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingRule(null);
          setNewTarget('');
          setCustomersToAdd([]);
          setCustomersToRemove([]);
          setCustomerSearchText('');
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setEditModalVisible(false);
            setCustomersToAdd([]);
            setCustomersToRemove([]);
            setCustomerSearchText('');
          }}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<CheckOutlined />}
            onClick={updateRule}
            disabled={!newTarget}
          >
            Update Rule
          </Button>
        ]}
        width={650}
      >
        {editingRule && (
          <div>
            {/* Current Original Customers with details */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                Customers in this Merge Group
              </label>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                {editingRule.customer_details?.map((c, i) => {
                  const isRemoved = customersToRemove.includes(c.name);
                  return (
                    <div key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      padding: '6px 0',
                      borderBottom: i < editingRule.customer_details.length - 1 ? '1px solid #e8e8e8' : 'none',
                      opacity: isRemoved ? 0.4 : 1,
                      textDecoration: isRemoved ? 'line-through' : 'none'
                    }}>
                      <Tag color={isRemoved ? 'default' : 'red'} style={{ marginRight: 8, flexShrink: 0 }}>{c.name}</Tag>
                      <Space size={4} wrap style={{ flex: 1 }}>
                        {c.sales_reps?.map((rep, j) => (
                          <Tag key={`rep-${j}`} color="purple" style={{ fontSize: 10 }}>{rep}</Tag>
                        ))}
                        {c.countries?.map((country, j) => (
                          <Tag key={`country-${j}`} color="orange" style={{ fontSize: 10 }}>{country}</Tag>
                        ))}
                      </Space>
                      <Tooltip title={isRemoved ? 'Restore this customer' : 'Remove from merge'}>
                        <Button 
                          type={isRemoved ? 'primary' : 'text'}
                          size="small"
                          danger={!isRemoved}
                          icon={isRemoved ? <PlusOutlined /> : <DeleteOutlined />}
                          onClick={() => {
                            if (isRemoved) {
                              restoreCustomerToGroup(c.name);
                            } else {
                              removeCustomerFromGroup(c.name);
                            }
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                })}
                
                {/* Newly added customers (pending) */}
                {customersToAdd.map((c, i) => (
                  <div key={`new-${i}`} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '6px 0',
                    borderTop: '1px solid #e8e8e8',
                    background: '#e6f7ff'
                  }}>
                    <Tag color="blue" style={{ marginRight: 8, flexShrink: 0 }}>
                      + {c.customer_name}
                    </Tag>
                    <Space size={4} wrap style={{ flex: 1 }}>
                      {c.sales_reps?.map((rep, j) => (
                        <Tag key={`rep-${j}`} color="purple" style={{ fontSize: 10 }}>{rep}</Tag>
                      ))}
                      {c.countries?.map((country, j) => (
                        <Tag key={`country-${j}`} color="orange" style={{ fontSize: 10 }}>{country}</Tag>
                      ))}
                    </Space>
                    <Button 
                      type="text" 
                      danger 
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeCustomerFromPending(c.customer_name)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Search to add more customers */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                <PlusOutlined /> Add More Customers to Group
              </label>
              <Input
                placeholder="Search for customer to add..."
                value={customerSearchText}
                onChange={(e) => setCustomerSearchText(e.target.value)}
                prefix={<SearchOutlined />}
                allowClear
              />
              
              {/* Search results */}
              {customerSearchText && (
                <div style={{ 
                  marginTop: 8, 
                  maxHeight: 200, 
                  overflowY: 'auto',
                  border: '1px solid #d9d9d9',
                  borderRadius: 4
                }}>
                  {getAvailableCustomers().slice(0, 10).map((c, i) => (
                    <div 
                      key={i}
                      style={{ 
                        padding: '8px 12px', 
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onClick={() => addCustomerToGroup(c)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{c.customer_name}</div>
                        <Space size={4} wrap style={{ marginTop: 4 }}>
                          {c.sales_reps?.slice(0, 3).map((rep, j) => (
                            <Tag key={`rep-${j}`} color="purple" style={{ fontSize: 10 }}>{rep}</Tag>
                          ))}
                          {c.countries?.slice(0, 2).map((country, j) => (
                            <Tag key={`country-${j}`} color="orange" style={{ fontSize: 10 }}>{country}</Tag>
                          ))}
                        </Space>
                      </div>
                      <Button type="link" size="small" icon={<PlusOutlined />}>Add</Button>
                    </div>
                  ))}
                  {getAvailableCustomers().length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center', color: '#999' }}>
                      No matching customers found
                    </div>
                  )}
                  {getAvailableCustomers().length > 10 && (
                    <div style={{ padding: 8, textAlign: 'center', color: '#999', fontSize: 12 }}>
                      Showing first 10 of {getAvailableCustomers().length} results
                    </div>
                  )}
                </div>
              )}
            </div>

            <Divider />

            {/* Target customer */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                <span style={{ color: '#52c41a' }}>Merge Into (Target)</span>
              </label>
              <AutoComplete
                style={{ width: '100%' }}
                options={customerOptions}
                value={newTarget}
                onChange={setNewTarget}
                placeholder="Type to search customers..."
                filterOption={(input, option) =>
                  option.value.toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Info Alert */}
      <Alert
        style={{ marginTop: 16 }}
        message="Manage Merge Rules"
        description={
          <div>
            <p><strong>View:</strong> See all active merge rules showing which customers are merged into which.</p>
            <p><strong>Edit:</strong> Change the unified customer name or add more customers to the group.</p>
            <p><strong>Delete:</strong> Remove a rule - the original customers will become visible again in reports.</p>
            <p><strong>Add:</strong> Create a new merge rule by selecting multiple duplicate customers and giving them a unified name.</p>
          </div>
        }
        type="info"
        showIcon
        icon={<MergeCellsOutlined />}
      />
    </div>
  );
};

export default CustomerMergingActiveRules;
