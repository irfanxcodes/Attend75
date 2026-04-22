import { InlineMath } from 'react-katex'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MathFormula from '../components/common/MathFormula'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'
import { latexFallbackText, normalizeLatex, shouldRenderAsMath } from '../utils/mathLatex'

const MODES = [
  { id: 'learn', label: 'Learn' },
  { id: 'practice', label: 'Practice' },
  { id: 'mistakes', label: 'Mistakes' },
]

function getTopicPracticeItems(lesson, topicId) {
  const numericals = Array.isArray(lesson?.numericals) ? lesson.numericals : []
  return numericals.filter((item) => item?.topicId === topicId)
}

function normalizeLookupKey(value) {
  return String(value || '').trim().toLowerCase()
}

function getLessonFormulaLookup(lesson) {
  const formulas = []

  if (Array.isArray(lesson?.formulaSections)) {
    lesson.formulaSections.forEach((section) => {
      if (Array.isArray(section?.formulas)) {
        formulas.push(...section.formulas)
      }
    })
  }

  if (Array.isArray(lesson?.formulas)) {
    formulas.push(...lesson.formulas)
  }

  return formulas.reduce((map, formula) => {
    if (!formula?.name) {
      return map
    }

    map.set(normalizeLookupKey(formula.name), formula)
    return map
  }, new Map())
}

function resolveItemFormula(item, formulaLookup) {
  const referenced = formulaLookup.get(normalizeLookupKey(item?.formulaRef))
  if (referenced) {
    return {
      source: 'lesson',
      label: item.formulaRef,
      latex: referenced.latex || referenced.formula,
      fallbackText: referenced.formula || referenced.latex,
      notation: referenced.notation,
    }
  }

  const fallback = item?.formulaUsedFallback || item?.formulaUsed || item?.formulaHint || ''
  if (!fallback) {
    return null
  }

  return {
    source: 'fallback',
    label: item?.formulaRef || 'Formula',
    latex: fallback,
    fallbackText: fallback,
    notation: null,
  }
}

