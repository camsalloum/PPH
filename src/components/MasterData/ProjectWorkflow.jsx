import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Tabs, Typography, Tag, Collapse, Badge, Tooltip, Progress, Divider, Alert, Spin, Empty, Statistic, Row, Col, Button, message } from 'antd';
import {
  DatabaseOutlined,
  UserOutlined,
  FileExcelOutlined,
  CloudUploadOutlined,
  CalculatorOutlined,
  TableOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  ArrowDownOutlined,
  SyncOutlined,
  LineChartOutlined,
  BarChartOutlined,
  FundOutlined,
  AimOutlined,
  TeamOutlined,
  GlobalOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  PieChartOutlined,
  DashboardOutlined,
  NodeIndexOutlined,
  ApiOutlined,
  ClusterOutlined,
  FileSearchOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  MergeCellsOutlined,
  FilterOutlined,
  BookOutlined,
  PartitionOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

/**
 * ProjectWorkflow - DYNAMIC System Workflow Visualization
 * 
 * This component fetches LIVE data from the backend API to display:
 * - Actual database tables and their row counts
 * - Actual API routes that are mounted
 * - Real data flow configurations
 * 
 * All data is auto-updated from the /api/documentation endpoints.
 * 
 * @updated 2026-01-30 - Converted to dynamic API-driven component
 */

// =============================================================================
// STYLES
// =============================================================================
const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f5f7fa',
    minHeight: '100vh',
    maxWidth: '1600px',
    margin: '0 auto',
  },
  card: {
    marginBottom: '20px',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    border: '1px solid #e8ecf1',
    overflow: 'hidden',
  },
  flowBox: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    minWidth: 0,
    padding: '14px 18px',
    backgroundColor: '#fff',
    borderRadius: '10px',
    border: '1.5px solid',
    marginBottom: '10px',
    transition: 'all 0.2s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  connectionLine: {
    height: '48px',
    width: '3px',
    margin: '0 auto',
    background: 'linear-gradient(180deg, #1890ff 0%, #52c41a 100%)',
    borderRadius: '2px',
  },
  refreshButton: {
    position: 'absolute',
    top: '16px',
    right: '16px',
  },
};

// =============================================================================
// API HOOKS
// =============================================================================

/**
 * Custom hook to fetch and cache documentation data
 */
const useDocumentationAPI = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    tables: null,
    routes: null,
    dataFlows: null,
    overview: null,
  });
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async (showMessage = false) => {
    setLoading(true);
    setError(null);
    try {
      const [tablesRes, routesRes, flowsRes] = await Promise.all([
        axios.get('/api/documentation/tables'),
        axios.get('/api/documentation/routes'),
        axios.get('/api/documentation/data-flows'),
      ]);

      setData({
        tables: tablesRes.data,
        routes: routesRes.data,
        dataFlows: flowsRes.data,
        overview: null,
      });
      setLastUpdated(new Date());
      if (showMessage) {
        message.success('Documentation refreshed successfully');
      }
    } catch (err) {
      console.error('Error fetching documentation:', err);
      setError(err.message || 'Failed to fetch documentation data');
      if (showMessage) {
        message.error('Failed to refresh documentation');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true), lastUpdated };
};

