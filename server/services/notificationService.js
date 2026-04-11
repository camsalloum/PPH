const logger = require('../utils/logger');
const { pool, authPool } = require('../database/config');
const { broadcastToUser } = require('../utils/sseManager');

async function createNotification(payload, client = null) {
  const conn = client || pool;
  const {
    userId,
    type,
    title,
    message = null,
    link = null,
    referenceType = null,
    referenceId = null,
  } = payload;

  if (!userId || !type || !title) return null;

  try {
    const res = await conn.query(
      `INSERT INTO mes_notifications
         (user_id, type, title, message, link, reference_type, reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [userId, type, title, message, link, referenceType, referenceId]
    );
    const row = res.rows[0] || null;
    // H-007: push to any active SSE connection for this user
    if (row) {
      try { broadcastToUser(userId, 'notification', row); } catch { /* non-fatal */ }
    }
    return row;
  } catch (err) {
    logger.error('notificationService.createNotification failed', err);
    return null;
  }
}

async function createBulkNotifications(userIds, payload, client = null) {
  const targets = [...new Set((userIds || []).filter(Boolean))];
  if (targets.length === 0) return [];

  const created = [];
  for (const userId of targets) {
    const row = await createNotification({ ...payload, userId }, client);
    if (row) created.push(row);
  }
  return created;
}

async function getActiveUserIdsByRoles(roles = []) {
  const list = [...new Set((roles || []).filter(Boolean))];
  if (list.length === 0) return [];

  try {
    const res = await authPool.query(
      `SELECT id
       FROM users
       WHERE role = ANY($1::text[])
         AND COALESCE(is_active, TRUE) = TRUE`,
      [list]
    );
    return res.rows.map((r) => r.id);
  } catch (err) {
    logger.error('notificationService.getActiveUserIdsByRoles failed', err);
    return [];
  }
}

async function notifyUsers(userIds, payload, opts = {}) {
  const excludeUserIds = new Set((opts.excludeUserIds || []).filter(Boolean));
  const finalTargets = [...new Set((userIds || []).filter((id) => id && !excludeUserIds.has(id)))];
  return createBulkNotifications(finalTargets, payload);
}

async function notifyRoleUsers(roles, payload, opts = {}) {
  const recipients = await getActiveUserIdsByRoles(roles);
  return notifyUsers(recipients, payload, opts);
}

async function getUnreadCount(userId) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM mes_notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return res.rows[0]?.count || 0;
}

async function getNotifications(userId, options = {}) {
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const unreadOnly = options.unreadOnly === true || String(options.unreadOnly || '').toLowerCase() === 'true';

  const params = [userId];
  const conditions = ['user_id = $1'];
  let idx = 2;

  if (unreadOnly) {
    conditions.push(`is_read = FALSE`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM mes_notifications ${where}`,
    params
  );

  const listRes = await pool.query(
    `SELECT *
     FROM mes_notifications
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    data: listRes.rows,
    pagination: {
      page,
      limit,
      total: totalRes.rows[0]?.total || 0,
    },
  };
}

async function markAsRead(notificationId, userId) {
  const res = await pool.query(
    `UPDATE mes_notifications
     SET is_read = TRUE,
         read_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return res.rows[0] || null;
}

async function markAllAsRead(userId) {
  const res = await pool.query(
    `UPDATE mes_notifications
     SET is_read = TRUE,
         read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return res.rowCount || 0;
}

async function deleteNotification(notificationId, userId) {
  const res = await pool.query(
    `DELETE FROM mes_notifications
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return res.rows[0] || null;
}

module.exports = {
  createNotification,
  createBulkNotifications,
  getActiveUserIdsByRoles,
  notifyUsers,
  notifyRoleUsers,
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
