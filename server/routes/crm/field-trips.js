/**
 * CRM Field Trip Planner Routes
 *
 * Endpoints:
 *   GET    /field-trips
 *   POST   /field-trips
 *   GET    /field-trips/:id
 *   PATCH  /field-trips/:id
 *   DELETE /field-trips/:id
 *   POST   /field-trips/:id/stops
 *   PUT    /field-trips/:id/stops/reorder
 *   PATCH  /field-trips/:id/stops/:stopId
 *   DELETE /field-trips/:id/stops/:stopId
 *   POST   /field-trips/:id/stops/:stopId/complete
 *   GET    /field-trips/:id/route-preview
 *   GET    /field-trips/:id/report
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { notifyUsers, createNotification } = require('../../services/notificationService');
const { sendEmail } = require('../../services/emailService');
const currencyService = require('../../utils/currencyService');

// File upload storage for trip attachments
const tripAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../../uploads/trip-attachments');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
];
const upload = multer({
  storage: tripAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Accepted: images, PDF, Word, Excel, CSV, text.'));
    }
  },
});

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];
const VALID_STOP_TYPES = ['customer', 'prospect', 'location', 'custom'];
const VALID_LOCATION_LABELS = ['hotel', 'airport', 'meeting', 'restaurant', 'office', 'waypoint', 'other'];

function normalizeStopType(stopType) {
  return VALID_STOP_TYPES.includes(stopType) ? stopType : 'customer';
}

function normalizeLocationLabel(label) {
  if (!label) return null;
  const normalized = String(label).trim().toLowerCase();
  return VALID_LOCATION_LABELS.includes(normalized) ? normalized : 'other';
}

function normalizeCountryCode2(rawValue) {
  if (!rawValue) return null;
  const normalized = String(rawValue).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeLocationName(stop) {
  const raw = String(stop?.address_snapshot || '').trim();
  if (!raw) return null;
  const firstSegment = raw.split(',')[0]?.trim();
  return firstSegment || raw;
}

function normalizeLatLngValue(rawValue) {
  const value = Number(rawValue);
  return Number.isFinite(value) ? Number(value.toFixed(7)) : null;
}

async function upsertGlobalLocationsForTrip(client, tripId, stops, actorId, fallbackCountryCode2 = null) {
  if (!Array.isArray(stops) || stops.length === 0) return;

  const uniqueLocationByKey = new Map();

  for (const stop of stops) {
    const stopType = normalizeStopType(stop?.stop_type);
    if (stopType !== 'location' && stopType !== 'custom') continue;

    const latitude = normalizeLatLngValue(stop?.latitude);
    const longitude = normalizeLatLngValue(stop?.longitude);
    if (latitude === null || longitude === null) continue;

    const name = normalizeLocationName(stop);
    if (!name) continue;

    const key = `${latitude}|${longitude}`;
    if (uniqueLocationByKey.has(key)) continue;

    uniqueLocationByKey.set(key, {
      name,
      label: normalizeLocationLabel(stop?.custom_label),
      country: stop?.stop_country ? String(stop.stop_country).trim() : null,
      countryCode2: normalizeCountryCode2(stop?.stop_country) || normalizeCountryCode2(fallbackCountryCode2),
      city: stop?.stop_city ? String(stop.stop_city).trim() : null,
      address: String(stop?.address_snapshot || '').trim() || null,
      latitude,
      longitude,
      source: 'trip_stop',
    });
  }

  for (const loc of uniqueLocationByKey.values()) {
    const upsertRes = await client.query(
      `INSERT INTO crm_locations
         (name, label, country, country_code_2, city, address, latitude, longitude, source, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (latitude, longitude)
       DO UPDATE SET
         name = EXCLUDED.name,
         label = COALESCE(EXCLUDED.label, crm_locations.label),
         country = COALESCE(EXCLUDED.country, crm_locations.country),
         country_code_2 = COALESCE(EXCLUDED.country_code_2, crm_locations.country_code_2),
         city = COALESCE(EXCLUDED.city, crm_locations.city),
         address = COALESCE(EXCLUDED.address, crm_locations.address),
         source = COALESCE(EXCLUDED.source, crm_locations.source),
         updated_at = NOW()
       RETURNING id`,
      [
        loc.name,
        loc.label,
        loc.country,
        loc.countryCode2,
        loc.city,
        loc.address,
        loc.latitude,
        loc.longitude,
        loc.source,
        actorId || null,
      ]
    );

    const locationId = upsertRes.rows[0]?.id;
    if (!locationId) continue;

    const usageRes = await client.query(
      `INSERT INTO crm_location_trip_usage (trip_id, location_id)
       VALUES ($1, $2)
       ON CONFLICT (trip_id, location_id) DO NOTHING
       RETURNING trip_id`,
      [tripId, locationId]
    );

    if (usageRes.rows.length > 0) {
      await client.query(
        `UPDATE crm_locations
            SET use_count = use_count + 1,
                last_used_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [locationId]
      );
    } else {
      await client.query(
        `UPDATE crm_location_trip_usage
            SET last_used_at = NOW()
          WHERE trip_id = $1 AND location_id = $2`,
        [tripId, locationId]
      );
    }
  }
}

/**
 * Check if a user has full (manager-level) access to all reps' field trips.
 * Admin always has full access; other manager roles require designation_level >= 6.
 */
function hasFullAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const level = Number(user.designation_level) || 0;
  return FULL_ACCESS_ROLES.includes(user.role) && level >= 6;
}

async function getAssigneeName(userId) {
  try {
    const result = await authPool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.full_name || null;
  } catch (_) {
    return null;
  }
}

async function getManagedRepIds(managerId) {
  try {
    const result = await authPool.query(
      `SELECT DISTINCT u.id AS rep_id
         FROM user_sales_rep_access usa
    INNER JOIN users u
            ON (
              LOWER(TRIM(COALESCE(
                NULLIF(TRIM(to_jsonb(u)->>'full_name'), ''),
                NULLIF(TRIM(u.name), ''),
                NULLIF(TRIM(u.email), '')
              ))) = LOWER(TRIM(usa.sales_rep_name))
              OR LOWER(TRIM(u.email)) = LOWER(TRIM(usa.sales_rep_name))
            )
     LEFT JOIN user_divisions ud
            ON ud.user_id = u.id
        WHERE usa.manager_id = $1
          AND (
            COALESCE(NULLIF(TRIM(usa.division), ''), '__any__') = '__any__'
            OR COALESCE(NULLIF(TRIM(ud.division), ''), '__any__') = '__any__'
            OR LOWER(TRIM(usa.division)) = LOWER(TRIM(ud.division))
          )`,
      [managerId]
    );

    const fallbackResult = await authPool.query(
      `SELECT DISTINCT rep.user_id AS rep_id
         FROM employees rep
    INNER JOIN employees mgr
            ON mgr.id = rep.reports_to
        WHERE mgr.user_id = $1
          AND rep.user_id IS NOT NULL`,
      [managerId]
    );

    const mappedRepIds = result.rows
      .map((row) => Number(row.rep_id))
      .filter((value) => Number.isInteger(value) && value > 0);

    const fallbackRepIds = fallbackResult.rows
      .map((row) => Number(row.rep_id))
      .filter((value) => Number.isInteger(value) && value > 0);

    return Array.from(new Set([...mappedRepIds, ...fallbackRepIds]));
  } catch (err) {
    logger.warn('CRM: manager-rep access lookup unavailable, falling back to role-based approval', {
      managerId,
      error: err?.message,
    });
    return null;
  }
}

async function canManagerReviewRep(managerId, repId) {
  const managedRepIds = await getManagedRepIds(managerId);
  if (managedRepIds === null) return true;
  return managedRepIds.includes(Number(repId));
}

async function writeTripAuditEntry({ tripId, actorId, type, description }) {
  try {
    await pool.query(
      `INSERT INTO crm_trip_adjustments (trip_id, adjusted_by, adjustment_type, description)
       VALUES ($1, $2, $3, $4)`,
      [tripId, actorId || null, type, description || null]
    );
  } catch (_) {
    // Non-blocking: adjustment table may be absent in older installs.
  }
}

