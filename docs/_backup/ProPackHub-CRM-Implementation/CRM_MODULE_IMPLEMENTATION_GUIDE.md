# 🔧 CRM MODULE IMPLEMENTATION GUIDE
## Detailed Code Templates & Agent Prompts

**Reference:** CRM_IMPLEMENTATION_MASTER_PLAN.md  
**Created:** December 27, 2025

---

## MODULE 1: CUSTOMER MASTER

### Migration File: `server/migrations/100_create_crm_foundation.sql`

```sql
-- ============================================================================
-- CRM FOUNDATION TABLES
-- Created: 2025-12-27
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CUSTOMER MASTER
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_master (
  customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Basic Info
  company_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  short_name VARCHAR(100),
  
  -- Classification
  customer_type VARCHAR(50) DEFAULT 'Prospect',
  customer_category VARCHAR(50),
  industry VARCHAR(100),
  market_segment VARCHAR(100),
  
  -- Territory & Assignment
  country VARCHAR(100),
  region VARCHAR(100),
  territory VARCHAR(100),
  assigned_salesrep VARCHAR(255),
  assigned_salesrep_id UUID,
  
  -- Financial
  credit_limit DECIMAL(18,2) DEFAULT 0,
  payment_terms VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'AED',
  
  -- Primary Contact
  primary_contact_name VARCHAR(255),
  primary_email VARCHAR(255),
  primary_phone VARCHAR(50),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  
  -- Business Data
  annual_revenue DECIMAL(18,2),
  employee_count VARCHAR(50),
  website VARCHAR(255),
  
  -- Source
  lead_source VARCHAR(100),
  lead_date DATE,
  conversion_date DATE,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  
  -- Integration
  legacy_customer_names TEXT[],
  data_source VARCHAR(50) DEFAULT 'manual',
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(company_name, '') || ' ' || 
      COALESCE(display_name, '') || ' ' ||
      COALESCE(customer_code, '') || ' ' ||
      COALESCE(primary_email, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(country, '')
    )
  ) STORED
);

-- ============================================================================
-- CUSTOMER CONTACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_contacts (
  contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customer_master(customer_id) ON DELETE CASCADE,
  
  -- Contact Details
  salutation VARCHAR(20),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  job_title VARCHAR(100),
  department VARCHAR(100),
  
  -- Communication
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  whatsapp VARCHAR(50),
  
  -- Permissions
  is_primary BOOLEAN DEFAULT false,
  can_approve_samples BOOLEAN DEFAULT false,
  can_approve_quotes BOOLEAN DEFAULT false,
  can_place_orders BOOLEAN DEFAULT false,
  receives_invoices BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  preferred_language VARCHAR(10) DEFAULT 'en',
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER ADDRESSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  address_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customer_master(customer_id) ON DELETE CASCADE,
  
  address_type VARCHAR(50) NOT NULL,
  address_name VARCHAR(255),
  is_default BOOLEAN DEFAULT false,
  
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  
  contact_person VARCHAR(255),
  contact_phone VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER NUMBER SEQUENCE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS customer_code_seq START WITH 1;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customer_master_code ON customer_master(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_master_company ON customer_master(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_master_salesrep ON customer_master(assigned_salesrep);
CREATE INDEX IF NOT EXISTS idx_customer_master_type ON customer_master(customer_type);
CREATE INDEX IF NOT EXISTS idx_customer_master_country ON customer_master(country);
CREATE INDEX IF NOT EXISTS idx_customer_master_active ON customer_master(is_active);
CREATE INDEX IF NOT EXISTS idx_customer_master_search ON customer_master USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_customer_master_legacy ON customer_master USING GIN(legacy_customer_names);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_primary ON customer_contacts(customer_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate customer code
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS VARCHAR(50) AS $$
DECLARE
  new_code VARCHAR(50);
  year_part VARCHAR(4);
  seq_num INT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := NEXTVAL('customer_code_seq');
  new_code := 'CUS-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS customer_master_updated_at ON customer_master;
CREATE TRIGGER customer_master_updated_at
  BEFORE UPDATE ON customer_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS customer_contacts_updated_at ON customer_contacts;
CREATE TRIGGER customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### API Routes: `server/routes/crm/customers.js`

```javascript
/**
 * Customer Master API Routes
 * Part of CRM Module
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../database/config');
const logger = require('../../utils/logger');
const { authenticateToken } = require('../../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/crm/customers
 * List customers with filtering, searching, and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      search,
      customer_type,
      assigned_salesrep,
      country,
      industry,
      is_active = 'true',
      page = 1,
      limit = 50,
      sort_by = 'company_name',
      sort_order = 'asc'
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    
    // Build WHERE conditions
    if (search) {
      conditions.push(`search_vector @@ plainto_tsquery('english', $${paramIndex})`);
      params.push(search);
      paramIndex++;
    }
    
    if (customer_type) {
      conditions.push(`customer_type = $${paramIndex}`);
      params.push(customer_type);
      paramIndex++;
    }
    
    if (assigned_salesrep) {
      conditions.push(`assigned_salesrep = $${paramIndex}`);
      params.push(assigned_salesrep);
      paramIndex++;
    }
    
    if (country) {
      conditions.push(`country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }
    
    if (industry) {
      conditions.push(`industry = $${paramIndex}`);
      params.push(industry);
      paramIndex++;
    }
    
    if (is_active !== 'all') {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }
    
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ') 
      : '';
    
    // Validate sort column
    const validSortColumns = ['company_name', 'customer_code', 'created_at', 'country', 'customer_type'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'company_name';
    const sortDirection = sort_order === 'desc' ? 'DESC' : 'ASC';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM customer_master ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get customers
    const query = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM customer_contacts cc WHERE cc.customer_id = c.customer_id) as contact_count,
        (SELECT json_agg(json_build_object('name', cc.first_name || ' ' || COALESCE(cc.last_name, ''), 'email', cc.email)) 
         FROM customer_contacts cc 
         WHERE cc.customer_id = c.customer_id AND cc.is_primary = true) as primary_contact
      FROM customer_master c
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
    
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

/**
 * GET /api/crm/customers/:id
 * Get single customer with all related data
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get customer
    const customerQuery = `
      SELECT * FROM customer_master WHERE customer_id = $1
    `;
    const customerResult = await pool.query(customerQuery, [id]);
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    const customer = customerResult.rows[0];
    
    // Get contacts
    const contactsQuery = `
      SELECT * FROM customer_contacts 
      WHERE customer_id = $1 
      ORDER BY is_primary DESC, first_name ASC
    `;
    const contactsResult = await pool.query(contactsQuery, [id]);
    
    // Get addresses
    const addressesQuery = `
      SELECT * FROM customer_addresses 
      WHERE customer_id = $1 
      ORDER BY is_default DESC, address_type ASC
    `;
    const addressesResult = await pool.query(addressesQuery, [id]);
    
    // Get sales history summary (from existing data)
    const salesQuery = `
      SELECT 
        year,
        SUM(CASE WHEN values_type = 'Sales' THEN values ELSE 0 END) as total_sales,
        SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_volume
      FROM fp_data_excel
      WHERE UPPER(TRIM(customername)) = ANY(
        SELECT UPPER(TRIM(unnest(legacy_customer_names))) FROM customer_master WHERE customer_id = $1
      )
      AND type = 'Actual'
      GROUP BY year
      ORDER BY year DESC
      LIMIT 5
    `;
    const salesResult = await pool.query(salesQuery, [id]);
    
    res.json({
      success: true,
      data: {
        ...customer,
        contacts: contactsResult.rows,
        addresses: addressesResult.rows,
        sales_history: salesResult.rows
      }
    });
    
  } catch (error) {
    logger.error('Error fetching customer:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer' });
  }
});

/**
 * POST /api/crm/customers
 * Create new customer
 */
