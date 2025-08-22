const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 提交投票
router.post('/', [
  authenticateToken,
  body('voting_session_id').isUUID(),
  body('choice_type').isIn(['candidate', 'none_satisfied']),
  body('candidate_id').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { voting_session_id, choice_type, candidate_id } = req.body;

    // 验证投票会话是否存在且为活跃状态
    const sessionCheck = await db.query(`
      SELECT * FROM voting_sessions 
      WHERE id = $1 AND status = 'active'
    `, [voting_session_id]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Active voting session not found' });
    }

    // 检查用户是否已经投票
    const existingVote = await db.query(`
      SELECT id FROM votes 
      WHERE voting_session_id = $1 AND voter_id = $2
    `, [voting_session_id, req.user.id]);

    if (existingVote.rows.length > 0) {
      return res.status(400).json({ error: 'You have already voted in this session' });
    }

    // 如果选择了候选项，验证候选项是否存在
    if (choice_type === 'candidate' && candidate_id) {
      const candidateCheck = await db.query(`
        SELECT * FROM voting_candidates 
        WHERE id = $1 AND voting_session_id = $2
      `, [candidate_id, voting_session_id]);

      if (candidateCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid candidate' });
      }
    }

    // 如果选择"都不满意"，candidate_id应该为null
    const finalCandidateId = choice_type === 'none_satisfied' ? null : candidate_id;

    // 提交投票
    const voteResult = await db.query(`
      INSERT INTO votes (voting_session_id, voter_id, candidate_id, choice_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [voting_session_id, req.user.id, finalCandidateId, choice_type]);

    // 如果是选择候选项，更新候选项的投票计数
    if (choice_type === 'candidate' && candidate_id) {
      await db.query(`
        UPDATE voting_candidates 
        SET vote_count = vote_count + 1 
        WHERE id = $1
      `, [candidate_id]);
    }

    res.status(201).json({
      message: 'Vote submitted successfully',
      vote: voteResult.rows[0]
    });
  } catch (error) {
    console.error('Error submitting vote:', error);
    if (error.constraint === 'unique_document_vote_per_session') {
      res.status(400).json({ error: 'You have already voted in this session' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// 获取投票会话的投票统计
router.get('/session/:sessionId/statistics', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 验证投票会话是否存在
    const sessionCheck = await db.query(`
      SELECT vs.*, wt.title as task_title 
      FROM voting_sessions vs 
      JOIN wiki_tasks wt ON vs.task_id = wt.id 
      WHERE vs.id = $1
    `, [sessionId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    const session = sessionCheck.rows[0];

    // 获取候选项信息
    const candidates = await db.query(`
      SELECT * FROM voting_candidates 
      WHERE voting_session_id = $1 
      ORDER BY vote_count DESC, created_at
    `, [sessionId]);

    // 获取投票统计
    const voteStats = await db.query(`
      SELECT 
        choice_type,
        candidate_id,
        COUNT(*) as vote_count,
        array_agg(u.username ORDER BY v.voted_at) as voters
      FROM votes v
      JOIN users u ON v.voter_id = u.id
      WHERE v.voting_session_id = $1
      GROUP BY choice_type, candidate_id
    `, [sessionId]);

    // 获取总投票数
    const totalVotes = await db.query(`
      SELECT COUNT(*) as total_count 
      FROM votes 
      WHERE voting_session_id = $1
    `, [sessionId]);

    // 获取还未投票的用户（仅管理员可见）
    let pendingVoters = [];
    if (req.user.role === 'admin') {
      const pendingResult = await db.query(`
        SELECT u.username 
        FROM users u 
        WHERE u.id NOT IN (
          SELECT voter_id 
          FROM votes 
          WHERE voting_session_id = $1
        )
        ORDER BY u.username
      `, [sessionId]);
      pendingVoters = pendingResult.rows.map(row => row.username);
    }

    // 处理统计数据
    const candidateStats = {};
    let noneSatisfiedCount = 0;
    let noneSatisfiedVoters = [];

    voteStats.rows.forEach(stat => {
      if (stat.choice_type === 'candidate') {
        candidateStats[stat.candidate_id] = {
          vote_count: parseInt(stat.vote_count),
          voters: stat.voters
        };
      } else if (stat.choice_type === 'none_satisfied') {
        noneSatisfiedCount = parseInt(stat.vote_count);
        noneSatisfiedVoters = stat.voters;
      }
    });

    // 合并候选项信息和投票统计
    const candidatesWithStats = candidates.rows.map(candidate => ({
      ...candidate,
      vote_count: candidateStats[candidate.id]?.vote_count || 0,
      voters: candidateStats[candidate.id]?.voters || []
    }));

    res.json({
      session: {
        id: session.id,
        title: session.title,
        task_title: session.task_title,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at
      },
      statistics: {
        total_votes: parseInt(totalVotes.rows[0].total_count),
        candidates: candidatesWithStats,
        none_satisfied: {
          vote_count: noneSatisfiedCount,
          voters: noneSatisfiedVoters
        },
        pending_voters: pendingVoters
      }
    });
  } catch (error) {
    console.error('Error fetching voting statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取用户的投票历史
router.get('/my-votes', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        v.*,
        vs.title as session_title,
        vs.status as session_status,
        wt.title as task_title,
        wt.function_name,
        vc.author_name as candidate_author_name
      FROM votes v
      JOIN voting_sessions vs ON v.voting_session_id = vs.id
      JOIN wiki_tasks wt ON vs.task_id = wt.id
      LEFT JOIN voting_candidates vc ON v.candidate_id = vc.id
      WHERE v.voter_id = $1
      ORDER BY v.voted_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取活跃的投票会话（用户参与）
router.get('/active-sessions', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        vs.*,
        wt.title as task_title,
        wt.function_name,
        wt.category_name,
        CASE 
          WHEN dv.id IS NOT NULL THEN true 
          ELSE false 
        END as has_voted,
        dv.choice_type as my_choice,
        dv.voted_at as my_vote_time
      FROM voting_sessions vs
      JOIN wiki_tasks wt ON vs.task_id = wt.id
      LEFT JOIN votes dv ON vs.id = dv.voting_session_id AND dv.voter_id = $1
      WHERE vs.status = 'active'
      ORDER BY vs.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching active voting sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投票会话的详细内容用于比较
router.get('/session/:sessionId/candidates-content', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 验证投票会话是否存在
    const sessionCheck = await db.query(`
      SELECT * FROM voting_sessions WHERE id = $1
    `, [sessionId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    // 获取候选项及其关联的提交内容
    const candidates = await db.query(`
      SELECT 
        vc.*,
        es.document_id,
        ed.title as document_title,
        ed.content as document_content,
        ed.updated_at as document_updated_at
      FROM voting_candidates vc
      JOIN entry_submissions es ON vc.submission_id = es.id
      JOIN entry_documents ed ON es.document_id = ed.id
      WHERE vc.voting_session_id = $1
      ORDER BY vc.created_at
    `, [sessionId]);

    // 为每个候选项获取API配置和笔记本
    const candidatesWithContent = [];

    for (const candidate of candidates.rows) {
      // 获取API配置
      const apiConfigs = await db.query(`
        SELECT * FROM entry_api_configs 
        WHERE document_id = $1 
        ORDER BY order_index, created_at
      `, [candidate.document_id]);

      // 获取笔记本
      const notebooks = await db.query(`
        SELECT * FROM entry_notebooks 
        WHERE document_id = $1 
        ORDER BY order_index, created_at
      `, [candidate.document_id]);

      candidatesWithContent.push({
        id: candidate.id,
        author_id: candidate.author_id,
        author_name: candidate.author_name,
        vote_count: candidate.vote_count,
        document: {
          id: candidate.document_id,
          title: candidate.document_title,
          content: candidate.document_content,
          updated_at: candidate.document_updated_at
        },
        api_configs: apiConfigs.rows,
        notebooks: notebooks.rows
      });
    }

    res.json({
      session_id: sessionId,
      candidates: candidatesWithContent
    });
  } catch (error) {
    console.error('Error fetching candidates content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除投票（仅用于开发/测试，生产环境应禁用）
router.delete('/:voteId', authenticateToken, async (req, res) => {
  try {
    // 仅允许管理员或投票者本人删除（通常不建议在生产环境中使用）
    const { voteId } = req.params;

    const voteCheck = await db.query(`
      SELECT * FROM votes 
      WHERE id = $1 AND (voter_id = $2 OR $3 = 'admin')
    `, [voteId, req.user.id, req.user.role]);

    if (voteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Vote not found or access denied' });
    }

    const vote = voteCheck.rows[0];

    // 检查投票会话是否还在活跃状态
    const sessionCheck = await db.query(`
      SELECT status FROM voting_sessions WHERE id = $1
    `, [vote.voting_session_id]);

    if (sessionCheck.rows[0]?.status !== 'active') {
      return res.status(400).json({ error: 'Cannot delete vote from inactive session' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 删除投票
      await client.query('DELETE FROM votes WHERE id = $1', [voteId]);

      // 如果是候选项投票，减少候选项的投票计数
      if (vote.choice_type === 'candidate' && vote.candidate_id) {
        await client.query(`
          UPDATE voting_candidates 
          SET vote_count = GREATEST(0, vote_count - 1) 
          WHERE id = $1
        `, [vote.candidate_id]);
      }

      await client.query('COMMIT');
      res.json({ message: 'Vote deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;