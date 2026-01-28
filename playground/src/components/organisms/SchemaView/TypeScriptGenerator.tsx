import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import type { Graph, Field, Relation } from '@/types'

interface TypeScriptGeneratorProps {
  graph: Graph
}

const MAX_LINE_LENGTH = 120

// GitHub Dark theme colors
const COLORS = {
  keyword: '#ff7b72',     // Red/pink for keywords (export, interface, type, const)
  typeName: '#ffa657',    // Orange for type/interface names
  propertyName: '#c9d1d9', // Default for property names
  builtinType: '#79c0ff', // Blue for built-in types (string, number, boolean, null)
  stringLiteral: '#a5d6ff', // Light blue for string literals
  pipe: '#ff7b72',        // Red for pipe operator |
  comment: '#8b949e',     // Gray for comments
  separator: '#6e7681',   // Darker gray for separator comments
  text: '#c9d1d9',        // Default text
  lineNumber: '#6e7681',  // Gray for line numbers
}

// Wrap long lines at word boundaries (| or ,)
function wrapLine(line: string, indent: string = ''): string[] {
  if (line.length <= MAX_LINE_LENGTH) {
    return [line]
  }

  const lines: string[] = []
  let currentLine = ''
  const parts = line.split(/(\s*\|\s*|\s*,\s*)/)

  for (const part of parts) {
    if ((currentLine + part).length > MAX_LINE_LENGTH && currentLine.length > 0) {
      lines.push(currentLine.trimEnd())
      currentLine = indent + '  ' + part.trimStart()
    } else {
      currentLine += part
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine)
  }

  return lines
}

// Map schema types to TypeScript types
function mapFieldType(field: Field): string {
  const baseType = (() => {
    switch (field.type) {
      case 'string':
        return 'string'
      case 'int':
        return 'number'
      case 'bool':
        return 'boolean'
      case 'datetime':
      case 'date':
        return 'string' // ISO date string, could also be Date
      case 'json':
        return 'Record<string, unknown>'
      case 'enum':
        if (field.enum_values && field.enum_values.length > 0) {
          return field.enum_values.map(v => `'${v}'`).join(' | ')
        }
        return 'string'
      default:
        return 'unknown'
    }
  })()

  return field.nullable ? `${baseType} | null` : baseType
}

// Generate TypeScript interfaces from schema
function generateTypeScript(graph: Graph): string {
  const lines: string[] = []

  lines.push('// Auto-generated TypeScript interfaces from Supergraph schema')
  lines.push('// Generated at: ' + new Date().toISOString())
  lines.push('')

  const entities = Object.entries(graph.entities || {}).sort((a, b) => a[0].localeCompare(b[0]))

  // Group entities by service
  const byService: Record<string, Array<[string, typeof entities[0][1]]>> = {}
  entities.forEach(([name, entity]) => {
    const service = entity.service || 'unknown'
    if (!byService[service]) byService[service] = []
    byService[service].push([name, entity])
  })

  // Generate interfaces grouped by service
  Object.entries(byService).sort((a, b) => a[0].localeCompare(b[0])).forEach(([service, serviceEntities]) => {
    lines.push(`// ============================================================================`)
    lines.push(`// Service: ${service}`)
    lines.push(`// ============================================================================`)
    lines.push('')

    serviceEntities.forEach(([entityName, entity]) => {
      // Generate main interface
      lines.push(`export interface ${entityName} {`)

      // Fields
      const fields = Object.entries(entity.fields || {}).sort((a, b) => {
        // id first, then alphabetically
        if (a[0] === 'id') return -1
        if (b[0] === 'id') return 1
        return a[0].localeCompare(b[0])
      })

      fields.forEach(([fieldName, field]) => {
        const tsType = mapFieldType(field)
        const optional = field.nullable ? '?' : ''
        const fkComment = field.fk ? ` // FK -> ${field.fk.target_entity}.${field.fk.target_field}` : ''
        const fieldLine = `  ${fieldName}${optional}: ${tsType}${fkComment}`
        wrapLine(fieldLine, '  ').forEach(l => lines.push(l))
      })

      lines.push('}')

      // Generate interface with relations if entity has relations
      const relations = Object.entries(entity.relations || {})
      if (relations.length > 0) {
        lines.push('')
        lines.push(`export interface ${entityName}WithRelations extends ${entityName} {`)

        relations.sort((a, b) => a[0].localeCompare(b[0])).forEach(([relName, rel]) => {
          const relation = rel as Relation
          const relType = relation.cardinality === 'many'
            ? `${relation.target}[]`
            : `${relation.target} | null`
          lines.push(`  ${relName}?: ${relType}`)
        })

        lines.push('}')
      }

      // Add spacing between entity blocks
      lines.push('')
      lines.push('')
    })
  })

  // Generate utility types
  lines.push(`// ============================================================================`)
  lines.push(`// Utility Types`)
  lines.push(`// ============================================================================`)
  lines.push('')

  // Entity names union
  const entityNames = entities.map(([name]) => `'${name}'`).join(' | ')
  const entityNameLine = `export type EntityName = ${entityNames}`
  wrapLine(entityNameLine, '').forEach(l => lines.push(l))
  lines.push('')

  // Create input types (without id, with optional fields)
  lines.push(`// Create input types (for POST requests)`)
  entities.forEach(([entityName, entity]) => {
    lines.push(`export type ${entityName}CreateInput = Omit<${entityName}, 'id'>`)
  })
  lines.push('')

  // Update input types (all fields optional except id)
  lines.push(`// Update input types (for PATCH requests)`)
  entities.forEach(([entityName]) => {
    lines.push(`export type ${entityName}UpdateInput = Partial<Omit<${entityName}, 'id'>> & { id: number }`)
  })
  lines.push('')

  // Service to entities mapping
  lines.push(`// Service to entities mapping`)
  lines.push(`export const SERVICE_ENTITIES = {`)
  Object.entries(byService).sort((a, b) => a[0].localeCompare(b[0])).forEach(([service, serviceEntities]) => {
    const entityList = serviceEntities.map(([name]) => `'${name}'`).join(', ')
    const serviceLine = `  '${service}': [${entityList}] as const,`
    wrapLine(serviceLine, '  ').forEach(l => lines.push(l))
  })
  lines.push(`} as const`)
  lines.push('')

  return lines.join('\n')
}

