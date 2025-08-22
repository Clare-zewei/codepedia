import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { marked } from 'marked'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'

function VotingInterface({ user }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [votingSession, setVotingSession] = useState(null)
  const [candidatesContent, setCandidatesContent] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedChoice, setSelectedChoice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('document')

  useEffect(() => {
    if (sessionId) {
      fetchVotingData()
    }
  }, [sessionId])

  const fetchVotingData = async () => {
    try {
      setLoading(true)
      const [sessionRes, contentRes] = await Promise.all([
        axios.get(`/voting-sessions/${sessionId}`),
        axios.get(`/document-votes/session/${sessionId}/candidates-content`)
      ])

      setVotingSession(sessionRes.data)
      setCandidatesContent(contentRes.data.candidates)

      // 如果用户已投票，设置选择状态
      if (sessionRes.data.user_vote) {
        if (sessionRes.data.user_vote.choice_type === 'none_satisfied') {
          setSelectedChoice('none_satisfied')
        } else {
          setSelectedChoice(sessionRes.data.user_vote.candidate_id)
        }
      }
    } catch (error) {
      console.error('Error fetching voting data:', error)
      if (error.response?.status === 404) {
        alert('投票会话不存在')
        navigate('/voting-manager')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitVote = async () => {
    if (!selectedChoice) {
      alert('请选择一个选项')
      return
    }

    if (!window.confirm('确认提交投票？提交后无法修改。')) {
      return
    }

    try {
      setSubmitting(true)
      
      const voteData = {
        voting_session_id: sessionId,
        choice_type: selectedChoice === 'none_satisfied' ? 'none_satisfied' : 'candidate',
        candidate_id: selectedChoice === 'none_satisfied' ? null : selectedChoice
      }

      await axios.post('/document-votes', voteData)
      
      alert('投票提交成功！')
      await fetchVotingData() // 刷新数据显示投票状态
    } catch (error) {
      console.error('Error submitting vote:', error)
      alert('投票提交失败：' + (error.response?.data?.error || error.message))
    } finally {
      setSubmitting(false)
    }
  }

  const renderMarkdown = (content) => {
    try {
      const html = marked(content || '')
      return { __html: html }
    } catch (error) {
      return { __html: '<p>内容渲染失败</p>' }
    }
  }

  const getTabLabel = (tabId) => {
    const labels = {
      document: '📄 文档内容',
      api: '🔗 API 配置',
      notebooks: '📓 用例脚本'
    }
    return labels[tabId] || tabId
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载投票内容...</p>
        </div>
      </div>
    )
  }

  if (!votingSession || candidatesContent.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-4xl mb-4">🗳️</div>
          <p className="text-gray-600">投票内容不可用</p>
          <button
            onClick={() => navigate('/voting-manager')}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            返回投票管理
          </button>
        </div>
      </div>
    )
  }

  const hasVoted = votingSession.user_vote !== null
  const isActive = votingSession.status === 'active'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{votingSession.title}</h1>
              <p className="text-sm text-gray-600">
                {votingSession.task_title} • 选择最佳文档版本
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 text-sm rounded-full ${
                isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {isActive ? '投票进行中' : '投票已结束'}
              </span>
              
              {hasVoted && (
                <span className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-800">
                  ✅ 已投票
                </span>
              )}
              
              <button
                onClick={() => navigate('/voting-manager')}
                className="text-gray-500 hover:text-gray-700"
              >
                ← 返回
              </button>
            </div>
          </div>

          {/* Content Type Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {['document', 'api', 'notebooks'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {getTabLabel(tab)}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Content Comparison */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {candidatesContent.map((candidate, index) => (
            <CandidatePanel
              key={candidate.id}
              candidate={candidate}
              index={index}
              activeTab={activeTab}
              renderMarkdown={renderMarkdown}
            />
          ))}
        </div>

        {/* Voting Section */}
        {isActive && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {hasVoted ? '您的投票' : '请选择您认为更好的版本'}
            </h3>
            
            <div className="space-y-3">
              {candidatesContent.map((candidate, index) => (
                <label
                  key={candidate.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                    selectedChoice === candidate.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  } ${hasVoted ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    value={candidate.id}
                    checked={selectedChoice === candidate.id}
                    onChange={(e) => setSelectedChoice(e.target.value)}
                    disabled={hasVoted}
                    className="mr-3"
                  />
                  <span className="font-medium">
                    选择版本{String.fromCharCode(65 + index)} ({candidate.author_name})
                  </span>
                </label>
              ))}
              
              <label
                className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                  selectedChoice === 'none_satisfied' 
                    ? 'border-red-500 bg-red-50' 
                    : 'border-gray-300 hover:border-gray-400'
                } ${hasVoted ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  value="none_satisfied"
                  checked={selectedChoice === 'none_satisfied'}
                  onChange={(e) => setSelectedChoice(e.target.value)}
                  disabled={hasVoted}
                  className="mr-3"
                />
                <span className="font-medium text-red-600">❌ 都不满意</span>
              </label>
            </div>

            {!hasVoted && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleSubmitVote}
                  disabled={!selectedChoice || submitting}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? '提交中...' : '🗳️ 提交投票'}
                </button>
              </div>
            )}

            {hasVoted && (
              <div className="mt-6 text-center">
                <p className="text-gray-600">
                  您已于 {new Date(votingSession.user_vote.voted_at).toLocaleString()} 投票
                </p>
              </div>
            )}
          </div>
        )}

        {!isActive && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-center">
              ⏰ 此投票已结束，无法继续投票
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CandidatePanel({ candidate, index, activeTab, renderMarkdown }) {
  const versionLabel = `版本${String.fromCharCode(65 + index)} (${candidate.author_name})`

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="bg-gray-50 px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">{versionLabel}</h3>
      </div>
      
      <div className="p-4">
        {activeTab === 'document' && (
          <div className="prose prose-sm max-w-none">
            <h4 className="text-lg font-semibold mb-2">{candidate.document.title}</h4>
            <div dangerouslySetInnerHTML={renderMarkdown(candidate.document.content)} />
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">API 测试配置</h4>
            {candidate.api_configs.length === 0 ? (
              <p className="text-gray-500 text-sm">暂无 API 配置</p>
            ) : (
              candidate.api_configs.map(config => (
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
            {candidate.notebooks.length === 0 ? (
              <p className="text-gray-500 text-sm">暂无用例脚本</p>
            ) : (
              candidate.notebooks.map(notebook => (
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
                        fontSize: '13px'
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

export default VotingInterface