const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get document by task and writer
router.get('/task/:taskId/writer/:writerId', authenticateToken, async (req, res) => {
  try {
    const { taskId, writerId } = req.params;
    
    // Check if user can access this document (writer or admin)
    if (req.user.id !== writerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT ed.*, u.username as writer_username
      FROM entry_documents ed
      LEFT JOIN users u ON ed.writer_id = u.id
      WHERE ed.task_id = $1 AND ed.writer_id = $2
    `, [taskId, writerId]);

    if (result.rows.length === 0) {
      // Create empty document if it doesn't exist
      const createResult = await db.query(`
        INSERT INTO entry_documents (task_id, writer_id, title, content)
        VALUES ($1, $2, 'Untitled Document', '')
        RETURNING *
      `, [taskId, writerId]);
      
      return res.json(createResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save draft
router.put('/:documentId/draft', [
  authenticateToken,
  body('title').optional().trim(),
  body('content').optional(),
  body('saveNote').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { documentId } = req.params;
    const { title, content, saveNote } = req.body;

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

      // Update document
      const updateResult = await client.query(`
        UPDATE entry_documents 
        SET title = COALESCE($1, title), 
            content = COALESCE($2, content),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [title, content, documentId]);

      // Get next version number
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM document_versions WHERE document_id = $1',
        [documentId]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Save version history
      await client.query(`
        INSERT INTO document_versions (document_id, version_number, title, content, save_note)
        VALUES ($1, $2, $3, $4, $5)
      `, [documentId, nextVersion, title || updateResult.rows[0].title, content || updateResult.rows[0].content, saveNote]);

      // Save draft snapshot
      await client.query(`
        INSERT INTO draft_saves (document_id, content_snapshot, save_type)
        VALUES ($1, $2, $3)
      `, [documentId, JSON.stringify({
        title: title || updateResult.rows[0].title,
        content: content || updateResult.rows[0].content,
        timestamp: new Date().toISOString()
      }), saveNote ? 'manual' : 'auto']);

      await client.query('COMMIT');
      res.json(updateResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get document versions
router.get('/:documentId/versions', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Check document ownership
    const docCheck = await db.query('SELECT writer_id FROM entry_documents WHERE id = $1', [documentId]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (docCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT id, version_number, title, LEFT(content, 200) as content_preview, 
             saved_at, save_note
      FROM document_versions 
      WHERE document_id = $1 
      ORDER BY version_number DESC
    `, [documentId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Restore version
router.post('/:documentId/versions/:versionNumber/restore', authenticateToken, async (req, res) => {
  try {
    const { documentId, versionNumber } = req.params;

    // Check document ownership
    const docCheck = await db.query('SELECT writer_id FROM entry_documents WHERE id = $1', [documentId]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (docCheck.rows[0].writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get version content
    const versionResult = await db.query(`
      SELECT title, content FROM document_versions 
      WHERE document_id = $1 AND version_number = $2
    `, [documentId, versionNumber]);

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const { title, content } = versionResult.rows[0];

    // Update document with version content
    const updateResult = await db.query(`
      UPDATE entry_documents 
      SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [title, content, documentId]);

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit document
router.post('/:documentId/submit', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Check document ownership
    const docResult = await db.query('SELECT * FROM entry_documents WHERE id = $1', [documentId]);
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    if (document.writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (document.is_submitted) {
      return res.status(400).json({ error: 'Document already submitted' });
    }

    // Get related API configs and notebooks
    const [apiResult, notebookResult] = await Promise.all([
      db.query('SELECT * FROM entry_api_configs WHERE document_id = $1 ORDER BY order_index', [documentId]),
      db.query('SELECT * FROM entry_notebooks WHERE document_id = $1 ORDER BY order_index', [documentId])
    ]);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Update document as submitted
      await client.query(`
        UPDATE entry_documents 
        SET is_submitted = true, 
            submitted_at = CURRENT_TIMESTAMP,
            stage = 'submitted'
        WHERE id = $1
      `, [documentId]);

      // Create submission record
      const submissionContent = {
        document: document,
        api_configs: apiResult.rows,
        notebooks: notebookResult.rows,
        submitted_at: new Date().toISOString()
      };

      await client.query(`
        INSERT INTO entry_submissions (document_id, submitted_by, submission_content)
        VALUES ($1, $2, $3)
      `, [documentId, req.user.id, JSON.stringify(submissionContent)]);

      // Update wiki_tasks status based on submission progress
      await updateTaskStatus(client, document.task_id);

      await client.query('COMMIT');
      res.json({ message: 'Document submitted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all documents for a task (admin view)
router.get('/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Only admin or assigned writers can view
    const taskCheck = await db.query(`
      SELECT writer1_id, writer2_id, code_annotator_id 
      FROM wiki_tasks WHERE id = $1
    `, [taskId]);
    
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskCheck.rows[0];
    const canView = req.user.role === 'admin' || 
                   req.user.id === task.writer1_id || 
                   req.user.id === task.writer2_id || 
                   req.user.id === task.code_annotator_id;

    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT ed.*, u.username as writer_username
      FROM entry_documents ed
      LEFT JOIN users u ON ed.writer_id = u.id
      WHERE ed.task_id = $1
      ORDER BY ed.created_at DESC
    `, [taskId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching task documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to update wiki_tasks status based on submission progress
async function updateTaskStatus(client, taskId) {
  try {
    // Get task info and submission counts
    const taskResult = await client.query(`
      SELECT wt.*, 
             COUNT(ed.id) as total_docs,
             COUNT(CASE WHEN ed.is_submitted = true THEN 1 END) as submitted_docs
      FROM wiki_tasks wt
      LEFT JOIN entry_documents ed ON wt.id = ed.task_id
      WHERE wt.id = $1
      GROUP BY wt.id
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return;
    }

    const task = taskResult.rows[0];
    const submittedCount = parseInt(task.submitted_docs);
    const totalDocs = parseInt(task.total_docs);
    
    let newStatus = task.status;

    // Determine new status based on submission progress
    if (submittedCount === 0) {
      newStatus = 'not_started';
    } else if (submittedCount < 2) {
      // At least one document submitted, but not both writers
      newStatus = 'in_progress';
    } else if (submittedCount >= 2) {
      // Both writers have submitted documents
      newStatus = 'pending_vote';
    }

    // Only update if status has changed
    if (newStatus !== task.status) {
      await client.query(`
        UPDATE wiki_tasks 
        SET status = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `, [newStatus, taskId]);
      
      console.log(`Updated task ${taskId} status from ${task.status} to ${newStatus} (${submittedCount}/${totalDocs} docs submitted)`);
    }
  } catch (error) {
    console.error('Error updating task status:', error);
    // Don't throw error to avoid breaking the main transaction
  }
}

module.exports = router;