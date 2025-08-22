const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all users (authenticated users only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, username, email, role, created_at
      FROM users
      ORDER BY username
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;