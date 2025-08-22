import { useState, useEffect } from 'react'

function QualityChecker({ document, qualityResults, onRunCheck, isModal = false }) {
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (showHistory && document?.id) {
      fetchHistory()
    }
  }, [showHistory, document])

  const fetchHistory = async () => {
    try {
      const response = await fetch(`/quality-checks/document/${document.id}/history`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setHistory(data)
      }
    } catch (error) {
      console.error('Error fetching quality check history:', error)
    }
  }

  const handleRunCheck = async () => {
    setLoading(true)
    try {
      await onRunCheck()
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return '⚪'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return 'text-green-600 bg-green-50'
      case 'warning': return 'text-yellow-600 bg-yellow-50'
      case 'error': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getCategoryTitle = (type) => {
    const titles = {
      'document_title': 'Document Title',
      'content_length': 'Content Length',
      'document_structure': 'Document Structure',
      'code_examples': 'Code Examples',
      'api_coverage': 'API Coverage',
      'api_completeness': 'API Completeness',
      'notebook_coverage': 'Use Case Scripts',
      'notebook_quality': 'Script Quality',
      'api_integration': 'API Integration',
      'content_consistency': 'Content Consistency'
    }
    return titles[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const groupChecksByCategory = (checks) => {
    const categories = {
      'Documentation': ['document_title', 'content_length', 'document_structure', 'code_examples'],
      'API Testing': ['api_coverage', 'api_completeness'],
      'Use Cases': ['notebook_coverage', 'notebook_quality'],
      'Integration': ['api_integration', 'content_consistency']
    }

    const grouped = {}
    Object.entries(categories).forEach(([category, types]) => {
      grouped[category] = checks.filter(check => types.includes(check.check_type))
    })

    return grouped
  }

  return (
    <div className={`quality-checker ${isModal ? '' : 'h-full flex flex-col'}`}>
      {!isModal && (
        <div className="bg-white border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quality Check</h2>
              <p className="text-sm text-gray-600">Ensure content meets submission standards</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                📊 History
              </button>
              <button
                onClick={handleRunCheck}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Run Quality Check'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`${isModal ? '' : 'flex-1 overflow-y-auto'} p-4`}>
        {!qualityResults ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">✅</div>
            <p className="text-gray-600 mb-4">No quality check results yet</p>
            <button
              onClick={handleRunCheck}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Run First Quality Check'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Overall Score</h3>
                  <p className="text-sm text-gray-600">Based on all quality checks</p>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getScoreColor(qualityResults.overall_score)}`}>
                    {qualityResults.overall_score}/100
                  </div>
                  <div className="text-sm text-gray-600">
                    {qualityResults.can_submit ? (
                      <span className="text-green-600">✅ Ready to Submit</span>
                    ) : (
                      <span className="text-red-600">❌ Issues Found</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="text-green-600 text-2xl mr-3">✅</div>
                  <div>
                    <div className="text-green-800 font-semibold">
                      {qualityResults.passed?.length || 0} Passed
                    </div>
                    <div className="text-green-600 text-sm">All requirements met</div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="text-yellow-600 text-2xl mr-3">⚠️</div>
                  <div>
                    <div className="text-yellow-800 font-semibold">
                      {qualityResults.warnings?.length || 0} Warnings
                    </div>
                    <div className="text-yellow-600 text-sm">Improvements suggested</div>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="text-red-600 text-2xl mr-3">❌</div>
                  <div>
                    <div className="text-red-800 font-semibold">
                      {qualityResults.blocking_issues?.length || 0} Errors
                    </div>
                    <div className="text-red-600 text-sm">Must fix to submit</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Results by Category */}
            {qualityResults.checks && (
              <div className="space-y-4">
                {Object.entries(groupChecksByCategory(qualityResults.checks)).map(([category, checks]) => (
                  checks.length > 0 && (
                    <div key={category} className="bg-white border border-gray-200 rounded-lg">
                      <div className="px-4 py-3 border-b bg-gray-50">
                        <h4 className="font-medium text-gray-900">{category}</h4>
                      </div>
                      <div className="divide-y">
                        {checks.map((check, index) => (
                          <CheckItem key={index} check={check} />
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {/* Blocking Issues Alert */}
            {qualityResults.blocking_issues && qualityResults.blocking_issues.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="text-red-600 text-xl mr-3 mt-0.5">🚫</div>
                  <div className="flex-1">
                    <h4 className="text-red-800 font-semibold mb-2">Blocking Issues</h4>
                    <p className="text-red-700 text-sm mb-3">
                      The following issues prevent document submission and must be resolved:
                    </p>
                    <ul className="space-y-1">
                      {qualityResults.blocking_issues.map((issue, index) => (
                        <li key={index} className="text-red-700 text-sm">
                          • {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {qualityResults.warnings && qualityResults.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="text-yellow-600 text-xl mr-3 mt-0.5">💡</div>
                  <div className="flex-1">
                    <h4 className="text-yellow-800 font-semibold mb-2">Recommendations</h4>
                    <p className="text-yellow-700 text-sm mb-3">
                      Consider addressing these suggestions to improve content quality:
                    </p>
                    <ul className="space-y-1">
                      {qualityResults.warnings.map((warning, index) => (
                        <li key={index} className="text-yellow-700 text-sm">
                          • {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Quality Check History</h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                
                {history.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No previous quality checks</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((check, index) => (
                      <div key={index} className="border border-gray-200 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(check.status)}`}>
                            {getStatusIcon(check.status)} {getCategoryTitle(check.check_type)}
                          </span>
                          <div className="text-xs text-gray-500">
                            {new Date(check.checked_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-sm text-gray-700">{check.message}</div>
                        {check.score !== null && (
                          <div className="text-xs text-gray-500 mt-1">
                            Score: {check.score}/100
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckItem({ check }) {
  const [showDetails, setShowDetails] = useState(false)

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return '⚪'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return 'text-green-600'
      case 'warning': return 'text-yellow-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getCategoryTitle = (type) => {
    const titles = {
      'document_title': 'Document Title',
      'content_length': 'Content Length',
      'document_structure': 'Document Structure',
      'code_examples': 'Code Examples',
      'api_coverage': 'API Coverage',
      'api_completeness': 'API Completeness',
      'notebook_coverage': 'Use Case Scripts',
      'notebook_quality': 'Script Quality',
      'api_integration': 'API Integration',
      'content_consistency': 'Content Consistency'
    }
    return titles[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className={`text-lg ${getStatusColor(check.status)}`}>
            {getStatusIcon(check.status)}
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h5 className="font-medium text-gray-900">
                {getCategoryTitle(check.check_type)}
              </h5>
              {check.score !== null && (
                <span className="text-sm text-gray-500">
                  ({check.score}/100)
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{check.message}</p>
            
            {check.details && Object.keys(check.details).length > 0 && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-blue-600 hover:text-blue-800 mt-2"
              >
                {showDetails ? 'Hide Details' : 'Show Details'}
              </button>
            )}
            
            {showDetails && check.details && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QualityChecker