import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function AdminDashboard() {
  const [modules, setModules] = useState([])
  const [topics, setTopics] = useState([])
  const [users, setUsers] = useState([])
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModule, setShowCreateModule] = useState(false)
  const [showAssignDoc, setShowAssignDoc] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState(null)

  const [moduleForm, setModuleForm] = useState({
    name: '',
    description: '',
    parent_id: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [modulesRes, topicsRes, dashboardRes] = await Promise.all([
        axios.get('/modules'),
        axios.get('/topics'),
        axios.get('/assessments/dashboard')
      ])

      setModules(modulesRes.data)
      setTopics(topicsRes.data)
      setDashboardData(dashboardRes.data)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateModule = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/modules', moduleForm)
      setModuleForm({ name: '', description: '', parent_id: '' })
      setShowCreateModule(false)
      fetchData()
    } catch (error) {
      console.error('Error creating module:', error)
    }
  }

  const flattenModules = (modules, result = []) => {
    modules.forEach(module => {
      result.push(module)
      if (module.children) {
        flattenModules(module.children, result)
      }
    })
    return result
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

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="space-x-2">
          <button
            onClick={() => setShowCreateModule(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create Module
          </button>
        </div>
      </div>

      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Total Topics</h3>
            <p className="text-3xl font-bold text-blue-600">{dashboardData.overview.total_topics}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Total Documents</h3>
            <p className="text-3xl font-bold text-green-600">{dashboardData.overview.total_documents}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Total Votes</h3>
            <p className="text-3xl font-bold text-purple-600">{dashboardData.overview.total_votes}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Avg Code Quality</h3>
            <p className="text-3xl font-bold text-orange-600">
              {dashboardData.overview.avg_code_quality_score || 'N/A'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Structure</h2>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {modules.length > 0 ? renderModuleTree(modules) : (
              <p className="text-gray-500">No modules found</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Topics Requiring Attention</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {topics.filter(t => t.status === 'pending' || t.status === 'code_annotated').map(topic => (
              <div key={topic.id} className="border-l-4 border-yellow-500 pl-4">
                <Link 
                  to={`/topics/${topic.id}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  {topic.title}
                </Link>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-500">by {topic.code_author_username}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(topic.status)}`}>
                      {topic.status.replace('_', ' ')}
                    </span>
                    {topic.status === 'code_annotated' && (
                      <button
                        onClick={() => {
                          setSelectedTopic(topic)
                          setShowAssignDoc(true)
                        }}
                        className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"
                      >
                        Assign Doc
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Module Modal */}
      {showCreateModule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Module</h3>
            <form onSubmit={handleCreateModule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={moduleForm.name}
                  onChange={(e) => setModuleForm(prev => ({...prev, name: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={moduleForm.description}
                  onChange={(e) => setModuleForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Parent Module</label>
                <select
                  value={moduleForm.parent_id}
                  onChange={(e) => setModuleForm(prev => ({...prev, parent_id: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Root Level</option>
                  {flattenModules(modules).map(module => (
                    <option key={module.id} value={module.id}>
                      {module.path} - {module.name}
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
                  onClick={() => setShowCreateModule(false)}
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

export default AdminDashboard