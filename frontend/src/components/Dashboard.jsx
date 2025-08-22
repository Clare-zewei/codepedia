import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function Dashboard({ user }) {
  const [modules, setModules] = useState([])
  const [topics, setTopics] = useState([])
  const [wikiTasks, setWikiTasks] = useState([])
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const requests = []
      
      // For doc_author and team_member users, focus on wiki tasks
      if (user.role === 'doc_author' || user.role === 'team_member') {
        requests.push(
          axios.get('/wiki-tasks').catch(() => ({ data: [] }))
        )
      } else {
        // For other users, fetch traditional data
        requests.push(
          axios.get('/modules').catch(() => ({ data: [] })),
          axios.get('/topics').catch(() => ({ data: [] })),
          axios.get('/assessments/dashboard').catch(() => ({ data: { overview: {} } }))
        )
      }

      const responses = await Promise.all(requests)

      if (user.role === 'doc_author' || user.role === 'team_member') {
        // Filter tasks assigned to current user
        const userTasks = responses[0].data.filter(task => 
          task.writer1_id === user.id || task.writer2_id === user.id
        )
        setWikiTasks(userTasks)
      } else {
        setModules(responses[0].data)
        setTopics(responses[1].data.slice(0, 5)) // Show only recent 5 topics
        setDashboardData(responses[2].data)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const renderModuleTree = (modules, level = 0) => {
    return modules.map(module => (
      <div key={module.id} className={`ml-${level * 4}`}>
        <Link 
          to={`/modules/${module.id}`}
          className="block py-2 px-3 rounded hover:bg-gray-100 text-blue-600 hover:text-blue-800"
        >
          📁 {module.name}
        </Link>
        {module.children && module.children.length > 0 && (
          <div className="ml-4">
            {renderModuleTree(module.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      code_annotated: 'bg-blue-100 text-blue-800',
      doc_assigned: 'bg-purple-100 text-purple-800',
      doc_completed: 'bg-green-100 text-green-800',
      assessment_complete: 'bg-gray-100 text-gray-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const getTaskStatusBadge = (status) => {
    const badges = {
      not_started: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending_submission: 'bg-yellow-100 text-yellow-800',
      pending_vote: 'bg-purple-100 text-purple-800',
      voting: 'bg-indigo-100 text-indigo-800',
      completed: 'bg-green-100 text-green-800',
      pending_reassignment: 'bg-red-100 text-red-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const formatTaskStatus = (status) => {
    const statusMap = {
      not_started: 'Not Started',
      in_progress: 'In Progress', 
      pending_submission: 'Pending Submission',
      pending_vote: 'Pending Vote',
      voting: 'Voting',
      completed: 'Completed',
      pending_reassignment: 'Pending Reassignment'
    }
    return statusMap[status] || status.replace('_', ' ')
  }

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user.username}!
        </h1>
      </div>

      {/* Statistics for non-doc_author users */}
      {!(user.role === 'doc_author' || user.role === 'team_member') && dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Total Topics</h3>
            <p className="text-3xl font-bold text-blue-600">{dashboardData.overview?.total_topics || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Pending Assessment</h3>
            <p className="text-3xl font-bold text-yellow-600">{dashboardData.overview?.pending_topics || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Completed</h3>
            <p className="text-3xl font-bold text-green-600">{dashboardData.overview?.completed_assessments || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Avg Code Quality</h3>
            <p className="text-3xl font-bold text-purple-600">
              {dashboardData.overview?.avg_code_quality_score || 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Task statistics for doc_author and team_member users */}
      {(user.role === 'doc_author' || user.role === 'team_member') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Assigned Tasks</h3>
            <p className="text-3xl font-bold text-blue-600">{wikiTasks.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Not Started</h3>
            <p className="text-3xl font-bold text-gray-600">
              {wikiTasks.filter(task => task.status === 'not_started').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">In Progress</h3>
            <p className="text-3xl font-bold text-yellow-600">
              {wikiTasks.filter(task => task.status === 'in_progress').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Completed</h3>
            <p className="text-3xl font-bold text-green-600">
              {wikiTasks.filter(task => task.status === 'completed').length}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Show wiki tasks for doc_author and team_member users */}
        {(user.role === 'doc_author' || user.role === 'team_member') && (
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">My Assigned Tasks</h2>
                <Link 
                  to="/directory-tasks" 
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View All Tasks →
                </Link>
              </div>
              <div className="space-y-4">
                {wikiTasks.length > 0 ? wikiTasks.slice(0, 6).map(task => (
                  <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Link 
                          to={`/content-editor/${task.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium text-lg"
                        >
                          {task.title}
                        </Link>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">{task.category_name}</span> › <span className="font-medium">{task.function_name}</span>
                        </p>
                        {task.description && (
                          <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                        )}
                      </div>
                      <div className="ml-4 flex flex-col items-end space-y-2">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getTaskStatusBadge(task.status)}`}>
                          {formatTaskStatus(task.status)}
                        </span>
                        <Link 
                          to={`/content-editor/${task.id}`}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                        >
                          Edit Content
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500">
                        Writers: {task.writer1_name}{task.writer2_name && `, ${task.writer2_name}`}
                      </div>
                      {task.deadline && (
                        <div className="text-xs text-gray-500">
                          Due: {new Date(task.deadline).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-3">📝</div>
                    <p>No tasks assigned to you yet</p>
                    <p className="text-sm mt-1">Ask your admin to assign you some documentation tasks</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Show traditional project structure for other roles */}
        {!(user.role === 'doc_author' || user.role === 'team_member') && (
          <>
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Structure</h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {modules.length > 0 ? renderModuleTree(modules) : (
                  <p className="text-gray-500">No modules found</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Topics</h2>
              <div className="space-y-3">
                {topics.length > 0 ? topics.map(topic => (
                  <div key={topic.id} className="border-l-4 border-blue-500 pl-4">
                    <Link 
                      to={`/topics/${topic.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {topic.title}
                    </Link>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-gray-500">{topic.module_name}</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(topic.status)}`}>
                        {topic.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500">No topics found</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {dashboardData?.recentActivity && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {dashboardData.recentActivity.slice(0, 10).map((activity, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{activity.user_name}</span> {activity.activity_title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(activity.activity_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard