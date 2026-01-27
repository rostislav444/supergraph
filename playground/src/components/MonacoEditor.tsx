// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Editor, { useMonaco } from '@monaco-editor/react'
import { setQueryText, selectQueryText, executeQuery, selectOperationMode } from '../store/querySlice'
import { selectGraph } from '../store/graphSlice'
import { Toast } from '@atoms/Toast'

// Custom theme for dark mode
const DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '9CDCFE' },
    { token: 'string.value.json', foreground: 'CE9178' },
    { token: 'number.json', foreground: 'B5CEA8' },
    { token: 'keyword.json', foreground: '569CD6' },
  ],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#C9D1D9',
    'editorLineNumber.foreground': '#6E7681',
    'editorLineNumber.activeForeground': '#C9D1D9',
    'editor.lineHighlightBackground': '#161B22',
    'editor.selectionBackground': '#264F78',
    'editorCursor.foreground': '#58A6FF',
  },
}

// JSON validation based on graph schema
function createValidator(graph) {
  return (model) => {
    const markers = []

    if (!graph) return markers

    try {
      const text = model.getValue()
      const parsed = JSON.parse(text)

      // Validate entity names
      const validateEntity = (obj, path = '') => {
        for (const key of Object.keys(obj)) {
          // Skip known keywords
          if (['fields', 'filters', 'order', 'limit', 'offset', 'relations', 'data', 'response', 'action', 'entity', 'select', 'query', 'create', 'update', 'delete', 'rewrite', 'transaction', 'id'].includes(key)) {
            continue
          }

          // Check if this looks like an entity name
          if (key[0] === key[0].toUpperCase() && !graph.entities[key]) {
            // Find position in text
            const keyPattern = new RegExp(`"${key}"\\s*:`)
            const match = text.match(keyPattern)
            if (match) {
              const startIndex = text.indexOf(match[0])
              const startPos = model.getPositionAt(startIndex)
              const endPos = model.getPositionAt(startIndex + key.length + 2)

              markers.push({
                severity: 8, // Error
                message: `Unknown entity: "${key}"`,
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              })
            }
          }
        }
      }

      validateEntity(parsed)

      // Validate fields in nested queries
      const validateFields = (query, entityName, path = '') => {
        if (!query || typeof query !== 'object') return

        const entity = graph.entities[entityName]
        if (!entity) return

        // Validate fields array
        if (query.fields && Array.isArray(query.fields)) {
          for (const field of query.fields) {
            if (!entity.fields[field]) {
              const fieldPattern = new RegExp(`"${field}"`)
              const match = text.match(fieldPattern)
              if (match) {
                const startIndex = text.indexOf(match[0])
                const startPos = model.getPositionAt(startIndex)
                const endPos = model.getPositionAt(startIndex + field.length + 2)

                markers.push({
                  severity: 4, // Warning
                  message: `Unknown field "${field}" on entity "${entityName}"`,
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                })
              }
            }
          }
        }

        // Validate relations
        if (query.relations && typeof query.relations === 'object') {
          for (const [relName, relQuery] of Object.entries(query.relations)) {
            if (!entity.relations || !entity.relations[relName]) {
              const relPattern = new RegExp(`"${relName}"\\s*:`)
              const match = text.match(relPattern)
              if (match) {
                const startIndex = text.indexOf(match[0])
                const startPos = model.getPositionAt(startIndex)
                const endPos = model.getPositionAt(startIndex + relName.length + 2)

                markers.push({
                  severity: 8,
                  message: `Unknown relation "${relName}" on entity "${entityName}"`,
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                })
              }
            } else {
              const targetEntity = entity.relations[relName].target
              validateFields(relQuery, targetEntity, `${path}.${relName}`)
            }
          }
        }
      }

      // Find root entity and validate
      for (const [key, value] of Object.entries(parsed)) {
        if (graph.entities[key]) {
          validateFields(value, key, key)
        }
      }

    } catch (e) {
      // JSON parse error - Monaco will handle this
    }

    return markers
  }
}

