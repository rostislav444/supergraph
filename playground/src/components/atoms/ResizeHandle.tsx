import { PanelResizeHandle } from 'react-resizable-panels'
import clsx from 'clsx'

export interface ResizeHandleProps {
  direction?: 'horizontal' | 'vertical'
  className?: string
}

export function ResizeHandle({ direction = 'horizontal', className }: ResizeHandleProps) {
  const isVertical = direction === 'vertical'

  return (
    <PanelResizeHandle className={clsx('group', className)}>
      <div
        className={clsx(
          'bg-gray-700 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors',
          isVertical ? 'h-1 w-full' : 'w-1 h-full'
        )}
      />
    </PanelResizeHandle>
  )
}

// Vertical variant for convenience
export function VerticalResizeHandle({ className }: { className?: string }) {
  return <ResizeHandle direction="vertical" className={className} />
}
