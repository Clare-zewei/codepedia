import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'

function TopicView({ user }) {
  const { id } = useParams()
  const [topicData, setTopicData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddCodePath, setShowAddCodePath] = useState(false)
  const [codePathForm, setCodePathForm] = useState({
    file_path: '',
    description: '',
    start_line: '',
    end_line: '',
    importance_level: 3
  })

  useEffect(() => {
    fetchTopicData()
  }, [id])

  const fetchTopicData = async () => {
    try {
      const response = await axios.get(`/topics/${id}`)
      setTopicData(response.data)
    } catch (error) {
      console.error('Error fetching topic data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCodePath = async (e) => {
    e.preventDefault()
    try {
      const data = { ...codePathForm }
      if (data.start_line) data.start_line = parseInt(data.start_line)
      if (data.end_line) data.end_line = parseInt(data.end_line)
      
      await axios.post(`/topics/${id}/code-paths`, data)
      setCodePathForm({
        file_path: '',
        description: '',
        start_line: '',
        end_line: '',
        importance_level: 3
      })
      setShowAddCodePath(false)
      fetchTopicData()
    } catch (error) {
      console.error('Error adding code path:', error)
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

  const getImportanceBadge = (level) => {
    const badges = {
      1: 'bg-red-100 text-red-800',
      2: 'bg-orange-100 text-orange-800',
      3: 'bg-yellow-100 text-yellow-800',
      4: 'bg-blue-100 text-blue-800',
      5: 'bg-gray-100 text-gray-800'
    }
    const labels = {
      1: 'Critical',
      2: 'High',
      3: 'Medium',
      4: 'Low',
      5: 'Optional'
    }
    return { class: badges[level], label: labels[level] }
  }

  if (loading) {
    return <div className="text-center py-8">Loading topic...</div>
  }

  if (!topicData) {
    return <div className="text-center py-8">Topic not found</div>
  }

  const { topic, codePaths, assignments } = topicData

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{topic.title}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(topic.status)}`}>
                {topic.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-gray-600 mb-4">{topic.description}</p>
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <span>Module: <Link to={`/modules/${topic.module_id}`} className="text-blue-600 hover:text-blue-800">{topic.module_name}</Link></span>
              <span>Author: {topic.code_author_username}</span>
              <span>Created: {new Date(topic.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {(user.role === 'admin' || (user.role === 'code_author' && user.id === topic.code_author_id)) && (
            <button
              onClick={() => setShowAddCodePath(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Add Code Path
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Code Paths</h2>
        {codePaths.length > 0 ? (
          <div className="space-y-4">
            {codePaths.map(path => {
              const importance = getImportanceBadge(path.importance_level)
              return (
                <div key={path.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                          {path.file_path}
                        </code>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${importance.class}`}>
                          {importance.label}
                        </span>
                      </div>
                      {(path.start_line || path.end_line) && (
                        <p className="text-sm text-gray-600 mb-2">
                          Lines: {path.start_line || '?'} - {path.end_line || '?'}
                        </p>
                      )}
                      {path.description && (
                        <p className="text-gray-700">{path.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        Annotated by {path.annotated_by_username}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500">No code paths annotated yet.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documentation Assignments</h2>
        {assignments.length > 0 ? (
          <div className="space-y-4">
            {assignments.map(assignment => (
              <div key={assignment.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">Assigned to: {assignment.assigned_to_username}</p>
                    <p className="text-sm text-gray-600">Assigned by: {assignment.assigned_by_username}</p>
                    <p className="text-sm text-gray-600">Status: {assignment.status}</p>
                    {assignment.deadline && (
                      <p className="text-sm text-gray-600">
                        Deadline: {new Date(assignment.deadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(assignment.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No documentation assignments yet.</p>
        )}
      </div>

      {/* Add Code Path Modal */}
      {showAddCodePath && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Code Path</h3>
            <form onSubmit={handleAddCodePath} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">File Path</label>
                <input
                  type="text"
                  value={codePathForm.file_path}
                  onChange={(e) => setCodePathForm(prev => ({...prev, file_path: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="src/components/Example.js"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Line</label>
                  <input
                    type="number"
                    value={codePathForm.start_line}
                    onChange={(e) => setCodePathForm(prev => ({...prev, start_line: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Line</label>
                  <input
                    type="number"
                    value={codePathForm.end_line}
                    onChange={(e) => setCodePathForm(prev => ({...prev, end_line: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    min="1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Importance Level</label>
                <select
                  value={codePathForm.importance_level}
                  onChange={(e) => setCodePathForm(prev => ({...prev, importance_level: parseInt(e.target.value)}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value={1}>1 - Critical</option>
                  <option value={2}>2 - High</option>
                  <option value={3}>3 - Medium</option>
                  <option value={4}>4 - Low</option>
                  <option value={5}>5 - Optional</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={codePathForm.description}
                  onChange={(e) => setCodePathForm(prev => ({...prev, description: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                  placeholder="Describe the relevance of this code path..."
                />
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  Add Path
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCodePath(false)}
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

export default TopicView