// Helper to find current entity context by analyzing text before cursor
function findEntityContext(text) {
  // Find the last entity name mentioned in the text
  const entityMatches = [...text.matchAll(/"([A-Z][a-zA-Z0-9_]+)"\s*:/g)]
  if (entityMatches.length > 0) {
    // Filter out keywords
    const keywords = ['fields', 'filters', 'relations', 'order', 'data', 'response', 'id', 'limit', 'offset', 'create', 'update', 'rewrite', 'delete', 'query', 'transaction']
    for (let i = entityMatches.length - 1; i >= 0; i--) {
      const name = entityMatches[i][1]
      if (!keywords.includes(name.toLowerCase())) {
        return name
      }
    }
  }
  return null
}

// Autocomplete provider
function createCompletionProvider(graph, operationMode) {
  return {
    triggerCharacters: ['"', ':', '[', '{', ','],
    provideCompletionItems: (model, position) => {
      if (!graph || !graph.entities) return { suggestions: [] }

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const isMutationMode = operationMode !== 'query'
      const isDeleteMode = operationMode === 'delete'
      const isCreateMode = operationMode === 'create'

      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      }

      const suggestions = []

      // Check context
      const lastLine = model.getLineContent(position.lineNumber)
      const beforeCursor = lastLine.substring(0, position.column - 1).trimEnd()

      // Find current entity context
      const currentEntity = findEntityContext(textUntilPosition)
      const entity = currentEntity ? graph.entities[currentEntity] : null

      // Detect context more accurately
      const isInArray = beforeCursor.endsWith('[') || beforeCursor.endsWith(',') && textUntilPosition.lastIndexOf('[') > textUntilPosition.lastIndexOf(']')
      const isAfterColon = beforeCursor.endsWith(':')
      const isAfterBrace = beforeCursor.endsWith('{')
      const isInString = beforeCursor.endsWith('"') || (beforeCursor.match(/"[^"]*$/) && !beforeCursor.endsWith('":'))

      // Check what array/object we're inside
      const inFieldsArray = textUntilPosition.match(/"fields"\s*:\s*\[[^\]]*$/)
      const inResponseArray = textUntilPosition.match(/"response"\s*:\s*\[[^\]]*$/)
      const inFiltersObject = textUntilPosition.match(/"filters"\s*:\s*\{[^}]*$/)
      const inRelationsObject = textUntilPosition.match(/"relations"\s*:\s*\{[^}]*$/)
      const inDataObject = textUntilPosition.match(/"data"\s*:\s*\{[^}]*$/)
      const inMutationWrapper = textUntilPosition.match(/"(create|update|rewrite|delete)"\s*:\s*\{[^}]*$/)
      const isRootLevel = textUntilPosition.match(/^\s*\{[^{}]*$/) || textUntilPosition.match(/^\s*\{\s*"(create|update|rewrite|delete)"\s*:\s*\{[^{}]*$/)

      // Check if we're inside a string (cursor is after opening quote but before closing quote)
      const lineBeforeCursor = lastLine.substring(0, position.column - 1)
      const isInsideString = (lineBeforeCursor.match(/"/g) || []).length % 2 === 1

      // Check if we need to add a comma after previous value
      const getCommaEdit = (() => {
        if (position.lineNumber <= 1) return null
        // Look at previous non-empty lines
        for (let i = position.lineNumber - 1; i >= 1; i--) {
          const prevLine = model.getLineContent(i)
          const prevLineTrimmed = prevLine.trim()
          if (prevLineTrimmed === '') continue
          // If previous line ends with [ or { or , - no comma needed
          if (prevLineTrimmed.endsWith('[') || prevLineTrimmed.endsWith('{') || prevLineTrimmed.endsWith(',')) {
            return null
          }
          // If previous line ends with a value (string, number, etc) - needs comma at end of that line
          if (prevLineTrimmed.endsWith('"') || prevLineTrimmed.match(/\d$/) || prevLineTrimmed.endsWith('true') || prevLineTrimmed.endsWith('false') || prevLineTrimmed.endsWith('null') || prevLineTrimmed.endsWith(']') || prevLineTrimmed.endsWith('}')) {
            return {
              range: {
                startLineNumber: i,
                startColumn: prevLine.length + 1,
                endLineNumber: i,
                endColumn: prevLine.length + 1,
              },
              text: ',',
            }
          }
          break
        }
        return null
      })()

      // Inside "fields": [...] or "response": [...] - suggest field names
      if ((inFieldsArray || inResponseArray) && entity) {
        for (const [fieldName, field] of Object.entries(entity.fields)) {
          // If inside string, don't add quotes; otherwise add them
          const insertText = isInsideString ? fieldName : `"${fieldName}"`

          // Adjust range to include the opening quote if we're inside a string
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          const item = {
            label: fieldName,
            kind: 5, // Field
            insertText,
            detail: field.type,
            range: adjustedRange,
            sortText: fieldName === 'id' ? '0' : fieldName,
            filterText: fieldName,
          }
          if (getCommaEdit && !isInsideString) {
            item.additionalTextEdits = [getCommaEdit]
          }
          suggestions.push(item)
        }
        return { suggestions }
      }

      // Inside "filters": {...} - suggest filter keys
      if (inFiltersObject && entity && !isMutationMode) {
        for (const [fieldName, field] of Object.entries(entity.fields)) {
          const filters = field.filters || ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'like', 'in']
          for (const op of filters) {
            const filterKey = `${fieldName}__${op}`
            const insertText = isInsideString ? filterKey : `"${filterKey}": `
            const adjustedRange = isInsideString ? {
              startLineNumber: position.lineNumber,
              startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            } : range

            const item = {
              label: filterKey,
              kind: 5,
              insertText,
              detail: `${field.type} filter`,
              range: adjustedRange,
              filterText: filterKey,
            }
            if (getCommaEdit && !isInsideString) {
              item.additionalTextEdits = [getCommaEdit]
            }
            suggestions.push(item)
          }
        }
        return { suggestions }
      }

      // Inside "relations": {...} - suggest relation names
      if (inRelationsObject && entity && entity.relations) {
        for (const [relName, rel] of Object.entries(entity.relations)) {
          const insertText = isInsideString ? relName : `"${relName}": {\n  "fields": ["id"]\n}`
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          const item = {
            label: relName,
            kind: 18, // Reference
            insertText,
            insertTextRules: isInsideString ? 0 : 4,
            detail: `-> ${rel.target} (${rel.cardinality})`,
            range: adjustedRange,
            filterText: relName,
          }
          if (getCommaEdit && !isInsideString) {
            item.additionalTextEdits = [getCommaEdit]
          }
          suggestions.push(item)
        }
        return { suggestions }
      }

      // Inside "data": {...} - suggest field names for mutations or enum values
      if (inDataObject && entity) {
        // Check if we're typing a value for a specific field (after "fieldName": )
        const fieldValueMatch = textUntilPosition.match(/"(\w+)"\s*:\s*"?([^",}]*)$/)
        if (fieldValueMatch && isInsideString) {
          const fieldName = fieldValueMatch[1]
          const field = entity.fields[fieldName]

          // If it's an enum field, suggest enum values
          if (field && field.type === 'enum' && field.enum_values) {
            const adjustedRange = {
              startLineNumber: position.lineNumber,
              startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            }

            for (const enumValue of field.enum_values) {
              suggestions.push({
                label: enumValue,
                kind: 13, // Enum
                insertText: enumValue,
                detail: `${fieldName} enum value`,
                range: adjustedRange,
                filterText: enumValue,
              })
            }
            return { suggestions }
          }
        }

        // Suggest field names
        for (const [fieldName, field] of Object.entries(entity.fields)) {
          if (fieldName === 'id' && isCreateMode) continue

          // For enum fields, use first enum value as default
          let insertValue
          if (field.type === 'enum' && field.enum_values?.length > 0) {
            insertValue = `"${field.enum_values[0]}"`
          } else if (field.type === 'string') {
            insertValue = '""'
          } else if (field.type === 'int' || field.type === 'integer') {
            insertValue = '0'
          } else if (field.type === 'float' || field.type === 'double') {
            insertValue = '0.0'
          } else if (field.type === 'bool' || field.type === 'boolean') {
            insertValue = 'false'
          } else if (field.type === 'datetime') {
            insertValue = `"${new Date().toISOString()}"`
          } else {
            insertValue = 'null'
          }

          const insertText = isInsideString ? fieldName : `"${fieldName}": ${insertValue}`
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          // Show enum values in detail for enum fields
          const detail = field.type === 'enum' && field.enum_values
            ? `enum: ${field.enum_values.join(' | ')}`
            : field.type

          const item = {
            label: fieldName,
            kind: field.type === 'enum' ? 13 : 5, // Enum or Field
            insertText,
            detail,
            range: adjustedRange,
            filterText: fieldName,
          }
          if (getCommaEdit && !isInsideString) {
            item.additionalTextEdits = [getCommaEdit]
          }
          suggestions.push(item)
        }
        return { suggestions }
      }

      // Inside mutation wrapper - suggest entities
      if (inMutationWrapper) {
        const mutationType = inMutationWrapper[1]
        for (const [entityName, entityData] of Object.entries(graph.entities)) {
          let template
          if (mutationType === 'delete') {
            template = `"${entityName}": {\n  "id": 1\n}`
          } else if (mutationType === 'create') {
            template = `"${entityName}": {\n  "data": {},\n  "response": ["id"]\n}`
          } else {
            template = `"${entityName}": {\n  "id": 1,\n  "data": {},\n  "response": ["id"]\n}`
          }

          const insertText = isInsideString ? entityName : template
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          const item = {
            label: entityName,
            kind: 9, // Class
            insertText,
            insertTextRules: isInsideString ? 0 : 4,
            detail: `Entity (${entityData.service})`,
            range: adjustedRange,
            filterText: entityName,
          }
          if (getCommaEdit && !isInsideString) {
            item.additionalTextEdits = [getCommaEdit]
          }
          suggestions.push(item)
        }
        return { suggestions }
      }

      // At root level or after entity brace - suggest keywords or entities
      if (isRootLevel || (isAfterBrace && entity)) {
        // At root level with mutation mode - suggest mutation wrapper first
        if (isRootLevel && isMutationMode && !textUntilPosition.includes(`"${operationMode}"`)) {
          let insertText = isInsideString ? operationMode : `"${operationMode}": {\n  \n}`
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          suggestions.push({
            label: operationMode,
            kind: 14, // Keyword
            insertText,
            insertTextRules: isInsideString ? 0 : 4,
            detail: `${operationMode.charAt(0).toUpperCase() + operationMode.slice(1)} mutation`,
            range: adjustedRange,
            sortText: '0',
            filterText: operationMode,
          })
        }

        // Inside entity object - suggest keywords
        if (isAfterBrace && entity) {
          if (isMutationMode) {
            const mutationKeywords = isDeleteMode ? ['id'] :
                                    isCreateMode ? ['data', 'response'] :
                                    ['id', 'data', 'response']
            for (const kw of mutationKeywords) {
              const insertText = isInsideString ? kw :
                              kw === 'id' ? `"${kw}": 1` :
                              kw === 'data' ? `"${kw}": {}` :
                              `"${kw}": ["id"]`
              const adjustedRange = isInsideString ? {
                startLineNumber: position.lineNumber,
                startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              } : range

              const item = {
                label: kw,
                kind: 14,
                insertText,
                insertTextRules: isInsideString ? 0 : 4,
                detail: kw === 'id' ? 'Record ID to modify' :
                       kw === 'data' ? 'Fields to set' :
                       'Fields to return',
                range: adjustedRange,
                sortText: kw === 'id' ? '0' : '1',
                filterText: kw,
              }
              if (getCommaEdit && !isInsideString) {
                item.additionalTextEdits = [getCommaEdit]
              }
              suggestions.push(item)
            }
          } else {
            const queryKeywords = ['fields', 'filters', 'relations', 'order', 'limit', 'offset']
            for (const kw of queryKeywords) {
              const insertText = isInsideString ? kw :
                              kw === 'fields' ? `"${kw}": ["id"]` :
                              kw === 'filters' ? `"${kw}": {}` :
                              kw === 'relations' ? `"${kw}": {}` :
                              kw === 'order' ? `"${kw}": [{"field": "id", "direction": "asc"}]` :
                              `"${kw}": 10`
              const adjustedRange = isInsideString ? {
                startLineNumber: position.lineNumber,
                startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              } : range

              const item = {
                label: kw,
                kind: 14,
                insertText,
                insertTextRules: isInsideString ? 0 : 4,
                range: adjustedRange,
                sortText: kw === 'fields' ? '0' : '1',
                filterText: kw,
              }
              if (getCommaEdit && !isInsideString) {
                item.additionalTextEdits = [getCommaEdit]
              }
              suggestions.push(item)
            }
          }
        }

        // At root - also suggest entities
        if (isRootLevel) {
          for (const [entityName, entityData] of Object.entries(graph.entities)) {
            let template
            if (isMutationMode) {
              if (isDeleteMode) {
                template = `"${entityName}": {\n  "id": 1\n}`
              } else if (isCreateMode) {
                template = `"${entityName}": {\n  "data": {},\n  "response": ["id"]\n}`
              } else {
                template = `"${entityName}": {\n  "id": 1,\n  "data": {},\n  "response": ["id"]\n}`
              }
            } else {
              template = `"${entityName}": {\n  "fields": ["id"],\n  "limit": 10\n}`
            }

            let insertText = isInsideString ? entityName : template
            const adjustedRange = isInsideString ? {
              startLineNumber: position.lineNumber,
              startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            } : range

            suggestions.push({
              label: entityName,
              kind: 9, // Class
              insertText,
              insertTextRules: isInsideString ? 0 : 4,
              detail: `Entity (${entityData.service})`,
              range: adjustedRange,
              filterText: entityName,
            })
          }
        }
      }

      // Fallback - if we're typing and no specific context, suggest entities and keywords
      if (suggestions.length === 0 && (isInString || beforeCursor.endsWith(','))) {
        // Suggest entities
        for (const [entityName, entityData] of Object.entries(graph.entities)) {
          let insertText = isInsideString ? entityName : `"${entityName}": {}`
          const adjustedRange = isInsideString ? {
            startLineNumber: position.lineNumber,
            startColumn: lineBeforeCursor.lastIndexOf('"') + 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          } : range

          suggestions.push({
            label: entityName,
            kind: 9,
            insertText,
            insertTextRules: isInsideString ? 0 : 4,
            detail: `Entity (${entityData.service})`,
            range: adjustedRange,
            filterText: entityName,
          })
        }
      }

      return { suggestions }
    },
  }
}

