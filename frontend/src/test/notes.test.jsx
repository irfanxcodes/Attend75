/**
 * Frontend tests — Notes Solver components
 *
 * 8.7 AnnotationOverlay: renders <rect> for highlight, <ellipse> for circle,
 *                        <line> for arrow
 * 8.8 ProblemSolverCanvas: tapping "Next step" increments revealed count;
 *                          all previous steps remain visible
 *
 * Run from frontend/:
 *   npm test
 */

import React, { useRef } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

// framer-motion: replace animated wrappers with plain divs so jsdom doesn't
// need a real animation engine and AnimatePresence mounts children immediately.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}))

// useAppStore: return a fake token so ProblemSolverCanvas can call the API
vi.mock('../hooks/useAppStore', () => ({
  default: () => ({ state: { session: { token: 'test-token' } } }),
}))

// getNotesProblem: return a controlled problem with 3 steps
vi.mock('../services/lessonApi', () => ({
  getNotesProblem: vi.fn(),
}))

// lucide-react icons: stub to avoid SVG rendering complexity
vi.mock('lucide-react', () => ({
  ArrowLeft:    () => <span data-testid="icon-arrow-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  ChevronDown:  () => <span data-testid="icon-chevron-down" />,
  Loader:       () => <span data-testid="icon-loader" />,
  BookOpen:     () => <span data-testid="icon-book-open" />,
  Trash2:       () => <span data-testid="icon-trash" />,
  Undo2:        () => <span data-testid="icon-undo" />,
  Upload:       () => <span data-testid="icon-upload" />,
  Users:        () => <span data-testid="icon-users" />,
  CheckCircle:  () => <span data-testid="icon-check" />,
}))

// SpeechSynthesis: not present in jsdom — prevent errors in SolutionStep
global.window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }

// ── Imports (after mocks are registered) ─────────────────────────────────────

import AnnotationOverlay from '../components/study/notes/AnnotationOverlay'
import ProblemSolverCanvas from '../components/study/notes/ProblemSolverCanvas'
import { getNotesProblem } from '../services/lessonApi'

// ── 8.7 AnnotationOverlay ─────────────────────────────────────────────────────

/**
 * AnnotationOverlay reads getBoundingClientRect() on the container and on
 * each [data-annotate] span to compute shape positions. jsdom returns all
 * zeros by default, so we mock the method to return real-looking rects.
 *
 * The component renders shapes only after a useEffect fires. We wrap renders
 * in `act()` to flush effects.
 */

// Wrapper that exposes a containerRef with real-looking bounding rects
function AnnotationWrapper({ annotations }) {
  const containerRef = useRef(null)

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: 400, height: 200 }}
    >
      {/* One span per annotation with the matching stepId data attribute */}
      {annotations.map(a => (
        <span key={a.stepId} data-annotate={a.stepId}>
          target text
        </span>
      ))}
      <AnnotationOverlay annotations={annotations} containerRef={containerRef} />
    </div>
  )
}

describe('8.7 AnnotationOverlay', () => {
  beforeEach(() => {
    // Make getBoundingClientRect return non-zero values so shapes are computed
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 10, top: 20, right: 110, bottom: 40,
      width: 100, height: 20, x: 10, y: 20,
      toJSON: () => {},
    })
  })

  it('renders <rect> for a highlight annotation', async () => {
    const annotations = [{ type: 'highlight', stepId: 'step-1', color: '#FFD700' }]

    await act(async () => {
      render(<AnnotationWrapper annotations={annotations} />)
    })

    const rect = document.querySelector('rect')
    expect(rect).not.toBeNull()
    expect(rect.getAttribute('fill')).toBe('#FFD700')
  })

  it('renders <ellipse> for a circle annotation', async () => {
    const annotations = [{ type: 'circle', stepId: 'step-2', color: '#FF0000' }]

    await act(async () => {
      render(<AnnotationWrapper annotations={annotations} />)
    })

    const ellipse = document.querySelector('ellipse')
    expect(ellipse).not.toBeNull()
    expect(ellipse.getAttribute('stroke')).toBe('#FF0000')
    expect(ellipse.getAttribute('fill')).toBe('none')
  })

  it('renders <line> for an arrow annotation', async () => {
    const annotations = [{ type: 'arrow', stepId: 'step-3', color: '#00FF00' }]

    await act(async () => {
      render(<AnnotationWrapper annotations={annotations} />)
    })

    const line = document.querySelector('line')
    expect(line).not.toBeNull()
    expect(line.getAttribute('stroke')).toBe('#00FF00')
  })

  it('skips annotation when span is not found in DOM', async () => {
    // stepId 'missing-step' has no corresponding span in the DOM
    const annotations = [{ type: 'highlight', stepId: 'missing-step', color: '#FFD700' }]

    await act(async () => {
      // Render without any matching spans
      const { container } = render(
        <div style={{ position: 'relative' }}>
          <AnnotationOverlay
            annotations={annotations}
            containerRef={{ current: document.createElement('div') }}
          />
        </div>
      )
    })

    // No SVG shapes should be rendered
    expect(document.querySelector('rect')).toBeNull()
  })
})