// =============================================================================
// COMPONENT: Dynamic Database Schema
// =============================================================================
const DynamicDatabaseSchema = ({ tablesData, loading, error, onRefresh, lastUpdated }) => {
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>Loading database schema...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load database schema"
        description={error}
        action={<Button onClick={onRefresh}>Retry</Button>}
      />
    );
  }

  if (!tablesData || !tablesData.categories) {
    return <Empty description="No database information available" />;
  }

  const { categories, totalTables, tablesWithData, emptyTables } = tablesData;

  return (
    <div style={{ padding: '20px', position: 'relative' }}>
      {/* Header with stats and refresh */}
      <Card style={{ ...styles.card, borderTop: '4px solid #1890ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined /> Live Database Schema
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>
        
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="Live Data - Auto-Updated"
          description="This schema reflects the actual current database state. Table counts and categories are fetched in real-time."
          style={{ marginBottom: '16px' }}
        />

        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="Total Tables" value={totalTables} prefix={<DatabaseOutlined />} />
          </Col>
          <Col span={8}>
            <Statistic title="Tables with Data" value={tablesWithData} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={8}>
            <Statistic title="Empty Tables" value={emptyTables} valueStyle={{ color: '#faad14' }} />
          </Col>
        </Row>
      </Card>

      {/* Tables by Category */}
      <Card title={<><TableOutlined /> Tables by Category (Live)</>} style={styles.card}>
        <Collapse defaultActiveKey={['Core Sales Data', 'Budget & Planning']}>
          {Object.entries(categories).map(([categoryName, category]) => (
            <Panel
              key={categoryName}
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: category.color,
                  }}></span>
                  <Text strong>{categoryName}</Text>
                  <Badge count={category.tableCount} style={{ backgroundColor: category.color }} />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    ({category.totalRows.toLocaleString()} total rows)
                  </Text>
                </div>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                {category.tables.map(table => (
                  <div
                    key={table.name}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: table.rowCount > 0 ? '#f6ffed' : '#fafafa',
                      borderRadius: '8px',
                      border: `1px solid ${table.rowCount > 0 ? '#b7eb8f' : '#e8e8e8'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <DatabaseOutlined style={{ color: category.color }} />
                        <Text strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{table.name}</Text>
                      </div>
                      <Tag color={table.rowCount > 0 ? 'green' : 'default'}>
                        {table.rowCount.toLocaleString()} rows
                      </Tag>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        {table.columnCount} columns
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </Collapse>
      </Card>
    </div>
  );
};

// =============================================================================
// COMPONENT: Dynamic Data Flows
// =============================================================================
const DynamicDataFlows = ({ flowsData, loading, error, onRefresh, lastUpdated }) => {
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>Loading data flows...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load data flows"
        description={error}
        action={<Button onClick={onRefresh}>Retry</Button>}
      />
    );
  }

  if (!flowsData || !flowsData.flows) {
    return <Empty description="No data flow information available" />;
  }

  const { flows, tableCounts } = flowsData;

  // Icon mapping
  const getIcon = (iconName) => {
    const icons = {
      'database': <DatabaseOutlined />,
      'sync': <SyncOutlined />,
      'table': <TableOutlined />,
      'thunderbolt': <ThunderboltOutlined />,
      'filter': <FilterOutlined />,
      'dashboard': <DashboardOutlined />,
      'edit': <EditOutlined />,
      'save': <CloudUploadOutlined />,
      'bar-chart': <BarChartOutlined />,
      'team': <TeamOutlined />,
      'export': <ExportOutlined />,
      'import': <ImportOutlined />,
      'user': <UserOutlined />,
      'setting': <SettingOutlined />,
      'global': <GlobalOutlined />,
      'partition': <PartitionOutlined />,
      'api': <ApiOutlined />,
    };
    return icons[iconName] || <DatabaseOutlined />;
  };

  // Render a single data flow
  const renderFlow = (flow) => (
    <Card
      key={flow.name}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: flow.color,
          }}></span>
          <span>{flow.name}</span>
        </div>
      }
      style={{ ...styles.card, borderLeft: `4px solid ${flow.color}` }}
    >
      <Paragraph type="secondary" style={{ marginBottom: '16px' }}>
        {flow.description}
      </Paragraph>
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {flow.steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div
              style={{
                ...styles.flowBox,
                borderColor: step.primary ? flow.color : '#e8e8e8',
                backgroundColor: step.primary ? `${flow.color}10` : '#fff',
                width: '100%',
                maxWidth: '400px',
                justifyContent: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: flow.color, fontSize: '20px' }}>
                  {getIcon(step.icon)}
                </span>
                <div>
                  <Text strong>{step.label}</Text>
                  {step.rows !== undefined && (
                    <div>
                      <Tag color="blue" style={{ marginTop: '4px' }}>
                        {step.rows.toLocaleString()} rows
                      </Tag>
                    </div>
                  )}
                </div>
                {step.primary && (
                  <Tag color="gold">Primary</Tag>
                )}
              </div>
            </div>
            {idx < flow.steps.length - 1 && (
              <ArrowDownOutlined style={{ color: flow.color, fontSize: '20px' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <Card style={{ ...styles.card, borderTop: '4px solid #52c41a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={4} style={{ margin: 0 }}>
            <SyncOutlined /> Live Data Flows
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>

        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="Updated to Current System Architecture"
          description="These diagrams reflect the ACTUAL implementation. Row counts are fetched in real-time from the database."
          style={{ marginBottom: '16px' }}
        />

        {/* Key Table Counts */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="fp_raw_oracle"
              value={tableCounts?.fp_raw_oracle || 0}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="fp_actualcommon"
              value={tableCounts?.fp_actualcommon || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<TableOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="fp_budget_unified"
              value={tableCounts?.fp_budget_unified || 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<DollarOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="sales_rep_groups"
              value={tableCounts?.sales_rep_groups || 0}
              prefix={<TeamOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Flow Diagrams */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        {Object.values(flows).map(renderFlow)}
      </div>

      {/* Key Implementation Notes */}
      <Card style={{ ...styles.card, borderLeft: '4px solid #1890ff', marginTop: '20px' }}>
        <Title level={4}>🔑 Key Implementation Notes</Title>
        <div style={{ lineHeight: '1.8' }}>
          <Paragraph>
            <Text strong>Actual Data (fp_actualcommon):</Text>
            <ul>
              <li>Fast import: 1,500 rows/sec (trigger bypass)</li>
              <li><code>fp_raw_oracle</code>: UPPERCASE Oracle format</li>
              <li><code>fp_actualcommon</code>: Proper Case (INITCAP)</li>
              <li><code>admin_division_code</code>: Use this for division filtering</li>
            </ul>
          </Paragraph>
          <Paragraph>
            <Text strong>Budget Unified Table (fp_budget_unified):</Text>
            <ul>
              <li><code>budget_type = 'DIVISIONAL'</code>: Division-level budget (no customer)</li>
              <li><code>budget_type = 'SALES_REP'</code>: Sales rep budget (with customer)</li>
              <li><code>budget_status = 'draft'</code>: Work in progress</li>
              <li><code>budget_status = 'approved'</code>: Finalized</li>
            </ul>
          </Paragraph>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// COMPONENT: Dynamic API Reference
// =============================================================================
const DynamicAPIReference = ({ routesData, loading, error, onRefresh, lastUpdated }) => {
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>Loading API routes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load API routes"
        description={error}
        action={<Button onClick={onRefresh}>Retry</Button>}
      />
    );
  }

  if (!routesData || !routesData.categories) {
    return <Empty description="No API route information available" />;
  }

  const { categories, totalRoutes, totalFiles } = routesData;

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <Card style={{ ...styles.card, borderTop: '4px solid #722ed1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={4} style={{ margin: 0 }}>
            <ApiOutlined /> Live API Reference
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Last updated: {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          message="Auto-Discovered API Endpoints"
          description="These routes are automatically discovered from the route files. The list updates when new routes are added."
          style={{ marginBottom: '16px' }}
        />

        <Row gutter={16}>
          <Col span={12}>
            <Statistic title="Total Routes" value={totalRoutes} prefix={<ApiOutlined />} />
          </Col>
          <Col span={12}>
            <Statistic title="Route Files" value={totalFiles} prefix={<FileSearchOutlined />} />
          </Col>
        </Row>
      </Card>

      {/* Routes by Category */}
      <Card title={<><ApiOutlined /> API Routes by Category</>} style={styles.card}>
        <Collapse defaultActiveKey={['Authentication', 'AEBF & Budget']}>
          {Object.entries(categories).map(([categoryName, category]) => (
            <Panel
              key={categoryName}
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: category.color,
                  }}></span>
                  <Text strong>{categoryName}</Text>
                  <Badge count={category.routeCount} style={{ backgroundColor: category.color }} />
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                    <Tag color="green">GET: {category.methods?.GET || 0}</Tag>
                    <Tag color="blue">POST: {category.methods?.POST || 0}</Tag>
                    <Tag color="orange">PUT: {category.methods?.PUT || 0}</Tag>
                    <Tag color="red">DELETE: {category.methods?.DELETE || 0}</Tag>
                  </div>
                </div>
              }
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa' }}>
                    <th style={{ padding: '8px', textAlign: 'left', width: '80px' }}>Method</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Endpoint</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Source File</th>
                  </tr>
                </thead>
                <tbody>
                  {category.routes.slice(0, 20).map((route, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                        <Tag color={
                          route.method === 'GET' ? 'green' :
                          route.method === 'POST' ? 'blue' :
                          route.method === 'PUT' ? 'orange' :
                          route.method === 'DELETE' ? 'red' : 'default'
                        }>{route.method}</Tag>
                      </td>
                      <td style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                        <code style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>
                          {route.path}
                        </code>
                      </td>
                      <td style={{ padding: '8px', borderTop: '1px solid #f0f0f0', color: '#666' }}>
                        <Text type="secondary" style={{ fontSize: '11px' }}>{route.file}</Text>
                      </td>
                    </tr>
                  ))}
                  {category.routes.length > 20 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '8px', textAlign: 'center', color: '#666' }}>
                        ... and {category.routes.length - 20} more routes
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
          ))}
        </Collapse>
      </Card>
    </div>
  );
};

// =============================================================================
// COMPONENT: System Architecture (Static - Overview)
// =============================================================================
const SystemArchitecture = () => (
  <div style={{ padding: '20px' }}>
    <Card title={<><ClusterOutlined /> System Architecture</>} style={styles.card}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: '16px',
        padding: '20px',
      }}>
        {/* User Layer */}
        <div style={{
          display: 'flex',
          gap: '20px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <div style={{
            ...styles.flowBox,
            borderColor: '#1890ff',
            backgroundColor: '#e6f7ff',
            minWidth: '150px',
          }}>
            <UserOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            <span>Admin</span>
          </div>
          <div style={{
            ...styles.flowBox,
            borderColor: '#52c41a',
            backgroundColor: '#f6ffed',
            minWidth: '150px',
          }}>
            <UserOutlined style={{ marginRight: '8px', color: '#52c41a' }} />
            <span>Sales Manager</span>
          </div>
          <div style={{
            ...styles.flowBox,
            borderColor: '#faad14',
            backgroundColor: '#fff7e6',
            minWidth: '150px',
          }}>
            <UserOutlined style={{ marginRight: '8px', color: '#faad14' }} />
            <span>Sales Rep</span>
          </div>
        </div>

        <div style={styles.connectionLine}></div>

        {/* Frontend Layer */}
        <div style={{
          ...styles.flowBox,
          borderColor: '#722ed1',
          backgroundColor: '#f9f0ff',
          width: '100%',
          maxWidth: '600px',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={5} style={{ margin: 0, color: '#722ed1' }}>
              React Frontend (Vite)
            </Title>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              <Tag>Dashboard</Tag>
              <Tag>Master Data</Tag>
              <Tag>AEBF Tabs</Tag>
              <Tag>Reports</Tag>
              <Tag>Settings</Tag>
            </div>
          </div>
        </div>

        <div style={styles.connectionLine}></div>

        {/* API Layer */}
        <div style={{
          ...styles.flowBox,
          borderColor: '#13c2c2',
          backgroundColor: '#e6fffb',
          width: '100%',
          maxWidth: '700px',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={5} style={{ margin: 0, color: '#13c2c2' }}>
              <ApiOutlined /> REST API (Express.js)
            </Title>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              <Tag color="blue">/api/auth</Tag>
              <Tag color="green">/api/aebf</Tag>
              <Tag color="orange">/api/fp</Tag>
              <Tag color="purple">/api/unified</Tag>
              <Tag color="magenta">/api/crm</Tag>
            </div>
          </div>
        </div>

        <div style={styles.connectionLine}></div>

        {/* Database Layer */}
        <div style={{
          ...styles.flowBox,
          borderColor: '#eb2f96',
          backgroundColor: '#fff0f6',
          width: '100%',
          maxWidth: '800px',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={5} style={{ margin: 0, color: '#eb2f96' }}>
              <DatabaseOutlined /> PostgreSQL Database
            </Title>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              <Tag color="blue">fp_actualcommon</Tag>
              <Tag color="green">fp_budget_unified</Tag>
              <Tag color="orange">fp_raw_oracle</Tag>
              <Tag color="purple">sales_rep_groups</Tag>
              <Tag>master_countries</Tag>
              <Tag>+ more tables</Tag>
            </div>
          </div>
        </div>
      </div>
    </Card>

    {/* Key Relationships */}
    <Card title={<><NodeIndexOutlined /> Key Data Relationships</>} style={styles.card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <div style={{ padding: '16px', backgroundColor: '#e6f7ff', borderRadius: '8px' }}>
          <Title level={5} style={{ color: '#1890ff' }}>
            <LineChartOutlined /> Actual → Reports
          </Title>
          <Paragraph style={{ fontSize: '13px' }}>
            Historical sales data (KGS, Amount, MoRM) flows from <code>fp_actualcommon</code> to generate 
            divisional dashboards, sales rep reports, and customer analytics.
          </Paragraph>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: '#f6ffed', borderRadius: '8px' }}>
          <Title level={5} style={{ color: '#52c41a' }}>
            <DollarOutlined /> Budget Calculation
          </Title>
          <Paragraph style={{ fontSize: '13px' }}>
            Budget entries (KGS) × Pricing data (ASP, MoRM rates) = Calculated Amount and Margin.
            All budget data stored in <code>fp_budget_unified</code>.
          </Paragraph>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: '#fff7e6', borderRadius: '8px' }}>
          <Title level={5} style={{ color: '#faad14' }}>
            <MergeCellsOutlined /> Customer Merging
          </Title>
          <Paragraph style={{ fontSize: '13px' }}>
            Duplicate customers are identified and merged using rules in <code>fp_division_customer_merge_rules</code>,
            ensuring data consistency across all reports.
          </Paragraph>
        </div>
        
        <div style={{ padding: '16px', backgroundColor: '#f9f0ff', borderRadius: '8px' }}>
          <Title level={5} style={{ color: '#722ed1' }}>
            <TeamOutlined /> Sales Rep Groups
          </Title>
          <Paragraph style={{ fontSize: '13px' }}>
            Sales reps are grouped via <code>sales_rep_groups</code> and <code>sales_rep_group_members</code>
            for combined reporting and budget management.
          </Paragraph>
        </div>
      </div>
    </Card>
  </div>
);

// =============================================================================
// COMPONENT: Overview
// =============================================================================
const ProjectOverview = ({ tablesData, routesData, lastUpdated }) => {
  const totalTables = tablesData?.totalTables || 0;
  const tablesWithData = tablesData?.tablesWithData || 0;
  const totalRoutes = routesData?.totalRoutes || 0;
  const routeFiles = routesData?.totalFiles || 0;

  return (
    <div style={{ padding: '20px' }}>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '24px',
        color: 'white',
      }}>
        <Title level={2} style={{ color: 'white', marginBottom: '8px' }}>
          🏭 ProPackHub ERP System
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px', marginBottom: '16px' }}>
          A comprehensive Enterprise Resource Planning system for Flexible Packaging industry.
          Built with React, Node.js, and PostgreSQL.
        </Paragraph>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Tag color="cyan" style={{ padding: '4px 12px', fontSize: '14px' }}>
            React 18+ Frontend
          </Tag>
          <Tag color="green" style={{ padding: '4px 12px', fontSize: '14px' }}>
            Node.js/Express Backend
          </Tag>
          <Tag color="blue" style={{ padding: '4px 12px', fontSize: '14px' }}>
            PostgreSQL Database
          </Tag>
          <Tag color="purple" style={{ padding: '4px 12px', fontSize: '14px' }}>
            JWT Authentication
          </Tag>
        </div>
      </div>

      {/* Live Stats */}
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Live System Statistics</span>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px', marginLeft: 'auto' }}>
                Updated: {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
          </div>
        }
        style={styles.card}
      >
        <Alert
          type="success"
          showIcon
          message="Auto-Updating Documentation"
          description="These statistics are fetched in real-time from the backend. They automatically reflect any changes to the database schema or API routes."
          style={{ marginBottom: '16px' }}
        />
        
        <Row gutter={16}>
          <Col span={6}>
            <Statistic 
              title="Database Tables" 
              value={totalTables} 
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="Tables with Data" 
              value={tablesWithData} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="API Routes" 
              value={totalRoutes} 
              prefix={<ApiOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="Route Files" 
              value={routeFiles} 
              prefix={<FileSearchOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Legend */}
      <Card title={<><BookOutlined /> Documentation Guide</>} style={styles.card}>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ padding: '16px', backgroundColor: '#e6f7ff', borderRadius: '8px' }}>
              <Title level={5}><DatabaseOutlined /> Database Tab</Title>
              <Text>View all database tables with live row counts, grouped by category.</Text>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ padding: '16px', backgroundColor: '#f6ffed', borderRadius: '8px' }}>
              <Title level={5}><SyncOutlined /> Data Flows Tab</Title>
              <Text>Interactive diagrams showing how data flows through the system.</Text>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ padding: '16px', backgroundColor: '#f9f0ff', borderRadius: '8px' }}>
              <Title level={5}><ApiOutlined /> API Reference Tab</Title>
              <Text>Auto-discovered API endpoints organized by category.</Text>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

// =============================================================================
// COMPONENT: Mermaid Diagram Renderer
// =============================================================================
const MermaidDiagram = ({ chart, title }) => {
  const containerRef = useRef(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderDiagram = async () => {
      setIsLoading(true);
      try {
        const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')).default;
        
        mermaid.initialize({ 
          startOnLoad: false,
          theme: 'default',
          flowchart: { 
            useMaxWidth: true,
            htmlLabels: false,
            curve: 'basis'
          }
        });

        const uniqueId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart);
        containerRef.current.innerHTML = svg;
        setIsError(false);
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        setIsError(true);
        containerRef.current.innerHTML = `<pre style="padding: 20px; background: #f5f5f5; border-radius: 8px; overflow: auto; font-size: 12px;">${chart}</pre>`;
      } finally {
        setIsLoading(false);
      }
    };

    renderDiagram();
  }, [chart]);

  return (
    <Card title={title} style={{ ...styles.card, borderLeft: '4px solid #1890ff' }}>
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin /> <Text type="secondary" style={{ marginLeft: 8 }}>Rendering diagram...</Text>
        </div>
      )}
      <div 
        ref={containerRef} 
        style={{ 
          textAlign: 'center', 
          overflow: 'auto',
          maxWidth: '100%',
          display: isLoading ? 'none' : 'block',
        }} 
      />
    </Card>
  );
};

// =============================================================================
// COMPONENT: CRM Workflow Diagrams
// =============================================================================
const CRMWorkflow = () => {
  const masterNavigationChart = `
flowchart TB
    subgraph ENTRY["Entry Point"]
        LOGIN["/login"] --> AUTH{Authenticated?}
        AUTH -->|Yes| MODULES["/modules"]
        AUTH -->|No| LOGIN
        MODULES -->|Click CRM| CRMHOME
    end

    subgraph CRMTABS["CRM Tab Navigation - Sales Rep"]
        CRMHOME["Home /crm"]
        OVERVIEW["Overview /crm/overview"]
        MYDAY["My Day /crm/my-day"]
        WORKLIST["Worklist /crm/worklist"]
        CUSTOMERS["My Customers /crm/customers"]
        PROSPECTS["My Prospects /crm/prospects"]
        PERFORMANCE["Performance /crm/report"]
    end

    CRMHOME <--> OVERVIEW
    OVERVIEW <--> MYDAY
    MYDAY <--> WORKLIST
    WORKLIST <--> CUSTOMERS
    CUSTOMERS <--> PROSPECTS
    PROSPECTS <--> PERFORMANCE

    subgraph WORKLIST_TAB["Worklist Tab"]
        WL_TASKS["/crm/worklist?type=tasks"]
        WL_MEETINGS["/crm/worklist?type=meetings"]
        WL_CALLS["/crm/worklist?type=calls"]
        WL_DEALS["/crm/worklist?type=deals"]
        
        WL_TASKS -->|Open Button| TASK_LINK{Linked To?}
    end

    TASK_LINK -->|inquiry_id| INQ_DETAIL
    TASK_LINK -->|customer_id| CUST_DETAIL
    TASK_LINK -->|prospect_id| PROSP_HIGHLIGHT

    subgraph DETAIL_PAGES["Detail Pages"]
        INQ_DETAIL["/crm/inquiries/:id"]
        CUST_DETAIL["/crm/customers/:id"]
        PROSP_HIGHLIGHT["/crm/prospects?highlight=:id"]
    end
`;

  const entityCrudChart = `
flowchart LR
    subgraph TASKS["Tasks"]
        T_C["Create POST /api/crm/tasks"]
        T_R["Read GET /api/crm/tasks"]
        T_U["Update PATCH /api/crm/tasks/:id"]
    end

    subgraph MEETINGS["Meetings"]
        M_C["Create POST /api/crm/meetings"]
        M_R["Read GET /api/crm/meetings"]
        M_U["Update PATCH /api/crm/meetings/:id"]
    end

    subgraph CALLS["Calls"]
        C_C["Create POST /api/crm/calls"]
        C_R["Read GET /api/crm/calls"]
        C_U["Update PATCH /api/crm/calls/:id"]
    end

    subgraph DEALS["Deals"]
        D_C["Create POST /api/crm/deals"]
        D_R["Read GET /api/crm/deals"]
        D_U["Update PATCH /api/crm/deals/:id"]
    end

    subgraph PROSPECTS["Prospects"]
        P_C["Create POST /api/crm/prospects"]
        P_R["Read GET /api/crm/my-prospects"]
        P_U["Update PUT /api/crm/prospects/:id/status"]
        P_D["Delete DELETE /api/crm/prospects/:id"]
        P_CONV["Convert POST /api/crm/prospects/:id/convert"]
    end
`;

  const prospectLifecycleChart = `
stateDiagram-v2
    [*] --> Active: Create Prospect
    
    Active --> Active: Update notes/source
    Active --> Converted: Convert to Customer
    Active --> Rejected: Mark as Rejected
    Active --> [*]: Delete
    
    Converted --> CustomerRecord: Redirect to Customer Detail
    
    state Active {
        [*] --> Pending
        Pending --> Approved: Admin approves
        Approved --> InProgress: Sales rep working
    }
`;

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <Card style={{ ...styles.card, borderTop: '4px solid #722ed1' }}>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} /> CRM Module - Sales Rep Workflow
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          Complete navigation flow diagrams for the CRM module from a Sales Representative's perspective.
          All click actions, CRUD operations, and entity relationships are documented below.
        </Paragraph>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 12 }}>
          <Tag color="green">7 Tabs</Tag>
          <Tag color="blue">82 API Routes</Tag>
          <Tag color="purple">5 Entity Types</Tag>
          <Tag color="orange">Full CRUD Support</Tag>
        </div>
      </Card>

      {/* Main Navigation Flow */}
      <MermaidDiagram 
        chart={masterNavigationChart} 
        title={<><NodeIndexOutlined /> Master Navigation Flow</>}
      />

      {/* Entity CRUD Matrix */}
      <MermaidDiagram 
        chart={entityCrudChart} 
        title={<><ApiOutlined /> Entity CRUD API Matrix</>}
      />

      {/* Prospect Lifecycle */}
      <MermaidDiagram 
        chart={prospectLifecycleChart} 
        title={<><AimOutlined /> Prospect Lifecycle</>}
      />

      {/* Quick Reference Tables */}
      <Card title={<><BookOutlined /> Quick Reference</>} style={styles.card}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ padding: '16px', backgroundColor: '#e6f7ff', borderRadius: '8px', marginBottom: 16 }}>
              <Title level={5}><ThunderboltOutlined /> Keyboard Shortcuts</Title>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr><td><code>/</code></td><td>Focus search input</td></tr>
                  <tr><td><code>Alt+1</code></td><td>Switch to Tasks</td></tr>
                  <tr><td><code>Alt+2</code></td><td>Switch to Meetings</td></tr>
                  <tr><td><code>Alt+3</code></td><td>Switch to Calls</td></tr>
                  <tr><td><code>Alt+4</code></td><td>Switch to Deals</td></tr>
                </tbody>
              </table>
            </div>
          </Col>
          <Col span={12}>
            <div style={{ padding: '16px', backgroundColor: '#f6ffed', borderRadius: '8px', marginBottom: 16 }}>
              <Title level={5}><CheckCircleOutlined /> Deep Link Resolution</Title>
              <Paragraph style={{ fontSize: '13px', marginBottom: 0 }}>
                When clicking "Open" on a task/meeting/call:<br/>
                1️⃣ <code>inquiry_id</code> → Inquiry Detail<br/>
                2️⃣ <code>customer_id</code> → Customer Detail<br/>
                3️⃣ <code>prospect_id</code> → Prospects List + auto-open drawer
              </Paragraph>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const ProjectWorkflow = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, loading, error, refresh, lastUpdated } = useDocumentationAPI();

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <DashboardOutlined /> Overview
        </span>
      ),
      children: (
        <ProjectOverview 
          tablesData={data.tables} 
          routesData={data.routes}
          lastUpdated={lastUpdated}
        />
      ),
    },
    {
      key: 'database',
      label: (
        <span>
          <DatabaseOutlined /> Database
        </span>
      ),
      children: (
        <DynamicDatabaseSchema 
          tablesData={data.tables}
          loading={loading}
          error={error}
          onRefresh={refresh}
          lastUpdated={lastUpdated}
        />
      ),
    },
    {
      key: 'flows',
      label: (
        <span>
          <SyncOutlined /> Data Flows
        </span>
      ),
      children: (
        <DynamicDataFlows
          flowsData={data.dataFlows}
          loading={loading}
          error={error}
          onRefresh={refresh}
          lastUpdated={lastUpdated}
        />
      ),
    },
    {
      key: 'architecture',
      label: (
        <span>
          <NodeIndexOutlined /> Architecture
        </span>
      ),
      children: <SystemArchitecture />,
    },
    {
      key: 'api',
      label: (
        <span>
          <ApiOutlined /> API Reference
        </span>
      ),
      children: (
        <DynamicAPIReference
          routesData={data.routes}
          loading={loading}
          error={error}
          onRefresh={refresh}
          lastUpdated={lastUpdated}
        />
      ),
    },
    {
      key: 'crm',
      label: (
        <span>
          <TeamOutlined /> CRM Workflow
        </span>
      ),
      children: <CRMWorkflow />,
    },
  ];

  return (
    <div style={styles.container}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        size="large"
        items={tabItems}
        style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      />
    </div>
  );
};

export default ProjectWorkflow;
