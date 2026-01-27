import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

export interface TruncatedTextProps {
  text: string
  className?: string
}

export function TruncatedText({ text, className }: TruncatedTextProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const checkTruncation = useCallback(() => {
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth)
    }
  }, [])

  useEffect(() => {
    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [checkTruncation, text])

  return (
    <div className="relative">
      <span
        ref={textRef}
        className={clsx('truncate block', className)}
        onMouseEnter={() => isTruncated && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {text}
      </span>
      {showTooltip && (
        <div className="absolute left-0 -top-6 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg border border-gray-600 whitespace-nowrap z-20 font-mono">
          {text}
        </div>
      )}
    </div>
  )
}
