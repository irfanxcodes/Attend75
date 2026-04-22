import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { InlineMath } from 'react-katex'
import CollapsibleSection from '../components/common/CollapsibleSection'
import MathFormula from '../components/common/MathFormula'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getLessonState, markLessonOpened, setLessonStatus, toggleLessonImportant } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'
import { latexFallbackText, normalizeLatex, shouldRenderAsMath } from '../utils/mathLatex'

function getFormulaSections(lesson) {
  if (Array.isArray(lesson?.formulaSections) && lesson.formulaSections.length) {
    return lesson.formulaSections
      .map((section) => ({
        title: section.title || 'Formula Group',
        description: section.description || '',
        formulas: Array.isArray(section.formulas) ? section.formulas.filter((formula) => formula?.name || formula?.formula || formula?.latex) : [],
      }))
      .filter((section) => section.formulas.length)
  }

  const fallbackFormulas = Array.isArray(lesson?.formulas) ? lesson.formulas.filter((formula) => formula?.name || formula?.formula || formula?.latex) : []
  if (!fallbackFormulas.length) {
    return []
  }

  return [
    {
      title: 'Core Formulas',
      description: '',
      formulas: fallbackFormulas,
    },
  ]
}

function getFormulaNames(lesson) {
  return getFormulaSections(lesson)
    .flatMap((section) => section.formulas)
    .map((formula) => formula?.name)
    .filter(Boolean)
}

function getFormulaNotationEntries(formula) {
  if (!formula?.notation || typeof formula.notation !== 'object') {
    return []
  }

  return Object.entries(formula.notation).filter(([symbol, meaning]) => String(symbol).trim() && String(meaning).trim())
}

