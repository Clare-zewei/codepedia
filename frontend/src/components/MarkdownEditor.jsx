import { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'

function MarkdownEditor({ document, task, onSave, isSubmitted }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveNote, setSaveNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const editorRef = useRef(null)
  const previewRef = useRef(null)

  // Configure marked with syntax highlighting
  const renderer = new marked.Renderer()
  renderer.code = (code, language) => {
    return `<div class="code-block-wrapper">
      <div class="code-block-header">${language || 'text'}</div>
      <div class="code-block-content">${code}</div>
    </div>`
  }

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true
  })

  useEffect(() => {
    if (document) {
      setTitle(document.title || '')
      setContent(document.content || '')
      setLastSaved(document.updated_at)
    }
  }, [document])

  // Auto-save functionality
  useEffect(() => {
    const autoSaveTimer = setTimeout(() => {
      if (!isSubmitted && (title !== (document?.title || '') || content !== (document?.content || ''))) {
        handleAutoSave()
      }
    }, 3000) // Auto-save after 3 seconds of no changes

    return () => clearTimeout(autoSaveTimer)
  }, [title, content, document, isSubmitted])

  // Synchronized scrolling
  const handleEditorScroll = () => {
    if (editorRef.current && previewRef.current) {
      const editor = editorRef.current
      const preview = previewRef.current
      const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight)
      preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight)
    }
  }

  const handleAutoSave = async () => {
    if (!onSave || isSaving) return
    
    try {
      setIsSaving(true)
      await onSave(title, content, 'Auto-save')
      setLastSaved(new Date().toISOString())
    } catch (error) {
      console.error('Auto-save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleManualSave = async () => {
    if (!saveNote.trim()) {
      setShowSaveDialog(true)
      return
    }

    try {
      setIsSaving(true)
      await onSave(title, content, saveNote)
      setSaveNote('')
      setLastSaved(new Date().toISOString())
      setShowSaveDialog(false)
    } catch (error) {
      console.error('Manual save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const insertTemplate = (template) => {
    const textarea = editorRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newContent = content.substring(0, start) + template + content.substring(end)
    setContent(newContent)
    
    // Set cursor position after insertion
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + template.length
      textarea.focus()
    }, 0)
  }

  const templates = {
    overview: `## Overview\n\nBrief description of the function/method.\n\n`,
    implementation: `## Implementation\n\n### Syntax\n\`\`\`python\n# Function signature\n\`\`\`\n\n### Parameters\n- **param1**: Description\n- **param2**: Description\n\n### Returns\n- **type**: Description\n\n`,
    usage: `## Usage Examples\n\n### Basic Usage\n\`\`\`python\n# Basic example\n\`\`\`\n\n### Advanced Usage\n\`\`\`python\n# Advanced example\n\`\`\`\n\n`,
    codeBlock: '```python\n# Your code here\n```\n',
    table: '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Data 1   | Data 2   | Data 3   |\n\n'
  }

  const renderMarkdown = (text) => {
    try {
      const html = marked(text)
      return { __html: html }
    } catch (error) {
      return { __html: '<p>Error rendering markdown</p>' }
    }
  }

  // Custom code block component for preview
  const CodeBlock = ({ language, code }) => (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="language-label">{language || 'text'}</span>
        <button 
          className="copy-button"
          onClick={() => navigator.clipboard.writeText(code)}
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter 
        language={language} 
        style={tomorrow}
        customStyle={{ margin: 0, borderRadius: '0 0 6px 6px' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )

  return (
    <div className="markdown-editor h-full flex flex-col">
      {/* Toolbar */}
      <div className="toolbar bg-white border-b border-gray-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title..."
              className="text-lg font-semibold border-none outline-none bg-transparent"
              disabled={isSubmitted}
            />
            {lastSaved && (
              <span className="text-sm text-gray-500">
                Last saved: {new Date(lastSaved).toLocaleString()}
              </span>
            )}
          </div>
          
          {!isSubmitted && (
            <div className="flex space-x-2">
              <button
                onClick={() => setShowSaveDialog(true)}
                disabled={isSaving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          )}
        </div>

        {/* Template buttons */}
        {!isSubmitted && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => insertTemplate(templates.overview)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              + Overview
            </button>
            <button
              onClick={() => insertTemplate(templates.implementation)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              + Implementation
            </button>
            <button
              onClick={() => insertTemplate(templates.usage)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              + Usage
            </button>
            <button
              onClick={() => insertTemplate(templates.codeBlock)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              + Code Block
            </button>
            <button
              onClick={() => insertTemplate(templates.table)}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              + Table
            </button>
          </div>
        )}
      </div>

      {/* Editor and Preview */}
      <div className="flex-1 flex min-h-0">
        {/* Editor Panel */}
        <div className="w-1/2 border-r border-gray-200">
          <div className="h-full flex flex-col">
            <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium text-gray-700">
              📝 Editor
            </div>
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={handleEditorScroll}
              placeholder="Start writing your documentation in Markdown..."
              className="flex-1 p-4 border-none outline-none resize-none font-mono text-sm leading-relaxed"
              disabled={isSubmitted}
            />
          </div>
        </div>

        {/* Preview Panel */}
        <div className="w-1/2">
          <div className="h-full flex flex-col">
            <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium text-gray-700">
              👁️ Preview
            </div>
            <div 
              ref={previewRef}
              className="flex-1 p-4 overflow-y-auto prose prose-sm max-w-none"
              dangerouslySetInnerHTML={renderMarkdown(content)}
            />
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Save Draft</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Save Note (optional)
              </label>
              <textarea
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="Brief description of changes..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSaveDialog(false)
                  setSaveNote('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSave}
                disabled={isSaving}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reference Panel */}
      {task && (
        <div className="bg-gray-50 border-t p-4">
          <h4 className="font-medium text-gray-800 mb-2">📋 Task Reference</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Function:</span>
              <span className="ml-2 font-mono">{task.function_name}</span>
            </div>
            <div>
              <span className="text-gray-600">Category:</span>
              <span className="ml-2">{task.category_name}</span>
            </div>
          </div>
          {task.description && (
            <div className="mt-2 text-sm text-gray-600">
              {task.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MarkdownEditor