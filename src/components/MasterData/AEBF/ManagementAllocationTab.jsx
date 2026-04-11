/**
 * Management Allocation Tab
 * 
 * Management allocates budget per SALES REP GROUP per product group
 * 
 * Flow:
 * 1. Select Sales Rep GROUP (not individual)
 * 2. Select Actual Year (reference)
 * 3. Select Divisional Budget Year (reference)  
 * 4. Select Budget Year (to allocate)
 * 5. Show ALL product groups with:
 *    - Group's Actual sales for selected year
 *    - Divisional budget for reference
 *    - Group's submitted budget (sum of reps in group)
 *    - Management allocation (editable MT)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Space, Select, Modal, Tag, Statistic, Row, Col, Card, App, InputNumber, Tooltip } from 'antd';
import { 
  TeamOutlined, 
  SaveOutlined, 
  SendOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  UserOutlined,
  DownOutlined,
  RightOutlined,
  BarChartOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import axios from 'axios';
import ManagementAllocationReportView from './ManagementAllocationReportView';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const { Option } = Select;

/**
 * Format number as MT (Metric Tonnes) - X,XXX.XX MT format
 * Converts KGS to MT (divide by 1000) and shows full number with 2 decimals
 */
const formatMT = (value) => {
  const mt = (Number(value) || 0) / 1000;  // Convert KGS to MT
  return mt.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' MT';
};