async function getReportsToManagerIdsForRep(repId) {
  try {
    const result = await authPool.query(
      `SELECT DISTINCT mgr.user_id AS manager_id
         FROM employees rep
    INNER JOIN employees mgr
            ON mgr.id = rep.reports_to
        WHERE rep.user_id = $1
          AND mgr.user_id IS NOT NULL`,
      [repId]
    );

    return result.rows
      .map((row) => Number(row.manager_id))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch (err) {
    logger.warn('CRM: reports_to fallback manager lookup failed', {
      repId,
      error: err?.message,
    });
    return [];
  }
}

async function hasAnyManagerAssignmentForRep(repId) {
  try {
    const mapped = await authPool.query(
      `SELECT 1
         FROM user_sales_rep_access usa
    INNER JOIN users u
            ON (
              LOWER(TRIM(COALESCE(
                NULLIF(TRIM(to_jsonb(u)->>'full_name'), ''),
                NULLIF(TRIM(u.name), ''),
                NULLIF(TRIM(u.email), '')
              ))) = LOWER(TRIM(usa.sales_rep_name))
              OR LOWER(TRIM(u.email)) = LOWER(TRIM(usa.sales_rep_name))
            )
     LEFT JOIN user_divisions ud
            ON ud.user_id = u.id
        WHERE u.id = $1
          AND (
            COALESCE(NULLIF(TRIM(usa.division), ''), '__any__') = '__any__'
            OR COALESCE(NULLIF(TRIM(ud.division), ''), '__any__') = '__any__'
            OR LOWER(TRIM(usa.division)) = LOWER(TRIM(ud.division))
          )
        LIMIT 1`,
      [repId]
    );
    if (mapped.rows.length > 0) return true;

    const fallbackManagerIds = await getReportsToManagerIdsForRep(repId);
    return fallbackManagerIds.length > 0;
  } catch (err) {
    logger.warn('CRM: submit-approval manager mapping lookup failed, falling back to legacy submit behavior', {
      repId,
      error: err?.message,
    });
    return true;
  }
}

async function getManagerIdsForRep(repId) {
  try {
    const result = await authPool.query(
      `SELECT DISTINCT usa.manager_id
         FROM user_sales_rep_access usa
    INNER JOIN users u
            ON (
              LOWER(TRIM(COALESCE(
                NULLIF(TRIM(to_jsonb(u)->>'full_name'), ''),
                NULLIF(TRIM(u.name), ''),
                NULLIF(TRIM(u.email), '')
              ))) = LOWER(TRIM(usa.sales_rep_name))
              OR LOWER(TRIM(u.email)) = LOWER(TRIM(usa.sales_rep_name))
            )
     LEFT JOIN user_divisions ud
            ON ud.user_id = u.id
        WHERE u.id = $1
          AND (
            COALESCE(NULLIF(TRIM(usa.division), ''), '__any__') = '__any__'
            OR COALESCE(NULLIF(TRIM(ud.division), ''), '__any__') = '__any__'
            OR LOWER(TRIM(usa.division)) = LOWER(TRIM(ud.division))
          )`,
      [repId]
    );

    const mappedManagerIds = result.rows
      .map((row) => Number(row.manager_id))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (mappedManagerIds.length > 0) return mappedManagerIds;

    return getReportsToManagerIdsForRep(repId);
  } catch (err) {
    logger.warn('CRM: manager assignee resolution failed during submit-approval', {
      repId,
      error: err?.message,
    });
    return [];
  }
}

async function notifyManagersTripSubmitted({ tripId, tripTitle, repId, assignedManagerIds }) {
  const targets = [...new Set((assignedManagerIds || []).filter(Boolean))];
  if (targets.length === 0) return;

  try {
    const repRes = await authPool.query(
      `SELECT COALESCE(
          NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
          NULLIF(TRIM(name), ''),
          email,
          'Sales rep'
        ) AS display_name
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [repId]
    );
    const repName = repRes.rows[0]?.display_name || 'Sales rep';

    await notifyUsers(targets, {
      type: 'crm_trip_pending_approval',
      title: `Trip approval required: ${tripTitle || `Trip #${tripId}`}`,
      message: `${repName} submitted a trip for your approval.`,
      link: `/crm/visits/${tripId}`,
      referenceType: 'field_trip',
      referenceId: tripId,
    });

    const emailEnabled = String(process.env.CRM_APPROVAL_EMAIL_ENABLED || '').toLowerCase() === 'true';
    if (!emailEnabled) return;

    const mgrRes = await authPool.query(
      `SELECT id,
              email,
              COALESCE(
                NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                NULLIF(TRIM(name), ''),
                email,
                'Manager'
              ) AS display_name
         FROM users
        WHERE id = ANY($1::int[])
          AND COALESCE(is_active, TRUE) = TRUE`,
      [targets]
    );

    await Promise.all(
      (mgrRes.rows || [])
        .filter((u) => u.email)
        .map((u) => sendEmail({
          to: u.email,
          subject: `Trip approval required: ${tripTitle || `Trip #${tripId}`}`,
          html: `
            <h3>Trip Approval Required</h3>
            <p>Hello ${u.display_name},</p>
            <p><strong>${repName}</strong> submitted <strong>${tripTitle || `Trip #${tripId}`}</strong> for your approval.</p>
            <p><a href="${process.env.APP_URL || ''}/crm/visits/${tripId}">Open Trip</a></p>
          `,
        }))
    );
  } catch (err) {
    logger.warn('CRM: trip submit notification/email hook failed', {
      tripId,
      error: err?.message,
    });
  }
}

async function notifyRepApprovalDecision({ tripId, tripTitle, repId, managerId, decision, comments }) {
  if (!repId) return;

  try {
    const repRes = await authPool.query(
      `SELECT id,
              email,
              COALESCE(
                NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                NULLIF(TRIM(name), ''),
                email,
                'Sales rep'
              ) AS display_name
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [repId]
    );
    const rep = repRes.rows[0];
    if (!rep) return;

    const mgrRes = await authPool.query(
      `SELECT COALESCE(
                NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                NULLIF(TRIM(name), ''),
                email,
                'Manager'
              ) AS display_name
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [managerId]
    );
    const managerName = mgrRes.rows[0]?.display_name || 'Manager';

    const decisionLabel =
      decision === 'approved'
        ? 'Approved'
        : decision === 'changes_requested'
          ? 'Changes Requested'
          : 'Rejected';

    const nextStatus = decision === 'approved' ? 'confirmed' : 'planning';

    await notifyUsers([rep.id], {
      type: 'crm_trip_approval_decision',
      title: `Trip ${decisionLabel}: ${tripTitle || `Trip #${tripId}`}`,
      message: `${managerName} marked your trip as ${decisionLabel.toLowerCase()}.${comments ? ` Note: ${comments}` : ''}`,
      link: `/crm/visits/${tripId}`,
      referenceType: 'field_trip',
      referenceId: tripId,
    });

    const emailEnabled = String(process.env.CRM_APPROVAL_EMAIL_ENABLED || '').toLowerCase() === 'true';
    if (emailEnabled && rep.email) {
      await sendEmail({
        to: rep.email,
        subject: `Trip ${decisionLabel}: ${tripTitle || `Trip #${tripId}`}`,
        html: `
          <h3>Trip Approval Update</h3>
          <p>Hello ${rep.display_name},</p>
          <p>Your trip <strong>${tripTitle || `Trip #${tripId}`}</strong> was marked <strong>${decisionLabel}</strong> by ${managerName}.</p>
          ${comments ? `<p><strong>Manager comments:</strong> ${String(comments)}</p>` : ''}
          <p>Current status: <strong>${nextStatus.replace('_', ' ')}</strong>.</p>
          <p><a href="${process.env.APP_URL || ''}/crm/visits/${tripId}">Open Trip</a></p>
        `,
      });
    }
  } catch (err) {
    logger.warn('CRM: notify rep approval decision failed', {
      tripId,
      repId,
      error: err?.message,
    });
  }
}

async function getAccountsPlaceholderRecipientIds() {
  try {
    const settingRes = await authPool.query(
      `SELECT setting_value
         FROM company_settings
        WHERE setting_key = 'crm_accounts_approval_recipients'
        LIMIT 1`
    );

    if (settingRes.rows.length > 0) {
      const rawValue = settingRes.rows[0]?.setting_value;
      const parsed = Array.isArray(rawValue)
        ? rawValue
        : typeof rawValue === 'string'
          ? JSON.parse(rawValue || '[]')
          : [];

      const dbIds = Array.from(new Set((parsed || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)));

      if (dbIds.length > 0) return dbIds;
    }
  } catch (err) {
    logger.warn('CRM: failed loading accounts recipients from company settings', {
      error: err?.message,
    });
  }

  const raw = String(process.env.CRM_ACCOUNTS_APPROVAL_RECIPIENTS || '').trim();
  if (!raw) return [];

  return Array.from(new Set(raw
    .split(',')
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value > 0)));
}

async function notifyAccountsApprovalCopy({
  tripId,
  tripTitle,
  repId,
  managerId,
  approvalStage,
  comments,
}) {
  const recipientIds = await getAccountsPlaceholderRecipientIds();
  if (recipientIds.length === 0) return;

  try {
    const [repRes, mgrRes] = await Promise.all([
      authPool.query(
        `SELECT COALESCE(
                  NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                  NULLIF(TRIM(name), ''),
                  email,
                  'Sales rep'
                ) AS display_name
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [repId]
      ),
      authPool.query(
        `SELECT COALESCE(
                  NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                  NULLIF(TRIM(name), ''),
                  email,
                  'Manager'
                ) AS display_name
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [managerId]
      ),
    ]);

    const repName = repRes.rows[0]?.display_name || 'Sales rep';
    const managerName = mgrRes.rows[0]?.display_name || 'Manager';
    const stageLabel = approvalStage === 'travel_report'
      ? 'Travel report approved'
      : approvalStage === 'settlement'
        ? 'Trip settlement approved'
        : 'Trip approved';
    const stageDescription = approvalStage === 'travel_report'
      ? 'travel report/expenses'
      : approvalStage === 'settlement'
        ? 'trip settlement'
        : 'trip';

    await notifyUsers(recipientIds, {
      type: 'crm_accounts_copy_approval',
      title: `Accounts Copy: ${stageLabel} — ${tripTitle || `Trip #${tripId}`}`,
      message: `${managerName} approved ${repName}'s ${stageDescription}.${comments ? ` Note: ${comments}` : ''}`,
      link: `/crm/visits/${tripId}`,
      referenceType: 'field_trip',
      referenceId: tripId,
    });

    const emailEnabled = String(process.env.CRM_APPROVAL_EMAIL_ENABLED || '').toLowerCase() === 'true';
    if (!emailEnabled) return;

    const accountsUsers = await authPool.query(
      `SELECT email,
              COALESCE(
                NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                NULLIF(TRIM(name), ''),
                email,
                'Accounts'
              ) AS display_name
         FROM users
        WHERE id = ANY($1::int[])
          AND COALESCE(is_active, TRUE) = TRUE`,
      [recipientIds]
    );

    await Promise.all(
      (accountsUsers.rows || [])
        .filter((user) => user.email)
        .map((user) => sendEmail({
          to: user.email,
          subject: `Accounts Copy: ${stageLabel} — ${tripTitle || `Trip #${tripId}`}`,
          html: `
            <h3>${stageLabel}</h3>
            <p>Hello ${user.display_name},</p>
            <p>${managerName} approved <strong>${tripTitle || `Trip #${tripId}`}</strong> for ${repName}.</p>
            <p>Approval stage: <strong>${approvalStage === 'travel_report' ? 'Travel report / expenses' : approvalStage === 'settlement' ? 'Trip settlement' : 'Trip approval'}</strong></p>
            ${comments ? `<p><strong>Manager comments:</strong> ${String(comments)}</p>` : ''}
            <p><a href="${process.env.APP_URL || ''}/crm/visits/${tripId}">Open Trip</a></p>
          `,
        }))
    );
  } catch (err) {
    logger.warn('CRM: accounts copy notification/email hook failed', {
      tripId,
      approvalStage,
      error: err?.message,
    });
  }
}

async function getCompanyBaseCurrencyCode() {
  try {
    const base = await currencyService.getBaseCurrency();
    return String(base?.code || 'AED').toUpperCase();
  } catch (_) {
    return 'AED';
  }
}

async function getLatestRateToBase(fromCurrency, baseCurrency) {
  const from = String(fromCurrency || '').toUpperCase();
  const base = String(baseCurrency || '').toUpperCase();
  if (!from || !base) return null;
  if (from === base) return 1;

  try {
    const fxRow = await pool.query(
      `SELECT rate
         FROM crm_fx_rates
        WHERE from_currency = $1 AND to_currency = $2
        ORDER BY effective_date DESC
        LIMIT 1`,
      [from, base]
    );
    if (fxRow.rows.length > 0) {
      return parseFloat(fxRow.rows[0].rate);
    }
  } catch (_) {
    // fall back below
  }

  const fallbackRate = await currencyService.getExchangeRate(from, base);
  return fallbackRate === null ? null : parseFloat(fallbackRate);
}

async function convertToBaseAmount(amount, fromCurrency, baseCurrency) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return { ok: false, error: 'Invalid amount' };
  }

  const normalizedCurrency = String(fromCurrency || baseCurrency).toUpperCase();
  const rate = await getLatestRateToBase(normalizedCurrency, baseCurrency);
  if (rate === null) {
    return {
      ok: false,
      error: `No FX rate found for ${normalizedCurrency} → ${baseCurrency}`,
    };
  }

  return {
    ok: true,
    originalAmount: parsedAmount,
    originalCurrency: normalizedCurrency,
    rate,
    baseAmount: parsedAmount * rate,
  };
}

async function canDisburseAdvance(user) {
  if (hasFullAccess(user)) return true;
  const accountRecipients = await getAccountsPlaceholderRecipientIds();
  return accountRecipients.includes(Number(user?.id));
}

async function isSettlementApprovedForTrip(tripId) {
  try {
    const settlementRes = await pool.query(
      `SELECT status
         FROM crm_trip_settlements
        WHERE trip_id = $1
        LIMIT 1`,
      [tripId]
    );
    return settlementRes.rows[0]?.status === 'approved';
  } catch (err) {
    if (err.code === '42P01') return false;
    throw err;
  }
}

async function isTravelReportApprovedForTrip(tripId) {
  const reportRes = await pool.query(
    `SELECT status
       FROM crm_travel_reports
      WHERE trip_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [tripId]
  );
  return reportRes.rows[0]?.status === 'approved';
}

async function tryCompleteTripIfReady(tripId) {
  const [reportApproved, settlementApproved] = await Promise.all([
    isTravelReportApprovedForTrip(tripId),
    isSettlementApprovedForTrip(tripId),
  ]);

  if (!reportApproved || !settlementApproved) {
    return { completed: false, reason: 'Waiting for report and settlement approvals' };
  }

  await pool.query(
    `UPDATE crm_field_trips
        SET status = 'completed', updated_at = NOW()
      WHERE id = $1 AND status = 'in_progress'`,
    [tripId]
  );

  return { completed: true };
}

async function getTripById(tripId, reqUser) {
  const isFullAccess = hasFullAccess(reqUser);
  const params = [tripId];
  let whereExtra = '';

  if (!isFullAccess) {
    params.push(reqUser.id);
    whereExtra = ' AND t.rep_id = $2';
  }

  const tripRes = await pool.query(
    `SELECT t.*
       FROM crm_field_trips t
      WHERE t.id = $1${whereExtra}`,
    params
  );

  if (tripRes.rows.length === 0) return null;
  return tripRes.rows[0];
}

let _lastAutoCompleteTs = 0;
const AUTO_COMPLETE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

async function autoCompleteExpiredTrips(reqUser) {
  const isFullAccess = hasFullAccess(reqUser);
  const params = [];
  let whereExtra = '';

  if (!isFullAccess) {
    params.push(reqUser.id);
    whereExtra = `
        AND t.rep_id = $1`;
  }

  // Auto-complete only when financial and report approvals are fully done.
  await pool.query(
    `UPDATE crm_field_trips t
        SET status = 'completed',
            updated_at = NOW()
      WHERE t.status = 'in_progress'
        AND t.return_date IS NOT NULL
        AND t.return_date < CURRENT_DATE
        AND EXISTS (
          SELECT 1
            FROM crm_travel_reports tr
           WHERE tr.trip_id = t.id
             AND tr.status = 'approved'
        )
        AND EXISTS (
          SELECT 1
            FROM crm_trip_settlements ts
           WHERE ts.trip_id = t.id
             AND ts.status = 'approved'
        )${whereExtra}`,
    params
  );
}

// GET /api/crm/field-trips
router.get('/field-trips', authenticate, async (req, res) => {
  try {
    if (Date.now() - _lastAutoCompleteTs > AUTO_COMPLETE_DEBOUNCE_MS) {
      _lastAutoCompleteTs = Date.now();
      await autoCompleteExpiredTrips(req.user);
    }

    const userId = req.user.id;
    const isFullAccess = hasFullAccess(req.user);
    const { status, upcoming, repId, customerId, prospectId, limit: limitQ } = req.query;
    const limit = Math.min(Math.max(parseInt(limitQ, 10) || 50, 1), 200);

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      conditions.push(`t.rep_id = $${p++}`);
      params.push(userId);
    } else if (repId) {
      conditions.push(`t.rep_id = $${p++}`);
      params.push(parseInt(repId, 10));
    }

    if (status) {
      conditions.push(`t.status = $${p++}`);
      params.push(status);
    }

    if (String(upcoming) === 'true') {
      conditions.push(`(
        t.status IN ('planning', 'confirmed', 'in_progress')
        AND COALESCE(t.return_date, t.departure_date) >= CURRENT_DATE - INTERVAL '1 day'
      )`);
    }

    if (customerId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM crm_field_trip_stops fs
         WHERE fs.trip_id = t.id
           AND fs.customer_id = $${p++}
      )`);
      params.push(parseInt(customerId, 10));
    }

    if (prospectId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM crm_field_trip_stops fs
         WHERE fs.trip_id = t.id
           AND fs.prospect_id = $${p++}
      )`);
      params.push(parseInt(prospectId, 10));
    }

    // Date-range filter for calendar view
    const { fromDate, toDate } = req.query;
    if (fromDate) {
      conditions.push(`COALESCE(t.return_date, t.departure_date) >= $${p++}`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`t.departure_date <= $${p++}`);
      params.push(toDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT t.*,
              COALESCE(s.stop_count, 0) AS stop_count,
            COALESCE(s.visited_count, 0) AS visited_count,
            tr.status AS travel_report_status,
             tr.reviewed_at AS travel_report_reviewed_at,
             ts.status AS settlement_status,
             ts.reviewed_at AS settlement_reviewed_at
         FROM crm_field_trips t
    LEFT JOIN (
           SELECT trip_id,
                  COUNT(*) AS stop_count,
                  COUNT(*) FILTER (WHERE outcome_status = 'visited') AS visited_count
             FROM crm_field_trip_stops
         GROUP BY trip_id
            ) s ON s.trip_id = t.id
     LEFT JOIN LATERAL (
          SELECT r.status, r.reviewed_at
           FROM crm_travel_reports r
          WHERE r.trip_id = t.id
        ORDER BY r.created_at DESC
          LIMIT 1
        ) tr ON TRUE
     LEFT JOIN LATERAL (
          SELECT s.status, s.reviewed_at
            FROM crm_trip_settlements s
           WHERE s.trip_id = t.id
        ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
           LIMIT 1
        ) ts ON TRUE
         ${where}
     ORDER BY CASE t.status
                WHEN 'draft' THEN 1
                WHEN 'in_progress' THEN 2
                WHEN 'confirmed' THEN 3
                WHEN 'planning' THEN 4
                WHEN 'completed' THEN 5
                ELSE 6
              END,
              t.departure_date ASC,
              t.id DESC
        LIMIT ${limit}`,
      params
    );

    // Only fetch rep names for managers who can see other reps' trips
    let rows = result.rows;
    if (isFullAccess) {
      const repIds = [...new Set(result.rows.map(r => r.rep_id).filter(Boolean))];
      let repNameMap = {};
      if (repIds.length > 0) {
        try {
          const nameRes = await authPool.query(
            `SELECT id, name FROM users WHERE id = ANY($1)`,
            [repIds]
          );
          nameRes.rows.forEach(u => { repNameMap[u.id] = u.name; });
        } catch { /* auth DB may be unavailable */ }
      }
      rows = result.rows.map(r => ({ ...r, rep_name: repNameMap[r.rep_id] || null }));
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching field trips', err);
    res.status(500).json({ success: false, error: 'Failed to fetch field trips' });
  }
});

// POST /api/crm/field-trips
router.post('/field-trips', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      country,
      country_code,
      cities,
      departure_date,
      return_date,
      travel_notes,
      objectives,
      status,
      rep_id,
      stops,
      legs,
      trip_type,
      budget_estimate,
      transport_mode,
      accommodation,
      visa_required,
      visa_details,
      predeparture_checklist,
      destination_countries,
    } = req.body;

    const isDraft = status === 'draft';

    // Drafts can be saved incomplete — only enforce validation for non-draft trips
    if (!isDraft) {
      if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, error: 'title is required' });
      }
      if (!departure_date) {
        return res.status(400).json({ success: false, error: 'departure_date is required' });
      }
      if (!return_date) {
        return res.status(400).json({ success: false, error: 'return_date is required' });
      }
      if (new Date(return_date) < new Date(departure_date)) {
        return res.status(400).json({ success: false, error: 'return_date cannot be before departure_date' });
      }
    }
    if (Array.isArray(stops) && stops.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 stops per trip' });
    }

    const isFullAccess = hasFullAccess(req.user);
    const targetRepId = isFullAccess && rep_id ? parseInt(rep_id, 10) : userId;

    const tripResult = await pool.query(
      `INSERT INTO crm_field_trips
        (rep_id, title, country, country_code, cities, departure_date, return_date, travel_notes, objectives, status,
         trip_type, budget_estimate, transport_mode, accommodation, visa_required, visa_details, predeparture_checklist, co_travellers, destination_countries)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        targetRepId,
        title ? String(title).trim() : (isDraft ? 'Untitled Trip' : ''),
        country || null,
        country_code || null,
        JSON.stringify(Array.isArray(cities) ? cities : []),
        departure_date || null,
        return_date || null,
        travel_notes || null,
        objectives || null,
        status || 'planning',
        trip_type || 'local',
        budget_estimate || null,
        transport_mode || null,
        accommodation || null,
        visa_required || false,
        visa_details ? JSON.stringify(visa_details) : '{}',
        predeparture_checklist ? JSON.stringify(predeparture_checklist) : '[]',
        Array.isArray(req.body.co_travellers) && req.body.co_travellers.length > 0 ? req.body.co_travellers : null,
        Array.isArray(destination_countries) ? JSON.stringify(destination_countries) : '[]',
      ]
    );

    const trip = tripResult.rows[0];

    if (Array.isArray(stops) && stops.length > 0) {
      for (let i = 0; i < stops.length; i += 1) {
        const s = stops[i] || {};
        const normalizedStopType = normalizeStopType(s.stop_type);
        await pool.query(
          `INSERT INTO crm_field_trip_stops
            (trip_id, stop_order, stop_type, customer_id, prospect_id, visit_date, visit_time,
             duration_mins, latitude, longitude, address_snapshot, objectives, pre_visit_notes,
             contact_person, contact_phone, contact_email,
             stop_city, stop_country, planned_eta, est_drive_km, est_drive_sec, transport_to_next, custom_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            trip.id,
            s.stop_order || i + 1,
            normalizedStopType,
            s.customer_id || null,
            s.prospect_id || null,
            s.visit_date || null,
            s.visit_time || null,
            s.duration_mins || 60,
            s.latitude || null,
            s.longitude || null,
            s.address_snapshot || null,
            s.objectives || null,
            s.pre_visit_notes || null,
            s.contact_person || null,
            s.contact_phone || null,
            s.contact_email || null,
            s.stop_city || null,
            s.stop_country || null,
            s.planned_eta || null,
            s.est_drive_km || null,
            s.est_drive_sec || null,
            s.transport_to_next || null,
            s.custom_label || null,
          ]
        );
      }

      await upsertGlobalLocationsForTrip(pool, trip.id, stops, req.user.id, country_code || null);
    }

    // Insert transport legs if provided
    if (Array.isArray(legs) && legs.length > 0) {
      for (let i = 0; i < legs.length; i += 1) {
        const l = legs[i] || {};
        await pool.query(
          `INSERT INTO crm_field_trip_legs
            (trip_id, leg_order, mode, from_label, to_label, dep_datetime, arr_datetime,
             airline, flight_number, dep_airport, arr_airport, seat_class, booking_ref,
             rental_company, rental_ref, est_km, train_operator, train_number, train_class, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            trip.id, i + 1, l.mode || 'car', l.from_label || null, l.to_label || null,
            l.dep_datetime || null, l.arr_datetime || null,
            l.airline || null, l.flight_number || null, l.dep_airport || null, l.arr_airport || null,
            l.seat_class || null, l.booking_ref || null,
            l.rental_company || null, l.rental_ref || null, l.est_km || null,
            l.train_operator || null, l.train_number || null, l.train_class || null, l.notes || null,
          ]
        );
      }
    }

    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error creating field trip', err);
    res.status(500).json({ success: false, error: 'Failed to create field trip' });
  }
});

// ── Clone a trip ──────────────────────────────────────────────────────────────
router.post('/field-trips/:id/clone', authenticate, async (req, res) => {
  const tripId = parseInt(req.params.id, 10);
  if (isNaN(tripId)) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

  const client = await pool.connect();
  try {
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found' });

    await client.query('BEGIN');

    // Clone trip with blank dates and planning status
    const tripRes = await client.query(`
      INSERT INTO crm_field_trips (
        rep_id, title, country, country_code, cities, departure_date, return_date,
        travel_notes, objectives, status, trip_type, budget_estimate, transport_mode,
        accommodation, visa_required, visa_details, predeparture_checklist, co_travellers,
        destination_countries, cloned_from_trip_id
      ) VALUES (
        $1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1,
        $6, $7, 'planning', $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17
      ) RETURNING id
    `, [
      trip.rep_id,
      `${trip.title} (Copy)`,
      trip.country, trip.country_code, JSON.stringify(trip.cities || []),
      trip.travel_notes, trip.objectives,
      trip.trip_type, trip.budget_estimate, trip.transport_mode,
      trip.accommodation, trip.visa_required || false,
      JSON.stringify(trip.visa_details || {}),
      JSON.stringify(trip.predeparture_checklist || []),
      trip.co_travellers,
      JSON.stringify(trip.destination_countries || []),
      tripId,
    ]);
    const newTripId = tripRes.rows[0].id;

    // Clone stops (without outcomes or check-in data)
    const stopsRes = await client.query(
      `SELECT stop_order, stop_type, customer_id, prospect_id, duration_mins,
              latitude, longitude, address_snapshot, objectives, pre_visit_notes,
              contact_person, contact_phone, contact_email,
              stop_city, stop_country, custom_label, transport_to_next
       FROM crm_field_trip_stops WHERE trip_id = $1 ORDER BY stop_order`,
      [tripId]
    );
    for (const s of stopsRes.rows) {
      await client.query(`
        INSERT INTO crm_field_trip_stops (
          trip_id, stop_order, stop_type, customer_id, prospect_id, duration_mins,
          latitude, longitude, address_snapshot, objectives, pre_visit_notes,
          contact_person, contact_phone, contact_email,
          stop_city, stop_country, custom_label, transport_to_next
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [
        newTripId, s.stop_order, s.stop_type, s.customer_id, s.prospect_id,
        s.duration_mins, s.latitude, s.longitude, s.address_snapshot,
        s.objectives, s.pre_visit_notes, s.contact_person, s.contact_phone, s.contact_email,
        s.stop_city || null, s.stop_country || null, s.custom_label || null, s.transport_to_next || null,
      ]);
    }

    // Clone legs (without dates)
    const legsRes = await client.query(
      `SELECT leg_order, mode, from_label, to_label, airline, flight_number,
              dep_airport, arr_airport, seat_class, booking_ref, rental_company,
              rental_ref, est_km, train_operator, train_number, train_class, notes
       FROM crm_field_trip_legs WHERE trip_id = $1 ORDER BY leg_order`,
      [tripId]
    );
    for (const l of legsRes.rows) {
      await client.query(`
        INSERT INTO crm_field_trip_legs (
          trip_id, leg_order, mode, from_label, to_label, airline, flight_number,
          dep_airport, arr_airport, seat_class, booking_ref, rental_company,
          rental_ref, est_km, train_operator, train_number, train_class, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [
        newTripId, l.leg_order, l.mode, l.from_label, l.to_label,
        l.airline, l.flight_number, l.dep_airport, l.arr_airport,
        l.seat_class, l.booking_ref, l.rental_company, l.rental_ref,
        l.est_km, l.train_operator, l.train_number, l.train_class, l.notes,
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { id: newTripId } });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('CRM: error cloning field trip', err);
    res.status(500).json({ success: false, error: 'Failed to clone trip' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES (must be defined before :id to avoid Express matching them as IDs)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/field-trips/locations?country=Saudi%20Arabia&label=airport&q=king&limit=20
router.get('/field-trips/locations', authenticate, async (req, res) => {
  try {
    const country = String(req.query.country || '').trim();
    const q = String(req.query.q || '').trim();
    const label = normalizeLocationLabel(req.query.label);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    if (!country) {
      return res.status(400).json({ success: false, error: 'country param required' });
    }

    const params = [country];
    const where = ['LOWER(country) = LOWER($1)'];

    if (label) {
      params.push(label);
      where.push(`label = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`name ILIKE $${params.length}`);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT id,
              name,
              label,
              country,
              country_code_2,
              city,
              address,
              latitude,
              longitude,
              use_count,
              last_used_at,
              source
         FROM crm_locations
        WHERE ${where.join(' AND ')}
     ORDER BY last_used_at DESC NULLS LAST, use_count DESC, name ASC
        LIMIT $${params.length}`,
      params
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        label: r.label,
        country: r.country,
        country_code_2: r.country_code_2,
        city: r.city,
        address: r.address,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        use_count: Number(r.use_count) || 0,
        last_used_at: r.last_used_at,
        source: r.source,
      })),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ success: true, data: [] });
    }
    logger.error('CRM: error fetching shared locations', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch shared locations' });
  }
});

// GET /api/crm/field-trips/geocode?address=...&countryCode=SA
router.get('/field-trips/geocode', authenticate, async (req, res) => {
  const { address, countryCode } = req.query;
  if (!address) return res.status(400).json({ success: false, error: 'address param required' });
  try {
    // Restrict results to the given ISO-2 country code when provided (improves accuracy)
    const countryParam = countryCode ? `&countrycodes=${encodeURIComponent(String(countryCode).toLowerCase())}` : '';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=10&addressdetails=1&accept-language=en${countryParam}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PPH-26.2-CRM/1.0 (internal)' }
    });
    const data = await response.json();
    const results = data.map(r => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      city: r.address?.city || r.address?.town || r.address?.village || '',
      country: r.address?.country || '',
      address: r.address || null,
    }));
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Geocoding failed' });
  }
});

// GET /api/crm/field-trips/reverse-geocode?lat=...&lng=...
router.get('/field-trips/reverse-geocode', authenticate, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, error: 'lat and lng params are required' });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=12&addressdetails=1&accept-language=en`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PPH-26.2-CRM/1.0 (internal)' }
    });
    if (!response.ok) {
      return res.json({
        success: true,
        data: {
          display_name: null,
          lat,
          lng,
          city: null,
          country: null,
          address: null,
          fallback: true,
          message: `Reverse geocoder returned HTTP ${response.status}`,
        },
      });
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      return res.json({
        success: true,
        data: {
          display_name: null,
          lat,
          lng,
          city: null,
          country: null,
          address: null,
          fallback: true,
          message: 'Reverse geocoder returned an invalid payload',
        },
      });
    }

    const address = data?.address || {};
    return res.json({
      success: true,
      data: {
        display_name: data?.display_name || null,
        lat,
        lng,
        city: address?.city || address?.town || address?.village || address?.municipality || address?.county || null,
        country: address?.country || null,
        address,
        fallback: false,
      },
    });
  } catch (err) {
    return res.json({
      success: true,
      data: {
        display_name: null,
        lat,
        lng,
        city: null,
        country: null,
        address: null,
        fallback: true,
        message: 'Reverse geocoding unavailable',
      },
    });
  }
});

// GET /api/crm/field-trips/route-geometry?coordinates=lng,lat;lng,lat;...
router.get('/field-trips/route-geometry', authenticate, async (req, res) => {
  const raw = String(req.query.coordinates || '').trim();
  if (!raw) {
    return res.status(400).json({ success: false, error: 'coordinates param required' });
  }

  const pairs = raw.split(';').map((p) => p.trim()).filter(Boolean);
  if (pairs.length < 2) {
    return res.status(400).json({ success: false, error: 'at least 2 coordinate pairs are required' });
  }
  if (pairs.length > 50) {
    return res.status(400).json({ success: false, error: 'too many points (max 50)' });
  }

  const fallbackLatLngs = [];

  for (const pair of pairs) {
    const [lngStr, latStr] = pair.split(',').map((v) => v.trim());
    const lng = Number(lngStr);
    const lat = Number(latStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, error: `invalid coordinate pair: ${pair}` });
    }
    fallbackLatLngs.push([lat, lng]);
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(raw)}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(osrmUrl, { headers: { 'User-Agent': 'PPH-26.2-CRM/1.0 (internal)' } });
    const data = await response.json();

    if (!response.ok || data?.code !== 'Ok' || !Array.isArray(data?.routes) || data.routes.length === 0) {
      const msg = data?.message || 'Routing service unavailable';
      return res.json({
        success: true,
        data: {
          latlngs: fallbackLatLngs,
          distance_m: 0,
          duration_s: 0,
          source: 'direct',
          fallback: true,
          message: msg,
        },
      });
    }

    const route = data.routes[0];
    const coords = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : [];
    if (coords.length < 2) {
      return res.json({
        success: true,
        data: {
          latlngs: fallbackLatLngs,
          distance_m: 0,
          duration_s: 0,
          source: 'direct',
          fallback: true,
          message: 'No route geometry returned',
        },
      });
    }

    const latlngs = coords.map(([lng, lat]) => [lat, lng]);
    return res.json({
      success: true,
      data: {
        latlngs,
        distance_m: Number(route.distance) || 0,
        duration_s: Number(route.duration) || 0,
        source: 'osrm',
        fallback: false,
      },
    });
  } catch (err) {
    return res.json({
      success: true,
      data: {
        latlngs: fallbackLatLngs,
        distance_m: 0,
        duration_s: 0,
        source: 'direct',
        fallback: true,
        message: 'Failed to fetch route geometry',
      },
    });
  }
});

// GET /api/crm/field-trips/fx-rates
router.get('/field-trips/fx-rates', authenticate, async (req, res) => {
  try {
    const baseCurrencyObj = await currencyService.getBaseCurrency();
    const baseCurrency = String(baseCurrencyObj?.code || 'AED').toUpperCase();

    const rows = await pool.query(
      `SELECT DISTINCT ON (from_currency) from_currency, to_currency, rate, effective_date
       FROM crm_fx_rates
       WHERE to_currency = $1
       ORDER BY from_currency, effective_date DESC`,
      [baseCurrency]
    );

    const map = {};
    rows.rows.forEach(r => { map[r.from_currency] = parseFloat(r.rate); });

    if (Object.keys(map).length === 0) {
      try {
        const currencies = await currencyService.getCurrencies();
        for (const curr of currencies) {
          const code = String(curr?.code || '').toUpperCase();
          if (!code || code === baseCurrency) continue;
          const rate = await currencyService.getExchangeRate(code, baseCurrency);
          if (rate !== null) map[code] = parseFloat(rate);
        }
      } catch (_) {
        // Non-fatal fallback below
      }
    }

    map[baseCurrency] = 1;
    res.json({ success: true, base_currency: baseCurrency, data: map });
  } catch (err) {
    if (err.code === '42P01') {
      const baseCurrencyObj = await currencyService.getBaseCurrency().catch(() => ({ code: 'AED' }));
      const baseCurrency = String(baseCurrencyObj?.code || 'AED').toUpperCase();
      return res.json({ success: true, base_currency: baseCurrency, data: { [baseCurrency]: 1 } });
    }
    res.status(500).json({ success: false, error: 'Failed to fetch FX rates' });
  }
});

// GET /api/crm/field-trips/pending-my-approval
router.get('/field-trips/pending-my-approval', authenticate, async (req, res) => {
  try {
    const { id: managerId } = req.user;
    if (!hasFullAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Managers only' });
    }

    const managedRepIds = await getManagedRepIds(managerId);

    const params = [];
    let where = `WHERE t.status = 'pending_approval'`;

    if (Array.isArray(managedRepIds)) {
      if (managedRepIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      params.push(managedRepIds);
      where += ` AND t.rep_id = ANY($1)`;
    }

    const result = await pool.query(
      `SELECT t.*,
              COALESCE(s.stop_count, 0) AS stop_count,
            COALESCE(s.visited_count, 0) AS visited_count,
            tr.status AS travel_report_status,
            tr.reviewed_at AS travel_report_reviewed_at,
            ts.status AS settlement_status,
            ts.reviewed_at AS settlement_reviewed_at
         FROM crm_field_trips t
    LEFT JOIN (
           SELECT trip_id,
                  COUNT(*) AS stop_count,
                  COUNT(*) FILTER (WHERE outcome_status = 'visited') AS visited_count
             FROM crm_field_trip_stops
         GROUP BY trip_id
            ) s ON s.trip_id = t.id
     LEFT JOIN LATERAL (
          SELECT r.status, r.reviewed_at
           FROM crm_travel_reports r
          WHERE r.trip_id = t.id
        ORDER BY r.created_at DESC
          LIMIT 1
        ) tr ON TRUE
     LEFT JOIN LATERAL (
          SELECT sl.status, sl.reviewed_at
            FROM crm_trip_settlements sl
           WHERE sl.trip_id = t.id
        ORDER BY sl.updated_at DESC NULLS LAST, sl.id DESC
           LIMIT 1
        ) ts ON TRUE
         ${where}
     ORDER BY t.submitted_for_approval_at DESC NULLS LAST, t.id DESC
        LIMIT 200`,
      params
    );

    const repIds = [...new Set(result.rows.map((r) => r.rep_id).filter(Boolean))];
    let repNameMap = {};
    if (repIds.length > 0) {
      try {
        const nameRes = await authPool.query(`SELECT id, name FROM users WHERE id = ANY($1)`, [repIds]);
        nameRes.rows.forEach((u) => { repNameMap[u.id] = u.name; });
      } catch (_) {
        repNameMap = {};
      }
    }

    const rows = result.rows.map((r) => ({ ...r, rep_name: repNameMap[r.rep_id] || null }));
    res.json({ success: true, data: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching pending approvals for manager', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pending approvals' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/crm/field-trips/:id/full — full trip replace (metadata + stops + legs)
// Used by auto-save and final save to replace all trip data atomically.
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/field-trips/:id/full', authenticate, async (req, res) => {
  const tripId = parseInt(req.params.id, 10);
  if (isNaN(tripId)) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

  const existing = await getTripById(tripId, req.user);
  if (!existing) return res.status(404).json({ success: false, error: 'Field trip not found' });

  const {
    title, country, country_code, cities, departure_date, return_date,
    travel_notes, objectives, status, stops, legs,
    trip_type, budget_estimate, transport_mode, accommodation,
    visa_required, visa_details, predeparture_checklist, co_travellers,
    destination_countries,
  } = req.body;

  if (Array.isArray(stops) && stops.length > 50) {
    return res.status(400).json({ success: false, error: 'Maximum 50 stops per trip' });
  }

  // Status transition validation
  const newStatus = status || existing.status;
  if (status && status !== existing.status) {
    const VALID_TRANSITIONS = {
      draft:       ['planning', 'cancelled'],
      planning:    ['pending_approval', 'cancelled'],
      pending_approval: ['confirmed', 'planning', 'cancelled'],
      confirmed:   ['planning', 'in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed:   [],
      cancelled:   ['planning'],
    };
    const allowed = VALID_TRANSITIONS[existing.status];
    if (allowed && !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${status}'` });
    }

    if (status === 'completed') {
      const reportApproved = await isTravelReportApprovedForTrip(tripId);
      if (!reportApproved) {
        return res.status(400).json({ success: false, error: 'Trip can be completed only after travel report is approved' });
      }
      const settlementApproved = await isSettlementApprovedForTrip(tripId);
      if (!settlementApproved) {
        return res.status(400).json({ success: false, error: 'Trip can be completed only after settlement is approved' });
      }
    }
    if (status === 'in_progress') {
      if (existing.approval_decision !== 'approved') {
        return res.status(400).json({ success: false, error: 'Trip must be approved before starting' });
      }
      if (existing.advance_status !== 'disbursed') {
        return res.status(400).json({ success: false, error: 'Advance must be disbursed by Accounts before starting trip' });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update trip metadata
    await client.query(
      `UPDATE crm_field_trips SET
        title = $2, country = $3, country_code = $4, cities = $5,
        departure_date = $6, return_date = $7, travel_notes = $8, objectives = $9,
        status = $10, trip_type = $11, budget_estimate = $12, transport_mode = $13,
        accommodation = $14, visa_required = $15, visa_details = $16,
        predeparture_checklist = $17, co_travellers = $18, destination_countries = $19, updated_at = NOW()
       WHERE id = $1`,
      [
        tripId,
        title != null ? String(title).trim() : existing.title,
        country ?? existing.country,
        country_code ?? existing.country_code,
        cities != null ? JSON.stringify(Array.isArray(cities) ? cities : []) : existing.cities,
        departure_date || existing.departure_date,
        return_date ?? existing.return_date,
        travel_notes ?? existing.travel_notes,
        objectives ?? existing.objectives,
        newStatus,
        trip_type ?? existing.trip_type,
        budget_estimate ?? existing.budget_estimate,
        transport_mode ?? existing.transport_mode,
        accommodation ?? existing.accommodation,
        visa_required != null ? visa_required : existing.visa_required,
        visa_details ? JSON.stringify(visa_details) : existing.visa_details,
        predeparture_checklist ? JSON.stringify(predeparture_checklist) : existing.predeparture_checklist,
        co_travellers != null ? (Array.isArray(co_travellers) && co_travellers.length > 0 ? co_travellers : null) : existing.co_travellers,
        Array.isArray(destination_countries) ? JSON.stringify(destination_countries) : (existing.destination_countries || '[]'),
      ]
    );

    // Replace stops
    if (Array.isArray(stops)) {
      await client.query('DELETE FROM crm_field_trip_stops WHERE trip_id = $1', [tripId]);
      for (let i = 0; i < stops.length; i += 1) {
        const s = stops[i] || {};
        const normalizedStopType = normalizeStopType(s.stop_type);
        await client.query(
          `INSERT INTO crm_field_trip_stops
            (trip_id, stop_order, stop_type, customer_id, prospect_id, visit_date, visit_time,
             duration_mins, latitude, longitude, address_snapshot, objectives, pre_visit_notes,
             contact_person, contact_phone, contact_email,
             stop_city, stop_country, planned_eta, est_drive_km, est_drive_sec, transport_to_next, custom_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            tripId, s.stop_order || i + 1, normalizedStopType,
            s.customer_id || null, s.prospect_id || null,
            s.visit_date || null, s.visit_time || null,
            s.duration_mins || 60, s.latitude || null, s.longitude || null,
            s.address_snapshot || null, s.objectives || null, s.pre_visit_notes || null,
            s.contact_person || null, s.contact_phone || null, s.contact_email || null,
            s.stop_city || null,
            s.stop_country || null, s.planned_eta || null,
            s.est_drive_km || null, s.est_drive_sec || null, s.transport_to_next || null,
            s.custom_label || null,
          ]
        );
      }

      await upsertGlobalLocationsForTrip(client, tripId, stops, req.user.id, country_code || existing.country_code || null);
    }

    // Replace legs
    if (Array.isArray(legs)) {
      await client.query('DELETE FROM crm_field_trip_legs WHERE trip_id = $1', [tripId]);
      for (let i = 0; i < legs.length; i += 1) {
        const l = legs[i] || {};
        await client.query(
          `INSERT INTO crm_field_trip_legs
            (trip_id, leg_order, mode, from_label, to_label, dep_datetime, arr_datetime,
             airline, flight_number, dep_airport, arr_airport, seat_class, booking_ref,
             rental_company, rental_ref, est_km, train_operator, train_number, train_class, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            tripId, i + 1, l.mode || 'car', l.from_label || null, l.to_label || null,
            l.dep_datetime || null, l.arr_datetime || null,
            l.airline || null, l.flight_number || null, l.dep_airport || null, l.arr_airport || null,
            l.seat_class || null, l.booking_ref || null,
            l.rental_company || null, l.rental_ref || null, l.est_km || null,
            l.train_operator || null, l.train_number || null, l.train_class || null, l.notes || null,
          ]
        );
      }
    }

    await client.query('COMMIT');

    const updated = await pool.query('SELECT * FROM crm_field_trips WHERE id = $1', [tripId]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error replacing field trip', err);
    res.status(500).json({ success: false, error: 'Failed to update field trip' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED ROUTES (:id)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/field-trips/:id
router.get('/field-trips/:id', authenticate, async (req, res) => {
  try {
    if (Date.now() - _lastAutoCompleteTs > AUTO_COMPLETE_DEBOUNCE_MS) {
      _lastAutoCompleteTs = Date.now();
      await autoCompleteExpiredTrips(req.user);
    }

    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const stopsRes = await pool.query(
      `SELECT s.*,
              cu.display_name AS customer_name,
              cu.primary_country AS customer_country,
              cu.city AS customer_city,
              fp.customer_name AS prospect_name,
              fp.country AS prospect_country
         FROM crm_field_trip_stops s
    LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
    LEFT JOIN fp_prospects fp ON fp.id = s.prospect_id
        WHERE s.trip_id = $1
     ORDER BY s.stop_order ASC, s.id ASC`,
      [tripId]
    );

    const legsRes = await pool.query(
      `SELECT * FROM crm_field_trip_legs WHERE trip_id = $1 ORDER BY leg_order ASC`,
      [tripId]
    );

    let canReviewApproval = false;
    if (trip.status === 'pending_approval' && hasFullAccess(req.user)) {
      canReviewApproval = await canManagerReviewRep(req.user.id, trip.rep_id);
    }

    let repName = null;
    let repEmail = null;
    if (trip.rep_id) {
      try {
        const repRes = await authPool.query(
          `SELECT
              COALESCE(
                NULLIF(TRIM(to_jsonb(users)->>'full_name'), ''),
                NULLIF(TRIM(name), ''),
                email
              ) AS display_name,
              email
           FROM users
          WHERE id = $1
          LIMIT 1`,
          [trip.rep_id]
        );
        repName = repRes.rows[0]?.display_name || null;
        repEmail = repRes.rows[0]?.email || null;
      } catch (_) {
        repName = null;
        repEmail = null;
      }
    }

    res.json({
      success: true,
      data: {
        ...trip,
        rep_name: repName,
        rep_email: repEmail,
        stops: stopsRes.rows,
        legs: legsRes.rows,
        can_review_approval: canReviewApproval,
      }
    });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: 'Field trip tables not found' });
    logger.error('CRM: error fetching field trip detail', err);
    res.status(500).json({ success: false, error: 'Failed to fetch field trip detail' });
  }
});

// PATCH /api/crm/field-trips/:id
router.patch('/field-trips/:id', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const current = await getTripById(tripId, req.user);
    if (!current) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const allowedStatus = ['draft', 'planning', 'pending_approval', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    const VALID_TRANSITIONS = {
      draft:       ['planning', 'cancelled'],
      planning:    ['pending_approval', 'cancelled'],
      pending_approval: ['confirmed', 'planning', 'cancelled'],
      confirmed:   ['planning', 'in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed:   [],
      cancelled:   ['planning'],
    };
    const {
      title,
      country,
      cities,
      departure_date,
      return_date,
      status,
      travel_notes,
      objectives,
    } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (title !== undefined)          { sets.push(`title = $${p++}`); params.push(title); }
    if (country !== undefined)        { sets.push(`country = $${p++}`); params.push(country); }
    if (cities !== undefined)         { sets.push(`cities = $${p++}`); params.push(JSON.stringify(Array.isArray(cities) ? cities : [])); }
    if (departure_date !== undefined) { sets.push(`departure_date = $${p++}`); params.push(departure_date); }
    if (return_date !== undefined)    { sets.push(`return_date = $${p++}`); params.push(return_date); }
    if (travel_notes !== undefined)   { sets.push(`travel_notes = $${p++}`); params.push(travel_notes); }
    if (objectives !== undefined)     { sets.push(`objectives = $${p++}`); params.push(objectives); }
    if (req.body.trip_type !== undefined)       { sets.push(`trip_type = $${p++}`); params.push(req.body.trip_type); }
    if (req.body.budget_estimate !== undefined) { sets.push(`budget_estimate = $${p++}`); params.push(req.body.budget_estimate); }
    if (req.body.transport_mode !== undefined)  {
      // Accept array (multi-mode) or string; normalize to DB-safe string
      const tm = req.body.transport_mode;
      const tmVal = Array.isArray(tm) ? (tm.length === 1 ? tm[0] : JSON.stringify(tm)) : (tm || null);
      sets.push(`transport_mode = $${p++}`); params.push(tmVal);
    }
    if (req.body.accommodation !== undefined)   { sets.push(`accommodation = $${p++}`); params.push(req.body.accommodation); }
    if (req.body.visa_required !== undefined)   { sets.push(`visa_required = $${p++}`); params.push(Boolean(req.body.visa_required)); }
    if (req.body.country_code !== undefined)    { sets.push(`country_code = $${p++}`); params.push(req.body.country_code); }

    if (status !== undefined) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }
      const allowed = VALID_TRANSITIONS[current.status];
      if (allowed && !allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `Cannot transition from '${current.status}' to '${status}'` });
      }
      if (status === 'completed') {
        const reportApproved = await isTravelReportApprovedForTrip(tripId);
        if (!reportApproved) {
          return res.status(400).json({ success: false, error: 'Trip can be completed only after travel report is approved' });
        }
        const settlementApproved = await isSettlementApprovedForTrip(tripId);
        if (!settlementApproved) {
          return res.status(400).json({ success: false, error: 'Trip can be completed only after settlement is approved' });
        }
      }
      if (status === 'in_progress') {
        if (current.approval_decision !== 'approved') {
          return res.status(400).json({ success: false, error: 'Trip must be approved before starting' });
        }
        if (current.advance_status !== 'disbursed') {
          return res.status(400).json({ success: false, error: 'Advance must be disbursed by Accounts before starting trip' });
        }
      }
      sets.push(`status = $${p++}`);
      params.push(status);
    }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    sets.push('updated_at = NOW()');
    params.push(tripId);

    const result = await pool.query(
      `UPDATE crm_field_trips
          SET ${sets.join(', ')}
        WHERE id = $${p}
    RETURNING *`,
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error updating field trip', err);
    res.status(500).json({ success: false, error: 'Failed to update field trip' });
  }
});

