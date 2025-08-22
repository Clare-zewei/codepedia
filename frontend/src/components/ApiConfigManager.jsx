import { useState, useEffect } from 'react'
import axios from 'axios'

function ApiConfigManager({ document, isSubmitted }) {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [environments, setEnvironments] = useState([
    { name: 'Development', baseUrl: 'http://localhost:3000' },
    { name: 'Staging', baseUrl: 'https://staging-api.example.com' },
    { name: 'Production', baseUrl: 'https://api.example.com' }
  ])
  const [selectedEnv, setSelectedEnv] = useState(0)

  useEffect(() => {
    if (document?.id) {
      fetchConfigs()
    }
  }, [document])

  const fetchConfigs = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`/entry-api-configs/document/${document.id}`)
      setConfigs(response.data)
    } catch (error) {
      console.error('Error fetching API configs:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async (configData) => {
    try {
      // Transform frontend data to backend format
      const backendData = {
        name: configData.name,
        method: configData.method,
        endpoint: configData.endpoint,
        description: configData.description,
        expected_status: parseInt(configData.expected_status) || 200,
        order_index: configData.order_index || 0
      }

      // Parse headers from JSON string to object
      try {
        backendData.headers = configData.headers ? JSON.parse(configData.headers) : {}
      } catch (e) {
        backendData.headers = {}
      }

      // Handle body content for POST/PUT/PATCH requests
      if (['POST', 'PUT', 'PATCH'].includes(configData.method)) {
        backendData.body_type = 'json'
        backendData.body_content = configData.body || ''
      }

      let response
      if (configData.id) {
        response = await axios.put(`/entry-api-configs/${configData.id}`, backendData)
      } else {
        response = await axios.post('/entry-api-configs', {
          ...backendData,
          document_id: document.id
        })
      }
      
      await fetchConfigs()
      setEditingConfig(null)
      return response.data
    } catch (error) {
      console.error('Error saving config:', error)
      throw error
    }
  }

  const deleteConfig = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this API configuration?')) {
      return
    }

    try {
      await axios.delete(`/entry-api-configs/${configId}`)
      await fetchConfigs()
    } catch (error) {
      console.error('Error deleting config:', error)
    }
  }

  const testApi = async (config) => {
    try {
      setTestResults({ ...testResults, [config.id]: { loading: true } })
      
      const env = environments[selectedEnv]
      const fullUrl = `${env.baseUrl}${config.endpoint}`
      
      const headers = {}
      if (config.headers) {
        try {
          Object.assign(headers, JSON.parse(config.headers))
        } catch (e) {
          console.warn('Invalid headers JSON:', config.headers)
        }
      }

      const requestConfig = {
        method: config.method.toLowerCase(),
        url: fullUrl,
        headers,
        timeout: 10000
      }

      if (config.body && ['post', 'put', 'patch'].includes(config.method.toLowerCase())) {
        try {
          requestConfig.data = JSON.parse(config.body)
        } catch (e) {
          requestConfig.data = config.body
        }
      }

      const startTime = Date.now()
      const response = await axios(requestConfig)
      const responseTime = Date.now() - startTime

      setTestResults({
        ...testResults,
        [config.id]: {
          success: true,
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          responseTime,
          headers: response.headers,
          expectedMatch: response.status === parseInt(config.expected_status)
        }
      })
    } catch (error) {
      const responseTime = Date.now() - Date.now()
      setTestResults({
        ...testResults,
        [config.id]: {
          success: false,
          status: error.response?.status || 0,
          statusText: error.response?.statusText || error.message,
          data: error.response?.data || error.message,
          responseTime,
          expectedMatch: false,
          error: true
        }
      })
    }
  }

  const duplicateConfig = (config) => {
    const newConfig = {
      ...config,
      id: undefined,
      name: `${config.name} (Copy)`,
      order_index: configs.length
    }
    setEditingConfig(newConfig)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="api-config-manager h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Test Configuration</h2>
            <p className="text-sm text-gray-600">Configure and test API endpoints</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Environment Selector */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Environment:</label>
              <select
                value={selectedEnv}
                onChange={(e) => setSelectedEnv(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                {environments.map((env, index) => (
                  <option key={index} value={index}>{env.name}</option>
                ))}
              </select>
            </div>

            {!isSubmitted && (
              <button
                onClick={() => setEditingConfig({})}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                + Add Configuration
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Config List */}
      <div className="flex-1 overflow-y-auto">
        {configs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">🔗</div>
            <p className="text-gray-600">No API configurations yet</p>
            {!isSubmitted && (
              <button
                onClick={() => setEditingConfig({})}
                className="mt-4 text-blue-600 hover:text-blue-800"
              >
                Create your first API configuration
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {configs.map(config => (
              <ConfigCard
                key={config.id}
                config={config}
                environment={environments[selectedEnv]}
                testResult={testResults[config.id]}
                onEdit={() => setEditingConfig(config)}
                onDelete={() => deleteConfig(config.id)}
                onTest={() => testApi(config)}
                onDuplicate={() => duplicateConfig(config)}
                isSubmitted={isSubmitted}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editingConfig && (
        <ConfigEditor
          config={editingConfig}
          onSave={saveConfig}
          onCancel={() => setEditingConfig(null)}
        />
      )}
    </div>
  )
}

function ConfigCard({ config, environment, testResult, onEdit, onDelete, onTest, onDuplicate, isSubmitted }) {
  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-50'
    if (status >= 400) return 'text-red-600 bg-red-50'
    return 'text-yellow-600 bg-yellow-50'
  }

  const getMethodColor = (method) => {
    const colors = {
      GET: 'bg-green-100 text-green-800',
      POST: 'bg-blue-100 text-blue-800',
      PUT: 'bg-yellow-100 text-yellow-800',
      DELETE: 'bg-red-100 text-red-800',
      PATCH: 'bg-purple-100 text-purple-800'
    }
    return colors[method] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getMethodColor(config.method)}`}>
                {config.method}
              </span>
              <h3 className="font-medium text-gray-900">{config.name}</h3>
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              <code className="bg-gray-100 px-2 py-1 rounded">
                {environment.baseUrl}{config.endpoint}
              </code>
            </div>
            
            {config.description && (
              <p className="text-sm text-gray-600">{config.description}</p>
            )}
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            {testResult && !testResult.loading && (
              <span className={`px-2 py-1 rounded text-xs ${getStatusColor(testResult.status)}`}>
                {testResult.status} ({testResult.responseTime}ms)
              </span>
            )}
            
            <button
              onClick={onTest}
              disabled={testResult?.loading}
              className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
            >
              {testResult?.loading ? 'Testing...' : 'Test'}
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

        {/* Test Results */}
        {testResult && !testResult.loading && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Response:</span>
              <div className="flex items-center space-x-2">
                {testResult.expectedMatch ? (
                  <span className="text-green-600 text-sm">✅ Expected</span>
                ) : (
                  <span className="text-red-600 text-sm">❌ Unexpected</span>
                )}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded p-3 text-sm">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigEditor({ config, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    method: 'GET',
    endpoint: '',
    description: '',
    headers: '{\n  "Content-Type": "application/json"\n}',
    body: '{\n  \n}',
    expected_status: '200',
    order_index: 0,
    ...config
  })
  const [saving, setSaving] = useState(false)

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

  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <h3 className="text-lg font-semibold mb-6">
            {config.id ? 'Edit API Configuration' : 'Add API Configuration'}
          </h3>

          <div className="grid grid-cols-1 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>

            {/* Method and Endpoint */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  {methods.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
                <input
                  type="text"
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  placeholder="/api/users"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>

            {/* Headers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Headers (JSON)</label>
              <textarea
                value={formData.headers}
                onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
              />
            </div>

            {/* Body */}
            {['POST', 'PUT', 'PATCH'].includes(formData.method) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (JSON)</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  rows={6}
                  className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                />
              </div>
            )}

            {/* Expected Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Status Code</label>
              <input
                type="number"
                value={formData.expected_status}
                onChange={(e) => setFormData({ ...formData, expected_status: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
                min="100"
                max="599"
                required
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
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
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ApiConfigManager