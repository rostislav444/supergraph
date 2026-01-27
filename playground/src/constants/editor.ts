// Monaco editor configuration

export interface EditorTheme {
  base: 'vs-dark' | 'vs-light'
  inherit: boolean
  rules: Array<{
    token: string
    foreground: string
  }>
  colors: Record<string, string>
}

// Dark theme for Monaco editor
export const DARK_THEME: EditorTheme = {
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

// Monaco editor options
export const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineNumbers: 'on' as const,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
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
    insertMode: 'replace' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false,
  },
  quickSuggestions: {
    other: 'on' as const,
    strings: 'on' as const,
    comments: 'off' as const,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  wordBasedSuggestions: 'off' as const,
}

// Known query keywords (for validation and filtering)
export const KNOWN_QUERY_KEYWORDS = [
  'fields', 'filters', 'order', 'limit', 'offset', 'relations',
  'data', 'response', 'action', 'entity', 'select', 'query',
  'create', 'update', 'delete', 'rewrite', 'transaction', 'id',
]

// Trigger characters for autocomplete
export const TRIGGER_CHARACTERS = ['"', ':', '[', '{', ',']

// HCL syntax highlighting keywords
export const HCL_KEYWORDS = [
  'entity', 'service', 'field', 'relation', 'filters', 'type',
  'target', 'cardinality', 'ref', 'from_field', 'to_entity',
  'nullable', 'required', 'enum_values',
]

// Filter operators for autocomplete
export const FILTER_OPERATORS = [
  '__eq', '__ne', '__gt', '__lt', '__gte', '__lte',
  '__like', '__ilike', '__in', '__contains', '__icontains',
  '__startswith', '__istartswith', '__endswith', '__iendswith',
]
