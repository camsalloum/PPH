/**
 * CRM Tasks Routes
 *
 * Endpoints:
 *   POST  /tasks      — create task
 *   GET   /tasks      — list tasks (reps see own + assigned-to-them; management sees all)
 *   PATCH /tasks/:id  — update task
 *
 * Also includes Notes endpoints:
 *   POST   /notes          — create note
 *   GET    /notes          — list notes
 *   PATCH  /notes/:id      — update note (author only)
 *   DELETE /notes/:id      — delete note (author only)
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool, authPool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');
const { notifyTaskAssigned } = require('../../services/crmNotificationService');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// POST /api/crm/tasks
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, due_date, priority, assignee_id, customer_id, prospect_id } = req.body;
    const userId = req.user.id;

    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'title is required' });
    if (!due_date) return res.status(400).json({ success: false, error: 'due_date is required' });

    const effectiveAssignee = assignee_id || userId;
    let assigneeName = null;
    try {
      const aRes = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [effectiveAssignee]);
      if (aRes.rows.length > 0) assigneeName = aRes.rows[0].full_name;
    } catch (_) { /* non-critical */ }

    // Look up creator name for "assigned by" display when assigning to someone else
    let creatorName = null;
    if (effectiveAssignee !== userId) {
      try {
        const cRes = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
        if (cRes.rows.length > 0) creatorName = cRes.rows[0].full_name;
      } catch (_) { /* non-critical */ }
    }

    const result = await pool.query(
      `INSERT INTO crm_tasks (title, description, due_date, priority, assignee_id, assignee_name, customer_id, prospect_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title.trim(), description || null, due_date, priority || 'medium',
       effectiveAssignee, assigneeName, customer_id || null, prospect_id || null, userId]
    );

    const task = result.rows[0];
    if (creatorName) task.assigned_by_name = creatorName;
    res.status(201).json({ success: true, data: task });

    // Send SSE notification when assigning to someone else
    if (effectiveAssignee !== userId) {
      notifyTaskAssigned({
        task,
        assigneeId: effectiveAssignee,
        assignerName: creatorName || req.user.full_name || req.user.username || 'Someone',
      }).catch(() => {});
    }
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Tasks table not yet created. Please run migrations.' });
    logger.error('CRM: error creating task', err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// GET /api/crm/tasks
// Reps see tasks they own (assignee_id) + tasks assigned to them (created_by != assignee_id).
// Management (FULL_ACCESS_ROLES) sees all tasks.
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isFullAccess = FULL_ACCESS_ROLES.includes(userRole);

    const { assigneeId, status, customerId, prospectId, dueBefore } = req.query;

    const conditions = [];
    const params = [];
    let p = 1;

    if (!isFullAccess) {
      // Reps see tasks assigned to them OR tasks they created
      conditions.push('(t.assignee_id = $' + p + ' OR t.created_by = $' + p + ')');
      params.push(userId);
      p++;
    } else if (assigneeId) {
      conditions.push('t.assignee_id = $' + p++);
      params.push(parseInt(assigneeId));
    }

    if (customerId) { conditions.push('t.customer_id = $' + p++); params.push(parseInt(customerId)); }
    if (prospectId) { conditions.push('t.prospect_id = $' + p++); params.push(parseInt(prospectId)); }
    if (dueBefore)  { conditions.push('t.due_date <= $' + p++);   params.push(dueBefore); }

    if (status === 'overdue') {
      conditions.push("t.status = 'open' AND t.due_date < CURRENT_DATE");
    } else if (status === 'open') {
      conditions.push("t.status = 'open'");
    } else if (status === 'completed') {
      conditions.push("t.status = 'completed'");
    } else {
      conditions.push("t.status = 'open'");
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const limitValue = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    if (req.query.limit) {
      params.push(limitValue);
    }

    const sql = `SELECT t.*,
              CASE WHEN t.due_date < CURRENT_DATE AND t.status = 'open' THEN 'overdue' ELSE t.status END AS computed_status,
              cu.display_name AS customer_name,
              fp.customer_name AS prospect_name
       FROM crm_tasks t
       LEFT JOIN fp_customer_unified cu ON cu.customer_id = t.customer_id
       LEFT JOIN fp_prospects fp ON fp.id = t.prospect_id
       ${where}
       ORDER BY t.due_date ASC
       ${req.query.limit ? 'LIMIT $' + params.length : ''}`;

    const result = await pool.query(sql, params);

    // Enrich with assigned_by_name for tasks assigned by someone else
    const rows = result.rows;
    const creatorIds = [...new Set(rows.filter(r => r.created_by && r.created_by !== r.assignee_id).map(r => r.created_by))];
    if (creatorIds.length > 0) {
      try {
        const creatorsRes = await authPool.query(
          'SELECT id, full_name FROM users WHERE id = ANY($1::int[])',
          [creatorIds]
        );
        const nameMap = {};
        creatorsRes.rows.forEach(u => { nameMap[u.id] = u.full_name; });
        rows.forEach(r => {
          if (r.created_by && r.created_by !== r.assignee_id && nameMap[r.created_by]) {
            r.assigned_by_name = nameMap[r.created_by];
          }
        });
      } catch (_) { /* non-critical enrichment */ }
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching tasks', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// PATCH /api/crm/tasks/:id
router.patch('/tasks/:id', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    if (!taskId) return res.status(400).json({ success: false, error: 'Invalid task ID' });

    const { status, title, description, due_date, priority, assignee_id, customer_id, prospect_id } = req.body;
    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);

    // Ownership check: non-admin users can only update tasks they created or are assigned to
    if (!isFullAccess) {
      const ownerCheck = await pool.query(
        'SELECT 1 FROM crm_tasks WHERE id = $1 AND (assignee_id = $2 OR created_by = $2)',
        [taskId, userId]
      );
      if (ownerCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Not authorized to update this task' });
    }

    const sets = [];
    const params = [];
    let p = 1;

    if (title !== undefined)       { sets.push('title = $' + p++);       params.push(title); }
    if (description !== undefined) { sets.push('description = $' + p++); params.push(description); }
    if (due_date !== undefined)    { sets.push('due_date = $' + p++);    params.push(due_date); }
    if (priority !== undefined)    { sets.push('priority = $' + p++);    params.push(priority); }
    if (assignee_id !== undefined) { sets.push('assignee_id = $' + p++); params.push(assignee_id); }
    if (customer_id !== undefined) { sets.push('customer_id = $' + p++); params.push(customer_id); }
    if (prospect_id !== undefined) { sets.push('prospect_id = $' + p++); params.push(prospect_id); }
    if (status !== undefined) {
      sets.push('status = $' + p++);
      params.push(status);
      if (status === 'completed') {
        sets.push('completed_at = NOW()');
      }
    }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at = NOW()');

    params.push(taskId);
    const result = await pool.query(
      'UPDATE crm_tasks SET ' + sets.join(', ') + ' WHERE id = $' + p + ' RETURNING *',
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });

    const updatedTask = result.rows[0];
    res.json({ success: true, data: updatedTask });

    if (assignee_id && assignee_id !== userId) {
      notifyTaskAssigned({
        task: updatedTask,
        assigneeId: assignee_id,
        assignerName: req.user.full_name || req.user.username || 'Someone',
      }).catch(() => {});
    }
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Tasks table not yet created. Please run migrations.' });
    logger.error('CRM: error updating task', err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// ============================================================================
// NOTES
// ============================================================================

router.post('/notes', authenticate, async (req, res) => {
  try {
    const { body, record_type, record_id } = req.body;
    const userId = req.user.id;

    if (!body || !body.trim()) return res.status(400).json({ success: false, error: 'body is required' });
    if (!record_type || !['customer', 'prospect'].includes(record_type))
      return res.status(400).json({ success: false, error: 'record_type must be customer or prospect' });
    if (!record_id) return res.status(400).json({ success: false, error: 'record_id is required' });

    let authorName = null;
    try {
      const aRes = await authPool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
      if (aRes.rows.length > 0) authorName = aRes.rows[0].full_name;
    } catch (_) { /* non-critical */ }

    const result = await pool.query(
      `INSERT INTO crm_notes (body, record_type, record_id, author_id, author_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [body.trim(), record_type, parseInt(record_id), userId, authorName]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ success: false, error: 'Notes table not yet created. Please run migrations.' });
    logger.error('CRM: error creating note', err);
    res.status(500).json({ success: false, error: 'Failed to create note' });
  }
});

router.get('/notes', authenticate, async (req, res) => {
  try {
    const { recordType, recordId } = req.query;
    if (!recordType || !recordId) return res.status(400).json({ success: false, error: 'recordType and recordId are required' });

    const result = await pool.query(
      `SELECT * FROM crm_notes WHERE record_type = $1 AND record_id = $2 ORDER BY created_at DESC`,
      [recordType, parseInt(recordId)]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true, data: [] });
    logger.error('CRM: error fetching notes', err);
    res.status(500).json({ success: false, error: 'Failed to fetch notes' });
  }
});

router.patch('/notes/:id', authenticate, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { body } = req.body;

    if (!body || !body.trim()) return res.status(400).json({ success: false, error: 'body is required' });

    const result = await pool.query(
      `UPDATE crm_notes SET body = $1, updated_at = NOW() WHERE id = $2 AND author_id = $3 RETURNING *`,
      [body.trim(), noteId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found or not authorized' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('CRM: error updating note', err);
    res.status(500).json({ success: false, error: 'Failed to update note' });
  }
});

router.delete('/notes/:id', authenticate, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const isFullAccess = FULL_ACCESS_ROLES.includes(req.user.role);

    // Admins can delete any note; others can only delete their own
    const result = isFullAccess
      ? await pool.query('DELETE FROM crm_notes WHERE id = $1 RETURNING id', [noteId])
      : await pool.query('DELETE FROM crm_notes WHERE id = $1 AND author_id = $2 RETURNING id', [noteId, userId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found or not authorized' });
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    logger.error('CRM: error deleting note', err);
    res.status(500).json({ success: false, error: 'Failed to delete note' });
  }
});

module.exports = router;
