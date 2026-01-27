import { COLUMN_PRIORITY } from '@constants/filters'

// Sort columns with priority fields first
export function sortColumns(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aIdx = COLUMN_PRIORITY.indexOf(aLower as typeof COLUMN_PRIORITY[number])
    const bIdx = COLUMN_PRIORITY.indexOf(bLower as typeof COLUMN_PRIORITY[number])

    // Both are priority fields - sort by priority order
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    // Only a is priority field - a comes first
    if (aIdx !== -1) return -1
    // Only b is priority field - b comes first
    if (bIdx !== -1) return 1
    // Neither is priority - alphabetical
    return a.localeCompare(b)
  })
}

// Detect column type from values
export function detectColumnType(
  items: Record<string, unknown>[],
  key: string
): 'string' | 'number' | 'boolean' | 'enum' | 'object' {
  const values = items.map(item => item?.[key]).filter(v => v !== null && v !== undefined)
  if (values.length === 0) return 'string'

  const first = values[0]
  if (typeof first === 'boolean') return 'boolean'
  if (typeof first === 'number') return 'number'
  if (typeof first === 'object') return 'object'

  // Check if string looks like enum
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length <= 10 && uniqueValues.every(v => typeof v === 'string' && (v as string).length < 30)) {
    return 'enum'
  }

  return 'string'
}

// Check if value looks like an enum
export function isEnumLike(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'string') return false
  // Short value (1-30 chars)
  if (value.length > 30 || value.length < 1) return false
  // Field name hints
  const enumFields = ['status', 'type', 'kind', 'state', 'role', 'category', 'priority', 'level', 'mode']
  const fieldLower = fieldName.toLowerCase()
  if (enumFields.some(f => fieldLower.includes(f))) return true
  // Value pattern: UPPER_CASE, snake_case, or single word
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return true // UPPER_CASE
  if (/^[a-z][a-z0-9_]+$/.test(value) && value.includes('_')) return true // snake_case
  if (/^[a-z]+$/.test(value) && value.length <= 15) return true // single lowercase word
  return false
}

// Check if field should be treated as text (description, notes, etc)
export function isTextField(fieldName: string): boolean {
  const textFields = [
    'description', 'content', 'text', 'body', 'notes',
    'comment', 'message', 'summary', 'details', 'bio', 'about',
  ]
  const fieldLower = fieldName.toLowerCase()
  return textFields.some(f => fieldLower.includes(f))
}