// DELETE /api/crm/field-trips/:id
router.delete('/field-trips/:id', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const current = await getTripById(tripId, req.user);
    if (!current) return res.status(404).json({ success: false, error: 'Field trip not found' });

    if (!['draft', 'planning', 'cancelled'].includes(current.status)) {
      return res.status(409).json({ success: false, error: 'Only draft/planning/cancelled trips can be deleted' });
    }

    await pool.query('DELETE FROM crm_field_trips WHERE id = $1', [tripId]);
    res.json({ success: true, message: 'Field trip deleted' });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: 'Field trip tables not found' });
    logger.error('CRM: error deleting field trip', err);
    res.status(500).json({ success: false, error: 'Failed to delete field trip' });
  }
});

// POST /api/crm/field-trips/:id/stops
router.post('/field-trips/:id/stops', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (['completed', 'cancelled'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Cannot modify stops on a completed or cancelled trip' });
    }

    const {
      stop_order,
      stop_type,
      customer_id,
      prospect_id,
      visit_date,
      visit_time,
      duration_mins,
      latitude,
      longitude,
      stop_city,
      stop_country,
      address_snapshot,
      objectives,
      pre_visit_notes,
    } = req.body;

    const effectiveStopType = normalizeStopType(stop_type);

    let nextOrder = stop_order;
    if (!nextOrder) {
      const r = await pool.query('SELECT COALESCE(MAX(stop_order), 0) + 1 AS next_order FROM crm_field_trip_stops WHERE trip_id = $1', [tripId]);
      nextOrder = r.rows[0]?.next_order || 1;
    }

    const result = await pool.query(
      `INSERT INTO crm_field_trip_stops
        (trip_id, stop_order, stop_type, customer_id, prospect_id, visit_date, visit_time,
         duration_mins, latitude, longitude, stop_city, stop_country, address_snapshot, objectives, pre_visit_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tripId,
        nextOrder,
        effectiveStopType,
        customer_id || null,
        prospect_id || null,
        visit_date || null,
        visit_time || null,
        duration_mins || 60,
        latitude || null,
        longitude || null,
        stop_city || null,
        stop_country || null,
        address_snapshot || null,
        objectives || null,
        pre_visit_notes || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error creating field trip stop', err);
    res.status(500).json({ success: false, error: 'Failed to create stop' });
  }
});

// PUT /api/crm/field-trips/:id/stops/reorder
router.put('/field-trips/:id/stops/reorder', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (['completed', 'cancelled'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Cannot modify stops on a completed or cancelled trip' });
    }

    const items = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Reorder payload must be a non-empty array' });
    }

    await client.query('BEGIN');
    for (const item of items) {
      const stopId = parseInt(item.id, 10);
      const stopOrder = parseInt(item.stop_order, 10);
      if (!stopId || !stopOrder) continue;

      await client.query(
        `UPDATE crm_field_trip_stops
            SET stop_order = $1,
                updated_at = NOW()
          WHERE id = $2
            AND trip_id = $3`,
        [stopOrder, stopId, tripId]
      );
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Stops reordered successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error reordering field trip stops', err);
    res.status(500).json({ success: false, error: 'Failed to reorder stops' });
  } finally {
    client.release();
  }
});

// PATCH /api/crm/field-trips/:id/stops/:stopId
router.patch('/field-trips/:id/stops/:stopId', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const stopId = parseInt(req.params.stopId, 10);
    if (!tripId || !stopId) {
      return res.status(400).json({ success: false, error: 'Invalid IDs' });
    }

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (['completed', 'cancelled'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Cannot modify stops on a completed or cancelled trip' });
    }

    const {
      stop_order,
      stop_type,
      customer_id,
      prospect_id,
      visit_date,
      visit_time,
      duration_mins,
      latitude,
      longitude,
      stop_city,
      stop_country,
      address_snapshot,
      objectives,
      pre_visit_notes,
      outcome_notes,
      outcome_status,
      follow_ups_created,
      meeting_id,
      arrival_at,
    } = req.body;

    const sets = [];
    const params = [];
    let p = 1;

    if (stop_order !== undefined)         { sets.push(`stop_order = $${p++}`); params.push(stop_order); }
    if (stop_type !== undefined)          { sets.push(`stop_type = $${p++}`); params.push(stop_type); }
    if (customer_id !== undefined)        { sets.push(`customer_id = $${p++}`); params.push(customer_id); }
    if (prospect_id !== undefined)        { sets.push(`prospect_id = $${p++}`); params.push(prospect_id); }
    if (visit_date !== undefined)         { sets.push(`visit_date = $${p++}`); params.push(visit_date); }
    if (visit_time !== undefined)         { sets.push(`visit_time = $${p++}`); params.push(visit_time); }
    if (duration_mins !== undefined)      { sets.push(`duration_mins = $${p++}`); params.push(duration_mins); }
    if (latitude !== undefined)           { sets.push(`latitude = $${p++}`); params.push(latitude); }
    if (longitude !== undefined)          { sets.push(`longitude = $${p++}`); params.push(longitude); }
    if (stop_city !== undefined)          { sets.push(`stop_city = $${p++}`); params.push(stop_city); }
    if (stop_country !== undefined)       { sets.push(`stop_country = $${p++}`); params.push(stop_country); }
    if (address_snapshot !== undefined)   { sets.push(`address_snapshot = $${p++}`); params.push(address_snapshot); }
    if (objectives !== undefined)         { sets.push(`objectives = $${p++}`); params.push(objectives); }
    if (pre_visit_notes !== undefined)    { sets.push(`pre_visit_notes = $${p++}`); params.push(pre_visit_notes); }
    if (outcome_notes !== undefined)      { sets.push(`outcome_notes = $${p++}`); params.push(outcome_notes); }
    if (outcome_status !== undefined)     { sets.push(`outcome_status = $${p++}`); params.push(outcome_status); }
    if (follow_ups_created !== undefined) { sets.push(`follow_ups_created = $${p++}`); params.push(Boolean(follow_ups_created)); }
    if (meeting_id !== undefined)         { sets.push(`meeting_id = $${p++}`); params.push(meeting_id); }
    if (arrival_at !== undefined)         { sets.push(`arrival_at = $${p++}`); params.push(arrival_at); }
    if (req.body.contact_person !== undefined)       { sets.push(`contact_person = $${p++}`); params.push(req.body.contact_person); }
    if (req.body.contact_phone !== undefined)        { sets.push(`contact_phone = $${p++}`); params.push(req.body.contact_phone); }
    if (req.body.contact_email !== undefined)        { sets.push(`contact_email = $${p++}`); params.push(req.body.contact_email); }
    if (req.body.visit_notes !== undefined)          { sets.push(`visit_notes = $${p++}`); params.push(req.body.visit_notes); }
    if (req.body.products_discussed !== undefined)   { sets.push(`products_discussed = $${p++}`); params.push(req.body.products_discussed); }
    if (req.body.samples_delivered !== undefined)    { sets.push(`samples_delivered = $${p++}`); params.push(Boolean(req.body.samples_delivered)); }
    if (req.body.samples_provided !== undefined)     { sets.push(`samples_provided = $${p++}`); params.push(Boolean(req.body.samples_provided)); }
    if (req.body.samples_qty !== undefined)           { sets.push(`samples_qty = $${p++}`); params.push(parseInt(req.body.samples_qty, 10) || null); }
    if (req.body.quotation_requested !== undefined)  { sets.push(`quotation_requested = $${p++}`); params.push(Boolean(req.body.quotation_requested)); }
    if (req.body.next_action !== undefined)          { sets.push(`next_action = $${p++}`); params.push(req.body.next_action); }
    if (req.body.competitor_info !== undefined)      { sets.push(`competitor_info = $${p++}`); params.push(req.body.competitor_info); }
    if (req.body.visit_result !== undefined)         { sets.push(`visit_result = $${p++}`); params.push(req.body.visit_result); }
    if (req.body.order_placed !== undefined)         { sets.push(`order_placed = $${p++}`); params.push(Boolean(req.body.order_placed)); }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    sets.push('updated_at = NOW()');
    params.push(stopId, tripId);

    const result = await pool.query(
      `UPDATE crm_field_trip_stops
          SET ${sets.join(', ')}
        WHERE id = $${p++}
          AND trip_id = $${p}
    RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Stop not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Field trip tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error updating field trip stop', err);
    res.status(500).json({ success: false, error: 'Failed to update stop' });
  }
});

