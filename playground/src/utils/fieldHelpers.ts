import type { Field } from '@/types'
import {
  TEST_FIRST_NAMES,
  TEST_LAST_NAMES,
  TEST_CITIES,
  TEST_COUNTRIES,
  SPECIAL_FK_MAPPINGS,
} from '@constants/testData'

// Get default value for field type
export function getDefaultValue(field: Field): unknown {
  switch (field.type) {
    case 'string': return ''
    case 'int': return 0
    case 'bool': return false
    case 'datetime': return new Date().toISOString()
    case 'date': return new Date().toISOString().slice(0, 10)
    case 'json': return {}
    case 'enum':
      return field.enum_values?.[0] || ''
    default: return null
  }
}

// Check if field is required (not nullable and no default)
export function isFieldRequired(field: Field, fieldName: string): boolean {
  // id is auto-generated, never required for create
  if (fieldName === 'id') return false
  // If explicitly marked as required
  if (field.required) return true
  // If not nullable (common pattern)
  if (field.nullable === false) return true
  return false
}

// Generate test data based on field name and type
export function generateTestData(fieldName: string, field: Field): unknown {
  const name = fieldName.toLowerCase()

  // Handle enums - pick random value
  if (field.type === 'enum' && field.enum_values?.length) {
    return field.enum_values[Math.floor(Math.random() * field.enum_values.length)]
  }

  // Handle booleans
  if (field.type === 'bool') {
    return Math.random() > 0.5
  }

  // Handle datetime
  if (field.type === 'datetime' || name.includes('date') || name.includes('time')) {
    return new Date().toISOString()
  }

  // Handle date
  if (field.type === 'date') {
    return new Date().toISOString().slice(0, 10)
  }

  // Handle integers - check for common patterns
  if (field.type === 'int') {
    if (name.includes('year')) return new Date().getFullYear()
    if (name.includes('age')) return Math.floor(Math.random() * 50) + 18
    if (name.includes('count') || name.includes('quantity')) return Math.floor(Math.random() * 100) + 1
    if (name.includes('price') || name.includes('cost') || name.includes('amount')) return Math.floor(Math.random() * 10000) + 100
    if (name.includes('level') || name.includes('priority')) return Math.floor(Math.random() * 5) + 1
    if (name.endsWith('_id')) return Math.floor(Math.random() * 100) + 1
    return Math.floor(Math.random() * 1000) + 1
  }

  // Handle strings - check for common patterns
  if (field.type === 'string') {
    // Names
    if (name === 'first_name' || name === 'firstname') {
      return TEST_FIRST_NAMES[Math.floor(Math.random() * TEST_FIRST_NAMES.length)]
    }
    if (name === 'last_name' || name === 'lastname' || name === 'surname') {
      return TEST_LAST_NAMES[Math.floor(Math.random() * TEST_LAST_NAMES.length)]
    }
    if (name === 'name' || name === 'title') {
      return `Test ${Math.floor(Math.random() * 1000)}`
    }
    if (name === 'full_name' || name === 'fullname') {
      const first = TEST_FIRST_NAMES[Math.floor(Math.random() * TEST_FIRST_NAMES.length)]
      const last = TEST_LAST_NAMES[Math.floor(Math.random() * TEST_LAST_NAMES.length)]
      return `${first} ${last}`
    }

    // Contact info
    if (name.includes('email')) {
      return `test${Math.floor(Math.random() * 1000)}@example.com`
    }
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`
    }

    // Address
    if (name.includes('address') || name.includes('street')) {
      return `${Math.floor(Math.random() * 999) + 1} Main Street`
    }
    if (name.includes('city')) {
      return TEST_CITIES[Math.floor(Math.random() * TEST_CITIES.length)]
    }
    if (name.includes('country')) {
      return TEST_COUNTRIES[Math.floor(Math.random() * TEST_COUNTRIES.length)]
    }
    if (name.includes('zip') || name.includes('postal')) {
      return String(Math.floor(Math.random() * 90000) + 10000)
    }

    // URLs and IDs
    if (name.includes('url') || name.includes('link') || name.includes('website')) {
      return `https://example.com/${Math.floor(Math.random() * 1000)}`
    }
    if (name.includes('code') || name.includes('external_id') || name.includes('sku')) {
      return `CODE-${Math.floor(Math.random() * 10000)}`
    }

    // Descriptions
    if (name.includes('description') || name.includes('comment') || name.includes('note')) {
      return `Test description ${Math.floor(Math.random() * 1000)}`
    }

    // Path
    if (name.includes('path')) {
      return `/path/to/item/${Math.floor(Math.random() * 100)}`
    }

    // Default string
    return `Test ${fieldName} ${Math.floor(Math.random() * 100)}`
  }

  // Default fallback
  return getDefaultValue(field)
}

// Infer target entity name from FK field name
export function inferTargetEntity(
  fieldName: string,
  currentEntity: string,
  allEntities: string[]
): string | null {
  if (!fieldName.endsWith('_id')) return null

  // Remove _id suffix
  const baseName = fieldName.slice(0, -3)

  // Handle special cases
  if (baseName === 'parent') return currentEntity // self-reference

  // Check special mappings first
  if (SPECIAL_FK_MAPPINGS[baseName]) {
    const mapped = SPECIAL_FK_MAPPINGS[baseName]
    if (mapped === 'self') return currentEntity
    if (allEntities.includes(mapped)) return mapped
  }

  // Convert snake_case to PascalCase
  const pascalCase = baseName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  // Check if entity exists
  if (allEntities.includes(pascalCase)) return pascalCase

  // Try common variations
  const variations = [
    pascalCase,
    pascalCase + 's', // plural
    pascalCase.slice(0, -1), // singular from plural
  ]

  for (const variant of variations) {
    if (allEntities.includes(variant)) return variant
  }

  return null
}
