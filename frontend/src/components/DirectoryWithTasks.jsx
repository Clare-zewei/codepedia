import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { marked } from 'marked'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'

function DirectoryWithTasks({ user }) {
  const [categories, setCategories] = useState([])
  const [functions, setFunctions] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [selectedFunction, setSelectedFunction] = useState(null)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [finalDocument, setFinalDocument] = useState(null)
  const [finalDocumentLoading, setFinalDocumentLoading] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateFunction, setShowCreateFunction] = useState(false)
  const [users, setUsers] = useState([])
  const [selectedCategoryForFunction, setSelectedCategoryForFunction] = useState(null)
  
  const [taskForm, setTaskForm] = useState({
    function_id: '',
    title: '',
    description: '',
    code_annotator_id: '',
    writer1_id: '',
    writer2_id: '',
    deadline: ''
  })
  
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    parent_id: ''
  })
  
  const [functionForm, setFunctionForm] = useState({
    name: '',
    description: '',
    category_id: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [categoriesRes, functionsRes, usersRes] = await Promise.all([
        axios.get('/categories'),
        axios.get('/functions'),
        axios.get('/users')
      ])
      setCategories(categoriesRes.data)
      setFunctions(functionsRes.data)
      setUsers(usersRes.data)
      
      // Auto-expand first few categories
      const firstCategories = categoriesRes.data.slice(0, 3).map(c => c.id)
      setExpandedCategories(new Set(firstCategories))
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTasksForFunction = async (functionId) => {
    setTasksLoading(true)
    try {
      const response = await axios.get('/wiki-tasks')
      const functionTasks = response.data.filter(task => task.function_id === functionId)
      setTasks(functionTasks)
      
      // 检查是否有已完成的任务，如果有则获取最终文档
      const completedTasks = functionTasks.filter(task => task.status === 'completed')
      if (completedTasks.length > 0) {
        fetchFinalDocument(functionId)
      } else {
        setFinalDocument(null)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setTasksLoading(false)
    }
  }

  const fetchFinalDocument = async (functionId) => {
    setFinalDocumentLoading(true)
    try {
      const response = await axios.get(`/voting-sessions/function/${functionId}/final-document`)
      setFinalDocument(response.data)
    } catch (error) {
      console.error('Error fetching final document:', error)
      if (error.response?.status !== 404) {
        console.error('Unexpected error:', error)
      }
      setFinalDocument(null)
    } finally {
      setFinalDocumentLoading(false)
    }
  }

  const handleFunctionClick = (func) => {
    setSelectedFunction(func)
    fetchTasksForFunction(func.id)
  }

  const toggleCategory = (categoryId) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const getFunctionsForCategory = (categoryId) => {
    return functions.filter(func => func.category_id === categoryId)
  }

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    try {
      // Clean up the form data - convert empty parent_id to null
      const cleanedData = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        parent_id: categoryForm.parent_id || null
      }
      
      await axios.post('/categories', cleanedData)
      setCategoryForm({ name: '', description: '', parent_id: '' })
      setShowCreateCategory(false)
      fetchData()
      alert('Category created successfully!')
    } catch (error) {
      console.error('Error creating category:', error)
      const errorMsg = error.response?.data?.errors 
        ? error.response.data.errors.map(err => err.msg).join(', ')
        : error.response?.data?.error || error.message
      alert('Error creating category: ' + errorMsg)
    }
  }
  
  const handleCreateFunction = async (e) => {
    e.preventDefault()
    try {
      // Clean up the form data
      const cleanedData = {
        name: functionForm.name.trim(),
        description: functionForm.description.trim(),
        category_id: functionForm.category_id
      }
      
      await axios.post('/functions', cleanedData)
      setFunctionForm({ name: '', description: '', category_id: '' })
      setShowCreateFunction(false)
      setSelectedCategoryForFunction(null)
      fetchData()
      alert('Function created successfully!')
    } catch (error) {
      console.error('Error creating function:', error)
      const errorMsg = error.response?.data?.errors 
        ? error.response.data.errors.map(err => err.msg).join(', ')
        : error.response?.data?.error || error.message
      alert('Error creating function: ' + errorMsg)
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/wiki-tasks', {
        ...taskForm,
        function_id: selectedFunction.id,
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
      fetchTasksForFunction(selectedFunction.id)
      alert('Task created successfully!')
    } catch (error) {
      console.error('Error creating task:', error)
      alert('Error creating task: ' + (error.response?.data?.error || error.message))
    }
  }
  
  const openCreateFunctionForCategory = (categoryId) => {
    setFunctionForm(prev => ({ ...prev, category_id: categoryId }))
    setSelectedCategoryForFunction(categories.find(c => c.id === categoryId))
    setShowCreateFunction(true)
  }
  
  // Helper function to flatten categories for select options
  const flattenCategories = (cats, level = 0) => {
    let result = []
    cats.forEach(cat => {
      result.push({ ...cat, level })
      if (cat.children && cat.children.length > 0) {
        result = result.concat(flattenCategories(cat.children, level + 1))
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

  const renderMarkdown = (content) => {
    try {
      const html = marked(content || '')
      return { __html: html }
    } catch (error) {
      return { __html: '<p>内容渲染失败</p>' }
    }
  }

  const CategoryNode = ({ category, level = 0 }) => {
    const isExpanded = expandedCategories.has(category.id)
    const hasChildren = category.children && category.children.length > 0
    const categoryFunctions = getFunctionsForCategory(category.id)
    const hasFunctions = categoryFunctions.length > 0

    return (
      <div className="select-none">
        <div 
          className={`group flex items-center py-1.5 px-2 hover:bg-gray-100 rounded text-sm`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          <div 
            className="flex items-center flex-1 cursor-pointer"
            onClick={() => toggleCategory(category.id)}
          >
            {(hasChildren || hasFunctions) && (
              <span className="mr-1.5 text-gray-500 text-xs">
                {isExpanded ? '▼' : '▶'}
              </span>
            )}
            {!hasChildren && !hasFunctions && (
              <span className="mr-1.5 text-gray-400 text-xs">•</span>
            )}
            <span className="font-medium text-gray-800">{category.name}</span>
            {hasFunctions && (
              <span className="ml-2 text-xs text-gray-500">
                ({categoryFunctions.length})
              </span>
            )}
          </div>
          {user.role === 'admin' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                openCreateFunctionForCategory(category.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 text-xs px-1"
              title="Add Function"
            >
              +
            </button>
          )}
        </div>

        {isExpanded && (
          <div>
            {/* Render functions */}
            {hasFunctions && (
              <div>
                {categoryFunctions.map(func => (
                  <div 
                    key={func.id}
                    className={`flex items-center py-1.5 px-2 hover:bg-blue-50 cursor-pointer text-sm ${
                      selectedFunction?.id === func.id ? 'bg-blue-100' : ''
                    }`}
                    style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                    onClick={() => handleFunctionClick(func)}
                  >
                    <span className="mr-1.5 text-blue-500 text-xs">⚙</span>
                    <span className="text-gray-700">{func.name}</span>
                    {func.task_count > 0 && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                        {func.task_count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Render child categories */}
            {hasChildren && (
              <div>
                {category.children.map(child => (
                  <CategoryNode key={child.id} category={child} level={level + 1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-8">Loading directory and tasks...</div>
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Directory & Tasks</h1>
        <p className="text-gray-600 mt-1">Browse functions and manage wiki tasks</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Directory Tree */}
        <div className="w-80 bg-gray-50 border-r overflow-y-auto">
          <div className="p-4 border-b bg-white">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-gray-900">Categories</h2>
              <div className="flex space-x-1">
                <button
                  onClick={() => setExpandedCategories(new Set(categories.map(c => c.id)))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                  title="Expand All"
                >
                  ▼
                </button>
                <button
                  onClick={() => setExpandedCategories(new Set())}
                  className="text-xs text-gray-600 hover:text-gray-800"
                  title="Collapse All"
                >
                  ▶
                </button>
              </div>
            </div>
            {user.role === 'admin' && (
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowCreateCategory(true)}
                  className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                >
                  + New Category
                </button>
                <button
                  onClick={() => setShowCreateFunction(true)}
                  className="flex-1 bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"
                >
                  + New Function
                </button>
              </div>
            )}
          </div>
          
          <div className="p-2">
            {categories.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No categories found
              </div>
            ) : (
              <div className="space-y-0.5">
                {categories.map(category => (
                  <CategoryNode key={category.id} category={category} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Content - Tasks */}
        <div className="flex-1 overflow-y-auto bg-white">
          {selectedFunction ? (
            <div className="p-6">
              {/* Function Header */}
              <div className="mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selectedFunction.name}</h2>
                    {selectedFunction.description && (
                      <p className="text-gray-600 mt-1">{selectedFunction.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-2">
                      Category: {selectedFunction.category_name}
                    </p>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => {
                        setTaskForm(prev => ({ ...prev, function_id: selectedFunction.id }))
                        setShowCreateTask(true)
                      }}
                      className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                    >
                      Create Task
                    </button>
                  )}
                </div>
              </div>

              {/* Final Document Section - Show first if available */}
              {finalDocument && (
                <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-green-800 mb-2">
                      📚 已完成文档
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm text-green-700">
                      <div>
                        <span className="font-medium">文档作者: </span>
                        <span>{finalDocument.final_document.author_name}</span>
                      </div>
                      <div>
                        <span className="font-medium">代码标注者: </span>
                        <span>{finalDocument.task.code_annotator_name}</span>
                      </div>
                      <div>
                        <span className="font-medium">协作撰写者: </span>
                        <span>
                          {[finalDocument.task.writer1_name, finalDocument.task.writer2_name]
                            .filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">完成时间: </span>
                        <span>{new Date(finalDocument.task.completed_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <FinalDocumentTabs 
                    document={finalDocument} 
                    renderMarkdown={renderMarkdown}
                  />
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">
                  Wiki Tasks ({tasks.length})
                  {finalDocument && (
                    <span className="ml-2 text-sm text-green-600">
                      ✅ 有已完成版本
                    </span>
                  )}
                </h3>
                
                {tasksLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading tasks...</div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No tasks found for this function.</p>
                    {user.role === 'admin' && (
                      <button
                        onClick={() => setShowCreateTask(true)}
                        className="mt-4 text-purple-600 hover:text-purple-800"
                      >
                        Create the first task
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {tasks.map(task => (
                      <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <Link
                              to={`/wiki-tasks/${task.id}`}
                              className="text-lg font-medium text-blue-600 hover:text-blue-800"
                            >
                              {task.title}
                            </Link>
                            {task.description && (
                              <p className="text-gray-600 mt-1">{task.description}</p>
                            )}
                            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Code Annotator: </span>
                                <span className="text-gray-700">{task.code_annotator_username || 'Not assigned'}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Writers: </span>
                                <span className="text-gray-700">
                                  {[task.writer1_username, task.writer2_username].filter(Boolean).join(', ') || 'Not assigned'}
                                </span>
                              </div>
                              {task.deadline && (
                                <div>
                                  <span className="text-gray-500">Deadline: </span>
                                  <span className={new Date(task.deadline) < new Date() ? 'text-red-600' : 'text-gray-700'}>
                                    {new Date(task.deadline).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-gray-500">Created: </span>
                                <span className="text-gray-700">
                                  {new Date(task.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="ml-4 flex flex-col items-end space-y-2">
                            <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(task.status)}`}>
                              {task.status.replace('_', ' ')}
                            </span>
                            <div className="flex space-x-3 text-xs text-gray-500">
                              <span>📝 {task.submission_count || 0}</span>
                              <span>🗳️ {task.vote_count || 0}</span>
                            </div>
                            {task.status === 'pending_vote' && (
                              <Link
                                to={`/wiki-votes/${task.id}`}
                                className="text-yellow-600 hover:text-yellow-800 text-sm"
                              >
                                View Voting
                              </Link>
                            )}
                            {(user.role === 'admin' || user.id === task.writer1_id || user.id === task.writer2_id) && (
                              <Link
                                to={`/content-editor/${task.id}`}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                📝 Edit Content
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg">Select a function from the directory</p>
                <p className="text-sm mt-2">Click on any function to view its wiki tasks</p>
              </div>
            </div>
          )}
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
                <label className="block text-sm font-medium text-gray-700">Parent Category (Optional)</label>
                <select
                  value={categoryForm.parent_id}
                  onChange={(e) => setCategoryForm(prev => ({...prev, parent_id: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">No parent (root category)</option>
                  {flattenCategories(categories).map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {'　'.repeat(cat.level)}{cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  Create Category
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
            {selectedCategoryForFunction && (
              <p className="text-sm text-gray-600 mb-4">
                Category: <strong>{selectedCategoryForFunction.name}</strong>
              </p>
            )}
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

              {!selectedCategoryForFunction && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={functionForm.category_id}
                    onChange={(e) => setFunctionForm(prev => ({...prev, category_id: e.target.value}))}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  >
                    <option value="">Select Category</option>
                    {flattenCategories(categories).map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {'　'.repeat(cat.level)}{cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex space-x-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
                >
                  Create Function
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateFunction(false)
                    setSelectedCategoryForFunction(null)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTask && selectedFunction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Wiki Task</h3>
            <p className="text-sm text-gray-600 mb-4">
              Function: <strong>{selectedFunction.name}</strong>
            </p>
            <form onSubmit={handleCreateTask} className="space-y-4">
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

// 最终文档标签页组件
function FinalDocumentTabs({ document, renderMarkdown }) {
  const [activeTab, setActiveTab] = useState('document')

  const tabs = [
    { id: 'document', label: '📄 文档内容', icon: '📄' },
    { id: 'api', label: '🔗 API 配置', icon: '🔗' },
    { id: 'notebooks', label: '📓 用例脚本', icon: '📓' }
  ]

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-green-300 mb-4">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-green-500 text-green-700'
                  : 'border-transparent text-green-600 hover:text-green-800 hover:border-green-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded border border-green-200 p-4 max-h-96 overflow-y-auto">
        {activeTab === 'document' && (
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-900">
              {document.final_document.title}
            </h4>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={renderMarkdown(document.final_document.content)} 
            />
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">API 测试配置</h4>
            {document.api_configs.length === 0 ? (
              <p className="text-gray-500 text-sm">暂无 API 配置</p>
            ) : (
              document.api_configs.map(config => (
                <div key={config.id} className="border border-gray-200 rounded p-3">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`px-2 py-1 text-xs rounded font-medium ${
                      config.method === 'GET' ? 'bg-green-100 text-green-800' :
                      config.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                      config.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                      config.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {config.method}
                    </span>
                    <span className="font-medium">{config.name}</span>
                  </div>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded block">
                    {config.endpoint}
                  </code>
                  {config.description && (
                    <p className="text-sm text-gray-600 mt-1">{config.description}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'notebooks' && (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">用例脚本</h4>
            {document.notebooks.length === 0 ? (
              <p className="text-gray-500 text-sm">暂无用例脚本</p>
            ) : (
              document.notebooks.map(notebook => (
                <div key={notebook.id} className="border border-gray-200 rounded">
                  <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="font-medium">{notebook.title}</span>
                    <span className="text-xs text-gray-500 uppercase">
                      {notebook.language}
                    </span>
                  </div>
                  <div className="p-0">
                    <SyntaxHighlighter
                      language={notebook.language === 'shell' ? 'bash' : notebook.language}
                      style={tomorrow}
                      customStyle={{ 
                        margin: 0, 
                        borderRadius: '0 0 6px 6px',
                        fontSize: '13px',
                        maxHeight: '200px'
                      }}
                    >
                      {notebook.content || '// 暂无内容'}
                    </SyntaxHighlighter>
                  </div>
                  {notebook.description && (
                    <div className="px-3 py-2 border-t bg-gray-50">
                      <p className="text-sm text-gray-600">{notebook.description}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DirectoryWithTasks