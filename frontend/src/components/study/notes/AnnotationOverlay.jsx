/**
 * AnnotationOverlay — absolute SVG drawn over a QuestionCard.
 * Reads DOM bounding boxes of [data-annotate] spans and draws:
 *   highlight → semi-transparent <rect>
 *   circle    → <ellipse> with stroke
 *   arrow     → <line> with arrowhead pointing at target
 *
 * Silently skips any annotation whose target span is not found in the DOM.
 */

import { useEffect, useRef, useState } from 'react'

export default function AnnotationOverlay({ annotations, containerRef }) {
  const [shapes, setShapes] = useState([])

  useEffect(() => {
    if (!containerRef?.current || !annotations?.length) {
      setShapes([])
      return
    }

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const computed = []

    for (const ann of annotations) {
      const el = container.querySelector(`[data-annotate="${ann.stepId}"]`)
      if (!el) continue

      const r = el.getBoundingClientRect()
      const x = r.left - containerRect.left
      const y = r.top - containerRect.top
      const w = r.width
      const h = r.height
      const pad = 4

      computed.push({ ...ann, x, y, w, h, pad })
    }

    setShapes(computed)
  }, [annotations, containerRef])

  if (!shapes.length) return null

  const containerRect = containerRef?.current?.getBoundingClientRect()
  const svgW = containerRect?.width || 0
  const svgH = containerRect?.height || 0

  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, left: 0, width: svgW, height: svgH, pointerEvents: 'none', zIndex: 10 }}
    >
      {shapes.map((s, i) => {
        const color = s.color || '#FFD700'
        if (s.type === 'highlight') {
          return (
            <rect
              key={i}
              x={s.x - s.pad}
              y={s.y - s.pad}
              width={s.w + s.pad * 2}
              height={s.h + s.pad * 2}
              fill={color}
              fillOpacity={0.28}
              rx={4}
            />
          )
        }
        if (s.type === 'circle') {
          return (
            <ellipse
              key={i}
              cx={s.x + s.w / 2}
              cy={s.y + s.h / 2}
              rx={s.w / 2 + s.pad + 4}
              ry={s.h / 2 + s.pad + 2}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="0"
            />
          )
        }
        if (s.type === 'arrow') {
          const tx = s.x + s.w / 2
          const ty = s.y - 12
          const sx = tx
          const sy = ty - 20
          return (
            <g key={i}>
              <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={color} strokeWidth={2} markerEnd={`url(#ah-${i})`} />
              <defs>
                <marker id={`ah-${i}`} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                  <polygon points="0 0, 8 4, 0 8" fill={color} />
                </marker>
              </defs>
            </g>
          )
        }
        return null
      })}
    </svg>
  )
}
