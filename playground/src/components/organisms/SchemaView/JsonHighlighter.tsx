import React, { useRef, useMemo, useCallback } from 'react'

interface JsonHighlighterProps {
  data: unknown
}

// GitHub Dark theme colors
const COLORS = {
  key: '#79c0ff',      // Blue for keys
  string: '#7ee787',   // Green for string values
  quote: '#79c0ff',    // Light blue for quotes
  number: '#79c0ff',   // Blue for numbers
  boolean: '#ff7b72',  // Red/pink for booleans
  null: '#8b949e',     // Gray for null
  arrayBracket: '#ff7b72',   // Pink/red for []
  objectBracket: '#ffa657',  // Orange for {}
  punctuation: '#c9d1d9',    // Light gray for : and ,
  lineNumber: '#6e7681',     // Gray for line numbers
}

// Check if array is simple (all primitives, short enough for one line)
function isSimpleArray(arr: unknown[]): boolean {
  if (arr.length === 0) return true
  if (arr.length > 6) return false

  const allPrimitives = arr.every(
    item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null
  )

  if (!allPrimitives) return false

  const formatted = arr.map(item => JSON.stringify(item)).join(', ')
  return formatted.length < 80
}

// Track line positions for navigation
interface LineInfo {
  lineNumber: number
  key?: string
  indent: number
  type: 'object' | 'array' | 'value'
}

// Key counter for unique React keys
let globalKey = 0
function nextKey(): number {
  return globalKey++
}

// Line tracking
let currentLine = 1
let lineMap: Map<string, number> = new Map()

function resetLineTracking() {
  currentLine = 1
  lineMap = new Map()
}

function trackLine(path: string) {
  lineMap.set(path, currentLine)
}

function incrementLine() {
  currentLine++
}

// Render a quoted string with separate colors for quotes and content
function renderString(str: string): React.ReactNode[] {
  return [
    <span key={nextKey()} style={{ color: COLORS.quote }}>"</span>,
    <span key={nextKey()} style={{ color: COLORS.string }}>{str}</span>,
    <span key={nextKey()} style={{ color: COLORS.quote }}>"</span>,
  ]
}

// Render a key with separate colors for quotes and content
function renderKeyStr(str: string): React.ReactNode[] {
  return [
    <span key={nextKey()} style={{ color: COLORS.quote }}>"</span>,
    <span key={nextKey()} style={{ color: COLORS.key }}>{str}</span>,
    <span key={nextKey()} style={{ color: COLORS.quote }}>"</span>,
  ]
}

// Render a JSON value with highlighting
function renderValue(value: unknown, indent: number, isLast: boolean, path: string = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const indentStr = '  '.repeat(indent)

  if (value === null) {
    parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'boolean') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(value)}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'number') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{value}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'string') {
    parts.push(...renderString(value))
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else if (isSimpleArray(value)) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      value.forEach((item, idx) => {
        if (typeof item === 'string') {
          parts.push(...renderString(item))
        } else if (typeof item === 'number') {
          parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{item}</span>)
        } else if (typeof item === 'boolean') {
          parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(item)}</span>)
        } else if (item === null) {
          parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
        }
        if (idx < value.length - 1) {
          parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>, </span>)
        }
      })
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      parts.push('\n')
      incrementLine()
      value.forEach((item, idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderValue(item, indent + 1, idx === value.length - 1, `${path}[${idx}]`))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    }
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{'}</span>)
      parts.push('\n')
      incrementLine()
      entries.forEach(([k, v], idx) => {
        const newPath = path ? `${path}.${k}` : k
        trackLine(newPath)
        parts.push(indentStr + '  ')
        parts.push(...renderKeyStr(k))
        parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>: </span>)
        parts.push(...renderValueInline(v, indent + 1, idx === entries.length - 1, newPath))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    }
  }

  return parts
}

