import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

function VotingResults({ user }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [votingSession, setVotingSession] = useState(null)
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (sessionId) {
      fetchVotingResults()
    }
  }, [sessionId])

  const fetchVotingResults = async () => {
    try {
      setLoading(true)
      const [sessionRes, statsRes] = await Promise.all([
        axios.get(`/voting-sessions/${sessionId}`),
        axios.get(`/votes/session/${sessionId}/statistics`)
      ])

      setVotingSession(sessionRes.data)
      setStatistics(statsRes.data.statistics)
    } catch (error) {
      console.error('Error fetching voting results:', error)
      if (error.response?.status === 404) {
        alert('投票会话不存在')
        navigate('/voting-manager')
      }
    } finally {
      setLoading(false)
    }
  }

  const getWinnerInfo = () => {
    if (!statistics) return null

    const { candidates, none_satisfied } = statistics
    
    // 找到票数最多的选项
    let maxVotes = none_satisfied.vote_count
    let winner = { type: 'none_satisfied', ...none_satisfied }

    candidates.forEach(candidate => {
      if (candidate.vote_count > maxVotes) {
        maxVotes = candidate.vote_count
        winner = { type: 'candidate', ...candidate }
      }
    })

    return winner
  }

  const calculatePercentage = (votes, total) => {
    if (total === 0) return 0
    return Math.round((votes / total) * 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载投票结果...</p>
        </div>
      </div>
    )
  }

  if (!votingSession || !statistics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-4xl mb-4">📊</div>
          <p className="text-gray-600">投票结果不可用</p>
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

  const winner = getWinnerInfo()
  const totalVotes = statistics.total_votes

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📊 投票结果</h1>
              <p className="text-sm text-gray-600">{votingSession.title}</p>
            </div>
            
            <button
              onClick={() => navigate('/voting-manager')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200"
            >
              ← 返回投票管理
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{totalVotes}</div>
                <div className="text-sm text-gray-600">总投票数</div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {new Date(votingSession.started_at).toLocaleDateString()} - {new Date(votingSession.ended_at).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-600">投票时间</div>
              </div>
              
              <div className="text-center">
                <div className={`text-lg font-semibold ${
                  winner?.type === 'none_satisfied' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {winner?.type === 'none_satisfied' ? '都不满意' : `${winner?.author_name} 获胜`}
                </div>
                <div className="text-sm text-gray-600">投票结果</div>
              </div>
            </div>
          </div>

          {/* Winner Announcement */}
          <div className={`rounded-lg border p-6 ${
            winner?.type === 'none_satisfied' 
              ? 'bg-red-50 border-red-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="text-center">
              <div className="text-4xl mb-4">
                {winner?.type === 'none_satisfied' ? '❌' : '🏆'}
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${
                winner?.type === 'none_satisfied' ? 'text-red-800' : 'text-green-800'
              }`}>
                {winner?.type === 'none_satisfied' 
                  ? '投票结果：都不满意' 
                  : `获胜者：${winner?.author_name}`
                }
              </h2>
              <p className={`text-lg ${
                winner?.type === 'none_satisfied' ? 'text-red-700' : 'text-green-700'
              }`}>
                获得 {winner?.vote_count} 票 ({calculatePercentage(winner?.vote_count, totalVotes)}%)
              </p>
              
              {winner?.type === 'none_satisfied' && (
                <div className="mt-4 p-3 bg-orange-100 border border-orange-300 rounded">
                  <p className="text-orange-800 text-sm">
                    ⚠️ 由于投票结果为"都不满意"，此任务将进入重新分配流程
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Results */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">详细投票结果</h3>
            
            <div className="space-y-4">
              {/* Candidate Results */}
              {statistics.candidates.map((candidate, index) => (
                <div key={candidate.id} className="border border-gray-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white ${
                        candidate.is_winner ? 'bg-green-500' : 'bg-gray-400'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{candidate.author_name}</h4>
                        <p className="text-sm text-gray-600">版本{String.fromCharCode(65 + index)}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{candidate.vote_count}</div>
                      <div className="text-sm text-gray-600">
                        {calculatePercentage(candidate.vote_count, totalVotes)}%
                      </div>
                    </div>
                  </div>
                  
                  {/* Vote Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div 
                      className={`h-2 rounded-full ${
                        candidate.is_winner ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ 
                        width: `${calculatePercentage(candidate.vote_count, totalVotes)}%` 
                      }}
                    />
                  </div>
                  
                  {/* Voters List (Admin Only) */}
                  {user.role === 'admin' && candidate.voters.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                        查看投票者 ({candidate.voters.length} 人)
                      </summary>
                      <div className="mt-2 text-sm text-gray-600">
                        {candidate.voters.join(', ')}
                      </div>
                    </details>
                  )}
                </div>
              ))}

              {/* None Satisfied Result */}
              <div className="border border-red-200 rounded p-4 bg-red-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white bg-red-500">
                      ❌
                    </div>
                    <div>
                      <h4 className="font-medium text-red-800">都不满意</h4>
                      <p className="text-sm text-red-600">拒绝所有版本</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-600">{statistics.none_satisfied.vote_count}</div>
                    <div className="text-sm text-red-600">
                      {calculatePercentage(statistics.none_satisfied.vote_count, totalVotes)}%
                    </div>
                  </div>
                </div>
                
                {/* Vote Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div 
                    className="bg-red-500 h-2 rounded-full"
                    style={{ 
                      width: `${calculatePercentage(statistics.none_satisfied.vote_count, totalVotes)}%` 
                    }}
                  />
                </div>
                
                {/* Voters List (Admin Only) */}
                {user.role === 'admin' && statistics.none_satisfied.voters.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800">
                      查看投票者 ({statistics.none_satisfied.voters.length} 人)
                    </summary>
                    <div className="mt-2 text-sm text-red-600">
                      {statistics.none_satisfied.voters.join(', ')}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>

          {/* Voting Participation */}
          {user.role === 'admin' && statistics.pending_voters.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">未参与投票用户</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-yellow-800 text-sm mb-2">
                  以下用户未参与投票（共 {statistics.pending_voters.length} 人）：
                </p>
                <div className="text-sm text-yellow-700">
                  {statistics.pending_voters.join(', ')}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center space-x-4">
            {winner?.type === 'none_satisfied' && user.role === 'admin' && (
              <button
                onClick={() => navigate('/task-reassignments')}
                className="bg-orange-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-700"
              >
                🔄 前往重新分配任务
              </button>
            )}
            
            <button
              onClick={() => navigate(`/voting/${sessionId}`)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              👁️ 查看投票内容
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VotingResults