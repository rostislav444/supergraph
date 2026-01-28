import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react'

interface HclToken {
  type: 'keyword' | 'string' | 'property' | 'boolean' | 'number' | 'bracket' | 'comment' | 'text'
  text: string
}

// GitHub Dark theme colors (matching JsonHighlighter)
const COLORS = {
  keyword: '#ff7b72',     // Red/pink for keywords (entity, service, etc.)
  string: '#7ee787',      // Green for string values
  quote: '#79c0ff',       // Light blue for quotes
  property: '#79c0ff',    // Blue for property names
  boolean: '#ff7b72',     // Red/pink for booleans
  number: '#79c0ff',      // Blue for numbers
  bracket: '#ffa657',     // Orange for brackets
  comment: '#8b949e',     // Gray for comments
  text: '#c9d1d9',        // Default text color
  lineNumber: '#6e7681',  // Gray for line numbers
}

function tokenizeLine(line: string): HclToken[] {
  const tokens: HclToken[] = []
  let remaining = line
  let pos = 0

  while (remaining.length > 0) {
    // Comments
    const commentMatch = remaining.match(/^(#.*)/)
    if (commentMatch) {
      tokens.push({ type: 'comment', text: commentMatch[1] })
      remaining = remaining.slice(commentMatch[1].length)
      continue
    }

    // Strings
    const stringMatch = remaining.match(/^"([^"]*)"/)
    if (stringMatch) {
      tokens.push({ type: 'string', text: stringMatch[0] })
      remaining = remaining.slice(stringMatch[0].length)
      continue
    }

    // Block keywords at start of line or after whitespace
    const keywordMatch = remaining.match(
      /^(entity|service|field|relation|access|through|ref|keys|filters|presets|defaults|relation_providers|rel)\b/
    )
    if (keywordMatch && (pos === 0 || line[pos - 1] === ' ' || line[pos - 1] === '\t')) {
      tokens.push({ type: 'keyword', text: keywordMatch[1] })
      remaining = remaining.slice(keywordMatch[1].length)
      pos += keywordMatch[1].length
      continue
    }

    // Property names (word followed by =)
    const propMatch = remaining.match(/^([a-z_][a-z0-9_]*)(\s*=)/)
    if (propMatch) {
      tokens.push({ type: 'property', text: propMatch[1] })
      tokens.push({ type: 'text', text: propMatch[2] })
      remaining = remaining.slice(propMatch[0].length)
      pos += propMatch[0].length
      continue
    }

    // Booleans
    const boolMatch = remaining.match(/^(true|false)\b/)
    if (boolMatch) {
      tokens.push({ type: 'boolean', text: boolMatch[1] })
      remaining = remaining.slice(boolMatch[1].length)
      pos += boolMatch[1].length
      continue
    }

    // Numbers
    const numMatch = remaining.match(/^(\d+)/)
    if (numMatch) {
      tokens.push({ type: 'number', text: numMatch[1] })
      remaining = remaining.slice(numMatch[1].length)
      pos += numMatch[1].length
      continue
    }

    // Brackets
    const bracketMatch = remaining.match(/^([{}[\]])/)
    if (bracketMatch) {
      tokens.push({ type: 'bracket', text: bracketMatch[1] })
      remaining = remaining.slice(1)
      pos += 1
      continue
    }

    // Default: single character
    tokens.push({ type: 'text', text: remaining[0] })
    remaining = remaining.slice(1)
    pos += 1
  }

  return tokens
}

// Extract navigation items from HCL
interface NavItem {
  name: string
  service: string
  lineNumber: number
}

function extractNavItems(code: string): { services: Record<string, NavItem[]> } {
  const lines = code.split('\n')
  const services: Record<string, NavItem[]> = {}
  let currentService = 'unknown'

  lines.forEach((line, idx) => {
    // Match service "name" {
    const serviceMatch = line.match(/^service\s+"([^"]+)"/)
    if (serviceMatch) {
      currentService = serviceMatch[1]
      return
    }

    // Match entity "name" {
    const entityMatch = line.match(/^entity\s+"([^"]+)"/)
    if (entityMatch) {
      if (!services[currentService]) {
        services[currentService] = []
      }
      services[currentService].push({
        name: entityMatch[1],
        service: currentService,
        lineNumber: idx + 1,
      })
    }
  })

  return { services }
}

export interface HclHighlighterProps {
  code: string
}

export function HclHighlighter({ code }: HclHighlighterProps) {
  const codeRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const lines = code.split('\n')
  const totalLines = lines.length
  const [activeEntity, setActiveEntity] = useState<string | null>(null)

  // Extract navigation items
  const navData = useMemo(() => extractNavItems(code), [code])

  // Create line map for quick lookup (entity name -> line number)
  const lineMap = useMemo(() => {
    const map: Record<string, number> = {}
    Object.values(navData.services).flat().forEach((item) => {
      map[item.name] = item.lineNumber
    })
    return map
  }, [navData])

  // Track scroll position to highlight active entity (with debounce)
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

        // Find the closest entity that starts at or before the current line
        let closestEntity: string | null = null
        let closestLine = 0

        for (const [entityName, lineNum] of Object.entries(lineMap)) {
          if (lineNum <= currentLine + 5 && lineNum > closestLine) {
            closestLine = lineNum
            closestEntity = entityName
          }
        }

        if (closestEntity !== activeEntity) {
          setActiveEntity(closestEntity)
        }
      }, 100)
    }

    // Initial check (immediate)
    const lineHeight = 20
    const scrollTop = codeEl.scrollTop
    const currentLine = Math.floor(scrollTop / lineHeight) + 1
    let closestEntity: string | null = null
    let closestLine = 0
    for (const [entityName, lineNum] of Object.entries(lineMap)) {
      if (lineNum <= currentLine + 5 && lineNum > closestLine) {
        closestLine = lineNum
        closestEntity = entityName
      }
    }
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
      const buttonRect = activeButton.getBoundingClientRect()
      const navRect = navEl.getBoundingClientRect()
      const targetPosition = navRect.height * 0.2 // 20% from top

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
      const lineHeight = 20 // approximate line height in px
      codeRef.current.scrollTop = (lineNum - 3) * lineHeight
    }
  }, [])

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
      <div className="flex h-full">
        {/* Main code area with line numbers */}
        <div className="flex-1 flex overflow-hidden">
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
              const tokens = tokenizeLine(line)
              return (
                <div key={i} className="whitespace-pre" style={{ minHeight: '20px' }}>
                  {tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    tokens.map((token, j) => (
                      <span key={j} style={{ color: COLORS[token.type] }}>
                        {token.text}
                      </span>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Navigation sidebar */}
        <div ref={navRef} className="dark-scrollbar w-56 flex-shrink-0 border-l border-gray-800 bg-[#161b22] overflow-auto">
          <div className="p-2 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-400">OUTLINE</span>
          </div>
          <div className="p-2">
            {serviceNames.map((service) => {
              const isActiveService = navData.services[service]?.some((e) => e.name === activeEntity)
              return (
                <div key={service} className="mb-2">
                  <div
                    className={`flex items-center gap-1 text-xs font-medium mb-1 transition-colors ${
                      isActiveService ? 'text-blue-400' : 'text-gray-500'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    {service}
                  </div>
                  {navData.services[service]?.map((entity) => {
                    const isActive = entity.name === activeEntity
                    return (
                      <button
                        key={entity.name}
                        data-entity={entity.name}
                        onClick={() => scrollToLine(entity.lineNumber)}
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
    </>
  )
}