// Helper to highlight type expressions with full support for complex types
function highlightType(typeStr: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let key = startKey

  // Tokenize the type string for proper highlighting
  const tokens = tokenizeType(typeStr)

  tokens.forEach((token) => {
    switch (token.type) {
      case 'builtin':
        parts.push(<span key={key++} style={{ color: COLORS.builtinType }}>{token.value}</span>)
        break
      case 'generic':
        parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{token.value}</span>)
        break
      case 'entity':
        parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{token.value}</span>)
        break
      case 'string':
        parts.push(<span key={key++} style={{ color: COLORS.stringLiteral }}>{token.value}</span>)
        break
      case 'operator':
        parts.push(<span key={key++} style={{ color: COLORS.pipe }}>{token.value}</span>)
        break
      case 'bracket':
        parts.push(<span key={key++} style={{ color: COLORS.keyword }}>{token.value}</span>)
        break
      case 'punctuation':
        parts.push(<span key={key++} style={{ color: COLORS.text }}>{token.value}</span>)
        break
      default:
        parts.push(<span key={key++}>{token.value}</span>)
    }
  })

  return parts
}

// Tokenize a TypeScript type expression
interface TypeToken {
  type: 'builtin' | 'generic' | 'entity' | 'string' | 'operator' | 'bracket' | 'punctuation' | 'text'
  value: string
}

