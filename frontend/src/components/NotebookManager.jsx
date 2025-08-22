import { useState, useEffect } from 'react'
import axios from 'axios'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

function NotebookManager({ document, isSubmitted }) {
  const [notebooks, setNotebooks] = useState([])
  const [languages, setLanguages] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingNotebook, setEditingNotebook] = useState(null)
  const [previewMode, setPreviewMode] = useState({})

  useEffect(() => {
    const fetchData = async () => {
      if (document?.id) {
        await Promise.all([fetchNotebooks(), fetchLanguages()])
      }
    }
    fetchData()
  }, [document])

  const fetchNotebooks = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`/entry-notebooks/document/${document.id}`)
      setNotebooks(response.data)
    } catch (error) {
      console.error('Error fetching notebooks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLanguages = async () => {
    try {
      const response = await axios.get('/entry-notebooks/languages')
      setLanguages(response.data)
    } catch (error) {
      console.error('Error fetching languages:', error)
    }
  }

  const saveNotebook = async (notebookData) => {
    try {
      let response
      if (notebookData.id) {
        response = await axios.put(`/entry-notebooks/${notebookData.id}`, notebookData)
      } else {
        response = await axios.post('/entry-notebooks', {
          ...notebookData,
          document_id: document.id
        })
      }
      
      await fetchNotebooks()
      setEditingNotebook(null)
      return response.data
    } catch (error) {
      console.error('Error saving notebook:', error)
      throw error
    }
  }

  const deleteNotebook = async (notebookId) => {
    if (!window.confirm('Are you sure you want to delete this notebook?')) {
      return
    }

    try {
      await axios.delete(`/entry-notebooks/${notebookId}`)
      await fetchNotebooks()
    } catch (error) {
      console.error('Error deleting notebook:', error)
    }
  }

  const duplicateNotebook = (notebook) => {
    const newNotebook = {
      ...notebook,
      id: undefined,
      title: `${notebook.title} (Copy)`,
      order_index: notebooks.length
    }
    setEditingNotebook(newNotebook)
  }

  const togglePreview = (notebookId) => {
    setPreviewMode({
      ...previewMode,
      [notebookId]: !previewMode[notebookId]
    })
  }

  const downloadNotebook = (notebook) => {
    const language = languages.find(lang => lang.value === notebook.language)
    const extension = language?.extension || '.txt'
    const filename = `${notebook.title.replace(/[^a-zA-Z0-9]/g, '_')}${extension}`
    
    const blob = new Blob([notebook.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="notebook-manager h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Use Case Scripts</h2>
            <p className="text-sm text-gray-600">Create practical examples and use cases</p>
          </div>
          
          {!isSubmitted && (
            <button
              onClick={() => setEditingNotebook({})}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              + Add Script
            </button>
          )}
        </div>
      </div>

      {/* Notebooks List */}
      <div className="flex-1 overflow-y-auto">
        {notebooks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">📓</div>
            <p className="text-gray-600">No use case scripts yet</p>
            {!isSubmitted && (
              <button
                onClick={() => setEditingNotebook({})}
                className="mt-4 text-blue-600 hover:text-blue-800"
              >
                Create your first script
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {notebooks.map((notebook, index) => (
              <NotebookCard
                key={notebook.id}
                notebook={notebook}
                language={languages.find(lang => lang.value === notebook.language)}
                isPreview={previewMode[notebook.id]}
                onEdit={() => setEditingNotebook(notebook)}
                onDelete={() => deleteNotebook(notebook.id)}
                onDuplicate={() => duplicateNotebook(notebook)}
                onTogglePreview={() => togglePreview(notebook.id)}
                onDownload={() => downloadNotebook(notebook)}
                isSubmitted={isSubmitted}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editingNotebook && (
        <NotebookEditor
          notebook={editingNotebook}
          languages={languages}
          onSave={saveNotebook}
          onCancel={() => setEditingNotebook(null)}
        />
      )}
    </div>
  )
}

function NotebookCard({ 
  notebook, 
  language, 
  isPreview, 
  onEdit, 
  onDelete, 
  onDuplicate, 
  onTogglePreview, 
  onDownload, 
  isSubmitted, 
  index 
}) {
  const getLanguageColor = (langValue) => {
    const colors = {
      python: 'bg-blue-100 text-blue-800',
      javascript: 'bg-yellow-100 text-yellow-800',
      sql: 'bg-green-100 text-green-800',
      bash: 'bg-gray-100 text-gray-800',
      shell: 'bg-purple-100 text-purple-800'
    }
    return colors[langValue] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-gray-500">#{index + 1}</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getLanguageColor(notebook.language)}`}>
                {language?.label || notebook.language}
              </span>
              <h3 className="font-medium text-gray-900">{notebook.title}</h3>
            </div>
            
            {notebook.description && (
              <p className="text-sm text-gray-600 mb-2">{notebook.description}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={onTogglePreview}
              className="text-gray-500 hover:text-gray-700"
              title={isPreview ? "Show Code" : "Show Preview"}
            >
              {isPreview ? '📝' : '👁️'}
            </button>
            
            <button
              onClick={onDownload}
              className="text-gray-500 hover:text-gray-700"
              title="Download"
            >
              💾
            </button>
            
            {!isSubmitted && (
              <>
                <button
                  onClick={onDuplicate}
                  className="text-gray-500 hover:text-gray-700"
                  title="Duplicate"
                >
                  📋
                </button>
                <button
                  onClick={onEdit}
                  className="text-blue-600 hover:text-blue-800"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={onDelete}
                  className="text-red-600 hover:text-red-800"
                  title="Delete"
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Display */}
        <div className="border border-gray-200 rounded">
          {isPreview ? (
            <div className="p-4">
              <div className="bg-gray-50 border-b px-3 py-2 text-sm font-medium text-gray-700">
                Preview Output
              </div>
              <div className="p-3 bg-gray-900 text-green-400 font-mono text-sm">
                <div className="whitespace-pre-wrap">
                  # This would show the actual execution output
                  # For now, showing the code content:
                  {notebook.content}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-gray-50 border-b px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {language?.label} Code
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(notebook.content)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <SyntaxHighlighter
                  language={notebook.language === 'shell' ? 'bash' : notebook.language}
                  style={tomorrow}
                  customStyle={{ 
                    margin: 0, 
                    borderRadius: '0 0 6px 6px',
                    fontSize: '13px'
                  }}
                  showLineNumbers
                >
                  {notebook.content || '// No content yet'}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <div>
            Lines: {(notebook.content || '').split('\n').length} | 
            Characters: {(notebook.content || '').length}
          </div>
          <div>
            Created: {new Date(notebook.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  )
}

function NotebookEditor({ notebook, languages, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    title: '',
    language: 'python',
    description: '',
    content: '',
    order_index: 0,
    ...notebook
  })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('edit')

  useEffect(() => {
    // Set default content based on language when language changes
    if (!notebook.id && !formData.content) {
      const language = languages.find(lang => lang.value === formData.language)
      if (language?.example) {
        setFormData({ ...formData, content: language.example })
      }
    }
  }, [formData.language, languages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      await onSave(formData)
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setSaving(false)
    }
  }

  const insertTemplate = (template) => {
    const newContent = formData.content + '\n\n' + template
    setFormData({ ...formData, content: newContent })
  }

  const templates = {
    python: {
      function: 'def example_function():\n    """\n    Description of the function\n    """\n    pass\n\n',
      class: 'class ExampleClass:\n    """\n    Description of the class\n    """\n    \n    def __init__(self):\n        pass\n\n',
      import: 'import requests\nimport json\nfrom datetime import datetime\n\n'
    },
    javascript: {
      function: 'function exampleFunction() {\n    // Description of the function\n    return null;\n}\n\n',
      async: 'async function fetchData() {\n    try {\n        const response = await fetch("/api/data");\n        const data = await response.json();\n        return data;\n    } catch (error) {\n        console.error("Error:", error);\n    }\n}\n\n',
      class: 'class ExampleClass {\n    constructor() {\n        // Initialize the class\n    }\n    \n    method() {\n        // Example method\n    }\n}\n\n'
    },
    sql: {
      select: 'SELECT column1, column2\nFROM table_name\nWHERE condition = \'value\';\n\n',
      insert: 'INSERT INTO table_name (column1, column2)\nVALUES (\'value1\', \'value2\');\n\n',
      update: 'UPDATE table_name\nSET column1 = \'new_value\'\nWHERE condition = \'value\';\n\n'
    },
    bash: {
      script: '#!/bin/bash\n\n# Description of the script\n\necho "Starting script..."\n\n',
      function: 'function example_function() {\n    local param1="$1"\n    echo "Processing: $param1"\n}\n\n',
      loop: 'for item in "${items[@]}"; do\n    echo "Processing: $item"\ndone\n\n'
    }
  }

  const currentTemplates = templates[formData.language] || {}

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold mb-4">
              {notebook.id ? 'Edit Use Case Script' : 'Add Use Case Script'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <select
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  {languages.map(lang => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Brief description of what this script does..."
                />
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {/* Tabs */}
            <div className="border-b bg-gray-50 px-6">
              <nav className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'edit'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📝 Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'preview'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  👁️ Preview
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 flex">
              {activeTab === 'edit' ? (
                <div className="flex-1 flex">
                  {/* Editor */}
                  <div className="flex-1 flex flex-col">
                    <div className="p-4 border-b bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Code Editor</span>
                        <div className="flex space-x-2">
                          {Object.entries(currentTemplates).map(([key, template]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => insertTemplate(template)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                            >
                              + {key}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Write your code here..."
                      className="flex-1 p-4 border-none outline-none resize-none font-mono text-sm"
                      style={{ minHeight: '300px' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-4">
                  <div className="h-full border rounded overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 border-b">
                      <span className="text-sm font-medium text-gray-700">
                        Code Preview ({languages.find(l => l.value === formData.language)?.label})
                      </span>
                    </div>
                    <div className="overflow-auto" style={{ height: 'calc(100% - 40px)' }}>
                      <SyntaxHighlighter
                        language={formData.language === 'shell' ? 'bash' : formData.language}
                        style={oneLight}
                        showLineNumbers
                        customStyle={{ margin: 0, height: '100%' }}
                      >
                        {formData.content || '// No content yet'}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Script'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NotebookManager