function NotationList({ entries }) {
  return (
    <dl className="space-y-1.5 text-xs text-[#D8D3E8]">
      {entries.map(([symbol, meaning]) => (
        <div key={symbol} className="grid grid-cols-[auto,1fr] items-start gap-2">
          <dt className="pt-0.5 text-[#F2CA98]">
            {shouldRenderAsMath(symbol) ? (
              <InlineMath
                math={normalizeLatex(symbol)}
                renderError={() => <span className="font-semibold">{latexFallbackText(symbol, symbol)}</span>}
              />
            ) : (
              <span className="font-semibold">{symbol}</span>
            )}
          </dt>
          <dd className="leading-relaxed">{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

function buildAiPrompt(subject, lesson) {
  const formulas = getFormulaNames(lesson)
  const topics = Array.isArray(lesson.topics) ? lesson.topics.map((topic) => topic.title).filter(Boolean) : []
  const numberedTopics = topics.length
    ? topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')
    : '1. Explain the lesson in logical exam-relevant sections.'

  return [
    'Act as an exam-focused tutor for a BBA 2nd year student.',
    '',
    'Study context:',
    `- Subject: ${subject.title}`,
    `- Lesson ${lesson.lessonNumber}: ${lesson.title}`,
    `- Scope: ${lesson.covers}`,
    formulas.length ? `- Important formulas (if relevant): ${formulas.join(', ')}` : '- Important formulas: Include only if relevant to this lesson.',
    '',
    'Teach the entire lesson topic-by-topic using this exact topic order:',
    numberedTopics,
    '',
    'For each topic, strictly follow this structure:',
    '1) Topic-wise explanation',
    '- Start with a simple explanation (easy words).',
    '- Then add a slightly detailed explanation (still clear and concise).',
    '- Keep it exam-focused and practical, not overly theoretical.',
    '2) Key points',
    '- List the most important concepts, terms, and memory points.',
    '3) Practice questions',
    '- Generate 1-3 exam-style questions from the full lesson.',
    '4) Answers',
    '- Provide clear, scoring-oriented answers for every practice question.',
    '5) Tricky conceptual questions',
    '- Add 3-5 conceptual/tricky questions that test deep understanding.',
    '- Provide concise answers for these too.',
    '6) Revision summary',
    '- Give a compact final revision list for last-minute exam prep.',
    '',
    'Tone and style rules:',
    '- Simple but informative language.',
    '- Exam-focused and structured.',
    '- Avoid vague or very short explanations.',
    '- Avoid unnecessary long theory.',
    '- Use clear headings and consistent formatting.',
  ].join('\n')
}

function buildTopicPrompt(subject, lesson, topic) {
  const subtopics = Array.isArray(topic?.subtopics) ? topic.subtopics.filter(Boolean) : []
  const numberedSubtopics = subtopics.length
    ? subtopics.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '1. Explain the core ideas from this topic.'
  const numericalInstruction = topic?.hasNumericals
    ? 'Include 1 exam-style numerical question based on this topic, then show a step-by-step solution.'
    : 'If this topic has a numerical angle, include 1 short numerical question with solution; otherwise skip numericals.'

  return [
    'Act as an exam-focused tutor for a BBA 2nd year student.',
    '',
    'Goal: This response should work as a mini tutor, mini test generator, and revision tool in one.',
    '',
    `Subject: ${subject.title}`,
    `Lesson: ${lesson.title}`,
    `Topic: ${topic.title}`,
    '',
    'Subtopics to explain in exact order:',
    numberedSubtopics,
    '',
    'Follow this exact output structure:',
    '1) Topic-wise explanation (subtopic by subtopic)',
    '- Explain each subtopic one by one.',
    '- For each subtopic, first give a simple explanation, then a slightly detailed explanation.',
    '- Avoid vague explanations and keep it relevant for exams.',
    '2) Key concepts and important points',
    '- Highlight the must-remember concepts, terms, and points for exam writing.',
    '3) Common mistakes students make',
    '- List frequent mistakes and how to avoid them.',
    '4) Comparisons/differences (where relevant)',
    '- Add clear comparisons in table or bullet form if concepts are commonly confused.',
    '5) Frequently asked exam questions',
    '- Generate 4-6 frequently asked exam questions from this topic.',
    '- Provide concise, scoring-oriented answers for each question.',
    '6) Tricky conceptual questions',
    '- Add exactly 2 tricky conceptual questions with answers.',
    `7) Numerical`,
    `- ${numericalInstruction}`,
    '8) Quick revision summary',
    '- End with crisp bullet points for last-minute revision.',
    '',
    'Tone and style:',
    '- Simple but informative.',
    '- Exam-focused and structured.',
    '- Clean formatting with short headings and readable bullets.',
    '- Do not make the response unnecessarily long.',
  ].join('\n')
}

function StudyLessonDetail() {
  const navigate = useNavigate()
  const { subjectId, lessonId } = useParams()
  const hasTrackedLessonOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = getStudySubjectById(subjectId)
  const lesson = getStudyLessonById(subjectId, lessonId)

  const [lessonState, setLessonState] = useState(() => getLessonState(subjectId, lessonId))
  const [isAiSheetOpen, setAiSheetOpen] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [topicCopyFeedback, setTopicCopyFeedback] = useState({ id: '', message: '' })
  const [expandedSections, setExpandedSections] = useState({
    formulas: false,
    topics: false,
  })
  const [mobileNotationOpenById, setMobileNotationOpenById] = useState({})

  useEffect(() => {
    if (!subject || !lesson || hasTrackedLessonOpenRef.current) {
      return
    }

    hasTrackedLessonOpenRef.current = true
    const updated = markLessonOpened(subject.id, lesson.id)
    setLessonState(updated)
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
    })
  }, [lesson, session.token, subject, user.id, user.name, user.portalName, user.rollNumber])

  const aiPrompt = useMemo(() => {
    if (!subject || !lesson) {
      return ''
    }

    return buildAiPrompt(subject, lesson)
  }, [subject, lesson])

  const formulaSections = useMemo(() => getFormulaSections(lesson), [lesson])
  const topicPracticeMap = useMemo(() => {
    const mapped = new Map()
    const numericals = Array.isArray(lesson?.numericals) ? lesson.numericals : []

    numericals.forEach((item) => {
      const key = item?.topicId
      if (!key) {
        return
      }

      mapped.set(key, true)
    })

    return mapped
  }, [lesson])

  if (!subject || !lesson) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <StudyBackButton fallbackTo={subjectId ? `/study/${subjectId}` : '/study'} label="Back" />
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">StudyMe</h1>
          <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Lesson not found.</p>
        </header>
      </section>
    )
  }

  const handleCopyPrompt = async () => {
    try {
      await window.navigator.clipboard.writeText(aiPrompt)
      setCopyMessage('Prompt copied')
      fireAndForgetStudyMeEvent({
        eventType: 'studyme_lesson_ai_copied',
        token: session.token,
        userName: user.portalName || user.name || user.rollNumber || user.id,
        subjectName: subject?.title || null,
        lessonName: lesson?.title || null,
      })
    } catch {
      setCopyMessage('Unable to copy prompt')
    }

    window.setTimeout(() => setCopyMessage(''), 1600)
  }

  const handleCopyTopicPrompt = async (topic) => {
    const prompt = buildTopicPrompt(subject, lesson, topic)

    try {
      await window.navigator.clipboard.writeText(prompt)
      setTopicCopyFeedback({ id: topic.id, message: 'Copied' })
      fireAndForgetStudyMeEvent({
        eventType: 'studyme_topic_prompt_copied',
        token: session.token,
        userName: user.portalName || user.name || user.rollNumber || user.id,
        subjectName: subject?.title || null,
        lessonName: lesson?.title || null,
        topicName: topic.title,
      })
    } catch {
      setTopicCopyFeedback({ id: topic.id, message: 'Unable to copy' })
    }

    window.setTimeout(() => setTopicCopyFeedback({ id: '', message: '' }), 1400)
  }

  const toggleSection = (key) => {
    setExpandedSections((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const toggleMobileNotation = (key) => {
    setMobileNotationOpenById((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const openLessonAi = () => {
    setAiSheetOpen(true)
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_ai_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject?.title || null,
      lessonName: lesson?.title || null,
    })
  }

  const handleLessonCompleted = () => {
    setLessonState(setLessonStatus(subject.id, lesson.id, 'completed'))
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_completed',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
    })
  }

  const handleLessonImportantToggle = () => {
    setLessonState(toggleLessonImportant(subject.id, lesson.id))
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_lesson_important_toggled',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
    })
  }

  const openTopicPdf = (topic) => {
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_topic_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
      topicName: topic.title,
    })
    navigate(`/study/${subject.id}/${lesson.id}/pdf?topic=${topic.id}`)
  }

  const openTopicPractice = (topic) => {
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_topic_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
      lessonName: lesson.title,
      topicName: topic.title,
    })
    navigate(`/study/${subject.id}/${lesson.id}/practice/${topic.id}`)
  }

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      <header className="rounded-3xl bg-[#4F487A] p-4 ring-1 ring-white/10 sm:p-5">
        <div className="flex items-center gap-2.5">
          <StudyBackButton
            fallbackTo={`/study/${subject.id}`}
            label="Go back"
            iconOnly
            className="h-11 w-11 text-xl"
          />
          <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">StudyMe</p>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-[#F4F1FF] sm:text-3xl">{lesson.title}</h1>
        <p className="mt-1 text-xs text-[#CFC5E8]">Lesson {lesson.lessonNumber}</p>
        <p className="mt-2 text-sm text-[#D8D3E8]">{lesson.covers}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLessonCompleted}
            className="rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
          >
            Mark as Complete
          </button>
          <button
            type="button"
            onClick={handleLessonImportantToggle}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              lessonState.important
                ? 'border-[#E2BC8B]/70 bg-[#E2BC8B]/20 text-[#F2CA98]'
                : 'border-white/20 text-[#E7DEDE] hover:bg-white/10'
            }`}
          >
            {lessonState.important ? 'Marked Important' : 'Mark as Important'}
          </button>
          <button
            type="button"
            onClick={openLessonAi}
            className="rounded-full border border-[#A8D8FF]/50 bg-[#3A315D] px-4 py-2 text-sm font-semibold text-[#CFE8FF] hover:bg-[#4A3E73]"
          >
            Study this lesson with AI
          </button>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        <CollapsibleSection
          title="Formulas"
          subtitle="Tap to expand key formulas for this lesson."
          isExpanded={expandedSections.formulas}
          onToggle={() => toggleSection('formulas')}
        >
          {formulaSections.length ? (
            <div className="mt-2 space-y-3">
              {formulaSections.map((section) => (
                <section key={section.title} className="rounded-xl border border-white/10 bg-[#2F2750] p-3 sm:p-4">
                  <div className="pb-2">
                    <h3 className="text-sm font-semibold tracking-wide text-[#F4F1FF]">{section.title}</h3>
                    {section.description ? <p className="mt-1 text-xs text-[#CFC5E8]">{section.description}</p> : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.formulas.map((formula, formulaIndex) => {
                      const notationEntries = getFormulaNotationEntries(formula)
                      const notationKey = `${section.title}-${formula.name}-${formulaIndex}`
                      const isMobileNotationOpen = Boolean(mobileNotationOpenById[notationKey])

                      return (
                      <div key={formula.name} className="rounded-xl bg-[#3A315D]/80 p-2.5 ring-1 ring-white/10 sm:p-4">
                        <p className="text-sm font-semibold tracking-wide text-[#F4F1FF]">{formula.name}</p>
                        <MathFormula latex={formula.latex || formula.formula} fallbackText={formula.formula} className="mt-2" />

                        {notationEntries.length ? (
                          <div className="mt-2">
                            <div className="hidden md:block">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#CFC5E8]">Notation</p>
                              <div className="mt-1.5">
                                <NotationList entries={notationEntries} />
                              </div>
                            </div>

                            <div className="md:hidden">
                              <button
                                type="button"
                                onClick={() => toggleMobileNotation(notationKey)}
                                className="text-xs font-semibold text-[#CFE8FF] hover:text-[#E7F2FF]"
                                aria-expanded={isMobileNotationOpen}
                              >
                                {isMobileNotationOpen ? 'Hide notation' : 'Show notation'}
                              </button>

                              {isMobileNotationOpen ? (
                                <div className="mt-1.5">
                                  <NotationList entries={notationEntries} />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs leading-relaxed text-[#D8D3E8]">Notation details are not available.</p>
                        )}
                      </div>
                    )})}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-white/10 bg-[#3A315D] p-3 text-sm font-semibold text-[#D8D3E8]">-</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Topics in this Lesson"
          subtitle="Each topic combines explanation and examples as they appear in the PDF."
          isExpanded={expandedSections.topics}
          onToggle={() => toggleSection('topics')}
        >
          {Array.isArray(lesson.topics) && lesson.topics.length ? (
            <div className="mt-2 space-y-2">
              {lesson.topics.map((topic) => {
                const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : []
                const hasPracticeProblems = topicPracticeMap.get(topic.id) === true

                return (
                  <article key={topic.id} className="rounded-xl border border-white/10 bg-[#3A315D] px-3 py-3">
                    <p className="text-sm font-semibold text-[#F4F1FF]">{topic.title}</p>
                    <p className="mt-1 text-xs text-[#D8D3E8]">
                      {subtopics.length} subtopics • Pages {topic.pageRange?.start || '-'} - {topic.pageRange?.end || '-'}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openTopicPdf(topic)}
                        className="rounded-full border border-[#A8D8FF]/50 bg-[#312051] px-3 py-1.5 text-xs font-semibold text-[#CFE8FF] hover:bg-[#4A3E73]"
                      >
                        Open in PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyTopicPrompt(topic)}
                        className="rounded-full border border-white/20 bg-[#312051] px-3 py-1.5 text-xs font-semibold text-[#E7DEDE] hover:bg-[#4A3E73]"
                      >
                        Copy Topic Prompt
                      </button>
                      {hasPracticeProblems ? (
                        <button
                          type="button"
                          onClick={() => openTopicPractice(topic)}
                          className="rounded-full border border-[#E2BC8B]/45 bg-[#E2BC8B]/12 px-3 py-1.5 text-xs font-semibold text-[#F2CA98] hover:bg-[#E2BC8B]/20"
                        >
                          Practice Problems
                        </button>
                      ) : null}
                      {topicCopyFeedback.id === topic.id && topicCopyFeedback.message ? (
                        <span className="self-center text-xs text-[#A8F5C5]">{topicCopyFeedback.message}</span>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-white/10 bg-[#3A315D] p-3 text-sm text-[#D8D3E8]">
              Topic breakdown has not been added yet for this lesson.
            </p>
          )}
        </CollapsibleSection>
      </section>

      {isAiSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-[#312051] p-4 shadow-xl ring-1 ring-white/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Study this lesson with AI</h3>
                <p className="mt-1 text-xs text-[#D8D3E8]">Copy the prompt and continue in ChatGPT.</p>
              </div>
              <button
                type="button"
                onClick={() => setAiSheetOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-white/10"
                aria-label="Close AI study sheet"
              >
                x
              </button>
            </div>

            <textarea
              value={aiPrompt}
              readOnly
              rows={9}
              className="mt-3 w-full rounded-xl border border-white/20 bg-[#3A315D] px-3 py-2 text-xs text-[#F4F1FF]"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
                >
                  Copy Prompt
                </button>
                {copyMessage ? <span className="text-xs text-[#A8F5C5]">{copyMessage}</span> : null}
              </div>

              <a
                href="https://chat.openai.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#3A315D] px-4 py-2 text-sm font-semibold text-[#E7DEDE] hover:bg-[#4A3E73]"
                aria-label="Open ChatGPT"
              >
                <span aria-hidden="true">GPT</span>
                Open ChatGPT
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default StudyLessonDetail
