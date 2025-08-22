const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/vote', [
  authenticateToken,
  requireRole(['team_member', 'admin', 'code_author', 'doc_author']),
  body('document_id').isUUID(),
  body('document_quality_score').isInt({ min: 1, max: 10 }),
  body('code_readability_score').isInt({ min: 1, max: 10 }),
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { document_id, document_quality_score, code_readability_score, comments } = req.body;

    const documentCheck = await db.query('SELECT id FROM documents WHERE id = $1', [document_id]);
    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const existingVote = await db.query(
      'SELECT id FROM votes WHERE document_id = $1 AND voter_id = $2',
      [document_id, req.user.id]
    );

    if (existingVote.rows.length > 0) {
      const result = await db.query(
        'UPDATE votes SET document_quality_score = $1, code_readability_score = $2, comments = $3, voted_at = CURRENT_TIMESTAMP WHERE document_id = $4 AND voter_id = $5 RETURNING *',
        [document_quality_score, code_readability_score, comments, document_id, req.user.id]
      );
      res.json(result.rows[0]);
    } else {
      const result = await db.query(
        'INSERT INTO votes (document_id, voter_id, document_quality_score, code_readability_score, comments) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [document_id, req.user.id, document_quality_score, code_readability_score, comments]
      );
      res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error submitting vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/results/:topic_id', authenticateToken, async (req, res) => {
  try {
    const { topic_id } = req.params;

    const assessmentResult = await db.query(`
      SELECT 
        t.id as topic_id,
        t.title as topic_title,
        t.description as topic_description,
        t.status,
        COUNT(DISTINCT d.id) as document_count,
        COUNT(v.id) as total_votes,
        ROUND(AVG(v.document_quality_score), 2) as avg_document_quality,
        ROUND(AVG(v.code_readability_score), 2) as avg_code_readability,
        ROUND(STDDEV(v.document_quality_score), 2) as doc_quality_stddev,
        ROUND(STDDEV(v.code_readability_score), 2) as code_readability_stddev
      FROM topics t
      LEFT JOIN document_assignments da ON t.id = da.topic_id
      LEFT JOIN documents d ON da.id = d.assignment_id
      LEFT JOIN votes v ON d.id = v.document_id
      WHERE t.id = $1
      GROUP BY t.id, t.title, t.description, t.status
    `, [topic_id]);

    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const documentsResult = await db.query(`
      SELECT 
        d.id,
        d.title,
        d.doc_type,
        d.submitted_at,
        u.username as author_username,
        COUNT(v.id) as vote_count,
        ROUND(AVG(v.document_quality_score), 2) as avg_doc_quality,
        ROUND(AVG(v.code_readability_score), 2) as avg_code_readability
      FROM documents d
      JOIN document_assignments da ON d.assignment_id = da.id
      JOIN users u ON d.author_id = u.id
      LEFT JOIN votes v ON d.id = v.document_id
      WHERE da.topic_id = $1
      GROUP BY d.id, d.title, d.doc_type, d.submitted_at, u.username
      ORDER BY d.submitted_at DESC
    `, [topic_id]);

    res.json({
      assessment: assessmentResult.rows[0],
      documents: documentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching assessment results:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const overviewResult = await db.query(`
      SELECT 
        COUNT(DISTINCT t.id) as total_topics,
        COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_topics,
        COUNT(DISTINCT CASE WHEN t.status = 'assessment_complete' THEN t.id END) as completed_assessments,
        COUNT(DISTINCT d.id) as total_documents,
        COUNT(DISTINCT v.id) as total_votes,
        ROUND(AVG(v.code_readability_score), 2) as avg_code_quality_score
      FROM topics t
      LEFT JOIN document_assignments da ON t.id = da.topic_id
      LEFT JOIN documents d ON da.id = d.assignment_id
      LEFT JOIN votes v ON d.id = v.document_id
    `);

    const recentActivityResult = await db.query(`
      SELECT 
        'document' as activity_type,
        d.title as activity_title,
        d.submitted_at as activity_date,
        u.username as user_name,
        t.title as topic_title
      FROM documents d
      JOIN document_assignments da ON d.assignment_id = da.id
      JOIN topics t ON da.topic_id = t.id
      JOIN users u ON d.author_id = u.id
      
      UNION ALL
      
      SELECT 
        'vote' as activity_type,
        CONCAT('Vote on: ', d.title) as activity_title,
        v.voted_at as activity_date,
        u.username as user_name,
        t.title as topic_title
      FROM votes v
      JOIN documents d ON v.document_id = d.id
      JOIN document_assignments da ON d.assignment_id = da.id
      JOIN topics t ON da.topic_id = t.id
      JOIN users u ON v.voter_id = u.id
      
      ORDER BY activity_date DESC
      LIMIT 20
    `);

    res.json({
      overview: overviewResult.rows[0],
      recentActivity: recentActivityResult.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;