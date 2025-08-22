-- Codepedia Database Schema
-- Core Assessment System for Code Quality and Documentation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and role management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'code_author', 'doc_author', 'team_member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Modules table for hierarchical project organization
CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    project_id UUID, -- Reference to external project system if needed
    path VARCHAR(500), -- File system path representation
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Topics table for completed features requiring documentation assessment
CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    code_author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'code_annotated', 'doc_assigned', 'doc_completed', 'assessment_complete')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- CodePaths table for linking topics to actual code locations
CREATE TABLE code_paths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    description TEXT,
    importance_level INTEGER DEFAULT 3 CHECK (importance_level BETWEEN 1 AND 5), -- 1=critical, 5=optional
    annotated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document assignments for third-party documentation writing
CREATE TABLE document_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'reviewed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Documents table for third-party written documentation
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES document_assignments(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    doc_type VARCHAR(50) DEFAULT 'technical_analysis' CHECK (doc_type IN ('technical_analysis', 'api_documentation', 'user_guide', 'code_review')),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Votes table for document quality assessment and reverse code quality evaluation
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    document_quality_score INTEGER NOT NULL CHECK (document_quality_score BETWEEN 1 AND 10),
    code_readability_score INTEGER NOT NULL CHECK (code_readability_score BETWEEN 1 AND 10),
    comments TEXT,
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, voter_id)
);

-- Assessment results aggregating vote data
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    avg_document_quality DECIMAL(3,2),
    avg_code_readability DECIMAL(3,2),
    total_votes INTEGER DEFAULT 0,
    assessment_status VARCHAR(20) DEFAULT 'pending' CHECK (assessment_status IN ('pending', 'in_progress', 'completed')),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_modules_parent_id ON modules(parent_id);
CREATE INDEX idx_topics_module_id ON topics(module_id);
CREATE INDEX idx_topics_code_author_id ON topics(code_author_id);
CREATE INDEX idx_topics_status ON topics(status);
CREATE INDEX idx_code_paths_topic_id ON code_paths(topic_id);
CREATE INDEX idx_document_assignments_topic_id ON document_assignments(topic_id);
CREATE INDEX idx_document_assignments_assigned_to ON document_assignments(assigned_to);
CREATE INDEX idx_documents_assignment_id ON documents(assignment_id);
CREATE INDEX idx_votes_document_id ON votes(document_id);
CREATE INDEX idx_assessments_topic_id ON assessments(topic_id);

-- Insert initial users with different roles
-- Admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@codepedia.com', '$2a$10$81g9GPAOvFkXKksREyhW1ujlVLiKZ1dVQt9IRGkJaGksJuo7qZ6Vy', 'admin');

-- Test users (password: password123)
INSERT INTO users (username, email, password_hash, role) VALUES 
('codeauthor', 'codeauthor@codepedia.com', '$2a$10$qQPdu7qg5fY3Uu/ZSur9kO612MUDElPO528zOQN57mDx7Cj2nqo0i', 'code_author'),
('docauthor', 'docauthor@codepedia.com', '$2a$10$YDF2/FTZ1IV4RM38hG6MVOEumkDhA.CHTP9fBqIgNkVgAiJ6DxiKW', 'doc_author'),
('teammember', 'teammember@codepedia.com', '$2a$10$PBtZVrDzEe3DfkMHRB.4IuOiLokwr9waXiBZkKeYlW04.80f57y5K', 'team_member');

-- Insert sample project structure
INSERT INTO modules (id, name, description, parent_id, path) VALUES 
(uuid_generate_v4(), 'E-commerce Platform', 'Main e-commerce application', NULL, '/'),
(uuid_generate_v4(), 'User Management', 'User authentication and management', NULL, '/user'),
(uuid_generate_v4(), 'Product Management', 'Product catalog and inventory', NULL, '/product');

-- Sample topics for demonstration
WITH user_module AS (SELECT id FROM modules WHERE name = 'User Management' LIMIT 1),
     admin_user AS (SELECT id FROM users WHERE username = 'admin' LIMIT 1)
INSERT INTO topics (title, description, module_id, code_author_id) 
SELECT 'User Registration API', 'REST API endpoint for user registration with validation', um.id, au.id 
FROM user_module um, admin_user au;