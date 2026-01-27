import type { OperationMode } from '@/types'

export interface ParsedMutationContent {
  entityName: string
  dataFields?: string[]
  responseFields?: string[]
}

export interface ParsedQueryContent {
  entityName: string
  selectedFields: Record<string, string[]>
  filters?: Record<string, unknown>
}

export type ParsedEditorContent = ParsedMutationContent | ParsedQueryContent | null

// Parse editor content to extract entity and fields
export function parseEditorContent(text: string, operationMode: OperationMode): ParsedEditorContent {
  try {
    const parsed = JSON.parse(text)

    // For mutations, look inside the operation wrapper
    if (operationMode !== 'query') {
      const operation = parsed[operationMode] || parsed.create || parsed.update || parsed.rewrite || parsed.delete
      if (operation) {
        const entityName = Object.keys(operation)[0]
        const entityData = operation[entityName] || {}
        return {
          entityName,
          dataFields: entityData.data ? Object.keys(entityData.data) : [],
          responseFields: entityData.response || [],
        }
      }
    }

    // For query mode, find root entity
    const knownKeys = ['action', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction']
    const entityName = Object.keys(parsed).find(k => !knownKeys.includes(k) && k[0] === k[0].toUpperCase())

    if (entityName) {
      const entityData = parsed[entityName] || {}

      // Extract fields recursively
      const extractFields = (data: Record<string, unknown>, path = entityName): Record<string, string[]> => {
        const result: Record<string, string[]> = { [path]: (data.fields as string[]) || [] }
        if (data.relations && typeof data.relations === 'object') {
          for (const [relName, relData] of Object.entries(data.relations as Record<string, Record<string, unknown>>)) {
            const relPath = `${path}.${relName}`
            Object.assign(result, extractFields(relData, relPath))
          }
        }
        return result
      }

      return {
        entityName,
        selectedFields: extractFields(entityData),
        filters: (entityData.filters as Record<string, unknown>) || {},
      }
    }

    return null
  } catch {
    return null
  }
}

// Extract entity names from query text (for highlighting in Monaco)
export function extractEntityNames(queryText: string, knownEntities?: string[]): string[] {
  try {
    const parsed = JSON.parse(queryText)
    if (typeof parsed !== 'object' || parsed === null) return []
    const keys = Object.keys(parsed)
    // If knownEntities provided, filter by them. Otherwise, check if key starts with uppercase letter.
    return keys.filter(k => {
      if (knownEntities) {
        return knownEntities.includes(k) || (k[0] === k[0].toUpperCase() && k[0] !== k[0].toLowerCase())
      }
      // Without knownEntities, just check for capitalized keys (entity names start with uppercase)
      return /^[A-Z]/.test(k)
    })
  } catch {
    return []
  }
}

// Find entity context from Monaco editor position
export function findEntityContext(text: string): string | null {
  // Find the last entity-like key before cursor
  const matches = text.match(/"([A-Z][a-zA-Z0-9_]*)":/g)
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return lastMatch.replace(/["":]/g, '')
  }
  return null
}
