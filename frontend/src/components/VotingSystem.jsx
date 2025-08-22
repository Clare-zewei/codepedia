import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

function VotingSystem({ user }) {
  const { taskId } = useParams()
  const [votingData, setVotingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedVote, setSelectedVote] = useState('')
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (taskId) {
      fetchVotingData()
    }
  }, [taskId])

  const fetchVotingData = async () => {
    try {
      const response = await axios.get(`/wiki-votes/task/${taskId}`)
      setVotingData(response.data)
    } catch (error) {
      console.error('Error fetching voting data:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitVote = async () => {
    if (!selectedVote) {
      alert('Please select a voting option')
      return
    }

    setSubmitting(true)
    try {
      await axios.post(`/wiki-votes/task/${taskId}/vote`, {
        vote_option: selectedVote,
        comments: comments.trim() || undefined
      })
      fetchVotingData() // Refresh data
      alert('Vote submitted successfully!')
    } catch (error) {
      console.error('Error submitting vote:', error)
      alert('Error submitting vote: ' + (error.response?.data?.error || error.message))
    } finally {
      setSubmitting(false)
    }
  }

  const startVoting = async () => {
    try {
      await axios.post(`/wiki-votes/task/${taskId}/start-voting`)
      fetchVotingData()
      alert('Voting started successfully!')
    } catch (error) {
      console.error('Error starting voting:', error)
      alert('Error starting voting: ' + (error.response?.data?.error || error.message))
    }
  }

  const completeVoting = async () => {
    try {
      await axios.post(`/wiki-votes/task/${taskId}/complete-voting`)
      fetchVotingData()
      alert('Voting completed successfully!')
    } catch (error) {
      console.error('Error completing voting:', error)
      alert('Error completing voting: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading voting data...</div>
  }

  if (!votingData) {
    return <div className="text-center py-8">Voting data not found</div>
  }

  const { task, contents, votingResults, userVote, allVotes, totalVotes } = votingData

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
            <p className="text-gray-600 mt-1">{task.function_name} - {task.category_name}</p>
            <div className="mt-2">
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                task.status === 'pending_vote' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}>
                {task.status === 'pending_vote' ? 'Voting in Progress' : 'Voting Completed'}
              </span>
            </div>
          </div>
          {user.role === 'admin' && (
            <div className="space-x-2">
              {task.status === 'pending_vote' && (
                <button
                  onClick={completeVoting}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Complete Voting
                </button>
              )}
              {task.status !== 'pending_vote' && task.status !== 'completed' && (
                <button
                  onClick={startVoting}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Start Voting
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Voting Results */}
      {task.status === 'pending_vote' || task.status === 'completed' ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Voting Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{votingResults.version_a}</div>
              <div className="text-sm text-blue-700">Version A</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{votingResults.version_b}</div>
              <div className="text-sm text-green-700">Version B</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{votingResults.neither_satisfactory}</div>
              <div className="text-sm text-red-700">Neither Satisfactory</div>
            </div>
          </div>
          <div className="text-center text-gray-600">
            Total Votes: {totalVotes}
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 p-6 rounded-lg">
          <p className="text-yellow-800">This task is not in voting phase yet.</p>
        </div>
      )}

      {/* Content Comparison */}
      {contents.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {contents.slice(0, 2).map((content, index) => (
            <div key={content.id} className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Version {index === 0 ? 'A' : 'B'} - by {content.writer_username}
                </h3>
                <p className="text-sm text-gray-500">
                  Submitted: {new Date(content.submitted_at).toLocaleString()}
                </p>
              </div>
              
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Feature Documentation</h4>
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {content.feature_documentation}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">API Testing</h4>
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {content.api_testing}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Use Case Scripts</h4>
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {content.use_case_scripts}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Voting Form */}
      {task.status === 'pending_vote' && !userVote && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Cast Your Vote</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select your choice:</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="version_a"
                    checked={selectedVote === 'version_a'}
                    onChange={(e) => setSelectedVote(e.target.value)}
                    className="mr-2"
                  />
                  <span>Version A (First submission)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="version_b"
                    checked={selectedVote === 'version_b'}
                    onChange={(e) => setSelectedVote(e.target.value)}
                    className="mr-2"
                  />
                  <span>Version B (Second submission)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="neither_satisfactory"
                    checked={selectedVote === 'neither_satisfactory'}
                    onChange={(e) => setSelectedVote(e.target.value)}
                    className="mr-2"
                  />
                  <span>Neither is satisfactory</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Comments (Optional):</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                rows={3}
                placeholder="Share your thoughts on the submissions..."
              />
            </div>
            
            <button
              onClick={submitVote}
              disabled={submitting || !selectedVote}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Vote'}
            </button>
          </div>
        </div>
      )}

      {/* User's Vote Display */}
      {userVote && (
        <div className="bg-green-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-green-900 mb-2">Your Vote</h3>
          <p className="text-green-800">
            You voted for: <strong>
              {userVote.vote_option === 'version_a' ? 'Version A' : 
               userVote.vote_option === 'version_b' ? 'Version B' : 
               'Neither Satisfactory'}
            </strong>
          </p>
          {userVote.comments && (
            <p className="text-green-700 mt-2">
              <span className="font-medium">Your comments:</span> {userVote.comments}
            </p>
          )}
        </div>
      )}

      {/* All Votes (Admin View) */}
      {user.role === 'admin' && allVotes.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">All Votes (Admin View)</h2>
          <div className="space-y-3">
            {allVotes.map((vote, index) => (
              <div key={index} className="border border-gray-200 rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{vote.voter_username}</span>
                    <span className="ml-2 text-sm text-gray-600">
                      voted for {vote.vote_option === 'version_a' ? 'Version A' : 
                                 vote.vote_option === 'version_b' ? 'Version B' : 
                                 'Neither Satisfactory'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(vote.voted_at).toLocaleString()}
                  </span>
                </div>
                {vote.comments && (
                  <p className="text-sm text-gray-700 mt-2">{vote.comments}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default VotingSystem