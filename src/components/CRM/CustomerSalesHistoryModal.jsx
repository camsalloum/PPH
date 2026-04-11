import React, { useState, useEffect } from 'react';
import { Modal, Table, DatePicker, Button, Space, Tag, App, Statistic, Row, Col, Card, Empty } from 'antd';
import { DownloadOutlined, CalendarOutlined, ShoppingOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import './CRM.css';
import * as XLSX from 'xlsx';
import CurrencySymbol from '../common/CurrencySymbol';

const { RangePicker } = DatePicker;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerSalesHistoryModal = ({ visible, onClose, customer }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [maximized, setMaximized] = useState(true);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  // Default to current year to date (Jan 1 of current year to today)
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('year'),
    dayjs()
  ]);
  const [currencyCode, setCurrencyCode] = useState('AED');
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalKgs: 0,
    transactionCount: 0,
    firstDate: null,
    lastDate: null
  });

  // Fetch sales history when modal opens or date range changes
  useEffect(() => {
    if (visible && customer) {
      fetchSalesHistory();
    }
  }, [visible, customer, dateRange]);

  const fetchSalesHistory = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      
      const params = {};
      if (dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await axios.get(
        `${API_BASE_URL}/api/crm/customers/${customer.id}/sales-history`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params
        }
      );

      if (response.data.success) {
        setSalesData(response.data.data.transactions);
        setSummary(response.data.data.summary);
        setCurrencyCode(response.data.data.customer?.currencyCode || response.data.data.summary?.currencyCode || 'AED');
      }
    } catch (error) {
      console.error('Error fetching sales history:', error);
      message.error('Failed to load sales history');
    } finally {
      setLoading(false);
    }
  };

  const handleExportToExcel = () => {
    if (salesData.length === 0) {
      message.warning('No data to export');
      return;
    }

    // Prepare data for Excel
    const excelData = salesData.map(record => ({
      'Date': dayjs(record.date).format('DD/MM/YYYY'),
      'Invoice Number': record.invoice_number || '-',
      'Customer Name': record.customer_name,
      'Product Group': record.product_group,
      'Quantity (Kgs)': record.quantity_kgs,
      [`Amount (${currencyCode})`]: record.amount,
      'Sales Rep': record.sales_rep,
      'Country': record.country,
      'Year': record.year
    }));

    // Create worksheet and workbook
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales History');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.min(
        Math.max(
          key.length,
          ...excelData.map(row => String(row[key] || '').length)
        ) + 2,
        maxWidth
      )
    }));
    ws['!cols'] = colWidths;

    // Generate filename
    const customerName = customer.customer_name?.replace(/[^a-z0-9]/gi, '_') || 'Customer';
    const dateStr = dateRange[0] && dateRange[1] 
      ? `_${dateRange[0].format('YYYYMMDD')}_to_${dateRange[1].format('YYYYMMDD')}`
      : '_AllTime';
    const filename = `${customerName}_SalesHistory${dateStr}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
    message.success(`Exported ${salesData.length} transactions to ${filename}`);
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      defaultSortOrder: 'descend'
    },
    {
      title: 'Invoice #',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 140,
      render: (text) => text || '-'
    },
    {
      title: 'Product Group',
      dataIndex: 'product_group',
      key: 'product_group',
      width: 150,
      ellipsis: true
    },
    {
      title: 'Quantity (Kgs)',
      dataIndex: 'quantity_kgs',
      key: 'quantity_kgs',
      width: 130,
      align: 'right',
      render: (value) => {
        const num = parseFloat(value) || 0;
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      },
      sorter: (a, b) => (parseFloat(a.quantity_kgs) || 0) - (parseFloat(b.quantity_kgs) || 0)
    },
    {
      title: () => (
        <Space size={4}>
          <span>Amount</span>
          <CurrencySymbol code={currencyCode} />
        </Space>
      ),
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      align: 'right',
      render: (value) => {
        const num = parseFloat(value) || 0;
        return (
          <span className="crm-history-modal-title">
            {num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
      sorter: (a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0)
    },
    {
      title: 'Sales Rep',
      dataIndex: 'sales_rep',
      key: 'sales_rep',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 150,
      render: (text) => text || '-'
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 80,
      align: 'center',
      render: (year) => <Tag color="blue">{year}</Tag>
    },
    ...(salesData.length > 0 && salesData[0].morm !== undefined ? [
      {
        title: 'MoRM %',
        dataIndex: 'morm',
        key: 'morm',
        width: 100,
        align: 'right',
        render: (value) => value != null ? `${(parseFloat(value) * 100).toFixed(1)}%` : '-',
        sorter: (a, b) => (parseFloat(a.morm) || 0) - (parseFloat(b.morm) || 0)
      },
      {
        title: 'Margin/Total %',
        dataIndex: 'margin_over_total',
        key: 'margin_over_total',
        width: 115,
        align: 'right',
        render: (value) => value != null ? `${(parseFloat(value) * 100).toFixed(1)}%` : '-',
        sorter: (a, b) => (parseFloat(a.margin_over_total) || 0) - (parseFloat(b.margin_over_total) || 0)
      }
    ] : [])
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
          <Space>
            <ShoppingOutlined />
            <span>Sales History - {customer?.customer_name}</span>
          </Space>
          <Button
            type="text"
            size="small"
            icon={maximized ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={() => setMaximized(m => !m)}
            title={maximized ? 'Restore window' : 'Maximize'}
          />
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={maximized ? '100vw' : '90%'}
      style={maximized ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: 20 }}
      styles={maximized ? { body: { height: 'calc(100vh - 55px)', overflow: 'auto' } } : undefined}
      footer={null}
      destroyOnHidden
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Summary Cards */}
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total Transactions"
                value={summary.transactionCount}
                prefix={<ShoppingOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total Amount"
                value={Math.round(summary.totalAmount || 0)}
                precision={0}
                prefix={<CurrencySymbol code={currencyCode} style={{ marginRight: 4 }} />}
                formatter={(value) => value.toLocaleString('en-US')}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total Quantity"
                value={Math.round(summary.totalKgs || 0)}
                precision={0}
                suffix="Kgs"
                formatter={(value) => value.toLocaleString('en-US')}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Period"
                value={summary.firstDate && summary.lastDate 
                  ? `${dayjs(summary.firstDate).format('MMM YYYY')} - ${dayjs(summary.lastDate).format('MMM YYYY')}`
                  : 'No data'}
                className="crm-statistic-sm"
              />
            </Card>
          </Col>
        </Row>

        {/* Filters and Actions */}
        <Space className="crm-header-space">
          <Space>
            <CalendarOutlined />
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="DD/MM/YYYY"
              allowClear
              placeholder={['Start Date', 'End Date']}
            />
            {dateRange[0] && (
              <Button onClick={() => setDateRange([null, null])}>
                Clear Filter
              </Button>
            )}
          </Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportToExcel}
            disabled={salesData.length === 0}
          >
            Export to Excel
          </Button>
        </Space>

        {/* Sales History Table */}
        <Table
          columns={columns}
          dataSource={salesData}
          rowKey={(record) => `${record.year}-${record.month_no}-${record.customer_name || ''}-${record.product_group || ''}-${record.invoice_number || ''}`}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} transactions`,
            pageSizeOptions: ['25', '50', '100', '200', '500'],
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          }}
          scroll={{ x: 1400, y: maximized ? 'calc(100vh - 370px)' : 500 }}
          size="small"
          bordered
          locale={{
            emptyText: (
              <Empty
                description="No sales transactions found"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
          summary={(pageData) => {
            if (pageData.length === 0) return null;
            
            const totalAmount = pageData.reduce((sum, record) => sum + (parseFloat(record.amount) || 0), 0);
            const totalKgs = pageData.reduce((sum, record) => sum + (parseFloat(record.quantity_kgs) || 0), 0);
            
            return (
              <Table.Summary fixed>
                <Table.Summary.Row className="crm-history-summary-row">
                  <Table.Summary.Cell index={0} colSpan={5} align="right">
                    Page Total:
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    {totalKgs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Space>
    </Modal>
  );
};

export default CustomerSalesHistoryModal;
