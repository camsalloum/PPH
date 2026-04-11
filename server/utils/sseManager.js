/**
 * sseManager.js — Server-Sent Events (SSE) connection registry.
 *
 * Maintains a map of userId → Set<res> for active SSE connections.
 * Used by notificationService to push real-time events without WebSockets.
 *
 * Usage:
 *   const { addClient, removeClient, broadcastToUser } = require('./sseManager');
 */

'use strict';

/** @type {Map<number, Set<import('express').Response>>} */
const clients = new Map();

/**
 * Register a new SSE response stream for a user.
 * @param {number} userId
 * @param {import('express').Response} res  The Express response in streaming mode
 */
function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);
}

/**
 * Remove an SSE response stream (called when connection closes).
 * @param {number} userId
 * @param {import('express').Response} res
 */
function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/**
 * Send a JSON event to all active SSE connections for a user.
 * Silently ignores errors on individual connections.
 * @param {number} userId
 * @param {string} event  SSE event name (e.g. "notification")
 * @param {object} data   JSON-serialisable payload
 */
function broadcastToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(msg);
    } catch {
      // Connection already closed — will be cleaned up when req 'close' fires
    }
  }
}

/**
 * Broadcast a "heartbeat" comment to all connections of a user (keeps proxy alive).
 * @param {number} userId
 */
function heartbeat(userId) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  for (const res of set) {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // ignore
    }
  }
}

/** @returns {number} Total number of active SSE connections across all users */
function connectionCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

module.exports = { addClient, removeClient, broadcastToUser, heartbeat, connectionCount };
