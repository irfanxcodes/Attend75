/**
 * DiagramBlock — renders Mermaid.js flowchart from spec string
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

export function DiagramBlock({ block, isActive, onComplete }) {
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (!isActive || !block.content || rendered) return

    let cancelled = false

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#3D3660',
            primaryTextColor: '#F7F4FF',
            primaryBorderColor: '#6CB4FF',
            lineColor: '#9F9AB5',
            background: '#1D183E',
          },
        })

        const id = `mermaid-${block.id.replace(/-/g, '')}`
        const { svg } = await mermaid.render(id, block.content)

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setRendered(true)
          setTimeout(() => onComplete?.(), 800)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Diagram unavailable')
          setTimeout(() => onComplete?.(), 400)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [isActive, block.id, block.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="py-2"
    >
      <p className="text-xs text-[#9F9AB5] uppercase tracking-widest mb-2 font-medium">
        Concept Map
      </p>
      <div
        ref={containerRef}
        className="bg-[#1D183E] rounded-xl p-3 overflow-x-auto flex justify-center"
      />
    </motion.div>
  )
}
