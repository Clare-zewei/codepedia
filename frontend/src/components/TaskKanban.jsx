import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function TaskKanban({ user }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      const response = await axios.get('/wiki-tasks')
      setTasks(response.data)
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const groupedTasks = {
    not_started: tasks.filter(task => task.status === 'not_started'),
    in_progress: tasks.filter(task => task.status === 'in_progress'),
    pending_vote: tasks.filter(task => task.status === 'pending_vote'),
    completed: tasks.filter(task => task.status === 'completed'),
    overtime: tasks.filter(task => task.status === 'overtime')
  }

  const statusConfig = {
    not_started: {
      title: 'Not Started',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-300',
      headerColor: 'bg-gray-100 text-gray-800'
    },
    in_progress: {
      title: 'In Progress',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      headerColor: 'bg-blue-100 text-blue-800'
    },
    pending_vote: {
      title: 'Pending Vote',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-300',
      headerColor: 'bg-yellow-100 text-yellow-800'
    },
    completed: {
      title: 'Completed',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      headerColor: 'bg-green-100 text-green-800'
    },
    overtime: {
      title: 'Overtime',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-300',
      headerColor: 'bg-red-100 text-red-800'
    }
  }

  const TaskCard = ({ task }) => {
    const isOverdue = task.deadline && new Date(task.deadline) < new Date()
    
    return (
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-2">
          <Link
            to={`/wiki-tasks/${task.id}`}
            className="font-medium text-gray-900 hover:text-blue-600 line-clamp-2"
          >
            {task.title}
          </Link>
          {isOverdue && (
            <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full ml-2 mt-1"></span>
          )}
        </div>
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-1">
          {task.function_name}
        </p>
        
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Annotator:</span>
            <span className="text-gray-700 truncate ml-1">
              {task.code_annotator_username || 'Unassigned'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Writers:</span>
            <span className="text-gray-700 truncate ml-1">
              {[task.writer1_username, task.writer2_username].filter(Boolean).join(', ') || 'Unassigned'}
            </span>
          </div>
          {task.deadline && (
            <div className="flex justify-between">
              <span className="text-gray-500">Deadline:</span>
              <span className={`${isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                {new Date(task.deadline).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
          <div className="flex space-x-2 text-xs text-gray-500">
            <span>📝 {task.submission_count || 0}</span>
            <span>🗳️ {task.vote_count || 0}</span>
          </div>
          <div className="flex space-x-1">
            <Link
              to={`/wiki-tasks/${task.id}`}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
            >
              View
            </Link>
            {task.status === 'pending_vote' && (
              <Link
                to={`/wiki-votes/${task.id}`}
                className="text-yellow-600 hover:text-yellow-800 text-xs font-medium"
              >
                Vote
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  const KanbanColumn = ({ status, config, tasks: columnTasks }) => (
    <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-lg p-4 min-h-[600px]`}>
      <div className={`${config.headerColor} px-3 py-2 rounded-md mb-4 flex justify-between items-center`}>
        <h3 className="font-semibold">{config.title}</h3>
        <span className="text-sm font-medium">{columnTasks.length}</span>
      </div>
      
      <div className="space-y-3">
        {columnTasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
        
        {columnTasks.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No tasks in this stage</p>
          </div>
        )}
      </div>
    </div>
  )

  if (loading) {
    return <div className="text-center py-8">Loading task board...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Kanban Board</h1>
          <p className="text-gray-600 mt-1">Track the progress of all wiki tasks</p>
        </div>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Overdue</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>📝 Submissions</span>
            <span>🗳️ Votes</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(groupedTasks).map(([status, statusTasks]) => (
          <div key={status} className="text-center p-3 bg-white rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-gray-900">{statusTasks.length}</div>
            <div className="text-sm text-gray-600">{statusConfig[status].title}</div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 overflow-x-auto">
        {Object.entries(statusConfig).map(([status, config]) => (
          <KanbanColumn
            key={status}
            status={status}
            config={config}
            tasks={groupedTasks[status]}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h3 className="font-medium text-gray-900 mb-2">Workflow Stages</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-800">Not Started:</span>
            <p className="text-gray-600">Task created, waiting for writers to accept</p>
          </div>
          <div>
            <span className="font-medium text-blue-800">In Progress:</span>
            <p className="text-gray-600">Writers are working on documentation</p>
          </div>
          <div>
            <span className="font-medium text-yellow-800">Pending Vote:</span>
            <p className="text-gray-600">Content submitted, ready for team voting</p>
          </div>
          <div>
            <span className="font-medium text-green-800">Completed:</span>
            <p className="text-gray-600">Voting finished, winning content selected</p>
          </div>
          <div>
            <span className="font-medium text-red-800">Overtime:</span>
            <p className="text-gray-600">Deadline passed, requires intervention</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskKanban