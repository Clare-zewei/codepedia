const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get notifications for current user
router.get('/my-notifications', authenticateToken, async (req, res) => {
  try {
    const { unread_only, limit = 50 } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT tn.*, wt.title as task_title, f.name as function_name, c.name as category_name
      FROM task_notifications tn
      LEFT JOIN wiki_tasks wt ON tn.task_id = wt.id
      LEFT JOIN functions f ON wt.function_id = f.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE tn.recipient_id = $1
    `;
    const params = [userId];

    if (unread_only === 'true') {
      query += ' AND tn.is_read = false';
    }

    query += ' ORDER BY tn.created_at DESC LIMIT $2';
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    // Get unread count
    const unreadCountResult = await db.query(
      'SELECT COUNT(*) as count FROM task_notifications WHERE recipient_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      notifications: result.rows,
      unreadCount: parseInt(unreadCountResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      'UPDATE task_notifications SET is_read = true WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      'UPDATE task_notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false RETURNING COUNT(*)',
      [userId]
    );

    res.json({ message: `${result.rowCount} notifications marked as read` });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      'DELETE FROM task_notifications WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send custom notification (admin only)
router.post('/send', [
  authenticateToken,
  requireRole(['admin']),
  body('recipient_ids').isArray().custom((value) => {
    if (!value.every(id => typeof id === 'string')) {
      throw new Error('All recipient IDs must be valid UUIDs');
    }
    return true;
  }),
  body('title').isLength({ min: 1 }).trim(),
  body('message').isLength({ min: 1 }).trim(),
  body('notification_type').isIn([
    'task_assigned', 'task_accepted', 'content_submitted', 'voting_started', 
    'task_completed', 'deadline_reminder', 'task_overtime', 'custom'
  ]),
  body('task_id').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recipient_ids, title, message, notification_type, task_id } = req.body;

    // Verify all recipients exist
    const recipientsCheck = await db.query(
      'SELECT id FROM users WHERE id = ANY($1)',
      [recipient_ids]
    );

    if (recipientsCheck.rows.length !== recipient_ids.length) {
      return res.status(400).json({ error: 'One or more recipient IDs are invalid' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const notifications = [];
      for (const recipientId of recipient_ids) {
        const result = await client.query(
          'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [task_id, recipientId, notification_type, title, message]
        );
        notifications.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({
        message: `${notifications.length} notifications sent successfully`,
        notifications: notifications
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get notification statistics (admin only)
router.get('/stats', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    // Overall stats
    const overallStats = await db.query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications,
        COUNT(DISTINCT recipient_id) as unique_recipients,
        notification_type,
        COUNT(*) as type_count
      FROM task_notifications
      GROUP BY notification_type
      ORDER BY type_count DESC
    `);

    // Recent activity
    const recentActivity = await db.query(`
      SELECT tn.title, tn.message, tn.created_at, tn.notification_type,
             u.username as recipient_username,
             wt.title as task_title
      FROM task_notifications tn
      JOIN users u ON tn.recipient_id = u.id
      LEFT JOIN wiki_tasks wt ON tn.task_id = wt.id
      ORDER BY tn.created_at DESC
      LIMIT 20
    `);

    // User notification summary
    const userSummary = await db.query(`
      SELECT u.username, 
             COUNT(tn.id) as total_notifications,
             COUNT(CASE WHEN tn.is_read = false THEN 1 END) as unread_notifications
      FROM users u
      LEFT JOIN task_notifications tn ON u.id = tn.recipient_id
      GROUP BY u.id, u.username
      ORDER BY total_notifications DESC
      LIMIT 10
    `);

    res.json({
      overallStats: overallStats.rows,
      recentActivity: recentActivity.rows,
      userSummary: userSummary.rows
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule deadline reminders (admin only - could be called by cron job)
router.post('/schedule-deadline-reminders', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { days_before = 1 } = req.body;

    // Find tasks approaching deadline
    const approachingTasks = await db.query(`
      SELECT wt.*, f.name as function_name
      FROM wiki_tasks wt
      JOIN functions f ON wt.function_id = f.id
      WHERE wt.deadline IS NOT NULL 
        AND wt.status IN ('not_started', 'in_progress')
        AND wt.deadline <= NOW() + INTERVAL '${days_before} days'
        AND wt.deadline > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM task_notifications tn 
          WHERE tn.task_id = wt.id 
            AND tn.notification_type = 'deadline_reminder'
            AND tn.created_at > NOW() - INTERVAL '24 hours'
        )
    `);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      let reminderCount = 0;
      for (const task of approachingTasks.rows) {
        const deadline = new Date(task.deadline);
        const usersToNotify = [task.writer1_id, task.writer2_id, task.code_annotator_id].filter(Boolean);

        for (const userId of usersToNotify) {
          await client.query(
            'INSERT INTO task_notifications (task_id, recipient_id, notification_type, title, message) VALUES ($1, $2, $3, $4, $5)',
            [
              task.id, 
              userId, 
              'deadline_reminder',
              'Task Deadline Reminder',
              `The task "${task.title}" is due on ${deadline.toLocaleDateString()}. Please complete your work soon.`
            ]
          );
          reminderCount++;
        }
      }

      await client.query('COMMIT');
      res.json({
        message: `${reminderCount} deadline reminders sent for ${approachingTasks.rows.length} tasks`
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error scheduling deadline reminders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;