// DELETE /api/crm/field-trips/:id/stops/:stopId
router.delete('/field-trips/:id/stops/:stopId', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const stopId = parseInt(req.params.stopId, 10);
    if (!tripId || !stopId) return res.status(400).json({ success: false, error: 'Invalid IDs' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const result = await pool.query(
      'DELETE FROM crm_field_trip_stops WHERE id = $1 AND trip_id = $2 RETURNING id',
      [stopId, tripId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Stop not found' });
    res.json({ success: true, message: 'Stop removed' });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: 'Field trip tables not found' });
    logger.error('CRM: error deleting field trip stop', err);
    res.status(500).json({ success: false, error: 'Failed to delete stop' });
  }
});

// POST /api/crm/field-trips/:id/stops/:stopId/complete
router.post('/field-trips/:id/stops/:stopId/complete', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const tripId = parseInt(req.params.id, 10);
    const stopId = parseInt(req.params.stopId, 10);
    if (!tripId || !stopId) return res.status(400).json({ success: false, error: 'Invalid IDs' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const stopRes = await pool.query(
      `SELECT s.*,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
         FROM crm_field_trip_stops s
    LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
    LEFT JOIN fp_prospects fp ON fp.id = s.prospect_id
        WHERE s.id = $1 AND s.trip_id = $2`,
      [stopId, tripId]
    );

    if (stopRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Stop not found' });

    const stop = stopRes.rows[0];
    const { outcome_notes, outcome_status, follow_up_task } = req.body;

    await client.query('BEGIN');

    const assigneeName = await getAssigneeName(trip.rep_id);
    const meetingName = `Field Visit - ${stop.customer_name || stop.prospect_name || 'Stop'}`;

    const visitDateStr = stop.visit_date instanceof Date
      ? stop.visit_date.toISOString().split('T')[0]
      : stop.visit_date;
    const visitStart = visitDateStr
      ? `${visitDateStr} ${stop.visit_time || '09:00:00'}`
      : new Date().toISOString();

    let meetingId = null;
    try {
      await client.query('SAVEPOINT meeting_insert');
      const meetingRes = await client.query(
        `INSERT INTO crm_meetings
          (name, description, date_start, duration_mins, location, status,
           customer_id, prospect_id, assigned_to_id, assigned_to_name, created_by)
         VALUES ($1,$2,$3,$4,$5,'held',$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          meetingName,
          outcome_notes || stop.objectives || null,
          visitStart,
          stop.duration_mins || 60,
          stop.address_snapshot || null,
          stop.customer_id || null,
          stop.prospect_id || null,
          trip.rep_id,
          assigneeName,
          req.user.id,
        ]
      );
      meetingId = meetingRes.rows[0]?.id || null;
      await client.query('RELEASE SAVEPOINT meeting_insert');
    } catch (meetingErr) {
      await client.query('ROLLBACK TO SAVEPOINT meeting_insert');
      logger.warn('CRM: meeting creation skipped during stop complete', { error: meetingErr.message });
    }

    const stopUpdate = await client.query(
      `UPDATE crm_field_trip_stops
          SET outcome_status = $1,
              outcome_notes = COALESCE($2, outcome_notes),
              arrival_at = COALESCE(arrival_at, NOW()),
              meeting_id = $3,
              updated_at = NOW()
        WHERE id = $4
          AND trip_id = $5
      RETURNING *`,
      [outcome_status || 'visited', outcome_notes || null, meetingId, stopId, tripId]
    );

    try {
      await client.query(
        `INSERT INTO crm_activities
          (type, activity_type, customer_id, prospect_id, rep_id, rep_name, activity_date, duration_mins, outcome_note)
         VALUES ('visit', 'visit', $1, $2, $3, $4, NOW(), $5, $6)`,
        [
          stop.customer_id || null,
          stop.prospect_id || null,
          trip.rep_id,
          assigneeName,
          stop.duration_mins || 60,
          outcome_notes || null,
        ]
      );
    } catch (_) {
      // Non-blocking: table shape can differ in older installs.
    }

    let createdTask = null;
    if (follow_up_task && follow_up_task.title && follow_up_task.due_date) {
      const taskRes = await client.query(
        `INSERT INTO crm_tasks
          (title, description, due_date, priority, assignee_id, assignee_name, customer_id, prospect_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          follow_up_task.title,
          follow_up_task.description || outcome_notes || null,
          follow_up_task.due_date,
          follow_up_task.priority || 'medium',
          trip.rep_id,
          assigneeName,
          stop.customer_id || null,
          stop.prospect_id || null,
          req.user.id,
        ]
      );
      createdTask = taskRes.rows[0];

      await client.query(
        'UPDATE crm_field_trip_stops SET follow_ups_created = true, updated_at = NOW() WHERE id = $1',
        [stopId]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        stop: stopUpdate.rows[0],
        meeting_id: meetingId,
        follow_up_task: createdTask,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Required CRM tables are not yet created. Run migrations.' });
    }
    logger.error('CRM: error completing field trip stop', err);
    res.status(500).json({ success: false, error: 'Failed to complete stop' });
  } finally {
    client.release();
  }
});

// GET /api/crm/field-trips/:id/route-preview
router.get('/field-trips/:id/route-preview', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const stopsRes = await pool.query(
      `SELECT s.id, s.stop_order, s.stop_type, s.visit_date, s.visit_time, s.duration_mins,
              s.latitude, s.longitude, s.address_snapshot, s.objectives,
              s.outcome_status, s.customer_id, s.prospect_id,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
         FROM crm_field_trip_stops s
    LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
    LEFT JOIN fp_prospects fp ON fp.id = s.prospect_id
        WHERE s.trip_id = $1
     ORDER BY s.stop_order ASC, s.id ASC`,
      [tripId]
    );

    res.json({
      success: true,
      data: {
        trip,
        stops: stopsRes.rows,
      },
    });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: 'Field trip tables not found' });
    logger.error('CRM: error generating route preview', err);
    res.status(500).json({ success: false, error: 'Failed to build route preview' });
  }
});

