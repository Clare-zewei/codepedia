import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function AdminDashboardPhase2() {
  const [categories, setCategories] = useState([])
  const [functions, setFunctions] = useState([])
  const [wikiTasks, setWikiTasks] = useState([])
  const [pendingVotes, setPendingVotes] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Modal states
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateFunction, setShowCreateFunction] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  
  // Form states
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', parent_id: '' })
  const [functionForm, setFunctionForm] = useState({ name: '', description: '', category_id: '' })
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
      const [categoriesRes, functionsRes, tasksRes, votesRes, usersRes] = await Promise.all([
        axios.get('/categories'),
        axios.get('/functions'),
        axios.get('/wiki-tasks'),
        axios.get('/wiki-votes/pending-votes'),
        axios.get('/auth/me') // We'll need to create a users endpoint
      ])

      setCategories(categoriesRes.data)
      setFunctions(functionsRes.data)
      setWikiTasks(tasksRes.data)
      setPendingVotes(votesRes.data)
      // setUsers(usersRes.data) // TODO: Create users endpoint
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/categories', categoryForm)
      setCategoryForm({ name: '', description: '', parent_id: '' })
      setShowCreateCategory(false)
      fetchData()
      alert('Category created successfully!')
    } catch (error) {
      console.error('Error creating category:', error)
      alert('Error creating category: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleCreateFunction = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/functions', functionForm)
      setFunctionForm({ name: '', description: '', category_id: '' })
      setShowCreateFunction(false)
      fetchData()
      alert('Function created successfully!')
    } catch (error) {
      console.error('Error creating function:', error)
      alert('Error creating function: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/wiki-tasks', taskForm)
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
    }
  }

  const startVoting = async (taskId) => {
    try {
      await axios.post(`/wiki-votes/task/${taskId}/start-voting`)
      fetchData()
    } catch (error) {
      console.error('Error starting voting:', error)
    }
  }

  const flattenCategories = (categories, result = [], level = 0) => {
    categories.forEach(category => {
      result.push({ ...category, level })
      if (category.children) {
        flattenCategories(category.children, result, level + 1)
      }
    })
    return result
  }

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

  if (loading) {
    return <div className="text-center py-8">Loading admin dashboard...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Encyclopedia Admin Dashboard</h1>
        <div className="space-x-2">
          <button
            onClick={() => setShowCreateCategory(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create Category
          </button>
          <button
            onClick={() => setShowCreateFunction(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Create Function
          </button>
          <button
            onClick={() => setShowCreateTask(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Create Wiki Task
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900">Categories</h3>
          <p className="text-3xl font-bold text-blue-600">{flattenCategories(categories).length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900">Functions</h3>
          <p className="text-3xl font-bold text-green-600">{functions.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900">Wiki Tasks</h3>
          <p className="text-3xl font-bold text-purple-600">{wikiTasks.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900">Pending Votes</h3>
          <p className="text-3xl font-bold text-yellow-600">{pendingVotes.length}</p>
        </div>
      </div>

      {/* Pending Votes Section */}
      {pendingVotes.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tasks Pending Vote</h2>
          <div className="space-y-3">
            {pendingVotes.map(vote => (
              <div key={vote.id} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{vote.title}</h4>
                    <p className="text-sm text-gray-600">{vote.function_name} - {vote.category_name}</p>
                    <p className="text-sm text-gray-500">
                      {vote.submission_count} submissions, {vote.vote_count} votes
                    </p>
                  </div>
                  <div className="space-x-2">
                    <Link 
                      to={`/wiki-votes/${vote.id}`}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      View Voting
                    </Link>
                    <button
                      onClick={() => startVoting(vote.id)}
                      className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
                    >
                      Start Voting
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wiki Tasks Overview */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Wiki Tasks Overview</h2>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {wikiTasks.slice(0, 10).map(task => (
            <div key={task.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <Link 
                    to={`/wiki-tasks/${task.id}`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    {task.title}
                  </Link>
                  <p className="text-sm text-gray-600">{task.function_name}</p>
                  <p className="text-sm text-gray-500">
                    Writers: {task.writer1_username}, {task.writer2_username}
                  </p>
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(task.status)}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link 
            to="/directory-tasks"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View Directory & Tasks →
          </Link>
        </div>
      </div>

      {/* Create Category Modal */}
      {showCreateCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Category</h3>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm(prev => ({...prev, name: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Parent Category</label>
                <select
                  value={categoryForm.parent_id}
                  onChange={(e) => setCategoryForm(prev => ({...prev, parent_id: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Root Level</option>
                  {flattenCategories(categories).map(category => (
                    <option key={category.id} value={category.id}>
                      {'  '.repeat(category.level)}{category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCategory(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Function Modal */}
      {showCreateFunction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Function</h3>
            <form onSubmit={handleCreateFunction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={functionForm.name}
                  onChange={(e) => setFunctionForm(prev => ({...prev, name: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={functionForm.description}
                  onChange={(e) => setFunctionForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={functionForm.category_id}
                  onChange={(e) => setFunctionForm(prev => ({...prev, category_id: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select Category</option>
                  {flattenCategories(categories).map(category => (
                    <option key={category.id} value={category.id}>
                      {'  '.repeat(category.level)}{category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateFunction(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Wiki Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Create Wiki Task</h3>
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
              <div>
                <label className="block text-sm font-medium text-gray-700">Deadline</label>
                <input
                  type="datetime-local"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm(prev => ({...prev, deadline: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                Note: User assignment will be implemented in the next phase. For now, tasks will be created without specific user assignments.
              </div>
              <div className="flex space-x-2">
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

export default AdminDashboardPhase2