const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取所有投票会话（管理员专用）
router.get('/', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        vs.*,
        wt.title as task_title,
        f.name as function_name,
        c.name as category_name,
        u.username as created_by_name,
        COUNT(dv.id) as vote_count,
        COUNT(CASE WHEN dv.choice_type = 'none_satisfied' THEN 1 END) as none_satisfied_count
      FROM voting_sessions vs
      JOIN wiki_tasks wt ON vs.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      JOIN users u ON vs.created_by = u.id
      LEFT JOIN votes dv ON vs.id = dv.voting_session_id
      GROUP BY vs.id, wt.title, f.name, c.name, u.username
      ORDER BY vs.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching voting sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取待投票的任务（管理员专用）
router.get('/pending-tasks', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        wt.*,
        array_agg(
          json_build_object(
            'id', es.id,
            'writer_id', ed.writer_id,
            'writer_name', u.username,
            'submitted_at', es.submitted_at,
            'document_id', es.document_id
          ) ORDER BY es.submitted_at
        ) as submissions
      FROM wiki_tasks wt
      JOIN entry_documents ed ON wt.id = ed.task_id
      JOIN entry_submissions es ON ed.id = es.document_id
      JOIN users u ON ed.writer_id = u.id
      WHERE wt.status = 'pending_vote'
      AND wt.voting_session_id IS NULL
      AND ed.is_submitted = true
      GROUP BY wt.id
      HAVING COUNT(es.id) >= 2
      ORDER BY wt.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 创建投票会话（管理员专用）
router.post('/', [
  authenticateToken,
  requireRole('admin'),
  body('task_id').isUUID(),
  body('title').isLength({ min: 1 }).trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { task_id, title, description } = req.body;

    // 检查任务是否存在且状态为pending_vote
    const taskCheck = await db.query(`
      SELECT id, status FROM wiki_tasks 
      WHERE id = $1 AND status = 'pending_vote' AND voting_session_id IS NULL
    `, [task_id]);

    if (taskCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Task not found or not ready for voting' });
    }

    // 获取该任务的提交记录
    const submissions = await db.query(`
      SELECT es.*, ed.writer_id, u.username as writer_name 
      FROM entry_submissions es
      JOIN entry_documents ed ON es.document_id = ed.id 
      JOIN users u ON ed.writer_id = u.id 
      WHERE ed.task_id = $1 AND ed.is_submitted = true
      ORDER BY es.submitted_at
    `, [task_id]);

    if (submissions.rows.length < 2) {
      return res.status(400).json({ error: 'Task needs at least 2 submissions for voting' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 创建投票会话
      const sessionResult = await client.query(`
        INSERT INTO voting_sessions (task_id, title, description, created_by, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING *
      `, [task_id, title, description, req.user.id]);

      const votingSession = sessionResult.rows[0];

      // 创建投票候选项
      for (const submission of submissions.rows) {
        await client.query(`
          INSERT INTO voting_candidates (voting_session_id, submission_id, author_id, author_name)
          VALUES ($1, $2, $3, $4)
        `, [votingSession.id, submission.id, submission.writer_id, submission.writer_name]);
      }

      // 更新任务状态
      await client.query(`
        UPDATE wiki_tasks 
        SET status = 'voting', voting_session_id = $1 
        WHERE id = $2
      `, [votingSession.id, task_id]);

      // 创建通知（通知所有用户）
      const users = await client.query('SELECT id FROM users');
      for (const user of users.rows) {
        await client.query(`
          INSERT INTO voting_notifications (voting_session_id, user_id, notification_type, message)
          VALUES ($1, $2, 'voting_started', $3)
        `, [
          votingSession.id, 
          user.id, 
          `"${title}"文档投票已开始，请前往投票页面参与投票`
        ]);
      }

      await client.query('COMMIT');

      // 返回完整的投票会话信息
      const fullSession = await db.query(`
        SELECT 
          vs.*,
          json_agg(
            json_build_object(
              'id', vc.id,
              'submission_id', vc.submission_id,
              'author_id', vc.author_id,
              'author_name', vc.author_name,
              'vote_count', vc.vote_count
            ) ORDER BY vc.created_at
          ) as candidates
        FROM voting_sessions vs
        LEFT JOIN voting_candidates vc ON vs.id = vc.voting_session_id
        WHERE vs.id = $1
        GROUP BY vs.id
      `, [votingSession.id]);

      res.status(201).json(fullSession.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating voting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取单个投票会话详情
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT 
        vs.*,
        wt.title as task_title,
        f.name as function_name,
        c.name as category_name,
        wt.description as task_description,
        u.username as created_by_name,
        json_agg(
          json_build_object(
            'id', vc.id,
            'submission_id', vc.submission_id,
            'author_id', vc.author_id,
            'author_name', vc.author_name,
            'vote_count', vc.vote_count,
            'is_winner', vc.is_winner
          ) ORDER BY vc.created_at
        ) as candidates
      FROM voting_sessions vs
      JOIN wiki_tasks wt ON vs.task_id = wt.id
      JOIN functions f ON wt.function_id = f.id
      JOIN categories c ON f.category_id = c.id
      JOIN users u ON vs.created_by = u.id
      LEFT JOIN voting_candidates vc ON vs.id = vc.voting_session_id
      WHERE vs.id = $1
      GROUP BY vs.id, wt.title, f.name, c.name, wt.description, u.username
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    // 获取当前用户的投票状态
    const userVote = await db.query(`
      SELECT choice_type, candidate_id, voted_at 
      FROM votes 
      WHERE voting_session_id = $1 AND voter_id = $2
    `, [sessionId, req.user.id]);

    const sessionData = result.rows[0];
    sessionData.user_vote = userVote.rows[0] || null;

    // 如果投票已结束，获取投票统计
    if (sessionData.status === 'completed') {
      const stats = await db.query(`
        SELECT 
          choice_type,
          candidate_id,
          COUNT(*) as vote_count
        FROM votes 
        WHERE voting_session_id = $1
        GROUP BY choice_type, candidate_id
      `, [sessionId]);

      sessionData.vote_statistics = stats.rows;
    }

    res.json(sessionData);
  } catch (error) {
    console.error('Error fetching voting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 结束投票会话（管理员专用）
router.post('/:sessionId/end', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 检查投票会话是否存在且为活跃状态
    const sessionCheck = await db.query(`
      SELECT * FROM voting_sessions 
      WHERE id = $1 AND status = 'active'
    `, [sessionId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Active voting session not found' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 统计投票结果
      const voteStats = await client.query(`
        SELECT 
          choice_type,
          candidate_id,
          COUNT(*) as vote_count
        FROM votes 
        WHERE voting_session_id = $1
        GROUP BY choice_type, candidate_id
        ORDER BY vote_count DESC
      `, [sessionId]);

      // 分析结果
      let winnerCandidateId = null;
      let isNoneSatisfiedWinner = false;
      
      const candidateVotes = voteStats.rows.filter(stat => stat.choice_type === 'candidate');
      const noneSatisfiedVotes = voteStats.rows.find(stat => stat.choice_type === 'none_satisfied');
      
      const maxCandidateVotes = candidateVotes.length > 0 ? candidateVotes[0].vote_count : 0;
      const noneSatisfiedCount = noneSatisfiedVotes ? noneSatisfiedVotes.vote_count : 0;

      if (noneSatisfiedCount > maxCandidateVotes) {
        isNoneSatisfiedWinner = true;
      } else if (candidateVotes.length > 0) {
        winnerCandidateId = candidateVotes[0].candidate_id;
      }

      // 更新候选项投票数和获胜状态
      for (const candidate of candidateVotes) {
        const isWinner = candidate.candidate_id === winnerCandidateId;
        await client.query(`
          UPDATE voting_candidates 
          SET vote_count = $1, is_winner = $2
          WHERE id = $3
        `, [candidate.vote_count, isWinner, candidate.candidate_id]);
      }

      // 结束投票会话
      await client.query(`
        UPDATE voting_sessions 
        SET status = 'completed', ended_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [sessionId]);

      const session = sessionCheck.rows[0];

      // 更新任务状态
      if (isNoneSatisfiedWinner) {
        // "都不满意"获胜，任务状态改为待重新分配
        await client.query(`
          UPDATE wiki_tasks 
          SET status = 'pending_reassignment' 
          WHERE id = $1
        `, [session.task_id]);
      } else {
        // 某个版本获胜，任务完成
        await client.query(`
          UPDATE wiki_tasks 
          SET status = 'completed' 
          WHERE id = $1
        `, [session.task_id]);
      }

      // 通知所有用户投票结束
      const users = await client.query('SELECT id FROM users');
      const resultMessage = isNoneSatisfiedWinner 
        ? `"${session.title}"投票结束，结果为"都不满意"，任务将重新分配`
        : `"${session.title}"投票结束，已选出获胜版本`;

      for (const user of users.rows) {
        await client.query(`
          INSERT INTO voting_notifications (voting_session_id, user_id, notification_type, message)
          VALUES ($1, $2, 'voting_ended', $3)
        `, [sessionId, user.id, resultMessage]);
      }

      await client.query('COMMIT');

      res.json({
        message: 'Voting session ended successfully',
        result: {
          is_none_satisfied_winner: isNoneSatisfiedWinner,
          winner_candidate_id: winnerCandidateId,
          total_votes: voteStats.rows.reduce((sum, stat) => sum + stat.vote_count, 0)
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error ending voting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 取消投票会话（管理员专用）
router.post('/:sessionId/cancel', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const { sessionId } = req.params;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 获取投票会话信息
      const session = await client.query(`
        SELECT * FROM voting_sessions 
        WHERE id = $1 AND status = 'active'
      `, [sessionId]);

      if (session.rows.length === 0) {
        return res.status(404).json({ error: 'Active voting session not found' });
      }

      // 取消投票会话
      await client.query(`
        UPDATE voting_sessions 
        SET status = 'cancelled' 
        WHERE id = $1
      `, [sessionId]);

      // 恢复任务状态为待投票
      await client.query(`
        UPDATE wiki_tasks 
        SET status = 'pending_vote', voting_session_id = NULL 
        WHERE id = $1
      `, [session.rows[0].task_id]);

      await client.query('COMMIT');

      res.json({ message: 'Voting session cancelled successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error cancelling voting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取功能的最终文档内容（已完成投票）
router.get('/function/:functionId/final-document', authenticateToken, async (req, res) => {
  try {
    const { functionId } = req.params;

    // 获取该功能的已完成任务
    const taskResult = await db.query(`
      SELECT wt.*, vs.id as voting_session_id
      FROM wiki_tasks wt
      LEFT JOIN voting_sessions vs ON wt.voting_session_id = vs.id
      WHERE wt.function_id = $1 AND wt.status = 'completed'
      ORDER BY wt.created_at DESC
      LIMIT 1
    `, [functionId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'No completed task found for this function' });
    }

    const task = taskResult.rows[0];

    // 获取获胜的文档内容
    const winnerResult = await db.query(`
      SELECT 
        vc.author_name,
        vc.author_id,
        ed.title as document_title,
        ed.content as document_content,
        ed.updated_at as document_updated_at
      FROM voting_candidates vc
      JOIN entry_submissions es ON vc.submission_id = es.id
      JOIN entry_documents ed ON es.document_id = ed.id
      WHERE vc.voting_session_id = $1 AND vc.is_winner = true
      LIMIT 1
    `, [task.voting_session_id]);

    if (winnerResult.rows.length === 0) {
      return res.status(404).json({ error: 'No winning document found' });
    }

    const winner = winnerResult.rows[0];

    // 获取获胜文档的API配置
    const apiConfigsResult = await db.query(`
      SELECT eac.* 
      FROM entry_api_configs eac
      JOIN entry_submissions es ON eac.document_id = es.document_id
      JOIN voting_candidates vc ON es.id = vc.submission_id
      WHERE vc.voting_session_id = $1 AND vc.is_winner = true
      ORDER BY eac.order_index, eac.created_at
    `, [task.voting_session_id]);

    // 获取获胜文档的笔记本
    const notebooksResult = await db.query(`
      SELECT en.* 
      FROM entry_notebooks en
      JOIN entry_submissions es ON en.document_id = es.document_id
      JOIN voting_candidates vc ON es.id = vc.submission_id
      WHERE vc.voting_session_id = $1 AND vc.is_winner = true
      ORDER BY en.order_index, en.created_at
    `, [task.voting_session_id]);

    // 获取任务分配信息
    const taskInfoResult = await db.query(`
      SELECT 
        u1.username as writer1_name,
        u2.username as writer2_name,
        u3.username as code_annotator_name
      FROM wiki_tasks wt
      LEFT JOIN users u1 ON wt.writer1_id = u1.id
      LEFT JOIN users u2 ON wt.writer2_id = u2.id
      LEFT JOIN users u3 ON wt.code_annotator_id = u3.id
      WHERE wt.id = $1
    `, [task.id]);

    const taskInfo = taskInfoResult.rows[0];

    res.json({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completed_at: task.updated_at,
        ...taskInfo
      },
      final_document: {
        title: winner.document_title,
        content: winner.document_content,
        author_name: winner.author_name,
        author_id: winner.author_id,
        updated_at: winner.document_updated_at
      },
      api_configs: apiConfigsResult.rows,
      notebooks: notebooksResult.rows
    });

  } catch (error) {
    console.error('Error fetching final document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;