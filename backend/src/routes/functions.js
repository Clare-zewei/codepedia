const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all functions with optional category filter
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category_id } = req.query;
    let query = `
      SELECT f.*, c.name as category_name, c.path as category_path,
             u.username as created_by_username,
             COUNT(wt.id) as task_count,
             COUNT(CASE WHEN wt.status = 'completed' THEN 1 END) as completed_tasks
      FROM functions f
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u ON f.created_by = u.id
      LEFT JOIN wiki_tasks wt ON f.id = wt.function_id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      query += ` AND f.category_id = $${params.length}`;
    }

    query += `
      GROUP BY f.id, f.name, f.description, f.created_at, c.name, c.path, u.username
      ORDER BY f.created_at DESC
    `;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching functions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new function (admin only)
router.post('/', [
  authenticateToken,
  requireRole(['admin']),
  body('name').isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('category_id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, category_id } = req.body;

    // Verify category exists
    const categoryCheck = await db.query('SELECT id FROM categories WHERE id = $1', [category_id]);
    if (categoryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = await db.query(
      'INSERT INTO functions (name, description, category_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, category_id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating function:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific function with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const functionResult = await db.query(`
      SELECT f.*, c.name as category_name, c.path as category_path,
             u.username as created_by_username
      FROM functions f
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.id = $1
    `, [id]);

    if (functionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    // Get associated wiki tasks
    const tasksResult = await db.query(`
      SELECT wt.id, wt.title, wt.status, wt.deadline, wt.created_at,
             u1.username as assigned_by_username,
             u2.username as code_annotator_username,
             u3.username as writer1_username,
             u4.username as writer2_username
      FROM wiki_tasks wt
      LEFT JOIN users u1 ON wt.assigned_by = u1.id
      LEFT JOIN users u2 ON wt.code_annotator_id = u2.id
      LEFT JOIN users u3 ON wt.writer1_id = u3.id
      LEFT JOIN users u4 ON wt.writer2_id = u4.id
      WHERE wt.function_id = $1
      ORDER BY wt.created_at DESC
    `, [id]);

    // Get completed wiki content (if any)
    const wikiContentResult = await db.query(`
      SELECT wc.*, u.username as writer_username
      FROM wiki_contents wc
      JOIN users u ON wc.writer_id = u.id
      JOIN wiki_tasks wt ON wc.task_id = wt.id
      WHERE wt.function_id = $1 AND wc.status = 'selected'
      ORDER BY wc.created_at DESC
      LIMIT 1
    `, [id]);

    res.json({
      function: functionResult.rows[0],
      tasks: tasksResult.rows,
      wikiContent: wikiContentResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching function details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update function (admin only)
router.put('/:id', [
  authenticateToken,
  requireRole(['admin']),
  body('name').optional().isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('category_id').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, category_id } = req.body;

    // Check if function exists
    const existingResult = await db.query('SELECT * FROM functions WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    // If category_id is provided, verify it exists
    if (category_id) {
      const categoryCheck = await db.query('SELECT id FROM categories WHERE id = $1', [category_id]);
      if (categoryCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }

    const existing = existingResult.rows[0];
    const updates = {
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      category_id: category_id || existing.category_id
    };

    const result = await db.query(
      'UPDATE functions SET name = $1, description = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [updates.name, updates.description, updates.category_id, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating function:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete function (admin only)
router.delete('/:id', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if function has active wiki tasks
    const tasksResult = await db.query(
      'SELECT COUNT(*) as count FROM wiki_tasks WHERE function_id = $1 AND status != $2',
      [id, 'completed']
    );
    
    if (parseInt(tasksResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete function with active wiki tasks' });
    }

    const result = await db.query('DELETE FROM functions WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    res.json({ message: 'Function deleted successfully' });
  } catch (error) {
    console.error('Error deleting function:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search functions
router.get('/search/:query', authenticateToken, async (req, res) => {
  try {
    const { query } = req.params;
    const searchTerm = `%${query}%`;

    const result = await db.query(`
      SELECT f.*, c.name as category_name, c.path as category_path,
             u.username as created_by_username
      FROM functions f
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.name ILIKE $1 OR f.description ILIKE $1 OR c.name ILIKE $1
      ORDER BY 
        CASE WHEN f.name ILIKE $1 THEN 1 ELSE 2 END,
        f.name
      LIMIT 20
    `, [searchTerm]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error searching functions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;