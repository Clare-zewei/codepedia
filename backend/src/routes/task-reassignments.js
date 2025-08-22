const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取需要重新分配的任务
router.get('/pending', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        wt.*,
        vs.title as voting_session_title,
        vs.ended_at as voting_ended_at,
        COUNT(tr.id) as reassignment_count
      FROM wiki_tasks wt
      LEFT JOIN voting_sessions vs ON wt.voting_session_id = vs.id
      LEFT JOIN task_reassignments tr ON wt.id = tr.task_id
      WHERE wt.status = 'pending_reassignment'
      GROUP BY wt.id, vs.title, vs.ended_at
      ORDER BY vs.ended_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending reassignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取任务的重新分配历史
router.get('/task/:taskId/history', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await db.query(`
      SELECT 
        tr.*,
        u.username as reassigned_by_name
      FROM task_reassignments tr
      JOIN users u ON tr.reassigned_by = u.id
      WHERE tr.task_id = $1
      ORDER BY tr.reassigned_at DESC
    `, [taskId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reassignment history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 重新分配任务
router.post('/', [
  authenticateToken,
  requireRole('admin'),
  body('task_id').isUUID(),
  body('writer1_id').isUUID(),
  body('writer2_id').isUUID(),
  body('new_deadline').isISO8601().toDate(),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { task_id, writer1_id, writer2_id, new_deadline, reason } = req.body;

    // 验证任务是否存在且状态为待重新分配
    const taskCheck = await db.query(`
      SELECT * FROM wiki_tasks 
      WHERE id = $1 AND status = 'pending_reassignment'
    `, [task_id]);

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not pending reassignment' });
    }

    const task = taskCheck.rows[0];

    // 验证新的分配用户存在且不是管理员
    const usersCheck = await db.query(`
      SELECT id, username, role FROM users 
      WHERE id IN ($1, $2) AND status = 'active'
    `, [writer1_id, writer2_id]);

    if (usersCheck.rows.length !== 2) {
      return res.status(400).json({ error: 'Invalid user assignments' });
    }

    // 检查是否有管理员被分配为撰写者
    const hasAdmin = usersCheck.rows.some(user => user.role === 'admin');
    if (hasAdmin) {
      return res.status(400).json({ error: 'Administrators cannot be assigned as writers' });
    }

    // 不能分配给同一个人
    if (writer1_id === writer2_id) {
      return res.status(400).json({ error: 'Cannot assign the same person as both writers' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 获取当前轮次
      const roundResult = await client.query(`
        SELECT COALESCE(MAX(round_number), 0) + 1 as next_round 
        FROM task_reassignments 
        WHERE task_id = $1
      `, [task_id]);
      const nextRound = roundResult.rows[0].next_round;

      // 记录重新分配历史
      await client.query(`
        INSERT INTO task_reassignments (
          task_id, round_number, reason, old_assignees, new_assignees, 
          old_deadline, new_deadline, reassigned_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        task_id,
        nextRound,
        reason || '投票结果为"都不满意"',
        JSON.stringify({
          writer1_id: task.writer1_id,
          writer2_id: task.writer2_id,
          code_annotator_id: task.code_annotator_id
        }),
        JSON.stringify({
          writer1_id: writer1_id,
          writer2_id: writer2_id,
          code_annotator_id: task.code_annotator_id // 保持代码标注者不变
        }),
        task.deadline,
        new_deadline,
        req.user.id
      ]);

      // 删除原有的文档提交记录和相关内容
      const submissions = await client.query(`
        SELECT id, document_id FROM entry_submissions 
        WHERE task_id = $1
      `, [task_id]);

      for (const submission of submissions.rows) {
        // 删除相关的API配置
        await client.query(`
          DELETE FROM entry_api_configs 
          WHERE document_id = $1
        `, [submission.document_id]);

        // 删除相关的笔记本
        await client.query(`
          DELETE FROM entry_notebooks 
          WHERE document_id = $1
        `, [submission.document_id]);

        // 删除文档版本
        await client.query(`
          DELETE FROM document_versions 
          WHERE document_id = $1
        `, [submission.document_id]);

        // 删除草稿保存记录
        await client.query(`
          DELETE FROM draft_saves 
          WHERE document_id = $1
        `, [submission.document_id]);

        // 删除质量检查记录
        await client.query(`
          DELETE FROM quality_checks 
          WHERE document_id = $1
        `, [submission.document_id]);

        // 删除文档
        await client.query(`
          DELETE FROM entry_documents 
          WHERE id = $1
        `, [submission.document_id]);
      }

      // 删除提交记录
      await client.query(`
        DELETE FROM entry_submissions 
        WHERE task_id = $1
      `, [task_id]);

      // 重置任务状态和分配
      await client.query(`
        UPDATE wiki_tasks 
        SET 
          status = 'not_started',
          writer1_id = $1,
          writer2_id = $2,
          deadline = $3,
          voting_session_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [writer1_id, writer2_id, new_deadline, task_id]);

      // 创建通知给新的撰写者
      const newWriters = usersCheck.rows;
      for (const writer of newWriters) {
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, is_read)
          VALUES ($1, $2, $3, $4, false)
        `, [
          writer.id,
          '任务重新分配通知',
          `您被分配了新的文档撰写任务："${task.title}"，截止时间：${new_deadline.toISOString().split('T')[0]}`,
          'task_assignment'
        ]);
      }

      await client.query('COMMIT');

      // 返回更新后的任务信息
      const updatedTask = await db.query(`
        SELECT 
          wt.*,
          u1.username as writer1_username,
          u2.username as writer2_username,
          u3.username as code_annotator_username
        FROM wiki_tasks wt
        LEFT JOIN users u1 ON wt.writer1_id = u1.id
        LEFT JOIN users u2 ON wt.writer2_id = u2.id
        LEFT JOIN users u3 ON wt.code_annotator_id = u3.id
        WHERE wt.id = $1
      `, [task_id]);

      res.json({
        message: 'Task reassigned successfully',
        task: updatedTask.rows[0],
        round_number: nextRound
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error reassigning task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取可分配的用户列表
router.get('/available-writers', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id, username, email, 
        COUNT(CASE WHEN wt.status IN ('not_started', 'in_progress') THEN 1 END) as active_task_count
      FROM users u
      LEFT JOIN (
        SELECT writer1_id as writer_id FROM wiki_tasks 
        UNION ALL 
        SELECT writer2_id as writer_id FROM wiki_tasks
      ) wt_writers ON u.id = wt_writers.writer_id
      LEFT JOIN wiki_tasks wt ON (wt.writer1_id = u.id OR wt.writer2_id = u.id)
      WHERE u.role != 'admin' AND u.status = 'active'
      GROUP BY u.id, u.username, u.email
      ORDER BY active_task_count ASC, u.username ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available writers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量重新分配任务
router.post('/batch-reassign', [
  authenticateToken,
  requireRole('admin'),
  body('reassignments').isArray(),
  body('reassignments.*.task_id').isUUID(),
  body('reassignments.*.writer1_id').isUUID(),
  body('reassignments.*.writer2_id').isUUID(),
  body('reassignments.*.new_deadline').isISO8601().toDate(),
  body('reassignments.*.reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reassignments } = req.body;
    const results = [];
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      for (const reassignment of reassignments) {
        const { task_id, writer1_id, writer2_id, new_deadline, reason } = reassignment;

        try {
          // 验证任务状态
          const taskCheck = await client.query(`
            SELECT * FROM wiki_tasks 
            WHERE id = $1 AND status = 'pending_reassignment'
          `, [task_id]);

          if (taskCheck.rows.length === 0) {
            results.push({
              task_id,
              success: false,
              error: 'Task not found or not pending reassignment'
            });
            continue;
          }

          const task = taskCheck.rows[0];

          // 验证用户
          const usersCheck = await client.query(`
            SELECT id, username FROM users 
            WHERE id IN ($1, $2) AND status = 'active' AND role != 'admin'
          `, [writer1_id, writer2_id]);

          if (usersCheck.rows.length !== 2 || writer1_id === writer2_id) {
            results.push({
              task_id,
              success: false,
              error: 'Invalid user assignments'
            });
            continue;
          }

          // 获取轮次
          const roundResult = await client.query(`
            SELECT COALESCE(MAX(round_number), 0) + 1 as next_round 
            FROM task_reassignments 
            WHERE task_id = $1
          `, [task_id]);
          const nextRound = roundResult.rows[0].next_round;

          // 记录历史
          await client.query(`
            INSERT INTO task_reassignments (
              task_id, round_number, reason, old_assignees, new_assignees, 
              old_deadline, new_deadline, reassigned_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            task_id,
            nextRound,
            reason || '批量重新分配',
            JSON.stringify({
              writer1_id: task.writer1_id,
              writer2_id: task.writer2_id,
              code_annotator_id: task.code_annotator_id
            }),
            JSON.stringify({
              writer1_id: writer1_id,
              writer2_id: writer2_id,
              code_annotator_id: task.code_annotator_id
            }),
            task.deadline,
            new_deadline,
            req.user.id
          ]);

          // 清理旧内容和更新任务（简化版，实际应用中需要更详细的清理）
          await client.query(`
            DELETE FROM entry_submissions WHERE task_id = $1
          `, [task_id]);

          await client.query(`
            UPDATE wiki_tasks 
            SET 
              status = 'not_started',
              writer1_id = $1,
              writer2_id = $2,
              deadline = $3,
              voting_session_id = NULL
            WHERE id = $4
          `, [writer1_id, writer2_id, new_deadline, task_id]);

          results.push({
            task_id,
            success: true,
            round_number: nextRound
          });
        } catch (taskError) {
          results.push({
            task_id,
            success: false,
            error: taskError.message
          });
        }
      }

      await client.query('COMMIT');
      
      const successCount = results.filter(r => r.success).length;
      res.json({
        message: `Batch reassignment completed: ${successCount}/${reassignments.length} successful`,
        results
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in batch reassignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;