router.post('/', async (req, res) => {
  try {
    const {
      company_name,
      display_name,
      short_name,
      customer_type = 'Prospect',
      customer_category,
      industry,
      market_segment,
      country,
      region,
      territory,
      assigned_salesrep,
      credit_limit,
      payment_terms,
      currency = 'AED',
      primary_contact_name,
      primary_email,
      primary_phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      annual_revenue,
      employee_count,
      website,
      lead_source,
      tags
    } = req.body;
    
    if (!company_name) {
      return res.status(400).json({ success: false, error: 'Company name is required' });
    }
    
    // Generate customer code
    const codeResult = await pool.query('SELECT generate_customer_code() as code');
    const customer_code = codeResult.rows[0].code;
    
    const insertQuery = `
      INSERT INTO customer_master (
        customer_code, company_name, display_name, short_name,
        customer_type, customer_category, industry, market_segment,
        country, region, territory, assigned_salesrep,
        credit_limit, payment_terms, currency,
        primary_contact_name, primary_email, primary_phone,
        address_line1, address_line2, city, state, postal_code,
        annual_revenue, employee_count, website,
        lead_source, lead_date, tags,
        legacy_customer_names, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, CURRENT_DATE, $28,
        ARRAY[$2], $29
      )
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [
      customer_code,
      company_name,
      display_name || company_name,
      short_name,
      customer_type,
      customer_category,
      industry,
      market_segment,
      country,
      region,
      territory,
      assigned_salesrep,
      credit_limit || 0,
      payment_terms,
      currency,
      primary_contact_name,
      primary_email,
      primary_phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      annual_revenue,
      employee_count,
      website,
      lead_source,
      tags || [],
      req.user?.id
    ]);
    
    logger.info(`Customer created: ${customer_code}`, { 
      customer_id: result.rows[0].customer_id,
      created_by: req.user?.username 
    });
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Customer created successfully'
    });
    
  } catch (error) {
    logger.error('Error creating customer:', error);
    res.status(500).json({ success: false, error: 'Failed to create customer' });
  }
});

/**
 * PUT /api/crm/customers/:id
 * Update customer
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    
    // Remove non-updateable fields
    delete updateFields.customer_id;
    delete updateFields.customer_code;
    delete updateFields.created_at;
    delete updateFields.created_by;
    
    // Build dynamic update query
    const fields = Object.keys(updateFields);
    const values = Object.values(updateFields);
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    values.push(req.user?.id, id);
    
    const query = `
      UPDATE customer_master 
      SET ${setClause}, updated_by = $${values.length - 1}, updated_at = CURRENT_TIMESTAMP
      WHERE customer_id = $${values.length}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    logger.info(`Customer updated: ${result.rows[0].customer_code}`, { 
      customer_id: id,
      updated_by: req.user?.username,
      fields: fields
    });
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Customer updated successfully'
    });
    
  } catch (error) {
    logger.error('Error updating customer:', error);
    res.status(500).json({ success: false, error: 'Failed to update customer' });
  }
});

