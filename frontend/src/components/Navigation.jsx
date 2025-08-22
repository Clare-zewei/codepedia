import { Link } from 'react-router-dom'

function Navigation({ user, onLogout }) {
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800'
      case 'code_author': return 'bg-blue-100 text-blue-800'
      case 'doc_author': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Administrator'
      case 'code_author': return 'Code Author'
      case 'doc_author': return 'Document Author'
      case 'team_member': return 'Team Member'
      default: return role
    }
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Codepedia
            </Link>
            <div className="hidden md:flex items-center space-x-6">
              <Link to="/" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <Link to="/directory-tasks" className="text-gray-700 hover:text-blue-600">
                Directory & Tasks
              </Link>
              <Link to="/kanban" className="text-gray-700 hover:text-blue-600">
                Kanban Board
              </Link>
              <Link to="/voting-manager" className="text-gray-700 hover:text-blue-600">
                🗳️ Voting
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <span className="text-gray-700 font-medium">{user.username}</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="text-gray-700 hover:text-red-600 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation