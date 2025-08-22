import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

function DocumentView({ user }) {
  const { id } = useParams()
  const [documentData, setDocumentData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showVoteForm, setShowVoteForm] = useState(false)
  const [voteForm, setVoteForm] = useState({
    document_quality_score: 5,
    code_readability_score: 5,
    comments: ''
  })

  useEffect(() => {
    fetchDocumentData()
  }, [id])

  const fetchDocumentData = async () => {
    try {
      const response = await axios.get(`/documents/${id}`)
      setDocumentData(response.data)
    } catch (error) {
      console.error('Error fetching document data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitVote = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/assessments/vote', {
        ...voteForm,
        document_id: id
      })
      setShowVoteForm(false)
      fetchDocumentData()
    } catch (error) {
      console.error('Error submitting vote:', error)
    }
  }

  const hasUserVoted = () => {
    return documentData?.votes.some(vote => vote.voter_id === user.id)
  }

  const getUserVote = () => {
    return documentData?.votes.find(vote => vote.voter_id === user.id)
  }

  if (loading) {
    return <div className="text-center py-8">Loading document...</div>
  }

  if (!documentData) {
    return <div className="text-center py-8">Document not found</div>
  }

  const { document, votes } = documentData
  const userVote = getUserVote()

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
            <div className="flex items-center space-x-6 text-sm text-gray-500 mt-2">
              <span>Author: {document.author_username}</span>
              <span>Topic: {document.topic_title}</span>
              <span>Module: {document.module_name}</span>
              <span>Type: {document.doc_type.replace('_', ' ')}</span>
              <span>Submitted: {new Date(document.submitted_at).toLocaleDateString()}</span>
            </div>
          </div>
          {!hasUserVoted() && (
            <button
              onClick={() => setShowVoteForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Vote
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Document Content</h2>
        <div className="prose max-w-none">
          <div className="whitespace-pre-wrap text-gray-700">
            {document.content}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Assessment Votes</h2>
        
        {votes.length > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-900">Average Document Quality</h3>
              <p className="text-2xl font-bold text-blue-600">
                {(votes.reduce((sum, vote) => sum + vote.document_quality_score, 0) / votes.length).toFixed(1)}/10
              </p>
              <p className="text-sm text-blue-700">Based on {votes.length} votes</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-medium text-green-900">Average Code Readability Score</h3>
              <p className="text-2xl font-bold text-green-600">
                {(votes.reduce((sum, vote) => sum + vote.code_readability_score, 0) / votes.length).toFixed(1)}/10
              </p>
              <p className="text-sm text-green-700">Reverse assessment of original code quality</p>
            </div>
          </div>
        )}

        {userVote && (
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-medium text-yellow-900 mb-2">Your Vote</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Document Quality:</span>
                <span className="ml-2 font-medium">{userVote.document_quality_score}/10</span>
              </div>
              <div>
                <span className="text-gray-600">Code Readability:</span>
                <span className="ml-2 font-medium">{userVote.code_readability_score}/10</span>
              </div>
            </div>
            {userVote.comments && (
              <p className="text-sm text-gray-700 mt-2">{userVote.comments}</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {votes.filter(vote => vote.voter_id !== user.id).map(vote => (
            <div key={vote.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-4 mb-2">
                    <span className="font-medium">{vote.voter_username}</span>
                    <div className="flex space-x-4 text-sm">
                      <span className="text-blue-600">Doc Quality: {vote.document_quality_score}/10</span>
                      <span className="text-green-600">Code Readability: {vote.code_readability_score}/10</span>
                    </div>
                  </div>
                  {vote.comments && (
                    <p className="text-gray-700">{vote.comments}</p>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(vote.voted_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {votes.length === 0 && (
          <p className="text-gray-500">No votes yet.</p>
        )}
      </div>

      {/* Vote Form Modal */}
      {showVoteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Vote on Document Quality</h3>
            <form onSubmit={handleSubmitVote} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Quality Score (1-10)
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={voteForm.document_quality_score}
                  onChange={(e) => setVoteForm(prev => ({...prev, document_quality_score: parseInt(e.target.value)}))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Poor (1)</span>
                  <span className="font-medium">{voteForm.document_quality_score}</span>
                  <span>Excellent (10)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code Readability Score (1-10)
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  Based on how well you could understand the original code from this documentation
                </p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={voteForm.code_readability_score}
                  onChange={(e) => setVoteForm(prev => ({...prev, code_readability_score: parseInt(e.target.value)}))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Hard to understand (1)</span>
                  <span className="font-medium">{voteForm.code_readability_score}</span>
                  <span>Very clear (10)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Comments (Optional)</label>
                <textarea
                  value={voteForm.comments}
                  onChange={(e) => setVoteForm(prev => ({...prev, comments: e.target.value}))}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                  placeholder="Additional feedback..."
                />
              </div>

              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  Submit Vote
                </button>
                <button
                  type="button"
                  onClick={() => setShowVoteForm(false)}
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

export default DocumentView