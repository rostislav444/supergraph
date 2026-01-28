import React from 'react'
import type { Graph, Field, Relation } from '@/types'

interface TypeScriptGeneratorProps {
  graph: Graph
}

const MAX_LINE_LENGTH = 120

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

// Helper to highlight type expressions
function highlightType(typeStr: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let key = startKey

  // Split by pipe for union types
  const unionParts = typeStr.split(/\s*\|\s*/)

  unionParts.forEach((part, idx) => {
    const trimmed = part.trim()

    // Built-in types
    if (['string', 'number', 'boolean', 'null', 'unknown'].includes(trimmed)) {
      parts.push(<span key={key++} style={{ color: '#79c0ff' }}>{trimmed}</span>)
    }
    // String literal
    else if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      parts.push(<span key={key++} style={{ color: '#a5d6ff' }}>{trimmed}</span>)
    }
    // Generic types like Omit<X, 'id'>, Record<string, unknown>
    else if (trimmed.match(/^(Omit|Partial|Pick|Record|Array)</)) {
      const match = trimmed.match(/^(\w+)<(.+)>$/)
      if (match) {
        const [, genericName, inner] = match
        parts.push(<span key={key++} style={{ color: '#ffa657' }}>{genericName}</span>)
        parts.push(<span key={key++}>{'<'}</span>)
        parts.push(...highlightType(inner, key))
        key += 50
        parts.push(<span key={key++}>{'>'}</span>)
      } else {
        parts.push(<span key={key++} style={{ color: '#ffa657' }}>{trimmed}</span>)
      }
    }
    // Array type like Entity[]
    else if (trimmed.endsWith('[]')) {
      const baseName = trimmed.slice(0, -2)
      parts.push(<span key={key++} style={{ color: '#ffa657' }}>{baseName}</span>)
      parts.push(<span key={key++}>[]</span>)
    }
    // Entity reference
    else if (trimmed.match(/^[A-Z]\w*$/)) {
      parts.push(<span key={key++} style={{ color: '#ffa657' }}>{trimmed}</span>)
    }
    // Other (like comma in generics)
    else {
      parts.push(<span key={key++}>{trimmed}</span>)
    }

    // Add pipe between union parts
    if (idx < unionParts.length - 1) {
      parts.push(<span key={key++} style={{ color: '#ff7b72' }}> | </span>)
    }
  })

  return parts
}

