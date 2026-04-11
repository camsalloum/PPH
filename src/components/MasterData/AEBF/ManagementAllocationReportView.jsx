/**
 * Management Allocation Report Live View
 * 
 * Displays the same report as the HTML export but as a live React component
 * with interactive charts and export button
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Card, 
  Statistic, 
  Row, 
  Col, 
  Table, 
  Button, 
  Space, 
  Spin, 
  Empty,
  Tag,
  Tooltip,
  message
} from 'antd';
import { 
  DownloadOutlined, 
  ReloadOutlined,
  BarChartOutlined,
  PieChartOutlined,
  TableOutlined
} from '@ant-design/icons';
import axios from 'axios';
import * as echarts from 'echarts';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Format number as MT (Metric Tonnes)
 */
const formatMT = (value) => {
  const mt = (Number(value) || 0) / 1000;
  return mt.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' MT';
};

/**
 * Format KGS to MT number only (for charts)
 */
const toMT = (kgs) => (Number(kgs) || 0) / 1000;

/**
 * Helper function to convert string to Proper Case
 */
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
};

const ManagementAllocationReportView = ({ 
  selectedDivision, 
  budgetYear, 
  actualYear,
  onClose 
}) => {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  
  // Chart refs
  const comparisonChartRef = useRef(null);
  const pieChartRef = useRef(null);
  const topPGsChartRef = useRef(null);
  
  // ECharts instances
  const comparisonChartInstance = useRef(null);
  const pieChartInstance = useRef(null);
  const topPGsChartInstance = useRef(null);

  /**
   * Fetch report data from API
   */
  const fetchReportData = useCallback(async () => {
    if (!selectedDivision) return;
    
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/sales-rep-group-allocation/management-allocation-report-data`,
        {
          params: {
            divisionCode: selectedDivision,
            budgetYear,
            actualYear
          }
        }
      );
      
      if (response.data.success) {
        setReportData(response.data.data);
      } else {
        message.error('Failed to load report data');
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      message.error('Error loading report data');
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, budgetYear, actualYear]);

  /**
   * Initialize and update charts when data changes
   */
  const updateCharts = useCallback(() => {
    if (!reportData) return;
    
    const { productGroups, groups, totals } = reportData;
    
    // Filter groups that have allocation data
    const activeGroups = groups.filter(g => {
      const total = productGroups.reduce((sum, pg) => {
        const groupData = pg.groupBreakdown?.find(gb => gb.groupId === g.id);
        return sum + (groupData?.allocated_kgs || 0);
      }, 0);
      return total > 0;
    });
    
    // Calculate totals per group for pie chart
    const salesRepData = activeGroups.map(g => {
      const total = productGroups.reduce((sum, pg) => {
        const groupData = pg.groupBreakdown?.find(gb => gb.groupId === g.id);
        return sum + (groupData?.allocated_kgs || 0);
      }, 0);
      return { name: g.name, total };
    }).filter(d => d.total > 0);
    
    // Top PGs by allocation
    const topPGsByAllocation = [...productGroups]
      .filter(pg => pg.allocated_kgs > 0)
      .sort((a, b) => b.allocated_kgs - a.allocated_kgs)
      .slice(0, 10);
    
    // 1. Comparison Bar Chart
    if (comparisonChartRef.current) {
      if (!comparisonChartInstance.current) {
        comparisonChartInstance.current = echarts.init(comparisonChartRef.current);
      }
      
      const topPGs = topPGsByAllocation.slice(0, 8);
      
      comparisonChartInstance.current.setOption({
        title: {
          text: 'Top Product Groups: Actual vs Allocation',
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600 }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            let html = `<strong>${params[0].name}</strong><br/>`;
            params.forEach(p => {
              html += `${p.marker} ${p.seriesName}: ${toMT(p.value).toFixed(2)} MT<br/>`;
            });
            return html;
          }
        },
        legend: {
          data: [`${reportData.actualYear} Actual`, `${reportData.budgetYear} Allocation`],
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: topPGs.map(pg => toProperCase(pg.pgcombine)),
          axisLabel: {
            rotate: 45,
            fontSize: 10,
            interval: 0
          }
        },
        yAxis: {
          type: 'value',
          name: 'MT',
          axisLabel: {
            formatter: (v) => toMT(v).toFixed(0)
          }
        },
        series: [
          {
            name: `${reportData.actualYear} Actual`,
            type: 'bar',
            data: topPGs.map(pg => pg.actual_kgs),
            itemStyle: { color: '#667eea' }
          },
          {
            name: `${reportData.budgetYear} Allocation`,
            type: 'bar',
            data: topPGs.map(pg => pg.allocated_kgs),
            itemStyle: { color: '#52c41a' }
          }
        ]
      });
    }
    
    // 2. Pie Chart - Sales Rep Distribution
    if (pieChartRef.current && salesRepData.length > 0) {
      if (!pieChartInstance.current) {
        pieChartInstance.current = echarts.init(pieChartRef.current);
      }
      
      pieChartInstance.current.setOption({
        title: {
          text: 'Allocation by Sales Rep Group',
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600 }
        },
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            return `<strong>${params.name}</strong><br/>${toMT(params.value).toFixed(2)} MT (${params.percent}%)`;
          }
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 10,
          top: 50,
          bottom: 20,
          textStyle: { fontSize: 11 }
        },
        series: [
          {
            type: 'pie',
            radius: ['35%', '60%'],
            center: ['35%', '55%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 4,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 12,
                fontWeight: 'bold'
              }
            },
            data: salesRepData.map((d, i) => ({
              name: d.name,
              value: d.total,
              itemStyle: {
                color: [
                  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
                  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0'
                ][i % 10]
              }
            }))
          }
        ]
      });
    }
    
    // 3. Top PGs Bar Chart
    if (topPGsChartRef.current && topPGsByAllocation.length > 0) {
      if (!topPGsChartInstance.current) {
        topPGsChartInstance.current = echarts.init(topPGsChartRef.current);
      }
      
      const topPGs = topPGsByAllocation.slice(0, 10);
      
      topPGsChartInstance.current.setOption({
        title: {
          text: 'Top 10 Product Groups by Allocation',
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600 }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const p = params[0];
            return `<strong>${p.name}</strong><br/>${toMT(p.value).toFixed(2)} MT`;
          }
        },
        grid: {
          left: '3%',
          right: '15%',
          bottom: '3%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          name: 'MT',
          axisLabel: {
            formatter: (v) => toMT(v).toFixed(0)
          }
        },
        yAxis: {
          type: 'category',
          data: topPGs.map(pg => toProperCase(pg.pgcombine)).reverse(),
          axisLabel: { fontSize: 10 }
        },
        series: [
          {
            type: 'bar',
            data: topPGs.map(pg => pg.allocated_kgs).reverse(),
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#667eea' },
                { offset: 1, color: '#764ba2' }
              ])
            },
            label: {
              show: true,
              position: 'right',
              formatter: (p) => toMT(p.value).toFixed(1) + ' MT',
              fontSize: 10
            }
          }
        ]
      });
    }
    
  }, [reportData]);

  /**
   * Handle window resize for charts
   */
  useEffect(() => {
    const handleResize = () => {
      comparisonChartInstance.current?.resize();
      pieChartInstance.current?.resize();
      topPGsChartInstance.current?.resize();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * Fetch data on mount and when params change
   */
  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  /**
   * Update charts when data changes
   */
  useEffect(() => {
    if (reportData) {
      // Small delay to ensure DOM is ready
      setTimeout(updateCharts, 100);
    }
  }, [reportData, updateCharts]);

  /**
   * Cleanup charts on unmount
   */
  useEffect(() => {
    return () => {
      comparisonChartInstance.current?.dispose();
      pieChartInstance.current?.dispose();
      topPGsChartInstance.current?.dispose();
    };
  }, []);

  /**
   * Handle HTML export
   */
  const handleExport = () => {
    window.open(
      `${API_BASE_URL}/api/sales-rep-group-allocation/export-management-allocation-html?divisionCode=${selectedDivision}&budgetYear=${budgetYear}&actualYear=${actualYear}`,
      '_blank'
    );
  };

  /**
   * Prepare matrix table data
   */
  const getMatrixData = () => {
    if (!reportData) return { columns: [], dataSource: [] };
    
    const { productGroups, groups } = reportData;
    
    // Filter groups with allocations
    const activeGroups = groups.filter(g => {
      const total = productGroups.reduce((sum, pg) => {
        const groupData = pg.groupBreakdown?.find(gb => gb.groupId === g.id);
        return sum + (groupData?.allocated_kgs || 0);
      }, 0);
      return total > 0;
    });
    
    // Filter PGs with allocations
    const activePGs = productGroups.filter(pg => pg.allocated_kgs > 0);
    
    // Calculate totals per group
    const groupTotals = {};
    activeGroups.forEach(g => {
      groupTotals[g.id] = activePGs.reduce((sum, pg) => {
        const groupData = pg.groupBreakdown?.find(gb => gb.groupId === g.id);
        return sum + (groupData?.allocated_kgs || 0);
      }, 0);
    });
    
    // Build columns
    const columns = [
      {
        title: 'Product Group',
        dataIndex: 'pgcombine',
        key: 'pgcombine',
        fixed: 'left',
        width: 180,
        render: (text) => <strong>{toProperCase(text)}</strong>
      },
      {
        title: 'Total Allocation',
        dataIndex: 'allocated_kgs',
        key: 'total',
        width: 120,
        align: 'right',
        render: (val) => (
          <span style={{ fontWeight: 600, color: '#52c41a' }}>
            {formatMT(val)}
          </span>
        )
      },
      ...activeGroups.map(g => ({
        title: (
          <Tooltip title={`Total: ${formatMT(groupTotals[g.id])}`}>
            <span style={{ fontSize: 11 }}>{g.name}</span>
          </Tooltip>
        ),
        key: `group_${g.id}`,
        width: 140,
        align: 'center',
        render: (_, record) => {
          const groupData = record.groupBreakdown?.find(gb => gb.groupId === g.id);
          const allocated = groupData?.allocated_kgs || 0;
          const rowTotal = record.allocated_kgs || 0;
          const percent = rowTotal > 0 ? (allocated / rowTotal * 100) : 0;
          
          if (allocated === 0) return <span style={{ color: '#ccc' }}>-</span>;
          
          return (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                {formatMT(allocated)}
              </div>
              <div style={{ 
                height: 6, 
                background: '#f0f0f0', 
                borderRadius: 3,
                marginTop: 4,
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(percent, 100)}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, #667eea, #764ba2)`,
                  borderRadius: 3
                }} />
              </div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                {percent.toFixed(1)}%
              </div>
            </div>
          );
        }
      }))
    ];
    
    // Build dataSource
    const dataSource = activePGs.map((pg, idx) => ({
      key: idx,
      ...pg
    }));
    
    return { columns, dataSource, activeGroups, groupTotals };
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: '#666' }}>Loading report data...</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <Empty 
        description="No report data available"
        style={{ padding: 60 }}
      />
    );
  }

  const { totals, divisionName, productGroups, groups } = reportData;
  const { columns, dataSource, activeGroups, groupTotals } = getMatrixData();

  return (
    <div style={{ padding: 16, background: '#f5f7fa', minHeight: '100vh' }}>
      {/* Header */}
      <div 
        style={{ 
          marginBottom: 16,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 8,
          padding: 20
        }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <h1 style={{ color: 'white', margin: 0, fontSize: 24 }}>
              📊 Management Allocation Report
            </h1>
            <div style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, fontSize: 14 }}>
              <Space size={24}>
                <span>Division: <strong style={{ color: '#64b5f6' }}>{divisionName}</strong></span>
                <span>Actual Year: <strong style={{ color: '#64b5f6' }}>{reportData.actualYear}</strong></span>
                <span>Budget Year: <strong style={{ color: '#64b5f6' }}>{reportData.budgetYear}</strong></span>
                <span>Groups: <strong style={{ color: '#64b5f6' }}>{activeGroups?.length || groups.length}</strong></span>
              </Space>
            </div>
          </Col>
          <Col>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={fetchReportData}
              >
                Refresh
              </Button>
              <Button 
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExport}
                style={{ 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderColor: 'transparent'
                }}
              >
                Export HTML
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small" style={{ borderTop: '4px solid #667eea' }}>
            <Statistic 
              title={`${reportData.actualYear} Actual`}
              value={formatMT(totals.actualKgs)}
              valueStyle={{ color: '#667eea', fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderTop: '4px solid #11998e' }}>
            <Statistic 
              title={`${reportData.budgetYear} Div Budget`}
              value={formatMT(totals.divBudgetKgs)}
              valueStyle={{ color: '#11998e', fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderTop: '4px solid #f5576c' }}>
            <Statistic 
              title="Remaining"
              value={formatMT(totals.remainingKgs)}
              valueStyle={{ 
                color: totals.remainingKgs < 0 ? '#ff4d4f' : '#f5576c', 
                fontSize: 18 
              }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderTop: '4px solid #4facfe' }}>
            <Statistic 
              title="Rep Submitted"
              value={formatMT(totals.submittedKgs)}
              valueStyle={{ color: '#4facfe', fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderTop: '4px solid #52c41a' }}>
            <Statistic 
              title="Mgmt Allocation"
              value={formatMT(totals.allocatedKgs)}
              valueStyle={{ color: '#52c41a', fontSize: 18, fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Section */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card 
            title={<Space><BarChartOutlined /> Actual vs Allocation Comparison</Space>}
            size="small"
          >
            <div 
              ref={comparisonChartRef} 
              style={{ width: '100%', height: 350 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card 
            title={<Space><PieChartOutlined /> Sales Rep Group Distribution</Space>}
            size="small"
          >
            <div 
              ref={pieChartRef} 
              style={{ width: '100%', height: 350 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card 
            title={<Space><BarChartOutlined /> Top Product Groups by Allocation</Space>}
            size="small"
          >
            <div 
              ref={topPGsChartRef} 
              style={{ width: '100%', height: 300 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Matrix Table */}
      <Card 
        title={
          <Space>
            <TableOutlined /> 
            Allocation Matrix - Sales Rep Group Distribution per Product Group
            <Tag color="blue">{dataSource.length} Product Groups</Tag>
            <Tag color="green">{activeGroups?.length || 0} Active Groups</Tag>
          </Space>
        }
        size="small"
      >
        <Table
          columns={columns}
          dataSource={dataSource}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ 
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} product groups`
          }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <span style={{ color: '#52c41a' }}>{formatMT(totals.allocatedKgs)}</span>
                </Table.Summary.Cell>
                {activeGroups?.map((g, idx) => (
                  <Table.Summary.Cell key={g.id} index={idx + 2} align="center">
                    <span style={{ fontWeight: 600 }}>
                      {formatMT(groupTotals?.[g.id] || 0)}
                    </span>
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {/* Footer timestamp */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: 16, 
        color: '#999',
        fontSize: 12
      }}>
        Generated: {new Date(reportData.generatedAt).toLocaleString()}
      </div>
    </div>
  );
};

export default ManagementAllocationReportView;