/**
 * POST /api/crm/customers/:id/contacts
 * Add contact to customer
 */
router.post('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      salutation,
      first_name,
      last_name,
      job_title,
      department,
      email,
      phone,
      mobile,
      whatsapp,
      is_primary = false,
      can_approve_samples = false,
      can_approve_quotes = false,
      can_place_orders = false,
      receives_invoices = false,
      notes
    } = req.body;
    
    if (!first_name) {
      return res.status(400).json({ success: false, error: 'First name is required' });
    }
    
    // If this is primary, unset other primaries
    if (is_primary) {
      await pool.query(
        'UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1',
        [id]
      );
    }
    
    const insertQuery = `
      INSERT INTO customer_contacts (
        customer_id, salutation, first_name, last_name,
        job_title, department, email, phone, mobile, whatsapp,
        is_primary, can_approve_samples, can_approve_quotes,
        can_place_orders, receives_invoices, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [
      id, salutation, first_name, last_name,
      job_title, department, email, phone, mobile, whatsapp,
      is_primary, can_approve_samples, can_approve_quotes,
      can_place_orders, receives_invoices, notes
    ]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Contact added successfully'
    });
    
  } catch (error) {
    logger.error('Error adding contact:', error);
    res.status(500).json({ success: false, error: 'Failed to add contact' });
  }
});

/**
 * GET /api/crm/customers/lookup/options
 * Get dropdown options for customer filters
 */
router.get('/lookup/options', async (req, res) => {
  try {
    const [types, industries, countries, salesreps] = await Promise.all([
      pool.query(`SELECT DISTINCT customer_type FROM customer_master WHERE customer_type IS NOT NULL ORDER BY customer_type`),
      pool.query(`SELECT DISTINCT industry FROM customer_master WHERE industry IS NOT NULL ORDER BY industry`),
      pool.query(`SELECT DISTINCT country FROM customer_master WHERE country IS NOT NULL ORDER BY country`),
      pool.query(`SELECT DISTINCT assigned_salesrep FROM customer_master WHERE assigned_salesrep IS NOT NULL ORDER BY assigned_salesrep`)
    ]);
    
    res.json({
      success: true,
      data: {
        customer_types: types.rows.map(r => r.customer_type),
        industries: industries.rows.map(r => r.industry),
        countries: countries.rows.map(r => r.country),
        salesreps: salesreps.rows.map(r => r.assigned_salesrep)
      }
    });
    
  } catch (error) {
    logger.error('Error fetching lookup options:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch options' });
  }
});

module.exports = router;
```

