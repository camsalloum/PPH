/**
 * @deprecated This file is deprecated. Use DynamicDivisionConfig.js instead.
 * 
 * Divisions are now managed dynamically via Company Settings page
 * and stored in company_settings table.
 * 
 * This file exists only for backwards compatibility.
 * All new code should use:
 *   const { getActiveDivisions, validateDivision } = require('../database/DynamicDivisionConfig');
 */

const logger = require('../utils/logger');

// DEPRECATED: Hardcoded config - no longer used
// Divisions now come from company_settings table
const divisionDatabaseConfig = {
  FP: {
    database: 'fp_database',
    table: 'fp_actualcommon',  // MIGRATED: was fp_data_excel
    connection: 'fp_pool',
    status: 'active'
  }
  // HC removed - was a test division that no longer exists
  // New divisions are added via Company Settings page
};

// Helper function to get database configuration for a division
const getDivisionConfig = (division) => {
  const config = divisionDatabaseConfig[division];
  if (!config) {
    throw new Error(`No database configuration found for division: ${division}`);
  }
  return config;
};

// Helper function to get table name for a division
const getTableName = (division) => {
  const config = getDivisionConfig(division);
  return config.table;
};

// Helper function to get database name for a division
const getDatabaseName = (division) => {
  const config = getDivisionConfig(division);
  return config.database;
};

// Helper function to check if division is active
const isDivisionActive = (division) => {
  const config = getDivisionConfig(division);
  return config.status === 'active';
};

// Helper function to get all active divisions
const getActiveDivisions = () => {
  return Object.keys(divisionDatabaseConfig).filter(division => 
    divisionDatabaseConfig[division].status === 'active'
  );
};

// Helper function to get all planned divisions
const getPlannedDivisions = () => {
  return Object.keys(divisionDatabaseConfig).filter(division => 
    divisionDatabaseConfig[division].status === 'planned'
  );
};

// Helper function to get division status
const getDivisionStatus = (division) => {
  const config = getDivisionConfig(division);
  return {
    division,
    status: config.status,
    database: config.database,
    table: config.table,
    message: config.status === 'active' 
      ? `Live data from ${config.database} PostgreSQL database`
      : `Will connect to ${config.database} PostgreSQL table when implemented`
  };
};

// Helper function to validate division
const validateDivision = (division) => {
  if (!division) {
    throw new Error('Division parameter is required');
  }
  
  if (!divisionDatabaseConfig[division]) {
    throw new Error(`Unsupported division: ${division}. Supported divisions: ${Object.keys(divisionDatabaseConfig).join(', ')}`);
  }
  
  return true;
};

// Helper function to get all divisions
const getAllDivisions = () => {
  return Object.keys(divisionDatabaseConfig);
};

// Helper function to get division info for frontend
const getDivisionInfo = (division) => {
  const config = getDivisionConfig(division);
  return {
    division,
    database: config.database,
    table: config.table,
    status: config.status,
    isActive: config.status === 'active',
    message: config.status === 'active' 
      ? `Live data from ${config.database} PostgreSQL database`
      : `Will connect to ${config.database} PostgreSQL table when implemented`
  };
};

module.exports = {
  divisionDatabaseConfig,
  getDivisionConfig,
  getTableName,
  getDatabaseName,
  isDivisionActive,
  getActiveDivisions,
  getPlannedDivisions,
  getDivisionStatus,
  validateDivision,
  getAllDivisions,
  getDivisionInfo
};