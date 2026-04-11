const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const authService = require('../services/authService');
const {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../services/notificationService');
const { addClient, removeClient, heartbeat } = require('../utils/sseManager');

// ─── H-007: SSE stream endpoint ──────────────────────────────────────────────
// GET /api/notifications/stream?token=<jwt>
// EventSource can't set Authorization headers, so the JWT is passed as a query param.
router.get('/stream', async (req, res) => {
  // Authenticate via query param token (use authService so the fallback secret matches)
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let user;
  try {
    user = await authService.verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = user?.userId || user?.id;
  if (!userId) return res.status(401).json({ error: 'User not found' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if used
  res.flushHeaders();

  // Send initial "connected" event with current unread count
  try {
    const count = await getUnreadCount(userId);
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, unreadCount: count })}\n\n`);
  } catch {
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, unreadCount: 0 })}\n\n`);
  }

  // Register this connection
  addClient(userId, res);

  // Heartbeat every 25 seconds to prevent proxy / browser timeout
  const timer = setInterval(() => heartbeat(userId), 25000);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(timer);
    removeClient(userId, res);
  });
});

// ─── REST endpoints ───────────────────────────────────────────────────────────

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ success: true, count });
  } catch (err) {
    logger.error('Notifications: unread count failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await getNotifications(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      unreadOnly: req.query.unreadOnly,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    logger.error('Notifications: list failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid notification id' });
    }

    const row = await markAsRead(id, req.user.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: row });
  } catch (err) {
    logger.error('Notifications: mark read failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/mark-all-read', authenticate, async (req, res) => {
  try {
    const updated = await markAllAsRead(req.user.id);
    res.json({ success: true, updated });
  } catch (err) {
    logger.error('Notifications: mark all read failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid notification id' });
    }

    const row = await deleteNotification(id, req.user.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: row });
  } catch (err) {
    logger.error('Notifications: delete failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
