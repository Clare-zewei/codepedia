const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all categories in hierarchical structure
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.id, c.name, c.description, c.parent_id, c.path, c.created_at,
             u.username as created_by_username
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.path
    `);

    const categories = result.rows.map(category => ({
      ...category,
      children: []
    }));

    const categoryMap = {};
    categories.forEach(category => {
      categoryMap[category.id] = category;
    });

    const rootCategories = [];
    categories.forEach(category => {
      if (category.parent_id) {
        const parent = categoryMap[category.parent_id];
        if (parent) {
          parent.children.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    res.json(rootCategories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new category (admin only)
router.post('/', [
  authenticateToken,
  requireRole(['admin']),
  body('name').isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('parent_id').optional().custom((value) => {
    // Allow null, undefined, or valid UUID
    if (value === null || value === undefined || value === '') {
      return true;
    }
    // Must be a valid UUID if provided
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('Parent ID must be a valid UUID');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    // Convert empty string to null for parent_id
    const parent_id = req.body.parent_id || null;
    let path = `/${name}`;

    // If has parent, construct full path
    if (parent_id) {
      const parentResult = await db.query('SELECT path FROM categories WHERE id = $1', [parent_id]);
      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Parent category not found' });
      }
      const parentPath = parentResult.rows[0].path;
      path = `${parentPath}/${name}`;
    }

    const result = await db.query(
      'INSERT INTO categories (name, description, parent_id, path, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, parent_id, path, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific category with its functions
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const categoryResult = await db.query(`
      SELECT c.*, u.username as created_by_username
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `, [id]);

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const functionsResult = await db.query(`
      SELECT f.id, f.name, f.description, f.created_at,
             u.username as created_by_username,
             COUNT(wt.id) as task_count
      FROM functions f
      LEFT JOIN users u ON f.created_by = u.id
      LEFT JOIN wiki_tasks wt ON f.id = wt.function_id
      WHERE f.category_id = $1
      GROUP BY f.id, f.name, f.description, f.created_at, u.username
      ORDER BY f.created_at DESC
    `, [id]);

    const childrenResult = await db.query(`
      SELECT id, name, description, path, created_at
      FROM categories
      WHERE parent_id = $1
      ORDER BY name
    `, [id]);

    res.json({
      category: categoryResult.rows[0],
      functions: functionsResult.rows,
      children: childrenResult.rows
    });
  } catch (error) {
    console.error('Error fetching category details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category (admin only)
router.put('/:id', [
  authenticateToken,
  requireRole(['admin']),
  body('name').optional().isLength({ min: 1 }).trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description } = req.body;

    // Check if category exists
    const existingResult = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const existing = existingResult.rows[0];
    const updatedName = name || existing.name;
    const updatedDescription = description !== undefined ? description : existing.description;

    // Update path if name changed
    let newPath = existing.path;
    if (name && name !== existing.name) {
      const pathParts = existing.path.split('/');
      pathParts[pathParts.length - 1] = updatedName;
      newPath = pathParts.join('/');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Update the category
      const result = await client.query(
        'UPDATE categories SET name = $1, description = $2, path = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [updatedName, updatedDescription, newPath, id]
      );

      // Update paths of all descendants if path changed
      if (newPath !== existing.path) {
        await client.query(
          'UPDATE categories SET path = REPLACE(path, $1, $2) WHERE path LIKE $3',
          [existing.path, newPath, `${existing.path}/%`]
        );
      }

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category (admin only)
router.delete('/:id', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category has children
    const childrenResult = await db.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = $1', [id]);
    if (parseInt(childrenResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category with children' });
    }

    // Check if category has functions
    const functionsResult = await db.query('SELECT COUNT(*) as count FROM functions WHERE category_id = $1', [id]);
    if (parseInt(functionsResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category with functions' });
    }

    const result = await db.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;