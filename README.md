# Codepedia - Code Quality Assessment System

A comprehensive platform for assessing code quality through third-party documentation writing and peer review.

## System Philosophy

Codepedia implements an innovative approach to code quality assessment:

1. **Code Authors** complete feature development and annotate relevant code paths
2. **Administrators** assign documentation writing tasks to third-party developers
3. **Document Authors** analyze code independently and write technical documentation
4. **Team Members** vote on document quality, providing reverse assessment of code readability

## Phase 1 Features

### Core Functionality
- ✅ Multi-role user authentication (Admin, Code Author, Document Author, Team Member)
- ✅ Hierarchical module structure with unlimited nesting
- ✅ Topic creation and code path annotation
- ✅ Document assignment and submission workflow
- ✅ Voting system for quality assessment
- ✅ Comprehensive dashboard and analytics

### Database Design
- **Users**: Multi-role authentication system
- **Modules**: Hierarchical project organization (unlimited nesting)
- **Topics**: Feature units requiring documentation assessment  
- **CodePaths**: Link topics to actual code locations
- **Documents**: Third-party written technical documentation
- **Votes**: Quality assessment and reverse code evaluation
- **Assessments**: Aggregated results and analytics

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)

### Using Docker (Recommended)

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd codepedia
   cp .env.example .env
   ```

2. **Start the complete system**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Database: PostgreSQL on port 5432

4. **Login with demo credentials**:
   
   **Administrator Account:**
   - Username: `admin`
   - Password: `admin123`
   
   **Test Accounts (Password: `password123`):**
   - **Code Author**: `codeauthor` - Can create topics and annotate code paths
   - **Document Author**: `docauthor` - Can write documentation for assigned topics
   - **Team Member**: `teammember` - Can vote on document quality and participate in assessments

### Development Mode

```bash
docker-compose -f docker-compose.dev.yml up
```

This enables:
- Hot reload for both frontend and development
- Volume mounting for live code changes
- Development databases with separate ports

## Project Structure

```
codepedia/
├── docker-compose.yml          # Production containers
├── docker-compose.dev.yml      # Development containers
├── .env.example               # Environment template
├── frontend/                  # React + Vite application
│   ├── Dockerfile            # Production build
│   ├── Dockerfile.dev        # Development setup
│   ├── src/
│   │   ├── components/       # React components
│   │   └── App.jsx          # Main application
│   └── package.json
├── backend/                   # Node.js + Express API
│   ├── Dockerfile            # Production build  
│   ├── Dockerfile.dev        # Development setup
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── middleware/      # Authentication & validation
│   │   ├── config/          # Database configuration
│   │   └── database/        # SQL schema and migrations
│   └── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Modules & Topics
- `GET /api/modules` - List all modules (hierarchical)
- `POST /api/modules` - Create new module
- `GET /api/modules/:id` - Get module details with topics
- `POST /api/topics` - Create new topic
- `GET /api/topics/:id` - Get topic with code paths
- `POST /api/topics/:id/code-paths` - Add code path annotation

### Documents & Assessment
- `POST /api/documents/assignments` - Create documentation assignment (Admin)
- `POST /api/documents` - Submit documentation
- `GET /api/documents/:id` - Get document with votes
- `POST /api/assessments/vote` - Submit quality vote
- `GET /api/assessments/results/:topic_id` - Get assessment results

## Role-Based Access

### Administrator
- Create modules and assign documentation tasks
- View comprehensive analytics dashboard
- Manage the overall assessment process

### Code Author  
- Create topics and annotate code paths
- View assessment results for their code
- Participate in voting on others' documentation

### Document Author
- Receive assignments to analyze code
- Write technical documentation based on code analysis
- Submit documentation for peer review

### Team Member
- Vote on document quality
- Participate in reverse code quality assessment
- View project progress and analytics

## System Architecture

### Containerized Environment
- **PostgreSQL Database**: Persistent data storage with automated schema setup
- **Node.js Backend**: RESTful API with Express framework
- **React Frontend**: Modern UI with Vite for fast development
- **Docker Networking**: Seamless inter-container communication

### Quality Assessment Flow
1. Code author completes feature and creates topic
2. Code author annotates relevant code paths with importance levels
3. Administrator assigns topic to document author  
4. Document author analyzes code independently and writes documentation
5. Team members vote on documentation quality and code readability
6. System aggregates votes to assess original code quality

## Database Schema Highlights

### Hierarchical Modules
```sql
-- Supports unlimited nesting with path tracking
modules (id, name, parent_id, path, description)
```

### Code Path Annotation
```sql  
-- Links topics to actual code locations
code_paths (topic_id, file_path, start_line, end_line, importance_level)
```

### Assessment Voting
```sql
-- Dual assessment: document quality + code readability  
votes (document_id, voter_id, document_quality_score, code_readability_score)
```

## Development

### Backend Development
```bash
cd backend
npm install
npm run dev  # Starts with nodemon
```

### Frontend Development  
```bash
cd frontend
npm install
npm run dev  # Starts Vite dev server
```

### Database Access
```bash
# Connect to development database
docker-compose -f docker-compose.dev.yml exec postgres psql -U postgres -d codepedia_dev
```

## Environment Variables

See `.env.example` for all available configuration options:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT token generation  
- `NODE_ENV`: Environment mode (development/production)
- `VITE_API_URL`: Frontend API endpoint configuration

## Acceptance Criteria ✅

- [x] Execute `docker-compose up` to start complete system
- [x] Frontend interface distinguishes administrators and regular users  
- [x] Database correctly creates table structure and initial data
- [x] Inter-container network communication works normally
- [x] Role-based access control implemented
- [x] Hierarchical module structure supports unlimited nesting
- [x] Code quality assessment workflow functional

## Next Steps

Phase 1 establishes the foundation. Future phases will expand with:
- Advanced analytics and reporting
- Integration with version control systems
- Automated code analysis tools
- Enhanced collaboration features
- Mobile-responsive interface improvements

## Support

For issues and feature requests, please check the application logs:

```bash
# View all container logs
docker-compose logs

# View specific service logs  
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```