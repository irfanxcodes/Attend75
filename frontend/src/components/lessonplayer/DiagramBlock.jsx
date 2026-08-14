/**
 * DiagramBlock — renders Mermaid.js flowchart from spec string.
 *
 * Key fix: Mermaid writes raw SVG via innerHTML into a dedicated ref div.
 * React must never manage children inside that div — doing so causes
 * "removeChild: node is not a child" crashes when React tries to unmount
 * its own virtual nodes after Mermaid has replaced the DOM contents.
 *
 * Solution: two sibling divs — one for React (loading dots), one for Mermaid.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

// ── One-time global init ──────────────────────────────────────────────────
let mermaidInitialized = false
let mermaidInstance = null

async function getMermaid() {
  const mermaid = (await import('mermaid')).default
  if (!mermaidInitialized) {
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
    mermaidInitialized = true
    mermaidInstance = mermaid
  }
  return mermaidInstance || mermaid
}

// Monotonic counter — unique DOM id per render attempt
let renderCounter = 0

export function DiagramBlock({ block, isActive, onComplete }) {
  // mermaidRef: dedicated div that Mermaid owns — React never puts children here
  const mermaidRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isActive === false) return
    if (!block?.content) return

    setStatus('loading')
    setErrorMsg('')

    let cancelled = false

    const render = async () => {
      try {
        const mermaid = await getMermaid()
        const uid = `mermaid-diag-${++renderCounter}`

        // Remove any stale artefact Mermaid may have left in <body>
        const stale = document.getElementById(uid)
        if (stale) stale.remove()

        const { svg } = await mermaid.render(uid, block.content)

        if (cancelled) return
        if (!mermaidRef.current) return

        // Write SVG directly — React has no children here so no conflict
        mermaidRef.current.innerHTML = svg
        const svgEl = mermaidRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
        }
        setStatus('done')
        setTimeout(() => onComplete?.(), 800)
      } catch (err) {
        if (cancelled) return
        console.warn('[DiagramBlock] Mermaid render failed:', err?.message)
        setErrorMsg(err?.message || 'Diagram unavailable')
        setStatus('error')
        setTimeout(() => onComplete?.(), 400)
      }
    }

    render()
    return () => { cancelled = true }
  }, [isActive, block?.id, block?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'error') {
    return (
      <div className="py-2">
        <p className="text-xs text-[#9F9AB5] uppercase tracking-widest mb-2 font-medium">
          Concept Map
        </p>
        <div className="bg-[#2A2650] rounded-xl p-4 border border-[#3D3660]">
          <p className="text-[#9F9AB5] text-xs text-center mb-2">Diagram could not be rendered</p>
          {block?.content && (
            <pre className="text-[#6B6888] text-[10px] mt-2 whitespace-pre-wrap overflow-x-auto max-h-32">
              {block.content}
            </pre>
          )}
        </div>
      </div>
    )
  }

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
      <div className="bg-[#1D183E] rounded-xl p-3 overflow-x-auto min-h-[40px] relative">
        {/* Loading indicator — React owns this, completely separate from mermaidRef */}
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-2 absolute inset-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#3D3660] animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#3D3660] animate-pulse delay-75" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#3D3660] animate-pulse delay-150" />
          </div>
        )}
        {/* Mermaid output — React never touches children inside this div */}
        <div ref={mermaidRef} className="flex justify-center" />
      </div>
    </motion.div>
  )
}
