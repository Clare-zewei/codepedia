import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function DirectoryTree({ user }) {
  const [categories, setCategories] = useState([])
  const [functions, setFunctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState(new Set())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [categoriesRes, functionsRes] = await Promise.all([
        axios.get('/categories'),
        axios.get('/functions')
      ])
      setCategories(categoriesRes.data)
      setFunctions(functionsRes.data)
    } catch (error) {
      console.error('Error fetching directory data:', error)
    } finally {
      setLoading(false)
    }
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

  const CategoryNode = ({ category, level = 0 }) => {
    const isExpanded = expandedCategories.has(category.id)
    const hasChildren = category.children && category.children.length > 0
    const categoryFunctions = getFunctionsForCategory(category.id)
    const hasFunctions = categoryFunctions.length > 0

    return (
      <div className="select-none">
        <div 
          className={`flex items-center py-2 px-2 hover:bg-gray-100 rounded cursor-pointer`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => toggleCategory(category.id)}
        >
          {(hasChildren || hasFunctions) && (
            <span className="mr-2 text-gray-500 text-sm">
              {isExpanded ? '📂' : '📁'}
            </span>
          )}
          {!hasChildren && !hasFunctions && (
            <span className="mr-2 text-gray-400 text-sm">📄</span>
          )}
          <span className="font-medium text-gray-800">{category.name}</span>
          {category.description && (
            <span className="ml-2 text-xs text-gray-500">- {category.description}</span>
          )}
          <div className="ml-auto flex space-x-2 text-xs">
            {hasFunctions && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {categoryFunctions.length} functions
              </span>
            )}
            {hasChildren && (
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {category.children.length} subcategories
              </span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div>
            {/* Render functions first */}
            {hasFunctions && (
              <div className="mt-1">
                {categoryFunctions.map(func => (
                  <div 
                    key={func.id}
                    className="flex items-center py-2 px-2 hover:bg-blue-50 rounded"
                    style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}
                  >
                    <span className="mr-2 text-blue-500 text-sm">⚙️</span>
                    <span className="font-medium text-gray-700">{func.name}</span>
                    {func.description && (
                      <span className="ml-2 text-xs text-gray-500">- {func.description}</span>
                    )}
                    <div className="ml-auto flex space-x-2 text-xs">
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                        {func.task_count || 0} tasks
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Then render child categories */}
            {hasChildren && (
              <div className="mt-1">
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
    return <div className="text-center py-8">Loading directory structure...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Directory Structure</h1>
          <p className="text-gray-600 mt-1">Browse categories and functions</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setExpandedCategories(new Set(categories.map(c => c.id)))}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedCategories(new Set())}
            className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">{categories.length}</div>
          <div className="text-sm text-gray-600">Total Categories</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">{functions.length}</div>
          <div className="text-sm text-gray-600">Total Functions</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-purple-600">
            {categories.filter(c => !c.parent_id).length}
          </div>
          <div className="text-sm text-gray-600">Root Categories</div>
        </div>
      </div>

      {/* Directory Tree */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Categories & Functions</h2>
        </div>
        <div className="p-4">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No categories found. Create your first category to get started.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {categories.map(category => (
                <CategoryNode key={category.id} category={category} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="font-medium text-gray-900 mb-2">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center">
            <span className="mr-2">📁</span>
            <span>Category (collapsed)</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">📂</span>
            <span>Category (expanded)</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">⚙️</span>
            <span>Function</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">📄</span>
            <span>Empty category</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DirectoryTree