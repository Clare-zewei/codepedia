import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'

function ModuleView({ user }) {
  const { id } = useParams()
  const [moduleData, setModuleData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [topicForm, setTopicForm] = useState({
    title: '',
    description: ''
  })

  useEffect(() => {
    fetchModuleData()
  }, [id])

  const fetchModuleData = async () => {
    try {
      const response = await axios.get(`/modules/${id}`)
      setModuleData(response.data)
    } catch (error) {
      console.error('Error fetching module data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTopic = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/topics', {
        ...topicForm,
        module_id: id
      })
      setTopicForm({ title: '', description: '' })
      setShowCreateTopic(false)
      fetchModuleData()
    } catch (error) {
      console.error('Error creating topic:', error)
    }
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
    return <div className="text-center py-8">Loading module...</div>
  }

  if (!moduleData) {
    return <div className="text-center py-8">Module not found</div>
  }

  const { module, topics, children } = moduleData

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{module.name}</h1>
            <p className="text-gray-600 mt-1">{module.path}</p>
            {module.description && (
              <p className="text-gray-700 mt-2">{module.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Created by {module.created_by_username} on {new Date(module.created_at).toLocaleDateString()}
            </p>
          </div>
          {(user.role === 'admin' || user.role === 'code_author') && (
            <button
              onClick={() => setShowCreateTopic(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Create Topic
            </button>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sub-modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(child => (
              <Link 
                key={child.id}
                to={`/modules/${child.id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📁</span>
                  <div>
                    <h3 className="font-medium text-gray-900">{child.name}</h3>
                    {child.description && (
                      <p className="text-sm text-gray-500 mt-1">{child.description}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Topics</h2>
        {topics.length > 0 ? (
          <div className="space-y-4">
            {topics.map(topic => (
              <div key={topic.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <Link 
                      to={`/topics/${topic.id}`}
                      className="text-lg font-medium text-blue-600 hover:text-blue-800"
                    >
                      {topic.title}
                    </Link>
                    <p className="text-gray-600 mt-1">{topic.description}</p>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                      <span>by {topic.code_author_username}</span>
                      <span>{new Date(topic.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(topic.status)}`}>
                    {topic.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No topics in this module yet.</p>
        )}
      </div>

      {/* Create Topic Modal */}
      {showCreateTopic && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Topic</h3>
            <form onSubmit={handleCreateTopic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={topicForm.title}
                  onChange={(e) => setTopicForm(prev => ({...prev, title: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={topicForm.description}
                  onChange={(e) => setTopicForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={4}
                  required
                />
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
                  onClick={() => setShowCreateTopic(false)}
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

export default ModuleView