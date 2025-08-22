import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function VotingManager({ user }) {
  const [pendingTasks, setPendingTasks] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [completedSessions, setCompletedSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(user.role === 'admin' ? 'pending' : 'active')
  const [processingTaskId, setProcessingTaskId] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      if (user.role === 'admin') {
        // Admin view: get all voting sessions and pending tasks
        const [pendingRes, sessionsRes] = await Promise.all([
          axios.get('/voting-sessions/pending-tasks'),
          axios.get('/voting-sessions')
        ])

        setPendingTasks(pendingRes.data)
        
        const sessions = sessionsRes.data
        setActiveSessions(sessions.filter(s => s.status === 'active'))
        setCompletedSessions(sessions.filter(s => s.status === 'completed'))
      } else {
        // Regular user view: only get active voting sessions for participation
        const activeSessionsRes = await axios.get('/document-votes/active-sessions')
        setActiveSessions(activeSessionsRes.data)
        setPendingTasks([]) // Non-admin users don't see pending tasks
        setCompletedSessions([]) // Can add completed sessions later if needed
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartVoting = async (task) => {
    try {
      setProcessingTaskId(task.id)
      
      await axios.post('/voting-sessions', {
        task_id: task.id,
        title: `${task.title}文档投票`,
        description: `选择${task.function_name}功能的最佳文档版本`
      })

      await fetchData()
      alert('投票已成功发起！')
    } catch (error) {
      console.error('Error starting voting:', error)
      alert('发起投票失败：' + (error.response?.data?.error || error.message))
    } finally {
      setProcessingTaskId(null)
    }
  }

  const handleEndVoting = async (sessionId) => {
    if (!window.confirm('确定要结束这个投票吗？结束后将无法撤销。')) {
      return
    }

    try {
      const response = await axios.post(`/voting-sessions/${sessionId}/end`)
      await fetchData()
      
      const result = response.data.result
      if (result.is_none_satisfied_winner) {
        alert('投票已结束！结果为"都不满意"，任务将进入重新分配流程。')
      } else {
        alert('投票已结束！已选出获胜版本，任务已完成。')
      }
    } catch (error) {
      console.error('Error ending voting:', error)
      alert('结束投票失败：' + (error.response?.data?.error || error.message))
    }
  }

  const handleCancelVoting = async (sessionId) => {
    if (!window.confirm('确定要取消这个投票吗？投票将被取消，任务状态将恢复为待投票。')) {
      return
    }

    try {
      await axios.post(`/voting-sessions/${sessionId}/cancel`)
      await fetchData()
      alert('投票已取消！')
    } catch (error) {
      console.error('Error cancelling voting:', error)
      alert('取消投票失败：' + (error.response?.data?.error || error.message))
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-gray-100 text-gray-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载投票管理数据...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                🗳️ {user.role === 'admin' ? '投票管理' : '参与投票'}
              </h1>
              <p className="text-sm text-gray-600">
                {user.role === 'admin' ? '管理文档版本的投票表决' : '参与文档版本投票决策'}
              </p>
            </div>
            
            {user.role === 'admin' && (
              <Link
                to="/task-reassignments"
                className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700"
              >
                🔄 任务重新分配
              </Link>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {user.role === 'admin' ? [
                { id: 'pending', label: '待投票任务', icon: '📋', count: pendingTasks.length },
                { id: 'active', label: '进行中投票', icon: '🗳️', count: activeSessions.length },
                { id: 'completed', label: '已完成投票', icon: '✅', count: completedSessions.length }
              ] : [
                { id: 'active', label: '参与投票', icon: '🗳️', count: activeSessions.length }
              ]}.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'pending' && (
          <PendingTasksTab
            tasks={pendingTasks}
            onStartVoting={handleStartVoting}
            processingTaskId={processingTaskId}
          />
        )}

        {activeTab === 'active' && (
          <ActiveSessionsTab
            sessions={activeSessions}
            onEndVoting={handleEndVoting}
            onCancelVoting={handleCancelVoting}
            isAdmin={user.role === 'admin'}
          />
        )}

        {activeTab === 'completed' && (
          <CompletedSessionsTab sessions={completedSessions} />
        )}
      </div>
    </div>
  )
}

function PendingTasksTab({ tasks, onStartVoting, processingTaskId }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-4">📋</div>
        <p className="text-gray-600">暂无待投票的任务</p>
        <p className="text-sm text-gray-500 mt-2">当有两个作者都提交内容后，任务将出现在这里</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tasks.map(task => (
        <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{task.title}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                <div>
                  <span className="font-medium">功能：</span>
                  <span className="ml-1">{task.function_name}</span>
                </div>
                <div>
                  <span className="font-medium">分类：</span>
                  <span className="ml-1">{task.category_name}</span>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-medium text-gray-800 mb-2">候选版本：</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {task.submissions?.map((submission, index) => (
                    <div key={submission.id} className="border border-gray-200 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-blue-600">
                          版本{String.fromCharCode(65 + index)} ({submission.writer_name})
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(submission.submitted_at).toLocaleString()}
                        </span>
                      </div>
                      <Link
                        to={`/content-editor/${task.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        📄 查看内容
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ml-6 flex flex-col space-y-2">
              <button
                onClick={() => onStartVoting(task)}
                disabled={processingTaskId === task.id}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {processingTaskId === task.id ? '发起中...' : '🗳️ 发起投票'}
              </button>
              
              <Link
                to={`/wiki-tasks/${task.id}`}
                className="text-center bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200"
              >
                📋 查看任务
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ActiveSessionsTab({ sessions, onEndVoting, onCancelVoting, isAdmin = true }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-4">🗳️</div>
        <p className="text-gray-600">暂无进行中的投票</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessions.map(session => (
        <div key={session.id} className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                  进行中
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 mb-4">
                <div>
                  <span className="font-medium">任务：</span>
                  <span className="ml-1">{session.task_title}</span>
                </div>
                <div>
                  <span className="font-medium">开始时间：</span>
                  <span className="ml-1">{new Date(session.started_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="font-medium">参与情况：</span>
                  <span className="ml-1">已投票 {session.vote_count} 人</span>
                </div>
              </div>

              {session.none_satisfied_count > 0 && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                  <span className="text-yellow-800 text-sm">
                    ⚠️ 当前有 {session.none_satisfied_count} 人选择"都不满意"
                  </span>
                </div>
              )}
            </div>

            <div className="ml-6 flex flex-col space-y-2">
              <Link
                to={`/voting/${session.id}`}
                className="text-center bg-blue-100 text-blue-700 px-4 py-2 rounded text-sm hover:bg-blue-200"
              >
                {isAdmin ? '👁️ 查看投票' : '🗳️ 参与投票'}
              </Link>
              
              {isAdmin && (
                <>
                  <button
                    onClick={() => onEndVoting(session.id)}
                    className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                  >
                    ✅ 结束投票
                  </button>
                  
                  <button
                    onClick={() => onCancelVoting(session.id)}
                    className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600"
                  >
                    ❌ 取消投票
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CompletedSessionsTab({ sessions }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-4">✅</div>
        <p className="text-gray-600">暂无已完成的投票</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessions.map(session => (
        <div key={session.id} className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                  已完成
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                <div>
                  <span className="font-medium">投票时间：</span>
                  <span className="ml-1">
                    {new Date(session.started_at).toLocaleDateString()} - {new Date(session.ended_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="font-medium">总投票数：</span>
                  <span className="ml-1">{session.vote_count} 票</span>
                </div>
              </div>

              {session.none_satisfied_count > 0 && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-800 text-sm">
                    ❌ 结果为"都不满意" ({session.none_satisfied_count} 票)，任务已进入重新分配流程
                  </span>
                </div>
              )}
            </div>

            <div className="ml-6 flex flex-col space-y-2">
              <Link
                to={`/voting/${session.id}/results`}
                className="text-center bg-blue-100 text-blue-700 px-4 py-2 rounded text-sm hover:bg-blue-200"
              >
                📊 查看结果
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default VotingManager