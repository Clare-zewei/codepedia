require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const moduleRoutes = require('./routes/modules');
const topicRoutes = require('./routes/topics');
const documentRoutes = require('./routes/documents');
const assessmentRoutes = require('./routes/assessments');
const categoryRoutes = require('./routes/categories');
const functionRoutes = require('./routes/functions');
const wikiTaskRoutes = require('./routes/wiki-tasks');
const codeAnnotationRoutes = require('./routes/code-annotations');
const wikiContentRoutes = require('./routes/wiki-contents');
const wikiVoteRoutes = require('./routes/wiki-votes');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const entryDocumentRoutes = require('./routes/entry-documents');
const entryApiConfigRoutes = require('./routes/entry-api-configs');
const entryNotebookRoutes = require('./routes/entry-notebooks');
const qualityCheckRoutes = require('./routes/quality-checks');
const votingSessionRoutes = require('./routes/voting-sessions');
const documentVoteRoutes = require('./routes/document-votes');
const taskReassignmentRoutes = require('./routes/task-reassignments');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/wiki-tasks', wikiTaskRoutes);
app.use('/api/code-annotations', codeAnnotationRoutes);
app.use('/api/wiki-contents', wikiContentRoutes);
app.use('/api/wiki-votes', wikiVoteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/entry-documents', entryDocumentRoutes);
app.use('/api/entry-api-configs', entryApiConfigRoutes);
app.use('/api/entry-notebooks', entryNotebookRoutes);
app.use('/api/quality-checks', qualityCheckRoutes);
app.use('/api/voting-sessions', votingSessionRoutes);
app.use('/api/document-votes', documentVoteRoutes);
app.use('/api/task-reassignments', taskReassignmentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Codepedia backend server running on port ${PORT}`);
});