// GET /api/crm/field-trips/:id/report
router.get('/field-trips/:id/report', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const stopsRes = await pool.query(
      `SELECT s.stop_order, s.stop_type, s.visit_date, s.visit_time, s.duration_mins,
              s.outcome_status, s.outcome_notes,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
         FROM crm_field_trip_stops s
    LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
    LEFT JOIN fp_prospects fp ON fp.id = s.prospect_id
        WHERE s.trip_id = $1
     ORDER BY s.stop_order ASC`,
      [tripId]
    );

    const stops = stopsRes.rows;
    const totalStops = stops.length;
    const visited = stops.filter((s) => s.outcome_status === 'visited').length;
    const noShow = stops.filter((s) => s.outcome_status === 'no_show').length;
    const postponed = stops.filter((s) => s.outcome_status === 'postponed').length;

    const rowsHtml = stops
      .map((s) => {
        const name = s.customer_name || s.prospect_name || 'Unlinked stop';
        return `<tr>
  <td>${s.stop_order}</td>
  <td>${name}</td>
  <td>${s.stop_type}</td>
  <td>${s.visit_date || ''} ${s.visit_time || ''}</td>
  <td>${s.outcome_status || 'planned'}</td>
  <td>${s.outcome_notes || ''}</td>
</tr>`;
      })
      .join('\n');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Field Trip Report - ${trip.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    h1 { margin-bottom: 8px; }
    .meta { margin-bottom: 16px; color: #4b5563; }
    .kpi { display: inline-block; margin-right: 16px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>${trip.title}</h1>
  <div class="meta">${trip.country || 'N/A'} | ${trip.departure_date || ''} to ${trip.return_date || ''}</div>
  <div class="kpi">Total Stops: <strong>${totalStops}</strong></div>
  <div class="kpi">Visited: <strong>${visited}</strong></div>
  <div class="kpi">No Show: <strong>${noShow}</strong></div>
  <div class="kpi">Postponed: <strong>${postponed}</strong></div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Stop</th>
        <th>Type</th>
        <th>Plan</th>
        <th>Outcome</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    res.json({
      success: true,
      data: {
        trip,
        summary: { totalStops, visited, noShow, postponed },
        html,
      },
    });
  } catch (err) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: 'Field trip tables not found' });
    logger.error('CRM: error generating field trip report', err);
    res.status(500).json({ success: false, error: 'Failed to generate field trip report' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/field-trips/:id/travel-report
router.get('/field-trips/:id/travel-report', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['in_progress', 'completed'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Travel report is available only after the trip is started' });
    }

    const [rpt, exp, adj] = await Promise.all([
      pool.query(
        `SELECT r.* FROM crm_travel_reports r WHERE r.trip_id = $1 ORDER BY r.created_at DESC LIMIT 1`,
        [tripId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, category, COUNT(*) AS cnt
           FROM crm_trip_expenses WHERE trip_id = $1
          GROUP BY category ORDER BY total DESC`,
        [tripId]
      ),
      pool.query(
        `SELECT a.* FROM crm_trip_adjustments a WHERE a.trip_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
        [tripId]
      ),
    ]);

    // Resolve user names from auth DB
    const report = rpt.rows[0] || null;
    const adjustments = adj.rows;
    const userIds = [
      ...(report ? [report.submitted_by, report.reviewed_by] : []),
      ...adjustments.map((a) => a.adjusted_by),
    ].filter(Boolean);
    let nameMap = {};
    if (userIds.length > 0) {
      try {
        const nameRes = await authPool.query(`SELECT id, name AS full_name FROM users WHERE id = ANY($1)`, [[...new Set(userIds)]]);
        nameRes.rows.forEach((u) => { nameMap[u.id] = u.full_name; });
      } catch (_) { /* ignore */ }
    }
    if (report) {
      report.submitted_by_name = nameMap[report.submitted_by] || null;
      report.reviewed_by_name = nameMap[report.reviewed_by] || null;
    }
    const enrichedAdj = adjustments.map((a) => ({ ...a, adjusted_by_name: nameMap[a.adjusted_by] || null }));

    res.json({
      success: true,
      data: {
        report,
        expenses: { summary: exp.rows },
        adjustments: enrichedAdj,
      },
    });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: { report: null, expenses: { summary: [] }, adjustments: [] } });
    logger.error('CRM: error fetching travel report', err);
    res.status(500).json({ success: false, error: 'Failed to fetch travel report' });
  }
});

