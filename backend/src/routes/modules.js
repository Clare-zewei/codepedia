const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.id, m.name, m.description, m.parent_id, m.path, m.created_at,
             u.username as created_by_username
      FROM modules m
      LEFT JOIN users u ON m.created_by = u.id
      ORDER BY m.path, m.name
    `);

    const modules = result.rows.map(module => ({
      ...module,
      children: []
    }));

    const moduleMap = {};
    modules.forEach(module => {
      moduleMap[module.id] = module;
    });

    const rootModules = [];
    modules.forEach(module => {
      if (module.parent_id) {
        const parent = moduleMap[module.parent_id];
        if (parent) {
          parent.children.push(module);
        }
      } else {
        rootModules.push(module);
      }
    });

    res.json(rootModules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', [
  authenticateToken,
  requireRole(['admin', 'code_author']),
  body('name').isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('parent_id').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parent_id } = req.body;
    let path = '/';

    if (parent_id) {
      const parentResult = await db.query('SELECT path FROM modules WHERE id = $1', [parent_id]);
      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Parent module not found' });
      }
      const parentPath = parentResult.rows[0].path;
      path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    } else {
      path = `/${name}`;
    }

    const result = await db.query(
      'INSERT INTO modules (name, description, parent_id, path, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, parent_id, path, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const moduleResult = await db.query(`
      SELECT m.*, u.username as created_by_username
      FROM modules m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.id = $1
    `, [id]);

    if (moduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const topicsResult = await db.query(`
      SELECT t.id, t.title, t.description, t.status, t.created_at,
             u.username as code_author_username
      FROM topics t
      LEFT JOIN users u ON t.code_author_id = u.id
      WHERE t.module_id = $1
      ORDER BY t.created_at DESC
    `, [id]);

    const childrenResult = await db.query(`
      SELECT id, name, description, path, created_at
      FROM modules
      WHERE parent_id = $1
      ORDER BY name
    `, [id]);

    res.json({
      module: moduleResult.rows[0],
      topics: topicsResult.rows,
      children: childrenResult.rows
    });
  } catch (error) {
    console.error('Error fetching module details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;