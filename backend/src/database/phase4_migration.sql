-- Phase 4: Voting System Database Migration
-- 投票表决系统数据库表结构

-- 1. 投票会话表
CREATE TABLE IF NOT EXISTS voting_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_by UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. 投票候选项表
CREATE TABLE IF NOT EXISTS voting_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voting_session_id UUID NOT NULL,
    submission_id UUID NOT NULL,
    author_id UUID NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    vote_count INTEGER DEFAULT 0,
    is_winner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES entry_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 文档版本投票记录表 (重命名以避免与现有votes表冲突)
CREATE TABLE IF NOT EXISTS document_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voting_session_id UUID NOT NULL,
    voter_id UUID NOT NULL,
    candidate_id UUID NULL, -- NULL表示投"都不满意"
    choice_type VARCHAR(20) NOT NULL CHECK (choice_type IN ('candidate', 'none_satisfied')),
    voter_name VARCHAR(255) NOT NULL,
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_document_vote_per_session UNIQUE (voting_session_id, voter_id),
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES voting_candidates(id) ON DELETE CASCADE
);

-- 4. 任务重新分配历史表
CREATE TABLE IF NOT EXISTS task_reassignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    round_number INTEGER NOT NULL DEFAULT 1,
    reason VARCHAR(255),
    old_assignees JSONB,
    new_assignees JSONB,
    old_deadline DATE,
    new_deadline DATE,
    reassigned_by UUID NOT NULL,
    reassigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (reassigned_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. 投票通知表
CREATE TABLE IF NOT EXISTS voting_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voting_session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('voting_started', 'voting_ended', 'result_announced')),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_voting_sessions_task_id ON voting_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON voting_sessions(status);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_created_by ON voting_sessions(created_by);

CREATE INDEX IF NOT EXISTS idx_voting_candidates_session_id ON voting_candidates(voting_session_id);
CREATE INDEX IF NOT EXISTS idx_voting_candidates_submission_id ON voting_candidates(submission_id);
CREATE INDEX IF NOT EXISTS idx_voting_candidates_author_id ON voting_candidates(author_id);

CREATE INDEX IF NOT EXISTS idx_document_votes_session_id ON document_votes(voting_session_id);
CREATE INDEX IF NOT EXISTS idx_document_votes_voter_id ON document_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_document_votes_candidate_id ON document_votes(candidate_id);

CREATE INDEX IF NOT EXISTS idx_task_reassignments_task_id ON task_reassignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reassignments_reassigned_by ON task_reassignments(reassigned_by);

CREATE INDEX IF NOT EXISTS idx_voting_notifications_user_id ON voting_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_voting_notifications_session_id ON voting_notifications(voting_session_id);
CREATE INDEX IF NOT EXISTS idx_voting_notifications_is_read ON voting_notifications(is_read);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要 updated_at 的表添加触发器
DROP TRIGGER IF EXISTS update_voting_sessions_updated_at ON voting_sessions;
CREATE TRIGGER update_voting_sessions_updated_at 
    BEFORE UPDATE ON voting_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_voting_candidates_updated_at ON voting_candidates;
CREATE TRIGGER update_voting_candidates_updated_at 
    BEFORE UPDATE ON voting_candidates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 添加约束以确保数据一致性
ALTER TABLE wiki_tasks ADD COLUMN IF NOT EXISTS voting_session_id UUID;
ALTER TABLE wiki_tasks ADD CONSTRAINT fk_wiki_tasks_voting_session 
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE SET NULL;

-- 添加新的任务状态支持投票阶段
ALTER TABLE wiki_tasks DROP CONSTRAINT IF EXISTS wiki_tasks_status_check;
ALTER TABLE wiki_tasks ADD CONSTRAINT wiki_tasks_status_check 
    CHECK (status IN ('not_started', 'in_progress', 'pending_submission', 'pending_vote', 'voting', 'completed', 'reassigned'));

-- 为投票结果创建视图，便于查询
CREATE OR REPLACE VIEW voting_results AS
SELECT 
    vs.id as voting_session_id,
    vs.task_id,
    vs.title as voting_title,
    vs.status as voting_status,
    vs.started_at,
    vs.ended_at,
    COUNT(dv.id) as total_votes,
    COUNT(CASE WHEN dv.choice_type = 'candidate' THEN 1 END) as candidate_votes,
    COUNT(CASE WHEN dv.choice_type = 'none_satisfied' THEN 1 END) as none_satisfied_votes,
    vc_winner.id as winner_candidate_id,
    vc_winner.author_name as winner_author_name,
    vc_winner.vote_count as winner_vote_count
FROM voting_sessions vs
LEFT JOIN document_votes dv ON vs.id = dv.voting_session_id
LEFT JOIN voting_candidates vc_winner ON vs.id = vc_winner.voting_session_id AND vc_winner.is_winner = TRUE
GROUP BY vs.id, vs.task_id, vs.title, vs.status, vs.started_at, vs.ended_at, 
         vc_winner.id, vc_winner.author_name, vc_winner.vote_count;

-- 插入示例数据（可选，用于测试）
-- 这部分在实际部署时可以移除
/*
-- 示例投票会话
INSERT INTO voting_sessions (id, task_id, title, description, status, created_by) 
VALUES (
    gen_random_uuid(), 
    (SELECT id FROM wiki_tasks LIMIT 1),
    '用户注册邮箱验证功能文档投票',
    '选择最佳的用户注册邮箱验证功能文档版本',
    'active',
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
);
*/