---

### React Component: `src/components/CRM/CustomerMaster/CustomerList.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Input, Select, Button, Space, Tag, Tooltip, Modal, message } from 'antd';
import { 
  SearchOutlined, 
  PlusOutlined, 
  EditOutlined, 
  EyeOutlined,
  UserOutlined,
  EnvironmentOutlined,
  MailOutlined,
  PhoneOutlined
} from '@ant-design/icons';
import axios from 'axios';
import CustomerForm from './CustomerForm';
import CustomerDetail from './CustomerDetail';
import './CustomerList.css';

const { Option } = Select;

const CustomerList = () => {
  // State
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0
  });
  
  // Filters
  const [filters, setFilters] = useState({
    search: '',
    customer_type: undefined,
    assigned_salesrep: undefined,
    country: undefined,
    is_active: 'true'
  });
  
  // Lookup options
  const [filterOptions, setFilterOptions] = useState({
    customer_types: [],
    countries: [],
    salesreps: [],
    industries: []
  });
  
  // Modal states
  const [formVisible, setFormVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  
  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page: pagination.current,
        limit: pagination.pageSize
      };
      
      const response = await axios.get('/api/crm/customers', { params });
      
      if (response.data.success) {
        setCustomers(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total
        }));
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);
  
  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const response = await axios.get('/api/crm/customers/lookup/options');
      if (response.data.success) {
        setFilterOptions(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };
  
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);
  
  useEffect(() => {
    fetchFilterOptions();
  }, []);
  
  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };
  
  // Handle table change (pagination, sorting)
  const handleTableChange = (newPagination, _, sorter) => {
    setPagination(prev => ({
      ...prev,
      current: newPagination.current,
      pageSize: newPagination.pageSize
    }));
  };
  
  // Handle create
  const handleCreate = () => {
    setSelectedCustomer(null);
    setFormMode('create');
    setFormVisible(true);
  };
  
  // Handle edit
  const handleEdit = (customer) => {
    setSelectedCustomer(customer);
    setFormMode('edit');
    setFormVisible(true);
  };
  
  // Handle view
  const handleView = (customer) => {
    setSelectedCustomer(customer);
    setDetailVisible(true);
  };
  
  // Handle form success
  const handleFormSuccess = () => {
    setFormVisible(false);
    fetchCustomers();
    message.success(formMode === 'create' ? 'Customer created successfully' : 'Customer updated successfully');
  };
  
  // Customer type tag color
  const getTypeColor = (type) => {
    const colors = {
      'Prospect': 'blue',
      'Active Customer': 'green',
      'Inactive': 'default',
      'Churned': 'red'
    };
    return colors[type] || 'default';
  };
  
  // Table columns
  const columns = [
    {
      title: 'Customer Code',
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 140,
      fixed: 'left',
      render: (code, record) => (
        <Button type="link" onClick={() => handleView(record)}>
          {code}
        </Button>
      )
    },
    {
      title: 'Company Name',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 250,
      ellipsis: true,
      render: (name, record) => (
        <div>
          <div className="customer-name">{name}</div>
          {record.industry && (
            <div className="customer-industry text-muted">{record.industry}</div>
          )}
        </div>
      )
    },
    {
      title: 'Type',
      dataIndex: 'customer_type',
      key: 'customer_type',
      width: 130,
      render: (type) => <Tag color={getTypeColor(type)}>{type}</Tag>
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 200,
      render: (_, record) => (
        <div className="contact-cell">
          {record.primary_contact_name && (
            <div><UserOutlined /> {record.primary_contact_name}</div>
          )}
          {record.primary_email && (
            <div className="text-muted">
              <MailOutlined /> {record.primary_email}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Location',
      key: 'location',
      width: 150,
      render: (_, record) => (
        <div>
          {record.city && <span>{record.city}, </span>}
          {record.country && <span>{record.country}</span>}
        </div>
      )
    },
    {
      title: 'Sales Rep',
      dataIndex: 'assigned_salesrep',
      key: 'assigned_salesrep',
      width: 150,
      ellipsis: true
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      key: 'tags',
      width: 150,
      render: (tags) => (
        <Space wrap size={[0, 4]}>
          {tags?.slice(0, 2).map(tag => (
            <Tag key={tag} size="small">{tag}</Tag>
          ))}
          {tags?.length > 2 && (
            <Tooltip title={tags.slice(2).join(', ')}>
              <Tag size="small">+{tags.length - 2}</Tag>
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View">
            <Button icon={<EyeOutlined />} size="small" onClick={() => handleView(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          </Tooltip>
        </Space>
      )
    }
  ];
  
  return (
    <div className="customer-list-container">
      {/* Header */}
      <div className="page-header">
        <h2>Customer Master</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          New Customer
        </Button>
      </div>
      
      {/* Filters */}
      <div className="filters-bar">
        <Space wrap>
          <Input.Search
            placeholder="Search customers..."
            allowClear
            style={{ width: 250 }}
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            onSearch={() => fetchCustomers()}
          />
          
          <Select
            placeholder="Customer Type"
            allowClear
            style={{ width: 150 }}
            value={filters.customer_type}
            onChange={(value) => handleFilterChange('customer_type', value)}
          >
            {filterOptions.customer_types.map(type => (
              <Option key={type} value={type}>{type}</Option>
            ))}
          </Select>
          
          <Select
            placeholder="Sales Rep"
            allowClear
            showSearch
            style={{ width: 180 }}
            value={filters.assigned_salesrep}
            onChange={(value) => handleFilterChange('assigned_salesrep', value)}
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
          >
            {filterOptions.salesreps.map(rep => (
              <Option key={rep} value={rep}>{rep}</Option>
            ))}
          </Select>
          
          <Select
            placeholder="Country"
            allowClear
            showSearch
            style={{ width: 150 }}
            value={filters.country}
            onChange={(value) => handleFilterChange('country', value)}
          >
            {filterOptions.countries.map(country => (
              <Option key={country} value={country}>{country}</Option>
            ))}
          </Select>
          
          <Select
            placeholder="Status"
            style={{ width: 120 }}
            value={filters.is_active}
            onChange={(value) => handleFilterChange('is_active', value)}
          >
            <Option value="true">Active</Option>
            <Option value="false">Inactive</Option>
            <Option value="all">All</Option>
          </Select>
        </Space>
      </div>
      
      {/* Table */}
      <Table
        columns={columns}
        dataSource={customers}
        rowKey="customer_id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} customers`,
          pageSizeOptions: ['25', '50', '100']
        }}
        onChange={handleTableChange}
        scroll={{ x: 1300 }}
        size="middle"
      />
      
      {/* Create/Edit Modal */}
      <Modal
        title={formMode === 'create' ? 'New Customer' : 'Edit Customer'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <CustomerForm
          customer={selectedCustomer}
          mode={formMode}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormVisible(false)}
        />
      </Modal>
      
      {/* Detail Drawer */}
      <CustomerDetail
        customer={selectedCustomer}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onEdit={() => {
          setDetailVisible(false);
          handleEdit(selectedCustomer);
        }}
      />
    </div>
  );
};

export default CustomerList;
```

---

## MODULE 2: LEAD MANAGEMENT

### Database: `server/migrations/101_create_crm_leads.sql`

```sql
-- ============================================================================
-- CRM LEADS MODULE
-- ============================================================================

-- Lead number sequence
CREATE SEQUENCE IF NOT EXISTS lead_number_seq START WITH 1;

-- Generate lead number
CREATE OR REPLACE FUNCTION generate_lead_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  new_number VARCHAR(50);
  year_part VARCHAR(4);
  seq_num INT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := NEXTVAL('lead_number_seq');
  new_number := 'LEAD-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Leads table
CREATE TABLE IF NOT EXISTS crm_leads (
  lead_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_number VARCHAR(50) UNIQUE NOT NULL DEFAULT generate_lead_number(),
  
  -- Source
  lead_source VARCHAR(100),
  source_details TEXT,
  campaign_id UUID,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  
  -- Company
  company_name VARCHAR(255),
  industry VARCHAR(100),
  market_segment VARCHAR(100),
  estimated_annual_revenue DECIMAL(18,2),
  employee_count VARCHAR(50),
  website VARCHAR(255),
  
  -- Contact
  contact_name VARCHAR(255),
  contact_title VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_mobile VARCHAR(50),
  
  -- Location
  country VARCHAR(100),
  city VARCHAR(100),
  territory VARCHAR(100),
  
  -- Qualification
  qualification_status VARCHAR(50) DEFAULT 'Unqualified',
  qualified_by UUID,
  qualified_date DATE,
  disqualification_reason TEXT,
  
  -- Assignment
  assigned_to VARCHAR(255),
  assigned_to_id UUID,
  assigned_date DATE,
  
  -- Scoring
  lead_score INT DEFAULT 0,
  score_factors JSONB,
  
  -- Requirements (Flex-Pack Specific)
  interested_products TEXT[],
  product_groups TEXT[],
  estimated_volume VARCHAR(100),
  estimated_value DECIMAL(18,2),
  requirements TEXT,
  
  -- Pipeline
  stage VARCHAR(50) DEFAULT 'New',
  probability INT DEFAULT 10,
  expected_close_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Open',
  lost_reason VARCHAR(255),
  converted_to_customer_id UUID,
  converted_to_opportunity_id UUID,
  conversion_date DATE,
  
  -- Description
  description TEXT,
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lead stages configuration
CREATE TABLE IF NOT EXISTS crm_lead_stages (
  stage_id SERIAL PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL,
  stage_order INT NOT NULL,
  probability INT DEFAULT 10,
  is_converted BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  color VARCHAR(20),
  description TEXT
);

-- Insert default lead stages
INSERT INTO crm_lead_stages (stage_name, stage_order, probability, color) VALUES
('New', 1, 10, '#9CA3AF'),
('Contacted', 2, 20, '#3B82F6'),
('Meeting Scheduled', 3, 30, '#6366F1'),
('Requirement Gathered', 4, 40, '#8B5CF6'),
('Sample Requested', 5, 50, '#F59E0B'),
('Proposal Sent', 6, 60, '#F97316'),
('Negotiation', 7, 75, '#22C55E'),
('Converted', 8, 100, '#16A34A'),
('Lost', 9, 0, '#EF4444')
ON CONFLICT DO NOTHING;

-- Lead activities
CREATE TABLE IF NOT EXISTS crm_lead_activities (
  activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES crm_leads(lead_id) ON DELETE CASCADE,
  
  activity_type VARCHAR(50) NOT NULL,
  activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  subject VARCHAR(255),
  description TEXT,
  outcome VARCHAR(100),
  
  next_action TEXT,
  next_action_date DATE,
  
  performed_by UUID,
  performed_by_name VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_number ON crm_leads(lead_number);
CREATE INDEX IF NOT EXISTS idx_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON crm_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_source ON crm_leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON crm_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON crm_lead_activities(lead_id);

-- Triggers
DROP TRIGGER IF EXISTS crm_leads_updated_at ON crm_leads;
CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## MODULE 3: OPPORTUNITY PIPELINE

### Database: `server/migrations/102_create_crm_opportunities.sql`

```sql
-- ============================================================================
-- CRM OPPORTUNITIES MODULE
-- ============================================================================

-- Opportunity number sequence
CREATE SEQUENCE IF NOT EXISTS opportunity_number_seq START WITH 1;

-- Generate opportunity number
CREATE OR REPLACE FUNCTION generate_opportunity_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  new_number VARCHAR(50);
  year_part VARCHAR(4);
  seq_num INT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := NEXTVAL('opportunity_number_seq');
  new_number := 'OPP-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Opportunities table
CREATE TABLE IF NOT EXISTS crm_opportunities (
  opportunity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_number VARCHAR(50) UNIQUE NOT NULL DEFAULT generate_opportunity_number(),
  
  -- Source
  lead_id UUID REFERENCES crm_leads(lead_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Basic Info
  opportunity_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Classification
  opportunity_type VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'Medium',
  
  -- Pipeline
  stage VARCHAR(50) DEFAULT 'Qualification',
  probability INT,
  
  -- Value
  estimated_revenue DECIMAL(18,2),
  estimated_volume DECIMAL(18,2),
  estimated_orders_per_year INT,
  currency VARCHAR(10) DEFAULT 'AED',
  
  -- Timeline
  expected_close_date DATE,
  actual_close_date DATE,
  
  -- Products
  product_groups TEXT[],
  products JSONB,
  
  -- Assignment
  assigned_to VARCHAR(255),
  assigned_to_id UUID,
  sales_team VARCHAR(100),
  
  -- Competition
  competitors TEXT[],
  competitive_status VARCHAR(100),
  
  -- Result
  status VARCHAR(50) DEFAULT 'Open',
  won_reason TEXT,
  lost_reason VARCHAR(255),
  lost_reason_details TEXT,
  
  -- Related Records
  sample_ids UUID[],
  quotation_ids UUID[],
  order_ids UUID[],
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Opportunity stages
CREATE TABLE IF NOT EXISTS crm_opportunity_stages (
  stage_id SERIAL PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL UNIQUE,
  stage_order INT NOT NULL,
  probability INT DEFAULT 10,
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  color VARCHAR(20),
  description TEXT
);

-- Insert stages
INSERT INTO crm_opportunity_stages (stage_name, stage_order, probability, is_won, is_lost, color) VALUES
('Qualification', 1, 10, false, false, '#9CA3AF'),
('Sample Request', 2, 20, false, false, '#3B82F6'),
('Sample Production', 3, 35, false, false, '#6366F1'),
('Sample Approval', 4, 50, false, false, '#8B5CF6'),
('Quotation', 5, 60, false, false, '#F59E0B'),
('Negotiation', 6, 75, false, false, '#F97316'),
('Proposal', 7, 85, false, false, '#22C55E'),
('Closed Won', 8, 100, true, false, '#16A34A'),
('Closed Lost', 9, 0, false, true, '#EF4444')
ON CONFLICT (stage_name) DO NOTHING;

-- Lost reasons
CREATE TABLE IF NOT EXISTS crm_lost_reasons (
  reason_id SERIAL PRIMARY KEY,
  reason_name VARCHAR(255) NOT NULL,
  reason_category VARCHAR(100),
  is_active BOOLEAN DEFAULT true
);

INSERT INTO crm_lost_reasons (reason_name, reason_category) VALUES
('Price too high', 'Pricing'),
('Competitor won', 'Competition'),
('Technical requirements not met', 'Technical'),
('Lead time too long', 'Delivery'),
('No response from customer', 'Customer'),
('Project cancelled', 'Customer'),
('Budget constraints', 'Financial'),
('Quality concerns', 'Quality'),
('Other', 'Other')
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_number ON crm_opportunities(opportunity_number);
CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON crm_opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead ON crm_opportunities(lead_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON crm_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON crm_opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_close_date ON crm_opportunities(expected_close_date);

-- Triggers
DROP TRIGGER IF EXISTS crm_opportunities_updated_at ON crm_opportunities;
CREATE TRIGGER crm_opportunities_updated_at
  BEFORE UPDATE ON crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 📋 AGENT PROMPTS FOR IMPLEMENTATION

### Prompt 1: Customer Master Component

```
Create a CustomerForm.jsx React component for the Flexible Packaging CRM.

Requirements:
1. Use Ant Design (antd) components: Form, Input, Select, InputNumber, Button, Row, Col, Tabs, Divider
2. Two-column layout for form fields
3. Tabs: General Info, Contact Details, Address, Business Info
4. Form fields as per customer_master table (see schema above)
5. API integration with axios to POST/PUT to /api/crm/customers
6. Validation: company_name required, email format validation
7. Support both create and edit modes (check props.mode)
8. Include sales rep dropdown (fetch from /api/salesReps or existing source)
9. Country dropdown with search
10. Tags input with autocomplete
11. Loading states and error handling

Tech stack: React 18, Ant Design 5, Axios
File location: src/components/CRM/CustomerMaster/CustomerForm.jsx
```

### Prompt 2: Pipeline Kanban Board

```
Create a PipelineBoard.jsx React component for the Flexible Packaging CRM opportunities pipeline.

Requirements:
1. Kanban-style board like Odoo's opportunity pipeline
2. Columns for each stage (Qualification → Sample Request → Sample Production → Sample Approval → Quotation → Negotiation → Proposal → Closed Won → Closed Lost)
3. Drag and drop between columns (use react-beautiful-dnd)
4. Opportunity cards showing: opportunity_name, customer_name, estimated_revenue, expected_close_date, assigned_to
5. Column headers show count and total value
6. Color-coded stage columns
7. Quick actions on cards: view, edit, mark lost
8. Filter bar: search, assigned_to, date range
9. API: GET /api/crm/opportunities (grouped by stage), PUT /api/crm/opportunities/:id to update stage
10. Mobile responsive

Tech stack: React 18, Ant Design 5, react-beautiful-dnd, Axios
File location: src/components/CRM/OpportunityManagement/PipelineBoard.jsx
```

### Prompt 3: Sample Structure Builder

```
Create a StructureBuilder.jsx React component for defining multi-layer flexible packaging structures.

Requirements:
1. Visual layer builder - users can add/remove layers
2. Each layer has: layer number, material type (dropdown: PET, BOPP, PE, AL, PA, etc.), thickness (microns), function (Print, Barrier, Sealant, Tie)
3. Drag to reorder layers
4. Auto-calculate: total thickness, estimated GSM, structure code (e.g., "PET12/AL7/PE60")
5. Common structure templates dropdown (3-layer pouch, laminate roll stock, etc.)
6. Visual preview showing layer colors
7. Validation: at least 2 layers, thickness > 0
8. Export structure as JSON for sample/TDS
9. Material database lookup for density/cost

Props: 
- value: initial structure object
- onChange: callback when structure changes
- readOnly: boolean for view mode

Tech stack: React 18, Ant Design 5
File location: src/components/CRM/SampleManagement/StructureBuilder.jsx
```

---

## 🔗 API ROUTE INDEX

Add to `server/routes/crm/index.js`:

```javascript
const express = require('express');
const router = express.Router();

const customersRoutes = require('./customers');
const leadsRoutes = require('./leads');
const opportunitiesRoutes = require('./opportunities');
const samplesRoutes = require('./samples');
const quotationsRoutes = require('./quotations');

router.use('/customers', customersRoutes);
router.use('/leads', leadsRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/samples', samplesRoutes);
router.use('/quotations', quotationsRoutes);

module.exports = router;
```

Add to `server/index.js`:

```javascript
// CRM Module Routes
const crmRoutes = require('./routes/crm');
app.use('/api/crm', crmRoutes);
```

---

*This guide provides detailed implementation templates. Use with the Master Plan for complete context.*