function tokenizeType(typeStr: string): TypeToken[] {
  const tokens: TypeToken[] = []
  let remaining = typeStr
  const builtins = ['string', 'number', 'boolean', 'null', 'unknown', 'void', 'never', 'any', 'object']
  const generics = ['Omit', 'Partial', 'Pick', 'Record', 'Array', 'Promise', 'Required', 'Readonly']

  while (remaining.length > 0) {
    // Skip whitespace
    const wsMatch = remaining.match(/^(\s+)/)
    if (wsMatch) {
      tokens.push({ type: 'text', value: wsMatch[1] })
      remaining = remaining.slice(wsMatch[1].length)
      continue
    }

    // String literals
    const strMatch = remaining.match(/^'[^']*'/)
    if (strMatch) {
      tokens.push({ type: 'string', value: strMatch[0] })
      remaining = remaining.slice(strMatch[0].length)
      continue
    }

    // Operators: | & =>
    const opMatch = remaining.match(/^(\||&|=>)/)
    if (opMatch) {
      tokens.push({ type: 'operator', value: opMatch[1] })
      remaining = remaining.slice(opMatch[1].length)
      continue
    }

    // Brackets: < > { } [ ] ( )
    const bracketMatch = remaining.match(/^([<>{}[\]()])/)
    if (bracketMatch) {
      tokens.push({ type: 'bracket', value: bracketMatch[1] })
      remaining = remaining.slice(1)
      continue
    }

    // Punctuation: , : ; ?
    const punctMatch = remaining.match(/^([,:;?])/)
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[1] })
      remaining = remaining.slice(1)
      continue
    }

    // Identifiers
    const idMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
    if (idMatch) {
      const id = idMatch[1]
      if (builtins.includes(id)) {
        tokens.push({ type: 'builtin', value: id })
      } else if (generics.includes(id)) {
        tokens.push({ type: 'generic', value: id })
      } else if (id[0] === id[0].toUpperCase()) {
        tokens.push({ type: 'entity', value: id })
      } else {
        tokens.push({ type: 'text', value: id })
      }
      remaining = remaining.slice(id.length)
      continue
    }

    // Any other character
    tokens.push({ type: 'text', value: remaining[0] })
    remaining = remaining.slice(1)
  }

  return tokens
}

// Extract navigation items from TypeScript code
interface NavItem {
  name: string
  service: string
  lineNumber: number
}

function extractNavItems(graph: Graph): { services: Record<string, NavItem[]> } {
  const services: Record<string, NavItem[]> = {}

  const entities = Object.entries(graph.entities || {}).sort((a, b) => a[0].localeCompare(b[0]))
  entities.forEach(([name, entity]) => {
    const service = entity.service || 'unknown'
    if (!services[service]) {
      services[service] = []
    }
    services[service].push({
      name,
      service,
      lineNumber: 0, // Will be calculated later
    })
  })

  return { services }
}

// Calculate line numbers for each interface
function calculateLineNumbers(tsCode: string, graph: Graph): Map<string, number> {
  const lineMap = new Map<string, number>()
  const lines = tsCode.split('\n')

  lines.forEach((line, idx) => {
    // Match interface declarations
    const interfaceMatch = line.match(/^export interface (\w+)/)
    if (interfaceMatch) {
      lineMap.set(interfaceMatch[1], idx + 1)
    }
  })

  return lineMap
}

