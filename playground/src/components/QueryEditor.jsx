import { useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setQueryText, formatQuery, selectQueryText } from '../store/querySlice'

function QueryEditor() {
  const dispatch = useDispatch()
  const value = useSelector(selectQueryText)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [value])

  const handleChange = useCallback((e) => {
    dispatch(setQueryText(e.target.value))
  }, [dispatch])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      dispatch(setQueryText(newValue))
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2
      }, 0)
    }
  }, [dispatch, value])

  const handleFormat = useCallback(() => {
    dispatch(formatQuery())
  }, [dispatch])

  return (
    <div className="flex-1 relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="json-editor w-full h-full min-h-[400px] bg-gray-950 text-green-400 p-4 resize-none focus:outline-none text-sm leading-relaxed"
        spellCheck={false}
        placeholder="Enter your JSON query here..."
      />
      <button
        onClick={handleFormat}
        className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300"
      >
        Format
      </button>
    </div>
  )
}

export default QueryEditor
