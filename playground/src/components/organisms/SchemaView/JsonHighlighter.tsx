import React from 'react'

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
}

// Check if array is simple (all primitives, short enough for one line)
function isSimpleArray(arr: unknown[]): boolean {
  if (arr.length === 0) return true
  if (arr.length > 6) return false

  const allPrimitives = arr.every(
    item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null
  )

  if (!allPrimitives) return false

  // Check total length when formatted
  const formatted = arr.map(item => JSON.stringify(item)).join(', ')
  return formatted.length < 80
}

// Key counter for unique React keys
let globalKey = 0
function nextKey(): number {
  return globalKey++
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
function renderValue(value: unknown, indent: number, isLast: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const indentStr = '  '.repeat(indent)

  if (value === null) {
    parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'boolean') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(value)}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'number') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{value}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'string') {
    parts.push(...renderString(value))
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    } else if (isSimpleArray(value)) {
      // Compact array on one line
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
    } else {
      // Multi-line array
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      parts.push('\n')
      value.forEach((item, idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderValue(item, indent + 1, idx === value.length - 1))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    }
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{'}</span>)
      parts.push('\n')
      entries.forEach(([k, v], idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderKeyStr(k))
        parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>: </span>)
        // For inline rendering of the value (no leading newline)
        parts.push(...renderValueInline(v, indent + 1, idx === entries.length - 1))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    }
  }

  return parts
}

// Render value inline (for after "key": )
function renderValueInline(value: unknown, indent: number, isLast: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const indentStr = '  '.repeat(indent)

  if (value === null) {
    parts.push(<span key={nextKey()} style={{ color: COLORS.null }}>null</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'boolean') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.boolean }}>{String(value)}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'number') {
    parts.push(<span key={nextKey()} style={{ color: COLORS.number }}>{value}</span>)
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (typeof value === 'string') {
    parts.push(...renderString(value))
    if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
    parts.push('\n')
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
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
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>[</span>)
      parts.push('\n')
      value.forEach((item, idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderValue(item, indent + 1, idx === value.length - 1))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.arrayBracket }}>]</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    }
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    } else {
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'{'}</span>)
      parts.push('\n')
      entries.forEach(([k, v], idx) => {
        parts.push(indentStr + '  ')
        parts.push(...renderKeyStr(k))
        parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>: </span>)
        parts.push(...renderValueInline(v, indent + 1, idx === entries.length - 1))
      })
      parts.push(indentStr)
      parts.push(<span key={nextKey()} style={{ color: COLORS.objectBracket }}>{'}'}</span>)
      if (!isLast) parts.push(<span key={nextKey()} style={{ color: COLORS.punctuation }}>,</span>)
      parts.push('\n')
    }
  }

  return parts
}

export function JsonHighlighter({ data }: JsonHighlighterProps) {
  // Reset global key counter for each render
  globalKey = 0
  const parts = renderValue(data, 0, true)

  return (
    <pre className="font-mono text-xs leading-relaxed" style={{ color: COLORS.punctuation }}>
      <code>{parts}</code>
    </pre>
  )
}
