import type { Graph, Field, Relation } from '@/types'

interface TypeScriptGeneratorProps {
  graph: Graph
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
        lines.push(`  ${fieldName}${optional}: ${tsType}${fkComment}`)
      })

      lines.push('}')
      lines.push('')

      // Generate interface with relations if entity has relations
      const relations = Object.entries(entity.relations || {})
      if (relations.length > 0) {
        lines.push(`export interface ${entityName}WithRelations extends ${entityName} {`)

        relations.sort((a, b) => a[0].localeCompare(b[0])).forEach(([relName, rel]) => {
          const relation = rel as Relation
          const relType = relation.cardinality === 'many'
            ? `${relation.target}[]`
            : `${relation.target} | null`
          lines.push(`  ${relName}?: ${relType}`)
        })

        lines.push('}')
        lines.push('')
      }
    })
  })

  // Generate utility types
  lines.push(`// ============================================================================`)
  lines.push(`// Utility Types`)
  lines.push(`// ============================================================================`)
  lines.push('')

  // Entity names union
  const entityNames = entities.map(([name]) => `'${name}'`).join(' | ')
  lines.push(`export type EntityName = ${entityNames}`)
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
    lines.push(`  '${service}': [${entityList}] as const,`)
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

      {/* Code */}
      <div className="flex-1 overflow-auto p-4 bg-[#0D1117]">
        <pre className="font-mono text-sm leading-relaxed">
          <code>
            {tsCode.split('\n').map((line, i) => {
              // Syntax highlighting
              let highlighted = line

              // Comments
              if (line.trim().startsWith('//')) {
                return <div key={i} className="text-gray-500">{line}</div>
              }

              // Export keywords
              highlighted = highlighted.replace(
                /\b(export|interface|type|extends|const|as)\b/g,
                '<span class="text-purple-400">$1</span>'
              )

              // Type names (after interface/type keywords)
              highlighted = highlighted.replace(
                /\b(interface|type)\s+(\w+)/g,
                '<span class="text-purple-400">$1</span> <span class="text-yellow-300">$2</span>'
              )

              // Built-in types
              highlighted = highlighted.replace(
                /:\s*(string|number|boolean|null|unknown|Record<[^>]+>)/g,
                ': <span class="text-cyan-400">$1</span>'
              )

              // String literals
              highlighted = highlighted.replace(
                /'([^']+)'/g,
                '<span class="text-green-400">\'$1\'</span>'
              )

              return (
                <div
                  key={i}
                  className="text-gray-300"
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