// POST /api/crm/field-trips/:id/travel-report
router.post('/field-trips/:id/travel-report', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['in_progress', 'completed'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Travel report can be filled only after the trip is started' });
    }

    const { summary, key_outcomes, challenges, recommendations, next_steps, submit } = req.body;
    const status = submit ? 'submitted' : 'draft';
    const submitted_at = submit ? new Date().toISOString() : null;

    // Upsert: max one report per trip
    const existing = await pool.query('SELECT id, status FROM crm_travel_reports WHERE trip_id = $1 LIMIT 1', [tripId]);
    if (existing.rows.length && existing.rows[0].status === 'approved') {
      return res.status(409).json({ success: false, error: 'Cannot modify an already-approved travel report' });
    }
    let report;

    if (existing.rows.length) {
      report = await pool.query(
        `UPDATE crm_travel_reports
            SET summary = $1, key_outcomes = $2, challenges = $3, recommendations = $4, next_steps = $5,
                status = $6, submitted_at = COALESCE($7, submitted_at), updated_at = NOW()
          WHERE trip_id = $8
        RETURNING *`,
        [summary, key_outcomes, challenges, recommendations, next_steps, status, submitted_at, tripId]
      );
    } else {
      report = await pool.query(
        `INSERT INTO crm_travel_reports (trip_id, submitted_by, summary, key_outcomes, challenges, recommendations, next_steps, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [tripId, req.user.id, summary, key_outcomes, challenges, recommendations, next_steps, status, submitted_at]
      );
    }

    res.json({ success: true, data: report.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Travel report tables not yet created' });
    logger.error('CRM: error saving travel report', err);
    res.status(500).json({ success: false, error: 'Failed to save travel report' });
  }
});

// PATCH /api/crm/field-trips/:id/travel-report/review
router.patch('/field-trips/:id/travel-report/review', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!hasFullAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Only managers can review travel reports' });
    }

    const tripId = parseInt(req.params.id, 10);
    const { status, manager_comments } = req.body;
    const validStatuses = ['approved', 'rejected', 'revision_requested'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid review status' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE crm_travel_reports
          SET status = $1, manager_comments = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
        WHERE trip_id = $4
      RETURNING *`,
      [status, manager_comments || null, req.user.id, tripId]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Travel report not found' });
    }

    // Trip will be auto-completed only when BOTH travel report and settlement are approved.

    await client.query('COMMIT');

    if (status === 'approved') {
      await tryCompleteTripIfReady(tripId);
      try {
        const tripRes = await pool.query(
          `SELECT id, title, rep_id FROM crm_field_trips WHERE id = $1 LIMIT 1`,
          [tripId]
        );
        const trip = tripRes.rows[0];
        if (trip) {
          await notifyAccountsApprovalCopy({
            tripId: Number(trip.id),
            tripTitle: trip.title,
            repId: trip.rep_id,
            managerId: req.user.id,
            approvalStage: 'travel_report',
            comments: manager_comments,
          });
        }
      } catch (notifyErr) {
        logger.warn('CRM: failed to send accounts copy after travel report approval', {
          tripId,
          error: notifyErr?.message,
        });
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('CRM: error reviewing travel report', err);
    res.status(500).json({ success: false, error: 'Failed to review travel report' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/field-trips/:id/expenses
router.get('/field-trips/:id/expenses', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const result = await pool.query(
      `SELECT e.*, s.stop_order, cu.display_name AS stop_customer_name
         FROM crm_trip_expenses e
    LEFT JOIN crm_field_trip_stops s ON s.id = e.stop_id
    LEFT JOIN fp_customer_unified cu ON cu.customer_id = s.customer_id
        WHERE e.trip_id = $1
     ORDER BY e.expense_date ASC NULLS LAST, e.id ASC`,
      [tripId]
    );

    const total = result.rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    res.json({ success: true, data: { expenses: result.rows, total } });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: { expenses: [], total: 0 } });
    logger.error('CRM: error fetching expenses', err);
    res.status(500).json({ success: false, error: 'Failed to fetch expenses' });
  }
});

// POST /api/crm/field-trips/:id/expenses
router.post('/field-trips/:id/expenses', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['confirmed', 'in_progress'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Expenses can only be added to confirmed or in-progress trips' });
    }

    const { category, description, amount, currency, expense_date, stop_id } = req.body;
    if (!category || !amount) return res.status(400).json({ success: false, error: 'category and amount required' });

    const result = await pool.query(
      `INSERT INTO crm_trip_expenses (trip_id, stop_id, category, description, amount, currency, expense_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tripId, stop_id || null, category, description || null, amount, currency || 'AED', expense_date || null, req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Expense tables not yet created' });
    logger.error('CRM: error creating expense', err);
    res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
});

// DELETE /api/crm/field-trips/:id/expenses/:expenseId
router.delete('/field-trips/:id/expenses/:expenseId', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const expenseId = parseInt(req.params.expenseId, 10);
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['confirmed', 'in_progress'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Expenses can only be modified on confirmed or in-progress trips' });
    }

    await pool.query('DELETE FROM crm_trip_expenses WHERE id = $1 AND trip_id = $2', [expenseId, tripId]);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    logger.error('CRM: error deleting expense', err);
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADJUSTMENTS LOG
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/field-trips/:id/adjustments
router.get('/field-trips/:id/adjustments', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const result = await pool.query(
      `SELECT a.*, u.name AS adjusted_by_name
         FROM crm_trip_adjustments a
    LEFT JOIN users u ON u.id = a.adjusted_by
        WHERE a.trip_id = $1
     ORDER BY a.created_at DESC LIMIT 100`,
      [tripId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching adjustments', err);
    res.status(500).json({ success: false, error: 'Failed to fetch adjustments' });
  }
});

// POST /api/crm/field-trips/:id/adjustments
router.post('/field-trips/:id/adjustments', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const { adjustment_type, description, stop_id } = req.body;
    if (!adjustment_type) return res.status(400).json({ success: false, error: 'adjustment_type required' });

    const result = await pool.query(
      `INSERT INTO crm_trip_adjustments (trip_id, adjusted_by, adjustment_type, description, stop_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tripId, req.user.id, adjustment_type, description || null, stop_id || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Adjustment tables not yet created' });
    logger.error('CRM: error creating adjustment', err);
    res.status(500).json({ success: false, error: 'Failed to create adjustment' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/crm/field-trips/:id/submit-approval
router.post('/field-trips/:id/submit-approval', authenticate, async (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  try {
    const check = await pool.query(
      `SELECT id, title, status, rep_id, budget_estimate,
              advance_status, advance_request_amount, advance_request_currency
         FROM crm_field_trips
        WHERE id = $1`,
      [id]
    );
    if (!check.rows.length) return res.status(404).json({ success: false, error: 'Trip not found' });
    if (check.rows[0].rep_id !== userId) return res.status(403).json({ success: false, error: 'Not your trip' });
    if (check.rows[0].status !== 'planning') {
      return res.status(400).json({ success: false, error: `Cannot submit from status: ${check.rows[0].status}` });
    }

    const baseCurrency = await getCompanyBaseCurrencyCode();
    const requestedAmountInput =
      req.body?.advance_amount ??
      check.rows[0]?.advance_request_amount ??
      check.rows[0]?.budget_estimate;
    const requestedCurrencyInput =
      req.body?.advance_currency ??
      check.rows[0]?.advance_request_currency ??
      baseCurrency;

    const conversion = await convertToBaseAmount(requestedAmountInput, requestedCurrencyInput, baseCurrency);
    if (!conversion.ok || conversion.originalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: conversion.error || 'Advance amount is required and must be greater than zero',
      });
    }

    const advanceNotes = req.body?.advance_notes ? String(req.body.advance_notes) : null;

    const repId = check.rows[0].rep_id;
    const repManagedByAnyone = await hasAnyManagerAssignmentForRep(repId);
    const assignedManagerIds = await getManagerIdsForRep(repId);

    if (!repManagedByAnyone) {
      await writeTripAuditEntry({
        tripId: Number(id),
        actorId: userId,
        type: 'approval_submit_blocked_unassigned',
        description: 'Trip submission blocked because no manager assignment exists for the sales rep',
      });
      return res.status(400).json({
        success: false,
        error: 'No manager assignment found for this sales rep. Ask admin to configure manager access first.',
      });
    }

    await pool.query(
      `UPDATE crm_field_trips
          SET status = 'pending_approval',
              submitted_for_approval_at = NOW(),
              advance_status = 'requested',
              advance_request_amount = $2,
              advance_request_currency = $3,
              advance_request_rate_to_base = $4,
              advance_request_base_amount = $5,
              advance_request_notes = $6,
              advance_requested_at = NOW(),
              advance_requested_by = $7,
              updated_at = NOW()
        WHERE id = $1`,
      [
        id,
        conversion.originalAmount,
        conversion.originalCurrency,
        conversion.rate,
        conversion.baseAmount,
        advanceNotes,
        userId,
      ]
    );

    await notifyManagersTripSubmitted({
      tripId: Number(id),
      tripTitle: check.rows[0]?.title,
      repId,
      assignedManagerIds,
    });

    if (assignedManagerIds.length > 0) {
      await writeTripAuditEntry({
        tripId: Number(id),
        actorId: userId,
        type: 'approval_assignees_resolved',
        description: `Resolved manager assignees: ${assignedManagerIds.join(', ')}`,
      });
    }

    res.json({
      success: true,
      data: {
        status: 'pending_approval',
        assigned_manager_ids: assignedManagerIds,
        advance: {
          requested_amount: conversion.originalAmount,
          requested_currency: conversion.originalCurrency,
          requested_base_amount: conversion.baseAmount,
          base_currency: baseCurrency,
        },
      }
    });
  } catch (err) {
    logger.error('CRM: submit-approval error', err);
    res.status(500).json({ success: false, error: 'Failed to submit for approval' });
  }
});

// PATCH /api/crm/field-trips/:id/review-approval
router.patch('/field-trips/:id/review-approval', authenticate, async (req, res) => {
  const { id } = req.params;
  const { id: managerId } = req.user;
  const { decision, comments, approved_advance_amount, approved_advance_currency } = req.body;
  if (!hasFullAccess(req.user)) {
    return res.status(403).json({ success: false, error: 'Managers only' });
  }
  if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
    return res.status(400).json({ success: false, error: 'Invalid decision' });
  }
  try {
    const tripResult = await pool.query(
      `SELECT id, title, rep_id, status,
              advance_status, advance_request_amount, advance_request_currency
         FROM crm_field_trips
        WHERE id = $1`,
      [id]
    );
    if (!tripResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }

    const trip = tripResult.rows[0];
    if (trip.status !== 'pending_approval') {
      return res.status(409).json({ success: false, error: 'Trip is not pending approval' });
    }

    const canReview = await canManagerReviewRep(managerId, trip.rep_id);
    if (!canReview) {
      await writeTripAuditEntry({
        tripId: Number(id),
        actorId: managerId,
        type: 'approval_review_denied_unassigned',
        description: `Manager ${managerId} denied review access for rep ${trip.rep_id} due to assignment rules`,
      });
      return res.status(403).json({ success: false, error: 'You are not assigned to review this sales rep\'s trips' });
    }

    const newStatus = decision === 'approved' ? 'confirmed' : 'planning';

    if (decision === 'approved' && trip.advance_status !== 'requested') {
      return res.status(400).json({
        success: false,
        error: 'Advance request amount must be provided before manager approval',
      });
    }

    if (decision === 'approved') {
      const baseCurrency = await getCompanyBaseCurrencyCode();
      const amountInput = approved_advance_amount ?? trip.advance_request_amount;
      const currencyInput = approved_advance_currency ?? trip.advance_request_currency ?? baseCurrency;
      const conversion = await convertToBaseAmount(amountInput, currencyInput, baseCurrency);
      if (!conversion.ok || conversion.originalAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: conversion.error || 'Approved advance amount must be greater than zero',
        });
      }

      await pool.query(
        `UPDATE crm_field_trips
            SET status = $1,
                approval_decision = $2,
                approval_comments = $3,
                approved_by = $4,
                approved_at = NOW(),
                advance_status = 'approved',
                advance_approved_amount = $5,
                advance_approved_currency = $6,
                advance_approved_rate_to_base = $7,
                advance_approved_base_amount = $8,
                advance_approval_comments = $9,
                advance_approved_by = $4,
                advance_approved_at = NOW(),
                updated_at = NOW()
          WHERE id = $10`,
        [
          newStatus,
          decision,
          comments || null,
          managerId,
          conversion.originalAmount,
          conversion.originalCurrency,
          conversion.rate,
          conversion.baseAmount,
          comments || null,
          id,
        ]
      );
    } else {
      await pool.query(
        `UPDATE crm_field_trips
            SET status = $1,
                approval_decision = $2,
                approval_comments = $3,
                approved_by = $4,
                approved_at = NOW(),
                advance_status = CASE WHEN advance_status = 'requested' THEN 'rejected' ELSE advance_status END,
                updated_at = NOW()
          WHERE id = $5`,
        [newStatus, decision, comments || null, managerId, id]
      );
    }

    await notifyRepApprovalDecision({
      tripId: Number(id),
      tripTitle: trip.title,
      repId: trip.rep_id,
      managerId,
      decision,
      comments,
    });

    if (decision === 'approved') {
      await notifyAccountsApprovalCopy({
        tripId: Number(id),
        tripTitle: trip.title,
        repId: trip.rep_id,
        managerId,
        approvalStage: 'trip',
        comments,
      });
    }

    res.json({ success: true, data: { status: newStatus, decision } });
  } catch (err) {
    logger.error('CRM: review-approval error', err);
    res.status(500).json({ success: false, error: 'Failed to review trip' });
  }
});

// POST /api/crm/field-trips/:id/advance-disburse
router.post('/field-trips/:id/advance-disburse', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const allowed = await canDisburseAdvance(req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Only Accounts placeholder users or managers can disburse advance' });
    }

    const tripRes = await pool.query(
      `SELECT id, title, rep_id, status,
              advance_status, advance_approved_amount, advance_approved_currency
         FROM crm_field_trips
        WHERE id = $1
        LIMIT 1`,
      [tripId]
    );
    if (!tripRes.rows.length) return res.status(404).json({ success: false, error: 'Trip not found' });

    const trip = tripRes.rows[0];
    if (trip.advance_status !== 'approved') {
      return res.status(409).json({ success: false, error: 'Advance must be approved by manager before disbursement' });
    }

    const baseCurrency = await getCompanyBaseCurrencyCode();
    const disbursedAmountInput = req.body?.disbursed_amount ?? trip.advance_approved_amount;
    const disbursedCurrencyInput = req.body?.disbursed_currency ?? trip.advance_approved_currency ?? baseCurrency;
    const conversion = await convertToBaseAmount(disbursedAmountInput, disbursedCurrencyInput, baseCurrency);
    if (!conversion.ok || conversion.originalAmount <= 0) {
      return res.status(400).json({ success: false, error: conversion.error || 'Invalid disbursed amount' });
    }

    const disbursedReference = req.body?.payment_reference ? String(req.body.payment_reference).trim() : null;
    const disbursedNotes = req.body?.notes ? String(req.body.notes) : null;

    await pool.query(
      `UPDATE crm_field_trips
          SET advance_status = 'disbursed',
              advance_disbursed_amount = $2,
              advance_disbursed_currency = $3,
              advance_disbursed_rate_to_base = $4,
              advance_disbursed_base_amount = $5,
              advance_disbursed_reference = $6,
              advance_disbursed_notes = $7,
              advance_disbursed_by = $8,
              advance_disbursed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [
        tripId,
        conversion.originalAmount,
        conversion.originalCurrency,
        conversion.rate,
        conversion.baseAmount,
        disbursedReference,
        disbursedNotes,
        req.user.id,
      ]
    );

    await notifyUsers([trip.rep_id], {
      type: 'crm_trip_advance_disbursed',
      title: `Advance Disbursed: ${trip.title || `Trip #${tripId}`}`,
      message: `Your trip advance was disbursed: ${conversion.originalAmount.toFixed(2)} ${conversion.originalCurrency}.`,
      link: `/crm/visits/${tripId}`,
      referenceType: 'field_trip',
      referenceId: tripId,
    });

    res.json({
      success: true,
      data: {
        advance_status: 'disbursed',
        disbursed_amount: conversion.originalAmount,
        disbursed_currency: conversion.originalCurrency,
        disbursed_base_amount: conversion.baseAmount,
        base_currency: baseCurrency,
      }
    });
  } catch (err) {
    logger.error('CRM: advance disbursement error', err);
    res.status(500).json({ success: false, error: 'Failed to disburse advance' });
  }
});

// GET /api/crm/field-trips/:id/settlement
router.get('/field-trips/:id/settlement', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });

    const baseCurrency = await getCompanyBaseCurrencyCode();
    const openingAdvanceAmount = Number(trip.advance_disbursed_base_amount || 0);

    const expensesRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM crm_trip_expenses
        WHERE trip_id = $1`,
      [tripId]
    );
    const totalExpensesAmount = Number(expensesRes.rows[0]?.total || 0);

    const settlementRes = await pool.query(
      `SELECT * FROM crm_trip_settlements WHERE trip_id = $1 LIMIT 1`,
      [tripId]
    );

    const existing = settlementRes.rows[0] || null;
    const returnedAmount = Number(existing?.returned_base_amount || 0);
    const netAmount = openingAdvanceAmount - totalExpensesAmount - returnedAmount;
    const settlementDirection =
      netAmount > 0 ? 'rep_to_company' :
      netAmount < 0 ? 'company_to_rep' :
      'balanced';

    res.json({
      success: true,
      data: {
        ...(existing || {}),
        base_currency: baseCurrency,
        opening_advance_amount: openingAdvanceAmount,
        total_expenses_amount: totalExpensesAmount,
        returned_base_amount: returnedAmount,
        net_amount: Number(netAmount.toFixed(2)),
        settlement_direction: settlementDirection,
      }
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Settlement tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error fetching trip settlement', err);
    res.status(500).json({ success: false, error: 'Failed to fetch settlement' });
  }
});

// POST /api/crm/field-trips/:id/settlement
router.post('/field-trips/:id/settlement', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (trip.rep_id !== req.user.id && !hasFullAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Only trip owner can submit settlement' });
    }
    if (trip.status !== 'in_progress') {
      return res.status(409).json({ success: false, error: 'Settlement can be submitted only after trip starts' });
    }

    const baseCurrency = await getCompanyBaseCurrencyCode();
    const openingAdvanceAmount = Number(trip.advance_disbursed_base_amount || 0);

    const expensesRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM crm_trip_expenses
        WHERE trip_id = $1`,
      [tripId]
    );
    const totalExpensesAmount = Number(expensesRes.rows[0]?.total || 0);

    const returnedAmountInput = req.body?.returned_amount ?? 0;
    const returnedCurrencyInput = req.body?.returned_currency || baseCurrency;
    const conversion = await convertToBaseAmount(returnedAmountInput, returnedCurrencyInput, baseCurrency);
    if (!conversion.ok) {
      return res.status(400).json({ success: false, error: conversion.error || 'Invalid returned amount' });
    }

    const netAmount = openingAdvanceAmount - totalExpensesAmount - conversion.baseAmount;
    const settlementDirection =
      netAmount > 0 ? 'rep_to_company' :
      netAmount < 0 ? 'company_to_rep' :
      'balanced';

    const submit = Boolean(req.body?.submit);
    const status = submit ? 'submitted' : 'draft';
    const repNotes = req.body?.rep_notes ? String(req.body.rep_notes) : null;

    const result = await pool.query(
      `INSERT INTO crm_trip_settlements
         (trip_id, submitted_by, submitted_at, status, base_currency,
          opening_advance_amount, total_expenses_amount,
          returned_amount, returned_currency, returned_rate_to_base, returned_base_amount,
          net_amount, settlement_direction, rep_notes, updated_at)
       VALUES ($1,$2,CASE WHEN $3='submitted' THEN NOW() ELSE NULL END,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (trip_id)
       DO UPDATE SET submitted_by = EXCLUDED.submitted_by,
                     submitted_at = CASE WHEN EXCLUDED.status='submitted' THEN NOW() ELSE crm_trip_settlements.submitted_at END,
                     status = EXCLUDED.status,
                     base_currency = EXCLUDED.base_currency,
                     opening_advance_amount = EXCLUDED.opening_advance_amount,
                     total_expenses_amount = EXCLUDED.total_expenses_amount,
                     returned_amount = EXCLUDED.returned_amount,
                     returned_currency = EXCLUDED.returned_currency,
                     returned_rate_to_base = EXCLUDED.returned_rate_to_base,
                     returned_base_amount = EXCLUDED.returned_base_amount,
                     net_amount = EXCLUDED.net_amount,
                     settlement_direction = EXCLUDED.settlement_direction,
                     rep_notes = EXCLUDED.rep_notes,
                     updated_at = NOW()
       RETURNING *`,
      [
        tripId,
        req.user.id,
        status,
        baseCurrency,
        openingAdvanceAmount,
        totalExpensesAmount,
        conversion.originalAmount,
        conversion.originalCurrency,
        conversion.rate,
        conversion.baseAmount,
        netAmount,
        settlementDirection,
        repNotes,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Settlement tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error saving trip settlement', err);
    res.status(500).json({ success: false, error: 'Failed to save settlement' });
  }
});

// PATCH /api/crm/field-trips/:id/settlement/review
router.patch('/field-trips/:id/settlement/review', authenticate, async (req, res) => {
  try {
    if (!hasFullAccess(req.user)) {
      return res.status(403).json({ success: false, error: 'Only managers can review settlement' });
    }

    const tripId = parseInt(req.params.id, 10);
    const { status, manager_comments } = req.body;
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });
    if (!['approved', 'rejected', 'revision_requested'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid settlement review status' });
    }

    const tripRes = await pool.query(
      `SELECT id, title, rep_id FROM crm_field_trips WHERE id = $1 LIMIT 1`,
      [tripId]
    );
    if (!tripRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Field trip not found' });
    }

    const trip = tripRes.rows[0];
    const canReview = await canManagerReviewRep(req.user.id, trip.rep_id);
    if (!canReview) {
      return res.status(403).json({ success: false, error: 'You are not assigned to review this sales rep\'s settlement' });
    }

    const existingSettlementRes = await pool.query(
      `SELECT status FROM crm_trip_settlements WHERE trip_id = $1 LIMIT 1`,
      [tripId]
    );
    if (!existingSettlementRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Settlement not found' });
    }
    const currentSettlementStatus = String(existingSettlementRes.rows[0].status || '').toLowerCase();
    if (!['submitted', 'revision_requested'].includes(currentSettlementStatus)) {
      return res.status(409).json({ success: false, error: 'Settlement is not pending manager review' });
    }

    const result = await pool.query(
      `UPDATE crm_trip_settlements
          SET status = $1,
              manager_comments = $2,
              reviewed_by = $3,
              reviewed_at = NOW(),
              updated_at = NOW()
        WHERE trip_id = $4
      RETURNING *`,
      [status, manager_comments || null, req.user.id, tripId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Settlement not found' });
    }

    if (status === 'approved') {
      await tryCompleteTripIfReady(tripId);

      await notifyAccountsApprovalCopy({
        tripId: Number(trip.id),
        tripTitle: trip.title,
        repId: trip.rep_id,
        managerId: req.user.id,
        approvalStage: 'settlement',
        comments: manager_comments,
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Settlement tables not yet created. Run migrations.' });
    }
    logger.error('CRM: error reviewing settlement', err);
    res.status(500).json({ success: false, error: 'Failed to review settlement' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GPS CHECK-IN
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/crm/field-trips/:id/stops/:stopId/check-in
router.post('/field-trips/:id/stops/:stopId/check-in', authenticate, async (req, res) => {
  const { id, stopId } = req.params;
  const { lat, lng, accuracy_m } = req.body;
  try {
    const stop = await pool.query(
      `SELECT latitude,
              longitude,
              visit_date,
              (visit_date::date > CURRENT_DATE) AS is_future
         FROM crm_field_trip_stops
        WHERE id = $1
          AND trip_id = $2`,
      [stopId, id]
    );
    if (!stop.rows.length) return res.status(404).json({ success: false, error: 'Stop not found' });

    if (stop.rows[0]?.is_future) {
      return res.status(400).json({
        success: false,
        error: 'Check-in is only allowed on or after the scheduled visit date'
      });
    }

    let distanceM = null;
    const { latitude: pLat, longitude: pLng } = stop.rows[0];
    if (pLat && pLng && lat && lng) {
      const R = 6371000;
      const dLat = (lat - pLat) * Math.PI / 180;
      const dLng = (lng - pLng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(pLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      distanceM = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    await pool.query(
      `UPDATE crm_field_trip_stops
       SET check_in_lat=$1, check_in_lng=$2, check_in_accuracy_m=$3, check_in_timestamp=NOW(), check_in_distance_m=$4
       WHERE id=$5`,
      [lat, lng, accuracy_m || null, distanceM, stopId]
    );

    res.json({ success: true, data: { check_in_distance_m: distanceM } });
  } catch (err) {
    logger.error('CRM: check-in error', err);
    res.status(500).json({ success: false, error: 'Check-in failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STOP ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/crm/field-trips/:id/stops/:stopId/attachments
router.post('/field-trips/:id/stops/:stopId/attachments', authenticate, upload.single('file'), async (req, res) => {
  const { id, stopId } = req.params;
  const { caption } = req.body;
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  try {
    const trip = await getTripById(parseInt(id, 10), req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    const fileUrl = `/uploads/trip-attachments/${req.file.filename}`;
    const result = await pool.query(
      `INSERT INTO crm_field_trip_stop_attachments
         (trip_id, stop_id, filename, mime_type, file_url, file_size_kb, uploaded_by, caption)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, stopId, req.file.originalname, req.file.mimetype,
       fileUrl, Math.ceil(req.file.size / 1024), req.user.id, caption || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: attachment upload error', err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

// GET /api/crm/field-trips/:id/stops/:stopId/attachments
router.get('/field-trips/:id/stops/:stopId/attachments', authenticate, async (req, res) => {
  try {
    const trip = await getTripById(parseInt(req.params.id, 10), req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    const rows = await pool.query(
      `SELECT * FROM crm_field_trip_stop_attachments WHERE stop_id=$1 AND trip_id=$2 ORDER BY uploaded_at`,
      [req.params.stopId, req.params.id]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
  }
});

// DELETE /api/crm/field-trips/:id/stops/:stopId/attachments/:attId
router.delete('/field-trips/:id/stops/:stopId/attachments/:attId', authenticate, async (req, res) => {
  try {
    const trip = await getTripById(parseInt(req.params.id, 10), req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    const row = await pool.query('SELECT * FROM crm_field_trip_stop_attachments WHERE id=$1 AND trip_id=$2 AND stop_id=$3', [req.params.attId, req.params.id, req.params.stopId]);
    if (!row.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const filePath = path.join(__dirname, '../../../', row.rows[0].file_url);
    fs.unlink(filePath, () => {});
    await pool.query('DELETE FROM crm_field_trip_stop_attachments WHERE id=$1', [req.params.attId]);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED EXPENSE (with receipt upload + FX conversion)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/crm/field-trips/:id/expenses/multi-currency  (new endpoint, keeps old one intact)
router.post('/field-trips/:id/expenses/multi-currency', authenticate, upload.single('receipt'), async (req, res) => {
  const { id } = req.params;
  const { category, description, amount, currency, expense_date, notes } = req.body;
  if (!category || !amount) return res.status(400).json({ success: false, error: 'category and amount required' });
  try {
    const trip = await getTripById(parseInt(id, 10), req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['confirmed', 'in_progress'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Expenses can only be added to confirmed or in-progress trips' });
    }

    const baseCurrencyObj = await currencyService.getBaseCurrency();
    const baseCurrency = String(baseCurrencyObj?.code || 'AED').toUpperCase();
    const originalCurrency = String(currency || baseCurrency).toUpperCase();
    const parsedAmount = parseFloat(amount);

    let fxRate = 1.0;
    let baseEquivalent = parsedAmount;
    if (originalCurrency !== baseCurrency) {
      const fxRow = await pool.query(
        `SELECT rate
           FROM crm_fx_rates
          WHERE from_currency = $1 AND to_currency = $2
          ORDER BY effective_date DESC
          LIMIT 1`,
        [originalCurrency, baseCurrency]
      );

      if (fxRow.rows.length) {
        fxRate = parseFloat(fxRow.rows[0].rate);
      } else {
        const fallbackRate = await currencyService.getExchangeRate(originalCurrency, baseCurrency);
        if (fallbackRate === null) {
          return res.status(400).json({
            success: false,
            error: `No FX rate found for ${originalCurrency} → ${baseCurrency}`,
          });
        }
        fxRate = parseFloat(fallbackRate);
      }

      baseEquivalent = parsedAmount * fxRate;
    }

    let receiptUrl = null, receiptFilename = null, receiptMime = null;
    if (req.file) {
      receiptUrl = `/uploads/trip-attachments/${req.file.filename}`;
      receiptFilename = req.file.originalname;
      receiptMime = req.file.mimetype;
    }

    const result = await pool.query(
      `INSERT INTO crm_trip_expenses
         (trip_id, category, description, amount, currency,
          original_amount, original_currency, fx_rate, aed_equivalent,
          expense_date, receipt_url, receipt_filename, receipt_mime, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, category, description || null, baseEquivalent, baseCurrency,
       parsedAmount, originalCurrency, fxRate, baseEquivalent,
       expense_date || null, receiptUrl, receiptFilename, receiptMime, notes || null, req.user.id]
    );
    res.json({ success: true, base_currency: baseCurrency, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: multi-currency expense error', err);
    res.status(500).json({ success: false, error: 'Failed to add expense' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED TRAVEL REPORT (auto-populate)
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeAiText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function buildTravelReportAiAnalysis({ trip, stops, reportDraft }) {
  const safeStops = Array.isArray(stops) ? stops : [];
  const visited = safeStops.filter((s) => s.outcome_status === 'visited');
  const noShow = safeStops.filter((s) => s.outcome_status === 'no_show');
  const postponed = safeStops.filter((s) => s.outcome_status === 'postponed');

  const recommendations = [];
  if (postponed.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Reschedule postponed stops within 72 hours',
      rationale: `${postponed.length} stop(s) were postponed and risk losing momentum.`,
    });
  }
  if (noShow.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Escalate no-show accounts via alternate channels',
      rationale: `${noShow.length} stop(s) had no-show outcomes. Use phone/WhatsApp before closing the loop.`,
    });
  }
  if (visited.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Convert visited opportunities into dated follow-ups',
      rationale: `${visited.length} successful visit(s) should be converted into owner-assigned actions.`,
    });
  }

  const reminders = visited
    .filter((s) => s.next_action)
    .slice(0, 10)
    .map((s, idx) => ({
      id: `rem-${s.id || idx + 1}`,
      title: s.next_action,
      priority: 'medium',
      suggested_due_in_days: 2,
      linked_stop_id: s.id || null,
      linked_customer_id: s.customer_id || null,
      linked_prospect_id: s.prospect_id || null,
    }));

  const tasks = visited.slice(0, 12).map((s, idx) => {
    const stopName = s.customer_name_ref || s.customer_name || s.prospect_name || s.address_snapshot || `Stop ${s.stop_order || idx + 1}`;
    return {
      id: `task-${s.id || idx + 1}`,
      title: s.next_action || `Follow up visit: ${stopName}`,
      description: normalizeAiText(s.outcome_notes, `Follow up with ${stopName} based on field visit outcomes.`),
      priority: s.visit_result === 'positive' ? 'high' : 'medium',
      suggested_due_in_days: s.visit_result === 'positive' ? 1 : 3,
      linked_stop_id: s.id || null,
      linked_customer_id: s.customer_id || null,
      linked_prospect_id: s.prospect_id || null,
    };
  });

  const summaryText = normalizeAiText(reportDraft?.summary, null)
    || `Trip ${trip?.title || ''}: ${visited.length} visited, ${postponed.length} postponed, ${noShow.length} no-show.`.trim();

  return {
    model: 'rule_based_v1',
    generated_at: new Date().toISOString(),
    summary: summaryText,
    action_plan: [
      `Complete high-priority follow-ups from visited stops in the next 48 hours.`,
      `Resolve postponed/no-show stops with a reschedule plan and escalation path.`,
      `Track conversion outcomes in CRM tasks and manager review notes.`,
    ],
    recommendations,
    reminders,
    tasks,
    signals: {
      total_stops: safeStops.length,
      visited_stops: visited.length,
      postponed_stops: postponed.length,
      no_show_stops: noShow.length,
      positive_stops: visited.filter((s) => s.visit_result === 'positive').length,
    },
  };
}

// GET /api/crm/field-trips/:id/travel-report/enhanced
router.get('/field-trips/:id/travel-report/enhanced', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const [tripRow, reportRow, stopsRow, expRow] = await Promise.all([
      pool.query('SELECT * FROM crm_field_trips WHERE id=$1', [tripId]),
      pool.query('SELECT * FROM crm_travel_reports WHERE trip_id=$1', [tripId]),
      pool.query(`
        SELECT fts.*, c.display_name AS customer_name_ref
        FROM crm_field_trip_stops fts
        LEFT JOIN fp_customer_unified c ON fts.customer_id = c.customer_id
        WHERE fts.trip_id=$1 ORDER BY fts.stop_order`, [tripId]),
      pool.query('SELECT * FROM crm_trip_expenses WHERE trip_id=$1', [tripId]),
    ]);

    if (!tripRow.rows.length) return res.status(404).json({ success: false, error: 'Trip not found' });
    const tripStatus = tripRow.rows[0]?.status;
    if (!['in_progress', 'completed'].includes(tripStatus)) {
      return res.status(409).json({ success: false, error: 'Travel report is available only after the trip is started' });
    }

    const stops = stopsRow.rows;
    const visited = stops.filter(s => s.outcome_status === 'visited');
    const totalExpAED = expRow.rows.reduce((s, e) => s + parseFloat(e.aed_equivalent || e.amount || 0), 0);

    const autoKeyOutcomes = visited.map(s => {
      const name = s.customer_name_ref || s.address_snapshot || `Stop ${s.stop_order}`;
      return `• ${name}: ${s.outcome_notes || 'Visited'}`;
    }).join('\n');

    const autoNextSteps = visited
      .filter(s => s.next_action)
      .map(s => {
        const name = s.customer_name_ref || `Stop ${s.stop_order}`;
        return `• ${name}: ${s.next_action}`;
      }).join('\n');

    const autoChallenges = stops
      .filter(s => ['no_show', 'postponed'].includes(s.outcome_status))
      .map(s => {
        const name = s.customer_name_ref || s.address_snapshot || `Stop ${s.stop_order}`;
        const reason = s.outcome_notes || s.outcome_status;
        return `• ${name}: ${String(reason).replace(/_/g, ' ')}`;
      }).join('\n');

    const plannedVsActual = stops
      .filter((s) => Boolean(s.customer_id || s.customer_name_ref))
      .map((s) => ({
        stop_order: s.stop_order,
        name: s.customer_name_ref || `Customer #${s.customer_id}`,
        planned_date: s.visit_date,
        planned_time: s.visit_time,
        planned_duration: s.duration_mins,
        actual_checkin: s.check_in_timestamp,
        outcome_status: s.outcome_status || 'planned',
        products_discussed: s.products_discussed,
      }));

    const costPerVisit = visited.length > 0 ? (totalExpAED / visited.length).toFixed(2) : null;
    const positiveVisits = visited.filter(s => s.visit_result === 'positive').length;
    const costPerQualified = positiveVisits > 0 ? (totalExpAED / positiveVisits).toFixed(2) : null;

    const report = reportRow.rows[0] || {};
    res.json({
      success: true,
      data: {
        ...report,
        auto_key_outcomes: autoKeyOutcomes,
        auto_next_steps: autoNextSteps,
        auto_challenges: autoChallenges,
        planned_vs_actual: plannedVsActual,
        roi_metrics: {
          total_stops: stops.length,
          visited_stops: visited.length,
          no_show_stops: stops.filter(s => s.outcome_status === 'no_show').length,
          postponed_stops: stops.filter(s => s.outcome_status === 'postponed').length,
          total_expenses_aed: totalExpAED.toFixed(2),
          cost_per_visit: costPerVisit,
          cost_per_qualified_outcome: costPerQualified,
          samples_provided: stops.filter(s => s.samples_provided || s.samples_delivered).length,
        },
        trip: tripRow.rows[0],
        stops,
      }
    });
  } catch (err) {
    logger.error('CRM: enhanced travel-report GET error', err);
    res.status(500).json({ success: false, error: 'Failed to load travel report' });
  }
});

// POST /api/crm/field-trips/:id/travel-report/analyze
router.post('/field-trips/:id/travel-report/analyze', authenticate, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['in_progress', 'completed'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'AI analysis is available only after the trip is started' });
    }
    if (req.user.id !== trip.rep_id) {
      return res.status(403).json({ success: false, error: 'Only trip owner can generate AI follow-up plan' });
    }

    const stopsRes = await pool.query(
      `SELECT fts.*, c.display_name AS customer_name_ref
         FROM crm_field_trip_stops fts
    LEFT JOIN fp_customer_unified c ON c.customer_id = fts.customer_id
        WHERE fts.trip_id = $1
     ORDER BY fts.stop_order ASC`,
      [tripId]
    );

    const reportDraft = {
      summary: req.body?.summary || null,
      key_outcomes: req.body?.key_outcomes || null,
      challenges: req.body?.challenges || null,
      recommendations: req.body?.recommendations || null,
      next_steps: req.body?.next_steps || null,
    };

    const analysis = buildTravelReportAiAnalysis({
      trip,
      stops: stopsRes.rows,
      reportDraft,
    });

    let saved = false;
    if (req.body?.save === true) {
      const existing = await pool.query(
        'SELECT id FROM crm_travel_reports WHERE trip_id = $1 LIMIT 1',
        [tripId]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE crm_travel_reports
              SET ai_analysis = $1,
                  ai_generated_at = NOW(),
                  ai_status = 'generated',
                  updated_at = NOW()
            WHERE trip_id = $2`,
          [JSON.stringify(analysis), tripId]
        );
      } else {
        await pool.query(
          `INSERT INTO crm_travel_reports
             (trip_id, submitted_by, status, ai_analysis, ai_generated_at, ai_status)
           VALUES ($1,$2,'draft',$3,NOW(),'generated')`,
          [tripId, req.user.id, JSON.stringify(analysis)]
        );
      }
      saved = true;
    }

    res.json({
      success: true,
      data: {
        analysis,
        saved,
      },
    });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Travel report tables not yet created' });
    if (err.code === '42703') return res.status(503).json({ success: false, error: 'AI analysis columns are missing. Run latest migrations.' });
    logger.error('CRM: travel-report analyze error', err);
    res.status(500).json({ success: false, error: 'Failed to analyze travel report' });
  }
});

// POST /api/crm/field-trips/:id/travel-report/analyze/apply
router.post('/field-trips/:id/travel-report/analyze/apply', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const tripId = parseInt(req.params.id, 10);
    if (!tripId) return res.status(400).json({ success: false, error: 'Invalid trip ID' });

    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['in_progress', 'completed'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'AI actions are available only after the trip is started' });
    }

    if (req.user.id !== trip.rep_id) {
      return res.status(403).json({ success: false, error: 'Only trip owner can apply AI actions' });
    }

    let analysis = req.body?.analysis || null;
    if (!analysis) {
      const reportRes = await client.query(
        `SELECT ai_analysis FROM crm_travel_reports WHERE trip_id = $1 LIMIT 1`,
        [tripId]
      );
      analysis = reportRes.rows[0]?.ai_analysis || null;
    }

    if (!analysis || typeof analysis !== 'object') {
      return res.status(400).json({ success: false, error: 'No AI analysis found to apply' });
    }

    const selectedTaskIds = Array.isArray(req.body?.selected_task_ids) ? req.body.selected_task_ids.map(String) : null;
    const selectedReminderIds = Array.isArray(req.body?.selected_reminder_ids) ? req.body.selected_reminder_ids.map(String) : null;

    const candidateTasks = Array.isArray(analysis.tasks) ? analysis.tasks : [];
    const candidateReminders = Array.isArray(analysis.reminders) ? analysis.reminders : [];

    const tasksToCreate = selectedTaskIds
      ? candidateTasks.filter((task) => selectedTaskIds.includes(String(task.id)))
      : candidateTasks;

    const remindersToCreate = selectedReminderIds
      ? candidateReminders.filter((reminder) => selectedReminderIds.includes(String(reminder.id)))
      : candidateReminders;

    const assigneeName = await getAssigneeName(trip.rep_id);
    const createdTasks = [];

    await client.query('BEGIN');

    for (const task of tasksToCreate) {
      const days = Number(task.suggested_due_in_days || 3);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (Number.isFinite(days) ? Math.max(days, 0) : 3));
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const taskRes = await client.query(
        `INSERT INTO crm_tasks
          (title, description, due_date, priority, assignee_id, assignee_name, customer_id, prospect_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          normalizeAiText(task.title, 'Follow-up task'),
          normalizeAiText(task.description, null),
          dueDateStr,
          ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
          trip.rep_id,
          assigneeName,
          task.linked_customer_id || null,
          task.linked_prospect_id || null,
          req.user.id,
        ]
      );
      createdTasks.push(taskRes.rows[0]);
    }

    const createdReminderTitles = [];
    for (const reminder of remindersToCreate) {
      const reminderTitle = normalizeAiText(reminder.title, 'Follow-up reminder');
      await createNotification({
        userId: trip.rep_id,
        type: 'crm_trip_ai_reminder',
        title: `AI Reminder: ${reminderTitle}`,
        message: `Trip ${trip.title || `#${tripId}`}: ${reminderTitle}`,
        link: `/crm/visits/${tripId}/travel-report`,
        referenceType: 'field_trip',
        referenceId: tripId,
      }, client);
      createdReminderTitles.push(reminderTitle);
    }

    const patchedAnalysis = {
      ...analysis,
      applied: {
        applied_at: new Date().toISOString(),
        applied_by: req.user.id,
        task_count: createdTasks.length,
        reminder_count: createdReminderTitles.length,
        created_task_ids: createdTasks.map((t) => t.id),
      },
    };

    const existing = await client.query('SELECT id FROM crm_travel_reports WHERE trip_id = $1 LIMIT 1', [tripId]);
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE crm_travel_reports
            SET ai_analysis = $1,
                ai_generated_at = COALESCE(ai_generated_at, NOW()),
                ai_status = 'applied_by_rep',
                updated_at = NOW()
          WHERE trip_id = $2`,
        [JSON.stringify(patchedAnalysis), tripId]
      );
    } else {
      await client.query(
        `INSERT INTO crm_travel_reports
           (trip_id, submitted_by, status, ai_analysis, ai_generated_at, ai_status)
         VALUES ($1,$2,'draft',$3,NOW(),'applied_by_rep')`,
        [tripId, req.user.id, JSON.stringify(patchedAnalysis)]
      );
    }

    await client.query('COMMIT');

    if (createdTasks.length > 0 || createdReminderTitles.length > 0) {
      await notifyUsers([trip.rep_id], {
        type: 'crm_trip_ai_actions_applied',
        title: `AI actions created for ${trip.title || `Trip #${tripId}`}`,
        message: `${createdTasks.length} task(s) and ${createdReminderTitles.length} reminder(s) were created.`,
        link: `/crm/visits/${tripId}/travel-report`,
        referenceType: 'field_trip',
        referenceId: tripId,
      }, { excludeUserIds: [] });

      const managerIds = await getManagerIdsForRep(trip.rep_id);
      const uniqueManagerIds = [...new Set((managerIds || []).filter(Boolean))];
      if (uniqueManagerIds.length > 0) {
        await notifyUsers(uniqueManagerIds, {
          type: 'crm_trip_ai_actions_info',
          title: `AI follow-up applied: ${trip.title || `Trip #${tripId}`}`,
          message: `Sales rep applied AI follow-up actions (${createdTasks.length} task(s), ${createdReminderTitles.length} reminder(s)). No approval needed.`,
          link: `/crm/visits/${tripId}/travel-report`,
          referenceType: 'field_trip',
          referenceId: tripId,
        }, { excludeUserIds: [trip.rep_id] });
      }
    }

    res.json({
      success: true,
      data: {
        created_tasks: createdTasks,
        created_reminders: createdReminderTitles,
        ai_status: 'applied_by_rep',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Required CRM tables are not yet created. Run migrations.' });
    if (err.code === '42703') return res.status(503).json({ success: false, error: 'AI analysis columns are missing. Run latest migrations.' });
    logger.error('CRM: travel-report analyze apply error', err);
    res.status(500).json({ success: false, error: 'Failed to apply AI actions' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL REPORT PER-STOP MANAGER COMMENT
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/crm/field-trips/:id/travel-report/review-stop
router.post('/field-trips/:id/travel-report/review-stop', authenticate, async (req, res) => {
  if (!hasFullAccess(req.user)) return res.status(403).json({ success: false, error: 'Managers only' });
  const tripId = parseInt(req.params.id, 10);
  const { stop_id, comment } = req.body;
  try {
    const trip = await getTripById(tripId, req.user);
    if (!trip) return res.status(404).json({ success: false, error: 'Field trip not found' });
    if (!['in_progress', 'completed'].includes(trip.status)) {
      return res.status(409).json({ success: false, error: 'Travel report comments are available only after the trip is started' });
    }

    const existing = await pool.query(
      'SELECT id, manager_stop_comments FROM crm_travel_reports WHERE trip_id=$1', [tripId]
    );
    const comments = existing.rows[0]?.manager_stop_comments || {};
    comments[stop_id] = { comment, commented_at: new Date().toISOString(), commented_by: req.user.id };

    if (existing.rows.length) {
      await pool.query(
        `UPDATE crm_travel_reports SET manager_stop_comments=$1, updated_at=NOW() WHERE trip_id=$2`,
        [JSON.stringify(comments), tripId]
      );
    } else {
      await pool.query(
        `INSERT INTO crm_travel_reports (trip_id, submitted_by, manager_stop_comments, status)
         VALUES ($1,$2,$3,'submitted')`,
        [tripId, req.user.id, JSON.stringify(comments)]
      );
    }
    res.json({ success: true, data: comments });
  } catch (err) {
    logger.error('CRM: error saving per-stop comment', err);
    res.status(500).json({ success: false, error: 'Failed to save comment' });
  }
});

module.exports = router;
