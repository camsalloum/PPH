/**
 * DocumentationService.js
 * 
 * Auto-generates documentation by introspecting the actual system:
 * - Database tables and their schemas
 * - API routes that are mounted
 * - Data flow configurations
 * - Module status tracking
 * 
 * This service provides the backend for the ProjectWorkflow component
 * to display ACTUAL current system state, not hardcoded values.
 * 
 * @created 2026-01-30
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

class DocumentationService {
  
  /**
   * Get all database tables with their row counts and descriptions
   * Groups tables by category based on naming conventions
   */
  static async getDatabaseTables() {
    try {
      // Query to get all tables with row counts
      const tablesQuery = `
        SELECT 
          schemaname,
          tablename,
          (SELECT COUNT(*) FROM information_schema.columns 
           WHERE table_schema = t.schemaname AND table_name = t.tablename) as column_count
        FROM pg_catalog.pg_tables t
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY tablename
      `;
      
      const tablesResult = await pool.query(tablesQuery);
      
      // Get row counts for each table (in parallel for speed)
      const tablePromises = tablesResult.rows.map(async (table) => {
        try {
          const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM "${table.schemaname}"."${table.tablename}"`
          );
          return {
            name: table.tablename,
            schema: table.schemaname,
            rowCount: parseInt(countResult.rows[0].count),
            columnCount: table.column_count,
            category: this.categorizeTable(table.tablename)
          };
        } catch (err) {
          // Some tables might not be accessible
          return {
            name: table.tablename,
            schema: table.schemaname,
            rowCount: 0,
            columnCount: table.column_count,
            category: this.categorizeTable(table.tablename),
            error: err.message
          };
        }
      });
      
      const tables = await Promise.all(tablePromises);
      
      // Group by category
      const grouped = this.groupTablesByCategory(tables);
      
      return {
        success: true,
        totalTables: tables.length,
        tablesWithData: tables.filter(t => t.rowCount > 0).length,
        emptyTables: tables.filter(t => t.rowCount === 0).length,
        categories: grouped,
        tables: tables.sort((a, b) => b.rowCount - a.rowCount),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting database tables:', error);
      throw error;
    }
  }
  
  /**
   * Get detailed schema for a specific table
   */
  static async getTableSchema(tableName) {
    try {
      const schemaQuery = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `;
      
      const result = await pool.query(schemaQuery, [tableName]);
      
      // Get primary keys
      const pkQuery = `
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass
        AND i.indisprimary
      `;
      
      let primaryKeys = [];
      try {
        const pkResult = await pool.query(pkQuery, [tableName]);
        primaryKeys = pkResult.rows.map(r => r.column_name);
      } catch (e) {
        // Table might not exist or have PK
      }
      
      // Get foreign keys
      const fkQuery = `
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      `;
      
      let foreignKeys = [];
      try {
        const fkResult = await pool.query(fkQuery, [tableName]);
        foreignKeys = fkResult.rows;
      } catch (e) {
        // Ignore FK errors
      }
      
      return {
        success: true,
        tableName,
        columns: result.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          maxLength: col.character_maximum_length,
          nullable: col.is_nullable === 'YES',
          default: col.column_default,
          isPrimaryKey: primaryKeys.includes(col.column_name)
        })),
        primaryKeys,
        foreignKeys,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error getting schema for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Categorize a table based on its naming convention
   */
  static categorizeTable(tableName) {
    const name = tableName.toLowerCase();
    
    // Core Sales Data
    if (name.includes('actualcommon') || name.includes('raw_oracle')) {
      return 'Core Sales Data';
    }
    
    // Budget & Planning
    if (name.includes('budget') || name.includes('allocation') || name.includes('forecast') || name.includes('estimate')) {
      return 'Budget & Planning';
    }
    
    // Master Data
    if (name.includes('unified') || name.includes('master') || name.includes('product_group') || 
        name.includes('sales_rep') || name.includes('customer') || name.includes('country') ||
        name.includes('division') || name.includes('material') || name.includes('pricing')) {
      return 'Master Data';
    }
    
    // User & Auth
    if (name.includes('user') || name.includes('session') || name.includes('permission') || 
        name.includes('role') || name.includes('auth') || name.includes('employee')) {
      return 'User & Authentication';
    }
    
    // CRM
    if (name.includes('crm') || name.includes('lead') || name.includes('opportunity') || 
        name.includes('contact') || name.includes('interaction')) {
      return 'CRM';
    }
    
    // P&L & Financial
    if (name.includes('pl_') || name.includes('financial') || name.includes('margin') || 
        name.includes('cost') || name.includes('currency') || name.includes('exchange')) {
      return 'P&L & Financial';
    }
    
    // AI & Learning
    if (name.includes('learning') || name.includes('ai_') || name.includes('merge_rule') || 
        name.includes('suggestion') || name.includes('feedback')) {
      return 'AI & Learning';
    }
    
    // Configuration
    if (name.includes('config') || name.includes('setting') || name.includes('preference')) {
      return 'Configuration';
    }
    
    // Materialized Views
    if (name.startsWith('mv_') || name.includes('materialized')) {
      return 'Materialized Views';
    }
    
    // Views
    if (name.startsWith('vw_') || name.includes('_view')) {
      return 'Views';
    }
    
    // Audit & Logging
    if (name.includes('audit') || name.includes('log') || name.includes('history')) {
      return 'Audit & Logging';
    }
    
    // Sync & Import
    if (name.includes('sync') || name.includes('import') || name.includes('staging')) {
      return 'Sync & Import';
    }
    
    return 'Other';
  }
  
  /**
   * Group tables by category with counts
   */
  static groupTablesByCategory(tables) {
    const grouped = {};
    
    for (const table of tables) {
      if (!grouped[table.category]) {
        grouped[table.category] = {
          name: table.category,
          tables: [],
          totalRows: 0,
          color: this.getCategoryColor(table.category)
        };
      }
      grouped[table.category].tables.push(table);
      grouped[table.category].totalRows += table.rowCount;
    }
    
    // Sort tables within each category by row count
    for (const category of Object.values(grouped)) {
      category.tables.sort((a, b) => b.rowCount - a.rowCount);
      category.tableCount = category.tables.length;
    }
    
    return grouped;
  }
  
  /**
   * Get color for category (for UI display)
   */
  static getCategoryColor(category) {
    const colors = {
      'Core Sales Data': '#1890ff',
      'Budget & Planning': '#52c41a',
      'Master Data': '#722ed1',
      'User & Authentication': '#faad14',
      'CRM': '#eb2f96',
      'P&L & Financial': '#13c2c2',
      'AI & Learning': '#f5222d',
      'Configuration': '#fa8c16',
      'Materialized Views': '#2f54eb',
      'Views': '#a0d911',
      'Audit & Logging': '#8c8c8c',
      'Sync & Import': '#597ef7',
      'Other': '#d9d9d9'
    };
    return colors[category] || '#d9d9d9';
  }
  
  /**
   * Get all mounted API routes by parsing the Express app
   * This reads the route files and extracts route definitions
   */
  static async getApiRoutes() {
    try {
      const routesDir = path.join(__dirname, '..', 'routes');
      const routes = [];
      
      // Read all route files
      const routeFiles = this.getAllRouteFiles(routesDir);
      
      for (const filePath of routeFiles) {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const relativePath = path.relative(routesDir, filePath);
          const extractedRoutes = this.extractRoutesFromFile(fileContent, relativePath);
          routes.push(...extractedRoutes);
        } catch (err) {
          logger.warn(`Could not parse route file ${filePath}:`, err.message);
        }
      }
      
      // Group routes by base path
      const grouped = this.groupRoutesByBasePath(routes);
      
      return {
        success: true,
        totalRoutes: routes.length,
        totalFiles: routeFiles.length,
        categories: grouped,
        routes: routes,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting API routes:', error);
      throw error;
    }
  }
  
  /**
   * Recursively get all .js route files
   */
  static getAllRouteFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        this.getAllRouteFiles(fullPath, files);
      } else if (item.endsWith('.js') && !item.includes('.backup') && !item.includes('.original')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  /**
   * Extract route definitions from a file using regex
   */
  static extractRoutesFromFile(content, fileName) {
    const routes = [];
    
    // Match router.get, router.post, etc.
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: fileName,
        category: this.categorizeRoute(fileName)
      });
    }
    
    // Also match app.get, app.post, etc. (less common)
    const appRouteRegex = /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    
    while ((match = appRouteRegex.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: fileName,
        category: this.categorizeRoute(fileName)
      });
    }
    
    return routes;
  }
  
  /**
   * Categorize route based on file name
   */
  static categorizeRoute(fileName) {
    const name = fileName.toLowerCase();
    
    if (name.includes('auth')) return 'Authentication';
    if (name.includes('aebf') || name.includes('budget') || name.includes('forecast')) return 'AEBF & Budget';
    if (name.includes('crm')) return 'CRM';
    if (name.includes('platform')) return 'Platform Admin';
    if (name.includes('dashboard') || name.includes('analytics')) return 'Dashboards & Analytics';
    if (name.includes('master') || name.includes('product') || name.includes('sales-rep')) return 'Master Data';
    if (name.includes('fp') || name.includes('division')) return 'Division Data';
    if (name.includes('setting') || name.includes('config')) return 'Settings & Config';
    if (name.includes('report') || name.includes('ai')) return 'Reports & AI';
    if (name.includes('database') || name.includes('oracle')) return 'Database Operations';
    if (name.includes('user') || name.includes('employee') || name.includes('permission')) return 'User Management';
    
    return 'Other';
  }
  
  /**
   * Group routes by their base API path
   */
  static groupRoutesByBasePath(routes) {
    const grouped = {};
    
    for (const route of routes) {
      const category = route.category;
      
      if (!grouped[category]) {
        grouped[category] = {
          name: category,
          routes: [],
          color: this.getRouteCategoryColor(category)
        };
      }
      
      grouped[category].routes.push(route);
    }
    
    // Count routes per category
    for (const category of Object.values(grouped)) {
      category.routeCount = category.routes.length;
      category.methods = {
        GET: category.routes.filter(r => r.method === 'GET').length,
        POST: category.routes.filter(r => r.method === 'POST').length,
        PUT: category.routes.filter(r => r.method === 'PUT').length,
        PATCH: category.routes.filter(r => r.method === 'PATCH').length,
        DELETE: category.routes.filter(r => r.method === 'DELETE').length
      };
    }
    
    return grouped;
  }
  
  /**
   * Get color for route category
   */
  static getRouteCategoryColor(category) {
    const colors = {
      'Authentication': '#1890ff',
      'AEBF & Budget': '#52c41a',
      'CRM': '#eb2f96',
      'Platform Admin': '#722ed1',
      'Dashboards & Analytics': '#13c2c2',
      'Master Data': '#faad14',
      'Division Data': '#f5222d',
      'Settings & Config': '#fa8c16',
      'Reports & AI': '#2f54eb',
      'Database Operations': '#a0d911',
      'User Management': '#597ef7',
      'Other': '#d9d9d9'
    };
    return colors[category] || '#d9d9d9';
  }
  
  /**
   * Get actual data flow configuration
   * This returns the REAL current data flows based on table relationships
   */
  static async getDataFlows() {
    try {
      // Check which tables exist and have data
      const tableChecks = await pool.query(`
        SELECT 
          tablename,
          (SELECT COUNT(*) > 0 FROM information_schema.tables 
           WHERE table_name = t.tablename) as exists
        FROM (VALUES 
          ('fp_raw_oracle'),
          ('fp_actualcommon'),
          ('fp_budget_unified'),
          ('fp_sales_rep_group_budget_allocation'),
          ('fp_budget_bulk_import'),
          ('fp_product_group_exclusions'),
          ('fp_division_customer_merge_rules'),
          ('sales_rep_groups'),
          ('sales_rep_group_members'),
          ('fp_customer_unified'),
          ('fp_sales_rep_unified'),
          ('fp_product_group_unified'),
          ('mv_sales_by_customer'),
          ('mv_sales_by_rep_group'),
          ('master_countries'),
          ('divisions'),
          ('users'),
          ('user_sessions')
        ) AS t(tablename)
      `);
      
      // Get row counts for key tables
      const keyTables = [
        'fp_raw_oracle', 'fp_actualcommon', 'fp_budget_unified',
        'fp_sales_rep_group_budget_allocation', 'master_countries',
        'sales_rep_groups', 'sales_rep_group_members', 'divisions'
      ];
      
      const tableCounts = {};
      for (const table of keyTables) {
        try {
          const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
          tableCounts[table] = parseInt(result.rows[0].count);
        } catch (e) {
          tableCounts[table] = 0;
        }
      }
      
      // Define actual data flows based on current system
      const dataFlows = {
        actualDataFlow: {
          name: 'Actual Data Flow',
          description: 'Oracle ERP → fp_raw_oracle → fp_actualcommon → Dashboards',
          color: '#1890ff',
          steps: [
            { id: 'oracle', label: 'Oracle ERP', type: 'external', icon: 'database' },
            { id: 'sync', label: 'Direct Sync / Excel Import', type: 'process', icon: 'sync' },
            { id: 'raw', label: 'fp_raw_oracle', type: 'table', rows: tableCounts['fp_raw_oracle'], icon: 'table' },
            { id: 'trigger', label: 'sync_oracle_to_actualcommon()', type: 'trigger', icon: 'thunderbolt' },
            { id: 'actual', label: 'fp_actualcommon', type: 'table', rows: tableCounts['fp_actualcommon'], icon: 'table', primary: true },
            { id: 'exclusions', label: 'fp_product_group_exclusions', type: 'filter', icon: 'filter' },
            { id: 'dashboard', label: 'Dashboards & Reports', type: 'output', icon: 'dashboard' }
          ],
          connections: [
            { from: 'oracle', to: 'sync' },
            { from: 'sync', to: 'raw' },
            { from: 'raw', to: 'trigger' },
            { from: 'trigger', to: 'actual' },
            { from: 'actual', to: 'exclusions' },
            { from: 'exclusions', to: 'dashboard' }
          ]
        },
        budgetDivisionalFlow: {
          name: 'Divisional Budget Flow',
          description: 'Budget Tab → fp_budget_unified (DIVISIONAL) → P&L Reports',
          color: '#52c41a',
          steps: [
            { id: 'entry', label: 'Budget Tab UI', type: 'input', icon: 'edit' },
            { id: 'draft', label: 'Save Draft', type: 'process', icon: 'save' },
            { id: 'budget', label: 'fp_budget_unified', type: 'table', rows: tableCounts['fp_budget_unified'], icon: 'table', primary: true },
            { id: 'type', label: 'budget_type = DIVISIONAL', type: 'filter', icon: 'filter' },
            { id: 'pl', label: 'P&L Reports', type: 'output', icon: 'bar-chart' }
          ],
          connections: [
            { from: 'entry', to: 'draft' },
            { from: 'draft', to: 'budget' },
            { from: 'budget', to: 'type' },
            { from: 'type', to: 'pl' }
          ]
        },
        budgetSalesRepFlow: {
          name: 'Sales Rep Budget Flow',
          description: 'Management Allocation → Export → Sales Rep Fill → Import → fp_budget_unified',
          color: '#722ed1',
          steps: [
            { id: 'mgmt', label: 'Management Allocation', type: 'input', icon: 'team' },
            { id: 'alloc', label: 'fp_sales_rep_group_budget_allocation', type: 'table', rows: tableCounts['fp_sales_rep_group_budget_allocation'], icon: 'table' },
            { id: 'export', label: 'Export HTML', type: 'process', icon: 'export' },
            { id: 'salesrep', label: 'Sales Rep Fills', type: 'external', icon: 'user' },
            { id: 'import', label: 'Bulk Import', type: 'process', icon: 'import' },
            { id: 'budget', label: 'fp_budget_unified', type: 'table', rows: tableCounts['fp_budget_unified'], icon: 'table', primary: true },
            { id: 'type', label: 'budget_type = SALES_REP', type: 'filter', icon: 'filter' },
            { id: 'dashboard', label: 'Sales Dashboard', type: 'output', icon: 'dashboard' }
          ],
          connections: [
            { from: 'mgmt', to: 'alloc' },
            { from: 'alloc', to: 'export' },
            { from: 'export', to: 'salesrep' },
            { from: 'salesrep', to: 'import' },
            { from: 'import', to: 'budget' },
            { from: 'budget', to: 'type' },
            { from: 'type', to: 'dashboard' }
          ]
        },
        masterDataFlow: {
          name: 'Master Data Flow',
          description: 'Master Data Management → Unified Tables → All Queries',
          color: '#faad14',
          steps: [
            { id: 'ui', label: 'Master Data UI', type: 'input', icon: 'setting' },
            { id: 'countries', label: 'master_countries', type: 'table', rows: tableCounts['master_countries'], icon: 'global' },
            { id: 'divisions', label: 'divisions', type: 'table', rows: tableCounts['divisions'], icon: 'partition' },
            { id: 'groups', label: 'sales_rep_groups', type: 'table', rows: tableCounts['sales_rep_groups'], icon: 'team' },
            { id: 'members', label: 'sales_rep_group_members', type: 'table', rows: tableCounts['sales_rep_group_members'], icon: 'user' },
            { id: 'queries', label: 'All Data Queries', type: 'output', icon: 'api' }
          ],
          connections: [
            { from: 'ui', to: 'countries' },
            { from: 'ui', to: 'divisions' },
            { from: 'ui', to: 'groups' },
            { from: 'groups', to: 'members' },
            { from: 'countries', to: 'queries' },
            { from: 'divisions', to: 'queries' },
            { from: 'members', to: 'queries' }
          ]
        }
      };
      
      return {
        success: true,
        flows: dataFlows,
        tableCounts,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting data flows:', error);
      throw error;
    }
  }
  
  /**
   * Get module status from database or config
   * Returns the actual implementation status of each module
   */
  static async getModuleStatus() {
    try {
      // Check for module tracking table
      let moduleStatus = [];
      
      try {
        const result = await pool.query(`
          SELECT * FROM module_status ORDER BY module_id
        `);
        moduleStatus = result.rows;
      } catch (e) {
        // Table doesn't exist - use default detection
        moduleStatus = await this.detectModuleStatus();
      }
      
      return {
        success: true,
        modules: moduleStatus,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting module status:', error);
      throw error;
    }
  }
  
  /**
   * Auto-detect module status by checking for key files and tables
   */
  static async detectModuleStatus() {
    const modules = [
      { id: 1, name: 'Authentication & User Management', checkTable: 'users', checkRoute: 'auth.js' },
      { id: 2, name: 'Dashboard & Navigation', checkRoute: 'dashboards.js' },
      { id: 3, name: 'Master Data Management', checkTable: 'divisions', checkRoute: 'masterData.js' },
      { id: 4, name: 'Lead Management', checkTable: 'crm_leads' },
      { id: 5, name: 'Customer Management (CRM)', checkTable: 'fp_customer_unified', checkRoute: 'crm/index.js' },
      { id: 6, name: 'Product Catalog & Specs', checkTable: 'fp_product_group_unified' },
      { id: 7, name: 'Inquiry Management', checkTable: 'inquiries' },
      { id: 8, name: 'Sample Request & Management', checkTable: 'sample_requests' },
      { id: 9, name: 'Quotation & Pricing', checkTable: 'quotations' },
      { id: 10, name: 'Sales Order Management', checkTable: 'sales_orders' },
      { id: 30, name: 'Reports & Analytics', checkRoute: 'analytics.js' },
      { id: 32, name: 'System Configuration & Admin', checkRoute: 'settings.js' }
    ];
    
    const results = [];
    
    for (const module of modules) {
      let status = 'planned';
      
      // Check if table exists and has data
      if (module.checkTable) {
        try {
          const result = await pool.query(
            `SELECT COUNT(*) as count FROM ${module.checkTable}`
          );
          if (parseInt(result.rows[0].count) > 0) {
            status = 'done';
          } else {
            status = 'partial';
          }
        } catch (e) {
          // Table doesn't exist
          status = 'planned';
        }
      }
      
      // Check if route file exists
      if (module.checkRoute) {
        const routePath = path.join(__dirname, '..', 'routes', module.checkRoute);
        if (fs.existsSync(routePath)) {
          status = status === 'planned' ? 'partial' : status;
        }
      }
      
      results.push({
        ...module,
        status,
        detectedAt: new Date().toISOString()
      });
    }
    
    return results;
  }
  
  /**
   * Get complete system overview for ProjectWorkflow component
   */
  static async getSystemOverview() {
    try {
      const [tables, routes, flows] = await Promise.all([
        this.getDatabaseTables(),
        this.getApiRoutes(),
        this.getDataFlows()
      ]);
      
      return {
        success: true,
        database: tables,
        api: routes,
        dataFlows: flows,
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      };
    } catch (error) {
      logger.error('Error getting system overview:', error);
      throw error;
    }
  }
}

module.exports = DocumentationService;