// Render value inline (for after "key": )
function renderValueInline(value: unknown, indent: number, isLast: boolean, path: string = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const indentStr = '  '.repeat(indent)

  if (value === null) {
    parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'boolean') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(value)}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'number') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{value}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (typeof value === 'string') {
    parts.push(...renderString(value))
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
    incrementLine()
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else if (isSimpleArray(value)) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      value.forEach((item, idx) => {
        if (typeof item === 'string') {
          parts.push(...renderString(item))
        } else if (typeof item === 'number') {
          parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{item}</span>)
        } else if (typeof item === 'boolean') {
          parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(item)}</span>)
        } else if (item === null) {
          parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
        }
        if (idx < value.length - 1) {
          parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>, </span>)
        }
      })
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      parts.push('\n')
      incrementLine()
      value.forEach((item, idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderValue(item, indent + 1, idx === value.length - 1, `${path}[${idx}]`))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    }
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{'}</span>)
      parts.push('\n')
      incrementLine()
      entries.forEach(([k, v], idx) => {
        const newPath = path ? `${path}.${k}` : k
        trackLine(newPath)
        parts.push(indentStr + '  ')
        parts.push(...renderKeyStr(k))
        parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>: </span>)
        parts.push(...renderValueInline(v, indent + 1, idx === entries.length - 1, newPath))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
      incrementLine()
    }
  }

  return parts
}

// Extract navigation structure from data
interface NavItem {
  name: string
  path: string
  service?: string
  children?: NavItem[]
}

function extractNavItems(data: unknown): NavItem[] {
  if (!data || typeof data !== 'object') return []

  const graph = data as { entities?: Record<string, { service?: string }> }
  if (!graph.entities) return []

  // Group entities by service
  const byService: Record<string, string[]> = {}
  Object.entries(graph.entities).forEach(([name, entity]) => {
    const service = entity.service || 'unknown'
    if (!byService[service]) byService[service] = []
    byService[service].push(name)
  })

  return Object.entries(byService)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([service, entities]) => ({
      name: service,
      path: `entities`,
      children: entities.sort().map(name => ({
        name,
        path: `entities.${name}`,
        service,
      })),
    }))
}

export function JsonHighlighter({ data }: JsonHighlighterProps) {
  const codeRef = useRef<HTMLPreElement>(null)

  // Reset and render
  globalKey = 0
  resetLineTracking()
  const parts = renderValue(data, 0, true)
  const totalLines = currentLine - 1
  const savedLineMap = new Map(lineMap)

  // Extract navigation items
  const navItems = useMemo(() => extractNavItems(data), [data])

  // Scroll to line
  const scrollToPath = useCallback((path: string) => {
    const lineNum = savedLineMap.get(path)
    if (lineNum && codeRef.current) {
      const lineHeight = 20 // approximate line height in px
      codeRef.current.scrollTop = (lineNum - 3) * lineHeight
    }
  }, [savedLineMap])

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    const nums: React.ReactNode[] = []
    for (let i = 1; i <= totalLines; i++) {
      nums.push(
        <div key={i} className="text-right pr-3 select-none" style={{ color: COLORS.lineNumber }}>
          {i}
        </div>
      )
    }
    return nums
  }, [totalLines])

  // Dark scrollbar styles
  const scrollbarStyles = `
    .dark-scrollbar::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .dark-scrollbar::-webkit-scrollbar-track {
      background: #161b22;
    }
    .dark-scrollbar::-webkit-scrollbar-thumb {
      background: #30363d;
      border-radius: 4px;
    }
    .dark-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #484f58;
    }
    .dark-scrollbar::-webkit-scrollbar-corner {
      background: #161b22;
    }
  `

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div className="flex h-full">
        {/* Main code area with line numbers */}
        <div className="flex-1 flex overflow-hidden">
          {/* Line numbers */}
          <div
            className="flex-shrink-0 font-mono text-xs leading-[20px] bg-[#0d1117] border-r border-gray-800 overflow-hidden"
            style={{ minWidth: '50px' }}
          >
            {lineNumbers}
          </div>

          {/* Code */}
          <pre
            ref={codeRef}
            className="dark-scrollbar flex-1 font-mono text-xs leading-[20px] overflow-auto pl-3 m-0"
            style={{ color: COLORS.punctuation }}
          >
            <code>{parts}</code>
          </pre>
        </div>

        {/* Navigation sidebar */}
        <div className="dark-scrollbar w-56 flex-shrink-0 border-l border-gray-800 bg-[#161b22] overflow-auto">
          <div className="p-2 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-400">OUTLINE</span>
          </div>
          <div className="p-2">
            {navItems.map((service) => (
              <div key={service.name} className="mb-2">
                <div className="flex items-center gap-1 text-xs text-gray-500 font-medium mb-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {service.name}
                </div>
                {service.children?.map((entity) => (
                  <button
                    key={entity.name}
                    onClick={() => scrollToPath(entity.path)}
                    className="w-full text-left px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors truncate"
                  >
                    {entity.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
