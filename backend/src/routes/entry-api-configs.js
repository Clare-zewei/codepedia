const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get API configs for a document
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
      SELECT * FROM entry_api_configs 
      WHERE document_id = $1 
      ORDER BY order_index ASC, created_at ASC
    `, [documentId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching API configs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create API config
router.post('/', [
  authenticateToken,
  body('document_id').isUUID(),
  body('name').isLength({ min: 1 }).trim(),
  body('method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  body('endpoint').isLength({ min: 1 }).trim(),
  body('headers').optional().isObject(),
  body('body_type').optional().isIn(['json', 'form', 'raw', 'none']),
  body('body_content').optional(),
  body('expected_status').optional().isInt({ min: 100, max: 599 }),
  body('expected_response').optional(),
  body('environment_vars').optional().isObject(),
  body('order_index').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      document_id,
      name,
      method,
      endpoint,
      headers = {},
      body_type = 'json',
      body_content,
      expected_status,
      expected_response,
      environment_vars = {},
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
      INSERT INTO entry_api_configs (
        document_id, name, method, endpoint, headers, body_type, 
        body_content, expected_status, expected_response, environment_vars, order_index
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      document_id, name, method, endpoint, JSON.stringify(headers), body_type,
      body_content, expected_status, expected_response, JSON.stringify(environment_vars), order_index
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating API config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update API config
router.put('/:configId', [
  authenticateToken,
  body('name').optional().isLength({ min: 1 }).trim(),
  body('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  body('endpoint').optional().isLength({ min: 1 }).trim(),
  body('headers').optional().isObject(),
  body('body_type').optional().isIn(['json', 'form', 'raw', 'none']),
  body('body_content').optional(),
  body('expected_status').optional().isInt({ min: 100, max: 599 }),
  body('expected_response').optional(),
  body('environment_vars').optional().isObject(),
  body('order_index').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { configId } = req.params;
    const {
      name,
      method,
      endpoint,
      headers,
      body_type,
      body_content,
      expected_status,
      expected_response,
      environment_vars,
      order_index
    } = req.body;

    // Check ownership via document
    const ownerCheck = await db.query(`
      SELECT ed.writer_id FROM entry_api_configs eac
      JOIN entry_documents ed ON eac.document_id = ed.id
      WHERE eac.id = $1
    `, [configId]);

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'API config not found' });
    }
    
    if (ownerCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (method !== undefined) {
      updates.push(`method = $${paramIndex++}`);
      values.push(method);
    }
    if (endpoint !== undefined) {
      updates.push(`endpoint = $${paramIndex++}`);
      values.push(endpoint);
    }
    if (headers !== undefined) {
      updates.push(`headers = $${paramIndex++}`);
      values.push(JSON.stringify(headers));
    }
    if (body_type !== undefined) {
      updates.push(`body_type = $${paramIndex++}`);
      values.push(body_type);
    }
    if (body_content !== undefined) {
      updates.push(`body_content = $${paramIndex++}`);
      values.push(body_content);
    }
    if (expected_status !== undefined) {
      updates.push(`expected_status = $${paramIndex++}`);
      values.push(expected_status);
    }
    if (expected_response !== undefined) {
      updates.push(`expected_response = $${paramIndex++}`);
      values.push(expected_response);
    }
    if (environment_vars !== undefined) {
      updates.push(`environment_vars = $${paramIndex++}`);
      values.push(JSON.stringify(environment_vars));
    }
    if (order_index !== undefined) {
      updates.push(`order_index = $${paramIndex++}`);
      values.push(order_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(configId);

    const query = `
      UPDATE entry_api_configs 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating API config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete API config
router.delete('/:configId', authenticateToken, async (req, res) => {
  try {
    const { configId } = req.params;

    // Check ownership via document
    const ownerCheck = await db.query(`
      SELECT ed.writer_id FROM entry_api_configs eac
      JOIN entry_documents ed ON eac.document_id = ed.id
      WHERE eac.id = $1
    `, [configId]);

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'API config not found' });
    }
    
    if (ownerCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM entry_api_configs WHERE id = $1', [configId]);
    res.json({ message: 'API config deleted successfully' });
  } catch (error) {
    console.error('Error deleting API config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update order
router.put('/document/:documentId/reorder', [
  authenticateToken,
  body('configs').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { documentId } = req.params;
    const { configs } = req.body;

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

      for (let i = 0; i < configs.length; i++) {
        const { id } = configs[i];
        await client.query(
          'UPDATE entry_api_configs SET order_index = $1 WHERE id = $2 AND document_id = $3',
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
    console.error('Error reordering API configs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;