// Validate mutation data before sending
// Helper to check if a field is required
function isFieldRequired(field, fieldName) {
  if (fieldName === 'id') return false
  return field?.nullable === false
}

// Helper to check if value is empty for required field
function isValueEmpty(value, fieldType, fieldName) {
  if (value === null || value === undefined) return true
  if (value === '') return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (fieldName.endsWith('_id') && (value === 0 || value === '0')) return true
  return false
}

function validateMutationData(parsed, operationMode, graph = null) {
  const errors = []

  // Handle transaction mode
  if (operationMode === 'transaction' && parsed.transaction) {
    return validateTransactionData(parsed.transaction, graph)
  }

  // Get the operation wrapper
  const operation = parsed[operationMode]
  if (!operation && operationMode !== 'query') {
    // Check if user wrapped it differently
    for (const op of ['create', 'update', 'rewrite', 'delete']) {
      if (parsed[op]) {
        return validateMutationData({ [op]: parsed[op] }, op, graph)
      }
    }
  }

  if (!operation) {
    if (operationMode === 'query') return errors
    errors.push(`Missing "${operationMode}" wrapper in request`)
    return errors
  }

  // Iterate through entities in the operation
  for (const [entityName, entityData] of Object.entries(operation)) {
    const entityDef = graph?.entities?.[entityName]

    // For update/rewrite/delete - id is required
    if (['update', 'rewrite', 'delete'].includes(operationMode)) {
      if (!entityData.id && !entityData.filters) {
        errors.push(`${entityName}: "id" is required for ${operationMode}`)
      }
      if (entityData.id === 0) {
        errors.push(`${entityName}: "id" cannot be 0`)
      }
      if (typeof entityData.id === 'string' && entityData.id.trim() === '') {
        errors.push(`${entityName}: "id" cannot be empty`)
      }
    }

    // For create/update/rewrite - validate data fields
    if (['create', 'update', 'rewrite'].includes(operationMode)) {
      const data = entityData.data || {}

      // Check required fields from schema
      if (entityDef?.fields && operationMode === 'create') {
        for (const [fieldName, field] of Object.entries(entityDef.fields)) {
          if (isFieldRequired(field, fieldName)) {
            const value = data[fieldName]
            if (isValueEmpty(value, field.type, fieldName)) {
              errors.push(`${entityName}.${fieldName}: required field is empty`)
            }
          }
        }
      }

      // Check provided data values
      for (const [fieldName, fieldValue] of Object.entries(data)) {
        // Check for empty strings
        if (fieldValue === '') {
          errors.push(`${entityName}.data.${fieldName}: value cannot be empty string`)
        }
        // Check for 0 in ID-like fields
        if (fieldName.endsWith('_id') && fieldValue === 0) {
          errors.push(`${entityName}.data.${fieldName}: ID cannot be 0`)
        }
      }

      // Check if data is empty for create
      if (operationMode === 'create' && Object.keys(data).length === 0) {
        errors.push(`${entityName}: "data" cannot be empty for create`)
      }
    }
  }

  return errors
}

