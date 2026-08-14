/**
 * NotebookCanvas — the scrollable dark canvas where lesson content appears.
 * Mimics a digital notebook — dark paper, content builds up as lesson progresses.
 */
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BlockRenderer } from './BlockRenderer'

export function NotebookCanvas({
  blocks,
  currentIndex,
  isActive,
  onBlockComplete,
  onQuizAnswer,
}) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  // Auto-scroll to bottom as new content appears
  useEffect(() => {
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 200)
    return () => clearTimeout(timer)
  }, [currentIndex])

  // Blocks shown so far — everything up to and including current
  const visibleBlocks = blocks.slice(0, currentIndex + 1)

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-5 pt-6 pb-32"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#3D3660 transparent' }}
    >
      {/* Notebook header */}
      <div className="mb-6">
        <div className="w-8 h-0.5 bg-[#FF916C]/40 mb-3" />
      </div>

      {/* Rendered blocks */}
      <AnimatePresence mode="sync">
        {visibleBlocks.map((block, idx) => {
          const isCurrentBlock = idx === currentIndex
          const isPastBlock = idx < currentIndex

          return (
            <motion.div
              key={block.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: isPastBlock ? 0.65 : 1 }}
              transition={{ duration: 0.3 }}
              className={`mb-4 ${isPastBlock ? 'pointer-events-none' : ''}`}
            >
              <BlockRenderer
                block={block}
                isActive={isCurrentBlock && isActive}
                onComplete={isCurrentBlock ? onBlockComplete : undefined}
                onQuizAnswer={isCurrentBlock ? onQuizAnswer : undefined}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Scroll anchor */}
      <div ref={bottomRef} className="h-1" />
    </div>
  )
}
