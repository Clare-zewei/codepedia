const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get voting information for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    // Get task details
    const taskResult = await db.query(`
      SELECT wt.*, f.name as function_name, c.name as category_name
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      WHERE wt.id = $1
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Only allow viewing votes in pending_vote or completed status
    if (task.status !== 'pending_vote' && task.status !== 'completed') {
      return res.status(400).json({ error: 'Task is not in voting phase' });
    }

    // Get the two submitted contents for voting
    const contentsResult = await db.query(`
      SELECT wc.id, wc.feature_documentation, wc.api_testing, wc.use_case_scripts,
             wc.submitted_at, u.username as writer_username
      FROM wiki_contents wc
      JOIN users u ON wc.writer_id = u.id
      WHERE wc.task_id = $1 AND wc.status = 'submitted'
      ORDER BY wc.submitted_at
    `, [taskId]);

    // Get voting results
    const votesResult = await db.query(`
      SELECT vote_option, COUNT(*) as count
      FROM wiki_votes
      WHERE task_id = $1
      GROUP BY vote_option
    `, [taskId]);

    const votingResults = {
      version_a: 0,
      version_b: 0,
      neither_satisfactory: 0
    };

    votesResult.rows.forEach(row => {
      votingResults[row.vote_option] = parseInt(row.count);
    });

    // Check if current user has voted
    const userVoteResult = await db.query(
      'SELECT vote_option, comments FROM wiki_votes WHERE task_id = $1 AND voter_id = $2',
      [taskId, userId]
    );

    // Get all votes with usernames (for admin view)
    let allVotes = [];
    if (req.user.role === 'admin') {
      const allVotesResult = await db.query(`
        SELECT wv.vote_option, wv.comments, wv.voted_at, u.username as voter_username
        FROM wiki_votes wv
        JOIN users u ON wv.voter_id = u.id
        WHERE wv.task_id = $1
        ORDER BY wv.voted_at DESC
      `, [taskId]);
      allVotes = allVotesResult.rows;
    }

    res.json({
      task: task,
      contents: contentsResult.rows,
      votingResults: votingResults,
      userVote: userVoteResult.rows[0] || null,
      allVotes: allVotes,
      totalVotes: votingResults.version_a + votingResults.version_b + votingResults.neither_satisfactory
    });
  } catch (error) {
    console.error('Error fetching voting info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit a vote
router.post('/task/:taskId/vote', [
  authenticateToken,
  body('vote_option').isIn(['version_a', 'version_b', 'neither_satisfactory']),
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { taskId } = req.params;
    const { vote_option, comments } = req.body;
    const userId = req.user.id;

    // Verify task is in voting phase
    const taskResult = await db.query(
      'SELECT status FROM wiki_tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (taskResult.rows[0].status !== 'pending_vote') {
      return res.status(400).json({ error: 'Task is not in voting phase' });
    }

    // Check if user has already voted
    const existingVote = await db.query(
      'SELECT id FROM wiki_votes WHERE task_id = $1 AND voter_id = $2',
      [taskId, userId]
    );

    if (existingVote.rows.length > 0) {
      return res.status(400).json({ error: 'You have already voted on this task' });
    }

    // Submit the vote
    const result = await db.query(
      'INSERT INTO wiki_votes (task_id, voter_id, vote_option, comments) VALUES ($1, $2, $3, $4) RETURNING *',
      [taskId, userId, vote_option, comments]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start voting for a task (admin only)
router.post('/task/:taskId/start-voting', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { taskId } = req.params;

    // Verify task is ready for voting
    const taskResult = await db.query(
      'SELECT status FROM wiki_tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (taskResult.rows[0].status !== 'pending_vote') {
      return res.status(400).json({ error: 'Task is not ready for voting' });
    }

    // Verify there are submitted contents
    const contentsCount = await db.query(
      'SELECT COUNT(*) as count FROM wiki_contents WHERE task_id = $1 AND status = $2',
      [taskId, 'submitted']
    );

    if (parseInt(contentsCount.rows[0].count) === 0) {
      return res.status(400).json({ error: 'No submitted contents found for voting' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Notify all team members about voting
      const teamMembers = await client.query(
        'SELECT id FROM users WHERE role IN ($1, $2, $3, $4)',
        ['admin', 'code_author', 'doc_author', 'team_member']
      );

      for (const member of teamMembers.rows) {
        await client.query(
          'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5)',
          [taskId, member.id, 'voting_started', 'Voting Started', 'Please vote on the submitted wiki contents']
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Voting started successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error starting voting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete voting and determine winner (admin only)
router.post('/task/:taskId/complete-voting', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get voting results
    const votesResult = await db.query(`
      SELECT vote_option, COUNT(*) as count
      FROM wiki_votes
      WHERE task_id = $1
      GROUP BY vote_option
    `, [taskId]);

    const votingResults = {
      version_a: 0,
      version_b: 0,
      neither_satisfactory: 0
    };

    votesResult.rows.forEach(row => {
      votingResults[row.vote_option] = parseInt(row.count);
    });

    // Determine winner
    let winner = null;
    const maxVotes = Math.max(votingResults.version_a, votingResults.version_b, votingResults.neither_satisfactory);
    
    if (votingResults.version_a === maxVotes && votingResults.version_a > votingResults.version_b && votingResults.version_a > votingResults.neither_satisfactory) {
      winner = 'version_a';
    } else if (votingResults.version_b === maxVotes && votingResults.version_b > votingResults.version_a && votingResults.version_b > votingResults.neither_satisfactory) {
      winner = 'version_b';
    } else if (votingResults.neither_satisfactory === maxVotes) {
      winner = 'neither_satisfactory';
    } else {
      // Handle tie case - could be admin decision or other logic
      return res.status(400).json({ error: 'Voting resulted in a tie. Manual intervention required.' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      if (winner === 'neither_satisfactory') {
        // Mark task as needing reassignment
        await client.query(
          'UPDATE wiki_tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['not_started', taskId]
        );

        // Delete existing contents for reassignment
        await client.query(
          'UPDATE wiki_contents SET status = $1 WHERE task_id = $2',
          ['rejected', taskId]
        );
      } else {
        // Mark winning content as selected
        const contents = await client.query(
          'SELECT id, writer_id FROM wiki_contents WHERE task_id = $1 AND status = $2 ORDER BY submitted_at',
          [taskId, 'submitted']
        );

        if (contents.rows.length >= 2) {
          const winningIndex = winner === 'version_a' ? 0 : 1;
          const winningContentId = contents.rows[winningIndex].id;
          const losingContentId = contents.rows[1 - winningIndex].id;

          // Mark winner as selected
          await client.query(
            'UPDATE wiki_contents SET status = $1 WHERE id = $2',
            ['selected', winningContentId]
          );

          // Mark loser as rejected
          await client.query(
            'UPDATE wiki_contents SET status = $1 WHERE id = $2',
            ['rejected', losingContentId]
          );
        }

        // Mark task as completed
        await client.query(
          'UPDATE wiki_tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', taskId]
        );
      }

      // Notify relevant users
      const taskInfo = await client.query(`
        SELECT wt.*, f.name as function_name
        FROM wiki_tasks wt
        JOIN functions f ON wt.function_id = f.id
        WHERE wt.id = $1
      `, [taskId]);

      const task = taskInfo.rows[0];
      const notificationMessage = winner === 'neither_satisfactory' 
        ? 'Voting completed. Neither version was satisfactory. Task will be reassigned.'
        : `Voting completed. ${winner === 'version_a' ? 'First' : 'Second'} submission was selected.`;

      const usersToNotify = [task.writer1_id, task.writer2_id, task.code_annotator_id].filter(Boolean);
      for (const userId of usersToNotify) {
        await client.query(
          'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5)',
          [taskId, userId, 'task_completed', 'Voting Completed', notificationMessage]
        );
      }

      await client.query('COMMIT');
      res.json({ 
        message: 'Voting completed successfully',
        winner: winner,
        results: votingResults
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error completing voting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tasks ready for voting (admin view)
router.get('/pending-votes', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const result = await db.query(`
      SELECT wt.id, wt.title, wt.created_at, wt.deadline,
             f.name as function_name, c.name as category_name,
             COUNT(wc.id) as submission_count,
             COUNT(wv.id) as vote_count
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      LEFT JOIN wiki_contents wc ON wt.id = wc.task_id AND wc.status = 'submitted'
      LEFT JOIN wiki_votes wv ON wt.id = wv.task_id
      WHERE wt.status = 'pending_vote'
      GROUP BY wt.id, wt.title, wt.created_at, wt.deadline, f.name, c.name
      ORDER BY wt.created_at
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;