// ── 8.8 ProblemSolverCanvas ───────────────────────────────────────────────────

const MOCK_PROBLEM = {
  id: 'prob-1',
  sequence_order: 1,
  question_text: 'What is 2 + 2?',
  topic: 'Arithmetic',
  difficulty: 'easy',
  method: 'Addition',
  answer: '4',
  steps: [
    { id: 'step-a', sequence_order: 1, step_type: 'context',     content: 'We need to add two numbers.',    voice_text: null, annotation: null },
    { id: 'step-b', sequence_order: 2, step_type: 'given',       content: 'We are given: 2 and 2.',          voice_text: null, annotation: null },
    { id: 'step-c', sequence_order: 3, step_type: 'result',      content: 'The answer is 4.',                voice_text: null, annotation: null },
  ],
}

describe('8.8 ProblemSolverCanvas', () => {
  beforeEach(() => {
    getNotesProblem.mockResolvedValue(MOCK_PROBLEM)
  })

  it('shows "Open notebook →" button before any step is revealed', async () => {
    await act(async () => {
      render(<ProblemSolverCanvas problemId="prob-1" onBack={() => {}} />)
    })

    await waitFor(() => {
      expect(screen.getByText('Open notebook →')).toBeInTheDocument()
    })

    // No steps visible yet
    expect(screen.queryByText('We need to add two numbers.')).toBeNull()
  })

  it('"Open notebook →" reveals the first step', async () => {
    await act(async () => {
      render(<ProblemSolverCanvas problemId="prob-1" onBack={() => {}} />)
    })

    await waitFor(() => screen.getByText('Open notebook →'))

    await act(async () => {
      fireEvent.click(screen.getByText('Open notebook →'))
    })

    expect(screen.getByText('We need to add two numbers.')).toBeInTheDocument()
    // Only 1 step visible
    expect(screen.queryByText('We are given: 2 and 2.')).toBeNull()
  })

  it('"Next step" increments revealed count and all previous steps stay visible', async () => {
    await act(async () => {
      render(<ProblemSolverCanvas problemId="prob-1" onBack={() => {}} />)
    })

    await waitFor(() => screen.getByText('Open notebook →'))

    // Reveal step 1
    await act(async () => {
      fireEvent.click(screen.getByText('Open notebook →'))
    })
    expect(screen.getByText('We need to add two numbers.')).toBeInTheDocument()

    // Reveal step 2
    await act(async () => {
      fireEvent.click(screen.getByText('Next step'))
    })
    // Both step 1 AND step 2 are visible (cumulative)
    expect(screen.getByText('We need to add two numbers.')).toBeInTheDocument()
    expect(screen.getByText('We are given: 2 and 2.')).toBeInTheDocument()

    // Reveal step 3 (final)
    await act(async () => {
      fireEvent.click(screen.getByText('Next step'))
    })
    // All three steps visible
    expect(screen.getByText('We need to add two numbers.')).toBeInTheDocument()
    expect(screen.getByText('We are given: 2 and 2.')).toBeInTheDocument()
    expect(screen.getByText('The answer is 4.')).toBeInTheDocument()
  })

  it('shows "Next step" button (not "Open notebook →") after first reveal', async () => {
    await act(async () => {
      render(<ProblemSolverCanvas problemId="prob-1" onBack={() => {}} />)
    })

    await waitFor(() => screen.getByText('Open notebook →'))

    await act(async () => {
      fireEvent.click(screen.getByText('Open notebook →'))
    })

    expect(screen.getByText('Next step')).toBeInTheDocument()
    expect(screen.queryByText('Open notebook →')).toBeNull()
  })

  it('shows final answer card after all steps are revealed', async () => {
    await act(async () => {
      render(<ProblemSolverCanvas problemId="prob-1" onBack={() => {}} />)
    })

    await waitFor(() => screen.getByText('Open notebook →'))

    // Reveal all 3 steps
    await act(async () => { fireEvent.click(screen.getByText('Open notebook →')) })
    await act(async () => { fireEvent.click(screen.getByText('Next step')) })
    await act(async () => { fireEvent.click(screen.getByText('Next step')) })

    // Final answer card and disabled "Practice a similar question" appear
    expect(screen.getByText('4')).toBeInTheDocument()           // the answer value
    expect(screen.getByText(/Practice a similar question/)).toBeInTheDocument()

    // CTA buttons gone
    expect(screen.queryByText('Next step')).toBeNull()
    expect(screen.queryByText('Open notebook →')).toBeNull()
  })
})