export function TypeScriptGenerator({ graph }: TypeScriptGeneratorProps) {
  const codeRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const tsCode = generateTypeScript(graph)
  const lines = tsCode.split('\n')
  const totalLines = lines.length

  // Active entity tracking
  const [activeEntity, setActiveEntity] = useState<string | null>(null)

  // Calculate interface line numbers
  const lineMap = useMemo(() => calculateLineNumbers(tsCode, graph), [tsCode, graph])

  // Create reverse map: line number -> entity name
  const lineToEntity = useMemo(() => {
    const map = new Map<number, string>()
    lineMap.forEach((lineNum, entityName) => {
      map.set(lineNum, entityName)
    })
    return map
  }, [lineMap])

  // Extract navigation items
  const navData = useMemo(() => extractNavItems(graph), [graph])

  // Handle scroll to track active entity (with debounce)
  useEffect(() => {
    const codeEl = codeRef.current
    if (!codeEl) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId)

      timeoutId = setTimeout(() => {
        const lineHeight = 20
        const scrollTop = codeEl.scrollTop
        const currentLine = Math.floor(scrollTop / lineHeight) + 1

        // Find the entity that starts at or before the current line
        let closestEntity: string | null = null
        let closestLine = 0

        lineMap.forEach((lineNum, entityName) => {
          if (lineNum <= currentLine + 5 && lineNum > closestLine) {
            closestLine = lineNum
            closestEntity = entityName
          }
        })

        if (closestEntity !== activeEntity) {
          setActiveEntity(closestEntity)
        }
      }, 20)
    }

    // Initial check (immediate)
    const lineHeight = 20
    const scrollTop = codeEl.scrollTop
    const currentLine = Math.floor(scrollTop / lineHeight) + 1
    let closestEntity: string | null = null
    let closestLine = 0
    lineMap.forEach((lineNum, entityName) => {
      if (lineNum <= currentLine + 5 && lineNum > closestLine) {
        closestLine = lineNum
        closestEntity = entityName
      }
    })
    setActiveEntity(closestEntity)

    codeEl.addEventListener('scroll', handleScroll)

    return () => {
      codeEl.removeEventListener('scroll', handleScroll)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [lineMap])

  // Auto-scroll nav sidebar to keep active entity at ~20% from top
  useEffect(() => {
    if (!activeEntity || !navRef.current) return

    const activeButton = navRef.current.querySelector(`[data-entity="${activeEntity}"]`) as HTMLElement
    if (activeButton) {
      const navEl = navRef.current
      const targetPosition = navEl.clientHeight * 0.2 // 20% from top

      const buttonTopInNav = activeButton.offsetTop
      const targetScrollTop = buttonTopInNav - targetPosition

      navEl.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      })
    }
  }, [activeEntity])

  // Scroll to line
  const scrollToLine = useCallback((lineNum: number) => {
    if (codeRef.current) {
      const lineHeight = 20
      codeRef.current.scrollTop = (lineNum - 3) * lineHeight
    }
  }, [])

  // Scroll to interface by name
  const scrollToInterface = useCallback((name: string) => {
    const lineNum = lineMap.get(name)
    if (lineNum) {
      scrollToLine(lineNum)
    }
  }, [lineMap, scrollToLine])

  const handleCopy = () => {
    navigator.clipboard.writeText(tsCode)
  }

  const handleDownload = () => {
    const blob = new Blob([tsCode], { type: 'text/typescript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'schema-types.ts'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Count stats
  const entityCount = Object.keys(graph.entities || {}).length
  const fieldCount = Object.values(graph.entities || {}).reduce(
    (acc, entity) => acc + Object.keys(entity.fields || {}).length,
    0
  )
  const relationCount = Object.values(graph.entities || {}).reduce(
    (acc, entity) => acc + Object.keys(entity.relations || {}).length,
    0
  )

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

  const serviceNames = Object.keys(navData.services).sort()

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">
              {entityCount} interfaces, {fieldCount} fields, {relationCount} relations
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              title="Download as .ts file"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              title="Copy to clipboard"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden bg-[#0d1117]">
          {/* Line numbers */}
          <div
            className="flex-shrink-0 font-mono text-xs leading-[20px] bg-[#0d1117] border-r border-gray-800 overflow-hidden"
            style={{ minWidth: '50px' }}
          >
            {lineNumbers}
          </div>

          {/* Code */}
          <div
            ref={codeRef}
            className="dark-scrollbar flex-1 font-mono text-xs leading-[20px] overflow-auto pl-3"
          >
            {lines.map((line, i) => {
              // Empty lines
              if (!line.trim()) {
                return <div key={i} className="whitespace-pre" style={{ minHeight: '20px' }}>&nbsp;</div>
              }

              // Comments - #8b949e
              if (line.trim().startsWith('//')) {
                if (line.includes('===')) {
                  return <div key={i} className="whitespace-pre" style={{ color: COLORS.separator, minHeight: '20px' }}>{line}</div>
                }
                return <div key={i} className="whitespace-pre" style={{ color: COLORS.comment, minHeight: '20px' }}>{line}</div>
              }

              // Build highlighted line using spans
              const parts: React.ReactNode[] = []
              let key = 0

              // Type alias line: export type X = ... (must be checked BEFORE declMatch)
              const typeAliasMatch = line.match(/^(export\s+type\s+)(\w+)(\s*=\s*)(.+)$/)
              if (typeAliasMatch) {
                const [, prefix, typeName, eq, value] = typeAliasMatch
                parts.push(<span key={key++} style={{ color: COLORS.keyword }}>export type </span>)
                parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{typeName}</span>)
                parts.push(<span key={key++}>{eq}</span>)
                parts.push(...highlightType(value, key))
                return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{parts}</div>
              }

              // Interface declaration line: export interface X { or export interface X extends Y {
              const declMatch = line.match(/^(export\s+)(interface)\s+(\w+)(\s+extends\s+)?(\w+)?(.*)$/)
              if (declMatch) {
                const [, exportKw, keyword, name, extendsKw, parentName, rest] = declMatch
                parts.push(<span key={key++} style={{ color: COLORS.keyword }}>{exportKw}</span>)
                parts.push(<span key={key++} style={{ color: COLORS.keyword }}>{keyword}</span>)
                parts.push(<span key={key++}> </span>)
                parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{name}</span>)
                if (extendsKw) {
                  parts.push(<span key={key++} style={{ color: COLORS.keyword }}>{extendsKw}</span>)
                  if (parentName) {
                    parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{parentName}</span>)
                  }
                }
                parts.push(<span key={key++} style={{ color: COLORS.text }}>{rest}</span>)
                return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{parts}</div>
              }

              // Property line (indented with field: type)
              const propMatch = line.match(/^(\s+)(\w+)(\?)?:\s*(.+)$/)
              if (propMatch) {
                const [, indent, fieldName, optional, typeAndComment] = propMatch
                parts.push(<span key={key++}>{indent}</span>)
                parts.push(<span key={key++} style={{ color: COLORS.propertyName }}>{fieldName}</span>)
                if (optional) {
                  parts.push(<span key={key++} style={{ color: COLORS.keyword }}>?</span>)
                }
                parts.push(<span key={key++}>: </span>)

                // Parse type part (may include comment)
                const commentIdx = typeAndComment.indexOf('//')
                const typePart = commentIdx >= 0 ? typeAndComment.slice(0, commentIdx).trim() : typeAndComment
                const commentPart = commentIdx >= 0 ? typeAndComment.slice(commentIdx) : ''

                // Highlight type
                parts.push(...highlightType(typePart, key))
                key += 100 // Reserve keys for type highlighting

                if (commentPart) {
                  parts.push(<span key={key++} style={{ color: COLORS.comment }}> {commentPart}</span>)
                }

                return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{parts}</div>
              }

              // Const declaration
              const constMatch = line.match(/^(export\s+const\s+)(\w+)(\s*=\s*)(.+)$/)
              if (constMatch) {
                const [, prefix, name, eq, value] = constMatch
                parts.push(<span key={key++} style={{ color: COLORS.keyword }}>export const </span>)
                parts.push(<span key={key++} style={{ color: COLORS.typeName }}>{name}</span>)
                parts.push(<span key={key++}>{eq}</span>)
                parts.push(<span key={key++} style={{ color: COLORS.text }}>{value}</span>)
                return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{parts}</div>
              }

              // Object property in const: '  'key': [values] as const,'
              const objPropMatch = line.match(/^(\s+)'([^']+)':\s*\[(.+)\]\s*(as const)?,?$/)
              if (objPropMatch) {
                const [, indent, propName, values, asConst] = objPropMatch
                parts.push(<span key={key++}>{indent}</span>)
                parts.push(<span key={key++} style={{ color: COLORS.stringLiteral }}>'{propName}'</span>)
                parts.push(<span key={key++}>: [</span>)
                // Highlight string values
                const valueItems = values.split(/,\s*/)
                valueItems.forEach((v, idx) => {
                  if (v.startsWith("'")) {
                    parts.push(<span key={key++} style={{ color: COLORS.stringLiteral }}>{v}</span>)
                  } else {
                    parts.push(<span key={key++}>{v}</span>)
                  }
                  if (idx < valueItems.length - 1) parts.push(<span key={key++}>, </span>)
                })
                parts.push(<span key={key++}>]</span>)
                if (asConst) {
                  parts.push(<span key={key++} style={{ color: COLORS.keyword }}> as const</span>)
                }
                parts.push(<span key={key++}>,</span>)
                return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{parts}</div>
              }

              // Closing brace or other simple lines
              return <div key={i} className="whitespace-pre" style={{ color: COLORS.text, minHeight: '20px' }}>{line}</div>
            })}
          </div>

          {/* Navigation sidebar */}
          <div ref={navRef} className="dark-scrollbar w-56 flex-shrink-0 border-l border-gray-800 bg-[#161b22] overflow-auto">
            <div className="p-2 border-b border-gray-800">
              <span className="text-xs font-medium text-gray-400">OUTLINE</span>
            </div>
            <div className="p-2">
              {serviceNames.map((service) => {
                const isActiveService = navData.services[service]?.some(e => e.name === activeEntity)
                return (
                  <div key={service} className="mb-2">
                    <div
                      className={`flex items-center gap-1 text-xs font-medium mb-1 ${
                        isActiveService ? 'text-blue-400' : 'text-gray-500'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {service}
                    </div>
                    {navData.services[service]?.map((entity) => {
                      const isActive = entity.name === activeEntity
                      return (
                        <button
                          key={entity.name}
                          data-entity={entity.name}
                          onClick={() => scrollToInterface(entity.name)}
                          className={`w-full text-left px-2 py-0.5 text-xs rounded transition-colors truncate ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800'
                          }`}
                        >
                          {entity.name}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
