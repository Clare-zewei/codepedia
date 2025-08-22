-- Phase 2: Encyclopedia Content Writing and Assignment System Database Schema
-- New tables for directory structure, task management, and voting system

-- Categories table for hierarchical directory structure
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    path VARCHAR(1000), -- Computed path for hierarchy
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Functions table for leaf nodes that contain encyclopedia content
CREATE TABLE functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wiki tasks for encyclopedia content writing assignments
CREATE TABLE wiki_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    function_id UUID NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    
    -- Task assignment
    code_annotator_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Developer who annotates code
    writer1_id UUID REFERENCES users(id) ON DELETE SET NULL, -- First writer
    writer2_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Second writer
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- Admin who created task
    
    -- Task timing
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Task status
    status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN (
        'not_started',    -- Task created, waiting for writers to accept
        'in_progress',    -- At least one writer accepted task
        'pending_vote',   -- Both submitted or deadline reached
        'completed',      -- Voting finished
        'overtime'        -- Deadline passed with no submissions
    ))
);

-- Code annotations provided by developers
CREATE TABLE code_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    annotator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Annotation content (flexible format)
    file_paths TEXT[], -- Array of code file paths
    key_methods TEXT[], -- Array of key method/function names
    git_commits TEXT[], -- Array of git commit hashes
    deployment_status TEXT,
    additional_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wiki content written by assigned writers
CREATE TABLE wiki_contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    writer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Three-part content structure
    feature_documentation TEXT NOT NULL, -- Business process, technical implementation, usage
    api_testing TEXT NOT NULL, -- Test configurations, test cases, test results
    use_case_scripts TEXT NOT NULL, -- User stories, operation steps, expected results
    
    -- Content status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',        -- Being written
        'submitted',    -- Submitted for review/voting
        'selected',     -- Won the vote, becomes official content
        'rejected'      -- Lost the vote, will be deleted
    )),
    
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one writer can only have one active version per task
    UNIQUE(task_id, writer_id)
);

-- Voting records for content selection
CREATE TABLE wiki_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Voting options
    vote_option VARCHAR(20) NOT NULL CHECK (vote_option IN (
        'version_a',           -- Vote for first writer's version
        'version_b',           -- Vote for second writer's version
        'neither_satisfactory' -- Neither version is acceptable
    )),
    
    comments TEXT, -- Optional feedback
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One vote per user per task
    UNIQUE(task_id, voter_id)
);

-- Task notifications for assignment and status updates
CREATE TABLE task_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN (
        'task_assigned',        -- Task assigned to you
        'task_accepted',        -- Someone accepted the task
        'content_submitted',    -- Content submitted by writer
        'voting_started',       -- Voting phase began
        'task_completed',       -- Task completed
        'deadline_reminder',    -- Deadline approaching
        'task_overtime'         -- Task went overtime
    )),
    
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Task acceptance tracking (when writers accept tasks)
CREATE TABLE task_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES wiki_tasks(id) ON DELETE CASCADE,
    writer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One acceptance per writer per task
    UNIQUE(task_id, writer_id)
);

-- Create indexes for better performance
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_path ON categories(path);
CREATE INDEX idx_functions_category_id ON functions(category_id);
CREATE INDEX idx_wiki_tasks_function_id ON wiki_tasks(function_id);
CREATE INDEX idx_wiki_tasks_status ON wiki_tasks(status);
CREATE INDEX idx_wiki_tasks_deadline ON wiki_tasks(deadline);
CREATE INDEX idx_wiki_tasks_assigned_by ON wiki_tasks(assigned_by);
CREATE INDEX idx_wiki_tasks_writers ON wiki_tasks(writer1_id, writer2_id);
CREATE INDEX idx_code_annotations_task_id ON code_annotations(task_id);
CREATE INDEX idx_wiki_contents_task_id ON wiki_contents(task_id);
CREATE INDEX idx_wiki_contents_writer_id ON wiki_contents(writer_id);
CREATE INDEX idx_wiki_contents_status ON wiki_contents(status);
CREATE INDEX idx_wiki_votes_task_id ON wiki_votes(task_id);
CREATE INDEX idx_task_notifications_recipient_id ON task_notifications(recipient_id);
CREATE INDEX idx_task_notifications_is_read ON task_notifications(is_read);
CREATE INDEX idx_task_acceptances_task_id ON task_acceptances(task_id);

-- Insert sample category structure
INSERT INTO categories (id, name, description, parent_id, path) VALUES 
(uuid_generate_v4(), 'User Management', 'User related functionalities', NULL, '/User Management'),
(uuid_generate_v4(), 'Product Management', 'Product related functionalities', NULL, '/Product Management');

-- Get the category IDs for sub-categories
WITH user_mgmt AS (SELECT id FROM categories WHERE name = 'User Management' LIMIT 1),
     product_mgmt AS (SELECT id FROM categories WHERE name = 'Product Management' LIMIT 1)
INSERT INTO categories (id, name, description, parent_id, path) 
SELECT uuid_generate_v4(), sub_name, sub_desc, parent_id, parent_path || '/' || sub_name
FROM (
    SELECT um.id as parent_id, '/User Management' as parent_path, 'User Registration' as sub_name, 'User registration related features' as sub_desc FROM user_mgmt um
    UNION ALL
    SELECT um.id as parent_id, '/User Management' as parent_path, 'User Authentication' as sub_name, 'User authentication and login features' as sub_desc FROM user_mgmt um
    UNION ALL
    SELECT pm.id as parent_id, '/Product Management' as parent_path, 'Product Catalog' as sub_name, 'Product listing and search features' as sub_desc FROM product_mgmt pm
) sub_categories;

-- Insert sample functions
WITH user_reg AS (SELECT id FROM categories WHERE name = 'User Registration' LIMIT 1),
     user_auth AS (SELECT id FROM categories WHERE name = 'User Authentication' LIMIT 1),
     product_cat AS (SELECT id FROM categories WHERE name = 'Product Catalog' LIMIT 1),
     admin_user AS (SELECT id FROM users WHERE username = 'admin' LIMIT 1)
INSERT INTO functions (name, description, category_id, created_by)
SELECT func_name, func_desc, cat_id, admin_id
FROM (
    SELECT ur.id as cat_id, au.id as admin_id, 'Email Registration Feature' as func_name, 'User registration using email address' as func_desc FROM user_reg ur, admin_user au
    UNION ALL
    SELECT ur.id as cat_id, au.id as admin_id, 'Mobile Registration Feature' as func_name, 'User registration using mobile phone' as func_desc FROM user_reg ur, admin_user au
    UNION ALL
    SELECT ua.id as cat_id, au.id as admin_id, 'Login Verification Feature' as func_name, 'User login and credential verification' as func_desc FROM user_auth ua, admin_user au
    UNION ALL
    SELECT pc.id as cat_id, au.id as admin_id, 'Product Search Feature' as func_name, 'Search and filter products' as func_desc FROM product_cat pc, admin_user au
) sample_functions;