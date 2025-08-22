-- Phase 3: Encyclopedia Content Writing System Database Migration
-- Creating tables for comprehensive content creation functionality

-- 1. Entry Documents (Markdown文档内容)
CREATE TABLE IF NOT EXISTS entry_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    writer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    stage VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft', 'submitted', 'voting')),
    is_submitted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure each writer can only have one document per task
    UNIQUE(task_id, writer_id)
);

-- 2. Document Versions (个人版本历史)
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    save_note VARCHAR(255),
    
    -- Ensure version numbers are unique per document
    UNIQUE(document_id, version_number)
);

-- 3. API Test Configurations (API接口测试配置)
CREATE TABLE IF NOT EXISTS entry_api_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
    endpoint VARCHAR(500) NOT NULL,
    headers JSONB DEFAULT '{}',
    body_type VARCHAR(50) DEFAULT 'json' CHECK (body_type IN ('json', 'form', 'raw', 'none')),
    body_content TEXT,
    expected_status INTEGER,
    expected_response TEXT,
    environment_vars JSONB DEFAULT '{}',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Use Case Scripts (用例脚本内容)
CREATE TABLE IF NOT EXISTS entry_notebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'python' CHECK (language IN ('python', 'javascript', 'sql', 'bash', 'shell')),
    content TEXT NOT NULL DEFAULT '',
    description TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Code Annotation References (开发者注释信息引用)
CREATE TABLE IF NOT EXISTS annotation_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    annotation_id UUID NOT NULL REFERENCES code_annotations(id) ON DELETE CASCADE,
    reference_type VARCHAR(50) DEFAULT 'full' CHECK (reference_type IN ('full', 'partial', 'quote')),
    referenced_content TEXT,
    position_in_document INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Quality Check Results (质量检查结果)
CREATE TABLE IF NOT EXISTS quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pass', 'warning', 'error')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    score INTEGER CHECK (score >= 0 AND score <= 100),
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Content Submissions (提交记录)
CREATE TABLE IF NOT EXISTS entry_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id),
    submission_content JSONB NOT NULL, -- Complete snapshot of content at submission
    quality_score INTEGER,
    submission_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Each document can only have one submission
    UNIQUE(document_id)
);

-- 8. Draft Auto-save Records (草稿自动保存记录)
CREATE TABLE IF NOT EXISTS draft_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES entry_documents(id) ON DELETE CASCADE,
    content_snapshot JSONB NOT NULL,
    save_type VARCHAR(20) DEFAULT 'auto' CHECK (save_type IN ('auto', 'manual')),
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_entry_documents_task_writer ON entry_documents(task_id, writer_id);
CREATE INDEX IF NOT EXISTS idx_entry_documents_stage ON entry_documents(stage);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_api_configs_document ON entry_api_configs(document_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_document ON entry_notebooks(document_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_document ON quality_checks(document_id);
CREATE INDEX IF NOT EXISTS idx_draft_saves_document ON draft_saves(document_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to relevant tables
CREATE TRIGGER update_entry_documents_updated_at BEFORE UPDATE ON entry_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_api_configs_updated_at BEFORE UPDATE ON entry_api_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_notebooks_updated_at BEFORE UPDATE ON entry_notebooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
-- This will be populated after we have test tasks created

COMMENT ON TABLE entry_documents IS 'Main documents for encyclopedia entries';
COMMENT ON TABLE document_versions IS 'Version history for draft documents';
COMMENT ON TABLE entry_api_configs IS 'API test configurations for each entry';
COMMENT ON TABLE entry_notebooks IS 'Use case scripts and notebooks for each entry';
COMMENT ON TABLE annotation_references IS 'References to developer code annotations';
COMMENT ON TABLE quality_checks IS 'Quality check results for content';
COMMENT ON TABLE entry_submissions IS 'Final submission records';
COMMENT ON TABLE draft_saves IS 'Auto-save snapshots for drafts';