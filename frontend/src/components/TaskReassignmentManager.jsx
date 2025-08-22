import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

function TaskReassignmentManager({ user }) {
  const navigate = useNavigate()
  const [pendingTasks, setPendingTasks] = useState([])
  const [availableWriters, setAvailableWriters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [reassignForm, setReassignForm] = useState({
    writer1_id: '',
    writer2_id: '',
    new_deadline: '',
    reason: ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [tasksRes, writersRes] = await Promise.all([
        axios.get('/task-reassignments/pending'),
        axios.get('/task-reassignments/available-writers')
      ])

      setPendingTasks(tasksRes.data)
      setAvailableWriters(writersRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenReassign = (task) => {
    setSelectedTask(task)
    setReassignForm({
      writer1_id: '',
      writer2_id: '',
      new_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 默认两周后
      reason: '投票结果为"都不满意"，重新分配任务'
    })
    setShowReassignModal(true)
  }

  const handleReassignSubmit = async (e) => {
    e.preventDefault()
    
    if (!reassignForm.writer1_id || !reassignForm.writer2_id) {
      alert('请选择两个撰写者')
      return
    }

    if (reassignForm.writer1_id === reassignForm.writer2_id) {
      alert('不能将任务分配给同一个人')
      return
    }

    try {
      setSubmitting(true)
      
      await axios.post('/task-reassignments', {
        task_id: selectedTask.id,
        ...reassignForm
      })

      alert('任务重新分配成功！')
      setShowReassignModal(false)
      await fetchData()
    } catch (error) {
      console.error('Error reassigning task:', error)
      alert('重新分配失败：' + (error.response?.data?.error || error.message))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载重新分配数据...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">🔄 任务重新分配</h1>
              <p className="text-sm text-gray-600">管理需要重新分配的任务</p>
            </div>
            
            <Link
              to="/voting-manager"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
            >
              ← 返回投票管理
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {pendingTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">✅</div>
            <p className="text-gray-600">暂无需要重新分配的任务</p>
            <p className="text-sm text-gray-500 mt-2">当投票结果为"都不满意"时，任务将出现在这里</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onReassign={() => handleOpenReassign(task)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reassign Modal */}
      {showReassignModal && selectedTask && (
        <ReassignModal
          task={selectedTask}
          availableWriters={availableWriters}
          form={reassignForm}
          setForm={setReassignForm}
          onSubmit={handleReassignSubmit}
          onClose={() => setShowReassignModal(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}

function TaskCard({ task, onReassign }) {
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchHistory = async () => {
    if (showHistory) {
      setShowHistory(false)
      return
    }

    try {
      setLoadingHistory(true)
      const response = await axios.get(`/task-reassignments/task/${task.id}/history`)
      setHistory(response.data)
      setShowHistory(true)
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex justify-between items-start mb-4">
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
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">投票会话：</span>
                <span className="text-gray-600">{task.voting_session_title}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">投票结束：</span>
                <span className="text-gray-600">
                  {new Date(task.voting_ended_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {task.reassignment_count > 0 && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded">
              <span className="text-orange-800 text-sm">
                ⚠️ 此任务已经重新分配过 {task.reassignment_count} 次
              </span>
            </div>
          )}
        </div>

        <div className="ml-6 flex flex-col space-y-2">
          <button
            onClick={onReassign}
            className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700"
          >
            🔄 重新分配
          </button>
          
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {loadingHistory ? '加载中...' : showHistory ? '隐藏历史' : '📊 查看历史'}
          </button>
        </div>
      </div>

      {/* History Section */}
      {showHistory && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-gray-900 mb-3">重新分配历史</h4>
          {history.length === 0 ? (
            <p className="text-gray-500 text-sm">暂无重新分配历史</p>
          ) : (
            <div className="space-y-3">
              {history.map((record, index) => (
                <div key={record.id} className="bg-gray-50 border border-gray-200 rounded p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm">第 {record.round_number} 轮分配</span>
                    <span className="text-xs text-gray-500">
                      {new Date(record.reassigned_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">原分配：</span>
                      <div className="ml-2">
                        {record.old_assignees && (
                          <>
                            <div>撰写者1: {record.old_assignees.writer1_id || '未分配'}</div>
                            <div>撰写者2: {record.old_assignees.writer2_id || '未分配'}</div>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-600">新分配：</span>
                      <div className="ml-2">
                        {record.new_assignees && (
                          <>
                            <div>撰写者1: {record.new_assignees.writer1_id}</div>
                            <div>撰写者2: {record.new_assignees.writer2_id}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {record.reason && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-600">原因：</span>
                      <span className="ml-1">{record.reason}</span>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-500">
                    操作者：{record.reassigned_by_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReassignModal({ task, availableWriters, form, setForm, onSubmit, onClose, submitting }) {
  const handleInputChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">重新分配任务</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Task Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded">
            <h4 className="font-medium mb-2">{task.title}</h4>
            <div className="text-sm text-gray-600">
              <div>功能：{task.function_name}</div>
              <div>分类：{task.category_name}</div>
              <div>上次投票结束：{new Date(task.voting_ended_at).toLocaleString()}</div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  撰写者 1 *
                </label>
                <select
                  value={form.writer1_id}
                  onChange={(e) => handleInputChange('writer1_id', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                >
                  <option value="">请选择撰写者</option>
                  {availableWriters.map(writer => (
                    <option key={writer.id} value={writer.id}>
                      {writer.username} ({writer.active_task_count} 个活跃任务)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  撰写者 2 *
                </label>
                <select
                  value={form.writer2_id}
                  onChange={(e) => handleInputChange('writer2_id', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                >
                  <option value="">请选择撰写者</option>
                  {availableWriters.map(writer => (
                    <option 
                      key={writer.id} 
                      value={writer.id}
                      disabled={writer.id === form.writer1_id}
                    >
                      {writer.username} ({writer.active_task_count} 个活跃任务)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                新截止时间 *
              </label>
              <input
                type="date"
                value={form.new_deadline}
                onChange={(e) => handleInputChange('new_deadline', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                重新分配原因
              </label>
              <textarea
                value={form.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="请说明重新分配的原因..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? '分配中...' : '确认重新分配'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TaskReassignmentManager