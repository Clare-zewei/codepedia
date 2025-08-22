const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get code annotations for a specific task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Verify user has access to this task
    const taskResult = await db.query(`
      SELECT wt.*, u1.username as writer1_username, u2.username as writer2_username, u3.username as code_annotator_username
      FROM wiki_tasks wt
      LEFT JOIN users u1 ON wt.writer1_id = u1.id
      LEFT JOIN users u2 ON wt.writer2_id = u2.id
      LEFT JOIN users u3 ON wt.code_annotator_id = u3.id
      WHERE wt.id = $1
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];
    const userId = req.user.id;

    // Check if user has access to view annotations
    const hasAccess = req.user.role === 'admin' || 
                     task.writer1_id === userId || 
                     task.writer2_id === userId || 
                     task.code_annotator_id === userId;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const annotationsResult = await db.query(`
      SELECT ca.*, u.username as annotator_username
      FROM code_annotations ca
      JOIN users u ON ca.annotator_id = u.id
      WHERE ca.task_id = $1
      ORDER BY ca.created_at DESC
    `, [taskId]);

    res.json({
      task: task,
      annotations: annotationsResult.rows
    });
  } catch (error) {
    console.error('Error fetching code annotations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update code annotation
router.post('/task/:taskId', [
  authenticateToken,
  body('file_paths').optional().isArray(),
  body('key_methods').optional().isArray(),
  body('git_commits').optional().isArray(),
  body('deployment_status').optional().trim(),
  body('additional_notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { taskId } = req.params;
    const { file_paths, key_methods, git_commits, deployment_status, additional_notes } = req.body;
    const userId = req.user.id;

    // Verify user is the code annotator for this task
    const taskResult = await db.query(
      'SELECT * FROM wiki_tasks WHERE id = $1 AND code_annotator_id = $2',
      [taskId, userId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or you are not assigned as code annotator' });
    }

    // Check if annotation already exists
    const existingAnnotation = await db.query(
      'SELECT id FROM code_annotations WHERE task_id = $1 AND annotator_id = $2',
      [taskId, userId]
    );

    let result;
    if (existingAnnotation.rows.length > 0) {
      // Update existing annotation
      result = await db.query(`
        UPDATE code_annotations 
        SET file_paths = $1, key_methods = $2, git_commits = $3, 
            deployment_status = $4, additional_notes = $5, updated_at = CURRENT_TIMESTAMP
        WHERE task_id = $6 AND annotator_id = $7
        RETURNING *
      `, [file_paths, key_methods, git_commits, deployment_status, additional_notes, taskId, userId]);
    } else {
      // Create new annotation
      result = await db.query(`
        INSERT INTO code_annotations (task_id, annotator_id, file_paths, key_methods, git_commits, deployment_status, additional_notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [taskId, userId, file_paths, key_methods, git_commits, deployment_status, additional_notes]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating/updating code annotation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all annotations by a specific user
router.get('/my-annotations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT ca.*, wt.title as task_title, f.name as function_name, 
             c.name as category_name, c.path as category_path
      FROM code_annotations ca
      JOIN wiki_tasks wt ON ca.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      WHERE ca.annotator_id = $1
      ORDER BY ca.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user annotations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific annotation by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
      SELECT ca.*, wt.title as task_title, wt.writer1_id, wt.writer2_id, wt.code_annotator_id,
             f.name as function_name, c.name as category_name, c.path as category_path,
             u.username as annotator_username
      FROM code_annotations ca
      JOIN wiki_tasks wt ON ca.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      JOIN users u ON ca.annotator_id = u.id
      WHERE ca.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    const annotation = result.rows[0];

    // Check if user has access to view this annotation
    const hasAccess = req.user.role === 'admin' || 
                     annotation.writer1_id === userId || 
                     annotation.writer2_id === userId || 
                     annotation.code_annotator_id === userId;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(annotation);
  } catch (error) {
    console.error('Error fetching annotation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete annotation (only by annotator or admin)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user can delete this annotation
    const annotationResult = await db.query(
      'SELECT annotator_id FROM code_annotations WHERE id = $1',
      [id]
    );

    if (annotationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    const annotation = annotationResult.rows[0];
    
    if (req.user.role !== 'admin' && annotation.annotator_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM code_annotations WHERE id = $1', [id]);
    res.json({ message: 'Annotation deleted successfully' });
  } catch (error) {
    console.error('Error deleting annotation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get annotation statistics for admin
router.get('/stats/overview', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_annotations,
        COUNT(DISTINCT annotator_id) as unique_annotators,
        COUNT(DISTINCT task_id) as annotated_tasks,
        AVG(array_length(file_paths, 1)) as avg_files_per_annotation,
        AVG(array_length(key_methods, 1)) as avg_methods_per_annotation
      FROM code_annotations
    `);

    const recentActivity = await db.query(`
      SELECT ca.created_at, ca.updated_at, wt.title as task_title, 
             u.username as annotator_username, f.name as function_name
      FROM code_annotations ca
      JOIN wiki_tasks wt ON ca.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN users u ON ca.annotator_id = u.id
      ORDER BY ca.updated_at DESC
      LIMIT 10
    `);

    res.json({
      stats: stats.rows[0],
      recentActivity: recentActivity.rows
    });
  } catch (error) {
    console.error('Error fetching annotation stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;