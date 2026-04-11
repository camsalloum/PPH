/**
 * AEBF Validation Middleware
 * Centralized validation rules for all AEBF endpoints
 */

const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => `${err.param}: ${err.msg}`).join('; ');
    logger.warn('Validation failed:', {
      url: req.originalUrl,
      errors: errors.array(),
      body: req.body
    });
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: errorMessages,
      details: errors.array()
    });
  }
  next();
};

/**
 * Common validation rules
 */
// Allow any division - validation is just for format, actual division list comes from database
const validValuesTypes = ['AMOUNT', 'KGS', 'MORM'];
const validTypes = ['ACTUAL', 'BUDGET', 'ESTIMATE', 'FORECAST'];
const validUploadModes = ['upsert', 'replace'];

// Division format validation helper - used in body/param validators
const divisionFormatValidation = {
  message: 'Division must contain only letters, numbers, and underscores'
};

/**
 * Division validation - accepts any non-empty string (actual division list comes from database)
 */
const validateDivision = query('division')
  .trim()
  .notEmpty().withMessage('Division is required')
  .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
  .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message);

/**
 * Year validation
 */
const validateYear = query('year')
  .optional()
  .isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100')
  .toInt();

const validateYearRequired = query('year')
  .notEmpty().withMessage('Year is required')
  .isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100')
  .toInt();

/**
 * Month validation
 */
const validateMonth = query('month')
  .optional()
  .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12')
  .toInt();

/**
 * Pagination validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Page size must be between 1 and 1000')
    .toInt()
];

/**
 * Values type validation
 */
const validateValuesType = query('values_type')
  .optional()
  .customSanitizer(value => value ? value.toUpperCase() : value)
  .isIn(validValuesTypes).withMessage(`Values type must be one of: ${validValuesTypes.join(', ')}`);

/**
 * Type validation
 */
const validateType = query('type')
  .optional()
  .customSanitizer(value => value ? value.toUpperCase() : value)
  .isIn(validTypes).withMessage(`Type must be one of: ${validTypes.join(', ')}`);

/**
 * Search validation
 */
const validateSearch = query('search')
  .optional()
  .trim()
  .isLength({ max: 255 }).withMessage('Search term must be less than 255 characters');

/**
 * Sort validation
 */
