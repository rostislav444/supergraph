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
              // GitHub Dark syntax highlighting
              let highlighted = line

              // Empty lines
              if (!line.trim()) {
                return <div key={i} className="h-4">&nbsp;</div>
              }

              // Comments - #8b949e
              if (line.trim().startsWith('//')) {
                // Highlight === lines differently
                if (line.includes('===')) {
                  return <div key={i} style={{ color: '#6e7681' }}>{line}</div>
                }
                return <div key={i} style={{ color: '#8b949e' }}>{line}</div>
              }

              // Escape HTML
              highlighted = highlighted
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')

              // Keywords - #ff7b72 (red/pink)
              highlighted = highlighted.replace(
                /\b(export|interface|type|extends|const|as|readonly)\b/g,
                '<span style="color:#ff7b72">$1</span>'
              )

              // Type/Interface names after keywords - #ffa657 (orange)
              highlighted = highlighted.replace(
                /(<span style="color:#ff7b72">(?:interface|type)<\/span>)\s+(\w+)/g,
                '$1 <span style="color:#ffa657">$2</span>'
              )

              // Entity names after extends - #ffa657 (orange)
              highlighted = highlighted.replace(
                /(<span style="color:#ff7b72">extends<\/span>)\s+(\w+)/g,
                '$1 <span style="color:#ffa657">$2</span>'
              )

              // Generic types like Omit<X, 'id'>, Partial<X>, Record<X, Y>
              highlighted = highlighted.replace(
                /\b(Omit|Partial|Pick|Record|Array)&lt;/g,
                '<span style="color:#ffa657">$1</span>&lt;'
              )

              // Built-in types - #79c0ff (blue)
              highlighted = highlighted.replace(
                /:\s*(string|number|boolean|null|unknown)\b/g,
                ': <span style="color:#79c0ff">$1</span>'
              )

              // Type references in union/array - #ffa657
              highlighted = highlighted.replace(
                /(\[\])(?!\w)/g,
                '<span style="color:#c9d1d9">$1</span>'
              )

              // String literals in types - #a5d6ff (light blue)
              highlighted = highlighted.replace(
                /'([^']+)'/g,
                '<span style="color:#a5d6ff">\'$1\'</span>'
              )

              // Property names - #c9d1d9 (handled by default)
              // Optional marker ? - #ff7b72
              highlighted = highlighted.replace(
                /(\w+)(\?)?:/g,
                '<span style="color:#c9d1d9">$1</span>$2:'
              )

              // Brackets and punctuation - #c9d1d9
              highlighted = highlighted.replace(
                /([{}[\]()])/g,
                '<span style="color:#c9d1d9">$1</span>'
              )

              // Pipe operator for unions - #ff7b72
              highlighted = highlighted.replace(
                / \| /g,
                ' <span style="color:#ff7b72">|</span> '
              )

              return (
                <div
                  key={i}
                  style={{ color: '#c9d1d9' }}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              )
            })}
          </code>
        </pre>
      </div>
    </div>
  )
}
