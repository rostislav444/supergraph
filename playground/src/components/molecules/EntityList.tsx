import { useMemo, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { ChevronIcon } from '@atoms/icons/ChevronIcon'
import type { Entity } from '@/types'

export interface EntityListProps {
  entities: Array<[string, Entity]>
  onSelect: (name: string) => void
  activeEntity?: string | null
}

export function EntityList({ entities, onSelect, activeEntity }: EntityListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const entityRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrolledToRef = useRef<string | null>(null)

  // Group entities by first letter
  const grouped = useMemo(() => {
    const groups: Record<string, Array<[string, Entity]>> = {}
    entities.forEach(([name, entity]) => {
      const letter = name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push([name, entity])
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [entities])

  // Scroll to active entity on mount and when it changes
  useEffect(() => {
    if (!activeEntity) return
    // Don't scroll again if we already scrolled to this entity
    if (scrolledToRef.current === activeEntity) return

    const scrollToEntity = () => {
      const element = entityRefs.current[activeEntity]
      const container = containerRef.current

      if (element && container) {
        const elementRect = element.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        // Check if element is outside visible area
        if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        scrolledToRef.current = activeEntity
      }
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      scrollToEntity()
    })
  }, [activeEntity, entities])

  return (
    <div className="flex-1 overflow-auto" ref={containerRef}>
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Entities</span>
        <span className="text-xs text-gray-600 ml-2">({entities.length})</span>
      </div>
      <div className="py-1">
        {grouped.map(([letter, items]) => (
          <div key={letter}>
            {/* Letter group header */}
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <div className="w-7 h-7 rounded bg-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                {letter}
              </div>
              <div className="flex-1 h-px bg-gray-700"></div>
              <span className="text-xs text-gray-600">{items.length}</span>
            </div>
            {/* Entities in this group */}
            {items.map(([name, entity]) => {
              const fieldsCount = Object.keys(entity.fields || {}).length
              const relCount = Object.keys(entity.relations || {}).length
              const isActive = name === activeEntity
              return (
                <div
                  key={name}
                  ref={(el) => (entityRefs.current[name] = el)}
                  onClick={() => onSelect(name)}
                  className={clsx(
                    'flex items-center gap-2 pl-12 pr-3 py-2 cursor-pointer transition-colors',
                    isActive
                      ? 'bg-blue-600/20 border-l-2 border-blue-500'
                      : 'hover:bg-gray-800 border-l-2 border-transparent'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className={clsx(
                        'text-sm font-medium truncate',
                        isActive ? 'text-blue-400' : 'text-white'
                      )}
                    >
                      {name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {fieldsCount} fields{relCount > 0 && ` · ${relCount} rel`}
                    </div>
                  </div>
                  <ChevronIcon />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
