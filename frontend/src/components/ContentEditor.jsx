import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import MarkdownEditor from './MarkdownEditor'
import ApiConfigManager from './ApiConfigManager'
import NotebookManager from './NotebookManager'
import QualityChecker from './QualityChecker'

function ContentEditor({ user }) {
  const { taskId } = useParams()
  const [task, setTask] = useState(null)
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentTab, setCurrentTab] = useState('document')
  const [saveStatus, setSaveStatus] = useState('saved') // saved, saving, error
  const [qualityResults, setQualityResults] = useState(null)
  const [showQuality, setShowQuality] = useState(false)

  useEffect(() => {
    if (taskId) {
      fetchTaskAndDocument()
    }
  }, [taskId])

  const fetchTaskAndDocument = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Get task details
      const taskResponse = await axios.get(`/wiki-tasks/${taskId}`)
      const taskData = taskResponse.data.task || taskResponse.data
      setTask(taskData)
      
      // Check if user is authorized (writer or admin)
      const isAuthorized = user.role === 'admin' || 
                          user.id === taskData.writer1_id || 
                          user.id === taskData.writer2_id

      if (!isAuthorized) {
        setError('You do not have permission to edit this task')
        return
      }

      // Get or create document
      const docResponse = await axios.get(`/entry-documents/task/${taskId}/writer/${user.id}`)
      setDocument(docResponse.data)
      
    } catch (error) {
      console.error('Error fetching data:', error)
      if (error.response?.status === 403) {
        setError('You do not have permission to edit this task')
      } else if (error.response?.status === 404) {
        setError('Task not found')
      } else {
        setError('Error loading task: ' + (error.response?.data?.error || error.message))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDocumentSave = async (title, content, saveNote = '') => {
    if (!document) return

    try {
      setSaveStatus('saving')
      const response = await axios.put(`/entry-documents/${document.id}/draft`, {
        title,
        content,
        saveNote
      })
      
      setDocument(response.data)
      setSaveStatus('saved')
      return response.data
    } catch (error) {
      console.error('Error saving document:', error)
      setSaveStatus('error')
      throw error
    }
  }

  const handleSubmitDocument = async () => {
    if (!document) return

    try {
      // Run quality check first
      const qualityResponse = await axios.post(`/quality-checks/document/${document.id}/check`)
      setQualityResults(qualityResponse.data)
      
      if (!qualityResponse.data.can_submit) {
        setShowQuality(true)
        alert('Document has quality issues that prevent submission. Please review and fix them.')
        return
      }

      const confirmSubmit = window.confirm(
        'Are you sure you want to submit this document? Once submitted, you cannot make further changes.'
      )
      
      if (confirmSubmit) {
        await axios.post(`/entry-documents/${document.id}/submit`)
        alert('Document submitted successfully!')
        fetchTaskAndDocument() // Refresh to show submitted status
      }
    } catch (error) {
      console.error('Error submitting document:', error)
      alert('Error submitting document: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleQualityCheck = async () => {
    if (!document) return

    try {
      const response = await axios.post(`/quality-checks/document/${document.id}/check`)
      setQualityResults(response.data)
      setShowQuality(true)
    } catch (error) {
      console.error('Error running quality check:', error)
      alert('Error running quality check: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading content editor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link to="/directory-tasks" className="text-blue-600 hover:text-blue-800 inline-block">
            ← Back to Directory
          </Link>
        </div>
      </div>
    )
  }

  if (!task || !document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading task data...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'document', label: '📄 Documentation', icon: '📄' },
    { id: 'api', label: '🔗 API Testing', icon: '🔗' },
    { id: 'notebooks', label: '📓 Use Cases', icon: '📓' },
    { id: 'quality', label: '✅ Quality Check', icon: '✅' }
  ]

  const getSaveStatusColor = () => {
    switch (saveStatus) {
      case 'saving': return 'text-yellow-600'
      case 'saved': return 'text-green-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Saved'
      case 'error': return 'Save failed'
      default: return ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link 
                to="/directory-tasks" 
                className="text-gray-500 hover:text-gray-700"
                title="Back to Directory"
              >
                ← Back
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{task.title}</h1>
                <p className="text-sm text-gray-500">
                  {task.function_name} • {task.category_name}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Save Status */}
              <span className={`text-sm ${getSaveStatusColor()}`}>
                {getSaveStatusText()}
              </span>
              
              {/* Document Status */}
              <span className={`px-2 py-1 text-xs rounded-full ${
                document.is_submitted 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {document.is_submitted ? 'Submitted' : 'Draft'}
              </span>

              {/* Action Buttons */}
              {!document.is_submitted && (
                <div className="flex space-x-2">
                  <button
                    onClick={handleQualityCheck}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                  >
                    Check Quality
                  </button>
                  <button
                    onClick={handleSubmitDocument}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"
                  >
                    Submit Document
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    currentTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'document' && (
          <MarkdownEditor
            document={document}
            task={task}
            onSave={handleDocumentSave}
            isSubmitted={document.is_submitted}
          />
        )}
        
        {currentTab === 'api' && (
          <ApiConfigManager
            document={document}
            isSubmitted={document.is_submitted}
          />
        )}
        
        {currentTab === 'notebooks' && (
          <NotebookManager
            document={document}
            isSubmitted={document.is_submitted}
          />
        )}
        
        {currentTab === 'quality' && (
          <QualityChecker
            document={document}
            qualityResults={qualityResults}
            onRunCheck={handleQualityCheck}
          />
        )}
      </div>

      {/* Quality Check Modal */}
      {showQuality && qualityResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Quality Check Results</h3>
              <button
                onClick={() => setShowQuality(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <QualityChecker
              document={document}
              qualityResults={qualityResults}
              onRunCheck={handleQualityCheck}
              isModal={true}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ContentEditor