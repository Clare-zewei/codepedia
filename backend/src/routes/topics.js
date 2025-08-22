const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { module_id, status } = req.query;
    let query = `
      SELECT t.*, m.name as module_name, u.username as code_author_username
      FROM topics t
      JOIN modules m ON t.module_id = m.id
      JOIN users u ON t.code_author_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (module_id) {
      params.push(module_id);
      query += ` AND t.module_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', [
  authenticateToken,
  requireRole(['admin', 'code_author']),
  body('title').isLength({ min: 1 }).trim(),
  body('description').isLength({ min: 1 }).trim(),
  body('module_id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, module_id } = req.body;

    const moduleCheck = await db.query('SELECT id FROM modules WHERE id = $1', [module_id]);
    if (moduleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const result = await db.query(
      'INSERT INTO topics (title, description, module_id, code_author_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, module_id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const topicResult = await db.query(`
      SELECT t.*, m.name as module_name, u.username as code_author_username
      FROM topics t
      JOIN modules m ON t.module_id = m.id
      JOIN users u ON t.code_author_id = u.id
      WHERE t.id = $1
    `, [id]);

    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const codePathsResult = await db.query(`
      SELECT cp.*, u.username as annotated_by_username
      FROM code_paths cp
      JOIN users u ON cp.annotated_by = u.id
      WHERE cp.topic_id = $1
      ORDER BY cp.importance_level, cp.file_path
    `, [id]);

    const assignmentsResult = await db.query(`
      SELECT da.*, u.username as assigned_to_username, u2.username as assigned_by_username
      FROM document_assignments da
      JOIN users u ON da.assigned_to = u.id
      JOIN users u2 ON da.assigned_by = u2.id
      WHERE da.topic_id = $1
      ORDER BY da.created_at DESC
    `, [id]);

    res.json({
      topic: topicResult.rows[0],
      codePaths: codePathsResult.rows,
      assignments: assignmentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching topic details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/code-paths', [
  authenticateToken,
  requireRole(['admin', 'code_author']),
  body('file_path').isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('start_line').optional().isInt({ min: 1 }),
  body('end_line').optional().isInt({ min: 1 }),
  body('importance_level').optional().isInt({ min: 1, max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { file_path, description, start_line, end_line, importance_level } = req.body;

    const topicCheck = await db.query('SELECT id FROM topics WHERE id = $1', [id]);
    if (topicCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const result = await db.query(
      `INSERT INTO code_paths (topic_id, file_path, start_line, end_line, description, importance_level, annotated_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, file_path, start_line, end_line, description, importance_level || 3, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding code path:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;