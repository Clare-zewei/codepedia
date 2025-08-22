const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get notebooks for a document
router.get('/document/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Check document access
    const docCheck = await db.query(`
      SELECT ed.writer_id, wt.writer1_id, wt.writer2_id, wt.code_annotator_id
      FROM entry_documents ed
      JOIN wiki_tasks wt ON ed.task_id = wt.id
      WHERE ed.id = $1
    `, [documentId]);
    
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docCheck.rows[0];
    const canAccess = req.user.role === 'admin' || 
                     req.user.id === doc.writer_id || 
                     req.user.id === doc.writer1_id || 
                     req.user.id === doc.writer2_id || 
                     req.user.id === doc.code_annotator_id;

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT * FROM entry_notebooks 
      WHERE document_id = $1 
      ORDER BY order_index ASC, created_at ASC
    `, [documentId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notebooks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create notebook
router.post('/', [
  authenticateToken,
  body('document_id').isUUID(),
  body('title').isLength({ min: 1 }).trim(),
  body('language').isIn(['python', 'javascript', 'sql', 'bash', 'shell']),
  body('content').optional(),
  body('description').optional().trim(),
  body('order_index').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      document_id,
      title,
      language,
      content = '',
      description,
      order_index = 0
    } = req.body;

    // Check document ownership
    const docCheck = await db.query('SELECT writer_id FROM entry_documents WHERE id = $1', [document_id]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (docCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      INSERT INTO entry_notebooks (document_id, title, language, content, description, order_index)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [document_id, title, language, content, description, order_index]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notebook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update notebook
router.put('/:notebookId', [
  authenticateToken,
  body('title').optional().isLength({ min: 1 }).trim(),
  body('language').optional().isIn(['python', 'javascript', 'sql', 'bash', 'shell']),
  body('content').optional(),
  body('description').optional().trim(),
  body('order_index').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { notebookId } = req.params;
    const { title, language, content, description, order_index } = req.body;

    // Check ownership via document
    const ownerCheck = await db.query(`
      SELECT ed.writer_id FROM entry_notebooks en
      JOIN entry_documents ed ON en.document_id = ed.id
      WHERE en.id = $1
    `, [notebookId]);

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Notebook not found' });
    }
    
    if (ownerCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (language !== undefined) {
      updates.push(`language = $${paramIndex++}`);
      values.push(language);
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramIndex++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(notebookId);

    const query = `
      UPDATE entry_notebooks 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating notebook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete notebook
router.delete('/:notebookId', authenticateToken, async (req, res) => {
  try {
    const { notebookId } = req.params;

    // Check ownership via document
    const ownerCheck = await db.query(`
      SELECT ed.writer_id FROM entry_notebooks en
      JOIN entry_documents ed ON en.document_id = ed.id
      WHERE en.id = $1
    `, [notebookId]);

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Notebook not found' });
    }
    
    if (ownerCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM entry_notebooks WHERE id = $1', [notebookId]);
    res.json({ message: 'Notebook deleted successfully' });
  } catch (error) {
    console.error('Error deleting notebook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update order
router.put('/document/:documentId/reorder', [
  authenticateToken,
  body('notebooks').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { documentId } = req.params;
    const { notebooks } = req.body;

    // Check document ownership
    const docCheck = await db.query('SELECT writer_id FROM entry_documents WHERE id = $1', [documentId]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (docCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < notebooks.length; i++) {
        const { id } = notebooks[i];
        await client.query(
          'UPDATE entry_notebooks SET order_index = $1 WHERE id = $2 AND document_id = $3',
          [i, id, documentId]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Order updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error reordering notebooks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get supported languages
router.get('/languages', authenticateToken, async (req, res) => {
  try {
    const languages = [
      { value: 'python', label: 'Python', extension: '.py', example: '# Python script example\nprint("Hello, World!")' },
      { value: 'javascript', label: 'JavaScript', extension: '.js', example: '// JavaScript example\nconsole.log("Hello, World!");' },
      { value: 'sql', label: 'SQL', extension: '.sql', example: '-- SQL example\nSELECT * FROM users;' },
      { value: 'bash', label: 'Bash', extension: '.sh', example: '#!/bin/bash\n# Bash script example\necho "Hello, World!"' },
      { value: 'shell', label: 'Shell', extension: '.sh', example: '#!/bin/sh\n# Shell script example\necho "Hello, World!"' }
    ];
    
    res.json(languages);
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;