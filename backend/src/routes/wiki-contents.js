const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get wiki content for a task (with privacy protection for concurrent writing)
router.get('/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    // Get task details to check access and status
    const taskResult = await db.query(`
      SELECT wt.*, f.name as function_name, c.name as category_name
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      WHERE wt.id = $1
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to this task
    const hasAccess = req.user.role === 'admin' || 
                     task.writer1_id === userId || 
                     task.writer2_id === userId || 
                     task.code_annotator_id === userId;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let contentsQuery;
    let params = [taskId];

    // Content isolation during concurrent writing phase
    if (task.status === 'in_progress' && req.user.role !== 'admin') {
      // During writing phase, writers can only see their own content
      contentsQuery = `
        SELECT wc.id, wc.writer_id, wc.status, wc.submitted_at, wc.created_at, wc.updated_at,
               CASE WHEN wc.writer_id = $2 THEN wc.feature_documentation ELSE null END as feature_documentation,
               CASE WHEN wc.writer_id = $2 THEN wc.api_testing ELSE null END as api_testing,
               CASE WHEN wc.writer_id = $2 THEN wc.use_case_scripts ELSE null END as use_case_scripts,
               u.username as writer_username
        FROM wiki_contents wc
        JOIN users u ON wc.writer_id = u.id
        WHERE wc.task_id = $1
        ORDER BY wc.created_at DESC
      `;
      params.push(userId);
    } else {
      // In voting phase or for admins, show all content
      contentsQuery = `
        SELECT wc.*, u.username as writer_username
        FROM wiki_contents wc
        JOIN users u ON wc.writer_id = u.id
        WHERE wc.task_id = $1
        ORDER BY wc.created_at DESC
      `;
    }

    const contentsResult = await db.query(contentsQuery, params);

    res.json({
      task: task,
      contents: contentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching wiki contents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update wiki content
router.post('/task/:taskId', [
  authenticateToken,
  body('feature_documentation').isLength({ min: 10 }).trim(),
  body('api_testing').isLength({ min: 10 }).trim(),
  body('use_case_scripts').isLength({ min: 10 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { taskId } = req.params;
    const { feature_documentation, api_testing, use_case_scripts } = req.body;
    const userId = req.user.id;

    // Verify user is assigned as writer for this task
    const taskResult = await db.query(
      'SELECT * FROM wiki_tasks WHERE id = $1 AND (writer1_id = $2 OR writer2_id = $2)',
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or you are not assigned as writer' });
    }

    const task = taskResult.rows[0];

    // Check if task is in correct status for writing
    if (task.status !== 'in_progress') {
      return res.status(400).json({ error: 'Task is not in writing phase' });
    }

    // Check if user has already submitted content
    const existingContent = await db.query(
      'SELECT * FROM wiki_contents WHERE task_id = $1 AND writer_id = $2',
      [taskId, userId]
    );

    if (existingContent.rows.length > 0 && existingContent.rows[0].status === 'submitted') {
      return res.status(400).json({ error: 'You have already submitted content for this task' });
    }

    let result;
    if (existingContent.rows.length > 0) {
      // Update existing draft
      result = await db.query(`
        UPDATE wiki_contents 
        SET feature_documentation = $1, api_testing = $2, use_case_scripts = $3, updated_at = CURRENT_TIMESTAMP
        WHERE task_id = $4 AND writer_id = $5
        RETURNING *
      `, [feature_documentation, api_testing, use_case_scripts, taskId, userId]);
    } else {
      // Create new content
      result = await db.query(`
        INSERT INTO wiki_contents (task_id, writer_id, feature_documentation, api_testing, use_case_scripts)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [taskId, userId, feature_documentation, api_testing, use_case_scripts]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating/updating wiki content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit wiki content for review
router.post('/task/:taskId/submit', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    // Verify user has content for this task
    const contentResult = await db.query(
      'SELECT * FROM wiki_contents WHERE task_id = $1 AND writer_id = $2',
      [taskId, userId]
    );

    if (contentResult.rows.length === 0) {
      return res.status(404).json({ error: 'No content found for this task' });
    }

    const content = contentResult.rows[0];

    if (content.status === 'submitted') {
      return res.status(400).json({ error: 'Content already submitted' });
    }

    // Validate that all required parts are filled
    if (!content.feature_documentation?.trim() || 
        !content.api_testing?.trim() || 
        !content.use_case_scripts?.trim()) {
      return res.status(400).json({ error: 'All three parts (feature documentation, API testing, use case scripts) must be completed' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Submit the content
      await client.query(
        'UPDATE wiki_contents SET status = $1, submitted_at = CURRENT_TIMESTAMP WHERE task_id = $2 AND writer_id = $3',
        ['submitted', taskId, userId]
      );

      // Check if both writers have submitted or deadline has passed
      const submittedCount = await client.query(
        'SELECT COUNT(*) as count FROM wiki_contents WHERE task_id = $1 AND status = $2',
        [taskId, 'submitted']
      );

      const taskInfo = await client.query('SELECT deadline FROM wiki_tasks WHERE id = $1', [taskId]);
      const deadline = taskInfo.rows[0].deadline;
      const now = new Date();
      const deadlinePassed = deadline && new Date(deadline) <= now;

      // If both submitted or deadline passed, move to voting phase
      if (parseInt(submittedCount.rows[0].count) >= 2 || deadlinePassed) {
        await client.query(
          'UPDATE wiki_tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['pending_vote', taskId]
        );

        // Notify admin that voting can begin
        const adminUsers = await client.query('SELECT id FROM users WHERE role = $1', ['admin']);
        for (const admin of adminUsers.rows) {
          await client.query(
            'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5)',
            [taskId, admin.id, 'voting_started', 'Voting Phase Ready', 'Wiki content submissions are ready for voting']
          );
        }
      }

      await client.query('COMMIT');
      res.json({ message: 'Content submitted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting wiki content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get my wiki contents (for current user)
router.get('/my-contents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT wc.*, wt.title as task_title, wt.status as task_status,
             f.name as function_name, c.name as category_name, c.path as category_path
      FROM wiki_contents wc
      JOIN wiki_tasks wt ON wc.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      WHERE wc.writer_id = $1
      ORDER BY wc.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user contents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific wiki content by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
      SELECT wc.*, wt.title as task_title, wt.status as task_status, 
             wt.writer1_id, wt.writer2_id, wt.code_annotator_id,
             f.name as function_name, c.name as category_name,
             u.username as writer_username
      FROM wiki_contents wc
      JOIN wiki_tasks wt ON wc.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      JOIN users u ON wc.writer_id = u.id
      WHERE wc.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = result.rows[0];

    // Check access permissions based on task status and user role
    const hasAccess = req.user.role === 'admin' || 
                     content.writer_id === userId ||
                     content.task_status === 'pending_vote' ||
                     content.task_status === 'completed';

    // During writing phase, only show content to its author (unless admin)
    if (content.task_status === 'in_progress' && content.writer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Content not accessible during writing phase' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(content);
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete wiki content (only draft content by author)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contentResult = await db.query(
      'SELECT * FROM wiki_contents WHERE id = $1',
      [id]
    );

    if (contentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = contentResult.rows[0];

    // Only author can delete their own draft content
    if (content.writer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (content.status === 'submitted') {
      return res.status(400).json({ error: 'Cannot delete submitted content' });
    }

    await db.query('DELETE FROM wiki_contents WHERE id = $1', [id]);
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;