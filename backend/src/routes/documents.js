const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { topic_id, author_id } = req.query;
    let query = `
      SELECT d.*, da.topic_id, u.username as author_username,
             t.title as topic_title, m.name as module_name
      FROM documents d
      JOIN document_assignments da ON d.assignment_id = da.id
      JOIN users u ON d.author_id = u.id
      JOIN topics t ON da.topic_id = t.id
      JOIN modules m ON t.module_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (topic_id) {
      params.push(topic_id);
      query += ` AND da.topic_id = $${params.length}`;
    }

    if (author_id) {
      params.push(author_id);
      query += ` AND d.author_id = $${params.length}`;
    }

    query += ' ORDER BY d.submitted_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/assignments', [
  authenticateToken,
  requireRole(['admin']),
  body('topic_id').isUUID(),
  body('assigned_to').isUUID(),
  body('deadline').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { topic_id, assigned_to, deadline } = req.body;

    const topicCheck = await db.query('SELECT id FROM topics WHERE id = $1', [topic_id]);
    if (topicCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const userCheck = await db.query('SELECT id FROM users WHERE id = $1 AND role IN ($2, $3)', 
      [assigned_to, 'doc_author', 'team_member']);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid assignee or user not authorized for documentation' });
    }

    const result = await db.query(
      'INSERT INTO document_assignments (topic_id, assigned_to, assigned_by, deadline) VALUES ($1, $2, $3, $4) RETURNING *',
      [topic_id, assigned_to, req.user.id, deadline]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', [
  authenticateToken,
  requireRole(['doc_author', 'team_member']),
  body('assignment_id').isUUID(),
  body('title').isLength({ min: 1 }).trim(),
  body('content').isLength({ min: 10 }).trim(),
  body('doc_type').optional().isIn(['technical_analysis', 'api_documentation', 'user_guide', 'code_review'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { assignment_id, title, content, doc_type } = req.body;

    const assignmentCheck = await db.query(
      'SELECT id FROM document_assignments WHERE id = $1 AND assigned_to = $2 AND status = $3', 
      [assignment_id, req.user.id, 'assigned']
    );
    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found or not authorized' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        'INSERT INTO documents (assignment_id, title, content, doc_type, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [assignment_id, title, content, doc_type || 'technical_analysis', req.user.id]
      );

      await client.query(
        'UPDATE document_assignments SET status = $1 WHERE id = $2',
        ['submitted', assignment_id]
      );

      await client.query('COMMIT');
      res.status(201).json(docResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT d.*, da.topic_id, u.username as author_username,
             t.title as topic_title, m.name as module_name
      FROM documents d
      JOIN document_assignments da ON d.assignment_id = da.id
      JOIN users u ON d.author_id = u.id
      JOIN topics t ON da.topic_id = t.id
      JOIN modules m ON t.module_id = m.id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const votesResult = await db.query(`
      SELECT v.*, u.username as voter_username
      FROM votes v
      JOIN users u ON v.voter_id = u.id
      WHERE v.document_id = $1
      ORDER BY v.voted_at DESC
    `, [id]);

    res.json({
      document: result.rows[0],
      votes: votesResult.rows
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;