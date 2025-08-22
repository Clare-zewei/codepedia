import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function WikiTaskManager({ user }) {
  const [tasks, setTasks] = useState([])
  const [functions, setFunctions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showCreateTask, setShowCreateTask] = useState(false)
  
  const [taskForm, setTaskForm] = useState({
    function_id: '',
    title: '',
    description: '',
    code_annotator_id: '',
    writer1_id: '',
    writer2_id: '',
    deadline: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [tasksRes, functionsRes, usersRes] = await Promise.all([
        axios.get('/wiki-tasks'),
        axios.get('/functions'),
        axios.get('/users')
      ])

      setTasks(tasksRes.data)
      setFunctions(functionsRes.data)
      setUsers(usersRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/wiki-tasks', {
        ...taskForm,
        deadline: taskForm.deadline ? new Date(taskForm.deadline).toISOString() : null
      })
      setTaskForm({
        function_id: '',
        title: '',
        description: '',
        code_annotator_id: '',
        writer1_id: '',
        writer2_id: '',
        deadline: ''
      })
      setShowCreateTask(false)
      fetchData()
    } catch (error) {
      console.error('Error creating task:', error)
      alert('Error creating task: ' + (error.response?.data?.error || error.message))
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status === filter
  })

  const getStatusBadge = (status) => {
    const badges = {
      not_started: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending_vote: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      overtime: 'bg-red-100 text-red-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status) => {
    return status.replace('_', ' ').toUpperCase()
  }

  if (loading) {
    return <div className="text-center py-8">Loading wiki tasks...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Wiki Task Management</h1>
        {user.role === 'admin' && (
          <button
            onClick={() => setShowCreateTask(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Create New Task
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['all', 'not_started', 'in_progress', 'pending_vote', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                filter === status
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {status === 'all' ? 'All Tasks' : getStatusLabel(status)}
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {status === 'all' ? tasks.length : tasks.filter(t => t.status === status).length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 gap-6">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No tasks found for the selected filter.</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <Link
                    to={`/wiki-tasks/${task.id}`}
                    className="text-lg font-medium text-blue-600 hover:text-blue-800"
                  >
                    {task.title}
                  </Link>
                  <p className="text-sm text-gray-600 mt-1">{task.function_name} - {task.category_name}</p>
                  {task.description && (
                    <p className="text-gray-700 mt-2">{task.description}</p>
                  )}
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(task.status)}`}>
                  {getStatusLabel(task.status)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Code Annotator:</span>
                  <p className="text-gray-600">{task.code_annotator_username || 'Not assigned'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Writers:</span>
                  <p className="text-gray-600">
                    {task.writer1_username || 'Not assigned'}, {task.writer2_username || 'Not assigned'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Deadline:</span>
                  <p className="text-gray-600">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <div className="text-xs text-gray-500">
                  Created by {task.assigned_by_username} on {new Date(task.created_at).toLocaleDateString()}
                </div>
                <div className="flex space-x-2">
                  <Link
                    to={`/wiki-tasks/${task.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details
                  </Link>
                  {task.status === 'pending_vote' && user.role === 'admin' && (
                    <Link
                      to={`/wiki-votes/${task.id}`}
                      className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                    >
                      Manage Voting
                    </Link>
                  )}
                </div>
              </div>

              {/* Progress indicators */}
              <div className="mt-4 flex items-center space-x-4 text-xs text-gray-500">
                <span>Submissions: {task.submission_count || 0}</span>
                <span>Votes: {task.vote_count || 0}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Wiki Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Function</label>
                <select
                  value={taskForm.function_id}
                  onChange={(e) => setTaskForm(prev => ({...prev, function_id: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select Function</option>
                  {functions.map(func => (
                    <option key={func.id} value={func.id}>
                      {func.category_name} - {func.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Task Title</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm(prev => ({...prev, title: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Code Annotator</label>
                  <select
                    value={taskForm.code_annotator_id}
                    onChange={(e) => setTaskForm(prev => ({...prev, code_annotator_id: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  >
                    <option value="">Select Annotator</option>
                    {users.filter(u => u.role === 'code_author').map(user => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Writer 1</label>
                  <select
                    value={taskForm.writer1_id}
                    onChange={(e) => setTaskForm(prev => ({...prev, writer1_id: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  >
                    <option value="">Select Writer 1</option>
                    {users.filter(u => ['doc_author', 'team_member'].includes(u.role)).map(user => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Writer 2</label>
                  <select
                    value={taskForm.writer2_id}
                    onChange={(e) => setTaskForm(prev => ({...prev, writer2_id: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  >
                    <option value="">Select Writer 2</option>
                    {users.filter(u => ['doc_author', 'team_member'].includes(u.role) && u.id !== taskForm.writer1_id).map(user => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Deadline (Optional)</label>
                <input
                  type="datetime-local"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm(prev => ({...prev, deadline: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div className="flex space-x-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700"
                >
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateTask(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default WikiTaskManager