const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all wiki tasks with filtering options
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, function_id, writer_id, assigned_by } = req.query;
    let query = `
      SELECT wt.*, f.name as function_name, c.name as category_name, c.path as category_path,
             u1.username as assigned_by_username,
             u2.username as code_annotator_username,
             u3.username as writer1_username,
             u4.username as writer2_username,
             -- Count submissions
             COUNT(wc.id) as submission_count,
             -- Count votes if in voting phase
             COUNT(wv.id) as vote_count
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u1 ON wt.assigned_by = u1.id
      LEFT JOIN users u2 ON wt.code_annotator_id = u2.id
      LEFT JOIN users u3 ON wt.writer1_id = u3.id
      LEFT JOIN users u4 ON wt.writer2_id = u4.id
      LEFT JOIN wiki_contents wc ON wt.id = wc.task_id AND wc.status = 'submitted'
      LEFT JOIN wiki_votes wv ON wt.id = wv.task_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND wt.status = $${params.length}`;
    }

    if (function_id) {
      params.push(function_id);
      query += ` AND wt.function_id = $${params.length}`;
    }

    if (writer_id) {
      params.push(writer_id);
      query += ` AND (wt.writer1_id = $${params.length} OR wt.writer2_id = $${params.length})`;
    }

    if (assigned_by) {
      params.push(assigned_by);
      query += ` AND wt.assigned_by = $${params.length}`;
    }

    query += `
      GROUP BY wt.id, f.name, c.name, c.path, u1.username, u2.username, u3.username, u4.username
      ORDER BY wt.created_at DESC
    `;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching wiki tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new wiki task (admin only)