const validateSort = [
  query('sortBy')
    .optional()
    .isIn(['year', 'month', 'values', 'customername', 'countryname', 'productgroup', 'salesrepname', 'values_type'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

/**
 * Validation rules for each endpoint
 */
const validationRules = {
  // Health endpoint
  health: [
    validateDivision,
    handleValidationErrors
  ],

  // Actual data endpoint
  getActual: [
    validateDivision,
    validateYear,
    validateMonth,
    validateValuesType,
    validateType,
    validateSearch,
    ...validatePagination,
    ...validateSort,
    handleValidationErrors
  ],

  // Summary endpoint
  getSummary: [
    validateDivision,
    validateType,
    handleValidationErrors
  ],

  // Year summary endpoint
  getYearSummary: [
    validateDivision,
    validateType,
    validateYear,
    validateSearch,
    handleValidationErrors
  ],

  // Filter options endpoint
  getFilterOptions: [
    validateDivision,
    validateType,
    handleValidationErrors
  ],

  // Distinct values endpoint
  getDistinct: [
    param('field')
      .isIn(['salesrepname', 'customername', 'countryname', 'productgroup', 'year', 'month', 'values_type', 'material', 'process'])
      .withMessage('Invalid field name'),
    validateDivision,
    validateType,
    handleValidationErrors
  ],

  // Export endpoint
  exportData: [
    validateDivision,
    validateYear,
    validateMonth,
    validateValuesType,
    validateSearch,
    ...validateSort,
    handleValidationErrors
  ],

  // Available months endpoint
  getAvailableMonths: [
    validateDivision,
    validateYearRequired,
    handleValidationErrors
  ],

  // Budget endpoint
  getBudget: [
    validateDivision,
    validateYear,
    validateMonth,
    validateSearch,
    ...validatePagination,
    handleValidationErrors
  ],

  // Upload actual endpoint
  uploadActual: [
    body('division')
      .customSanitizer(value => value ? String(value).trim() : '')
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('uploadMode')
      .customSanitizer(value => value ? String(value).trim() : '')
      .notEmpty().withMessage('Upload mode is required')
      .isIn(validUploadModes).withMessage(`Upload mode must be one of: ${validUploadModes.join(', ')}`),
    body('uploadedBy')
      .customSanitizer(value => value ? String(value).trim() : '')
      .notEmpty().withMessage('Uploaded by is required')
      .isLength({ min: 2, max: 100 }).withMessage('Uploaded by must be between 2 and 100 characters'),
    handleValidationErrors
  ],

  // Analyze file endpoint - file upload only, no specific validation
  analyzeFile: [
    handleValidationErrors
  ],

  // Upload budget endpoint
  uploadBudget: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('uploadMode')
      .optional()
      .trim()
      .isIn(validUploadModes).withMessage(`Upload mode must be one of: ${validUploadModes.join(', ')}`),
    body('uploadedBy')
      .trim()
      .notEmpty().withMessage('Uploaded by is required')
      .isLength({ min: 1, max: 100 }).withMessage('Uploaded by must be between 1 and 100 characters'),
    handleValidationErrors
  ],

  // Calculate estimate endpoint
  calculateEstimate: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('year')
      .notEmpty().withMessage('Year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100')
      .toInt(),
    body('selectedMonths')
      .isArray({ min: 1 }).withMessage('Selected months must be a non-empty array')
      .custom((value) => {
        return value.every(month => Number.isInteger(month) && month >= 1 && month <= 12);
      }).withMessage('All months must be integers between 1 and 12'),
    body('createdBy')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Created by must be between 2 and 100 characters'),
    handleValidationErrors
  ],

  // Save estimate endpoint
  saveEstimate: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('year')
      .notEmpty().withMessage('Year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100')
      .toInt(),
    body('estimates')
      .notEmpty().withMessage('Estimates object is required')
      .isObject().withMessage('Estimates must be an object'),
    body('approvedBy')
      .trim()
      .notEmpty().withMessage('Approved by is required')
      .isLength({ min: 2, max: 100 }).withMessage('Approved by must be between 2 and 100 characters'),
    handleValidationErrors
  ],

  // Budget years endpoint
  getBudgetYears: [
    validateDivision,
    handleValidationErrors
  ],

  // Budget sales rep recap endpoint
  budgetSalesRepRecap: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    body('salesRep')
      .trim()
      .notEmpty().withMessage('Sales rep is required')
      .isLength({ min: 2, max: 100 }).withMessage('Sales rep must be between 2 and 100 characters'),
    handleValidationErrors
  ],

  // HTML budget endpoints
  htmlBudgetCustomers: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('actualYear')
      .notEmpty().withMessage('Actual year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Actual year must be between 2000 and 2100')
      .toInt(),
    body('salesRep')
      .trim()
      .notEmpty().withMessage('Sales rep is required'),
    handleValidationErrors
  ],

  htmlBudgetCustomersAll: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('actualYear')
      .notEmpty().withMessage('Actual year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Actual year must be between 2000 and 2100')
      .toInt(),
    body('salesReps')
      .isArray({ min: 1 }).withMessage('Sales reps must be a non-empty array'),
    handleValidationErrors
  ],

  saveHtmlBudget: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    body('salesRep')
      .trim()
      .notEmpty().withMessage('Sales rep is required'),
    body('budgetData')
      .isArray().withMessage('Budget data must be an array'),
    handleValidationErrors
  ],

  // Divisional budget endpoints
  divisionalBudgetData: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    handleValidationErrors
  ],

  saveDivisionalBudget: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    body('records')
      .optional()
      .isArray().withMessage('Records must be an array'),
    body('servicesChargesRecords')
      .optional()
      .isArray().withMessage('Services charges records must be an array'),
    handleValidationErrors
  ],

  deleteDivisionalBudget: [
    param('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    param('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    handleValidationErrors
  ],

  // Reports endpoints
  getBudgetSalesReps: [
    validateDivision,
    query('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    handleValidationErrors
  ],

  budgetProductGroups: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    body('salesRep')
      .optional()
      .trim(),
    handleValidationErrors
  ],

  actualProductGroups: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('actualYear')
      .notEmpty().withMessage('Actual year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Actual year must be between 2000 and 2100')
      .toInt(),
    body('salesRep')
      .optional()
      .trim(),
    body('fromMonth')
      .optional()
      .isInt({ min: 1, max: 12 }).withMessage('From month must be between 1 and 12')
      .toInt(),
    body('toMonth')
      .optional()
      .isInt({ min: 1, max: 12 }).withMessage('To month must be between 1 and 12')
      .toInt(),
    handleValidationErrors
  ],

  // Bulk operations endpoints
  bulkImport: [
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('budgetYear')
      .notEmpty().withMessage('Budget year is required')
      .isInt({ min: 2000, max: 2100 }).withMessage('Budget year must be between 2000 and 2100')
      .toInt(),
    body('records')
      .isArray({ min: 1 }).withMessage('Records must be a non-empty array'),
    handleValidationErrors
  ],

  bulkBatches: [
    validateDivision,
    handleValidationErrors
  ],

  bulkBatch: [
    param('batchId')
      .trim()
      .notEmpty().withMessage('Batch ID is required'),
    validateDivision,
    handleValidationErrors
  ],

  bulkFinalize: [
    param('batchId')
      .trim()
      .notEmpty().withMessage('Batch ID is required'),
    body('division')
      .trim()
      .notEmpty().withMessage('Division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    handleValidationErrors
  ],

  // Import HTML budget
  importHtmlBudget: [
    body('htmlContent')
      .notEmpty().withMessage('HTML content is required'),
    body('currentDivision')
      .trim()
      .notEmpty().withMessage('Current division is required')
      .isLength({ min: 1, max: 20 }).withMessage('Division must be between 1 and 20 characters')
      .matches(/^[A-Z0-9_]+$/i).withMessage(divisionFormatValidation.message),
    body('currentSalesRep')
      .optional()
      .trim(),
    handleValidationErrors
  ]
};

module.exports = validationRules;