export function TypeScriptGenerator({ graph }: TypeScriptGeneratorProps) {
  const tsCode = generateTypeScript(graph)

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

  return (
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

      {/* Code - GitHub Dark theme */}
      <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
        <pre className="font-mono text-xs leading-relaxed">
          <code>
            {tsCode.split('\n').map((line, i) => {
              // Empty lines
              if (!line.trim()) {
                return <div key={i} className="h-4">&nbsp;</div>
              }

              // Comments - #8b949e
              if (line.trim().startsWith('//')) {
                if (line.includes('===')) {
                  return <div key={i} style={{ color: '#6e7681' }}>{line}</div>
                }
                return <div key={i} style={{ color: '#8b949e' }}>{line}</div>
              }

              // Build highlighted line using spans
              const parts: React.ReactNode[] = []
              let key = 0

              // Interface/type declaration line
              const declMatch = line.match(/^(export\s+)(interface|type)\s+(\w+)(\s+extends\s+)?(\w+)?(.*)$/)
              if (declMatch) {
                const [, exportKw, keyword, name, extendsKw, parentName, rest] = declMatch
                parts.push(<span key={key++} style={{ color: '#ff7b72' }}>{exportKw}</span>)
                parts.push(<span key={key++} style={{ color: '#ff7b72' }}>{keyword}</span>)
                parts.push(<span key={key++}> </span>)
                parts.push(<span key={key++} style={{ color: '#ffa657' }}>{name}</span>)
                if (extendsKw) {
                  parts.push(<span key={key++} style={{ color: '#ff7b72' }}>{extendsKw}</span>)
                  if (parentName) {
                    parts.push(<span key={key++} style={{ color: '#ffa657' }}>{parentName}</span>)
                  }
                }
                parts.push(<span key={key++} style={{ color: '#c9d1d9' }}>{rest}</span>)
                return <div key={i} style={{ color: '#c9d1d9' }}>{parts}</div>
              }

              // Property line (indented with field: type)
              const propMatch = line.match(/^(\s+)(\w+)(\?)?:\s*(.+)$/)
              if (propMatch) {
                const [, indent, fieldName, optional, typeAndComment] = propMatch
                parts.push(<span key={key++}>{indent}</span>)
                parts.push(<span key={key++} style={{ color: '#c9d1d9' }}>{fieldName}</span>)
                if (optional) {
                  parts.push(<span key={key++} style={{ color: '#ff7b72' }}>?</span>)
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
                  parts.push(<span key={key++} style={{ color: '#8b949e' }}> {commentPart}</span>)
                }

                return <div key={i} style={{ color: '#c9d1d9' }}>{parts}</div>
              }

              // Type alias line: export type X = ...
              const typeAliasMatch = line.match(/^(export\s+type\s+)(\w+)(\s*=\s*)(.+)$/)
              if (typeAliasMatch) {
                const [, prefix, typeName, eq, value] = typeAliasMatch
                parts.push(<span key={key++} style={{ color: '#ff7b72' }}>export type </span>)
                parts.push(<span key={key++} style={{ color: '#ffa657' }}>{typeName}</span>)
                parts.push(<span key={key++}>{eq}</span>)
                parts.push(...highlightType(value, key))
                return <div key={i} style={{ color: '#c9d1d9' }}>{parts}</div>
              }

              // Const declaration
              const constMatch = line.match(/^(export\s+const\s+)(\w+)(\s*=\s*)(.+)$/)
              if (constMatch) {
                const [, prefix, name, eq, value] = constMatch
                parts.push(<span key={key++} style={{ color: '#ff7b72' }}>export const </span>)
                parts.push(<span key={key++} style={{ color: '#ffa657' }}>{name}</span>)
                parts.push(<span key={key++}>{eq}</span>)
                parts.push(<span key={key++} style={{ color: '#c9d1d9' }}>{value}</span>)
                return <div key={i} style={{ color: '#c9d1d9' }}>{parts}</div>
              }

              // Object property in const: '  'key': [values] as const,'
              const objPropMatch = line.match(/^(\s+)'([^']+)':\s*\[(.+)\]\s*(as const)?,?$/)
              if (objPropMatch) {
                const [, indent, propName, values, asConst] = objPropMatch
                parts.push(<span key={key++}>{indent}</span>)
                parts.push(<span key={key++} style={{ color: '#a5d6ff' }}>'{propName}'</span>)
                parts.push(<span key={key++}>: [</span>)
                // Highlight string values
                const valueItems = values.split(/,\s*/)
                valueItems.forEach((v, idx) => {
                  if (v.startsWith("'")) {
                    parts.push(<span key={key++} style={{ color: '#a5d6ff' }}>{v}</span>)
                  } else {
                    parts.push(<span key={key++}>{v}</span>)
                  }
                  if (idx < valueItems.length - 1) parts.push(<span key={key++}>, </span>)
                })
                parts.push(<span key={key++}>]</span>)
                if (asConst) {
                  parts.push(<span key={key++} style={{ color: '#ff7b72' }}> as const</span>)
                }
                parts.push(<span key={key++}>,</span>)
                return <div key={i} style={{ color: '#c9d1d9' }}>{parts}</div>
              }

              // Closing brace or other simple lines
              return <div key={i} style={{ color: '#c9d1d9' }}>{line}</div>
            })}
          </code>
        </pre>
      </div>
    </div>
  )
}