function validateTransactionData(transaction, graph) {
  const errors = []
  const steps = transaction.steps || []

  steps.forEach((step, index) => {
    const operation = Object.keys(step).find(k => ['create', 'update', 'delete', 'get_or_create'].includes(k))
    if (!operation) return

    const entityData = step[operation]
    const entityName = Object.keys(entityData)[0]
    const stepData = entityData[entityName]
    const entityDef = graph?.entities?.[entityName]
    const stepLabel = step.as || `step ${index + 1}`

    // Validate required fields for create/get_or_create
    if (['create', 'get_or_create'].includes(operation) && entityDef?.fields) {
      const data = stepData?.data || {}

      for (const [fieldName, field] of Object.entries(entityDef.fields)) {
        if (isFieldRequired(field, fieldName)) {
          const value = data[fieldName]
          // Skip if value is a variable reference (e.g., "$property1.id")
          if (typeof value === 'string' && value.startsWith('$')) continue

          if (isValueEmpty(value, field.type, fieldName)) {
            errors.push(`${stepLabel} (${entityName}): "${fieldName}" is required`)
          }
        }
      }
    }

    // Validate update/delete have filters or id
    if (['update', 'delete'].includes(operation)) {
      if (!stepData?.filters && !stepData?.id) {
        errors.push(`${stepLabel} (${entityName}): "filters" or "id" is required for ${operation}`)
      }
    }
  })

  return errors
}

