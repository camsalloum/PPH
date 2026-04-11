const { pool } = require('../database/config');
const logger = require('../utils/logger');

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'msn.com',
]);

const tableColumnsCache = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getDomain(email) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}

function normalizeDomain(domain) {
  return String(domain || '').trim().toLowerCase().replace(/^www\./, '');
}

function isGenericDomain(domain) {
  return GENERIC_EMAIL_DOMAINS.has(normalizeDomain(domain));
}

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  const columns = new Set(result.rows.map((r) => r.column_name));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function matchCustomerByExactEmail(email) {
  const cols = await getTableColumns('fp_customer_unified');
  if (!cols.has('customer_id') || !cols.has('email')) return null;

  const hasMergedFlag = cols.has('is_merged');
  const whereMerged = hasMergedFlag ? 'AND COALESCE(is_merged, false) = false' : '';

  const result = await pool.query(
    `SELECT customer_id
     FROM fp_customer_unified
     WHERE LOWER(TRIM(email)) = $1
       ${whereMerged}
     ORDER BY customer_id ASC
     LIMIT 1`,
    [email]
  );

  if (!result.rows.length) return null;
  return {
    customerId: result.rows[0].customer_id,
    prospectId: null,
    matchConfidence: 'exact',
  };
}

async function matchCustomerByContactEmail(email) {
  const cols = await getTableColumns('fp_customer_contacts');
  if (!cols.has('customer_id') || !cols.has('email')) return null;

  const hasPrimary = cols.has('is_primary');
  const hasActive = cols.has('is_active');

  const result = await pool.query(
    `SELECT customer_id
     FROM fp_customer_contacts
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY
       ${hasPrimary ? 'COALESCE(is_primary, false) DESC,' : ''}
       ${hasActive ? 'COALESCE(is_active, false) DESC,' : ''}
       id ASC
     LIMIT 1`,
    [email]
  );

  if (!result.rows.length) return null;
  return {
    customerId: result.rows[0].customer_id,
    prospectId: null,
    matchConfidence: 'contact',
  };
}

async function matchCustomerByDomain(domain) {
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain || isGenericDomain(cleanDomain)) return null;

  const cols = await getTableColumns('fp_customer_unified');
  if (!cols.has('customer_id') || !cols.has('website')) return null;

  const hasMergedFlag = cols.has('is_merged');
  const whereMerged = hasMergedFlag ? 'AND COALESCE(cu.is_merged, false) = false' : '';

  const result = await pool.query(
    `SELECT cu.customer_id
     FROM fp_customer_unified cu
     WHERE cu.website IS NOT NULL
       AND cu.website <> ''
       AND LOWER(
         REGEXP_REPLACE(
           REGEXP_REPLACE(cu.website, '^https?://', '', 'i'),
           '^www\\.',
           '',
           'i'
         )
       ) LIKE $1
       ${whereMerged}
     ORDER BY cu.customer_id ASC
     LIMIT 1`,
    [`%${cleanDomain}%`]
  );

  if (!result.rows.length) return null;
  return {
    customerId: result.rows[0].customer_id,
    prospectId: null,
    matchConfidence: 'domain',
  };
}

async function matchProspectByEmail(email) {
  const cols = await getTableColumns('fp_prospects');
  if (!cols.has('id')) return null;

  const emailColumns = [];
  if (cols.has('contact_email')) emailColumns.push('contact_email');
  if (cols.has('email')) emailColumns.push('email');

  if (!emailColumns.length) return null;

  const whereParts = emailColumns.map((c) => `LOWER(TRIM(${c})) = $1`);
  const result = await pool.query(
    `SELECT id
     FROM fp_prospects
     WHERE (${whereParts.join(' OR ')})
     ORDER BY id ASC
     LIMIT 1`,
    [email]
  );

  if (!result.rows.length) return null;
  return {
    customerId: null,
    prospectId: result.rows[0].id,
    matchConfidence: 'exact',
  };
}

async function matchEmailToCrm(email, options = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { customerId: null, prospectId: null, matchConfidence: 'none' };
  }

  try {
    const exactCustomer = await matchCustomerByExactEmail(normalized);
    if (exactCustomer) return exactCustomer;

    const contactCustomer = await matchCustomerByContactEmail(normalized);
    if (contactCustomer) return contactCustomer;

    const domainCustomer = await matchCustomerByDomain(getDomain(normalized));
    if (domainCustomer) return domainCustomer;

    const prospect = await matchProspectByEmail(normalized);
    if (prospect) return prospect;
  } catch (error) {
    logger.warn('emailMatchingService failed, falling back to none', {
      email: normalized,
      userId: options.userId,
      error: error.message,
    });
  }

  return { customerId: null, prospectId: null, matchConfidence: 'none' };
}

module.exports = {
  GENERIC_EMAIL_DOMAINS,
  matchEmailToCrm,
};
