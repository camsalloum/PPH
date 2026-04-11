import React, { useState } from 'react';
import { Card, Tabs, Typography, Tag, Divider, Collapse } from 'antd';
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
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

// Styles
const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
  },
  card: {
    marginBottom: '16px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  flowBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '2px solid #1890ff',
    marginBottom: '8px',
  },
  arrow: {
    display: 'flex',
    justifyContent: 'center',
    padding: '8px 0',
    color: '#1890ff',
    fontSize: '20px',
  },
  tableBox: {
    backgroundColor: '#e6f7ff',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #91d5ff',
    display: 'inline-block',
    marginRight: '8px',
    marginBottom: '8px',
  },
  apiBox: {
    backgroundColor: '#f6ffed',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #b7eb8f',
    display: 'inline-block',
    marginRight: '8px',
    marginBottom: '8px',
  },
  componentBox: {
    backgroundColor: '#fff7e6',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ffd591',
    display: 'inline-block',
    marginRight: '8px',
    marginBottom: '8px',
  },
  diagramContainer: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e8e8e8',
    overflowX: 'auto',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  legendColor: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    marginRight: '8px',
  },
  pageSection: {
    marginBottom: '24px',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e8e8e8',
  },
};

// =============================================================================
// ACTUAL TAB WORKFLOW
// =============================================================================
const ActualTabWorkflow = () => (
  <div style={styles.pageSection}>
    <Title level={4} style={{ color: '#1890ff', marginBottom: '16px' }}>
      <LineChartOutlined /> Actual Tab - Data Flow
    </Title>
    
    <div style={styles.diagramContainer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Purpose */}
        <div style={{ backgroundColor: '#e6f7ff', padding: '12px', borderRadius: '8px', border: '1px solid #91d5ff' }}>
          <Text strong>Purpose:</Text> View and manage actual sales data from the database. Read-only historical data imported from Excel/ERP.
        </div>
        
        {/* Data Source */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ ...styles.flowBox, borderColor: '#52c41a', flex: '1', minWidth: '200px' }}>
            <DatabaseOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>fp_data_excel</div>
              <div style={{ fontSize: '12px', color: '#666' }}>WHERE type = 'ACTUAL'</div>
            </div>
          </div>
          <ArrowRightOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
          <div style={{ ...styles.flowBox, borderColor: '#1890ff', flex: '1', minWidth: '200px' }}>
            <TableOutlined style={{ fontSize: '24px', color: '#1890ff', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>ActualTab.js</div>
              <div style={{ fontSize: '12px', color: '#666' }}>Display actual sales data</div>
            </div>
          </div>
        </div>
        
        {/* Data Retrieved */}
        <div style={{ backgroundColor: '#f6ffed', padding: '12px', borderRadius: '8px' }}>
          <Text strong>Data Retrieved:</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            <Tag color="blue">KGS (Volume)</Tag>
            <Tag color="green">Amount (Sales Value)</Tag>
            <Tag color="orange">MoRM (Margin)</Tag>
            <Tag>By Division</Tag>
            <Tag>By Sales Rep</Tag>
            <Tag>By Customer</Tag>
            <Tag>By Country</Tag>
            <Tag>By Product Group</Tag>
            <Tag>By Month/Year</Tag>
          </div>
        </div>
        
        {/* API Endpoints */}
        <div style={{ backgroundColor: '#fff7e6', padding: '12px', borderRadius: '8px' }}>
          <Text strong>API Endpoints:</Text>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              GET /api/aebf/actual
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Queries fp_data_excel WHERE type = 'ACTUAL' for selected division/year
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              POST /api/aebf/upload-actual
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Upload actual data from Excel file to fp_data_excel
            </div>
          </div>
        </div>
        
        {/* Filter Flow */}
        <div style={{ backgroundColor: '#f0f5ff', padding: '12px', borderRadius: '8px' }}>
          <Text strong>Filter Flow:</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            <Tag color="purple">Select Division</Tag>
            <ArrowRightOutlined />
            <Tag color="purple">Select Year</Tag>
            <ArrowRightOutlined />
            <Tag color="purple">Select Months</Tag>
            <ArrowRightOutlined />
            <Tag color="green">Display Data Table</Tag>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// =============================================================================
// ESTIMATE TAB WORKFLOW
// =============================================================================
const EstimateTabWorkflow = () => (
  <div style={styles.pageSection}>
    <Title level={4} style={{ color: '#52c41a', marginBottom: '16px' }}>
      <BarChartOutlined /> Estimate Tab - Data Flow
    </Title>
    
    <div style={styles.diagramContainer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Purpose */}
        <div style={{ backgroundColor: '#f6ffed', padding: '12px', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
          <Text strong>Purpose:</Text> Manage estimate/projection data. Combines Actual data with user-entered estimates for future months.
        </div>
        
        {/* Data Source */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ ...styles.flowBox, borderColor: '#52c41a', flex: '1', minWidth: '200px' }}>
            <DatabaseOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>fp_data_excel</div>
              <div style={{ fontSize: '12px', color: '#666' }}>WHERE type IN ('ACTUAL', 'ESTIMATE')</div>
            </div>
          </div>
          <ArrowRightOutlined style={{ fontSize: '20px', color: '#52c41a' }} />
          <div style={{ ...styles.flowBox, borderColor: '#52c41a', flex: '1', minWidth: '200px' }}>
            <TableOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>EstimateTab.js</div>
              <div style={{ fontSize: '12px', color: '#666' }}>Actual + Estimated projection</div>
            </div>
          </div>
        </div>
        
        {/* Estimate Logic */}
        <div style={{ backgroundColor: '#fffbe6', padding: '12px', borderRadius: '8px', border: '1px solid #ffe58f' }}>
          <Text strong>Estimate Logic:</Text>
          <div style={{ marginTop: '8px', fontSize: '13px' }}>
            <div>• <strong>Past months:</strong> Uses ACTUAL data from database</div>
            <div>• <strong>Current/Future months:</strong> Uses ESTIMATE data (user projections)</div>
            <div>• <strong>Full Year:</strong> Combines both for annual projection</div>
          </div>
        </div>
        
        {/* API Endpoints */}
        <div style={{ backgroundColor: '#fff7e6', padding: '12px', borderRadius: '8px' }}>
          <Text strong>API Endpoints:</Text>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              GET /api/aebf/actual?types=Actual,Estimate
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Queries fp_data_excel WHERE type IN ('ACTUAL', 'ESTIMATE')
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              POST /api/aebf/calculate-estimate
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Calculate estimate values based on actual data and projections
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              POST /api/aebf/save-estimate
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Saves estimate values to fp_data_excel with type = 'ESTIMATE'
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              GET /api/aebf/available-months
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Get list of months with actual data for estimate calculation
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// =============================================================================
// BUDGET TAB WORKFLOW (COMPREHENSIVE)
// =============================================================================
const BudgetTabWorkflow = () => (
  <div style={styles.pageSection}>
    <Title level={4} style={{ color: '#faad14', marginBottom: '16px' }}>
      <FundOutlined /> Budget Tab - Complete Data Flow
    </Title>
    
    <div style={styles.diagramContainer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Purpose */}
        <div style={{ backgroundColor: '#fffbe6', padding: '12px', borderRadius: '8px', border: '1px solid #ffe58f' }}>
          <Text strong>Purpose:</Text> Create and manage sales rep budgets for next year. Multiple input methods: Manual entry, HTML Import, Bulk Import.
        </div>
        
        {/* Section: Sales Rep Selection */}
        <div style={{ borderLeft: '4px solid #1890ff', paddingLeft: '16px' }}>
          <Title level={5}>1️⃣ Sales Rep Selection</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ ...styles.flowBox, borderColor: '#1890ff', flex: '1', minWidth: '180px' }}>
              <UserOutlined style={{ fontSize: '20px', color: '#1890ff', marginRight: '8px' }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Single Sales Rep</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Edit one rep's budget</div>
              </div>
            </div>
            <div style={{ ...styles.flowBox, borderColor: '#722ed1', flex: '1', minWidth: '180px' }}>
              <UserOutlined style={{ fontSize: '20px', color: '#722ed1', marginRight: '8px' }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>All Sales Reps</div>
                <div style={{ fontSize: '11px', color: '#666' }}>View/Edit all combined</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', backgroundColor: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
            <strong>Data Source:</strong> <code>/api/sales-reps-universal</code> → DISTINCT salesrepname FROM fp_data_excel
          </div>
        </div>
        
        {/* Section: Actual Data Loading */}
        <div style={{ borderLeft: '4px solid #52c41a', paddingLeft: '16px' }}>
          <Title level={5}>2️⃣ Actual Data Loading (Previous Year)</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <Tag color="blue">fp_data_excel</Tag>
            <ArrowRightOutlined />
            <Tag color="green">type = 'ACTUAL'</Tag>
            <ArrowRightOutlined />
            <Tag color="orange">Selected Year (e.g., 2024)</Tag>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', backgroundColor: '#f6ffed', padding: '8px', borderRadius: '4px' }}>
            <strong>Returns:</strong> monthlyActual (KGS), monthlyActualAmount, monthlyActualMorm per customer/country/productGroup
          </div>
        </div>
        
        {/* Section: Budget Data Loading */}
        <div style={{ borderLeft: '4px solid #faad14', paddingLeft: '16px' }}>
          <Title level={5}>3️⃣ Budget Data Loading (Next Year)</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <Tag color="gold">fp_sales_rep_budget</Tag>
            <ArrowRightOutlined />
            <Tag color="orange">budget_year = actualYear + 1</Tag>
            <ArrowRightOutlined />
            <Tag color="blue">type = 'BUDGET'</Tag>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', backgroundColor: '#fffbe6', padding: '8px', borderRadius: '4px' }}>
            <strong>Returns:</strong> Existing budget values (KGS in MT) for the selected sales rep
          </div>
        </div>
        
        {/* Section: Pricing Data */}
        <div style={{ borderLeft: '4px solid #eb2f96', paddingLeft: '16px' }}>
          <Title level={5}>4️⃣ Pricing Data Loading</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <Tag color="magenta">fp_product_group_pricing_rounding</Tag>
            <ArrowRightOutlined />
            <Tag color="purple">year = actualYear</Tag>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', backgroundColor: '#fff0f6', padding: '8px', borderRadius: '4px' }}>
            <strong>Returns:</strong> asp_round (selling price), morm_round (MoRM rate) per product group
            <div style={{ marginTop: '4px' }}>
              <strong>Used for:</strong> Amount = KGS × ASP | MoRM = KGS × MoRM Rate
            </div>
          </div>
        </div>
        
        {/* Section: Budget Entry Methods */}
        <div style={{ borderLeft: '4px solid #13c2c2', paddingLeft: '16px' }}>
          <Title level={5}>5️⃣ Budget Entry Methods</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#e6fffb', padding: '12px', borderRadius: '8px', border: '1px solid #87e8de' }}>
              <Text strong>Manual Entry</Text>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                • Edit cells directly in table
                <br />• Auto-save on blur
                <br />• Calculates Amount/MoRM live
              </div>
            </div>
            <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#f9f0ff', padding: '12px', borderRadius: '8px', border: '1px solid #d3adf7' }}>
              <Text strong>HTML Import</Text>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                • Upload exported HTML file
                <br />• Parse budget values
                <br />• Maps to customers/products
              </div>
            </div>
            <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#fff1f0', padding: '12px', borderRadius: '8px', border: '1px solid #ffa39e' }}>
              <Text strong>Bulk Import</Text>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                • Upload multiple HTML files
                <br />• Preview before finalize
                <br />• Batch process all reps
              </div>
            </div>
          </div>
        </div>
        
        {/* Section: Save Flow */}
        <div style={{ borderLeft: '4px solid #52c41a', paddingLeft: '16px' }}>
          <Title level={5}>6️⃣ Save Budget Flow</Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <Tag color="blue">User edits KGS (MT)</Tag>
              <ArrowRightOutlined />
              <Tag color="green">POST /api/aebf/save-html-budget</Tag>
              <ArrowRightOutlined />
              <Tag color="gold">fp_sales_rep_budget</Tag>
            </div>
            <div style={{ fontSize: '12px', backgroundColor: '#f6ffed', padding: '8px', borderRadius: '4px' }}>
              <strong>Creates 3 records per entry:</strong>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Tag color="blue">KGS (MT × 1000)</Tag>
                <Tag color="green">Amount (KGS × ASP)</Tag>
                <Tag color="orange">MoRM (KGS × MoRM rate)</Tag>
              </div>
            </div>
          </div>
        </div>
        
        {/* Section: Bulk Import Flow */}
        <div style={{ borderLeft: '4px solid #f5222d', paddingLeft: '16px' }}>
          <Title level={5}>7️⃣ Bulk Import Flow (Detailed)</Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', fontSize: '12px' }}>
              <Tag>Upload HTML Files</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag color="cyan">fp_budget_bulk_import</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag>Preview Draft</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag color="magenta">Pricing Lookup</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag color="purple">Material/Process Lookup</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag color="green">Submit to Final</Tag>
              <ArrowRightOutlined style={{ fontSize: '12px' }} />
              <Tag color="gold">fp_sales_rep_budget</Tag>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// =============================================================================
// FORECAST TAB WORKFLOW
// =============================================================================
const ForecastTabWorkflow = () => (
  <div style={styles.pageSection}>
    <Title level={4} style={{ color: '#722ed1', marginBottom: '16px' }}>
      <AimOutlined /> Forecast Tab - Data Flow
    </Title>
    
    <div style={styles.diagramContainer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Purpose */}
        <div style={{ backgroundColor: '#f9f0ff', padding: '12px', borderRadius: '8px', border: '1px solid #d3adf7' }}>
          <Text strong>Purpose:</Text> Create forecasts based on actual data, estimates, and budgets. Used for future planning and projections.
        </div>
        
        {/* Data Sources */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ ...styles.flowBox, borderColor: '#722ed1', flex: '1', minWidth: '180px' }}>
            <DatabaseOutlined style={{ fontSize: '20px', color: '#1890ff', marginRight: '8px' }} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>fp_data_excel</div>
              <div style={{ fontSize: '11px', color: '#666' }}>type = 'ACTUAL'</div>
            </div>
          </div>
          <div style={{ ...styles.flowBox, borderColor: '#722ed1', flex: '1', minWidth: '180px' }}>
            <DatabaseOutlined style={{ fontSize: '20px', color: '#52c41a', marginRight: '8px' }} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>fp_data_excel</div>
              <div style={{ fontSize: '11px', color: '#666' }}>type = 'ESTIMATE'</div>
            </div>
          </div>
          <div style={{ ...styles.flowBox, borderColor: '#722ed1', flex: '1', minWidth: '180px' }}>
            <DatabaseOutlined style={{ fontSize: '20px', color: '#faad14', marginRight: '8px' }} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>fp_sales_rep_budget</div>
              <div style={{ fontSize: '11px', color: '#666' }}>type = 'BUDGET'</div>
            </div>
          </div>
        </div>
        
        {/* Forecast Logic */}
        <div style={{ backgroundColor: '#f0f5ff', padding: '12px', borderRadius: '8px' }}>
          <Text strong>Forecast Calculation:</Text>
          <div style={{ marginTop: '8px', fontSize: '13px' }}>
            <div>• <strong>Historical Trend:</strong> Analyzes past actual data patterns</div>
            <div>• <strong>Budget Alignment:</strong> Considers approved budget targets</div>
            <div>• <strong>Seasonal Adjustments:</strong> Applies monthly seasonality factors</div>
          </div>
        </div>
        
        {/* API Endpoints */}
        <div style={{ backgroundColor: '#fff7e6', padding: '12px', borderRadius: '8px' }}>
          <Text strong>API Endpoints:</Text>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              GET /api/aebf/actual?types=Actual,Budget,Estimate
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Combines Actual + Estimate + Budget data for projection
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
              GET /api/aebf/year-summary
            </code>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              → Get yearly summary for trend analysis
            </div>
          </div>
          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#fff2e8', borderRadius: '4px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <strong>Note:</strong> Forecast data is derived from combining Actual, Estimate, and Budget data.
              No separate forecast save endpoint exists - forecasts are calculated on-the-fly.
            </Text>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Database Tables Section
const DatabaseTablesSection = () => (
  <Card title={<><DatabaseOutlined /> Database Tables</>} style={styles.card}>
    <Collapse defaultActiveKey={['1']}>
      <Panel header="Main Data Tables" key="1">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1', minWidth: '300px' }}>
            <Title level={5}>fp_data_excel</Title>
            <Text type="secondary">Main sales data table (Actual, Budget, Estimate)</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">division</Tag>
              <Tag color="blue">salesrepname</Tag>
              <Tag color="blue">customername</Tag>
              <Tag color="blue">countryname</Tag>
              <Tag color="blue">productgroup</Tag>
              <Tag color="green">year</Tag>
              <Tag color="green">month</Tag>
              <Tag color="orange">type</Tag>
              <Tag color="orange">values_type</Tag>
              <Tag color="red">values</Tag>
              <Tag color="purple">material</Tag>
              <Tag color="purple">process</Tag>
            </div>
          </div>
          <div style={{ flex: '1', minWidth: '300px' }}>
            <Title level={5}>fp_sales_rep_budget</Title>
            <Text type="secondary">Sales rep budget entries (KGS, Amount, MoRM)</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">division</Tag>
              <Tag color="blue">salesrepname</Tag>
              <Tag color="blue">customername</Tag>
              <Tag color="blue">countryname</Tag>
              <Tag color="blue">productgroup</Tag>
              <Tag color="green">budget_year</Tag>
              <Tag color="green">month</Tag>
              <Tag color="orange">type</Tag>
              <Tag color="orange">values_type</Tag>
              <Tag color="red">values</Tag>
              <Tag color="purple">material</Tag>
              <Tag color="purple">process</Tag>
            </div>
          </div>
        </div>
      </Panel>
      
      <Panel header="Support Tables" key="2">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Title level={5}>fp_product_group_pricing_rounding</Title>
            <Text type="secondary">Pricing data per product group per year</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">division</Tag>
              <Tag color="blue">product_group</Tag>
              <Tag color="green">year</Tag>
              <Tag color="red">asp_round</Tag>
              <Tag color="red">morm_round</Tag>
            </div>
            <Paragraph style={{ marginTop: '8px', fontSize: '12px' }}>
              <Text type="warning">Used to calculate: Amount = KGS × asp_round, MoRM = KGS × morm_round</Text>
            </Paragraph>
          </div>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Title level={5}>fp_material_percentages</Title>
            <Text type="secondary">Material & Process mapping per product group</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">product_group</Tag>
              <Tag color="purple">material</Tag>
              <Tag color="purple">process</Tag>
            </div>
            <Paragraph style={{ marginTop: '8px', fontSize: '12px' }}>
              <Text type="warning">PE, Non PE, Others | Printed, Unprinted, Others</Text>
            </Paragraph>
          </div>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Title level={5}>fp_budget_bulk_import</Title>
            <Text type="secondary">Temporary storage for bulk HTML imports (Draft)</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="cyan">batch_id</Tag>
              <Tag color="blue">sales_rep</Tag>
              <Tag color="blue">customer</Tag>
              <Tag color="green">budget_year</Tag>
              <Tag color="red">month_1...month_12</Tag>
              <Tag color="orange">status</Tag>
            </div>
          </div>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Title level={5}>fp_divisional_budget</Title>
            <Text type="secondary">Division-level budget summaries</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">division</Tag>
              <Tag color="green">budget_year</Tag>
              <Tag color="purple">product_group</Tag>
              <Tag color="red">monthly values</Tag>
            </div>
            <Paragraph style={{ marginTop: '8px', fontSize: '12px' }}>
              <Text type="warning">Used for divisional budget planning and HTML export/import</Text>
            </Paragraph>
          </div>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Title level={5}>fp_sales_rep_budget_draft</Title>
            <Text type="secondary">Draft budget before final submission</Text>
            <div style={{ marginTop: '8px' }}>
              <Tag color="blue">salesrepname</Tag>
              <Tag color="blue">customername</Tag>
              <Tag color="green">budget_year</Tag>
              <Tag color="red">monthly values</Tag>
            </div>
          </div>
        </div>
      </Panel>
    </Collapse>
  </Card>
);

// Data Flow Diagram
const DataFlowDiagram = () => (
  <Card title={<><SyncOutlined /> Data Flow Overview</>} style={styles.card}>
    <div style={styles.diagramContainer}>
      {/* Main Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Source Layer */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ ...styles.flowBox, borderColor: '#52c41a', backgroundColor: '#f6ffed' }}>
            <FileExcelOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>HTML Export Files</div>
              <div style={{ fontSize: '12px', color: '#666' }}>FINAL_FP_*.html</div>
            </div>
          </div>
          <div style={{ ...styles.flowBox, borderColor: '#722ed1', backgroundColor: '#f9f0ff' }}>
            <TableOutlined style={{ fontSize: '24px', color: '#722ed1', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>Excel Upload</div>
              <div style={{ fontSize: '12px', color: '#666' }}>Manual data entry</div>
            </div>
          </div>
        </div>
        
        <div style={styles.arrow}><ArrowDownOutlined /></div>
        
        {/* Import Layer */}
        <div style={{ ...styles.flowBox, borderColor: '#fa8c16', backgroundColor: '#fff7e6', width: '100%', maxWidth: '500px' }}>
          <CloudUploadOutlined style={{ fontSize: '24px', color: '#fa8c16', marginRight: '12px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold' }}>Bulk Import Process</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              /api/aebf/bulk-import → fp_budget_bulk_import (Draft)
            </div>
          </div>
        </div>
        
        <div style={styles.arrow}><ArrowDownOutlined /></div>
        
        {/* Processing Layer */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <div style={{ ...styles.flowBox, borderColor: '#eb2f96', backgroundColor: '#fff0f6', flex: 1, minWidth: '200px' }}>
            <CalculatorOutlined style={{ fontSize: '24px', color: '#eb2f96', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>Pricing Lookup</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                fp_product_group_pricing_rounding
              </div>
              <div style={{ fontSize: '11px', color: '#999' }}>
                ASP, MoRM rates per product group
              </div>
            </div>
          </div>
          <div style={{ ...styles.flowBox, borderColor: '#13c2c2', backgroundColor: '#e6fffb', flex: 1, minWidth: '200px' }}>
            <DatabaseOutlined style={{ fontSize: '24px', color: '#13c2c2', marginRight: '12px' }} />
            <div>
              <div style={{ fontWeight: 'bold' }}>Material/Process</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                fp_material_percentages
              </div>
              <div style={{ fontSize: '11px', color: '#999' }}>
                PE, Non PE, Others mapping
              </div>
            </div>
          </div>
        </div>
        
        <div style={styles.arrow}><ArrowDownOutlined /></div>
        
        {/* Finalize Layer */}
        <div style={{ ...styles.flowBox, borderColor: '#1890ff', backgroundColor: '#e6f7ff', width: '100%', maxWidth: '600px' }}>
          <CheckCircleOutlined style={{ fontSize: '24px', color: '#1890ff', marginRight: '12px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold' }}>Submit to Final</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              /api/aebf/bulk-finalize → Creates 3 records per entry:
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <Tag color="blue">KGS (quantity)</Tag>
              <Tag color="green">Amount (KGS × ASP)</Tag>
              <Tag color="orange">MoRM (KGS × MoRM rate)</Tag>
            </div>
          </div>
        </div>
        
        <div style={styles.arrow}><ArrowDownOutlined /></div>
        
        {/* Storage Layer */}
        <div style={{ ...styles.flowBox, borderColor: '#52c41a', backgroundColor: '#f6ffed', width: '100%', maxWidth: '500px' }}>
          <DatabaseOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold' }}>fp_sales_rep_budget</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Final budget data with KGS, Amount, MoRM, Material, Process
            </div>
          </div>
        </div>
        
      </div>
    </div>
  </Card>
);

// API Endpoints Section
const APIEndpointsSection = () => (
  <Card title={<><CloudUploadOutlined /> API Endpoints</>} style={styles.card}>
    <Collapse>
      <Panel header="Data Retrieval Endpoints (GET)" key="1">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Data Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/actual</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get actual/estimate data (supports types param)
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/budget</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get budget data from main table
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/summary</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get summary statistics
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/year-summary</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get yearly summary for trend analysis
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/filter-options</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get available years for filtering
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag> (DISTINCT year)
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/distinct/:field</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get distinct values for any field
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/available-months</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get months with actual data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/html-budget-actual-years</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get available actual years for budget
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/budget-years</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get years with budget data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/budget-sales-reps</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get sales reps with budget data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/export</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Export data to Excel/CSV
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/sales-reps-universal</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get all sales reps for a division
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag> (DISTINCT salesrepname)
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
      
      <Panel header="Budget HTML Input Endpoints (POST)" key="2">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Target Table</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/html-budget-customers</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get customer data for single sales rep
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
                <Tag color="green">fp_sales_rep_budget</Tag>
                <Tag color="orange">fp_product_group_pricing_rounding</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/html-budget-customers-all</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get customer data for ALL sales reps combined
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
                <Tag color="green">fp_sales_rep_budget</Tag>
                <Tag color="orange">fp_product_group_pricing_rounding</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/save-html-budget</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Save individual budget edits
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/export-html-budget-form</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Export budget HTML form for sales reps
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/import-budget-html</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Import completed budget HTML form
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel header="Divisional Budget Endpoints (POST)" key="3">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Target Table</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/divisional-html-budget-data</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get divisional budget summary data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="purple">fp_divisional_budget</Tag>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/export-divisional-html-budget-form</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Export divisional budget HTML form
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="purple">fp_divisional_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/import-divisional-budget-html</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Import divisional budget HTML form
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="purple">fp_divisional_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/save-divisional-budget</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Save divisional budget entries
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="purple">fp_divisional_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/delete-divisional-budget/:division/:budgetYear</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Delete divisional budget for a year
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="purple">fp_divisional_budget</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel header="Bulk Import Endpoints" key="4">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Target Table</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/bulk-import</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Import HTML files to draft
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="cyan">fp_budget_bulk_import</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>GET /api/aebf/bulk-batches</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                List all bulk import batches
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="cyan">fp_budget_bulk_import</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>GET /api/aebf/bulk-batch/:batchId</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get details of a specific batch
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="cyan">fp_budget_bulk_import</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/bulk-finalize/:batchId</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Finalize draft to budget (calculates Amount, MoRM)
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>GET /api/aebf/bulk-export/:batchId</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Export batch data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="cyan">fp_budget_bulk_import</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>DELETE /api/aebf/bulk-batch/:batchId</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Delete a draft batch
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="cyan">fp_budget_bulk_import</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel header="Upload & Analysis Endpoints" key="5">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Target Table</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/upload-actual</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Upload actual data from Excel
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/upload-budget</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Upload budget data from Excel
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/analyze-file</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Analyze uploaded Excel file structure
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="default">Analysis Only</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/calculate-estimate</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Calculate estimate projections
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="default">Calculation Only</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>POST /api/aebf/save-estimate</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Save estimate data
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel header="Reporting Endpoints (POST)" key="6">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Purpose</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>Data Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/budget-sales-rep-recap</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get sales rep budget recap
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/budget-product-groups</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get budget by product groups
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="green">fp_sales_rep_budget</Tag>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <code>/api/aebf/actual-product-groups</code>
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                Get actual by product groups
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #e8e8e8' }}>
                <Tag color="blue">fp_data_excel</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </Collapse>
  </Card>
);

// Calculation Logic Section
const CalculationLogicSection = () => (
  <Card title={<><CalculatorOutlined /> Calculation Logic</>} style={styles.card}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
      <div style={{ flex: '1', minWidth: '300px', backgroundColor: '#f6ffed', padding: '16px', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
        <Title level={5} style={{ color: '#52c41a' }}>Budget Amount Calculation</Title>
        <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px', fontFamily: 'monospace' }}>
          <div><strong>Amount</strong> = KGS × ASP (Selling Price)</div>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ fontSize: '12px', color: '#666' }}>
            Where ASP comes from <code>fp_product_group_pricing_rounding.asp_round</code>
            for the matching product_group and year (actualYear, not budgetYear)
          </div>
        </div>
      </div>
      
      <div style={{ flex: '1', minWidth: '300px', backgroundColor: '#fff7e6', padding: '16px', borderRadius: '8px', border: '1px solid #ffd591' }}>
        <Title level={5} style={{ color: '#fa8c16' }}>Budget MoRM Calculation</Title>
        <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px', fontFamily: 'monospace' }}>
          <div><strong>MoRM</strong> = KGS × MoRM Rate</div>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ fontSize: '12px', color: '#666' }}>
            Where MoRM Rate comes from <code>fp_product_group_pricing_rounding.morm_round</code>
            for the matching product_group and year
          </div>
        </div>
      </div>
      
      <div style={{ flex: '1', minWidth: '300px', backgroundColor: '#e6f7ff', padding: '16px', borderRadius: '8px', border: '1px solid #91d5ff' }}>
        <Title level={5} style={{ color: '#1890ff' }}>Unit Conversions</Title>
        <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px', fontFamily: 'monospace' }}>
          <div><strong>Display:</strong> MT (Metric Tons)</div>
          <div><strong>Storage:</strong> KGS (Kilograms)</div>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ fontSize: '12px', color: '#666' }}>
            <div>• UI shows MT = KGS ÷ 1000</div>
            <div>• Database stores KGS = MT × 1000</div>
          </div>
        </div>
      </div>
    </div>
  </Card>
);

// Year Logic Section
const YearLogicSection = () => (
  <Card title={<><DatabaseOutlined /> Year & Period Logic</>} style={styles.card}>
    <div style={{ backgroundColor: '#f0f5ff', padding: '16px', borderRadius: '8px', border: '1px solid #adc6ff' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        <div style={{ flex: '1', minWidth: '250px' }}>
          <Title level={5}>Actual Year Selection</Title>
          <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px' }}>
            <div>User selects: <Tag color="blue">2024</Tag></div>
            <div style={{ marginTop: '8px' }}>
              <ArrowRightOutlined /> Actual data from: <strong>fp_data_excel WHERE year = 2024</strong>
            </div>
            <div style={{ marginTop: '8px' }}>
              <ArrowRightOutlined /> Budget year: <Tag color="green">2025</Tag> (actualYear + 1)
            </div>
          </div>
        </div>
        
        <div style={{ flex: '1', minWidth: '250px' }}>
          <Title level={5}>Pricing Year</Title>
          <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px' }}>
            <div>Pricing lookup year: <Tag color="orange">Same as Actual Year</Tag></div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              If user selects 2024, pricing comes from 2024 rates
            </div>
          </div>
        </div>
        
        <div style={{ flex: '1', minWidth: '250px' }}>
          <Title level={5}>Budget Storage</Title>
          <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px' }}>
            <div>budget_year column: <Tag color="purple">actualYear + 1</Tag></div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Budget for 2025 is stored with budget_year = 2025
            </div>
          </div>
        </div>
      </div>
    </div>
  </Card>
);

// Component Architecture
const ComponentArchitecture = () => (
  <Card title={<><TableOutlined /> Component Architecture</>} style={styles.card}>
    <div style={styles.diagramContainer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Main Component */}
        <div style={{ backgroundColor: '#f0f5ff', padding: '16px', borderRadius: '8px', border: '2px solid #1890ff' }}>
          <Title level={5} style={{ margin: 0 }}>BudgetTab.js (Main Component)</Title>
          <Text type="secondary">~7200 lines | Main budget management interface</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            <Tag color="blue">Sales Rep Selection</Tag>
            <Tag color="blue">All Sales Reps Mode</Tag>
            <Tag color="green">Budget Table</Tag>
            <Tag color="green">KPI Cards</Tag>
            <Tag color="orange">Bulk Import</Tag>
            <Tag color="orange">Export HTML</Tag>
            <Tag color="purple">Add/Delete Rows</Tag>
          </div>
        </div>
        
        {/* Sub-features */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#f6ffed', padding: '12px', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
            <Title level={5} style={{ margin: 0, fontSize: '14px' }}>Single Sales Rep Mode</Title>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              <div>• Select individual sales rep</div>
              <div>• View/Edit their customers</div>
              <div>• Save budget per customer</div>
              <div>• Export HTML form</div>
            </div>
          </div>
          
          <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#fff7e6', padding: '12px', borderRadius: '8px', border: '1px solid #ffd591' }}>
            <Title level={5} style={{ margin: 0, fontSize: '14px' }}>All Sales Reps Mode</Title>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              <div>• View all reps combined</div>
              <div>• Filter by Sales Rep column</div>
              <div>• Target Sales Rep for actions</div>
              <div>• Bulk operations</div>
            </div>
          </div>
          
          <div style={{ flex: '1', minWidth: '200px', backgroundColor: '#fff0f6', padding: '12px', borderRadius: '8px', border: '1px solid #ffadd2' }}>
            <Title level={5} style={{ margin: 0, fontSize: '14px' }}>Bulk Import</Title>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              <div>• Upload multiple HTML files</div>
              <div>• Preview before finalize</div>
              <div>• Auto-calculate Amount/MoRM</div>
              <div>• Material/Process lookup</div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  </Card>
);

// Legend
const Legend = () => (
  <Card title="Legend" size="small" style={{ ...styles.card, marginBottom: 0 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
      <div style={styles.legendItem}>
        <div style={{ ...styles.legendColor, backgroundColor: '#e6f7ff', border: '1px solid #91d5ff' }} />
        <Text>Database Table</Text>
      </div>
      <div style={styles.legendItem}>
        <div style={{ ...styles.legendColor, backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }} />
        <Text>API Endpoint</Text>
      </div>
      <div style={styles.legendItem}>
        <div style={{ ...styles.legendColor, backgroundColor: '#fff7e6', border: '1px solid #ffd591' }} />
        <Text>Component/Feature</Text>
      </div>
      <div style={styles.legendItem}>
        <div style={{ ...styles.legendColor, backgroundColor: '#f0f5ff', border: '1px solid #adc6ff' }} />
        <Text>Processing Logic</Text>
      </div>
    </div>
  </Card>
);

// Main Component
const AEBFWorkflow = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <div style={styles.container}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <Title level={2} style={{ marginBottom: '8px' }}>
          <DatabaseOutlined /> AEBF Data Workflow
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: '24px' }}>
          Visual documentation of data flow, database connections, and calculation logic for the AEBF Budget System
        </Paragraph>
        
        <Legend />
        
        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ marginTop: '16px' }}>
          <TabPane tab="📊 Overview" key="overview">
            <DataFlowDiagram />
            <CalculationLogicSection />
            <YearLogicSection />
          </TabPane>
          
          <TabPane tab="🗄️ Database" key="database">
            <DatabaseTablesSection />
          </TabPane>
          
          <TabPane tab="🔌 API" key="api">
            <APIEndpointsSection />
          </TabPane>
          
          <TabPane tab="🧩 Components" key="components">
            <ComponentArchitecture />
          </TabPane>
        </Tabs>
      </div>
    </div>
  );
};

export default AEBFWorkflow;
