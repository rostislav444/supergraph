interface HclToken {
  type: 'keyword' | 'string' | 'property' | 'boolean' | 'number' | 'bracket' | 'comment' | 'text'
  text: string
}

const COLOR_MAP: Record<HclToken['type'], string> = {
  keyword: 'text-purple-400',
  string: 'text-green-400',
  property: 'text-blue-300',
  boolean: 'text-orange-400',
  number: 'text-orange-400',
  bracket: 'text-gray-500',
  comment: 'text-gray-500 italic',
  text: 'text-gray-300',
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

export interface HclHighlighterProps {
  code: string
}

export function HclHighlighter({ code }: HclHighlighterProps) {
  const lines = code.split('\n')

  return (
    <div className="font-mono text-sm">
      {lines.map((line, i) => {
        const tokens = tokenizeLine(line)
        return (
          <div key={i} className="flex">
            <span className="text-gray-600 select-none w-10 text-right pr-4">{i + 1}</span>
            <span className="whitespace-pre">
              {tokens.map((token, j) => (
                <span key={j} className={COLOR_MAP[token.type]}>
                  {token.text}
                </span>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
