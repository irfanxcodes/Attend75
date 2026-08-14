/**
 * CanvasSectionRenderer — document-style concept section renderer.
 *
 * White card background. Clean typography like a well-formatted textbook.
 * No heavy colored borders or dark UI cards — content breathes.
 */
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import { DiagramBlock } from '../lessonplayer/DiagramBlock'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Component, useState } from 'react'

function isLatex(str) {
  return str && (/[\\{}^_]/.test(str) || str.startsWith('\\'))
}

// ── Section-level error boundary ─────────────────────────────────────────
// Catches render crashes (e.g. bad LaTeX in BlockMath) without taking down
// the entire WorkspacePlayer.

class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error, info) {
    console.error('[SectionErrorBoundary] Section crashed:', error?.message, info?.componentStack?.slice(0, 300))
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-slate-400 text-[12px] italic">Content could not be rendered.</p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function SectionLabel({ color = '#6b7280', children }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color }}>
      {children}
    </p>
  )
}

// ── Explanation ───────────────────────────────────────────────────────────

function ExplanationSection({ content }) {
  if (!content?.text) return null
  return (
    <p className="text-[#1a1827] text-[15px] leading-[1.9] mb-3">
      {content.text}
    </p>
  )
}

// ── Definition ────────────────────────────────────────────────────────────

function DefinitionSection({ content }) {
  if (!content?.text) return null
  return (
    <div className="border-l-[3px] border-[#6366f1] pl-4 mb-4 py-0.5">
      <SectionLabel color="#6366f1">Definition</SectionLabel>
      <p className="text-[#1a1827] text-[15px] leading-relaxed italic">
        "{content.text}"
      </p>
    </div>
  )
}

// ── Formula ───────────────────────────────────────────────────────────────