router.post('/', [
  authenticateToken,
  requireRole(['admin']),
  body('function_id').isUUID(),
  body('title').isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('code_annotator_id').isUUID(),
  body('writer1_id').isUUID(),
  body('writer2_id').isUUID(),
  body('deadline').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { function_id, title, description, code_annotator_id, writer1_id, writer2_id, deadline } = req.body;

    // Verify function exists
    const functionCheck = await db.query('SELECT id FROM functions WHERE id = $1', [function_id]);
    if (functionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    // Verify all users exist and have appropriate roles
    const userChecks = await Promise.all([
      db.query('SELECT id, role FROM users WHERE id = $1', [code_annotator_id]),
      db.query('SELECT id, role FROM users WHERE id = $1', [writer1_id]),
      db.query('SELECT id, role FROM users WHERE id = $1', [writer2_id])
    ]);

    if (userChecks.some(result => result.rows.length === 0)) {
      return res.status(404).json({ error: 'One or more assigned users not found' });
    }

    // Verify writers are different people
    if (writer1_id === writer2_id) {
      return res.status(400).json({ error: 'Two different writers must be assigned' });
    }

    // Check if there's already an active task for this function
    const activeTaskCheck = await db.query(
      'SELECT id FROM wiki_tasks WHERE function_id = $1 AND status != $2',
      [function_id, 'completed']
    );

    if (activeTaskCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This function already has an active wiki task' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Create the task
      const taskResult = await client.query(
        `INSERT INTO wiki_tasks (function_id, title, description, code_annotator_id, writer1_id, writer2_id, assigned_by, deadline) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [function_id, title, description, code_annotator_id, writer1_id, writer2_id, req.user.id, deadline]
      );

      const task = taskResult.rows[0];

      // Create notifications for all assigned users
      const notifications = [
        {
          recipient_id: code_annotator_id,
          type: 'task_assigned',
          title: 'Code Annotation Task Assigned',
          message: `You have been assigned to provide code annotations for "${title}"`
        },
        {
          recipient_id: writer1_id,
          type: 'task_assigned',
          title: 'Wiki Writing Task Assigned',
          message: `You have been assigned to write documentation for "${title}"`
        },
        {
          recipient_id: writer2_id,
          type: 'task_assigned',
          title: 'Wiki Writing Task Assigned',
          message: `You have been assigned to write documentation for "${title}"`
        }
      ];

      for (const notification of notifications) {
        await client.query(
          'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5)',
          [task.id, notification.recipient_id, notification.type, notification.title, notification.message]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(task);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating wiki task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific wiki task with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const taskResult = await db.query(`
      SELECT wt.*, f.name as function_name, f.description as function_description,
             c.name as category_name, c.path as category_path,
             u1.username as assigned_by_username,
             u2.username as code_annotator_username,
             u3.username as writer1_username,
             u4.username as writer2_username
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u1 ON wt.assigned_by = u1.id
      LEFT JOIN users u2 ON wt.code_annotator_id = u2.id
      LEFT JOIN users u3 ON wt.writer1_id = u3.id
      LEFT JOIN users u4 ON wt.writer2_id = u4.id
      WHERE wt.id = $1
    `, [id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wiki task not found' });
    }

    // Get code annotations
    const annotationsResult = await db.query(`
      SELECT ca.*, u.username as annotator_username
      FROM code_annotations ca
      JOIN users u ON ca.annotator_id = u.id
      WHERE ca.task_id = $1
      ORDER BY ca.created_at DESC
    `, [id]);

    // Get wiki contents (with privacy protection for concurrent writing)
    let contentsQuery = `
      SELECT wc.id, wc.writer_id, wc.status, wc.submitted_at, wc.created_at,
             u.username as writer_username
      FROM wiki_contents wc
      JOIN users u ON wc.writer_id = u.id
      WHERE wc.task_id = $1
    `;
    
    const task = taskResult.rows[0];
    const currentUserId = req.user.id;
    
    // Only show content details if:
    // 1. Task is in voting phase or completed
    // 2. User is the writer of that content
    // 3. User is admin
    const canSeeAllContent = task.status === 'pending_vote' || task.status === 'completed' || req.user.role === 'admin';
    
    if (canSeeAllContent) {
      contentsQuery = `
        SELECT wc.*, u.username as writer_username
        FROM wiki_contents wc
        JOIN users u ON wc.writer_id = u.id
        WHERE wc.task_id = $1
      `;
    } else {
      // Only show user's own content
      contentsQuery += ` AND wc.writer_id = $2`;
    }

    contentsQuery += ' ORDER BY wc.created_at DESC';

    const contentsParams = canSeeAllContent ? [id] : [id, currentUserId];
    const contentsResult = await db.query(contentsQuery, contentsParams);

    // Get task acceptances
    const acceptancesResult = await db.query(`
      SELECT ta.*, u.username as writer_username
      FROM task_acceptances ta
      JOIN users u ON ta.writer_id = u.id
      WHERE ta.task_id = $1
      ORDER BY ta.accepted_at
    `, [id]);

    // Get voting results if in voting phase
    let votingResults = null;
    if (task.status === 'pending_vote' || task.status === 'completed') {
      const votesResult = await db.query(`
        SELECT vote_option, COUNT(*) as count
        FROM wiki_votes
        WHERE task_id = $1
        GROUP BY vote_option
      `, [id]);
      
      votingResults = {
        version_a: 0,
        version_b: 0,
        neither_satisfactory: 0
      };
      
      votesResult.rows.forEach(row => {
        votingResults[row.vote_option] = parseInt(row.count);
      });
    }

    res.json({
      task: taskResult.rows[0],
      annotations: annotationsResult.rows,
      contents: contentsResult.rows,
      acceptances: acceptancesResult.rows,
      votingResults
    });
  } catch (error) {
    console.error('Error fetching wiki task details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept a wiki task (writers only)
router.post('/:id/accept', [
  authenticateToken
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user is assigned to this task
    const taskResult = await db.query(
      'SELECT * FROM wiki_tasks WHERE id = $1 AND (writer1_id = $2 OR writer2_id = $2)',
      [id, userId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or you are not assigned to this task' });
    }

    const task = taskResult.rows[0];

    if (task.status !== 'not_started' && task.status !== 'in_progress') {
      return res.status(400).json({ error: 'Task cannot be accepted in current status' });
    }

    // Check if already accepted
    const existingAcceptance = await db.query(
      'SELECT id FROM task_acceptances WHERE task_id = $1 AND writer_id = $2',
      [id, userId]
    );

    if (existingAcceptance.rows.length > 0) {
      return res.status(400).json({ error: 'You have already accepted this task' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Record acceptance
      await client.query(
        'INSERT INTO task_acceptances (task_id, writer_id) VALUES ($1, $2)',
        [id, userId]
      );

      // Update task status to in_progress if this is the first acceptance
      if (task.status === 'not_started') {
        await client.query(
          'UPDATE wiki_tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['in_progress', id]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Task accepted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error accepting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tasks assigned to current user
router.get('/my/assigned', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT wt.*, f.name as function_name, c.name as category_name, c.path as category_path,
             u1.username as assigned_by_username,
             CASE 
               WHEN wt.writer1_id = $1 THEN 'writer1'
               WHEN wt.writer2_id = $1 THEN 'writer2'
               WHEN wt.code_annotator_id = $1 THEN 'annotator'
               ELSE null
             END as my_role,
             EXISTS(SELECT 1 FROM task_acceptances WHERE task_id = wt.id AND writer_id = $1) as accepted_by_me
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u1 ON wt.assigned_by = u1.id
      WHERE wt.writer1_id = $1 OR wt.writer2_id = $1 OR wt.code_annotator_id = $1
      ORDER BY wt.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching assigned tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;