const ManagementAllocationTab = ({ selectedDivision, isActive }) => {
  const { message } = App.useApp();
  
  // Selection state - GROUPS not individual reps
  const [salesRepGroups, setSalesRepGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [isAllGroupsView, setIsAllGroupsView] = useState(false); // Track if viewing all groups
  
  // Year selection
  const currentYear = new Date().getFullYear();
  const [actualYear, setActualYear] = useState(currentYear - 1);        // 2025
  const [divBudgetYear, setDivBudgetYear] = useState(currentYear);       // 2026
  const [budgetYear, setBudgetYear] = useState(currentYear);             // 2026
  
  // Dynamic year options from database
  const [yearOptions, setYearOptions] = useState([]);
  const [loadingYears, setLoadingYears] = useState(false);
  
  // Data state
  const [allocationData, setAllocationData] = useState(null);
  const [editedAllocations, setEditedAllocations] = useState({}); // { "pgcombine": kgs_value }
  const [initialAllocations, setInitialAllocations] = useState({}); // Initial values when loaded (for live remaining calc)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // Track if user made edits
  
  // Per-group allocations for "All Groups" view (expandable rows)
  // Structure: { "pgcombine|groupId": kgs_value }
  const [perGroupAllocations, setPerGroupAllocations] = useState({});
  const [initialPerGroupAllocations, setInitialPerGroupAllocations] = useState({});
  const [expandedRowKeys, setExpandedRowKeys] = useState([]); // Track expanded product groups
  const [groupsInfo, setGroupsInfo] = useState([]); // Store groups info for "All" view
  
  // Loading states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Modals
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [revisionReason, setRevisionReason] = useState(''); // For revision notes
  
  // Report View mode
  const [showReportView, setShowReportView] = useState(false);

  /**
   * Fetch available years from database (actual data years)
   */
  const fetchAvailableYears = useCallback(async () => {
    if (!selectedDivision) return;
    
    setLoadingYears(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/filter-options`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const dbYears = response.data.data?.filterOptions?.year || [];
        // Include current year and next year for budget planning even if no actual data yet
        const budgetYears = [currentYear, currentYear + 1];
        const allYears = [...new Set([...dbYears, ...budgetYears])].sort((a, b) => b - a);
        setYearOptions(allYears);
        
        // Set default actual year to latest year with data (or currentYear - 1)
        if (dbYears.length > 0 && !actualYear) {
          const latestActual = Math.max(...dbYears.filter(y => y < currentYear));
          if (latestActual) setActualYear(latestActual);
        }
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      // Fallback to hardcoded range if API fails
      const fallbackYears = [];
      for (let y = currentYear - 5; y <= currentYear + 2; y++) {
        fallbackYears.push(y);
      }
      setYearOptions(fallbackYears.sort((a, b) => b - a));
    } finally {
      setLoadingYears(false);
    }
  }, [selectedDivision, currentYear, actualYear]);

  /**
   * Fetch all sales rep GROUPS for division
   */
  const fetchSalesRepGroups = useCallback(async () => {
    if (!selectedDivision) return;
    
    setLoadingGroups(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales-rep-group-allocation/groups`, {
        params: { divisionCode: selectedDivision }
      });
      
      if (response.data.success) {
        setSalesRepGroups(response.data.groups || []);
      } else {
        message.error(response.data.error || 'Failed to load sales rep groups');
      }
    } catch (error) {
      console.error('Error fetching sales rep groups:', error);
      message.error('Failed to load sales rep groups');
    } finally {
      setLoadingGroups(false);
    }
  }, [selectedDivision, message]);

  /**
   * Fetch allocation data for selected GROUP or ALL groups
   */
  const fetchAllocationData = useCallback(async () => {
    if (!selectedDivision || !selectedGroup) return;
    
    setLoadingData(true);
    try {
      // Check if "All" is selected
      if (selectedGroup === 'ALL') {
        const response = await axios.post(`${API_BASE_URL}/api/sales-rep-group-allocation/load-all-data`, {
          divisionCode: selectedDivision,
          actualYear,
          budgetYear
        });
        
        if (response.data.success) {
          const data = response.data.data;
          setAllocationData({
            ...data,
            groupMembers: data.groups || [],
            groupName: `All Groups (${data.groupCount} groups, ${data.memberCount} members)`,
            totalGroups: data.groupCount
          });
          
          // Store groups info for expandable rows
          setGroupsInfo(data.groups || []);
          
          // For "All" view, use allocated_kgs as the display value (shows total)
          const initial = {};
          const perGroupInit = {};
          (data.productGroups || []).forEach(pg => {
            initial[pg.pgcombine] = pg.allocated_kgs || 0;
            // Initialize per-group allocations from breakdown
            if (pg.groupBreakdown) {
              pg.groupBreakdown.forEach(gb => {
                const key = `${pg.pgcombine}|${gb.groupId}`;
                perGroupInit[key] = gb.allocated_kgs || 0;
              });
            }
          });
          setEditedAllocations(initial);
          setInitialAllocations(initial);
          setPerGroupAllocations(perGroupInit);
          setInitialPerGroupAllocations(perGroupInit);
          setIsAllGroupsView(true);
          setHasUnsavedChanges(false);
          setExpandedRowKeys([]); // Collapse all rows initially
        } else {
          message.error(response.data.error || 'Failed to load data');
        }
      } else {
        const response = await axios.post(`${API_BASE_URL}/api/sales-rep-group-allocation/load-data`, {
          divisionCode: selectedDivision,
          salesRepGroupId: selectedGroup,
          salesRepGroupName: selectedGroupName,
          actualYear,
          budgetYear
        });
        
        if (response.data.success) {
          setAllocationData(response.data.data);
          // Initialize allocations from draft ONLY (not submitted)
          // Management Allocation should be empty for user to fill, not pre-populated with submitted values
          const initial = {};
          (response.data.data.productGroups || []).forEach(pg => {
            initial[pg.pgcombine] = pg.draft_kgs ?? 0;
          });
          setEditedAllocations(initial);
          setInitialAllocations(initial); // Store initial values for live remaining calculation
          setIsAllGroupsView(false);
          setHasUnsavedChanges(false); // Reset unsaved changes flag on fresh load
          setPerGroupAllocations({});
          setInitialPerGroupAllocations({});
          setGroupsInfo([]);
        } else {
          message.error(response.data.error || 'Failed to load data');
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load allocation data');
    } finally {
      setLoadingData(false);
    }
  }, [selectedDivision, selectedGroup, selectedGroupName, actualYear, budgetYear, message]);

  /**
   * Get Divisional Budget data: Total and Remaining
   * - Total: Full divisional budget per product group
   * - Remaining: Total - ALL allocations (including current group)
   * NOTE: Not a hard limit - users can allocate more as a buffer
   */
  const [divBudgetData, setDivBudgetData] = useState({});      // Remaining values
  const [divBudgetTotal, setDivBudgetTotal] = useState({});    // Total values (no deduction)

  const fetchDivBudget = useCallback(async () => {
    if (!selectedDivision) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales-rep-group-allocation/div-budget-remaining`, {
        params: {
          divisionCode: selectedDivision,
          budgetYear: budgetYear
        }
      });
      
      if (response.data.success) {
        const remainingMap = {};
        const totalMap = {};
        Object.entries(response.data.data || {}).forEach(([pg, data]) => {
          remainingMap[pg] = data.remaining;        // Remaining after allocations
          totalMap[pg] = data.divBudgetTotal;       // Total div budget (no deduction)
        });
        setDivBudgetData(remainingMap);
        setDivBudgetTotal(totalMap);
      }
    } catch (error) {
      console.error('Error fetching div budget:', error);
    }
  }, [selectedDivision, budgetYear]);

  /**
   * Save draft allocation (or revision if already approved)
   */
  const saveDraft = useCallback(async () => {
    if (!selectedGroup) return;
    
    setSaving(true);
    try {
      const budgetData = Object.entries(editedAllocations)
        .filter(([, kgs]) => kgs > 0)
        .map(([pgcombine, kgs]) => {
          const pg = allocationData?.productGroups?.find(p => p.pgcombine === pgcombine);
          return {
            pgcombine,
            yearly_kgs: kgs || 0,
            actual_prev_year_kgs: pg?.actual_prev_year_kgs || 0,
            rep_submitted_kgs: pg?.rep_submitted_kgs || 0
          };
        });
      
      const response = await axios.post(`${API_BASE_URL}/api/sales-rep-group-allocation/save-draft`, {
        divisionCode: selectedDivision,
        divisionName: 'Flexible Packaging',
        budgetYear,
        salesRepGroupId: selectedGroup,
        salesRepGroupName: selectedGroupName,
        budgetData
      });
      
      if (response.data.success) {
        const isRevision = response.data.isRevision;
        const version = response.data.version;
        if (isRevision) {
          message.success(`Revision v${version} saved. Click "Approve Budget" to finalize.`);
        } else {
          message.success(`Draft saved: ${response.data.recordsSaved} records`);
        }
        setHasUnsavedChanges(false);
        fetchAllocationData();
        fetchDivBudget();  // Refresh remaining budget after save
      } else {
        message.error(response.data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      message.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  }, [selectedGroup, selectedGroupName, selectedDivision, budgetYear, editedAllocations, allocationData, message, fetchAllocationData, fetchDivBudget]);

  /**
   * Submit final allocation (approve)
   */
  const submitFinal = useCallback(async () => {
    if (!selectedGroup) return;
    
    setSaving(true);
    try {
      const budgetData = Object.entries(editedAllocations)
        .filter(([, kgs]) => kgs > 0)
        .map(([pgcombine, kgs]) => {
          const pg = allocationData?.productGroups?.find(p => p.pgcombine === pgcombine);
          return {
            pgcombine,
            yearly_kgs: kgs || 0,
            actual_prev_year_kgs: pg?.actual_prev_year_kgs || 0,
            rep_submitted_kgs: pg?.rep_submitted_kgs || 0
          };
        });
      
      // Check if this is a revision
      const isRevision = allocationData?.draftStatus === 'revision' || 
                        (allocationData?.draftStatus === 'approved' && hasUnsavedChanges);
      
      const response = await axios.post(`${API_BASE_URL}/api/sales-rep-group-allocation/submit-final`, {
        divisionCode: selectedDivision,
        divisionName: 'Flexible Packaging',
        budgetYear,
        salesRepGroupId: selectedGroup,
        salesRepGroupName: selectedGroupName,
        budgetData,
        revisionReason: isRevision ? revisionReason : null,
        approvedBy: 'Management'
      });
      
      if (response.data.success) {
        const version = response.data.version;
        const wasRevision = response.data.isRevision;
        if (wasRevision) {
          message.success(`Budget revision v${version} approved for ${selectedGroupName}`);
        } else {
          message.success(`Budget approved for ${selectedGroupName}`);
        }
        setSubmitModalVisible(false);
        setRevisionReason('');
        setHasUnsavedChanges(false);
        fetchAllocationData();
      } else {
        message.error(response.data.error || 'Failed to submit');
      }
    } catch (error) {
      console.error('Error submitting:', error);
      message.error('Failed to approve budget');
    } finally {
      setSaving(false);
    }
  }, [selectedGroup, selectedGroupName, selectedDivision, budgetYear, editedAllocations, allocationData, message, fetchAllocationData, hasUnsavedChanges, revisionReason]);

  // Load sales rep groups when active
  useEffect(() => {
    if (isActive && selectedDivision) {
      fetchAvailableYears();
      fetchSalesRepGroups();
      fetchDivBudget();
    }
  }, [isActive, selectedDivision, fetchAvailableYears, fetchSalesRepGroups, fetchDivBudget]);

  useEffect(() => {
    if (isActive && selectedDivision) {
      fetchDivBudget();
    }
  }, [divBudgetYear, isActive, selectedDivision, fetchDivBudget]);

  /**
   * Handle Load Data button
   */
  const handleLoadData = () => {
    if (!selectedGroup) {
      message.warning('Please select a Sales Rep Group first');
      return;
    }
    fetchAllocationData();
  };

  /**
   * Handle group selection
   */
  const handleGroupChange = (groupId) => {
    if (groupId === 'ALL') {
      setSelectedGroup('ALL');
      setSelectedGroupName('All Groups');
      setIsAllGroupsView(true);
    } else {
      const group = salesRepGroups.find(g => g.id === groupId);
      setSelectedGroup(groupId);
      setSelectedGroupName(group?.group_name || '');
      setIsAllGroupsView(false);
    }
    setAllocationData(null);
    setInitialAllocations({}); // Reset initial allocations for new group
    setHasUnsavedChanges(false);
    setRevisionReason('');
    setPerGroupAllocations({});
    setInitialPerGroupAllocations({});
    setGroupsInfo([]);
    setExpandedRowKeys([]);
  };

  /**
   * Handle allocation change - track unsaved changes
   */
  const handleAllocationChange = (pgcombine, value) => {
    setEditedAllocations(prev => ({
      ...prev,
      [pgcombine]: value || 0
    }));
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  };

  /**
   * Handle per-group allocation change (for "All Groups" expanded rows)
   */
  const handlePerGroupAllocationChange = (pgcombine, groupId, value) => {
    const key = `${pgcombine}|${groupId}`;
    setPerGroupAllocations(prev => {
      const newAllocations = { ...prev, [key]: value || 0 };
      
      // Recalculate total for this product group
      const total = groupsInfo.reduce((sum, g) => {
        const gKey = `${pgcombine}|${g.id}`;
        return sum + (newAllocations[gKey] || 0);
      }, 0);
      
      // Update the main editedAllocations with the new total
      setEditedAllocations(prevEdit => ({
        ...prevEdit,
        [pgcombine]: total
      }));
      
      return newAllocations;
    });
    setHasUnsavedChanges(true);
  };

  /**
   * Save bulk allocations from "All Groups" view
   */
  const saveBulkAllocations = useCallback(async () => {
    if (!isAllGroupsView) return;
    
    setSaving(true);
    try {
      // Build allocations array from perGroupAllocations
      const allocations = [];
      Object.entries(perGroupAllocations).forEach(([key, qty_kgs]) => {
        const [pgcombine, groupIdStr] = key.split('|');
        const groupId = parseInt(groupIdStr);
        const group = groupsInfo.find(g => g.id === groupId);
        if (group) {
          allocations.push({
            groupId,
            groupName: group.name,
            pgcombine,
            qty_kgs: qty_kgs || 0
          });
        }
      });
      
      const response = await axios.post(`${API_BASE_URL}/api/sales-rep-group-allocation/save-bulk-allocations`, {
        divisionCode: selectedDivision,
        budgetYear,
        allocations
      });
      
      if (response.data.success) {
        message.success(`Saved ${response.data.savedCount + response.data.updatedCount} allocations`);
        setHasUnsavedChanges(false);
        // Update initial values to reflect saved state
        setInitialPerGroupAllocations({ ...perGroupAllocations });
        setInitialAllocations({ ...editedAllocations });
        fetchDivBudget(); // Refresh remaining budget
      } else {
        message.error(response.data.error || 'Failed to save allocations');
      }
    } catch (error) {
      console.error('Error saving bulk allocations:', error);
      message.error('Failed to save allocations');
    } finally {
      setSaving(false);
    }
  }, [isAllGroupsView, perGroupAllocations, groupsInfo, selectedDivision, budgetYear, editedAllocations, message, fetchDivBudget]);

  /**
   * Calculate totals
   */
  const totals = useMemo(() => {
    const actualKgs = allocationData?.productGroups?.reduce((sum, pg) => sum + (pg.actual_prev_year_kgs || 0), 0) || 0;
    const divBudgetTotalKgs = Object.values(divBudgetTotal).reduce((sum, v) => sum + (v || 0), 0);
    
    // Calculate live remaining for totals (same logic as per-row)
    let divBudgetRemainingKgs = 0;
    Object.keys(divBudgetData).forEach(pg => {
      const serverRemaining = divBudgetData[pg] || 0;
      const initialValue = initialAllocations[pg] || 0;
      const currentValue = editedAllocations[pg] || 0;
      const delta = currentValue - initialValue;
      divBudgetRemainingKgs += (serverRemaining - delta);
    });
    
    const repSubmittedKgs = allocationData?.productGroups?.reduce((sum, pg) => sum + (pg.rep_submitted_kgs || 0), 0) || 0;
    const allocatedKgs = Object.values(editedAllocations).reduce((sum, v) => sum + (v || 0), 0);
    
    return { actualKgs, divBudgetTotalKgs, divBudgetRemainingKgs, repSubmittedKgs, allocatedKgs };
  }, [allocationData, divBudgetData, divBudgetTotal, editedAllocations, initialAllocations]);

  // Don't render if not active
  if (!isActive) return null;
  
  if (!selectedDivision) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <WarningOutlined style={{ fontSize: 48, color: '#faad14' }} />
        <p style={{ marginTop: 16 }}>Please select a division first.</p>
      </div>
    );
  }

  // Table columns
  const columns = [
    {
      title: 'Product Group',
      dataIndex: 'pgcombine',
      key: 'pgcombine',
      width: 180,
      fixed: 'left',
      render: (text, record) => {
        // Count groups that have allocation > 0
        const groupsWithAllocation = record.groupBreakdown?.filter(g => {
          const key = `${record.pgcombine}|${g.groupId}`;
          return (perGroupAllocations[key] || g.allocated_kgs || 0) > 0;
        }) || [];
        const allocatedCount = groupsWithAllocation.length;
        
        return (
          <span style={{ fontWeight: 500 }}>
            {text}
            {isAllGroupsView && allocatedCount > 0 && (
              <Tooltip title="Click row to expand and edit per-group allocations">
                <span style={{ marginLeft: 8, color: '#52c41a', fontSize: 11 }}>
                  ({allocatedCount} salesReps)
                </span>
              </Tooltip>
            )}
          </span>
        );
      }
    },
    {
      title: `${actualYear} Actual`,
      dataIndex: 'actual_prev_year_kgs',
      key: 'actual',
      width: 120,
      align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#666' }}>{formatMT(v)}</span> : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: `${budgetYear} Div Budget`,
      key: 'div_budget_total',
      width: 140,
      align: 'right',
      render: (_, record) => {
        const v = divBudgetTotal[record.pgcombine] || 0;
        return v > 0 ? <span style={{ color: '#1890ff' }}>{formatMT(v)}</span> : <span style={{ color: '#ccc' }}>-</span>;
      }
    },
    {
      title: (
        <Tooltip title="Remaining = Div Budget - All Allocated. Updates live as you type.">
          {budgetYear} Div Budget Remaining
        </Tooltip>
      ),
      key: 'div_budget_remaining',
      width: 160,
      align: 'right',
      render: (_, record) => {
        // Calculate live remaining: serverRemaining - (currentEdit - initialValue)
        const serverRemaining = divBudgetData[record.pgcombine] || 0;
        const initialValue = initialAllocations[record.pgcombine] || 0;
        const currentValue = editedAllocations[record.pgcombine] || 0;
        const delta = currentValue - initialValue;
        const liveRemaining = serverRemaining - delta;
        
        const color = liveRemaining < 0 ? '#ff4d4f' : liveRemaining > 0 ? '#722ed1' : '#ccc';
        const displayText = liveRemaining !== 0 ? formatMT(liveRemaining) : '-';
        return <span style={{ color }}>{displayText}</span>;
      }
    },
    {
      title: `${budgetYear} Group Submitted`,
      dataIndex: 'rep_submitted_kgs',
      key: 'rep_submitted',
      width: 140,
      align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#13c2c2' }}>{formatMT(v)}</span> : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: `${budgetYear} Management Allocation`,
      key: 'allocation',
      width: 200,
      align: 'right',
      render: (_, record) => (
        isAllGroupsView ? (
          // Read-only view for "All Groups"
          <span style={{ color: '#52c41a', fontWeight: 500 }}>
            {formatMT(editedAllocations[record.pgcombine] || 0)}
          </span>
        ) : (
          <InputNumber
            value={Number(((editedAllocations[record.pgcombine] || 0) / 1000).toFixed(2))}
            onChange={(v) => handleAllocationChange(record.pgcombine, Math.round((v || 0) * 1000))}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value.replace(/,/g, '')}
            min={0}
            step={0.01}
            precision={2}
            style={{ width: 140 }}
            size="small"
            addonAfter="MT"
          />
        )
      )
    }
  ];

  // Show Report View if enabled
  if (showReportView) {
    return (
      <div style={{ padding: 16 }}>
        {/* Back button */}
        <Button 
          icon={<ArrowLeftOutlined />}
          onClick={() => setShowReportView(false)}
          style={{ marginBottom: 16 }}
        >
          Back to Allocation
        </Button>
        
        <ManagementAllocationReportView
          selectedDivision={selectedDivision}
          budgetYear={budgetYear}
          actualYear={actualYear}
          onClose={() => setShowReportView(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Selection Panel */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <span style={{ fontWeight: 500 }}>Sales Rep Group:</span>
              <Select
                value={selectedGroup}
                onChange={handleGroupChange}
                style={{ width: 280 }}
                placeholder="Select Sales Rep Group"
                loading={loadingGroups}
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                <Option key="ALL" value="ALL">
                  <span style={{ fontWeight: 600, color: '#1890ff' }}>📊 All Groups (Division Total)</span>
                </Option>
                {salesRepGroups.map(group => (
                  <Option key={group.id} value={group.id}>
                    {group.group_name} ({group.member_count} reps)
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space>
              <span>Actual Year:</span>
              <Select value={actualYear} onChange={setActualYear} style={{ width: 90 }} size="small" loading={loadingYears}>
                {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space>
              <span>Div Budget Year:</span>
              <Select value={divBudgetYear} onChange={setDivBudgetYear} style={{ width: 90 }} size="small" loading={loadingYears}>
                {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space>
              <span>Budget Year:</span>
              <Select value={budgetYear} onChange={setBudgetYear} style={{ width: 90 }} size="small" loading={loadingYears}>
                {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </Space>
          </Col>
          <Col>
            <Button type="primary" onClick={handleLoadData} loading={loadingData}>
              Load Data
            </Button>
          </Col>
        </Row>
        
        {/* Show group members or All Groups summary */}
        {selectedGroup && allocationData && (
          <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <UserOutlined style={{ marginRight: 8 }} />
              <span style={{ color: '#666' }}>
                {isAllGroupsView 
                  ? `Showing combined figures for all ${allocationData.totalGroups || 0} sales rep groups`
                  : `Members: ${allocationData.groupMembers?.join(', ') || 'None'}`
                }
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAllGroupsView && (
                <Button 
                  size="small"
                  type="primary"
                  icon={<BarChartOutlined />}
                  onClick={() => setShowReportView(true)}
                  style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderColor: 'transparent' }}
                >
                  View PG Report
                </Button>
              )}
              <Button 
                size="small" 
                icon={<span style={{ marginRight: 4 }}>📤</span>}
                onClick={() => {
                  if (isAllGroupsView) {
                    // Export PG Allocated Budget for all groups (division total)
                    window.open(
                      `${API_BASE_URL}/api/sales-rep-group-allocation/export-html-all?divisionCode=${selectedDivision}&budgetYear=${budgetYear}&actualYear=${actualYear}`,
                      '_blank'
                    );
                  } else {
                    // Export PG Allocated Budget for the single group
                    const groupName = allocationData.groupName || selectedGroup;
                    window.open(
                      `${API_BASE_URL}/api/sales-rep-group-allocation/export-html?divisionCode=${selectedDivision}&groupId=${selectedGroup}&groupName=${encodeURIComponent(groupName)}&budgetYear=${budgetYear}&actualYear=${actualYear}`,
                      '_blank'
                    );
                  }
                }}
              >
                {isAllGroupsView ? 'Export PG Allocated Budget (All)' : 'Export PG Allocated Budget'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Main Content */}
      {allocationData ? (
        <>
          {/* Summary Cards - 5 columns */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small">
                <Statistic 
                  title={`${actualYear} Actual`}
                  value={formatMT(totals.actualKgs)}
                  valueStyle={{ color: '#666', fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card size="small">
                <Statistic
                  title={`${budgetYear} Div Budget`}
                  value={formatMT(totals.divBudgetTotalKgs)}
                  valueStyle={{ color: '#1890ff', fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card size="small">
                <Statistic
                  title={`${budgetYear} Div Budget Remaining`}
                  value={formatMT(totals.divBudgetRemainingKgs)}
                  valueStyle={{ color: totals.divBudgetRemainingKgs < 0 ? '#ff4d4f' : '#722ed1', fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card size="small">
                <Statistic 
                  title={`${budgetYear} Group Submitted`}
                  value={formatMT(totals.repSubmittedKgs)}
                  valueStyle={{ color: '#13c2c2', fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card size="small" style={{ borderColor: '#52c41a', borderWidth: 2 }}>
                <Statistic
                  title={`${budgetYear} Mgmt Allocation`}
                  value={formatMT(totals.allocatedKgs)}
                  valueStyle={{ color: '#52c41a', fontWeight: 600, fontSize: 18 }}
                />
              </Card>
            </Col>
          </Row>

          {/* Action Buttons */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <TeamOutlined />
              <span style={{ fontSize: 16, fontWeight: 600 }}>{selectedGroupName}</span>
              {isAllGroupsView ? (
                <>
                  <Tag color="blue">Division Total View</Tag>
                  <Tooltip title="Click on any product group row to expand and edit per-group allocations">
                    <Tag color="cyan">Click rows to edit per group</Tag>
                  </Tooltip>
                  {hasUnsavedChanges && (
                    <Tag color="orange">Unsaved Changes</Tag>
                  )}
                </>
              ) : (
                <>
                  {allocationData.draftStatus && (
                    <Tag color={
                      allocationData.draftStatus === 'approved' ? 'green' : 
                      allocationData.draftStatus === 'revision' ? 'blue' : 'orange'
                    }>
                      {allocationData.draftStatus === 'approved' ? 'Approved' : 
                       allocationData.draftStatus === 'revision' ? 'Revision in Progress' : 'Draft'}
                    </Tag>
                  )}
                  {/* Show version number if > 1 */}
                  {allocationData.version > 1 && (
                    <Tag color="purple">v{allocationData.version}</Tag>
                  )}
                  {/* Show indicator if user has unsaved changes on approved budget */}
                  {allocationData.draftStatus === 'approved' && hasUnsavedChanges && (
                    <Tag color="orange">Unsaved Changes</Tag>
                  )}
                </>
              )}
            </Space>
            {/* Show Save button for All Groups view when there are changes */}
            {isAllGroupsView ? (
              <Space>
                <Button 
                  icon={<SaveOutlined />} 
                  onClick={saveBulkAllocations}
                  loading={saving}
                  disabled={!hasUnsavedChanges}
                  type={hasUnsavedChanges ? 'primary' : 'default'}
                >
                  Save All Allocations
                </Button>
              </Space>
            ) : (
              <Space>
                <Button 
                  icon={<SaveOutlined />} 
                  onClick={saveDraft}
                  loading={saving}
                  disabled={!hasUnsavedChanges && allocationData.draftStatus === 'approved'}
                  type={hasUnsavedChanges && allocationData.draftStatus === 'approved' ? 'primary' : 'default'}
                  danger={hasUnsavedChanges && allocationData.draftStatus === 'approved'}
                >
                  {allocationData.draftStatus === 'approved' && hasUnsavedChanges ? 'Save Revision' : 'Save Draft'}
                </Button>
                <Button 
                  type="primary"
                  icon={<SendOutlined />} 
                  onClick={() => setSubmitModalVisible(true)}
                  disabled={allocationData.draftStatus === 'approved' && !hasUnsavedChanges}
                >
                  {allocationData.draftStatus === 'revision' || (allocationData.draftStatus === 'approved' && hasUnsavedChanges) 
                    ? 'Approve Revision' 
                    : 'Approve Budget'}
                </Button>
              </Space>
            )}
          </div>

          {/* Allocation Table */}
          <Table
            columns={columns}
            dataSource={allocationData.productGroups || []}
            rowKey="pgcombine"
            loading={loadingData}
            pagination={false}
            size="small"
            bordered
            scroll={{ x: 900, y: 500 }}
            expandable={isAllGroupsView ? {
              expandedRowKeys,
              onExpand: (expanded, record) => {
                setExpandedRowKeys(expanded 
                  ? [...expandedRowKeys, record.pgcombine]
                  : expandedRowKeys.filter(k => k !== record.pgcombine)
                );
              },
              expandIcon: ({ expanded, onExpand, record }) => (
                record.groupBreakdown && record.groupBreakdown.length > 0 ? (
                  <span 
                    onClick={e => onExpand(record, e)}
                    style={{ cursor: 'pointer', marginRight: 8, color: '#1890ff' }}
                  >
                    {expanded ? <DownOutlined /> : <RightOutlined />}
                  </span>
                ) : null
              ),
              expandedRowRender: (record) => (
                <div style={{ padding: '8px 0 8px 32px', background: '#fafafa' }}>
                  <Table
                    size="small"
                    pagination={false}
                    showHeader={true}
                    dataSource={(record.groupBreakdown || []).filter(g => {
                      const key = `${record.pgcombine}|${g.groupId}`;
                      return (perGroupAllocations[key] || g.allocated_kgs || 0) > 0;
                    })}
                    rowKey="groupId"
                    columns={[
                      {
                        title: 'Sales Rep Group',
                        dataIndex: 'groupName',
                        width: 180,
                        render: (name, row) => (
                          <Tooltip title={`Members: ${row.members?.join(', ') || 'None'}`}>
                            <span style={{ fontWeight: 500 }}>{name}</span>
                          </Tooltip>
                        )
                      },
                      {
                        title: `${actualYear} Actual`,
                        dataIndex: 'actual_kgs',
                        width: 120,
                        align: 'right',
                        render: (v) => v > 0 ? <span style={{ color: '#666' }}>{formatMT(v)}</span> : <span style={{ color: '#ccc' }}>-</span>
                      },
                      {
                        title: '', // Empty column to align with Div Budget
                        key: 'spacer1',
                        width: 140,
                        render: () => null
                      },
                      {
                        title: '', // Empty column to align with Div Budget Remaining
                        key: 'spacer2',
                        width: 160,
                        render: () => null
                      },
                      {
                        title: `${budgetYear} Submitted`,
                        dataIndex: 'submitted_kgs',
                        width: 140,
                        align: 'right',
                        render: (v) => v > 0 ? <span style={{ color: '#13c2c2' }}>{formatMT(v)}</span> : <span style={{ color: '#ccc' }}>-</span>
                      },
                      {
                        title: `${budgetYear} Mgmt Allocation`,
                        key: 'allocation',
                        width: 200,
                        align: 'right',
                        render: (_, row) => {
                          const key = `${record.pgcombine}|${row.groupId}`;
                          const value = perGroupAllocations[key] || 0;
                          return (
                            <InputNumber
                              value={Number((value / 1000).toFixed(2))}
                              onChange={(v) => handlePerGroupAllocationChange(record.pgcombine, row.groupId, Math.round((v || 0) * 1000))}
                              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              parser={(value) => value.replace(/,/g, '')}
                              min={0}
                              step={0.01}
                              precision={2}
                              style={{ width: 120 }}
                              size="small"
                              addonAfter="MT"
                            />
                          );
                        }
                      }
                    ]}
                  />
                </div>
              ),
              rowExpandable: (record) => {
                // Only allow expand if there are groups with allocations
                const groupsWithAllocation = (record.groupBreakdown || []).filter(g => {
                  const key = `${record.pgcombine}|${g.groupId}`;
                  return (perGroupAllocations[key] || g.allocated_kgs || 0) > 0;
                });
                return groupsWithAllocation.length > 0;
              }
            } : undefined}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                  {/* Add empty cell for expand column when in All Groups view */}
                  {isAllGroupsView && <Table.Summary.Cell index={0} />}
                  <Table.Summary.Cell index={isAllGroupsView ? 1 : 0}>TOTAL</Table.Summary.Cell>
                  <Table.Summary.Cell index={isAllGroupsView ? 2 : 1} align="right">{formatMT(totals.actualKgs)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={isAllGroupsView ? 3 : 2} align="right" style={{ color: '#1890ff' }}>{formatMT(totals.divBudgetTotalKgs)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={isAllGroupsView ? 4 : 3} align="right" style={{ color: '#722ed1' }}>{formatMT(totals.divBudgetRemainingKgs)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={isAllGroupsView ? 5 : 4} align="right" style={{ color: '#13c2c2' }}>{formatMT(totals.repSubmittedKgs)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={isAllGroupsView ? 6 : 5} align="right" style={{ color: '#52c41a', fontSize: 14 }}>{formatMT(totals.allocatedKgs)}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <TeamOutlined style={{ fontSize: 48, marginBottom: 16 }} />
          <p>Select a Sales Rep Group and click "Load Data" to begin allocation</p>
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            {(allocationData?.draftStatus === 'revision' || 
              (allocationData?.draftStatus === 'approved' && hasUnsavedChanges))
              ? `Approve Budget Revision (v${(allocationData?.version || 1)})`
              : 'Approve Budget'}
          </Space>
        }
        open={submitModalVisible}
        onOk={submitFinal}
        onCancel={() => {
          setSubmitModalVisible(false);
          setRevisionReason('');
        }}
        confirmLoading={saving}
        okText="Yes, Approve"
        width={500}
      >
        <p>Approve budget for <strong>{selectedGroupName}</strong>?</p>
        <div style={{ background: '#f0f7ff', padding: 16, borderRadius: 4, borderLeft: '4px solid #1890ff', marginBottom: 16 }}>
          <strong>Total: {formatMT(totals.allocatedKgs)}</strong>
          {allocationData?.version > 1 && (
            <span style={{ marginLeft: 16, color: '#722ed1' }}>
              Version: {allocationData.version}
            </span>
          )}
        </div>
        
        {/* Show revision reason input if this is a revision */}
        {(allocationData?.draftStatus === 'revision' || 
          (allocationData?.draftStatus === 'approved' && hasUnsavedChanges)) && (
          <div style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Revision Reason (optional):</p>
            <textarea 
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="Enter reason for this budget revision..."
              style={{ 
                width: '100%', 
                padding: 8, 
                borderRadius: 4, 
                border: '1px solid #d9d9d9',
                minHeight: 80,
                resize: 'vertical'
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManagementAllocationTab;