export default function MonacoEditor() {
  const dispatch = useDispatch()
  const monaco = useMonaco()
  const editorRef = useRef(null)
  const executeRef = useRef(null)
  const formatRef = useRef(null)
  const value = useSelector(selectQueryText)
  const graph = useSelector(selectGraph)
  const operationMode = useSelector(selectOperationMode)
  const [toast, setToast] = useState(null)

  // Define theme before editor mounts
  const handleEditorWillMount = useCallback((monacoInstance) => {
    monacoInstance.editor.defineTheme('supergraph-dark', DARK_THEME)
  }, [])

  // Setup Monaco completion provider
  useEffect(() => {
    if (monaco) {
      // Register completion provider
      const disposable = monaco.languages.registerCompletionItemProvider('json', createCompletionProvider(graph, operationMode))

      return () => disposable.dispose()
    }
  }, [monaco, graph, operationMode])

  // Setup validation
  useEffect(() => {
    if (monaco && graph && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        const validate = createValidator(graph)
        const markers = validate(model)
        monaco.editor.setModelMarkers(model, 'supergraph', markers)
      }
    }
  }, [monaco, graph, value])

  const handleEditorDidMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor

    // Add keyboard shortcut for execution (Ctrl/Cmd + Enter)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      executeRef.current?.()
    })

    // Format on save (Ctrl/Cmd + S) - uses handleFormat which removes trailing commas
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      formatRef.current?.()
    })
  }, [])

  const handleChange = useCallback((newValue) => {
    dispatch(setQueryText(newValue || ''))
  }, [dispatch])

  const handleExecute = useCallback(() => {
    // Validate JSON first
    let parsed
    try {
      parsed = JSON.parse(value)
    } catch (e) {
      setToast({ type: 'error', message: 'Invalid JSON: ' + e.message })
      return
    }

    // Validate mutation data (including transactions)
    if (operationMode !== 'query') {
      const errors = validateMutationData(parsed, operationMode, graph)
      if (errors.length > 0) {
        setToast({ type: 'error', message: errors.join('\n') })
        return
      }
    }

    dispatch(executeQuery(value))
  }, [dispatch, value, operationMode, graph])

  const handleFormat = useCallback(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue()

      // Remove trailing commas before formatting
      // This regex finds commas followed by whitespace and then } or ]
      const cleanedValue = currentValue
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
        .replace(/,(\s*,)/g, ',')       // Remove double commas

      // Try to parse and re-stringify for proper formatting
      try {
        const parsed = JSON.parse(cleanedValue)
        const formatted = JSON.stringify(parsed, null, 2)
        editorRef.current.setValue(formatted)
      } catch {
        // If JSON is still invalid, just set the cleaned value and let Monaco format it
        editorRef.current.setValue(cleanedValue)
        editorRef.current.getAction('editor.action.formatDocument').run()
      }
    }
  }, [])

  // Keep refs updated for keyboard shortcuts
  executeRef.current = handleExecute
  formatRef.current = handleFormat

  // Listen for format event from header
  useEffect(() => {
    const handleFormatEvent = () => {
      formatRef.current?.()
    }
    window.addEventListener('supergraph:format', handleFormatEvent)
    return () => window.removeEventListener('supergraph:format', handleFormatEvent)
  }, [])

  return (
    <div className="h-full flex flex-col bg-[#0D1117]">
      {/* Toast notifications */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language="json"
          theme="supergraph-dark"
          value={value}
          onChange={handleChange}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            formatOnPaste: true,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
              showClasses: true,
              showFields: true,
              insertMode: 'replace',
              filterGraceful: true,
              snippetsPreventQuickSuggestions: false,
            },
            quickSuggestions: {
              other: 'on',
              strings: 'on',
              comments: 'off',
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            wordBasedSuggestions: 'off',
          }}
        />
      </div>
    </div>
  )
}
