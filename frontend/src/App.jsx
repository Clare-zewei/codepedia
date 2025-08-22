import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import axios from 'axios'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import AdminDashboardPhase2 from './components/AdminDashboardPhase2'
import ModuleView from './components/ModuleView'
import TopicView from './components/TopicView'
import DocumentView from './components/DocumentView'
import Navigation from './components/Navigation'
import WikiTaskManager from './components/WikiTaskManager'
import VotingSystem from './components/VotingSystem'
import TaskKanban from './components/TaskKanban'
import DirectoryTree from './components/DirectoryTree'
import DirectoryWithTasks from './components/DirectoryWithTasks'
import ContentEditor from './components/ContentEditor'
import VotingManager from './components/VotingManager'
import VotingInterface from './components/VotingInterface'
import VotingResults from './components/VotingResults'
import TaskReassignmentManager from './components/TaskReassignmentManager'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api'

axios.defaults.baseURL = API_BASE_URL

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      
      axios.get('/auth/me')
        .then(response => {
          setUser(response.data.user)
        })
        .catch(() => {
          localStorage.removeItem('token')
          delete axios.defaults.headers.common['Authorization']
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = (userData, token) => {
    setUser(userData)
    localStorage.setItem('token', token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation user={user} onLogout={handleLogout} />
        
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route 
              path="/" 
              element={
                user.role === 'admin' ? 
                  <AdminDashboardPhase2 user={user} /> : 
                  <Dashboard user={user} />
              } 
            />
            <Route path="/modules/:id" element={<ModuleView user={user} />} />
            <Route path="/topics/:id" element={<TopicView user={user} />} />
            <Route path="/documents/:id" element={<DocumentView user={user} />} />
            <Route path="/directory-tasks" element={<DirectoryWithTasks user={user} />} />
            <Route path="/wiki-tasks" element={<WikiTaskManager user={user} />} />
            <Route path="/wiki-tasks/:id" element={<WikiTaskManager user={user} />} />
            <Route path="/wiki-votes/:taskId" element={<VotingSystem user={user} />} />
            <Route path="/kanban" element={<TaskKanban user={user} />} />
            <Route path="/directory" element={<DirectoryTree user={user} />} />
            <Route path="/content-editor/:taskId" element={<ContentEditor user={user} />} />
            <Route path="/voting-manager" element={<VotingManager user={user} />} />
            <Route path="/voting/:sessionId" element={<VotingInterface user={user} />} />
            <Route path="/voting/:sessionId/results" element={<VotingResults user={user} />} />
            <Route path="/task-reassignments" element={<TaskReassignmentManager user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