function FormulaSection({ content }) {
  const [showVars, setShowVars] = useState(false)
  const variables = content.variables || []

  return (
    <div className="mb-4">
      {content.name && (
        <SectionLabel color="#0ea5e9">Formula — {content.name}</SectionLabel>
      )}
      {!content.name && <SectionLabel color="#0ea5e9">Formula</SectionLabel>}
      {/* Force light background + dark text so KaTeX renders correctly regardless of parent theme */}
      <div
        className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 overflow-x-auto"
        style={{ color: '#1e293b', background: '#f8fafc' }}
      >
        {isLatex(content.latex) ? (
          <SectionErrorBoundary>
            <div className="formula-doc" style={{ color: '#1e293b' }}>
              <BlockMath math={content.latex} />
            </div>
          </SectionErrorBoundary>
        ) : (
          <p className="text-slate-800 text-base font-mono text-center">{content.text}</p>
        )}
      </div>
      {variables.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowVars(v => !v)}
            className="flex items-center gap-1 text-slate-500 text-[12px] hover:text-slate-700 transition-colors"
          >
            {showVars ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Variables
          </button>
          {showVars && (
            <div className="mt-2 space-y-1 pl-2 border-l border-slate-200">
              {variables.map((v, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[13px]">
                  <code className="text-sky-700 font-mono min-w-[44px] flex-shrink-0">{v.symbol}</code>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-600">{v.meaning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Formula Explanation ───────────────────────────────────────────────────

function FormulaExplanationSection({ content }) {
  if (!content?.text) return null
  return (
    <p className="text-[#3d3a55] text-[14px] leading-relaxed mb-3 pl-1">
      {content.text}
    </p>
  )
}

// ── Worked Example ────────────────────────────────────────────────────────

function WorkedExampleSection({ content }) {
  const steps = content.steps || []
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-amber-100/60 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <SectionLabel color="#b45309">Worked Example</SectionLabel>
          <p className="text-[#1a1827] text-[14px] leading-snug font-medium">{content.question || 'Example'}</p>
        </div>
        <span className="flex-shrink-0 text-amber-400 mt-1">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-200 px-4 py-4 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[9px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[#3d3a55] text-[13px] leading-snug">{step.step}</p>
                {step.calculation && (
                  <code className="mt-1 inline-block text-[12px] font-mono bg-white border border-amber-200 rounded-lg px-2.5 py-1 text-amber-900">
                    {step.calculation}
                  </code>
                )}
                {step.note && (
                  <p className="text-slate-500 text-[11px] mt-0.5 italic">{step.note}</p>
                )}
              </div>
            </div>
          ))}
          {content.answer && (
            <div className="bg-white border border-green-200 rounded-lg px-3.5 py-2.5 mt-1">
              <p className="text-[10px] text-green-700 font-bold uppercase tracking-widest mb-0.5">Answer</p>
              <p className="text-[#1a1827] text-[14px] font-semibold">{content.answer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Theory Example ────────────────────────────────────────────────────────

function TheoryExampleSection({ content }) {
  if (!content?.text) return null
  return (
    <div className="mb-4">
      <SectionLabel color="#d97706">Example</SectionLabel>
      <p className="text-[#1a1827] text-[15px] leading-relaxed">{content.text}</p>
    </div>
  )
}

// ── Visual / Diagram ──────────────────────────────────────────────────────

function VisualSection({ content }) {
  if (content.spec_type === 'mermaid') {
    // Stable ID based on spec content — avoids re-render loop from Math.random()
    const stableId = `visual-${content.spec?.slice(0, 32).replace(/[^a-z0-9]/gi, '') || 'diagram'}`
    const mockBlock = {
      id: stableId,
      content: content.spec,
    }
    return (
      <div className="mb-4">
        {content.caption && (
          <SectionLabel color="#6b7280">{content.caption}</SectionLabel>
        )}
        <div className="rounded-xl overflow-hidden border border-slate-200">
          <DiagramBlock block={mockBlock} isActive={true} onComplete={() => {}} />
        </div>
      </div>
    )
  }

  if (content.spec_type === 'table') {
    return (
      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200">
        {content.caption && (
          <div className="px-4 pt-3 pb-1">
            <SectionLabel color="#6b7280">{content.caption}</SectionLabel>
          </div>
        )}
        <div
          className="text-[#1a1827] text-[13px] px-4 pb-3"
          dangerouslySetInnerHTML={{ __html: content.spec || '' }}
        />
      </div>
    )
  }

  return null
}

// ── Concept Map ───────────────────────────────────────────────────────────

function ConceptMapSection({ content }) {
  // content.nodes: [{id, label, type}], content.edges: [{from, to, label}]
  // content.spec: mermaid string (alternative format)
  // content.caption: optional title
  const nodes = content.nodes || []
  const edges = content.edges || []

  // If a mermaid spec is provided, render via DiagramBlock
  if (content.spec) {
    // Use stable id derived from content to prevent re-render on every React pass
    const mockBlock = {
      id: `cmap-${content.spec?.slice(0, 32).replace(/[^a-z0-9]/gi, '') || 'diagram'}`,
      content: content.spec,
    }
    return (
      <div className="mb-4">
        <SectionLabel color="#6b7280">{content.caption || 'Concept Map'}</SectionLabel>
        <div className="rounded-xl overflow-hidden border border-slate-200">
          <DiagramBlock block={mockBlock} isActive={true} onComplete={() => {}} />
        </div>
      </div>
    )
  }

  // Fallback: render nodes as a simple grid of tags
  if (nodes.length > 0) {
    return (
      <div className="mb-4">
        <SectionLabel color="#6b7280">{content.caption || 'Concept Map'}</SectionLabel>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {nodes.map((n, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium border"
                style={{
                  background: n.type === 'main' ? '#dbeafe' : '#f0fdf4',
                  color: n.type === 'main' ? '#1d4ed8' : '#166534',
                  borderColor: n.type === 'main' ? '#93c5fd' : '#86efac',
                }}
              >
                {n.label}
              </span>
            ))}
          </div>
          {edges.length > 0 && (
            <div className="space-y-1 border-t border-slate-200 pt-2 mt-1">
              {edges.map((e, i) => (
                <p key={i} className="text-[12px] text-slate-500">
                  <span className="text-slate-700 font-medium">{e.from}</span>
                  {e.label ? ` → ${e.label} → ` : ' → '}
                  <span className="text-slate-700 font-medium">{e.to}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Last fallback: render text content if present
  if (content.text || content.description) {
    return (
      <div className="mb-4">
        <SectionLabel color="#6b7280">{content.caption || 'Concept Map'}</SectionLabel>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-slate-700 text-[13px] leading-relaxed">
            {content.text || content.description}
          </p>
        </div>
      </div>
    )
  }

  return null
}

function CommonMistakeSection({ content }) {
  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
      <SectionLabel color="#dc2626">Common Mistake</SectionLabel>
      <p className="text-[#1a1827] text-[14px] leading-relaxed">{content.mistake}</p>
      {content.correction && (
        <p className="text-green-700 text-[13px] mt-2 font-medium">✓ {content.correction}</p>
      )}
    </div>
  )
}

// ── Takeaway ──────────────────────────────────────────────────────────────

function TakeawaySection({ content }) {
  return (
    <div className="mb-4 flex gap-3 items-start bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
      <span className="text-sky-500 text-[16px] flex-shrink-0 mt-0.5">💡</span>
      <p className="text-[#1a1827] text-[14px] leading-relaxed flex-1">{content.text}</p>
    </div>
  )
}

// ── Key Terms (section type from some versions) ───────────────────────────

function KeyTermsSection({ content }) {
  const terms = content.terms || content.keywords || []
  return (
    <div className="mb-4">
      <SectionLabel color="#6b7280">Key Terms</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {terms.map((t, i) => (
          <span key={i} className="px-3 py-1 rounded-full text-[13px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            {typeof t === 'string' ? t : t.term || t.name || ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Source Reference ──────────────────────────────────────────────────────

function SourceRef({ refs, onViewSource }) {
  if (!refs?.length || !onViewSource) return null
  const ref = refs[0]
  if (!ref.slide_or_page) return null
  return (
    <button
      onClick={() => onViewSource(ref.slide_or_page)}
      className="flex items-center gap-1 text-slate-400 text-[11px] hover:text-indigo-500 transition-colors mt-1 mb-1"
    >
      <ExternalLink size={9} />
      {ref.heading ? `"${ref.heading}"` : `Slide ${ref.slide_or_page}`}
    </button>
  )
}

// ── Main Dispatcher ───────────────────────────────────────────────────────

export function CanvasSectionRenderer({ section, onViewSource }) {
  if (!section) return null
  const { section_type, content, source_references } = section
  if (!content) return null

  let inner = null
  switch (section_type) {
    case 'explanation':         inner = <ExplanationSection content={content} />; break
    case 'definition':          inner = <DefinitionSection content={content} />; break
    case 'formula':             inner = <FormulaSection content={content} />; break
    case 'formula_explanation': inner = <FormulaExplanationSection content={content} />; break
    case 'worked_example':      inner = <WorkedExampleSection content={content} />; break
    case 'theory_example':      inner = <TheoryExampleSection content={content} />; break
    case 'visual':              inner = <VisualSection content={content} />; break
    case 'concept_map':         inner = <ConceptMapSection content={content} />; break
    case 'common_mistake':      inner = <CommonMistakeSection content={content} />; break
    case 'takeaway':            inner = <TakeawaySection content={content} />; break
    case 'key_terms':           inner = <KeyTermsSection content={content} />; break
    default: {
      // Show readable text if available, otherwise skip silently
      const fallbackText = content.text || content.description || content.explanation
      if (!fallbackText) return null
      inner = (
        <p className="text-slate-600 text-[14px] leading-relaxed mb-3">{fallbackText}</p>
      )
    }
  }

  return (
    <SectionErrorBoundary key={`${section_type}-${JSON.stringify(content).slice(0, 40)}`}>
      <div>
        {inner}
        <SourceRef refs={source_references} onViewSource={onViewSource} />
      </div>
    </SectionErrorBoundary>
  )
}