function difficultyLabel(value) {
  if (!value) {
    return ''
  }

  if (value === 'exam-level') {
    return 'Exam-Level'
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

function getFilterOptions(items, key) {
  const values = items
    .map((item) => item?.[key])
    .filter((value) => String(value || '').trim())

  return Array.from(new Set(values))
}

function FormulaPanel({ formula }) {
  if (!formula) {
    return null
  }

  const notationEntries = formula.notation && typeof formula.notation === 'object'
    ? Object.entries(formula.notation).filter(([symbol, meaning]) => String(symbol).trim() && String(meaning).trim())
    : []

  return (
    <section className="mt-3 rounded-xl border border-[#A8D8FF]/30 bg-[#2A2149] p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Formula Used</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${formula.source === 'lesson' ? 'border border-[#A8F5C5]/30 bg-[#A8F5C5]/15 text-[#CFFEE2]' : 'border border-[#F2CA98]/30 bg-[#F2CA98]/10 text-[#F2CA98]'}`}>
          {formula.source === 'lesson' ? 'From Lesson Formula' : 'Fallback Formula'}
        </span>
      </div>

      <MathFormula latex={formula.latex} fallbackText={formula.fallbackText} className="mt-2" />

      {notationEntries.length ? (
        <dl className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-[#D8D3E8] sm:grid-cols-2">
          {notationEntries.map(([symbol, meaning]) => (
            <div key={symbol} className="rounded-md bg-white/5 px-2 py-1.5">
              <dt className="font-semibold text-[#F2CA98]">
                {shouldRenderAsMath(symbol) ? (
                  <InlineMath
                    math={normalizeLatex(symbol)}
                    renderError={() => <span>{latexFallbackText(symbol, symbol)}</span>}
                  />
                ) : (
                  <span>{symbol}</span>
                )}
              </dt>
              <dd className="mt-0.5 leading-relaxed">{meaning}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function AmortizationTable({ table }) {
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows) || !table.columns.length || !table.rows.length) {
    return null
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Amortization Table</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-white/15 bg-[#241C45]">
        <table className="min-w-[680px] text-left text-xs text-[#E7DEDE]">
          <thead className="sticky top-0 bg-[#3A315D] text-[#F4F1FF]">
            <tr>
              {table.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-white/10 even:bg-white/5">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-3 py-2">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SolutionBody({ item, formula }) {
  return (
    <div className="space-y-3">
      {item.asksFor ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">What Is Being Asked?</p>
          <p className="mt-1 text-xs leading-relaxed text-[#E7DEDE]">{item.asksFor}</p>
        </div>
      ) : null}

      {Array.isArray(item.identifiedValues) && item.identifiedValues.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Values Identified</p>
          <ul className="mt-1 grid gap-1 text-xs text-[#D8D3E8] sm:grid-cols-2">
            {item.identifiedValues.map((value) => (
              <li key={`${item.id}-${value}`} className="rounded-md bg-white/5 px-2 py-1.5">{value}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.formulaReason ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Why This Formula?</p>
          <p className="mt-1 text-xs leading-relaxed text-[#D8D3E8]">{item.formulaReason}</p>
        </div>
      ) : null}

      <FormulaPanel formula={formula} />

      {item.substitution ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Substitution</p>
          <div className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-[#E7DEDE]">
            <InlineMath
              math={normalizeLatex(item.substitution)}
              renderError={() => <span>{latexFallbackText(item.substitution, item.substitution)}</span>}
            />
          </div>
        </div>
      ) : null}

      {Array.isArray(item.steps) && item.steps.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Step-by-Step Calculation</p>
          <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#D8D3E8]">
            {item.steps.map((step, index) => (
              <li key={`${item.id}-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <AmortizationTable table={item.amortizationTable} />

      {item.finalAnswer ? (
        <div className="rounded-xl border border-[#A8F5C5]/30 bg-[#A8F5C5]/12 px-3 py-2 text-xs font-semibold text-[#D6FFE8]">
          Final Answer: {item.finalAnswer}
        </div>
      ) : null}

      {item.examTip ? (
        <div className="rounded-xl border border-[#F2CA98]/30 bg-[#F2CA98]/10 px-3 py-2 text-xs leading-relaxed text-[#F5DEBE]">
          Quick Exam Tip: {item.examTip}
        </div>
      ) : null}
    </div>
  )
}

function SolvedExampleCard({ item, formula }) {
  const [open, setOpen] = useState(false)

  return (
    <article className="rounded-2xl border border-white/15 bg-[#3A315D] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.title || 'Solved Example'}</h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {item.questionType ? (
            <span className="rounded-full border border-[#A8D8FF]/40 bg-[#A8D8FF]/12 px-2 py-0.5 text-[11px] font-semibold text-[#DBEFFF]">
              {item.questionType}
            </span>
          ) : null}
          {item.difficulty ? (
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#CFC5E8]">
              {difficultyLabel(item.difficulty)}
            </span>
          ) : null}
        </div>
      </div>

      {item.question ? <p className="mt-2 text-xs leading-relaxed text-[#D8D3E8]">{item.question}</p> : null}
      {item.asksFor ? <p className="mt-2 text-xs text-[#CFE8FF]"><span className="font-semibold">Asks for:</span> {item.asksFor}</p> : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-3 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#E7DEDE] hover:bg-white/10"
      >
        {open ? 'Hide Full Walkthrough' : 'View Full Walkthrough'}
      </button>

      {open ? <div className="mt-3"><SolutionBody item={item} formula={formula} /></div> : null}
    </article>
  )
}

function PracticeQuestionCard({ item, formula }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <article className="rounded-2xl border border-white/15 bg-[#312051] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.title || 'Practice Question'}</h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {item.questionType ? (
            <span className="rounded-full border border-[#A8D8FF]/40 bg-[#A8D8FF]/12 px-2 py-0.5 text-[11px] font-semibold text-[#DBEFFF]">
              {item.questionType}
            </span>
          ) : null}
          {item.difficulty ? (
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#CFC5E8]">
              {difficultyLabel(item.difficulty)}
            </span>
          ) : null}
        </div>
      </div>

      {item.question ? <p className="mt-2 text-xs leading-relaxed text-[#D8D3E8]">{item.question}</p> : null}

      {!revealed ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#3A315D]/60 p-3">
          {item.hint ? (
            <p className="text-xs text-[#CFE8FF]">
              <span className="font-semibold">Hint:</span> {item.hint}
            </p>
          ) : null}
          <p className="text-xs text-[#D8D3E8]">Try first, then reveal the complete worked solution.</p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-full bg-[#E2BC8B] px-3 py-1.5 text-xs font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
          >
            Show Full Solution
          </button>
        </div>
      ) : null}

      {revealed ? (
        <div className="mt-3 space-y-2">
          <SolutionBody item={item} formula={formula} />
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#E7DEDE] hover:bg-white/10"
          >
            Hide Full Solution
          </button>
        </div>
      ) : null}
    </article>
  )
}

function MistakeCard({ item }) {
  return (
    <article className="rounded-2xl border border-[#F2CA98]/20 bg-[#2F2750] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.title || 'Common Mistake'}</h3>
        {item.questionType ? (
          <span className="rounded-full border border-[#F2CA98]/40 bg-[#F2CA98]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F2CA98]">
            {item.questionType}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[#D8D3E8]"><span className="font-semibold text-[#F4F1FF]">What goes wrong:</span> {item.content || 'No details available.'}</p>
      {item.examTip ? (
        <p className="mt-2 text-xs text-[#F5DEBE]"><span className="font-semibold">How to avoid:</span> {item.examTip}</p>
      ) : null}
    </article>
  )
}

function StudyTopicPractice() {
  const { subjectId, lessonId, topicId } = useParams()
  const hasTrackedTopicOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()

  const subject = getStudySubjectById(subjectId)
  const lesson = getStudyLessonById(subjectId, lessonId)
  const topic = Array.isArray(lesson?.topics) ? lesson.topics.find((item) => item.id === topicId) || null : null

  const [activeMode, setActiveMode] = useState('learn')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const topicPracticeItems = useMemo(() => getTopicPracticeItems(lesson, topicId), [lesson, topicId])
  const formulaLookup = useMemo(() => getLessonFormulaLookup(lesson), [lesson])

  const solvedExamples = topicPracticeItems.filter((item) => item.type === 'solved-example')
  const practiceQuestions = topicPracticeItems.filter((item) => item.type === 'practice-question')
  const mistakeNotes = topicPracticeItems.filter((item) => item.type === 'mistake-note')

  const modeItems = activeMode === 'learn'
    ? solvedExamples
    : activeMode === 'practice'
      ? practiceQuestions
      : mistakeNotes

  const difficultyOptions = useMemo(() => getFilterOptions(modeItems, 'difficulty'), [modeItems])
  const typeOptions = useMemo(() => getFilterOptions(modeItems, 'questionType'), [modeItems])

  const filteredItems = modeItems.filter((item) => {
    const matchedDifficulty = difficultyFilter === 'all' || item.difficulty === difficultyFilter
    const matchedType = typeFilter === 'all' || item.questionType === typeFilter
    return matchedDifficulty && matchedType
  })

  const hasAnyFilters = difficultyOptions.length > 1 || typeOptions.length > 1

  useEffect(() => {
    if (!subject || !lesson || !topic || hasTrackedTopicOpenRef.current) {
      return
    }

    hasTrackedTopicOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_topic_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
      topicName: topic.title,
    })
  }, [lesson, session.token, subject, topic, user.id, user.name, user.portalName, user.rollNumber])

  const changeMode = (modeId) => {
    setActiveMode(modeId)
    setDifficultyFilter('all')
    setTypeFilter('all')
  }

  if (!subject || !lesson || !topic) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <header className="rounded-3xl bg-[#4F487A] p-4 ring-1 ring-white/10 sm:p-5">
          <div className="flex items-center gap-2.5">
            <StudyBackButton fallbackTo={subjectId && lessonId ? `/study/${subjectId}/${lessonId}` : '/study'} label="Go back" iconOnly />
            <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Practice Problems</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#F4F1FF] sm:text-3xl">Topic not found</h1>
        </header>
      </section>
    )
  }

  return (
    <section className="space-y-3 pb-4 sm:space-y-4">
      <header className="sticky top-0 z-20 -mx-1 rounded-b-3xl border border-white/10 bg-gradient-to-b from-[#4F487A] to-[#413863]/95 p-4 shadow-lg backdrop-blur sm:mx-0 sm:rounded-3xl sm:p-5">
        <div className="flex items-center gap-2.5">
          <StudyBackButton fallbackTo={`/study/${subject.id}/${lesson.id}`} label="Go back" iconOnly />
          <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Practice Problems</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/15 bg-[#312051]/70 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#CFC5E8]">Solved</p>
            <p className="mt-0.5 text-base font-semibold text-[#E7DEDE]">{solvedExamples.length}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-[#312051]/70 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#CFC5E8]">Practice</p>
            <p className="mt-0.5 text-base font-semibold text-[#E7DEDE]">{practiceQuestions.length}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-[#312051]/70 px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#CFC5E8]">Mistakes</p>
            <p className="mt-0.5 text-base font-semibold text-[#E7DEDE]">{mistakeNotes.length}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-[#2F2750] p-1">
          <div className="grid grid-cols-3 gap-1">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => changeMode(mode.id)}
                className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${
                  activeMode === mode.id
                    ? 'bg-[#E2BC8B] text-[#1D183E]'
                    : 'bg-transparent text-[#D8D3E8] hover:bg-white/10'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {hasAnyFilters ? (
        <section className="rounded-2xl border border-white/10 bg-[#3A315D]/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Filters</p>

          {difficultyOptions.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDifficultyFilter('all')}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyFilter === 'all' ? 'border-[#E2BC8B]/50 bg-[#E2BC8B]/15 text-[#F2CA98]' : 'border-white/20 text-[#D8D3E8]'}`}
              >
                All Difficulties
              </button>
              {difficultyOptions.map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => setDifficultyFilter(difficulty)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyFilter === difficulty ? 'border-[#E2BC8B]/50 bg-[#E2BC8B]/15 text-[#F2CA98]' : 'border-white/20 text-[#D8D3E8]'}`}
                >
                  {difficultyLabel(difficulty)}
                </button>
              ))}
            </div>
          ) : null}

          {typeOptions.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${typeFilter === 'all' ? 'border-[#A8D8FF]/55 bg-[#A8D8FF]/15 text-[#DBEFFF]' : 'border-white/20 text-[#D8D3E8]'}`}
              >
                All Types
              </button>
              {typeOptions.map((questionType) => (
                <button
                  key={questionType}
                  type="button"
                  onClick={() => setTypeFilter(questionType)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${typeFilter === questionType ? 'border-[#A8D8FF]/55 bg-[#A8D8FF]/15 text-[#DBEFFF]' : 'border-white/20 text-[#D8D3E8]'}`}
                >
                  {questionType}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        {activeMode === 'learn' ? (
          <>
            {filteredItems.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredItems.map((item) => (
                  <SolvedExampleCard key={item.id} item={item} formula={resolveItemFormula(item, formulaLookup)} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-[#312051] p-3 text-xs text-[#D8D3E8]">No solved examples match the selected filters.</p>
            )}
          </>
        ) : null}

        {activeMode === 'practice' ? (
          <>
            {filteredItems.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredItems.map((item) => (
                  <PracticeQuestionCard key={item.id} item={item} formula={resolveItemFormula(item, formulaLookup)} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-[#312051] p-3 text-xs text-[#D8D3E8]">No practice questions match the selected filters.</p>
            )}
          </>
        ) : null}

        {activeMode === 'mistakes' ? (
          <>
            {filteredItems.length ? (
              <div className="grid grid-cols-1 gap-3">
                {filteredItems.map((item) => (
                  <MistakeCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-[#312051] p-3 text-xs text-[#D8D3E8]">No mistakes match the selected filters.</p>
            )}
          </>
        ) : null}
      </section>
    </section>
  )
}

export default StudyTopicPractice
