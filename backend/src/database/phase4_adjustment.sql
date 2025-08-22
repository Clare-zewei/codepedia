-- Phase 4 Adjustments: Align with exact prompt requirements
-- This script renames tables and adjusts schema to match the prompt exactly

-- First, rename the existing votes table to avoid conflicts
ALTER TABLE votes RENAME TO legacy_votes;

-- Now create the new votes table as specified in the prompt
CREATE TABLE votes (
    id BIGINT PRIMARY KEY DEFAULT extract(epoch from now()) * 1000000 + extract(microseconds from now()),
    voting_session_id UUID NOT NULL,
    voter_id UUID NOT NULL,
    candidate_id UUID NULL, -- NULL means voting "neither satisfactory"
    choice_type VARCHAR(20) NOT NULL CHECK (choice_type IN ('candidate', 'none_satisfied')),
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_vote UNIQUE (voting_session_id, voter_id),
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES voting_candidates(id) ON DELETE CASCADE
);

-- Drop the document_votes table since we now have the proper votes table
DROP TABLE IF EXISTS document_votes;

-- Create indexes for the new votes table
CREATE INDEX IF NOT EXISTS idx_votes_session_id ON votes(voting_session_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);

-- Update the voting_results view to use the new votes table
DROP VIEW IF EXISTS voting_results;
CREATE OR REPLACE VIEW voting_results AS
SELECT 
    vs.id as voting_session_id,
    vs.task_id,
    vs.title as voting_title,
    vs.status as voting_status,
    vs.started_at,
    vs.ended_at,
    COUNT(v.id) as total_votes,
    COUNT(CASE WHEN v.choice_type = 'candidate' THEN 1 END) as candidate_votes,
    COUNT(CASE WHEN v.choice_type = 'none_satisfied' THEN 1 END) as none_satisfied_votes,
    vc_winner.id as winner_candidate_id,
    vc_winner.author_name as winner_author_name,
    vc_winner.vote_count as winner_vote_count
FROM voting_sessions vs
LEFT JOIN votes v ON vs.id = v.voting_session_id
LEFT JOIN voting_candidates vc_winner ON vs.id = vc_winner.voting_session_id AND vc_winner.is_winner = TRUE
GROUP BY vs.id, vs.task_id, vs.title, vs.status, vs.started_at, vs.ended_at, 
         vc_winner.id, vc_winner.author_name, vc_winner.vote_count;

-- Add some additional constraints to ensure data integrity
ALTER TABLE voting_sessions DROP CONSTRAINT IF EXISTS voting_sessions_status_check;
ALTER TABLE voting_sessions ADD CONSTRAINT voting_sessions_status_check 
    CHECK (status IN ('active', 'completed', 'cancelled'));

-- Ensure task_reassignments has the exact fields from prompt
ALTER TABLE task_reassignments DROP COLUMN IF EXISTS old_deadline;
ALTER TABLE task_reassignments DROP COLUMN IF EXISTS new_deadline;

-- Update task status constraint to include all Phase 4 statuses
ALTER TABLE wiki_tasks DROP CONSTRAINT IF EXISTS wiki_tasks_status_check;
ALTER TABLE wiki_tasks ADD CONSTRAINT wiki_tasks_status_check 
    CHECK (status IN ('not_started', 'in_progress', 'pending_submission', 'pending_vote', 'voting', 'completed', 'reassigned'));

-- Add a comment to document the table purpose
COMMENT ON TABLE votes IS 'Phase 4: Voting records for document version selection';
COMMENT ON TABLE voting_sessions IS 'Phase 4: Voting sessions for document comparison';
COMMENT ON TABLE voting_candidates IS 'Phase 4: Candidates (document versions) in voting sessions';
COMMENT ON TABLE task_reassignments IS 'Phase 4: History of task reassignments when neither version is satisfactory';